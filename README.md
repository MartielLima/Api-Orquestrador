# Api-Orquestrador Sascar

API GraphQL (TypeScript) que orquestra chamadas ao `sascar-sdk` (SasIntegra v2.07).

## Status

**v0.2.0** — backend ganha user management (admin-gated) e Apollo auth plugin que aplica o JWT no `ctx.user`. TUI Ink-based completa (`npm run tui`): 7 views navegáveis, gestão de usuários, logs, cadastros, posições, sync.

Cobertura de métodos Sascar (v1): clientes, veículos, motoristas, posições (com cursor), caixa-preta (deprecated stub), comandos via macros (não expostos). Para expor mais dos 63 métodos do SDK, basta adicionar `Query` fields em `src/graphql/resolvers.ts` seguindo o padrão dos existentes.

## Quickstart

### TUI (cockpit do terminal, sem Postman, sem curl, sem psql)

```bash
# dentro do container ou com a API rodando em http://localhost:4000/graphql
npm run tui
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
- `npm start` — produção
- `npm run tui` — TUI (cockpit do terminal)
- `npm test` — jest (66 backend + 50 TUI = 116 testes; 1 skipped)
- `npm run typecheck` / `npm run lint` / `npm run format:check`
- `npm run db:migrate` / `npm run db:seed` / `npm run db:reset`

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

1. **Builder**: clona o `sascar-sdk` do GitHub, builda seu `dist/`, instala deps (com `npm rebuild bcrypt` para o native binding), compila nosso TS.
2. **Runtime**: imagem limpa com `node_modules` podado, `dist/` compilado, `src/db/migrations/` para o script de migration rodar, e o `docker-entrypoint.sh` que:
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

- **sascar-sdk** é instalado do GitHub. O `postinstall` builda automaticamente. Se o `postinstall` falhar (ex: sem rede), rode manualmente: `cd node_modules/sascar-sdk && npm run build`.
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
