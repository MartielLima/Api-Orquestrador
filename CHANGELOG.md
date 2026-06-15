# Changelog

Todas as mudancas notaveis deste projeto sao documentadas aqui. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e este projeto adere a [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [0.2.0] - 2026-06-15

### Added

- TUI Ink-based (`npm run tui`) com gestão de usuários (prioridade), logs de auditoria, navegação de dados Sascar, status de sync, e gestão de refresh tokens.
- Apollo auth plugin que popula `ctx.user` a partir do header `Authorization: Bearer ...`. (Antes o token era emitido mas não aplicado.)
- Resolvers de user management (admin-gated): `me`, `users`, `refreshTokens`, `createUser`, `updateUser`, `resetUserPassword`, `revokeRefreshToken`.
- Guards `requireAuth` / `requireAdmin` reutilizáveis.
- `UserError` tipado com códigos: `EMAIL_TAKEN`, `WEAK_PASSWORD`, `USER_NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`, `CANNOT_DEMOTE_SELF`, `CANNOT_DEACTIVATE_SELF`.
- Type `User.active` e types `RefreshToken` / `CreateUserInput` / `UpdateUserInput` no SDL.
- Validação zod para todas as mutations de user management.

### TUI auth — sem login no terminal

- A TUI assume que o operador já tem acesso ao container. Por isso **não há tela de login** no terminal.
- `src/tui/api/bootstrap.ts` resolve o token nesta ordem:
  1. `TUI_API_TOKEN` no env (uso direto, se já setado).
  2. Sessão persistida em `env-paths('api-orquestrador').config/session.json` (carregada e validada, com `refresh` automático se o access token estiver perto de expirar).
  3. Login silencioso via `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` (mesmas vars usadas pelo seed da API). O token resultante é gravado no env do processo e persistido em `session.json` para execuções futuras.
- `TUI_API_URL` opcional — default `http://localhost:4000/graphql`. Use `http://app:4000/graphql` se rodar dentro do mesmo docker-compose.
- Tela de erro amigável é renderizada se o bootstrap falhar (rede indisponível, seed faltando, 401).

### Known limitations

- Logout from TUI clears the session locally but does not revoke the refresh token on the server. The token expires naturally after `JWT_REFRESH_TTL` (default 7d) or is revoked by an admin via the TUI Tokens view. A dedicated `logout(refreshToken)` mutation is planned.

### Tests

- 37 → ~78 backend tests (18 userResolvers + 2 authPlugin + 14 validators + 3 errors + 4 guards).

## [0.1.1] - 2026-06-13

### Adicionado

- **Docker**: `Dockerfile` multi-stage (Node 22-alpine) com build do `sascar-sdk` a partir do GitHub (clone + tsc), `npm rebuild bcrypt` para o native binding, e `docker-entrypoint.sh` que aguarda Postgres, roda migrations, e seed antes de subir o app.
- `docker-compose.yml` atualizado com servico `app` (build from Dockerfile, healthcheck via POST GraphQL `{ health }`, depends_on postgres).
- `.dockerignore` para reduzir o contexto de build.
- `tini` como PID 1 (signal forwarding) na imagem runtime.
- `dns: 127.0.0.11` no compose para resolver nomes de servicos no alpine.
- README com secao Docker (quickstart via compose, comandos uteis, troubleshooting).

### Modificado

- `scripts/` movido para `src/scripts/` (compilado pelo mesmo `tsc` que compila o app; antes ficava fora de `rootDir`).
- `src/scripts/seed-admin.ts`: imports relativos ajustados para `'../auth/password'` e `'../config'`.
- `package.json`: scripts `db:migrate`, `db:seed`, `postinstall` apontam para `src/scripts/`.
- `scripts/tsconfig.json` removido (nao mais necessario apos a reestruturacao).

## [0.1.0] - 2026-06-12

### Adicionado

**Scaffold**

- `package.json` com TypeScript 5, Node 18+, dependências do `sascar-sdk` instalado do GitHub (`github:MartielLima/sascar-sdk`).
- `tsconfig.json` estrito (ES2022, NodeNext, strict mode).
- ESLint + Prettier configurados.
- `jest.config.ts` com ts-jest preset.
- `postinstall` idempotente que builda `sascar-sdk` se `dist/` estiver ausente.
- `docker-compose.yml` com PostgreSQL 16 (healthcheck + volume nomeado).
- `.env.example` documentando todas as 19 variáveis de ambiente (Sascar, API, JWT, cache TTLs, job sync, DB, logger).

**Configuração e logging**

- `src/config.ts` — validação zod de env vars com tipos estritos (`AppConfig`).
- `src/lib/logger.ts` — pino com redaction automática de `senha`, `senhaAtual`, `novaSenha`, `password` (incluindo wildcards).
- `src/lib/shutdown.ts` — graceful shutdown com timeout de 60s em SIGTERM/SIGINT.

**Banco de dados (PostgreSQL)**

- `src/db/client.ts` — wrapper sobre `pg.Pool` com interface `Db { execute({sql, args}) }`.
- `src/db/schema.ts` — definição Drizzle das tabelas.
- 4 migrations SQL idempotentes:
  - `0001_init.sql` — `users`, `refresh_tokens`, `request_log` (+ `citext`, `pgcrypto` extensions).
  - `0002_cadastros_cache.sql` — `clientes_cache`, `veiculos_cache`, `motoristas_cache`.
  - `0003_posicoes.sql` — `posicoes` (com `UNIQUE (id_veiculo, id_pacote)`), `sync_cursor`.
  - `0004_caixa_preta.sql` — `caixa_preta_eventos` com `COMMENT` marcando como deprecated.
- `scripts/migrate.ts` — runner com tracking em `_migrations`.
- `scripts/seed-admin.ts` — cria admin a partir de `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` (idempotente).

**Autenticação**

- `src/auth/password.ts` — bcrypt (12 rounds).
- `src/auth/jwt.ts` — sign/verify com secrets separados para access e refresh.
- `src/auth/resolvers.ts` — mutations `login` e `refresh` (com rotação de refresh token).
- TTLs configuráveis via env (`JWT_ACCESS_TTL=15m`, `JWT_REFRESH_TTL=7d`).

**API GraphQL (Apollo Server 4)**

- `src/graphql/schema.ts` — SDL com 13 tipos e 11 queries/mutations.
- `src/graphql/resolvers.ts` — merge de auth + domain + auditoria.
- `src/context.ts` — `AppContext` com `user`, `logger`, `db`, `orchestrator`.
- `src/server.ts` — `startServer()` com Apollo + logger + config.

**Orquestrador Sascar**

- `src/orchestrator/SascarOrchestrator.ts` — `SascarOrchestrator` com `AsyncQueue` global (serializa todas as 63 chamadas SOAP, respeitando limite "1 chamada/vez/credencial").
- `src/orchestrator/cache.ts` — `cachedQuery<T>` genérico (TTL + cache-aside).
- `src/orchestrator/log.ts` — `logRequest()` para auditoria.
- `src/orchestrator/errors.ts` — `mapSascarError()` que converte as 5 classes de erro do SDK em `GraphQLError` com `extensions.code`:
  - `SASCAR_AUTH`, `SASCAR_RATE_LIMIT` (com `retryAfter`), `SASCAR_TIMEOUT` (com `timeoutMs`), `SASCAR_NETWORK`, `SASCAR_FAULT`, `INTERNAL`.

**Domain (cache-first)**

- `src/domain/clientes.ts` — `getClientes()` via `obterClientesV2`.
- `src/domain/veiculos.ts` — `getVeiculos()` via `obterVeiculos`.
- `src/domain/motoristas.ts` — `getMotoristas()` via `obterMotoristas`.
- `src/domain/posicoes.ts` — `getPosicoesRecentes()` + `fetchAndUpsertPosicoes()` com cursor `id_pacote` (sync incremental).
- `src/domain/caixaPreta.ts` — stub `@deprecated` que apenas lê histórico (não chama Sascar, pois o método está desativado na origem).

**Job de background**

- `src/jobs/syncPositions.ts` — `node-cron` com `*/10 * * * *`, opt-in via `SYNC_POSITIONS_ENABLED=true`.
- `src/jobs/cron.ts` — registry de jobs.
- `src/index.ts` — bootstrap: `startServer()` + `startAllJobs()` + `installShutdown()`.

**Documentação**

- `docs/superpowers/specs/2026-06-12-api-orquestrador-sascar-design.md` — spec completa.
- `docs/superpowers/plans/2026-06-12-api-orquestrador-sascar.md` — plano de 25 tasks.
- `docs/api.md` — referência GraphQL com tabela de deprecação.
- `README.md` — quickstart + comandos.

**Cobertura de testes: 37 testes, 19 suites**

- 7 unitários: config, password, jwt, logger, mapSascarError, SascarOrchestrator.
- 12 integração: db, migrate, auth, log, cache, cadastros, posicoes, posicoes-query, syncPositions, caixaPreta, request-log, server, shutdown.

### Notas operacionais

- **sascar-sdk**: instalado de `github:MartielLima/sascar-sdk`. O `postinstall` builda automaticamente. Em ambientes sem rede no `postinstall`, rodar manualmente: `cd node_modules/sascar-sdk && npm run build`.
- **SEED_ADMIN_EMAIL**: o zod `.email()` exige TLD válido. O `.env.example` usa `admin@local.dev` (alterado de `admin@local`).
- **JWT secrets**: para produção, gerar com `openssl rand -hex 32` e setar `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET`.
- **Worker exit warning**: jest reportou "worker failed to exit gracefully" em alguns runs — `pg.Pool` e `cron` tasks não sempre fechados em testes. Não bloqueia testes (passam 37/37); cleanup incremental a fazer.

### Decisões de deprecação documentadas

- `solicitarEventosCaixaPreta` (4.51 SasIntegra) — **DESATIVADO pela Sascar**, sem previsão. Stub no schema GraphQL com `@deprecated`.
- `obterDeltaTelemetriaIntegracao` (4.44) — descontinuado; recomendar `obterDeltaTelemetriaIntegracaoInercia` (não exposto nesta v1).
- `obterClientes` — mantido por compatibilidade LGPD; recomendar `obterClientesV2` (CNPJ alfanumérico).

[0.1.0]: #010---2026-06-12
