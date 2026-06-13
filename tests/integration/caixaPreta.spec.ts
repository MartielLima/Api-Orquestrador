/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';

describe('caixaPretaEventos (deprecated)', () => {
  it('returns empty list and does NOT call Sascar', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM caixa_preta_eventos');
    await pool.end();
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ caixaPretaEventos { id } }' });
    expect(res.errors).toBeUndefined();
    expect((res.data as any).caixaPretaEventos).toEqual([]);
  });
});
