import { describe, expect, test, vi } from 'vitest';
import { handleDownloadInvoicePdf, type DownloadInvoicePdfBot, type DownloadInvoicePdfData } from './download-invoice-pdf';

function createMockBot(): DownloadInvoicePdfBot {
  return {
    downloadInvoicePDF: vi.fn().mockResolvedValue(Buffer.from('invoice-pdf')),
    setProgressCallback: vi.fn(),
  };
}

const sampleData: DownloadInvoicePdfData = {
  orderId: 'ORD-001',
  invoiceNumber: 'INV-2026-001',
};

describe('handleDownloadInvoicePdf', () => {
  test('calls bot.downloadInvoicePDF with orderId', async () => {
    const bot = createMockBot();

    await handleDownloadInvoicePdf(bot, sampleData, 'user-1', vi.fn());

    expect(bot.downloadInvoicePDF).toHaveBeenCalledWith('ORD-001', 'INV-2026-001');
  });

  test('returns pdf buffer in result', async () => {
    const bot = createMockBot();

    const result = await handleDownloadInvoicePdf(bot, sampleData, 'user-1', vi.fn());

    expect(result.pdf).toBeInstanceOf(Buffer);
    expect(result.pdf.toString()).toBe('invoice-pdf');
  });

  test('reports progress at 100 on completion', async () => {
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleDownloadInvoicePdf(bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  test('throws when bot fails to download', async () => {
    const bot = createMockBot();
    (bot.downloadInvoicePDF as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invoice download failed'));

    await expect(
      handleDownloadInvoicePdf(bot, sampleData, 'user-1', vi.fn()),
    ).rejects.toThrow('Invoice download failed');
  });
});
