/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildAuthResolvers } from '../auth/resolvers';
import { getClientes } from '../domain/clientes';
import { getVeiculos } from '../domain/veiculos';
import { getMotoristas } from '../domain/motoristas';
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
