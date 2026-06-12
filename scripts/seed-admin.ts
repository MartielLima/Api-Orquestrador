import { Pool } from 'pg';
import { hashPassword } from '../src/auth/password';
import { loadConfig } from '../src/config';

async function main() {
  const cfg = loadConfig();
  const pool = new Pool({ connectionString: cfg.db.url });

  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [cfg.seed.adminEmail]);
  if (rows.length) {
    console.log(`Admin ${cfg.seed.adminEmail} already exists. Skipping.`);
    await pool.end();
    return;
  }
  const hash = await hashPassword(cfg.seed.adminPassword);
  await pool.query(`INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')`, [
    cfg.seed.adminEmail,
    hash,
  ]);
  console.log(`Seeded admin: ${cfg.seed.adminEmail}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
