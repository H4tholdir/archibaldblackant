import { postJson, waitForTaskComplete, trackOrderId, cleanupAll } from './e2e-cleanup-helpers.mjs';

async function main() {
  console.log('[e2e-fresis-merged] Starting Fresis merged order E2E test...');
  const start = Date.now();

  try {
    const submitResp = await postJson('/agent-queue/submit', {
      tasks: [{
        type: 'submit-order',
        payload: {
          customerId: '1002328',
          customerName: 'Fresis Soc Cooperativa',
          items: Array.from({ length: 8 }, (_, i) => ({
            articleCode: `H12${i}.314.012`,
            quantity: 2,
            price: 10.00 + i,
            vat: 22,
            articleId: `art-${i}`,
          })),
          discountPercent: 63,
          noShipping: false,
          notes: 'E2E fresis-merged test',
        },
      }],
    });

    const taskId = submitResp.taskIds[0];
    console.log(`[e2e-fresis-merged] Task: ${taskId}`);
    const result = await waitForTaskComplete(taskId, 600_000);
    console.log();

    if (!result.success) throw new Error(result.error);

    console.log(`[e2e-fresis-merged] ✅ Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    if (result.orderId) trackOrderId(result.orderId);
  } finally {
    await cleanupAll();
  }
}

main().catch(err => { console.error('[e2e-fresis-merged] FAILED:', err.message); process.exit(1); });
