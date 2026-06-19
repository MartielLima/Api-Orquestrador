/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import {
  getPosicoesRecentes,
  waitForPendingPosicaoRefreshes,
} from '../../src/domain/posicoes';
import { buildSascarClient, SascarOrchestrator } from '../../src/orchestrator/SascarOrchestrator';

const SASCAR_URL = 'https://sasintegra.sascar.com.br';
const TEST_VEHICLE_ID = 9_999_001;
const TEST_PACOTE_STALE = 9_999_001_001;
const TEST_PACOTE_FRESH = 9_999_001_002;

describe('getPosicoesRecentes stale-while-revalidate', () => {
  afterEach(async () => {
    await waitForPendingPosicaoRefreshes();
  });

  it('returns stale cached positions immediately and does not block on Sascar', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM posicoes WHERE id_veiculo = $1', [TEST_VEHICLE_ID]);
    await pool.query('DELETE FROM sync_cursor WHERE id_veiculo = $1', [TEST_VEHICLE_ID]);
    await pool.query('DELETE FROM veiculos_cache WHERE id_veiculo = $1', [TEST_VEHICLE_ID]);

    await pool.query(
      `INSERT INTO veiculos_cache (id_veiculo, placa, raw, fetched_at, expires_at)
       VALUES ($1, 'TST0001', '{}'::jsonb, now(), now() + interval '1 day')`,
      [TEST_VEHICLE_ID],
    );

    await pool.query(
      `INSERT INTO posicoes (id_pacote, id_veiculo, data_posicao, data_pacote,
         latitude, longitude, velocidade, ignicao, direcao, odometro, raw, synced_via)
       VALUES ($1, $2, now() - interval '6 minutes', now() - interval '6 minutes',
         -23.5, -46.6, 50, 1, 90, 1234.5, '{}'::jsonb, 'graphql')`,
      [TEST_PACOTE_STALE, TEST_VEHICLE_ID],
    );

    const sascar = buildSascarClient({
      usuario: 'u',
      senha: 's',
      wsdlUrl: `${SASCAR_URL}/x`,
      timeoutMs: 5000,
      maxRetries: 0,
    });
    const orch = new SascarOrchestrator(sascar);

    const slowSascar = jest.spyOn(orch, 'call').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5_000));
      return [];
    });

    const ctx = {
      user: null,
      logger: console as unknown as any,
      db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
      orchestrator: orch,
    };

    const start = Date.now();
    const result = await getPosicoesRecentes(ctx, 1000);
    const elapsed = Date.now() - start;
    const ourRows = result.filter((r) => r.idVeiculo === TEST_VEHICLE_ID);

    expect(elapsed).toBeLessThan(1_000);
    expect(ourRows).toHaveLength(1);
    expect(ourRows[0].idPacote).toBe(String(TEST_PACOTE_STALE));

    slowSascar.mockRestore();
    await pool.end();
  });

  it('returns empty result for our test vehicle when cache is empty (cold bootstrap, blocking)', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.query('DELETE FROM veiculos_cache');

    await pool.query(
      `INSERT INTO veiculos_cache (id_veiculo, placa, raw, fetched_at, expires_at)
       VALUES ($1, 'TST0002', '{}'::jsonb, now(), now() + interval '1 day')`,
      [TEST_VEHICLE_ID],
    );

    const sascar = buildSascarClient({
      usuario: 'u',
      senha: 's',
      wsdlUrl: `${SASCAR_URL}/x`,
      timeoutMs: 5000,
      maxRetries: 0,
    });
    const orch = new SascarOrchestrator(sascar);
    const stub = jest.spyOn(orch, 'call').mockResolvedValue([]);

    const ctx = {
      user: null,
      logger: console as unknown as any,
      db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
      orchestrator: orch,
    };

    const result = await getPosicoesRecentes(ctx, 1000);
    const ourRows = result.filter((r) => r.idVeiculo === TEST_VEHICLE_ID);

    expect(ourRows).toEqual([]);
    expect(stub).toHaveBeenCalled();

    stub.mockRestore();
    await pool.end();
  });

  it('returns fresh positions without triggering any Sascar call', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.query('DELETE FROM veiculos_cache');

    await pool.query(
      `INSERT INTO posicoes (id_pacote, id_veiculo, data_posicao, data_pacote,
         latitude, longitude, velocidade, ignicao, direcao, odometro, raw, synced_via)
       VALUES ($1, $2, now() - interval '30 seconds', now() - interval '30 seconds',
         -23.5, -46.6, 50, 1, 90, 1234.5, '{}'::jsonb, 'graphql')`,
      [TEST_PACOTE_FRESH, TEST_VEHICLE_ID],
    );

    const sascar = buildSascarClient({
      usuario: 'u',
      senha: 's',
      wsdlUrl: `${SASCAR_URL}/x`,
      timeoutMs: 5000,
      maxRetries: 0,
    });
    const orch = new SascarOrchestrator(sascar);
    const stub = jest.spyOn(orch, 'call').mockResolvedValue([]);

    const ctx = {
      user: null,
      logger: console as unknown as any,
      db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
      orchestrator: orch,
    };

    const result = await getPosicoesRecentes(ctx, 1000);
    const ourRows = result.filter((r) => r.idVeiculo === TEST_VEHICLE_ID);

    expect(ourRows).toHaveLength(1);
    expect(ourRows[0].idPacote).toBe(String(TEST_PACOTE_FRESH));
    expect(stub).not.toHaveBeenCalled();

    stub.mockRestore();
    await pool.end();
  });
});
