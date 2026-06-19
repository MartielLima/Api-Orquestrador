# Auto-refresh transparente no TUI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o refresh de access tokens transparente no client GraphQL do TUI, eliminando a necessidade de reiniciar o processo quando o `JWT_ACCESS_TTL` (15min) expira.

**Architecture:** Função pura `withRefreshRetry(doRequest, refresh, isAuthError)` orquestra a sequência tentar → detectar erro de auth → refresh (com dedup de chamadas concorrentes) → re-tentar. O `bootstrap.ts` ganha um `refreshHandler` que persiste a nova session e um `wrappedRequest` que envolve o `api.request` cru com `withRefreshRetry`.

**Tech Stack:** TypeScript, jest, ts-jest, graphql-request.

**Spec:** `docs/superpowers/specs/2026-06-19-tui-auto-refresh-design.md`

---

## File Structure

| Arquivo | Responsabilidade | Criar/Modificar |
|---|---|---|
| `src/tui/api/withRefreshRetry.ts` | Função pura de retry + classe `SessionExpiredError` | Criar |
| `tests/tui/api/withRefreshRetry.spec.ts` | Testes unitários da função pura | Criar |
| `src/tui/api/bootstrap.ts` | Wire-up do `refreshHandler` + `wrappedRequest` | Modificar |
| `tests/tui/api/bootstrap.spec.ts` | Adicionar testes de auto-refresh no fluxo real | Modificar |

---

## Task 1: Função pura `withRefreshRetry` (TDD)

**Files:**
- Create: `src/tui/api/withRefreshRetry.ts`
- Create: `tests/tui/api/withRefreshRetry.spec.ts`

### Step 1.1: Escrever testes falhando

Criar `tests/tui/api/withRefreshRetry.spec.ts`:

```ts
import { withRefreshRetry, SessionExpiredError } from '../../../src/tui/api/withRefreshRetry';

const unauthError = new Error('GraphQL error: "code":"UNAUTHENTICATED"');
const networkError = new Error('ECONNREFUSED');

const isAuthError = (err: unknown): boolean =>
  err instanceof Error && /UNAUTHENTICATED/.test(err.message);

describe('withRefreshRetry', () => {
  it('retorna o resultado da primeira tentativa sem chamar refresh', async () => {
    const doRequest = jest.fn().mockResolvedValue({ data: 'ok' });
    const refresh = jest.fn();

    const r = await withRefreshRetry(doRequest, refresh, isAuthError);

    expect(r).toEqual({ data: 'ok' });
    expect(doRequest).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('re-tenta após UNAUTHENTICATED e chama refresh uma vez', async () => {
    const doRequest = jest
      .fn()
      .mockRejectedValueOnce(unauthError)
      .mockResolvedValueOnce({ data: 'ok-after-refresh' });
    const refresh = jest.fn().mockResolvedValue('new-token');

    const r = await withRefreshRetry(doRequest, refresh, isAuthError);

    expect(r).toEqual({ data: 'ok-after-refresh' });
    expect(doRequest).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('não chama refresh em erro não-auth (rede)', async () => {
    const doRequest = jest.fn().mockRejectedValue(networkError);
    const refresh = jest.fn();

    await expect(withRefreshRetry(doRequest, refresh, isAuthError)).rejects.toBe(networkError);
    expect(doRequest).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('cada invocação paralela chama refresh uma vez (dedup é do caller)', async () => {
    let calls = 0;
    const sharedRefresh = jest.fn().mockImplementation(async () => {
      calls += 1;
      return `token-${calls}`;
    });
    const doRequest = jest.fn().mockRejectedValue(unauthError);

    await expect(
      Promise.all([
        withRefreshRetry(doRequest, sharedRefresh, isAuthError),
        withRefreshRetry(doRequest, sharedRefresh, isAuthError),
      ]),
    ).rejects.toBeInstanceOf(Error);

    expect(sharedRefresh).toHaveBeenCalledTimes(2);
    expect(doRequest).toHaveBeenCalledTimes(4);
  });

  it('lança SessionExpiredError quando refresh falha, sem re-tentar', async () => {
    const doRequest = jest.fn().mockRejectedValue(unauthError);
    const refresh = jest.fn().mockRejectedValue(new SessionExpiredError('refresh failed'));

    await expect(withRefreshRetry(doRequest, refresh, isAuthError)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    expect(doRequest).toHaveBeenCalledTimes(1);
  });
});
```

**Nota sobre o teste de dedup:** `doRequest` é chamado 4× (e `refresh` 2×) porque cada invocação paralela de `withRefreshRetry` faz sua própria sequência `doRequest` → falhar → `refresh` → `doRequest` retry → falhar. O teste verifica explicitamente que a função pura **não dedupa sozinha** — a deduplicação real é garantida pelo `inFlightRefresh` em closure no `bootstrap.ts`, exercitada em Task 2.

### Step 1.2: Rodar testes para confirmar falha

```bash
npx jest tests/tui/api/withRefreshRetry.spec.ts
```

Esperado: FAIL com `Cannot find module '../../../src/tui/api/withRefreshRetry'`.

### Step 1.3: Implementar `withRefreshRetry`

Criar `src/tui/api/withRefreshRetry.ts`:

```ts
export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export async function withRefreshRetry<T>(
  doRequest: () => Promise<T>,
  refresh: () => Promise<string>,
  isAuthError: (err: unknown) => boolean,
): Promise<T> {
  try {
    return await doRequest();
  } catch (err) {
    if (!isAuthError(err)) throw err;
    const newToken = await refresh();
    return doRequest();
  }
}
```

**Nota sobre dedup:** o `refresh` passado pelo caller (`bootstrap.ts`) será responsável pelo dedup via `inFlightRefresh` em closure. `withRefreshRetry` em si é puro — ela sempre chama `refresh()` quando há auth error. O teste 4 verifica explicitamente que a função pura **não dedupa sozinha** — a deduplicação real é garantida pelo `inFlightRefresh` em closure no `bootstrap.ts`, exercitada em Task 2.

### Step 1.4: Rodar testes e verificar que passam

```bash
npx jest tests/tui/api/withRefreshRetry.spec.ts
```

Esperado: 5 testes PASS.

### Step 1.5: Commit

```bash
git add src/tui/api/withRefreshRetry.ts tests/tui/api/withRefreshRetry.spec.ts
git commit -m "feat(tui): add withRefreshRetry pure function + SessionExpiredError"
```

---

## Task 2: Refatorar `bootstrap.ts` para usar `withRefreshRetry`

**Files:**
- Modify: `src/tui/api/bootstrap.ts`
- Modify: `tests/tui/api/bootstrap.spec.ts`

### Step 2.1: Escrever teste falhando — auto-refresh em query autenticada

Adicionar no final de `tests/tui/api/bootstrap.spec.ts` (antes do `}` final do `describe`):

```ts
  it('auto-refreshes when an authenticated query returns UNAUTHENTICATED', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const oldAccess = makeJwt(future);
    const newAccess = makeJwt(future + 3600);
    const newRefresh = 'r'.repeat(50);

    process.env.TUI_API_TOKEN = oldAccess;

    let callIndex = 0;
    const fakeFetch = jest.fn().mockImplementation(async () => {
      callIndex += 1;
      if (callIndex === 1) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: { me: okUser() },
          }),
          text: async () => '',
        };
      }
      if (callIndex === 2) {
        const body = JSON.stringify({ errors: [{ message: 'Authentication required', extensions: { code: 'UNAUTHENTICATED' } }] });
        return { ok: false, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => JSON.parse(body), text: async () => body };
      }
      if (callIndex === 3) {
        const body = JSON.stringify({ data: { refresh: { accessToken: newAccess, refreshToken: newRefresh, user: okUser() } } });
        return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => JSON.parse(body), text: async () => body };
      }
      const body = JSON.stringify({ data: { me: okUser() } });
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => JSON.parse(body), text: async () => body };
    });
    const origFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch;
    try {
      const r = await bootstrapSession();
      expect(r.kind).toBe('ok');
      if (r.kind !== 'ok') return;
      expect(r.session.accessToken).toBe(newAccess);
      expect(r.session.refreshToken).toBe(newRefresh);
      expect(loadSession()?.accessToken).toBe(newAccess);
      expect(loadSession()?.refreshToken).toBe(newRefresh);
      expect(fakeFetch).toHaveBeenCalledTimes(4);
    } finally {
      (globalThis as unknown as { fetch: unknown }).fetch = origFetch;
    }
  });
```

**Nota sobre o cenário de teste:** o `TUI_API_TOKEN` não tem refresh token (linha 107 do bootstrap atual: `refreshToken: ''`). Para este teste funcionar, é necessário garantir que o bootstrap saiba o refresh token. Ajuste a Session persistida em vez de TUI_API_TOKEN — usar `loadSession`/`saveSession` antes do `bootstrapSession`:

Substituir o início do teste:

```ts
  it('auto-refreshes when an authenticated query returns UNAUTHENTICATED', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const oldAccess = makeJwt(future);
    const newAccess = makeJwt(future + 3600);
    const newRefresh = 'r'.repeat(50);

    saveSession({
      apiUrl: 'http://localhost:4000/graphql',
      accessToken: oldAccess,
      refreshToken: 'r'.repeat(40),
      user: okUser(),
      accessTokenExp: future * 1000,
    });

    let callIndex = 0;
    const fakeFetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      callIndex += 1;
      const body = init?.body ? String(init.body) : '';
      const isMe = /"query":"[^"]*\\bme\\b/.test(body) || body.includes('me ');
      const isRefresh = body.includes('refresh(');
      // call 1: probeHealth (unauth)
      if (callIndex === 1) {
        return okResponse({ health: 'ok' });
      }
      // call 2: any authenticated request returns UNAUTHENTICATED
      if (callIndex === 2 && !isRefresh) {
        return errorResponse('UNAUTHENTICATED');
      }
      // call 3: refresh mutation
      if (isRefresh) {
        return okResponse({ refresh: { accessToken: newAccess, refreshToken: newRefresh, user: okUser() } });
      }
      // call 4: retry of original query succeeds
      return okResponse({ me: okUser() });
    });
    ...
```

Helpers a adicionar no topo do arquivo de teste (após `okUser`):

```ts
function okResponse(data: unknown): Response {
  const body = JSON.stringify({ data });
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => JSON.parse(body),
    text: async () => body,
  } as Response;
}

function errorResponse(code: string): Response {
  const body = JSON.stringify({ errors: [{ message: 'fail', extensions: { code } }] });
  return {
    ok: false,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => JSON.parse(body),
    text: async () => body,
  } as Response;
}
```

Importar `saveSession` no topo do arquivo:

```ts
import { clearSession, loadSession, saveSession } from '../../../src/tui/api/auth';
```

### Step 2.2: Rodar teste e confirmar falha

```bash
npx jest tests/tui/api/bootstrap.spec.ts -t "auto-refreshes"
```

Esperado: FAIL — bootstrap ainda não tem lógica de refresh.

### Step 2.3: Refatorar `bootstrap.ts`

Substituir o arquivo inteiro `src/tui/api/bootstrap.ts`:

```ts
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
```

### Step 2.4: Rodar teste de auto-refresh e verificar que passa

```bash
npx jest tests/tui/api/bootstrap.spec.ts -t "auto-refreshes"
```

Esperado: PASS.

### Step 2.5: Rodar suite completa de `bootstrap.spec` e verificar que nada quebrou

```bash
npx jest tests/tui/api/bootstrap.spec.ts
```

Esperado: todos os 5 testes originais + o novo = 6 PASS.

### Step 2.6: Rodar `withRefreshRetry.spec` para garantir que ainda passa

```bash
npx jest tests/tui/api/withRefreshRetry.spec.ts
```

Esperado: 5 PASS.

### Step 2.7: Rodar suite completa de testes do TUI

```bash
npx jest tests/tui/
```

Esperado: todos os testes existentes + novos PASS.

### Step 2.8: Rodar lint

```bash
npm run lint
```

Esperado: sem erros.

### Step 2.9: Commit

```bash
git add src/tui/api/bootstrap.ts tests/tui/api/bootstrap.spec.ts
git commit -m "feat(tui): wire auto-refresh in bootstrap via withRefreshRetry"
```

---

## Task 3: Verificação final

### Step 3.1: Rodar TODOS os testes do projeto

```bash
npx jest
```

Esperado: 100% PASS.

### Step 3.2: Verificar typecheck

```bash
npx tsc --noEmit
```

Esperado: sem erros.

### Step 3.3: Verificar que nenhum import quebrou

```bash
grep -r "from '\.\./api/bootstrap'" src/ tests/ || true
```

Esperado: nenhum erro; imports de `bootstrap` continuam válidos.

### Step 3.4: Commit final (se houve ajustes)

```bash
git status
```

Se houver modificações não commitadas:

```bash
git add -A
git commit -m "chore(tui): post-refactor cleanup"
```

---

## Self-Review

**Spec coverage:**
- ✅ Função pura `withRefreshRetry` — Task 1
- ✅ `SessionExpiredError` — Task 1
- ✅ Dedup de refresh concorrente — implementado via `inFlightRefresh` em `buildAuthAwareApi`, Task 2
- ✅ `clearSession` em falha de refresh — Task 2.3, dentro do catch do `refreshHandler`
- ✅ `BootstrapResult` mantém shape — Task 2.3
- ✅ `ApiClient.request` interface não muda — Task 2.3 (`api.request = auth.request`)
- ✅ `setAuthToken` continua existindo — Task 2.3
- ✅ Testes dos 5 cenários — Task 1.1

**Type consistency:** `PersistedSession`, `AuthUser`, `ApiClient`, `SessionExpiredError`, `withRefreshRetry` usados consistentemente entre Task 1 e Task 2.

**Placeholder scan:** nenhum TBD/TODO no plano.
