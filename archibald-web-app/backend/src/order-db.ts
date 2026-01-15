import Database from "better-sqlite3";
import { logger } from "./logger";
import path from "node:path";

/**
 * OrderDatabase - Persistent SQLite storage for order history
 *
 * Architecture:
 * - Stores scraped orders with timestamps for incremental sync
 * - Tracks last_updated per order for refresh strategy
 * - Enables cache-first approach (DB → scrape only if needed)
 * - Supports background refresh of open orders for tracking/documents
 *
 * Benefits:
 * - Reduces Archibald scraping load (only sync new/changed orders)
 * - Fast initial load from local DB
 * - Persistent across backend restarts
 * - Per-user isolation
 */

export interface StoredOrder {
  id: string; // Primary key: order ID from Archibald (e.g., "70.614")
  userId: string; // User who owns this order
  orderNumber: string; // Display order number
  customerProfileId: string;
  customerName: string;
  deliveryName: string;
  deliveryAddress: string;
  creationDate: string; // ISO 8601
  deliveryDate: string; // ISO 8601
  status: string; // "Ordine aperto", "Consegnato", etc.
  customerReference: string | null;

  // Metadata for sync strategy
  lastScraped: string; // ISO 8601 timestamp of last scrape
  lastUpdated: string; // ISO 8601 timestamp of last status/data change
  isOpen: boolean; // true if status indicates order is still active

  // JSON fields for extended data (filled by detail scraping)
  detailJson: string | null; // JSON stringified OrderDetail
}

export class OrderDatabase {
  private static instance: OrderDatabase;
  private db: Database.Database;

  private constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(process.cwd(), "data", "orders.db");

    this.db = new Database(finalPath);
    this.db.pragma("journal_mode = WAL"); // Better performance
    this.initSchema();
    logger.info("OrderDatabase initialized", { path: finalPath });
  }

  static getInstance(dbPath?: string): OrderDatabase {
    if (!OrderDatabase.instance) {
      OrderDatabase.instance = new OrderDatabase(dbPath);
    }
    return OrderDatabase.instance;
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT NOT NULL,
        userId TEXT NOT NULL,
        orderNumber TEXT NOT NULL,
        customerProfileId TEXT,
        customerName TEXT NOT NULL,
        deliveryName TEXT,
        deliveryAddress TEXT,
        creationDate TEXT NOT NULL,
        deliveryDate TEXT,
        status TEXT NOT NULL,
        customerReference TEXT,

        lastScraped TEXT NOT NULL,
        lastUpdated TEXT NOT NULL,
        isOpen INTEGER NOT NULL DEFAULT 1,

        detailJson TEXT,

        PRIMARY KEY (id, userId)
      );

      CREATE INDEX IF NOT EXISTS idx_orders_userId ON orders(userId);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(userId, status);
      CREATE INDEX IF NOT EXISTS idx_orders_isOpen ON orders(userId, isOpen);
      CREATE INDEX IF NOT EXISTS idx_orders_lastUpdated ON orders(userId, lastUpdated DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_creationDate ON orders(userId, creationDate DESC);
    `);

    logger.info("Order database schema initialized");
  }

  /**
   * Upsert orders from scraping
   * Updates existing orders or inserts new ones
   */
  upsertOrders(
    userId: string,
    orders: Array<
      Omit<
        StoredOrder,
        "lastScraped" | "lastUpdated" | "isOpen" | "detailJson" | "userId"
      >
    >,
  ): void {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO orders (
        id, userId, orderNumber, customerProfileId, customerName,
        deliveryName, deliveryAddress, creationDate, deliveryDate,
        status, customerReference, lastScraped, lastUpdated, isOpen, detailJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, userId) DO UPDATE SET
        orderNumber = excluded.orderNumber,
        customerProfileId = excluded.customerProfileId,
        customerName = excluded.customerName,
        deliveryName = excluded.deliveryName,
        deliveryAddress = excluded.deliveryAddress,
        creationDate = excluded.creationDate,
        deliveryDate = excluded.deliveryDate,
        status = excluded.status,
        customerReference = excluded.customerReference,
        lastScraped = excluded.lastScraped,
        lastUpdated = CASE
          WHEN status != excluded.status THEN excluded.lastScraped
          ELSE lastUpdated
        END,
        isOpen = excluded.isOpen
    `);

    const transaction = this.db.transaction((orders: any[]) => {
      for (const order of orders) {
        const isOpen = this.isOrderOpen(order.status);
        stmt.run(
          order.id,
          userId,
          order.orderNumber,
          order.customerProfileId || "",
          order.customerName,
          order.deliveryName || "",
          order.deliveryAddress || "",
          order.creationDate,
          order.deliveryDate || "",
          order.status,
          order.customerReference || null,
          now, // lastScraped
          now, // lastUpdated (will be preserved if status unchanged)
          isOpen ? 1 : 0,
          null, // detailJson (filled later by detail scraping)
        );
      }
    });

    transaction(orders);
    logger.info(`Upserted ${orders.length} orders for user ${userId}`);
  }

  /**
   * Get all orders for a user
   * Returns from cache (fast path)
   */
  getOrdersByUser(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: string;
      customer?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ): StoredOrder[] {
    let query = "SELECT * FROM orders WHERE userId = ?";
    const params: any[] = [userId];

    if (options?.status) {
      query += " AND status = ?";
      params.push(options.status);
    }

    if (options?.customer) {
      query += " AND (customerName LIKE ? OR deliveryName LIKE ?)";
      const searchPattern = `%${options.customer}%`;
      params.push(searchPattern, searchPattern);
    }

    if (options?.dateFrom) {
      query += " AND creationDate >= ?";
      params.push(options.dateFrom);
    }

    if (options?.dateTo) {
      query += " AND creationDate <= ?";
      params.push(options.dateTo);
    }

    query += " ORDER BY creationDate DESC";

    if (options?.limit) {
      query += " LIMIT ?";
      params.push(options.limit);

      if (options?.offset) {
        query += " OFFSET ?";
        params.push(options.offset);
      }
    }

    const rows = this.db.prepare(query).all(...params) as StoredOrder[];

    return rows.map((row) => ({
      ...row,
      isOpen: Boolean(row.isOpen),
      customerReference: row.customerReference || undefined,
    }));
  }

  /**
   * Get orders that need refresh (open orders not scraped recently)
   */
  getOrdersNeedingRefresh(
    userId: string,
    maxAgeMinutes: number = 60,
  ): StoredOrder[] {
    const cutoffDate = new Date(
      Date.now() - maxAgeMinutes * 60 * 1000,
    ).toISOString();

    const rows = this.db
      .prepare(
        `
      SELECT * FROM orders
      WHERE userId = ?
        AND isOpen = 1
        AND lastScraped < ?
      ORDER BY lastScraped ASC
      LIMIT 50
    `,
      )
      .all(userId, cutoffDate) as StoredOrder[];

    return rows.map((row) => ({
      ...row,
      isOpen: Boolean(row.isOpen),
    }));
  }

  /**
   * Get timestamp of most recently scraped order
   * Used to determine if incremental sync is needed
   */
  getLastScrapedTimestamp(userId: string): string | null {
    const row = this.db
      .prepare(
        `
      SELECT MAX(lastScraped) as maxScraped
      FROM orders
      WHERE userId = ?
    `,
      )
      .get(userId) as { maxScraped: string | null } | undefined;

    return row?.maxScraped || null;
  }

  /**
   * Count total orders for user
   */
  countOrders(
    userId: string,
    options?: {
      status?: string;
      customer?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ): number {
    let query = "SELECT COUNT(*) as count FROM orders WHERE userId = ?";
    const params: any[] = [userId];

    if (options?.status) {
      query += " AND status = ?";
      params.push(options.status);
    }

    if (options?.customer) {
      query += " AND (customerName LIKE ? OR deliveryName LIKE ?)";
      const searchPattern = `%${options.customer}%`;
      params.push(searchPattern, searchPattern);
    }

    if (options?.dateFrom) {
      query += " AND creationDate >= ?";
      params.push(options.dateFrom);
    }

    if (options?.dateTo) {
      query += " AND creationDate <= ?";
      params.push(options.dateTo);
    }

    const row = this.db.prepare(query).get(...params) as { count: number };
    return row.count;
  }

  /**
   * Update order detail JSON (from detail scraping)
   */
  updateOrderDetail(userId: string, orderId: string, detailJson: string): void {
    this.db
      .prepare(
        `
      UPDATE orders
      SET detailJson = ?, lastScraped = ?
      WHERE id = ? AND userId = ?
    `,
      )
      .run(detailJson, new Date().toISOString(), orderId, userId);
  }

  /**
   * Get single order by ID
   */
  getOrderById(userId: string, orderId: string): StoredOrder | null {
    const row = this.db
      .prepare(
        `
      SELECT * FROM orders WHERE id = ? AND userId = ?
    `,
      )
      .get(orderId, userId) as StoredOrder | undefined;

    if (!row) return null;

    return {
      ...row,
      isOpen: Boolean(row.isOpen),
    };
  }

  /**
   * Determine if order status indicates it's still open/active
   */
  private isOrderOpen(status: string): boolean {
    const openStatuses = [
      "ordine aperto",
      "in lavorazione",
      "in produzione",
      "in attesa",
      "pending",
    ];

    return openStatuses.some((s) => status.toLowerCase().includes(s));
  }

  /**
   * Clear all orders for a user (useful for forcing full re-sync)
   */
  clearUserOrders(userId: string): void {
    const result = this.db
      .prepare("DELETE FROM orders WHERE userId = ?")
      .run(userId);
    logger.info(`Cleared ${result.changes} orders for user ${userId}`);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info("OrderDatabase closed");
  }
}
