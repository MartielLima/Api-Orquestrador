# Api-Orquestrador Sascar

API GraphQL (TypeScript) que orquestra chamadas ao `sascar-sdk` (SasIntegra v2.07).

## Status

**v0.1.0** — 25 tasks concluídas. 37 testes passando, lint/typecheck/prettier limpos.

Cobertura de métodos Sascar (v1): clientes, veículos, motoristas, posições (com cursor), caixa-preta (deprecated stub), comandos via macros (não expostos). Para expor mais dos 63 métodos do SDK, basta adicionar `Query` fields em `src/graphql/resolvers.ts` seguindo o padrão dos existentes.

## Quickstart

```bash
docker compose up -d postgres
cp .env.example .env
# edite .env: SASCAR_USUARIO, SASCAR_SENHA, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
# gere secrets: openssl rand -hex 32 (rode 2x)
npm install           # postinstall builda sascar-sdk se necessário
npm run db:migrate    # cria 9 tabelas (4 migrations)
npm run db:seed       # cria admin@local.dev
npm run dev
```

GraphQL endpoint: `http://localhost:4000/`

### Primeiro uso

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
- `npm test` — jest (37 testes)
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

**Princípios:**

- 1 `SascarClient` por processo (singleton), credenciais do `.env`.
- 1 `AsyncQueue` global serializa **todas** as 63 chamadas SOAP (respeitando "1 chamada/vez/credencial").
- 1 camada `cachedQuery<T>` checa Postgres antes de chamar Sascar.
- Toda resposta (hit ou miss) vai para `request_log` (auditoria).
- Job de posições roda em `node-cron` no mesmo processo, atrás de try/catch.

## Documentação

- **Spec de design**: `docs/superpowers/specs/2026-06-12-api-orquestrador-sascar-design.md`
- **Plano de implementação**: `docs/superpowers/plans/2026-06-12-api-orquestrador-sascar.md`
- **API GraphQL**: `docs/api.md`
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
