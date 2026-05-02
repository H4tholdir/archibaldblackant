# DOM Resilience v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminare crash/retry del bot su ordini grandi (15+ articoli) tramite 4 ottimizzazioni: GC aggressivo nel range critico, save-and-continue ogni 12 articoli, timeout 180s e logging DOM condizionale.

**Architecture:** Tutte le modifiche sono dentro `archibald-bot.ts` nel metodo `createOrder()` e nei suoi helper. Nessuna modifica al Conductor, agli handler o al frontend. Il chunking riusa il pattern esistente `editOrderInArchibald` con `type:"add"` per i chunk successivi al primo.

**Tech Stack:** TypeScript, Puppeteer, DevExpress XAF, pg (no nuove dipendenze)

---

## File Structure

### Modificati
- `archibald-web-app/backend/src/bot/archibald-bot.ts`
  - Costanti DOM in testa al file (sezione config)
  - `createOrder()` line ~4098-6432: logica chunking + heavy GC + verbose logging
  - `initialize()` o post-`page.goto`: setDefaultTimeout(180s)

### Non modificati
- `conductor/worker.ts` — fast-finalize già gestisce crash mid-chunk
- `operations/handlers/submit-order.ts` — performInlineOrderSync già rimosso
- Nessun test da aggiornare (bot non ha unit test diretti; E2E aggiornato in Task D)

---

## Task A: Costanti DOM e protocolTimeout 180s

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts` (sezione costanti, ~line 50-100)

- [ ] **Aggiungi costanti DOM in testa al file** (dopo gli import esistenti, prima della classe)

Trova la riga dove inizia `class ArchibaldBot` e inserisci PRIMA:

```typescript
// ─── DOM Resilience v2 ──────────────────────────────────────────────────────
const ARTICLE_CHUNK_SIZE = 12;          // save-and-continue ogni N articoli
const DOM_HEAVY_CLEANUP_RANGE_START = 8;  // inizio range heavy GC
const DOM_HEAVY_CLEANUP_RANGE_END = 18;   // fine range heavy GC
const DOM_HEAVY_CLEANUP_EVERY = 3;        // heavy cleanup ogni N articoli nel range
const DOM_VERBOSE_THRESHOLD = 27_500;     // sopra questa soglia: log per-articolo
const CDP_TIMEOUT_MS = 180_000;           // timeout CDP safety net
// ─────────────────────────────────────────────────────────────────────────────
```

- [ ] **Cerca la riga di init page e aggiungi setDefaultTimeout**

Cerca `protocolTimeout: config.puppeteer.protocolTimeout` — ce ne sono 2 (line ~2348 e ~2403). Dopo OGNUNO dei due blocchi di `newPage()`, aggiungi:

```typescript
page.setDefaultTimeout(CDP_TIMEOUT_MS);
page.setDefaultNavigationTimeout(CDP_TIMEOUT_MS);
```

- [ ] **Verifica build**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: `tsc` senza errori.

- [ ] **Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "perf(bot): costanti DOM resilience v2 + timeout CDP 180s"
```

---

## Task B: Heavy GC nel range critico + verbose DOM logging

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts` (line 5780-5796)

Il codice attuale (line 5780-5796):
```typescript
// Cleanup stale dropdowns between articles to prevent DOM bloat
await this.cleanupStaleDropdowns();

// Log DOM node count every 5 articles to monitor bloat growth
if ((i + 1) % 5 === 0) {
  try {
    const session = await this.page!.createCDPSession();
    const counters = await session.send('Memory.getDOMCounters') as { nodes: number; jsEventListeners: number };
    await session.detach();
    logger.info(`DOM health after article ${i + 1}/${itemsToOrder.length}`, {
      domNodes: counters.nodes,
      jsListeners: counters.jsEventListeners,
    });
  } catch {
    // Non-critical
  }
}
```

- [ ] **Sostituisci il blocco con la versione potenziata**

Sostituisci il blocco sopra con:

```typescript
// Cleanup stale dropdowns between articles to prevent DOM bloat
await this.cleanupStaleDropdowns();

// Heavy GC nel range critico (art.8-18) dove è stato osservato un salto deterministico
// di +12.945 nodi DOM (da 27k a 40k). Heavy cleanup ogni 3 articoli nel range.
const articleNum = i + 1; // 1-indexed
const inHeavyRange = articleNum >= DOM_HEAVY_CLEANUP_RANGE_START && articleNum <= DOM_HEAVY_CLEANUP_RANGE_END;
if (inHeavyRange && articleNum % DOM_HEAVY_CLEANUP_EVERY === 0) {
  try {
    // Rimuovi aggressivamente i nodi display:none nella griglia SALESLINES
    await this.page!.evaluate(() => {
      const hiddenNodes = document.querySelectorAll(
        '[id*="SALESLIN"], [id*="SALESLINES"]'
      );
      hiddenNodes.forEach(container => {
        container.querySelectorAll(
          '[style*="display: none"], [style*="display:none"]'
        ).forEach(el => el.remove());
      });
    });
    const cdpSession = await this.page!.createCDPSession();
    await cdpSession.send('HeapProfiler.collectGarbage');
    await cdpSession.detach();
    logger.debug(`[createOrder] Heavy DOM cleanup after article ${articleNum}/${itemsToOrder.length}`);
  } catch {
    // Non-critical: se fallisce il cleanup leggero (cleanupStaleDropdowns) è già avvenuto
  }
}

// DOM health logging: ogni 5 articoli base, per-articolo in verbose mode
let domNodes = 0;
const shouldLog = articleNum % 5 === 0;
let verboseMode = false;

if (shouldLog) {
  try {
    const session = await this.page!.createCDPSession();
    const counters = await session.send('Memory.getDOMCounters') as { nodes: number; jsEventListeners: number };
    await session.detach();
    domNodes = counters.nodes;
    if (domNodes > DOM_VERBOSE_THRESHOLD) {
      verboseMode = true;
      logger.warn(`DOM health after article ${articleNum}/${itemsToOrder.length}`, {
        domNodes,
        jsListeners: counters.jsEventListeners,
        verboseMode: true,
        articleCode: item.articleCode,
      });
    } else {
      logger.info(`DOM health after article ${articleNum}/${itemsToOrder.length}`, {
        domNodes,
        jsListeners: counters.jsEventListeners,
      });
    }
  } catch {
    // Non-critical
  }
}
```

- [ ] **Verifica build**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: `tsc` senza errori.

- [ ] **Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "perf(bot): heavy GC range critico art.8-18 + verbose DOM logging condizionale"
```

---

## Task C: Save-and-continue ogni CHUNK_SIZE articoli

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`
  - Nuovo metodo privato `navigateToOrderEditModeForChunk(orderId)` (circa line 7770, prima di `editOrderInArchibald`)
  - `createOrder()` line ~6019: aggiunta logica chunking alla fine del loop articoli

**VINCOLO CRITICO**: NON usare il bottone "Salva" (Save intermedio) — causa rollback XAF.
Solo "Salva e chiudi" è sicuro. Il bot ha già la logica "Salva e chiudi" in STEP 10 (line 6329-6423).

### Step C.1: Aggiungi metodo `navigateToOrderEditModeForChunk`

- [ ] **Aggiungi il metodo prima di `editOrderInArchibald` (line ~7776)**

```typescript
/**
 * Naviga a un ordine ERP già salvato in modalità Edit per aggiungere articoli
 * nel contesto del save-and-continue chunking.
 * Pattern identico a navigateToEditCustomerById ma per SALESTABLE.
 */
private async navigateToOrderEditModeForChunk(orderId: string): Promise<void> {
  if (!this.page) throw new Error('[chunk] Browser page is null');
  const cleanId = orderId.replace(/[.,]/g, '');
  logger.info('[createOrder] Chunk: navigating to order for continuation', { orderId: cleanId });

  await this.page.goto(
    `${config.archibald.url}/SALESTABLE_DetailViewAgent/${cleanId}/`,
    { waitUntil: 'domcontentloaded', timeout: 30000 },
  );

  if (this.page.url().includes('Login.aspx')) {
    throw new Error('[createOrder] Sessione scaduta durante chunking: reindirizzato al login');
  }

  await this.waitForDevExpressIdle({ timeout: 15000, label: 'chunk-view-loaded' });

  // Entra in edit mode cliccando "Modifica"
  const editClicked = await this.page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a, button'))
      .filter(el => (el as HTMLElement).offsetParent !== null)
      .find(el =>
        /^modif|^edit/i.test((el as HTMLElement).title?.trim() ?? '') ||
        /^modif|^edit$/i.test(el.textContent?.trim() ?? ''),
      );
    if (btn) { (btn as HTMLElement).click(); return true; }
    return false;
  });

  if (!editClicked) {
    throw new Error(`[createOrder] Chunk: bottone Modifica non trovato per ordine ${cleanId}`);
  }

  await this.page.waitForFunction(
    () => window.location.href.includes('mode=Edit'),
    { timeout: 10000, polling: 300 },
  ).catch(() => {});

  await this.waitForDevExpressIdle({ timeout: 15000, label: 'chunk-edit-loaded' });
  logger.info('[createOrder] Chunk: edit mode attivo', { orderId: cleanId });
}
```

### Step C.2: Logica save-and-continue nel loop articoli

Il loop articoli si chiude a line 6019 (`} // end while (retry loop)`) e 6020 (`}`).

- [ ] **Aggiungi dopo line 6019 (fine del while retry loop) e prima di line 6021 (`await this.emitProgress("form.articles.complete")`)**

```typescript
      // Save-and-continue: se abbiamo completato un chunk intermedio (non l'ultimo),
      // salva l'ordine, ottieni orderId, rientra in edit mode per il prossimo chunk.
      // Attivato solo se items.length > ARTICLE_CHUNK_SIZE e non siamo all'ultimo articolo.
      const isLastArticle = i === itemsToOrder.length - 1;
      const isEndOfChunk = (i + 1) % ARTICLE_CHUNK_SIZE === 0;
      const needsChunkSave = isEndOfChunk && !isLastArticle && itemsToOrder.length > ARTICLE_CHUNK_SIZE;

      if (needsChunkSave) {
        const chunkNum = Math.floor((i + 1) / ARTICLE_CHUNK_SIZE);
        logger.info(`[createOrder] Chunk ${chunkNum} completato (${i + 1}/${itemsToOrder.length}), salvo intermedio`, { orderId });
        onProgress?.(
          Math.round(21 + ((i + 1) / itemsToOrder.length) * 25),
          `Salvataggio intermedio (${i + 1}/${itemsToOrder.length} articoli)...`
        );

        // 1. Applica sconto globale intermedio (se presente) prima di salvare
        if (orderData.discountPercent && orderData.discountPercent > 0) {
          // Nota: il sconto globale viene applicato dal STEP 9.6 esistente.
          // Per chunk intermedi usiamo setCombo/input manuale sul campo MANUALDISCOUNT
          // per non perdere il valore tra chunk.
          try {
            await this.applyGlobalDiscountToForm(orderData.discountPercent);
          } catch (discErr) {
            logger.warn('[createOrder] Chunk: applicazione sconto intermedio fallita, continuo', {
              error: discErr instanceof Error ? discErr.message : String(discErr),
            });
          }
        }

        // 2. "Salva e chiudi" intermedio (riusa STEP 10 esistente ma inline)
        await this.runOp('order.chunk.save_and_close', async () => {
          let clicked = await this.clickElementByText('Salva e chiudi', { exact: true, selectors: ['a', 'span', 'div', 'li'] });
          if (!clicked) clicked = await this.clickElementByText('Save and close', { exact: true, selectors: ['a', 'span', 'div', 'li'] });
          if (!clicked) {
            // Fallback: dropdown Salvare
            await this.clickSaveOnly();
            await this.wait(500);
            clicked = await this.clickElementByText('Salva e chiudi', { exact: true, selectors: ['a', 'span', 'div', 'li'] });
            if (!clicked) clicked = await this.clickElementByText('Save and close', { exact: true, selectors: ['a', 'span', 'div', 'li'] });
          }
          if (!clicked) throw new Error('[createOrder] Chunk: Salva e chiudi non trovato');
          await this.waitForDevExpressIdle({ timeout: 20000, label: 'chunk-after-save' });
        }, 'form.submit');

        // 3. Estrai orderId dall'URL post-save
        const urlAfterSave = this.page!.url();
        const urlMatch = urlAfterSave.match(/ObjectKey=([^&]+)/);
        if (urlMatch) {
          orderId = normalizeOrderId(decodeURIComponent(urlMatch[1]));
          logger.info('[createOrder] Chunk: orderId da URL post-save', { orderId });
        } else {
          // Cerca nei campi form se URL non ha ObjectKey
          const formId = await this.page!.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
            for (const input of inputs) {
              const id = (input as HTMLInputElement).id;
              if (id.includes('dviID_') || id.includes('SALESID_')) {
                const val = (input as HTMLInputElement).value?.trim();
                if (val && val !== '0') return val;
              }
            }
            return null;
          });
          if (formId) {
            orderId = normalizeOrderId(formId);
            logger.info('[createOrder] Chunk: orderId da form field post-save', { orderId });
          }
        }
        if (!orderId) throw new Error('[createOrder] Chunk: impossibile estrarre orderId dopo salvataggio');

        // 4. Rientra in edit mode per aggiungere il prossimo chunk
        await this.navigateToOrderEditModeForChunk(orderId);

        // 5. Scopri la griglia SALESLINES nel form edit
        const gridName = await this.discoverSalesLinesGrid();
        if (!gridName) throw new Error('[createOrder] Chunk: griglia SALESLINES non trovata in edit mode');
        logger.info('[createOrder] Chunk: griglia SALESLINES trovata per prossimo chunk', { gridName });

        logger.info(`[createOrder] Chunk ${chunkNum} salvato, riprendo dall'art.${i + 2}/${itemsToOrder.length}`);
      }
```

### Step C.3: Helper `applyGlobalDiscountToForm`

Il STEP 9.6 esistente (line ~6250) applica lo sconto tramite input field. Estrai la logica in un metodo privato riutilizzabile:

- [ ] **Aggiungi metodo privato prima di `navigateToOrderEditModeForChunk`**

```typescript
/**
 * Applica il percentuale di sconto globale al campo MANUALDISCOUNT del form aperto.
 * Usato sia dal flow normale (STEP 9.6) sia dal save-and-continue chunking.
 */
private async applyGlobalDiscountToForm(discountPercent: number): Promise<void> {
  if (!this.page) throw new Error('[applyGlobalDiscount] page is null');
  // Il campo sconto globale usa il selettore MANUALDISCOUNT
  const discountInput = await this.page.$('input[id*="MANUALDISCOUNT"]').catch(() => null);
  if (!discountInput) {
    logger.debug('[applyGlobalDiscount] Campo MANUALDISCOUNT non trovato, skip');
    return;
  }
  await discountInput.click({ clickCount: 3 });
  await discountInput.type(String(discountPercent), { delay: 30 });
  await this.page.keyboard.press('Tab');
  await this.waitForDevExpressIdle({ timeout: 5000, label: 'discount-applied' });
  logger.debug('[applyGlobalDiscount] Sconto applicato', { discountPercent });
}
```

- [ ] **Aggiorna STEP 9.6 per chiamare il nuovo helper**

Cerca nel file il commento `// STEP 9.6: Apply global discount` (line ~6250). Sostituisci la logica inline con una chiamata al metodo:

```typescript
// STEP 9.6: Apply global discount (if specified)
if (orderData.discountPercent && orderData.discountPercent > 0) {
  await this.emitProgress('form.discount');
  try {
    await this.applyGlobalDiscountToForm(orderData.discountPercent);
  } catch (discErr) {
    logger.warn('[createOrder] Applicazione sconto globale fallita', {
      error: discErr instanceof Error ? discErr.message : String(discErr),
    });
  }
}
```

### Step C.4: Helper `discoverSalesLinesGrid`

Il bot scopre la griglia SALESLINES tramite DevExpress API. Il pattern esiste già in `createOrder` (line ~4115). Estratto come metodo riutilizzabile:

- [ ] **Aggiungi metodo privato**

```typescript
/**
 * Scopre il nome della griglia SALESLINES nella pagina corrente tramite DevExpress API.
 * Usato sia in createOrder che in navigateToOrderEditModeForChunk.
 */
private async discoverSalesLinesGrid(): Promise<string | null> {
  if (!this.page) return null;
  try {
    const gridName = await this.page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      for (const key of Object.keys(w)) {
        if (
          key.startsWith('Vertical_') &&
          key.includes('SALESLIN') &&
          typeof w[key] === 'object' && w[key] !== null &&
          typeof (w[key] as Record<string, unknown>).AddNewRow === 'function'
        ) {
          return key;
        }
      }
      return null;
    });
    return gridName ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Verifica build**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: `tsc` senza errori.

- [ ] **Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "perf(bot): save-and-continue chunking ogni 12 articoli per ordini grandi"
```

---

## Task D: Aggiorna e2e-large-order.mjs + test manuale

**Files:**
- Modify: `archibald-web-app/backend/scripts/e2e-conductor/e2e-large-order.mjs`

Il file esiste già (creato nel Conductor). Aggiorna le assertion per validare il nuovo comportamento atteso.

- [ ] **Apri il file e verifica struttura corrente**

```bash
head -60 archibald-web-app/backend/scripts/e2e-conductor/e2e-large-order.mjs
```

- [ ] **Aggiungi assertion per DOM health e zero crash**

Nel file, dopo il completamento dell'ordine (task status=completed), aggiungi:

```javascript
// Verifica zero crash durante l'inserimento (retry_count deve essere 0 su ordini grandi)
const taskRow = await getTaskFromDb(taskId);
assert(
  taskRow.retry_count === 0,
  `Large order should complete with 0 retries, got ${taskRow.retry_count}`
);

// Verifica che il DOM non abbia superato la soglia critica nei log
// (verificato da assenza di log con "Execution context was destroyed")
console.log('✅ Large order completed with 0 DOM crashes');
```

- [ ] **Verifica struttura build finale**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Test manuale rapido con ordine da 3 articoli**

Invia un ordine di 3 articoli tramite la PWA e verifica nei log backend:
- NESSUN log `DOM heavy cleanup` (3 < CHUNK_SIZE=12 → no heavy range)
- NESSUN log `Chunk: salvo intermedio` (3 < 12)
- Log normale come prima

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker logs archibald-backend 2>&1 | grep -E 'Heavy DOM|Chunk.*salvato|save-and-continue' | tail -5"
```

Expected: nessun output (funzionalità non attivata su ordini piccoli).

- [ ] **Verifica nei log backend con ordine da 15 articoli**

Expected:
- Log `[createOrder] Chunk 1 completato (12/15), salvo intermedio`
- Log `[createOrder] Chunk: orderId da URL post-save`
- Log `[createOrder] Chunk 1 salvato, riprendo dall'art.13/15`
- Log DOM health con `domNodes` < 30.000 per tutti i checkpoint
- `retry_count = 0` nel DB

- [ ] **Commit finale**

```bash
git add archibald-web-app/backend/scripts/e2e-conductor/e2e-large-order.mjs
git commit -m "test(e2e): aggiorna e2e-large-order con assertion retry=0 post-chunking"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Opzione A (heavy GC range 8-18): Task B
- ✅ Opzione B (save-and-continue ogni 12 art): Task C
- ✅ Opzione C (timeout 180s): Task A
- ✅ Opzione D (verbose DOM logging): Task B
- ✅ Ordini ≤12 art: invariati (condizione `itemsToOrder.length > ARTICLE_CHUNK_SIZE`)
- ✅ Sconto globale applicato per-chunk: helper `applyGlobalDiscountToForm`
- ✅ discoverSalesLinesGrid riutilizzabile: Task C

**Placeholder scan:** Nessun TBD presente.

**Vincolo critico documentato:** "No Salva intermedio XAF → solo Salva e chiudi" — Task C commento inline.

**Type consistency:**
- `normalizeOrderId` usato in Task C: funzione già importata in `submit-order.ts` ma NON in `archibald-bot.ts`. Verificare se disponibile o importare da `'../utils/normalize-order-id'` (o equivalente).

**⚠️ Check da fare al Task C inizio**: `grep -n "normalizeOrderId" archibald-web-app/backend/src/bot/archibald-bot.ts | head -3` — se non presente, importare o inline: `const normalizeOrderId = (id: string) => id.replace(/\./g, '');`

**Potential issue — sconto globale per chunk**: il STEP 9.6 attuale potrebbe avere logica più complessa (XAF combo vs input field) rispetto all'helper semplificato proposto. Verificare riga ~6250 che la logica inline sia effettivamente sostituibile con `applyGlobalDiscountToForm`.
