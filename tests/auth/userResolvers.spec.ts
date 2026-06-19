import { Pool } from 'pg';
import { userResolvers } from '../../src/auth/userResolvers';
import { loadConfig } from '../../src/config';
import { hashPassword } from '../../src/auth/password';
import type { AppContext } from '../../src/context';

const cfg = loadConfig();

interface SeededUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

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
    db: {
      execute: async ({ sql, args }: { sql: string; args: unknown[] }) => {
        const { rows } = await pool.query(sql, args as never[]);
        return { rows };
      },
    } as never,
    orchestrator: {} as never,
  };
}

async function callQuery(field: string, args: unknown, user: SeededUser | null) {
  const ctx = await makeCtx(user);
  const fn = userResolvers.Query[field as keyof typeof userResolvers.Query] as (
    a: unknown,
    b: unknown,
    c: AppContext,
  ) => Promise<unknown>;
  try {
    return await fn(null, args, ctx);
  } catch (e) {
    return { __error: e as Error };
  }
}

async function callMutation(field: string, args: unknown, user: SeededUser | null) {
  const ctx = await makeCtx(user);
  const fn = userResolvers.Mutation[field as keyof typeof userResolvers.Mutation] as (
    a: unknown,
    b: unknown,
    c: AppContext,
  ) => Promise<unknown>;
  try {
    return await fn(null, args, ctx);
  } catch (e) {
    return { __error: e as Error };
  }
}

describe('userResolvers.Query.me', () => {
  it('returns the current user when authenticated', async () => {
    const u = await seedUser('admin', 'me');
    const result = (await callQuery('me', {}, u)) as { email: string };
    expect(result.email).toBe(u.email);
  });

  it('throws UNAUTHENTICATED when no user', async () => {
    const r = (await callQuery('me', {}, null)) as { __error: Error };
    expect(r.__error.message).toMatch(/Authentication required/);
  });
});

describe('userResolvers.Query.users', () => {
  it('lists all users when admin', async () => {
    const u = await seedUser('admin', 'admin-list');
    const list = (await callQuery('users', {}, u)) as Array<{ email: string }>;
    expect(list.find((x) => x.email === u.email)).toBeTruthy();
  });

  it('throws FORBIDDEN when not admin', async () => {
    const u = await seedUser('user', 'user-list');
    const r = (await callQuery('users', {}, u)) as { __error: Error };
    expect(r.__error.message).toMatch(/Admin role required/);
  });
});

describe('userResolvers.Query.refreshTokens', () => {
  it('lists tokens for a user when admin', async () => {
    const admin = await seedUser('admin', 'rt-admin');
    const target = await seedUser('user', 'rt-target');
    const list = (await callQuery('refreshTokens', { userId: target.id }, admin)) as unknown[];
    expect(Array.isArray(list)).toBe(true);
  });

  it('throws FORBIDDEN when not admin', async () => {
    const u = await seedUser('user', 'rt-user');
    const target = await seedUser('user', 'rt-target2');
    const r = (await callQuery('refreshTokens', { userId: target.id }, u)) as { __error: Error };
    expect(r.__error.message).toMatch(/Admin role required/);
  });
});

describe('userResolvers.Mutation.createUser', () => {
  it('creates a user when admin', async () => {
    const admin = await seedUser('admin', 'cu-admin');
    const email = `cu-${Date.now()}@local.dev`;
    const r = (await callMutation(
      'createUser',
      { input: { email, password: 'Aa1!aaaa', role: 'user' } },
      admin,
    )) as { email: string; id: string };
    expect(r.email).toBe(email);
    expect(r.id).toEqual(expect.any(String));
  });

  it('rejects duplicate email with EMAIL_TAKEN', async () => {
    const admin = await seedUser('admin', 'cu-dup');
    const email = `dup-${Date.now()}@local.dev`;
    await callMutation(
      'createUser',
      { input: { email, password: 'Aa1!aaaa', role: 'user' } },
      admin,
    );
    const r = (await callMutation(
      'createUser',
      { input: { email, password: 'Aa1!aaaa', role: 'user' } },
      admin,
    )) as { __error: Error };
    expect(r.__error.message).toMatch(/email/i);
  });

  it('rejects weak password with WEAK_PASSWORD', async () => {
    const admin = await seedUser('admin', 'cu-weak');
    const r = (await callMutation(
      'createUser',
      { input: { email: `w-${Date.now()}@local.dev`, password: 'short', role: 'user' } },
      admin,
    )) as { __error: Error };
    expect(r.__error.message).toMatch(/min 8 chars/);
  });

  it('rejects non-admin with FORBIDDEN', async () => {
    const u = await seedUser('user', 'cu-na');
    const r = (await callMutation(
      'createUser',
      { input: { email: `n-${Date.now()}@local.dev`, password: 'Aa1!aaaa', role: 'user' } },
      u,
    )) as { __error: Error };
    expect(r.__error.message).toMatch(/Admin role required/);
  });
});

describe('userResolvers.Mutation.updateUser', () => {
  it('changes role when admin', async () => {
    const admin = await seedUser('admin', 'uu-admin');
    const target = await seedUser('user', 'uu-target');
    const r = (await callMutation(
      'updateUser',
      { id: target.id, input: { role: 'admin' } },
      admin,
    )) as { role: string };
    expect(r.role).toBe('admin');
  });

  it('toggles active when admin', async () => {
    const admin = await seedUser('admin', 'uu-act-admin');
    const target = await seedUser('user', 'uu-act-target');
    const r = (await callMutation(
      'updateUser',
      { id: target.id, input: { active: false } },
      admin,
    )) as { id: string };
    expect(r.id).toBe(target.id);
  });

  it('rejects self-demote', async () => {
    const admin = await seedUser('admin', 'uu-self');
    const r = (await callMutation(
      'updateUser',
      { id: admin.id, input: { role: 'user' } },
      admin,
    )) as { __error: Error };
    expect(r.__error.message).toMatch(/cannot demote yourself/i);
  });

  it('rejects self-deactivate', async () => {
    const admin = await seedUser('admin', 'uu-deact');
    const r = (await callMutation(
      'updateUser',
      { id: admin.id, input: { active: false } },
      admin,
    )) as { __error: Error };
    expect(r.__error.message).toMatch(/cannot deactivate yourself/i);
  });

  it('throws USER_NOT_FOUND on missing id', async () => {
    const admin = await seedUser('admin', 'uu-missing');
    const r = (await callMutation(
      'updateUser',
      { id: '00000000-0000-0000-0000-000000000000', input: { role: 'user' } },
      admin,
    )) as { __error: Error };
    expect(r.__error.message).toMatch(/user not found/i);
  });
});

describe('userResolvers.Mutation.resetUserPassword', () => {
  it('changes the password hash when admin', async () => {
    const admin = await seedUser('admin', 'rp-admin');
    const target = await seedUser('user', 'rp-target');
    const r = (await callMutation(
      'resetUserPassword',
      { id: target.id, newPassword: 'New1Pass!aa' },
      admin,
    )) as { id: string };
    expect(r.id).toBe(target.id);
  });

  it('rejects weak password with WEAK_PASSWORD', async () => {
    const admin = await seedUser('admin', 'rp-weak');
    const target = await seedUser('user', 'rp-weak-target');
    const r = (await callMutation(
      'resetUserPassword',
      { id: target.id, newPassword: 'short' },
      admin,
    )) as { __error: Error };
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
    const r = (await callMutation('revokeRefreshToken', { id: tokenId }, admin)) as boolean;
    expect(r).toBe(true);
  });
});

describe('userResolvers.Mutation.deleteUser', () => {
  it('deletes the target user and their refresh tokens when admin', async () => {
    const admin = await seedUser('admin', 'du-admin');
    const target = await seedUser('user', 'du-target');
    const pool = new Pool({ connectionString: cfg.db.url });
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [target.id, 'test-hash-' + Date.now(), new Date(Date.now() + 86_400_000)],
    );
    await pool.end();

    const ok = (await callMutation('deleteUser', { id: target.id }, admin)) as boolean;
    expect(ok).toBe(true);

    const verifyPool = new Pool({ connectionString: cfg.db.url });
    const { rows: userRows } = await verifyPool.query('SELECT id FROM users WHERE id = $1', [target.id]);
    const { rows: tokenRows } = await verifyPool.query(
      'SELECT id FROM refresh_tokens WHERE user_id = $1',
      [target.id],
    );
    await verifyPool.end();
    expect(userRows.length).toBe(0);
    expect(tokenRows.length).toBe(0);
  });

  it('rejects self-delete', async () => {
    const admin = await seedUser('admin', 'du-self');
    const r = (await callMutation('deleteUser', { id: admin.id }, admin)) as { __error: Error };
    expect(r.__error.message).toMatch(/cannot delete yourself/i);
  });

  it('throws USER_NOT_FOUND on missing id', async () => {
    const admin = await seedUser('admin', 'du-missing');
    const r = (await callMutation(
      'deleteUser',
      { id: '00000000-0000-0000-0000-000000000000' },
      admin,
    )) as { __error: Error };
    expect(r.__error.message).toMatch(/user not found/i);
  });

  it('rejects non-admin with FORBIDDEN', async () => {
    const u = await seedUser('user', 'du-na');
    const target = await seedUser('user', 'du-na-target');
    const r = (await callMutation('deleteUser', { id: target.id }, u)) as { __error: Error };
    expect(r.__error.message).toMatch(/Admin role required/);
  });
});
