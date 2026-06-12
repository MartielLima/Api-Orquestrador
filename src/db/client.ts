import { Pool } from 'pg';

export interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute(q: { sql: string; args?: any[] }): Promise<{ rows: any[] }>;
}

export function buildDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, max: 10 });
  return {
    execute: async ({ sql, args = [] }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await pool.query(sql, args);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { rows: r.rows as any[] };
    },
  };
}
