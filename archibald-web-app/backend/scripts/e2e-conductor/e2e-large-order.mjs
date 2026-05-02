import { postJson, waitForTaskComplete, trackOrderId, cleanupAll } from './e2e-cleanup-helpers.mjs';

// Stress test: 15 articoli sullo stesso ordine. Verifica che il bot non sia limitato
// dal DOM bloat (timeout DevExpress su grandi liste righe ordine), e che la sync
// inline post-piazzamento gestisca correttamente la lista articoli completa.
async function main() {
  console.log('[e2e-large-order] Starting 15-article order E2E test...');
  const start = Date.now();

  try {
    const items = Array.from({ length: 15 }, (_, i) => ({
      articleCode: `H1${20 + i}.314.012`,
      productName: `Test article ${i + 1}`,
      quantity: 1 + (i % 3), // 1, 2, 3, 1, 2, 3...
      price: 10.00 + i * 1.5,
      vat: 22,
      articleId: `art-${i}`,
    }));

    const submitResp = await postJson('/agent-queue/submit', {
      tasks: [{
        type: 'submit-order',
        payload: {
          customerId: '1002328',
          customerName: 'Fresis Soc Cooperativa',
          items,
          discountPercent: 0,
          noShipping: false,
          notes: 'E2E large-order stress test (15 articoli)',
        },
      }],
    });

    const taskId = submitResp.taskIds[0];
    console.log(`[e2e-large-order] Task ${taskId} con 15 articoli enqueued`);

    // Timeout esteso: ordini grandi possono richiedere 2-3 minuti
    const result = await waitForTaskComplete(taskId, 600_000);
    console.log();

    if (!result.success) throw new Error(`Task failed: ${result.error}`);

    const elapsedSec = (Date.now() - start) / 1000;
    console.log(`[e2e-large-order] ✅ 15 articoli completati in ${elapsedSec.toFixed(1)}s`);

    if (result.orderId) {
      trackOrderId(result.orderId);
      console.log(`[e2e-large-order] orderId: ${result.orderId}`);
    }
  } finally {
    await cleanupAll();
  }
}

main().catch(err => {
  console.error('[e2e-large-order] FAILED:', err.message);
  process.exit(1);
});
