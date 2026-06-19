# Auto-refresh transparente no client GraphQL do TUI

**Data:** 2026-06-19
**Status:** aprovado (design)
**Escopo:** TUI (`src/tui/`)

## Contexto e problema

O TUI usa um `ApiClient` que injeta `Authorization: Bearer <accessToken>` em todas as requisições (`src/tui/api/client.ts:13`). O `accessToken` tem TTL de 15 minutos (`src/config.ts:21`, `JWT_ACCESS_TTL=15m`). Após esse tempo, qualquer query autenticada retorna `UNAUTHENTICATED`.

Hoje, a única rota de refresh está em `bootstrap.ts:124-130` e está **morta para o caso de token expirado**: ela só dispara se `probeHealth()` falhar, mas `health` é `() => 'ok'` sem auth (`src/graphql/resolvers.ts:23`), então nunca falha por credencial. Não existe auto-refresh durante o uso normal do TUI.

Resultado: usuário fica olhando uma tela por >15 minutos, troca de view, recebe `UNAUTHENTICATED`, precisa reiniciar o TUI manualmente.

## Objetivo

Tornar o refresh transparente para todas as views do TUI. Quando o `accessToken` expirar, o client dispara `M_REFRESH` automaticamente, atualiza a session persistida e reenvia a request original. Se o próprio `refreshToken` estiver inválido, limpa a session e propaga um erro tipado.

## Não-objetivos

- Não muda o servidor (`src/auth/authPlugin.ts`) — o `UNAUTHENTICATED` continua sendo o sinal de token expirado/inválido.
- Não introduz refresh proativo (timer) — continua sendo reativo, ao primeiro erro.
- Não modifica a interface pública de `ApiClient` (`request<T>`, `setAuthToken`).
- Não adiciona retry para erros que não são de auth (rede, 5xx).

## Design

### Arquivo novo: `src/tui/api/withRefreshRetry.ts`

Função pura, sem dependência de filesystem ou `graphql-request`, fácil de testar:

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
    const newToken = await refresh(); // dedup interno
    return doRequest(); // re-tenta; doRequest lê o token novo via closure
  }
}
```

`doRequest` é sem parâmetros porque lê o token atual via closure (definido no `bootstrap.ts`). `withRefreshRetry` não conhece `ApiClient` nem tokens — só orquestra a sequência tentar → falhar auth → refresh → re-tentar. O `refresh` faz dedup de chamadas concorrentes usando `let inFlight: Promise<string> | null = null` também via closure.

### Refator em `src/tui/api/bootstrap.ts`

O `bootstrap` deixa de expor `setAuthToken` cru e passa a montar um `ApiClient` "aware":

```ts
let inFlightRefresh: Promise<string> | null = null;
let currentAccessToken: string | null = null;

const refreshHandler = async (): Promise<string> => {
  if (inFlightRefresh) return inFlightRefresh;
  if (!persisted.refreshToken) throw new SessionExpiredError('no refresh token');
  inFlightRefresh = (async () => {
    try {
      const data = await api.request<{ refresh: { accessToken: string; refreshToken: string } }>(
        M_REFRESH, { refreshToken: persisted.refreshToken },
      );
      persisted.accessToken = data.refresh.accessToken;
      persisted.refreshToken = data.refresh.refreshToken;
      persisted.accessTokenExp = decodeJwtExp(data.refresh.accessToken);
      saveSession(persisted);
      api.setAuthToken(persisted.accessToken);
      currentAccessToken = persisted.accessToken;
      return persisted.accessToken;
    } catch (e) {
      clearSession();
      throw new SessionExpiredError('refresh failed: ' + (e as Error).message);
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
};

const isAuthError = (err: unknown): boolean => /* checa `extensions.code === 'UNAUTHENTICATED'` */;

const doRequest = <T>(doc: RequestDocument, vars?: Variables): Promise<T> => {
  api.setAuthToken(currentAccessToken);
  return api.request<T>(doc, vars);
};

const request = <T>(doc: RequestDocument, vars?: Variables): Promise<T> =>
  withRefreshRetry(
    () => doRequest(doc, vars),
    refreshHandler,
    isAuthError,
  );
```

O `BootstrapResult` mantém a mesma shape (`{ kind: 'ok', api, user, session }`). O `api.request` agora é a versão wrapped.

### Identificação de erro de auth

O `graphql-request` joga um `Error` cuja mensagem contém `extensions.code === 'UNAUTHENTICATED'` quando o servidor retorna esse código. A função `isAuthError` faz parse seguro:

```ts
const isAuthError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return /"code":"UNAUTHENTICATED"/.test(msg) || /UNAUTHENTICATED/.test(msg);
};
```

Refinamento durante implementação: inspecionar o erro real lançado pelo `graphql-request@7` e ajustar a heurística se necessário.

## Fluxos

### Caminho feliz (token válido)

```
view.request(Q_USERS)
  → withRefreshRetry.doRequest(tokenVálido)
  → 200 OK
```

### Token expirado, refresh OK

```
view.request(Q_USERS)
  → doRequest(tokenExpirado) → lança UNAUTHENTICATED
  → isAuthError? sim
  → refresh() — inFlight null, dispara M_REFRESH
      → novo accessToken + refreshToken
      → saveSession
      → retorna accessToken
  → doRequest(tokenNovo) → 200 OK
```

### Concorrência (5 views disparam juntas após expiry)

```
view1.request → fail → dispara refresh (inFlight setado)
view2.request → fail → await inFlight (mesmo promise)
view3.request → fail → await inFlight
...
refresh resolve → todos pegam o mesmo token novo
cada view re-tenta doRequest(tokenNovo) → 200 OK
```

Uma única chamada a `M_REFRESH`. Sem rotação múltipla.

### Refresh também falha

```
view.request → fail → refresh() lança SessionExpiredError
SessionExpiredError propaga para a view
view mostra "Sessão expirou, faça login novamente"
clearSession já foi chamado dentro do refresh handler
```

## Compatibilidade

- `ApiClient.request` em `src/tui/api/client.ts` **não muda**. Continua sendo o wrapper burro do `graphql-request`.
- `setAuthToken` continua existindo — o `bootstrap` ainda usa para setar token inicial.
- `BootstrapResult` mantém a mesma shape. As views (`UsersView`, `VeiculosView`, etc.) não precisam de modificação.
- Nenhuma mudança em servidor, schema, ou migrations.

## Testes

`tests/tui/api/withRefreshRetry.spec.ts` (novo):

1. **sucesso de primeira** — `doRequest` resolve, `refresh` não é chamado.
2. **retry após auth error** — primeira chamada lança erro com `UNAUTHENTICATED`, `refresh` resolve, segunda chamada resolve.
3. **não-retenta em erro não-auth** — `doRequest` lança `NetworkError`, propaga sem chamar `refresh`.
4. **dedup concorrente** — 5 chamadas `withRefreshRetry` em paralelo com auth error → `refresh` chamado **exatamente 1 vez**; todas as 5 resolvem.
5. **refresh falhando** — `refresh` lança `SessionExpiredError`; `withRefreshRetry` propaga; `doRequest` chamado apenas 1 vez (não re-tenta).

Adicionalmente, ajuste em `tests/auth/authPlugin.spec.ts` se necessário — provavelmente não, pois o servidor não muda.

## Riscos e mitigações

- **Heurística `isAuthError` frágil** — se `graphql-request` mudar formato do erro. Mitigação: teste cobre o caso com `extensions.code = 'UNAUTHENTICATED'`; se mudar, falhará o teste, sinal claro.
- **`saveSession` no meio de retry pode falhar (FS cheio)** — se `saveSession` falhar, ainda assim a session in-memory está atualizada para a request em voo. Persistência falha é logada mas não derruba a operação.
- **Cliente fora do `bootstrap`** — qualquer uso direto de `buildApiClient` (sem `withRefreshRetry`) não ganha auto-refresh. Hoje só `bootstrap` cria o client, então não há vazamento.

## Out of scope (YAGNI)

- Refresh proativo por timer.
- Múltiplos retries em sequência.
- Cancelamento de request em voo durante refresh.
- Métricas/telemetria de refresh.
- UI de "renovando sessão..." no TUI (views podem capturar `SessionExpiredError` e mostrar prompt próprio; sem mudança no escopo deste spec).
