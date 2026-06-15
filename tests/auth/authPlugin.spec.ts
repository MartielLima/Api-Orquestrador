import { ApolloServer, HeaderMap } from '@apollo/server';
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

function buildAuthHeader(token: string | null): HeaderMap {
  const headers = new HeaderMap();
  if (token) headers.set('authorization', `Bearer ${token}`);
  return headers;
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
      {
        query: '{ whoami }',
        http: { method: 'POST', headers: buildAuthHeader(token), search: '', body: undefined },
      },
      { contextValue: { logger: console, db: {} as never, orchestrator: {} as never } as never },
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
      {
        query: '{ whoami }',
        http: { method: 'POST', headers: buildAuthHeader('not-a-jwt'), search: '', body: undefined },
      },
      { contextValue: { logger: console, db: {} as never, orchestrator: {} as never } as never },
    );
    const body = res.body as { singleResult: { data?: { whoami: string } } };
    expect(body.singleResult.data?.whoami).toBe('anon');
    await server.stop();
  });
});

