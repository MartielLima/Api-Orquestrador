import type { Db } from '../db/client';

export interface LogEntry {
  method: string;
  source: 'graphql' | 'cron' | 'auth';
  status: 'ok' | 'error' | 'cache_hit';
  cacheHit: boolean;
  latencyMs?: number;
  args?: unknown;
  userId?: string;
  error?: string;
}

export async function logRequest(db: Db, entry: LogEntry): Promise<void> {
  await db.execute({
    sql: `INSERT INTO request_log (method, source, status, cache_hit, latency_ms, args, user_id, error)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    args: [
      entry.method,
      entry.source,
      entry.status,
      entry.cacheHit,
      entry.latencyMs ?? null,
      entry.args ? JSON.stringify(entry.args) : null,
      entry.userId ?? null,
      entry.error ?? null,
    ],
  });
}
