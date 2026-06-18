/* eslint-disable @typescript-eslint/no-explicit-any */
import { cachedQuery } from '../orchestrator/cache';
import type { AppContext } from '../context';
import { getStatusByVeiculos, type VeiculoStatus } from './veiculosStatus';

export interface Veiculo {
  idVeiculo: number;
  placa: string;
  idCliente: number | null;
  descricao: string | null;
  idEquipamento: number | null;
  fetchedAt: Date;
  expiresAt: Date;
  status: VeiculoStatus | null;
}

export async function getVeiculos(
  ctx: AppContext,
  args: { quantidade?: number; idVeiculo?: number },
): Promise<Veiculo[]> {
  const veiculos = await cachedQuery<any, any>(ctx.db, {
    table: 'veiculos_cache',
    primaryKey: 'id_veiculo',
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
        status: null,
      })),
  });

  if (veiculos.length === 0) return veiculos;
  const statusMap = await getStatusByVeiculos(ctx, veiculos.map((v) => v.idVeiculo));
  return veiculos.map((v) => ({
    ...v,
    status: statusMap.get(v.idVeiculo) ?? null,
  }));
}
