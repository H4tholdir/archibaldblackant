import { pool } from './db';
import { runTick } from './tick';
import { config } from './config';

async function main(): Promise<void> {
  console.log('[notification-service] avvio');
  console.log(`[notification-service] tick ogni ${config.tick.intervalMs / 60000} minuti`);

  await runTick(pool).catch(err => console.error('[notification-service] tick errore', err));

  setInterval(async () => {
    await runTick(pool).catch(err => console.error('[notification-service] tick errore', err));
  }, config.tick.intervalMs);
}

main().catch(err => {
  console.error('[notification-service] fatal', err);
  process.exit(1);
});
