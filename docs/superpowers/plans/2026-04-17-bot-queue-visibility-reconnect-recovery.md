# Bot Queue Visibility & Reconnect Recovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Il GlobalOperationBanner mostra l'operazione attiva come card principale con progress bar e badge "+N in coda" per le operazioni in attesa; (B) Al reconnect WebSocket, le operazioni che hanno cambiato stato mentre il client era offline vengono riconciliate automaticamente; al reload pagina, gli ordini in stato `queued`/`started` vengono recuperati oltre ai `processing`.

**Architecture:**
Feature A è puro frontend — nessuna modifica al backend. Il banner multi-op adotta un layout "primary op + coda badge" invece del vecchio summary generico. La recovery su reload estende il filtro da `jobStatus === "processing"` a qualsiasi stato non terminale con jobId. Feature B aggiunge `hasConnectedRef` in `WebSocketContext` per distinguere la prima connessione dai reconnect, emette un evento sintetico `WS_RECONNECTED`, e `OperationTrackingContext` vi si iscrive per riconciliare lo stato delle op in-flight chiamando `getJobStatus`.

**Tech Stack:** React 19, TypeScript strict, Vitest, Testing Library, inline styles. Nessuna modifica al backend.

---

## File Map

| File | Azione | Responsabilità |
|------|--------|----------------|
| `frontend/src/components/GlobalOperationBanner.tsx` | Modify | Multi-op: op attiva come primary card + "+N in coda" badge per le queued |
| `frontend/src/components/GlobalOperationBanner.spec.tsx` | Modify | Aggiorna test multi-op (ora mostra primary op) + nuovi test coda badge |
| `frontend/src/contexts/OperationTrackingContext.tsx` | Modify | (1) Recovery include `queued`/`started`; (2) Riconcilia su `WS_RECONNECTED` |
| `frontend/src/contexts/WebSocketContext.tsx` | Modify | Emette `WS_RECONNECTED` su reconnect (non su initial connect) via `hasConnectedRef` |

---

### Task 1: Banner — Primary op prominente + badge coda per multi-op

**Files:**
- Modify: `frontend/src/components/GlobalOperationBanner.tsx`
- Modify: `frontend/src/components/GlobalOperationBanner.spec.tsx`

Logica nuova: quando `activeOperations.length > 1`, trovare la "primary op" (prima con `status === "active"`, altrimenti prima con `status === "queued"`). Renderizzarla come il caso single-op (con spinner, label, progress bar), aggiungendo il badge "+N in coda" dove N = numero di op con `status === "queued"` esclusa la primary (+ `pendingCount` download). Le op `completed`/`failed` vengono ignorate in questo conteggio — si auto-dismettono in 5s.

- [ ] **Step 1: Scrivi i test fallenti**

Aggiungi in `GlobalOperationBanner.spec.tsx`, nel describe `"GlobalOperationBanner"`, i seguenti test PRIMA di modificare l'implementazione:

```tsx
test("shows active op as primary with queue badge when active+queued mix", () => {
  mockContextValue.activeOperations = [
    makeOperation({ orderId: "o-1", jobId: "j-1", status: "active", progress: 45, label: "Inserimento righe", customerName: "Mario Rossi" }),
    makeOperation({ orderId: "o-2", jobId: "j-2", status: "queued", progress: 0, label: "In coda...", customerName: "Luigi Bianchi" }),
    makeOperation({ orderId: "o-3", jobId: "j-3", status: "queued", progress: 0, label: "In coda...", customerName: "Anna Verdi" }),
  ];

  const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
  const banner = getByTestId("global-operation-banner");

  expect(banner.textContent).toContain("Mario Rossi");
  expect(banner.textContent).toContain("Inserimento righe");
  expect(banner.textContent).toContain("+2 in coda");
  expect(getByTestId("banner-spinner")).toBeTruthy();
  // NON deve mostrare il vecchio summary "3 ordini in elaborazione"
  expect(banner.textContent).not.toContain("ordini in elaborazione");
});

test("shows first queued op as primary when all ops are queued", () => {
  mockContextValue.activeOperations = [
    makeOperation({ orderId: "o-1", jobId: "j-1", status: "queued", progress: 0, label: "In coda...", customerName: "Mario Rossi" }),
    makeOperation({ orderId: "o-2", jobId: "j-2", status: "queued", progress: 0, label: "In coda...", customerName: "Luigi Bianchi" }),
  ];

  const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
  const banner = getByTestId("global-operation-banner");

  expect(banner.textContent).toContain("Mario Rossi");
  expect(banner.textContent).toContain("+1 in coda");
  expect(banner.textContent).not.toContain("ordini in elaborazione");
});

test("shows only progress bar for single active op without queue badge when nothing else queued", () => {
  mockContextValue.activeOperations = [
    makeOperation({ orderId: "o-1", jobId: "j-1", status: "active", progress: 60, label: "Salvataggio" }),
    makeOperation({ orderId: "o-2", jobId: "j-2", status: "completed", progress: 100, label: "Completato" }),
  ];

  const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
  const banner = getByTestId("global-operation-banner");

  // Primary = active op; completed si auto-dismisserà, non genera badge coda
  expect(banner.textContent).toContain("Salvataggio");
  expect(banner.textContent).not.toContain("in coda");
});
```

- [ ] **Step 2: Verifica che i nuovi test falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose GlobalOperationBanner
```
Atteso: FAIL sui 3 nuovi test, PASS su tutti i preesistenti.

- [ ] **Step 3: Aggiorna il test preesistente multi-op** (ora rappresenta il vecchio comportamento da rimuovere)

Nel test `"shows aggregated text for multiple operations"` (riga 112), aggiorna l'asserzione per riflettere il nuovo comportamento: la primary op è quella active, il badge mostra le queued:

```tsx
test("shows primary active op when mixed operations", () => {
  mockContextValue.activeOperations = [
    makeOperation({ orderId: "o-1", jobId: "j-1", status: "active", progress: 40, label: "Elaborazione", customerName: "Mario Rossi" }),
    makeOperation({ orderId: "o-2", jobId: "j-2", status: "completed", progress: 100 }),
    makeOperation({ orderId: "o-3", jobId: "j-3", status: "queued", progress: 0 }),
  ];

  const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
  const banner = getByTestId("global-operation-banner");

  expect(banner.textContent).toContain("Mario Rossi");
  expect(banner.textContent).toContain("Elaborazione");
  expect(banner.textContent).toContain("+1 in coda");
});
```

- [ ] **Step 4: Implementa la nuova logica multi-op in `GlobalOperationBanner.tsx`**

Sostituisci il blocco `const summary = summarizeOperations(...)` e il `return` finale (righe 264–298) con:

```tsx
  // Multi-op: primary op (active first, then queued) + badge for queued ops
  const activeOp = activeOperations.find((o) => o.status === "active");
  const firstQueued = activeOperations.find((o) => o.status === "queued");
  const primaryOp = activeOp ?? firstQueued;

  if (primaryOp) {
    const botQueuedCount = activeOperations.filter(
      (o) => o.status === "queued" && o.orderId !== primaryOp.orderId,
    ).length;
    const totalQueueBadge = botQueuedCount + pendingCount;

    return (
      <>
        <style>{ANIMATION_STYLES}</style>
        <style>{APP_MAIN_SPACER}</style>
        <div
          style={activeBannerStyle}
          onClick={() => handleClick(primaryOp.navigateTo)}
          data-testid="global-operation-banner"
        >
          <span style={spinnerStyle} data-testid="banner-spinner" />
          <span style={labelStyle}>
            {primaryOp.customerName} — {primaryOp.label}
          </span>
          {primaryOp.status === "active" && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <div style={progressBarContainerStyle}>
                <div style={progressBarFillStyle(primaryOp.progress)} />
              </div>
              <span style={{ fontSize: "12px", fontWeight: 700, minWidth: "36px", textAlign: "right", opacity: 0.95 }}>
                {primaryOp.progress}%
              </span>
            </div>
          )}
          {totalQueueBadge > 0 && (
            <span style={queueBadgeStyle}>+{totalQueueBadge} in coda</span>
          )}
          <span style={chevronStyle}>&#8250;</span>
        </div>
      </>
    );
  }

  // All terminal (completed/failed) — fallback summary
  const summary = summarizeOperations(activeOperations);
  const summaryStyle = summary.hasFailed ? failedBannerStyle : completedBannerStyle;

  return (
    <>
      <style>{ANIMATION_STYLES}</style>
      <style>{APP_MAIN_SPACER}</style>
      <div
        style={summaryStyle}
        onClick={() => handleClick()}
        data-testid="global-operation-banner"
      >
        <span style={{ flexShrink: 0 }}>{summary.hasFailed ? "✕" : "✓"}</span>
        <span style={labelStyle}>{summary.text}</span>
        <span style={chevronStyle}>&#8250;</span>
      </div>
    </>
  );
```

Rimuovi anche il `summarizeOperations` test in fondo al file spec e aggiorna il relativo test (o lascia la funzione esportata per non rompere altri import — non cambia la firma).

- [ ] **Step 5: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose GlobalOperationBanner
```
Atteso: tutti PASS.

- [ ] **Step 6: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: 0 errori.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx \
        archibald-web-app/frontend/src/components/GlobalOperationBanner.spec.tsx
git commit -m "feat(banner): mostra op attiva come primary + badge coda per multi-op bot"
```

---

### Task 2: Recovery reload — include ordini queued/started

**Files:**
- Modify: `frontend/src/contexts/OperationTrackingContext.tsx`

Attualmente `recover()` filtra solo `o.jobStatus === "processing"`. Gli ordini con `jobStatus === "queued"` o `"started"` hanno già un `jobId` ma il bot non li ha ancora presi in carico. Dopo il reload il banner li ignora. La fix: allargare il filtro a tutti gli stati non-terminali con `jobId`.

`PendingOrder.jobStatus` può essere: `"idle" | "queued" | "started" | "processing" | "completed" | "failed"`. Gli stati non-terminali attivi sono `queued`, `started`, `processing`.

- [ ] **Step 1: Scrivi il test per `OperationTrackingContext`**

Crea `frontend/src/contexts/OperationTrackingContext.spec.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { OperationTrackingProvider, useOperationTracking } from "./OperationTrackingContext";

vi.mock("./WebSocketContext", () => ({
  useWebSocketContext: () => ({
    subscribe: () => () => {},
  }),
}));

vi.mock("../api/pending-orders", () => ({
  getPendingOrders: vi.fn(),
}));

vi.mock("../api/operations", () => ({
  getJobStatus: vi.fn(),
}));

import { getPendingOrders } from "../api/pending-orders";
import { getJobStatus } from "../api/operations";

const mockGetPendingOrders = getPendingOrders as ReturnType<typeof vi.fn>;
const mockGetJobStatus = getJobStatus as ReturnType<typeof vi.fn>;

function makePendingOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    customerId: "cust-1",
    customerName: "Mario Rossi",
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    deviceId: "device-1",
    needsSync: false,
    jobId: "job-1",
    ...overrides,
  };
}

function TestConsumer() {
  const { activeOperations } = useOperationTracking();
  return <div data-testid="ops-count">{activeOperations.length}</div>;
}

function Wrapper({ children }: { children: ReactNode }) {
  return <OperationTrackingProvider>{children}</OperationTrackingProvider>;
}

describe("OperationTrackingContext recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("recovers processing orders on mount", async () => {
    mockGetPendingOrders.mockResolvedValue([
      makePendingOrder({ jobStatus: "processing", jobId: "job-1" }),
    ]);
    mockGetJobStatus.mockResolvedValue({
      job: { state: "active", progress: 50, jobId: "job-1", type: "submit-order", userId: "u1", result: null, failedReason: undefined },
    });

    const { getByTestId } = render(<TestConsumer />, { wrapper: Wrapper });
    await waitFor(() => expect(getByTestId("ops-count").textContent).toBe("1"));
    expect(mockGetJobStatus).toHaveBeenCalledWith("job-1");
  });

  test("recovers queued orders on mount", async () => {
    mockGetPendingOrders.mockResolvedValue([
      makePendingOrder({ jobStatus: "queued", jobId: "job-2" }),
    ]);
    mockGetJobStatus.mockResolvedValue({
      job: { state: "waiting", progress: 0, jobId: "job-2", type: "submit-order", userId: "u1", result: null, failedReason: undefined },
    });

    const { getByTestId } = render(<TestConsumer />, { wrapper: Wrapper });
    await waitFor(() => expect(getByTestId("ops-count").textContent).toBe("1"));
    expect(mockGetJobStatus).toHaveBeenCalledWith("job-2");
  });

  test("recovers started orders on mount", async () => {
    mockGetPendingOrders.mockResolvedValue([
      makePendingOrder({ jobStatus: "started", jobId: "job-3" }),
    ]);
    mockGetJobStatus.mockResolvedValue({
      job: { state: "active", progress: 10, jobId: "job-3", type: "submit-order", userId: "u1", result: null, failedReason: undefined },
    });

    const { getByTestId } = render(<TestConsumer />, { wrapper: Wrapper });
    await waitFor(() => expect(getByTestId("ops-count").textContent).toBe("1"));
    expect(mockGetJobStatus).toHaveBeenCalledWith("job-3");
  });

  test("ignores idle and completed/failed orders without jobId", async () => {
    mockGetPendingOrders.mockResolvedValue([
      makePendingOrder({ jobStatus: "idle", jobId: undefined }),
      makePendingOrder({ orderId: "o-2", jobStatus: "completed", jobId: "job-4" }),
      makePendingOrder({ orderId: "o-3", jobStatus: "failed", jobId: "job-5" }),
    ]);

    const { getByTestId } = render(<TestConsumer />, { wrapper: Wrapper });
    await waitFor(() => {}, { timeout: 200 });
    expect(getByTestId("ops-count").textContent).toBe("0");
    expect(mockGetJobStatus).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose OperationTrackingContext
```
Atteso: FAIL su "recovers queued orders" e "recovers started orders".

- [ ] **Step 3: Modifica il filtro in `OperationTrackingContext.tsx`**

Trova (righe 68–73):
```typescript
const processing = pendingOrders.filter(
  (o) => o.jobStatus === "processing" && o.jobId,
);

if (cancelled || processing.length === 0) return;

const recovered: TrackedOperation[] = [];

for (const order of processing) {
```

Sostituisci con:
```typescript
const inFlight = pendingOrders.filter(
  (o) =>
    (o.jobStatus === "queued" ||
      o.jobStatus === "started" ||
      o.jobStatus === "processing") &&
    o.jobId,
);

if (cancelled || inFlight.length === 0) return;

const recovered: TrackedOperation[] = [];

for (const order of inFlight) {
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose OperationTrackingContext
```
Atteso: tutti PASS.

- [ ] **Step 5: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: 0 errori.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx \
        archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.tsx
git commit -m "feat(recovery): include ordini queued/started nel recovery al reload"
```

---

### Task 3: WebSocketContext — Emetti WS_RECONNECTED su reconnect

**Files:**
- Modify: `frontend/src/contexts/WebSocketContext.tsx`

Il WebSocket si riconnette automaticamente dopo un disconnect. Attualmente `ws.onopen` non distingue se è la prima connessione o un reconnect. Aggiungere `hasConnectedRef` (ref booleano, inizia a `false`) che viene settato a `true` dopo la prima `onopen`. Nelle successive `onopen`, dispatchare l'evento sintetico `WS_RECONNECTED` chiamando i relativi handlers in `eventHandlersRef`.

Nota: `hasConnectedRef` deve essere dichiarato nello scope del Provider (accanto agli altri ref), non dentro `connect` (che è un `useCallback`).

- [ ] **Step 1: Aggiungi `hasConnectedRef` in `WebSocketContext.tsx`**

Trova la sezione dei ref (dopo `const heartbeatTimeoutRef = ...`, riga ~81):
```typescript
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
```

Aggiungi dopo questa riga:
```typescript
  const hasConnectedRef = useRef<boolean>(false);
```

- [ ] **Step 2: Modifica `ws.onopen` per emettere `WS_RECONNECTED`**

Trova (riga ~263):
```typescript
    ws.onopen = () => {
      console.log("[WebSocket] Connected");
      isConnectingRef.current = false;
      setState("connected");
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

      // Start application-level heartbeat
      startHeartbeat(ws);
    };
```

Sostituisci con:
```typescript
    ws.onopen = () => {
      const isReconnect = hasConnectedRef.current;
      hasConnectedRef.current = true;
      console.log(`[WebSocket] ${isReconnect ? "Reconnected" : "Connected"}`);
      isConnectingRef.current = false;
      setState("connected");
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

      startHeartbeat(ws);

      if (isReconnect) {
        const reconnectHandlers = eventHandlersRef.current.get("WS_RECONNECTED");
        reconnectHandlers?.forEach((handler) => {
          try {
            handler({});
          } catch (error) {
            console.error("[WebSocket] Error in WS_RECONNECTED handler:", error);
          }
        });
      }
    };
```

- [ ] **Step 3: Verifica che i test esistenti del frontend passino ancora**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose WebSocketContext
```
Se non esistono test per WebSocketContext, il comando restituisce "no tests found" — va bene.

- [ ] **Step 4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: 0 errori.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/contexts/WebSocketContext.tsx
git commit -m "feat(websocket): emette WS_RECONNECTED su reconnect per reconciliazione stato"
```

---

### Task 4: OperationTrackingContext — Reconcilia stato su WS_RECONNECTED

**Files:**
- Modify: `frontend/src/contexts/OperationTrackingContext.tsx`

Quando il WebSocket si riconnette, alcune operazioni potrebbero aver cambiato stato mentre il client era offline (es: un submit-order completato, o un job passato da queued ad active). L'event buffer del server replaya `JOB_COMPLETED`/`JOB_FAILED` se entro 5 min, ma per disconnessioni più lunghe quei messaggi si perdono.

Soluzione: al `WS_RECONNECTED`, per ogni op ancora in-flight (`status === "active" || "queued"`), chiamare `getJobStatus(op.jobId)` e aggiornare lo stato se cambiato.

Bisogna usare `operationsRef` (un `useRef` che rispecchia il valore corrente di `operations`) per evitare stale closure nell'handler asincrono.

- [ ] **Step 1: Aggiungi test per la reconciliazione**

In `OperationTrackingContext.spec.tsx` (già creato in Task 2), aggiungi un nuovo `describe`:

```tsx
describe("OperationTrackingContext reconnect reconciliation", () => {
  test("aggiorna op active→completed quando WS si riconnette e job è completed", async () => {
    // Setup: nessun ordine da recoverry (getPendingOrders vuoto)
    mockGetPendingOrders.mockResolvedValue([]);

    let wsReconnectHandler: ((payload: unknown) => void) | null = null;
    const mockSubscribe = vi.fn((eventType: string, cb: (payload: unknown) => void) => {
      if (eventType === "WS_RECONNECTED") wsReconnectHandler = cb;
      return () => {};
    });

    vi.mock("./WebSocketContext", () => ({
      useWebSocketContext: () => ({
        subscribe: mockSubscribe,
      }),
    }));

    mockGetJobStatus.mockResolvedValue({
      job: { state: "completed", progress: 100, jobId: "job-active", type: "submit-order", userId: "u1", result: null, failedReason: undefined },
    });

    // Renderizza il provider con un'op già tracciata come "active"
    function TrackerSetup() {
      const { trackOperation, activeOperations } = useOperationTracking();
      return (
        <>
          <button
            data-testid="track"
            onClick={() => trackOperation("order-1", "job-active", "Mario Rossi", "In corso...", "Completato")}
          />
          <div data-testid="status">{activeOperations.find(o => o.orderId === "order-1")?.status ?? "none"}</div>
        </>
      );
    }

    const { getByTestId } = render(<TrackerSetup />, { wrapper: Wrapper });
    fireEvent.click(getByTestId("track"));

    await waitFor(() => expect(getByTestId("status").textContent).toBe("queued"));

    // Simula reconnect
    wsReconnectHandler?.({});

    await waitFor(() => expect(getByTestId("status").textContent).toBe("completed"));
    expect(mockGetJobStatus).toHaveBeenCalledWith("job-active");
  });
});
```

Aggiungi `import { fireEvent } from "@testing-library/react"` se non già presente.

- [ ] **Step 2: Verifica che il test fallisca**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose OperationTrackingContext
```
Atteso: FAIL sul nuovo test di reconciliazione.

- [ ] **Step 3: Aggiungi `operationsRef` e handler `WS_RECONNECTED` in `OperationTrackingContext.tsx`**

Dopo la dichiarazione di `dismissTimersRef` (riga 43), aggiungi:
```typescript
  const operationsRef = useRef<TrackedOperation[]>([]);
```

Dopo `setOperations((prev) => { ... return [...]})` nel corpo di `OperationTrackingProvider` — alla fine dell'effetto principale che chiama `setOperations` — aggiungi un `useEffect` che mantiene il ref sincronizzato:

Inserisci dopo il `useEffect(() => { return () => { for (const timer...) } }, [])` (riga ~219):

```typescript
  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);
```

Poi, nel `useEffect` che gestisce i subscribe WebSocket (quello che inizia con `const unsubs: Array<() => void> = []`), aggiungi prima del `return`:

```typescript
    unsubs.push(
      subscribe("WS_RECONNECTED", () => {
        const snapshot = operationsRef.current.filter(
          (op) => op.status === "active" || op.status === "queued",
        );

        for (const op of snapshot) {
          getJobStatus(op.jobId)
            .then(({ job }) => {
              const newStatus =
                job.state === "completed"
                  ? ("completed" as const)
                  : job.state === "failed"
                    ? ("failed" as const)
                    : job.state === "active"
                      ? ("active" as const)
                      : ("queued" as const);

              setOperations((prev) =>
                prev.map((o) =>
                  o.jobId === op.jobId
                    ? {
                        ...o,
                        status: newStatus,
                        progress:
                          newStatus === "completed" ? 100 : (job.progress ?? o.progress),
                        error: job.failedReason,
                      }
                    : o,
                ),
              );

              if (newStatus === "completed") {
                scheduleDismiss(op.orderId);
              }
            })
            .catch(() => {
              // Job non trovato o errore transitorio — il prossimo evento WS aggiornerà
            });
        }
      }),
    );
```

Aggiungi `import { getJobStatus } from "../api/operations"` se non già presente (è già importato — verificare).

- [ ] **Step 4: Esegui tutti i test di OperationTrackingContext**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose OperationTrackingContext
```
Atteso: tutti PASS.

- [ ] **Step 5: Esegui la suite completa frontend**

```bash
npm test --prefix archibald-web-app/frontend
```
Atteso: tutti PASS (905+ test).

- [ ] **Step 6: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: 0 errori.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx \
        archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.tsx
git commit -m "feat(recovery): reconcilia stato op in-flight su WS_RECONNECTED"
```

---

## Self-Review

### Spec coverage

| Requisito | Task che lo implementa |
|-----------|----------------------|
| Banner mostra op attiva come card principale | Task 1 |
| Badge "+N in coda" per operazioni in attesa | Task 1 |
| Operazioni queued/started recuperate al reload | Task 2 |
| Evento WS_RECONNECTED emesso su reconnect | Task 3 |
| Reconciliazione stato op in-flight su reconnect | Task 4 |
| Op che completa offline → mostrata come completed al reconnect | Task 4 |

### Placeholder scan
- Nessun TBD, TODO, "implement later", "handle edge cases" senza codice.
- Ogni step ha codice esatto o comando esatto.

### Type consistency
- `TrackedOperation.status` usato coerentemente come `"queued" | "active" | "completed" | "failed"` in tutti i task.
- `getJobStatus` importato da `"../api/operations"` — già presente in `OperationTrackingContext.tsx` (riga 12).
- `operationsRef` dichiarato in Task 4 e usato nello stesso task.
- `hasConnectedRef` dichiarato e usato nello stesso task (Task 3).
