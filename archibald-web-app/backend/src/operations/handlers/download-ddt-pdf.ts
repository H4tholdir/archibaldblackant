import type { OperationHandler } from '../operation-processor';

type DownloadDdtPdfData = {
  orderId: string;
  ddtNumber: string;
};

type DownloadDdtPdfBot = {
  downloadDDTPDF: (orderId: string, ddtNumber: string) => Promise<Buffer>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleDownloadDdtPdf(
  bot: DownloadDdtPdfBot,
  data: DownloadDdtPdfData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ pdf: Buffer }> {
  bot.setProgressCallback(async (category) => {
    onProgress(50, category);
  });

  onProgress(10, 'Download DDT PDF');
  const pdf = await bot.downloadDDTPDF(data.orderId, data.ddtNumber);

  onProgress(100, 'Download completato');

  return { pdf };
}

function createDownloadDdtPdfHandler(createBot: (userId: string) => DownloadDdtPdfBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as DownloadDdtPdfData;
    const result = await handleDownloadDdtPdf(bot, typedData, userId, onProgress);
    return { pdf: result.pdf.toString('base64') };
  };
}

export { handleDownloadDdtPdf, createDownloadDdtPdfHandler, type DownloadDdtPdfData, type DownloadDdtPdfBot };
