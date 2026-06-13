/* eslint-disable @typescript-eslint/no-explicit-any */
import { cachedQuery } from '../orchestrator/cache';
import type { AppContext } from '../context';

export interface Motorista {
  idMotorista: number;
  nome: string;
  tipoDocumento: string | null;
  fetchedAt: Date;
  expiresAt: Date;
}

export async function getMotoristas(
  ctx: AppContext,
  args: { quantidade?: number; idMotorista?: number },
): Promise<Motorista[]> {
  return cachedQuery<any, any>(ctx.db, {
    table: 'motoristas_cache',
    ttlMs: 60_000,
    method: 'obterMotoristas',
    fetcher: () =>
      ctx.orchestrator.call<any[]>('obterMotoristas', [
        args.quantidade ?? 1000,
        args.idMotorista ?? null,
      ]),
    toRow: (m) => ({
      id_motorista: m.idMotorista,
      nome: m.nome,
      tipo_documento: m.tipoDocumento ?? null,
      raw: m,
    }),
    fromRows: (rs) =>
      rs.map((r) => ({
        idMotorista: r.id_motorista,
        nome: r.nome,
        tipoDocumento: r.tipo_documento,
        fetchedAt: r.fetched_at,
        expiresAt: r.expires_at,
      })),
  });
}
