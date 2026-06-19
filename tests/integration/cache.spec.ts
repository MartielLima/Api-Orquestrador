/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { cachedQuery } from '../../src/orchestrator/cache';

describe('cachedQuery', () => {
  const table = 'test_cadastro';

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

  it('returns cache hit when expires_at > now()', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `INSERT INTO ${table} (id, nome, raw, fetched_at, expires_at) VALUES (1, 'X', '{}'::jsonb, now(), now() + interval '1 hour')`,
    );
    const db = { execute: (q: any) => pool.query(q.sql, q.args) } as any;
    let fetcherCalls = 0;
    const result = await cachedQuery<{ id: number; nome: string }>(db, {
      table,
      primaryKey: 'id',
      ttlMs: 60_000,
      fetcher: async () => {
        fetcherCalls++;
        return [];
      },
      fromRows: (rows: any[]) => rows.map((r) => ({ id: r.id, nome: r.nome })),
    });
    expect(result.length).toBe(1);
    expect(result[0].nome).toBe('X');
    expect(fetcherCalls).toBe(0);
    await pool.end();
  });

  it('calls fetcher on cache miss and upserts', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = { execute: (q: any) => pool.query(q.sql, q.args) } as any;
    const result = await cachedQuery<{ id: number; nome: string }>(db, {
      table,
      primaryKey: 'id',
      ttlMs: 60_000,
      fetcher: async () => [{ id: 99, nome: 'Fresh', raw: {} } as any],
      fromRows: (rows: any[]) => rows.map((r) => ({ id: r.id, nome: r.nome })),
    });
    expect(result.length).toBe(1);
    expect(result[0].nome).toBe('Fresh');

    const { rows } = await pool.query(`SELECT nome FROM ${table} WHERE id = 99`);
    expect(rows[0].nome).toBe('Fresh');
    await pool.end();
  });

  it('refreshes expires_at (and other columns) on conflict', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // Seed a stale row: expires_at is in the past, so the next cachedQuery
    // would normally call the fetcher and try to INSERT — which would then
    // hit the PK conflict. With ON CONFLICT ... DO UPDATE, the row gets
    // refreshed (new fetched_at, new expires_at, new column values).
    await pool.query(
      `INSERT INTO ${table} (id, nome, raw, fetched_at, expires_at)
       VALUES (42, 'Stale', '{}'::jsonb, now() - interval '1 hour', now() - interval '1 second')
       ON CONFLICT (id) DO NOTHING`,
    );

    const db = { execute: (q: any) => pool.query(q.sql, q.args) } as any;
    let fetcherCalls = 0;
    const result = await cachedQuery<{ id: number; nome: string }>(db, {
      table,
      primaryKey: 'id',
      ttlMs: 60_000,
      fetcher: async () => {
        fetcherCalls++;
        return [{ id: 42, nome: 'Refreshed', raw: {} } as any];
      },
      fromRows: (rows: any[]) => rows.map((r) => ({ id: r.id, nome: r.nome })),
    });
    expect(fetcherCalls).toBe(1);
    expect(result.length).toBe(1);
    expect(result[0].nome).toBe('Refreshed');

    const { rows: stored } = await pool.query(
      `SELECT nome, expires_at > now() AS is_valid FROM ${table} WHERE id = 42`,
    );
    expect(stored[0].nome).toBe('Refreshed');
    expect(stored[0].is_valid).toBe(true);
    await pool.end();
  });

  it('bypassCache ignora o cache e retorna o resultado do fetcher sem inserir', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // Row stale no cache nao deve ser retornado quando bypassCache=true.
    await pool.query(
      `INSERT INTO ${table} (id, nome, raw, fetched_at, expires_at)
       VALUES (7, 'Cached', '{}'::jsonb, now(), now() + interval '1 hour')`,
    );

    const db = { execute: (q: any) => pool.query(q.sql, q.args) } as any;
    const result = await cachedQuery<{ id: number; nome: string }>(
      db,
      {
        table,
        primaryKey: 'id',
        ttlMs: 60_000,
        fetcher: async () => [{ id: 7, nome: 'FreshFiltered', raw: {} } as any],
        fromRows: (rows: any[]) => rows.map((r) => ({ id: r.id, nome: r.nome })),
      },
      { bypassCache: true },
    );
    expect(result.length).toBe(1);
    expect(result[0].nome).toBe('FreshFiltered');

    const { rows } = await pool.query(`SELECT nome FROM ${table} WHERE id = 7`);
    expect(rows[0].nome).toBe('Cached');
    await pool.end();
  });
});
