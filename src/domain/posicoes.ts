/* eslint-disable @typescript-eslint/no-explicit-any */
import { logRequest } from '../orchestrator/log';
import type { AppContext } from '../context';
import { mapSascarError } from '../orchestrator/errors';

export interface Posicao {
  idPacote: string;
  idVeiculo: number;
  dataPosicao: Date;
  dataPacote: Date;
  latitude: number;
  longitude: number;
  velocidade: number;
  ignicao: number | null;
  direcao: number | null;
  odometro: number | null;
  syncedVia: string;
}

const METHOD = 'obterPacotePosicaoPorRangeJSON';

export async function getPosicoesRecentes(ctx: AppContext, quantity: number): Promise<Posicao[]> {
  const start = Date.now();
  const { rows: fresh } = await ctx.db.execute({
    sql: `SELECT * FROM posicoes WHERE data_posicao > now() - interval '5 minutes' ORDER BY data_posicao DESC LIMIT $1`,
    args: [quantity],
  });
  if (fresh.length) {
    await logRequest(ctx.db, {
      method: METHOD,
      source: 'graphql',
      status: 'cache_hit',
      cacheHit: true,
      latencyMs: Date.now() - start,
    });
    return mapPosicoes(fresh);
  }
  const { rows: veiculos } = await ctx.db.execute({
    sql: 'SELECT id_veiculo FROM veiculos_cache',
    args: [],
  });
  for (const v of veiculos) {
    await fetchAndUpsertPosicoes(ctx, v.id_veiculo);
  }
  const { rows } = await ctx.db.execute({
    sql: `SELECT * FROM posicoes ORDER BY data_posicao DESC LIMIT $1`,
    args: [quantity],
  });
  await logRequest(ctx.db, {
    method: METHOD,
    source: 'graphql',
    status: 'ok',
    cacheHit: false,
    latencyMs: Date.now() - start,
  });
  return mapPosicoes(rows);
}

export async function fetchAndUpsertPosicoes(ctx: AppContext, idVeiculo: number): Promise<number> {
  const { rows: cursorRows } = await ctx.db.execute({
    sql: 'SELECT last_id_pacote FROM sync_cursor WHERE method = $1 AND id_veiculo = $2',
    args: [METHOD, idVeiculo],
  });
  const lastId = cursorRows[0]?.last_id_pacote ? Number(cursorRows[0].last_id_pacote) : 0;
  const idInicio = lastId + 1;
  const posicoes = await ctx.orchestrator
    .call<any[]>(METHOD, [idInicio, Number.MAX_SAFE_INTEGER, 1000])
    .catch((err) => {
      throw mapSascarError(err);
    });

  if (!posicoes.length) return 0;

  const { rows: prevRows } = await ctx.db.execute({
    sql: `SELECT DISTINCT ON (signal) signal, value_bool
          FROM posicao_eventos
          WHERE id_veiculo = $1
            AND event_type = 'snapshot'
            AND signal IN ('ignicao', 'bloqueio', 'jamming')
          ORDER BY signal, data_posicao DESC`,
    args: [idVeiculo],
  });
  let previous: { ignicao: number | null; bloqueio: number | null; jamming: number | null } | undefined =
    prevRows.length > 0
      ? {
          ignicao: prevRows.find((r: any) => r.signal === 'ignicao')?.value_bool ? 1 : 0,
          bloqueio: prevRows.find((r: any) => r.signal === 'bloqueio')?.value_bool ? 1 : 0,
          jamming: prevRows.find((r: any) => r.signal === 'jamming')?.value_bool ? 1 : 0,
        }
      : undefined;

  for (const p of posicoes) {
    await ctx.db.execute({
      sql: `INSERT INTO posicoes
            (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, direcao, odometro, horimetro, raw, synced_via)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'graphql')
            ON CONFLICT (id_veiculo, id_pacote) DO NOTHING`,
      args: [
        p.idPacote,
        p.idVeiculo,
        p.dataPosicao,
        p.dataPacote,
        p.latitude,
        p.longitude,
        p.velocidade,
        p.ignicao ?? null,
        p.direcao ?? null,
        p.odometro ?? null,
        p.horimetro ?? null,
        JSON.stringify(p),
      ],
    });

    const events = extractEventsFromPosicao(
      {
        idVeiculo: p.idVeiculo,
        idPacote: p.idPacote,
        dataPosicao: p.dataPosicao,
        ignicao: p.ignicao ?? null,
        bloqueio: p.bloqueio ?? null,
        rpm: p.rpm ?? null,
        tensao: p.tensao ?? null,
        velocidade: p.velocidade ?? null,
        jamming: p.jamming ?? null,
        nivelCombustivel: p.nivelCombustivel ?? null,
        litrometro: p.litrometro ?? null,
      },
      previous,
    );

    for (const e of events) {
      await ctx.db.execute({
        sql: `INSERT INTO posicao_eventos
              (id_veiculo, id_pacote, data_posicao, event_type, signal, value_numeric, value_text, value_bool, metadata)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT (id_veiculo, id_pacote, event_type, signal) DO NOTHING`,
        args: [
          e.idVeiculo,
          e.idPacote,
          e.dataPosicao,
          e.eventType,
          e.signal,
          e.valueNumeric ?? null,
          e.valueText ?? null,
          e.valueBool ?? null,
          e.metadata ? JSON.stringify(e.metadata) : null,
        ],
      });
    }

    previous = {
      ignicao: p.ignicao ?? null,
      bloqueio: p.bloqueio ?? null,
      jamming: p.jamming ?? null,
    };
  }

  const maxId = posicoes
    .map((p) => BigInt(p.idPacote))
    .reduce((a, b) => (a > b ? a : b), 0n)
    .toString();
  await ctx.db.execute({
    sql: `INSERT INTO sync_cursor (method, id_veiculo, last_id_pacote, last_synced_at)
          VALUES ($1, $2, $3, now())
          ON CONFLICT (method, id_veiculo) DO UPDATE SET last_id_pacote = EXCLUDED.last_id_pacote, last_synced_at = now()`,
    args: [METHOD, idVeiculo, maxId],
  });
  return posicoes.length;
}

function mapPosicoes(rows: any[]): Posicao[] {
  return rows.map((r) => ({
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
}

export interface PosicaoEventoInsert {
  idVeiculo: number;
  idPacote: string;
  dataPosicao: Date;
  eventType: 'snapshot' | 'transition';
  signal: string;
  valueNumeric?: number;
  valueText?: string;
  valueBool?: boolean;
  metadata?: Record<string, unknown>;
}

const SNAPSHOT_SIGNALS: ReadonlyArray<{
  name: string;
  column: string;
  type: 'numeric' | 'text' | 'bool';
}> = [
  { name: 'ignicao', column: 'ignicao', type: 'bool' },
  { name: 'bloqueio', column: 'bloqueio', type: 'bool' },
  { name: 'rpm', column: 'rpm', type: 'numeric' },
  { name: 'tensao', column: 'tensao', type: 'numeric' },
  { name: 'velocidade', column: 'velocidade', type: 'numeric' },
  { name: 'jamming', column: 'jamming', type: 'bool' },
  { name: 'combustivel_nivel', column: 'nivelCombustivel', type: 'text' },
  { name: 'combustivel_litrometro', column: 'litrometro', type: 'text' },
];

const TRANSITION_SIGNALS: ReadonlyArray<'ignicao' | 'bloqueio' | 'jamming'> = [
  'ignicao',
  'bloqueio',
  'jamming',
];

function toBoolFromPos(v: unknown): boolean {
  return v === 1 || v === '1' || v === true;
}

export function extractEventsFromPosicao(
  pos: {
    idVeiculo: number;
    idPacote: string;
    dataPosicao: Date;
    ignicao: number | null;
    bloqueio: number | null;
    rpm: number | null;
    tensao: number | null;
    velocidade: number | null;
    jamming: number | null;
    nivelCombustivel: string | null;
    litrometro: string | null;
  },
  previous?: { ignicao: number | null; bloqueio: number | null; jamming: number | null },
): PosicaoEventoInsert[] {
  const events: PosicaoEventoInsert[] = [];
  const base = {
    idVeiculo: pos.idVeiculo,
    idPacote: pos.idPacote,
    dataPosicao: pos.dataPosicao,
  };

  for (const sig of SNAPSHOT_SIGNALS) {
    const raw = (pos as any)[sig.column];
    if (raw === null || raw === undefined) continue;
    const event: PosicaoEventoInsert = { ...base, eventType: 'snapshot', signal: sig.name };
    if (sig.type === 'numeric') event.valueNumeric = Number(raw);
    else if (sig.type === 'text') event.valueText = String(raw);
    else if (sig.type === 'bool') event.valueBool = toBoolFromPos(raw);
    events.push(event);
  }

  if (previous) {
    for (const sig of TRANSITION_SIGNALS) {
      const cur = pos[sig];
      const prev = previous[sig];
      if (cur === null || cur === undefined) continue;
      if (cur === prev) continue;
      events.push({
        ...base,
        eventType: 'transition',
        signal: sig,
        valueBool: toBoolFromPos(cur),
        metadata: { from_value: prev, to_value: cur },
      });
    }
  }

  return events;
}
