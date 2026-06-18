/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { getStatusByVeiculos } from '../../src/domain/veiculosStatus';
import type { AppContext } from '../../src/context';

const FIXED_NOW = new Date('2026-06-18T12:00:00.000Z');

function makeCtx(pool: Pool): AppContext {
  return {
    user: null,
    logger: console as unknown as any,
    db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
    orchestrator: {} as any,
  };
}

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

describe('getStatusByVeiculos (integration)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeEach(async () => {
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('lista vazia retorna Map vazio', async () => {
    const ctx = makeCtx(pool);
    const result = await getStatusByVeiculos(ctx, [], FIXED_NOW);
    expect(result.size).toBe(0);
  });

  it('retorna status de um único veículo com posição', async () => {
    await insertPosicao(pool, {
      idVeiculo: 100,
      idPacote: '1',
      dataPosicao: '2026-06-18T11:55:00.000Z',
      ignicao: 1,
      raw: { bloqueio: 1, gps: 1, jamming: 0 },
    });
    const ctx = makeCtx(pool);
    const result = await getStatusByVeiculos(ctx, [100], FIXED_NOW);
    expect(result.size).toBe(1);
    const s = result.get(100);
    expect(s).toBeDefined();
    expect(s?.bloqueado).toBe(true);
    expect(s?.ignicaoLigada).toBe(true);
    expect(s?.online).toBe(true);
  });

  it('retorna status de múltiplos veículos em uma única chamada (1 query)', async () => {
    await insertPosicao(pool, {
      idVeiculo: 200,
      idPacote: '1',
      dataPosicao: '2026-06-18T11:55:00.000Z',
      ignicao: 0,
      raw: { bloqueio: 0 },
    });
    await insertPosicao(pool, {
      idVeiculo: 201,
      idPacote: '2',
      dataPosicao: '2026-06-18T11:50:00.000Z',
      ignicao: 1,
      raw: { bloqueio: 1 },
    });
    const ctx = makeCtx(pool);
    const result = await getStatusByVeiculos(ctx, [200, 201], FIXED_NOW);
    expect(result.size).toBe(2);
    expect(result.get(200)?.bloqueado).toBe(false);
    expect(result.get(200)?.ignicaoLigada).toBe(false);
    expect(result.get(201)?.bloqueado).toBe(true);
    expect(result.get(201)?.ignicaoLigada).toBe(true);
  });

  it('não inclui veículo que não tem posições em posicoes', async () => {
    await insertPosicao(pool, {
      idVeiculo: 300,
      idPacote: '1',
      dataPosicao: '2026-06-18T11:55:00.000Z',
    });
    const ctx = makeCtx(pool);
    const result = await getStatusByVeiculos(ctx, [300, 999], FIXED_NOW);
    expect(result.size).toBe(1);
    expect(result.has(999)).toBe(false);
  });

  it('retorna status do pacote mais recente quando há múltiplos', async () => {
    await insertPosicao(pool, {
      idVeiculo: 400,
      idPacote: '1',
      dataPosicao: '2026-06-18T10:00:00.000Z',
      ignicao: 0,
      raw: { bloqueio: 0 },
    });
    await insertPosicao(pool, {
      idVeiculo: 400,
      idPacote: '2',
      dataPosicao: '2026-06-18T11:55:00.000Z',
      ignicao: 1,
      raw: { bloqueio: 1 },
    });
    await insertPosicao(pool, {
      idVeiculo: 400,
      idPacote: '3',
      dataPosicao: '2026-06-18T11:30:00.000Z',
      ignicao: 0,
      raw: { bloqueio: 0 },
    });
    const ctx = makeCtx(pool);
    const result = await getStatusByVeiculos(ctx, [400], FIXED_NOW);
    const s = result.get(400);
    expect(s?.ignicaoLigada).toBe(true);
    expect(s?.bloqueado).toBe(true);
    expect(s?.atualizadoEm.toISOString()).toBe('2026-06-18T11:55:00.000Z');
  });

  it('extrai campos do JSONB raw corretamente', async () => {
    await insertPosicao(pool, {
      idVeiculo: 500,
      idPacote: '1',
      dataPosicao: '2026-06-18T11:55:00.000Z',
      ignicao: 1,
      raw: {
        bloqueio: 1,
        gps: 0,
        jamming: 1,
        nivelCombustivel: '42',
        litrometro: '15.5',
        tensao: 13.2,
        rpm: 1800,
        temperatura1: 25,
        temperatura2: 26,
        temperatura3: 27,
        statusAncora: 3,
        pontoEntrada: 1,
        pontoSaida: 0,
        nomeMensagem: 'ALERTA',
        conteudoMensagem: 'Jamming detectado',
        textoMensagem: '',
      },
    });
    const ctx = makeCtx(pool);
    const result = await getStatusByVeiculos(ctx, [500], FIXED_NOW);
    const s = result.get(500);
    expect(s?.gps).toBe(false);
    expect(s?.jamming).toBe(true);
    expect(s?.combustivel).toEqual({ nivel: '42', litrometro: '15.5' });
    expect(s?.sensores).toEqual({
      tensao: 13.2,
      rpm: 1800,
      temperatura1: 25,
      temperatura2: 26,
      temperatura3: 27,
    });
    expect(s?.alarme).toEqual({
      statusAncora: 3,
      pontoEntrada: true,
      pontoSaida: false,
      ultimaMensagem: { nome: 'ALERTA', conteudo: 'Jamming detectado', texto: '' },
    });
  });
});