import { Pool } from 'pg';
import { hashPassword } from '../../src/auth/password';
import { buildTestServer } from '../helpers/server';

async function seedUser() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const email = 'auth-test@local';
  const passwordHash = await hashPassword('test1234');
  await pool.query(
    'DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email = $1)',
    [email],
  );
  await pool.query('DELETE FROM users WHERE email = $1', [email]);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [
    email,
    passwordHash,
    'user',
  ]);
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
    const data = res.data as { login: { accessToken: string; user: { email: string } } };
    expect(data.login.accessToken).toEqual(expect.any(String));
    expect(data.login.user.email).toBe('auth-test@local');
  });

  it('login rejects wrong password', async () => {
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `mutation L($e: String!, $p: String!) { login(email: $e, password: $p) { accessToken } }`,
      variables: { e: 'auth-test@local', p: 'wrong' },
    });
    expect(res.errors).toBeDefined();
    expect(res.errors![0].message).toMatch(/Invalid credentials/);
  });
});
