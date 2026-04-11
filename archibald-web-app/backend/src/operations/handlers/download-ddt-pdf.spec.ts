import { describe, expect, test, vi } from 'vitest';
import { handleDownloadDdtPdf } from './download-ddt-pdf';

describe('handleDownloadDdtPdf', () => {
  test('scarica il PDF e lo salva nel document store, ritornando il downloadKey', async () => {
    const pdfBuffer = Buffer.from('fake-ddt-pdf');
    const downloadKey = 'abc-uuid';

    const bot = {
      downloadDDTPDF: vi.fn().mockResolvedValue(pdfBuffer),
      setProgressCallback: vi.fn(),
    };
    const documentStore = {
      save: vi.fn().mockResolvedValue(downloadKey),
      get: vi.fn(),
    };
    const onProgress = vi.fn();

    const result = await handleDownloadDdtPdf(
      bot,
      documentStore,
      { orderId: 'ORD/123', searchTerm: 'DDT/456' },
      onProgress,
    );

    expect(bot.downloadDDTPDF).toHaveBeenCalledWith('ORD/123', 'DDT/456');
    expect(documentStore.save).toHaveBeenCalledWith(pdfBuffer);
    expect(result).toEqual({ downloadKey });
  });

  test('usa ddtNumber quando searchTerm è assente', async () => {
    const pdfBuffer = Buffer.from('fake-ddt-pdf');
    const downloadKey = 'abc-uuid';
    const bot = {
      downloadDDTPDF: vi.fn().mockResolvedValue(pdfBuffer),
      setProgressCallback: vi.fn(),
    };
    const documentStore = { save: vi.fn().mockResolvedValue(downloadKey), get: vi.fn() };

    await handleDownloadDdtPdf(bot, documentStore, { orderId: 'ORD/1', ddtNumber: 'DDT/99' }, vi.fn());

    expect(bot.downloadDDTPDF).toHaveBeenCalledWith('ORD/1', 'DDT/99');
  });

  test('usa orderId quando né searchTerm né ddtNumber sono presenti', async () => {
    const pdfBuffer = Buffer.from('fake-ddt-pdf');
    const downloadKey = 'abc-uuid';
    const bot = {
      downloadDDTPDF: vi.fn().mockResolvedValue(pdfBuffer),
      setProgressCallback: vi.fn(),
    };
    const documentStore = { save: vi.fn().mockResolvedValue(downloadKey), get: vi.fn() };

    await handleDownloadDdtPdf(bot, documentStore, { orderId: 'ORD/1' }, vi.fn());

    expect(bot.downloadDDTPDF).toHaveBeenCalledWith('ORD/1', 'ORD/1');
  });
});
