import { startServer } from './server';
import { startAllJobs } from './jobs/cron';
import { installShutdown } from './lib/shutdown';

async function main() {
  const srv = await startServer();
  const tasks = startAllJobs();
  installShutdown({ stopServer: srv.stop, tasks });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
