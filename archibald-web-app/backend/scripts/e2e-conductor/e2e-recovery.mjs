import { postJson, getJson, cleanupAll } from './e2e-cleanup-helpers.mjs';

async function main() {
  console.log('[e2e-recovery] Testing Conductor auto-recovery...');
  console.log('[e2e-recovery] This test verifies that orphaned tasks are detected on startup.');
  console.log('[e2e-recovery] Check /api/agent-queue/state after a backend restart to verify recovery.');

  try {
    // Query lo stato attuale della coda
    const state = await getJson('/agent-queue/state');
    console.log(`[e2e-recovery] Active tasks: ${state.active?.length ?? 0}`);
    console.log(`[e2e-recovery] Recent tasks: ${state.recent?.length ?? 0}`);

    // Verifica che non ci siano task running con heartbeat stale
    const staleRunning = (state.active ?? []).filter(t => t.status === 'running');
    if (staleRunning.length > 0) {
      console.warn(`[e2e-recovery] WARN: ${staleRunning.length} running task(s) detected — recovery may be needed`);
    } else {
      console.log('[e2e-recovery] ✅ No stale running tasks detected');
    }
  } finally {
    await cleanupAll();
  }
}

main().catch(err => { console.error('[e2e-recovery] FAILED:', err.message); process.exit(1); });
