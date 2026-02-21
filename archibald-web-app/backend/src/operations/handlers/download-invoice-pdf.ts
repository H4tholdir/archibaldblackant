import type { OperationHandler } from '../operation-processor';

type DownloadInvoicePdfData = {
  orderId: string;
  invoiceNumber: string;
};

type DownloadInvoicePdfBot = {
  ensureReadyWithContext: (context: unknown) => Promise<void>;
  downloadInvoicePDF: (orderId: string, invoiceNumber: string) => Promise<Buffer>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleDownloadInvoicePdf(
  bot: DownloadInvoicePdfBot,
  data: DownloadInvoicePdfData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ pdf: Buffer }> {
  bot.setProgressCallback(async (category) => {
    onProgress(50, category);
  });

  onProgress(10, 'Download fattura PDF');
  const pdf = await bot.downloadInvoicePDF(data.orderId, data.invoiceNumber);

  onProgress(100, 'Download completato');

  return { pdf };
}

function createDownloadInvoicePdfHandler(createBot: (userId: string) => DownloadInvoicePdfBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    await bot.ensureReadyWithContext(context);
    const typedData = data as unknown as DownloadInvoicePdfData;
    const result = await handleDownloadInvoicePdf(bot, typedData, userId, onProgress);
    return { pdf: result.pdf.toString('base64') };
  };
}

export { handleDownloadInvoicePdf, createDownloadInvoicePdfHandler, type DownloadInvoicePdfData, type DownloadInvoicePdfBot };
