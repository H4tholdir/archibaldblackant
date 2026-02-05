/**
 * Frontend Draft Real-Time Service
 *
 * Subscribes to draft events from WebSocket and updates IndexedDB.
 * Implements Last-Write-Wins conflict resolution using serverUpdatedAt timestamps.
 *
 * Phase 31: Real-time draft sync via WebSocket
 */

import { db } from "../db/schema";
import type { DraftOrder } from "../db/schema";
import { getDeviceId } from "../utils/device-id";

/**
 * Draft event payloads from backend
 */
interface DraftCreatedPayload {
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

interface DraftUpdatedPayload {
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

interface DraftDeletedPayload {
  draftId: string;
  deleted: true;
  timestamp: string;
  deviceId: string;
}

interface DraftConvertedPayload {
  draftId: string;
  pendingOrderId: string;
  timestamp: string;
  deviceId: string;
}

/**
 * Event handler type for draft updates
 */
export type DraftUpdateHandler = () => void;

/**
 * DraftRealtimeService manages real-time draft synchronization via WebSocket.
 *
 * Responsibilities:
 * - Subscribe to DRAFT_* events from WebSocket
 * - Apply updates to IndexedDB with Last-Write-Wins conflict resolution
 * - Filter own deviceId to prevent echo
 * - Emit UI update events for React components
 */
export class DraftRealtimeService {
  private static instance: DraftRealtimeService;
  private deviceId: string;
  private updateHandlers: Set<DraftUpdateHandler> = new Set();

  private constructor() {
    this.deviceId = getDeviceId();
  }

  public static getInstance(): DraftRealtimeService {
    if (!DraftRealtimeService.instance) {
      DraftRealtimeService.instance = new DraftRealtimeService();
    }
    return DraftRealtimeService.instance;
  }

  /**
   * Register a UI update handler (called when drafts change)
   */
  public onUpdate(handler: DraftUpdateHandler): () => void {
    this.updateHandlers.add(handler);
    return () => {
      this.updateHandlers.delete(handler);
    };
  }

  /**
   * Notify all registered handlers that drafts have changed
   */
  private notifyUpdate(): void {
    this.updateHandlers.forEach((handler) => {
      try {
        handler();
      } catch (error) {
        console.error("[DraftRealtime] Error in update handler:", error);
      }
    });
  }

  /**
   * Handle DRAFT_CREATED event
   */
  public async handleDraftCreated(payload: unknown): Promise<void> {
    try {
      const data = payload as DraftCreatedPayload;

      // Filter own device to prevent echo
      if (data.deviceId === this.deviceId) {
        console.log(
          `[DraftRealtime] Ignoring DRAFT_CREATED echo from own device`,
          {
            draftId: data.draftId,
          },
        );
        return;
      }

      // Check if draft already exists
      const existing = await db.draftOrders.get(data.draft.id);

      if (existing) {
        console.log(
          `[DraftRealtime] Draft already exists, skipping DRAFT_CREATED`,
          {
            draftId: data.draft.id,
          },
        );
        return;
      }

      // Insert draft into IndexedDB
      const draftOrder: DraftOrder = {
        id: data.draft.id,
        customerId: data.draft.customerId,
        customerName: data.draft.customerName,
        items: data.draft.items,
        createdAt: data.draft.createdAt,
        updatedAt: data.draft.updatedAt,
        deviceId: data.draft.deviceId,
        needsSync: false, // Already synced via WebSocket
        serverUpdatedAt: new Date(data.timestamp).getTime(),
      };

      await db.draftOrders.put(draftOrder);

      console.log(`[DraftRealtime] DRAFT_CREATED applied to IndexedDB`, {
        draftId: data.draft.id,
        customerId: data.draft.customerId,
      });

      this.notifyUpdate();
    } catch (error) {
      console.error(
        "[DraftRealtime] Error handling DRAFT_CREATED:",
        error,
        payload,
      );
    }
  }

  /**
   * Handle DRAFT_UPDATED event
   */
  public async handleDraftUpdated(payload: unknown): Promise<void> {
    try {
      const data = payload as DraftUpdatedPayload;

      // Filter own device to prevent echo
      if (data.deviceId === this.deviceId) {
        console.log(
          `[DraftRealtime] Ignoring DRAFT_UPDATED echo from own device`,
          {
            draftId: data.draftId,
          },
        );
        return;
      }

      // Check if draft exists locally
      const existing = await db.draftOrders.get(data.draft.id);
      const incomingTimestamp = new Date(data.timestamp).getTime();

      // Last-Write-Wins conflict resolution
      if (existing && existing.serverUpdatedAt) {
        if (existing.serverUpdatedAt >= incomingTimestamp) {
          console.log(
            `[DraftRealtime] Local draft is newer, skipping DRAFT_UPDATED`,
            {
              draftId: data.draft.id,
              localTimestamp: existing.serverUpdatedAt,
              incomingTimestamp,
            },
          );
          return;
        }
      }

      // Upsert draft with serverUpdatedAt
      const draftOrder: DraftOrder = {
        id: data.draft.id,
        customerId: data.draft.customerId,
        customerName: data.draft.customerName,
        items: data.draft.items,
        createdAt: data.draft.createdAt,
        updatedAt: data.draft.updatedAt,
        deviceId: data.draft.deviceId,
        needsSync: false, // Already synced via WebSocket
        serverUpdatedAt: incomingTimestamp,
      };

      await db.draftOrders.put(draftOrder);

      console.log(`[DraftRealtime] DRAFT_UPDATED applied to IndexedDB`, {
        draftId: data.draft.id,
        serverUpdatedAt: incomingTimestamp,
      });

      this.notifyUpdate();
    } catch (error) {
      console.error(
        "[DraftRealtime] Error handling DRAFT_UPDATED:",
        error,
        payload,
      );
    }
  }

  /**
   * Handle DRAFT_DELETED event
   */
  public async handleDraftDeleted(payload: unknown): Promise<void> {
    try {
      const data = payload as DraftDeletedPayload;

      // Filter own device to prevent echo
      if (data.deviceId === this.deviceId) {
        console.log(
          `[DraftRealtime] Ignoring DRAFT_DELETED echo from own device`,
          {
            draftId: data.draftId,
          },
        );
        return;
      }

      // Mark draft as deleted (tombstone pattern)
      const existing = await db.draftOrders.get(data.draftId);

      if (!existing) {
        console.log(`[DraftRealtime] Draft not found, skipping DRAFT_DELETED`, {
          draftId: data.draftId,
        });
        return;
      }

      // Update with deleted flag (tombstone)
      await db.draftOrders.put({
        ...existing,
        deleted: true,
        serverUpdatedAt: new Date(data.timestamp).getTime(),
      });

      console.log(`[DraftRealtime] DRAFT_DELETED applied to IndexedDB`, {
        draftId: data.draftId,
      });

      this.notifyUpdate();
    } catch (error) {
      console.error(
        "[DraftRealtime] Error handling DRAFT_DELETED:",
        error,
        payload,
      );
    }
  }

  /**
   * Handle DRAFT_CONVERTED event (draft converted to pending order)
   */
  public async handleDraftConverted(payload: unknown): Promise<void> {
    try {
      const data = payload as DraftConvertedPayload;

      // Filter own device to prevent echo
      if (data.deviceId === this.deviceId) {
        console.log(
          `[DraftRealtime] Ignoring DRAFT_CONVERTED echo from own device`,
          {
            draftId: data.draftId,
          },
        );
        return;
      }

      // Remove draft from IndexedDB (converted to pending order)
      await db.draftOrders.delete(data.draftId);

      console.log(`[DraftRealtime] DRAFT_CONVERTED applied to IndexedDB`, {
        draftId: data.draftId,
        pendingOrderId: data.pendingOrderId,
      });

      this.notifyUpdate();
    } catch (error) {
      console.error(
        "[DraftRealtime] Error handling DRAFT_CONVERTED:",
        error,
        payload,
      );
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

    // Subscribe to all draft events
    unsubscribers.push(
      subscribe("DRAFT_CREATED", (payload) => this.handleDraftCreated(payload)),
    );
    unsubscribers.push(
      subscribe("DRAFT_UPDATED", (payload) => this.handleDraftUpdated(payload)),
    );
    unsubscribers.push(
      subscribe("DRAFT_DELETED", (payload) => this.handleDraftDeleted(payload)),
    );
    unsubscribers.push(
      subscribe("DRAFT_CONVERTED", (payload) =>
        this.handleDraftConverted(payload),
      ),
    );

    console.log("[DraftRealtime] WebSocket subscriptions initialized");

    // Return cleanup function
    return unsubscribers;
  }
}
