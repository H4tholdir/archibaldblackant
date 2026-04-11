import type { OperationHandler } from '../operation-processor';
import type { DocumentStoreLike } from '../../services/document-store';

type DownloadDdtPdfData = {
  orderId: string;
  ddtNumber?: string;
  searchTerm?: string;
};

type DownloadDdtPdfBot = {
  downloadDDTPDF: (orderId: string, ddtNumber: string) => Promise<Buffer>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleDownloadDdtPdf(
  bot: DownloadDdtPdfBot,
  documentStore: DocumentStoreLike,
  data: DownloadDdtPdfData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ downloadKey: string }> {
  bot.setProgressCallback(async (category) => {
    onProgress(50, category);
  });

  const docName = data.searchTerm ?? data.ddtNumber ?? data.orderId;
  onProgress(10, 'Download DDT PDF');
  const pdf = await bot.downloadDDTPDF(data.orderId, docName);
  onProgress(80, 'Salvataggio documento');
  const downloadKey = await documentStore.save(pdf);
  onProgress(100, 'Download completato');

  return { downloadKey };
}

function createDownloadDdtPdfHandler(
  createBot: (userId: string) => DownloadDdtPdfBot,
  documentStore: DocumentStoreLike,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as DownloadDdtPdfData;
    const result = await handleDownloadDdtPdf(bot, documentStore, typedData, userId, onProgress);
    return { downloadKey: result.downloadKey };
  };
}

export { handleDownloadDdtPdf, createDownloadDdtPdfHandler, type DownloadDdtPdfData, type DownloadDdtPdfBot };
