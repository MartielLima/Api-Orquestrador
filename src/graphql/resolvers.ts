/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildAuthResolvers } from '../auth/resolvers';
import { getClientes } from '../domain/clientes';
import { getVeiculos } from '../domain/veiculos';
import { getMotoristas } from '../domain/motoristas';
import { getPosicoesRecentes, fetchAndUpsertPosicoes } from '../domain/posicoes';
import { loadConfig } from '../config';
import type { AppContext } from '../context';

const cfg = loadConfig();
const auth = buildAuthResolvers({
  accessSecret: cfg.jwt.accessSecret,
  refreshSecret: cfg.jwt.refreshSecret,
  accessTtl: cfg.jwt.accessTtl,
  refreshTtl: cfg.jwt.refreshTtl,
});

export const resolvers = {
  Query: {
    health: () => 'ok',
    clientes: (_: unknown, args: any, ctx: AppContext) => getClientes(ctx, args),
    veiculos: (_: unknown, args: any, ctx: AppContext) => getVeiculos(ctx, args),
    motoristas: (_: unknown, args: any, ctx: AppContext) => getMotoristas(ctx, args),
    posicoesRecentes: (_: unknown, args: { quantidade?: number }, ctx: AppContext) =>
      getPosicoesRecentes(ctx, args.quantidade ?? 1000),
    posicoesPorVeiculo: async (
      _: unknown,
      args: { idVeiculo: number; dataInicio: string; dataFim: string },
      ctx: AppContext,
    ) => {
      await fetchAndUpsertPosicoes(ctx, args.idVeiculo);
      const { rows } = await ctx.db.execute({
        sql: `SELECT * FROM posicoes WHERE id_veiculo = $1 AND data_posicao BETWEEN $2 AND $3 ORDER BY data_posicao`,
        args: [args.idVeiculo, args.dataInicio, args.dataFim],
      });
      return (rows as any[]).map((r) => ({
        idPacote: Number(r.id_pacote),
        idVeiculo: r.id_veiculo,
        dataPosicao: r.data_posicao,
        dataPacote: r.data_pacote,
        latitude: r.latitude,
        longitude: r.longitude,
        velocidade: r.velocidade,
        ignicao: r.ignicao,
        direcao: r.direcao,
        odometro: r.odometro,
        syncedVia: r.synced_via,
      }));
    },
    syncStatus: async (_: unknown, __: unknown, ctx: AppContext) => {
      const { rows } = await ctx.db.execute({
        sql: 'SELECT method, id_veiculo, last_id_pacote, last_synced_at FROM sync_cursor ORDER BY method, id_veiculo',
        args: [],
      });
      return (rows as any[]).map((r) => ({
        method: r.method,
        idVeiculo: r.id_veiculo,
        lastIdPacote: r.last_id_pacote ? Number(r.last_id_pacote) : null,
        lastSyncedAt: r.last_synced_at,
      }));
    },
  },
  Mutation: {
    ...auth.Mutation,
  },
  DateTime: {
    __serialize: (v: unknown) => (v instanceof Date ? v.toISOString() : v),
    __parseValue: (v: unknown) => (typeof v === 'string' ? new Date(v) : null),
    __parseLiteral: () => null,
  },
};
