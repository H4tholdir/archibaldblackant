# End-to-End Parity Gap Report: master → feat/unified-operation-queue

**Data:** 2026-02-24
**Metodo:** Trace completo click → enqueue → BullMQ worker → handler → broadcast WS → frontend dispatch → UI update

---

## Root Cause

Il master usa chiamate REST sincrone (il server risponde quando il bot ha finito) + SSE EventSource + WebSocket flat.
Il branch usa enqueue asincrono + polling/WebSocket con envelope `{type, payload, timestamp}`.
I gap sono tutti dello stesso pattern: **mismatch tra il vecchio protocollo del master e il nuovo protocollo queue-based**.

---

## CRITICI (blocca l'utente)

### C1 — PDF Download: result nesting bug
- **File:** `frontend/src/components/OrderCardNew.tsx:3258`
- **Bug:** `result.pdf` → dovrebbe essere `result.data.pdf`
- **Effetto:** DDT e Fatture non si scaricano MAI. Errore "Nessun PDF ricevuto dal server"
- **Fix:** Cambiare `result.pdf` in `(result.data as Record<string, unknown>)?.pdf`

### C2 — Delete Order: UI bloccata per sempre
- **File:** `frontend/src/components/OrderCardNew.tsx:3427-3454`
- **Bug:** Frontend ascolta `ORDER_DELETE_COMPLETE`, backend manda `JOB_COMPLETED` (type: 'delete-order'). Nessun fallback.
- **Effetto:** Progress bar bloccata al 20% per sempre dopo enqueue
- **Fix:** Aggiungere `pollJobUntilDone` dopo enqueue come meccanismo primario di completamento (pattern identico a send-to-verona)

### C3 — Customer Create non-interattivo: spinner infinito
- **File:** `frontend/src/components/CustomerCreateModal.tsx:872-874`
- **Bug:** Frontend ascolta `CUSTOMER_UPDATE_COMPLETED`, backend manda `JOB_COMPLETED`. Polling fallback non si attiva per nuovi clienti (no customerProfile).
- **Fix:** Aggiungere `pollJobUntilDone` con il jobId ritornato da enqueue, poi aggiornare UI in base al risultato

### C4 — OrderStatus: field name mismatch
- **File:** `frontend/src/components/OrderStatus.tsx`
- **Bug:** Legge `data.job.status` (backend: `state`), `data.job.error` (backend: `failedReason`), `data.job.result.orderId` (backend: `result.data.orderId`)
- **Effetto:** Componente non mostra mai lo stato corretto
- **Fix:** Allineare i field names al formato backend: `state`, `failedReason`, `result?.data`

### C5 — Submit Order failure invisibile
- **File:** `frontend/src/pages/PendingOrdersPage.tsx:107-166`, `hooks/usePendingSync.ts`
- **Bug:** Ordini falliti restano in "syncing". DB `pending_orders` non ha colonne job tracking. `handleSubmitOrders` non salva jobId nel pending order.
- **Effetto:** Bottone "Riprova" non appare. Ordini bloccati in "syncing" per sempre.
- **Fix:** Dopo enqueue, salvare jobId nel pending order via `savePendingOrder`. Ascoltare `JOB_COMPLETED`/`JOB_FAILED` nel WS e aggiornare stato locale. Per i falliti, settare status="failed" con il messaggio di errore.

---

## ALTI (funzionalità degradata)

### H1 — Edit Order: modal si chiude prematuramente
- **File:** `frontend/src/components/OrderCardNew.tsx:1067`
- **Bug:** setTimeout(2s) chiude il modal prima che il job finisca realmente
- **Fix:** Sostituire setTimeout con `pollJobUntilDone` (come per send-to-verona)

### H2 — SyncButton: WS raw morto
- **File:** `frontend/src/components/SyncButton.tsx:30`
- **Bug:** Connessione raw a `/ws/sync` senza auth → rifiutata. Formato messaggi incompatibile.
- **Fix:** Rimuovere WS raw. Usare `pollJobUntilDone` sui 6 jobId ritornati da enqueue, oppure subscribere a `JOB_COMPLETED` via WebSocketContext.

### H3 — SyncBars: WS raw morto
- **File:** `frontend/src/components/SyncBars.tsx:66`
- **Bug:** Stesso problema di SyncButton
- **Fix:** Stesso approccio di SyncButton

### H4 — Interactive Customer: routes non montate
- **File:** `backend/src/main.ts:139-153`
- **Bug:** `createCustomerBot` non passato a `createApp` → route interactive restituiscono 404
- **Fix:** Passare `createCustomerBot` e `broadcast` nelle deps di createApp

### H5 — PDF handler: ddtNumber/invoiceNumber mancanti
- **File:** `backend/src/operations/handlers/download-ddt-pdf.ts`, `download-invoice-pdf.ts`
- **Bug:** Frontend manda `{ orderId }`, handler aspetta `{ orderId, ddtNumber/invoiceNumber }`
- **Fix:** Verificare se il bot gestisce undefined. Se no, rendere opzionali nei handler.

---

## MEDI (UX degradata)

### M1 — Progress polling: labels persi
- **File:** `backend/src/operations/operation-queue.ts:95`
- **Bug:** `job.updateProgress({progress, label})` salva un object, ma `getJobStatus` controlla `typeof === 'number'` → ritorna 0
- **Fix:** Gestire sia number che object nel `getJobStatus`

### M2 — Stale job detection: non funziona
- **File:** `frontend/src/hooks/usePendingSync.ts`
- **Bug:** `order.jobId` mai popolato → tutti i check saltati
- **Fix:** Dipende da C5 (salvataggio jobId)

### M3 — Customer Update: ritardo 10s
- **File:** `frontend/src/components/CustomerCreateModal.tsx`
- **Bug:** WS rotto ma polling fallback dopo 10s funziona
- **Fix:** Risolto automaticamente dal fix C3 (pollJobUntilDone)

### M4 — cache_invalidation: evento mancante
- **File:** `frontend/src/components/SyncBars.tsx:78`
- **Bug:** Backend non emette mai `cache_invalidation`
- **Fix:** Risolto dal fix H3 (rimozione WS raw)
