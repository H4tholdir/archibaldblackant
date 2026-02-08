import { db } from "../db/schema";
import { fresisHistoryService } from "./fresis-history.service";

type UpdateHandler = () => void;

interface HistoryEventPayload {
  recordId: string;
  timestamp: string;
  deleted?: boolean;
}

interface BulkImportedPayload {
  count: number;
  timestamp: string;
}

export class FresisHistoryRealtimeService {
  private static instance: FresisHistoryRealtimeService;
  private updateHandlers: Set<UpdateHandler> = new Set();

  private constructor() {}

  public static getInstance(): FresisHistoryRealtimeService {
    if (!FresisHistoryRealtimeService.instance) {
      FresisHistoryRealtimeService.instance =
        new FresisHistoryRealtimeService();
    }
    return FresisHistoryRealtimeService.instance;
  }

  public onUpdate(handler: UpdateHandler): () => void {
    this.updateHandlers.add(handler);
    return () => {
      this.updateHandlers.delete(handler);
    };
  }

  private notifyUpdate(): void {
    this.updateHandlers.forEach((handler) => {
      try {
        handler();
      } catch (error) {
        console.error(
          "[FresisHistoryRealtime] Error in update handler:",
          error,
        );
      }
    });
  }

  public async handleHistoryCreated(payload: unknown): Promise<void> {
    try {
      const data = payload as HistoryEventPayload;

      console.log(`[FresisHistoryRealtime] FRESIS_HISTORY_CREATED received`, {
        recordId: data.recordId,
      });

      await fresisHistoryService.syncFromServer();
      this.notifyUpdate();
    } catch (error) {
      console.error(
        "[FresisHistoryRealtime] Error handling FRESIS_HISTORY_CREATED:",
        error,
      );
    }
  }

  public async handleHistoryUpdated(payload: unknown): Promise<void> {
    try {
      const data = payload as HistoryEventPayload;

      console.log(`[FresisHistoryRealtime] FRESIS_HISTORY_UPDATED received`, {
        recordId: data.recordId,
      });

      await fresisHistoryService.syncFromServer();
      this.notifyUpdate();
    } catch (error) {
      console.error(
        "[FresisHistoryRealtime] Error handling FRESIS_HISTORY_UPDATED:",
        error,
      );
    }
  }

  public async handleHistoryDeleted(payload: unknown): Promise<void> {
    try {
      const data = payload as HistoryEventPayload;

      console.log(`[FresisHistoryRealtime] FRESIS_HISTORY_DELETED received`, {
        recordId: data.recordId,
      });

      await db.fresisHistory.delete(data.recordId);
      this.notifyUpdate();
    } catch (error) {
      console.error(
        "[FresisHistoryRealtime] Error handling FRESIS_HISTORY_DELETED:",
        error,
      );
    }
  }

  public async handleBulkImported(payload: unknown): Promise<void> {
    try {
      const data = payload as BulkImportedPayload;

      console.log(
        `[FresisHistoryRealtime] FRESIS_HISTORY_BULK_IMPORTED received`,
        { count: data.count },
      );

      await fresisHistoryService.syncFromServer();
      this.notifyUpdate();
    } catch (error) {
      console.error(
        "[FresisHistoryRealtime] Error handling FRESIS_HISTORY_BULK_IMPORTED:",
        error,
      );
    }
  }

  public initializeSubscriptions(
    subscribe: (
      eventType: string,
      callback: (payload: unknown) => void,
    ) => () => void,
  ): (() => void)[] {
    const unsubscribers: (() => void)[] = [];

    unsubscribers.push(
      subscribe("FRESIS_HISTORY_CREATED", (payload) =>
        this.handleHistoryCreated(payload),
      ),
    );
    unsubscribers.push(
      subscribe("FRESIS_HISTORY_UPDATED", (payload) =>
        this.handleHistoryUpdated(payload),
      ),
    );
    unsubscribers.push(
      subscribe("FRESIS_HISTORY_DELETED", (payload) =>
        this.handleHistoryDeleted(payload),
      ),
    );
    unsubscribers.push(
      subscribe("FRESIS_HISTORY_BULK_IMPORTED", (payload) =>
        this.handleBulkImported(payload),
      ),
    );

    console.log("[FresisHistoryRealtime] WebSocket subscriptions initialized");

    return unsubscribers;
  }
}
