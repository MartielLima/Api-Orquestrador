# Audit log: rastrear mutations sensíveis de identidade

**Data:** 2026-06-19
**Status:** aprovado (design)
**Escopo:** `src/auth/audit.ts` (novo), `src/auth/userResolvers.ts`, `src/context.ts`, `src/server.ts`, `src/graphql/schema.ts`, `src/graphql/resolvers.ts`, `src/db/migrations/0007_audit_log.sql`, `tests/integration/audit-log.spec.ts` (novo)

## Contexto e problema

A sessão anterior fechou o fix de auth (commits `d67eb8b`, `a107f0a`) que protegia os resolvers de leitura. Mas o back-end **não tem como reconstruir quem/quando/por quê mudou dados sensíveis**:

1. **`users.updated_at`** é genérico: atualiza em qualquer UPDATE (role, active, password). Não distingue o tipo de mudança.
2. **Mutations de auth não chamam `logRequest()`**: `createUser`, `updateUser`, `resetUserPassword`, `deleteUser`, `revokeRefreshToken` em `src/auth/userResolvers.ts` não emitem nada pra `request_log`. Compare com `src/domain/posicoes.ts:29,44,64` que chama `logRequest` em todas as operações.
3. **GraphQL `requestLog` query não expõe `user_id` nem `args`**: `src/graphql/resolvers.ts:107` só retorna `id, method, source, status, cache_hit, latency_ms, created_at, error`. Mesmo se as mutations de auth fossem logadas, não daria pra ver pelo GraphQL quem fez o quê nem com quais argumentos.
4. **Sem coluna `password_changed_at`**: a senha do admin foi rotacionada em algum momento da história do sistema e não há como reconstruir isso hoje (provavelmente `db:reset-admin` rodou, ou UPDATE manual via psql, ou `resetUserPassword` mutation, todas sem trilha).

Consequência prática: a investigação que motivou este PR ("por que a senha do admin mudou?") retornou "indeterminável" em vez de uma resposta.

## Objetivo

Construir trilha de auditoria mínima viável para mutations que mudam identidade, de forma que:

- Toda `createUser`, `updateUser`, `resetUserPassword`, `deleteUser`, `revokeRefreshToken` grava um registro na nova tabela `audit_log` com `actor`, `action`, `target`, `diff` (antes/depois), IP, User-Agent e timestamp.
- Admin pode consultar via nova query GraphQL `auditLog(...)`.
- A trilha inclui o IP e User-Agent do request HTTP (não apenas identidade do user) — útil pra forense.

## Não-objetivos

- Não audita leituras admin-only (`requestLog`, `syncStatus`, `refreshTokens`). Apenas mutations de auth.
- Não audita tentativas de login (sucesso ou falha). Pode vir em PR separado (junto com rate limit, item #2 do "Próximas sessões" em `testoRetomar.txt`).
- Não retém por tempo limitado na v1. Assume volume baixo de mutations de auth (~dezenas/mês); ~200 bytes/entry × 1000 entries/mês = ~2.4 MB/ano. Política de retenção pode vir em PR separado se virar problema.
- Não previne auditoria quebrada: `recordAudit` é fire-and-forget — se o INSERT falhar, loga mas NÃO quebra a mutation. Audit é observability, não gate.
- Não encripta o diff. O diff **nunca inclui `password_hash`** (o `resetUserPassword` grava `{password_changed: true}` como marcador, não o hash nem o plaintext).

## Design

### 1. Migration: `src/db/migrations/0007_audit_log.sql`

```sql
CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id),
  action        TEXT NOT NULL,
  target_table  TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  diff          JSONB NOT NULL,
  ip            INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_actor_created ON audit_log(actor_user_id, created_at DESC);
CREATE INDEX idx_audit_log_target ON audit_log(target_table, target_id, created_at DESC);
CREATE INDEX idx_audit_log_action_created ON audit_log(action, created_at DESC);
```

`actor_user_id` é NULL quando a ação vem de um script/cron (não logado como user). FK para `users(id)` com `ON DELETE SET NULL` (explícito) — se um user for deletado, suas ações no audit não somem, e `actor_user_id` vira NULL.

### 2. Schema Drizzle: `src/db/schema.ts`

Adicionar nova tabela `auditLog` espelhando a migration.

### 3. Helper: `src/auth/audit.ts` (novo arquivo)

```ts
export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.password_reset'
  | 'refresh_token.revoke';

export type AuditTargetTable = 'users' | 'refresh_tokens';

export type AuditDiff =
  | Record<string, unknown>                            // create
  | Record<string, { from: unknown; to: unknown }>      // update (diff por campo)
  | Record<string, unknown>                            // delete (snapshot)
  | { password_changed: true };                        // password_reset (marcador)

export interface AuditContext {
  db: Db;
  logger: Logger;
  actorUserId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(
  ctx: AuditContext,
  action: AuditAction,
  targetTable: AuditTargetTable,
  targetId: string,
  diff: AuditDiff,
): Promise<void> {
  try {
    await ctx.db.execute({
      sql: `INSERT INTO audit_log (actor_user_id, action, target_table, target_id, diff, ip, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      args: [
        ctx.actorUserId,
        action,
        targetTable,
        targetId,
        JSON.stringify(diff),
        ctx.ip ?? null,
        ctx.userAgent ?? null,
      ],
    });
  } catch (err) {
    ctx.logger.error({ err, action, targetId }, 'audit_log insert failed');
  }
}
```

### 4. Contexto: `src/context.ts` e `src/server.ts`

Adicionar `request?: { ip, userAgent }` em `AppContext`. Em `server.ts:51-55`, extrair do `req` que o Apollo standalone passa:

```ts
context: async ({ req }) => {
  const xff = req.headers['x-forwarded-for']?.toString().split(',')[0].trim();
  const ip = xff || req.socket.remoteAddress || null;
  const userAgent = req.headers['user-agent']?.toString() ?? null;
  return { ...(await buildContext()), orchestrator, request: { ip, userAgent } };
},
```

`request` é opcional — `buildContext()` continua sem ela para que `scripts/*` e testes que não passam request não precisem mudar.

### 5. Integração: `src/auth/userResolvers.ts`

Padrão: capturar estado relevante ANTES do UPDATE/DELETE, executar, gravar audit.

| Mutation | Diff calculado | Action |
|---|---|---|
| `createUser` | `{ id, email, role, active: true }` | `user.create` |
| `updateUser` | por campo alterado: `role` e/ou `active` com shape `{from, to}` — **pula audit se nenhum campo mudou** (noop) | `user.update` |
| `resetUserPassword` | `{ password_changed: true }` | `user.password_reset` |
| `deleteUser` | snapshot do row antes do DELETE: `{ id, email, role, active }` | `user.delete` |
| `revokeRefreshToken` | `{ revoked_at: now }` | `refresh_token.revoke` |

Helper local no `userResolvers.ts`:

```ts
function auditCtx(ctx: AppContext) {
  return {
    db: ctx.db,
    logger: ctx.logger,
    actorUserId: ctx.user?.id ?? null,
    ip: ctx.request?.ip ?? null,
    userAgent: ctx.request?.userAgent ?? null,
  };
}
```

Chamadas `recordAudit(auditCtx(ctx), ...)` após cada operação bem-sucedida, **dentro do try block** da mutation para garantir que falhe junto caso o DB esteja fora.

### 6. Schema GraphQL: `src/graphql/schema.ts`

```graphql
scalar JSON

type AuditLogEntry {
  id: ID!
  actorUserId: ID
  action: String!
  targetTable: String!
  targetId: String!
  diff: JSON!
  ip: String
  userAgent: String
  createdAt: DateTime!
}

type Query {
  # ... existing
  auditLog(
    limit: Int = 100,
    actorUserId: ID,
    action: String,
    targetTable: String,
    targetId: String
  ): [AuditLogEntry!]!
}
```

### 7. Resolver: `src/graphql/resolvers.ts`

```ts
auditLog: async (
  _: unknown,
  args: { limit?: number; actorUserId?: string; action?: string; targetTable?: string; targetId?: string },
  ctx: AppContext,
) => {
  requireAdmin(ctx);
  const params: unknown[] = [];
  const where: string[] = [];
  const push = (val: unknown) => { params.push(val); return `$${params.length}`; };
  if (args.actorUserId) where.push(`actor_user_id = ${push(args.actorUserId)}`);
  if (args.action) where.push(`action = ${push(args.action)}`);
  if (args.targetTable) where.push(`target_table = ${push(args.targetTable)}`);
  if (args.targetId) where.push(`target_id = ${push(args.targetId)}`);
  params.push(args.limit ?? 100);
  const sql = `SELECT id, actor_user_id, action, target_table, target_id, diff, ip, user_agent, created_at
               FROM audit_log
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY created_at DESC
               LIMIT $${params.length}`;
  const { rows } = await ctx.db.execute({ sql, args: params });
  return (rows as any[]).map((r) => ({
    id: String(r.id),
    actorUserId: r.actor_user_id,
    action: r.action,
    targetTable: r.target_table,
    targetId: r.target_id,
    diff: r.diff,
    ip: r.ip,
    userAgent: r.user_agent,
    createdAt: r.created_at,
  }));
},
```

### 8. Testes: `tests/integration/audit-log.spec.ts` (novo)

| # | Cenário | Esperado |
|---|---|---|
| 1 | `createUser` como admin | Audit entry: action=`user.create`, diff={id,email,role,active}, actorUserId=admin.id |
| 2 | `updateUser` mudando role | Audit entry: action=`user.update`, `diff.role={from:'user', to:'admin'}` |
| 3 | `updateUser` mudando active | Audit entry: action=`user.update`, `diff.active={from:true, to:false}` |
| 4 | `updateUser` noop (mesmo role+active) | **Nenhuma** audit entry |
| 5 | `resetUserPassword` | Audit entry: action=`user.password_reset`, diff=`{password_changed: true}`, **NUNCA contém hash nem plaintext** |
| 6 | `deleteUser` | Audit entry: action=`user.delete`, diff={id,email,role,active} do row deletado |
| 7 | `revokeRefreshToken` | Audit entry: action=`refresh_token.revoke`, targetTable=`refresh_tokens`, diff={revoked_at} |
| 8 | `auditLog` sem auth | `UNAUTHENTICATED` |
| 9 | `auditLog` como user (não-admin) | `FORBIDDEN` |
| 10 | `auditLog` com filtro `targetId` | Retorna só entries daquele target |
| 11 | `auditLog` com filtro `action` | Retorna só entries daquela action |
| 12 | IP e User-Agent populados no request | Audit entry grava `ip` e `user_agent` |
| 13 | `updateUser` self-demote attempt | Nenhuma audit entry (falha antes do UPDATE) |

**Unit test adicional** em `tests/unit/audit.spec.ts`:

| # | Cenário | Esperado |
|---|---|---|
| U1 | `recordAudit` com `db.execute` que lança erro | Função retorna void sem throw; `logger.error` é chamado com `action` e `targetId` |

Helpers reaproveitados de `tests/integration/auth-coverage.spec.ts`: `seedNonAdminUser()`, `loginAs()`, e setup do `pool` por-worker.

## Critérios de aceitação

- [ ] Migration `0007_audit_log.sql` roda em prod sem erro
- [ ] 13 testes de integração + 1 unit teste verdes
- [ ] `npm run typecheck` verde
- [ ] `npm run lint` verde
- [ ] `npm test` suite completa verde (sem regressão)
- [ ] Smoke manual: criar usuário, ver entry em `audit_log` no psql com IP/UA corretos

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| `request_log` existente já tem info similar — duplicação | `request_log` é observability operacional (latência, cache hit, erros); `audit_log` é trilha de mudanças de identidade. Propósito distinto, queries distintas. |
| Fire-and-forget do `recordAudit` mascara bugs | Log explícito `audit_log insert failed` em `ctx.logger.error` com action + targetId. Se aparecer nos logs, é bug a corrigir. |
| `request` opcional em AppContext pode ser esquecido em novos resolvers | Documentar em JSDoc do `AppContext.request`. Cobertura por teste (caso 13). |
| IP via X-Forwarded-For assume proxy confiável | Em prod atual (cloudflare + nginx) é correto. Para deploy direto sem proxy, `req.socket.remoteAddress` é o fallback. |

## Próximos passos após este PR

1. **Rate limit no login** (item #2 de "Próximas sessões" em `testoRetomar.txt`) — pode aproveitar `audit_log` para detectar tentativas excessivas.
2. **Alertar admin via notificação** quando `user.password_reset` ou `user.delete` ocorre no `admin@local.dev` — agora detectável via query no `auditLog`.
3. **Política de retenção** se volume justificar.
