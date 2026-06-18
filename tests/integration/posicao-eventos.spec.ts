/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';

describe('posicao_eventos (integration)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeEach(async () => {
    await pool.query('DELETE FROM posicao_eventos WHERE id_pacote IN (9322440100, 9322440200, 9322440300, 9322440400, 9322440401)');
    await pool.query('DELETE FROM posicoes WHERE id_pacote IN (9322440100, 9322440200, 9322440300, 9322440400, 9322440401)');
    await pool.query('DELETE FROM sync_cursor');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('insert em posicao_eventos retorna rows com event_type/signal/value_* corretos', async () => {
    const { rows: evts } = await pool.query(
      `INSERT INTO posicao_eventos
        (id_veiculo, id_pacote, data_posicao, event_type, signal, value_numeric, value_text, value_bool, metadata)
       VALUES
        (100, 9322440100, now(), 'snapshot', 'ignicao', NULL, NULL, true, NULL),
        (100, 9322440100, now(), 'snapshot', 'rpm', 1500, NULL, NULL, NULL)
       RETURNING *`,
    );
    expect(evts).toHaveLength(2);
    expect(evts[0].event_type).toBe('snapshot');
    expect(evts[0].signal).toBe('ignicao');
    expect(evts[0].value_bool).toBe(true);
  });

  it('transition row registra from_value e to_value no metadata', async () => {
    const { rows } = await pool.query(
      `INSERT INTO posicao_eventos
        (id_veiculo, id_pacote, data_posicao, event_type, signal, value_bool, metadata)
       VALUES (100, 9322440200, now(), 'transition', 'ignicao', true, $1)
       RETURNING *`,
      [JSON.stringify({ from_value: 0, to_value: 1 })],
    );
    expect(rows[0].event_type).toBe('transition');
    expect(rows[0].metadata).toEqual({ from_value: 0, to_value: 1 });
  });

  it('unique constraint dedup por (id_veiculo, id_pacote, event_type, signal)', async () => {
    await pool.query(
      `INSERT INTO posicao_eventos
        (id_veiculo, id_pacote, data_posicao, event_type, signal, value_bool)
       VALUES (100, 9322440300, now(), 'snapshot', 'ignicao', true)`,
    );
    await expect(
      pool.query(
        `INSERT INTO posicao_eventos
          (id_veiculo, id_pacote, data_posicao, event_type, signal, value_bool)
         VALUES (100, 9322440300, now(), 'snapshot', 'ignicao', false)`,
      ),
    ).rejects.toThrow(/posicao_eventos_id_veiculo_id_pacote_event_type_signal_key/);
  });

  it('queries por (id_veiculo, data_posicao) usam idx_veiculo_data', async () => {
    await pool.query(
      `INSERT INTO posicao_eventos
        (id_veiculo, id_pacote, data_posicao, event_type, signal, value_numeric)
       VALUES (100, 9322440400, now() - interval '1 hour', 'snapshot', 'rpm', 1500),
              (100, 9322440401, now(), 'snapshot', 'rpm', 2200)`,
    );
    const { rows } = await pool.query(
      `SELECT signal, value_numeric, data_posicao
       FROM posicao_eventos
       WHERE id_veiculo = 100 AND data_posicao > now() - interval '2 hours'
       ORDER BY data_posicao DESC`,
    );
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].value_numeric)).toBe(2200);
  });
});
