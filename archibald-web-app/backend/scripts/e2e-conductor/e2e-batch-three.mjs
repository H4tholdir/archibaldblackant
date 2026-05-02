import { postJson, waitForTaskComplete, trackOrderId, cleanupAll } from './e2e-cleanup-helpers.mjs';

async function main() {
  console.log('[e2e-batch-three] Starting 3-order batch E2E test...');
  const start = Date.now();

  try {
    // Invia 3 ordini simultaneamente — il Conductor deve serializzarli
    const submitResp = await postJson('/agent-queue/submit', {
      tasks: [
        {
          type: 'submit-order',
          payload: { customerId: '1002328', customerName: 'Fresis Soc Cooperativa', items: [{ articleCode: 'H123.314.012', quantity: 1, price: 10.00, vat: 22 }], noShipping: true, notes: 'E2E batch-1' },
        },
        {
          type: 'submit-order',
          payload: { customerId: '1002328', customerName: 'Fresis Soc Cooperativa', items: [{ articleCode: 'H124.314.012', quantity: 1, price: 15.00, vat: 22 }], noShipping: true, notes: 'E2E batch-2' },
        },
        {
          type: 'submit-order',
          payload: { customerId: '1002328', customerName: 'Fresis Soc Cooperativa', items: [{ articleCode: 'H125.314.012', quantity: 1, price: 20.00, vat: 22 }], noShipping: true, notes: 'E2E batch-3' },
        },
      ],
    });

    console.log(`[e2e-batch-three] batchId: ${submitResp.batchId}`);
    console.log(`[e2e-batch-three] Waiting for ${submitResp.taskIds.length} tasks...`);

    for (const taskId of submitResp.taskIds) {
      const result = await waitForTaskComplete(taskId, 600_000);
      console.log();
      if (!result.success) throw new Error(`Task ${taskId} failed: ${result.error}`);
      if (result.orderId) trackOrderId(result.orderId);
    }

    console.log(`[e2e-batch-three] ✅ All 3 orders completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  } finally {
    await cleanupAll();
  }
}

main().catch(err => { console.error('[e2e-batch-three] FAILED:', err.message); process.exit(1); });
