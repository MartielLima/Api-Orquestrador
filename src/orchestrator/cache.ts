import type { Db } from '../db/client';
import { logRequest } from './log';
import { mapSascarError } from './errors';

export interface CachedQueryOpts<T, TRow> {
  table: string;
  primaryKey: string;
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

  const fresh = await opts.fetcher().catch((err) => {
    throw mapSascarError(err);
  });
  const expiresAt = new Date(Date.now() + opts.ttlMs);
  for (const item of fresh) {
    const row = toRow(item);
    const cols = Object.keys(row as object);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
    const colNames = cols.join(',');
    const updateSet = cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = cols.map((c) => (row as any)[c]);
    await db.execute({
      sql: `INSERT INTO ${opts.table} (${colNames}, fetched_at, expires_at)
            VALUES (${placeholders}, now(), $${cols.length + 1})
            ON CONFLICT (${opts.primaryKey}) DO UPDATE SET
              ${updateSet},
              fetched_at = now(),
              expires_at = $${cols.length + 1}`,
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
  const { rows: inserted } = await db.execute({
    sql: `SELECT * FROM ${opts.table} WHERE expires_at > now()`,
    args: [],
  });
  return opts.fromRows(inserted);
}
