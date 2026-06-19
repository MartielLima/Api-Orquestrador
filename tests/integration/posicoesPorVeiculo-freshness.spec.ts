/* eslint-disable @typescript-eslint/no-explicit-any */
import nock from 'nock';
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';

const SASCAR_URL = 'http://localhost:9999';

const SOAP_EMPTY = `<?xml version="1.0"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <obterPacotePosicaoPorRangeJSONResponse></obterPacotePosicaoPorRangeJSONResponse>
  </S:Body>
</S:Envelope>`;

async function seedCursor(
  pool: Pool,
  idVeiculo: number,
  lastIdPacote: string,
  lastSyncedAt: Date,
): Promise<void> {
  await pool.query('DELETE FROM sync_cursor WHERE id_veiculo = $1', [idVeiculo]);
  await pool.query(
    `INSERT INTO sync_cursor (method, id_veiculo, last_id_pacote, last_synced_at)
     VALUES ('obterPacotePosicaoPorRangeJSON', $1, $2, $3)`,
    [idVeiculo, lastIdPacote, lastSyncedAt],
  );
}

async function seedPosicao(
  pool: Pool,
  idVeiculo: number,
  idPacote: string,
  dataPosicao: Date,
): Promise<void> {
  await pool.query('DELETE FROM posicoes WHERE id_veiculo = $1', [idVeiculo]);
  await pool.query(
    `INSERT INTO posicoes (id_pacote, id_veiculo, data_posicao, data_pacote,
       latitude, longitude, velocidade, ignicao, direcao, odometro, raw, synced_via)
     VALUES ($1, $2, $3, $3, -23.5, -46.6, 60, 1, 90, 100.0, '{}'::jsonb, 'cron')`,
    [idPacote, idVeiculo, dataPosicao],
  );
}

describe('posicoesPorVeiculo cursor-freshness skip', () => {
  afterEach(() => nock.cleanAll());

  it('does not call Sascar when cursor is fresh (lastSyncedAt within TTL)', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await seedCursor(pool, 77001, '999', new Date(Date.now() - 60_000));
    await seedPosicao(pool, 77001, '998', new Date(Date.now() - 90_000));

    let unexpectedSascarCall = false;
    nock(SASCAR_URL)
      .post(/.*/)
      .reply(() => {
        unexpectedSascarCall = true;
        return [200, SOAP_EMPTY];
      });

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `query P($id: Int!, $ini: DateTime!, $fim: DateTime!) {
        posicoesPorVeiculo(idVeiculo: $id, dataInicio: $ini, dataFim: $fim) { idPacote }
      }`,
      variables: {
        id: 77001,
        ini: '2020-01-01T00:00:00Z',
        fim: '2030-01-01T00:00:00Z',
      },
    });

    expect(res.errors).toBeUndefined();
    expect((res.data as any).posicoesPorVeiculo).toHaveLength(1);
    expect((res.data as any).posicoesPorVeiculo[0].idPacote).toBe('998');
    expect(unexpectedSascarCall).toBe(false);

    await pool.end();
  });

  it('calls Sascar when cursor is stale (lastSyncedAt older than TTL)', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await seedCursor(pool, 77002, '999', new Date(Date.now() - 10 * 60_000));

    const sascarCalled = nock(SASCAR_URL)
      .post(/.*/)
      .reply(200, SOAP_EMPTY);

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `query P($id: Int!, $ini: DateTime!, $fim: DateTime!) {
        posicoesPorVeiculo(idVeiculo: $id, dataInicio: $ini, dataFim: $fim) { idPacote }
      }`,
      variables: {
        id: 77002,
        ini: '2020-01-01T00:00:00Z',
        fim: '2030-01-01T00:00:00Z',
      },
    });

    expect(res.errors).toBeUndefined();
    expect(sascarCalled.isDone()).toBe(true);

    await pool.end();
  });

  it('calls Sascar when no cursor exists (first call for this vehicle)', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM sync_cursor WHERE id_veiculo = $1', [77003]);

    const sascarCalled = nock(SASCAR_URL)
      .post(/.*/)
      .reply(200, SOAP_EMPTY);

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `query P($id: Int!, $ini: DateTime!, $fim: DateTime!) {
        posicoesPorVeiculo(idVeiculo: $id, dataInicio: $ini, dataFim: $fim) { idPacote }
      }`,
      variables: {
        id: 77003,
        ini: '2020-01-01T00:00:00Z',
        fim: '2030-01-01T00:00:00Z',
      },
    });

    expect(res.errors).toBeUndefined();
    expect(sascarCalled.isDone()).toBe(true);

    await pool.end();
  });
});
