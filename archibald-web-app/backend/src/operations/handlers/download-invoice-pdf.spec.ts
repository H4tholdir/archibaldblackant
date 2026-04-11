import { describe, expect, test, vi } from 'vitest';
import { handleDownloadInvoicePdf } from './download-invoice-pdf';

describe('handleDownloadInvoicePdf', () => {
  test('scarica il PDF e lo salva nel document store, ritornando il downloadKey', async () => {
    const pdfBuffer = Buffer.from('fake-invoice-pdf');
    const downloadKey = 'def-uuid';

    const bot = {
      downloadInvoicePDF: vi.fn().mockResolvedValue(pdfBuffer),
      setProgressCallback: vi.fn(),
    };
    const documentStore = {
      save: vi.fn().mockResolvedValue(downloadKey),
      get: vi.fn(),
    };
    const onProgress = vi.fn();

    const result = await handleDownloadInvoicePdf(
      bot,
      documentStore,
      { orderId: 'ORD/123', searchTerm: 'FT/789' },
      onProgress,
    );

    expect(bot.downloadInvoicePDF).toHaveBeenCalledWith('ORD/123', 'FT/789');
    expect(documentStore.save).toHaveBeenCalledWith(pdfBuffer);
    expect(result).toEqual({ downloadKey });
  });

  test('usa invoiceNumber quando searchTerm è assente', async () => {
    const pdfBuffer = Buffer.from('fake-invoice-pdf');
    const downloadKey = 'def-uuid';
    const bot = {
      downloadInvoicePDF: vi.fn().mockResolvedValue(pdfBuffer),
      setProgressCallback: vi.fn(),
    };
    const documentStore = { save: vi.fn().mockResolvedValue(downloadKey), get: vi.fn() };

    await handleDownloadInvoicePdf(bot, documentStore, { orderId: 'ORD/1', invoiceNumber: 'FT/99' }, vi.fn());

    expect(bot.downloadInvoicePDF).toHaveBeenCalledWith('ORD/1', 'FT/99');
  });

  test('usa orderId quando né searchTerm né invoiceNumber sono presenti', async () => {
    const pdfBuffer = Buffer.from('fake-invoice-pdf');
    const downloadKey = 'def-uuid';
    const bot = {
      downloadInvoicePDF: vi.fn().mockResolvedValue(pdfBuffer),
      setProgressCallback: vi.fn(),
    };
    const documentStore = { save: vi.fn().mockResolvedValue(downloadKey), get: vi.fn() };

    await handleDownloadInvoicePdf(bot, documentStore, { orderId: 'ORD/1' }, vi.fn());

    expect(bot.downloadInvoicePDF).toHaveBeenCalledWith('ORD/1', 'ORD/1');
  });
});
