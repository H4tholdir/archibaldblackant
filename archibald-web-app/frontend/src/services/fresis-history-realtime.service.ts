import { db } from "../db/schema";
import { fresisHistoryService } from "./fresis-history.service";

type UpdateHandler = () => void;

interface HistoryEventPayload {
  recordId: string;
  timestamp: string;
  deleted?: boolean;
}

interface DeleteProgressPayload {
  recordId: string;
  progress: number;
  operation: string;
  timestamp: string;
}

interface BulkImportedPayload {
  count: number;
  timestamp: string;
}

export interface DeleteProgressState {
  progress: number;
  operation: string;
}

export interface EditProgressState {
  progress: number;
  operation: string;
}

export class FresisHistoryRealtimeService {
  private static instance: FresisHistoryRealtimeService;
  private updateHandlers: Set<UpdateHandler> = new Set();
  private deleteProgressHandlers: Set<UpdateHandler> = new Set();
  private _deleteProgressMap: Map<string, DeleteProgressState> = new Map();
  private editProgressHandlers: Set<UpdateHandler> = new Set();
  private _editProgressMap: Map<string, EditProgressState> = new Map();
  private orderEditProgressHandlers: Set<UpdateHandler> = new Set();
  private _orderEditProgressMap: Map<string, EditProgressState> = new Map();

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

  public getDeleteProgress(recordId: string): DeleteProgressState | undefined {
    return this._deleteProgressMap.get(recordId);
  }

  public clearDeleteProgress(recordId: string): void {
    this._deleteProgressMap.delete(recordId);
  }

  public onDeleteProgress(handler: UpdateHandler): () => void {
    this.deleteProgressHandlers.add(handler);
    return () => {
      this.deleteProgressHandlers.delete(handler);
    };
  }

  private notifyDeleteProgress(): void {
    this.deleteProgressHandlers.forEach((handler) => {
      try {
        handler();
      } catch (error) {
        console.error(
          "[FresisHistoryRealtime] Error in delete progress handler:",
          error,
        );
      }
    });
  }

  public handleDeleteProgress(payload: unknown): void {
    try {
      const data = payload as DeleteProgressPayload;
      this._deleteProgressMap.set(data.recordId, {
        progress: data.progress,
        operation: data.operation,
      });
      this.notifyDeleteProgress();
    } catch (error) {
      console.error(
        "[FresisHistoryRealtime] Error handling FRESIS_HISTORY_DELETE_PROGRESS:",
        error,
      );
    }
  }

  public getEditProgress(recordId: string): EditProgressState | undefined {
    return this._editProgressMap.get(recordId);
  }

  public clearEditProgress(recordId: string): void {
    this._editProgressMap.delete(recordId);
  }

  public onEditProgress(handler: UpdateHandler): () => void {
    this.editProgressHandlers.add(handler);
    return () => {
      this.editProgressHandlers.delete(handler);
    };
  }

  private notifyEditProgress(): void {
    this.editProgressHandlers.forEach((handler) => {
      try {
        handler();
      } catch (error) {
        console.error(
          "[FresisHistoryRealtime] Error in edit progress handler:",
          error,
        );
      }
    });
  }

  public handleEditProgress(payload: unknown): void {
    try {
      const data = payload as DeleteProgressPayload;
      this._editProgressMap.set(data.recordId, {
        progress: data.progress,
        operation: data.operation,
      });
      this.notifyEditProgress();
    } catch (error) {
      console.error(
        "[FresisHistoryRealtime] Error handling FRESIS_HISTORY_EDIT_PROGRESS:",
        error,
      );
    }
  }

  public getOrderEditProgress(orderId: string): EditProgressState | undefined {
    return this._orderEditProgressMap.get(orderId);
  }

  public clearOrderEditProgress(orderId: string): void {
    this._orderEditProgressMap.delete(orderId);
  }

  public onOrderEditProgress(handler: UpdateHandler): () => void {
    this.orderEditProgressHandlers.add(handler);
    return () => {
      this.orderEditProgressHandlers.delete(handler);
    };
  }

  private notifyOrderEditProgress(): void {
    this.orderEditProgressHandlers.forEach((handler) => {
      try {
        handler();
      } catch (error) {
        console.error(
          "[FresisHistoryRealtime] Error in order edit progress handler:",
          error,
        );
      }
    });
  }

  public handleOrderEditProgress(payload: unknown): void {
    try {
      const data = payload as DeleteProgressPayload;
      this._orderEditProgressMap.set(data.recordId, {
        progress: data.progress,
        operation: data.operation,
      });
      this.notifyOrderEditProgress();
    } catch (error) {
      console.error(
        "[FresisHistoryRealtime] Error handling ORDER_EDIT_PROGRESS:",
        error,
      );
    }
  }

  public handleOrderEditComplete(payload: unknown): void {
    try {
      const data = payload as HistoryEventPayload;
      this._orderEditProgressMap.delete(data.recordId);
      this.notifyOrderEditProgress();
    } catch (error) {
      console.error(
        "[FresisHistoryRealtime] Error handling ORDER_EDIT_COMPLETE:",
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
      subscribe("FRESIS_HISTORY_DELETE_PROGRESS", (payload) =>
        this.handleDeleteProgress(payload),
      ),
    );
    unsubscribers.push(
      subscribe("FRESIS_HISTORY_EDIT_PROGRESS", (payload) =>
        this.handleEditProgress(payload),
      ),
    );
    unsubscribers.push(
      subscribe("FRESIS_HISTORY_BULK_IMPORTED", (payload) =>
        this.handleBulkImported(payload),
      ),
    );
    unsubscribers.push(
      subscribe("ORDER_EDIT_PROGRESS", (payload) =>
        this.handleOrderEditProgress(payload),
      ),
    );
    unsubscribers.push(
      subscribe("ORDER_EDIT_COMPLETE", (payload) =>
        this.handleOrderEditComplete(payload),
      ),
    );

    console.log("[FresisHistoryRealtime] WebSocket subscriptions initialized");

    return unsubscribers;
  }
}
