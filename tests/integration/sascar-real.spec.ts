/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { buildSascarClient, SascarOrchestrator } from '../../src/orchestrator/SascarOrchestrator';
import { getClientes } from '../../src/domain/clientes';
import { getVeiculos } from '../../src/domain/veiculos';
import { getMotoristas } from '../../src/domain/motoristas';
import { fetchAndUpsertPosicoes } from '../../src/domain/posicoes';
import { buildTestServer } from '../helpers/server';

const runReal = process.env.RUN_REAL_SASCAR_TESTS === '1';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const describeIf = runReal ? describe : describe.skip;

// Pula a suite inteira se faltar credencial, mesmo com RUN_REAL_SASCAR_TESTS=1.
const requiredEnv = ['SASCAR_WSDL_URL', 'SASCAR_USUARIO', 'SASCAR_SENHA', 'DATABASE_URL'];
const missingEnv = requiredEnv.filter((k) => !process.env[k]);
const describeIfReady = runReal && missingEnv.length === 0 ? describe : describe.skip;

describeIfReady('Sascar integration real (gated by RUN_REAL_SASCAR_TESTS=1)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sascar = buildSascarClient({
    usuario: process.env.SASCAR_USUARIO!,
    senha: process.env.SASCAR_SENHA!,
    wsdlUrl: process.env.SASCAR_WSDL_URL!,
  });
  const orch = new SascarOrchestrator(sascar);
  const ctx = {
    user: null,
    logger: console as unknown as any,
    db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
    orchestrator: orch,
  } as any;

  beforeEach(async () => {
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.query('DELETE FROM veiculos_cache');
    await pool.query('DELETE FROM clientes_cache');
    await pool.query('DELETE FROM motoristas_cache');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('obterClientesV2 → clientes_cache → Query.clientes', async () => {
    const clientes = await getClientes(ctx, { quantidade: 5 });
    expect(clientes.length).toBeGreaterThan(0);
    expect(clientes[0]).toHaveProperty('idCliente');
    expect(clientes[0]).toHaveProperty('nome');
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM clientes_cache');
    expect(rows[0].c).toBeGreaterThan(0);

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ clientes(quantidade: 5) { idCliente nome } }' });
    expect(res.errors).toBeUndefined();
    expect((res.data as any).clientes.length).toBeGreaterThan(0);
  });

  it('obterVeiculos → veiculos_cache → Query.veiculos { idEquipamento }', async () => {
    const veiculos = await getVeiculos(ctx, { quantidade: 5 });
    expect(veiculos.length).toBeGreaterThan(0);
    expect(veiculos[0]).toHaveProperty('idVeiculo');
    expect(veiculos[0]).toHaveProperty('placa');
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM veiculos_cache');
    expect(rows[0].c).toBeGreaterThan(0);

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: '{ veiculos(quantidade: 5) { idVeiculo placa idEquipamento } }',
    });
    expect(res.errors).toBeUndefined();
    const sample = (res.data as any).veiculos[0];
    // idEquipamento vem como string (BigInt scalar) — pode ser null se rastreador sem chip
    if (sample.idEquipamento !== null) {
      expect(typeof sample.idEquipamento).toBe('string');
    }
  });

  it('obterMotoristas → motoristas_cache → Query.motoristas', async () => {
    const motoristas = await getMotoristas(ctx, { quantidade: 5 });
    expect(motoristas.length).toBeGreaterThan(0);
    expect(motoristas[0]).toHaveProperty('idMotorista');
    expect(motoristas[0]).toHaveProperty('nome');
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM motoristas_cache');
    expect(rows[0].c).toBeGreaterThan(0);

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ motoristas(quantidade: 5) { idMotorista nome } }' });
    expect(res.errors).toBeUndefined();
    expect((res.data as any).motoristas.length).toBeGreaterThan(0);
  });

  it('obterPacotePosicaoPorRangeJSON → posicoes → Veiculo.status via GraphQL', async () => {
    // Pega o primeiro veículo do cache (populado pelo test anterior OU re-popula)
    if ((await pool.query('SELECT COUNT(*)::int AS c FROM veiculos_cache')).rows[0].c === 0) {
      await getVeiculos(ctx, { quantidade: 1 });
    }
    const { rows: vrows } = await pool.query('SELECT id_veiculo FROM veiculos_cache LIMIT 1');
    if (vrows.length === 0) throw new Error('Nenhum veículo retornado pelo Sascar');
    const idVeiculo = vrows[0].id_veiculo;

    await fetchAndUpsertPosicoes(ctx, idVeiculo);
    const { rows: prows } = await pool.query('SELECT COUNT(*)::int AS c FROM posicoes WHERE id_veiculo = $1', [idVeiculo]);
    expect(prows[0].c).toBeGreaterThan(0);

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `query V($id: Int!) {
        veiculos(idVeiculo: $id) {
          idVeiculo
          placa
          status { bloqueado ignicaoLigada online idadeSegundos }
        }
      }`,
      variables: { id: idVeiculo },
    });
    expect(res.errors).toBeUndefined();
    const v = (res.data as any).veiculos[0];
    expect(v).toBeDefined();
    expect(v.status).toBeDefined();
    expect(v.status).toHaveProperty('bloqueado');
    expect(v.status).toHaveProperty('ignicaoLigada');
    expect(v.status).toHaveProperty('online');
  });
});
