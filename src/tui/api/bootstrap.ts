import 'dotenv/config';
import type { RequestDocument, Variables } from 'graphql-request';
import { buildApiClient, type ApiClient } from './client';
import {
  loadSession,
  saveSession,
  clearSession,
  type PersistedSession,
  type AuthUser,
} from './auth';
import { Q_HEALTH, Q_ME, M_LOGIN, M_REFRESH } from './queries';
import { withRefreshRetry, SessionExpiredError } from './withRefreshRetry';

export interface BootstrapConfig {
  apiUrl: string;
  seedEmail?: string;
  seedPassword?: string;
}

export type BootstrapResult =
  | { kind: 'ok'; api: ApiClient; user: AuthUser; session: PersistedSession }
  | { kind: 'err'; message: string; hint?: string };

function resolveConfig(): BootstrapConfig {
  return {
    apiUrl: process.env.TUI_API_URL ?? 'http://localhost:4000/graphql',
    seedEmail: process.env.SEED_ADMIN_EMAIL,
    seedPassword: process.env.SEED_ADMIN_PASSWORD,
  };
}

function decodeJwtExp(token: string): number {
  try {
    const part = token.split('.')[1];
    const json = Buffer.from(part, 'base64url').toString('utf-8');
    return (JSON.parse(json) as { exp: number }).exp * 1000;
  } catch {
    return 0;
  }
}

async function loginWithSeed(
  api: ApiClient,
  apiUrl: string,
  email: string,
  password: string,
): Promise<PersistedSession> {
  type R = { login: { accessToken: string; refreshToken: string; user: AuthUser } };
  const data = await api.request<R>(M_LOGIN, { email, password });
  const session: PersistedSession = {
    apiUrl,
    accessToken: data.login.accessToken,
    refreshToken: data.login.refreshToken,
    user: data.login.user,
    accessTokenExp: decodeJwtExp(data.login.accessToken),
  };
  saveSession(session);
  process.env.TUI_API_TOKEN = session.accessToken;
  return session;
}

async function refreshSession(
  api: ApiClient,
  current: PersistedSession,
): Promise<PersistedSession> {
  type R = { refresh: { accessToken: string; refreshToken: string; user: AuthUser } };
  const data = await api.request<R>(M_REFRESH, { refreshToken: current.refreshToken });
  const session: PersistedSession = {
    apiUrl: current.apiUrl,
    accessToken: data.refresh.accessToken,
    refreshToken: data.refresh.refreshToken,
    user: data.refresh.user,
    accessTokenExp: decodeJwtExp(data.refresh.accessToken),
  };
  saveSession(session);
  process.env.TUI_API_TOKEN = session.accessToken;
  return session;
}

async function fetchMe(api: ApiClient): Promise<AuthUser> {
  type R = { me: AuthUser };
  const data = await api.request<R>(Q_ME);
  return data.me;
}

async function probeHealth(api: ApiClient): Promise<void> {
  await api.request<{ health: string }>(Q_HEALTH);
}

function isUnauthenticatedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /UNAUTHENTICATED/.test(msg);
}

function buildAuthAwareApi(
  rawApi: ApiClient,
  getSession: () => PersistedSession | null,
  setSession: (s: PersistedSession | null) => void,
): { request: <T>(doc: RequestDocument, vars?: Variables) => Promise<T> } {
  let currentAccessToken: string | null = getSession()?.accessToken ?? null;
  if (currentAccessToken) rawApi.setAuthToken(currentAccessToken);

  let inFlightRefresh: Promise<string> | null = null;

  const refreshHandler = async (): Promise<string> => {
    if (inFlightRefresh) return inFlightRefresh;
    const session = getSession();
    if (!session || !session.refreshToken) {
      throw new SessionExpiredError('no refresh token available');
    }
    inFlightRefresh = (async (): Promise<string> => {
      try {
        const data = await rawApi.request<{
          refresh: { accessToken: string; refreshToken: string; user: AuthUser };
        }>(M_REFRESH, { refreshToken: session.refreshToken });
        const next: PersistedSession = {
          ...session,
          accessToken: data.refresh.accessToken,
          refreshToken: data.refresh.refreshToken,
          user: data.refresh.user,
          accessTokenExp: decodeJwtExp(data.refresh.accessToken),
        };
        saveSession(next);
        setSession(next);
        currentAccessToken = next.accessToken;
        rawApi.setAuthToken(next.accessToken);
        process.env.TUI_API_TOKEN = next.accessToken;
        return next.accessToken;
      } catch (e) {
        clearSession();
        setSession(null);
        currentAccessToken = null;
        throw new SessionExpiredError(
          'refresh failed: ' + (e instanceof Error ? e.message : String(e)),
        );
      } finally {
        inFlightRefresh = null;
      }
    })();
    return inFlightRefresh;
  };

  const doRequest = <T>(doc: RequestDocument, vars?: Variables): Promise<T> => {
    rawApi.setAuthToken(currentAccessToken);
    return rawApi.request<T>(doc, vars);
  };

  const wrappedRequest = <T>(doc: RequestDocument, vars?: Variables): Promise<T> =>
    withRefreshRetry<T>(() => doRequest<T>(doc, vars), refreshHandler, isUnauthenticatedError);

  return { request: wrappedRequest };
}

export async function bootstrapSession(
  overrides: Partial<BootstrapConfig> = {},
): Promise<BootstrapResult> {
  const cfg: BootstrapConfig = { ...resolveConfig(), ...overrides };
  const rawApi = buildApiClient(cfg.apiUrl);

  let liveSession: PersistedSession | null = null;
  const getSession = (): PersistedSession | null => liveSession;
  const setSession = (s: PersistedSession | null): void => {
    liveSession = s;
  };

  const auth = buildAuthAwareApi(rawApi, getSession, setSession);
  const api: ApiClient = {
    request: auth.request,
    setAuthToken: rawApi.setAuthToken,
  };

  try {
    const envToken = process.env.TUI_API_TOKEN;
    if (envToken && decodeJwtExp(envToken) > Date.now()) {
      rawApi.setAuthToken(envToken);
      try {
        const user = await fetchMe(api);
        liveSession = {
          apiUrl: cfg.apiUrl,
          accessToken: envToken,
          refreshToken: '',
          user,
          accessTokenExp: decodeJwtExp(envToken),
        };
        return { kind: 'ok', api, user, session: liveSession };
      } catch {
        rawApi.setAuthToken(null);
      }
    }

    const persisted = loadSession();
    if (persisted && persisted.accessTokenExp > Date.now()) {
      rawApi.setAuthToken(persisted.accessToken);
      liveSession = persisted;
      try {
        await probeHealth(api);
        return { kind: 'ok', api, user: persisted.user, session: persisted };
      } catch {
        try {
          const fresh = await refreshSession(rawApi, persisted);
          liveSession = fresh;
          rawApi.setAuthToken(fresh.accessToken);
          return { kind: 'ok', api, user: fresh.user, session: fresh };
        } catch {
          clearSession();
          liveSession = null;
        }
      }
    }

    if (!cfg.seedEmail || !cfg.seedPassword) {
      return {
        kind: 'err',
        message:
          'TUI_API_TOKEN ausente e sem SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD para auto-login.',
        hint: 'Defina TUI_API_TOKEN no .env ou SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD (mesmo do container da API).',
      };
    }

    const session = await loginWithSeed(rawApi, cfg.apiUrl, cfg.seedEmail, cfg.seedPassword);
    liveSession = session;
    rawApi.setAuthToken(session.accessToken);
    return { kind: 'ok', api, user: session.user, session };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      kind: 'err',
      message: `falha no bootstrap de auth contra ${cfg.apiUrl}: ${msg}`,
      hint: 'Verifique se a API está rodando e se TUI_API_URL aponta para o endpoint GraphQL correto.',
    };
  }
}
