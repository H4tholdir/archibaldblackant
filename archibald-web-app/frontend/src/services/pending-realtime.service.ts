/**
 * Frontend Pending Order Real-Time Service
 *
 * Subscribes to pending order events from WebSocket and updates IndexedDB.
 * Implements Last-Write-Wins conflict resolution using serverUpdatedAt timestamps.
 *
 * Phase 32: Real-time pending sync via WebSocket
 */

import { db } from "../db/schema";
import type { PendingOrder } from "../db/schema";
import { getDeviceId } from "../utils/device-id";

/**
 * Pending order event payloads from backend
 */
interface PendingCreatedPayload {
  pendingOrderId: string;
  pendingOrder: {
    id: string;
    userId: string;
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
    originDraftId?: string;
  };
  timestamp: string;
  deviceId: string;
}

interface PendingUpdatedPayload {
  pendingOrderId: string;
  pendingOrder: {
    id: string;
    userId: string;
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
    originDraftId?: string;
  };
  timestamp: string;
  deviceId: string;
}

interface PendingDeletedPayload {
  pendingOrderId: string;
  deleted: true;
  timestamp: string;
  deviceId: string;
}

interface PendingSubmittedPayload {
  pendingOrderId: string;
  status: "syncing" | "completed-warehouse" | "error";
  errorMessage?: string;
  timestamp: string;
}

interface JobStartedPayload {
  jobId: string;
  pendingOrderId: string;
  timestamp: string;
}

interface JobProgressPayload {
  jobId: string;
  pendingOrderId: string;
  progress: number;
  operation: string;
  operationCategory: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

interface JobCompletedPayload {
  jobId: string;
  pendingOrderId: string;
  orderId: string;
  duration: number;
  timestamp: string;
}

interface JobFailedPayload {
  jobId: string;
  pendingOrderId: string;
  error: string;
  failedAt: string;
  timestamp: string;
}

/**
 * Event handler type for pending order updates
 */
export type PendingUpdateHandler = () => void;

/**
 * PendingRealtimeService manages real-time pending order synchronization via WebSocket.
 *
 * Responsibilities:
 * - Subscribe to PENDING_* events from WebSocket
 * - Apply updates to IndexedDB with Last-Write-Wins conflict resolution
 * - Handle bot status updates (PENDING_SUBMITTED events)
 * - Filter own deviceId to prevent echo (except for PENDING_SUBMITTED)
 * - Emit UI update events for React components
 */
const PROGRESS_FLUSH_INTERVAL_MS = 300;

export class PendingRealtimeService {
  private static instance: PendingRealtimeService;
  private deviceId: string;
  private updateHandlers: Set<PendingUpdateHandler> = new Set();
  private pendingProgressUpdates: Map<string, JobProgressPayload> = new Map();
  private progressFlushTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    this.deviceId = getDeviceId();
  }

  public static getInstance(): PendingRealtimeService {
    if (!PendingRealtimeService.instance) {
      PendingRealtimeService.instance = new PendingRealtimeService();
    }
    return PendingRealtimeService.instance;
  }

  /**
   * Register a UI update handler (called when pending orders change)
   */
  public onUpdate(handler: PendingUpdateHandler): () => void {
    this.updateHandlers.add(handler);
    return () => {
      this.updateHandlers.delete(handler);
    };
  }

  /**
   * Notify all registered handlers that pending orders have changed
   */
  private notifyUpdate(): void {
    this.updateHandlers.forEach((handler) => {
      try {
        handler();
      } catch (error) {
        console.error("[PendingRealtime] Error in update handler:", error);
      }
    });
  }

  /**
   * Handle PENDING_CREATED event
   */
  public async handlePendingCreated(payload: unknown): Promise<void> {
    try {
      const data = payload as PendingCreatedPayload;

      // Filter own device to prevent echo
      if (data.deviceId === this.deviceId) {
        console.log(
          `[PendingRealtime] Ignoring PENDING_CREATED echo from own device`,
          {
            pendingOrderId: data.pendingOrderId,
          },
        );
        return;
      }

      // Check if pending order already exists
      const existing = await db.pendingOrders.get(data.pendingOrder.id);

      if (existing) {
        console.log(
          `[PendingRealtime] Pending order already exists, skipping PENDING_CREATED`,
          {
            pendingOrderId: data.pendingOrder.id,
          },
        );
        return;
      }

      // Convert backend items to frontend PendingOrderItem format
      const items = data.pendingOrder.items.map((item) => ({
        articleCode: item.article,
        articleId: item.variantId,
        productName: item.productName,
        description: item.productName,
        quantity: item.quantity,
        price: 0, // Backend doesn't send prices in real-time events
        vat: 0,
        discount: 0,
      }));

      // Insert pending order into IndexedDB
      const pendingOrder: PendingOrder = {
        id: data.pendingOrder.id,
        customerId: data.pendingOrder.customerId,
        customerName: data.pendingOrder.customerName,
        items,
        status: data.pendingOrder.status,
        discountPercent: data.pendingOrder.discountPercent,
        targetTotalWithVAT: data.pendingOrder.targetTotalWithVAT,
        shippingCost: data.pendingOrder.shippingCost,
        shippingTax: data.pendingOrder.shippingTax,
        retryCount: data.pendingOrder.retryCount,
        errorMessage: data.pendingOrder.errorMessage,
        createdAt: new Date(data.pendingOrder.createdAt).toISOString(),
        updatedAt: new Date(data.pendingOrder.updatedAt).toISOString(),
        deviceId: data.pendingOrder.deviceId,
        needsSync: false, // Already synced via WebSocket
        serverUpdatedAt: new Date(data.timestamp).getTime(),
        originDraftId: data.pendingOrder.originDraftId,
      };

      await db.pendingOrders.put(pendingOrder);

      console.log(`[PendingRealtime] PENDING_CREATED applied to IndexedDB`, {
        pendingOrderId: data.pendingOrder.id,
        customerId: data.pendingOrder.customerId,
      });

      this.notifyUpdate();
    } catch (error) {
      console.error(
        "[PendingRealtime] Error handling PENDING_CREATED:",
        error,
        payload,
      );
    }
  }

  /**
   * Handle PENDING_UPDATED event
   */
  public async handlePendingUpdated(payload: unknown): Promise<void> {
    try {
      const data = payload as PendingUpdatedPayload;

      // Filter own device to prevent echo
      if (data.deviceId === this.deviceId) {
        console.log(
          `[PendingRealtime] Ignoring PENDING_UPDATED echo from own device`,
          {
            pendingOrderId: data.pendingOrderId,
          },
        );
        return;
      }

      // Check if pending order exists locally
      const existing = await db.pendingOrders.get(data.pendingOrder.id);
      const incomingTimestamp = new Date(data.timestamp).getTime();

      // Last-Write-Wins conflict resolution
      if (existing && existing.serverUpdatedAt) {
        if (existing.serverUpdatedAt >= incomingTimestamp) {
          console.log(
            `[PendingRealtime] Local pending order is newer, skipping PENDING_UPDATED`,
            {
              pendingOrderId: data.pendingOrder.id,
              localTimestamp: existing.serverUpdatedAt,
              incomingTimestamp,
            },
          );
          return;
        }
      }

      // Convert backend items to frontend PendingOrderItem format
      const items = data.pendingOrder.items.map((item) => ({
        articleCode: item.article,
        articleId: item.variantId,
        productName: item.productName,
        description: item.productName,
        quantity: item.quantity,
        price: 0, // Backend doesn't send prices in real-time events
        vat: 0,
        discount: 0,
      }));

      // Upsert pending order with serverUpdatedAt
      const pendingOrder: PendingOrder = {
        id: data.pendingOrder.id,
        customerId: data.pendingOrder.customerId,
        customerName: data.pendingOrder.customerName,
        items,
        status: data.pendingOrder.status,
        discountPercent: data.pendingOrder.discountPercent,
        targetTotalWithVAT: data.pendingOrder.targetTotalWithVAT,
        shippingCost: data.pendingOrder.shippingCost,
        shippingTax: data.pendingOrder.shippingTax,
        retryCount: data.pendingOrder.retryCount,
        errorMessage: data.pendingOrder.errorMessage,
        createdAt: new Date(data.pendingOrder.createdAt).toISOString(),
        updatedAt: new Date(data.pendingOrder.updatedAt).toISOString(),
        deviceId: data.pendingOrder.deviceId,
        needsSync: false, // Already synced via WebSocket
        serverUpdatedAt: incomingTimestamp,
        originDraftId: data.pendingOrder.originDraftId,
      };

      await db.pendingOrders.put(pendingOrder);

      console.log(`[PendingRealtime] PENDING_UPDATED applied to IndexedDB`, {
        pendingOrderId: data.pendingOrder.id,
        serverUpdatedAt: incomingTimestamp,
      });

      this.notifyUpdate();
    } catch (error) {
      console.error(
        "[PendingRealtime] Error handling PENDING_UPDATED:",
        error,
        payload,
      );
    }
  }

  /**
   * Handle PENDING_DELETED event
   */
  public async handlePendingDeleted(payload: unknown): Promise<void> {
    try {
      const data = payload as PendingDeletedPayload;

      // Filter own device to prevent echo
      if (data.deviceId === this.deviceId) {
        console.log(
          `[PendingRealtime] Ignoring PENDING_DELETED echo from own device`,
          {
            pendingOrderId: data.pendingOrderId,
          },
        );
        return;
      }

      // Perform direct deletion from IndexedDB
      await db.pendingOrders.delete(data.pendingOrderId);

      console.log(`[PendingRealtime] PENDING_DELETED applied to IndexedDB`, {
        pendingOrderId: data.pendingOrderId,
      });

      this.notifyUpdate();
    } catch (error) {
      console.error(
        "[PendingRealtime] Error handling PENDING_DELETED:",
        error,
        payload,
      );
    }
  }

  /**
   * Handle PENDING_SUBMITTED event (bot status updates)
   * This event is authoritative from the server and always wins
   */
  public async handlePendingSubmitted(payload: unknown): Promise<void> {
    try {
      const data = payload as PendingSubmittedPayload;

      // DO NOT filter own device - bot events are server-side and should always apply
      console.log(
        `[PendingRealtime] Handling PENDING_SUBMITTED (bot status update)`,
        {
          pendingOrderId: data.pendingOrderId,
          status: data.status,
        },
      );

      // Get existing pending order
      const existing = await db.pendingOrders.get(data.pendingOrderId);

      if (!existing) {
        console.log(
          `[PendingRealtime] Pending order not found, skipping PENDING_SUBMITTED`,
          {
            pendingOrderId: data.pendingOrderId,
          },
        );
        return;
      }

      // Update status (bot status updates are authoritative)
      await db.pendingOrders.put({
        ...existing,
        status: data.status,
        errorMessage: data.errorMessage,
        updatedAt: new Date().toISOString(),
        serverUpdatedAt: new Date(data.timestamp).getTime(),
      });

      console.log(`[PendingRealtime] PENDING_SUBMITTED applied to IndexedDB`, {
        pendingOrderId: data.pendingOrderId,
        status: data.status,
      });

      this.notifyUpdate();
    } catch (error) {
      console.error(
        "[PendingRealtime] Error handling PENDING_SUBMITTED:",
        error,
        payload,
      );
    }
  }

  /**
   * Handle JOB_STARTED event (Phase 72: Real-time job progress)
   */
  public async handleJobStarted(payload: unknown): Promise<void> {
    try {
      const data = payload as JobStartedPayload;

      const existing = await db.pendingOrders.get(data.pendingOrderId);
      if (!existing) {
        console.warn(
          `[PendingRealtime] Pending order not found: ${data.pendingOrderId}`,
        );
        return;
      }

      await db.pendingOrders.put({
        ...existing,
        jobId: data.jobId,
        jobStatus: "started",
        jobProgress: 0,
        jobOperation: "Preparazione in corso...",
        jobStartedAt: data.timestamp,
        updatedAt: new Date().toISOString(),
        serverUpdatedAt: new Date(data.timestamp).getTime(),
      });

      console.log(`[PendingRealtime] JOB_STARTED applied`, {
        pendingOrderId: data.pendingOrderId,
      });
      this.notifyUpdate();
    } catch (error) {
      console.error("[PendingRealtime] Error handling JOB_STARTED:", error);
    }
  }

  /**
   * Flush all accumulated JOB_PROGRESS updates to IndexedDB in one batch
   */
  private async flushProgressUpdates(): Promise<void> {
    this.progressFlushTimer = null;

    if (this.pendingProgressUpdates.size === 0) return;

    const updates = new Map(this.pendingProgressUpdates);
    this.pendingProgressUpdates.clear();

    for (const [pendingOrderId, data] of updates) {
      try {
        const existing = await db.pendingOrders.get(pendingOrderId);
        if (!existing) continue;

        await db.pendingOrders.put({
          ...existing,
          jobStatus: "processing",
          jobProgress: data.progress,
          jobOperation: data.operation,
          updatedAt: new Date().toISOString(),
          serverUpdatedAt: new Date(data.timestamp).getTime(),
        });

        console.log(`[PendingRealtime] JOB_PROGRESS (flushed)`, {
          pendingOrderId,
          progress: data.progress,
        });
      } catch (error) {
        console.error(
          "[PendingRealtime] Error flushing JOB_PROGRESS:",
          error,
        );
      }
    }

    this.notifyUpdate();
  }

  /**
   * Handle JOB_PROGRESS event (Phase 72: Real-time job progress)
   * Throttled: accumulates updates and flushes every 300ms
   */
  public handleJobProgress(payload: unknown): void {
    const data = payload as JobProgressPayload;
    this.pendingProgressUpdates.set(data.pendingOrderId, data);

    if (!this.progressFlushTimer) {
      this.progressFlushTimer = setTimeout(
        () => this.flushProgressUpdates(),
        PROGRESS_FLUSH_INTERVAL_MS,
      );
    }
  }

  /**
   * Handle JOB_COMPLETED event (Phase 72: Real-time job progress)
   */
  public async handleJobCompleted(payload: unknown): Promise<void> {
    try {
      const data = payload as JobCompletedPayload;

      await this.flushProgressUpdates();

      const existing = await db.pendingOrders.get(data.pendingOrderId);
      if (!existing) return;

      await db.pendingOrders.put({
        ...existing,
        jobStatus: "completed",
        jobProgress: 100,
        jobOperation: "Ordine creato con successo",
        jobOrderId: data.orderId,
        jobCompletedAt: data.timestamp,
        updatedAt: new Date().toISOString(),
        serverUpdatedAt: new Date(data.timestamp).getTime(),
      });

      console.log(`[PendingRealtime] JOB_COMPLETED`, {
        orderId: data.orderId,
      });

      // Bridge archibaldOrderId to fresisHistory records
      try {
        const historyRecords = await db.fresisHistory
          .where("mergedIntoOrderId")
          .equals(data.pendingOrderId)
          .toArray();

        if (historyRecords.length > 0) {
          for (const record of historyRecords) {
            await db.fresisHistory.update(record.id, {
              archibaldOrderId: data.orderId,
              currentState: "piazzato",
              stateUpdatedAt: data.timestamp,
              updatedAt: data.timestamp,
            });
          }
          console.log(
            `[PendingRealtime] Updated ${historyRecords.length} fresisHistory records with archibaldOrderId=${data.orderId}`,
          );
        }
      } catch (historyError) {
        console.error(
          "[PendingRealtime] Error updating fresisHistory:",
          historyError,
        );
      }

      this.notifyUpdate();

      // Auto-dismiss after 4 seconds
      setTimeout(async () => {
        try {
          await db.pendingOrders.delete(data.pendingOrderId);
          console.log(
            `[PendingRealtime] Auto-dismissed ${data.pendingOrderId}`,
          );
          this.notifyUpdate();
        } catch (error) {
          console.error("[PendingRealtime] Error auto-dismissing:", error);
        }
      }, 4000);
    } catch (error) {
      console.error("[PendingRealtime] Error handling JOB_COMPLETED:", error);
    }
  }

  /**
   * Handle JOB_FAILED event (Phase 72: Real-time job progress)
   */
  public async handleJobFailed(payload: unknown): Promise<void> {
    try {
      const data = payload as JobFailedPayload;

      await this.flushProgressUpdates();

      const existing = await db.pendingOrders.get(data.pendingOrderId);
      if (!existing) return;

      await db.pendingOrders.put({
        ...existing,
        jobStatus: "failed",
        jobError: data.error,
        jobOperation: "Errore durante elaborazione",
        status: "error",
        errorMessage: data.error,
        updatedAt: new Date().toISOString(),
        serverUpdatedAt: new Date(data.timestamp).getTime(),
      });

      console.log(`[PendingRealtime] JOB_FAILED`, { error: data.error });
      this.notifyUpdate();
    } catch (error) {
      console.error("[PendingRealtime] Error handling JOB_FAILED:", error);
    }
  }

  /**
   * Initialize WebSocket subscriptions
   */
  public initializeSubscriptions(
    subscribe: (
      eventType: string,
      callback: (payload: unknown) => void,
    ) => () => void,
  ): (() => void)[] {
    const unsubscribers: (() => void)[] = [];

    // Subscribe to all pending order events
    unsubscribers.push(
      subscribe("PENDING_CREATED", (payload) =>
        this.handlePendingCreated(payload),
      ),
    );
    unsubscribers.push(
      subscribe("PENDING_UPDATED", (payload) =>
        this.handlePendingUpdated(payload),
      ),
    );
    unsubscribers.push(
      subscribe("PENDING_DELETED", (payload) =>
        this.handlePendingDeleted(payload),
      ),
    );
    unsubscribers.push(
      subscribe("PENDING_SUBMITTED", (payload) =>
        this.handlePendingSubmitted(payload),
      ),
    );

    // NEW: Job progress subscriptions (Phase 72)
    unsubscribers.push(
      subscribe("JOB_STARTED", (payload) => this.handleJobStarted(payload)),
    );
    unsubscribers.push(
      subscribe("JOB_PROGRESS", (payload) => this.handleJobProgress(payload)),
    );
    unsubscribers.push(
      subscribe("JOB_COMPLETED", (payload) => this.handleJobCompleted(payload)),
    );
    unsubscribers.push(
      subscribe("JOB_FAILED", (payload) => this.handleJobFailed(payload)),
    );

    console.log(
      "[PendingRealtime] WebSocket subscriptions initialized (with job events)",
    );

    // Return cleanup function
    return unsubscribers;
  }
}
