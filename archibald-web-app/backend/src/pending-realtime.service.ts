import { WebSocketServerService } from "./websocket-server";
import { logger } from "./logger";
import type { WebSocketMessage } from "./types";

/**
 * Pending order event types for real-time sync
 */
export type PendingEventType =
  | "PENDING_CREATED"
  | "PENDING_UPDATED"
  | "PENDING_DELETED"
  | "PENDING_SUBMITTED"
  | "JOB_STARTED"
  | "JOB_PROGRESS"
  | "JOB_COMPLETED"
  | "JOB_FAILED";

/**
 * Pending order event payloads
 */
interface PendingOrderPayload {
  id: string;
  userId: string;
  customerId: string;
  customerName: string;
  items: Array<Record<string, unknown>>;
  status: "pending" | "syncing" | "error" | "completed-warehouse";
  discountPercent?: number;
  targetTotalWithVAT?: number;
  shippingCost?: number;
  shippingTax?: number;
  retryCount: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  deviceId: string;
  subClientCodice?: string | null;
  subClientName?: string | null;
  subClientData?: Record<string, unknown> | null;
}

export interface PendingCreatedPayload {
  pendingOrderId: string;
  pendingOrder: PendingOrderPayload;
  timestamp: string;
  deviceId: string;
}

export interface PendingUpdatedPayload {
  pendingOrderId: string;
  pendingOrder: PendingOrderPayload;
  timestamp: string;
  deviceId: string;
}

export interface PendingDeletedPayload {
  pendingOrderId: string;
  deleted: true;
  timestamp: string;
  deviceId: string;
}

export interface PendingSubmittedPayload {
  pendingOrderId: string;
  status: "syncing" | "completed-warehouse" | "error";
  errorMessage?: string;
  timestamp: string;
}

export interface JobStartedPayload {
  jobId: string;
  pendingOrderId: string;
  timestamp: string;
}

export interface JobProgressPayload {
  jobId: string;
  pendingOrderId: string;
  progress: number;
  operation: string;
  operationCategory: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface JobCompletedPayload {
  jobId: string;
  pendingOrderId: string;
  orderId: string;
  duration: number;
  timestamp: string;
}

export interface JobFailedPayload {
  jobId: string;
  pendingOrderId: string;
  error: string;
  failedAt: string;
  timestamp: string;
}

/**
 * Service responsible for broadcasting pending order events via WebSocket.
 * Integrates with REST endpoints to emit real-time events when pending orders are created/updated/deleted/submitted.
 *
 * Phase 32: Real-time pending sync via WebSocket (replaces HTTP polling)
 */
export class PendingRealtimeService {
  private static instance: PendingRealtimeService;
  private wsService: WebSocketServerService;

  private constructor() {
    this.wsService = WebSocketServerService.getInstance();
  }

  public static getInstance(): PendingRealtimeService {
    if (!PendingRealtimeService.instance) {
      PendingRealtimeService.instance = new PendingRealtimeService();
    }
    return PendingRealtimeService.instance;
  }

  /**
   * Emit PENDING_CREATED event when a new pending order is created
   */
  public emitPendingCreated(
    userId: string,
    pendingOrder: PendingCreatedPayload["pendingOrder"],
  ): void {
    try {
      const payload: PendingCreatedPayload = {
        pendingOrderId: pendingOrder.id,
        pendingOrder,
        timestamp: new Date().toISOString(),
        deviceId: pendingOrder.deviceId,
      };

      const event: WebSocketMessage = {
        type: "PENDING_CREATED",
        payload,
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[PendingRealtime] PENDING_CREATED broadcast", {
        userId,
        pendingOrderId: pendingOrder.id,
        deviceId: pendingOrder.deviceId,
      });
    } catch (error) {
      logger.error("[PendingRealtime] Failed to emit PENDING_CREATED", {
        userId,
        pendingOrderId: pendingOrder.id,
        error,
      });
    }
  }

  /**
   * Emit PENDING_UPDATED event when a pending order is modified
   */
  public emitPendingUpdated(
    userId: string,
    pendingOrder: PendingUpdatedPayload["pendingOrder"],
  ): void {
    try {
      const payload: PendingUpdatedPayload = {
        pendingOrderId: pendingOrder.id,
        pendingOrder,
        timestamp: new Date().toISOString(),
        deviceId: pendingOrder.deviceId,
      };

      const event: WebSocketMessage = {
        type: "PENDING_UPDATED",
        payload,
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[PendingRealtime] PENDING_UPDATED broadcast", {
        userId,
        pendingOrderId: pendingOrder.id,
        deviceId: pendingOrder.deviceId,
      });
    } catch (error) {
      logger.error("[PendingRealtime] Failed to emit PENDING_UPDATED", {
        userId,
        pendingOrderId: pendingOrder.id,
        error,
      });
    }
  }

  /**
   * Emit PENDING_DELETED event when a pending order is deleted
   */
  public emitPendingDeleted(
    userId: string,
    pendingOrderId: string,
    deviceId: string,
  ): void {
    try {
      const payload: PendingDeletedPayload = {
        pendingOrderId,
        deleted: true,
        timestamp: new Date().toISOString(),
        deviceId,
      };

      const event: WebSocketMessage = {
        type: "PENDING_DELETED",
        payload,
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[PendingRealtime] PENDING_DELETED broadcast", {
        userId,
        pendingOrderId,
        deviceId,
      });
    } catch (error) {
      logger.error("[PendingRealtime] Failed to emit PENDING_DELETED", {
        userId,
        pendingOrderId,
        error,
      });
    }
  }

  /**
   * Emit PENDING_SUBMITTED event when bot processes pending order (status updates)
   * Used for bot coordination: syncing → completed/error
   */
  public emitPendingSubmitted(
    userId: string,
    pendingOrderId: string,
    status: PendingSubmittedPayload["status"],
    errorMessage?: string,
  ): void {
    try {
      const payload: PendingSubmittedPayload = {
        pendingOrderId,
        status,
        errorMessage,
        timestamp: new Date().toISOString(),
      };

      const event: WebSocketMessage = {
        type: "PENDING_SUBMITTED",
        payload,
        timestamp: new Date().toISOString(),
      };

      this.wsService.broadcast(userId, event);

      logger.debug("[PendingRealtime] PENDING_SUBMITTED broadcast", {
        userId,
        pendingOrderId,
        status,
      });
    } catch (error) {
      logger.error("[PendingRealtime] Failed to emit PENDING_SUBMITTED", {
        userId,
        pendingOrderId,
        status,
        error,
      });
    }
  }

  public emitJobStarted(
    userId: string,
    jobId: string,
    pendingOrderId: string,
  ): void {
    const payload: JobStartedPayload = {
      jobId,
      pendingOrderId,
      timestamp: new Date().toISOString(),
    };
    const event: WebSocketMessage = {
      type: "JOB_STARTED",
      payload,
      timestamp: new Date().toISOString(),
    };
    this.wsService.broadcast(userId, event);
    logger.debug("[PendingRealtime] JOB_STARTED broadcast", { userId, jobId });
  }

  public emitJobProgress(
    userId: string,
    jobId: string,
    pendingOrderId: string,
    progress: number,
    operation: string,
    operationCategory: string,
    metadata?: Record<string, any>,
  ): void {
    const payload: JobProgressPayload = {
      jobId,
      pendingOrderId,
      progress,
      operation,
      operationCategory,
      metadata,
      timestamp: new Date().toISOString(),
    };
    const event: WebSocketMessage = {
      type: "JOB_PROGRESS",
      payload,
      timestamp: new Date().toISOString(),
    };
    this.wsService.broadcast(userId, event);
    logger.debug("[PendingRealtime] JOB_PROGRESS", {
      userId,
      progress,
      operation,
    });
  }

  public emitJobCompleted(
    userId: string,
    jobId: string,
    pendingOrderId: string,
    orderId: string,
    duration: number,
  ): void {
    const payload: JobCompletedPayload = {
      jobId,
      pendingOrderId,
      orderId,
      duration,
      timestamp: new Date().toISOString(),
    };
    const event: WebSocketMessage = {
      type: "JOB_COMPLETED",
      payload,
      timestamp: new Date().toISOString(),
    };
    this.wsService.broadcast(userId, event);
    logger.info("[PendingRealtime] JOB_COMPLETED", { userId, orderId });
  }

  public emitJobFailed(
    userId: string,
    jobId: string,
    pendingOrderId: string,
    error: string,
    failedAt: string,
  ): void {
    const payload: JobFailedPayload = {
      jobId,
      pendingOrderId,
      error,
      failedAt,
      timestamp: new Date().toISOString(),
    };
    const event: WebSocketMessage = {
      type: "JOB_FAILED",
      payload,
      timestamp: new Date().toISOString(),
    };
    this.wsService.broadcast(userId, event);
    logger.error("[PendingRealtime] JOB_FAILED", { userId, error });
  }
}
