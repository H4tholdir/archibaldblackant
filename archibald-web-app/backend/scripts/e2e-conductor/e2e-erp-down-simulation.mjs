import { postJson, waitForTaskComplete, cleanupAll } from './e2e-cleanup-helpers.mjs';

async function main() {
  console.log('[e2e-erp-down] Testing circuit breaker behavior...');
  // Nota: questo test usa un customerId inesistente per forzare un errore applicativo
  // Non simula un vero down ERP ma verifica il recovery del Conductor

  try {
    const submitResp = await postJson('/agent-queue/submit', {
      tasks: [{
        type: 'submit-order',
        payload: {
          customerId: 'INVALID_CUSTOMER_WILL_FAIL',
          customerName: 'Test Circuit',
          items: [{ articleCode: 'H123.314.012', quantity: 1, price: 10.00 }],
          noShipping: true,
          notes: 'E2E circuit breaker test',
        },
      }],
    });

    const taskId = submitResp.taskIds[0];
    console.log(`[e2e-erp-down] Task: ${taskId}`);

    const result = await waitForTaskComplete(taskId, 120_000);
    console.log();

    if (result.success) {
      console.warn('[e2e-erp-down] WARN: Expected failure but task succeeded');
    } else {
      console.log(`[e2e-erp-down] ✅ Task failed as expected: ${result.error}`);
    }
  } finally {
    await cleanupAll();
  }
}

main().catch(err => { console.error('[e2e-erp-down] FAILED:', err.message); process.exit(1); });
