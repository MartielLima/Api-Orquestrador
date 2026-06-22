/* eslint-disable @typescript-eslint/no-explicit-any */
import { logRequest } from '../orchestrator/log';
import { mapSascarError } from '../orchestrator/errors';
import type { AppContext } from '../context';

export interface EventoInercia {
  idVeiculo: number;
  dataPosicao: string;
  idMotorista: number | null;
  nomeMotorista: string | null;
  latitude: number | null;
  longitude: number | null;
  velocidadeMaximaFaixaAmarela: number | null;
  rpmMaximo: number | null;
  velocidadeMedia: number | null;
  distanciaPercorrida: number | null;
}

interface SascarDeltaTelemetria {
  idVeiculo: number;
  dataPosicao: string;
  idMotorista?: number | null;
  nomeMotorista?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  velocidadeMaximaFaixaAmarela?: number | null;
  rpmMaximo?: number | null;
  velocidadeMedia?: number | null;
  distanciaPercorrida?: number | null;
}

export interface GetEventosInerciaArgs {
  dataInicio: string;
  dataFim: string;
  idVeiculo: number;
  quantidade?: number;
}

function mapDeltaTelemetria(item: SascarDeltaTelemetria): EventoInercia {
  return {
    idVeiculo: item.idVeiculo,
    dataPosicao: item.dataPosicao,
    idMotorista: item.idMotorista ?? null,
    nomeMotorista: item.nomeMotorista ?? null,
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    velocidadeMaximaFaixaAmarela: item.velocidadeMaximaFaixaAmarela ?? null,
    rpmMaximo: item.rpmMaximo ?? null,
    velocidadeMedia: item.velocidadeMedia ?? null,
    distanciaPercorrida: item.distanciaPercorrida ?? null,
  };
}

export async function getEventosInercia(
  ctx: AppContext,
  args: GetEventosInerciaArgs,
): Promise<EventoInercia[]> {
  const start = Date.now();
  const quantidade = args.quantidade ?? 100;
  try {
    const raw = await ctx.orchestrator.call<SascarDeltaTelemetria[]>(
      'obterDeltaTelemetriaIntegracaoInercia',
      [args.dataInicio, args.dataFim, args.idVeiculo, quantidade],
    );
    await logRequest(ctx.db, {
      method: 'obterDeltaTelemetriaIntegracaoInercia',
      source: 'graphql',
      status: 'ok',
      cacheHit: false,
      latencyMs: Date.now() - start,
      args: { ...args, quantidade },
    });
    return raw.map(mapDeltaTelemetria);
  } catch (err) {
    await logRequest(ctx.db, {
      method: 'obterDeltaTelemetriaIntegracaoInercia',
      source: 'graphql',
      status: 'error',
      cacheHit: false,
      latencyMs: Date.now() - start,
      args: { ...args, quantidade },
      error: (err as Error)?.message ?? String(err),
    });
    throw mapSascarError(err);
  }
}