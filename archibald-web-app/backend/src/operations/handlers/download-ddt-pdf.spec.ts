import { describe, expect, test, vi } from 'vitest';
import { handleDownloadDdtPdf, type DownloadDdtPdfBot, type DownloadDdtPdfData } from './download-ddt-pdf';

function createMockBot(): DownloadDdtPdfBot {
  return {
    downloadDDTPDF: vi.fn().mockResolvedValue(Buffer.from('pdf-content')),
    setProgressCallback: vi.fn(),
  };
}

const sampleData: DownloadDdtPdfData = {
  orderId: 'ORD-001',
  ddtNumber: 'DDT-2026-001',
};

describe('handleDownloadDdtPdf', () => {
  test('calls bot.downloadDDTPDF with orderId', async () => {
    const bot = createMockBot();

    await handleDownloadDdtPdf(bot, sampleData, 'user-1', vi.fn());

    expect(bot.downloadDDTPDF).toHaveBeenCalledWith('ORD-001', 'DDT-2026-001');
  });

  test('returns pdf buffer in result', async () => {
    const bot = createMockBot();

    const result = await handleDownloadDdtPdf(bot, sampleData, 'user-1', vi.fn());

    expect(result.pdf).toBeInstanceOf(Buffer);
    expect(result.pdf.toString()).toBe('pdf-content');
  });

  test('reports progress at 100 on completion', async () => {
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleDownloadDdtPdf(bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  test('throws when bot fails to download', async () => {
    const bot = createMockBot();
    (bot.downloadDDTPDF as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Download failed'));

    await expect(
      handleDownloadDdtPdf(bot, sampleData, 'user-1', vi.fn()),
    ).rejects.toThrow('Download failed');
  });
});
