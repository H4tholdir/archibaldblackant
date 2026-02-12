import { WebSocketServerService } from "./websocket-server";
import { logger } from "./logger";
import type { WebSocketMessage } from "./types";

export type FresisHistoryEventType =
  | "FRESIS_HISTORY_CREATED"
  | "FRESIS_HISTORY_UPDATED"
  | "FRESIS_HISTORY_DELETED"
  | "FRESIS_HISTORY_DELETE_PROGRESS"
  | "FRESIS_HISTORY_EDIT_PROGRESS"
  | "FRESIS_HISTORY_BULK_IMPORTED"
  | "ORDER_EDIT_PROGRESS"
  | "ORDER_EDIT_COMPLETE"
  | "ORDER_DELETE_PROGRESS"
  | "ORDER_DELETE_COMPLETE"
  | "ORDER_SEND_TO_VERONA_PROGRESS";

export class FresisHistoryRealtimeService {
  private static instance: FresisHistoryRealtimeService;
  private wsService: WebSocketServerService;

  private constructor() {
    this.wsService = WebSocketServerService.getInstance();
  }

  public static getInstance(): FresisHistoryRealtimeService {
    if (!FresisHistoryRealtimeService.instance) {
      FresisHistoryRealtimeService.instance =
        new FresisHistoryRealtimeService();
    }
    return FresisHistoryRealtimeService.instance;
  }

  public emitHistoryCreated(userId: string, recordId: string): void {
    try {
      const event: WebSocketMessage = {
        type: "FRESIS_HISTORY_CREATED",
        payload: {
          recordId,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[FresisHistoryRealtime] FRESIS_HISTORY_CREATED broadcast", {
        userId,
        recordId,
      });
    } catch (error) {
      logger.error(
        "[FresisHistoryRealtime] Failed to emit FRESIS_HISTORY_CREATED",
        { userId, recordId, error },
      );
    }
  }

  public emitHistoryUpdated(userId: string, recordId: string): void {
    try {
      const event: WebSocketMessage = {
        type: "FRESIS_HISTORY_UPDATED",
        payload: {
          recordId,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[FresisHistoryRealtime] FRESIS_HISTORY_UPDATED broadcast", {
        userId,
        recordId,
      });
    } catch (error) {
      logger.error(
        "[FresisHistoryRealtime] Failed to emit FRESIS_HISTORY_UPDATED",
        { userId, recordId, error },
      );
    }
  }

  public emitHistoryDeleted(userId: string, recordId: string): void {
    try {
      const event: WebSocketMessage = {
        type: "FRESIS_HISTORY_DELETED",
        payload: {
          recordId,
          deleted: true,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[FresisHistoryRealtime] FRESIS_HISTORY_DELETED broadcast", {
        userId,
        recordId,
      });
    } catch (error) {
      logger.error(
        "[FresisHistoryRealtime] Failed to emit FRESIS_HISTORY_DELETED",
        { userId, recordId, error },
      );
    }
  }

  public emitDeleteProgress(
    userId: string,
    recordId: string,
    progress: number,
    operation: string,
  ): void {
    try {
      const event: WebSocketMessage = {
        type: "FRESIS_HISTORY_DELETE_PROGRESS",
        payload: {
          recordId,
          progress,
          operation,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);
    } catch (error) {
      logger.error(
        "[FresisHistoryRealtime] Failed to emit FRESIS_HISTORY_DELETE_PROGRESS",
        { userId, recordId, error },
      );
    }
  }

  public emitEditProgress(
    userId: string,
    recordId: string,
    progress: number,
    operation: string,
  ): void {
    try {
      const event: WebSocketMessage = {
        type: "FRESIS_HISTORY_EDIT_PROGRESS",
        payload: {
          recordId,
          progress,
          operation,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);
    } catch (error) {
      logger.error(
        "[FresisHistoryRealtime] Failed to emit FRESIS_HISTORY_EDIT_PROGRESS",
        { userId, recordId, error },
      );
    }
  }

  public emitOrderEditProgress(
    userId: string,
    orderId: string,
    progress: number,
    operation: string,
  ): void {
    try {
      const event: WebSocketMessage = {
        type: "ORDER_EDIT_PROGRESS",
        payload: {
          recordId: orderId,
          progress,
          operation,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);
    } catch (error) {
      logger.error(
        "[FresisHistoryRealtime] Failed to emit ORDER_EDIT_PROGRESS",
        { userId, orderId, error },
      );
    }
  }

  public emitOrderEditComplete(userId: string, orderId: string): void {
    try {
      const event: WebSocketMessage = {
        type: "ORDER_EDIT_COMPLETE",
        payload: {
          recordId: orderId,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[FresisHistoryRealtime] ORDER_EDIT_COMPLETE broadcast", {
        userId,
        orderId,
      });
    } catch (error) {
      logger.error(
        "[FresisHistoryRealtime] Failed to emit ORDER_EDIT_COMPLETE",
        { userId, orderId, error },
      );
    }
  }

  public emitOrderDeleteProgress(
    userId: string,
    orderId: string,
    progress: number,
    operation: string,
  ): void {
    try {
      const event: WebSocketMessage = {
        type: "ORDER_DELETE_PROGRESS",
        payload: {
          recordId: orderId,
          progress,
          operation,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);
    } catch (error) {
      logger.error(
        "[FresisHistoryRealtime] Failed to emit ORDER_DELETE_PROGRESS",
        { userId, orderId, error },
      );
    }
  }

  public emitOrderDeleteComplete(userId: string, orderId: string): void {
    try {
      const event: WebSocketMessage = {
        type: "ORDER_DELETE_COMPLETE",
        payload: {
          recordId: orderId,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[FresisHistoryRealtime] ORDER_DELETE_COMPLETE broadcast", {
        userId,
        orderId,
      });
    } catch (error) {
      logger.error(
        "[FresisHistoryRealtime] Failed to emit ORDER_DELETE_COMPLETE",
        { userId, orderId, error },
      );
    }
  }

  public emitSendToVeronaProgress(
    userId: string,
    orderId: string,
    progress: number,
    operation: string,
  ): void {
    try {
      const event: WebSocketMessage = {
        type: "ORDER_SEND_TO_VERONA_PROGRESS",
        payload: {
          recordId: orderId,
          progress,
          operation,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);
    } catch (error) {
      logger.error(
        "[FresisHistoryRealtime] Failed to emit ORDER_SEND_TO_VERONA_PROGRESS",
        { userId, orderId, error },
      );
    }
  }

  public emitBulkImported(userId: string, count: number): void {
    try {
      const event: WebSocketMessage = {
        type: "FRESIS_HISTORY_BULK_IMPORTED",
        payload: {
          count,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug(
        "[FresisHistoryRealtime] FRESIS_HISTORY_BULK_IMPORTED broadcast",
        { userId, count },
      );
    } catch (error) {
      logger.error(
        "[FresisHistoryRealtime] Failed to emit FRESIS_HISTORY_BULK_IMPORTED",
        { userId, count, error },
      );
    }
  }
}
