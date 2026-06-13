/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';

describe('requestLog query', () => {
  it('returns the most recent log entries', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `INSERT INTO request_log (method, source, status, cache_hit, latency_ms) VALUES ('test.foo', 'graphql', 'ok', false, 12)`,
    );
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: '{ requestLog(limit: 5, method: "test.foo") { method status } }',
    });
    expect(res.errors).toBeUndefined();
    const rows = (res.data as any).requestLog;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].method).toBe('test.foo');
    await pool.query(`DELETE FROM request_log WHERE method = 'test.foo'`);
    await pool.end();
  });
});
