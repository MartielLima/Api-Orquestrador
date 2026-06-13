/* eslint-disable @typescript-eslint/no-explicit-any */
import { cachedQuery } from '../orchestrator/cache';
import type { AppContext } from '../context';

export interface Cliente {
  idCliente: number;
  cnpj: string | null;
  cpf: string | null;
  nome: string;
  fetchedAt: Date;
  expiresAt: Date;
}

export async function getClientes(
  ctx: AppContext,
  args: { quantidade?: number; idCliente?: number },
): Promise<Cliente[]> {
  return cachedQuery<any, any>(ctx.db, {
    table: 'clientes_cache',
    ttlMs: 60_000,
    method: 'obterClientesV2',
    fetcher: () =>
      ctx.orchestrator.call<any[]>('obterClientesV2', [
        args.quantidade ?? 1000,
        args.idCliente ?? null,
      ]),
    toRow: (c) => ({
      id_cliente: c.idCliente,
      cnpj: c.cnpj ?? null,
      cpf: c.cpf ?? null,
      nome: c.nome,
      raw: c,
    }),
    fromRows: (rs) =>
      rs.map((r) => ({
        idCliente: r.id_cliente,
        cnpj: r.cnpj,
        cpf: r.cpf,
        nome: r.nome,
        fetchedAt: r.fetched_at,
        expiresAt: r.expires_at,
      })),
  });
}
