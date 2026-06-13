/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';

describe('posicoes GraphQL', () => {
  beforeEach(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.query(`INSERT INTO posicoes (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, raw, synced_via)
      VALUES (1, 100, now(), now(), -23.5, -46.6, 60, 1, '{}'::jsonb, 'cron')`);
    await pool.end();
  });

  it('syncStatus returns cursor rows', async () => {
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: '{ syncStatus { method idVeiculo lastIdPacote } }',
    });
    expect(res.errors).toBeUndefined();
    expect(Array.isArray((res.data as any).syncStatus)).toBe(true);
  });
});
