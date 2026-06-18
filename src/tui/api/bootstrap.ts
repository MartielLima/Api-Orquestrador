import 'dotenv/config';
import { buildApiClient, type ApiClient } from './client';
import {
  loadSession,
  saveSession,
  clearSession,
  type PersistedSession,
  type AuthUser,
} from './auth';
import { Q_HEALTH, Q_ME, M_LOGIN, M_REFRESH } from './queries';

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

export async function bootstrapSession(
  overrides: Partial<BootstrapConfig> = {},
): Promise<BootstrapResult> {
  const cfg: BootstrapConfig = { ...resolveConfig(), ...overrides };
  const api = buildApiClient(cfg.apiUrl);

  try {
    const envToken = process.env.TUI_API_TOKEN;
    if (envToken && decodeJwtExp(envToken) > Date.now()) {
      api.setAuthToken(envToken);
      try {
        const user = await fetchMe(api);
        return {
          kind: 'ok',
          api,
          user,
          session: {
            apiUrl: cfg.apiUrl,
            accessToken: envToken,
            refreshToken: '',
            user,
            accessTokenExp: decodeJwtExp(envToken),
          },
        };
      } catch {
        api.setAuthToken(null);
      }
    }

    const persisted = loadSession();
    if (persisted && persisted.accessTokenExp > Date.now()) {
      api.setAuthToken(persisted.accessToken);
      try {
        await probeHealth(api);
        return { kind: 'ok', api, user: persisted.user, session: persisted };
      } catch {
        try {
          const fresh = await refreshSession(api, persisted);
          api.setAuthToken(fresh.accessToken);
          return { kind: 'ok', api, user: fresh.user, session: fresh };
        } catch {
          clearSession();
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

    const session = await loginWithSeed(api, cfg.apiUrl, cfg.seedEmail, cfg.seedPassword);
    api.setAuthToken(session.accessToken);
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
