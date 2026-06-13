import type { ScheduledTask } from 'node-cron';

export interface ShutdownHandle {
  stopServer: () => Promise<void>;
  tasks: ScheduledTask[];
}

export function installShutdown(handle: ShutdownHandle): void {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const sig of signals) {
    process.once(sig, async () => {
      console.log(`[shutdown] received ${sig}, stopping...`);
      for (const t of handle.tasks) {
        try {
          t.stop();
        } catch (e) {
          console.error('cron stop failed', e);
        }
      }
      try {
        await Promise.race([
          handle.stopServer(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('shutdown timeout')), 60_000),
          ),
        ]);
      } catch (e) {
        console.error('server stop failed', e);
      }
      process.exit(0);
    });
  }
}
