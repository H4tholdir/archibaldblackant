# Phase 1: Order Snapshot Schema & Storage - Research

**Researched:** 2026-03-05
**Domain:** Internal codebase patterns — PostgreSQL, BullMQ, Express
**Confidence:** HIGH

<research_summary>
## Summary

Ricerca interna sul codebase per capire esattamente come integrare il sistema di snapshot nei pattern esistenti. Non servono librerie esterne — il dominio è interamente coperto da PostgreSQL, BullMQ e i pattern già in uso.

Il finding principale è che `sync-order-articles` fa **DELETE + INSERT** di tutti gli articoli, sovrascrivendo i dati originali del submit. Senza uno snapshot separato, non c'è modo di sapere cosa l'utente aveva richiesto vs cosa Archibald ha registrato.

**Primary recommendation:** Creare tabella `agents.order_verification_snapshots` con snapshot riga-per-riga + totali, salvata nella stessa transazione del submit-order. Il confronto sarà solo su importi netti con tolleranza ±0.01€ per arrotondamenti floating point.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pg (DbPool) | existing | PostgreSQL queries | Già usato ovunque nel backend |
| BullMQ | existing | Job queue per operazioni | Già gestisce submit-order e sync |

### Supporting
Nessuna libreria aggiuntiva necessaria. Tutto il necessario è già nel codebase.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tabella snapshot separata | Colonna JSON in order_records | JSON meno queryabile, snapshot separato è più pulito e non appesantisce la tabella principale |
| Snapshot riga-per-riga | Hash degli articoli | Hash non dice COSA è diverso, solo CHE è diverso |
| Tolleranza fissa ±0.01€ | Confronto esatto | Floating point nel submit vs .toFixed(2) nel sync causerebbe falsi positivi |
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Pattern Esistente: Transaction in Submit-Order
```typescript
// submit-order.ts:108-217
await pool.withTransaction(async (tx) => {
  // 1. INSERT/UPDATE order_records
  // 2. INSERT order_articles
  // 3. UPDATE article_search_text
  // 4. UPDATE fresis_history
  // 5. DELETE pending_orders
  // ➕ 6. INSERT order_verification_snapshots (NUOVO)
});
```
Lo snapshot va nella STESSA transazione — se il submit fallisce, anche lo snapshot viene rollbackato.

### Pattern Esistente: DELETE + INSERT per Articles
```typescript
// sync-order-articles.ts:91-94
await pool.query(
  'DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2',
  [data.orderId, userId],
);
// Poi INSERT dei nuovi articoli dal PDF
```
Questo è il motivo per cui serve lo snapshot: il sync CANCELLA gli articoli originali.

### Pattern Esistente: Calcolo Amounts
```typescript
// submit-order.ts:32-46
function calculateAmounts(items, discountPercent) {
  const grossAmount = items.reduce((sum, item) => {
    const lineAmount = item.price * item.quantity * (1 - (item.discount || 0) / 100);
    return sum + lineAmount;
  }, 0);
  const total = discountPercent
    ? grossAmount * (1 - discountPercent / 100)
    : grossAmount;
  return { grossAmount, total };
}
```

### Pattern Esistente: State Tracking
```sql
-- agents.order_state_history tiene traccia dei cambi di stato
-- Usa: updateOrderState(pool, userId, orderId, newState, actor, notes)
```
Possiamo usare lo stesso pattern per tracciare lo stato della verifica.

### Anti-Patterns da Evitare
- **Non salvare lo snapshot in una tabella separata per articolo + header**: una singola tabella con righe snapshot è più semplice e performante
- **Non usare JSON per gli articoli snapshot**: le righe separate permettono query SQL per confronto diretto
- **Non aggiungere colonne a order_articles**: lo snapshot deve essere immutabile, order_articles viene sovrascritto dal sync
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transaction management | Custom rollback logic | `pool.withTransaction()` | Già testato, gestisce rollback automatico |
| State tracking | Colonne booleane sparse | `updateOrderState()` + order_state_history | Pattern consolidato nel codebase |
| Job scheduling | setTimeout/cron custom | BullMQ `enqueueOperation()` | Già gestisce retry, priorità, dedup |

**Key insight:** Tutto il necessario è già nel codebase. Il lavoro è di INTEGRAZIONE, non di creazione da zero.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Floating Point Comparison
**What goes wrong:** Confronto esatto tra `136.73` (submit) e `136.73` (sync) fallisce per arrotondamento IEEE 754
**Why it happens:** Submit usa aritmetica floating point raw, sync usa `.toFixed(2)` + `parseFloat()`
**How to avoid:** Confronto con tolleranza `Math.abs(a - b) < 0.02` (2 centesimi, per coprire doppio arrotondamento)
**Warning signs:** Falsi positivi su ordini perfettamente corretti

### Pitfall 2: Amounts Salvati come Stringhe
**What goes wrong:** `gross_amount` in order_records è una stringa, non un numero. Formato europeo possibile: `"4.264,48"`
**Why it happens:** Legacy — il campo accetta sia formato numerico che europeo
**How to avoid:** Lo snapshot deve salvare amounts come DOUBLE PRECISION (numeri), non stringhe. Conversione solo al momento del confronto.
**Warning signs:** Confronti che falliscono su ordini con migliaia (punto come separatore migliaia)

### Pitfall 3: Warehouse Orders
**What goes wrong:** Tentativo di verificare ordini warehouse che non passano per Archibald
**Why it happens:** Warehouse orders hanno id che inizia con `warehouse-` e non vengono sincronizzati
**How to avoid:** Skip verifica per ordini con `order_type = 'Warehouse'` o id `warehouse-*`
**Warning signs:** Snapshot senza sync corrispondente, timeout di verifica

### Pitfall 4: Ordini con Zero Articoli dopo Sync
**What goes wrong:** Note di credito (NC) hanno 0 articoli dopo sync — il confronto segna tutto come "mancante"
**Why it happens:** NC hanno `gross_amount` negativo e il PDF non contiene saleslines
**How to avoid:** Skip verifica per ordini con `order_number LIKE 'NC/%'` o `gross_amount` negativo
**Warning signs:** Falsi positivi su tutte le NC

### Pitfall 5: Sync Sovrascrive prima del Confronto
**What goes wrong:** Se il confronto avviene DOPO che sync ha sovrascritto gli articoli, non abbiamo più il "prima"
**Why it happens:** Senza snapshot, gli articoli originali del submit sono persi dopo il sync
**How to avoid:** Lo snapshot è immutabile — viene creato al submit e MAI modificato. Il confronto usa snapshot vs order_articles post-sync.
**Warning signs:** Verification engine che non trova differenze perché confronta sync vs sync
</common_pitfalls>

<code_examples>
## Code Examples

### Struttura Snapshot Proposta
```sql
-- Migration: 011-order-verification-snapshots.sql
CREATE TABLE agents.order_verification_snapshots (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  -- Header snapshot
  global_discount_percent DOUBLE PRECISION,
  expected_gross_amount DOUBLE PRECISION NOT NULL,
  expected_total_amount DOUBLE PRECISION NOT NULL,
  -- Metadata
  verification_status TEXT NOT NULL DEFAULT 'pending_verification',
  -- pending_verification | verified | mismatch_detected | auto_corrected | correction_failed
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, user_id)
);

CREATE TABLE agents.order_verification_snapshot_items (
  id SERIAL PRIMARY KEY,
  snapshot_id INTEGER NOT NULL REFERENCES agents.order_verification_snapshots(id) ON DELETE CASCADE,
  article_code TEXT NOT NULL,
  article_description TEXT,
  quantity DOUBLE PRECISION NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL,
  line_discount_percent DOUBLE PRECISION,
  expected_line_amount DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_order ON agents.order_verification_snapshots(order_id, user_id);
CREATE INDEX idx_snapshots_status ON agents.order_verification_snapshots(verification_status);
CREATE INDEX idx_snapshot_items_snapshot ON agents.order_verification_snapshot_items(snapshot_id);
```

### Integrazione in Submit-Order
```typescript
// Da aggiungere nella transazione di submit-order.ts
// DOPO l'inserimento degli articoli, PRIMA della delete pending_orders

// Insert snapshot header
const { rows: [snapshot] } = await tx.query(
  `INSERT INTO agents.order_verification_snapshots
   (order_id, user_id, global_discount_percent, expected_gross_amount, expected_total_amount, created_at)
   VALUES ($1, $2, $3, $4, $5, $6)
   RETURNING id`,
  [orderId, userId, data.discountPercent ?? null, grossAmount, total, now]
);

// Insert snapshot items
if (data.items.length > 0) {
  const itemValues = data.items.map((item, i) => {
    const lineAmount = item.price * item.quantity * (1 - (item.discount || 0) / 100);
    return `($1, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5}, $${i * 5 + 6})`;
  });
  // ... batch insert
}
```

### Query per Confronto (Phase 2)
```sql
-- Trova ordini con snapshot ma non ancora verificati
SELECT s.order_id, s.user_id
FROM agents.order_verification_snapshots s
JOIN agents.order_records o ON o.id = s.order_id AND o.user_id = s.user_id
WHERE s.verification_status = 'pending_verification'
  AND o.articles_synced_at IS NOT NULL  -- Sync completato
  AND o.order_number LIKE 'ORD/%'       -- Solo ordini Archibald
```
</code_examples>

<open_questions>
## Open Questions

1. **Formato amounts in order_records**
   - What we know: `gross_amount` e `total_amount` sono stringhe, possibilmente formato europeo
   - What's unclear: Tutti gli ordini usano `.toFixed(2)` o ci sono legacy con formato europeo?
   - Recommendation: Lo snapshot usa DOUBLE PRECISION (numeri nativi), confronto con parsing se necessario

2. **Sconto globale nell'ERP**
   - What we know: "SCONTO %" nella griglia Archibald è lo sconto globale
   - What's unclear: Come viene rappresentato nel PDF saleslines che sync-order-articles parsa?
   - Recommendation: Verificare durante Phase 2 se il PDF contiene info sullo sconto globale. Se no, confrontare solo a livello riga.

3. **Ordini modificati dopo submit**
   - What we know: edit-order aggiorna articoli ma NON totali in order_records
   - What's unclear: Se un ordine viene editato e poi verificato, lo snapshot riflette lo stato pre-edit
   - Recommendation: Quando edit-order viene eseguito, aggiornare anche lo snapshot (o creare nuovo snapshot)
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- `backend/src/operations/handlers/submit-order.ts` - Tipo SubmitOrderData, calculateAmounts, transazione DB
- `backend/src/operations/handlers/sync-order-articles.ts` - ParsedArticle, DELETE+INSERT pattern, VAT enrichment
- `backend/src/operations/handlers/edit-order.ts` - EditOrderData, modifiche DB
- `backend/src/db/repositories/orders.ts` - getOrderArticles, getOrdersNeedingArticleSync, updateOrderState
- `backend/src/db/migrations/003-agent-tables.sql` - Schema order_articles, order_state_history
- Screenshot ERP Archibald - Colonne griglia ordini, formato Sum

### Secondary (MEDIUM confidence)
- Analisi floating point: differenze tra raw arithmetic e `.toFixed(2)` + `parseFloat()`
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: PostgreSQL, pattern transazionali esistenti
- Ecosystem: BullMQ job queue, DbPool, state tracking
- Patterns: DELETE+INSERT articles, withTransaction, calculateAmounts
- Pitfalls: floating point, string amounts, warehouse orders, NC

**Confidence breakdown:**
- Standard stack: HIGH - tutto già nel codebase
- Architecture: HIGH - pattern esistenti ben documentati
- Pitfalls: HIGH - derivati da analisi diretta del codice
- Code examples: HIGH - basati su codice reale

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (30 days - codebase stabile)
</metadata>

---

*Phase: 01-order-snapshot-schema*
*Research completed: 2026-03-05*
*Ready for planning: yes*
