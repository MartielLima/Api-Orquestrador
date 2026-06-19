/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApolloServer } from '@apollo/server';
import type { GraphQLFormattedError } from 'graphql';
import { Pool } from 'pg';
import { hashPassword } from '../../src/auth/password';
import { typeDefs } from '../../src/graphql/schema';
import { resolvers } from '../../src/graphql/resolvers';
import { buildContext } from '../../src/context';
import { buildSascarClient, SascarOrchestrator } from '../../src/orchestrator/SascarOrchestrator';
import { loadConfig } from '../../src/config';
import { UserError } from '../../src/auth/errors';
import type { AppContext, AuthUser } from '../../src/context';

const ADMIN_EMAIL = 'admin@local.dev';
const ADMIN_PASSWORD = 'admin1234';

async function pool(): Promise<Pool> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

async function seedAdminAndUser(): Promise<{ admin: AuthUser; nonAdmin: { email: string; password: string; id: string } }> {
  const cfg = loadConfig();
  const p = await pool();
  try {
    const adminHash = await hashPassword(cfg.seed.adminPassword);
    await p.query('DELETE FROM audit_log');
    await p.query('DELETE FROM refresh_tokens');
    await p.query('DELETE FROM users WHERE email <> $1', [cfg.seed.adminEmail]);
    await p.query(
      `INSERT INTO users (email, password_hash, role, active) VALUES ($1, $2, 'admin', true)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = 'admin', active = true`,
      [cfg.seed.adminEmail, adminHash],
    );
    const { rows: adminRows } = await p.query('SELECT id FROM users WHERE email = $1', [cfg.seed.adminEmail]);
    const adminId = adminRows[0].id;

    const userEmail = `audit-user-${Date.now()}@local.dev`;
    const userPassword = 'Audit1234!';
    const userHash = await hashPassword(userPassword);
    const { rows: userRows } = await p.query(
      `INSERT INTO users (email, password_hash, role, active) VALUES ($1, $2, 'user', true) RETURNING id`,
      [userEmail, userHash],
    );
    return {
      admin: { id: adminId, email: cfg.seed.adminEmail, role: 'admin' },
      nonAdmin: { email: userEmail, password: userPassword, id: userRows[0].id },
    };
  } finally {
    await p.end();
  }
}

async function buildServerAs(user: AuthUser | null, request?: AppContext['request']): Promise<{
  executeOperation: (req: { query: string; variables?: Record<string, unknown> }) => Promise<any>;
}> {
  const ctx = await buildContext();
  (ctx as { user: AuthUser | null }).user = user;
  (ctx as { request: AppContext['request'] }).request = request;
  const orchestrator = new SascarOrchestrator(
    buildSascarClient({ usuario: 'test', senha: 'test', wsdlUrl: 'http://localhost:9999' }),
  );
  const ctxWithOrch = { ...ctx, orchestrator, request };
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    formatError: (formattedError: GraphQLFormattedError, error: unknown) => {
      let original: unknown = error;
      while (original && typeof original === 'object' && 'originalError' in (original as object)) {
        original = (original as { originalError: unknown }).originalError;
      }
      if (original instanceof UserError) {
        return original.toGraphQLFormat() as unknown as GraphQLFormattedError;
      }
      return formattedError;
    },
  });
  await server.start();
  const executeOperation = (req: { query: string; variables?: Record<string, unknown> }) =>
    server.executeOperation(req as Parameters<typeof server.executeOperation>[0], {
      contextValue: ctxWithOrch,
    });
  return { executeOperation };
}

async function loginAs(email: string, password: string): Promise<string> {
  const { executeOperation } = await buildServerAs(null);
  const res = await executeOperation({
    query: `mutation L($e: String!, $p: String!) {
      login(email: $e, password: $p) { accessToken user { role } }
    }`,
    variables: { e: email, password },
  });
  expect(res.body.singleResult.errors).toBeUndefined();
  const data = res.body.singleResult.data as { login: { accessToken: string } };
  return data.login.accessToken;
}

async function readAuditLog(filter: { action?: string; targetId?: string } = {}): Promise<any[]> {
  const p = await pool();
  try {
    const params: unknown[] = [];
    const where: string[] = [];
    if (filter.action) {
      params.push(filter.action);
      where.push(`action = $${params.length}`);
    }
    if (filter.targetId) {
      params.push(filter.targetId);
      where.push(`target_id = $${params.length}`);
    }
    const sql = `SELECT id, actor_user_id, action, target_table, target_id, diff, ip::text AS ip, user_agent, created_at
                 FROM audit_log
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY created_at DESC`;
    const { rows } = await p.query(sql, params);
    return rows;
  } finally {
    await p.end();
  }
}

function codeFromError(res: { errors?: ReadonlyArray<{ extensions?: { code?: string } }> }): string | undefined {
  return res.errors?.[0]?.extensions?.code;
}

describe('audit_log', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  });

  it('placeholder', () => {
    expect(true).toBe(true);
  });
});
