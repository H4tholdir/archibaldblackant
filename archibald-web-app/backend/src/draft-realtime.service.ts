import { WebSocketServerService } from "./websocket-server";
import { logger } from "./logger";
import type { WebSocketMessage } from "./types";

/**
 * Draft order event types for real-time sync
 */
export type DraftEventType =
  | "DRAFT_CREATED"
  | "DRAFT_UPDATED"
  | "DRAFT_DELETED"
  | "DRAFT_CONVERTED";

/**
 * Draft order event payloads
 */
export interface DraftCreatedPayload {
  draftId: string;
  draft: {
    id: string;
    customerId: string;
    customerName: string;
    items: Array<{
      productId: string;
      productName: string;
      article: string;
      variantId: string;
      quantity: number;
      packageContent: string;
    }>;
    createdAt: string;
    updatedAt: string;
    deviceId: string;
  };
  timestamp: string;
  deviceId: string;
}

export interface DraftUpdatedPayload {
  draftId: string;
  draft: {
    id: string;
    customerId: string;
    customerName: string;
    items: Array<{
      productId: string;
      productName: string;
      article: string;
      variantId: string;
      quantity: number;
      packageContent: string;
    }>;
    createdAt: string;
    updatedAt: string;
    deviceId: string;
  };
  timestamp: string;
  deviceId: string;
}

export interface DraftDeletedPayload {
  draftId: string;
  deleted: true;
  timestamp: string;
  deviceId: string;
}

export interface DraftConvertedPayload {
  draftId: string;
  pendingOrderId: string;
  timestamp: string;
  deviceId: string;
}

/**
 * Service responsible for broadcasting draft order events via WebSocket.
 * Integrates with REST endpoints to emit real-time events when drafts are created/updated/deleted/converted.
 *
 * Phase 31: Real-time draft sync via WebSocket (replaces HTTP polling)
 */
export class DraftRealtimeService {
  private static instance: DraftRealtimeService;
  private wsService: WebSocketServerService;

  private constructor() {
    this.wsService = WebSocketServerService.getInstance();
  }

  public static getInstance(): DraftRealtimeService {
    if (!DraftRealtimeService.instance) {
      DraftRealtimeService.instance = new DraftRealtimeService();
    }
    return DraftRealtimeService.instance;
  }

  /**
   * Emit DRAFT_CREATED event when a new draft is created
   */
  public emitDraftCreated(
    userId: string,
    draft: DraftCreatedPayload["draft"],
  ): void {
    try {
      const payload: DraftCreatedPayload = {
        draftId: draft.id,
        draft,
        timestamp: new Date().toISOString(),
        deviceId: draft.deviceId,
      };

      const event: WebSocketMessage = {
        type: "DRAFT_CREATED",
        payload,
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[DraftRealtime] DRAFT_CREATED broadcast", {
        userId,
        draftId: draft.id,
        deviceId: draft.deviceId,
      });
    } catch (error) {
      logger.error("[DraftRealtime] Failed to emit DRAFT_CREATED", {
        userId,
        draftId: draft.id,
        error,
      });
    }
  }

  /**
   * Emit DRAFT_UPDATED event when a draft is modified
   */
  public emitDraftUpdated(
    userId: string,
    draft: DraftUpdatedPayload["draft"],
  ): void {
    try {
      const payload: DraftUpdatedPayload = {
        draftId: draft.id,
        draft,
        timestamp: new Date().toISOString(),
        deviceId: draft.deviceId,
      };

      const event: WebSocketMessage = {
        type: "DRAFT_UPDATED",
        payload,
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[DraftRealtime] DRAFT_UPDATED broadcast", {
        userId,
        draftId: draft.id,
        deviceId: draft.deviceId,
      });
    } catch (error) {
      logger.error("[DraftRealtime] Failed to emit DRAFT_UPDATED", {
        userId,
        draftId: draft.id,
        error,
      });
    }
  }

  /**
   * Emit DRAFT_DELETED event when a draft is deleted
   */
  public emitDraftDeleted(
    userId: string,
    draftId: string,
    deviceId: string,
  ): void {
    try {
      const payload: DraftDeletedPayload = {
        draftId,
        deleted: true,
        timestamp: new Date().toISOString(),
        deviceId,
      };

      const event: WebSocketMessage = {
        type: "DRAFT_DELETED",
        payload,
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[DraftRealtime] DRAFT_DELETED broadcast", {
        userId,
        draftId,
        deviceId,
      });
    } catch (error) {
      logger.error("[DraftRealtime] Failed to emit DRAFT_DELETED", {
        userId,
        draftId,
        error,
      });
    }
  }

  /**
   * Emit DRAFT_CONVERTED event when a draft is converted to a pending order
   */
  public emitDraftConverted(
    userId: string,
    draftId: string,
    pendingOrderId: string,
    deviceId: string,
  ): void {
    try {
      const payload: DraftConvertedPayload = {
        draftId,
        pendingOrderId,
        timestamp: new Date().toISOString(),
        deviceId,
      };

      const event: WebSocketMessage = {
        type: "DRAFT_CONVERTED",
        payload,
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[DraftRealtime] DRAFT_CONVERTED broadcast", {
        userId,
        draftId,
        pendingOrderId,
        deviceId,
      });
    } catch (error) {
      logger.error("[DraftRealtime] Failed to emit DRAFT_CONVERTED", {
        userId,
        draftId,
        pendingOrderId,
        error,
      });
    }
  }
}
