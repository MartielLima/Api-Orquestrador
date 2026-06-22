/* eslint-disable @typescript-eslint/no-explicit-any */
import { logRequest } from '../orchestrator/log';
import { mapSascarError } from '../orchestrator/errors';
import type { AppContext } from '../context';

export interface EventoFadiga {
  idVeiculo: number;
  dataInicio: string;
  eventoTempoDirecao: number;
  descricaoEvento: string;
  eventoTempoDirecaoAnterior: number | null;
  descricaoEventoAnterior: string | null;
  idMotorista: number;
  nomeMotorista: string;
  idCliente: number | null;
  nomeCliente: string | null;
  latitude: number | null;
  longitude: number | null;
  odometro: number | null;
  placa: string | null;
}

interface SascarEventoTempoDirecao {
  idVeiculo: number;
  dataInicio: string;
  eventoTempoDirecao: number;
  descricaoEventoTempoDirecao: string;
  eventoTempoDirecaoAnterior?: number | null;
  descricaoEventoTempoDirecaoAnterior?: string | null;
  idMotorista: number;
  nomeMotorista: string;
  idCliente?: number | null;
  nomeCliente?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  odometro?: number | null;
  placa?: string | null;
}

export interface GetEventosFadigaArgs {
  quantidade?: number;
  idMotorista?: number;
  dataInicio?: string;
  dataFim?: string;
}

function toSascarDate(v: string | Date | null | undefined): string | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return v.toISOString();
  return v;
}

function mapEventoTempoDirecao(item: SascarEventoTempoDirecao): EventoFadiga {
  return {
    idVeiculo: item.idVeiculo,
    dataInicio: item.dataInicio,
    eventoTempoDirecao: item.eventoTempoDirecao,
    descricaoEvento: item.descricaoEventoTempoDirecao,
    eventoTempoDirecaoAnterior: item.eventoTempoDirecaoAnterior ?? null,
    descricaoEventoAnterior: item.descricaoEventoTempoDirecaoAnterior ?? null,
    idMotorista: item.idMotorista,
    nomeMotorista: item.nomeMotorista,
    idCliente: item.idCliente ?? null,
    nomeCliente: item.nomeCliente ?? null,
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    odometro: item.odometro ?? null,
    placa: item.placa ?? null,
  };
}

export async function getEventosFadiga(
  ctx: AppContext,
  args: GetEventosFadigaArgs,
): Promise<EventoFadiga[]> {
  const start = Date.now();
  const quantidade = args.quantidade ?? 100;
  try {
    const raw = await ctx.orchestrator.call<SascarEventoTempoDirecao[]>(
      'obterEventosTempoDirecao',
      [quantidade, args.idMotorista ?? undefined, toSascarDate(args.dataInicio), toSascarDate(args.dataFim)],
    );
    await logRequest(ctx.db, {
      method: 'obterEventosTempoDirecao',
      source: 'graphql',
      status: 'ok',
      cacheHit: false,
      latencyMs: Date.now() - start,
      args,
    });
    return raw.map(mapEventoTempoDirecao);
  } catch (err) {
    await logRequest(ctx.db, {
      method: 'obterEventosTempoDirecao',
      source: 'graphql',
      status: 'error',
      cacheHit: false,
      latencyMs: Date.now() - start,
      args,
      error: (err as Error)?.message ?? String(err),
    });
    throw mapSascarError(err);
  }
}
