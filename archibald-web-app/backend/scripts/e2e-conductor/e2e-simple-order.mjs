import { postJson, getJson, waitForTaskComplete, trackOrderId, cleanupAll } from './e2e-cleanup-helpers.mjs';

const FRESIS_CUSTOMER_ID = '1002328';

async function main() {
  console.log('[e2e-simple] Starting simple order E2E test...');
  const start = Date.now();

  try {
    // 1. Submit via Conductor
    console.log('[e2e-simple] Submitting order to Conductor...');
    const submitResp = await postJson('/agent-queue/submit', {
      tasks: [{
        type: 'submit-order',
        payload: {
          customerId: FRESIS_CUSTOMER_ID,
          customerName: 'Fresis Soc Cooperativa',
          items: [
            { articleCode: 'H123.314.012', quantity: 5, price: 10.00, vat: 22 },
            { articleCode: 'H124.314.012', quantity: 3, price: 15.00, vat: 22 },
          ],
          discountPercent: 0,
          noShipping: true,
          notes: 'E2E test - auto cleanup',
        },
      }],
    });

    const taskId = submitResp.taskIds[0];
    console.log(`[e2e-simple] Task enqueued: ${taskId}`);

    // 2. Wait for completion
    console.log('[e2e-simple] Waiting for completion...');
    const result = await waitForTaskComplete(taskId, 600_000);
    console.log();

    if (!result.success) throw new Error(`Task failed: ${result.error}`);

    console.log(`[e2e-simple] ✅ Completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);

    if (result.orderId) {
      trackOrderId(result.orderId);
      console.log(`[e2e-simple] orderId: ${result.orderId}`);
    }
  } finally {
    await cleanupAll();
  }
}

main().catch(err => {
  console.error('[e2e-simple] FAILED:', err.message);
  process.exit(1);
});
