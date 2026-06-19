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

  describe('createUser', () => {
    it('grava entry com actor=admin, action=user.create, diff com id/email/role/active', async () => {
      const { admin } = await seedAdminAndUser();
      const { executeOperation } = await buildServerAs(admin);

      const newEmail = `created-${Date.now()}@local.dev`;
      const res = await executeOperation({
        query: `mutation C($i: CreateUserInput!) { createUser(input: $i) { id email role active } }`,
        variables: { i: { email: newEmail, password: 'Aa1!aaaa', role: 'user' } },
      });

      expect(res.body.singleResult.errors).toBeUndefined();
      const created = (res.body.singleResult.data as { createUser: { id: string; email: string } }).createUser;

      const entries = await readAuditLog({ action: 'user.create', targetId: created.id });
      expect(entries).toHaveLength(1);
      expect(entries[0].actor_user_id).toBe(admin.id);
      expect(entries[0].target_table).toBe('users');
      expect(entries[0].diff).toEqual({
        id: created.id,
        email: newEmail,
        role: 'user',
        active: true,
      });
      expect(entries[0].user_agent).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('grava entry com diff.role={from,to} quando muda role', async () => {
      const { admin, nonAdmin } = await seedAdminAndUser();
      const { executeOperation } = await buildServerAs(admin);

      await executeOperation({
        query: `mutation U($id: ID!, $i: UpdateUserInput!) { updateUser(id: $id, input: $i) { id role } }`,
        variables: { id: nonAdmin.id, i: { role: 'admin' } },
      });

      const entries = await readAuditLog({ action: 'user.update', targetId: nonAdmin.id });
      expect(entries).toHaveLength(1);
      expect(entries[0].actor_user_id).toBe(admin.id);
      expect(entries[0].diff).toEqual({ role: { from: 'user', to: 'admin' } });
    });

    it('grava entry com diff.active={from,to} quando muda active', async () => {
      const { admin, nonAdmin } = await seedAdminAndUser();
      const { executeOperation } = await buildServerAs(admin);

      await executeOperation({
        query: `mutation U($id: ID!, $i: UpdateUserInput!) { updateUser(id: $id, input: $i) { id active } }`,
        variables: { id: nonAdmin.id, i: { active: false } },
      });

      const entries = await readAuditLog({ action: 'user.update', targetId: nonAdmin.id });
      expect(entries).toHaveLength(1);
      expect(entries[0].diff).toEqual({ active: { from: true, to: false } });
    });

    it('NÃO grava entry quando update é noop (mesmos role+active)', async () => {
      const { admin, nonAdmin } = await seedAdminAndUser();
      const { executeOperation } = await buildServerAs(admin);

      await executeOperation({
        query: `mutation U($id: ID!, $i: UpdateUserInput!) { updateUser(id: $id, input: $i) { id } }`,
        variables: { id: nonAdmin.id, i: { role: 'user', active: true } },
      });

      const entries = await readAuditLog({ action: 'user.update', targetId: nonAdmin.id });
      expect(entries).toHaveLength(0);
    });

    it('NÃO grava entry em self-demote attempt (falha antes do UPDATE)', async () => {
      const { admin } = await seedAdminAndUser();
      const { executeOperation } = await buildServerAs(admin);

      const res = await executeOperation({
        query: `mutation U($id: ID!, $i: UpdateUserInput!) { updateUser(id: $id, input: $i) { id } }`,
        variables: { id: admin.id, i: { role: 'user' } },
      });

      expect(codeFromError(res.body.singleResult)).toBe('CANNOT_DEMOTE_SELF');
      const entries = await readAuditLog({ action: 'user.update', targetId: admin.id });
      expect(entries).toHaveLength(0);
    });
  });

  describe('resetUserPassword', () => {
    it('grava entry com marker {password_changed: true} e NUNCA contém hash/plaintext', async () => {
      const { admin, nonAdmin } = await seedAdminAndUser();
      const { executeOperation } = await buildServerAs(admin);

      await executeOperation({
        query: `mutation R($id: ID!, $p: String!) { resetUserPassword(id: $id, newPassword: $p) { id } }`,
        variables: { id: nonAdmin.id, p: 'NewAa1!aaaa' },
      });

      const entries = await readAuditLog({ action: 'user.password_reset', targetId: nonAdmin.id });
      expect(entries).toHaveLength(1);
      expect(entries[0].actor_user_id).toBe(admin.id);
      expect(entries[0].target_table).toBe('users');
      expect(entries[0].diff).toEqual({ password_changed: true });

      const serialized = JSON.stringify(entries[0].diff);
      expect(serialized).not.toContain('NewAa1!aaaa');
      expect(serialized).not.toContain('Audit1234');
      expect(serialized.toLowerCase()).not.toContain('bcrypt');
      expect(serialized).not.toContain('$2');
    });
  });

  describe('deleteUser', () => {
    it('grava entry com snapshot do row antes do DELETE', async () => {
      const { admin, nonAdmin } = await seedAdminAndUser();
      const { executeOperation } = await buildServerAs(admin);

      const res = await executeOperation({
        query: `mutation D($id: ID!) { deleteUser(id: $id) }`,
        variables: { id: nonAdmin.id },
      });
      expect((res.body.singleResult.data as { deleteUser: boolean }).deleteUser).toBe(true);

      const entries = await readAuditLog({ action: 'user.delete', targetId: nonAdmin.id });
      expect(entries).toHaveLength(1);
      expect(entries[0].actor_user_id).toBe(admin.id);
      expect(entries[0].target_table).toBe('users');
      expect(entries[0].diff).toEqual({
        id: nonAdmin.id,
        email: nonAdmin.email,
        role: 'user',
        active: true,
      });
    });
  });
});
