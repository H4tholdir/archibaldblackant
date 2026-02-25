# End-to-End Parity Fixes — Implementation Plan

**Goal:** Fix tutti i 14 gap documentati in `2026-02-24-e2e-parity-gaps.md`.
**Pattern comune:** Dove il frontend aspetta eventi WS specifici che non arrivano, aggiungere `pollJobUntilDone` come meccanismo primario.

**Ordine:** Critici → Alti → Medi. Fix atomici, un commit per gruppo logico.

---

## Task 1: Fix PDF download result nesting (C1)

**Files:**
- `archibald-web-app/frontend/src/components/OrderCardNew.tsx`

**Change:** In `downloadPdfWithProgress`, cambiare:
```ts
const pdfBase64 = result.pdf as string;
```
in:
```ts
const resultData = (result.data ?? result) as Record<string, unknown>;
const pdfBase64 = resultData.pdf as string;
```

**Verify:** `npm run type-check --prefix archibald-web-app/frontend`

---

## Task 2: Fix delete order — aggiungere pollJobUntilDone (C2)

**Files:**
- `archibald-web-app/frontend/src/components/OrderCardNew.tsx`

**Change:** Nel `handleDeleteOrder`, dopo `enqueueOperation('delete-order', ...)`:
1. Usare `pollJobUntilDone(result.jobId, { maxWaitMs: 120_000 })` come meccanismo primario
2. Su completamento: `setDeleteProgress(null); setDeletingOrder(false); onDeleteDone?.();`
3. Su errore: mostrare alert con il messaggio
4. Mantenere il WS subscription come meccanismo secondario (se arriva prima del polling, usa `deleteHandledRef`)

**Verify:** `npm run type-check --prefix archibald-web-app/frontend`

---

## Task 3: Fix edit order — sostituire setTimeout con polling (H1)

**Files:**
- `archibald-web-app/frontend/src/components/OrderCardNew.tsx`

**Change:** In `handleConfirmEdit`, dopo `enqueueOperation('edit-order', ...)`:
1. Rimuovere il `setTimeout(() => { setSubmittingEdit(false); onEditDone?.(); }, 2000)`
2. Aggiungere `pollJobUntilDone(result.jobId, { maxWaitMs: 120_000 })`
3. Su completamento: `setSubmittingEdit(false); onEditDone?.();`
4. Su errore: `setError(err.message || "Errore durante la modifica"); setSubmittingEdit(false);`
5. Mantenere WS subscription come secondario

**Verify:** `npm run type-check --prefix archibald-web-app/frontend`

---

## Task 4: Fix OrderStatus field names (C4)

**Files:**
- `archibald-web-app/frontend/src/components/OrderStatus.tsx`

**Changes:**
1. Interface `JobStatus`: `status` → `state`, `error` → `failedReason`
2. Tutti i riferimenti a `data.job.status` → `data.job.state`
3. Tutti i riferimenti a `status.error` → `status.failedReason`
4. Result access: `result.orderId` → `result?.data?.orderId` (se nidificato)

**Verify:** `npm run type-check --prefix archibald-web-app/frontend` + `npm test --prefix archibald-web-app/frontend`

---

## Task 5: Fix customer create — aggiungere polling (C3)

**Files:**
- `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

**Change:** Dopo `customerService.createCustomer(dataToSend)` che ritorna `{ taskId }`:
1. Se `taskId` è presente, usare `pollJobUntilDone(taskId, { maxWaitMs: 180_000 })`
2. Su completamento: `markCompleted()` con i dati dal result
3. Su errore: `markFailed(err.message)`
4. Rimuovere la dipendenza da WS `CUSTOMER_UPDATE_COMPLETED` per il path non-interattivo

**Verify:** `npm run type-check --prefix archibald-web-app/frontend`

---

## Task 6: Fix submit order failure tracking (C5)

**Files:**
- `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`
- `archibald-web-app/frontend/src/hooks/usePendingSync.ts`

**Change in PendingOrdersPage:**
1. Dopo `Promise.all` di enqueue, per ogni ordine salvare il `jobId` nello stato locale (Map<orderId, jobId>)
2. Salvare via `savePendingOrder({ ...order, jobId: result.jobId, jobStatus: 'started' })`

**Change in usePendingSync:**
1. Nel handler WS per `JOB_COMPLETED`: se il payload contiene `type: 'submit-order'`, marcare l'ordine completato
2. Nel handler WS per `JOB_FAILED`: se il payload contiene `type: 'submit-order'`, aggiornare lo stato locale con errore
3. Fix `data.job.status` → `data.job.state` nel stale checker

**Verify:** `npm test --prefix archibald-web-app/frontend`

---

## Task 7: Fix SyncButton — migrare a polling (H2)

**Files:**
- `archibald-web-app/frontend/src/components/SyncButton.tsx`

**Change:**
1. Rimuovere completamente il blocco raw WebSocket (`new WebSocket(...)`, `ws.onmessage`, riconnessione)
2. Dopo enqueue dei 6 sync types, usare `Promise.allSettled` con `pollJobUntilDone` per ognuno
3. Su tutti completati: mostrare "Sincronizzazione completata"
4. Su errore: mostrare "Errore sincronizzazione"
5. Importare `pollJobUntilDone` da `api/operations`

**Verify:** `npm run type-check --prefix archibald-web-app/frontend`

---

## Task 8: Fix SyncBars — migrare a polling (H3)

**Files:**
- `archibald-web-app/frontend/src/components/SyncBars.tsx`

**Change:**
1. Rimuovere raw WebSocket block
2. Per sync individuale: `enqueueOperation` + `pollJobUntilDone`
3. Aggiornare stato per-tipo (idle → syncing → completed/error) in base al polling result
4. Rimuovere logica `cache_invalidation` (M4 risolto automaticamente)

**Verify:** `npm run type-check --prefix archibald-web-app/frontend`

---

## Task 9: Fix progress label handling (M1)

**Files:**
- `archibald-web-app/backend/src/operations/operation-queue.ts`

**Change:** In `getJobStatus`, cambiare:
```ts
progress: typeof job.progress === 'number' ? job.progress : 0,
```
in:
```ts
progress: typeof job.progress === 'number'
  ? job.progress
  : typeof job.progress === 'object' && job.progress !== null && 'progress' in job.progress
    ? (job.progress as { progress: number }).progress
    : 0,
```

E aggiungere un campo `progressLabel`:
```ts
progressLabel: typeof job.progress === 'object' && job.progress !== null && 'label' in job.progress
  ? (job.progress as { label: string }).label
  : undefined,
```

**Verify:** `npm run build --prefix archibald-web-app/backend` + `npm test --prefix archibald-web-app/backend`

---

## Task 10: Fix interactive customer routes (H4)

**Files:**
- `archibald-web-app/backend/src/main.ts`
- `archibald-web-app/backend/src/server.ts` (verify deps type)

**Change:** In `main.ts`, passare `createCustomerBot` e `broadcast` nelle deps di `createApp`:
1. Creare una factory `createCustomerBot` che usa `browserPool` e il bot
2. Passare la broadcast function dal wsServer

**Verify:** `npm run build --prefix archibald-web-app/backend`

---

## Task 11: Fix PDF handler optional fields (H5)

**Files:**
- `archibald-web-app/backend/src/operations/handlers/download-ddt-pdf.ts`
- `archibald-web-app/backend/src/operations/handlers/download-invoice-pdf.ts`

**Change:** Rendere `ddtNumber` e `invoiceNumber` opzionali:
```ts
type DownloadDdtPdfData = {
  orderId: string;
  ddtNumber?: string;  // was required
};
```

**Verify:** `npm run build --prefix archibald-web-app/backend`

---

## Task 12: Verifica finale

1. `npm run type-check --prefix archibald-web-app/frontend` ✅
2. `npm test --prefix archibald-web-app/frontend` ✅
3. `npm run build --prefix archibald-web-app/backend` ✅
4. `npm test --prefix archibald-web-app/backend` ✅
