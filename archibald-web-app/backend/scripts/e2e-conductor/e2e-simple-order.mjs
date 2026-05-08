import { postJson, getJson, waitForTaskComplete, trackOrderId, cleanupAll } from './e2e-cleanup-helpers.mjs';
import { randomUUID } from 'crypto';

// erp_id (non account_num) — il handler usa WHERE erp_id = $1
const FRESIS_CUSTOMER_ID = '55.261';

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
          pendingOrderId: randomUUID(),
          items: [
            { articleCode: '6801.314.018', articleId: '004784K2', quantity: 2, price: 8.88, vat: 22, discount: 63, description: 'DIA gr G, Pallina', productName: '6801.314.018', warehouseSources: [], warehouseQuantity: 0 },
            { articleCode: '836.104.012', articleId: '004349K3', quantity: 1, price: 10.58, vat: 22, discount: 63, description: 'DIA gr M - Labo. cilindrica corta testa piatta', productName: '836.104.012', warehouseSources: [], warehouseQuantity: 0 },
          ],
          discountPercent: null,
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
