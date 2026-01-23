import { db } from "../db/schema";
import type { DraftOrder, PendingOrder } from "../db/schema";
import type Dexie from "dexie";

export class OrderService {
  private db: Dexie;

  constructor(database: Dexie = db) {
    this.db = database;
  }

  /**
   * Save draft order
   * @param order - Draft order (without ID)
   * @returns Generated draft ID
   */
  async saveDraftOrder(order: Omit<DraftOrder, "id">): Promise<number> {
    try {
      const id = await this.db.table<DraftOrder, number>("draftOrders").add({
        ...order,
        updatedAt: new Date().toISOString(),
      });
      return id as number;
    } catch (error) {
      console.error("[OrderService] Failed to save draft order:", error);
      throw error;
    }
  }

  /**
   * Get all draft orders sorted by most recent first
   * @returns Array of draft orders
   */
  async getDraftOrders(): Promise<DraftOrder[]> {
    try {
      return await this.db
        .table<DraftOrder, number>("draftOrders")
        .orderBy("updatedAt")
        .reverse() // Most recent first
        .toArray();
    } catch (error) {
      console.error("[OrderService] Failed to get draft orders:", error);
      return [];
    }
  }

  /**
   * Delete draft order by ID
   * @param id - Draft order ID
   */
  async deleteDraftOrder(id: number): Promise<void> {
    try {
      await this.db.table<DraftOrder, number>("draftOrders").delete(id);
    } catch (error) {
      console.error("[OrderService] Failed to delete draft order:", error);
      // Swallow error - deletion of non-existent draft is not critical
    }
  }

  /**
   * Save pending order (for offline submission)
   * @param order - Pending order (without ID)
   * @returns Generated pending order ID
   */
  async savePendingOrder(order: Omit<PendingOrder, "id">): Promise<number> {
    try {
      const id = await this.db
        .table<PendingOrder, number>("pendingOrders")
        .add({
          ...order,
          createdAt: new Date().toISOString(),
          status: "pending",
          retryCount: 0,
        });
      return id as number;
    } catch (error) {
      console.error("[OrderService] Failed to save pending order:", error);
      throw error;
    }
  }

  /**
   * Get pending orders (pending or error status only, oldest first)
   * Excludes orders with status 'syncing' (currently being processed)
   * @returns Array of pending orders
   */
  async getPendingOrders(): Promise<PendingOrder[]> {
    try {
      return await this.db
        .table<PendingOrder, number>("pendingOrders")
        .where("status")
        .anyOf(["pending", "error"]) // Exclude 'syncing'
        .sortBy("createdAt"); // Oldest first (FIFO)
    } catch (error) {
      console.error("[OrderService] Failed to get pending orders:", error);
      return [];
    }
  }

  /**
   * Update pending order status
   * @param id - Pending order ID
   * @param status - New status
   * @param errorMessage - Optional error message (for error status)
   */
  async updatePendingOrderStatus(
    id: number,
    status: "syncing" | "error" | "pending",
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.db.table<PendingOrder, number>("pendingOrders").update(id, {
        status,
        ...(errorMessage && { errorMessage }),
      });
    } catch (error) {
      console.error(
        "[OrderService] Failed to update pending order status:",
        error,
      );
      // Swallow error - update of non-existent order is not critical
    }
  }
}

// Singleton instance
export const orderService = new OrderService();
