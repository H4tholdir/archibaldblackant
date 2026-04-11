import type { OperationHandler } from '../operation-processor';
import type { DocumentStoreLike } from '../../services/document-store';

type DownloadInvoicePdfData = {
  orderId: string;
  invoiceNumber?: string;
  searchTerm?: string;
};

type DownloadInvoicePdfBot = {
  downloadInvoicePDF: (orderId: string, invoiceNumber: string) => Promise<Buffer>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleDownloadInvoicePdf(
  bot: DownloadInvoicePdfBot,
  documentStore: DocumentStoreLike,
  data: DownloadInvoicePdfData,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ downloadKey: string }> {
  bot.setProgressCallback(async (category, metadata) => {
    const progress = typeof metadata?.progress === 'number' ? metadata.progress : 50;
    onProgress(progress, category);
  });

  const docName = data.searchTerm ?? data.invoiceNumber ?? data.orderId;
  onProgress(10, 'Download fattura PDF');
  const pdf = await bot.downloadInvoicePDF(data.orderId, docName);
  onProgress(80, 'Salvataggio documento');
  const downloadKey = await documentStore.save(pdf);
  onProgress(100, 'Download completato');

  return { downloadKey };
}

function createDownloadInvoicePdfHandler(
  createBot: (userId: string) => DownloadInvoicePdfBot,
  documentStore: DocumentStoreLike,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as DownloadInvoicePdfData;
    return handleDownloadInvoicePdf(bot, documentStore, typedData, onProgress);
  };
}

export { handleDownloadInvoicePdf, createDownloadInvoicePdfHandler, type DownloadInvoicePdfData, type DownloadInvoicePdfBot };
