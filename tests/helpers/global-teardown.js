/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require('pg');

const NUM_WORKERS = parseInt(process.env.JEST_NUM_WORKERS || '4', 10);
const BASE_URL =
  process.env.DATABASE_URL_BASE || 'postgresql://api_orquestrador:dev_password@localhost:5432';

module.exports = async function globalTeardown() {
  for (let i = 1; i <= NUM_WORKERS; i++) {
    const dbName = `api_orquestrador_test_w${i}`;
    const admin = new Client({ connectionString: `${BASE_URL}/postgres` });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    } finally {
      await admin.end();
    }
  }
};