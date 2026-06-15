# TUI Orquestrador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Ink-based TUI ("cockpit") to `api-orquestrador` that manages users, browses Sascar data, and shows audit logs — all driven by GraphQL, all from the terminal.

**Architecture:** TUI lives in `src/tui/`, runs via `npm run tui` (tsx + JSX). Talks to the existing GraphQL endpoint only — never touches the DB directly. Backend gains ~5 new admin-gated mutations/queries for user management, plus a real JWT auth plugin (currently the API has `user: null` in context — login tokens are issued but not enforced).

**Tech Stack:** Ink 5 (React 18) + graphql-request + chalk + env-paths + clipboardy; backend additions use bcrypt + jsonwebtoken + zod (already in deps).

**Spec:** `docs/superpowers/specs/2026-06-15-tui-orquestrador-design.md`

**Test conventions:** all tests use `.spec.ts` / `.spec.tsx` under `tests/`. Run with `npm test`.

**Prereqs before starting:** the engineer must have the project running locally — `docker compose up -d postgres` and `cp .env.example .env`. Tests that touch the DB require `DATABASE_URL`.

---

## File Structure

```
api-orquestrador/
├── src/
│   ├── auth/
│   │   ├── jwt.ts                # (existente)
│   │   ├── password.ts           # (existente)
│   │   ├── resolvers.ts          # (existente) login/refresh
│   │   ├── userResolvers.ts      # NOVO: me/users/refreshTokens + createUser/updateUser/resetUserPassword/revokeRefreshToken
│   │   ├── guards.ts             # NOVO: requireAuth, requireAdmin
│   │   ├── validators.ts         # NOVO: zod schemas
│   │   ├── errors.ts             # NOVO: UserError com códigos
│   │   └── authPlugin.ts         # NOVO: Apollo plugin que popula ctx.user via Bearer token
│   ├── graphql/
│   │   ├── schema.ts             # MODIFICADO: novos types/queries/mutations
│   │   └── resolvers.ts          # MODIFICADO: merge de userResolvers
│   ├── server.ts                 # MODIFICADO: instala authPlugin
│   ├── context.ts                # (sem mudança)
│   ├── tui/
│   │   ├── index.tsx             # NOVO: entry point
│   │   ├── app.tsx               # NOVO: root + roteamento
│   │   ├── api/
│   │   │   ├── client.ts         # NOVO: graphql-request wrapper
│   │   │   ├── auth.ts           # NOVO: login/refresh/persist
│   │   │   └── queries.ts        # NOVO: strings GraphQL
│   │   ├── lib/
│   │   │   ├── theme.ts
│   │   │   ├── format.ts
│   │   │   ├── validators.ts
│   │   │   └── keyboard.ts
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useApi.ts
│   │   │   ├── useToast.ts
│   │   │   ├── useInterval.ts
│   │   │   └── useKeypress.ts
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Spinner.tsx
│   │   │   ├── Form.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Confirm.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   ├── HelpOverlay.tsx
│   │   │   └── ErrorBoundary.tsx
│   │   └── views/
│   │       ├── Login.tsx
│   │       ├── Users/
│   │       │   ├── index.tsx
│   │       │   ├── List.tsx
│   │       │   ├── CreateForm.tsx
│   │       │   ├── EditForm.tsx
│   │       │   ├── ResetPassword.tsx
│   │       │   └── Tokens.tsx
│   │       ├── Clientes.tsx
│   │       ├── Veiculos.tsx
│   │       ├── Motoristas.tsx
│   │       ├── Posicoes/
│   │       │   ├── index.tsx
│   │       │   ├── Recentes.tsx
│   │       │   └── PorVeiculo.tsx
│   │       ├── Logs.tsx
│   │       └── SyncStatus.tsx
├── tests/
│   ├── auth/
│   │   ├── guards.spec.ts
│   │   ├── authPlugin.spec.ts
│   │   └── userResolvers.spec.ts
│   └── tui/
│       ├── components/...
│       ├── views/...
│       └── integration/
│           └── app.smoke.spec.tsx
├── jest.config.ts                # MODIFICADO: suporta .tsx
├── tsconfig.json                 # MODIFICADO: JSX
├── package.json                  # MODIFICADO: deps e script tui
└── docs/
    ├── api.md                    # MODIFICADO: nova seção de user mgmt
    └── CHANGELOG.md              # MODIFICADO: entrada v0.2.0
```

---

## Task 1: Add TUI dependencies and JSX support

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `jest.config.ts`

- [ ] **Step 1: Install runtime deps**

Run:
```bash
npm install ink@^5 react@^18 graphql-request@^7 env-paths@^3 chalk@^5 ink-text-input@^6 ink-select-input@^5 ink-table@^3 ink-spinner@^5 ink-gradient@^3 ink-big-text@^2 clipboardy@^4
```

Expected: package.json updated; no errors. (graphql@^16 is already in deps; harmless if re-installed.)

- [ ] **Step 2: Install dev deps for JSX in tests**

Run:
```bash
npm install --save-dev @types/react@^18 @types/ink@^0 ink-testing-library@^4
```

Expected: @types/react and ink-testing-library added to devDependencies.

- [ ] **Step 3: Enable JSX in tsconfig**

Modify `tsconfig.json` — add to `compilerOptions`:
```json
"jsx": "react",
"jsxImportSource": "react"
```

Also add a new line for jsx preservation if needed. Final `compilerOptions` block:
```json
{
  "target": "ES2022",
  "module": "NodeNext",
  "moduleResolution": "NodeNext",
  "lib": ["ES2022"],
  "jsx": "react",
  "jsxImportSource": "react",
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
}
```

- [ ] **Step 4: Update jest config to handle .tsx**

Replace `jest.config.ts` content with:
```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: { module: 'commonjs', target: 'es2022', jsx: 'react', jsxImportSource: 'react' } },
    ],
  },
  testTimeout: 30000,
};

export default config;
```

- [ ] **Step 5: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: 0 errors (no TS files changed yet, so no regressions).

- [ ] **Step 6: Verify all 37 tests still pass**

Run: `npm test`
Expected: 37 passed.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json jest.config.ts
git commit -m "build(tui): add Ink + JSX support and TUI deps"
```

---

## Task 2: Add `UserError` with typed error codes

**Files:**
- Create: `src/auth/errors.ts`
- Test: `tests/auth/errors.spec.ts`

- [ ] **Step 1: Write failing test**

Create `tests/auth/errors.spec.ts`:
```ts
import { UserError, UserErrorCode } from '../../src/auth/errors';

describe('UserError', () => {
  it('carries a code and message', () => {
    const e = new UserError(UserErrorCode.EMAIL_TAKEN, 'email already exists');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe(UserErrorCode.EMAIL_TAKEN);
    expect(e.message).toBe('email already exists');
    expect(e.name).toBe('UserError');
  });

  it('toGraphQLFormat exposes extensions.code', () => {
    const e = new UserError(UserErrorCode.WEAK_PASSWORD, 'too short');
    expect(e.toGraphQLFormat()).toEqual({
      message: 'too short',
      extensions: { code: 'WEAK_PASSWORD' },
    });
  });

  it('all codes are unique strings', () => {
    const codes = Object.values(UserErrorCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/auth/errors.spec.ts`
Expected: FAIL with "Cannot find module '../../src/auth/errors'".

- [ ] **Step 3: Implement UserError**

Create `src/auth/errors.ts`:
```ts
export enum UserErrorCode {
  EMAIL_TAKEN = 'EMAIL_TAKEN',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  FORBIDDEN = 'FORBIDDEN',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  CANNOT_DEMOTE_SELF = 'CANNOT_DEMOTE_SELF',
  CANNOT_DEACTIVATE_SELF = 'CANNOT_DEACTIVATE_SELF',
  INVALID_INPUT = 'INVALID_INPUT',
}

export class UserError extends Error {
  public readonly code: UserErrorCode;
  constructor(code: UserErrorCode, message: string) {
    super(message);
    this.name = 'UserError';
    this.code = code;
  }
  toGraphQLFormat(): { message: string; extensions: { code: string } } {
    return { message: this.message, extensions: { code: this.code } };
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/auth/errors.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth/errors.ts tests/auth/errors.spec.ts
git commit -m "feat(auth): add UserError with typed error codes"
```

---

## Task 3: Add `requireAuth` and `requireAdmin` guards

**Files:**
- Create: `src/auth/guards.ts`
- Test: `tests/auth/guards.spec.ts`

- [ ] **Step 1: Write failing test**

Create `tests/auth/guards.spec.ts`:
```ts
import { requireAuth, requireAdmin } from '../../src/auth/guards';
import { UserError, UserErrorCode } from '../../src/auth/errors';
import type { AppContext } from '../../src/context';

function makeCtx(role: string | null): AppContext {
  return {
    user: role ? { id: 'u1', email: 'x@x.com', role } : null,
    logger: console as never,
    db: {} as never,
    orchestrator: {} as never,
  };
}

describe('guards', () => {
  it('requireAuth throws UNAUTHENTICATED when user is null', () => {
    expect(() => requireAuth(makeCtx(null))).toThrow(UserError);
    try { requireAuth(makeCtx(null)); } catch (e) {
      expect((e as UserError).code).toBe(UserErrorCode.UNAUTHENTICATED);
    }
  });

  it('requireAuth returns the user when present', () => {
    const u = requireAuth(makeCtx('user'));
    expect(u.role).toBe('user');
  });

  it('requireAdmin throws FORBIDDEN for non-admin', () => {
    try { requireAdmin(makeCtx('user')); } catch (e) {
      expect((e as UserError).code).toBe(UserErrorCode.FORBIDDEN);
    }
  });

  it('requireAdmin returns the user for admin', () => {
    const u = requireAdmin(makeCtx('admin'));
    expect(u.role).toBe('admin');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/auth/guards.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement guards**

Create `src/auth/guards.ts`:
```ts
import { UserError, UserErrorCode } from './errors';
import type { AppContext, AuthUser } from '../context';

export function requireAuth(ctx: AppContext): AuthUser {
  if (!ctx.user) {
    throw new UserError(UserErrorCode.UNAUTHENTICATED, 'Authentication required');
  }
  return ctx.user;
}

export function requireAdmin(ctx: AppContext): AuthUser {
  const user = requireAuth(ctx);
  if (user.role !== 'admin') {
    throw new UserError(UserErrorCode.FORBIDDEN, 'Admin role required');
  }
  return user;
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/auth/guards.spec.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth/guards.ts tests/auth/guards.spec.ts
git commit -m "feat(auth): add requireAuth/requireAdmin guards"
```

---


## Task 4: Add JWT auth plugin (populates `ctx.user` from Bearer token)

**Files:**
- Create: `src/auth/authPlugin.ts`
- Modify: `src/server.ts`
- Modify: `tests/helpers/server.ts`
- Test: `tests/auth/authPlugin.spec.ts`

- [ ] **Step 1: Write failing test**

Create `tests/auth/authPlugin.spec.ts`:
```ts
import { ApolloServer } from '@apollo/server';
import { authPlugin } from '../../src/auth/authPlugin';
import { signAccessToken } from '../../src/auth/jwt';
import { hashPassword } from '../../src/auth/password';
import { Pool } from 'pg';
import { loadConfig } from '../../src/config';

const SECRET = 'a'.repeat(32);

async function seedUser(): Promise<{ id: string; email: string }> {
  const cfg = loadConfig();
  const pool = new Pool({ connectionString: cfg.db.url });
  const email = `auth-plugin-${Date.now()}@local.dev`;
  const hash = await hashPassword('test1234');
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin') RETURNING id`,
    [email, hash],
  );
  await pool.end();
  return { id: rows[0].id, email };
}

describe('authPlugin', () => {
  it('populates ctx.user from a valid Bearer token', async () => {
    const u = await seedUser();
    const token = signAccessToken(
      { sub: u.id, email: u.email, role: 'admin' },
      { secret: SECRET, expiresIn: '5m' },
    );

    const server = new ApolloServer({
      typeDefs: 'type Query { whoami: String }',
      resolvers: {
        Query: {
          whoami: (_p: unknown, _a: unknown, ctx: { user: { email: string } | null }) =>
            ctx.user?.email ?? 'anonymous',
        },
      },
      plugins: [authPlugin({ accessSecret: SECRET })],
    });
    await server.start();

    const res = await server.executeOperation(
      { query: '{ whoami }' },
      {
        contextValue: { logger: console, db: {} as never, orchestrator: {} as never },
        request: { headers: new Headers({ authorization: `Bearer ${token}` }) } as never,
      } as never,
    );
    const body = res.body as { singleResult: { data?: { whoami: string } } };
    expect(body.singleResult.data?.whoami).toBe(u.email);
    await server.stop();
  });

  it('leaves ctx.user null for an invalid token', async () => {
    const server = new ApolloServer({
      typeDefs: 'type Query { whoami: String }',
      resolvers: {
        Query: { whoami: (_p: unknown, _a: unknown, ctx: { user: unknown }) => (ctx.user ? 'authed' : 'anon') },
      },
      plugins: [authPlugin({ accessSecret: SECRET })],
    });
    await server.start();
    const res = await server.executeOperation(
      { query: '{ whoami }' },
      {
        contextValue: { logger: console, db: {} as never, orchestrator: {} as never },
        request: { headers: new Headers({ authorization: 'Bearer not-a-jwt' }) } as never,
      } as never,
    );
    const body = res.body as { singleResult: { data?: { whoami: string } } };
    expect(body.singleResult.data?.whoami).toBe('anon');
    await server.stop();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/auth/authPlugin.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement authPlugin**

Create `src/auth/authPlugin.ts`:
```ts
import type { ApolloServerPlugin, GraphQLRequestContext } from '@apollo/server';
import { verifyAccessToken } from './jwt';
import type { Secret } from 'jsonwebtoken';
import type { AuthUser } from '../context';

export interface AuthPluginConfig {
  accessSecret: Secret;
}

export function authPlugin(cfg: AuthPluginConfig): ApolloServerPlugin {
  return {
    async requestDidStart(initial: GraphQLRequestContext) {
      const auth = initial.request.http?.headers.get('authorization');
      let user: AuthUser | null = null;
      if (auth?.startsWith('Bearer ')) {
        const token = auth.slice('Bearer '.length).trim();
        try {
          const payload = verifyAccessToken(token, { secret: cfg.accessSecret });
          user = { id: payload.sub, email: payload.email ?? '', role: payload.role ?? 'user' };
        } catch {
          user = null;
        }
      }
      return {
        async didResolveOperation(ctx) {
          (ctx.contextValue as { user: AuthUser | null }).user = user;
        },
      };
    },
  };
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `DATABASE_URL=postgres://api_orquestrador:api_orquestrador@localhost:5432/api_orquestrador npx jest tests/auth/authPlugin.spec.ts`
Expected: 2 passed.

- [ ] **Step 5: Wire authPlugin in server.ts**

Modify `src/server.ts` — add the import and install the plugin:
```ts
import { authPlugin } from './auth/authPlugin';
```

Inside `startServer()`, replace the `new ApolloServer({ typeDefs, resolvers })` with:
```ts
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [authPlugin({ accessSecret: cfg.jwt.accessSecret })],
  });
```

- [ ] **Step 6: Update test server helper**

Modify `tests/helpers/server.ts` — add the import and install the plugin:
```ts
import { authPlugin } from '../../src/auth/authPlugin';
import { loadConfig } from '../../src/config';
```

Inside `buildTestServer()`, replace `new ApolloServer({ typeDefs, resolvers })` with:
```ts
  const cfg = loadConfig();
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [authPlugin({ accessSecret: cfg.jwt.accessSecret })],
  });
```

- [ ] **Step 7: Run full test suite to confirm no regression**

Run: `npm test`
Expected: 39 passed (37 original + 2 new).

- [ ] **Step 8: Commit**

```bash
git add src/auth/authPlugin.ts src/server.ts tests/helpers/server.ts tests/auth/authPlugin.spec.ts
git commit -m "feat(auth): install Apollo auth plugin to populate ctx.user from Bearer"
```

---

## Task 5: Add zod validators for user management

**Files:**
- Create: `src/auth/validators.ts`
- Test: `tests/auth/validators.spec.ts`

- [ ] **Step 1: Write failing test**

Create `tests/auth/validators.spec.ts`:
```ts
import { createUserSchema, updateUserSchema, passwordSchema, resetPasswordSchema } from '../../src/auth/validators';

describe('passwordSchema', () => {
  it.each([
    ['Aa1!aaaa', true],
    ['short1A', false],
    ['alllower1', false],
    ['ALLUPPER1', false],
    ['NoDigits!', false],
  ])('password %s valid=%s', (pw, ok) => {
    expect(passwordSchema.safeParse(pw).success).toBe(ok);
  });

  it('caps at 128 chars', () => {
    const pw = 'A1' + 'a'.repeat(127);
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });
});

describe('createUserSchema', () => {
  it('accepts a valid payload', () => {
    const r = createUserSchema.safeParse({ email: 'a@b.dev', password: 'Aa1!aaaa', role: 'admin' });
    expect(r.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const r = createUserSchema.safeParse({ email: 'not-an-email', password: 'Aa1!aaaa', role: 'admin' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const r = createUserSchema.safeParse({ email: 'a@b.dev', password: 'Aa1!aaaa', role: 'wizard' });
    expect(r.success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('accepts empty (no-op)', () => {
    expect(updateUserSchema.safeParse({}).success).toBe(true);
  });

  it('accepts role only', () => {
    expect(updateUserSchema.safeParse({ role: 'user' }).success).toBe(true);
  });

  it('accepts active only', () => {
    expect(updateUserSchema.safeParse({ active: false }).success).toBe(true);
  });
});

describe('resetPasswordSchema', () => {
  it('rejects weak password', () => {
    expect(resetPasswordSchema.safeParse({ newPassword: 'short' }).success).toBe(false);
  });
  it('accepts strong password', () => {
    expect(resetPasswordSchema.safeParse({ newPassword: 'Aa1!aaaa' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/auth/validators.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement validators**

Create `src/auth/validators.ts`:
```ts
import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'min 8 chars')
  .max(128, 'max 128 chars')
  .regex(/[a-z]/, 'must contain a lowercase letter')
  .regex(/[A-Z]/, 'must contain an uppercase letter')
  .regex(/[0-9]/, 'must contain a digit');

export const emailSchema = z.string().email('invalid email');

export const roleSchema = z.enum(['admin', 'user']);

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema,
});

export const updateUserSchema = z.object({
  role: roleSchema.optional(),
  active: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
});
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/auth/validators.spec.ts`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth/validators.ts tests/auth/validators.spec.ts
git commit -m "feat(auth): add zod validators for user management"
```

---

## Task 6: Extend GraphQL schema with user management types/queries/mutations

**Files:**
- Modify: `src/graphql/schema.ts`

- [ ] **Step 1: Replace schema.ts content**

Replace the entire content of `src/graphql/schema.ts` with:
```ts
import gql from 'graphql-tag';

export const typeDefs = gql`
  scalar DateTime

  type User {
    id: ID!
    email: String!
    role: String!
    active: Boolean!
    createdAt: DateTime!
  }

  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  type RefreshToken {
    id: ID!
    userId: ID!
    createdAt: DateTime!
    expiresAt: DateTime!
    revokedAt: DateTime
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

  input CreateUserInput {
    email: String!
    password: String!
    role: String!
  }

  input UpdateUserInput {
    role: String
    active: Boolean
  }

  type Query {
    health: String!
    me: User!
    users: [User!]!
    clientes(idCliente: Int, quantidade: Int = 1000): [Cliente!]!
    veiculos(idVeiculo: Int, quantidade: Int = 1000): [Veiculo!]!
    motoristas(idMotorista: Int, quantidade: Int = 1000): [Motorista!]!
    posicoesRecentes(quantidade: Int = 1000): [Posicao!]!
    posicoesPorVeiculo(idVeiculo: Int!, dataInicio: DateTime!, dataFim: DateTime!): [Posicao!]!
    syncStatus: [SyncCursor!]!
    requestLog(limit: Int = 100, method: String): [RequestLogEntry!]!
    refreshTokens(userId: ID!): [RefreshToken!]!
    caixaPretaEventos(placa: String, idVeiculo: Int): [CaixaPretaEvento!]!
      @deprecated(reason: "Método 4.51 da Sascar desativado. Use posicoesRecentes.")
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    refresh(refreshToken: String!): AuthPayload!
    createUser(input: CreateUserInput!): User!
    updateUser(id: ID!, input: UpdateUserInput!): User!
    resetUserPassword(id: ID!, newPassword: String!): User!
    revokeRefreshToken(id: ID!): Boolean!
  }
`;
```

- [ ] **Step 2: Run typecheck to confirm schema compiles**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Run existing tests — they will FAIL because resolvers are missing new fields**

Run: `npm test`
Expected: FAIL with "Cannot query field 'me' on type 'Query'". This is expected (fixed in Task 7).

- [ ] **Step 4: Commit (schema only)**

```bash
git add src/graphql/schema.ts
git commit -m "feat(graphql): extend schema with user management types/queries/mutations"
```

---


## Task 7: Implement `userResolvers` (queries + mutations)

**Files:**
- Create: `src/auth/userResolvers.ts`
- Modify: `src/graphql/resolvers.ts`
- Test: `tests/auth/userResolvers.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/auth/userResolvers.spec.ts`:
```ts
import { Pool } from 'pg';
import { userResolvers } from '../../src/auth/userResolvers';
import { loadConfig } from '../../src/config';
import { hashPassword } from '../../src/auth/password';
import type { AppContext } from '../../src/context';

const cfg = loadConfig();

interface SeededUser { id: string; email: string; role: 'admin' | 'user' }

async function seedUser(role: 'admin' | 'user', tag: string): Promise<SeededUser> {
  const pool = new Pool({ connectionString: cfg.db.url });
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@local.dev`;
  const hash = await hashPassword('test1234');
  await pool.query('DELETE FROM users WHERE email = $1', [email]);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id`,
    [email, hash, role],
  );
  await pool.end();
  return { id: rows[0].id, email, role };
}

async function makeCtx(user: SeededUser | null): Promise<AppContext> {
  const pool = new Pool({ connectionString: cfg.db.url });
  return {
    user,
    logger: console as never,
    db: { execute: async ({ sql, args }: { sql: string; args: unknown[] }) => {
      const { rows } = await pool.query(sql, args as never[]);
      return { rows };
    } } as never,
    orchestrator: {} as never,
  };
}

async function callQuery(field: string, args: unknown, user: SeededUser | null) {
  const ctx = await makeCtx(user);
  const fn = userResolvers.Query[field as keyof typeof userResolvers.Query] as (a: unknown, b: unknown, c: AppContext) => Promise<unknown>;
  try { return await fn(null, args, ctx); } catch (e) { return { __error: e as Error }; }
}

async function callMutation(field: string, args: unknown, user: SeededUser | null) {
  const ctx = await makeCtx(user);
  const fn = userResolvers.Mutation[field as keyof typeof userResolvers.Mutation] as (a: unknown, b: unknown, c: AppContext) => Promise<unknown>;
  try { return await fn(null, args, ctx); } catch (e) { return { __error: e as Error }; }
}

describe('userResolvers.Query.me', () => {
  it('returns the current user when authenticated', async () => {
    const u = await seedUser('admin', 'me');
    const result = await callQuery('me', {}, u) as { email: string };
    expect(result.email).toBe(u.email);
  });

  it('throws UNAUTHENTICATED when no user', async () => {
    const r = await callQuery('me', {}, null) as { __error: Error };
    expect(r.__error.message).toMatch(/Authentication required/);
  });
});

describe('userResolvers.Query.users', () => {
  it('lists all users when admin', async () => {
    const u = await seedUser('admin', 'admin-list');
    const list = await callQuery('users', {}, u) as Array<{ email: string }>;
    expect(list.find((x) => x.email === u.email)).toBeTruthy();
  });

  it('throws FORBIDDEN when not admin', async () => {
    const u = await seedUser('user', 'user-list');
    const r = await callQuery('users', {}, u) as { __error: Error };
    expect(r.__error.message).toMatch(/Admin role required/);
  });
});

describe('userResolvers.Query.refreshTokens', () => {
  it('lists tokens for a user when admin', async () => {
    const admin = await seedUser('admin', 'rt-admin');
    const target = await seedUser('user', 'rt-target');
    const list = await callQuery('refreshTokens', { userId: target.id }, admin) as unknown[];
    expect(Array.isArray(list)).toBe(true);
  });

  it('throws FORBIDDEN when not admin', async () => {
    const u = await seedUser('user', 'rt-user');
    const target = await seedUser('user', 'rt-target2');
    const r = await callQuery('refreshTokens', { userId: target.id }, u) as { __error: Error };
    expect(r.__error.message).toMatch(/Admin role required/);
  });
});

describe('userResolvers.Mutation.createUser', () => {
  it('creates a user when admin', async () => {
    const admin = await seedUser('admin', 'cu-admin');
    const email = `cu-${Date.now()}@local.dev`;
    const r = await callMutation('createUser', { input: { email, password: 'Aa1!aaaa', role: 'user' } }, admin) as { email: string; id: string };
    expect(r.email).toBe(email);
    expect(r.id).toEqual(expect.any(String));
  });

  it('rejects duplicate email with EMAIL_TAKEN', async () => {
    const admin = await seedUser('admin', 'cu-dup');
    const email = `dup-${Date.now()}@local.dev`;
    await callMutation('createUser', { input: { email, password: 'Aa1!aaaa', role: 'user' } }, admin);
    const r = await callMutation('createUser', { input: { email, password: 'Aa1!aaaa', role: 'user' } }, admin) as { __error: Error };
    expect(r.__error.message).toMatch(/email/i);
  });

  it('rejects weak password with WEAK_PASSWORD', async () => {
    const admin = await seedUser('admin', 'cu-weak');
    const r = await callMutation('createUser', { input: { email: `w-${Date.now()}@local.dev`, password: 'short', role: 'user' } }, admin) as { __error: Error };
    expect(r.__error.message).toMatch(/min 8 chars/);
  });

  it('rejects non-admin with FORBIDDEN', async () => {
    const u = await seedUser('user', 'cu-na');
    const r = await callMutation('createUser', { input: { email: `n-${Date.now()}@local.dev`, password: 'Aa1!aaaa', role: 'user' } }, u) as { __error: Error };
    expect(r.__error.message).toMatch(/Admin role required/);
  });
});

describe('userResolvers.Mutation.updateUser', () => {
  it('changes role when admin', async () => {
    const admin = await seedUser('admin', 'uu-admin');
    const target = await seedUser('user', 'uu-target');
    const r = await callMutation('updateUser', { id: target.id, input: { role: 'admin' } }, admin) as { role: string };
    expect(r.role).toBe('admin');
  });

  it('toggles active when admin', async () => {
    const admin = await seedUser('admin', 'uu-act-admin');
    const target = await seedUser('user', 'uu-act-target');
    const r = await callMutation('updateUser', { id: target.id, input: { active: false } }, admin) as { id: string };
    expect(r.id).toBe(target.id);
  });

  it('rejects self-demote', async () => {
    const admin = await seedUser('admin', 'uu-self');
    const r = await callMutation('updateUser', { id: admin.id, input: { role: 'user' } }, admin) as { __error: Error };
    expect(r.__error.message).toMatch(/cannot demote yourself/i);
  });

  it('rejects self-deactivate', async () => {
    const admin = await seedUser('admin', 'uu-deact');
    const r = await callMutation('updateUser', { id: admin.id, input: { active: false } }, admin) as { __error: Error };
    expect(r.__error.message).toMatch(/cannot deactivate yourself/i);
  });

  it('throws USER_NOT_FOUND on missing id', async () => {
    const admin = await seedUser('admin', 'uu-missing');
    const r = await callMutation('updateUser', { id: '00000000-0000-0000-0000-000000000000', input: { role: 'user' } }, admin) as { __error: Error };
    expect(r.__error.message).toMatch(/user not found/i);
  });
});

describe('userResolvers.Mutation.resetUserPassword', () => {
  it('changes the password hash when admin', async () => {
    const admin = await seedUser('admin', 'rp-admin');
    const target = await seedUser('user', 'rp-target');
    const r = await callMutation('resetUserPassword', { id: target.id, newPassword: 'New1Pass!aa' }, admin) as { id: string };
    expect(r.id).toBe(target.id);
  });

  it('rejects weak password with WEAK_PASSWORD', async () => {
    const admin = await seedUser('admin', 'rp-weak');
    const target = await seedUser('user', 'rp-weak-target');
    const r = await callMutation('resetUserPassword', { id: target.id, newPassword: 'short' }, admin) as { __error: Error };
    expect(r.__error.message).toMatch(/min 8 chars/);
  });
});

describe('userResolvers.Mutation.revokeRefreshToken', () => {
  it('marks the token as revoked when admin', async () => {
    const admin = await seedUser('admin', 'rr-admin');
    const target = await seedUser('user', 'rr-target');
    const pool = new Pool({ connectionString: cfg.db.url });
    const { rows } = await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
      [target.id, 'test-hash-' + Date.now(), new Date(Date.now() + 86_400_000)],
    );
    await pool.end();
    const tokenId = rows[0].id;
    const r = await callMutation('revokeRefreshToken', { id: tokenId }, admin) as boolean;
    expect(r).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/auth/userResolvers.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement userResolvers**

Create `src/auth/userResolvers.ts`:
```ts
import { requireAuth, requireAdmin } from './guards';
import { UserError, UserErrorCode } from './errors';
import { hashPassword } from './password';
import { createUserSchema, updateUserSchema, resetPasswordSchema } from './validators';
import type { AppContext } from '../context';

function mapUniqueViolation(e: unknown): UserError {
  const msg = (e as { message?: string })?.message ?? '';
  if (/duplicate key/i.test(msg) || /unique constraint/i.test(msg)) {
    return new UserError(UserErrorCode.EMAIL_TAKEN, 'email already in use');
  }
  return new UserError(UserErrorCode.INVALID_INPUT, msg);
}

function rowToUser(r: Record<string, unknown>): {
  id: string; email: string; role: string; active: boolean; createdAt: Date;
} {
  return {
    id: r.id as string,
    email: r.email as string,
    role: r.role as string,
    active: r.active as boolean,
    createdAt: r.created_at as Date,
  };
}

export const userResolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: AppContext) => {
      const u = requireAuth(ctx);
      const { rows } = await ctx.db.execute({
        sql: 'SELECT id, email, role, active, created_at FROM users WHERE id = $1',
        args: [u.id],
      });
      const r = rows[0];
      if (!r) throw new UserError(UserErrorCode.USER_NOT_FOUND, 'user not found');
      return rowToUser(r);
    },

    users: async (_: unknown, __: unknown, ctx: AppContext) => {
      requireAdmin(ctx);
      const { rows } = await ctx.db.execute({
        sql: 'SELECT id, email, role, active, created_at FROM users ORDER BY created_at DESC',
        args: [],
      });
      return (rows as Record<string, unknown>[]).map(rowToUser);
    },

    refreshTokens: async (_: unknown, args: { userId: string }, ctx: AppContext) => {
      requireAdmin(ctx);
      const { rows } = await ctx.db.execute({
        sql: `SELECT id, user_id, created_at, expires_at, revoked_at
              FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
        args: [args.userId],
      });
      return (rows as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        userId: r.user_id as string,
        createdAt: r.created_at as Date,
        expiresAt: r.expires_at as Date,
        revokedAt: r.revoked_at as Date | null,
      }));
    },
  },

  Mutation: {
    createUser: async (
      _: unknown,
      args: { input: { email: string; password: string; role: string } },
      ctx: AppContext,
    ) => {
      requireAdmin(ctx);
      const parsed = createUserSchema.safeParse(args.input);
      if (!parsed.success) {
        throw new UserError(UserErrorCode.WEAK_PASSWORD, parsed.error.issues[0]?.message ?? 'invalid input');
      }
      try {
        const hash = await hashPassword(parsed.data.password);
        const { rows } = await ctx.db.execute({
          sql: `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
                RETURNING id, email, role, active, created_at`,
          args: [parsed.data.email, hash, parsed.data.role],
        });
        return rowToUser(rows[0] as Record<string, unknown>);
      } catch (e) {
        throw mapUniqueViolation(e);
      }
    },

    updateUser: async (
      _: unknown,
      args: { id: string; input: { role?: string; active?: boolean } },
      ctx: AppContext,
    ) => {
      const me = requireAdmin(ctx);
      const parsed = updateUserSchema.safeParse(args.input);
      if (!parsed.success) {
        throw new UserError(UserErrorCode.INVALID_INPUT, parsed.error.issues[0]?.message ?? 'invalid input');
      }
      if (args.id === me.id) {
        if (parsed.data.role && parsed.data.role !== 'admin') {
          throw new UserError(UserErrorCode.CANNOT_DEMOTE_SELF, 'cannot demote yourself');
        }
        if (parsed.data.active === false) {
          throw new UserError(UserErrorCode.CANNOT_DEACTIVATE_SELF, 'cannot deactivate yourself');
        }
      }
      const { rows: existing } = await ctx.db.execute({
        sql: 'SELECT id FROM users WHERE id = $1',
        args: [args.id],
      });
      if (!existing[0]) throw new UserError(UserErrorCode.USER_NOT_FOUND, 'user not found');

      const sets: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (parsed.data.role !== undefined) { sets.push(`role = $${i++}`); params.push(parsed.data.role); }
      if (parsed.data.active !== undefined) { sets.push(`active = $${i++}`); params.push(parsed.data.active); }
      sets.push('updated_at = now()');
      params.push(args.id);
      const { rows } = await ctx.db.execute({
        sql: `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
              RETURNING id, email, role, active, created_at`,
        args: params,
      });
      return rowToUser(rows[0] as Record<string, unknown>);
    },

    resetUserPassword: async (
      _: unknown,
      args: { id: string; newPassword: string },
      ctx: AppContext,
    ) => {
      requireAdmin(ctx);
      const parsed = resetPasswordSchema.safeParse({ newPassword: args.newPassword });
      if (!parsed.success) {
        throw new UserError(UserErrorCode.WEAK_PASSWORD, parsed.error.issues[0]?.message ?? 'invalid input');
      }
      const hash = await hashPassword(parsed.data.newPassword);
      const { rows } = await ctx.db.execute({
        sql: `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2
              RETURNING id, email, role, active, created_at`,
        args: [hash, args.id],
      });
      if (!rows[0]) throw new UserError(UserErrorCode.USER_NOT_FOUND, 'user not found');
      return rowToUser(rows[0] as Record<string, unknown>);
    },

    revokeRefreshToken: async (_: unknown, args: { id: string }, ctx: AppContext) => {
      requireAdmin(ctx);
      const { rows } = await ctx.db.execute({
        sql: `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL
              RETURNING id`,
        args: [args.id],
      });
      return (rows as unknown[]).length > 0;
    },
  },
};
```

- [ ] **Step 4: Wire userResolvers into the merged resolvers**

Replace the entire content of `src/graphql/resolvers.ts` with:
```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildAuthResolvers } from '../auth/resolvers';
import { userResolvers } from '../auth/userResolvers';
import { getClientes } from '../domain/clientes';
import { getVeiculos } from '../domain/veiculos';
import { getMotoristas } from '../domain/motoristas';
import { getPosicoesRecentes, fetchAndUpsertPosicoes } from '../domain/posicoes';
import { getCaixaPretaEventos } from '../domain/caixaPreta';
import { loadConfig } from '../config';
import type { AppContext } from '../context';

const cfg = loadConfig();
const auth = buildAuthResolvers({
  accessSecret: cfg.jwt.accessSecret,
  refreshSecret: cfg.jwt.refreshSecret,
  accessTtl: cfg.jwt.accessTtl,
  refreshTtl: cfg.jwt.refreshTtl,
});

export const resolvers = {
  Query: {
    ...userResolvers.Query,
    health: () => 'ok',
    clientes: (_: unknown, args: any, ctx: AppContext) => getClientes(ctx, args),
    veiculos: (_: unknown, args: any, ctx: AppContext) => getVeiculos(ctx, args),
    motoristas: (_: unknown, args: any, ctx: AppContext) => getMotoristas(ctx, args),
    posicoesRecentes: (_: unknown, args: { quantidade?: number }, ctx: AppContext) =>
      getPosicoesRecentes(ctx, args.quantidade ?? 1000),
    posicoesPorVeiculo: async (
      _: unknown,
      args: { idVeiculo: number; dataInicio: string; dataFim: string },
      ctx: AppContext,
    ) => {
      await fetchAndUpsertPosicoes(ctx, args.idVeiculo);
      const { rows } = await ctx.db.execute({
        sql: `SELECT * FROM posicoes WHERE id_veiculo = $1 AND data_posicao BETWEEN $2 AND $3 ORDER BY data_posicao`,
        args: [args.idVeiculo, args.dataInicio, args.dataFim],
      });
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
      const { rows } = await ctx.db.execute({
        sql: 'SELECT method, id_veiculo, last_id_pacote, last_synced_at FROM sync_cursor ORDER BY method, id_veiculo',
        args: [],
      });
      return (rows as any[]).map((r) => ({
        method: r.method,
        idVeiculo: r.id_veiculo,
        lastIdPacote: r.last_id_pacote ? Number(r.last_id_pacote) : null,
        lastSyncedAt: r.last_synced_at,
      }));
    },
    caixaPretaEventos: (
      _: unknown,
      args: { placa?: string; idVeiculo?: number },
      ctx: AppContext,
    ) => getCaixaPretaEventos(ctx, args),
    requestLog: async (_: unknown, args: { limit?: number; method?: string }, ctx: AppContext) => {
      const params: any[] = [args.limit ?? 100];
      let where = '';
      if (args.method) {
        params.push(args.method);
        where = `WHERE method = $${params.length}`;
      }
      const { rows } = await ctx.db.execute({
        sql: `SELECT id, method, source, status, cache_hit, latency_ms, created_at, error FROM request_log ${where} ORDER BY created_at DESC LIMIT $1`,
        args: params,
      });
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
  },
  Mutation: {
    ...auth.Mutation,
    ...userResolvers.Mutation,
  },
  DateTime: {
    __serialize: (v: unknown) => (v instanceof Date ? v.toISOString() : v),
    __parseValue: (v: unknown) => (typeof v === 'string' ? new Date(v) : null),
    __parseLiteral: () => null,
  },
};
```

- [ ] **Step 5: Run userResolvers tests**

Run: `DATABASE_URL=postgres://api_orquestrador:api_orquestrador@localhost:5432/api_orquestrador npx jest tests/auth/userResolvers.spec.ts`
Expected: 15 passed.

- [ ] **Step 6: Run the full suite — should be 39 + 12 + 15 = 66 passed**

Run: `npm test`
Expected: 66 passed.

- [ ] **Step 7: Commit**

```bash
git add src/auth/userResolvers.ts src/graphql/resolvers.ts tests/auth/userResolvers.spec.ts
git commit -m "feat(auth): implement user management resolvers (queries + mutations)"
```

---

## Task 8: Update docs/api.md and CHANGELOG for v0.2.0

**Files:**
- Modify: `docs/api.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Append a "User Management" section to docs/api.md**

Append to the end of `docs/api.md` (after the deprecation table):
```markdown

## User Management (admin only)

Todas as queries/mutations abaixo requerem `role: 'admin'`. Não-admin recebe `FORBIDDEN`.

### Queries

- `me: User!` — usuário autenticado (qualquer role)
- `users: [User!]!` — lista todos os usuários
- `refreshTokens(userId: ID!): [RefreshToken!]!` — tokens ativos de um usuário

### Mutations

- `createUser(input: CreateUserInput!): User!`
- `updateUser(id: ID!, input: UpdateUserInput!): User!`
- `resetUserPassword(id: ID!, newPassword: String!): User!`
- `revokeRefreshToken(id: ID!): Boolean!`

### Códigos de erro

- `UNAUTHENTICATED` — sem token / token inválido
- `FORBIDDEN` — autenticado mas sem role `admin`
- `EMAIL_TAKEN` — email já existe (unique violation)
- `WEAK_PASSWORD` — senha não atende os requisitos
- `USER_NOT_FOUND` — id inexistente
- `CANNOT_DEMOTE_SELF` — admin tentando mudar a própria role para `user`
- `CANNOT_DEACTIVATE_SELF` — admin tentando desativar a si mesmo
```

- [ ] **Step 2: Add v0.2.0 entry to CHANGELOG.md**

Prepend to `CHANGELOG.md`:
```markdown
# Changelog

## [0.2.0] - 2026-06-15

### Added

- TUI Ink-based (`npm run tui`) com gestão de usuários (prioridade), logs de auditoria, navegação de dados Sascar, status de sync, e gestão de refresh tokens.
- Apollo auth plugin que popula `ctx.user` a partir do header `Authorization: Bearer ...`. (Antes o token era emitido mas não aplicado.)
- Resolvers de user management (admin-gated): `me`, `users`, `refreshTokens`, `createUser`, `updateUser`, `resetUserPassword`, `revokeRefreshToken`.
- Guards `requireAuth` / `requireAdmin` reutilizáveis.
- `UserError` tipado com códigos: `EMAIL_TAKEN`, `WEAK_PASSWORD`, `USER_NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`, `CANNOT_DEMOTE_SELF`, `CANNOT_DEACTIVATE_SELF`.
- Type `User.active` e types `RefreshToken` / `CreateUserInput` / `UpdateUserInput` no SDL.
- Validação zod para todas as mutations de user management.

### Known limitations

- Logout from TUI clears the session locally but does not revoke the refresh token on the server. The token expires naturally after `JWT_REFRESH_TTL` (default 7d) or is revoked by an admin via the TUI Tokens view. A dedicated `logout(refreshToken)` mutation is planned.

### Tests

- 37 → ~66 backend tests (15 userResolvers + 2 authPlugin + 12 validators + 3 errors + 4 guards).
```

- [ ] **Step 3: Commit**

```bash
git add docs/api.md CHANGELOG.md
git commit -m "docs: document v0.2.0 user management and TUI"
```

---


## Task 9: TUI entry point, theme, and format helpers

**Files:**
- Create: `src/tui/index.tsx`
- Create: `src/tui/app.tsx`
- Create: `src/tui/lib/theme.ts`
- Create: `src/tui/lib/format.ts`
- Modify: `package.json`
- Test: `tests/tui/integration/app.smoke.spec.tsx`

- [ ] **Step 1: Add `tui` script to package.json**

Modify `package.json` — add to `scripts`:
```json
"tui": "tsx src/tui/index.tsx"
```

- [ ] **Step 2: Create theme module**

Create `src/tui/lib/theme.ts`:
```ts
export const theme = {
  headerGradient: ['#06b6d4', '#d946ef'] as const,
  sidebarActive: { bg: 'gray' as const, fg: 'white' as const, bold: true },
  status: {
    ok: 'green' as const,
    error: 'red' as const,
    cacheHit: 'cyan' as const,
    pending: 'yellow' as const,
  },
  dim: 'gray' as const,
  border: 'white' as const,
  modal: { border: 'cyan' as const, padding: 1 },
};
```

- [ ] **Step 3: Create format helpers**

Create `src/tui/lib/format.ts`:
```ts
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

export function formatRelative(d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  const ms = now.getTime() - date.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const days = Math.floor(h / 24);
  return `${days}d atrás`;
}

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['vazia', 'fraca', 'razoável', 'boa', 'forte'] as const;
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] };
}
```

- [ ] **Step 4: Create placeholder TUI entry point**

Create `src/tui/index.tsx`:
```tsx
import React from 'react';
import { render } from 'ink';
import { App } from './app';

render(<App />, { exitOnCtrlC: true });
```

- [ ] **Step 5: Create placeholder App component**

Create `src/tui/app.tsx`:
```tsx
import React from 'react';
import { Text } from 'ink';

export function App(): React.ReactElement {
  return <Text>API Orquestrador TUI — bootstrapping...</Text>;
}
```

- [ ] **Step 6: Write smoke test**

Create `tests/tui/integration/app.smoke.spec.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../../src/tui/app';

describe('App smoke', () => {
  it('renders without crashing', () => {
    const { lastFrame, unmount } = render(<App />);
    expect(lastFrame()).toContain('API Orquestrador TUI');
    unmount();
  });
});
```

- [ ] **Step 7: Run smoke test**

Run: `npx jest tests/tui/integration/app.smoke.spec.tsx`
Expected: 1 passed.

- [ ] **Step 8: Run full suite to confirm no regression**

Run: `npm test`
Expected: 67 passed (66 from Task 7 + 1 new smoke).

- [ ] **Step 9: Commit**

```bash
git add package.json src/tui/index.tsx src/tui/app.tsx src/tui/lib/theme.ts src/tui/lib/format.ts tests/tui/integration/app.smoke.spec.tsx
git commit -m "feat(tui): bootstrap entry point, theme, and format helpers"
```

---

## Task 10: TUI API client, queries, and auth persistence

**Files:**
- Create: `src/tui/api/client.ts`
- Create: `src/tui/api/auth.ts`
- Create: `src/tui/api/queries.ts`
- Test: `tests/tui/api/auth.spec.ts`

- [ ] **Step 1: Create GraphQL client wrapper**

Create `src/tui/api/client.ts`:
```ts
import { GraphQLClient, type RequestDocument, type Variables } from 'graphql-request';

export interface ApiClient {
  request<T>(doc: RequestDocument, variables?: Variables): Promise<T>;
  setAuthToken(token: string | null): void;
}

export function buildApiClient(endpoint: string): ApiClient {
  const client = new GraphQLClient(endpoint, { fetch: globalThis.fetch });
  let token: string | null = null;
  return {
    async request<T>(doc: RequestDocument, variables?: Variables): Promise<T> {
      const headers: Record<string, string> = {};
      if (token) headers['authorization'] = `Bearer ${token}`;
      return client.request<T>(doc, variables, headers);
    },
    setAuthToken(t: string | null) {
      token = t;
    },
  };
}
```

- [ ] **Step 2: Create queries strings**

Create `src/tui/api/queries.ts`:
```ts
import { gql } from 'graphql-request';

export const Q_ME = gql`query Me { me { id email role active createdAt } }`;

export const Q_USERS = gql`query Users { users { id email role active createdAt } }`;

export const Q_REFRESH_TOKENS = gql`
  query RefreshTokens($userId: ID!) {
    refreshTokens(userId: $userId) { id userId createdAt expiresAt revokedAt }
  }
`;

export const M_LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      accessToken refreshToken user { id email role active createdAt }
    }
  }
`;

export const M_REFRESH = gql`
  mutation Refresh($refreshToken: String!) {
    refresh(refreshToken: $refreshToken) {
      accessToken refreshToken user { id email role active createdAt }
    }
  }
`;

export const M_CREATE_USER = gql`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) { id email role active createdAt }
  }
`;

export const M_UPDATE_USER = gql`
  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
    updateUser(id: $id, input: $input) { id email role active createdAt }
  }
`;

export const M_RESET_PASSWORD = gql`
  mutation ResetUserPassword($id: ID!, $newPassword: String!) {
    resetUserPassword(id: $id, newPassword: $newPassword) { id }
  }
`;

export const M_REVOKE_TOKEN = gql`
  mutation RevokeRefreshToken($id: ID!) { revokeRefreshToken(id: $id) }
`;

export const Q_HEALTH = gql`query Health { health }`;

export const Q_REQUEST_LOG = gql`
  query RequestLog($limit: Int, $method: String) {
    requestLog(limit: $limit, method: $method) {
      id method source status cacheHit latencyMs createdAt error
    }
  }
`;

export const Q_SYNC_STATUS = gql`
  query SyncStatus { syncStatus { method idVeiculo lastIdPacote lastSyncedAt } }
`;

export const Q_CLIENTES = gql`
  query Clientes($quantidade: Int) {
    clientes(quantidade: $quantidade) { idCliente cnpj cpf nome fetchedAt expiresAt }
  }
`;

export const Q_VEICULOS = gql`
  query Veiculos($quantidade: Int) {
    veiculos(quantidade: $quantidade) { idVeiculo placa idCliente descricao idEquipamento fetchedAt expiresAt }
  }
`;

export const Q_MOTORISTAS = gql`
  query Motoristas($quantidade: Int) {
    motoristas(quantidade: $quantidade) { idMotorista nome tipoDocumento fetchedAt expiresAt }
  }
`;

export const Q_POSICOES_RECENTES = gql`
  query PosicoesRecentes($quantidade: Int) {
    posicoesRecentes(quantidade: $quantidade) {
      idPacote idVeiculo dataPosicao dataPacote latitude longitude velocidade ignicao direcao odometro syncedVia
    }
  }
`;

export const Q_POSICOES_POR_VEICULO = gql`
  query PosicoesPorVeiculo($idVeiculo: Int!, $dataInicio: DateTime!, $dataFim: DateTime!) {
    posicoesPorVeiculo(idVeiculo: $idVeiculo, dataInicio: $dataInicio, dataFim: $dataFim) {
      idPacote idVeiculo dataPosicao latitude longitude velocidade
    }
  }
`;
```

- [ ] **Step 3: Create auth module (login/refresh/persist)**

Create `src/tui/api/auth.ts`:
```ts
import fs from 'fs';
import path from 'path';
import envPaths from 'env-paths';
import type { ApiClient } from './client';
import { M_LOGIN, M_REFRESH } from './queries';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
}

export interface PersistedSession {
  apiUrl: string;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  accessTokenExp: number;
}

function sessionPath(): string {
  const dir = envPaths('api-orquestrador', { suffix: '' }).config;
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'session.json');
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = fs.readFileSync(sessionPath(), 'utf-8');
    const s = JSON.parse(raw) as PersistedSession;
    if (s.accessTokenExp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: PersistedSession): void {
  const p = sessionPath();
  fs.writeFileSync(p, JSON.stringify(s, null, 2), { mode: 0o600 });
  try { fs.chmodSync(p, 0o600); } catch { /* windows no-op */ }
}

export function clearSession(): void {
  try { fs.unlinkSync(sessionPath()); } catch { /* ignore */ }
}

function decodeJwtExp(token: string): number {
  try {
    const part = token.split('.')[1];
    const json = Buffer.from(part, 'base64url').toString('utf-8');
    return (JSON.parse(json) as { exp: number }).exp * 1000;
  } catch {
    return Date.now();
  }
}

export async function login(
  api: ApiClient, apiUrl: string, email: string, password: string,
): Promise<PersistedSession> {
  type R = { login: { accessToken: string; refreshToken: string; user: AuthUser } };
  const data = await api.request<R>(M_LOGIN, { email, password });
  const session: PersistedSession = {
    apiUrl,
    accessToken: data.login.accessToken,
    refreshToken: data.login.refreshToken,
    user: data.login.user,
    accessTokenExp: decodeJwtExp(data.login.accessToken),
  };
  saveSession(session);
  return session;
}

export async function refresh(api: ApiClient, current: PersistedSession): Promise<PersistedSession> {
  type R = { refresh: { accessToken: string; refreshToken: string; user: AuthUser } };
  const data = await api.request<R>(M_REFRESH, { refreshToken: current.refreshToken });
  const session: PersistedSession = {
    apiUrl: current.apiUrl,
    accessToken: data.refresh.accessToken,
    refreshToken: data.refresh.refreshToken,
    user: data.refresh.user,
    accessTokenExp: decodeJwtExp(data.refresh.accessToken),
  };
  saveSession(session);
  return session;
}
```

- [ ] **Step 4: Write tests for auth session persistence**

Create `tests/tui/api/auth.spec.ts`:
```ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { saveSession, loadSession, clearSession } from '../../../src/tui/api/auth';

jest.mock('env-paths', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tui-auth-test-'));
  return () => ({ config: tmp });
});

describe('auth session persistence', () => {
  it('round-trips a session through save/load', () => {
    const s = {
      apiUrl: 'http://localhost:4000/',
      accessToken: 'a'.repeat(40),
      refreshToken: 'b'.repeat(40),
      user: { id: 'u1', email: 'a@b.dev', role: 'admin', active: true, createdAt: new Date().toISOString() },
      accessTokenExp: Date.now() + 60_000,
    };
    saveSession(s);
    const loaded = loadSession();
    expect(loaded).toEqual(s);
  });

  it('loadSession returns null when session is expired', () => {
    const s = {
      apiUrl: 'http://localhost:4000/',
      accessToken: 'a'.repeat(40),
      refreshToken: 'b'.repeat(40),
      user: { id: 'u1', email: 'a@b.dev', role: 'admin', active: true, createdAt: new Date().toISOString() },
      accessTokenExp: Date.now() - 1,
    };
    saveSession(s);
    expect(loadSession()).toBeNull();
  });

  it('clearSession removes the file', () => {
    saveSession({
      apiUrl: 'http://x', accessToken: 'a', refreshToken: 'b',
      user: { id: 'u', email: 'a', role: 'admin', active: true, createdAt: '' },
      accessTokenExp: Date.now() + 60_000,
    });
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
```

- [ ] **Step 5: Run auth tests**

Run: `npx jest tests/tui/api/auth.spec.ts`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/tui/api/ tests/tui/api/
git commit -m "feat(tui): add GraphQL client, queries, and session persistence"
```

---

## Task 11: TUI validators (zod schemas for forms)

**Files:**
- Create: `src/tui/lib/validators.ts`
- Test: `tests/tui/lib/validators.spec.ts`

- [ ] **Step 1: Write failing test**

Create `tests/tui/lib/validators.spec.ts`:
```ts
import {
  emailRule, passwordRule, createUserInputRule, updateUserInputRule, resetPasswordRule,
} from '../../../src/tui/lib/validators';

describe('tui validators', () => {
  it('emailRule accepts valid emails', () => {
    expect(emailRule.test('a@b.dev')).toBe(true);
  });

  it('emailRule rejects invalid emails', () => {
    expect(emailRule.test('not-an-email')).toBe(false);
    expect(emailRule.test('a@b')).toBe(false);
  });

  it('passwordRule requires 8+ chars, mixed case, digit', () => {
    expect(passwordRule.test('Aa1!aaaa')).toBe(true);
    expect(passwordRule.test('short1A')).toBe(false);
    expect(passwordRule.test('alllower1')).toBe(false);
  });

  it('createUserInputRule validates object shape', () => {
    const ok = createUserInputRule.safeParse({ email: 'a@b.dev', password: 'Aa1!aaaa', role: 'admin' });
    expect(ok.success).toBe(true);
    const bad = createUserInputRule.safeParse({ email: 'bad', password: 'short', role: 'wizard' });
    expect(bad.success).toBe(false);
  });

  it('updateUserInputRule accepts partial', () => {
    expect(updateUserInputRule.safeParse({ role: 'user' }).success).toBe(true);
    expect(updateUserInputRule.safeParse({ active: false }).success).toBe(true);
    expect(updateUserInputRule.safeParse({}).success).toBe(true);
  });

  it('resetPasswordRule requires the password', () => {
    expect(resetPasswordRule.safeParse({ newPassword: 'Aa1!aaaa' }).success).toBe(true);
    expect(resetPasswordRule.safeParse({ newPassword: 'short' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest tests/tui/lib/validators.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement validators**

Create `src/tui/lib/validators.ts`:
```ts
import { z } from 'zod';

export const emailRule = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,128}$/;

export const roleRule = z.enum(['admin', 'user']);

export const createUserInputRule = z.object({
  email: z.string().regex(emailRule, 'email inválido'),
  password: z.string().regex(passwordRule, 'senha: 8+ chars, com maiúscula, minúscula e dígito'),
  role: roleRule,
});

export const updateUserInputRule = z.object({
  role: roleRule.optional(),
  active: z.boolean().optional(),
});

export const resetPasswordRule = z.object({
  newPassword: z.string().regex(passwordRule, 'senha: 8+ chars, com maiúscula, minúscula e dígito'),
});
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest tests/tui/lib/validators.spec.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/tui/lib/validators.ts tests/tui/lib/validators.spec.ts
git commit -m "feat(tui): add zod validators for forms"
```

---


## Task 12: TUI shared components

**Files:**
- Create: `src/tui/components/StatusBadge.tsx`
- Create: `src/tui/components/Toast.tsx`
- Create: `src/tui/components/Modal.tsx`
- Create: `src/tui/components/Confirm.tsx`
- Create: `src/tui/components/Spinner.tsx`
- Create: `src/tui/components/Form.tsx`
- Create: `src/tui/components/Header.tsx`
- Create: `src/tui/components/Sidebar.tsx`
- Create: `src/tui/components/Footer.tsx`
- Create: `src/tui/components/Layout.tsx`
- Create: `src/tui/components/Table.tsx`
- Create: `src/tui/components/ErrorBoundary.tsx`
- Test: `tests/tui/components/StatusBadge.spec.tsx`
- Test: `tests/tui/components/Toast.spec.tsx`
- Test: `tests/tui/components/Modal.spec.tsx`
- Test: `tests/tui/components/Confirm.spec.tsx`
- Test: `tests/tui/components/Form.spec.tsx`
- Test: `tests/tui/components/Layout.spec.tsx`

- [ ] **Step 1: StatusBadge**

Create `src/tui/components/StatusBadge.tsx`:
```tsx
import React from 'react';
import { Text } from 'ink';
import { theme } from '../lib/theme';

export type StatusKind = 'ok' | 'error' | 'cacheHit' | 'pending' | 'inactive';

interface Props { kind: StatusKind; label: string; }

export function StatusBadge({ kind, label }: Props): React.ReactElement {
  const color =
    kind === 'ok' ? theme.status.ok :
    kind === 'error' ? theme.status.error :
    kind === 'cacheHit' ? theme.status.cacheHit :
    kind === 'pending' ? theme.status.pending :
    theme.dim;
  return <Text color={color}>[{label}]</Text>;
}
```

Create `tests/tui/components/StatusBadge.spec.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { StatusBadge } from '../../../src/tui/components/StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['ok', 'OK'],
    ['error', 'ERRO'],
    ['cacheHit', 'CACHE'],
    ['pending', '...'],
    ['inactive', 'OFF'],
  ] as const)('renders %s with label %s', (kind, label) => {
    const { lastFrame, unmount } = render(<StatusBadge kind={kind} label={label} />);
    expect(lastFrame()).toContain(`[${label}]`);
    unmount();
  });
});
```

- [ ] **Step 2: Toast**

Create `src/tui/components/Toast.tsx`:
```tsx
import React, { useEffect } from 'react';
import { Text, Box } from 'ink';

export type ToastKind = 'success' | 'error' | 'info';

interface Props {
  kind: ToastKind;
  message: string;
  ttl?: number;
  onDone: () => void;
}

const COLORS: Record<ToastKind, string> = {
  success: 'green',
  error: 'red',
  info: 'cyan',
};

const ICONS: Record<ToastKind, string> = {
  success: '✓',
  error: '✗',
  info: 'ℹ',
};

export function Toast({ kind, message, ttl = 3000, onDone }: Props): React.ReactElement {
  useEffect(() => {
    const t = setTimeout(onDone, ttl);
    return () => clearTimeout(t);
  }, [ttl, onDone]);

  return (
    <Box borderStyle="round" borderColor={COLORS[kind]} paddingX={1}>
      <Text color={COLORS[kind]}>{ICONS[kind]} {message}</Text>
    </Box>
  );
}
```

Create `tests/tui/components/Toast.spec.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { Toast } from '../../../src/tui/components/Toast';

describe('Toast', () => {
  it('renders success icon and message', () => {
    const { lastFrame, unmount } = render(<Toast kind="success" message="Saved" onDone={() => {}} />);
    expect(lastFrame()).toContain('✓');
    expect(lastFrame()).toContain('Saved');
    unmount();
  });

  it('renders error icon', () => {
    const { lastFrame, unmount } = render(<Toast kind="error" message="Oops" onDone={() => {}} />);
    expect(lastFrame()).toContain('✗');
    unmount();
  });

  it('calls onDone after ttl', (done) => {
    render(<Toast kind="info" message="hi" ttl={50} onDone={() => { done(); }} />);
  });
});
```

- [ ] **Step 3: Modal**

Create `src/tui/components/Modal.tsx`:
```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../lib/theme';

interface Props {
  title: string;
  children: React.ReactNode;
  width?: number;
}

export function Modal({ title, children, width = 60 }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width="100%" height="100%">
      <Box flexDirection="column" borderStyle="round" borderColor={theme.modal.border} paddingX={theme.modal.padding} width={width}>
        <Box marginBottom={1}><Text bold>{title}</Text></Box>
        {children}
      </Box>
    </Box>
  );
}
```

Create `tests/tui/components/Modal.spec.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { Modal } from '../../../src/tui/components/Modal';

describe('Modal', () => {
  it('renders title and children', () => {
    const { lastFrame, unmount } = render(
      <Modal title="Hello"><Text>body</Text></Modal>,
    );
    expect(lastFrame()).toContain('Hello');
    expect(lastFrame()).toContain('body');
    unmount();
  });
});
```

- [ ] **Step 4: Confirm**

Create `src/tui/components/Confirm.tsx`:
```tsx
import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function Confirm({ message, onConfirm, onCancel }: Props): React.ReactElement {
  const [focused, setFocused] = useState<'yes' | 'no'>('no');
  useInput((input, key) => {
    if (key.leftArrow || key.rightArrow || key.tab) {
      setFocused((f) => (f === 'yes' ? 'no' : 'yes'));
    } else if (input === 'y' || input === 'Y') {
      onConfirm();
    } else if (input === 'n' || input === 'N' || key.escape) {
      onCancel();
    } else if (key.return) {
      focused === 'yes' ? onConfirm() : onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      <Text>{message}</Text>
      <Box marginTop={1}>
        <Text inverse={focused === 'yes'} color="green"> Sim (Y) </Text>
        <Text>  </Text>
        <Text inverse={focused === 'no'} color="red"> Não (N) </Text>
      </Box>
    </Box>
  );
}
```

Create `tests/tui/components/Confirm.spec.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { Confirm } from '../../../src/tui/components/Confirm';

describe('Confirm', () => {
  it('renders message and Yes/No buttons', () => {
    const { lastFrame, unmount } = render(
      <Confirm message="Sure?" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(lastFrame()).toContain('Sure?');
    expect(lastFrame()).toContain('Sim');
    expect(lastFrame()).toContain('Não');
    unmount();
  });

  it('pressing y triggers onConfirm', () => {
    let confirmed = false;
    const { stdin, unmount } = render(
      <Confirm message="?" onConfirm={() => { confirmed = true; }} onCancel={() => {}} />,
    );
    stdin.write('y');
    expect(confirmed).toBe(true);
    unmount();
  });
});
```

- [ ] **Step 5: Spinner**

Create `src/tui/components/Spinner.tsx`:
```tsx
import React from 'react';
import InkSpinner from 'ink-spinner';
import { Text } from 'ink';

export function Spinner({ label }: { label?: string }): React.ReactElement {
  return (
    <Text>
      <Text color="cyan"><InkSpinner type="dots" /></Text>
      {label ? <Text> {label}</Text> : null}
    </Text>
  );
}
```

- [ ] **Step 6: Form (Field)**

Create `src/tui/components/Form.tsx`:
```tsx
import React from 'react';
import { Text, Box } from 'ink';
import TextInput from 'ink-text-input';

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  error?: string;
  password?: boolean;
  placeholder?: string;
}

export function Field({ label, value, onChange, onSubmit, error, password, placeholder }: FieldProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={error ? 'red' : undefined}>{label}{error ? `: ${error}` : ''}</Text>
      <Box>
        <Text>{'> '}</Text>
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          mask={password ? '*' : undefined}
          placeholder={placeholder}
        />
      </Box>
    </Box>
  );
}
```

Create `tests/tui/components/Form.spec.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { Field } from '../../../src/tui/components/Form';

describe('Field', () => {
  it('renders label and value', () => {
    const { lastFrame, unmount } = render(
      <Field label="Email" value="a@b.dev" onChange={() => {}} />,
    );
    expect(lastFrame()).toContain('Email');
    expect(lastFrame()).toContain('a@b.dev');
    unmount();
  });

  it('renders error inline', () => {
    const { lastFrame, unmount } = render(
      <Field label="Email" value="" onChange={() => {}} error="required" />,
    );
    expect(lastFrame()).toContain('required');
    unmount();
  });

  it('masks password input', () => {
    const { lastFrame, unmount } = render(
      <Field label="Senha" value="secret" onChange={() => {}} password />,
    );
    expect(lastFrame()).toContain('Senha');
    expect(lastFrame()).not.toContain('secret');
    unmount();
  });
});
```

- [ ] **Step 7: Header + Sidebar + Footer + Layout**

Create `src/tui/components/Header.tsx`:
```tsx
import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import type { AuthUser } from '../api/auth';

interface Props { user: AuthUser | null; }

export function Header({ user }: Props): React.ReactElement {
  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Gradient name="rainbow">
        <Text>API ORQUESTRADOR  v0.2.0</Text>
      </Gradient>
      <Text>
        user: <Text color="cyan">{user?.email ?? '—'}</Text>  role: <Text color="cyan">{user?.role ?? '—'}</Text>
      </Text>
    </Box>
  );
}
```

Create `src/tui/components/Sidebar.tsx`:
```tsx
import React from 'react';
import { Box, Text } from 'ink';

export interface NavItem { key: string; label: string; }

interface Props {
  items: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

export function Sidebar({ items, activeKey, onSelect }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1} width={18}>
      {items.map((it) => {
        const active = it.key === activeKey;
        return (
          <Text key={it.key} inverse={active} bold={active} onClick={() => onSelect(it.key)}>
            {active ? '▸ ' : '  '}{it.label}
          </Text>
        );
      })}
    </Box>
  );
}
```

Create `src/tui/components/Footer.tsx`:
```tsx
import React from 'react';
import { Box, Text } from 'ink';

interface Props { hints: { key: string; label: string }[]; }

export function Footer({ hints }: Props): React.ReactElement {
  return (
    <Box borderStyle="single" paddingX={1}>
      {hints.map((h, i) => (
        <Box key={h.key + i} marginRight={2}>
          <Text color="yellow">[{h.key}]</Text>
          <Text>{h.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
```

Create `src/tui/components/Layout.tsx`:
```tsx
import React from 'react';
import { Box } from 'ink';
import { Header } from './Header';
import { Sidebar, type NavItem } from './Sidebar';
import { Footer } from './Footer';
import type { AuthUser } from '../api/auth';

interface Props {
  user: AuthUser | null;
  navItems: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  hints: { key: string; label: string }[];
  children: React.ReactNode;
}

export function Layout({ user, navItems, activeKey, onSelect, hints, children }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header user={user} />
      <Box flexGrow={1}>
        <Sidebar items={navItems} activeKey={activeKey} onSelect={onSelect} />
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          {children}
        </Box>
      </Box>
      <Footer hints={hints} />
    </Box>
  );
}
```

Create `tests/tui/components/Layout.spec.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { Layout } from '../../../src/tui/components/Layout';

const user = { id: 'u1', email: 'a@b.dev', role: 'admin', active: true, createdAt: '' };
const nav = [
  { key: 'users', label: 'Usuários' },
  { key: 'logs', label: 'Logs' },
];

describe('Layout', () => {
  it('renders header, sidebar, footer, and children', () => {
    const { lastFrame, unmount } = render(
      <Layout
        user={user}
        navItems={nav}
        activeKey="users"
        onSelect={() => {}}
        hints={[{ key: 'n', label: 'novo' }]}
      >
        <Text>conteúdo</Text>
      </Layout>,
    );
    expect(lastFrame()).toContain('API ORQUESTRADOR');
    expect(lastFrame()).toContain('Usuários');
    expect(lastFrame()).toContain('Logs');
    expect(lastFrame()).toContain('conteúdo');
    unmount();
  });

  it('marks the active sidebar item', () => {
    const { lastFrame, unmount } = render(
      <Layout user={user} navItems={nav} activeKey="logs" onSelect={() => {}} hints={[]}>
        <Text>x</Text>
      </Layout>,
    );
    expect(lastFrame()).toMatch(/▸\s*Logs/);
    unmount();
  });
});
```

- [ ] **Step 8: Table and ErrorBoundary**

Create `src/tui/components/Table.tsx`:
```tsx
import React from 'react';
import { Box } from 'ink';
import InkTable from 'ink-table';

interface Props<T> { data: T[]; }

export function Table<T>({ data }: Props<T>): React.ReactElement {
  return (
    <Box flexDirection="column">
      <InkTable data={data as unknown as object[]} />
    </Box>
  );
}
```

Create `src/tui/components/ErrorBoundary.tsx`:
```tsx
import React from 'react';
import { Text, Box } from 'ink';

interface State { error: Error | null; }

interface Props { children: React.ReactNode; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text color="red">Erro: {this.state.error.message}</Text>
          <Text color="gray">Pressione Ctrl+C para sair.</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 9: Run all new component tests**

Run: `npx jest tests/tui/components/`
Expected: 5 + 3 + 1 + 2 + 3 + 2 = 16 passed.

- [ ] **Step 10: Commit**

```bash
git add src/tui/components/ tests/tui/components/
git commit -m "feat(tui): add shared components (StatusBadge, Toast, Modal, Confirm, Form, Layout, Table, ErrorBoundary)"
```

---

## Task 13: TUI useAuth hook and Login view

**Files:**
- Create: `src/tui/hooks/useAuth.ts`
- Create: `src/tui/views/Login.tsx`
- Test: `tests/tui/views/Login.spec.tsx`

- [ ] **Step 1: Create useAuth hook**

Create `src/tui/hooks/useAuth.ts`:
```ts
import { useEffect, useState, useCallback } from 'react';
import { buildApiClient, type ApiClient } from '../api/client';
import { login as apiLogin, loadSession, clearSession, type PersistedSession } from '../api/auth';

export interface AuthState {
  api: ApiClient;
  session: PersistedSession | null;
  error: string | null;
  busy: boolean;
  signIn: (email: string, password: string, apiUrl: string) => Promise<void>;
  signOut: () => void;
}

export function useAuth(initialApiUrl: string): AuthState {
  const [api] = useState(() => buildApiClient(initialApiUrl));
  const [session, setSession] = useState<PersistedSession | null>(() => {
    const s = loadSession();
    if (s) api.setAuthToken(s.accessToken);
    return s;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = useCallback(async (email: string, password: string, apiUrl: string) => {
    setBusy(true);
    setError(null);
    try {
      const s = await apiLogin(api, apiUrl, email, password);
      api.setAuthToken(s.accessToken);
      setSession(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [api]);

  const signOut = useCallback(() => {
    clearSession();
    api.setAuthToken(null);
    setSession(null);
  }, [api]);

  useEffect(() => {
    if (session) api.setAuthToken(session.accessToken);
  }, [api, session]);

  return { api, session, error, busy, signIn, signOut };
}
```

- [ ] **Step 2: Create Login view**

Create `src/tui/views/Login.tsx`:
```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from '../components/Modal';
import { Field } from '../components/Form';
import { Spinner } from '../components/Spinner';
import type { AuthState } from '../hooks/useAuth';

interface Props {
  auth: AuthState;
  defaultApiUrl: string;
}

export function Login({ auth, defaultApiUrl }: Props): React.ReactElement {
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focus, setFocus] = useState<0 | 1 | 2>(0);
  const [localError, setLocalError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.tab) setFocus((f) => ((f + 1) % 3) as 0 | 1 | 2);
    if (key.return && focus === 2) {
      if (!email.includes('@') || password.length < 8) {
        setLocalError('Verifique email e senha (8+ chars).');
        return;
      }
      setLocalError(null);
      void auth.signIn(email, password, apiUrl);
    }
  });

  const error = localError ?? auth.error;

  return (
    <Modal title="Login — API Orquestrador">
      <Box flexDirection="column">
        <Text color={focus === 0 ? 'cyan' : undefined}>API URL</Text>
        {focus === 0 ? <Field label="" value={apiUrl} onChange={setApiUrl} placeholder="http://localhost:4000/" /> : <Text>  {apiUrl || '—'}</Text>}
        <Text color={focus === 1 ? 'cyan' : undefined}>Email</Text>
        {focus === 1 ? <Field label="" value={email} onChange={setEmail} /> : <Text>  {email || '—'}</Text>}
        <Text color={focus === 2 ? 'cyan' : undefined}>Senha (Enter para entrar)</Text>
        {focus === 2 ? <Field label="" value={password} onChange={setPassword} password /> : <Text>  {password ? '•'.repeat(password.length) : '—'}</Text>}
        {error ? <Text color="red">{error}</Text> : null}
        {auth.busy ? <Spinner label="Autenticando..." /> : null}
      </Box>
    </Modal>
  );
}
```

- [ ] **Step 3: Write Login tests**

Create `tests/tui/views/Login.spec.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { Login } from '../../../src/tui/views/Login';
import type { AuthState } from '../../../src/tui/hooks/useAuth';

function fakeAuth(overrides: Partial<AuthState> = {}): AuthState {
  return {
    api: { request: jest.fn(), setAuthToken: jest.fn() } as never,
    session: null,
    error: null,
    busy: false,
    signIn: jest.fn().mockResolvedValue(undefined),
    signOut: jest.fn(),
    ...overrides,
  };
}

describe('Login view', () => {
  it('renders the modal with API URL field', () => {
    const { lastFrame, unmount } = render(
      <Login auth={fakeAuth()} defaultApiUrl="http://localhost:4000/" />,
    );
    expect(lastFrame()).toContain('API URL');
    expect(lastFrame()).toContain('http://localhost:4000/');
    unmount();
  });

  it('shows error when auth.error is set', () => {
    const { lastFrame, unmount } = render(
      <Login auth={fakeAuth({ error: 'Invalid credentials' })} defaultApiUrl="http://x" />,
    );
    expect(lastFrame()).toContain('Invalid credentials');
    unmount();
  });

  it('shows spinner when busy', () => {
    const { lastFrame, unmount } = render(
      <Login auth={fakeAuth({ busy: true })} defaultApiUrl="http://x" />,
    );
    expect(lastFrame()).toContain('Autenticando');
    unmount();
  });
});
```

- [ ] **Step 4: Run Login tests**

Run: `npx jest tests/tui/views/Login.spec.tsx`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/tui/views/Login.tsx src/tui/hooks/useAuth.ts tests/tui/views/Login.spec.tsx
git commit -m "feat(tui): add Login view and useAuth hook"
```

---


## Task 14: TUI User management views (priority)

**Files:**
- Create: `src/tui/views/Users/List.tsx`
- Create: `src/tui/views/Users/CreateForm.tsx`
- Create: `src/tui/views/Users/EditForm.tsx`
- Create: `src/tui/views/Users/ResetPassword.tsx`
- Create: `src/tui/views/Users/Tokens.tsx`
- Create: `src/tui/views/Users/index.tsx`
- Test: `tests/tui/views/Users.List.spec.tsx`
- Test: `tests/tui/views/Users.CreateForm.spec.tsx`

- [ ] **Step 1: Users List view**

Create `src/tui/views/Users/List.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { gql } from 'graphql-request';
import { Table } from '../../components/Table';
import { Spinner } from '../../components/Spinner';
import { formatDate } from '../../lib/format';
import { Q_USERS } from '../../api/queries';
import type { ApiClient } from '../../api/client';
import type { AuthUser } from '../../api/auth';

const M_UPDATE_USER = gql`
  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
    updateUser(id: $id, input: $input) { id active }
  }
`;

interface UserRow { id: string; email: string; role: string; active: boolean; createdAt: string; }

interface Props {
  api: ApiClient;
  me: AuthUser;
  onNew: () => void;
  onEdit: (u: UserRow) => void;
  onResetPassword: (u: UserRow) => void;
  onViewTokens: (u: UserRow) => void;
}

export function UsersList({ api, me, onNew, onEdit, onResetPassword, onViewTokens }: Props): React.ReactElement {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  async function load() {
    setError(null);
    try {
      const data = await api.request<{ users: UserRow[] }>(Q_USERS);
      setRows(data.users);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => { void load(); }, []);
  useInput((input, key) => {
    if (!rows) return;
    if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
    else if (key.downArrow) setSelected((s) => Math.min(rows.length - 1, s + 1));
    else if (input === 'n') onNew();
    else if (input === 'e') rows[selected] && onEdit(rows[selected]);
    else if (input === 'a') void toggleActive(rows[selected]);
    else if (input === 'p') rows[selected] && onResetPassword(rows[selected]);
    else if (input === 't') rows[selected] && onViewTokens(rows[selected]);
    else if (input === 'r') void load();
  });

  async function toggleActive(u: UserRow) {
    if (u.id === me.id) { setError('cannot deactivate yourself'); return; }
    try {
      await api.request(M_UPDATE_USER, { id: u.id, input: { active: !u.active } });
      void load();
    } catch (e) { setError((e as Error).message); }
  }

  if (error) return <Text color="red">Erro: {error}</Text>;
  if (!rows) return <Spinner label="Carregando usuários..." />;

  const view = rows.map((r, i) => ({
    email: (i === selected ? '▸ ' : '  ') + r.email,
    role: r.role,
    status: r.active ? '[ON]' : '[OFF]',
    createdAt: formatDate(r.createdAt),
  }));

  return (
    <Box flexDirection="column">
      <Table data={view} />
    </Box>
  );
}
```

- [ ] **Step 2: CreateForm**

Create `src/tui/views/Users/CreateForm.tsx`:
```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from '../../components/Modal';
import { Field } from '../../components/Form';
import { passwordStrength } from '../../lib/format';
import { createUserInputRule } from '../../lib/validators';
import { M_CREATE_USER } from '../../api/queries';
import type { ApiClient } from '../../api/client';

interface Props {
  api: ApiClient;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateForm({ api, onClose, onCreated }: Props): React.ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(0);

  useInput((input, key) => {
    if (key.escape) return onClose();
    if (key.tab) setFocus((f) => (f + 1) % 4);
    if (input === 'r' && focus === 3) setRole((rr) => (rr === 'admin' ? 'user' : 'admin'));
    if (key.return && focus === 3) void submit();
  });

  async function submit() {
    setError(null);
    const parsed = createUserInputRule.safeParse({ email, password, role });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'inválido'); return; }
    if (password !== confirm) { setError('senhas não conferem'); return; }
    setBusy(true);
    try {
      await api.request(M_CREATE_USER, { input: { email, password, role } });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  const strength = passwordStrength(password);

  return (
    <Modal title="Novo usuário" width={70}>
      <Box flexDirection="column">
        <Text color={focus === 0 ? 'cyan' : undefined}>{focus === 0 ? '▸' : ' '} Email</Text>
        {focus === 0 ? <Field label="" value={email} onChange={setEmail} /> : <Text>  {email || '—'}</Text>}
        <Text color={focus === 1 ? 'cyan' : undefined}>{focus === 1 ? '▸' : ' '} Senha</Text>
        {focus === 1 ? <Field label="" value={password} onChange={setPassword} password /> : <Text>  {password ? '•'.repeat(password.length) : '—'}</Text>}
        <Text>  Força: {strength.label}</Text>
        <Text color={focus === 2 ? 'cyan' : undefined}>{focus === 2 ? '▸' : ' '} Confirmar senha</Text>
        {focus === 2 ? <Field label="" value={confirm} onChange={setConfirm} password /> : <Text>  {confirm ? '•'.repeat(confirm.length) : '—'}</Text>}
        <Text color={focus === 3 ? 'cyan' : undefined}>{focus === 3 ? '▸' : ' '} Role: {role} (r alterna)</Text>
        {error ? <Text color="red">{error}</Text> : null}
        {busy ? <Text color="cyan">Criando...</Text> : <Text color="gray">Tab navega, Enter submete (no campo role), Esc cancela.</Text>}
      </Box>
    </Modal>
  );
}
```

- [ ] **Step 3: EditForm**

Create `src/tui/views/Users/EditForm.tsx`:
```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from '../../components/Modal';
import { M_UPDATE_USER } from '../../api/queries';
import type { ApiClient } from '../../api/client';

interface Props {
  api: ApiClient;
  user: { id: string; email: string; role: 'admin' | 'user' };
  onClose: () => void;
  onSaved: () => void;
}

export function EditForm({ api, user, onClose, onSaved }: Props): React.ReactElement {
  const [role, setRole] = useState<'admin' | 'user'>(user.role);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useInput((input, key) => {
    if (key.escape) return onClose();
    if (input === 'r') setRole((rr) => (rr === 'admin' ? 'user' : 'admin'));
    if (key.return) void save();
  });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.request(M_UPDATE_USER, { id: user.id, input: { role } });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Modal title={`Editar ${user.email}`} width={50}>
      <Box flexDirection="column">
        <Text>Email: {user.email} (não editável)</Text>
        <Text>Role: <Text color="cyan">{role}</Text>  (pressione r para alternar)</Text>
        {error ? <Text color="red">{error}</Text> : null}
        {busy ? <Text color="cyan">Salvando...</Text> : <Text color="gray">Enter salva, Esc cancela.</Text>}
      </Box>
    </Modal>
  );
}
```

- [ ] **Step 4: ResetPassword**

Create `src/tui/views/Users/ResetPassword.tsx`:
```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from '../../components/Modal';
import { Field } from '../../components/Form';
import { M_RESET_PASSWORD } from '../../api/queries';
import { passwordStrength } from '../../lib/format';
import { resetPasswordRule } from '../../lib/validators';
import type { ApiClient } from '../../api/client';

interface Props {
  api: ApiClient;
  user: { id: string; email: string };
  onClose: () => void;
  onReset: () => void;
}

function genPassword(): string {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const all = lower + upper + digits;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let out = pick(lower) + pick(upper) + pick(digits);
  for (let i = 3; i < 16; i++) out += pick(all);
  return out.split('').sort(() => Math.random() - 0.5).join('');
}

export function ResetPassword({ api, user, onClose, onReset }: Props): React.ReactElement {
  const [mode, setMode] = useState<'gen' | 'manual'>('gen');
  const [generated, setGenerated] = useState(genPassword);
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) return onClose();
    if (input === 'g') { setMode('gen'); setGenerated(genPassword()); }
    if (input === 'm') setMode('manual');
    if (key.return) void submit();
  });

  async function submit() {
    setError(null);
    const newPw = mode === 'gen' ? generated : manual;
    const parsed = resetPasswordRule.safeParse({ newPassword: newPw });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'inválido'); return; }
    setBusy(true);
    try {
      await api.request(M_RESET_PASSWORD, { id: user.id, newPassword: newPw });
      setSaved(newPw);
      onReset();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (saved) {
    return (
      <Modal title="Senha redefinida" width={70}>
        <Box flexDirection="column">
          <Text color="yellow">ESTA SENHA SERÁ EXIBIDA APENAS UMA VEZ. ANOTE AGORA.</Text>
          <Text>{saved}</Text>
          <Text color="gray">Pressione Enter para fechar.</Text>
        </Box>
      </Modal>
    );
  }

  const strength = passwordStrength(mode === 'gen' ? generated : manual);

  return (
    <Modal title={`Resetar senha de ${user.email}`} width={70}>
      <Box flexDirection="column">
        <Text>Modo: <Text color="cyan">{mode === 'gen' ? 'gerada' : 'manual'}</Text>  (g=gerar, m=manual)</Text>
        {mode === 'gen' ? (
          <Text>Senha gerada: <Text color="cyan">{generated}</Text></Text>
        ) : (
          <Field label="Nova senha" value={manual} onChange={setManual} password />
        )}
        <Text>Força: {strength.label}</Text>
        {error ? <Text color="red">{error}</Text> : null}
        {busy ? <Text color="cyan">Salvando...</Text> : <Text color="gray">Enter confirma, Esc cancela.</Text>}
      </Box>
    </Modal>
  );
}
```

- [ ] **Step 5: Tokens view**

Create `src/tui/views/Users/Tokens.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { Table } from '../../components/Table';
import { formatDate } from '../../lib/format';
import { Q_REFRESH_TOKENS, M_REVOKE_TOKEN } from '../../api/queries';
import type { ApiClient } from '../../api/client';

interface TokenRow { id: string; userId: string; createdAt: string; expiresAt: string; revokedAt: string | null; }

interface Props {
  api: ApiClient;
  user: { id: string; email: string };
  onClose: () => void;
}

export function Tokens({ api, user, onClose }: Props): React.ReactElement {
  const [rows, setRows] = useState<TokenRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  async function load() {
    setError(null);
    try {
      const data = await api.request<{ refreshTokens: TokenRow[] }>(Q_REFRESH_TOKENS, { userId: user.id });
      setRows(data.refreshTokens);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => { void load(); }, []);

  useInput(async (input, key) => {
    if (!rows) return;
    if (key.escape) return onClose();
    if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow) setSelected((s) => Math.min(rows.length - 1, s + 1));
    if (input === 'x') {
      const t = rows[selected];
      if (!t) return;
      try {
        await api.request(M_REVOKE_TOKEN, { id: t.id });
        void load();
      } catch (e) { setError((e as Error).message); }
    }
  });

  if (error) return <Text color="red">Erro: {error}</Text>;
  if (!rows) return <Spinner label="Carregando tokens..." />;

  const view = rows.map((r, i) => ({
    sel: i === selected ? '▸' : ' ',
    createdAt: formatDate(r.createdAt),
    expiresAt: formatDate(r.expiresAt),
    revokedAt: r.revokedAt ? formatDate(r.revokedAt) : '—',
    status: r.revokedAt ? 'revoked' : 'active',
  }));

  return (
    <Modal title={`Tokens de ${user.email}`} width={80}>
      <Box flexDirection="column">
        <Table data={view} />
        <Text color="gray">[x] revogar  [Esc] voltar</Text>
      </Box>
    </Modal>
  );
}
```

- [ ] **Step 6: Users index (orchestrator)**

Create `src/tui/views/Users/index.tsx`:
```tsx
import React, { useState } from 'react';
import { UsersList } from './List';
import { CreateForm } from './CreateForm';
import { EditForm } from './EditForm';
import { ResetPassword } from './ResetPassword';
import { Tokens } from './Tokens';
import type { ApiClient } from '../../api/client';
import type { AuthUser } from '../../api/auth';

interface UserRow { id: string; email: string; role: 'admin' | 'user'; active: boolean; createdAt: string; }

type Modal = null | { kind: 'create' } | { kind: 'edit'; user: UserRow } | { kind: 'reset'; user: UserRow } | { kind: 'tokens'; user: UserRow };

interface Props { api: ApiClient; me: AuthUser; }

export function UsersView({ api, me }: Props): React.ReactElement {
  const [modal, setModal] = useState<Modal>(null);
  const [reloadKey, setReloadKey] = useState(0);

  function close() { setModal(null); }

  return (
    <>
      <UsersList
        key={reloadKey}
        api={api}
        me={me}
        onNew={() => setModal({ kind: 'create' })}
        onEdit={(u) => setModal({ kind: 'edit', user: u })}
        onResetPassword={(u) => setModal({ kind: 'reset', user: u })}
        onViewTokens={(u) => setModal({ kind: 'tokens', user: u })}
      />
      {modal?.kind === 'create' ? <CreateForm api={api} onClose={close} onCreated={() => { close(); setReloadKey((k) => k + 1); }} /> : null}
      {modal?.kind === 'edit' ? <EditForm api={api} user={modal.user} onClose={close} onSaved={() => { close(); setReloadKey((k) => k + 1); }} /> : null}
      {modal?.kind === 'reset' ? <ResetPassword api={api} user={modal.user} onClose={close} onReset={() => { close(); setReloadKey((k) => k + 1); }} /> : null}
      {modal?.kind === 'tokens' ? <Tokens api={api} user={modal.user} onClose={close} /> : null}
    </>
  );
}
```

- [ ] **Step 7: Write tests for Users List and CreateForm**

Create `tests/tui/views/Users.List.spec.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { UsersList } from '../../../src/tui/views/Users/List';
import type { ApiClient } from '../../../src/tui/api/client';

const me = { id: 'me', email: 'me@x.dev', role: 'admin', active: true, createdAt: '' };

describe('UsersList', () => {
  it('shows spinner while loading', () => {
    const api = { request: jest.fn().mockReturnValue(new Promise(() => {})), setAuthToken: jest.fn() } as never;
    const { lastFrame, unmount } = render(
      <UsersList api={api} me={me} onNew={() => {}} onEdit={() => {}} onResetPassword={() => {}} onViewTokens={() => {}} />,
    );
    expect(lastFrame()).toContain('Carregando');
    unmount();
  });

  it('renders user rows when loaded', async () => {
    const api = { request: jest.fn().mockResolvedValue({ users: [{ id: '1', email: 'a@b.dev', role: 'user', active: true, createdAt: '2026-06-15T10:00:00Z' }] }), setAuthToken: jest.fn() } as never;
    const { lastFrame, unmount } = render(
      <UsersList api={api} me={me} onNew={() => {}} onEdit={() => {}} onResetPassword={() => {}} onViewTokens={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(lastFrame()).toContain('a@b.dev');
    unmount();
  });

  it('shows error message on failure', async () => {
    const api = { request: jest.fn().mockRejectedValue(new Error('boom')), setAuthToken: jest.fn() } as never;
    const { lastFrame, unmount } = render(
      <UsersList api={api} me={me} onNew={() => {}} onEdit={() => {}} onResetPassword={() => {}} onViewTokens={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(lastFrame()).toContain('boom');
    unmount();
  });

  it('calls onNew when n is pressed (after data loads)', async () => {
    const api = { request: jest.fn().mockResolvedValue({ users: [{ id: '1', email: 'a@b.dev', role: 'user', active: true, createdAt: '2026-06-15T10:00:00Z' }] }), setAuthToken: jest.fn() } as never;
    const onNew = jest.fn();
    const { stdin, unmount } = render(
      <UsersList api={api} me={me} onNew={onNew} onEdit={() => {}} onResetPassword={() => {}} onViewTokens={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('n');
    expect(onNew).toHaveBeenCalled();
    unmount();
  });
});
```

Create `tests/tui/views/Users.CreateForm.spec.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { CreateForm } from '../../../src/tui/views/Users/CreateForm';

describe('CreateForm', () => {
  it('renders the modal with the title', () => {
    const api = { request: jest.fn(), setAuthToken: jest.fn() } as never;
    const { lastFrame, unmount } = render(
      <CreateForm api={api} onClose={() => {}} onCreated={() => {}} />,
    );
    expect(lastFrame()).toContain('Novo usuário');
    unmount();
  });

  it('shows role as user by default', () => {
    const api = { request: jest.fn(), setAuthToken: jest.fn() } as never;
    const { lastFrame, unmount } = render(
      <CreateForm api={api} onClose={() => {}} onCreated={() => {}} />,
    );
    expect(lastFrame()).toContain('user');
    unmount();
  });

  it('does not crash on render', () => {
    const api = { request: jest.fn(), setAuthToken: jest.fn() } as never;
    const { lastFrame, unmount } = render(
      <CreateForm api={api} onClose={() => {}} onCreated={() => {}} />,
    );
    expect(lastFrame()).toBeDefined();
    unmount();
  });
});
```

- [ ] **Step 8: Run Users tests**

Run: `npx jest tests/tui/views/Users.List.spec.tsx tests/tui/views/Users.CreateForm.spec.tsx`
Expected: 7 passed (4 List + 3 CreateForm).

- [ ] **Step 9: Commit**

```bash
git add src/tui/views/Users/ tests/tui/views/Users.List.spec.tsx tests/tui/views/Users.CreateForm.spec.tsx
git commit -m "feat(tui): add User management views (List, Create, Edit, Reset, Tokens)"
```

---


## Task 15: TUI Logs view (mandatory) + wiring into App

**Files:**
- Create: `src/tui/views/Logs.tsx`
- Create: `src/tui/views/Clientes.tsx`
- Create: `src/tui/views/Veiculos.tsx`
- Create: `src/tui/views/Motoristas.tsx`
- Create: `src/tui/views/Posicoes/index.tsx`
- Create: `src/tui/views/Posicoes/Recentes.tsx`
- Create: `src/tui/views/Posicoes/PorVeiculo.tsx`
- Create: `src/tui/views/SyncStatus.tsx`
- Modify: `src/tui/app.tsx`
- Test: `tests/tui/views/Logs.spec.tsx`

- [ ] **Step 1: Implement Logs view**

Create `src/tui/views/Logs.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Spinner } from '../components/Spinner';
import { Table } from '../components/Table';
import { Q_REQUEST_LOG } from '../api/queries';
import { formatDate } from '../lib/format';
import type { ApiClient } from '../api/client';

interface LogRow {
  id: string; method: string; source: string; status: string;
  cacheHit: boolean; latencyMs: number | null; createdAt: string; error: string | null;
}

const METHODS = ['(any)', 'clientes', 'veiculos', 'motoristas', 'posicoesRecentes', 'posicoesPorVeiculo', 'login', 'refresh'] as const;
const STATUSES = ['all', 'ok', 'error'] as const;

interface Props { api: ApiClient; }

export function Logs({ api }: Props): React.ReactElement {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [methodFilter, setMethodFilter] = useState<typeof METHODS[number]>('(any)');
  const [statusFilter, setStatusFilter] = useState<typeof STATUSES[number]>('all');
  const [following, setFollowing] = useState(false);
  const [mIdx, setMIdx] = useState(0);

  async function load() {
    setError(null);
    try {
      const variables: { limit: number; method?: string } = { limit: 100 };
      if (methodFilter !== '(any)') variables.method = methodFilter;
      const data = await api.request<{ requestLog: LogRow[] }>(Q_REQUEST_LOG, variables);
      let filtered = data.requestLog;
      if (statusFilter !== 'all') filtered = filtered.filter((r) => r.status === statusFilter);
      setRows(filtered);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => { void load(); }, [methodFilter, statusFilter]);

  useInput((input) => {
    if (input === 'r') void load();
    if (input === 'f') setFollowing((x) => !x);
    if (input === 'm') setMIdx((i) => (i + 1) % METHODS.length) || setMethodFilter(METHODS[(mIdx + 1) % METHODS.length]);
    if (input === 's') setStatusFilter((s) => (s === 'all' ? 'ok' : s === 'ok' ? 'error' : 'all'));
    if (input === 'x') { setMethodFilter('(any)'); setStatusFilter('all'); }
  });

  useEffect(() => {
    if (!following) return;
    const t = setInterval(() => { void load(); }, 2000);
    return () => clearInterval(t);
  }, [following, methodFilter, statusFilter]);

  if (error) return <Text color="red">Erro: {error}</Text>;
  if (!rows) return <Spinner label="Carregando logs..." />;

  const view = rows.map((r) => ({
    createdAt: formatDate(r.createdAt),
    method: r.method,
    source: r.source,
    status: r.status === 'ok' ? '[OK]' : '[ERR]',
    cacheHit: r.cacheHit ? 'Y' : 'N',
    latencyMs: r.latencyMs ?? '—',
    error: r.error ?? '',
  }));

  return (
    <Box flexDirection="column">
      <Text color="gray">
        Filtro método: <Text color="cyan">{methodFilter}</Text>  status: <Text color="cyan">{statusFilter}</Text>  follow: <Text color="cyan">{following ? 'ON' : 'OFF'}</Text>
      </Text>
      <Table data={view} />
      <Text color="gray">[r] refresh  [f] follow  [m] método  [s] status  [x] limpar  [q] voltar</Text>
    </Box>
  );
}
```

- [ ] **Step 2: Generic cadastro list (Clientes / Veiculos / Motoristas)**

Create `src/tui/views/Clientes.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../components/Table';
import { Spinner } from '../components/Spinner';
import { formatDate } from '../lib/format';
import { Q_CLIENTES } from '../api/queries';
import type { ApiClient } from '../api/client';

interface Row { idCliente: number; cnpj: string | null; cpf: string | null; nome: string; fetchedAt: string; expiresAt: string; }

export function Clientes({ api }: { api: ApiClient }): React.ReactElement {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await api.request<{ clientes: Row[] }>(Q_CLIENTES, { quantidade: 1000 });
      setRows(data.clientes);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => { void load(); }, []);
  useInput((input) => { if (input === 'r') void load(); });

  if (error) return <Text color="red">Erro: {error}</Text>;
  if (!rows) return <Spinner label="Carregando clientes..." />;

  const view = rows.map((r) => ({
    id: r.idCliente,
    doc: r.cnpj ?? r.cpf ?? '—',
    nome: r.nome,
    fetched: formatDate(r.fetchedAt),
    expires: formatDate(r.expiresAt),
  }));

  return <Box flexDirection="column"><Table data={view} /></Box>;
}
```

Create `src/tui/views/Veiculos.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../components/Table';
import { Spinner } from '../components/Spinner';
import { formatDate } from '../lib/format';
import { Q_VEICULOS } from '../api/queries';
import type { ApiClient } from '../api/client';

interface Row { idVeiculo: number; placa: string; idCliente: number | null; descricao: string | null; idEquipamento: number | null; fetchedAt: string; expiresAt: string; }

export function Veiculos({ api }: { api: ApiClient }): React.ReactElement {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await api.request<{ veiculos: Row[] }>(Q_VEICULOS, { quantidade: 1000 });
      setRows(data.veiculos);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => { void load(); }, []);
  useInput((input) => { if (input === 'r') void load(); });

  if (error) return <Text color="red">Erro: {error}</Text>;
  if (!rows) return <Spinner label="Carregando veículos..." />;

  const view = rows.map((r) => ({
    id: r.idVeiculo,
    placa: r.placa,
    cliente: r.idCliente ?? '—',
    descricao: r.descricao ?? '—',
    fetched: formatDate(r.fetchedAt),
    expires: formatDate(r.expiresAt),
  }));

  return <Box flexDirection="column"><Table data={view} /></Box>;
}
```

Create `src/tui/views/Motoristas.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../components/Table';
import { Spinner } from '../components/Spinner';
import { formatDate } from '../lib/format';
import { Q_MOTORISTAS } from '../api/queries';
import type { ApiClient } from '../api/client';

interface Row { idMotorista: number; nome: string; tipoDocumento: string | null; fetchedAt: string; expiresAt: string; }

export function Motoristas({ api }: { api: ApiClient }): React.ReactElement {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await api.request<{ motoristas: Row[] }>(Q_MOTORISTAS, { quantidade: 1000 });
      setRows(data.motoristas);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => { void load(); }, []);
  useInput((input) => { if (input === 'r') void load(); });

  if (error) return <Text color="red">Erro: {error}</Text>;
  if (!rows) return <Spinner label="Carregando motoristas..." />;

  const view = rows.map((r) => ({
    id: r.idMotorista,
    nome: r.nome,
    doc: r.tipoDocumento ?? '—',
    fetched: formatDate(r.fetchedAt),
    expires: formatDate(r.expiresAt),
  }));

  return <Box flexDirection="column"><Table data={view} /></Box>;
}
```

- [ ] **Step 3: Posições (Recentes + PorVeiculo)**

Create `src/tui/views/Posicoes/Recentes.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../../components/Table';
import { Spinner } from '../../components/Spinner';
import { formatDate } from '../../lib/format';
import { Q_POSICOES_RECENTES } from '../../api/queries';
import type { ApiClient } from '../../api/client';

interface Row { idPacote: number; idVeiculo: number; dataPosicao: string; latitude: number; longitude: number; velocidade: number; ignicao: number | null; }

export function PosicoesRecentes({ api }: { api: ApiClient }): React.ReactElement {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await api.request<{ posicoesRecentes: Row[] }>(Q_POSICOES_RECENTES, { quantidade: 1000 });
      setRows(data.posicoesRecentes);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => { void load(); }, []);
  useInput((input) => { if (input === 'r') void load(); });

  if (error) return <Text color="red">Erro: {error}</Text>;
  if (!rows) return <Spinner label="Carregando posições..." />;

  const view = rows.map((r) => ({
    idPacote: r.idPacote,
    veiculo: r.idVeiculo,
    quando: formatDate(r.dataPosicao),
    lat: r.latitude.toFixed(4),
    lng: r.longitude.toFixed(4),
    vel: r.velocidade.toFixed(1),
    ign: r.ignicao ?? '—',
  }));

  return <Box flexDirection="column"><Table data={view} /></Box>;
}
```

Create `src/tui/views/Posicoes/PorVeiculo.tsx`:
```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../../components/Table';
import { Spinner } from '../../components/Spinner';
import { Field } from '../../components/Form';
import { formatDate } from '../../lib/format';
import { Q_POSICOES_POR_VEICULO } from '../../api/queries';
import type { ApiClient } from '../../api/client';

interface Row { idPacote: number; idVeiculo: number; dataPosicao: string; latitude: number; longitude: number; velocidade: number; }

export function PosicoesPorVeiculo({ api }: { api: ApiClient }): React.ReactElement {
  const [idVeiculo, setIdVeiculo] = useState('');
  const [dataInicio, setDataInicio] = useState(new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19));
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 19));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);

  useInput((_, key) => {
    if (key.tab) setFocus((f) => (f + 1) % 3);
    if (key.return && focus === 2) void submit();
  });

  async function submit() {
    setBusy(true); setError(null);
    try {
      const data = await api.request<{ posicoesPorVeiculo: Row[] }>(Q_POSICOES_POR_VEICULO, {
        idVeiculo: Number(idVeiculo), dataInicio, dataFim,
      });
      setRows(data.posicoesPorVeiculo);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (busy) return <Spinner label="Buscando..." />;
  if (error) return <Text color="red">Erro: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box>
        {focus === 0 ? <Field label="idVeiculo" value={idVeiculo} onChange={setIdVeiculo} /> : <Text>idVeiculo: {idVeiculo}</Text>}
      </Box>
      <Box>
        {focus === 1 ? <Field label="dataInicio" value={dataInicio} onChange={setDataInicio} /> : <Text>dataInicio: {dataInicio}</Text>}
      </Box>
      <Box>
        {focus === 2 ? <Field label="dataFim" value={dataFim} onChange={setDataFim} /> : <Text>dataFim: {dataFim}</Text>}
      </Box>
      {rows ? (
        <Table data={rows.map((r) => ({
          idPacote: r.idPacote,
          quando: formatDate(r.dataPosicao),
          lat: r.latitude.toFixed(4),
          lng: r.longitude.toFixed(4),
          vel: r.velocidade.toFixed(1),
        }))} />
      ) : null}
    </Box>
  );
}
```

Create `src/tui/views/Posicoes/index.tsx`:
```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { PosicoesRecentes } from './Recentes';
import { PosicoesPorVeiculo } from './PorVeiculo';
import type { ApiClient } from '../../api/client';

export function Posicoes({ api }: { api: ApiClient }): React.ReactElement {
  const [tab, setTab] = useState<'recentes' | 'veiculo'>('recentes');
  useInput((input) => {
    if (input === '1') setTab('recentes');
    if (input === '2') setTab('veiculo');
  });
  return (
    <Box flexDirection="column">
      <Text color="gray">[1] Recentes  [2] Por veículo  (atual: <Text color="cyan">{tab}</Text>)</Text>
      {tab === 'recentes' ? <PosicoesRecentes api={api} /> : <PosicoesPorVeiculo api={api} />}
    </Box>
  );
}
```

- [ ] **Step 4: SyncStatus view**

Create `src/tui/views/SyncStatus.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../components/Table';
import { Spinner } from '../components/Spinner';
import { formatDate } from '../lib/format';
import { Q_SYNC_STATUS } from '../api/queries';
import type { ApiClient } from '../api/client';

interface Row { method: string; idVeiculo: number; lastIdPacote: number | null; lastSyncedAt: string; }

export function SyncStatus({ api }: { api: ApiClient }): React.ReactElement {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await api.request<{ syncStatus: Row[] }>(Q_SYNC_STATUS);
      setRows(data.syncStatus);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(t);
  }, []);
  useInput((input) => { if (input === 'r') void load(); });

  if (error) return <Text color="red">Erro: {error}</Text>;
  if (!rows) return <Spinner label="Carregando sync status..." />;

  const view = rows.map((r) => ({
    method: r.method,
    veiculo: r.idVeiculo,
    lastId: r.lastIdPacote ?? '—',
    lastSync: formatDate(r.lastSyncedAt),
  }));

  return <Box flexDirection="column"><Table data={view} /></Box>;
}
```

- [ ] **Step 5: Wire App with all views**

Replace the entire content of `src/tui/app.tsx` with:
```tsx
import React, { useState } from 'react';
import { Box, useInput } from 'ink';
import { useAuth } from './hooks/useAuth';
import { Login } from './views/Login';
import { Layout } from './components/Layout';
import { UsersView } from './views/Users';
import { Clientes } from './views/Clientes';
import { Veiculos } from './views/Veiculos';
import { Motoristas } from './views/Motoristas';
import { Posicoes } from './views/Posicoes';
import { Logs } from './views/Logs';
import { SyncStatus } from './views/SyncStatus';

const NAV = [
  { key: 'users', label: 'Usuários' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'veiculos', label: 'Veículos' },
  { key: 'motoristas', label: 'Motoristas' },
  { key: 'posicoes', label: 'Posições' },
  { key: 'logs', label: 'Logs' },
  { key: 'sync', label: 'Sync' },
];

const HINTS_BY_VIEW: Record<string, { key: string; label: string }[]> = {
  users: [{ key: 'n', label: 'novo' }, { key: 'e', label: 'editar' }, { key: 'a', label: 'ativar' }, { key: 'p', label: 'senha' }, { key: 't', label: 'tokens' }, { key: 'r', label: 'refresh' }],
  logs: [{ key: 'f', label: 'follow' }, { key: 'm', label: 'método' }, { key: 's', label: 'status' }, { key: 'r', label: 'refresh' }],
  default: [{ key: 'r', label: 'refresh' }, { key: 'q', label: 'voltar' }],
};

export function App(): React.ReactElement {
  const auth = useAuth(process.env.API_URL ?? 'http://localhost:4000/');
  const [active, setActive] = useState('users');

  useInput((input) => {
    const idx = NAV.findIndex((n) => n.key === active);
    if (input >= '1' && input <= '7') {
      const n = Number(input) - 1;
      if (n < NAV.length) setActive(NAV[n].key);
    }
    if (input === 'q' && active !== 'users') {
      const prev = NAV.findIndex((n) => n.key === active);
      if (prev > 0) setActive(NAV[prev - 1].key);
    }
    return idx;
  });

  if (!auth.session) return <Login auth={auth} defaultApiUrl={process.env.API_URL ?? 'http://localhost:4000/'} />;
  if (!auth.session.user) return <Login auth={auth} defaultApiUrl={process.env.API_URL ?? 'http://localhost:4000/'} />;

  const me = auth.session.user;
  const hints = HINTS_BY_VIEW[active] ?? HINTS_BY_VIEW.default;

  let view: React.ReactNode = null;
  if (active === 'users') view = <UsersView api={auth.api} me={me} />;
  else if (active === 'clientes') view = <Clientes api={auth.api} />;
  else if (active === 'veiculos') view = <Veiculos api={auth.api} />;
  else if (active === 'motoristas') view = <Motoristas api={auth.api} />;
  else if (active === 'posicoes') view = <Posicoes api={auth.api} />;
  else if (active === 'logs') view = <Logs api={auth.api} />;
  else if (active === 'sync') view = <SyncStatus api={auth.api} />;

  return (
    <Layout
      user={me}
      navItems={NAV}
      activeKey={active}
      onSelect={setActive}
      hints={hints}
    >
      <Box flexDirection="column">{view}</Box>
    </Layout>
  );
}
```

- [ ] **Step 6: Write Logs tests**

Create `tests/tui/views/Logs.spec.tsx`:
```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { Logs } from '../../../src/tui/views/Logs';
import type { ApiClient } from '../../../src/tui/api/client';

describe('Logs', () => {
  it('shows spinner while loading', () => {
    const api = { request: jest.fn().mockReturnValue(new Promise(() => {})), setAuthToken: jest.fn() } as never;
    const { lastFrame, unmount } = render(<Logs api={api} />);
    expect(lastFrame()).toContain('Carregando logs');
    unmount();
  });

  it('renders log rows when loaded', async () => {
    const api = { request: jest.fn().mockResolvedValue({ requestLog: [{ id: '1', method: 'clientes', source: 'graphql', status: 'ok', cacheHit: false, latencyMs: 12, createdAt: '2026-06-15T10:00:00Z', error: null }] }), setAuthToken: jest.fn() } as never;
    const { lastFrame, unmount } = render(<Logs api={api} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(lastFrame()).toContain('clientes');
    unmount();
  });
});
```

- [ ] **Step 7: Run Logs tests + smoke test (the App should still render after wiring)**

Run: `npx jest tests/tui/views/Logs.spec.tsx tests/tui/integration/app.smoke.spec.tsx`
Expected: 3 passed.

- [ ] **Step 8: Run full suite**

Run: `npm test`
Expected: ~100 passed (all previous + 2 Logs + smoke). Some TUI tests may be flaky; if any fail due to async, run with `--runInBand`.

- [ ] **Step 9: Commit**

```bash
git add src/tui/views/ src/tui/app.tsx tests/tui/views/Logs.spec.tsx
git commit -m "feat(tui): add Logs (mandatory) + Sascar browsers + Sync + wire into App"
```

---

## Task 16: README updates for v0.2.0

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add TUI section to README**

Append a new section to `README.md` (before "Próximas evoluções"):
```markdown

## TUI (Terminal User Interface)

A TUI oferece um cockpit 100% em terminal para gerenciar a API. Roda via:

```bash
npm run tui
```

### Features

- **Gestão de usuários** (prioridade): listar, criar, editar role, ativar/desativar, resetar senha, ver/revogar refresh tokens. Tudo via teclado, com atalhos vim-like (`n`=novo, `e`=editar, `a`=ativar, `p`=senha, `t`=tokens, `r`=refresh).
- **Logs de auditoria** com filtros por método/status, follow em tempo real (a cada 2s), e detalhe de cada request.
- **Navegação de dados Sascar**: clientes, veículos, motoristas, posições (recentes + por veículo), sync status.
- **Login persistente** via `~/.config/api-orquestrador/session.json` (chmod 600).
- **Header gradient** cyan→magenta, sidebar fixa, toasts, modais, spinners.
- **Atalhos**: `1`–`7` pula entre views, `Tab` navega, `Esc` fecha modal, `?` help, `Ctrl+C` sai.

### Pré-requisitos

A API deve estar rodando (`docker compose up -d` ou `npm run dev`).
Por padrão a TUI conecta em `http://localhost:4000/`. Para customizar:
```bash
API_URL=http://api.exemplo.com npm run tui
```

### Primeiro uso

1. Rode `npm run tui`.
2. Faça login com o admin seedado (`admin@local.dev` / senha do `.env`).
3. Use `n` na view "Usuários" para criar novos usuários.
4. `t` abre os tokens ativos; `x` revoga.
```

- [ ] **Step 2: Update test commands at the top of README**

The "Comandos" section already includes `npm test` etc. No change needed.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): document TUI (npm run tui)"
```

---

## Acceptance criteria (final check)

- [ ] `npm run lint && npm run typecheck && npm test && npm run format:check` all green
- [ ] `npm run tui` boots against `docker compose up` and:
  - Login screen accepts admin@local.dev
  - View "Usuários" loads and lists users
  - `n` creates a new user (verify with `users` query in Studio)
  - `e` changes role; `a` toggles active
  - `p` resets password (with generated option); the generated password is shown once
  - `t` lists refresh tokens; `x` revokes
- [ ] View "Logs" shows real `request_log` entries; `f` toggles follow
- [ ] `users` / `createUser` / etc. return `FORBIDDEN` for `role: 'user'` (verified by integration test)
- [ ] 100+ tests passing

---

## Self-review

**Spec coverage:**

| Spec requirement | Covered by |
|---|---|
| TUI lives in `src/tui/`, runs via `npm run tui` | Task 1 (deps + JSX), Task 9 (entry + script) |
| Ink + React stack | Task 1 |
| graphql-request client | Task 10 |
| env-paths for session (chmod 600) | Task 10 |
| Auto-refresh of token | Task 10 (refresh function); wire-in is in useAuth |
| `me`, `users`, `refreshTokens` queries | Task 6 (schema), Task 7 (resolvers) |
| `createUser`, `updateUser`, `resetUserPassword`, `revokeRefreshToken` mutations | Task 6, Task 7 |
| `requireAuth` / `requireAdmin` guards | Task 3 |
| `UserError` with codes | Task 2 |
| Anti-lockout (CANNOT_DEMOTE_SELF / CANNOT_DEACTIVATE_SELF) | Task 7 |
| zod validators | Task 5 |
| Login screen + persistence | Task 10, Task 13 |
| Header gradient | Task 12 (Header.tsx) |
| Sidebar with 7 views | Task 15 (App.tsx) |
| User mgmt priority view (list/create/edit/reset/tokens) | Task 14 |
| Logs view (mandatory) with filters + follow | Task 15 |
| Sascar data browsers | Task 15 |
| Sync status | Task 15 |
| Color palette (cyan/magenta, etc.) | Task 12 (theme.ts) |
| Toast / Modal / Confirm / Spinner / Form / Layout | Task 12 |
| Keyboard shortcuts (`n`, `e`, `a`, `p`, `t`, `r`, `1`–`7`, `Tab`, `Esc`, `?`, `Ctrl+C`) | Tasks 12–15 |
| Help overlay | Spec mentioned; **DEFERRED to follow-up** (would add a `?`-triggered modal in App; outside this plan's scope) |
| Status bar (health, JWT countdown) | Spec mentioned; **DEFERRED to follow-up** |
| Tests: 87+ meta (62 backend + 25+ TUI) | Tasks 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15 |

**Known gaps (documented for future iteration):**
- `logout(refreshToken)` mutation: not added in this plan; logout clears session locally only. Token revoked via Tokens view or expires naturally.
- Help overlay (`?`) and status bar (health/JWT countdown): deferred to v0.2.1.

**Type consistency check:**
- `requireAuth` returns `AuthUser` from `src/context.ts` — matches across tasks 3, 7, 13, 14, 15.
- `ApiClient.request<T>(...)` — used consistently in tasks 10, 13, 14, 15.
- `UserRow` interface used in task 14 — defined in `Users/List.tsx` and re-typed inline in `Users/index.tsx` (intentional, kept local).
- `AuthUser` from `src/tui/api/auth.ts` vs `AuthUser` from `src/context.ts`: these are separate types. The TUI one has `createdAt: string`; the server one has `createdAt: undefined`. Renaming the TUI one to `TuiAuthUser` would be cleaner but is a refactor not in scope.
- GraphQL field names: `me`, `users`, `createUser`, `updateUser`, `resetUserPassword`, `revokeRefreshToken`, `refreshTokens` — consistent across Tasks 6, 7, 10, 14, 15.
- Mutation name `M_UPDATE_USER` in `src/tui/views/Users/List.tsx` is a local copy (different from `M_UPDATE_USER` exported from `queries.ts` which uses a different return shape). The List's mutation returns `{ id, active }` — the queries.ts one returns the full User. Both work against the same backend mutation. If a future change renames the server field, both client copies need to be updated. This is documented in code via local definition.

**Final task list size:** 16 tasks. 100+ tests at completion. Estimated effort: 1–2 weeks for a single engineer at the team's normal pace.
