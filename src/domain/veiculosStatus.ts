/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AppContext } from '../context';

export interface Localizacao {
  latitude: number;
  longitude: number;
  velocidade: number;
  direcao: number | null;
}

export interface Combustivel {
  nivel: string | null;
  litrometro: string | null;
}

export interface Sensores {
  tensao: number | null;
  rpm: number | null;
  temperatura1: number | null;
  temperatura2: number | null;
  temperatura3: number | null;
}

export interface AlarmeUltimaMensagem {
  nome: string | null;
  conteudo: string | null;
  texto: string | null;
}

export interface Alarme {
  statusAncora: number | null;
  pontoEntrada: boolean;
  pontoSaida: boolean;
  ultimaMensagem: AlarmeUltimaMensagem | null;
}

export interface VeiculoStatus {
  bloqueado: boolean;
  ignicaoLigada: boolean;
  online: boolean;
  localizacao: Localizacao;
  gps: boolean;
  jamming: boolean;
  combustivel: Combustivel | null;
  sensores: Sensores;
  alarme: Alarme;
  atualizadoEm: Date;
  idadeSegundos: number;
}

const ONLINE_WINDOW_MS = 10 * 60 * 1000;

function toBool(v: unknown): boolean {
  return v === 1 || v === '1' || v === true;
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStrOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

export function mapPosicaoRowToVeiculoStatus(
  row: any,
  now: Date = new Date(),
): VeiculoStatus {
  const raw = (row.raw ?? {}) as Record<string, unknown>;
  const dataPosicao =
    row.data_posicao instanceof Date ? row.data_posicao : new Date(row.data_posicao);
  const idadeMs = now.getTime() - dataPosicao.getTime();

  const nomeMsg = toStrOrNull(raw.nomeMensagem);
  const conteudoMsg = toStrOrNull(raw.conteudoMensagem);
  const textoMsg = toStrOrNull(raw.textoMensagem);
  const hasMensagem = Boolean(
    (nomeMsg && nomeMsg.length > 0) ||
      (conteudoMsg && conteudoMsg.length > 0) ||
      (textoMsg && textoMsg.length > 0),
  );

  const nivel = toStrOrNull(raw.nivelCombustivel);
  const litrometro = toStrOrNull(raw.litrometro);
  const hasCombustivel = nivel !== null || litrometro !== null;

  return {
    bloqueado: toBool(raw.bloqueio),
    ignicaoLigada: toBool(row.ignicao),
    online: idadeMs < ONLINE_WINDOW_MS,
    localizacao: {
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      velocidade: Number(row.velocidade),
      direcao: row.direcao === null || row.direcao === undefined ? null : Number(row.direcao),
    },
    gps: toBool(raw.gps),
    jamming: toBool(raw.jamming),
    combustivel: hasCombustivel ? { nivel, litrometro } : null,
    sensores: {
      tensao: toIntOrNull(raw.tensao),
      rpm: toIntOrNull(raw.rpm),
      temperatura1: toIntOrNull(raw.temperatura1),
      temperatura2: toIntOrNull(raw.temperatura2),
      temperatura3: toIntOrNull(raw.temperatura3),
    },
    alarme: {
      statusAncora: toIntOrNull(raw.statusAncora),
      pontoEntrada: toBool(raw.pontoEntrada),
      pontoSaida: toBool(raw.pontoSaida),
      ultimaMensagem: hasMensagem
        ? { nome: nomeMsg, conteudo: conteudoMsg, texto: textoMsg }
        : null,
    },
    atualizadoEm: dataPosicao,
    idadeSegundos: Math.max(0, Math.floor(idadeMs / 1000)),
  };
}

export async function getStatusByVeiculos(
  ctx: AppContext,
  ids: number[],
  now: Date = new Date(),
): Promise<Map<number, VeiculoStatus>> {
  const result = new Map<number, VeiculoStatus>();
  if (ids.length === 0) return result;

  const { rows } = await ctx.db.execute({
    sql: `SELECT DISTINCT ON (id_veiculo)
            id_veiculo, data_posicao, latitude, longitude, velocidade, ignicao, direcao, raw
          FROM posicoes
          WHERE id_veiculo = ANY($1)
          ORDER BY id_veiculo, data_posicao DESC`,
    args: [ids],
  });

  for (const row of rows as any[]) {
    result.set(row.id_veiculo, mapPosicaoRowToVeiculoStatus(row, now));
  }
  return result;
}
