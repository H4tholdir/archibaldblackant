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
      'user1',
      onProgress,
    );

    expect(bot.downloadDDTPDF).toHaveBeenCalledWith('ORD/123', 'DDT/456');
    expect(documentStore.save).toHaveBeenCalledWith(pdfBuffer);
    expect(result).toEqual({ downloadKey });
  });
});
