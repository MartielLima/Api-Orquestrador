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
