import { buildDb } from '../../src/db/client';

describe('db client', () => {
  it('connects to postgres and runs SELECT 1', async () => {
    const db = buildDb(
      process.env.DATABASE_URL ??
        'postgresql://api_orquestrador:dev_password@localhost:5432/api_orquestrador',
    );
    const result = await db.execute({ sql: 'SELECT 1 as ok', args: [] });
    expect(result.rows[0]?.ok).toBe(1);
  });
});
