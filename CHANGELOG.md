# Changelog

Todas as mudancas notaveis deste projeto sao documentadas aqui. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e este projeto adere a [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Added

- **build(deps)**: Pinned `sascar-sdk` to `v1.1.1` (was: tracking `main`). Reproducible builds + capture the audited `SascarXmlRpcClient` module + bugfixes from the v1.1.x line. No runtime changes — the XML-RPC client is not consumed yet.
- **docs(tui)**: New `docs/tui.md` — documentação completa da TUI (7 views, layout, atalhos, setup, limitações conhecidas).
- **feat(integration)**: docker-compose `dns` now lists `8.8.8.8` / `1.1.1.1` alongside the embedded resolver, so the app container can reach external hosts in environments where `127.0.0.11` doesn't forward.
- **feat(integration)**: New `BigInt` GraphQL scalar; `Veiculo.idEquipamento` switched to it (serialized as string, preserves precision past 2³¹ — Sascar returns values like 9.3B).
- **feat(integration)**: New DB migration `0005_veiculos_id_equipamento_bigint.sql` widens `id_equipamento` to `BIGINT` (was `INTEGER`, overflow on real data).
- **feat(graphql)**: New `VeiculoStatus` type and `Veiculo.status` field — live state (bloqueio, ignição, localização, GPS, jamming, combustível, sensores, alarme) derived from the most recent `posicoes` packet per vehicle. Resolver enriches `Query.veiculos` with a single batched `DISTINCT ON` query (no N+1, no Sascar passthrough). Freshness inherits from the existing `syncPositions` cron (default 10min) — `status.online` is a 10min heuristic via `data_posicao > now() - interval`. `status: null` when the vehicle has no position yet. TUI gains a `status` column with ASCII badges (`[B]` bloqueado, `[I]` ignição, `[+]` online).
- **fix(schema)**: `Posicao.idPacote` and `SyncCursor.lastIdPacote` switched to `BigInt` (was `Int`, broke on real Sascar data > 2³¹).
- **fix(cache)**: `cachedQuery` now uses `ON CONFLICT (primaryKey) DO UPDATE SET ... fetched_at, expires_at` (was `ON CONFLICT DO NOTHING` without a target). Cached rows refresh correctly on each cache miss, so the cache actually works.
- **test(integration)**: New `tests/integration/sascar-real.spec.ts` — suite gated por `RUN_REAL_SASCAR_TESTS=1` que bate no Sascar real (não mocka) e valida end-to-end os 4 métodos principais: `obterClientesV2`, `obterVeiculos`, `obterMotoristas`, `obterPacotePosicaoPorRangeJSON`. Por padrão a suite é `describe.skip` — roda só quando explicitamente habilitada (smoke job, debug local, validação de release). Lazy imports evitam falha no module-init quando env vars não estão setadas. Cobertura de ~5-10min.
- **feat(scripts)**: New `scripts/benchmark-sascar.ts` — script CLI para benchmark de chamadas Sascar reais em 3 grupos (blackbox desde início da semana, CAN bus, posições do mês passado). Configurável via `BENCHMARK_VEHICLE_LIMIT` (default 5), `BENCHMARK_DAYS_BACK` (default 7), `BENCHMARK_MONTH_DAYS_BACK` (default 35). Imprime tabela no terminal e salva relatório em `reports/benchmark-sascar-*.txt`. Use `npm run benchmark:sascar`. **Nota:** `solicitarEventosCaixaPreta` está desativado pela Sascar ("Metodo desativado. Sem previsao de liberacao") — blackbox vai retornar erro. `obterDadosAdicionais` requer veículo associado a gerenciadora com nota cadastrada.
- **test(integration)**: New `tests/integration/sascar-benchmark.spec.ts` — smoke test gated por `RUN_BENCHMARK_SMOKE=1` que valida 1 veículo × 1 chamada para cada um dos 3 grupos. Por padrão skipped.
- **feat(domain)**: New `posicao_eventos` table (migration 0006) — telemetria histórica 1:N com `posicoes`. Persiste snapshot (8 sinais: ignicao, bloqueio, rpm, tensao, velocidade, jamming, combustivel_nivel, combustivel_litrometro) + 1 row por transição (ignicao/bloqueio/jamming) vs posição anterior. Indexado por `(id_veiculo, data_posicao DESC)`. Volume estimado: ~117k rows/dia para 100 veículos. **Nota:** blackbox (caixa preta) e força G não estão disponíveis no Sascar SOAP — fora de escopo desta feature.
- **test(unit)**: New `tests/unit/extractEventsFromPosicao.spec.ts` — 13 cases para a função pura que extrai eventos de uma posição.
- **test(integration)**: New `tests/integration/posicao-eventos.spec.ts` — 4 cases cobrindo schema, transition metadata, unique constraint, e query com index.
- **fix(domain)**: `getPosicoesRecentes` agora implementa **stale-while-revalidate**: quando não há cache fresco (últimos 5min), serve cache stale imediatamente e dispara refresh em background via `setImmediate`. Resolve o timeout de 60s+ que acontecia em cold start quando havia >75 veículos (o mutex do SDK Sascar serializa todas as chamadas de posição, tornando o fan-out estritamente sequencial mesmo com concorrência no domínio). Novo status `stale` no `request_log`.
- **feat(lib)**: New `src/lib/concurrency.ts` — helper `runWithConcurrency(items, n, fn)` para paralelizar loops com concorrência limitada. Usado pelo cron `syncPositions` (paralelismo a nível de iteração; chamadas SOAP continuam serializadas pelo SDK).
- **test(unit)**: New `tests/unit/concurrency.spec.ts` — 5 cases para `runWithConcurrency` (ordem dos resultados, bound de concorrência, propagação de erro, lista vazia, speedup paralelo).
- **test(integration)**: New `tests/integration/posicoes-stale.spec.ts` — 3 cases cobrindo fresh cache (sem chamada Sascar), stale cache (retorna em <1s sem bloquear no Sascar mockado de 5s), e cold bootstrap (blocking).
- **feat(server)**: Custom landing page no `GET /` substituindo o Apollo Sandbox. Implementado via plugin Apollo (`src/server/landingPagePlugin.ts`) cujo `serverListener.renderLandingPage()` retorna HTML inline estático (zero CDN, zero JS) com descrição da API e link direto para `https://github.com/MartielLima/Api-Orquestrador`. `POST /` (GraphQL) inalterado. Coberto por `tests/integration/landing-page.spec.ts` (2 testes: GET HTML + POST GraphQL regression).

### Fixed

- **fix(bigint)**: Resolvers de `posicoesPorVeiculo`, `syncStatus` e `mapPosicoes` agora propagam `id_pacote` / `last_id_pacote` como `string` direto do `pg` (em vez de `Number()`), preservando precisão > 2^53. O schema já declarava `BigInt!` desde `ada026f`; este commit fecha o invariante no lado do resolver. `fetchAndUpsertPosicoes` agora usa `BigInt().reduce()` para o cursor max (future-proofing).
- **fix(cache)**: `cachedQuery` cache miss agora re-querya a tabela após o upsert e passa as rows ao `fromRows`, garantindo que `fetchedAt`/`expiresAt` sejam populados no retorno (eram `undefined` na resposta GraphQL, violando `DateTime!` — p.ex. `Cliente.fetchedAt: null`). Triggers no primeiro call após container start ou cache expiry.
- **fix(jwt)**: `signRefreshToken` agora inclui `jti` (`crypto.randomUUID()`) no payload, evitando colisão de hash em chamadas de `refresh` no mesmo segundo (era `duplicate key value violates unique constraint "refresh_tokens_token_hash_key"`).
- **fix(cache)**: `cachedQuery` now calls `mapSascarError` on fetcher errors, so `clientes` / `veiculos` / `motoristas` return `SASCAR_AUTH` / `SASCAR_RATE_LIMIT` / `SASCAR_TIMEOUT` / `SASCAR_NETWORK` / `SASCAR_FAULT` codes (was `INTERNAL_SERVER_ERROR`).
- **fix(auth)**: `login` and `refresh` mutations now include `active` in the `user` payload (was causing `Cannot return null for non-nullable field User.active` when the query asked for `user { active }`).
- **fix(tui/cache)**: `cachedQuery` agora aceita `{ bypassCache: true }`. `getClientes/Veiculos/Motoristas` passam `bypassCache: true` quando há filtro por id (`args.idXxx != null`), evitando que o cache global retorne registros não-filtrados. Queries sem filtro continuam servindo do cache normalmente.
- **fix(tui/error-leak)**: Novo `formatGraphQLError(err)` extrai apenas a mensagem amigável (ex: "Authentication required") ao invés de vazar o `ClientError` completo (query, variáveis, response, headers) na UI. Aplicado em todos os `toast.error(\`erro: ${e.message}\`)` da TUI (CadastroList, UsersView).
- **feat(tui/users)**: Nova opção `[d] remover` na view de Usuários — abre confirmação, bloqueia deletar o próprio usuário, chama `deleteUser` mutation (admin only) que também remove os refresh tokens do alvo. Mutation `deleteUser(id: ID!): Boolean!` adicionada ao schema + resolver.
- **fix(tui/input)**: `Field` agora aceita `focus?: boolean` e o propaga ao `TextInput`. Forms (CreateForm, ResetPassword, CadastroList) passam `focus={focused === fieldName}` para garantir que apenas o Field ativo receba keystrokes (antes, todos os `<TextInput>` do form capturavam cada tecla porque `ink-text-input` tem `focus=true` por padrão).
- **fix(tui/navigation)**: `App.useInput` faz early-return quando algum `<TextInput>` tem foco, evitando que o atalho numérico global (1-7) troque de view enquanto o usuário digita no filtro de Cadastro/Veiculos/Motoristas.
- **fix(server)**: `formatError` plugin in Apollo config unwraps `UserError` and surfaces its `code` as the GraphQL `extensions.code`. Now `UNAUTHENTICATED` / `FORBIDDEN` / `EMAIL_TAKEN` / `WEAK_PASSWORD` / `USER_NOT_FOUND` / `CANNOT_DEMOTE_SELF` / `CANNOT_DEACTIVATE_SELF` come through correctly (were all `INTERNAL_SERVER_ERROR` before).
- **docs(api)**: Per-method GraphQL reference (description · arguments · return type structure · errors · example) for all 18 methods. Plus a target error-code table and a Known Issues list.
- **docs(readme)**: New `API GraphQL` section in the README — scannable map + 4 tables (queries, mutations, types, scalars) that link to `docs/api.md` for the full reference.
- **fix(tui)**: `npm run tui` estava quebrado com `Error: Top-level await is currently not supported with the "cjs" output format` em `yoga-layout@3.2.1` (ESM com top-level await, dep transitiva de `ink`). Causa: o register CJS do `tsx` intercepta o `.js` da `yoga-layout` e tenta transformar via esbuild em modo CJS (projeto raiz é CJS, sem `"type": "module"`). Solução: compilar a TUI como pacote ESM standalone em `dist-tui/` (`tsconfig.tui.json` + `scripts/build-tui.cjs`), com `dist-tui/package.json` contendo `{"type":"module"}` para marcar como ESM. Docker builda `dist-tui/` antes do `npm prune --omit=dev` e copia para o stage runtime. Como bônus, `ink-table@3.1.0` (CJS que faz `require("ink")` — quebra em Node 22+ com `ERR_REQUIRE_ASYNC_MODULE`) foi substituído por `Table` próprio usando `Box`/`Text` do ink. Removido `ink-table` de dependencies. `npm run tui` agora builda e roda `node dist-tui/index.js`.
- **feat(tui)**: Auto-load de `.env` no bootstrap da TUI via `import 'dotenv/config'` em `src/tui/api/bootstrap.ts`. Permite rodar `npm run tui` no host sem `export` manual, reaproveitando o mesmo `.env` usado pelo `docker-compose`. Variáveis já em `process.env` têm precedência (dotenv não sobrescreve). Adicionado `dotenv@^17.4.2` em dependencies.

### Notes

- PR https://github.com/MartielLima/Api-Orquestrador/pull/1 bundles 11 commits (pin + integration + cache + 4 bug fixes + docs).
- 54 test suites / 189 tests passing (was 52 / 172 before this session). +17 new tests for the posicao_eventos feature: 13 unit (mapper), 4 integration (schema, transition, dedup, query).
- Two pre-existing issues remain documented in `docs/api.md` → Known Issues (5: `getPosicoesRecentes` does sequential sync per vehicle; 6: `cachedQuery` in `posicoes.ts` is structurally confusing). Neither is a blocker — captured as follow-up.



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

### TUI views

- **Usuários** (prioridade): lista com auto-refresh 30s, sort cyclable (`s`), navegação por linha (↑/↓), ações `n` (criar), `e` (editar role/active), `a` (toggle active com `<Confirm>`), `p` (reset senha, gera 16 chars ou manual), `t` (ver/revogar refresh tokens). Guard `isSelf` para CANNOT_DEMOTE_SELF e CANNOT_DEACTIVATE_SELF.
- **Clientes, Veículos, Motoristas**: lista via `CadastroList<T>` genérico, polling 60s, `r` refresh.
- **Posições**: tabs `recentes` (quantidade, polling 30s) e `por veículo` (idVeiculo + dataInicio + dataFim ISO 8601). Cap em 200 linhas.
- **Logs**: filtros (method cyclable, status all/ok/error, follow ON/OFF), polling 2s quando follow ativo, `x` limpa filtros.
- **Sync status**: tabela compacta dos `sync_cursor`, polling 10s.

### Known limitations

- Logout from TUI clears the session locally but does not revoke the refresh token on the server. The token expires naturally after `JWT_REFRESH_TTL` (default 7d) or is revoked by an admin via the TUI Tokens view. A dedicated `logout(refreshToken)` mutation is planned.
- Detalhe de linha (modal com JSON formatado) ainda não implementado nas views de cadastros. Colunas são fixas.

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
