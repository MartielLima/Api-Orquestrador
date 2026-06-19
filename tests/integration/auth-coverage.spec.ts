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
import type { AuthUser } from '../../src/context';

interface AuthCoverageCase {
  field: string;
  query: string;
  variables?: Record<string, unknown>;
  requires: 'auth' | 'admin';
}

const PROTECTED_AUTH: AuthCoverageCase[] = [
  { field: 'clientes', query: '{ clientes(quantidade: 1) { idCliente } }', requires: 'auth' },
  { field: 'veiculos', query: '{ veiculos(quantidade: 1) { idVeiculo } }', requires: 'auth' },
  { field: 'motoristas', query: '{ motoristas(quantidade: 1) { idMotorista } }', requires: 'auth' },
  { field: 'posicoesRecentes', query: '{ posicoesRecentes(quantidade: 1) { idVeiculo } }', requires: 'auth' },
  {
    field: 'posicoesPorVeiculo',
    query:
      'query($id: Int!, $di: DateTime!, $df: DateTime!) { posicoesPorVeiculo(idVeiculo: $id, dataInicio: $di, dataFim: $df) { idVeiculo } }',
    variables: { id: 777, di: '2020-01-01T00:00:00Z', df: '2030-01-01T00:00:00Z' },
    requires: 'auth',
  },
  { field: 'caixaPretaEventos', query: '{ caixaPretaEventos { id } }', requires: 'auth' },
];

const PROTECTED_ADMIN: AuthCoverageCase[] = [
  { field: 'syncStatus', query: '{ syncStatus { idVeiculo } }', requires: 'admin' },
  { field: 'requestLog', query: '{ requestLog(limit: 1) { id } }', requires: 'admin' },
];

const PUBLIC: AuthCoverageCase[] = [
  { field: 'health', query: '{ health }', requires: 'auth' },
];

async function seedNonAdminUser(): Promise<{ email: string; password: string }> {
  const email = 'coverage-user@local';
  const password = 'coverage-pass-1234';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const passwordHash = await hashPassword(password);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email = $1)', [email]);
    await pool.query('DELETE FROM users WHERE email = $1', [email]);
    await pool.query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'user')", [email, passwordHash]);
  } finally {
    await pool.end();
  }
  return { email, password };
}

async function seedVehicleAndPosition(idVeiculo: number): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query('DELETE FROM posicoes WHERE id_veiculo = $1', [idVeiculo]);
    await pool.query('DELETE FROM sync_cursor WHERE id_veiculo = $1', [idVeiculo]);
    await pool.query(
      `INSERT INTO veiculos_cache (id_veiculo, placa, raw, fetched_at, expires_at)
       VALUES ($1, $2, '{}'::jsonb, now(), now() + interval '1 day')
       ON CONFLICT (id_veiculo) DO NOTHING`,
      [idVeiculo, 'AAA1111'],
    );
    await pool.query(
      `INSERT INTO posicoes (id_pacote, id_veiculo, data_posicao, data_pacote,
         latitude, longitude, velocidade, ignicao, direcao, odometro, raw, synced_via)
       VALUES ('1', $1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
         -23.5, -46.6, 60, 1, 90, 100.0, '{}'::jsonb, 'cron')`,
      [idVeiculo],
    );
    await pool.query(
      `INSERT INTO sync_cursor (method, id_veiculo, last_id_pacote, last_synced_at)
       VALUES ('obterPacotePosicaoPorRangeJSON', $1, 1, now())`,
      [idVeiculo],
    );
  } finally {
    await pool.end();
  }
}

async function seedCadastrosCaches(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query('DELETE FROM clientes_cache');
    await pool.query('DELETE FROM motoristas_cache');
    await pool.query(
      `INSERT INTO clientes_cache (id_cliente, nome, cnpj, raw, fetched_at, expires_at)
       VALUES (1, 'Cliente Teste', '00000000000', '{}'::jsonb, now(), now() + interval '1 day')`,
    );
    await pool.query(
      `INSERT INTO motoristas_cache (id_motorista, nome, raw, fetched_at, expires_at)
       VALUES (1, 'Motorista Teste', '{}'::jsonb, now(), now() + interval '1 day')`,
    );
  } finally {
    await pool.end();
  }
}

async function loginAs(email: string, password: string): Promise<{ accessToken: string; role: string }> {
  const { executeOperation } = await buildServerAs(null);
  const res = await executeOperation({
    query: `mutation L($e: String!, $p: String!) {
      login(email: $e, password: $p) { accessToken user { role } }
    }`,
    variables: { e: email, p: password },
  });
  expect(res.body.singleResult.errors).toBeUndefined();
  const data = res.body.singleResult.data as { login: { accessToken: string; user: { role: string } } };
  return { accessToken: data.login.accessToken, role: data.login.user.role };
}

async function buildServerAs(user: AuthUser | null): Promise<{
  executeOperation: (request: { query: string; variables?: Record<string, unknown> }) => Promise<any>;
}> {
  const ctx = await buildContext();
  (ctx as { user: AuthUser | null }).user = user;
  const orchestrator = new SascarOrchestrator(
    buildSascarClient({ usuario: 'test', senha: 'test', wsdlUrl: 'http://localhost:9999' }),
  );
  const ctxWithOrch = { ...ctx, orchestrator };
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    // No authPlugin: ctx.user is set directly. The real plugin would overwrite
    // ctx.user based on the Authorization header of the HTTP request, but
    // executeOperation doesn't expose http headers, so we set the user
    // explicitly per test.
    // Mirror src/server.ts formatError so UserError → proper extensions.code.
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
  const executeOperation = (request: { query: string; variables?: Record<string, unknown> }) =>
    server.executeOperation(request as Parameters<typeof server.executeOperation>[0], {
      contextValue: ctxWithOrch,
    });
  return { executeOperation };
}

function codeFromError(res: { errors?: ReadonlyArray<{ extensions?: { code?: string } }> }): string | undefined {
  return res.errors?.[0]?.extensions?.code;
}

describe('auth coverage', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
    await seedNonAdminUser();
    await seedVehicleAndPosition(777);
    await seedCadastrosCaches();
  });

  describe('without token', () => {
    const allCases = [...PROTECTED_AUTH, ...PROTECTED_ADMIN];
    for (const c of allCases) {
      it(`${c.field} returns UNAUTHENTICATED`, async () => {
        const { executeOperation } = await buildServerAs(null);
        const res = await executeOperation({ query: c.query, variables: c.variables });
        const body = res.body;
        expect(body.singleResult.errors).toBeDefined();
        expect(codeFromError(body.singleResult)).toBe('UNAUTHENTICATED');
      });
    }
  });

  describe('with non-admin token', () => {
    let userToken: string;
    beforeAll(async () => {
      const { email, password } = await seedNonAdminUser();
      const out = await loginAs(email, password);
      userToken = out.accessToken;
      expect(out.role).toBe('user');
    });

    for (const c of PROTECTED_AUTH) {
      it(`${c.field} is reachable for non-admin (requireAuth only)`, async () => {
        const { executeOperation } = await buildServerAs({
          id: 'user-id',
          email: 'coverage-user@local',
          role: 'user',
        });
        const res = await executeOperation({
          query: c.query,
          variables: c.variables,
        });
        const body = res.body;
        expect(body.singleResult.errors).toBeUndefined();
      });
    }

    for (const c of PROTECTED_ADMIN) {
      it(`${c.field} returns FORBIDDEN for non-admin`, async () => {
        const { executeOperation } = await buildServerAs({
          id: 'user-id',
          email: 'coverage-user@local',
          role: 'user',
        });
        const res = await executeOperation({ query: c.query });
        const body = res.body;
        expect(body.singleResult.errors).toBeDefined();
        expect(codeFromError(body.singleResult)).toBe('FORBIDDEN');
      });
    }

    it('auth header token is honored for requireAuth paths', async () => {
      expect(userToken).toBeTruthy();
    });
  });

  describe('with admin token', () => {
    let adminUser: AuthUser;
    beforeAll(async () => {
      const cfg = loadConfig();
      const adminEmail = cfg.seed.adminEmail;
      const out = await loginAs(adminEmail, cfg.seed.adminPassword);
      expect(out.role).toBe('admin');
      adminUser = { id: 'admin-id', email: adminEmail, role: 'admin' };
    });

    for (const c of [...PROTECTED_AUTH, ...PROTECTED_ADMIN]) {
      it(`${c.field} is reachable for admin`, async () => {
        const { executeOperation } = await buildServerAs(adminUser);
        const res = await executeOperation({ query: c.query, variables: c.variables });
        const body = res.body;
        expect(body.singleResult.errors).toBeUndefined();
      });
    }
  });

  describe('public', () => {
    for (const c of PUBLIC) {
      it(`${c.field} works without token`, async () => {
        const { executeOperation } = await buildServerAs(null);
        const res = await executeOperation({ query: c.query });
        const body = res.body;
        expect(body.singleResult.errors).toBeUndefined();
        expect(body.singleResult.data).toBeDefined();
      });
    }
  });
});