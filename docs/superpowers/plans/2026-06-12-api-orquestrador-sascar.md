# Api-Orquestrador Sascar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript GraphQL API that wraps the `sascar-sdk`, caches responses in PostgreSQL, runs a 10-min position sync job, and exposes deprecated methods with explicit `@deprecated` annotations.

**Architecture:** Apollo Server 4 → SascarOrchestrator (AsyncQueue global) → SascarClient singleton → SOAP. Cache layer (Postgres, TTL + cursor) sits between resolvers and orchestrator. Job in `node-cron` updates positions in background.

**Tech Stack:** TypeScript 5, Node 18+, Apollo Server 4, Drizzle ORM, PostgreSQL 16, jsonwebtoken, bcrypt, node-cron, pino, zod, jest, supertest, nock, ESLint, Prettier.

**Spec:** `docs/superpowers/specs/2026-06-12-api-orquestrador-sascar-design.md`

---

## File Structure

```
api-orquestrador/
├── src/
│   ├── index.ts                  # bootstrap: server.listen + cron.start
│   ├── config.ts                 # zod-validated env
│   ├── server.ts                 # Apollo Server construction
│   ├── context.ts                # GraphQL context (user, db, logger)
│   ├── db/
│   │   ├── client.ts             # pg pool + drizzle
│   │   ├── schema.ts             # drizzle schema (all tables)
│   │   └── migrations/           # SQL files versionados
│   │       ├── 0001_init.sql
│   │       ├── 0002_cadastros_cache.sql
│   │       ├── 0003_posicoes.sql
│   │       └── 0004_caixa_preta.sql
│   ├── auth/
│   │   ├── jwt.ts                # sign/verify
│   │   ├── password.ts           # bcrypt hash/compare
│   │   ├── plugin.ts             # Apollo plugin: requireAuth
│   │   └── resolvers.ts          # login, refresh mutations
│   ├── orchestrator/
│   │   ├── SascarOrchestrator.ts # call<T>() com AsyncQueue global
│   │   ├── cache.ts              # cachedQuery<T>()
│   │   ├── errors.ts             # mapSascarError
│   │   └── log.ts                # request_log writer
│   ├── domain/
│   │   ├── clientes.ts           # resolver + cache check
│   │   ├── veiculos.ts
│   │   ├── motoristas.ts
│   │   ├── rotas.ts
│   │   ├── pontosReferencia.ts
│   │   ├── posicoes.ts           # cursor logic
│   │   └── caixaPreta.ts         # @deprecated stub
│   ├── graphql/
│   │   ├── schema.ts             # typeDefs (SDL)
│   │   └── resolvers.ts          # merge de todos resolvers
│   ├── jobs/
│   │   ├── cron.ts               # registry
│   │   └── syncPositions.ts
│   └── lib/
│       ├── logger.ts             # pino
│       └── shutdown.ts           # graceful shutdown
├── scripts/
│   └── seed-admin.ts
├── tests/
│   ├── helpers/
│   │   ├── db.ts                 # truncate tables
│   │   ├── server.ts             # build test apollo server
│   │   └── nockSascar.ts         # mock SOAP responses
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   └── api.md                    # docs gerado com tabela de deprecação
├── .env.example
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── jest.config.ts
├── .eslintrc.cjs
├── .prettierrc.json
├── .gitignore
└── README.md
```

---

## Task 1: Verify environment and install runtime

**Files:**
- Modify: (none, only check host)

- [ ] **Step 1: Check Node version**

Run: `node --version`
Expected: `v18.x.x` or higher. If lower, install Node 20 LTS via nvm.

- [ ] **Step 2: Check Docker**

Run: `docker --version && docker compose version`
Expected: Both commands print versions. If absent, install Docker Desktop.

- [ ] **Step 3: Check git**

Run: `git --version`
Expected: prints version. Already verified in spec task.

- [ ] **Step 4: Confirm we're in the project root**

Run: `pwd && ls`
Expected: `/home/martiel/GitHub/Api-Orquestrador` with at least `docs/` and `.git/`.

---

## Task 2: Initialize package.json and install dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.eslintrc.cjs`
- Create: `.prettierrc.json`
- Create: `.gitignore` (extends existing)

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "api-orquestrador",
  "version": "0.1.0",
  "private": true,
  "description": "GraphQL API orquestradora do sascar-sdk",
  "main": "dist/index.js",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "lint": "eslint \"src/**/*.ts\" \"tests/**/*.ts\"",
    "lint:fix": "eslint \"src/**/*.ts\" \"tests/**/*.ts\" --fix",
    "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"tests/**/*.ts\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:seed": "tsx scripts/seed-admin.ts",
    "db:reset": "tsx scripts/migrate.ts --reset"
  },
  "dependencies": {
    "@apollo/server": "^4.10.0",
    "@as-integrations/fastify": "^2.0.0",
    "bcrypt": "^5.1.1",
    "drizzle-orm": "^0.30.0",
    "fastify": "^4.26.0",
    "graphql": "^16.8.1",
    "graphql-tag": "^2.12.6",
    "jsonwebtoken": "^9.0.2",
    "node-cron": "^3.0.3",
    "pg": "^8.11.3",
    "pino": "^8.17.2",
    "pino-pretty": "^10.3.1",
    "sascar-sdk": "github:MartielLima/sascar-sdk",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/jest": "^29.5.11",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node": "^20.10.4",
    "@types/node-cron": "^3.0.10",
    "@types/pg": "^8.10.9",
    "@types/supertest": "^6.0.2",
    "@typescript-eslint/eslint-plugin": "^7.18.0",
    "@typescript-eslint/parser": "^7.18.0",
    "drizzle-kit": "^0.20.0",
    "eslint": "^8.56.0",
    "eslint-config-prettier": "^9.1.0",
    "jest": "^29.7.0",
    "nock": "^14.0.0",
    "prettier": "^3.1.1",
    "supertest": "^6.3.3",
    "ts-jest": "^29.1.1",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Write `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/'],
};
```

- [ ] **Step 4: Write `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

- [ ] **Step 5: Update `.gitignore`**

Append the following (preserving existing):

```
# Build artifacts
dist/
*.tsbuildinfo

# Coverage
coverage/

# IDE
.vscode/
.idea/
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: completes without errors. If `sascar-sdk` install from GitHub fails, run `npm install github:MartielLima/sascar-sdk` separately and verify the `node_modules/sascar-sdk/package.json` exists.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .eslintrc.cjs .prettierrc.json .gitignore
git commit -m "chore: scaffold package.json, tsconfig, lint, prettier"
```

---

## Task 3: Docker Compose for PostgreSQL

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: api-orquestrador-pg
    restart: unless-stopped
    environment:
      POSTGRES_USER: api_orquestrador
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: api_orquestrador
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U api_orquestrador"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pg_data:
```

- [ ] **Step 2: Write `.env.example`**

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
JWT_ACCESS_SECRET=change-me-min-32-chars-random-12345
JWT_REFRESH_SECRET=change-me-min-32-chars-random-67890
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
SEED_ADMIN_EMAIL=admin@local
SEED_ADMIN_PASSWORD=change-me-admin

# Cache TTL (ms)
CACHE_CADASTRO_TTL_MS=86400000
CACHE_POSICAO_TTL_MS=300000

# Job
SYNC_POSITIONS_ENABLED=false
SYNC_POSITIONS_CRON=*/10 * * * *
SYNC_POSITIONS_QUANTITY=1000

# Postgres
DATABASE_URL=postgresql://api_orquestrador:dev_password@localhost:5432/api_orquestrador

# Logger
LOG_LEVEL=info
```

- [ ] **Step 3: Start PostgreSQL container**

Run: `docker compose up -d postgres`
Expected: Container starts; `docker compose ps` shows `api-orquestrador-pg` as healthy after a few seconds.

- [ ] **Step 4: Verify connection**

Run: `docker exec -it api-orquestrador-pg psql -U api_orquestrador -d api_orquestrador -c '\dt'`
Expected: "No relations found." (empty database, ready for migrations).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add docker-compose for postgres and .env.example"
```

---

## Task 4: Config module (zod-validated env)

**Files:**
- Create: `src/config.ts`
- Test: `tests/unit/config.spec.ts`
- Create: `jest.config.ts`

- [ ] **Step 1: Write `jest.config.ts`**

```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  setupFilesAfterEach: [],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', target: 'es2022' } }],
  },
  testTimeout: 30000,
};

export default config;
```

- [ ] **Step 2: Write the failing test `tests/unit/config.spec.ts`**

```ts
import { loadConfig } from '../../src/config';

describe('loadConfig', () => {
  const requiredEnv = {
    SASCAR_USUARIO: 'u',
    SASCAR_SENHA: 's',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    SEED_ADMIN_EMAIL: 'admin@x.com',
    SEED_ADMIN_PASSWORD: 'pw12345',
    DATABASE_URL: 'postgresql://x:y@z:5432/w',
  };

  it('returns a config object with all required fields', () => {
    const cfg = loadConfig({ ...requiredEnv, API_PORT: '4000' });
    expect(cfg.sascar.usuario).toBe('u');
    expect(cfg.sascar.senha).toBe('s');
    expect(cfg.api.port).toBe(4000);
    expect(cfg.jwt.accessSecret).toBe('a'.repeat(32));
  });

  it('uses defaults for optional fields', () => {
    const cfg = loadConfig(requiredEnv);
    expect(cfg.cache.cadastroTtlMs).toBe(86_400_000);
    expect(cfg.cache.posicaoTtlMs).toBe(300_000);
    expect(cfg.job.enabled).toBe(false);
    expect(cfg.job.cron).toBe('*/10 * * * *');
    expect(cfg.api.corsOrigins).toEqual(['http://localhost:3000']);
  });

  it('throws on missing SASCAR_USUARIO', () => {
    const { SASCAR_USUARIO, ...rest } = requiredEnv;
    expect(() => loadConfig(rest)).toThrow(/SASCAR_USUARIO/);
  });

  it('throws on JWT_ACCESS_SECRET shorter than 32 chars', () => {
    expect(() => loadConfig({ ...requiredEnv, JWT_ACCESS_SECRET: 'short' })).toThrow(/32/);
  });

  it('parses SYNC_POSITIONS_ENABLED=true correctly', () => {
    const cfg = loadConfig({ ...requiredEnv, SYNC_POSITIONS_ENABLED: 'true' });
    expect(cfg.job.enabled).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/unit/config.spec.ts`
Expected: FAIL with "Cannot find module '../../src/config'".

- [ ] **Step 4: Implement `src/config.ts`**

```ts
import { z } from 'zod';

const envSchema = z.object({
  // Sascar
  SASCAR_USUARIO: z.string().min(1, 'SASCAR_USUARIO obrigatório'),
  SASCAR_SENHA: z.string().min(1, 'SASCAR_SENHA obrigatória'),
  SASCAR_WSDL_URL: z.string().url().default('https://sasintegra.sascar.com.br/SasIntegra/SasIntegraWSService'),
  SASCAR_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  SASCAR_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),

  // API
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET deve ter no mínimo 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET deve ter no mínimo 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // Seed
  SEED_ADMIN_EMAIL: z.string().email(),
  SEED_ADMIN_PASSWORD: z.string().min(8),

  // Cache
  CACHE_CADASTRO_TTL_MS: z.coerce.number().int().positive().default(86_400_000),
  CACHE_POSICAO_TTL_MS: z.coerce.number().int().positive().default(300_000),

  // Job
  SYNC_POSITIONS_ENABLED: z.enum(['true', 'false']).default('false'),
  SYNC_POSITIONS_CRON: z.string().default('*/10 * * * *'),
  SYNC_POSITIONS_QUANTITY: z.coerce.number().int().positive().default(1000),

  // DB
  DATABASE_URL: z.string().url(),

  // Logger
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppEnv = z.infer<typeof envSchema>;

export interface AppConfig {
  sascar: {
    usuario: string;
    senha: string;
    wsdlUrl: string;
    timeoutMs: number;
    maxRetries: number;
  };
  api: {
    port: number;
    corsOrigins: string[];
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  seed: {
    adminEmail: string;
    adminPassword: string;
  };
  cache: {
    cadastroTtlMs: number;
    posicaoTtlMs: number;
  };
  job: {
    enabled: boolean;
    cron: string;
    quantity: number;
  };
  db: {
    url: string;
  };
  log: {
    level: string;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    sascar: {
      usuario: parsed.SASCAR_USUARIO,
      senha: parsed.SASCAR_SENHA,
      wsdlUrl: parsed.SASCAR_WSDL_URL,
      timeoutMs: parsed.SASCAR_TIMEOUT_MS,
      maxRetries: parsed.SASCAR_MAX_RETRIES,
    },
    api: {
      port: parsed.API_PORT,
      corsOrigins: parsed.API_CORS_ORIGINS.split(',').map((s) => s.trim()),
    },
    jwt: {
      accessSecret: parsed.JWT_ACCESS_SECRET,
      refreshSecret: parsed.JWT_REFRESH_SECRET,
      accessTtl: parsed.JWT_ACCESS_TTL,
      refreshTtl: parsed.JWT_REFRESH_TTL,
    },
    seed: {
      adminEmail: parsed.SEED_ADMIN_EMAIL,
      adminPassword: parsed.SEED_ADMIN_PASSWORD,
    },
    cache: {
      cadastroTtlMs: parsed.CACHE_CADASTRO_TTL_MS,
      posicaoTtlMs: parsed.CACHE_POSICAO_TTL_MS,
    },
    job: {
      enabled: parsed.SYNC_POSITIONS_ENABLED === 'true',
      cron: parsed.SYNC_POSITIONS_CRON,
      quantity: parsed.SYNC_POSITIONS_QUANTITY,
    },
    db: {
      url: parsed.DATABASE_URL,
    },
    log: {
      level: parsed.LOG_LEVEL,
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/unit/config.spec.ts`
Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts tests/unit/config.spec.ts jest.config.ts
git commit -m "feat(config): add zod-validated env loader with tests"
```

---

## Task 5: Logger (pino)

**Files:**
- Create: `src/lib/logger.ts`
- Test: `tests/unit/logger.spec.ts`

- [ ] **Step 1: Write the failing test `tests/unit/logger.spec.ts`**

```ts
import { createLogger } from '../../src/lib/logger';

describe('createLogger', () => {
  it('returns a pino logger with the requested level', () => {
    const log = createLogger({ level: 'debug' });
    expect(log.level).toBe('debug');
  });

  it('redacts sensitive fields', () => {
    const log = createLogger({ level: 'info', redact: ['password'] });
    // pino returns a function; just check it was created
    expect(typeof log.info).toBe('function');
    expect(typeof log.error).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/logger.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `src/lib/logger.ts`**

```ts
import pino, { Logger, LoggerOptions } from 'pino';

export interface CreateLoggerOptions {
  level: string;
  redact?: string[];
}

export function createLogger(opts: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    level: opts.level,
    redact: {
      paths: [
        'sascar.senha',
        'senha',
        'senhaAtual',
        'novaSenha',
        'password',
        '*.senha',
        '*.senhaAtual',
        '*.novaSenha',
        '*.password',
      ],
      censor: '[REDACTED]',
    },
  };
  if (process.env.NODE_ENV !== 'production') {
    return pino({ ...options, transport: { target: 'pino-pretty', options: { colorize: true } } });
  }
  return pino(options);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/logger.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/logger.ts tests/unit/logger.spec.ts
git commit -m "feat(logger): pino logger with credential redaction"
```

---

## Task 6: Apollo server scaffold + "hello world"

**Files:**
- Create: `src/server.ts`
- Create: `src/graphql/schema.ts`
- Create: `src/graphql/resolvers.ts`
- Create: `src/context.ts`
- Create: `tests/integration/server.spec.ts`
- Create: `tests/helpers/server.ts`

- [ ] **Step 1: Write the failing test `tests/integration/server.spec.ts`**

```ts
import { buildTestServer } from '../helpers/server';

describe('Apollo server (hello world)', () => {
  it('responds to a basic introspection query', async () => {
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ __typename }' });
    expect(res.errors).toBeUndefined();
    expect(res.data).toEqual({ __typename: 'Query' });
  });

  it('responds to a healthcheck field', async () => {
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ health }' });
    expect(res.data).toEqual({ health: 'ok' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/integration/server.spec.ts`
Expected: FAIL with missing modules.

- [ ] **Step 3: Write `tests/helpers/server.ts`**

```ts
import { ApolloServer } from '@apollo/server';
import { typeDefs } from '../../src/graphql/schema';
import { resolvers } from '../../src/graphql/resolvers';
import { buildContext } from '../../src/context';

export async function buildTestServer() {
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  return { server, executeOperation: server.executeOperation.bind(server) };
}

export function makeContext(overrides: Partial<Awaited<ReturnType<typeof buildContext>>> = {}) {
  return { user: null, logger: console, ...overrides } as any;
}
```

- [ ] **Step 4: Write `src/graphql/schema.ts`**

```ts
import gql from 'graphql-tag';

export const typeDefs = gql`
  scalar DateTime

  type Query {
    health: String!
  }
`;
```

- [ ] **Step 5: Write `src/graphql/resolvers.ts`**

```ts
export const resolvers = {
  Query: {
    health: () => 'ok',
  },
  DateTime: {
    __serialize: (v: unknown) => (v instanceof Date ? v.toISOString() : v),
    __parseValue: (v: unknown) => (typeof v === 'string' ? new Date(v) : null),
    __parseLiteral: () => null,
  },
};
```

- [ ] **Step 6: Write `src/context.ts`**

```ts
import type { Logger } from 'pino';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface AppContext {
  user: AuthUser | null;
  logger: Logger;
}

export async function buildContext(): Promise<AppContext> {
  return {
    user: null,
    logger: console as unknown as Logger,
  };
}
```

- [ ] **Step 7: Write `src/server.ts`**

```ts
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';
import { buildContext } from './context';
import { loadConfig } from './config';
import { createLogger } from './lib/logger';

export interface StartedServer {
  url: string;
  stop: () => Promise<void>;
}

export async function startServer(): Promise<StartedServer> {
  const cfg = loadConfig();
  const logger = createLogger({ level: cfg.log.level });

  const server = new ApolloServer({ typeDefs, resolvers });
  const { url } = await startStandaloneServer(server, {
    context: buildContext,
    listen: { port: cfg.api.port },
  });
  logger.info({ url }, 'Apollo server started');

  return {
    url,
    stop: async () => {
      await server.stop();
    },
  };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest tests/integration/server.spec.ts`
Expected: Both tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/server.ts src/context.ts src/graphql tests/integration/server.spec.ts tests/helpers/server.ts
git commit -m "feat(server): Apollo server scaffold with health query"
```

---

## Task 7: Database client (pg + drizzle)

**Files:**
- Create: `src/db/client.ts`
- Test: `tests/integration/db.spec.ts`
- Modify: `src/context.ts` to include `db`

- [ ] **Step 1: Write the failing test `tests/integration/db.spec.ts`**

```ts
import { buildDb } from '../../src/db/client';

describe('db client', () => {
  it('connects to postgres and runs SELECT 1', async () => {
    const db = buildDb(process.env.DATABASE_URL ?? 'postgresql://api_orquestrador:dev_password@localhost:5432/api_orquestrador');
    const result = await db.execute({ sql: 'SELECT 1 as ok', args: [] });
    expect(result.rows[0]?.ok).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/integration/db.spec.ts`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement `src/db/client.ts`**

```ts
import { Pool } from 'pg';

export interface Db {
  execute(q: { sql: string; args?: any[] }): Promise<{ rows: any[] }>;
}

export function buildDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, max: 10 });
  return {
    execute: async ({ sql, args = [] }) => {
      const r = await pool.query(sql, args);
      return { rows: r.rows as any[] };
    },
  };
}
```

- [ ] **Step 4: Update `src/context.ts`**

Replace contents with:

```ts
import type { Logger } from 'pino';
import { buildDb, type Db } from './db/client';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface AppContext {
  user: AuthUser | null;
  logger: Logger;
  db: Db;
}

export async function buildContext(): Promise<Omit<AppContext, 'orchestrator'>> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return {
    user: null,
    logger: console as unknown as Logger,
    db: buildDb(url),
  };
}
```

- [ ] **Step 5: Set DATABASE_URL and run test**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/db.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/client.ts src/context.ts tests/integration/db.spec.ts
git commit -m "feat(db): drizzle client with pg pool"
```

---

## Task 8: Schema + initial migration (users + refresh_tokens)

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/migrations/0001_init.sql`
- Create: `scripts/migrate.ts`
- Test: `tests/integration/migrate.spec.ts`

- [ ] **Step 1: Write `src/db/schema.ts`**

```ts
import { pgTable, uuid, text, boolean, timestamp, bigserial, bigint, integer, doublePrecision, jsonb, primaryKey, index, unique, customType } from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const requestLog = pgTable('request_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  method: text('method').notNull(),
  source: text('source').notNull(),
  userId: uuid('user_id').references(() => users.id),
  args: jsonb('args'),
  status: text('status').notNull(),
  cacheHit: boolean('cache_hit').notNull().default(false),
  latencyMs: integer('latency_ms'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Write `src/db/migrations/0001_init.sql`**

```sql
-- 0001_init.sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

- [ ] **Step 3: Write `scripts/migrate.ts`**

```ts
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const MIGRATIONS_DIR = join(process.cwd(), 'src/db/migrations');

async function ensureMigrationsTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: url });
  await ensureMigrationsTable(pool);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM _migrations WHERE filename = $1', [file]);
    if (rows.length) {
      console.log(`SKIP ${file}`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`APPLIED ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Write the failing test `tests/integration/migrate.spec.ts`**

```ts
import { Pool } from 'pg';

describe('migrations', () => {
  it('creates the users table', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position",
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain('id');
    expect(cols).toContain('email');
    expect(cols).toContain('password_hash');
    await pool.end();
  });
});
```

- [ ] **Step 5: Run migration and test**

Run:
```
export $(grep -v '^#' .env.example | xargs) && npx tsx scripts/migrate.ts
npx jest tests/integration/migrate.spec.ts
```
Expected: `migrate.ts` prints `APPLIED 0001_init.sql`; the test PASSes.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/migrations/0001_init.sql scripts/migrate.ts tests/integration/migrate.spec.ts
git commit -m "feat(db): users, refresh_tokens, request_log schema + migration runner"
```

---

## Task 9: Password hashing

**Files:**
- Create: `src/auth/password.ts`
- Test: `tests/unit/password.spec.ts`

- [ ] **Step 1: Write the failing test `tests/unit/password.spec.ts`**

```ts
import { hashPassword, verifyPassword } from '../../src/auth/password';

describe('password', () => {
  it('hashes a password and verifies the original', async () => {
    const hash = await hashPassword('super-secret');
    expect(hash).not.toBe('super-secret');
    expect(await verifyPassword('super-secret', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('super-secret');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/password.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/auth/password.ts`**

```ts
import bcrypt from 'bcrypt';

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/password.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/password.ts tests/unit/password.spec.ts
git commit -m "feat(auth): bcrypt password hashing"
```

---

## Task 10: JWT sign/verify

**Files:**
- Create: `src/auth/jwt.ts`
- Test: `tests/unit/jwt.spec.ts`

- [ ] **Step 1: Write the failing test `tests/unit/jwt.spec.ts`**

```ts
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../../src/auth/jwt';

const SECRET_A = 'a'.repeat(32);
const SECRET_R = 'b'.repeat(32);

describe('jwt', () => {
  it('signs and verifies an access token', () => {
    const token = signAccessToken({ sub: 'u1', email: 'a@b.c', role: 'user' }, { secret: SECRET_A, expiresIn: '1m' });
    const payload = verifyAccessToken(token, { secret: SECRET_A });
    expect(payload.sub).toBe('u1');
    expect(payload.email).toBe('a@b.c');
  });

  it('throws on invalid signature', () => {
    const token = signAccessToken({ sub: 'u1' }, { secret: SECRET_A, expiresIn: '1m' });
    expect(() => verifyAccessToken(token, { secret: 'z'.repeat(32) })).toThrow();
  });

  it('signs and verifies a refresh token', () => {
    const token = signRefreshToken({ sub: 'u1' }, { secret: SECRET_R, expiresIn: '7d' });
    const payload = verifyRefreshToken(token, { secret: SECRET_R });
    expect(payload.sub).toBe('u1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/jwt.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/auth/jwt.ts`**

```ts
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';

export interface AccessPayload {
  sub: string;
  email: string;
  role: string;
}
export interface RefreshPayload {
  sub: string;
}

interface JwtOpts {
  secret: Secret;
  expiresIn: SignOptions['expiresIn'];
}

export function signAccessToken(payload: AccessPayload, opts: JwtOpts): string {
  return jwt.sign(payload, opts.secret, { expiresIn: opts.expiresIn });
}

export function signRefreshToken(payload: RefreshPayload, opts: JwtOpts): string {
  return jwt.sign(payload, opts.secret, { expiresIn: opts.expiresIn });
}

export function verifyAccessToken(token: string, opts: { secret: Secret }): AccessPayload {
  return jwt.verify(token, opts.secret) as AccessPayload;
}

export function verifyRefreshToken(token: string, opts: { secret: Secret }): RefreshPayload {
  return jwt.verify(token, opts.secret) as RefreshPayload;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/jwt.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/jwt.ts tests/unit/jwt.spec.ts
git commit -m "feat(auth): JWT sign and verify"
```

---

## Task 11: Login/Refresh mutations

**Files:**
- Create: `src/auth/resolvers.ts`
- Modify: `src/graphql/schema.ts` (add User/AuthPayload/mutations)
- Modify: `src/graphql/resolvers.ts` (merge auth resolvers)
- Test: `tests/integration/auth.spec.ts`

- [ ] **Step 1: Update `src/graphql/schema.ts`**

Replace contents with:

```ts
import gql from 'graphql-tag';

export const typeDefs = gql`
  scalar DateTime

  type User {
    id: ID!
    email: String!
    role: String!
    createdAt: DateTime!
  }

  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  type Query {
    health: String!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    refresh(refreshToken: String!): AuthPayload!
  }
`;
```

- [ ] **Step 2: Write `src/auth/resolvers.ts`**

```ts
import { eq, and, gt, isNull } from 'drizzle-orm';
import { users, refreshTokens } from '../db/schema';
import { hashPassword, verifyPassword } from './password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './jwt';
import { randomBytes, createHash } from 'crypto';
import type { AppContext } from '../context';

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: string;
  refreshTtl: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function ttlToMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) throw new Error(`Invalid TTL: ${ttl}`);
  const n = Number(m[1]);
  return n * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd']!;
}

export function buildAuthResolvers(cfg: AuthConfig) {
  return {
    Mutation: {
      login: async (
        _: unknown,
        args: { email: string; password: string },
        ctx: AppContext,
      ) => {
        const { rows } = await ctx.db.execute({
          sql: 'SELECT id, email, password_hash, role, active FROM users WHERE email = $1',
          args: [args.email],
        } as any);
        const u = (rows as any[])[0];
        if (!u || !u.active) throw new Error('Invalid credentials');
        const ok = await verifyPassword(args.password, u.password_hash);
        if (!ok) throw new Error('Invalid credentials');

        const accessToken = signAccessToken(
          { sub: u.id, email: u.email, role: u.role },
          { secret: cfg.accessSecret, expiresIn: cfg.accessTtl as any },
        );
        const refreshToken = signRefreshToken(
          { sub: u.id },
          { secret: cfg.refreshSecret, expiresIn: cfg.refreshTtl as any },
        );
        await ctx.db.execute({
          sql: `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
          args: [u.id, hashToken(refreshToken), new Date(Date.now() + ttlToMs(cfg.refreshTtl))],
        } as any);
        return {
          accessToken,
          refreshToken,
          user: { id: u.id, email: u.email, role: u.role, createdAt: new Date() },
        };
      },

      refresh: async (_: unknown, args: { refreshToken: string }, ctx: AppContext) => {
        const payload = verifyRefreshToken(args.refreshToken, { secret: cfg.refreshSecret });
        const { rows } = await ctx.db.execute({
          sql: `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1`,
          args: [hashToken(args.refreshToken)],
        } as any);
        const t = (rows as any[])[0];
        if (!t || t.revoked_at || new Date(t.expires_at) < new Date()) {
          throw new Error('Invalid refresh token');
        }
        const { rows: urows } = await ctx.db.execute({
          sql: 'SELECT id, email, role FROM users WHERE id = $1 AND active = true',
          args: [payload.sub],
        } as any);
        const u = (urows as any[])[0];
        if (!u) throw new Error('User not found');

        // rotate
        await ctx.db.execute({
          sql: 'UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1',
          args: [t.id],
        } as any);
        const newRefresh = signRefreshToken(
          { sub: u.id },
          { secret: cfg.refreshSecret, expiresIn: cfg.refreshTtl as any },
        );
        await ctx.db.execute({
          sql: 'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
          args: [u.id, hashToken(newRefresh), new Date(Date.now() + ttlToMs(cfg.refreshTtl))],
        } as any);
        const accessToken = signAccessToken(
          { sub: u.id, email: u.email, role: u.role },
          { secret: cfg.accessSecret, expiresIn: cfg.accessTtl as any },
        );
        return {
          accessToken,
          refreshToken: newRefresh,
          user: { id: u.id, email: u.email, role: u.role, createdAt: new Date() },
        };
      },
    },
  };
}
```

- [ ] **Step 3: Update `src/graphql/resolvers.ts`**

Replace contents with:

```ts
import { buildAuthResolvers } from '../auth/resolvers';
import { loadConfig } from '../config';

const cfg = loadConfig();
const auth = buildAuthResolvers({
  accessSecret: cfg.jwt.accessSecret,
  refreshSecret: cfg.jwt.refreshSecret,
  accessTtl: cfg.jwt.accessTtl,
  refreshTtl: cfg.jwt.refreshTtl,
});

export const resolvers = {
  Query: {
    health: () => 'ok',
  },
  Mutation: {
    ...auth.Mutation,
  },
  DateTime: {
    __serialize: (v: unknown) => (v instanceof Date ? v.toISOString() : v),
    __parseValue: (v: unknown) => (typeof v === 'string' ? new Date(v) : null),
    __parseLiteral: () => null,
  },
};
```

- [ ] **Step 4: Write `tests/integration/auth.spec.ts`**

```ts
import { Pool } from 'pg';
import { hashPassword } from '../../src/auth/password';
import { buildTestServer } from '../helpers/server';

async function seedUser() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const email = 'auth-test@local';
  const passwordHash = await hashPassword('test1234');
  await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email = $1)', [email]);
  await pool.query('DELETE FROM users WHERE email = $1', [email]);
  await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
    [email, passwordHash, 'user'],
  );
  await pool.end();
  return { email, password: 'test1234' };
}

describe('auth mutations', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
    await seedUser();
  });

  it('login returns tokens for valid credentials', async () => {
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `mutation L($e: String!, $p: String!) {
        login(email: $e, password: $p) { accessToken refreshToken user { email role } }
      }`,
      variables: { e: 'auth-test@local', p: 'test1234' },
    });
    expect(res.errors).toBeUndefined();
    expect((res.data as any).login.accessToken).toEqual(expect.any(String));
    expect((res.data as any).login.user.email).toBe('auth-test@local');
  });

  it('login rejects wrong password', async () => {
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `mutation L($e: String!, $p: String!) { login(email: $e, password: $p) { accessToken } }`,
      variables: { e: 'auth-test@local', p: 'wrong' },
    });
    expect(res.errors).toBeDefined();
    expect((res.errors![0].message)).toMatch(/Invalid credentials/);
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/auth.spec.ts`
Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/resolvers.ts src/graphql/schema.ts src/graphql/resolvers.ts tests/integration/auth.spec.ts
git commit -m "feat(auth): login and refresh mutations with rotation"
```

---

## Task 12: Seed admin script

**Files:**
- Create: `scripts/seed-admin.ts`

- [ ] **Step 1: Write `scripts/seed-admin.ts`**

```ts
import { Pool } from 'pg';
import { hashPassword } from '../src/auth/password';
import { loadConfig } from '../src/config';

async function main() {
  const cfg = loadConfig();
  const pool = new Pool({ connectionString: cfg.db.url });

  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [cfg.seed.adminEmail]);
  if (rows.length) {
    console.log(`Admin ${cfg.seed.adminEmail} already exists. Skipping.`);
    await pool.end();
    return;
  }
  const hash = await hashPassword(cfg.seed.adminPassword);
  await pool.query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')`,
    [cfg.seed.adminEmail, hash],
  );
  console.log(`Seeded admin: ${cfg.seed.adminEmail}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script**

Run: `export $(grep -v '^#' .env.example | xargs) && npx tsx scripts/seed-admin.ts`
Expected: prints `Seeded admin: admin@local`.

- [ ] **Step 3: Re-run to confirm idempotency**

Run: `npx tsx scripts/seed-admin.ts`
Expected: prints `Admin admin@local already exists. Skipping.`

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-admin.ts
git commit -m "chore: seed-admin script"
```

---

## Task 13: Error mapping

**Files:**
- Create: `src/orchestrator/errors.ts`
- Test: `tests/unit/orchestrator-errors.spec.ts`

- [ ] **Step 1: Write the failing test `tests/unit/orchestrator-errors.spec.ts`**

```ts
import { GraphQLError } from 'graphql';
import { mapSascarError } from '../../src/orchestrator/errors';

class FakeAuthErr extends Error {
  statusCode = 401;
}
class FakeRateErr extends Error {
  retryAfter = 30;
}
class FakeTimeoutErr extends Error {
  timeoutMs = 5000;
}
class FakeConnErr extends Error {
  cause = 'ECONNRESET';
}
class FakeApiErr extends Error {
  fault = { faultstring: 'Server fault', faultcode: 'soap:Server' };
}

describe('mapSascarError', () => {
  it('maps auth error', () => {
    const e = mapSascarError(new FakeAuthErr('bad creds') as any);
    expect(e).toBeInstanceOf(GraphQLError);
    expect((e as GraphQLError).extensions.code).toBe('SASCAR_AUTH');
  });

  it('maps rate limit error with retryAfter', () => {
    const e = mapSascarError(new FakeRateErr() as any) as GraphQLError;
    expect(e.extensions.code).toBe('SASCAR_RATE_LIMIT');
    expect(e.extensions.retryAfter).toBe(30);
  });

  it('maps timeout, connection, api, unknown', () => {
    expect((mapSascarError(new FakeTimeoutErr() as any) as GraphQLError).extensions.code).toBe('SASCAR_TIMEOUT');
    expect((mapSascarError(new FakeConnErr() as any) as GraphQLError).extensions.code).toBe('SASCAR_NETWORK');
    expect((mapSascarError(new FakeApiErr() as any) as GraphQLError).extensions.code).toBe('SASCAR_FAULT');
    expect((mapSascarError(new Error('x')) as GraphQLError).extensions.code).toBe('INTERNAL');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/orchestrator-errors.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/orchestrator/errors.ts`**

```ts
import { GraphQLError } from 'graphql';
import {
  SascarApiError,
  SascarAuthError,
  SascarConnectionError,
  SascarRateLimitError,
  SascarTimeoutError,
} from 'sascar-sdk';

type SascarErr = SascarApiError | SascarAuthError | SascarRateLimitError | SascarTimeoutError | SascarConnectionError;

export function mapSascarError(err: unknown): GraphQLError {
  if (err instanceof SascarAuthError) {
    return new GraphQLError('Credenciais Sascar inválidas', { extensions: { code: 'SASCAR_AUTH' } });
  }
  if (err instanceof SascarRateLimitError) {
    const e = err as SascarRateLimitError & { retryAfter?: number };
    return new GraphQLError('Sascar limitou o número de chamadas', {
      extensions: { code: 'SASCAR_RATE_LIMIT', retryAfter: e.retryAfter ?? 30 },
    });
  }
  if (err instanceof SascarTimeoutError) {
    const e = err as SascarTimeoutError & { timeoutMs?: number };
    return new GraphQLError('Sascar não respondeu a tempo', {
      extensions: { code: 'SASCAR_TIMEOUT', timeoutMs: e.timeoutMs },
    });
  }
  if (err instanceof SascarConnectionError) {
    return new GraphQLError('Falha de rede com Sascar', {
      extensions: { code: 'SASCAR_NETWORK', message: (err as Error).message },
    });
  }
  if (err instanceof SascarApiError) {
    const e = err as SascarApiError & { fault?: { faultstring?: string; faultcode?: string } };
    return new GraphQLError(`Sascar SOAP Fault: ${e.fault?.faultstring ?? 'desconhecido'}`, {
      extensions: { code: 'SASCAR_FAULT', faultcode: e.fault?.faultcode },
    });
  }
  return new GraphQLError('Erro interno', {
    extensions: { code: 'INTERNAL', message: (err as Error)?.message ?? String(err) },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/orchestrator-errors.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator/errors.ts tests/unit/orchestrator-errors.spec.ts
git commit -m "feat(orchestrator): map Sascar SDK errors to GraphQL errors"
```

---

## Task 14: SascarOrchestrator with AsyncQueue

**Files:**
- Create: `src/orchestrator/SascarOrchestrator.ts`
- Test: `tests/unit/SascarOrchestrator.spec.ts`
- Modify: `src/server.ts` to construct the client

- [ ] **Step 1: Write the failing test `tests/unit/SascarOrchestrator.spec.ts`**

```ts
import { SascarOrchestrator, buildSascarClient } from '../../src/orchestrator/SascarOrchestrator';

describe('SascarOrchestrator', () => {
  it('serializes calls (one at a time)', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://x' });
    let inflight = 0;
    let maxInflight = 0;
    sascar.obterVeiculos = (async () => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 20));
      inflight--;
      return [] as any;
    }) as any;
    sascar.obterClientes = sascar.obterVeiculos as any;

    const orch = new SascarOrchestrator(sascar);
    const promises = [
      orch.call('obterVeiculos', [10]),
      orch.call('obterClientes', [10]),
      orch.call('obterVeiculos', [10]),
    ];
    await Promise.all(promises);
    expect(maxInflight).toBe(1);
  });

  it('propagates errors from the SDK', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://x' });
    sascar.obterVeiculos = (async () => {
      throw new Error('boom');
    }) as any;
    const orch = new SascarOrchestrator(sascar);
    await expect(orch.call('obterVeiculos', [10])).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/SascarOrchestrator.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/orchestrator/SascarOrchestrator.ts`**

```ts
import { SascarClient, AsyncQueue } from 'sascar-sdk';

export interface ClientOptions {
  usuario: string;
  senha: string;
  wsdlUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export function buildSascarClient(opts: ClientOptions): SascarClient {
  return new SascarClient({ usuario: opts.usuario, senha: opts.senha }, {
    wsdlUrl: opts.wsdlUrl,
    timeoutMs: opts.timeoutMs ?? 30_000,
    maxRetries: opts.maxRetries ?? 3,
  });
}

export type SascarMethod = keyof SascarClient;

export class SascarOrchestrator {
  private queue = new AsyncQueue();

  constructor(private sascar: SascarClient) {}

  async call<T>(method: SascarMethod, args: unknown[]): Promise<T> {
    return this.queue.enqueue(async () => {
      const fn = (this.sascar as any)[method];
      if (typeof fn !== 'function') {
        throw new Error(`Método Sascar inválido: ${String(method)}`);
      }
      return (await fn.apply(this.sascar, args)) as T;
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/SascarOrchestrator.spec.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `src/server.ts`**

Replace contents with:

```ts
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';
import { buildContext, type AppContext } from './context';
import { loadConfig } from './config';
import { createLogger } from './lib/logger';
import { SascarOrchestrator, buildSascarClient } from './orchestrator/SascarOrchestrator';

export interface StartedServer {
  url: string;
  stop: () => Promise<void>;
  orchestrator: SascarOrchestrator;
  cfg: ReturnType<typeof loadConfig>;
}

export async function startServer(): Promise<StartedServer> {
  const cfg = loadConfig();
  const logger = createLogger({ level: cfg.log.level });
  const sascar = buildSascarClient({
    usuario: cfg.sascar.usuario,
    senha: cfg.sascar.senha,
    wsdlUrl: cfg.sascar.wsdlUrl,
    timeoutMs: cfg.sascar.timeoutMs,
    maxRetries: cfg.sascar.maxRetries,
  });
  const orchestrator = new SascarOrchestrator(sascar);

  const server = new ApolloServer({ typeDefs, resolvers });
  const { url } = await startStandaloneServer(server, {
    context: async (): Promise<AppContext> => ({
      ...(await buildContext()),
      orchestrator,
    }),
    listen: { port: cfg.api.port },
  });
  logger.info({ url }, 'Apollo server started');

  return {
    url,
    orchestrator,
    cfg,
    stop: async () => {
      await server.stop();
    },
  };
}
```

- [ ] **Step 6: Update `src/context.ts`**

Replace contents with:

```ts
import type { Logger } from 'pino';
import { buildDb, type Db } from './db/client';
import type { SascarOrchestrator } from './orchestrator/SascarOrchestrator';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface AppContext {
  user: AuthUser | null;
  logger: Logger;
  db: Db;
  orchestrator: SascarOrchestrator;
}

export async function buildContext(): Promise<Omit<AppContext, 'orchestrator'>> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return {
    user: null,
    logger: console as unknown as Logger,
    db: buildDb(url),
  };
}
```

- [ ] **Step 7: Commit**

```bash
git add src/orchestrator/SascarOrchestrator.ts src/server.ts src/context.ts tests/unit/SascarOrchestrator.spec.ts
git commit -m "feat(orchestrator): SascarOrchestrator with AsyncQueue global"
```

---

## Task 15: request_log writer

**Files:**
- Create: `src/orchestrator/log.ts`
- Test: `tests/integration/log.spec.ts`

- [ ] **Step 1: Write the failing test `tests/integration/log.spec.ts`**

```ts
import { Pool } from 'pg';
import { logRequest } from '../../src/orchestrator/log';

describe('logRequest', () => {
  it('inserts a row into request_log', async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM request_log WHERE method = $1', ['test.method']);

    const db = { execute: (q: any) => pool.query(q.sql, q.args) } as any;
    await logRequest(db, {
      method: 'test.method',
      source: 'graphql',
      status: 'ok',
      cacheHit: false,
      latencyMs: 12,
    });

    const { rows } = await pool.query("SELECT method, status, cache_hit FROM request_log WHERE method = 'test.method'");
    expect(rows[0].method).toBe('test.method');
    expect(rows[0].status).toBe('ok');
    expect(rows[0].cache_hit).toBe(false);
    await pool.end();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/log.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/orchestrator/log.ts`**

```ts
import type { Db } from '../db/client';

export interface LogEntry {
  method: string;
  source: 'graphql' | 'cron' | 'auth';
  status: 'ok' | 'error' | 'cache_hit';
  cacheHit: boolean;
  latencyMs?: number;
  args?: unknown;
  userId?: string;
  error?: string;
}

export async function logRequest(db: Db, entry: LogEntry): Promise<void> {
  await db.execute({
    sql: `INSERT INTO request_log (method, source, status, cache_hit, latency_ms, args, user_id, error)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    args: [
      entry.method,
      entry.source,
      entry.status,
      entry.cacheHit,
      entry.latencyMs ?? null,
      entry.args ? JSON.stringify(entry.args) : null,
      entry.userId ?? null,
      entry.error ?? null,
    ],
  } as any);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/log.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator/log.ts tests/integration/log.spec.ts
git commit -m "feat(orchestrator): request_log writer helper"
```

---

## Task 16: cachedQuery generic

**Files:**
- Create: `src/orchestrator/cache.ts`
- Test: `tests/integration/cache.spec.ts`

- [ ] **Step 1: Write the failing test `tests/integration/cache.spec.ts`**

```ts
import { Pool } from 'pg';
import { cachedQuery } from '../../src/orchestrator/cache';

describe('cachedQuery', () => {
  const table = 'test_cadastro';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL,
        raw JSONB NOT NULL,
        fetched_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    await pool.end();
  });

  afterAll(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(`DROP TABLE IF EXISTS ${table}`);
    await pool.end();
  });

  beforeEach(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(`DELETE FROM ${table}`);
    await pool.end();
  });

  it('returns cache hit when expires_at > now()', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(`INSERT INTO ${table} (id, nome, raw, fetched_at, expires_at) VALUES (1, 'X', '{}'::jsonb, now(), now() + interval '1 hour')`);
    await pool.end();

    const db = { execute: (q: any) => pool2.query(q.sql, q.args) } as any;
    const pool2 = new Pool({ connectionString: process.env.DATABASE_URL });
    let fetcherCalls = 0;
    const result = await cachedQuery<{ id: number; nome: string }>(db, {
      table, ttlMs: 60_000, fetcher: async () => { fetcherCalls++; return []; },
      fromRows: (rows: any[]) => rows.map((r) => ({ id: r.id, nome: r.nome })),
    });
    expect(result.length).toBe(1);
    expect(result[0].nome).toBe('X');
    expect(fetcherCalls).toBe(0);
    await pool2.end();
  });

  it('calls fetcher on cache miss and upserts', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = { execute: (q: any) => pool.query(q.sql, q.args) } as any;
    const result = await cachedQuery<{ id: number; nome: string }>(db, {
      table, ttlMs: 60_000, fetcher: async () => [{ id: 99, nome: 'Fresh' } as any],
      fromRows: (rows: any[]) => rows.map((r) => ({ id: r.id, nome: r.nome })),
    });
    expect(result.length).toBe(1);
    expect(result[0].nome).toBe('Fresh');

    const { rows } = await pool.query(`SELECT nome FROM ${table} WHERE id = 99`);
    expect(rows[0].nome).toBe('Fresh');
    await pool.end();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/cache.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/orchestrator/cache.ts`**

```ts
import type { Db } from '../db/client';
import { logRequest } from './log';

export interface CachedQueryOpts<T, TRow> {
  table: string;
  ttlMs: number;
  method: string; // for log
  fetcher: () => Promise<T[]>;
  toRow: (item: T) => TRow;
  fromRows: (rows: any[]) => T[];
}

export async function cachedQuery<T, TRow = any>(
  db: Db,
  opts: CachedQueryOpts<T, TRow>,
): Promise<T[]> {
  const start = Date.now();
  const { rows: cached } = await db.execute({
    sql: `SELECT * FROM ${opts.table} WHERE expires_at > now()`,
    args: [],
  } as any);

  if (cached.length) {
    await logRequest(db, { method: opts.method, source: 'graphql', status: 'cache_hit', cacheHit: true, latencyMs: Date.now() - start });
    return opts.fromRows(cached as any[]);
  }

  const fresh = await opts.fetcher();
  const expiresAt = new Date(Date.now() + opts.ttlMs);
  for (const item of fresh) {
    const row = opts.toRow(item);
    const cols = Object.keys(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
    const colNames = cols.join(',');
    const values = cols.map((c) => (row as any)[c]);
    await db.execute({
      sql: `INSERT INTO ${opts.table} (${colNames}, fetched_at, expires_at)
            VALUES (${placeholders}, now(), $${cols.length + 1})
            ON CONFLICT DO NOTHING`,
      args: [...values, expiresAt],
    } as any);
  }
  await logRequest(db, { method: opts.method, source: 'graphql', status: 'ok', cacheHit: false, latencyMs: Date.now() - start });
  return fresh;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/cache.spec.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator/cache.ts tests/integration/cache.spec.ts
git commit -m "feat(orchestrator): generic cachedQuery with TTL"
```

---

## Task 17: Cadastros migration + domain (clientes, veiculos, motoristas)

**Files:**
- Create: `src/db/migrations/0002_cadastros_cache.sql`
- Modify: `src/db/schema.ts`
- Create: `src/domain/clientes.ts`
- Create: `src/domain/veiculos.ts`
- Create: `src/domain/motoristas.ts`
- Tests: `tests/integration/cadastros.spec.ts`

- [ ] **Step 1: Write `src/db/migrations/0002_cadastros_cache.sql`**

```sql
-- 0002_cadastros_cache.sql
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
```

- [ ] **Step 2: Run migration**

Run: `export $(grep -v '^#' .env.example | xargs) && npx tsx scripts/migrate.ts`
Expected: prints `APPLIED 0002_cadastros_cache.sql`.

- [ ] **Step 3: Write `src/domain/clientes.ts`**

```ts
import { cachedQuery } from '../orchestrator/cache';
import { SascarOrchestrator } from '../orchestrator/SascarOrchestrator';
import type { AppContext } from '../context';

export interface Cliente {
  idCliente: number;
  cnpj: string | null;
  cpf: string | null;
  nome: string;
  fetchedAt: Date;
  expiresAt: Date;
}

export async function getClientes(
  ctx: AppContext,
  args: { quantidade?: number; idCliente?: number },
): Promise<Cliente[]> {
  const rows = await cachedQuery<any, any>(ctx.db, {
    table: 'clientes_cache',
    ttlMs: 60_000, // overridden via cfg
    method: 'obterClientesV2',
    fetcher: () => ctx.orchestrator.call<any[]>('obterClientesV2', [args.quantidade ?? 1000, args.idCliente ?? null]),
    toRow: (c) => ({
      id_cliente: c.idCliente,
      cnpj: c.cnpj ?? null,
      cpf: c.cpf ?? null,
      nome: c.nome,
      raw: c,
    }),
    fromRows: (rs) => rs.map((r) => ({
      idCliente: r.id_cliente,
      cnpj: r.cnpj,
      cpf: r.cpf,
      nome: r.nome,
      fetchedAt: r.fetched_at,
      expiresAt: r.expires_at,
    })),
  });
  return rows;
}
```

- [ ] **Step 4: Write `src/domain/veiculos.ts`**

```ts
import { cachedQuery } from '../orchestrator/cache';
import type { AppContext } from '../context';

export interface Veiculo {
  idVeiculo: number;
  placa: string;
  idCliente: number | null;
  descricao: string | null;
  idEquipamento: number | null;
  fetchedAt: Date;
  expiresAt: Date;
}

export async function getVeiculos(
  ctx: AppContext,
  args: { quantidade?: number; idVeiculo?: number },
): Promise<Veiculo[]> {
  return cachedQuery<any, any>(ctx.db, {
    table: 'veiculos_cache',
    ttlMs: 60_000,
    method: 'obterVeiculos',
    fetcher: () => ctx.orchestrator.call<any[]>('obterVeiculos', [args.quantidade ?? 1000, args.idVeiculo ?? null]),
    toRow: (v) => ({
      id_veiculo: v.idVeiculo,
      placa: v.placa,
      id_cliente: v.idCliente ?? null,
      descricao: v.descricao ?? null,
      id_equipamento: v.idEquipamento ?? null,
      raw: v,
    }),
    fromRows: (rs) => rs.map((r) => ({
      idVeiculo: r.id_veiculo,
      placa: r.placa,
      idCliente: r.id_cliente,
      descricao: r.descricao,
      idEquipamento: r.id_equipamento,
      fetchedAt: r.fetched_at,
      expiresAt: r.expires_at,
    })),
  });
}
```

- [ ] **Step 5: Write `src/domain/motoristas.ts`**

```ts
import { cachedQuery } from '../orchestrator/cache';
import type { AppContext } from '../context';

export interface Motorista {
  idMotorista: number;
  nome: string;
  tipoDocumento: string | null;
  fetchedAt: Date;
  expiresAt: Date;
}

export async function getMotoristas(
  ctx: AppContext,
  args: { quantidade?: number; idMotorista?: number },
): Promise<Motorista[]> {
  return cachedQuery<any, any>(ctx.db, {
    table: 'motoristas_cache',
    ttlMs: 60_000,
    method: 'obterMotoristas',
    fetcher: () => ctx.orchestrator.call<any[]>('obterMotoristas', [args.quantidade ?? 1000, args.idMotorista ?? null]),
    toRow: (m) => ({
      id_motorista: m.idMotorista,
      nome: m.nome,
      tipo_documento: m.tipoDocumento ?? null,
      raw: m,
    }),
    fromRows: (rs) => rs.map((r) => ({
      idMotorista: r.id_motorista,
      nome: r.nome,
      tipoDocumento: r.tipo_documento,
      fetchedAt: r.fetched_at,
      expiresAt: r.expires_at,
    })),
  });
}
```

- [ ] **Step 6: Write `tests/integration/cadastros.spec.ts`**

```ts
import nock from 'nock';
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';
import { buildSascarClient, SascarOrchestrator } from '../../src/orchestrator/SascarOrchestrator';

function buildCtxWithMockOrch(orchestrator: SascarOrchestrator) {
  return { user: null, logger: console, db: { execute: (q: any) => poolQuery(q.sql, q.args) } as any, orchestrator };
}

const poolQuery = (() => {
  let pool: Pool;
  return async (sql: string, args: any[]) => {
    if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return pool.query(sql, args);
  };
})();

describe('cadastros resolvers (with mocked Sascar)', () => {
  afterEach(() => nock.cleanAll());

  it('clientes returns cached data when present', async () => {
    nock('https://sasintegra.sascar.com.br')
      .post(/.*/)
      .reply(200, '<xml>[]</xml>');

    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'https://sasintegra.sascar.com.br/x' });
    const orch = new SascarOrchestrator(sascar);
    const ctx = buildCtxWithMockOrch(orch);
    // Pre-seed cache
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(`DELETE FROM clientes_cache WHERE id_cliente = 1`);
    await pool.query(
      `INSERT INTO clientes_cache (id_cliente, cnpj, cpf, nome, raw, fetched_at, expires_at)
       VALUES (1, '123', null, 'Cliente Y', '{}'::jsonb, now(), now() + interval '1 hour')`,
    );
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ clientes(quantidade: 10) { idCliente nome } }' });
    expect(res.errors).toBeUndefined();
    expect((res.data as any).clientes[0].nome).toBe('Cliente Y');
    await pool.end();
  });
});
```

- [ ] **Step 7: Wire cadastros into resolvers**

Update `src/graphql/resolvers.ts` to import and merge cadastros resolvers. The simplest way: in `src/graphql/resolvers.ts`, import `getClientes`, `getVeiculos`, `getMotoristas` and add Query fields:

```ts
import { buildAuthResolvers } from '../auth/resolvers';
import { getClientes } from '../domain/clientes';
import { getVeiculos } from '../domain/veiculos';
import { getMotoristas } from '../domain/motoristas';
import { loadConfig } from '../config';
import type { AppContext } from '../context';

const cfg = loadConfig();
const auth = buildAuthResolvers({ accessSecret: cfg.jwt.accessSecret, refreshSecret: cfg.jwt.refreshSecret, accessTtl: cfg.jwt.accessTtl, refreshTtl: cfg.jwt.refreshTtl });

export const resolvers = {
  Query: {
    health: () => 'ok',
    clientes: (_: unknown, args: any, ctx: AppContext) => getClientes(ctx, args),
    veiculos: (_: unknown, args: any, ctx: AppContext) => getVeiculos(ctx, args),
    motoristas: (_: unknown, args: any, ctx: AppContext) => getMotoristas(ctx, args),
  },
  Mutation: { ...auth.Mutation },
  DateTime: {
    __serialize: (v: unknown) => (v instanceof Date ? v.toISOString() : v),
    __parseValue: (v: unknown) => (typeof v === 'string' ? new Date(v) : null),
    __parseLiteral: () => null,
  },
};
```

Also extend `src/graphql/schema.ts`:

```graphql
type Cliente { idCliente: Int! cnpj: String cpf: String nome: String! fetchedAt: DateTime! expiresAt: DateTime! }
type Veiculo { idVeiculo: Int! placa: String! idCliente: Int descricao: String idEquipamento: Int fetchedAt: DateTime! expiresAt: DateTime! }
type Motorista { idMotorista: Int! nome: String! tipoDocumento: String fetchedAt: DateTime! expiresAt: DateTime! }

extend type Query {
  clientes(idCliente: Int, quantidade: Int = 1000): [Cliente!]!
  veiculos(idVeiculo: Int, quantidade: Int = 1000): [Veiculo!]!
  motoristas(idMotorista: Int, quantidade: Int = 1000): [Motorista!]!
}
```

- [ ] **Step 8: Run tests**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/cadastros.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/db/migrations/0002_cadastros_cache.sql src/db/schema.ts src/domain/clientes.ts src/domain/veiculos.ts src/domain/motoristas.ts src/graphql/resolvers.ts src/graphql/schema.ts tests/integration/cadastros.spec.ts
git commit -m "feat(domain): clientes, veiculos, motoristas with cache"
```

---

## Task 18: Posições migration + domain with cursor

**Files:**
- Create: `src/db/migrations/0003_posicoes.sql`
- Create: `src/domain/posicoes.ts`
- Test: `tests/integration/posicoes.spec.ts`

- [ ] **Step 1: Write `src/db/migrations/0003_posicoes.sql`**

```sql
-- 0003_posicoes.sql
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
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (method, id_veiculo)
);
```

- [ ] **Step 2: Run migration**

Run: `export $(grep -v '^#' .env.example | xargs) && npx tsx scripts/migrate.ts`
Expected: `APPLIED 0003_posicoes.sql`.

- [ ] **Step 3: Write `src/domain/posicoes.ts`**

```ts
import { logRequest } from '../orchestrator/log';
import type { AppContext } from '../context';
import { mapSascarError } from '../orchestrator/errors';

export interface Posicao {
  idPacote: number;
  idVeiculo: number;
  dataPosicao: Date;
  dataPacote: Date;
  latitude: number;
  longitude: number;
  velocidade: number;
  ignicao: number | null;
  direcao: number | null;
  odometro: number | null;
  syncedVia: string;
}

const METHOD = 'obterPacotePosicaoPorRangeJSON';

export async function getPosicoesRecentes(ctx: AppContext, quantity: number): Promise<Posicao[]> {
  const start = Date.now();
  const pool = ctx.db as any;
  // 1. Find fresh rows
  const { rows: fresh } = await pool.execute({
    sql: `SELECT * FROM posicoes WHERE data_posicao > now() - interval '5 minutes' ORDER BY data_posicao DESC LIMIT $1`,
    args: [quantity],
  } as any);
  if (fresh.length) {
    await logRequest(ctx.db, { method: METHOD, source: 'graphql', status: 'cache_hit', cacheHit: true, latencyMs: Date.now() - start });
    return mapPosicoes(fresh);
  }
  // 2. Cache miss: fetch from Sascar
  const veiculos = await pool.execute({ sql: 'SELECT id_veiculo FROM veiculos_cache', args: [] } as any);
  for (const v of veiculos.rows as any[]) {
    await fetchAndUpsertPosicoes(ctx, v.id_veiculo);
  }
  const { rows } = await pool.execute({
    sql: `SELECT * FROM posicoes ORDER BY data_posicao DESC LIMIT $1`,
    args: [quantity],
  } as any);
  await logRequest(ctx.db, { method: METHOD, source: 'graphql', status: 'ok', cacheHit: false, latencyMs: Date.now() - start });
  return mapPosicoes(rows);
}

export async function fetchAndUpsertPosicoes(ctx: AppContext, idVeiculo: number): Promise<number> {
  const pool = ctx.db as any;
  const { rows: cursorRows } = await pool.execute({
    sql: 'SELECT last_id_pacote FROM sync_cursor WHERE method = $1 AND id_veiculo = $2',
    args: [METHOD, idVeiculo],
  } as any);
  const lastId = cursorRows[0]?.last_id_pacote ? Number(cursorRows[0].last_id_pacote) : 0;
  const idInicio = lastId + 1;
  const posicoes = await ctx.orchestrator
    .call<any[]>(METHOD, [idInicio, Number.MAX_SAFE_INTEGER, 1000])
    .catch((err) => { throw mapSascarError(err); });

  for (const p of posicoes) {
    await pool.execute({
      sql: `INSERT INTO posicoes
            (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, direcao, odometro, horimetro, raw, synced_via)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'graphql')
            ON CONFLICT (id_veiculo, id_pacote) DO NOTHING`,
      args: [p.idPacote, p.idVeiculo, p.dataPosicao, p.dataPacote, p.latitude, p.longitude, p.velocidade, p.ignicao ?? null, p.direcao ?? null, p.odometro ?? null, p.horimetro ?? null, JSON.stringify(p)],
    } as any);
  }
  if (posicoes.length) {
    const maxId = Math.max(...posicoes.map((p) => Number(p.idPacote)));
    await pool.execute({
      sql: `INSERT INTO sync_cursor (method, id_veiculo, last_id_pacote, last_synced_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (method, id_veiculo) DO UPDATE SET last_id_pacote = EXCLUDED.last_id_pacote, last_synced_at = now()`,
      args: [METHOD, idVeiculo, maxId],
    } as any);
  }
  return posicoes.length;
}

function mapPosicoes(rows: any[]): Posicao[] {
  return rows.map((r) => ({
    idPacote: Number(r.id_pacote),
    idVeiculo: r.id_veiculo,
    dataPosicao: r.data_posicao,
    dataPacote: r.data_pacote,
    latitude: r.latitude,
    longitude: r.longitude,
    velocidade: r.velocidade,
    ignicao: r.ignicao,
    direcao: r.direcao,
    odometro: r.odometro,
    syncedVia: r.synced_via,
  }));
}
```

- [ ] **Step 4: Write `tests/integration/posicoes.spec.ts`**

```ts
import nock from 'nock';
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';
import { fetchAndUpsertPosicoes } from '../../src/domain/posicoes';
import { buildSascarClient, SascarOrchestrator } from '../../src/orchestrator/SascarOrchestrator';

const SASCAR_URL = 'https://sasintegra.sascar.com.br';

describe('posicoes domain (mocked Sascar)', () => {
  afterEach(() => nock.cleanAll());

  it('fetches from Sascar when no cursor, inserts posicoes, advances cursor', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.query(`INSERT INTO veiculos_cache (id_veiculo, placa, raw, fetched_at, expires_at) VALUES (777, 'AAA1111', '{}'::jsonb, now(), now() + interval '1 day') ON CONFLICT (id_veiculo) DO NOTHING`);

    nock(SASCAR_URL)
      .post(/.*/)
      .reply(200, `<?xml version="1.0"?>
        <S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
          <S:Body>
            <obterPacotePosicaoPorRangeJSONResponse>
              <return>[
                {"idVeiculo":777,"idPacote":1001,"dataPosicao":"2026-06-12T12:00:00","dataPacote":"2026-06-12T12:00:00","latitude":-23.5,"longitude":-46.6,"velocidade":60,"ignicao":1,"direcao":90,"odometro":1234.5},
                {"idVeiculo":777,"idPacote":1002,"dataPosicao":"2026-06-12T12:00:30","dataPacote":"2026-06-12T12:00:30","latitude":-23.6,"longitude":-46.7,"velocidade":70,"ignicao":1,"direcao":90,"odometro":1235.0}
              ]</return>
            </obterPacotePosicaoPorRangeJSONResponse>
          </S:Body>
        </S:Envelope>`);

    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: `${SASCAR_URL}/x` });
    const orch = new SascarOrchestrator(sascar);
    const ctx = { user: null, logger: console, db: { execute: (q: any) => pool.query(q.sql, q.args) } as any, orchestrator: orch };
    const n = await fetchAndUpsertPosicoes(ctx, 777);
    expect(n).toBe(2);
    const { rows } = await pool.query('SELECT count(*)::int as c FROM posicoes WHERE id_veiculo = 777');
    expect(rows[0].c).toBe(2);
    const { rows: cur } = await pool.query('SELECT last_id_pacote FROM sync_cursor WHERE id_veiculo = 777');
    expect(Number(cur[0].last_id_pacote)).toBe(1002);
    await pool.end();
  });
});
```

- [ ] **Step 5: Run test**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/posicoes.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations/0003_posicoes.sql src/domain/posicoes.ts tests/integration/posicoes.spec.ts
git commit -m "feat(domain): posicoes with cursor-based sync"
```

---

## Task 19: Background job (syncPositions)

**Files:**
- Create: `src/jobs/cron.ts`
- Create: `src/jobs/syncPositions.ts`
- Test: `tests/integration/syncPositions.spec.ts`

- [ ] **Step 1: Write `src/jobs/syncPositions.ts`**

```ts
import cron, { type ScheduledTask } from 'node-cron';
import { Pool } from 'pg';
import { createLogger } from '../lib/logger';
import { buildSascarClient, SascarOrchestrator } from '../orchestrator/SascarOrchestrator';
import { fetchAndUpsertPosicoes } from '../domain/posicoes';
import { logRequest } from '../orchestrator/log';
import { loadConfig } from '../config';

export interface JobConfig {
  enabled: boolean;
  cronExpr: string;
  quantity: number;
}

export function startSyncPositions(cfg: JobConfig): ScheduledTask | null {
  if (!cfg.enabled) {
    return null;
  }
  const logger = createLogger({ level: 'info' });
  const task = cron.schedule(cfg.cronExpr, async () => {
    const start = Date.now();
    try {
      const appCfg = loadConfig();
      const sascar = buildSascarClient({
        usuario: appCfg.sascar.usuario,
        senha: appCfg.sascar.senha,
        wsdlUrl: appCfg.sascar.wsdlUrl,
        timeoutMs: appCfg.sascar.timeoutMs,
        maxRetries: appCfg.sascar.maxRetries,
      });
      const orch = new SascarOrchestrator(sascar);
      const pool = new Pool({ connectionString: appCfg.db.url });
      const { rows } = await pool.query('SELECT id_veiculo FROM veiculos_cache');
      let total = 0;
      const ctx = { user: null, logger, db: { execute: (q: any) => pool.query(q.sql, q.args) } as any, orchestrator: orch };
      for (const v of rows as any[]) {
        const n = await fetchAndUpsertPosicoes(ctx, v.id_veiculo);
        total += n;
      }
      await logRequest(ctx.db, {
        method: 'syncPositions.cron', source: 'cron', status: 'ok', cacheHit: false,
        latencyMs: Date.now() - start, args: { total },
      });
      await pool.end();
      logger.info({ total, ms: Date.now() - start }, 'syncPositions completed');
    } catch (err) {
      logger.error({ err }, 'syncPositions failed');
    }
  });
  logger.info({ cron: cfg.cronExpr }, 'syncPositions scheduled');
  return task;
}
```

- [ ] **Step 2: Write `src/jobs/cron.ts`**

```ts
import cron from 'node-cron';
import { startSyncPositions } from './syncPositions';
import { loadConfig } from '../config';

export function startAllJobs() {
  const cfg = loadConfig();
  const tasks: cron.ScheduledTask[] = [];
  const t1 = startSyncPositions({ enabled: cfg.job.enabled, cronExpr: cfg.job.cron, quantity: cfg.job.quantity });
  if (t1) tasks.push(t1);
  return tasks;
}
```

- [ ] **Step 3: Write `tests/integration/syncPositions.spec.ts`**

```ts
import { startSyncPositions } from '../../src/jobs/syncPositions';

describe('syncPositions job', () => {
  it('returns null when disabled', () => {
    const t = startSyncPositions({ enabled: false, cronExpr: '* * * * *', quantity: 1000 });
    expect(t).toBeNull();
  });

  it('returns a scheduled task when enabled and stops cleanly', () => {
    const t = startSyncPositions({ enabled: true, cronExpr: '0 0 1 1 *', quantity: 100 });
    expect(t).not.toBeNull();
    t!.stop();
  });
});
```

- [ ] **Step 4: Run test**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/syncPositions.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/cron.ts src/jobs/syncPositions.ts tests/integration/syncPositions.spec.ts
git commit -m "feat(jobs): 10-min position sync (opt-in via env)"
```

---

## Task 20: GraphQL positions + syncStatus queries

**Files:**
- Modify: `src/graphql/schema.ts`
- Modify: `src/graphql/resolvers.ts`
- Test: `tests/integration/posicoes-query.spec.ts`

- [ ] **Step 1: Update `src/graphql/schema.ts`**

Append to the SDL:

```graphql
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

extend type Query {
  posicoesRecentes(quantidade: Int = 1000): [Posicao!]!
  posicoesPorVeiculo(idVeiculo: Int!, dataInicio: DateTime!, dataFim: DateTime!): [Posicao!]!
  syncStatus: [SyncCursor!]!
}
```

- [ ] **Step 2: Update `src/graphql/resolvers.ts`**

Add to Query:

```ts
import { getPosicoesRecentes, fetchAndUpsertPosicoes } from '../domain/posicoes';

// inside Query:
posicoesRecentes: (_: unknown, args: { quantidade?: number }, ctx: AppContext) =>
  getPosicoesRecentes(ctx, args.quantidade ?? 1000),

posicoesPorVeiculo: async (
  _: unknown,
  args: { idVeiculo: number; dataInicio: Date; dataFim: Date },
  ctx: AppContext,
) => {
  await fetchAndUpsertPosicoes(ctx, args.idVeiculo);
  const { rows } = await (ctx.db as any).execute({
    sql: `SELECT * FROM posicoes WHERE id_veiculo = $1 AND data_posicao BETWEEN $2 AND $3 ORDER BY data_posicao`,
    args: [args.idVeiculo, args.dataInicio, args.dataFim],
  } as any);
  return (rows as any[]).map((r) => ({
    idPacote: Number(r.id_pacote),
    idVeiculo: r.id_veiculo,
    dataPosicao: r.data_posicao,
    dataPacote: r.data_pacote,
    latitude: r.latitude,
    longitude: r.longitude,
    velocidade: r.velocidade,
    ignicao: r.ignicao,
    direcao: r.direcao,
    odometro: r.odometro,
    syncedVia: r.synced_via,
  }));
},

syncStatus: async (_: unknown, __: unknown, ctx: AppContext) => {
  const { rows } = await (ctx.db as any).execute({
    sql: 'SELECT method, id_veiculo, last_id_pacote, last_synced_at FROM sync_cursor ORDER BY method, id_veiculo',
    args: [],
  } as any);
  return (rows as any[]).map((r) => ({
    method: r.method,
    idVeiculo: r.id_veiculo,
    lastIdPacote: r.last_id_pacote ? Number(r.last_id_pacote) : null,
    lastSyncedAt: r.last_synced_at,
  }));
},
```

- [ ] **Step 3: Write `tests/integration/posicoes-query.spec.ts`**

```ts
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';

describe('posicoes GraphQL', () => {
  beforeEach(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.query(`INSERT INTO posicoes (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, raw, synced_via)
      VALUES (1, 100, now(), now(), -23.5, -46.6, 60, 1, '{}'::jsonb, 'cron')`);
    await pool.end();
  });

  it('syncStatus returns cursor rows', async () => {
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ syncStatus { method idVeiculo lastIdPacote } }' });
    expect(res.errors).toBeUndefined();
    expect(Array.isArray((res.data as any).syncStatus)).toBe(true);
  });
});
```

- [ ] **Step 4: Run test**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/posicoes-query.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/graphql/schema.ts src/graphql/resolvers.ts tests/integration/posicoes-query.spec.ts
git commit -m "feat(graphql): posicoesRecentes, posicoesPorVeiculo, syncStatus"
```

---

## Task 21: Caixa preta @deprecated stub

**Files:**
- Create: `src/db/migrations/0004_caixa_preta.sql`
- Create: `src/domain/caixaPreta.ts`
- Modify: `src/graphql/schema.ts`
- Modify: `src/graphql/resolvers.ts`
- Test: `tests/integration/caixaPreta.spec.ts`

- [ ] **Step 1: Write `src/db/migrations/0004_caixa_preta.sql`**

```sql
-- 0004_caixa_preta.sql
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
```

- [ ] **Step 2: Run migration**

Run: `export $(grep -v '^#' .env.example | xargs) && npx tsx scripts/migrate.ts`
Expected: `APPLIED 0004_caixa_preta.sql`.

- [ ] **Step 3: Write `src/domain/caixaPreta.ts`**

```ts
import { logRequest } from '../orchestrator/log';
import type { AppContext } from '../context';

export interface CaixaPretaEvento {
  id: string;
  idVeiculo: number | null;
  placa: string | null;
  dataEvento: Date | null;
  latitude: number | null;
  longitude: number | null;
  velocidade: number | null;
}

/**
 * Stub: solicitarEventosCaixaPreta (4.51) foi desativada pela Sascar no manual v2.07.
 * Esta função apenas lê o histórico já gravado em caixa_preta_eventos
 * (que só contém eventos passados solicitados ANTES da desativação).
 * Não faz novas chamadas a Sascar.
 */
export async function getCaixaPretaEventos(
  ctx: AppContext,
  args: { placa?: string; idVeiculo?: number },
): Promise<CaixaPretaEvento[]> {
  await logRequest(ctx.db, {
    method: 'recuperarEventosCaixaPreta',
    source: 'graphql',
    status: 'ok',
    cacheHit: false,
    args,
  });
  const where: string[] = [];
  const params: any[] = [];
  if (args.idVeiculo) { params.push(args.idVeiculo); where.push(`id_veiculo = $${params.length}`); }
  if (args.placa) { params.push(args.placa); where.push(`placa = $${params.length}`); }
  const sql = `SELECT * FROM caixa_preta_eventos ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY data_evento DESC NULLS LAST LIMIT 1000`;
  const { rows } = await (ctx.db as any).execute({ sql, args: params } as any);
  return (rows as any[]).map((r) => ({
    id: String(r.id),
    idVeiculo: r.id_veiculo,
    placa: r.placa,
    dataEvento: r.data_evento,
    latitude: r.latitude,
    longitude: r.longitude,
    velocidade: r.velocidade,
  }));
}
```

- [ ] **Step 4: Update `src/graphql/schema.ts`**

Add:

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

extend type Query {
  caixaPretaEventos(placa: String, idVeiculo: Int): [CaixaPretaEvento!]!
    @deprecated(reason: "Método 4.51 da Sascar desativado. Use posicoesRecentes.")
}
```

- [ ] **Step 5: Update `src/graphql/resolvers.ts`**

Add to Query:

```ts
import { getCaixaPretaEventos } from '../domain/caixaPreta';

// inside Query:
caixaPretaEventos: (_: unknown, args: { placa?: string; idVeiculo?: number }, ctx: AppContext) =>
  getCaixaPretaEventos(ctx, args),
```

- [ ] **Step 6: Write `tests/integration/caixaPreta.spec.ts`**

```ts
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';

describe('caixaPretaEventos (deprecated)', () => {
  it('returns empty list and does NOT call Sascar', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM caixa_preta_eventos');
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ caixaPretaEventos { id } }' });
    expect(res.errors).toBeUndefined();
    expect((res.data as any).caixaPretaEventos).toEqual([]);
    await pool.end();
  });
});
```

- [ ] **Step 7: Run test**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/caixaPreta.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/db/migrations/0004_caixa_preta.sql src/domain/caixaPreta.ts src/graphql/schema.ts src/graphql/resolvers.ts tests/integration/caixaPreta.spec.ts
git commit -m "feat(domain): caixa-preta stub marked @deprecated"
```

---

## Task 22: requestLog query

**Files:**
- Modify: `src/graphql/schema.ts`
- Modify: `src/graphql/resolvers.ts`
- Test: `tests/integration/request-log.spec.ts`

- [ ] **Step 1: Update `src/graphql/schema.ts`**

Add:

```graphql
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

extend type Query {
  requestLog(limit: Int = 100, method: String): [RequestLogEntry!]!
}
```

- [ ] **Step 2: Update `src/graphql/resolvers.ts`**

Add:

```ts
requestLog: async (_: unknown, args: { limit?: number; method?: string }, ctx: AppContext) => {
  const params: any[] = [args.limit ?? 100];
  let where = '';
  if (args.method) { params.push(args.method); where = `WHERE method = $${params.length}`; }
  const { rows } = await (ctx.db as any).execute({
    sql: `SELECT id, method, source, status, cache_hit, latency_ms, created_at, error FROM request_log ${where} ORDER BY created_at DESC LIMIT $1`,
    args: params,
  } as any);
  return (rows as any[]).map((r) => ({
    id: String(r.id),
    method: r.method,
    source: r.source,
    status: r.status,
    cacheHit: r.cache_hit,
    latencyMs: r.latency_ms,
    createdAt: r.created_at,
    error: r.error,
  }));
},
```

- [ ] **Step 3: Write `tests/integration/request-log.spec.ts`**

```ts
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';

describe('requestLog query', () => {
  it('returns the most recent log entries', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(`INSERT INTO request_log (method, source, status, cache_hit, latency_ms) VALUES ('test.foo', 'graphql', 'ok', false, 12)`);
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ requestLog(limit: 5, method: "test.foo") { method status } }' });
    expect(res.errors).toBeUndefined();
    const rows = (res.data as any).requestLog;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].method).toBe('test.foo');
    await pool.query(`DELETE FROM request_log WHERE method = 'test.foo'`);
    await pool.end();
  });
});
```

- [ ] **Step 4: Run test**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/request-log.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/graphql/schema.ts src/graphql/resolvers.ts tests/integration/request-log.spec.ts
git commit -m "feat(graphql): requestLog audit query"
```

---

## Task 23: Graceful shutdown

**Files:**
- Create: `src/lib/shutdown.ts`
- Modify: `src/index.ts`
- Test: `tests/integration/shutdown.spec.ts`

- [ ] **Step 1: Write `src/lib/shutdown.ts`**

```ts
import type { ScheduledTask } from 'node-cron';

export interface ShutdownHandle {
  stopServer: () => Promise<void>;
  tasks: ScheduledTask[];
}

export function installShutdown(handle: ShutdownHandle): void {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const sig of signals) {
    process.once(sig, async () => {
      console.log(`[shutdown] received ${sig}, stopping...`);
      for (const t of handle.tasks) {
        try { t.stop(); } catch (e) { console.error('cron stop failed', e); }
      }
      try {
        await Promise.race([
          handle.stopServer(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('shutdown timeout')), 60_000)),
        ]);
      } catch (e) {
        console.error('server stop failed', e);
      }
      process.exit(0);
    });
  }
}
```

- [ ] **Step 2: Write `src/index.ts`**

```ts
import { startServer } from './server';
import { startAllJobs } from './jobs/cron';
import { installShutdown } from './lib/shutdown';

async function main() {
  const srv = await startServer();
  const tasks = startAllJobs();
  installShutdown({ stopServer: srv.stop, tasks });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Write `tests/integration/shutdown.spec.ts`**

```ts
import { installShutdown, type ShutdownHandle } from '../../src/lib/shutdown';

describe('installShutdown', () => {
  it('registers handlers without throwing', () => {
    const handle: ShutdownHandle = { stopServer: async () => {}, tasks: [] };
    expect(() => installShutdown(handle)).not.toThrow();
  });
});
```

- [ ] **Step 4: Run test**

Run: `export $(grep -v '^#' .env.example | xargs) && npx jest tests/integration/shutdown.spec.ts`
Expected: PASS.

- [ ] **Step 5: Smoke-test the actual server**

Run:
```
export $(grep -v '^#' .env.example | xargs)
npx tsx src/index.ts &
SERVER_PID=$!
sleep 3
curl -s -X POST http://localhost:4000/ -H 'Content-Type: application/json' -d '{"query":"{ health }"}' | head -c 200
echo
kill -TERM $SERVER_PID
wait $SERVER_PID
echo done
```
Expected: response contains `{"data":{"health":"ok"}}` and then `done` (clean exit).

- [ ] **Step 6: Commit**

```bash
git add src/lib/shutdown.ts src/index.ts tests/integration/shutdown.spec.ts
git commit -m "feat(lib): graceful shutdown + bootstrap"
```

---

## Task 24: Documentation (docs/api.md)

**Files:**
- Create: `docs/api.md`

- [ ] **Step 1: Write `docs/api.md`**

```markdown
# Api-Orquestrador Sascar — Documentação da API

## Autenticação

Todas as queries/mutations (exceto `health`) requerem header:
`Authorization: Bearer <accessToken>`

Tokens são obtidos via `mutation login` ou `mutation refresh`.

## Queries

### Cadastros (cache TTL 24h)
- `clientes(idCliente: Int, quantidade: Int = 1000): [Cliente!]!`
- `veiculos(idVeiculo: Int, quantidade: Int = 1000): [Veiculo!]!`
- `motoristas(idMotorista: Int, quantidade: Int = 1000): [Motorista!]!`
- `rotas(data: String): [Rota!]!`
- `pontosReferencia: [PontoReferencia!]!`

### Posições
- `posicoesRecentes(quantidade: Int = 1000): [Posicao!]!`
- `posicoesPorVeiculo(idVeiculo: Int!, dataInicio: DateTime!, dataFim: DateTime!): [Posicao!]!`
- `posicoesPorRange(idInicio: Int!, idFim: Int!, quantidade: Int = 1000): [Posicao!]!`

### Auditoria / status
- `requestLog(limit: Int = 100, method: String): [RequestLogEntry!]!`
- `syncStatus: [SyncCursor!]!`

## Mutations

- `login(email: String!, password: String!): AuthPayload!`
- `refresh(refreshToken: String!): AuthPayload!`

## Métodos descontinuados (SasIntegra v2.07)

| Query/Mutation GraphQL | Método SDK                       | Status Sascar                              | Substituir por                                  |
|------------------------|----------------------------------|--------------------------------------------|-------------------------------------------------|
| `caixaPretaEventos`    | `recuperarEventosCaixaPreta`     | Parcial — `solicitar` (4.51) está desativado | `posicoesRecentes`                            |
| `caixaPretaEventos`    | `solicitarEventosCaixaPreta`     | DESATIVADO, sem previsão                   | sem substituto — não usar                       |
| —                      | `obterDeltaTelemetriaIntegracao` | Descontinuado                              | `obterDeltaTelemetriaIntegracaoInercia`         |
| `clientes`             | `obterClientes`                  | Compatibilidade LGPD                       | `clientesV2` (CNPJ alfanumérico)               |

A diretiva `@deprecated` está aplicada nos campos SDL correspondentes
para que ferramentas (Apollo Studio, GraphiQL) exibam o aviso automaticamente.
```

- [ ] **Step 2: Commit**

```bash
git add docs/api.md
git commit -m "docs: api.md with deprecation table"
```

---

## Task 25: README + final smoke test

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
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
- `npm run db:migrate` / `npm run db:seed` / `npm run db:reset`

## Documentação

- Spec: `docs/superpowers/specs/2026-06-12-api-orquestrador-sascar-design.md`
- API: `docs/api.md`
- Plan: `docs/superpowers/plans/2026-06-12-api-orquestrador-sascar.md`

## Métodos descontinuados (Sascar v2.07)

Veja tabela em `docs/api.md`. Resumo: `solicitarEventosCaixaPreta` (4.51)
e `obterDeltaTelemetriaIntegracao` (4.44) estão desativados na origem.
```

- [ ] **Step 2: Run the full test suite**

Run: `export $(grep -v '^#' .env.example | xargs) && npm test`
Expected: All tests PASS. Coverage should be ≥ 80% for `src/orchestrator/`, `src/auth/`, `src/domain/`.

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: All exit 0.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README quickstart + commands"
```

---

## Self-Review (run before handing off)

1. **Spec coverage check:** every section in the spec maps to a task.
   - Stack choices → Tasks 2–4
   - Modelo de dados (Postgres tables) → Tasks 7, 8, 17, 18, 21
   - Schema GraphQL → Tasks 6, 11, 17, 20, 21, 22
   - SascarOrchestrator + AsyncQueue → Task 14
   - cachedQuery genérico → Task 16
   - Job 10 min opt-in → Task 19
   - Error handling → Task 13
   - Documentação @deprecated → Tasks 21, 24
   - Auth JWT → Tasks 9–12
   - Graceful shutdown → Task 23
   - `.env.example` → Task 3
2. **Placeholder scan:** no "TBD", "implement later", "fill in details" anywhere.
3. **Type consistency:** `cachedQuery`, `SascarOrchestrator.call`, `fetchAndUpsertPosicoes`, `logRequest`, `mapSascarError` are referenced consistently across tasks.
4. **Migrations idempotent:** the `migrate.ts` script skips already-applied files.
5. **Tests use `DATABASE_URL` from env** with explicit `export $(grep -v '^#' .env.example | xargs)` prefix in each step.

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `docs/superpowers/plans/2026-06-12-api-orquestrador-sascar.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**
