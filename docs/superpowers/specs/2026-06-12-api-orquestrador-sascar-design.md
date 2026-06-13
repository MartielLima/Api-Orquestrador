# Api-Orquestrador Sascar — Design

**Data:** 2026-06-12
**Status:** Aguardando revisão
**Stack escolhida:** TypeScript + Node 18+ + Apollo Server 4 + PostgreSQL 16

## Resumo executivo

API GraphQL em TypeScript que orquestra chamadas ao `sascar-sdk` (módulo interno que
embrulha o WebService SOAP SasIntegra v2.07 da Michelin ConnectedFleet).

A API funciona como um **proxy com cache + fila serializada**: cada requisição GraphQL
checa primeiro o PostgreSQL local; em caso de cache miss, enfileira a chamada no
`SascarClient` (respeitando o limite "1 chamada por credencial por vez" da Sascar),
persiste a resposta, e devolve o dado. Toda chamada — hit ou miss — é gravada em log
de auditoria.

Um job em background (`node-cron`) atualiza as posições de todos os veículos a cada
10 minutos, gravando no banco com `synced_via='cron'`. Esse job é **opt-in via env**.

## Objetivos e não-objetivos

### Objetivos

1. Expor os métodos do `sascar-sdk` como Queries GraphQL tipadas. **v1 foca
   nos 30+ métodos mais usados (cadastros, posições, telemetria, comandos)**;
   o restante entra em spec futura. A meta final é cobrir todos os 63.
2. Reduzir chamadas SOAP via cache local com TTL + cursor.
3. Respeitar o limite de concorrência da Sascar (1 chamada/vez/credencial) através
   de uma fila global baseada no `AsyncQueue` do SDK.
4. Persistir todas as requisições para auditoria e geração de histórico.
5. Autenticar consumidores da API via JWT (email/senha, multi-usuário).
6. Marcar métodos obsoletos/descontinuados tanto no schema GraphQL (via
   `@deprecated`) quanto na documentação gerada.
7. Manter a referência da caixa-preta (caixa preta) com aviso de depreciação.

### Não-objetivos (fora do escopo desta spec)

- Multi-tenant (várias credenciais Sascar) — a API é single-tenant nesta versão.
- Subscriptions GraphQL em tempo real — pode ser adicionado em spec futura.
- Painel web / front-end.
- Reescrita do `sascar-sdk`.
- Integração com Redis ou outro message broker (o `node-cron` in-process é suficiente).

## Contexto e pré-requisitos

- O `sascar-sdk` (https://github.com/MartielLima/sascar-sdk) é uma biblioteca
  TypeScript que expõe 63 métodos (1:1 com as seções 4.1–4.63 do manual SasIntegra
  v2.07), tipados, com retry/timeout e 5 classes de erro dedicadas.
- O SDK já exporta um `AsyncQueue` (FIFO/Mutex) usado internamente para serializar
  position methods. Vamos instanciar **um novo** `AsyncQueue` no orquestrador da
  nossa API, dessa vez global, para garantir serialização de **todas** as 63 chamadas.
- O manual Michelin SasIntegra v2.07 (290 páginas) lista 2 métodos explicitamente
  descontinuados, usados como base da documentação de deprecação desta API.

## Achados críticos sobre o manual SasIntegra v2.07

Revisão do manual Michelin
(`WebService_SasIntegra_v2.07_Portugues.pdf`, 290 páginas) revelou:

| Seção     | Método                           | Status na origem                                                                          |
| --------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| 4.44      | `obterDeltaTelemetriaIntegracao` | Descontinuado — usar `obterDeltaTelemetriaIntegracaoInercia` (4.60)                       |
| 4.51      | `solicitarEventosCaixaPreta`     | DESATIVADO, sem previsão de liberação (SOAP Fault literal)                                |
| 2.06→2.07 | `obterClientes`                  | Mantido por compatibilidade (LGPD CNPJ alfanumérico) — recomendado usar `obterClientesV2` |

**Implicação direta para a feature de "blackbox a cada 10 min" pedida pelo
usuário:** o método `solicitarEventosCaixaPreta` está morto na origem. O método par
`recuperarEventosCaixaPreta` (4.52) só retorna eventos previamente solicitados pelo
método morto, então também não produz dados novos hoje. Decidido em brainstorming:
a sincronização a cada 10 min usará `obterPacotePosicoesJSON` / `obterPacotePosicaoPorRangeJSON`
que já entrega posição + velocidade + ignição + odômetro, atendendo o requisito
"essencial" do usuário. A entidade `caixaPreta` continua exposta no schema para
compatibilidade histórica, com `@deprecated` explícito.

## Arquitetura

```
Cliente GraphQL (Postman / app / front)
   |  Header: Authorization: Bearer <JWT>
   v
Apollo Server 4
   |  - jwtAuthPlugin (resolveUser)
   |  - loggingPlugin (pino)
   v
Resolvers  --->  SascarOrchestrator  --->  SascarClient (1 singleton)
   ^                    |                          |
   |                    v                          v
   |              AsyncQueue global       https://sasintegra.sascar.com.br/...
   |                    |
   v                    v
PostgreSQL  <----  cache check (TTL + cursor)
(cadastros,
 posicoes,
 request_log)
   ^
   |
node-cron  --->  job syncPositions (a cada 10 min, opt-in)
```

### Princípios

- 1 `SascarClient` por processo (singleton). Credenciais vêm de `SASCAR_USUARIO` /
  `SASCAR_SENHA` no `.env`.
- 1 `AsyncQueue` global instanciada pelo nosso orquestrador enfileira **todas** as
  63 chamadas SOAP — não só as de posição (como o SDK faz por padrão).
- 1 camada de cache `SascarOrchestrator.cachedQuery()` checa Postgres **antes** de
  chamar Sascar. Decide validade por `expires_at` (TTL) ou por cursor `id_pacote`
  (posições).
- Toda resposta (hit ou miss) é gravada em `request_log` para auditoria.
- O job de posição roda em `node-cron` em background, no mesmo processo Node,
  atrás de um `try/catch` que não derruba o servidor se uma chamada falhar.

## Stack

| Camada              | Escolha                                     |
| ------------------- | ------------------------------------------- |
| Linguagem           | TypeScript 5.x                              |
| Runtime             | Node.js >= 18 (LTS)                         |
| Servidor GraphQL    | Apollo Server 4                             |
| ORM / query builder | Drizzle ORM (PostgreSQL)                    |
| Migrations          | Drizzle Kit                                 |
| Banco               | PostgreSQL 16                               |
| Auth                | JWT (jsonwebtoken) + bcrypt (hash de senha) |
| Cron                | node-cron                                   |
| Logger              | pino                                        |
| Validação de env    | zod                                         |
| Testes              | jest + supertest + nock (mock SOAP)         |
| Lint/format         | ESLint + Prettier                           |

> Drizzle foi escolhido sobre Prisma por ser mais leve, gerar SQL mais transparente
> e ter migrations via SQL puro. Prisma é aceitável; decisão registrada para
> contestação durante o plano de implementação.

## Modelo de dados

```sql
-- AUTH
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CADASTROS (cache, TTL 24h)
CREATE TABLE clientes_cache (
  id_cliente  INTEGER PRIMARY KEY,
  cnpj        TEXT,
  cpf         TEXT,
  nome        TEXT NOT NULL,
  raw         JSONB NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE veiculos_cache (
  id_veiculo      INTEGER PRIMARY KEY,
  placa           TEXT NOT NULL,
  id_cliente      INTEGER,
  descricao       TEXT,
  id_equipamento  INTEGER,
  raw             JSONB NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_veiculos_placa ON veiculos_cache(placa);

CREATE TABLE motoristas_cache (
  id_motorista   INTEGER PRIMARY KEY,
  nome           TEXT NOT NULL,
  tipo_documento TEXT,
  raw            JSONB NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL
);

-- POSICOES (cache com cursor)
CREATE TABLE posicoes (
  id            BIGSERIAL PRIMARY KEY,
  id_pacote     BIGINT NOT NULL,
  id_veiculo    INTEGER NOT NULL,
  data_posicao  TIMESTAMPTZ NOT NULL,
  data_pacote   TIMESTAMPTZ NOT NULL,
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  velocidade    DOUBLE PRECISION NOT NULL,
  ignicao       INTEGER,
  direcao       INTEGER,
  odometro      DOUBLE PRECISION,
  horimetro     DOUBLE PRECISION,
  raw           JSONB NOT NULL,
  synced_via    TEXT NOT NULL DEFAULT 'graphql',
  UNIQUE (id_veiculo, id_pacote)
);
CREATE INDEX idx_posicoes_veiculo_data ON posicoes(id_veiculo, data_posicao DESC);
CREATE INDEX idx_posicoes_id_pacote ON posicoes(id_pacote);

CREATE TABLE sync_cursor (
  method         TEXT NOT NULL,
  id_veiculo     INTEGER NOT NULL,
  last_id_pacote BIGINT,
  last_synced_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (method, id_veiculo)
);

-- CAIXA PRETA (deprecated, mantida para histórico)
CREATE TABLE caixa_preta_eventos (
  id            BIGSERIAL PRIMARY KEY,
  id_veiculo    INTEGER,
  placa         TEXT,
  data_evento   TIMESTAMPTZ,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  velocidade    DOUBLE PRECISION,
  rpm           INTEGER,
  ignicao       INTEGER,
  freio         INTEGER,
  raw           JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL DEFAULT 'recuperarEventosCaixaPreta'
);
COMMENT ON TABLE caixa_preta_eventos IS
  'DEPRECATED: solicitarEventosCaixaPreta foi desativada pela Sascar no manual v2.07. '
  'Esta tabela só será populada novamente se a Sascar reativar o método. '
  'Mantida para histórico e detecção de reativação.';

-- AUDITORIA
CREATE TABLE request_log (
  id            BIGSERIAL PRIMARY KEY,
  method        TEXT NOT NULL,
  source        TEXT NOT NULL,
  user_id       UUID REFERENCES users(id),
  args          JSONB,
  status        TEXT NOT NULL,
  cache_hit     BOOLEAN NOT NULL DEFAULT false,
  latency_ms    INTEGER,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_request_log_created_at ON request_log(created_at DESC);
CREATE INDEX idx_request_log_method ON request_log(method);
```

### Decisões de modelagem

- **Uma tabela por método Sascar** (em vez de JSON-blob genérico) para permitir
  queries SQL úteis (ex: "última posição do veículo X"). A coluna `raw JSONB`
  guarda o payload completo para auditoria e evolução.
- **Cadastros com TTL fixo de 24h** (configurável por env). Cadastros raramente
  mudam.
- **Posições com TTL 5min + cursor**: se o dado mais recente tem menos de 5 min,
  retorna do banco. Caso contrário, busca via `obterPacotePosicaoPorRangeJSON` a
  partir do último `id_pacote` registrado em `sync_cursor`.
- **UNIQUE (id_veiculo, id_pacote)** dedup natural — Sascar pode repetir pacotes
  em chamadas de range sobrepostas.
- **CITEXT** para email (case-insensitive) e **UUID** para PKs de user.

## Schema GraphQL (resumo)

```graphql
scalar DateTime

type AuthPayload {
  accessToken: String!
  refreshToken: String!
  user: User!
}
type User {
  id: ID!
  email: String!
  role: String!
  createdAt: DateTime!
}

type Cliente {
  idCliente: Int!
  cnpj: String
  cpf: String
  nome: String!
  fetchedAt: DateTime!
  expiresAt: DateTime!
}
type Veiculo {
  idVeiculo: Int!
  placa: String!
  idCliente: Int
  descricao: String
  idEquipamento: Int
  fetchedAt: DateTime!
  expiresAt: DateTime!
}
type Motorista {
  idMotorista: Int!
  nome: String!
  tipoDocumento: String
  fetchedAt: DateTime!
  expiresAt: DateTime!
}
type Posicao {
  idPacote: Int!
  idVeiculo: Int!
  dataPosicao: DateTime!
  dataPacote: DateTime!
  latitude: Float!
  longitude: Float!
  velocidade: Float!
  ignicao: Int
  direcao: Int
  odometro: Float
  syncedVia: String!
}
type SyncCursor {
  method: String!
  idVeiculo: Int!
  lastIdPacote: Int
  lastSyncedAt: DateTime!
}
type RequestLogEntry {
  id: ID!
  method: String!
  source: String!
  status: String!
  cacheHit: Boolean!
  latencyMs: Int
  createdAt: DateTime!
  error: String
}

type CaixaPretaEvento {
  id: ID! @deprecated(reason: "Caixa-preta desativada na Sascar v2.07. Use posicoesRecentes.")
  idVeiculo: Int
  placa: String
  dataEvento: DateTime
  latitude: Float
  longitude: Float
  velocidade: Float
}

type Mutation {
  login(email: String!, password: String!): AuthPayload!
  refresh(refreshToken: String!): AuthPayload!
}

type Query {
  clientes(idCliente: Int, quantidade: Int = 1000): [Cliente!]!
  veiculos(idVeiculo: Int, quantidade: Int = 1000): [Veiculo!]!
  motoristas(idMotorista: Int, quantidade: Int = 1000): [Motorista!]!
  rotas(data: String): [Rota!]!
  pontosReferencia: [PontoReferencia!]!

  posicoesRecentes(quantidade: Int = 1000): [Posicao!]!
  posicoesPorVeiculo(idVeiculo: Int!, dataInicio: DateTime!, dataFim: DateTime!): [Posicao!]!
  posicoesPorRange(idInicio: Int!, idFim: Int!, quantidade: Int = 1000): [Posicao!]!

  "DEPRECATED: método 4.51 da Sascar desativado. Use posicoesRecentes."
  caixaPretaEventos(placa: String, idVeiculo: Int): [CaixaPretaEvento!]!

  requestLog(limit: Int = 100, method: String): [RequestLogEntry!]!
  syncStatus: [SyncCursor!]!
}
```

## Fluxo de cache

### Cadastros (clientes, veículos, motoristas, ...)

```
Resolver: clientes(idCliente, quantidade)
   |
   v
1. db.clientes_cache.findAll({ idCliente? })  --->  hits
   |
   v
2. existem hits com expires_at > now() ?
   |SIM  -> retorna + log(status=cache_hit)
   |NAO  -> segue
   |
   v
3. orchestrator.call('obterClientesV2', [quantidade, idCliente])
   |   (passa pela AsyncQueue global)
   v
4. db.clientes_cache.upsert(rows)  +  request_log(status=ok, cache_hit=false)
   |
   v
5. retorna
```

### Posições (com cursor)

```
Resolver: posicoesRecentes(quantidade)
   |
   v
1. db.posicoes.findRecent({ since: now - TTL_POSICAO, limit: quantidade })
   |
   v
2. cobre todos os veiculos conhecidos com data_posicao > (now - TTL)?
   |SIM  -> retorna cache + log(status=cache_hit)
   |NAO  -> segue
   |
   v
3. para cada veiculo faltante (sem dado fresco):
   cursor = sync_cursor.get('obterPacotePosicaoPorRangeJSON', idVeiculo)
   idInicio = (cursor?.lastIdPacote ?? 0) + 1
   rows = orchestrator.call('obterPacotePosicaoPorRangeJSON',
                             [idInicio, Number.MAX_SAFE_INTEGER, 1000])
   db.posicoes.batchInsert(rows, synced_via='graphql')
   se rows.length > 0:
     sync_cursor.upsert(method, idVeiculo, maxId(rows), now)
   |
   v
4. retorna tudo do banco (cache + fresh)
```

## Job de posição a cada 10 minutos

```ts
cron.schedule(process.env.SYNC_POSITIONS_CRON ?? '*/10 * * * *', async () => {
  if (process.env.SYNC_POSITIONS_ENABLED !== 'true') return;
  // 1. para cada veiculo em veiculos_cache:
  //    - idInicio = sync_cursor.last_id_pacote + 1
  //    - rows = orchestrator.call('obterPacotePosicaoPorRangeJSON', [...])
  //    - db.posicoes.batchInsert(rows, synced_via='cron')
  //    - sync_cursor.upsert(...)
  // 2. request_log(method='syncPositions.cron', source='cron')
});
```

**Variáveis de ambiente:**

- `SYNC_POSITIONS_ENABLED` (`true`/`false`, default `false`)
- `SYNC_POSITIONS_CRON` (default `*/10 * * * *`)
- `SYNC_POSITIONS_QUANTITY` (default `1000`)

**Por que não trava a aplicação:**

- `node-cron` libera o event loop entre execuções.
- A `AsyncQueue` global já serializa as chamadas SOAP.
- Graceful shutdown: em `SIGTERM`, `cron.stop()` espera o tick corrente
  (timeout 60s) antes de matar o processo.

## Error handling

```ts
SascarAuthError        -> GraphQLError code=SASCAR_AUTH
SascarRateLimitError   -> GraphQLError code=SASCAR_RATE_LIMIT  (com retryAfter)
SascarTimeoutError     -> GraphQLError code=SASCAR_TIMEOUT
SascarConnectionError  -> GraphQLError code=SASCAR_NETWORK
SascarApiError         -> GraphQLError code=SASCAR_FAULT  (faultstring)
unknown                -> GraphQLError code=INTERNAL
```

- O SDK já faz **retry com exp-backoff** (default 3 tentativas) em
  `SascarConnectionError` / `SascarTimeoutError`.
- Após esgotar retries: logamos em `request_log` com `status=error` e
  propagamos como `GraphQLError` (HTTP 200, mas extensions.code sinaliza).
- `SascarRateLimitError` retorna `retryAfter` (segundos) para o cliente
  GraphQL fazer backoff local.

## Documentação de métodos obsoletos

Estratégia em duas camadas:

### 1. No schema GraphQL (SDL)

A diretiva `@deprecated` aplica-se a **campos** (não a tipos), então marcamos
os campos do tipo `CaixaPretaEvento` e a própria query `caixaPretaEventos`:

```graphql
type CaixaPretaEvento {
  id: ID! @deprecated(reason: "Caixa-preta desativada na Sascar v2.07. Use posicoesRecentes.")
  idVeiculo: Int
  placa: String
  dataEvento: DateTime
  latitude: Float
  longitude: Float
  velocidade: Float
}

type Query {
  caixaPretaEventos(placa: String, idVeiculo: Int): [CaixaPretaEvento!]!
    @deprecated(reason: "Método 4.51 da Sascar está desativado. Use posicoesRecentes.")
}
```

Ferramentas GraphQL (Apollo Studio, GraphiQL, etc.) exibem o aviso automaticamente
em autocomplete e na aba "Schema".

### 2. No `docs/api.md` (gerado)

Tabela fixa:
| Query/Mutation GraphQL | Método SDK | Status Sascar | Substituir por |
|------------------------|------------|---------------|----------------|
| `caixaPretaEventos` | `recuperarEventosCaixaPreta` | Parcial — `solicitar` está desativado | `posicoesRecentes` |
| `caixaPretaEventos` | `solicitarEventosCaixaPreta` | DESATIVADO, sem previsão | sem substituto — não usar |
| — | `obterDeltaTelemetriaIntegracao` | Descontinuado | `obterDeltaTelemetriaIntegracaoInercia` |
| `clientes` | `obterClientes` | Compatibilidade LGPD | `clientesV2` (CNPJ alfanumérico) |

## Variáveis de ambiente (`.env.example`)

```dotenv
# Sascar (single-tenant)
SASCAR_USUARIO=seu_usuario
SASCAR_SENHA=sua_senha
SASCAR_WSDL_URL=https://sasintegra.sascar.com.br/SasIntegra/SasIntegraWSService
SASCAR_TIMEOUT_MS=30000
SASCAR_MAX_RETRIES=3

# API
API_PORT=4000
API_CORS_ORIGINS=http://localhost:3000
JWT_ACCESS_SECRET=change-me-min-32-chars-random
JWT_REFRESH_SECRET=change-me-min-32-chars-random
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
SEED_ADMIN_EMAIL=admin@local
SEED_ADMIN_PASSWORD=change-me

# Cache TTL (ms)
CACHE_CADASTRO_TTL_MS=86400000
CACHE_POSICAO_TTL_MS=300000

# Job
SYNC_POSITIONS_ENABLED=false
SYNC_POSITIONS_CRON=*/10 * * * *
SYNC_POSITIONS_QUANTITY=1000

# Postgres
DATABASE_URL=postgresql://user:pass@localhost:5432/api_orquestrador
```

## Layout do projeto

```
api-orquestrador/
├── src/
│   ├── index.ts                  # bootstrap
│   ├── config.ts                 # zod-validated env
│   ├── server.ts                 # Apollo Server
│   ├── context.ts                # GraphQL context
│   ├── db/
│   │   ├── client.ts             # pg pool + drizzle
│   │   ├── schema.ts             # drizzle schema
│   │   └── migrations/           # SQL versionado
│   ├── auth/
│   │   ├── jwt.ts
│   │   ├── password.ts
│   │   ├── plugin.ts             # requireAuth
│   │   └── resolvers.ts
│   ├── orchestrator/
│   │   ├── SascarOrchestrator.ts # call() + AsyncQueue global
│   │   ├── cache.ts              # cachedQuery<T>()
│   │   └── errors.ts
│   ├── domain/
│   │   ├── clientes.ts
│   │   ├── veiculos.ts
│   │   ├── motoristas.ts
│   │   ├── posicoes.ts
│   │   ├── caixaPreta.ts         # @deprecated wrappers
│   │   └── ...
│   ├── graphql/
│   │   ├── schema.ts             # typeDefs
│   │   └── resolvers.ts
│   ├── jobs/
│   │   ├── cron.ts
│   │   └── syncPositions.ts
│   └── lib/
│       ├── logger.ts             # pino
│       └── shutdown.ts
├── scripts/
│   └── seed-admin.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-06-12-api-orquestrador-sascar-design.md
├── .env.example
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

## Testes

- **Unitários** (jest): cache.ts, errors.ts, jwt.ts, cursor logic em posicoes.ts.
  Mocks do `SascarClient` (já feito no SDK com `nock`).
- **Integração** (jest + supertest + nock): Apollo server contra Postgres de
  teste, mockando respostas SOAP. Cobre fluxo de cache hit/miss e
  mapeamento de erros.
- **E2E** (opcional): docker-compose com Postgres, sobe Apollo, executa
  mutation `login` + query `veiculos` e valida resposta.

## Riscos e trade-offs

| Risco                                              | Mitigação                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| Sascar muda método/estrutura                       | versionamento do schema + `@deprecated` explícito                 |
| Crescimento da tabela `posicoes`                   | partition por mês (estratégia p/ futuro, não na v1)               |
| Credenciais Sascar expostas em log                 | pino redact + nunca log do objeto de credenciais                  |
| `SascarAuthError` em runtime (credenciais erradas) | falhar rápido no startup, health check reporta                    |
| Concorrência entre job e queries GraphQL           | `AsyncQueue` global garante serialização; UNIQUE constraint dedup |
| Caixa-preta nunca mais volta                       | flag `DEPRECATED` clara; tabela fica vazia sem warning            |

## Próximos passos (após aprovação)

1. Implementação começa com scaffold mínimo (package.json, tsconfig, drizzle,
   Apollo Server respondendo "hello world").
2. Adicionar auth (users + JWT + login mutation).
3. Adicionar cache genérico (`cachedQuery`).
4. Implementar cadastros (clientes, veículos, motoristas) como prova de conceito.
5. Implementar posições (com cursor + job).
6. Implementar deprecações (caixa preta + tabela docs).
7. Testes + CI.

## Decisões registradas (para contestação)

- **ORM:** Drizzle escolhido. Prisma aceitável, mas Drizzle é mais leve e o SQL
  gerado é mais transparente.
- **Auth:** JWT + email/senha. API Key rejeitada por falta de auditoria por
  usuário.
- **Job:** `node-cron` in-process. BullMQ + Redis rejeitado por adicionar
  dependência operacional sem necessidade na v1.
- **Multi-tenant:** rejeitado nesta v1. Single-tenant (1 credencial no .env).
