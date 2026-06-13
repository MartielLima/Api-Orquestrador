import type { Db } from '../db/client';
import { logRequest } from './log';

export interface CachedQueryOpts<T, TRow> {
  table: string;
  ttlMs: number;
  method?: string;
  fetcher: () => Promise<T[]>;
  toRow?: (item: T) => TRow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fromRows: (rows: any[]) => T[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cachedQuery<T, TRow = any>(
  db: Db,
  opts: CachedQueryOpts<T, TRow>,
): Promise<T[]> {
  const start = Date.now();
  const method = opts.method ?? 'unknown';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toRow: (item: T) => TRow = opts.toRow ?? ((item: any) => item as unknown as TRow);
  const { rows: cached } = await db.execute({
    sql: `SELECT * FROM ${opts.table} WHERE expires_at > now()`,
    args: [],
  });

  if (cached.length) {
    await logRequest(db, {
      method,
      source: 'graphql',
      status: 'cache_hit',
      cacheHit: true,
      latencyMs: Date.now() - start,
    });
    return opts.fromRows(cached);
  }

  const fresh = await opts.fetcher();
  const expiresAt = new Date(Date.now() + opts.ttlMs);
  for (const item of fresh) {
    const row = toRow(item);
    const cols = Object.keys(row as object);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
    const colNames = cols.join(',');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = cols.map((c) => (row as any)[c]);
    await db.execute({
      sql: `INSERT INTO ${opts.table} (${colNames}, fetched_at, expires_at)
            VALUES (${placeholders}, now(), $${cols.length + 1})
            ON CONFLICT DO NOTHING`,
      args: [...values, expiresAt],
    });
  }
  await logRequest(db, {
    method,
    source: 'graphql',
    status: 'ok',
    cacheHit: false,
    latencyMs: Date.now() - start,
  });
  return fresh;
}
