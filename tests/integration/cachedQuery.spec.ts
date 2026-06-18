/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { cachedQuery } from '../../src/orchestrator/cache';

describe('cachedQuery cache miss path', () => {
  const table = 'test_cached_miss';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL,
        raw JSONB NOT NULL,
        fetched_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    await pool.end();
  });

  afterAll(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(`DROP TABLE IF EXISTS ${table}`);
    await pool.end();
  });

  beforeEach(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(`DELETE FROM ${table}`);
    await pool.end();
  });

  it('returns objects with fetchedAt/expiresAt populated on cache miss', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = { execute: (q: any) => pool.query(q.sql, q.args) } as any;
    const result = await cachedQuery<
      { id: number; nome: string; fetchedAt?: Date; expiresAt?: Date },
      any
    >(db, {
      table,
      primaryKey: 'id',
      ttlMs: 60_000,
      fetcher: async () => [{ id: 1, nome: 'Test' }],
      toRow: (item) => ({ id: item.id, nome: item.nome, raw: {} }),
      fromRows: (rs) =>
        rs.map((r) => ({
          id: r.id,
          nome: r.nome,
          fetchedAt: r.fetched_at,
          expiresAt: r.expires_at,
        })),
    });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(1);
    expect(result[0].nome).toBe('Test');
    expect(result[0].fetchedAt).toBeDefined();
    expect(result[0].fetchedAt).toBeInstanceOf(Date);
    expect(result[0].expiresAt).toBeDefined();
    expect(result[0].expiresAt).toBeInstanceOf(Date);
    await pool.end();
  });
});
