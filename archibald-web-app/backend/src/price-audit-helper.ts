/**
 * Price Audit Helper
 *
 * Helper functions for tracking price/VAT changes in audit log
 */

import Database from "better-sqlite3";
import { logger } from "./logger";

export interface PriceChangeData {
  productId: string;
  oldPrice: number | null;
  newPrice: number | null;
  oldVat: number | null;
  newVat: number | null;
  oldPriceSource: string | null;
  oldVatSource: string | null;
  newPriceSource: string;
  newVatSource: string | null;
  syncSessionId?: string | null;
  source: "archibald_sync" | "excel_import" | "manual";
}

export class PriceAuditHelper {
  private db: Database.Database;
  private insertPriceChange: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;

    // Prepare statement for inserting price changes
    this.insertPriceChange = this.db.prepare(`
      INSERT INTO price_changes (
        productId, changeType,
        oldPrice, oldVat, oldPriceSource, oldVatSource,
        newPrice, newVat, newPriceSource, newVatSource,
        changedAt, syncSessionId, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  /**
   * Log a price/VAT change to audit log
   *
   * @param data Change data
   * @returns true if change was logged, false if no change detected
   */
  logPriceChange(data: PriceChangeData): boolean {
    const {
      productId,
      oldPrice,
      newPrice,
      oldVat,
      newVat,
      oldPriceSource,
      oldVatSource,
      newPriceSource,
      newVatSource,
      syncSessionId,
      source,
    } = data;

    // Detect changes
    const priceChanged =
      newPrice !== oldPrice && newPrice !== null && newPrice > 0;
    const vatChanged = newVat !== oldVat && newVat !== null && newVat > 0;

    if (!priceChanged && !vatChanged) {
      return false; // No changes
    }

    // Determine change type
    let changeType: string;
    if (priceChanged && vatChanged) {
      changeType = "both_updated";
    } else if (priceChanged) {
      changeType = "price_updated";
    } else {
      changeType = "vat_updated";
    }

    // Insert into audit log
    const now = Math.floor(Date.now() / 1000);

    try {
      this.insertPriceChange.run(
        productId,
        changeType,
        oldPrice,
        oldVat,
        oldPriceSource,
        oldVatSource,
        priceChanged ? newPrice : oldPrice,
        vatChanged ? newVat : oldVat,
        priceChanged ? newPriceSource : oldPriceSource,
        vatChanged ? newVatSource : oldVatSource,
        now,
        syncSessionId || null,
        source,
      );

      return true;
    } catch (error) {
      logger.error(
        `Failed to log price change for product ${productId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get price change history for a product
   *
   * @param productId Product ID
   * @param limit Max number of entries to return (default: 100)
   * @returns Array of price change entries
   */
  getProductPriceHistory(productId: string, limit: number = 100) {
    const stmt = this.db.prepare(`
      SELECT
        id, productId, changeType,
        oldPrice, oldVat, oldPriceSource, oldVatSource,
        newPrice, newVat, newPriceSource, newVatSource,
        changedAt, syncSessionId, source
      FROM price_changes
      WHERE productId = ?
      ORDER BY changedAt DESC
      LIMIT ?
    `);

    return stmt.all(productId, limit);
  }

  /**
   * Get recent price changes across all products
   *
   * @param limit Max number of entries (default: 50)
   * @returns Array of recent price changes
   */
  getRecentPriceChanges(limit: number = 50) {
    const stmt = this.db.prepare(`
      SELECT
        pc.*,
        p.name as productName
      FROM price_changes pc
      LEFT JOIN products p ON pc.productId = p.id
      ORDER BY pc.changedAt DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Get price change statistics for a sync session
   *
   * @param syncSessionId Sync session ID
   * @returns Statistics object
   */
  getSyncSessionPriceStats(syncSessionId: string) {
    const stats = this.db
      .prepare(
        `
      SELECT
        COUNT(*) as totalChanges,
        SUM(CASE WHEN changeType IN ('price_updated', 'both_updated') THEN 1 ELSE 0 END) as pricesUpdated,
        SUM(CASE WHEN changeType IN ('vat_updated', 'both_updated') THEN 1 ELSE 0 END) as vatUpdated
      FROM price_changes
      WHERE syncSessionId = ?
    `,
      )
      .get(syncSessionId);

    return stats;
  }
}
