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

const mockUploadPdfForSharing = vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/test.pdf', id: 'test-id' });
vi.mock('../services/share.service', () => ({
  shareService: {
    uploadPDFForSharing: (...args: unknown[]) => mockUploadPdfForSharing(...args),
  },
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
  const mockWindowOpen = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchSettings.mockResolvedValue(DEFAULT_SETTINGS);
    mockFetchProfiles.mockResolvedValue([]);
    mockFetchLog.mockResolvedValue([]);
    mockFetchPendingWa.mockResolvedValue([]);
    mockUploadPdfForSharing.mockResolvedValue({ url: 'https://cdn.example.com/test.pdf', id: 'test-id' });
    vi.stubGlobal('open', mockWindowOpen);

    // Default subscribe: no-op, returns unsubscribe fn
    wsSubscribeImpl = (_event, _handler) => () => {};
  });

  describe('handleShareWaWithPdf — Fase 1: tutti i PDF disponibili in cache', () => {
    it('pre-uploada il PDF e abilita il bottone "PDF pronti", poi window.open su tap', async () => {
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

      // Il bottone diventa "PDF pronti" dopo la preparazione in background
      await waitFor(() => expect(getByText('✅ PDF pronti — Condividi ora')).toBeInTheDocument());

      // Secondo tap (gesto utente) → window.open wa.me
      await act(async () => {
        await userEvent.click(getByText('✅ PDF pronti — Condividi ora'));
      });

      expect(mockWindowOpen).toHaveBeenCalledOnce();
      const [url, target] = mockWindowOpen.mock.calls[0] as [string, string];
      expect(url).toContain('https://wa.me/');
      expect(url).toContain(encodeURIComponent(wa.messageText));
      expect(target).toBe('_blank');
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

    it('non apre WhatsApp finché i job non completano', async () => {
      const wa = makePendingWa(['CF1/26004469']);
      mockFetchPendingWa.mockResolvedValue([wa]);
      mockEnqueue.mockResolvedValue({ success: true, jobId: 'job-pdf-1' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      render(<NotificheTab {...DEFAULT_PROPS} />, { wrapper: Wrapper });
      await waitFor(() => screen.getByText('📎 Condividi con PDF'));

      await act(async () => {
        await userEvent.click(screen.getByText('📎 Condividi con PDF'));
      });

      expect(mockWindowOpen).not.toHaveBeenCalled();
    });
  });

  describe('WS listener — JOB_COMPLETED → bottone PDF pronti', () => {
    it('setta bottone "PDF pronti" quando tutti i job completano con cached=true, poi window.open su tap', async () => {
      const wa = makePendingWa(['CF1/26004469']);
      mockFetchPendingWa.mockResolvedValue([wa]);
      mockEnqueue.mockResolvedValue({ success: true, jobId: 'job-pdf-1' });

      let completedHandler: WsHandler | null = null;
      wsSubscribeImpl = (event, handler) => {
        if (event === 'JOB_COMPLETED') completedHandler = handler;
        return () => {};
      };

      // Prima fetch: PDF non disponibile (triggers enqueue)
      // Fetch successive: PDF disponibile (dopo cache)
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

      // Il bottone diventa "PDF pronti" dopo preparazione in background
      await waitFor(() => expect(screen.getByText('✅ PDF pronti — Condividi ora')).toBeInTheDocument());

      // Tap utente → window.open
      await act(async () => {
        await userEvent.click(screen.getByText('✅ PDF pronti — Condividi ora'));
      });

      expect(mockWindowOpen).toHaveBeenCalledOnce();
      const [url] = mockWindowOpen.mock.calls[0] as [string, string];
      expect(url).toContain('https://wa.me/');
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
      expect(mockWindowOpen).not.toHaveBeenCalled();
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

    it('persiste stato errore con 2 job quando il primo ha cached=false e il secondo cached=true', async () => {
      const wa = makePendingWa(['CF1/26004469', 'CF1/26004470']);
      mockFetchPendingWa.mockResolvedValue([wa]);
      mockEnqueue
        .mockResolvedValueOnce({ success: true, jobId: 'job-pdf-1' })
        .mockResolvedValueOnce({ success: true, jobId: 'job-pdf-2' });

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

      // Job 1 completa con cached=false (PDF non trovato nell'ERP)
      await act(async () => {
        completedHandler!({ jobId: 'job-pdf-1', result: { cached: false } });
      });

      // Job 2 completa con cached=true — ma uno era fallito, quindi errore
      await act(async () => {
        completedHandler!({ jobId: 'job-pdf-2', result: { cached: true } });
      });

      await waitFor(() =>
        expect(screen.getByText('⚠ Download fallito — Riprova')).toBeInTheDocument()
      );
      expect(mockWindowOpen).not.toHaveBeenCalled();
    });
  });
});
