# Auth coverage: proteger todos os resolvers de negócio

**Data:** 2026-06-19
**Status:** aprovado (design)
**Escopo:** `src/graphql/resolvers.ts` + `tests/integration/auth-coverage.spec.ts`

## Contexto e problema

A auth é enforced manualmente via `requireAuth(ctx)` / `requireAdmin(ctx)` em cada resolver (`src/auth/guards.ts`). O plugin `authPlugin` (`src/auth/authPlugin.ts`) apenas parseia o header `Authorization` e popula `ctx.user` — não há deny-by-default.

Auditoria de `src/graphql/resolvers.ts` revela **8 resolvers sem guard**:

| Resolver | Dado exposto sem auth |
|---|---|
| `clientes` | CNPJ + nome de clientes |
| `veiculos` | placa + IDs |
| `motoristas` | nome de motoristas |
| `posicoesRecentes` | **GPS em tempo real** (lat/lon/velocidade/ignição) |
| `posicoesPorVeiculo` | **GPS histórico** |
| `syncStatus` | estado interno do cron |
| `requestLog` | latência, métodos Sascar, cache hit/miss |
| `caixaPretaEventos` | (deprecated, vazio na prática) |

Em `https://orcapi.martiellima.com/`, todos retornam 200 OK sem nenhum header. **Qualquer pessoa na internet pode rastrear a frota inteira em tempo real.**

Apenas `me`, `users`, `refreshTokens` exigem auth hoje (via `requireAuth`/`requireAdmin` em `src/auth/userResolvers.ts`).

## Objetivo

Travar todos os resolvers de negócio atrás de auth, com dois níveis conforme sensibilidade:

- **`requireAuth`**: dados do próprio negócio (clientes, veículos, posições)
- **`requireAdmin`**: dados operacionais internos (sync status, request log)

## Não-objetivos

- Não adiciona rate limit / brute-force protection no login (PR separado)
- Não remove `caixaPretaEventos` (deprecated, mas outras decisões futuras)
- Não muda o fluxo da TUI — o bootstrap já loga e persiste sessão
- Não introduz audit log de acessos negados (pode vir depois)

## Design

### Edits em `src/graphql/resolvers.ts`

Adicionar guard no início de cada resolver público:

| Resolver | Guard |
|---|---|
| `clientes` | `requireAuth(ctx)` |
| `veiculos` | `requireAuth(ctx)` |
| `motoristas` | `requireAuth(ctx)` |
| `posicoesRecentes` | `requireAuth(ctx)` |
| `posicoesPorVeiculo` | `requireAuth(ctx)` |
| `syncStatus` | `requireAdmin(ctx)` |
| `caixaPretaEventos` | `requireAuth(ctx)` |
| `requestLog` | `requireAdmin(ctx)` |

`health`, `login`, `refresh` ficam públicos (intencional — healthcheck do docker, login pra obter token, refresh pra rotacionar).

Padrão:
```ts
clientes: (_: unknown, args: any, ctx: AppContext) => {
  requireAuth(ctx);
  return getClientes(ctx, args);
},
```

Resolvers que já tinham corpo (como `posicoesPorVeiculo`) ganham `requireAuth(ctx);` como primeira linha.

### Novo arquivo: `tests/integration/auth-coverage.spec.ts`

Cobrir via `buildTestServer` (helper existente em `tests/helpers/server.ts`) que cada endpoint protegido retorna `UNAUTHENTICATED` sem `Authorization` header:

```ts
const AUTH_REQUIRED = [
  'clientes', 'veiculos', 'motoristas',
  'posicoesRecentes', 'posicoesPorVeiculo', 'caixaPretaEventos',
];
const ADMIN_REQUIRED = ['syncStatus', 'requestLog'];
const PUBLIC = ['health'];

describe('auth coverage', () => {
  for (const name of AUTH_REQUIRED) {
    it(`${name} returns UNAUTHENTICATED without token`, async () => { ... });
  }
  for (const name of ADMIN_REQUIRED) {
    it(`${name} returns UNAUTHENTICATED without token`, async () => { ... });
    it(`${name} returns FORBIDDEN for non-admin`, async () => { ... });
  }
  it('health works without token', async () => { ... });
});
```

Para o caso `FORBIDDEN`, criar um usuário não-admin via seed (`db:seed`) ou INSERT direto no setup, login, e validar.

## Critérios de sucesso

- `npm test` verde (typecheck + lint + 222+ testes existentes + 8-10 novos testes de auth)
- `curl https://localhost:4000/...` (queries protegidas) sem header → `UNAUTHENTICATED`
- `curl https://localhost:4000/...` com `Authorization: Bearer $ADMIN_TOKEN` → 200 OK
- `curl https://orcapi.martiellima.com/...` (após deploy) → mesmo comportamento

## Deploy

Mudança é puramente additive (não muda contrato público que estava protegido). Deploy é safe mesmo com login quebrado em prod: o fix é server-side only, vai no `docker compose up -d --build app`. Após deploy, **toda query sem token retorna `UNAUTHENTICATED`** (incluindo `health`? não — `health` continua público).

O login quebrado em prod será investigado em paralelo pelo usuário.