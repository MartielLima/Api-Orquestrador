# Api-Orquestrador Sascar

API GraphQL (TypeScript) que orquestra chamadas ao `sascar-sdk` (SasIntegra v2.07).

## Status

**v0.2.0** — backend ganha user management (admin-gated) e Apollo auth plugin que aplica o JWT no `ctx.user`. TUI Ink-based completa (`npm run tui`): 7 views navegáveis, gestão de usuários, logs, cadastros, posições, sync.

Cobertura de métodos Sascar (v1): clientes, veículos, motoristas, posições (com cursor), caixa-preta (deprecated stub), comandos via macros (não expostos). Para expor mais dos 63 métodos do SDK, basta adicionar `Query` fields em `src/graphql/resolvers.ts` seguindo o padrão dos existentes.

## Quickstart

### TUI (cockpit do terminal, sem Postman, sem curl, sem psql)

```bash
# Pelo host, com a API rodando em http://localhost:4000/graphql (recomendado)
npm run tui

# Ou dentro do container (requer imagem com dist-tui/ — ver docs/tui.md)
docker exec -it api-orquestrador-app node dist-tui/index.js
```

A TUI assume que o operador já tem acesso ao container — **não há tela de login**. O token é resolvido por `src/tui/api/bootstrap.ts` nesta ordem:

1. `TUI_API_TOKEN` (env) — uso direto.
2. Sessão persistida em `env-paths('api-orquestrador').config/session.json` — recarrega + refresh se access token estiver perto de expirar.
3. Login silencioso via `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` (mesmas vars da API) — persiste em `session.json` para execuções futuras.

Se tudo falhar, tela de erro amigável indica o que configurar. `TUI_API_URL` opcional (default `http://localhost:4000/graphql`).

7 views, todas via teclado (sem mouse):

| Tecla global | Ação |
| --- | --- |
| `1`–`7` | navegar entre views |
| `Tab` / `Shift+Tab` | próxima / anterior |
| `?` | help overlay (atalhos da view atual) |
| `H` | toggle header |
| `q` / `Ctrl+C` | sair |

| View | Atalhos próprios |
| --- | --- |
| **Usuários** (1) | `n` novo · `e` editar · `a` ativar/desativar (com confirm) · `p` reset senha · `t` ver/revogar tokens · `s` cyclar sort · `r` refresh · `Enter` detalhe |
| **Clientes** (2) · **Veículos** (3) · **Motoristas** (4) | `f` filtrar por id · `x` limpar filtro · `r` refresh · `Enter` detalhe |
| **Posições** (5) | `Tab` alterna recentes/por veículo · `r` refresh · `Enter` detalhe |
| **Logs** (6) | `m` cyclar método · `f` cyclar status · `s` follow on/off · `x` limpar filtros · `r` refresh |
| **Sync** (7) | `r` refresh (polling 10s automático) |

A status bar inferior mostra user, role, saúde da API, countdown do token, e relógio. Toasts verdes/vermelhos confirmam ações.

> **Referência completa:** ver [`docs/tui.md`](docs/tui.md) para detalhes de cada view, layout, atalhos específicos, e limitações.

### Opção 1: Docker Compose (recomendado, zero setup local)

```bash
# 1. Edite o .env com suas credenciais
cp .env.example .env
# Ajuste: SASCAR_USUARIO, SASCAR_SENHA, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
# Para gerar secrets: openssl rand -hex 32 (rode 2x)

# 2. Suba o stack (postgres + app, com migrations + seed automáticos)
docker compose up -d --build

# 3. Acompanhe o startup
docker compose logs -f app
# Espera ver: "Apollo server started" + healthcheck "(healthy)"

# 4. Teste
curl -X POST http://localhost:4000/ -H 'Content-Type: application/json' \
  -d '{"query":"{ health }"}'
# → {"data":{"health":"ok"}}
```

### Opção 2: Desenvolvimento local (hot-reload)

```bash
docker compose up -d postgres
cp .env.example .env
npm install           # postinstall builda sascar-sdk se necessário
npm run db:migrate
npm run db:seed
npm run dev
```

### Primeiro uso (em qualquer opção)

```bash
# 1. Login (cria sessão, retorna access + refresh token)
curl -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { login(email:\"admin@local.dev\", password:\"change-me-admin\") { accessToken refreshToken user { email role } } }"}'

# 2. Use o accessToken nas próximas chamadas
TOKEN="<accessToken da resposta acima>"
curl -X POST http://localhost:4000/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ veiculos(quantidade: 10) { idVeiculo placa idCliente } }"}'
```

### Comandos Docker úteis

```bash
docker compose up -d --build       # build + start
docker compose down                 # stop
docker compose down -v              # stop + remove volumes (apaga DB)
docker compose logs -f app          # follow logs
docker compose exec app sh          # shell no container
docker compose exec postgres psql -U api_orquestrador -d api_orquestrador
docker images api-orquestrador:0.1.0
```

## API GraphQL

**Endpoint:** `POST http://localhost:4000/` (ou `http://app:4000/` rodando dentro do `docker-compose`).
**Header obrigatório** (exceto `health` e `login`/`refresh`): `Authorization: Bearer <accessToken>`.
**Tokens:** obtidos via `mutation login` (TTL 15min) ou `mutation refresh` (rotação, TTL 7d).

Documentação completa (exemplos, códigos de erro, notas por método): [`docs/api.md`](docs/api.md).
**Como consumir do Postman / browser / Node (login, refresh automático, troubleshooting):** [`docs/session-management.md`](docs/session-management.md).
**Schema SDL (download para autocomplete no Postman):** [`schema.graphql`](schema.graphql) na raiz do repo.

### Queries

| Query | Auth | Retorna | O que faz |
| --- | --- | --- | --- |
| `health` | — | `String!` | Liveness probe (sem auth). Retorna `"ok"`. |
| `me` | sim | `User!` | Usuário autenticado (a partir do JWT). |
| `users` | admin | `[User!]!` | Lista todos os usuários. |
| `clientes(idCliente, quantidade=1000)` | sim | `[Cliente!]!` | Cadastro de clientes. Cache 24h. |
| `veiculos(idVeiculo, quantidade=1000)` | sim | `[Veiculo!]!` | Cadastro de veículos. Cache 24h. Cada item traz `status` vivo (último pacote `posicoes`). |
| `motoristas(idMotorista, quantidade=1000)` | sim | `[Motorista!]!` | Cadastro de motoristas. Cache 24h. |
| `posicoesRecentes(quantidade=1000)` | sim | `[Posicao!]!` | Posições recentes (últimos 5min) do banco local. |
| `posicoesPorVeiculo(idVeiculo!, dataInicio!, dataFim!)` | sim | `[Posicao!]!` | Posições de um veículo em intervalo (sincroniza antes). |
| `syncStatus` | sim | `[SyncCursor!]!` | Estado do cursor de sync por veículo/método. |
| `requestLog(limit=100, method)` | sim | `[RequestLogEntry!]!` | Auditoria: cada chamada (Sascar/auth/cron) gravada. `method` filtra. |
| `refreshTokens(userId!)` | admin | `[RefreshToken!]!` | Refresh tokens ativos (não revogados, não expirados) de um usuário. |
| `caixaPretaEventos(placa, idVeiculo)` | sim | `[CaixaPretaEvento!]!` | `@deprecated` — método Sascar 4.51 desativado. Use `posicoesRecentes`. |

### Mutations

| Mutation | Auth | Retorna | O que faz |
| --- | --- | --- | --- |
| `login(email!, password!)` | — | `AuthPayload!` | Autentica. Retorna `accessToken` (15min) + `refreshToken` (7d) + `user`. |
| `refresh(refreshToken!)` | — | `AuthPayload!` | Roda o refresh token; emite novo par (revoga o anterior). |
| `createUser(input!)` | admin | `User!` | Cria usuário. Erros: `EMAIL_TAKEN`, `WEAK_PASSWORD`. |
| `updateUser(id!, input!)` | admin | `User!` | Atualiza `role` e/ou `active`. Erros: `CANNOT_DEMOTE_SELF`, `CANNOT_DEACTIVATE_SELF`. |
| `resetUserPassword(id!, newPassword!)` | admin | `User!` | Reseta a senha (gera hash bcrypt). |
| `revokeRefreshToken(id!)` | admin | `Boolean!` | Revoga um refresh token. |

### Types (campos retornados)

| Type | Campos |
| --- | --- |
| `User` | `id: ID!`, `email: String!`, `role: String!`, `active: Boolean!`, `createdAt: DateTime!` |
| `AuthPayload` | `accessToken: String!`, `refreshToken: String!`, `user: User!` |
| `RefreshToken` | `id: ID!`, `userId: ID!`, `createdAt: DateTime!`, `expiresAt: DateTime!`, `revokedAt: DateTime` |
| `Cliente` | `idCliente: Int!`, `cnpj: String`, `cpf: String`, `nome: String!`, `fetchedAt: DateTime!`, `expiresAt: DateTime!` |
| `Veiculo` | `idVeiculo: Int!`, `placa: String!`, `idCliente: Int`, `descricao: String`, `idEquipamento: BigInt`, `fetchedAt: DateTime!`, `expiresAt: DateTime!`, `status: VeiculoStatus` (null se sem posição) |
| `VeiculoStatus` | `bloqueado: Boolean!`, `ignicaoLigada: Boolean!`, `online: Boolean!`, `localizacao: VeiculoStatusLocalizacao!`, `gps: Boolean!`, `jamming: Boolean!`, `combustivel: VeiculoStatusCombustivel`, `sensores: VeiculoStatusSensores!`, `alarme: VeiculoStatusAlarme!`, `atualizadoEm: DateTime!`, `idadeSegundos: Int!` (ver `docs/api.md` para sub-types) |
| `Motorista` | `idMotorista: Int!`, `nome: String!`, `tipoDocumento: String`, `fetchedAt: DateTime!`, `expiresAt: DateTime!` |
| `Posicao` | `idPacote: Int!`, `idVeiculo: Int!`, `dataPosicao: DateTime!`, `dataPacote: DateTime!`, `latitude: Float!`, `longitude: Float!`, `velocidade: Float!`, `ignicao: Int`, `direcao: Int`, `odometro: Float`, `syncedVia: String!` |
| `SyncCursor` | `method: String!`, `idVeiculo: Int!`, `lastIdPacote: Int`, `lastSyncedAt: DateTime!` |
| `RequestLogEntry` | `id: ID!`, `method: String!`, `source: String!`, `status: String!`, `cacheHit: Boolean!`, `latencyMs: Int`, `createdAt: DateTime!`, `error: String` |
| `CaixaPretaEvento` | `id: ID!` (deprecated), `idVeiculo: Int`, `placa: String`, `dataEvento: DateTime`, `latitude: Float`, `longitude: Float`, `velocidade: Float` |
| `CreateUserInput` | `email: String!`, `password: String!`, `role: String!` |
| `UpdateUserInput` | `role: String`, `active: Boolean` |

### Scalars customizados

- `DateTime` — string ISO 8601 (ex: `2026-06-17T19:25:06.000Z`).
- `BigInt` — string (preserva precisão para valores que excedem 2³¹, ex: `idEquipamento`).

### Exemplo rápido

```bash
# 1. Login
curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { login(email:\"admin@local.dev\", password:\"change-me-admin\") { accessToken user { email role } } }"}'

# 2. Usar o token
TOKEN="<accessToken da resposta>"
curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ veiculos(quantidade: 3) { idVeiculo placa idEquipamento } }"}'
```

## Variáveis de ambiente

| Variável                  | Default                                | Descrição                    |
| ------------------------- | -------------------------------------- | ---------------------------- |
| `SASCAR_USUARIO`          | (obrigatório)                          | Login SasIntegra             |
| `SASCAR_SENHA`            | (obrigatório)                          | Senha SasIntegra             |
| `SASCAR_WSDL_URL`         | `https://sasintegra.sascar.com.br/...` | Endpoint WSDL                |
| `SASCAR_TIMEOUT_MS`       | `30000`                                | Timeout HTTP por chamada     |
| `SASCAR_MAX_RETRIES`      | `3`                                    | Retries em 5xx/erro de rede  |
| `API_PORT`                | `4000`                                 | Porta do Apollo              |
| `API_CORS_ORIGINS`        | `http://localhost:3000`                | CSV de origens permitidas    |
| `JWT_ACCESS_SECRET`       | (≥32 chars)                            | Secret do access token       |
| `JWT_REFRESH_SECRET`      | (≥32 chars)                            | Secret do refresh token      |
| `JWT_ACCESS_TTL`          | `15m`                                  | TTL do access token          |
| `JWT_REFRESH_TTL`         | `7d`                                   | TTL do refresh token         |
| `SEED_ADMIN_EMAIL`        | (email)                                | Email do admin seed          |
| `SEED_ADMIN_PASSWORD`     | (≥8 chars)                             | Senha do admin seed          |
| `CACHE_CADASTRO_TTL_MS`   | `86400000` (24h)                       | TTL do cache de cadastros    |
| `CACHE_POSICAO_TTL_MS`    | `300000` (5min)                        | TTL do cache de posições     |
| `SYNC_POSITIONS_ENABLED`  | `false`                                | Liga o job de sync de 10 min |
| `SYNC_POSITIONS_CRON`     | `*/10 * * * *`                         | Expressão cron               |
| `SYNC_POSITIONS_QUANTITY` | `1000`                                 | Max pacotes por range        |
| `DATABASE_URL`            | (url)                                  | Connection string Postgres   |
| `LOG_LEVEL`               | `info`                                 | Nível pino                   |

## Comandos

- `npm run dev` — desenvolvimento (tsx watch + SIGTERM clean)
- `npm run build` — `tsc` → `dist/`
- `npm run build:tui` — builda a TUI como ESM standalone em `dist-tui/` (precisa rodar antes do `npm run tui`; o script `tui` já chama)
- `npm start` — produção
- `npm run tui` — TUI (cockpit do terminal)
- `npm test` — jest (66 backend + 50 TUI = 116 testes; 1 skipped)
- `npm run typecheck` / `npm run lint` / `npm run format:check`
- `npm run db:migrate` / `npm run db:seed` / `npm run db:reset`

## Testes com Sascar real (gated)

O projeto inclui `tests/integration/sascar-real.spec.ts` que bate no Sascar real (sem mock) e valida end-to-end o pipeline: SDK SOAP → `SascarOrchestrator` → Postgres → GraphQL. Por padrão a suite é `describe.skip`. Para rodar:

```bash
RUN_REAL_SASCAR_TESTS=1 SASCAR_USUARIO=... SASCAR_SENHA=... SASCAR_WSDL_URL=... npm test
```

Requer credenciais Sascar válidas (no `.env` ou inline) e o container postgres rodando. Demora ~5-10min. Os 3 testes de cache (~1-3s cada) e 1 teste de posições (~30-45s por SOAP + até 1000 INSERTs) são cobertos.

Use para debug local, validação de release, ou smoke job. **Não rodar em CI sem secret management.**

## Benchmark massivo

Para benchmark de chamadas Sascar em escala, use `npm run benchmark:sascar`. O script itera por todos os veículos do `veiculos_cache` em 3 grupos (blackbox, CAN bus, posições históricas) e mede o tempo de cada chamada. Salva relatório em `reports/benchmark-sascar-*.txt`.

**Configurável via env vars:**
- `BENCHMARK_VEHICLE_LIMIT` (default 5) — número de veículos.
- `BENCHMARK_DAYS_BACK` (default 7) — range do blackbox (janelas de 10min).
- `BENCHMARK_MONTH_DAYS_BACK` (default 35) — range das posições históricas.

**Atenção:** para N veículos, o Grupo 1 (blackbox) faz N × ~144 chamadas SOAP (144 janelas de 10min × 7 dias). Comece com `BENCHMARK_VEHICLE_LIMIT=1` para validar a pipeline.

**Limitações conhecidas:**
- `solicitarEventosCaixaPreta` está desativado pela Sascar — o grupo 1 vai retornar erros até a Sascar reativar o método.
- `obterDadosAdicionais` requer veículo com gerenciadora e nota cadastrada — pode falhar com "veiculo nao pertence a gerenciadora".

## Telemetria histórica (`posicao_eventos`)

A tabela `posicao_eventos` (criada pela migration 0006) persiste telemetria histórica por posição: 8 sinais (snapshot) + 1 row por transição (ignicao/bloqueio/jamming) detectada vs posição anterior do mesmo veículo. Populada automaticamente pelo `fetchAndUpsertPosicoes` quando há novas posições.

**Sinais persistidos (snapshot, 8/posição):** `ignicao`, `bloqueio`, `rpm`, `tensao`, `velocidade`, `jamming`, `combustivel_nivel`, `combustivel_litrometro`.

**Sinais de transição (quando mudam vs anterior):** `ignicao`, `bloqueio`, `jamming` — `from_value` e `to_value` no `metadata` JSONB.

**Volume:** ~117k rows/dia para 100 veículos (cron 10min × 8 sinais/posição).

**Query direta via SQL:**

```sql
SELECT signal, value_numeric, value_text, value_bool, data_posicao
FROM posicao_eventos
WHERE id_veiculo = 123 AND data_posicao > now() - interval '24 hours'
ORDER BY data_posicao DESC;
```

**Não exposto via GraphQL nesta v1** — query direto via SQL.

## Arquitetura

```
Cliente GraphQL (Postman / app / front)
  │  Header: Authorization: Bearer <JWT>
  ▼
Apollo Server 4
  │  Plugins: jwtAuth, pino logging
  ▼
Resolvers  ──►  SascarOrchestrator  ──►  SascarClient (singleton)
  ▲                    │                          │
  │                    ▼                          ▼
  │              AsyncQueue global        Sascar SOAP endpoint
  │                    │
  ▼                    ▼
PostgreSQL  ◄──  cache check (TTL + cursor)
  ▲
  │
node-cron  ──►  job syncPositions (a cada 10 min, opt-in)
```

### Docker

A imagem (`api-orquestrador:0.1.0`) é multi-stage (Node 22-alpine):

1. **Builder**: clona o `sascar-sdk` do GitHub no tag `v1.1.1` (`git clone --branch v1.1.1` via `SASCAR_SDK_REF`), builda seu `dist/`, instala deps (com `npm rebuild bcrypt` para o native binding), compila nosso TS, builda a TUI como ESM standalone em `dist-tui/` (via `npm run build:tui`, antes do `npm prune`).
2. **Runtime**: imagem limpa com `node_modules` podado, `dist/` compilado, `dist-tui/` (TUI ESM), `src/db/migrations/` para o script de migration rodar, e o `docker-entrypoint.sh` que:
   - Aguarda o Postgres responder
   - Roda migrations (idempotente)
   - Roda seed do admin (idempotente)
   - `exec node dist/index.js`

`tini` é o PID 1 (signal forwarding). Healthcheck: POST GraphQL `{ health }` no endpoint.

**Variáveis de ambiente** no compose: lidas do `.env` (com defaults hardcoded em dev). Em produção, passe via secrets do orquestrador.

**Volume**: `pg_data` persiste dados do Postgres entre `up`/`down` (use `down -v` para resetar).

**Princípios:**

- 1 `SascarClient` por processo (singleton), credenciais do `.env`.
- 1 `AsyncQueue` global serializa **todas** as 63 chamadas SOAP (respeitando "1 chamada/vez/credencial").
- 1 camada `cachedQuery<T>` checa Postgres antes de chamar Sascar.
- Toda resposta (hit ou miss) vai para `request_log` (auditoria).
- Job de posições roda em `node-cron` no mesmo processo, atrás de try/catch.

## Documentação

- **Spec de design (v1)**: `docs/superpowers/specs/2026-06-12-api-orquestrador-sascar-design.md`
- **Spec de design (TUI)**: `docs/superpowers/specs/2026-06-15-tui-orquestrador-design.md`
- **Plano de implementação (v1)**: `docs/superpowers/plans/2026-06-12-api-orquestrador-sascar.md`
- **Plano de implementação (TUI)**: `docs/superpowers/plans/2026-06-15-tui-orquestrador.md`
- **API GraphQL**: `docs/api.md` (inclui seção de user management admin-gated)
- **Schema reference**: `docs/api-schema-reference.md` (queries, mutations, types, scalars)
- **Session management (cliente)**: `docs/session-management.md` (Postman, browser, Node — login, refresh automático, troubleshooting)
- **Schema GraphQL (SDL, download para autocomplete)**: `schema.graphql` (raiz do repo)
- **Collection Postman**: `audit-log.postman_collection.json` (raiz do repo) — já vem com Pre-request Script de auto-refresh
- **TUI (Terminal User Interface)**: `docs/tui.md` (7 views, atalhos, setup, limitações)
- **Changelog**: `CHANGELOG.md`

## Métodos descontinuados (Sascar SasIntegra v2.07)

Revisão do manual Michelin SasIntegra v2.07 (290 páginas) revelou 2 métodos explicitamente desativados e 1 descontinuado. Detalhes em `docs/api.md`:

| Método                                  | Status                      | Substituto                              |
| --------------------------------------- | --------------------------- | --------------------------------------- |
| `solicitarEventosCaixaPreta` (4.51)     | **DESATIVADO** sem previsão | nenhum — usar `posicoesRecentes`        |
| `obterDeltaTelemetriaIntegracao` (4.44) | descontinuado               | `obterDeltaTelemetriaIntegracaoInercia` |
| `obterClientes`                         | compatibilidade (LGPD)      | `obterClientesV2` (CNPJ alfanumérico)   |

A diretiva `@deprecated` está aplicada nos campos SDL correspondentes para que ferramentas (Apollo Studio, GraphiQL) exibam o aviso automaticamente.

## Notas operacionais

- **sascar-sdk** é pined em [`v1.1.1`](https://github.com/MartielLima/sascar-sdk/releases/tag/v1.1.1) (GitHub tag). Builds são reprodutíveis. O `postinstall` continua buildando localmente se o `dist/` vier ausente; em geral vem no tarball. Se o `postinstall` falhar (ex: sem rede), rode manualmente: `cd node_modules/sascar-sdk && npm run build`.
- **`SEED_ADMIN_EMAIL`** precisa de TLD válido (zod). Use `admin@local.dev`, não `admin@local`.
- **JWT secrets** em produção: `openssl rand -hex 32` (rode 2x para access e refresh).
- **Coverage atual**: ~95% dos módulos `src/orchestrator/`, `src/auth/`, `src/domain/`. Adicionar coverage report com `npm run test:cov`.
- **Node version testado**: 26.1.0 (engines declara `>=18.0.0`).
- **PostgreSQL testado**: 16-alpine em Docker.

## Próximas evoluções (fora do escopo da v0.1.0)

- Expor mais dos 63 métodos Sascar (rotas, pontos de referência, eventos telemetria, etc.) — basta adicionar `Query` fields.
- Multi-tenant (várias credenciais Sascar, uma por usuário da API).
- Subscriptions GraphQL para posições em tempo real.
- Partition da tabela `posicoes` por mês (crescimento de longo prazo).
- Refresh token cleanup job (revogar tokens expirados).
