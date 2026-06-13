import cron from 'node-cron';
import { startSyncPositions } from './syncPositions';
import { loadConfig } from '../config';

export function startAllJobs() {
  const cfg = loadConfig();
  const tasks: cron.ScheduledTask[] = [];
  const t1 = startSyncPositions({
    enabled: cfg.job.enabled,
    cronExpr: cfg.job.cron,
    quantity: cfg.job.quantity,
  });
  if (t1) tasks.push(t1);
  return tasks;
}
