/* eslint-disable @typescript-eslint/no-explicit-any */
import cron, { type ScheduledTask } from 'node-cron';
import { Pool } from 'pg';
import { createLogger } from '../lib/logger';
import { buildSascarClient, SascarOrchestrator } from '../orchestrator/SascarOrchestrator';
import { fetchAndUpsertPosicoes } from '../domain/posicoes';
import { logRequest } from '../orchestrator/log';
import { loadConfig } from '../config';
import { runWithConcurrency } from '../lib/concurrency';

export interface JobConfig {
  enabled: boolean;
  cronExpr: string;
  quantity: number;
}

export function startSyncPositions(cfg: JobConfig): ScheduledTask | null {
  if (!cfg.enabled) {
    return null;
  }
  const logger = createLogger({ level: 'info' });
  const task = cron.schedule(cfg.cronExpr, async () => {
    const start = Date.now();
    try {
      const appCfg = loadConfig();
      const sascar = buildSascarClient({
        usuario: appCfg.sascar.usuario,
        senha: appCfg.sascar.senha,
        wsdlUrl: appCfg.sascar.wsdlUrl,
        timeoutMs: appCfg.sascar.timeoutMs,
        maxRetries: appCfg.sascar.maxRetries,
      });
      const orch = new SascarOrchestrator(sascar);
      const pool = new Pool({ connectionString: appCfg.db.url });
      const { rows } = await pool.query('SELECT id_veiculo FROM veiculos_cache');
      const ctx = {
        user: null,
        logger,
        db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
        orchestrator: orch,
      };
      const totals = await runWithConcurrency(
        rows as Array<{ id_veiculo: number }>,
        10,
        async (v) => fetchAndUpsertPosicoes(ctx, v.id_veiculo),
      );
      const total = totals.reduce((acc, n) => acc + n, 0);
      await logRequest(ctx.db, {
        method: 'syncPositions.cron',
        source: 'cron',
        status: 'ok',
        cacheHit: false,
        latencyMs: Date.now() - start,
        args: { total },
      });
      await pool.end();
      logger.info({ total, ms: Date.now() - start }, 'syncPositions completed');
    } catch (err) {
      logger.error({ err }, 'syncPositions failed');
    }
  });
  logger.info({ cron: cfg.cronExpr }, 'syncPositions scheduled');
  return task;
}
