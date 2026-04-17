import { enqueueOperation, waitForJobViaWebSocket, type SubscribeFn, type OperationType } from './operations';

function downloadPdfWithProgress(
  orderId: string,
  type: "invoice" | "ddt",
  token: string,
  onProgress: (stage: string, percent: number) => void,
  onComplete: () => void,
  onError: (error: string) => void,
  subscribe: SubscribeFn,
  docLabel?: string,
  onJobEnqueued?: (jobId: string) => void,
  searchTerm?: string,
): () => void {
  let cancelled = false;

  (async () => {
    try {
      onProgress("Avvio download...", 5);

      const operationType: OperationType = type === "invoice" ? "download-invoice-pdf" : "download-ddt-pdf";
      const { jobId } = await enqueueOperation(operationType, { orderId, searchTerm: searchTerm ?? orderId });

      if (cancelled) return;

      onJobEnqueued?.(jobId);
      onProgress("In coda...", 10);

      const result = await waitForJobViaWebSocket(jobId, {
        subscribe,
        intervalMs: 1500,
        maxWaitMs: 180_000,
        onProgress: (progress, label) => {
          if (!cancelled) {
            onProgress(label ?? "Download in corso...", progress);
          }
        },
      });

      if (cancelled) return;

      const resultData = (result.data ?? result) as Record<string, unknown>;
      const downloadKey = resultData.downloadKey as string;
      if (!downloadKey) {
        onError("Nessun documento ricevuto dal server");
        return;
      }

      onProgress("Download documento...", 95);

      const pdfResponse = await fetch(`/api/documents/download/${downloadKey}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!pdfResponse.ok) {
        onError("Errore nel download del documento");
        return;
      }

      if (cancelled) return;

      const arrayBuffer = await pdfResponse.arrayBuffer();

      if (cancelled) return;

      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${type === "ddt" ? "DDT" : docLabel ?? "Fattura"}_${orderId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(downloadUrl);

      onProgress("Download completato!", 100);
      onComplete();
    } catch (err) {
      if (!cancelled) {
        onError(err instanceof Error ? err.message : "Errore durante il download");
      }
    }
  })();

  return () => { cancelled = true; };
}

export { downloadPdfWithProgress };
