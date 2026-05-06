# Global Banner Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correggere tutti i difetti del global banner/QueueDrawer: label contestuali per ogni tipo di operazione, gestione stato `cancelled`, progress bar nel drawer, auto-close, distinzione visiva queued/active, pull handle mobile, recovery labels corrette.

**Architecture:** Modifiche distribuite su 7 file frontend. Nessuna modifica backend. Nessun cambio al tipo `TrackedOperation` (già ha `operationType` dopo il refactor precedente). La maggior parte dei fix sono string additions e piccoli blocchi JSX. Il task più complesso è B1 (progress bar drawer) che richiede di portare `progress` attraverso la prop `payload` di `AgentQueueTask`.

**Tech Stack:** React 19, TypeScript strict, Vitest + Testing Library, inline style (nessun CSS framework).

---

## File map

| File | Modificato da |
|------|--------------|
| `frontend/src/contexts/DownloadQueueContext.tsx` | A1 — aggiunge `completedLabel` + `operationType` |
| `frontend/src/pages/CustomerProfilePage.tsx` | A1 — aggiunge `operationType` in 2 call site |
| `frontend/src/pages/OrderHistory.tsx` | A1 — aggiunge `operationType` in 2 call site |
| `frontend/src/components/CustomerCreateModal.tsx` | A1 — aggiunge `operationType` |
| `frontend/src/components/GlobalOperationBanner.tsx` | A2 + A3 + B3 — summarize, cancelled, queued icon |
| `frontend/src/contexts/OperationTrackingContext.tsx` | A4 — recovery labels + `operationType` |
| `frontend/src/components/QueueDrawer.tsx` | B1 + B2-like + B4 — progress bar, handle pill |

---

## Task A1: Completa `operationType` e `completedLabel` in tutti i call site mancanti

**Files:**
- Modify: `archibald-web-app/frontend/src/contexts/DownloadQueueContext.tsx`
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`
- Modify: `archibald-web-app/frontend/src/pages/OrderHistory.tsx`
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

Contesto: `trackOperation` accetta ora 7 parametri: `(orderId, jobId, displayName, initialLabel?, completedLabel?, navigateTo?, operationType?)`. Questi 5 call site mancano del settimo parametro, e 1 manca anche del sesto.

- [ ] **Step 1: Fix DownloadQueueContext.tsx**

Trova la chiamata `trackOperation` in `DownloadQueueContext.tsx` (riga ~76). Attualmente:
```typescript
trackOperation(
  item.orderId,
  jobId,
  item.displayName,
  `Download ${item.docLabel}...`,
  undefined,
  '/orders',
)
```

Sostituisci con:
```typescript
trackOperation(
  item.orderId,
  jobId,
  item.displayName,
  `Download ${item.docLabel}...`,
  'Download completato',
  '/orders',
  item.type === 'ddt' ? 'download-ddt-pdf' : 'download-invoice-pdf',
)
```

- [ ] **Step 2: Fix CustomerProfilePage.tsx — update-customer save (riga ~262)**

Trova:
```typescript
trackOperation(erpId, jobId, customer.name, `Aggiornamento ${customer.name}`, 'Aggiornamento completato', `/customers/${erpId}`);
```
Sostituisci con:
```typescript
trackOperation(erpId, jobId, customer.name, `Aggiornamento ${customer.name}`, 'Aggiornamento completato', `/customers/${erpId}`, 'update-customer');
```

- [ ] **Step 3: Fix CustomerProfilePage.tsx — VAT validation (riga ~325)**

Trova:
```typescript
trackOperation(erpId, jobId, customer.name, `Validazione P.IVA ${customer.name}`, 'P.IVA validata', `/customers/${erpId}`);
```
Sostituisci con:
```typescript
trackOperation(erpId, jobId, customer.name, `Validazione P.IVA ${customer.name}`, 'P.IVA validata', `/customers/${erpId}`, 'read-vat-status');
```

- [ ] **Step 4: Fix OrderHistory.tsx — send-to-verona singolo (riga ~807)**

Trova:
```typescript
trackOperation(modalOrderId, data.jobId, modalCustomerName || modalOrderId, 'Invio a Verona...', 'Inviato a Verona', '/orders');
```
Sostituisci con:
```typescript
trackOperation(modalOrderId, data.jobId, modalCustomerName || modalOrderId, 'Invio a Verona...', 'Inviato a Verona', '/orders', 'send-to-verona');
```

- [ ] **Step 5: Fix OrderHistory.tsx — batch-send-to-verona (riga ~928)**

Trova:
```typescript
trackOperation(ids[0], data.jobId, `${ids.length} ordini`, "Invio a Verona...", "Inviato a Verona", '/orders');
```
Sostituisci con:
```typescript
trackOperation(ids[0], data.jobId, `${ids.length} ordini`, "Invio a Verona...", "Inviato a Verona", '/orders', 'batch-send-to-verona');
```

- [ ] **Step 6: Fix CustomerCreateModal.tsx — create-customer (riga ~435)**

Trova:
```typescript
trackOperation(resultTaskId, resultTaskId, displayName, "Creazione in corso...", "Cliente creato", "/customers");
```
Sostituisci con:
```typescript
trackOperation(resultTaskId, resultTaskId, displayName, "Creazione in corso...", "Cliente creato", "/customers", 'create-customer');
```

- [ ] **Step 7: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```
Expected: nessun errore.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/frontend/src/contexts/DownloadQueueContext.tsx \
        archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx \
        archibald-web-app/frontend/src/pages/OrderHistory.tsx \
        archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "fix(banner): operationType e completedLabel in tutti i call site rimanenti"
```

---

## Task A2: `summarizeOperations` type-aware — non usa più "ordini" hardcoded

**Files:**
- Modify: `archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx`

Contesto: la funzione `summarizeOperations` (riga 120-138) usa sempre la parola "ordini" nel testo sommario, ma il banner ora traccia anche create-customer, update-customer, download, ecc. Serve una label neutra quando il mix di operazioni non è tutto ordini.

- [ ] **Step 1: Aggiorna `summarizeOperations` in `GlobalOperationBanner.tsx`**

Trova la funzione `summarizeOperations` (riga 120). Sostituisci il corpo con:

```typescript
function summarizeOperations(ops: TrackedOperation[]) {
  const completed = ops.filter((o) => o.status === "completed").length;
  const failed = ops.filter((o) => o.status === "failed").length;
  const inProgress = ops.filter((o) => o.status === "active" || o.status === "queued").length;
  const totalProgress = ops.reduce((sum, o) => sum + o.progress, 0);
  const avgProgress = ops.length > 0 ? Math.round(totalProgress / ops.length) : 0;

  const parts: string[] = [];
  if (completed > 0) parts.push(`${completed} completat${completed === 1 ? "a" : "e"}`);
  if (inProgress > 0) parts.push(`${inProgress} in corso`);
  if (failed > 0) parts.push(`${failed} fallita${failed === 1 ? "" : "e"}`);

  // Usa "ordini" solo se tutte le operazioni sono tipi-ordine; altrimenti "operazioni"
  const ORDER_TYPES = new Set(['submit-order', 'edit-order', 'delete-order', 'send-to-verona',
    'batch-send-to-verona', 'batch-delete-orders']);
  const allOrders = ops.every(o => !o.operationType || ORDER_TYPES.has(o.operationType));
  const noun = allOrders ? "ordini" : "operazioni";

  return {
    text: `${ops.length} ${noun} in elaborazione (${parts.join(", ")})`,
    avgProgress,
    hasActive: inProgress > 0,
    hasFailed: failed > 0,
  };
}
```

- [ ] **Step 2: Test della funzione in `GlobalOperationBanner.spec.tsx`**

Cerca se esiste `archibald-web-app/frontend/src/components/GlobalOperationBanner.spec.tsx`. Se non esiste, crealo:

```typescript
import { describe, it, expect } from 'vitest';
import { summarizeOperations } from './GlobalOperationBanner';
import type { TrackedOperation } from '../contexts/OperationTrackingContext';

const makeOp = (overrides: Partial<TrackedOperation>): TrackedOperation => ({
  orderId: 'o1',
  jobId: 'j1',
  customerName: 'Test',
  status: 'active',
  progress: 0,
  label: 'In corso',
  startedAt: Date.now(),
  ...overrides,
});

describe('summarizeOperations', () => {
  it('usa "ordini" quando tutte le operazioni sono order-type', () => {
    const ops = [
      makeOp({ operationType: 'submit-order' }),
      makeOp({ operationType: 'delete-order', status: 'completed', progress: 100 }),
    ];
    expect(summarizeOperations(ops).text).toContain('ordini');
  });

  it('usa "operazioni" quando il mix include create-customer', () => {
    const ops = [
      makeOp({ operationType: 'submit-order' }),
      makeOp({ operationType: 'create-customer', status: 'completed', progress: 100 }),
    ];
    expect(summarizeOperations(ops).text).toContain('operazioni');
  });

  it('imposta hasFailed=true se almeno una è failed', () => {
    const ops = [
      makeOp({ status: 'failed' }),
      makeOp({ status: 'completed', progress: 100 }),
    ];
    expect(summarizeOperations(ops).hasFailed).toBe(true);
  });
});
```

Nota: il tipo `TrackedOperation` viene importato dal context. Verificare che sia esportato (è già `export type TrackedOperation` in `OperationTrackingContext.tsx`).

- [ ] **Step 3: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- --run src/components/GlobalOperationBanner.spec.tsx --reporter=verbose 2>&1 | tail -15
```
Expected: tutti i test passano.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx \
        archibald-web-app/frontend/src/components/GlobalOperationBanner.spec.tsx
git commit -m "fix(banner): summarizeOperations usa 'operazioni' per mix non-ordini"
```

---

## Task A3: Branch dedicato per stato `cancelled` nel banner

**Files:**
- Modify: `archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx`

Contesto: quando un'operazione è `cancelled`, il banner attuale non ha un branch dedicato. Finisce nel blocco "tutte completed/failed" con sfondo verde — semanticamente sbagliato. Serve uno stile neutro grigio e un'icona dedicata.

- [ ] **Step 1: Aggiungi `cancelledBannerStyle` in `GlobalOperationBanner.tsx`**

Dopo `failedBannerStyle` (riga ~63), aggiungi:

```typescript
const cancelledBannerStyle: CSSProperties = {
  ...bannerBaseStyle,
  background: "#f3f4f6",
  color: "#374151",
};
```

- [ ] **Step 2: Aggiungi branch `cancelled` nel blocco `activeOperations.length === 1`**

Nel blocco che gestisce 1 operazione (riga ~211), dopo il branch `op.status === "completed"` e prima del branch default (`return (`), aggiungi:

```typescript
    if (op.status === "cancelled") {
      return (
        <>
          <style>{ANIMATION_STYLES}</style>
          <style>{APP_MAIN_SPACER}</style>
          {isExpanded && (
            <QueueDrawer
              isOpen={isExpanded}
              tasks={queueTasks}
              onClose={() => setIsExpanded(false)}
            />
          )}
          <div
            style={cancelledBannerStyle}
            onClick={() => setIsExpanded(prev => !prev)}
            data-testid="global-operation-banner"
          >
            <span style={{ flexShrink: 0 }}>✕</span>
            <span style={labelStyle}>
              {op.customerName} — Annullato
            </span>
            <button
              style={{ ...closeBtnStyle, color: "#374151" }}
              onClick={(e) => {
                e.stopPropagation();
                dismissOperation(op.jobId);
              }}
              aria-label="Chiudi"
              data-testid="banner-close-btn"
            >
              &#10005;
            </button>
          </div>
        </>
      );
    }
```

- [ ] **Step 3: Aggiorna `summarizeOperations` per contare cancelled**

Nella funzione `summarizeOperations` già aggiornata nel Task A2, aggiungi il conteggio cancelled nel calcolo `parts`:

```typescript
  const cancelled = ops.filter((o) => o.status === "cancelled").length;
  // ...nelle parti:
  if (cancelled > 0) parts.push(`${cancelled} annullat${cancelled === 1 ? "a" : "e"}`);
```

- [ ] **Step 4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx
git commit -m "feat(banner): aggiunge branch dedicato stato cancelled — grigio neutro invece di verde"
```

---

## Task A4: Recovery labels contestuali usando `activeJob.type`

**Files:**
- Modify: `archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx`

Contesto: quando la pagina viene ricaricata durante un'operazione, il context recupera i job attivi via `getActiveJobs()`. Attualmente imposta label generiche ("Operazione completata", "Recupero in corso...", "Errore"). L'`ActiveJob` ha già il campo `type: string` con il tipo ERP (es. `'submit-order'`). Possiamo usarlo per label contestuali. Aggiungiamo anche `operationType` nelle entry recovered.

- [ ] **Step 1: Aggiungi helper `getRecoveryLabels` in `OperationTrackingContext.tsx`**

Prima della definizione di `OperationTrackingProvider` (riga ~49), aggiungi:

```typescript
function getRecoveryLabels(type: string, status: 'completed' | 'failed' | string): { label: string; completedLabel: string } {
  const completedByType: Record<string, string> = {
    'submit-order': 'Ordine inviato',
    'delete-order': 'Ordine eliminato',
    'edit-order': 'Modifica completata',
    'send-to-verona': 'Inviato a Verona',
    'batch-send-to-verona': 'Inviato a Verona',
    'batch-delete-orders': 'Ordini eliminati',
    'create-customer': 'Cliente creato',
    'update-customer': 'Aggiornamento completato',
    'read-vat-status': 'P.IVA validata',
    'download-ddt-pdf': 'Download completato',
    'download-invoice-pdf': 'Download completato',
    'sync-order-articles': 'Sync completato',
  };
  const inProgressByType: Record<string, string> = {
    'submit-order': 'Invio ordine...',
    'delete-order': 'Eliminazione ordine...',
    'edit-order': 'Modifica ordine...',
    'send-to-verona': 'Invio a Verona...',
    'batch-send-to-verona': 'Invio a Verona...',
    'batch-delete-orders': 'Eliminazione batch...',
    'create-customer': 'Creazione in corso...',
    'update-customer': 'Aggiornamento in corso...',
    'read-vat-status': 'Verifica P.IVA...',
    'download-ddt-pdf': 'Download DDT...',
    'download-invoice-pdf': 'Download fattura...',
    'sync-order-articles': 'Sync articoli...',
  };

  const completedLabel = completedByType[type] ?? 'Operazione completata';
  const inProgressLabel = inProgressByType[type] ?? 'In corso...';

  if (status === 'completed') return { label: completedLabel, completedLabel };
  if (status === 'failed') return { label: 'Errore', completedLabel };
  return { label: inProgressLabel, completedLabel };
}
```

- [ ] **Step 2: Usa `getRecoveryLabels` nel blocco `recover()` e aggiungi `operationType`**

Nel blocco `recover()` (riga ~102-116), dove viene costruito ogni oggetto `recovered`, sostituisci:

```typescript
// PRIMA:
const status = ...;
recovered.push({
  orderId: activeJob.entityId,
  jobId: activeJob.jobId,
  customerName: activeJob.entityName,
  status,
  progress: status === "completed" ? 100 : (job.progress ?? 0),
  label: status === "completed"
    ? "Operazione completata"
    : status === "failed"
      ? "Errore"
      : "Recupero in corso...",
  error: job.failedReason,
  startedAt: new Date(activeJob.startedAt).getTime(),
  navigateTo: deriveNavigateTo(activeJob.type, activeJob.entityId),
});
```

Con:
```typescript
// DOPO:
const status = ...;
const { label, completedLabel } = getRecoveryLabels(activeJob.type, status);
recovered.push({
  orderId: activeJob.entityId,
  jobId: activeJob.jobId,
  customerName: activeJob.entityName,
  status,
  progress: status === "completed" ? 100 : (job.progress ?? 0),
  label,
  completedLabel,
  operationType: activeJob.type,
  error: job.failedReason,
  startedAt: new Date(activeJob.startedAt).getTime(),
  navigateTo: deriveNavigateTo(activeJob.type, activeJob.entityId),
});
```

- [ ] **Step 3: Scrivi test per `getRecoveryLabels`**

Aggiungi in `OperationTrackingContext.tsx` l'export di `getRecoveryLabels` per i test:

```typescript
export { getRecoveryLabels }; // aggiungere in fondo al file
```

Crea `archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getRecoveryLabels } from './OperationTrackingContext';

describe('getRecoveryLabels', () => {
  it('ritorna label contestuale per submit-order completato', () => {
    const { label, completedLabel } = getRecoveryLabels('submit-order', 'completed');
    expect(label).toBe('Ordine inviato');
    expect(completedLabel).toBe('Ordine inviato');
  });

  it('ritorna label in-progress per submit-order attivo', () => {
    const { label } = getRecoveryLabels('submit-order', 'active');
    expect(label).toBe('Invio ordine...');
  });

  it('ritorna label di errore per qualsiasi tipo fallito', () => {
    const { label } = getRecoveryLabels('delete-order', 'failed');
    expect(label).toBe('Errore');
  });

  it('fallback generico per tipo sconosciuto', () => {
    const { label } = getRecoveryLabels('unknown-type', 'active');
    expect(label).toBe('In corso...');
  });
});
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- --run src/contexts/OperationTrackingContext.spec.ts --reporter=verbose 2>&1 | tail -15
```
Expected: tutti i test passano.

- [ ] **Step 5: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx \
        archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.ts
git commit -m "feat(banner): recovery labels contestuali per tipo operazione — fine 'Operazione completata' generico"
```

---

## Task B1: Progress bar nel QueueDrawer per task in esecuzione

**Files:**
- Modify: `archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx` (passa `progress` e `label` nel payload)
- Modify: `archibald-web-app/frontend/src/components/QueueDrawer.tsx` (legge progress e mostra barra)

Contesto: il `QueueDrawer` riceve `AgentQueueTask[]` da `GlobalOperationBanner`. `AgentQueueTask` ha un campo `payload: Record<string, unknown>`. Possiamo passare `progress` e `label` nel payload senza modificare il tipo pubblico `AgentQueueTask`.

- [ ] **Step 1: Passa `progress` e `label` nel payload in `GlobalOperationBanner.tsx`**

Trova la mappatura `queueTasks` (riga ~180). Sostituisci:

```typescript
    payload: { customerName: op.customerName },
```

Con:

```typescript
    payload: { customerName: op.customerName, progress: op.progress, label: op.label },
```

- [ ] **Step 2: Aggiunge barra di progresso nel `QueueDrawer.tsx`**

Prima della funzione `getTaskLabel` (riga ~50), aggiungi la funzione di rendering della progress bar:

```typescript
function TaskProgressBar({ progress }: { progress: number }) {
  return (
    <div style={{
      width: '100%',
      height: '3px',
      background: '#e5e7eb',
      borderRadius: '2px',
      marginTop: '4px',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%',
        width: `${progress}%`,
        background: '#2563eb',
        borderRadius: '2px',
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}
```

- [ ] **Step 3: Usa `TaskProgressBar` e mostra `label` nel drawer per task in esecuzione**

Nel body del `tasks.map(task => ...)` nel `QueueDrawer` (riga ~102-119), sostituisci il div interno con:

```typescript
            <div
              key={task.taskId}
              style={{
                display: 'flex', flexDirection: 'column',
                padding: '12px 20px', borderBottom: '1px solid #f9fafb',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>{STATUS_ICON[task.status] ?? '•'}</span>
                  <span style={{ fontSize: '13px', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {getTaskLabel(task)}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: STATUS_COLOR[task.status] ?? '#6b7280', flexShrink: 0, marginLeft: '12px' }}>
                  {task.status === 'running'
                    ? `${(task.payload as { progress?: number }).progress ?? 0}%`
                    : getStatusLabel(task)
                  }
                </span>
              </div>
              {task.status === 'running' && (
                <>
                  {(task.payload as { label?: string }).label && (
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px', marginLeft: '26px' }}>
                      {(task.payload as { label?: string }).label}
                    </div>
                  )}
                  <div style={{ marginLeft: '26px', marginTop: '4px' }}>
                    <TaskProgressBar progress={(task.payload as { progress?: number }).progress ?? 0} />
                  </div>
                </>
              )}
            </div>
```

- [ ] **Step 4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx \
        archibald-web-app/frontend/src/components/QueueDrawer.tsx
git commit -m "feat(drawer): aggiunge progress bar e label step per task in esecuzione"
```

---

## Task B2: Drawer si chiude automaticamente quando il banner scompare

**Files:**
- Modify: `archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx`

Contesto: quando tutte le operazioni completano e il banner fa auto-dismiss (5s), il drawer rimane aperto se l'utente lo aveva aperto. Serve un `useEffect` che resetti `isExpanded` a `false` quando il banner diventa invisibile.

- [ ] **Step 1: Aggiungi useEffect per auto-close del drawer**

In `GlobalOperationBanner` (componente funzione), dopo la definizione di `bannerVisible` (riga ~163), aggiungi:

```typescript
  // Chiude il drawer automaticamente quando il banner scompare
  useEffect(() => {
    if (!bannerVisible) {
      setIsExpanded(false);
    }
  }, [bannerVisible]);
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx
git commit -m "fix(banner): drawer si chiude automaticamente quando banner sparisce"
```

---

## Task B3: Distinzione visiva tra stato `queued` (orologio) e `active` (spinner)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx`

Contesto: attualmente sia `queued` che `active` mostrano lo spinner rotante. Semanticamente, `queued` = "in attesa in coda" dovrebbe avere un'icona statica (orologio/⏳), mentre `active` = "il bot sta lavorando" ha lo spinner animato.

- [ ] **Step 1: Aggiungi `queuedIconStyle` in `GlobalOperationBanner.tsx`**

Dopo `spinnerStyle` (riga ~85), aggiungi:

```typescript
const queuedIconStyle: CSSProperties = {
  display: "inline-block",
  width: "14px",
  height: "14px",
  flexShrink: 0,
  fontSize: "14px",
  lineHeight: "14px",
  textAlign: "center",
};
```

- [ ] **Step 2: Sostituisci lo spinner con icona condizionale per i branch che mostrano operazioni active/queued**

Nel banner a **1 operazione** (blocco default, riga ~281), il `<span style={spinnerStyle}>` è sempre mostrato. Sostituisci:

```tsx
          <span style={spinnerStyle} data-testid="banner-spinner" />
```

Con:

```tsx
          {op.status === 'active'
            ? <span style={spinnerStyle} data-testid="banner-spinner" />
            : <span style={queuedIconStyle} data-testid="banner-queued-icon">⏳</span>
          }
```

Nel banner a **N operazioni** con `primaryOp` (riga ~322), fai la stessa sostituzione:

```tsx
          {primaryOp.status === 'active'
            ? <span style={spinnerStyle} data-testid="banner-spinner" />
            : <span style={queuedIconStyle} data-testid="banner-queued-icon">⏳</span>
          }
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx
git commit -m "feat(banner): ⏳ per operazioni in coda, spinner solo per operazioni attive"
```

---

## Task B4: Pull handle pill nel QueueDrawer (UX mobile iOS)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/QueueDrawer.tsx`

Contesto: il `QueueDrawer` è un bottom sheet ma manca del pill/handle grigio in cima che è il pattern standard per i bottom sheet iOS/Android. L'utente mobile non ha un indicatore visivo che il drawer è "tirabile" o chiudibile con swipe. Aggiungiamo il pill sopra all'header esistente.

- [ ] **Step 1: Aggiungi la pill handle nel `QueueDrawer`**

Nel JSX del `QueueDrawer`, subito dopo `<div style={DRAWER_BASE} role="dialog" aria-label="Coda di lavoro">` e PRIMA del div header (riga ~82), aggiungi:

```tsx
      {/* Pull handle pill — indicatore bottom sheet standard iOS/Android */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '10px', paddingBottom: '2px' }}>
        <div style={{
          width: '36px',
          height: '4px',
          background: '#d1d5db',
          borderRadius: '2px',
        }} />
      </div>
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/QueueDrawer.tsx
git commit -m "feat(drawer): aggiunge pull handle pill — UX bottom sheet standard mobile"
```

---

## Task B5: Suite test finale + push

**Files:** nessun file nuovo

- [ ] **Step 1: Esegui la suite completa frontend**

```bash
npm test --prefix archibald-web-app/frontend -- --run 2>&1 | tail -6
```
Expected: tutti i test passano (≥1025).

- [ ] **Step 2: Type-check finale**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```
Expected: nessun errore.

- [ ] **Step 3: Push**

```bash
git push origin master 2>&1 | tail -2
```

---

## Checklist self-review spec coverage

- [x] Download completedLabel "Download completato" (Task A1)
- [x] operationType per tutti i 5 call site mancanti (Task A1)
- [x] summarizeOperations type-aware (Task A2)
- [x] Stato cancelled — branch grigio dedicato (Task A3)
- [x] Recovery labels contestuali (Task A4)
- [x] Progress bar nel QueueDrawer (Task B1)
- [x] Label step corrente nel drawer per running (Task B1)
- [x] Drawer auto-close al banner dismiss (Task B2)
- [x] ⏳ per queued vs spinner per active (Task B3)
- [x] Pull handle pill (Task B4)
