/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';

async function insertPosicao(
  pool: Pool,
  args: {
    idVeiculo: number;
    idPacote: string;
    dataPosicao: string;
    ignicao?: number | null;
    bloqueio?: number;
    raw?: Record<string, unknown>;
  },
): Promise<void> {
  const raw = JSON.stringify(args.raw ?? {});
  await pool.query(
    `INSERT INTO posicoes
      (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, raw, synced_via)
     VALUES ($1, $2, $3, $3, -23.5, -46.6, 60, $4, $5::jsonb, 'graphql')`,
    [args.idPacote, args.idVeiculo, args.dataPosicao, args.ignicao ?? null, raw],
  );
}

describe('Query.veiculos { status } (integration)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeEach(async () => {
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.query('DELETE FROM veiculos_cache');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('cada Veiculo retornado traz status derivado do último pacote de posição', async () => {
    await pool.query(
      `INSERT INTO veiculos_cache (id_veiculo, placa, id_cliente, descricao, raw, fetched_at, expires_at)
       VALUES (700, 'XYZ1234', 1, 'Caminhão teste', '{}'::jsonb, now(), now() + interval '1 day')`,
    );
    await insertPosicao(pool, {
      idVeiculo: 700,
      idPacote: '1',
      dataPosicao: '2026-06-18T11:55:00.000Z',
      ignicao: 1,
      raw: { bloqueio: 1, gps: 1, jamming: 0 },
    });

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `query {
        veiculos {
          idVeiculo
          placa
          status {
            bloqueado
            ignicaoLigada
            online
            atualizadoEm
            idadeSegundos
            localizacao { latitude longitude }
          }
        }
      }`,
    });

    expect(res.errors).toBeUndefined();
    const veiculos = (res.data as any).veiculos;
    const v = veiculos.find((x: any) => x.idVeiculo === 700);
    expect(v).toBeDefined();
    expect(v.placa).toBe('XYZ1234');
    expect(v.status).toBeDefined();
    expect(v.status.bloqueado).toBe(true);
    expect(v.status.ignicaoLigada).toBe(true);
    expect(v.status.online).toBe(true);
    expect(v.status.atualizadoEm).toBe('2026-06-18T11:55:00.000Z');
    expect(v.status.idadeSegundos).toBeGreaterThanOrEqual(0);
    expect(v.status.localizacao.latitude).toBe(-23.5);
    expect(v.status.localizacao.longitude).toBe(-46.6);
  });

  it('veículo sem posições em posicoes retorna status null sem quebrar a query', async () => {
    await pool.query(
      `INSERT INTO veiculos_cache (id_veiculo, placa, raw, fetched_at, expires_at)
       VALUES (800, 'ABC9999', '{}'::jsonb, now(), now() + interval '1 day')`,
    );

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `query { veiculos { idVeiculo status { bloqueado } } }`,
    });

    expect(res.errors).toBeUndefined();
    const v = (res.data as any).veiculos.find((x: any) => x.idVeiculo === 800);
    expect(v).toBeDefined();
    expect(v.status).toBeNull();
  });
});
