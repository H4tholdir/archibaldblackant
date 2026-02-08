import { WebSocketServerService } from "./websocket-server";
import { logger } from "./logger";
import type { WebSocketMessage } from "./types";

export type FresisHistoryEventType =
  | "FRESIS_HISTORY_CREATED"
  | "FRESIS_HISTORY_UPDATED"
  | "FRESIS_HISTORY_DELETED"
  | "FRESIS_HISTORY_BULK_IMPORTED";

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
