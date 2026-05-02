import { postJson, getJson } from './e2e-cleanup-helpers.mjs';

// Verifica il flow preflight: 1) crea pending sintetico via API, 2) chiama l'endpoint
// preflight e verifica la risposta. Questo test richiede che esista un pending order
// di test pre-popolato (con confirmed_at antecedente all'ultimo sync-products).
//
// ATTENZIONE: questo script NON crea il pending tramite il bot perché il flow di creazione
// pending è puramente lato PWA (Dexie) — il pending arriva al backend solo al submit.
// Per testare la preflight serve un pending già confermato. In ambiente staging, eseguire:
//   1. Manualmente confermare un pending dalla UI (clic Conferma)
//   2. Attendere che il sync-products giri (>15 min) o forzarlo
//   3. Lanciare questo script con PENDING_ID env var
async function main() {
  const pendingId = process.env.PENDING_ID;
  if (!pendingId) {
    console.error('[e2e-preflight] PENDING_ID env var richiesta. Esempio:');
    console.error('  PENDING_ID=abc-123 E2E_TOKEN=<jwt> node e2e-preflight.mjs');
    process.exit(2);
  }

  console.log(`[e2e-preflight] Testing preflight per pending ${pendingId}...`);
  const start = Date.now();

  try {
    const result = await getJson(`/pending/${pendingId}/preflight`);
    const elapsed = Date.now() - start;
    console.log(`[e2e-preflight] Response in ${elapsed}ms:`);
    console.log(JSON.stringify(result, null, 2));

    if (!Array.isArray(result.changes)) {
      throw new Error('Risposta malformata: changes non è un array');
    }

    if (typeof result.checkedAt !== 'string') {
      throw new Error('Risposta malformata: checkedAt mancante');
    }

    console.log(`[e2e-preflight] ✅ Endpoint OK — ${result.changes.length} change/s rilevate`);

    // Validate ogni change
    for (const change of result.changes) {
      if (!change.articleCode || !change.type) {
        throw new Error(`Change malformata: ${JSON.stringify(change)}`);
      }
      if (!['discontinued', 'price_changed'].includes(change.type)) {
        throw new Error(`Change type sconosciuto: ${change.type}`);
      }
      if (change.type === 'price_changed') {
        if (typeof change.oldPrice !== 'number' || typeof change.newPrice !== 'number') {
          throw new Error(`price_changed senza oldPrice/newPrice: ${JSON.stringify(change)}`);
        }
        console.log(`  - ${change.articleCode}: ${change.oldPrice}€ → ${change.newPrice}€`);
      } else {
        console.log(`  - ${change.articleCode}: discontinued${change.suggestedAlternative ? ` → ${change.suggestedAlternative.code}` : ''}`);
      }
    }
  } catch (err) {
    console.error('[e2e-preflight] FAILED:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[e2e-preflight] FATAL:', err.message);
  process.exit(1);
});
