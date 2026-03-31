# Pending Orders UX Improvements — Design Spec

**Data**: 2026-03-31  
**Stato**: Approvato

---

## Panoramica

Tre miglioramenti coordinati alla gestione degli ordini pending:

1. **Progress bar card restaurata dopo navigazione** — la barra sulla card non si azzera quando si torna su `/pending-orders`
2. **Multi-invio fix e serializzazione bot** — fix bug `isGhostArticle`, fix toast errato, coda dedicata per creazione ordini sequenziale
3. **Fetch header ERP post-piazzamento** — dopo che il bot crea l'ordine, legge immediatamente tutti i campi header dalla DetailView ERP e aggiorna `order_records`

---

## 1. Progress bar card dopo navigazione

### Problema

`JobProgressBar` nella card legge `order.jobProgress` e `order.jobOperation` da `usePendingSync.jobTracking` — stato in-memory che si azzera quando `PendingOrdersPage` smonta. `GlobalOperationBanner` usa invece `OperationTrackingContext` che è app-level e non si smonta mai.

Risultato: tornando su `/pending-orders` durante un invio, la card mostra 0% anche se il bot è già al 60%.

### Fix

`PendingOrdersPage` già chiama `useOperationTracking()` (usa solo `trackOperation`). Basta destrutturare anche `activeOperations` e usarlo come sorgente primaria per il `JobProgressBar`:

```tsx
const { trackOperation, activeOperations } = useOperationTracking();

// In card rendering:
const liveOp = activeOperations.find(o => o.orderId === order.id);
const displayProgress = liveOp?.progress ?? order.jobProgress ?? 0;
const displayLabel = liveOp?.label ?? order.jobOperation ?? 'In attesa...';
```

`OperationTrackingContext` ha sempre il progresso aggiornato tramite WebSocket, indipendentemente dalla navigazione.

**File**: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`  
**Scope**: ~3 righe modificate nella sezione card rendering

---

## 2. Multi-invio: fix bug + serializzazione bot

### 2a. Bug: `isGhostArticle` non passato al backend

In `handleSubmitOrders` (multi-send) e `handleRetryOrder` (retry singolo), il mapping degli items non include `isGhostArticle`:

```tsx
// BUG — mancante:
items: items.map((item) => ({
  articleCode: item.articleCode,
  // ... altri campi
  // isGhostArticle: MANCANTE
})),
```

Il backend usa `data.items.every((i) => i.isGhostArticle)` per rilevare ordini ghost-only. Senza il flag, ordini con soli articoli ghost passano per il bot ERP invece del percorso diretto → fallimento.

**Fix**: aggiungere `isGhostArticle: item.isGhostArticle` in entrambi i mapping.

### 2b. Bug: `savePendingOrder` loop blocca con toast errato

Dopo `Promise.all` (enqueue riuscito), un loop `for...of` sequenziale chiama `savePendingOrder` per ogni ordine. Se anche un solo aggiornamento fallisce, il `catch` mostra "Errore durante l'invio degli ordini" — anche se i job sono già stati accodati e stanno girando.

**Fix**: rendere il loop non-bloccante con `void Promise.allSettled(...)`. Un fallimento viene solo loggato, non propagato come errore utente.

### 2c. Serializzazione: coda dedicata `bot-queue`

**Problema dell'approccio requeue-tuning**: il meccanismo attuale crea nuovi job BullMQ ad ogni requeue (`key-r{ts}-r{ts}...`). `OperationTrackingContext` non gestisce `JOB_REQUEUED`, quindi il banner perde la traccia del jobId dopo il primo requeue. Con `MAX_REQUEUE_COUNT=3` e `REQUEUE_DELAY_MS=5000`, un secondo ordine fallisce dopo 15 secondi mentre il primo ci mette 3-5 minuti.

**Soluzione: nuova queue `bot-queue` con `concurrency: 1`**

```
writes (concurrency 5)  ──►  create-customer, update-customer,
                              send-to-verona, edit-order, delete-order, ...

bot-queue (concurrency 1) ──►  submit-order   ← NUOVO routing
```

Comportamento:
- I job `submit-order` stanno nella queue BullMQ in ordine FIFO
- BullMQ ne esegue **uno alla volta** — nessun requeue, nessuna race condition
- `AgentLock` rimane come guardia per-utente (preemption sync, ecc.) ma non causa mai requeue per `submit-order` perché la concurrency 1 garantisce che solo 1 job parta
- `JOB_REQUEUED` non viene mai emesso per `submit-order` → banner sempre consistente
- Il frontend mostra "In coda..." via `status: "queued"` nel `jobTracking` — invariato

**Cooldown post-completamento** ("aria e spazio" al DOM DevExpress):

Alla fine di `handleSubmitOrder`, dopo `onProgress(100, ...)` e prima del `return`, aggiungere:

```ts
// Cooldown: mantiene il lock agentivo 5s per dare respiro al DOM DevExpress
await new Promise((resolve) => setTimeout(resolve, 5_000));
```

Questo mantiene l'`AgentLock` occupato per 5 secondi dopo il completamento, impedendo che il job successivo avvii il bot immediatamente.

**Modifiche**:
- `config.ts`: aggiungere entry `'bot-queue'` in `config.queues` con `concurrency: 1`, `lockDuration: 900_000` (15 min, copre il caso peggiore ~20 articoli + header read + cooldown), `stalledInterval: 30_000`, `removeOnComplete: { count: 100 }`
- `queue-router.ts`: aggiungere `'bot-queue'` a `QueueName` e `QUEUE_NAMES`, cambiare routing `'submit-order'` → `'bot-queue'`
- `main.ts`: **nessuna modifica necessaria** — il loop `QUEUE_NAMES.map(name => createWorkerForQueue(name))` crea automaticamente il worker per `bot-queue`
- `operation-processor.ts`: nessuna modifica (logica invariata)
- `submit-order.ts`: aggiungere sleep di 5s alla fine di `handleSubmitOrder`

**Nota multi-agente**: Con concurrency 1 globale su `bot-queue`, se due agenti inviano ordini contemporaneamente si serializzano globalmente. Con 1-2 agenti in produzione è accettabile. Upgrade futuro a concurrency per-utente richiederebbe BullMQ Pro groups o Redis lock per-utente.

---

## 3. Fetch header ERP post-piazzamento

### Problema

Dopo `createOrder()`, `order_records` viene creato con:
- `order_number = 'PENDING-{orderId}'` (placeholder)
- Tutti i campi header a NULL (`customer_reference`, `order_description`, `delivery_date`, `delivery_name`, `delivery_address`, `sales_status`, `document_status`, `transfer_status`)

I valori reali arrivano solo alla prossima sync schedulata (~10 minuti). L'utente non vede subito le informazioni complete nella scheda dello storico ordini.

### Soluzione

Dopo il piazzamento (progress 56%), il bot naviga alla DetailView dell'ordine appena creato, legge i campi header e aggiorna `order_records` prima della sync articoli (progress 70%).

### Flusso progress aggiornato

```
56% — Ordine salvato (form.submit.complete)  [invariato]
60% — Salvataggio nel database               [invariato]
68% — Lettura dettagli ordine dal ERP...     [NUOVO]
69% — Dettagli ordine aggiornati             [NUOVO]
70% — Sincronizzazione articoli...           [invariato]
```

### Tipo dati

```ts
type OrderHeaderData = {
  orderNumber: string | null;        // SALESID → order_number (sostituisce 'PENDING-xxx')
  orderDescription: string | null;   // PURCHORDERFORMNUM → order_description
  customerReference: string | null;  // CUSTOMERREF → customer_reference
  deliveryDate: string | null;       // DELIVERYDATE → delivery_date
  deliveryName: string | null;       // DELIVERYNAME → delivery_name
  deliveryAddress: string | null;    // DLVADDRESS → delivery_address
  salesStatus: string | null;        // SALESSTATUS → sales_status
  documentStatus: string | null;     // DOCUMENTSTATUS → document_status
  transferStatus: string | null;     // TRANSFERSTATUS → transfer_status
};
```

Tutti i campi target esistono già in `agents.order_records` — nessuna migrazione DB necessaria.

### Interfaccia bot estesa

```ts
type SubmitOrderBot = {
  createOrder: (orderData: SubmitOrderData) => Promise<string>;
  deleteOrderFromArchibald: (orderId: string) => Promise<{ success: boolean; message: string }>;
  setProgressCallback: (...) => void;
  readOrderHeader: (orderId: string) => Promise<OrderHeaderData | null>;  // NUOVO
};
```

### Implementazione bot `readOrderHeader(orderId)`

1. Naviga a `SALESTABLE_DetailViewAgent/{cleanOrderId}/?mode=View`
2. Attende DevExpress ready (`waitForDevExpressReadyOnPage`)
3. Legge i campi tramite `page.evaluate()` usando selettori XAF (`[id*="FIELDNAME"]`)
4. Restituisce `null` su qualsiasi errore (non-fatale: la sync schedulata recupera)

**Nota sui selettori**: i selettori XAF precisi per la DetailView dell'ordine devono essere verificati con uno script diagnostico Puppeteer prima dell'implementazione (metodologia consolidata del progetto — vedi `memory/feedback_diagnostic_methodology.md`). Il pattern atteso è `[id*="PURCHORDERFORMNUM"]`, `[id*="CUSTOMERREF"]`, ecc., come già usato altrove nel bot.

### Logica in `handleSubmitOrder`

```ts
// Dopo la transazione DB (progress 67%), prima di performInlineOrderSync
if (!isWarehouseOnly) {
  onProgress(68, 'Lettura dettagli ordine dal ERP...');
  try {
    const header = await bot.readOrderHeader(orderId);
    if (header) {
      await pool.query(
        `UPDATE agents.order_records SET
           order_number = COALESCE($1, order_number),
           customer_reference = $2,
           order_description = $3,
           delivery_date = $4,
           delivery_name = $5,
           delivery_address = $6,
           sales_status = COALESCE($7, sales_status),
           document_status = COALESCE($8, document_status),
           transfer_status = COALESCE($9, transfer_status),
           last_sync = $10
         WHERE id = $11 AND user_id = $12`,
        [
          header.orderNumber, header.customerReference, header.orderDescription,
          header.deliveryDate, header.deliveryName, header.deliveryAddress,
          header.salesStatus, header.documentStatus, header.transferStatus,
          Math.floor(Date.now() / 1000), orderId, userId,
        ],
      );
      onProgress(69, 'Dettagli ordine aggiornati');
    }
  } catch (err) {
    logger.warn('[SubmitOrder] readOrderHeader failed, sync schedulata recupererà', { orderId });
    onProgress(69, 'Lettura dettagli posticipata');
  }
}
```

`COALESCE($1, order_number)` per `order_number` garantisce che non si sovrascriva con NULL se l'ERP non restituisce il SALESID (es. ordine in stato draft).

### Visualizzazione frontend

Nessun cambiamento necessario. I campi popolati in `order_records` (`order_number`, `customer_reference`, `order_description`, ecc.) vengono già mostrati dalla pagina `/orders` (storico ordini). Immediatamente dopo il completamento del job, la scheda nell'OrderHistory mostrerà i dati reali ERP invece dei placeholder.

---

## Testing

### Punto 1
- Test unitario su `PendingOrdersPage`: verifica che `JobProgressBar` mostri il progresso da `activeOperations` quando disponibile
- Test già esistente in `GlobalOperationBanner.spec.tsx` non impattato

### Punto 2
- `submit-order.spec.ts`: aggiungere test per `isGhostOnly` con `isGhostArticle: true` passato correttamente
- `queue-router.spec.ts`: aggiornare test per il nuovo routing `submit-order → bot-queue`
- `operation-processor.spec.ts`: invariato (nessuna logica cambiata)

### Punto 3
- `submit-order.spec.ts`: aggiungere test per `readOrderHeader` chiamato dopo `createOrder`, con mock che restituisce header dati → verifica UPDATE query sul DB
- Test non-fatale: mock `readOrderHeader` che lancia errore → verifica che il job completi comunque e non propague l'errore
- Script diagnostico Puppeteer su staging per verificare selettori XAF della DetailView ordine prima dell'implementazione del metodo bot

---

## File modificati

| File | Tipo di modifica |
|------|-----------------|
| `frontend/src/pages/PendingOrdersPage.tsx` | Fix progress bar + fix isGhostArticle + fix savePendingOrder |
| `backend/src/config.ts` | Aggiungi config `bot-queue` |
| `backend/src/operations/queue-router.ts` | Aggiungi `bot-queue` a `QueueName`/`QUEUE_NAMES`, reroute `submit-order` |
| `backend/src/operations/handlers/submit-order.ts` | Estendi `SubmitOrderBot` interface, aggiungi `readOrderHeader` call + UPDATE query + sleep cooldown |
| `backend/src/bot/archibald-bot.ts` | Implementa `readOrderHeader` |
| Test spec files (submit-order, queue-router, PendingOrdersPage) | Aggiorna/aggiunge test |
