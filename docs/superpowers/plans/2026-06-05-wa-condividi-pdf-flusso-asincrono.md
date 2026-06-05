# WA Condividi con PDF — Flusso Asincrono con Banner Tracking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminare l'`alert()` che blocca il flusso "Condividi con PDF" sostituendolo con enqueue asincrono del download, tracking nel GlobalOperationBanner, e apertura automatica di WhatsApp al completamento.

**Architecture:** `handleShareWaWithPdf` diventa two-phase: se tutti i PDF sono in cache li condivide subito, altrimenti fa enqueue di `cache-invoice-pdf` per ciascuno mancante e registra i jobId. Un WS listener in `NotificheTab` ascolta `JOB_COMPLETED`/`JOB_FAILED` e, quando tutti i job del messaggio completano, ri-fetcha i PDF e apre WhatsApp automaticamente. Il bottone mostra stati distinti: idle / downloading (disabilitato) / error (retry).

**Tech Stack:** React 19 (hooks, useRef, useEffect), Vitest + Testing Library, `useWebSocketContext` subscribe, `enqueueOperation` + `trackOperation`, `shareService.shareViaWhatsAppMultiple` (nuovo), `navigator.share` Web API.

---

## File Map

| Azione | File |
|--------|------|
| Modify | `archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx` |
| Modify test | `archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.ts` |
| Modify | `archibald-web-app/frontend/src/services/share.service.ts` |
| Create test | `archibald-web-app/frontend/src/services/share.service.spec.ts` |
| Modify | `archibald-web-app/frontend/src/components/NotificheTab.tsx` |
| Create test | `archibald-web-app/frontend/src/components/NotificheTab.spec.tsx` |

---

## Task 1: OperationTrackingContext — etichette per `cache-invoice-pdf`

**Files:**
- Modify: `archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.ts`
- Modify: `archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx`

- [ ] **Step 1: Aggiungi il test failing**

Apri `OperationTrackingContext.spec.ts` e aggiungi alla fine del file, dopo il describe esistente di `isBackgroundOperation`:

```ts
describe('cache-invoice-pdf labels', () => {
  it('ritorna label in-progress per status active', () => {
    const { label } = getRecoveryLabels('cache-invoice-pdf', 'active');
    expect(label).toBe('Download PDF fattura...');
  });

  it('ritorna label completato per status completed', () => {
    const { label, completedLabel } = getRecoveryLabels('cache-invoice-pdf', 'completed');
    expect(label).toBe('PDF pronto');
    expect(completedLabel).toBe('PDF pronto');
  });

  it('non è classificata come background operation', () => {
    expect(isBackgroundOperation('cache-invoice-pdf')).toBe(false);
  });
});
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose OperationTrackingContext.spec.ts
```

Expected: 2 FAIL (label returns fallback `'In corso...'` / `'Operazione completata'` invece dei valori attesi).

- [ ] **Step 3: Aggiungi le etichette in `OperationTrackingContext.tsx`**

In `getRecoveryLabels`, nella mappa `completedByType` (riga ~87), aggiungi dopo `'download-invoice-pdf': 'Download completato'`:

```ts
'cache-invoice-pdf': 'PDF pronto',
```

Nella mappa `inProgressByType` (riga ~110), aggiungi dopo `'download-invoice-pdf': 'Download fattura...'`:

```ts
'cache-invoice-pdf': 'Download PDF fattura...',
```

- [ ] **Step 4: Verifica che i test passino**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose OperationTrackingContext.spec.ts
```

Expected: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx \
        archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.ts
git commit -m "feat(notifiche): etichette cache-invoice-pdf in OperationTrackingContext"
```

---

## Task 2: `share.service.ts` — `shareViaWhatsAppMultiple`

**Files:**
- Create: `archibald-web-app/frontend/src/services/share.service.spec.ts`
- Modify: `archibald-web-app/frontend/src/services/share.service.ts`

- [ ] **Step 1: Crea il file di test con i casi failing**

Crea `archibald-web-app/frontend/src/services/share.service.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shareService } from './share.service';

const PDF_1 = { blob: new Blob(['pdf1'], { type: 'application/pdf' }), fileName: 'CF1_001.pdf' };
const PDF_2 = { blob: new Blob(['pdf2'], { type: 'application/pdf' }), fileName: 'CF1_002.pdf' };
const MESSAGE = 'Gentile cliente, in allegato le fatture.';

describe('shareViaWhatsAppMultiple', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('mobile path — navigator.share disponibile', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        ...navigator,
        maxTouchPoints: 1,
        canShare: () => true,
        share: vi.fn().mockResolvedValue(undefined),
      });
    });

    it('chiama navigator.share con tutti i File e il messaggio', async () => {
      await shareService.shareViaWhatsAppMultiple([PDF_1, PDF_2], MESSAGE);

      expect(navigator.share).toHaveBeenCalledOnce();
      const arg = (navigator.share as ReturnType<typeof vi.fn>).mock.calls[0][0] as { text: string; files: File[] };
      expect(arg.text).toBe(MESSAGE);
      expect(arg.files).toHaveLength(2);
      expect(arg.files[0].name).toBe('CF1_001.pdf');
      expect(arg.files[1].name).toBe('CF1_002.pdf');
    });

    it('non fa upload al backend quando navigator.share è disponibile', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await shareService.shareViaWhatsAppMultiple([PDF_1], MESSAGE);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('desktop fallback — navigator.share non disponibile', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        ...navigator,
        maxTouchPoints: 0,
        canShare: undefined,
        share: undefined,
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: '/share/abc123', id: 'abc123' }),
      } as Response);
    });

    it('usa solo il primo PDF come allegato upload', async () => {
      vi.spyOn(shareService, 'openWhatsApp').mockImplementation(() => {});
      await shareService.shareViaWhatsAppMultiple([PDF_1, PDF_2], MESSAGE);

      const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(fetchCalls).toHaveLength(1);
      const formData = fetchCalls[0][1].body as FormData;
      expect(formData.get('file')).toBeTruthy();
    });

    it('apre WhatsApp con il messaggio originale e l\'URL del PDF', async () => {
      const openSpy = vi.spyOn(shareService, 'openWhatsApp').mockImplementation(() => {});
      await shareService.shareViaWhatsAppMultiple([PDF_1, PDF_2], MESSAGE);

      expect(openSpy).toHaveBeenCalledOnce();
      const waMessage = openSpy.mock.calls[0][0] as string;
      expect(waMessage).toContain(MESSAGE);
      expect(waMessage).toContain('/share/abc123');
    });
  });
});
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose share.service.spec.ts
```

Expected: FAIL — `shareViaWhatsAppMultiple is not a function`.

- [ ] **Step 3: Implementa `shareViaWhatsAppMultiple` in `share.service.ts`**

In `share.service.ts`, aggiungi il metodo nella classe `ShareService` dopo `shareViaWhatsApp`:

```ts
async shareViaWhatsAppMultiple(
  files: { blob: Blob; fileName: string }[],
  message: string,
): Promise<void> {
  if (files.length === 0) return;

  const fileObjects = files.map(f => new File([f.blob], f.fileName, { type: 'application/pdf' }));
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (isMobile && navigator.canShare?.({ files: fileObjects })) {
    await navigator.share({ text: message, files: fileObjects });
    return;
  }

  const { url } = await this.uploadPDFForSharing(files[0].blob, files[0].fileName);
  const absoluteUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
  this.openWhatsApp(`${message}\n${absoluteUrl}`);
}
```

- [ ] **Step 4: Verifica che i test passino**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose share.service.spec.ts
```

Expected: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/services/share.service.ts \
        archibald-web-app/frontend/src/services/share.service.spec.ts
git commit -m "feat(notifiche): shareViaWhatsAppMultiple per allegati PDF multipli"
```

---

## Task 3: `NotificheTab.tsx` — refactoring two-phase + WS listener + UI stati

**Files:**
- Create: `archibald-web-app/frontend/src/components/NotificheTab.spec.tsx`
- Modify: `archibald-web-app/frontend/src/components/NotificheTab.tsx`

### Step 3.1 — Crea il test file con i casi failing

- [ ] **Step 1: Crea `NotificheTab.spec.tsx`**

Crea `archibald-web-app/frontend/src/components/NotificheTab.spec.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { NotificheTab } from './NotificheTab';

// ── Mock dipendenze API ──────────────────────────────────────────────────────

const mockFetchSettings = vi.fn();
const mockFetchPendingWa = vi.fn();
const mockUpdatePendingWaStatus = vi.fn().mockResolvedValue(undefined);
const mockFetchProfiles = vi.fn().mockResolvedValue([]);
const mockFetchLog = vi.fn().mockResolvedValue([]);

vi.mock('../api/notification-settings', () => ({
  fetchNotificationSettings: (...args: unknown[]) => mockFetchSettings(...args),
  saveNotificationSettings: vi.fn().mockResolvedValue({}),
  fetchPendingWa: (...args: unknown[]) => mockFetchPendingWa(...args),
  updatePendingWaStatus: (...args: unknown[]) => mockUpdatePendingWaStatus(...args),
  fetchNotificationProfiles: (...args: unknown[]) => mockFetchProfiles(...args),
  fetchNotificationLog: (...args: unknown[]) => mockFetchLog(...args),
}));

// ── Mock WebSocketContext ───────────────────────────────────────────────────

type WsHandler = (payload: unknown) => void;
let wsSubscribeImpl: (event: string, handler: WsHandler) => () => void;

vi.mock('../contexts/WebSocketContext', () => ({
  useWebSocketContext: () => ({
    subscribe: (event: string, handler: WsHandler) => wsSubscribeImpl(event, handler),
  }),
}));

// ── Mock OperationTrackingContext ───────────────────────────────────────────

const mockTrackOperation = vi.fn();
vi.mock('../contexts/OperationTrackingContext', () => ({
  useOperationTracking: () => ({ trackOperation: mockTrackOperation }),
}));

// ── Mock enqueueOperation ───────────────────────────────────────────────────

const mockEnqueue = vi.fn();
vi.mock('../api/operations', () => ({
  enqueueOperation: (...args: unknown[]) => mockEnqueue(...args),
}));

// ── Mock share service ──────────────────────────────────────────────────────

const mockShareMultiple = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/share.service', () => ({
  shareService: { shareViaWhatsAppMultiple: (...args: unknown[]) => mockShareMultiple(...args) },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  enabled: true,
  emailOverride: null,
  whatsappOverride: '+393388570540',
  escalationProfile: 'standard',
  customSteps: null,
  newInvoiceEnabled: true,
  newInvoiceChannels: ['whatsapp'],
  preDueEnabled: false,
  statementEnabled: false,
  statementIntervalDays: 30,
};

function makePendingWa(invoiceNumbers: string[] = ['CF1/26004469']) {
  return {
    id: 'wa-1',
    customerErpId: 'C001',
    phoneTo: '+393388570540',
    messageText: 'Buongiorno, in allegato la fattura.',
    tone: 'gentile',
    status: 'pending',
    invoiceNumbers,
    totalAmount: 1056.53,
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const DEFAULT_PROPS = {
  erpId: 'C001',
  customerEmail: 'test@example.com',
  customerMobile: '+393388570540',
};

// ── Test suite ───────────────────────────────────────────────────────────────

describe('NotificheTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchSettings.mockResolvedValue(DEFAULT_SETTINGS);
    mockFetchProfiles.mockResolvedValue([]);
    mockFetchLog.mockResolvedValue([]);
    mockFetchPendingWa.mockResolvedValue([]);

    // Default subscribe: no-op, returns unsubscribe fn
    wsSubscribeImpl = (_event, _handler) => () => {};
  });

  describe('handleShareWaWithPdf — Fase 1: tutti i PDF disponibili in cache', () => {
    it('chiama shareViaWhatsAppMultiple con tutti i PDF e non fa enqueue', async () => {
      const wa = makePendingWa(['CF1/26004469', 'CF1/26004470']);
      mockFetchPendingWa.mockResolvedValue([wa]);

      // Entrambi i PDF disponibili immediatamente
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['pdf'])) }));

      const { getByText } = render(<NotificheTab {...DEFAULT_PROPS} />, { wrapper: Wrapper });

      await waitFor(() => expect(getByText('📎 Condividi con PDF')).toBeInTheDocument());

      await act(async () => {
        await userEvent.click(getByText('📎 Condividi con PDF'));
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
      await waitFor(() => expect(mockShareMultiple).toHaveBeenCalledOnce());
      const [files, message] = mockShareMultiple.mock.calls[0] as [{ blob: Blob; fileName: string }[], string];
      expect(files).toHaveLength(2);
      expect(message).toBe(wa.messageText);
    });
  });

  describe('handleShareWaWithPdf — Fase 2: PDF mancanti → enqueue', () => {
    it('fa enqueue di cache-invoice-pdf e mostra bottone disabilitato', async () => {
      const wa = makePendingWa(['CF1/26004469']);
      mockFetchPendingWa.mockResolvedValue([wa]);
      mockEnqueue.mockResolvedValue({ success: true, jobId: 'job-pdf-1' });

      // PDF non disponibile (404)
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValue({ ok: false, status: 404 }));

      const { getByText } = render(<NotificheTab {...DEFAULT_PROPS} />, { wrapper: Wrapper });
      await waitFor(() => expect(getByText('📎 Condividi con PDF')).toBeInTheDocument());

      await act(async () => {
        await userEvent.click(getByText('📎 Condividi con PDF'));
      });

      expect(mockEnqueue).toHaveBeenCalledWith('cache-invoice-pdf', { invoiceNumber: 'CF1/26004469' });
      expect(mockTrackOperation).toHaveBeenCalledWith(
        'CF1/26004469', 'job-pdf-1', 'PDF CF1/26004469',
        'Download PDF fattura...', 'PDF pronto', undefined, 'cache-invoice-pdf'
      );

      await waitFor(() =>
        expect(getByText('⏳ Preparazione PDF…')).toBeInTheDocument()
      );
      expect(getByText('⏳ Preparazione PDF…').closest('button')).toBeDisabled();
    });

    it('non fa share finché i job non completano', async () => {
      const wa = makePendingWa(['CF1/26004469']);
      mockFetchPendingWa.mockResolvedValue([wa]);
      mockEnqueue.mockResolvedValue({ success: true, jobId: 'job-pdf-1' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      render(<NotificheTab {...DEFAULT_PROPS} />, { wrapper: Wrapper });
      await waitFor(() => screen.getByText('📎 Condividi con PDF'));

      await act(async () => {
        await userEvent.click(screen.getByText('📎 Condividi con PDF'));
      });

      expect(mockShareMultiple).not.toHaveBeenCalled();
    });
  });

  describe('WS listener — JOB_COMPLETED → share automatica', () => {
    it('apre WhatsApp automaticamente quando tutti i job completano con cached=true', async () => {
      const wa = makePendingWa(['CF1/26004469']);
      mockFetchPendingWa.mockResolvedValue([wa]);
      mockEnqueue.mockResolvedValue({ success: true, jobId: 'job-pdf-1' });

      let completedHandler: WsHandler | null = null;
      wsSubscribeImpl = (event, handler) => {
        if (event === 'JOB_COMPLETED') completedHandler = handler;
        return () => {};
      };

      // Prima chiamata fetch: PDF non disponibile (triggers enqueue)
      // Seconda chiamata fetch: PDF disponibile (dopo cache)
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['pdf'])) }));

      render(<NotificheTab {...DEFAULT_PROPS} />, { wrapper: Wrapper });
      await waitFor(() => screen.getByText('📎 Condividi con PDF'));

      await act(async () => {
        await userEvent.click(screen.getByText('📎 Condividi con PDF'));
      });

      await waitFor(() => expect(completedHandler).not.toBeNull());

      // Simula JOB_COMPLETED dal WS
      await act(async () => {
        completedHandler!({ jobId: 'job-pdf-1', result: { cached: true } });
      });

      await waitFor(() => expect(mockShareMultiple).toHaveBeenCalledOnce());
    });

    it('mostra stato errore quando JOB_COMPLETED ha cached=false', async () => {
      const wa = makePendingWa(['CF1/26004469']);
      mockFetchPendingWa.mockResolvedValue([wa]);
      mockEnqueue.mockResolvedValue({ success: true, jobId: 'job-pdf-1' });

      let completedHandler: WsHandler | null = null;
      wsSubscribeImpl = (event, handler) => {
        if (event === 'JOB_COMPLETED') completedHandler = handler;
        return () => {};
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      render(<NotificheTab {...DEFAULT_PROPS} />, { wrapper: Wrapper });
      await waitFor(() => screen.getByText('📎 Condividi con PDF'));

      await act(async () => {
        await userEvent.click(screen.getByText('📎 Condividi con PDF'));
      });

      await act(async () => {
        completedHandler!({ jobId: 'job-pdf-1', result: { cached: false } });
      });

      await waitFor(() =>
        expect(screen.getByText('⚠ Download fallito — Riprova')).toBeInTheDocument()
      );
      expect(mockShareMultiple).not.toHaveBeenCalled();
    });

    it('mostra stato errore quando JOB_FAILED arriva', async () => {
      const wa = makePendingWa(['CF1/26004469']);
      mockFetchPendingWa.mockResolvedValue([wa]);
      mockEnqueue.mockResolvedValue({ success: true, jobId: 'job-pdf-1' });

      let failedHandler: WsHandler | null = null;
      wsSubscribeImpl = (event, handler) => {
        if (event === 'JOB_FAILED') failedHandler = handler;
        return () => {};
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      render(<NotificheTab {...DEFAULT_PROPS} />, { wrapper: Wrapper });
      await waitFor(() => screen.getByText('📎 Condividi con PDF'));

      await act(async () => {
        await userEvent.click(screen.getByText('📎 Condividi con PDF'));
      });

      await act(async () => {
        failedHandler!({ jobId: 'job-pdf-1' });
      });

      await waitFor(() =>
        expect(screen.getByText('⚠ Download fallito — Riprova')).toBeInTheDocument()
      );
    });
  });
});
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose NotificheTab.spec.tsx
```

Expected: FAIL — `NotificheTab` non è un named export + logica non implementata.

### Step 3.2 — Implementa le modifiche in `NotificheTab.tsx`

- [ ] **Step 3: Aggiorna gli import in `NotificheTab.tsx`**

`NotificheTab` è già un named export (`export function NotificheTab`), quindi l'import nel test funziona senza modifiche.

Sostituisci la riga degli import React (riga 1):
```ts
import { useState, useEffect } from 'react';
```
con:
```ts
import { useState, useEffect, useRef, useCallback } from 'react';
```

Aggiungi questi import dopo gli import esistenti:
```ts
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { useOperationTracking } from '../contexts/OperationTrackingContext';
import { enqueueOperation } from '../api/operations';
```

- [ ] **Step 5: Aggiungi il tipo `WaDownloadState` prima della funzione componente**

```ts
type WaDownloadState = {
  phase: 'downloading' | 'error';
  jobIds: Set<string>;
  completedJobIds: Set<string>;
  failedJobIds: Set<string>;
  alreadyCached: { blob: Blob; fileName: string }[];
};
```

- [ ] **Step 6: Aggiungi state e refs all'interno del componente**

All'inizio del corpo del componente (dopo gli altri `useState`), aggiungi:

```ts
const [downloadStates, setDownloadStates] = useState<Map<string, WaDownloadState>>(new Map());
const jobWaMapRef = useRef<Map<string, string>>(new Map());
const triggerShareRef = useRef<(waId: string) => Promise<void>>(async () => {});
const { subscribe } = useWebSocketContext();
const { trackOperation } = useOperationTracking();
```

- [ ] **Step 7: Aggiungi la funzione `doShareAllPdfs`**

Subito dopo le dichiarazioni di state/refs, aggiungi:

```ts
const doShareAllPdfs = useCallback(async (wa: PendingWa, files: { blob: Blob; fileName: string }[]) => {
  await updatePendingWaStatus(wa.id, 'opened_by_agent');
  await shareService.shareViaWhatsAppMultiple(files, wa.messageText);
  setTimeout(() => {
    updatePendingWaStatus(wa.id, 'confirmed_sent');
    setPendingWa(p => p.filter(x => x.id !== wa.id));
    setDownloadStates(prev => {
      const next = new Map(prev);
      next.delete(wa.id);
      return next;
    });
  }, 3000);
}, []);
```

- [ ] **Step 8: Aggiorna `triggerShareRef` tramite useEffect**

Aggiungi questo `useEffect` dopo `doShareAllPdfs`:

```ts
useEffect(() => {
  triggerShareRef.current = async (waId: string) => {
    const wa = pendingWa.find(w => w.id === waId);
    if (!wa) return;
    const state = downloadStates.get(waId);
    const jwt = localStorage.getItem('archibald_jwt') ?? '';
    const alreadyCachedNames = new Set((state?.alreadyCached ?? []).map(f => f.fileName));
    const allFiles: { blob: Blob; fileName: string }[] = [...(state?.alreadyCached ?? [])];

    for (const invNum of wa.invoiceNumbers) {
      const fileName = `${invNum.replace(/\//g, '_')}.pdf`;
      if (alreadyCachedNames.has(fileName)) continue;
      try {
        const res = await fetch(
          `/api/ledger/invoice-pdf?invoiceNumber=${encodeURIComponent(invNum)}`,
          { headers: { Authorization: `Bearer ${jwt}` } },
        );
        if (res.ok) allFiles.push({ blob: await res.blob(), fileName });
      } catch { /* skip — share comunque con quelli disponibili */ }
    }

    await doShareAllPdfs(wa, allFiles);
  };
}, [pendingWa, downloadStates, doShareAllPdfs]);
```

- [ ] **Step 9: Aggiungi il WS listener useEffect**

Aggiungi dopo il useEffect precedente:

```ts
useEffect(() => {
  const unsubCompleted = subscribe('JOB_COMPLETED', (payload: unknown) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const jobId = ((p.jobId ?? p.taskId) as string | undefined);
    if (!jobId) return;
    const result = p.result as Record<string, unknown> | undefined;
    const cached = result?.cached !== false;
    const waId = jobWaMapRef.current.get(jobId);
    if (!waId) return;

    setDownloadStates(prev => {
      const state = prev.get(waId);
      if (!state || state.phase !== 'downloading') return prev;
      const newCompleted = new Set(state.completedJobIds).add(jobId);
      const newFailed = cached ? state.failedJobIds : new Set(state.failedJobIds).add(jobId);
      const next = new Map(prev).set(waId, { ...state, completedJobIds: newCompleted, failedJobIds: newFailed });
      if (newCompleted.size === state.jobIds.size) {
        if (newFailed.size === 0) {
          setTimeout(() => triggerShareRef.current(waId), 0);
        } else {
          next.set(waId, { ...state, phase: 'error', completedJobIds: newCompleted, failedJobIds: newFailed });
        }
      }
      return next;
    });
  });

  const unsubFailed = subscribe('JOB_FAILED', (payload: unknown) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const jobId = ((p.jobId ?? p.taskId) as string | undefined);
    if (!jobId) return;
    const waId = jobWaMapRef.current.get(jobId);
    if (!waId) return;

    setDownloadStates(prev => {
      const state = prev.get(waId);
      if (!state || state.phase !== 'downloading') return prev;
      const newFailed = new Set(state.failedJobIds).add(jobId);
      const newCompleted = new Set(state.completedJobIds).add(jobId);
      return new Map(prev).set(waId, { ...state, phase: 'error', completedJobIds: newCompleted, failedJobIds: newFailed });
    });
  });

  return () => { unsubCompleted(); unsubFailed(); };
}, [subscribe]);
```

- [ ] **Step 10: Riscrivi `handleShareWaWithPdf`**

Sostituisci l'intera funzione `handleShareWaWithPdf` (righe 186–213) con:

```ts
const handleShareWaWithPdf = async (wa: PendingWa) => {
  const jwt = localStorage.getItem('archibald_jwt') ?? '';
  const available: { blob: Blob; fileName: string }[] = [];
  const missing: string[] = [];

  for (const invNum of wa.invoiceNumbers) {
    try {
      const res = await fetch(
        `/api/ledger/invoice-pdf?invoiceNumber=${encodeURIComponent(invNum)}`,
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      if (res.ok) {
        available.push({ blob: await res.blob(), fileName: `${invNum.replace(/\//g, '_')}.pdf` });
      } else {
        missing.push(invNum);
      }
    } catch {
      missing.push(invNum);
    }
  }

  if (missing.length === 0) {
    await doShareAllPdfs(wa, available);
    return;
  }

  const jobIds = new Set<string>();
  for (const invNum of missing) {
    try {
      const { jobId } = await enqueueOperation('cache-invoice-pdf', { invoiceNumber: invNum });
      trackOperation(invNum, jobId, `PDF ${invNum}`, 'Download PDF fattura...', 'PDF pronto', undefined, 'cache-invoice-pdf');
      jobIds.add(jobId);
      jobWaMapRef.current.set(jobId, wa.id);
    } catch { /* enqueue fallita: non aggiunge il job, gestita sotto */ }
  }

  if (jobIds.size === 0) {
    setDownloadStates(prev => new Map(prev).set(wa.id, {
      phase: 'error', jobIds: new Set(), completedJobIds: new Set(),
      failedJobIds: new Set(), alreadyCached: available,
    }));
    return;
  }

  setDownloadStates(prev => new Map(prev).set(wa.id, {
    phase: 'downloading', jobIds, completedJobIds: new Set(),
    failedJobIds: new Set(), alreadyCached: available,
  }));
};
```

- [ ] **Step 11: Aggiorna il render del bottone nella card WA pending**

Trova il blocco JSX del bottone "Condividi con PDF" (circa riga 303–308) e sostituisci l'intero blocco dei 3 bottoni con:

```tsx
{(() => {
  const dlState = downloadStates.get(wa.id);
  const isDownloading = dlState?.phase === 'downloading';
  const hasError = dlState?.phase === 'error';
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      <button
        onClick={() => updatePendingWaStatus(wa.id, 'dismissed').then(() => setPendingWa(p => p.filter(x => x.id !== wa.id)))}
        style={{ flex: '0 0 auto', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}
      >
        Ignora
      </button>
      <button
        onClick={() => {
          if (isDownloading) return;
          if (hasError) {
            setDownloadStates(prev => { const next = new Map(prev); next.delete(wa.id); return next; });
          }
          handleShareWaWithPdf(wa);
        }}
        disabled={isDownloading}
        style={{
          flex: 1, border: 'none', borderRadius: '6px', padding: '6px', fontSize: '12px',
          fontWeight: 700, color: 'white', cursor: isDownloading ? 'not-allowed' : 'pointer',
          background: hasError ? '#dc2626' : isDownloading ? '#94a3b8' : '#16a34a',
          opacity: isDownloading ? 0.85 : 1,
        }}
      >
        {hasError ? '⚠ Download fallito — Riprova' : isDownloading ? '⏳ Preparazione PDF…' : '📎 Condividi con PDF'}
      </button>
      <button
        onClick={() => handleSendWa(wa)}
        style={{ flex: '0 0 auto', background: 'white', border: '1px solid #16a34a', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 600, color: '#16a34a', cursor: 'pointer' }}
      >
        💬 Solo testo
      </button>
    </div>
  );
})()}
```

- [ ] **Step 12: Rimuovi il vecchio `handleSendWa` se rimasto invariato — verifica che non sia rotto**

Il `handleSendWa` (riga 176–183) non cambia. Lascialo invariato.

### Step 3.3 — Gate e commit

- [ ] **Step 13: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori. Se ci sono errori di tipo, correggerli prima di procedere.

- [ ] **Step 14: Esegui i test del componente**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose NotificheTab.spec.tsx
```

Expected: tutti PASS.

- [ ] **Step 15: Esegui la suite completa frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

Expected: tutti PASS, nessuna regressione.

- [ ] **Step 16: Commit**

```bash
git add archibald-web-app/frontend/src/components/NotificheTab.tsx \
        archibald-web-app/frontend/src/components/NotificheTab.spec.tsx
git commit -m "feat(notifiche): flusso asincrono Condividi con PDF — enqueue + banner tracking + share automatica"
```

---

## Verifica finale

- [ ] **Build frontend completa**

```bash
npm run build --prefix archibald-web-app/frontend
```

Expected: build senza errori.

- [ ] **Suite backend invariata**

```bash
npm test --prefix archibald-web-app/backend
```

Expected: tutti PASS (nessuna modifica backend).

- [ ] **Push**

```bash
git push
```

---

## Checklist comportamento atteso (smoke test manuale)

Aprire la scheda di un cliente con WA pending e PDF non ancora in cache:

1. Premere "Condividi con PDF" → il bottone diventa "⏳ Preparazione PDF…" (grigio, disabilitato)
2. Il GlobalOperationBanner appare in basso con "PDF CF1/... — Download PDF fattura… X%"
3. Non appare nessun `alert()` del browser
4. Premere di nuovo il bottone → nessun effetto (disabilitato)
5. Premere "💬 Solo testo" → funziona normalmente anche durante il download
6. Quando il download completa → WhatsApp si apre automaticamente con il PDF allegato
7. Se il PDF non esiste nell'ERP → bottone diventa "⚠ Download fallito — Riprova", premendo si ritenta
