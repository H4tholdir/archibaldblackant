# Banner UX: Operazioni Utente vs Background — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separare visivamente le operazioni utente (fascia blu) dalle sync automatiche (striscia scura) nel `GlobalOperationBanner`, con drawer a due sezioni, bottone annulla per operazioni in coda, e navigate-to al tocco.

**Architecture:** `OperationTrackingContext` classifica ogni `TrackedOperation` con `isBackground: boolean` basandosi su `BACKGROUND_OP_TYPES`. Il context espone `userOperations` e `backgroundOperations`. `GlobalOperationBanner` renderizza due fasce distinte. `QueueDrawer` viene riscritto con due sezioni.

**Tech Stack:** React 19, TypeScript strict, inline CSSProperties (nessun Tailwind), Vitest + Testing Library, frontend Archibald PWA.

**Prerequisiti da leggere prima di ogni task:**
- `archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx` — contesto completo
- `archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx` — banner attuale
- `archibald-web-app/frontend/src/components/QueueDrawer.tsx` — drawer attuale
- `archibald-web-app/frontend/src/api/operations.ts` — API frontend

---

## File Map

| File | Azione | Responsabilità |
|------|--------|----------------|
| `src/contexts/OperationTrackingContext.tsx` | MODIFY | Aggiunge `isBackground`, `userOperations`, `backgroundOperations`, `cancelOperation` |
| `src/contexts/OperationTrackingContext.spec.tsx` | CREATE | Test classificazione + cancelOperation |
| `src/components/QueueDrawer.tsx` | REWRITE | Due sezioni, cancel button, navigate-to |
| `src/components/QueueDrawer.spec.tsx` | CREATE | Test visibilità cancel button, sezioni |
| `src/components/GlobalOperationBanner.tsx` | MODIFY | Due fasce, usa userOperations/backgroundOperations |
| `src/api/operations.ts` | MODIFY | Aggiunge `cancelTaskApi` |

---

## Task 1 — Aggiungi `isBackground` a `TrackedOperation` e classificazione nel context

**Files:**
- Modify: `archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx`
- Create: `archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.tsx`

- [ ] **Step 1: Scrivi i test PRIMA dell'implementazione**

Crea `archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.tsx`:

```typescript
import { describe, expect, test } from 'vitest';

// Accede direttamente alla costante esportata e alla funzione helper
// che verrà aggiunta nel prossimo step
import { BACKGROUND_OP_TYPES, classifyOperation } from './OperationTrackingContext';

describe('BACKGROUND_OP_TYPES', () => {
  test('include tutti i tipi di sync automatico', () => {
    const expected = [
      'sync-customers', 'sync-orders', 'sync-ddt', 'sync-invoices',
      'sync-products', 'sync-prices', 'sync-customer-addresses', 'sync-order-articles',
    ];
    for (const t of expected) {
      expect(BACKGROUND_OP_TYPES.has(t)).toBe(true);
    }
  });

  test('non include operazioni utente', () => {
    const userOps = [
      'submit-order', 'delete-order', 'edit-order', 'send-to-verona',
      'create-customer', 'update-customer', 'read-vat-status', 'refresh-customer',
      'download-ddt-pdf', 'download-invoice-pdf', 'batch-delete-orders', 'batch-send-to-verona',
    ];
    for (const t of userOps) {
      expect(BACKGROUND_OP_TYPES.has(t)).toBe(false);
    }
  });
});

describe('classifyOperation', () => {
  test('sync-prices → isBackground: true', () => {
    expect(classifyOperation('sync-prices')).toBe(true);
  });

  test('submit-order → isBackground: false', () => {
    expect(classifyOperation('submit-order')).toBe(false);
  });

  test('tipo sconosciuto → isBackground: false', () => {
    expect(classifyOperation('unknown-type')).toBe(false);
  });

  test('undefined → isBackground: false', () => {
    expect(classifyOperation(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
cd archibald-web-app/frontend && npx vitest run src/contexts/OperationTrackingContext.spec.tsx 2>&1 | tail -8
```

Expected: FAIL — `BACKGROUND_OP_TYPES` e `classifyOperation` non ancora esportati.

- [ ] **Step 3: Aggiungi `BACKGROUND_OP_TYPES`, `classifyOperation`, e `isBackground` al context**

In `OperationTrackingContext.tsx`, subito dopo gli import, aggiungi:

```typescript
export const BACKGROUND_OP_TYPES = new Set<string>([
  'sync-customers',
  'sync-orders',
  'sync-ddt',
  'sync-invoices',
  'sync-products',
  'sync-prices',
  'sync-customer-addresses',
  'sync-order-articles',
]);

export function classifyOperation(operationType: string | undefined): boolean {
  return BACKGROUND_OP_TYPES.has(operationType ?? '');
}
```

Nel tipo `TrackedOperation` (riga ~13), aggiungi il campo:

```typescript
type TrackedOperation = {
  orderId: string;
  jobId: string;
  customerName: string;
  status: "queued" | "active" | "completed" | "failed" | "cancelled";
  progress: number;
  label: string;
  completedLabel?: string;
  navigateTo?: string;
  operationType?: string;
  error?: string;
  startedAt: number;
  dismissedAt?: number;
  isBackground: boolean;  // ← NUOVO: true per sync automatici
};
```

Aggiorna tutti i punti dove viene creata una `TrackedOperation`:

**1. Funzione `trackOperation`** — trova la chiamata `setOperations(prev => [...prev, { ... }])` e aggiungi `isBackground: classifyOperation(operationType)`.

**2. Funzione `addUnknownJob`** (interno, per secondi dispositivi) — trova dove crea l'oggetto TrackedOperation e aggiungi `isBackground: classifyOperation(type)`.

**3. In `recover()`** — dove si fa `recovered.push({ ... })`, aggiungi `isBackground: classifyOperation(activeJob.type)`.

- [ ] **Step 4: Verifica che i test passino**

```bash
cd archibald-web-app/frontend && npx vitest run src/contexts/OperationTrackingContext.spec.tsx 2>&1 | tail -8
```

Expected: PASS.

- [ ] **Step 5: Aggiungi `userOperations` e `backgroundOperations` al context value**

Nel tipo `OperationTrackingValue`:

```typescript
type OperationTrackingValue = {
  activeOperations: TrackedOperation[];       // invariato
  userOperations: TrackedOperation[];         // ← NUOVO
  backgroundOperations: TrackedOperation[];   // ← NUOVO
  trackOperation: (orderId: string, jobId: string, displayName: string, initialLabel?: string, completedLabel?: string, navigateTo?: string, operationType?: string) => void;
  dismissOperation: (jobId: string) => void;
};
```

Nel provider, calcola i due array derivati prima del `return`:

```typescript
const userOperations = operations.filter(op => !op.isBackground);
const backgroundOperations = operations.filter(op => op.isBackground);
```

Aggiorna il `value` passato al Provider:

```typescript
const value: OperationTrackingValue = {
  activeOperations: operations,
  userOperations,
  backgroundOperations,
  trackOperation,
  dismissOperation,
};
```

- [ ] **Step 6: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx \
        archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.tsx
git commit -m "feat(banner): classifica TrackedOperation con isBackground — BACKGROUND_OP_TYPES + userOperations/backgroundOperations"
```

---

## Task 2 — Aggiungi `cancelOperation` al context e `cancelTaskApi` all'API

**Files:**
- Modify: `archibald-web-app/frontend/src/api/operations.ts`
- Modify: `archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx`
- Modify: `archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.tsx`

- [ ] **Step 1: Aggiungi `cancelTaskApi` in `api/operations.ts`**

In fondo al file (prima degli export), aggiungi:

```typescript
async function cancelTaskApi(taskId: string): Promise<void> {
  const response = await fetch(`/api/agent-queue/${taskId}/cancel`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Cancel failed: HTTP ${response.status}`);
  }
}
```

Aggiungi `cancelTaskApi` agli export esistenti del file.

- [ ] **Step 2: Scrivi i test per `cancelOperation` nel context spec**

Aggiungi in coda a `OperationTrackingContext.spec.tsx`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { OperationTrackingProvider, useOperationTracking } from './OperationTrackingContext';

// Mock fetch globale
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('cancelOperation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('rimuove operazione dal context su successo', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useOperationTracking(), {
      wrapper: OperationTrackingProvider,
    });

    // Aggiungi un'operazione manualmente
    act(() => {
      result.current.trackOperation('order-1', 'job-abc', 'Bianchi Srl', 'In coda', undefined, '/orders', 'submit-order');
    });

    expect(result.current.userOperations).toHaveLength(1);

    await act(async () => {
      await result.current.cancelOperation('job-abc');
    });

    expect(result.current.userOperations).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledWith('/api/agent-queue/job-abc/cancel', expect.objectContaining({ method: 'POST' }));
  });

  test('non rimuove operazione dal context se fetch fallisce', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 409 });

    const { result } = renderHook(() => useOperationTracking(), {
      wrapper: OperationTrackingProvider,
    });

    act(() => {
      result.current.trackOperation('order-1', 'job-abc', 'Bianchi Srl', 'In coda', undefined, '/orders', 'submit-order');
    });

    await act(async () => {
      await result.current.cancelOperation('job-abc').catch(() => {});
    });

    expect(result.current.userOperations).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Verifica che i test falliscano**

```bash
cd archibald-web-app/frontend && npx vitest run src/contexts/OperationTrackingContext.spec.tsx 2>&1 | tail -8
```

Expected: FAIL — `cancelOperation` non ancora nel context.

- [ ] **Step 4: Implementa `cancelOperation` nel context**

Aggiungi l'import nell'`OperationTrackingContext.tsx`:

```typescript
import { cancelTaskApi } from '../api/operations';
```

Aggiungi `cancelOperation` al tipo `OperationTrackingValue`:

```typescript
type OperationTrackingValue = {
  activeOperations: TrackedOperation[];
  userOperations: TrackedOperation[];
  backgroundOperations: TrackedOperation[];
  trackOperation: (orderId: string, jobId: string, displayName: string, initialLabel?: string, completedLabel?: string, navigateTo?: string, operationType?: string) => void;
  dismissOperation: (jobId: string) => void;
  cancelOperation: (jobId: string) => Promise<void>;  // ← NUOVO
};
```

Implementa la funzione nel provider (vicino a `dismissOperation`):

```typescript
const cancelOperation = useCallback(async (jobId: string): Promise<void> => {
  await cancelTaskApi(jobId);
  setOperations(prev => prev.filter(op => op.jobId !== jobId));
}, []);
```

Aggiorna il `value`:

```typescript
const value: OperationTrackingValue = {
  activeOperations: operations,
  userOperations,
  backgroundOperations,
  trackOperation,
  dismissOperation,
  cancelOperation,
};
```

- [ ] **Step 5: Verifica che i test passino**

```bash
cd archibald-web-app/frontend && npx vitest run src/contexts/OperationTrackingContext.spec.tsx 2>&1 | tail -8
```

Expected: PASS.

- [ ] **Step 6: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/api/operations.ts \
        archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx \
        archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.tsx
git commit -m "feat(banner): cancelOperation nel context + cancelTaskApi — rimuove op in coda dal backend e dallo stato"
```

---

## Task 3 — Riscrivi `QueueDrawer` con due sezioni, cancel button, navigate-to

**Files:**
- Rewrite: `archibald-web-app/frontend/src/components/QueueDrawer.tsx`
- Create: `archibald-web-app/frontend/src/components/QueueDrawer.spec.tsx`

- [ ] **Step 1: Scrivi i test prima del rewrite**

Crea `archibald-web-app/frontend/src/components/QueueDrawer.spec.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { QueueDrawer } from './QueueDrawer';
import type { TrackedOperation } from '../contexts/OperationTrackingContext';

function makeOp(overrides: Partial<TrackedOperation>): TrackedOperation {
  return {
    orderId: 'order-1',
    jobId: 'job-1',
    customerName: 'Bianchi Srl',
    status: 'active',
    progress: 50,
    label: 'In corso',
    startedAt: Date.now(),
    isBackground: false,
    navigateTo: '/orders',
    operationType: 'submit-order',
    ...overrides,
  };
}

const noop = () => {};
const noopAsync = async () => {};

describe('QueueDrawer', () => {
  test('non renderizza se isOpen=false', () => {
    const { container } = render(
      <QueueDrawer isOpen={false} userOperations={[makeOp({})]} bgOperations={[]} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('mostra sezione "Richieste da te" se ci sono userOperations', () => {
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({})]} bgOperations={[]} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.getByText('Richieste da te')).toBeTruthy();
  });

  test('NON mostra sezione "Automatiche" se bgOperations è vuoto', () => {
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({})]} bgOperations={[]} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.queryByText('Automatiche')).toBeNull();
  });

  test('mostra sezione "Automatiche" se ci sono bgOperations', () => {
    const bgOp = makeOp({ isBackground: true, operationType: 'sync-customers', customerName: 'Sync', jobId: 'bg-1' });
    render(
      <QueueDrawer isOpen={true} userOperations={[]} bgOperations={[bgOp]} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.getByText('Automatiche')).toBeTruthy();
  });

  test('mostra bottone annulla per operazione enqueued', () => {
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({ status: 'queued' })]} bgOperations={[]} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.getByRole('button', { name: /annulla/i })).toBeTruthy();
  });

  test('NON mostra bottone annulla per operazione running', () => {
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({ status: 'active' })]} bgOperations={[]} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.queryByRole('button', { name: /annulla/i })).toBeNull();
  });

  test('chiama onCancel con jobId al click annulla', () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({ status: 'queued', jobId: 'job-xyz' })]} bgOperations={[]} onClose={noop} onCancel={onCancel} onNavigate={noop} />
    );
    fireEvent.click(screen.getByRole('button', { name: /annulla/i }));
    expect(onCancel).toHaveBeenCalledWith('job-xyz');
  });

  test('chiama onNavigate con navigateTo al tap sul item utente', () => {
    const onNavigate = vi.fn();
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({ navigateTo: '/orders/123' })]} bgOperations={[]} onClose={noop} onCancel={noopAsync} onNavigate={onNavigate} />
    );
    fireEvent.click(screen.getByText('Bianchi Srl'));
    expect(onNavigate).toHaveBeenCalledWith('/orders/123');
  });
});
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
cd archibald-web-app/frontend && npx vitest run src/components/QueueDrawer.spec.tsx 2>&1 | tail -8
```

Expected: FAIL — props nuove non ancora accettate.

- [ ] **Step 3: Riscrivi `QueueDrawer.tsx`**

Sostituisci l'intero contenuto del file con:

```typescript
import type { CSSProperties } from 'react';
import type { TrackedOperation } from '../contexts/OperationTrackingContext';

type QueueDrawerProps = {
  isOpen: boolean;
  userOperations: TrackedOperation[];
  bgOperations: TrackedOperation[];
  onClose: () => void;
  onCancel: (jobId: string) => Promise<void>;
  onNavigate: (path: string) => void;
};

const BG_SYNC_LABELS: Record<string, string> = {
  'sync-customers': 'Sync clienti',
  'sync-orders': 'Sync ordini',
  'sync-ddt': 'Sync DDT',
  'sync-invoices': 'Sync fatture',
  'sync-products': 'Sync prodotti',
  'sync-prices': 'Sync prezzi',
  'sync-customer-addresses': 'Sync indirizzi',
  'sync-order-articles': 'Sync articoli ordine',
};

const USER_OP_LABELS: Record<string, string> = {
  'submit-order': 'Invio ordine',
  'send-to-verona': 'Invio a Verona',
  'edit-order': 'Modifica ordine',
  'delete-order': 'Eliminazione ordine',
  'batch-send-to-verona': 'Invio a Verona',
  'batch-delete-orders': 'Eliminazione ordini',
  'create-customer': 'Creazione cliente',
  'update-customer': 'Aggiornamento cliente',
  'read-vat-status': 'Verifica P.IVA',
  'refresh-customer': 'Aggiornamento scheda cliente',
  'download-ddt-pdf': 'Download DDT',
  'download-invoice-pdf': 'Download fattura',
};

const STATUS_ICON: Record<string, string> = {
  queued: '⏳',
  active: '⚙',
  completed: '✓',
  failed: '⚠',
  cancelled: '✕',
};

const DRAWER_BASE: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  background: '#fff',
  borderRadius: '16px 16px 0 0',
  boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
  zIndex: 1150,
  maxHeight: '65vh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div style={{ width: '100%', height: '3px', background: '#e5e7eb', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${progress}%`, background: '#2563eb', borderRadius: '2px', transition: 'width 0.3s ease' }} />
    </div>
  );
}

function SectionHeader({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 20px 6px', borderTop: '1px solid #f3f4f6' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '11px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
    </div>
  );
}

export function QueueDrawer({ isOpen, userOperations, bgOperations, onClose, onCancel, onNavigate }: QueueDrawerProps) {
  if (!isOpen) return null;

  const hasUserOps = userOperations.length > 0;
  const hasBgOps = bgOperations.length > 0;

  return (
    <div style={DRAWER_BASE} role="dialog" aria-label="Coda di lavoro">
      {/* Handle pill */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '10px', paddingBottom: '2px' }}>
        <div style={{ width: '36px', height: '4px', background: '#d1d5db', borderRadius: '2px' }} />
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 8px', borderBottom: '1px solid #f3f4f6' }}>
        <span style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>Operazioni</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#6b7280' }} aria-label="Chiudi">▼</button>
      </div>

      {/* Content */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {/* Sezione utente */}
        {hasUserOps && (
          <>
            <SectionHeader color="#3182ce" label="Richieste da te" />
            {userOperations.map(op => (
              <div
                key={op.jobId}
                onClick={() => op.navigateTo && onNavigate(op.navigateTo)}
                style={{ display: 'flex', alignItems: 'flex-start', padding: '10px 20px', borderBottom: '1px solid #f9fafb', cursor: op.navigateTo ? 'pointer' : 'default', gap: '10px' }}
              >
                <span style={{ fontSize: '15px', flexShrink: 0, marginTop: '1px' }}>{STATUS_ICON[op.status] ?? '•'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {op.customerName}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {USER_OP_LABELS[op.operationType ?? ''] ?? op.label}
                  </div>
                  {op.status === 'active' && <ProgressBar progress={op.progress} />}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {op.status === 'active' && (
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb' }}>{op.progress}%</span>
                  )}
                  {op.status === 'queued' && (
                    <button
                      aria-label="Annulla operazione"
                      onClick={(e) => { e.stopPropagation(); void onCancel(op.jobId); }}
                      style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}
                    >
                      Annulla
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Sezione automatiche */}
        {hasBgOps && (
          <>
            <SectionHeader color="#48bb78" label="Automatiche" />
            {bgOperations.map(op => (
              <div key={op.jobId} style={{ display: 'flex', alignItems: 'center', padding: '9px 20px', borderBottom: '1px solid #f9fafb', gap: '10px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#48bb78', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '12px', color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                    {BG_SYNC_LABELS[op.operationType ?? ''] ?? op.label}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0 }}>
                  {op.status === 'active' ? `${op.progress}%` : op.status === 'completed' ? '✓' : 'in coda'}
                </span>
              </div>
            ))}
          </>
        )}

        {!hasUserOps && !hasBgOps && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
            Nessuna operazione in corso
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verifica che i test passino**

```bash
cd archibald-web-app/frontend && npx vitest run src/components/QueueDrawer.spec.tsx 2>&1 | tail -8
```

Expected: PASS.

- [ ] **Step 5: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/QueueDrawer.tsx \
        archibald-web-app/frontend/src/components/QueueDrawer.spec.tsx
git commit -m "feat(banner): QueueDrawer riscritto — due sezioni (utente/automatiche), cancel button, navigate-to"
```

---

## Task 4 — Riscrivi `GlobalOperationBanner` con due fasce

**Files:**
- Modify: `archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx`

- [ ] **Step 1: Leggi il file attuale**

Leggi `archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx` per capire l'intera struttura prima di modificare. Nota in particolare:
- Come viene calcolato `bannerVisible`
- Come viene gestito `isExpanded`/`QueueDrawer`
- Come viene aggiunto il padding al `.app-main`

- [ ] **Step 2: Sostituisci il contenuto di `GlobalOperationBanner.tsx`**

```typescript
import type { CSSProperties } from "react";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  useOperationTracking,
  type TrackedOperation,
} from "../contexts/OperationTrackingContext";
import { useDownloadQueue } from "../contexts/DownloadQueueContext";
import { QueueDrawer } from './QueueDrawer';

const BANNER_HEIGHT_CSS = 'calc(60px + env(safe-area-inset-bottom, 0px))';

const ANIMATION_STYLES = `
@keyframes gob-slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes gob-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes gob-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes gob-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
`;

const APP_MAIN_SPACER = `.app-main { padding-bottom: 60px !important; }`;

const WRAP_STYLE: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 1100,
  boxShadow: "0 -3px 16px rgba(0,0,0,0.3)",
  animation: "gob-slide-up 0.3s ease-out",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const USER_STRIPE_ACTIVE: CSSProperties = {
  background: "linear-gradient(135deg, #0984e3, #6c5ce7)",
  padding: "10px 16px",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  cursor: "pointer",
  color: "#fff",
  fontSize: "13px",
};

const USER_STRIPE_COMPLETED: CSSProperties = {
  ...USER_STRIPE_ACTIVE,
  background: "#d1fae5",
  color: "#065f46",
};

const USER_STRIPE_FAILED: CSSProperties = {
  ...USER_STRIPE_ACTIVE,
  background: "#fee2e2",
  color: "#991b1b",
};

const BG_STRIPE: CSSProperties = {
  background: "#1e272e",
  padding: "5px 16px",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  cursor: "pointer",
  borderTop: "1px solid rgba(0,0,0,0.3)",
};

const SPINNER: CSSProperties = {
  display: "inline-block",
  width: "14px",
  height: "14px",
  border: "2px solid rgba(255,255,255,0.3)",
  borderTopColor: "#fff",
  borderRadius: "50%",
  animation: "gob-spin 0.8s linear infinite",
  flexShrink: 0,
};

const PROGRESS_TRACK: CSSProperties = {
  width: "160px",
  flexShrink: 0,
  height: "10px",
  background: "rgba(255,255,255,0.2)",
  borderRadius: "5px",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.25)",
};

const progressFill = (progress: number): CSSProperties => ({
  height: "100%",
  width: `${progress}%`,
  borderRadius: "3px",
  background: "linear-gradient(90deg, rgba(255,255,255,0.8), rgba(255,255,255,1))",
  backgroundSize: "200% 100%",
  animation: progress < 100 ? "gob-shimmer 1.5s linear infinite" : "none",
  transition: "width 0.3s ease",
});

const LABEL_STYLE: CSSProperties = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const CHEVRON: CSSProperties = { fontSize: "16px", opacity: 0.7, flexShrink: 0 };

const QUEUE_BADGE: CSSProperties = {
  background: "rgba(255,255,255,0.22)",
  border: "1px solid rgba(255,255,255,0.35)",
  padding: "2px 9px",
  borderRadius: "12px",
  fontSize: "11px",
  fontWeight: 700,
  flexShrink: 0,
};

function UserStripe({
  op,
  queueCount,
  isExpanded,
  onClick,
  onDismiss,
}: {
  op: TrackedOperation;
  queueCount: number;
  isExpanded: boolean;
  onClick: () => void;
  onDismiss: (jobId: string) => void;
}) {
  if (op.status === "failed") {
    return (
      <div style={USER_STRIPE_FAILED} onClick={onClick}>
        <span style={{ flexShrink: 0 }}>✕</span>
        <span style={LABEL_STYLE}>{op.customerName} — Errore: {op.error}</span>
        <button
          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "16px", padding: "2px 6px", flexShrink: 0 }}
          onClick={(e) => { e.stopPropagation(); onDismiss(op.jobId); }}
          aria-label="Chiudi"
        >✕</button>
      </div>
    );
  }

  if (op.status === "completed") {
    return (
      <div style={USER_STRIPE_COMPLETED} onClick={onClick}>
        <span style={{ flexShrink: 0 }}>✓</span>
        <span style={LABEL_STYLE}>{op.customerName} — {op.completedLabel ?? op.label}</span>
        <span style={{ ...CHEVRON, color: "#065f46" }}>{isExpanded ? "▲" : "▸"}</span>
      </div>
    );
  }

  return (
    <div style={USER_STRIPE_ACTIVE} onClick={onClick}>
      {op.status === "active"
        ? <span style={SPINNER} />
        : <span style={{ fontSize: "14px", flexShrink: 0 }}>⏳</span>
      }
      <span style={LABEL_STYLE}>{op.customerName} — {op.label}</span>
      {op.status === "active" && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <div style={PROGRESS_TRACK}><div style={progressFill(op.progress)} /></div>
          <span style={{ fontSize: "12px", fontWeight: 700, minWidth: "36px", textAlign: "right", opacity: 0.95 }}>{op.progress}%</span>
        </div>
      )}
      {queueCount > 0 && <span style={QUEUE_BADGE}>+{queueCount} in coda</span>}
      <span style={{ ...CHEVRON, opacity: 1 }}>{isExpanded ? "▲" : "▸"}</span>
    </div>
  );
}

function BgStripe({ bgOps, isExpanded, onClick }: { bgOps: TrackedOperation[]; isExpanded: boolean; onClick: () => void }) {
  const label = bgOps.map(op => op.label || op.operationType || 'sync').join(', ');
  return (
    <div style={BG_STRIPE} onClick={onClick}>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#a3e635", flexShrink: 0, animation: "gob-pulse 2s ease-in-out infinite" }} />
      <span style={{ flex: 1, fontSize: "11px", color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>{isExpanded ? "▲" : "›"}</span>
    </div>
  );
}

function GlobalOperationBanner() {
  const { userOperations, backgroundOperations, dismissOperation, cancelOperation } = useOperationTracking();
  const { pendingCount } = useDownloadQueue();
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  const bannerVisible = userOperations.length > 0 || backgroundOperations.length > 0 || pendingCount > 0;

  useEffect(() => {
    if (bannerVisible) {
      document.documentElement.style.setProperty('--banner-height', BANNER_HEIGHT_CSS);
    } else {
      document.documentElement.style.removeProperty('--banner-height');
    }
    return () => { document.documentElement.style.removeProperty('--banner-height'); };
  }, [bannerVisible]);

  useEffect(() => {
    if (!bannerVisible) setIsExpanded(false);
  }, [bannerVisible]);

  const handleToggle = useCallback(() => setIsExpanded(prev => !prev), []);

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
    setIsExpanded(false);
  }, [navigate]);

  if (!bannerVisible) return null;

  // Operazione primaria da mostrare nella fascia blu (active > queued > completed > failed)
  const primaryUserOp = userOperations.find(o => o.status === "active")
    ?? userOperations.find(o => o.status === "queued")
    ?? userOperations[0];

  const otherUserOpsCount = primaryUserOp
    ? userOperations.filter(o => o.jobId !== primaryUserOp.jobId && (o.status === "queued" || o.status === "active")).length + pendingCount
    : pendingCount;

  return (
    <>
      <style>{ANIMATION_STYLES}</style>
      <style>{APP_MAIN_SPACER}</style>

      {isExpanded && (
        <QueueDrawer
          isOpen={isExpanded}
          userOperations={userOperations}
          bgOperations={backgroundOperations}
          onClose={() => setIsExpanded(false)}
          onCancel={cancelOperation}
          onNavigate={handleNavigate}
        />
      )}

      <div style={WRAP_STYLE} data-testid="global-operation-banner">
        {/* Fascia utente — solo se ci sono op utente o download pendenti */}
        {(primaryUserOp || pendingCount > 0) && (
          primaryUserOp
            ? <UserStripe op={primaryUserOp} queueCount={otherUserOpsCount} isExpanded={isExpanded} onClick={handleToggle} onDismiss={dismissOperation} />
            : (
              <div style={USER_STRIPE_ACTIVE} onClick={handleToggle}>
                <span style={SPINNER} />
                <span style={LABEL_STYLE}>Preparazione download...</span>
                <span style={QUEUE_BADGE}>{pendingCount} in coda</span>
              </div>
            )
        )}

        {/* Fascia background sync — solo se ci sono sync attivi */}
        {backgroundOperations.length > 0 && (
          <BgStripe bgOps={backgroundOperations} isExpanded={isExpanded} onClick={handleToggle} />
        )}
      </div>
    </>
  );
}

export { GlobalOperationBanner };
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`. Se ci sono errori di tipo relativi a `useNavigate` (già disponibile nel progetto), verificare che `react-router-dom` sia importato correttamente.

- [ ] **Step 4: Test suite completa frontend**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: nessun test rotto (i test esistenti di GlobalOperationBanner potrebbero necessitare di piccoli aggiornamenti se dipendono dal markup HTML specifico — aggiornali per rispecchiare la nuova struttura a due fasce).

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx
git commit -m "feat(banner): due fasce (utente blu + sync scura) — usa userOperations/backgroundOperations dal context"
```

---

## Task 5 — Verifica visiva nel browser e fix

**Files:**
- Tutti i file modificati nei task precedenti (fix puntuali se necessari)

- [ ] **Step 1: Avvia il dev server**

```bash
npm run dev --prefix archibald-web-app/frontend 2>&1 | head -5
```

- [ ] **Step 2: Verifica stati del banner**

Con il browser aperto sulla PWA locale:

1. **Solo sync in background** — triggera manualmente `sync-customers` dall'admin → deve apparire solo la striscia scura sottile, nessuna fascia blu
2. **Operazione utente attiva** — avvia un submit-order → fascia blu con spinner + progress + il nome del cliente visibile
3. **Entrambi attivi** — fascia blu sopra, striscia scura sotto, separatore visibile
4. **Drawer** — tap sul banner → apre drawer con sezione "Richieste da te" (blu) e "Automatiche" (verde) se entrambi presenti
5. **Cancel** — operazione in coda → bottone "Annulla" visibile, tap lo rimuove dalla lista
6. **Navigate** — tap su un'operazione utente nel drawer → naviga alla pagina corretta e chiude il drawer
7. **Secondo dispositivo** — apri la PWA su un altro dispositivo (o altra tab) con un'operazione in corso → dopo il refresh il banner appare (recovery funzionante grazie al fix `insertActiveJob`)

- [ ] **Step 3: Commit fix eventuali**

Se emergono fix puntuali dalla verifica visiva (spaziature, colori, overflow del testo):

```bash
git add archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx \
        archibald-web-app/frontend/src/components/QueueDrawer.tsx
git commit -m "fix(banner): aggiustamenti visivi post-verifica browser"
```

---

## Checklist spec coverage

| Requisito spec | Task che lo implementa |
|----------------|------------------------|
| Fascia blu per op utente | Task 4 — `UserStripe` component |
| Striscia scura per sync bg | Task 4 — `BgStripe` component |
| Banner scompare se tutto vuoto | Task 4 — `if (!bannerVisible) return null` |
| `isBackground` su TrackedOperation | Task 1 |
| `BACKGROUND_OP_TYPES` costante | Task 1 |
| `userOperations` / `backgroundOperations` nel context | Task 1 |
| `cancelOperation` nel context | Task 2 |
| `cancelTaskApi` API | Task 2 |
| Drawer due sezioni | Task 3 |
| Cancel button solo per enqueued | Task 3 |
| Navigate-to al tocco item utente | Task 3 |
| Sezione Automatiche omessa se vuota | Task 3 |
| Test classificazione | Task 1 spec |
| Test cancel success/failure | Task 2 spec |
| Test drawer cancel visibilità | Task 3 spec |
