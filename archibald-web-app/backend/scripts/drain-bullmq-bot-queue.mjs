import { Queue } from 'bullmq';

const queue = new Queue('bot-queue', {
  connection: { host: process.env.REDIS_HOST ?? 'localhost', port: 6379 },
});

const MAX_WAIT_MS = 10 * 60 * 1000;
const start = Date.now();

while (Date.now() - start < MAX_WAIT_MS) {
  const counts = await queue.getJobCounts('active', 'waiting', 'delayed');
  const total = counts.active + counts.waiting + counts.delayed;
  if (total === 0) {
    console.log('[drain] bot-queue empty — OK to deploy Conductor');
    await queue.disconnect();
    process.exit(0);
  }
  console.log(`[drain] ${total} job(s) remaining (active:${counts.active} waiting:${counts.waiting} delayed:${counts.delayed}), retrying in 30s...`);
  await new Promise(r => setTimeout(r, 30_000));
}

console.error('[drain] TIMEOUT — bot-queue did not drain within 10 minutes');
await queue.disconnect();
process.exit(1);
