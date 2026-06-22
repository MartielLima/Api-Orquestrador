/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildAuthResolvers } from '../auth/resolvers';
import { userResolvers } from '../auth/userResolvers';
import { getClientes } from '../domain/clientes';
import { getVeiculos } from '../domain/veiculos';
import { getMotoristas } from '../domain/motoristas';
import { getPosicoesRecentes, fetchAndUpsertPosicoes } from '../domain/posicoes';
import { getCaixaPretaEventos } from '../domain/caixaPreta';
import { getEventosInercia } from '../domain/inercia';
import { getEventosFadiga } from '../domain/fadiga';
import { loadConfig } from '../config';
import { requireAuth, requireAdmin } from '../auth/guards';
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
    ...userResolvers.Query,
    health: () => 'ok',
    clientes: (_: unknown, args: any, ctx: AppContext) => {
      requireAuth(ctx);
      return getClientes(ctx, args);
    },
    veiculos: (_: unknown, args: any, ctx: AppContext) => {
      requireAuth(ctx);
      return getVeiculos(ctx, args);
    },
    motoristas: (_: unknown, args: any, ctx: AppContext) => {
      requireAuth(ctx);
      return getMotoristas(ctx, args);
    },
    posicoesRecentes: (_: unknown, args: { quantidade?: number }, ctx: AppContext) => {
      requireAuth(ctx);
      return getPosicoesRecentes(ctx, args.quantidade ?? 1000);
    },
    posicoesPorVeiculo: async (
      _: unknown,
      args: { idVeiculo: number; dataInicio: string; dataFim: string },
      ctx: AppContext,
    ) => {
      requireAuth(ctx);
      const { rows: cursorRows } = await ctx.db.execute({
        sql: `SELECT last_synced_at FROM sync_cursor
              WHERE method = 'obterPacotePosicaoPorRangeJSON' AND id_veiculo = $1`,
        args: [args.idVeiculo],
      });
      const lastSyncedAt = cursorRows[0]?.last_synced_at as Date | undefined;
      const cursorFresh =
        lastSyncedAt &&
        Date.now() - new Date(lastSyncedAt).getTime() < cfg.cache.posicaoTtlMs;
      if (!cursorFresh) {
        await fetchAndUpsertPosicoes(ctx, args.idVeiculo);
      }
      const { rows } = await ctx.db.execute({
        sql: `SELECT * FROM posicoes WHERE id_veiculo = $1 AND data_posicao BETWEEN $2 AND $3 ORDER BY data_posicao`,
        args: [args.idVeiculo, args.dataInicio, args.dataFim],
      });
      return (rows as any[]).map((r) => ({
        idPacote: String(r.id_pacote),
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
      requireAdmin(ctx);
      const { rows } = await ctx.db.execute({
        sql: 'SELECT method, id_veiculo, last_id_pacote, last_synced_at FROM sync_cursor ORDER BY method, id_veiculo',
        args: [],
      });
      return (rows as any[]).map((r) => ({
        method: r.method,
        idVeiculo: r.id_veiculo,
        lastIdPacote: r.last_id_pacote ? String(r.last_id_pacote) : null,
        lastSyncedAt: r.last_synced_at,
      }));
    },
    eventosInercia: (
      _: unknown,
      args: {
        dataInicio: string;
        dataFim: string;
        idVeiculo: number;
        quantidade?: number;
      },
      ctx: AppContext,
    ) => {
      requireAuth(ctx);
      return getEventosInercia(ctx, args);
    },
    eventosFadiga: (
      _: unknown,
      args: {
        quantidade?: number;
        idMotorista?: number;
        dataInicio?: string;
        dataFim?: string;
      },
      ctx: AppContext,
    ) => {
      requireAuth(ctx);
      return getEventosFadiga(ctx, args);
    },
    caixaPretaEventos: (
      _: unknown,
      args: { placa?: string; idVeiculo?: number },
      ctx: AppContext,
    ) => {
      requireAuth(ctx);
      return getCaixaPretaEventos(ctx, args);
    },
    requestLog: async (_: unknown, args: { limit?: number; method?: string }, ctx: AppContext) => {
      requireAdmin(ctx);
      const params: any[] = [args.limit ?? 100];
      let where = '';
      if (args.method) {
        params.push(args.method);
        where = `WHERE method = $${params.length}`;
      }
      const { rows } = await ctx.db.execute({
        sql: `SELECT id, method, source, status, cache_hit, latency_ms, created_at, error FROM request_log ${where} ORDER BY created_at DESC LIMIT $1`,
        args: params,
      });
      return (rows as any[]).map((r) => ({
        id: String(r.id),
        method: r.method,
        source: r.source,
        status: r.status,
        cacheHit: r.cache_hit,
        latencyMs: r.latency_ms,
        createdAt: r.created_at,
        error: r.error,
      }));
    },
    auditLog: async (
      _: unknown,
      args: {
        limit?: number;
        actorUserId?: string;
        action?: string;
        targetTable?: string;
        targetId?: string;
      },
      ctx: AppContext,
    ) => {
      requireAdmin(ctx);
      const params: unknown[] = [];
      const where: string[] = [];
      const push = (val: unknown): string => {
        params.push(val);
        return `$${params.length}`;
      };
      if (args.actorUserId) where.push(`actor_user_id = ${push(args.actorUserId)}`);
      if (args.action) where.push(`action = ${push(args.action)}`);
      if (args.targetTable) where.push(`target_table = ${push(args.targetTable)}`);
      if (args.targetId) where.push(`target_id = ${push(args.targetId)}`);
      params.push(args.limit ?? 100);
      const { rows } = await ctx.db.execute({
        sql: `SELECT id, actor_user_id, action, target_table, target_id, diff, host(ip) AS ip, user_agent, created_at
              FROM audit_log
              ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
              ORDER BY created_at DESC
              LIMIT $${params.length}`,
        args: params,
      });
      return (rows as any[]).map((r) => ({
        id: String(r.id),
        actorUserId: r.actor_user_id,
        action: r.action,
        targetTable: r.target_table,
        targetId: r.target_id,
        diff: r.diff,
        ip: r.ip,
        userAgent: r.user_agent,
        createdAt: r.created_at,
      }));
    },
  },
  Mutation: {
    ...auth.Mutation,
    ...userResolvers.Mutation,
  },
  DateTime: {
    __serialize: (v: unknown) => (v instanceof Date ? v.toISOString() : v),
    __parseValue: (v: unknown) => (typeof v === 'string' ? new Date(v) : null),
    __parseLiteral: () => null,
  },
  BigInt: {
    __serialize: (v: unknown) =>
      typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint'
        ? String(v)
        : v,
    __parseValue: (v: unknown) =>
      typeof v === 'string' || typeof v === 'number' ? v : null,
    __parseLiteral: (ast: { kind: string; value: string }) =>
      ast.kind === 'StringValue' || ast.kind === 'IntValue' ? ast.value : null,
  },
};
