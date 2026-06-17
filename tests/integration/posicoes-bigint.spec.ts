/* eslint-disable @typescript-eslint/no-explicit-any */
import nock from 'nock';
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';

const SASCAR_URL = 'http://localhost:9999';
// 9007199254740993 = 2^53 + 1 — o menor inteiro > 2^53, exatamente o limiar onde
// Number() perde precisão. Number('9007199254740993') === 9007199254740992 (off-by-one),
// enquanto String() preserva '9007199254740993'. Cabe em Postgres bigint (max 2^63-1 ≈ 9.22e18).
// Não corresponde a um id_pacote real da Sascar (que hoje é ~9.3e9, < 2^53).
const BIG_ID_PACOTE = '9007199254740993';

describe('BigInt passthrough em posicoesPorVeiculo e syncStatus', () => {
  beforeEach(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.end();
  });

  afterEach(() => nock.cleanAll());

  it('posicoesPorVeiculo.idPacote preserva precisão > 2^53 (string passthrough)', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `INSERT INTO posicoes (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, raw, synced_via)
       VALUES ($1, 100, now(), now(), -23.5, -46.6, 60, 1, '{}'::jsonb, 'cron')`,
      [BIG_ID_PACOTE],
    );

    nock(SASCAR_URL)
      .post(/.*/)
      .reply(
        200,
        `<?xml version="1.0"?>
        <S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
          <S:Body>
            <obterPacotePosicaoPorRangeJSONResponse>
            </obterPacotePosicaoPorRangeJSONResponse>
          </S:Body>
        </S:Envelope>`,
      );

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `query P($id: Int!, $ini: DateTime!, $fim: DateTime!) {
        posicoesPorVeiculo(idVeiculo: $id, dataInicio: $ini, dataFim: $fim) { idPacote }
      }`,
      variables: { id: 100, ini: '2020-01-01T00:00:00Z', fim: '2030-01-01T00:00:00Z' },
    });
    expect(res.errors).toBeUndefined();
    const idPacote = (res.data as any).posicoesPorVeiculo[0].idPacote;
    expect(idPacote).toBe(BIG_ID_PACOTE);
    await pool.end();
  });

  it('syncStatus.lastIdPacote preserva precisao > 2^53 (string passthrough)', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `INSERT INTO sync_cursor (method, id_veiculo, last_id_pacote, last_synced_at)
       VALUES ('obterPacotePosicaoPorRangeJSON', 100, $1, now())`,
      [BIG_ID_PACOTE],
    );

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: '{ syncStatus { method idVeiculo lastIdPacote } }',
    });
    expect(res.errors).toBeUndefined();
    const cursor = (res.data as any).syncStatus.find(
      (c: any) => c.method === 'obterPacotePosicaoPorRangeJSON' && c.idVeiculo === 100,
    );
    expect(cursor).toBeDefined();
    expect(cursor.lastIdPacote).toBe(BIG_ID_PACOTE);
    await pool.end();
  });

  it('posicoesRecentes.idPacote preserva precisao > 2^53 (string passthrough via mapPosicoes)', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `INSERT INTO posicoes (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, raw, synced_via)
       VALUES ($1, 100, now(), now(), -23.5, -46.6, 60, 1, '{}'::jsonb, 'cron')`,
      [BIG_ID_PACOTE],
    );

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: '{ posicoesRecentes(quantidade: 10) { idPacote } }',
    });
    expect(res.errors).toBeUndefined();
    expect((res.data as any).posicoesRecentes.length).toBeGreaterThan(0);
    const idPacote = (res.data as any).posicoesRecentes[0].idPacote;
    expect(idPacote).toBe(BIG_ID_PACOTE);
    await pool.end();
  });
});
