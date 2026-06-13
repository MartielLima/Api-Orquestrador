/* eslint-disable @typescript-eslint/no-explicit-any */
import { cachedQuery } from '../orchestrator/cache';
import type { AppContext } from '../context';

export interface Veiculo {
  idVeiculo: number;
  placa: string;
  idCliente: number | null;
  descricao: string | null;
  idEquipamento: number | null;
  fetchedAt: Date;
  expiresAt: Date;
}

export async function getVeiculos(
  ctx: AppContext,
  args: { quantidade?: number; idVeiculo?: number },
): Promise<Veiculo[]> {
  return cachedQuery<any, any>(ctx.db, {
    table: 'veiculos_cache',
    ttlMs: 60_000,
    method: 'obterVeiculos',
    fetcher: () =>
      ctx.orchestrator.call<any[]>('obterVeiculos', [
        args.quantidade ?? 1000,
        args.idVeiculo ?? null,
      ]),
    toRow: (v) => ({
      id_veiculo: v.idVeiculo,
      placa: v.placa,
      id_cliente: v.idCliente ?? null,
      descricao: v.descricao ?? null,
      id_equipamento: v.idEquipamento ?? null,
      raw: v,
    }),
    fromRows: (rs) =>
      rs.map((r) => ({
        idVeiculo: r.id_veiculo,
        placa: r.placa,
        idCliente: r.id_cliente,
        descricao: r.descricao,
        idEquipamento: r.id_equipamento,
        fetchedAt: r.fetched_at,
        expiresAt: r.expires_at,
      })),
  });
}
