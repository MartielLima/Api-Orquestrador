import { Pool } from 'pg';
import { hashPassword } from '../auth/password';
import { loadConfig } from '../config';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const pool = new Pool({ connectionString: cfg.db.url });

  const { rows } = await pool.query(
    'SELECT id, role, active FROM users WHERE email = $1',
    [cfg.seed.adminEmail],
  );

  const hash = await hashPassword(cfg.seed.adminPassword);

  if (rows.length === 0) {
    await pool.query(
      `INSERT INTO users (email, password_hash, role, active) VALUES ($1, $2, 'admin', true)`,
      [cfg.seed.adminEmail, hash],
    );
    console.log(`Created admin: ${cfg.seed.adminEmail}`);
  } else {
    const existing = rows[0] as { id: string; role: string; active: boolean };
    await pool.query(
      `UPDATE users
       SET password_hash = $1, role = 'admin', active = true
       WHERE id = $2`,
      [hash, existing.id],
    );
    console.log(
      `Reset admin: ${cfg.seed.adminEmail} (id=${existing.id}, was role=${existing.role} active=${existing.active})`,
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});