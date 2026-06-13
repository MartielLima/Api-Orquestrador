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
