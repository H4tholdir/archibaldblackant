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

  it('non fa nulla con array vuoto', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await shareService.shareViaWhatsAppMultiple([], MESSAGE);
    expect(fetchSpy).not.toHaveBeenCalled();
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
      expect((formData.get('file') as File).name).toBe('CF1_001.pdf');
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
