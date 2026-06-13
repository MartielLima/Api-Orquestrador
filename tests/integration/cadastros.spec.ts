/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';

describe('cadastros resolvers (with cached data)', () => {
  beforeEach(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM clientes_cache');
    await pool.query('DELETE FROM veiculos_cache');
    await pool.query('DELETE FROM motoristas_cache');
    await pool.end();
  });

  it('clientes returns cached data when present', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `INSERT INTO clientes_cache (id_cliente, cnpj, cpf, nome, raw, fetched_at, expires_at)
       VALUES (1, '123', null, 'Cliente Y', '{}'::jsonb, now(), now() + interval '1 hour')`,
    );
    await pool.end();
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: '{ clientes(quantidade: 10) { idCliente nome } }',
    });
    expect(res.errors).toBeUndefined();
    expect((res.data as any).clientes[0].nome).toBe('Cliente Y');
  });
});
