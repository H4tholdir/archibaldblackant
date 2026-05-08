# Banner UX: Operazioni Utente vs Background — Design Spec

**Data:** 2026-05-08  
**Stato:** Approvato per implementazione

---

## Obiettivo

Separare visivamente nel `GlobalOperationBanner` le operazioni richieste esplicitamente dall'utente (submit-order, delete-order, ecc.) dalle operazioni automatiche di background (sync-customers, sync-prices, ecc.). L'utente deve sempre sapere cosa sta succedendo su sua richiesta, senza essere distratto da processi automatici che non richiedono la sua attenzione.

---

## Comportamento target

### Banner — due fasce

**Fascia superiore (blu) — Operazioni utente:**
- Appare solo quando `userOps.length > 0`
- Sfondo: `linear-gradient(135deg, #0984e3, #6c5ce7)`
- Contenuto singola op: spinner/⏳ + nome cliente + label + barra progresso + % + chevron ▸/▲
- Contenuto multi-op: op principale in primo piano + badge `+N in coda`
- Stati: active (spinner), queued (⏳), completed (✓ verde, auto-dismiss 5s), failed (✕ rosso, dismiss manuale)

**Fascia inferiore (scura) — Sync automatici:**
- Appare solo quando `bgOps.length > 0`
- Sfondo: `#1e272e`
- Contenuto: punto verde pulsante + testo riassuntivo ("Sync clienti (3/7 pag.), prezzi") + chevron ›
- Sempre informativa, mai prominente
- Quando c'è anche la fascia blu: separatore `1px solid rgba(0,0,0,0.3)` tra le due

**Quando entrambe sono assenti:** il banner scompare completamente (`return null`). Nessun indicatore persistente.

**Click sul banner:** apre il `QueueDrawer` (qualsiasi fascia tocchi).

---

## Drawer — due sezioni

### Sezione "Richieste da te" (accent `#3182ce`)
Visibile quando `userOps.length > 0`.

Per ogni operazione:
- **Header item:** icona stato + nome cliente + label operazione
- **Barra progresso** (solo se `status === 'active'`)
- **Tap sull'item:** naviga a `navigateTo` e chiude il drawer
- **Bottone annulla:**
  - `status === 'enqueued'` → bottone "✕" rosso tenue, chiama `cancelOperation(jobId)`
  - `status === 'running'` → bottone assente (nessuna possibilità di cancellare un'operazione in esecuzione su ERP)
  - `status === 'completed'` → ✓ verde, tap naviga all'ordine
  - `status === 'failed'` → ✕ rosso, tap naviga a `navigateTo` per riprovare manualmente dalla pagina ordini

### Sezione "Automatiche" (accent `#48bb78`)
Visibile solo quando `bgOps.length > 0`. Se assente, la sezione non viene renderizzata.

Per ogni sync:
- Pallino verde pulsante + nome sync + progresso testuale ("3/7 pagine", "completato")
- Solo visualizzazione — nessun bottone, nessun navigate-to, nessun annulla

### Chiusura drawer
- Tap su "▼ Chiudi"
- Swipe-down (già implementato nel `QueueDrawer` esistente)
- Tap su backdrop

---

## Classificazione operazioni

### Costante unica in `OperationTrackingContext.tsx`

```typescript
const BACKGROUND_OP_TYPES = new Set<string>([
  'sync-customers',
  'sync-orders',
  'sync-ddt',
  'sync-invoices',
  'sync-products',
  'sync-prices',
  'sync-customer-addresses',
  'sync-order-articles',
]);
```

### Campo aggiunto a `TrackedOperation`

```typescript
type TrackedOperation = {
  // ... campi esistenti ...
  isBackground: boolean;  // true per sync automatici, false per op utente
};
```

Il flag viene impostato in tutti i punti di ingresso del context:
- `trackOperation(...)` — usa `BACKGROUND_OP_TYPES.has(operationType)`
- Handler `JOB_STARTED` — usa `BACKGROUND_OP_TYPES.has(type)`
- Handler `JOB_QUEUED` — usa `BACKGROUND_OP_TYPES.has(type)`
- `recover()` — usa `BACKGROUND_OP_TYPES.has(activeJob.type)`

### Esposizione nel context value

```typescript
type OperationTrackingValue = {
  activeOperations: TrackedOperation[];      // esistente — invariato
  userOperations: TrackedOperation[];        // nuovo: filtro isBackground === false
  backgroundOperations: TrackedOperation[];  // nuovo: filtro isBackground === true
  trackOperation: (...) => void;
  dismissOperation: (jobId: string) => void;
  cancelOperation: (jobId: string) => Promise<void>; // nuovo
};
```

`GlobalOperationBanner` usa `userOperations` e `backgroundOperations` invece di `activeOperations`.

---

## Cancellazione operazioni in coda

### Frontend — nuovo hook nel context

```typescript
async function cancelOperation(jobId: string): Promise<void> {
  await cancelTaskApi(jobId); // POST /api/agent-queue/:taskId/cancel
  setOperations(prev => prev.filter(op => op.jobId !== jobId));
}
```

### API frontend — `api/operations.ts`

```typescript
async function cancelTaskApi(taskId: string): Promise<void> {
  const response = await fetch(`/api/agent-queue/${taskId}/cancel`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error(`Cancel failed: ${response.status}`);
}
```

### Backend — endpoint esistente

`POST /api/agent-queue/:taskId/cancel` in `agent-queue.ts` è già implementato. Ritorna errore se il task è già `running` — il frontend lo gestisce mostrando feedback (toast o messaggio inline nel drawer) senza crash.

---

## File modificati

| File | Tipo modifica |
|------|---------------|
| `frontend/src/contexts/OperationTrackingContext.tsx` | Aggiunge `isBackground`, `userOperations`, `backgroundOperations`, `cancelOperation` |
| `frontend/src/components/GlobalOperationBanner.tsx` | Divide in due fasce, usa `userOperations`/`backgroundOperations` |
| `frontend/src/components/QueueDrawer.tsx` | Riscritto con due sezioni, cancel button, navigate-to al tocco |
| `frontend/src/api/operations.ts` | Aggiunge `cancelTaskApi` |

**Nessun file nuovo.** Nessuna modifica ai caller di `trackOperation` (zero breaking changes).

---

## Test

**Unit:**
- `BACKGROUND_OP_TYPES` classification: ogni tipo in lista → `isBackground: true`; submit-order, delete-order, ecc. → `isBackground: false`
- `cancelOperation`: rimuove l'op dal context su successo, non la rimuove su errore

**Componente (Vitest + Testing Library):**
- `GlobalOperationBanner` con solo `userOperations` → nessuna striscia scura
- `GlobalOperationBanner` con solo `backgroundOperations` → nessuna fascia blu
- `QueueDrawer` con op enqueued → bottone annulla visibile
- `QueueDrawer` con op running → nessun bottone annulla

---

## Fuori scope

- Cancellazione di operazioni `running` (deliberatamente esclusa per sicurezza ERP)
- Indicatore di stato persistente quando banner assente ("ultimo sync: X min fa")
- Riordino manuale della coda
- Notifiche push native (separato)
