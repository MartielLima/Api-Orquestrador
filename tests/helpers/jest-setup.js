/* eslint-disable @typescript-eslint/no-require-imports */
const workerId = process.env.JEST_WORKER_ID || '1';
const baseUrl =
  process.env.DATABASE_URL_BASE || 'postgresql://api_orquestrador:dev_password@localhost:5432';
const dbName = `api_orquestrador_test_w${workerId}`;
process.env.DATABASE_URL = `${baseUrl}/${dbName}`;