# Customer Create Banner Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere la modale di creazione cliente dismissibile durante il processing bot e integrare l'operazione nel GlobalOperationBanner con riapertura via click.

**Architecture:** Un nuovo `CustomerCreationContext` vive in AppRouter e gestisce visibilità modale + activeTaskId. `CustomerCreateModal` diventa un singleton globale sempre montato (mai smontato — garantisce che `waitForJobViaWebSocket` continui anche a modale nascosta). `OperationTrackingContext` riceve `onBannerClick` e `completedLabel` opzionali per supportare operazioni non-ordine.

**Tech Stack:** React 19, TypeScript strict, Vitest + Testing Library, inline styles, WebSocket context esistente.

**Spec:** `docs/superpowers/specs/2026-04-01-customer-create-banner-integration.md`

---

## File Map

| File | Azione |
|------|--------|
| `frontend/src/contexts/CustomerCreationContext.tsx` | CREA — context + provider + hook |
| `frontend/src/contexts/CustomerCreationContext.spec.tsx` | CREA — unit test context |
| `frontend/src/contexts/OperationTrackingContext.tsx` | MODIFICA — aggiunge `onBannerClick`, `completedLabel` a `TrackedOperation` |
| `frontend/src/contexts/OperationTrackingContext.spec.tsx` | MODIFICA — aggiunge test `completedLabel` + `onBannerClick` preservati |
| `frontend/src/components/GlobalOperationBanner.tsx` | MODIFICA — click per-operazione usa `onBannerClick` se definito |
| `frontend/src/components/GlobalOperationBanner.spec.tsx` | MODIFICA — aggiunge test per `onBannerClick` |
| `frontend/src/components/CustomerCreateModal.tsx` | MODIFICA — rimuove props, legge context, singleton sempre montato |
| `frontend/src/components/CustomerCreateModal.spec.tsx` | MODIFICA — aggiorna mock e test close behavior |
| `frontend/src/AppRouter.tsx` | MODIFICA — aggiunge `CustomerCreationProvider` + `<CustomerCreateModal />` singleton |
| `frontend/src/pages/CustomerList.tsx` | MODIFICA — rimuove useState modale, usa `openModal` da context |
| `frontend/src/components/OrderFormSimple.tsx` | MODIFICA — rimuove useState modale, usa `openModal` da context |

---

## Task 1: Estendi OperationTrackingContext con onBannerClick e completedLabel

**Files:**
- Modify: `frontend/src/contexts/OperationTrackingContext.tsx`
- Modify: `frontend/src/contexts/OperationTrackingContext.spec.tsx`

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi questi due test in fondo a `describe("OperationTrackingContext", ...)` in `OperationTrackingContext.spec.tsx`:

```typescript
test("trackOperation preserva onBannerClick in activeOperations", async () => {
  const { result } = renderHook(() => useOperationTracking(), {
    wrapper: Wrapper,
  });

  await act(async () => {
    await vi.runAllTimersAsync();
  });

  const onBannerClick = vi.fn();

  act(() => {
    result.current.trackOperation("order-1", "job-1", "Mario Rossi", "In coda...", {
      onBannerClick,
    });
  });

  expect(result.current.activeOperations[0].onBannerClick).toBe(onBannerClick);
});

test("JOB_COMPLETED usa completedLabel personalizzato se presente", async () => {
  const { result } = renderHook(() => useOperationTracking(), {
    wrapper: Wrapper,
  });

  await act(async () => {
    await vi.runAllTimersAsync();
  });

  act(() => {
    result.current.trackOperation("order-1", "job-1", "Mario Rossi", "In coda...", {
      completedLabel: "Cliente creato",
    });
  });

  act(() => {
    emitWsEvent("JOB_COMPLETED", { jobId: "job-1" });
  });

  expect(result.current.activeOperations[0]).toEqual(
    expect.objectContaining({
      status: "completed",
      progress: 100,
      label: "Cliente creato",
    }),
  );
});
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --run OperationTrackingContext
```

Atteso: FAIL — `trackOperation` non accetta 5° parametro, `activeOperations[0].onBannerClick` è undefined.

- [ ] **Step 3: Aggiorna il tipo TrackedOperation**

In `OperationTrackingContext.tsx`, modifica il tipo (linee 14-24):

```typescript
type TrackedOperation = {
  orderId: string;
  jobId: string;
  customerName: string;
  status: "queued" | "active" | "completed" | "failed";
  progress: number;
  label: string;
  error?: string;
  startedAt: number;
  dismissedAt?: number;
  onBannerClick?: () => void;
  completedLabel?: string;
};
```

- [ ] **Step 4: Aggiorna il tipo OperationTrackingValue**

In `OperationTrackingContext.tsx`, modifica la firma di `trackOperation` nel tipo (linee 26-30):

```typescript
type OperationTrackingValue = {
  activeOperations: TrackedOperation[];
  trackOperation: (
    orderId: string,
    jobId: string,
    displayName: string,
    initialLabel?: string,
    opts?: { onBannerClick?: () => void; completedLabel?: string },
  ) => void;
  dismissOperation: (orderId: string) => void;
};
```

- [ ] **Step 5: Aggiorna l'implementazione di trackOperation**

Sostituisci l'implementazione di `trackOperation` (linee 225-252):

```typescript
const trackOperation = useCallback(
  (
    orderId: string,
    jobId: string,
    displayName: string,
    initialLabel?: string,
    opts?: { onBannerClick?: () => void; completedLabel?: string },
  ) => {
    const label = initialLabel || "In coda...";
    setOperations((prev) => {
      const existing = prev.find((op) => op.orderId === orderId);
      if (existing) {
        return prev.map((op) =>
          op.orderId === orderId
            ? {
                ...op,
                jobId,
                customerName: displayName,
                status: "queued" as const,
                progress: 0,
                label,
                onBannerClick: opts?.onBannerClick,
                completedLabel: opts?.completedLabel,
              }
            : op,
        );
      }
      return [
        ...prev,
        {
          orderId,
          jobId,
          customerName: displayName,
          status: "queued" as const,
          progress: 0,
          label,
          startedAt: Date.now(),
          onBannerClick: opts?.onBannerClick,
          completedLabel: opts?.completedLabel,
        },
      ];
    });
  },
  [],
);
```

- [ ] **Step 6: Aggiorna il JOB_COMPLETED handler per usare completedLabel**

Sostituisci il blocco `subscribe("JOB_COMPLETED", ...)` (linee 165-191):

```typescript
unsubs.push(
  subscribe("JOB_COMPLETED", (payload: unknown) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const jobId = p.jobId as string | undefined;
    if (!jobId) return;

    setOperations((prev) => {
      const op = prev.find((o) => o.jobId === jobId);
      const completedLabel = op?.completedLabel ?? "Ordine completato";
      return prev.map((o) =>
        o.jobId === jobId
          ? {
              ...o,
              status: "completed" as const,
              progress: 100,
              label: completedLabel,
            }
          : o,
      );
    });

    setOperations((prev) => {
      const op = prev.find((o) => o.jobId === jobId);
      if (op) scheduleDismiss(op.orderId);
      return prev;
    });
  }),
);
```

- [ ] **Step 7: Verifica che i test passino**

```bash
npm test --prefix archibald-web-app/frontend -- --run OperationTrackingContext
```

Atteso: tutti i test PASS (inclusi i due nuovi).

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx \
        archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.tsx
git commit -m "feat(OperationTrackingContext): aggiunge onBannerClick e completedLabel a TrackedOperation"
```

---

## Task 2: Aggiorna GlobalOperationBanner per click per-operazione

**Files:**
- Modify: `frontend/src/components/GlobalOperationBanner.tsx`
- Modify: `frontend/src/components/GlobalOperationBanner.spec.tsx`

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi questo test in `describe("GlobalOperationBanner", ...)` in `GlobalOperationBanner.spec.tsx`, dopo il test esistente `"clicking banner navigates to /pending-orders"`:

```typescript
test("clicking banner chiama onBannerClick invece di navigate se definito", () => {
  const onBannerClick = vi.fn();
  mockContextValue.activeOperations = [makeOperation({ onBannerClick })];

  const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
  fireEvent.click(getByTestId("global-operation-banner"));

  expect(onBannerClick).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalled();
});
```

Nota: il tipo `TrackedOperation` nel `makeOperation` helper ora include `onBannerClick?: () => void`. Il test compila già perché il campo è opzionale.

- [ ] **Step 2: Verifica che il test fallisca**

```bash
npm test --prefix archibald-web-app/frontend -- --run GlobalOperationBanner
```

Atteso: FAIL — il banner naviga sempre, non chiama `onBannerClick`.

- [ ] **Step 3: Aggiorna la funzione GlobalOperationBanner**

In `GlobalOperationBanner.tsx`, sostituisci `handleClick` e le singole sezioni del banner per operazione singola:

Prima (linee 141-143):
```typescript
const handleClick = () => {
  navigate("/pending-orders");
};
```

Dopo — rimuovi `handleClick` e usa una funzione locale per-operazione:
```typescript
const handleOperationClick = (op: TrackedOperation) => {
  if (op.onBannerClick) {
    op.onBannerClick();
  } else {
    navigate("/pending-orders");
  }
};
```

Poi aggiorna tutti e tre i branch della singola operazione (stato `failed`, `completed`, `active/queued`). Cerca ogni `onClick={handleClick}` nella sezione `activeOperations.length === 1` e sostituisci con `onClick={() => handleOperationClick(op)}`:

```tsx
// Branch failed (linea ~150)
<div
  style={failedBannerStyle}
  onClick={() => handleOperationClick(op)}
  data-testid="global-operation-banner"
>

// Branch completed (linea ~178)
<div
  style={completedBannerStyle}
  onClick={() => handleOperationClick(op)}
  data-testid="global-operation-banner"
>

// Branch active (linea ~196)
<div
  style={activeBannerStyle}
  onClick={() => handleOperationClick(op)}
  data-testid="global-operation-banner"
>
```

Il banner multi-operazione (`activeOperations.length > 1`) mantiene `onClick={handleClick}` invariato (naviga a `/pending-orders`).

- [ ] **Step 4: Verifica che tutti i test passino**

```bash
npm test --prefix archibald-web-app/frontend -- --run GlobalOperationBanner
```

Atteso: tutti i test PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx \
        archibald-web-app/frontend/src/components/GlobalOperationBanner.spec.tsx
git commit -m "feat(GlobalOperationBanner): click per-operazione con onBannerClick override"
```

---

## Task 3: Crea CustomerCreationContext

**Files:**
- Create: `frontend/src/contexts/CustomerCreationContext.tsx`
- Create: `frontend/src/contexts/CustomerCreationContext.spec.tsx`

- [ ] **Step 1: Scrivi il file di test**

Crea `frontend/src/contexts/CustomerCreationContext.spec.tsx`:

```typescript
import { describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  CustomerCreationProvider,
  useCustomerCreation,
} from "./CustomerCreationContext";

function Wrapper({ children }: { children: ReactNode }) {
  return <CustomerCreationProvider>{children}</CustomerCreationProvider>;
}

describe("CustomerCreationContext", () => {
  test("stato iniziale: modale chiusa, nessun activeTaskId", () => {
    const { result } = renderHook(() => useCustomerCreation(), {
      wrapper: Wrapper,
    });

    expect(result.current.isModalOpen).toBe(false);
    expect(result.current.activeTaskId).toBeNull();
    expect(result.current.modalConfig).toEqual({
      contextMode: "standalone",
      prefillName: undefined,
    });
  });

  test("openModal imposta isModalOpen=true con config default standalone", () => {
    const { result } = renderHook(() => useCustomerCreation(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.openModal();
    });

    expect(result.current.isModalOpen).toBe(true);
    expect(result.current.modalConfig.contextMode).toBe("standalone");
    expect(result.current.modalConfig.prefillName).toBeUndefined();
  });

  test("openModal imposta contextMode e prefillName forniti", () => {
    const { result } = renderHook(() => useCustomerCreation(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.openModal({ contextMode: "order", prefillName: "Acme Srl" });
    });

    expect(result.current.isModalOpen).toBe(true);
    expect(result.current.modalConfig).toEqual({
      contextMode: "order",
      prefillName: "Acme Srl",
    });
  });

  test("closeModal imposta isModalOpen=false senza azzerare activeTaskId", () => {
    const { result } = renderHook(() => useCustomerCreation(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.openModal();
      result.current.setActiveTaskId("task-abc");
    });

    act(() => {
      result.current.closeModal();
    });

    expect(result.current.isModalOpen).toBe(false);
    expect(result.current.activeTaskId).toBe("task-abc");
  });

  test("setActiveTaskId aggiorna activeTaskId", () => {
    const { result } = renderHook(() => useCustomerCreation(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.setActiveTaskId("task-xyz");
    });

    expect(result.current.activeTaskId).toBe("task-xyz");
  });

  test("notifyCreated chiama onCreated callback, azzera activeTaskId e chiude modale", () => {
    const { result } = renderHook(() => useCustomerCreation(), {
      wrapper: Wrapper,
    });

    const onCreated = vi.fn();

    act(() => {
      result.current.openModal({}, onCreated);
      result.current.setActiveTaskId("task-xyz");
    });

    act(() => {
      result.current.notifyCreated();
    });

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(result.current.activeTaskId).toBeNull();
    expect(result.current.isModalOpen).toBe(false);
  });

  test("notifyCreated non crasha se nessun onCreated registrato", () => {
    const { result } = renderHook(() => useCustomerCreation(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.openModal();
    });

    expect(() => {
      act(() => {
        result.current.notifyCreated();
      });
    }).not.toThrow();
  });

  test("useCustomerCreation lancia se usato fuori dal provider", () => {
    expect(() => {
      renderHook(() => useCustomerCreation());
    }).toThrow("useCustomerCreation must be used within CustomerCreationProvider");
  });
});
```

- [ ] **Step 2: Verifica che il test fallisca per modulo non trovato**

```bash
npm test --prefix archibald-web-app/frontend -- --run CustomerCreationContext
```

Atteso: FAIL — modulo `CustomerCreationContext` non esiste.

- [ ] **Step 3: Crea il context**

Crea `frontend/src/contexts/CustomerCreationContext.tsx`:

```typescript
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

type ModalConfig = {
  contextMode: "standalone" | "order";
  prefillName?: string;
};

type CustomerCreationContextValue = {
  isModalOpen: boolean;
  modalConfig: ModalConfig;
  activeTaskId: string | null;
  openModal: (config?: Partial<ModalConfig>, onCreated?: () => void) => void;
  closeModal: () => void;
  setActiveTaskId: (id: string | null) => void;
  notifyCreated: () => void;
};

const DEFAULT_CONFIG: ModalConfig = { contextMode: "standalone", prefillName: undefined };

const CustomerCreationContext = createContext<CustomerCreationContextValue | null>(null);

function CustomerCreationProvider({ children }: { children: ReactNode }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<ModalConfig>(DEFAULT_CONFIG);
  const [activeTaskId, setActiveTaskIdState] = useState<string | null>(null);
  const onCreatedRef = useRef<(() => void) | null>(null);

  const openModal = useCallback((config?: Partial<ModalConfig>, onCreated?: () => void) => {
    setModalConfig({ ...DEFAULT_CONFIG, ...config });
    onCreatedRef.current = onCreated ?? null;
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const setActiveTaskId = useCallback((id: string | null) => {
    setActiveTaskIdState(id);
  }, []);

  const notifyCreated = useCallback(() => {
    onCreatedRef.current?.();
    onCreatedRef.current = null;
    setActiveTaskIdState(null);
    setIsModalOpen(false);
  }, []);

  const value: CustomerCreationContextValue = {
    isModalOpen,
    modalConfig,
    activeTaskId,
    openModal,
    closeModal,
    setActiveTaskId,
    notifyCreated,
  };

  return (
    <CustomerCreationContext.Provider value={value}>
      {children}
    </CustomerCreationContext.Provider>
  );
}

function useCustomerCreation(): CustomerCreationContextValue {
  const ctx = useContext(CustomerCreationContext);
  if (!ctx) {
    throw new Error("useCustomerCreation must be used within CustomerCreationProvider");
  }
  return ctx;
}

export { CustomerCreationProvider, useCustomerCreation, type ModalConfig };
```

- [ ] **Step 4: Verifica che i test passino**

```bash
npm test --prefix archibald-web-app/frontend -- --run CustomerCreationContext
```

Atteso: tutti i test PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/contexts/CustomerCreationContext.tsx \
        archibald-web-app/frontend/src/contexts/CustomerCreationContext.spec.tsx
git commit -m "feat(CustomerCreationContext): nuovo context per gestione globale modale creazione cliente"
```

---

## Task 4: Refactor CustomerCreateModal — rimuovi props, leggi context

**Files:**
- Modify: `frontend/src/components/CustomerCreateModal.tsx`
- Modify: `frontend/src/components/CustomerCreateModal.spec.tsx`

Questo è il task più lungo. Il modal diventa un singleton senza props.

### Sottotask 4a: Aggiorna prop interface e integra context

- [ ] **Step 1: Aggiorna spec per riflettere nuova interfaccia**

In `CustomerCreateModal.spec.tsx`, i render attuali passano `isOpen`, `onClose`, `onSaved` come props. Dobbiamo wrappare ogni render con il `CustomerCreationProvider` e usare `openModal` per aprire la modale invece di passare `isOpen={true}`.

Aggiungi i mock necessari in cima al file spec (cerca la sezione `vi.mock`):

```typescript
import { CustomerCreationProvider, useCustomerCreation } from '../contexts/CustomerCreationContext';
import { OperationTrackingProvider } from '../contexts/OperationTrackingContext';

// Wrapper completo per i test
function TestWrapper({ children, autoOpen = true }: { children: ReactNode; autoOpen?: boolean }) {
  return (
    <OperationTrackingProvider>
      <CustomerCreationProvider>
        {autoOpen && <AutoOpener />}
        {children}
      </CustomerCreationProvider>
    </OperationTrackingProvider>
  );
}

function AutoOpener() {
  const { openModal } = useCustomerCreation();
  useEffect(() => { openModal(); }, [openModal]);
  return null;
}
```

Sostituisci ogni `render(<CustomerCreateModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />)` con:
```typescript
render(<CustomerCreateModal />, { wrapper: TestWrapper });
```

- [ ] **Step 2: Rimuovi l'interfaccia props e aggiungi gli import del context**

Nel file `CustomerCreateModal.tsx`, rimuovi l'intera `interface CustomerCreateModalProps` (linee 45-51) e la firma della funzione con props (linee 88-94).

Aggiungi in cima agli import:
```typescript
import { useCustomerCreation } from "../contexts/CustomerCreationContext";
import { useOperationTracking } from "../contexts/OperationTrackingContext";
```

Sostituisci la firma della funzione:
```typescript
// PRIMA
export function CustomerCreateModal({
  isOpen,
  onClose,
  onSaved,
  contextMode = "standalone",
  prefillName,
}: CustomerCreateModalProps) {

// DOPO
export function CustomerCreateModal() {
```

Aggiungi all'inizio del corpo della funzione (dopo la riga `export function CustomerCreateModal() {`):
```typescript
const {
  isModalOpen,
  modalConfig,
  activeTaskId: contextActiveTaskId,
  closeModal,
  setActiveTaskId: setContextActiveTaskId,
  notifyCreated,
} = useCustomerCreation();
const { trackOperation } = useOperationTracking();

const isOpen = isModalOpen;
const contextMode = modalConfig.contextMode;
const prefillName = modalConfig.prefillName;
const onClose = closeModal;
const onSaved = notifyCreated;
```

Questa tecnica di alias (`isOpen = isModalOpen`, `onClose = closeModal`, ecc.) evita di rinominare ogni utilizzo nel corpo del componente nelle prime iterazioni — il codice interno continua a funzionare con i nomi familiari.

- [ ] **Step 3: Sposta il `return null` dopo tutti gli hook**

Rimuovi l'early return a linea 287 (`if (!isOpen) return null;`).

Nel JSX del `return (` finale (linea 524), avvolgi tutto il contenuto con un controllo:

```typescript
// Prima del return JSX, aggiungi questa riga
// (non prima degli hook — gli hook devono girare sempre)
if (!isModalOpen) return null;

return (
  <div style={{ position: "fixed", ... }}>
    ...
  </div>
);
```

**Importante**: questa riga `if (!isModalOpen) return null;` va posizionata DOPO tutti gli useState/useEffect e DOPO la riga `if (!isOpen) return null` rimossa, cioè subito prima del `return (`.

- [ ] **Step 4: Aggiorna performSave per chiamare setContextActiveTaskId e trackOperation**

Nella funzione `performSave`, dopo l'assegnazione di `resultTaskId` e prima di `setTaskId(resultTaskId)`, aggiungi:

```typescript
if (resultTaskId) {
  setContextActiveTaskId(resultTaskId);
  trackOperation(
    resultTaskId,
    resultTaskId,
    formData.name || "Nuovo cliente",
    "Creazione cliente in corso...",
    {
      onBannerClick: closeModal.bind(null),   // sarà sostituito dopo da openModal
      completedLabel: "Cliente creato",
    },
  );
  setTaskId(resultTaskId);
  setProcessingState("processing");
  setProgress(5);
  setProgressLabel("Avvio operazione...");
} else {
  onSaved();
  onClose();
}
```

Nota: `onBannerClick` usa `closeModal` temporaneamente — sarà corretto nel Task 5 dopo aver accesso a `openModal` nel context.

- [ ] **Step 5: Aggiungi ESC e click-backdrop (comportamenti nuovi)**

Il modal attuale NON ha ESC né backdrop-click. Aggiungili ora.

**Backdrop click:** L'overlay esterno (linea ~524) non ha `onClick`. Aggiungi:
```tsx
<div
  style={{ position: "fixed", ... }}
  onClick={closeModal}   // ← AGGIUNGI
>
  <div
    style={{ backgroundColor: "#fff", ... }}
    onClick={(e) => e.stopPropagation()}   // ← AGGIUNGI — impedisce propagazione al backdrop
  >
```

**ESC handler:** Aggiungi un `useEffect` dopo gli altri effect, PRIMA del `return null`:
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    closeModal();
  };
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, [closeModal]);
```

Nota: `closeModal()` nasconde la modale senza cancellare il job quando `processingState === "processing"`. Quando `processingState === "idle"`, la modale si nasconde ma la sessione interattiva viene gestita dal `useEffect` di cleanup (step 6).

Tuttavia, il `useEffect` di cleanup (linea ~152, `} else { cancelInteractiveSession... }`) viene triggerato quando `isOpen` diventa false. Con la nuova logica, quando `isOpen` (`isModalOpen`) diventa false **durante il processing**, non dobbiamo cancellare la sessione interattiva. Aggiorna il branch `else`:

```typescript
// PRIMA (linea ~178)
} else {
  if (interactiveSessionIdRef.current) {
    customerService
      .cancelInteractiveSession(interactiveSessionIdRef.current)
      .catch(() => {});
  }
}

// DOPO
} else {
  // Cancella la sessione interattiva SOLO se non c'è un job attivo in corso
  if (interactiveSessionIdRef.current && !contextActiveTaskId) {
    customerService
      .cancelInteractiveSession(interactiveSessionIdRef.current)
      .catch(() => {});
  }
}
```

- [ ] **Step 6: Aggiorna il reset del wizard**

Il `useEffect` di reset (linea ~152) si triggera quando `isOpen` cambia. Attualmente resetta tutto quando `isOpen=true`. Aggiungi la condizione: resetta solo se non c'è un job attivo (`contextActiveTaskId === null`).

```typescript
useEffect(() => {
  if (isOpen && !contextActiveTaskId) {
    // reset wizard
    const initial = { ...INITIAL_FORM };
    if (prefillName) initial.name = prefillName;
    setFormData(initial);
    setCurrentStep({ kind: "vat" });
    // ... resto del reset invariato
  } else if (!isOpen && !contextActiveTaskId) {
    // cleanup sessione solo se non c'è job attivo
    if (interactiveSessionIdRef.current) {
      customerService
        .cancelInteractiveSession(interactiveSessionIdRef.current)
        .catch(() => {});
    }
  }
}, [isOpen, contextActiveTaskId, prefillName]); // eslint-disable-line react-hooks/exhaustive-deps
```

**Nota**: rimuovi il branch `else` separato ora che è inglobato qui.

- [ ] **Step 7: Verifica i test**

```bash
npm test --prefix archibald-web-app/frontend -- --run CustomerCreateModal
```

Risolvi eventuali errori di tipo o test falliti (principalmente relativi ai mock del context). Tutti i test esistenti devono passare con il nuovo wrapper `TestWrapper`.

- [ ] **Step 8: Verifica typecheck**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: 0 errori.

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx \
        archibald-web-app/frontend/src/components/CustomerCreateModal.spec.tsx
git commit -m "feat(CustomerCreateModal): rimuove props, legge CustomerCreationContext, singleton-ready"
```

---

## Task 5: Integra CustomerCreateModal in AppRouter come singleton

**Files:**
- Modify: `frontend/src/AppRouter.tsx`

- [ ] **Step 1: Aggiungi import**

In `AppRouter.tsx`, aggiungi gli import:

```typescript
import { CustomerCreationProvider } from "./contexts/CustomerCreationContext";
import { CustomerCreateModal } from "./components/CustomerCreateModal";
```

- [ ] **Step 2: Avvolgi OperationTrackingProvider con CustomerCreationProvider e aggiungi il singleton**

Sostituisci questo blocco (linee ~247-248):
```tsx
<OperationTrackingProvider>
  <GlobalOperationBanner />
```

Con:
```tsx
<OperationTrackingProvider>
  <CustomerCreationProvider>
    <CustomerCreateModal />
    <GlobalOperationBanner />
```

E chiudi `</CustomerCreationProvider>` prima di `</OperationTrackingProvider>`:
```tsx
    </Routes>
    </CustomerCreationProvider>
  </OperationTrackingProvider>
```

- [ ] **Step 3: Correggi onBannerClick in CustomerCreateModal**

Torna a `CustomerCreateModal.tsx`. Nel `performSave`, l'`onBannerClick` passato a `trackOperation` deve chiamare `openModal` (non `closeModal`). Aggiorna:

```typescript
const { openModal, closeModal, ... } = useCustomerCreation();

// In performSave, dopo setContextActiveTaskId:
trackOperation(
  resultTaskId,
  resultTaskId,
  formData.name || "Nuovo cliente",
  "Creazione cliente in corso...",
  {
    onBannerClick: openModal,
    completedLabel: "Cliente creato",
  },
);
```

`openModal` senza argomenti non resetta la config (il context tiene modalConfig invariato) e imposta `isModalOpen=true`. Perfetto per la riapertura.

- [ ] **Step 4: Verifica typecheck**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: 0 errori.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/AppRouter.tsx \
        archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "feat(AppRouter): CustomerCreateModal singleton globale + CustomerCreationProvider"
```

---

## Task 6: Aggiorna CustomerList

**Files:**
- Modify: `frontend/src/pages/CustomerList.tsx`

- [ ] **Step 1: Sostituisci useState locale con useCustomerCreation**

In `CustomerList.tsx`:

1. Rimuovi l'import di `CustomerCreateModal`:
   ```typescript
   // RIMUOVI: import { CustomerCreateModal } from '../components/CustomerCreateModal';
   ```

2. Aggiungi l'import del context:
   ```typescript
   import { useCustomerCreation } from '../contexts/CustomerCreationContext';
   ```

3. Rimuovi il `useState` locale (linea ~50):
   ```typescript
   // RIMUOVI: const [createModalOpen, setCreateModalOpen] = useState(false);
   ```

4. Aggiungi il destructuring del context (dopo gli altri hook):
   ```typescript
   const { openModal } = useCustomerCreation();
   ```

5. Trova il punto dove si chiama `setCreateModalOpen(true)` (linea 414, bottone "Nuovo cliente") e sostituisci con:
   ```typescript
   openModal({ contextMode: "standalone" }, () => { void fetchCustomers(); })
   ```

6. Rimuovi il blocco JSX `<CustomerCreateModal ... />` dalle linee 638-644:
   ```tsx
   // RIMUOVI questo blocco:
   <CustomerCreateModal
     isOpen={createModalOpen}
     onClose={() => setCreateModalOpen(false)}
     onSaved={() => {
       setCreateModalOpen(false);
       void fetchCustomers();
     }}
   />
   ```

- [ ] **Step 2: Verifica typecheck**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 3: Verifica test esistenti**

```bash
npm test --prefix archibald-web-app/frontend -- --run CustomerList
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerList.tsx
git commit -m "refactor(CustomerList): usa CustomerCreationContext invece di useState locale"
```

---

## Task 7: Aggiorna OrderFormSimple

**Files:**
- Modify: `frontend/src/components/OrderFormSimple.tsx`

- [ ] **Step 1: Sostituisci useState locale con useCustomerCreation**

In `OrderFormSimple.tsx`:

1. Rimuovi l'import di `CustomerCreateModal`:
   ```typescript
   // RIMUOVI: import { CustomerCreateModal } from './CustomerCreateModal';
   ```

2. Aggiungi l'import del context:
   ```typescript
   import { useCustomerCreation } from '../contexts/CustomerCreationContext';
   ```

3. Rimuovi le righe 110-111:
   ```typescript
   // RIMUOVI:
   const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
   const [createCustomerPrefill, setCreateCustomerPrefill] = useState("");
   ```

4. Aggiungi:
   ```typescript
   const { openModal } = useCustomerCreation();
   ```

5. Sostituisci le linee 2955-2956:
   ```typescript
   // PRIMA:
   setCreateCustomerPrefill(customerSearch);
   setCreateCustomerOpen(true);

   // DOPO:
   openModal(
     { contextMode: "order", prefillName: customerSearch },
     () => { handleCustomerSearch(customerSearch); },
   );
   ```

   `customerSearch` è lo stato locale che contiene il testo digitato dall'utente — viene catturato in closure al momento dell'apertura.

6. Rimuovi il blocco JSX `<CustomerCreateModal ... />` alle linee 6365-6376:
   ```tsx
   // RIMUOVI questo blocco:
   <CustomerCreateModal
     isOpen={createCustomerOpen}
     onClose={() => setCreateCustomerOpen(false)}
     onSaved={() => {
       setCreateCustomerOpen(false);
       if (createCustomerPrefill) {
         handleCustomerSearch(createCustomerPrefill);
       }
     }}
     contextMode="order"
     prefillName={createCustomerPrefill}
   />
   ```

- [ ] **Step 2: Verifica typecheck**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Risolvi tutti gli errori — `OrderFormSimple.tsx` è il file più grande (140KB); potrebbe avere più utilizzi da aggiornare.

- [ ] **Step 3: Verifica test**

```bash
npm test --prefix archibald-web-app/frontend -- --run OrderFormSimple
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "refactor(OrderFormSimple): usa CustomerCreationContext invece di useState locale"
```

---

## Task 8: Test completo e verifica finale

- [ ] **Step 1: Esegui tutti i test frontend**

```bash
npm test --prefix archibald-web-app/frontend -- --run
```

Atteso: tutti i test PASS, 0 failing.

- [ ] **Step 2: Typecheck finale**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: 0 errori.

- [ ] **Step 3: Verifica build backend (nessuna modifica backend, ma check per sicurezza)**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: build OK.

- [ ] **Step 4: Test manuale flusso completo**

Sul browser aperto su `http://localhost:5173` (o staging):

1. Vai su `/customers`
2. Clicca "Nuovo cliente"
3. Inserisci una P.IVA valida e premi "Verifica"
4. Compila i 6 step successivi e arriva al Riepilogo
5. Clicca "Crea cliente"
6. Mentre la modale mostra la progress bar, premi ESC
7. Verifica che il banner appaia in basso con il nome del cliente e progress%
8. Clicca il banner
9. Verifica che la modale riappaia con la progress bar aggiornata
10. Attendi il completamento: la modale si chiude automaticamente, il banner diventa verde con "Cliente creato"

- [ ] **Step 5: Commit finale**

```bash
git add -A
git commit -m "feat(customer-create): banner integration + modale dismissibile durante processing"
```

---

## Note implementative

**`contextActiveTaskId` nel useEffect di reset**: la dipendenza aggiuntiva `contextActiveTaskId` nel useEffect potrebbe causare un reset indesiderato quando `activeTaskId` passa da `null` a un valore dopo `performSave`. Solita soluzione: usare un ref per `contextActiveTaskId` e non aggiungerlo alle dipendenze (usa `// eslint-disable-line react-hooks/exhaustive-deps`).

**`openModal` come onBannerClick**: `openModal` senza argomenti usa la config corrente, che è quella dell'ultima apertura modale. Quando il job è in corso e l'utente clicca banner, `openModal()` apre la modale nella sua forma attuale (progress screen). Il wizard non si resetta perché `contextActiveTaskId !== null`.

**Multi-operazioni**: se l'utente invia un ordine E sta creando un cliente contemporaneamente, il banner mostrerà il summary "N operazioni" e il click navigherà a `/pending-orders`. Il click sul banner di creazione cliente (come operazione singola) chiama `openModal`. Questo è il comportamento corretto.
