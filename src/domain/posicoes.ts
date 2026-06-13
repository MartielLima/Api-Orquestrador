/* eslint-disable @typescript-eslint/no-explicit-any */
import { logRequest } from '../orchestrator/log';
import type { AppContext } from '../context';
import { mapSascarError } from '../orchestrator/errors';

export interface Posicao {
  idPacote: number;
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
  }
  if (posicoes.length) {
    const maxId = Math.max(...posicoes.map((p) => Number(p.idPacote)));
    await ctx.db.execute({
      sql: `INSERT INTO sync_cursor (method, id_veiculo, last_id_pacote, last_synced_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (method, id_veiculo) DO UPDATE SET last_id_pacote = EXCLUDED.last_id_pacote, last_synced_at = now()`,
      args: [METHOD, idVeiculo, maxId],
    });
  }
  return posicoes.length;
}

function mapPosicoes(rows: any[]): Posicao[] {
  return rows.map((r) => ({
    idPacote: Number(r.id_pacote),
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
