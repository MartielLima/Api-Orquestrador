/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';

const runSmoke = process.env.RUN_BENCHMARK_SMOKE === '1';
const requiredEnv = ['SASCAR_WSDL_URL', 'SASCAR_USUARIO', 'SASCAR_SENHA', 'DATABASE_URL'];
const missingEnv = requiredEnv.filter((k) => !process.env[k]);
const describeIfReady = runSmoke && missingEnv.length === 0 ? describe : describe.skip;

function fmtSascar(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

describeIfReady('Sascar benchmark smoke (gated by RUN_BENCHMARK_SMOKE=1)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let ctx: any;
  let getVeiculos: any;
  let sascar: any;
  let orch: any;

  beforeAll(async () => {
    const sascarMod = await import('../../src/orchestrator/SascarOrchestrator');
    const veiculosMod = await import('../../src/domain/veiculos');
    sascar = sascarMod.buildSascarClient({
      usuario: process.env.SASCAR_USUARIO!,
      senha: process.env.SASCAR_SENHA!,
      wsdlUrl: process.env.SASCAR_WSDL_URL!,
    });
    orch = new sascarMod.SascarOrchestrator(sascar);
    getVeiculos = veiculosMod.getVeiculos;
    ctx = {
      user: null,
      logger: console as unknown as any,
      db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
      orchestrator: orch,
    };
  });

  afterAll(async () => {
    await pool.end();
  });

  it('blackbox: 1 veículo, 1 janela retorna dados', async () => {
    await getVeiculos(ctx, { quantidade: 1 });
    const { rows: vrows } = await pool.query('SELECT id_veiculo, placa FROM veiculos_cache LIMIT 1');
    if (vrows.length === 0) throw new Error('Nenhum veículo no cache (rode o sascar-real primeiro)');
    const { id_veiculo, placa } = vrows[0];

    const now = new Date();
    const windowStart = new Date(now.getTime() - 10 * 60 * 1000);
    const result = await orch.call('solicitarEventosCaixaPreta', [
      id_veiculo,
      placa,
      fmtSascar(windowStart),
      fmtSascar(now),
    ]);
    expect(result).toBeDefined();
  }, 30_000);

  it('can bus: 1 veículo retorna dados adicionais', async () => {
    const { rows: vrows } = await pool.query('SELECT id_veiculo FROM veiculos_cache LIMIT 1');
    if (vrows.length === 0) throw new Error('Nenhum veículo no cache');
    const { id_veiculo } = vrows[0];

    const result = await orch.call('obterDadosAdicionais', [id_veiculo]);
    expect(result).toBeDefined();
  }, 30_000);

  it('history: 1 veículo retorna posições (35 dias)', async () => {
    const { rows: vrows } = await pool.query('SELECT id_veiculo FROM veiculos_cache LIMIT 1');
    if (vrows.length === 0) throw new Error('Nenhum veículo no cache');
    const { id_veiculo } = vrows[0];

    const now = new Date();
    const historyStart = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);
    const result = await orch.call('obterPacotePosicaoHistorico', [
      fmtSascar(historyStart),
      fmtSascar(now),
      id_veiculo,
    ]);
    expect(result).toBeDefined();
  }, 90_000);
});