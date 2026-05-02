# DOM Resilience v2 — Design Spec

**Data**: 2026-05-02
**Autore**: Claude (sessione brainstorming con Francesco)
**Stato**: Approvato per implementazione

---

## 1. Contesto e problema

Il bot `archibald-bot.ts` inserisce articoli uno per uno nella griglia DevExpress XAF
(`SALESTABLE_DetailViewAgent/?NewObject=true`). Ogni articolo lascia residui nel DOM
(dropdown aperti, popup chiusi, listener attaccati) che DevExpress non rimuove autonomamente.

### Dati misurati (test ordine 40 articoli, 2026-05-02)

| Checkpoint | Nodi DOM | Delta |
|---|---|---|
| Baseline (form nuovo) | ~23k | - |
| Art.5 | 27.098 | +4k |
| Art.10 | 27.728 | +630 (GC efficace) |
| Art.15 | 40.673 | **+12.945** ← salto deterministico |
| Art.20 | 42.867 | +2.194 |
| Art.25 | 33.234 | **-9.633** (GC aggressivo) |
| Art.30 | 42.488 | oscillazione stabile |

**Osservazioni chiave**:
1. Il salto art.10→15 è deterministico (identico in 2 run separati) → causato da un articolo specifico
2. Il DOM non esplode linearmente — il GC oscillante mantiene il range 27k-43k
3. L'ordine da 40 articoli HA completato con 2 retry (1 crash DOM a art.~19 nel primo run,
   1 crash da downtime deploy nel secondo run)
4. Il DOM si resetta completamente ad ogni navigazione di pagina

### Errori osservati
- `Execution context was destroyed` — CDP timeout su DOM >50k nodi
- `Click on "Nuovo" did not navigate to form` — sessione ERP in stato anomalo dopo retry

---

## 2. Soluzioni — 4 opzioni

### Opzione A — GC aggressivo nel range critico (art.8-18)

**Razionale**: il salto deterministico a art.10-15 suggerisce che uno specifico articolo (con variante
complessa, sconto N/A, popup DXHFP) genera un bloat massiccio. Inserire un heavy cleanup prima
e dopo quel range previene l'accumulo.

**Implementazione**:
```typescript
const DOM_HEAVY_CLEANUP_RANGE = { start: 8, end: 18 };
const DOM_HEAVY_CLEANUP_EVERY_N = 3;

async function maybeHeavyCleanup(articleIndex: number): Promise<void> {
  if (
    articleIndex >= DOM_HEAVY_CLEANUP_RANGE.start &&
    articleIndex <= DOM_HEAVY_CLEANUP_RANGE.end &&
    articleIndex % DOM_HEAVY_CLEANUP_EVERY_N === 0
  ) {
    await page.evaluate(() => {
      // Rimuovi TUTTI i nodi display:none nel container griglia
      document.querySelectorAll('[style*="display: none"], [style*="display:none"]')
        .forEach(el => el.remove());
    });
    await page._client().send('HeapProfiler.collectGarbage');
  }
}
```

Il `cleanupStaleDropdowns()` esistente rimane, questo è aggiuntivo.

**Overhead**: ~200ms extra ogni 3 articoli nel range. Totale su 40 art: ~700ms.

---

### Opzione B — Save-and-continue ogni CHUNK_SIZE articoli

**Razionale**: il DOM DevExpress si resetta completamente ad ogni navigazione. Salvare l'ordine
intermedio e riaprirlo in edit mode azzera il DOM. Il bot già implementa `editOrderInArchibald`
con `type: "add"` — riuso di pattern esistente.

**VINCOLO CRITICO**: il "Salva intermedio" (button interno all'ObjectSpace XAF aperto)
causa rollback di tutti gli articoli. SOLO "Salva e chiudi" + riapertura è sicuro.
Questo è documentato in `bot-xaf-dom-behavior.md` e in un commit del 2026-03-24.

**Threshold**: si attiva solo se `items.length > CHUNK_SIZE` (default: 12).
- Ordini ≤12 art: comportamento invariato, nessun overhead
- Ordini 13-24: 1 save-reopen (~15s overhead)
- Ordini 25-36: 2 save-reopen (~30s overhead)
- Ordini 37-48: 3 save-reopen (~45s overhead)

**Sequenza per ordine da 40 articoli**:
1. Inserisci art.1-12 nel form `NewObject` → "Salva e chiudi" → orderId estratto
2. `navigateToEditOrderById(orderId)` → forma Edit aperta
3. Inserisci art.13-24 tramite `editOrderInArchibald` con `type: "add"`
4. "Salva e chiudi" → naviga di nuovo
5. Inserisci art.25-36
6. "Salva e chiudi" → naviga di nuovo
7. Inserisci art.37-40 → "Salva e chiudi" definitivo
8. `extractOrderId()` dall'URL → ritorna orderId

**Gestione sconto globale**: il discountPercent viene applicato a OGNI chunk (non solo all'ultimo),
altrimenti ERP calcola il lordo senza sconto sui chunk precedenti.

**Costante** `CHUNK_SIZE = 12` (calibrata sul salto deterministico art.10-15):
```typescript
const ARTICLE_CHUNK_SIZE = 12; // salva e riapri ogni N articoli per resettare DOM
```

---

### Opzione C — protocolTimeout 180s (safety net passivo)

**Razionale**: con A+B attive il DOM non supera ~28k nodi per chunk. Il timeout di 60s non
scatterà. Ma se future versioni di DevExpress rallentano alcune operazioni, il margine è utile.

**Implementazione**: 1 riga nella configurazione del BrowserContext:
```typescript
page.setDefaultNavigationTimeout(180_000);
page.setDefaultTimeout(180_000);
```

**Costo**: zero. Nessun overhead in condizioni normali.

---

### Opzione D — Logging DOM per-articolo condizionale

**Razionale**: il salto deterministico art.10→15 ha una causa specifica (un articolo o tipo di
articolo). Il logging condizionale la identifica senza generare log in condizioni normali.

**Implementazione**:
```typescript
const DOM_VERBOSE_THRESHOLD = 27_500; // sopra questa soglia, log per-articolo
let domVerboseMode = false;

// Dopo ogni articolo inserito:
if (domNodes > DOM_VERBOSE_THRESHOLD && !domVerboseMode) {
  domVerboseMode = true;
  logger.warn('[createOrder] DOM verbose mode ON', { articleIndex, articleCode, domNodes });
}
if (domVerboseMode) {
  logger.info('[createOrder] DOM per-articolo', { articleIndex, articleCode, domNodes });
}
if (domVerboseMode && domNodes < DOM_VERBOSE_THRESHOLD * 0.85) {
  domVerboseMode = false; // torna silenzioso quando GC ha recuperato
}
```

Questo permette di identificare esattamente quale articolo genera il bloom quando ricapita.

---

## 3. Sequenza di attivazione combinata

```
Items = 40 articoli, CHUNK_SIZE = 12

Chunk 1 (art.1-12):
  - form NewObject normale
  - heavy GC ogni 3 art nel range 8-12
  - verbose logging se DOM > 27.5k
  - "Salva e chiudi" → orderId

Chunk 2 (art.13-24):
  - navigateToEditOrderById(orderId)
  - editOrderInArchibald con type:"add" per art.13-24
  - heavy GC ogni 3 nel range 8-12 relativo (art.20-24 chunk-local)
  - "Salva e chiudi"

Chunk 3 (art.25-36): stessa logica

Chunk 4 (art.37-40):
  - "Salva e chiudi" definitivo
  - extractOrderId → return

Total DOM peak per chunk: ~28k nodi (mai oltre il salto)
Total overhead: 3 × ~15s = 45s su 40 art (vs ~15 min di retry attuale)
```

---

## 4. Integrazione con il Conductor

Il flow di `createOrder()` ritorna `orderId` dopo tutti i chunk. Il Conductor registra
`phase='erp_save_done'` con l'orderId finale. Il fast-finalize (già implementato in `worker.ts`)
protegge da duplicati se il backend crasha tra un chunk e l'altro.

**Caso crash durante chunk N** (non ancora all'`erp_save_done`):
- Il Conductor recovery ri-esegue il task da zero
- `checkRecentDuplicateOnErp()` trova l'ordine parziale (chunk 1..N-1) via scrape
- Se trovato: lo cancella, ricomincia pulito

**Caso crash dopo l'ultimo chunk** (orderId estratto, pre-erp_save_done):
- Fast-finalize gestisce come già implementato

---

## 5. Costanti e configurazione

```typescript
// archibald-bot.ts — createOrder()
const ARTICLE_CHUNK_SIZE = 12;           // save-and-continue ogni N articoli
const DOM_HEAVY_CLEANUP_RANGE = [8, 18]; // range in cui fare heavy GC ogni 3 art
const DOM_HEAVY_CLEANUP_EVERY = 3;       // ogni quanti articoli nel range
const DOM_VERBOSE_THRESHOLD = 27_500;    // sotto questa soglia: logging normale
const CDP_TIMEOUT_MS = 180_000;          // safety net timeout CDP
```

---

## 6. File coinvolti

### Modificati
- `archibald-web-app/backend/src/bot/archibald-bot.ts`
  - Metodo `createOrder()`: logica chunking, heavy GC, verbose logging
  - Nuovo metodo privato `createOrderChunk(items, orderId?)` che gestisce un singolo chunk
  - Configurazione timeout all'init del page

### Non modificati
- `conductor/worker.ts` — nessuna modifica, fast-finalize già robusto
- `submit-order.ts` — nessuna modifica (performInlineOrderSync già rimosso)
- Handler BullMQ esistenti — nessuna modifica

---

## 7. Testing strategy

**Unit**: mock del bot non richiede cambiamenti significativi (test submit-order.spec.ts testano
il handler, non il bot direttamente).

**Integration E2E**: il test esistente con ordine 40 articoli (script `e2e-large-order.mjs`)
verifica il completamento. Con questa implementazione attesa: 0 retry, ~17 min totali
(vs ~30 min con retry attuali).

**Regression**: ordini ≤12 articoli devono avere comportamento identico al pre-modifica.
Test esplicito: invio ordine 3 articoli → verifica 0 save-reopen intermedi nei log.

---

## 8. Definition of Done

- [ ] Ordine 40 articoli: completed, retry=0, nessun `Execution context was destroyed`
- [ ] Ordine 5 articoli: completed, nessun overhead, nessun save-reopen nei log
- [ ] Log verbose attivato quando DOM > 27.5k, silenzioso altrimenti
- [ ] protocolTimeout 180s configurato
- [ ] 4 gate CI verdi (build BE, test BE, type-check FE, test FE)
