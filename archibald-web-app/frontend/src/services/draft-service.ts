import { db } from "../db/schema";
import type { DraftOrder, DraftOrderItem } from "../db/schema";

/**
 * DraftService manages draft orders in IndexedDB for offline-first persistence.
 *
 * Features:
 * - Auto-save with debounce (1 second)
 * - Upsert pattern (updates existing draft instead of creating duplicates)
 * - Restore most recent draft on app launch
 * - Clear draft after successful order submission
 */
export class DraftService {
  /**
   * Save or update draft order to IndexedDB.
   * Uses upsert pattern: reuses existing draft ID if present.
   */
  async saveDraft(
    customerId: string,
    customerName: string,
    items: DraftOrderItem[],
  ): Promise<void> {
    const existing = await this.getDraft();

    if (existing?.id) {
      // Update existing draft
      const draft: DraftOrder = {
        id: existing.id,
        customerId,
        customerName,
        items,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await db.draftOrders.put(draft);
    } else {
      // Create new draft (omit id for auto-increment)
      const draft: DraftOrder = {
        customerId,
        customerName,
        items,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.draftOrders.add(draft);
    }
  }

  /**
   * Get most recent draft order from IndexedDB.
   * Returns null if no draft exists.
   */
  async getDraft(): Promise<DraftOrder | null> {
    // Get most recent draft (ordered by updatedAt DESC, limit 1)
    const drafts = await db.draftOrders
      .orderBy("updatedAt")
      .reverse()
      .limit(1)
      .toArray();

    return drafts[0] || null;
  }

  /**
   * Clear all draft orders from IndexedDB.
   * Should be called after successful order submission.
   */
  async clearDraft(): Promise<void> {
    await db.draftOrders.clear();
  }
}

// Singleton instance
export const draftService = new DraftService();
