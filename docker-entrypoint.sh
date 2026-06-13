#!/bin/sh
# docker-entrypoint.sh — runs migrations + seed, then starts the app.
# Idempotent: safe to run on every container start.
set -e

log() { echo "[entrypoint] $*"; }

# 1. Wait for postgres to accept connections
log "waiting for postgres at ${DATABASE_URL}"
node -e "
const {Pool} = require('pg');
const pool = new Pool({connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000});
const max = 30;
let i = 0;
const tick = async () => {
  try {
    await pool.query('SELECT 1');
    await pool.end();
    process.exit(0);
  } catch (e) {
    if (++i >= max) { console.error('postgres not ready after ' + (max * 2) + 's'); process.exit(1); }
    setTimeout(tick, 2000);
  }
};
tick();
"
log "postgres ready"

# 2. Apply database migrations
log "running migrations"
node dist/scripts/migrate.js

# 3. Seed the admin user (skips if already exists)
log "seeding admin"
node dist/scripts/seed-admin.js

# 4. Hand off to the CMD
log "starting: $*"
exec "$@"
