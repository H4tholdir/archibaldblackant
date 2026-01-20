import Database from 'better-sqlite3';
import path from 'path';
import { logger } from './logger';

/**
 * Price history record
 */
export interface PriceHistoryRecord {
  id: number;
  productId: string;
  productName: string;
  variantId: string | null;
  oldPrice: number | null;
  newPrice: number;
  priceChange: number;
  percentageChange: number;
  syncDate: number;
  source: 'pdf-sync' | 'excel-upload' | 'manual';
  changeType: 'increase' | 'decrease' | 'new';
  currency: string | null;
  notes: string | null;
  createdAt: number;
}

/**
 * Price history database manager
 * Tracks all price changes over time
 */
export class PriceHistoryDatabase {
  private static instance: PriceHistoryDatabase;
  private db: Database.Database;

  private constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(__dirname, '../data/prices.db');
    this.db = new Database(finalPath);
    logger.info(`[PriceHistoryDatabase] Initialized at ${finalPath}`);
  }

  static getInstance(dbPath?: string): PriceHistoryDatabase {
    if (!PriceHistoryDatabase.instance) {
      PriceHistoryDatabase.instance = new PriceHistoryDatabase(dbPath);
    }
    return PriceHistoryDatabase.instance;
  }

  /**
   * Record price change
   * Automatically calculates change metrics and determines change type
   */
  recordPriceChange(change: {
    productId: string;
    productName: string;
    variantId?: string | null;
    oldPrice?: number | null;
    newPrice: number;
    source: 'pdf-sync' | 'excel-upload' | 'manual';
    currency?: string;
    notes?: string;
  }): void {
    const now = Math.floor(Date.now() / 1000);

    // Calculate metrics
    const oldPrice = change.oldPrice ?? null;
    const priceChange = oldPrice !== null ? change.newPrice - oldPrice : change.newPrice;
    const percentageChange =
      oldPrice !== null && oldPrice !== 0
        ? ((change.newPrice - oldPrice) / oldPrice) * 100
        : 0;

    // Determine change type
    let changeType: 'increase' | 'decrease' | 'new';
    if (oldPrice === null) {
      changeType = 'new';
    } else if (change.newPrice > oldPrice) {
      changeType = 'increase';
    } else {
      changeType = 'decrease';
    }

    // Insert record
    this.db
      .prepare(`
        INSERT INTO price_history (
          productId, productName, variantId, oldPrice, newPrice,
          priceChange, percentageChange, syncDate, source, changeType,
          currency, notes, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        change.productId,
        change.productName,
        change.variantId ?? null,
        oldPrice,
        change.newPrice,
        priceChange,
        percentageChange,
        now,
        change.source,
        changeType,
        change.currency ?? null,
        change.notes ?? null,
        now
      );

    logger.info('[PriceHistoryDatabase] Price change recorded', {
      productId: change.productId,
      oldPrice,
      newPrice: change.newPrice,
      percentageChange: percentageChange.toFixed(2) + '%',
      changeType,
    });
  }

  /**
   * Get price history for specific product (all variants)
   * Returns full history ordered by date DESC
   */
  getProductHistory(productId: string): PriceHistoryRecord[] {
    return this.db
      .prepare(`
        SELECT * FROM price_history
        WHERE productId = ?
        ORDER BY syncDate DESC
      `)
      .all(productId) as PriceHistoryRecord[];
  }

  /**
   * Get price history for specific product variant
   */
  getVariantHistory(productId: string, variantId: string | null): PriceHistoryRecord[] {
    return this.db
      .prepare(`
        SELECT * FROM price_history
        WHERE productId = ? AND variantId = ?
        ORDER BY syncDate DESC
      `)
      .all(productId, variantId ?? null) as PriceHistoryRecord[];
  }

  /**
   * Get recent price changes (last N days)
   * Used for dashboard display
   *
   * @param daysBack Number of days to look back (default: 30)
   * @param limit Max results (default: 100)
   */
  getRecentChanges(daysBack: number = 30, limit: number = 100): PriceHistoryRecord[] {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - daysBack * 24 * 60 * 60;

    return this.db
      .prepare(`
        SELECT * FROM price_history
        WHERE syncDate >= ?
        ORDER BY syncDate DESC, ABS(percentageChange) DESC
        LIMIT ?
      `)
      .all(cutoffTimestamp, limit) as PriceHistoryRecord[];
  }

  /**
   * Get recent price increases (dashboard widget)
   */
  getRecentIncreases(daysBack: number = 30): PriceHistoryRecord[] {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - daysBack * 24 * 60 * 60;

    return this.db
      .prepare(`
        SELECT * FROM price_history
        WHERE syncDate >= ? AND changeType = 'increase'
        ORDER BY percentageChange DESC
      `)
      .all(cutoffTimestamp) as PriceHistoryRecord[];
  }

  /**
   * Get recent price decreases (dashboard widget)
   */
  getRecentDecreases(daysBack: number = 30): PriceHistoryRecord[] {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - daysBack * 24 * 60 * 60;

    return this.db
      .prepare(`
        SELECT * FROM price_history
        WHERE syncDate >= ? AND changeType = 'decrease'
        ORDER BY percentageChange ASC
      `)
      .all(cutoffTimestamp) as PriceHistoryRecord[];
  }

  /**
   * Get statistics for recent changes (last N days)
   */
  getRecentStats(daysBack: number = 30): {
    totalChanges: number;
    increases: number;
    decreases: number;
    newPrices: number;
    avgIncrease: number;
    avgDecrease: number;
  } {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - daysBack * 24 * 60 * 60;

    const stats = this.db
      .prepare(`
        SELECT
          COUNT(*) as totalChanges,
          SUM(CASE WHEN changeType = 'increase' THEN 1 ELSE 0 END) as increases,
          SUM(CASE WHEN changeType = 'decrease' THEN 1 ELSE 0 END) as decreases,
          SUM(CASE WHEN changeType = 'new' THEN 1 ELSE 0 END) as newPrices,
          AVG(CASE WHEN changeType = 'increase' THEN percentageChange ELSE NULL END) as avgIncrease,
          AVG(CASE WHEN changeType = 'decrease' THEN percentageChange ELSE NULL END) as avgDecrease
        FROM price_history
        WHERE syncDate >= ?
      `)
      .get(cutoffTimestamp) as any;

    return {
      totalChanges: stats.totalChanges || 0,
      increases: stats.increases || 0,
      decreases: stats.decreases || 0,
      newPrices: stats.newPrices || 0,
      avgIncrease: stats.avgIncrease || 0,
      avgDecrease: stats.avgDecrease || 0,
    };
  }

  /**
   * Cleanup old records (optional - run periodically)
   * Keeps full history but can archive old data if needed
   */
  archiveOldRecords(daysToKeep: number = 365): number {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - daysToKeep * 24 * 60 * 60;

    const result = this.db
      .prepare('DELETE FROM price_history WHERE syncDate < ?')
      .run(cutoffTimestamp);

    logger.info('[PriceHistoryDatabase] Archived old records', {
      deleted: result.changes,
      cutoffDays: daysToKeep,
    });

    return result.changes;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('[PriceHistoryDatabase] Database closed');
  }
}
