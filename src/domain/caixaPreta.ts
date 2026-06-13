/* eslint-disable @typescript-eslint/no-explicit-any */
import { logRequest } from '../orchestrator/log';
import type { AppContext } from '../context';

export interface CaixaPretaEvento {
  id: string;
  idVeiculo: number | null;
  placa: string | null;
  dataEvento: Date | null;
  latitude: number | null;
  longitude: number | null;
  velocidade: number | null;
}

/**
 * Stub: solicitarEventosCaixaPreta (4.51) foi desativada pela Sascar no manual v2.07.
 * Esta função apenas lê o histórico já gravado em caixa_preta_eventos
 * (que só contém eventos passados solicitados ANTES da desativação).
 * Não faz novas chamadas a Sascar.
 */
export async function getCaixaPretaEventos(
  ctx: AppContext,
  args: { placa?: string; idVeiculo?: number },
): Promise<CaixaPretaEvento[]> {
  await logRequest(ctx.db, {
    method: 'recuperarEventosCaixaPreta',
    source: 'graphql',
    status: 'ok',
    cacheHit: false,
    args,
  });
  const where: string[] = [];
  const params: any[] = [];
  if (args.idVeiculo) {
    params.push(args.idVeiculo);
    where.push(`id_veiculo = $${params.length}`);
  }
  if (args.placa) {
    params.push(args.placa);
    where.push(`placa = $${params.length}`);
  }
  const sql = `SELECT * FROM caixa_preta_eventos ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY data_evento DESC NULLS LAST LIMIT 1000`;
  const { rows } = await ctx.db.execute({ sql, args: params });
  return (rows as any[]).map((r) => ({
    id: String(r.id),
    idVeiculo: r.id_veiculo,
    placa: r.placa,
    dataEvento: r.data_evento,
    latitude: r.latitude,
    longitude: r.longitude,
    velocidade: r.velocidade,
  }));
}
