/* eslint-disable @typescript-eslint/no-explicit-any */
import nock from 'nock';
import { Pool } from 'pg';
import { fetchAndUpsertPosicoes } from '../../src/domain/posicoes';
import { buildSascarClient, SascarOrchestrator } from '../../src/orchestrator/SascarOrchestrator';

const SASCAR_URL = 'https://sasintegra.sascar.com.br';

describe('posicoes domain (mocked Sascar)', () => {
  afterEach(() => nock.cleanAll());

  it('fetches from Sascar when no cursor, inserts posicoes, advances cursor', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.query(
      `INSERT INTO veiculos_cache (id_veiculo, placa, raw, fetched_at, expires_at) VALUES (777, 'AAA1111', '{}'::jsonb, now(), now() + interval '1 day') ON CONFLICT (id_veiculo) DO NOTHING`,
    );

    nock(SASCAR_URL)
      .post(/.*/)
      .reply(
        200,
        `<?xml version="1.0"?>
        <S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
          <S:Body>
            <obterPacotePosicaoPorRangeJSONResponse>
              <return>{"idVeiculo":777,"idPacote":1001,"dataPosicao":"2026-06-12T12:00:00","dataPacote":"2026-06-12T12:00:00","latitude":-23.5,"longitude":-46.6,"velocidade":60,"ignicao":1,"direcao":90,"odometro":1234.5}</return>
              <return>{"idVeiculo":777,"idPacote":1002,"dataPosicao":"2026-06-12T12:00:30","dataPacote":"2026-06-12T12:00:30","latitude":-23.6,"longitude":-46.7,"velocidade":70,"ignicao":1,"direcao":90,"odometro":1235.0}</return>
            </obterPacotePosicaoPorRangeJSONResponse>
          </S:Body>
        </S:Envelope>`,
      );

    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: `${SASCAR_URL}/x` });
    const orch = new SascarOrchestrator(sascar);
    const ctx = {
      user: null,
      logger: console as unknown as any,
      db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
      orchestrator: orch,
    };
    const n = await fetchAndUpsertPosicoes(ctx, 777);
    expect(n).toBe(2);
    const { rows } = await pool.query(
      'SELECT count(*)::int as c FROM posicoes WHERE id_veiculo = 777',
    );
    expect(rows[0].c).toBe(2);
    const { rows: cur } = await pool.query(
      'SELECT last_id_pacote FROM sync_cursor WHERE id_veiculo = 777',
    );
    expect(Number(cur[0].last_id_pacote)).toBe(1002);
    await pool.end();
  });
});
