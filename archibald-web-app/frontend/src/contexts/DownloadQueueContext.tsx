import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWebSocketContext } from "./WebSocketContext";
import { useOperationTracking } from "./OperationTrackingContext";
import { downloadPdfWithProgress } from "../api/document-download";

type DownloadQueueParams = {
  docId: string;
  orderId: string;
  orderNumberOrId: string;
  type: "ddt" | "invoice";
  token: string;
  searchTerm: string;
  docLabel: string;
  displayName: string;
};

type DownloadQueueItem = DownloadQueueParams & { queueId: string };

type DownloadQueueContextValue = {
  enqueueDownload: (params: DownloadQueueParams) => void;
  isQueued: (docId: string) => boolean;
  queuePositionOf: (docId: string) => number;
  activeDocId: string | null;
  activeProgress: { stage: string; percent: number } | null;
  pendingCount: number;
};

const DownloadQueueContext = createContext<DownloadQueueContextValue | null>(null);

function DownloadQueueProvider({ children }: { children: ReactNode }) {
  const { subscribe } = useWebSocketContext();
  const { trackOperation } = useOperationTracking();
  const [queue, setQueue] = useState<DownloadQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeProgress, setActiveProgress] = useState<{ stage: string; percent: number } | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    if (processingRef.current || queue.length === 0) return;

    processingRef.current = true;
    setIsProcessing(true);
    const item = queue[0];
    setActiveDocId(item.docId);
    setActiveProgress({ stage: "Avvio...", percent: 0 });

    const advance = (delayMs: number) => {
      setTimeout(() => {
        processingRef.current = false;
        setIsProcessing(false);
        setActiveDocId(null);
        setActiveProgress(null);
        setQueue((prev) => prev.slice(1));
      }, delayMs);
    };

    downloadPdfWithProgress(
      item.orderNumberOrId,
      item.type,
      item.token,
      (stage, percent) => setActiveProgress({ stage, percent }),
      () => advance(1500),
      () => advance(2000),
      subscribe,
      item.docLabel,
      (jobId) =>
        trackOperation(
          item.orderId,
          jobId,
          item.displayName,
          `Download ${item.docLabel}...`,
        ),
      item.searchTerm,
    );
  }, [queue, subscribe, trackOperation]);

  const enqueueDownload = useCallback((params: DownloadQueueParams) => {
    setQueue((prev) => {
      if (prev.some((item) => item.docId === params.docId)) return prev;
      return [...prev, { ...params, queueId: crypto.randomUUID() }];
    });
  }, []);

  const isQueued = useCallback(
    (docId: string) => queue.some((item) => item.docId === docId),
    [queue],
  );

  const queuePositionOf = useCallback(
    (docId: string): number => {
      const idx = queue.findIndex((item) => item.docId === docId);
      return idx === -1 ? 0 : idx + 1;
    },
    [queue],
  );

  const pendingCount = isProcessing ? Math.max(0, queue.length - 1) : queue.length;

  return (
    <DownloadQueueContext.Provider
      value={{
        enqueueDownload,
        isQueued,
        queuePositionOf,
        activeDocId,
        activeProgress,
        pendingCount,
      }}
    >
      {children}
    </DownloadQueueContext.Provider>
  );
}

function useDownloadQueue(): DownloadQueueContextValue {
  const ctx = useContext(DownloadQueueContext);
  if (!ctx) throw new Error("useDownloadQueue must be used within DownloadQueueProvider");
  return ctx;
}

export { DownloadQueueProvider, useDownloadQueue, type DownloadQueueParams };
