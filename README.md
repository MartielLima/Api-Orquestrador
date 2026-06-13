# Api-Orquestrador Sascar

API GraphQL (TypeScript) que orquestra chamadas ao `sascar-sdk` (SasIntegra v2.07).

## Quickstart

```bash
docker compose up -d postgres
cp .env.example .env
# edite .env com suas credenciais Sascar
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

GraphQL Playground: http://localhost:4000

## Variáveis de ambiente principais

- `SASCAR_USUARIO` / `SASCAR_SENHA`: credenciais SasIntegra
- `DATABASE_URL`: Postgres
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: ≥ 32 chars random
- `SYNC_POSITIONS_ENABLED=true`: ativa o job de 10 min
- `CACHE_CADASTRO_TTL_MS` / `CACHE_POSICAO_TTL_MS`: TTLs

## Comandos

- `npm run dev` — desenvolvimento (tsx watch)
- `npm run build` — build TS → dist/
- `npm start` — produção
- `npm test` — testes
- `npm run lint` / `npm run format:check`
- `npm run db:migrate` / `npm run db:seed`

## Documentação

- Spec: `docs/superpowers/specs/2026-06-12-api-orquestrador-sascar-design.md`
- API: `docs/api.md`
- Plan: `docs/superpowers/plans/2026-06-12-api-orquestrador-sascar.md`

## Métodos descontinuados (Sascar v2.07)

Veja tabela em `docs/api.md`. Resumo: `solicitarEventosCaixaPreta` (4.51)
e `obterDeltaTelemetriaIntegracao` (4.44) estão desativados na origem.
