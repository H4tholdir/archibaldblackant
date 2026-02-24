# Frontend Queue Migration — 4 Remaining Gaps

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the last 4 frontend flows from legacy direct-call/SSE to the unified operation queue, achieving full feature parity with master.

**Architecture:** Each flow will use `enqueueOperation()` to submit the job, then poll `getJobStatus()` for completion. The backend already has all handlers wired and the routes already do `queue.enqueue()`. The frontend just needs to stop using EventSource/fetchWithRetry and use the queue API instead. For PDF downloads, the job result contains base64-encoded PDF data which the frontend will convert to a downloadable blob.

**Tech Stack:** React, TypeScript, WebSocket (JOB_COMPLETED events), `enqueueOperation`/`getJobStatus` from `api/operations.ts`

---

## Context: How the Queue Works

### Backend Flow
1. Frontend calls `POST /api/operations/enqueue` → returns `{ success, jobId }`
2. BullMQ worker picks up job, calls handler
3. Handler broadcasts via WebSocket: `{ type: 'JOB_COMPLETED', payload: { event: 'JOB_COMPLETED', jobId, type, result } }`
4. Frontend can also poll: `GET /api/operations/:jobId/status` → `{ job: { state, progress, result, failedReason } }`

### Key Insight
The backend **already** handles all 4 operations via queue:
- `GET /api/orders/:id/pdf-download` → does `queue.enqueue('download-ddt-pdf' | 'download-invoice-pdf')` → returns `{ jobId }`
- `POST /api/orders/:id/send-to-milano` → does `queue.enqueue('send-to-verona')` → returns `{ jobId }`
- `POST /api/orders/:id/sync-articles` → does `queue.enqueue('sync-order-articles')` → returns `{ jobId }`

The problem is purely frontend: the code still uses EventSource/fetchWithRetry expecting the OLD response format.

### Pattern to Follow
We'll use a **polling helper** in `api/operations.ts` that polls `getJobStatus` until completion, calling progress callbacks. This mirrors the existing `downloadPdfWithProgress` UX but uses the queue.

---

## Task 1: Add `pollJobUntilDone` Helper to `api/operations.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/api/operations.ts`
- Test: `archibald-web-app/frontend/src/api/operations.spec.ts`

### Step 1: Write the failing test

Add to `operations.spec.ts`:

```typescript
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// We'll test pollJobUntilDone
describe('pollJobUntilDone', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('resolves with result when job completes', async () => {
    const mockResult = { pdf: 'base64data' };
    // Mock getJobStatus to return completed on second call
    const getJobStatusMock = vi.fn()
      .mockResolvedValueOnce({
        success: true,
        job: { jobId: 'j1', state: 'active', progress: 50, result: null, failedReason: undefined },
      })
      .mockResolvedValueOnce({
        success: true,
        job: { jobId: 'j1', state: 'completed', progress: 100, result: mockResult, failedReason: undefined },
      });

    // pollJobUntilDone should resolve with the result
    // We'll import and test after implementation
  });

  test('rejects with error message when job fails', async () => {
    const getJobStatusMock = vi.fn()
      .mockResolvedValueOnce({
        success: true,
        job: { jobId: 'j1', state: 'failed', progress: 0, result: null, failedReason: 'Bot login failed' },
      });
    // Should reject with 'Bot login failed'
  });

  test('calls onProgress callback with progress updates', async () => {
    // Verify onProgress is called with { progress, label }
  });

  test('times out after maxWait and rejects', async () => {
    // After maxWait ms of 'active' state, should reject with timeout error
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test --prefix archibald-web-app/frontend -- --run operations.spec`
Expected: FAIL — `pollJobUntilDone` not exported

### Step 3: Write minimal implementation

Add to `archibald-web-app/frontend/src/api/operations.ts`:

```typescript
type PollOptions = {
  intervalMs?: number;
  maxWaitMs?: number;
  onProgress?: (progress: number, label?: string) => void;
};

async function pollJobUntilDone(
  jobId: string,
  options: PollOptions = {},
): Promise<Record<string, unknown>> {
  const { intervalMs = 1500, maxWaitMs = 180_000, onProgress } = options;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const { job } = await getJobStatus(jobId);

    if (job.state === 'completed') {
      onProgress?.(100, 'Completato');
      return job.result ?? {};
    }

    if (job.state === 'failed') {
      throw new Error(job.failedReason ?? 'Operazione fallita');
    }

    if (typeof job.progress === 'number') {
      const progressData = job.progress as unknown;
      if (typeof progressData === 'object' && progressData !== null && 'progress' in progressData) {
        const p = progressData as { progress: number; label?: string };
        onProgress?.(p.progress, p.label);
      } else {
        onProgress?.(job.progress);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timeout: operazione non completata entro il tempo massimo');
}
```

Export `pollJobUntilDone` and `type PollOptions`.

### Step 4: Run test to verify it passes

Run: `npm test --prefix archibald-web-app/frontend -- --run operations.spec`
Expected: PASS

### Step 5: Commit

```
feat(frontend): add pollJobUntilDone helper for queue job tracking
```

---

## Task 2: Migrate `downloadPdfWithProgress` to Use Queue

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx` (function `downloadPdfWithProgress` at line ~3187)

### Step 1: Replace `downloadPdfWithProgress` implementation

The current function uses `EventSource` (SSE). Replace it to use `enqueueOperation` + `pollJobUntilDone`:

**Old code (lines 3187-3238):**
```typescript
function downloadPdfWithProgress(
  orderId: string,
  type: "invoice" | "ddt",
  token: string,
  onProgress: (stage: string, percent: number) => void,
  onComplete: () => void,
  onError: (error: string) => void,
): () => void {
  const encodedId = encodeURIComponent(orderId);
  const url = `/api/orders/${encodedId}/pdf-download?type=${type}&token=${encodeURIComponent(token)}`;
  const eventSource = new EventSource(url);
  // ... EventSource handlers
  return () => eventSource.close();
}
```

**New code:**
```typescript
function downloadPdfWithProgress(
  orderId: string,
  type: "invoice" | "ddt",
  _token: string,
  onProgress: (stage: string, percent: number) => void,
  onComplete: () => void,
  onError: (error: string) => void,
): () => void {
  let cancelled = false;

  (async () => {
    try {
      onProgress("Avvio download...", 5);

      const operationType = type === "invoice" ? "download-invoice-pdf" : "download-ddt-pdf";
      const { jobId } = await enqueueOperation(operationType as OperationType, { orderId });

      if (cancelled) return;

      onProgress("In coda...", 10);

      const result = await pollJobUntilDone(jobId, {
        intervalMs: 1500,
        maxWaitMs: 180_000,
        onProgress: (progress, label) => {
          if (!cancelled) {
            onProgress(label ?? "Download in corso...", progress);
          }
        },
      });

      if (cancelled) return;

      const pdfBase64 = result.pdf as string;
      if (!pdfBase64) {
        onError("Nessun PDF ricevuto dal server");
        return;
      }

      onProgress("Download completato!", 100);

      const byteCharacters = atob(pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${type === "ddt" ? "DDT" : "Fattura"}_${orderId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(downloadUrl);

      onComplete();
    } catch (err) {
      if (!cancelled) {
        onError(err instanceof Error ? err.message : "Errore durante il download");
      }
    }
  })();

  return () => { cancelled = true; };
}
```

**Import required:** Add `import type { OperationType } from "../api/operations";` and `import { pollJobUntilDone } from "../api/operations";` at the top of the file (line ~7).

### Step 2: Verify the import of `enqueueOperation` already exists

At line 7: `import { enqueueOperation } from "../api/operations";` — already present. Change to:
```typescript
import { enqueueOperation, pollJobUntilDone, type OperationType } from "../api/operations";
```

### Step 3: Run type-check

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

### Step 4: Commit

```
feat(frontend): migrate PDF download from SSE to unified queue
```

---

## Task 3: Migrate `handleConfirmSendToVerona` to Handle Queue Response

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/OrderHistory.tsx` (function `handleConfirmSendToVerona` at line ~565)

### Step 1: Replace the direct fetch with queue-aware polling

The backend route `POST /api/orders/:orderId/send-to-milano` already does `queue.enqueue('send-to-verona')` and returns `{ success, jobId }`. The current frontend code calls `fetchWithRetry` and expects a synchronous result. We need to:

1. Keep the same `fetchWithRetry` call (the URL and backend are fine)
2. After getting `{ jobId }`, poll for completion before showing success

**Current code (lines 565-624):**
The function does `fetchWithRetry` → checks `response.ok` → parses `data` → if `data.success` → shows success.

**New code:**
```typescript
const handleConfirmSendToVerona = async () => {
  if (!modalOrderId) return;

  setSendingToVerona(true);
  setError(null);

  try {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) {
      setError("Non autenticato. Effettua il login.");
      setSendingToVerona(false);
      return;
    }

    const response = await fetchWithRetry(
      `/api/orders/${modalOrderId}/send-to-milano`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      { maxRetries: 0, totalTimeout: 120000 },
    );

    if (!response.ok) {
      if (response.status === 401) {
        setError("Sessione scaduta. Effettua il login.");
        localStorage.removeItem("archibald_jwt");
        return;
      }
      const errorBody = await response.json().catch(() => null);
      const errorMsg =
        errorBody?.error || response.statusText || "Errore sconosciuto";
      throw new Error(`Errore ${response.status}: ${errorMsg}`);
    }

    const data = await response.json();

    // If already sent (no jobId), just show success
    if (!data.jobId) {
      if (!data.success) {
        throw new Error(data.message || "Errore nell'invio a Verona");
      }
    } else {
      // Poll for job completion
      await pollJobUntilDone(data.jobId, {
        maxWaitMs: 120_000,
        onProgress: (progress, label) => {
          setSendToVeronaProgress({
            progress,
            operation: label ?? "Invio in corso...",
          });
        },
      });
    }

    setSentToVeronaIds((prev) => new Set(prev).add(modalOrderId));

    setModalOpen(false);
    setModalOrderId(null);
    setModalCustomerName("");

    await fetchOrders();

    toastService.success("Ordine inviato a Verona con successo!");
  } catch (err) {
    console.error("Error sending to Verona:", err);
    setError(
      err instanceof Error ? err.message : "Errore nell'invio a Verona",
    );
  } finally {
    setSendingToVerona(false);
    setSendToVeronaProgress(null);
  }
};
```

**Import required:** Add `pollJobUntilDone` import at the top:
```typescript
import { pollJobUntilDone } from "../api/operations";
```

### Step 2: Run type-check

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

### Step 3: Commit

```
feat(frontend): migrate send-to-verona to handle queue jobId response
```

---

## Task 4: Migrate `handleSyncArticles` and Edit-Mode Sync to Use Queue

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx`
  - Function `handleSyncArticles` at line ~1074
  - Auto-sync in edit mode at line ~712

### Step 1: Migrate `handleSyncArticles` (manual sync button)

**Current code (lines 1074-1130):** Uses `fetchWithRetry` to `POST /api/orders/:orderId/sync-articles`, expects synchronous `{ success, data: { articles, totalVatAmount, totalWithVat } }`.

**New code:**
```typescript
const handleSyncArticles = async () => {
  if (!token) {
    setError("Token di autenticazione mancante");
    return;
  }

  setLoading(true);
  setError(null);
  setSuccess(null);

  try {
    const response = await fetchWithRetry(
      `/api/orders/${orderId}/sync-articles`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || "Errore durante la sincronizzazione",
      );
    }

    const enqueueResult = await response.json();

    if (!enqueueResult.jobId) {
      throw new Error("Nessun job creato per la sincronizzazione");
    }

    const result = await pollJobUntilDone(enqueueResult.jobId, {
      maxWaitMs: 120_000,
      onProgress: (progress, label) => {
        setSuccess(label ?? `Sincronizzazione in corso... ${progress}%`);
      },
    });

    // Reload articles from DB after sync completes
    const articlesResponse = await fetchWithRetry(
      `/api/orders/${orderId}/articles`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (articlesResponse.ok) {
      const articlesData = await articlesResponse.json();
      if (articlesData.success) {
        setArticles(articlesData.data);
      }
    }

    const totalVat = (result.totalVatAmount as number) ?? 0;
    const articlesCount = (result.articlesCount as number) ?? 0;
    setSuccess(
      `Sincronizzati ${articlesCount} articoli. Totale IVA: ${formatCurrency(totalVat)}`,
    );

    if (
      onTotalsUpdate &&
      result.totalVatAmount &&
      result.totalWithVat
    ) {
      onTotalsUpdate({
        totalVatAmount: result.totalVatAmount as number,
        totalWithVat: result.totalWithVat as number,
      });
    }

    setTimeout(() => setSuccess(null), 5000);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Errore sconosciuto";
    setError(errorMessage);
    console.error("Sync articles error:", err);
  } finally {
    setLoading(false);
  }
};
```

### Step 2: Migrate the auto-sync in edit mode (line ~712)

**Current code (lines 712-728):** Same `fetchWithRetry` pattern but only reads the result.

**New code:** Replace the auto-sync block:
```typescript
if (token && orderId) {
  try {
    const syncResponse = await fetchWithRetry(
      `/api/orders/${orderId}/sync-articles`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (syncResponse.ok) {
      const enqueueResult = await syncResponse.json();

      if (enqueueResult.jobId) {
        await pollJobUntilDone(enqueueResult.jobId, {
          maxWaitMs: 120_000,
        });

        // Reload articles after sync
        const articlesResponse = await fetchWithRetry(
          `/api/orders/${orderId}/articles`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (articlesResponse.ok) {
          const articlesData = await articlesResponse.json();
          if (articlesData.success && articlesData.data.length > 0) {
            freshArticles = articlesData.data;
            if (!cancelled) {
              setArticles(freshArticles);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("Auto-sync articles failed:", err);
  }
}
```

**Import required:** Ensure `pollJobUntilDone` is imported (already added in Task 2).

### Step 3: Run type-check

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

### Step 4: Commit

```
feat(frontend): migrate sync-articles to handle queue async response
```

---

## Task 5: Verify Type-Check and Tests Pass

**Files:** None (verification only)

### Step 1: Run full type-check

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS with no errors

### Step 2: Run frontend tests

Run: `npm test --prefix archibald-web-app/frontend`
Expected: All existing tests pass

### Step 3: Run backend build

Run: `npm run build --prefix archibald-web-app/backend`
Expected: PASS (backend unchanged)

### Step 4: Commit if any fixups needed

```
fix(frontend): resolve type-check or test issues from queue migration
```

---

## Summary of Changes

| Gap | File | Change |
|-----|------|--------|
| Download DDT/Fattura | `OrderCardNew.tsx:downloadPdfWithProgress` | EventSource → `enqueueOperation` + `pollJobUntilDone` + base64→blob |
| Send to Verona | `OrderHistory.tsx:handleConfirmSendToVerona` | Handle `{ jobId }` response, poll for completion |
| Sync Articles (manual) | `OrderCardNew.tsx:handleSyncArticles` | Handle `{ jobId }` response, poll, reload articles from API |
| Sync Articles (auto) | `OrderCardNew.tsx` edit mode effect | Same pattern, poll then reload |
| Helper | `api/operations.ts` | New `pollJobUntilDone` function |

**No backend changes needed.** All backend routes and handlers are already wired correctly.
