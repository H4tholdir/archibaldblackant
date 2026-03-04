# Phase 2: Verification Engine - Research

**Researched:** 2026-03-05
**Domain:** Internal codebase — inline sync + confronto articoli + progress bar integration
**Confidence:** HIGH

<research_summary>
## Summary

Ricerca interna sul codebase per capire come integrare sync articoli + verifiche direttamente nel flusso submit-order. Il cambio architetturale è significativo: da job schedulato (ogni 10 min) a step sincrono inline.

Il finding principale è che `sync-order-articles` ha bisogno di un **browser context separato** per scaricare il PDF. Il submit-order usa già un context per creare l'ordine, quindi per il sync inline serve: o riusare lo stesso context, o acquisirne uno nuovo. Inoltre, il PDF potrebbe non essere immediatamente disponibile dopo la creazione dell'ordine.

**Primary recommendation:** Estendere `handleSubmitOrder` con step post-transazione: (1) scaricare PDF saleslines via bot, (2) parsare articoli, (3) confrontare con snapshot, (4) aggiornare status verifica. Progress bar estesa da 80% a 100% per questi nuovi step. Retry con delay se PDF non disponibile.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Component | Location | Purpose | How Used |
|-----------|----------|---------|----------|
| handleSyncOrderArticles | sync-order-articles.ts | Download + parse + save articoli | Logica da riusare inline |
| downloadOrderArticlesPDF | archibald-bot.ts:9198 | Scarica PDF saleslines da ERP | Serve browser context |
| PDFParserSaleslinesService | pdf-parser-saleslines-service.ts | Parsa PDF → ParsedArticle[] | Singleton, spawna Python |
| getOrderVerificationSnapshot | order-verification.ts | Legge snapshot per confronto | Creato in Phase 1 |
| onProgress callback | operation-processor.ts | Broadcast progress via WebSocket | Già usato in submit-order |

### Nessuna libreria aggiuntiva necessaria
Tutto è già nel codebase. Il lavoro è di integrazione e refactoring.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Pattern Attuale: Sync come Job Separato
```
submit-order → DB save → [fine]
... 10 min dopo ...
scheduler → sync-order-articles → download PDF → parse → save
```

### Pattern Nuovo: Sync + Verifica Inline
```
submit-order → bot crea ordine → DB save + snapshot → [sync inline] → verifica → [fine/correzione]
                                                         |
                                                    download PDF
                                                    parse articoli
                                                    confronto snapshot
                                                    update status
```

### Struttura Progress Bar Estesa
```typescript
// Attuale (0-100%)
BOT_PROGRESS_MAP = {
  'navigation.ordini': 10,    // Apertura sezione ordini
  'form.nuovo': 15,           // Apertura nuovo ordine
  'form.customer': 25,        // Inserimento cliente
  'form.articles.start': 30,  // Inizio inserimento articoli
  'form.articles.complete': 65,// Articoli inseriti
  'form.discount': 70,        // Applicazione sconto globale
  'form.submit.start': 75,    // Salvataggio ordine in corso
  'form.submit.complete': 80, // Ordine salvato
};
// Dopo DB save: 85 (Salvataggio nel database), 90 (Articoli), 95 (Storico), 100 (Completato)

// Nuovo (0-100% ridistribuito)
// Submit ordine: 0-65%
// DB save + snapshot: 65-70%
// Sync articoli (download PDF + parse): 70-85%
// Verifica snapshot vs articoli: 85-90%
// Risultato / eventuale correzione: 90-100%
```

### Pattern: Confronto Articoli
```typescript
type VerificationResult = {
  status: 'verified' | 'mismatch_detected';
  mismatches: ArticleMismatch[];
  totalExpected: number;
  totalFound: number;
};

type ArticleMismatch = {
  type: 'missing' | 'extra' | 'quantity_diff' | 'price_diff' | 'discount_diff' | 'amount_diff' | 'wrong_article';
  articleCode: string;
  field: string;
  expected: number | string;
  found: number | string | null;
};
```

### Algoritmo di Confronto
```
1. Per ogni articolo nello snapshot:
   a. Cerca articolo con stesso article_code negli articoli sincronizzati
   b. Se non trovato → mismatch tipo "missing"
   c. Se trovato, confronta: quantity, unit_price, discount_percent, line_amount
      - Usa tolleranza ±0.02 per importi (floating point)
      - Quantità: confronto esatto
      - Codice articolo: confronto esatto (case-insensitive)
2. Per ogni articolo sincronizzato non nello snapshot:
   → mismatch tipo "extra" (non dovrebbe succedere per conferma utente)
3. Confronto totali: expected_gross_amount vs sum(line_amount sincronizzati)
   → tolleranza ±0.05 per arrotondamenti cumulativi
```

### Anti-Patterns da Evitare
- **Non creare un nuovo handler separato per la verifica** — integrare nel flusso submit-order
- **Non rilanciare sync-order-articles come job BullMQ** — eseguire inline, sincrono
- **Non ignorare il caso "PDF non disponibile"** — retry con delay è essenziale
- **Non fare confronto esatto su importi** — floating point richiede tolleranza
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF download | Nuovo metodo download | `bot.downloadOrderArticlesPDF()` | Già gestisce CDP, polling, rename, validazione |
| PDF parsing | Nuovo parser | `PDFParserSaleslinesService.parseSaleslinesPDF()` | Python parser già testato, gestisce edge case |
| VAT enrichment | Calcolo VAT custom | Pattern da sync-order-articles (getProductVat) | Stessa logica, stessi dati |
| Progress broadcast | WebSocket custom | `onProgress(progress, label)` | Già broadcast via WebSocket, aggiorna frontend |
| Browser context | Gestione manuale | `browserPool.acquireContext()/releaseContext()` | Pool gestisce limiti, sessioni, cleanup |

**Key insight:** La logica di sync-order-articles è già completa e testata. Non serve riscriverla — serve estrarla in funzioni riusabili e chiamarle dal submit-order.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: PDF Non Disponibile Subito
**What goes wrong:** L'ordine è appena stato creato su Archibald, il PDF saleslines potrebbe non essere ancora generato
**Why it happens:** Archibald ha un delay interno per generare i PDF dopo la creazione ordine
**How to avoid:** Retry con delay esponenziale: 5s → 10s → 20s. Max 3 tentativi. Se fallisce, fallback a scheduled sync.
**Warning signs:** Primo download restituisce PDF vuoto o errore 404

### Pitfall 2: Browser Context Già Rilasciato
**What goes wrong:** Il submit-order ha già rilasciato il browser context, il sync inline non può scaricare il PDF
**Why it happens:** `handleSubmitOrder` non gestisce il browser context — è il processor che lo fa
**How to avoid:** Il sync inline deve acquisire un NUOVO context via `browserPool.acquireContext()`, non riusare quello del submit
**Warning signs:** Errore "context destroyed" o "session closed"

### Pitfall 3: Doppio Sync (Inline + Scheduled)
**What goes wrong:** Il sync inline verifica l'ordine, poi lo scheduler rilancia sync-order-articles per lo stesso ordine
**Why it happens:** Lo scheduler seleziona ordini con `articles_synced_at IS NULL OR > 7 days`
**How to avoid:** Il sync inline deve settare `articles_synced_at` dopo il salvataggio. Lo scheduler lo skipperà naturalmente.
**Warning signs:** Articoli sovrascritti dopo la verifica, snapshot status resettato

### Pitfall 4: Confronto Floating Point Multiplo
**What goes wrong:** Tolleranza troppo stretta causa falsi positivi su ordini corretti
**Why it happens:** Submit calcola `price * qty * (1 - discount/100)` in floating point. Sync parsa dal PDF con 2 decimali. Differenze di arrotondamento si accumulano.
**How to avoid:** Tolleranza ±0.02 per singola riga, ±0.05 per totale ordine. Mai confronto esatto.
**Warning signs:** Ordini perfettamente corretti segnalati come mismatch

### Pitfall 5: Ordini Senza archibald_order_id
**What goes wrong:** L'ordine è stato salvato con `PENDING-{orderId}` come order_number, non ha ancora archibald_order_id
**Why it happens:** L'ordine è appena stato creato, l'id Archibald potrebbe non essere ancora propagato
**How to avoid:** Il `downloadOrderArticlesPDF` usa `orderId` (l'id restituito dal bot.createOrder), non `order_number`
**Warning signs:** Navigazione a URL sbagliato, PDF di un altro ordine

### Pitfall 6: Timeout del Flusso Completo
**What goes wrong:** Submit + sync + verifica impiega troppo tempo, il job BullMQ va in timeout
**Why it happens:** Il download PDF può impiegare 30-60s, il parse 5-10s, totale potrebbe superare il timeout del job
**How to avoid:** Verificare il timeout del job submit-order nel processor. Se necessario, aumentarlo. Il PDF download ha già un timeout di 120s.
**Warning signs:** Job che fallisce con timeout dopo la creazione ordine ma prima della verifica
</common_pitfalls>

<code_examples>
## Code Examples

### Struttura Dependencies per Inline Sync
```typescript
// Le dipendenze necessarie per il sync inline nel submit-order
type InlineSyncDeps = {
  pool: DbPool;
  downloadOrderArticlesPDF: (archibaldOrderId: string) => Promise<string>;
  parsePdf: (pdfPath: string) => Promise<ParsedArticle[]>;
  getProductVat: (articleCode: string) => Promise<number>;
  cleanupFile: (filePath: string) => Promise<void>;
};
```

### Flusso Confronto Snapshot vs Articoli Sincronizzati
```typescript
// Pseudo-code per il verification engine
function verifyOrderArticles(
  snapshot: OrderVerificationSnapshot,
  syncedArticles: ParsedArticle[],
  tolerance: number = 0.02,
): VerificationResult {
  const mismatches: ArticleMismatch[] = [];

  // 1. Per ogni articolo nello snapshot
  for (const expected of snapshot.items) {
    const found = syncedArticles.find(a =>
      a.articleCode.toLowerCase() === expected.articleCode.toLowerCase()
    );

    if (!found) {
      mismatches.push({ type: 'missing', articleCode: expected.articleCode, ... });
      continue;
    }

    // Confronta campi con tolleranza
    if (Math.abs(found.quantity - expected.quantity) > 0.001) {
      mismatches.push({ type: 'quantity_diff', ... });
    }
    if (Math.abs(found.unitPrice - expected.unitPrice) > tolerance) {
      mismatches.push({ type: 'price_diff', ... });
    }
    // ... altri campi
  }

  // 2. Articoli extra (non nello snapshot)
  for (const synced of syncedArticles) {
    if (!snapshot.items.find(s => s.articleCode.toLowerCase() === synced.articleCode.toLowerCase())) {
      mismatches.push({ type: 'extra', articleCode: synced.articleCode, ... });
    }
  }

  return {
    status: mismatches.length === 0 ? 'verified' : 'mismatch_detected',
    mismatches,
  };
}
```

### Pattern Retry per PDF Download
```typescript
async function downloadWithRetry(
  downloadFn: () => Promise<string>,
  maxAttempts: number = 3,
  initialDelay: number = 5000,
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await downloadFn();
    } catch (error) {
      if (attempt === maxAttempts) return null;
      const delay = initialDelay * Math.pow(2, attempt - 1); // 5s, 10s, 20s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return null;
}
```

### Query Aggiornamento Status Verifica
```sql
-- Aggiorna status dopo verifica
UPDATE agents.order_verification_snapshots
SET verification_status = $1,
    verified_at = NOW(),
    verification_notes = $2
WHERE order_id = $3 AND user_id = $4;
```
</code_examples>

<open_questions>
## Open Questions

1. **Timeout job submit-order**
   - What we know: Il processor ha timeout per i job. Il download PDF ha timeout 120s.
   - What's unclear: Qual è il timeout totale del job submit-order? Potrebbe non bastare per submit + sync + verifica.
   - Recommendation: Verificare nel processor e aumentare se necessario.

2. **Browser context per sync inline**
   - What we know: Il submit-order usa un context per creare l'ordine. Il sync ha bisogno di un context per scaricare il PDF.
   - What's unclear: Il context del submit è ancora disponibile dopo la transazione DB? O viene rilasciato dal processor?
   - Recommendation: Acquisire un nuovo context per il sync inline. Il browser pool gestisce i limiti.

3. **Articoli con stesso codice ma quantità diverse**
   - What we know: Un ordine potrebbe avere lo stesso articolo su più righe (es. stesso prodotto con quantità diverse)
   - What's unclear: Il confronto by article_code potrebbe confondersi con duplicati
   - Recommendation: Confronto per posizione (ordine delle righe) oltre che per codice, o aggregare quantità per codice.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- `backend/src/operations/handlers/sync-order-articles.ts` — Flusso completo sync: download, parse, enrich, save
- `backend/src/operations/handlers/submit-order.ts` — Progress map, transazione, bot integration
- `backend/src/bot/archibald-bot.ts:9198` — downloadOrderArticlesPDF: CDP, polling, rename
- `backend/src/pdf-parser-saleslines-service.ts` — Parser Python, ParsedArticle type
- `backend/src/operations/operation-processor.ts` — Handler signature, progress callback, context management
- `backend/src/sync/sync-scheduler.ts` — Scheduling logic, batch limits, delay configuration
- `backend/src/db/repositories/order-verification.ts` — Snapshot types, save/get functions
- `backend/src/main.ts` — Dependency injection, bot factory, handler registration
</sources>

<metadata>
## Metadata

**Research scope:**
- Core: Integrazione sync inline nel submit-order flow
- Ecosystem: Browser pool, PDF parser, progress system
- Patterns: Confronto articoli, retry, progress bar estesa
- Pitfalls: PDF timing, browser context, floating point, timeout

**Confidence breakdown:**
- Architecture: HIGH — basata su codice reale e pattern esistenti
- Integration points: HIGH — tutti i file letti e analizzati
- Pitfalls: HIGH — derivati da analisi diretta delle dipendenze
- Code examples: MEDIUM — pseudo-code, non testato

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (30 days)
</metadata>

---

*Phase: 02-verification-engine*
*Research completed: 2026-03-05*
*Ready for planning: yes*
