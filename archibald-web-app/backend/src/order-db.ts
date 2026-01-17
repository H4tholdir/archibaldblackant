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

  // TABELLA 1: Order List (20 columns from SALESTABLE_ListView_Agent)
  orderNumber: string; // Col 1: ID di vendita (e.g., "ORD/26000552")
  customerProfileId: string; // Col 2: Profilo cliente
  customerName: string; // Col 3: Nome vendite
  deliveryName: string; // Col 4: Nome di consegna
  deliveryAddress: string; // Col 5: Indirizzo di consegna
  creationDate: string; // Col 6: Data di creazione (ISO 8601)
  deliveryDate: string; // Col 7: Data di consegna (ISO 8601)
  remainingSalesFinancial: string | null; // Col 8: Rimani vendite finanziarie
  customerReference: string | null; // Col 9: Riferimento cliente
  salesStatus: string | null; // Col 10: Stato delle vendite
  orderType: string | null; // Col 11: Tipo di ordine
  documentStatus: string | null; // Col 12: Stato del documento
  salesOrigin: string | null; // Col 13: Origine vendite
  transferStatus: string | null; // Col 14: Stato del trasferimento
  transferDate: string | null; // Col 15: Data di trasferimento
  completionDate: string | null; // Col 16: Data di completamento
  discountPercent: string | null; // Col 17: Applica sconto %
  grossAmount: string | null; // Col 18: Importo lordo
  totalAmount: string | null; // Col 19: Importo totale

  // Legacy field (to be deprecated after migration)
  status: string; // Deprecated: use salesStatus instead

  // Metadata for sync strategy
  lastScraped: string; // ISO 8601 timestamp of last scrape
  lastUpdated: string; // ISO 8601 timestamp of last status/data change
  isOpen: boolean; // true if status indicates order is still active

  // JSON fields for extended data (filled by detail scraping)
  detailJson: string | null; // JSON stringified OrderDetail

  // Order management fields (Phase 11)
  sentToMilanoAt: string | null; // ISO 8601 timestamp when sent to Milano
  currentState: string; // Order lifecycle state: creato, piazzato, inviato_milano, etc.

  // TABELLA 2: DDT Data (11 columns from CUSTPACKINGSLIPJOUR_ListView)
  ddtId: string | null; // Col 0: ID (DDT internal ID)
  ddtNumber: string | null; // Col 1: Documento di trasporto (e.g., "DDT/26000515")
  ddtDeliveryDate: string | null; // Col 2: Data di consegna (DDT)
  ddtOrderNumber: string | null; // Col 3: ID di vendita (match key, same as orderNumber)
  ddtCustomerAccount: string | null; // Col 4: Conto dell'ordine
  ddtSalesName: string | null; // Col 5: Nome vendite
  ddtDeliveryName: string | null; // Col 6: Nome di consegna
  trackingNumber: string | null; // Col 7: Numero di tracciabilità (e.g., "445291888246")
  deliveryTerms: string | null; // Col 8: Termini di consegna
  deliveryMethod: string | null; // Col 9: Modalità di consegna (e.g., "FedEx")
  deliveryCity: string | null; // Col 10: Città di consegna

  // Computed tracking fields
  trackingUrl: string | null; // Full tracking URL (courier-specific)
  trackingCourier: string | null; // Courier name (e.g., "fedex", "ups", "dhl")

  // TABELLA 3: Invoice Data (Phase 11-06)
  invoiceNumber: string | null; // Invoice number (e.g., "FT/2026/00123")
  invoiceDate: string | null; // Invoice date (ISO 8601)
  invoiceAmount: number | null; // Invoice total amount
}

export interface OrderAuditLog {
  id: number;
  orderId: string;
  action: string; // send_to_archibald, send_to_milano, edit, cancel
  performedBy: string; // user_id
  performedAt: string; // ISO 8601 timestamp
  details: string | null; // JSON with action-specific data
}

export interface OrderStateHistory {
  id: number;
  orderId: string;
  state: string;
  changedAt: string; // ISO 8601
  changedBy?: string;
  notes?: string;
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

        -- TABELLA 1: Order List (20 columns)
        orderNumber TEXT NOT NULL,
        customerProfileId TEXT,
        customerName TEXT NOT NULL,
        deliveryName TEXT,
        deliveryAddress TEXT,
        creationDate TEXT NOT NULL,
        deliveryDate TEXT,
        remainingSalesFinancial TEXT,
        customerReference TEXT,
        salesStatus TEXT,
        orderType TEXT,
        documentStatus TEXT,
        salesOrigin TEXT,
        transferStatus TEXT,
        transferDate TEXT,
        completionDate TEXT,
        discountPercent TEXT,
        grossAmount TEXT,
        totalAmount TEXT,

        -- Legacy field (for backward compatibility)
        status TEXT NOT NULL,

        -- Metadata
        lastScraped TEXT NOT NULL,
        lastUpdated TEXT NOT NULL,
        isOpen INTEGER NOT NULL DEFAULT 1,

        -- Order detail JSON
        detailJson TEXT,

        -- Order management
        sentToMilanoAt TEXT,
        currentState TEXT DEFAULT 'creato',

        -- TABELLA 2: DDT Data (11 columns)
        ddtId TEXT,
        ddtNumber TEXT,
        ddtDeliveryDate TEXT,
        ddtOrderNumber TEXT,
        ddtCustomerAccount TEXT,
        ddtSalesName TEXT,
        ddtDeliveryName TEXT,
        trackingNumber TEXT,
        deliveryTerms TEXT,
        deliveryMethod TEXT,
        deliveryCity TEXT,

        -- Computed tracking fields
        trackingUrl TEXT,
        trackingCourier TEXT,

        -- TABELLA 3: Invoice Data (Phase 11-06)
        invoice_number TEXT,
        invoice_date TEXT,
        invoice_amount REAL,

        PRIMARY KEY (id, userId)
      );

      CREATE INDEX IF NOT EXISTS idx_orders_userId ON orders(userId);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(userId, status);
      CREATE INDEX IF NOT EXISTS idx_orders_isOpen ON orders(userId, isOpen);
      CREATE INDEX IF NOT EXISTS idx_orders_lastUpdated ON orders(userId, lastUpdated DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_creationDate ON orders(userId, creationDate DESC);

      CREATE TABLE IF NOT EXISTS order_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        action TEXT NOT NULL,
        performed_by TEXT NOT NULL,
        performed_at TEXT NOT NULL,
        details TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );

      CREATE INDEX IF NOT EXISTS idx_audit_order ON order_audit_log(order_id);
      CREATE INDEX IF NOT EXISTS idx_audit_performed_at ON order_audit_log(performed_at DESC);

      CREATE TABLE IF NOT EXISTS order_state_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        state TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        changed_by TEXT,
        notes TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );

      CREATE INDEX IF NOT EXISTS idx_state_history_order ON order_state_history(order_id);
      CREATE INDEX IF NOT EXISTS idx_state_history_changed_at ON order_state_history(changed_at DESC);
    `);

    logger.info("Order database schema initialized");
  }

  /**
   * Upsert orders from scraping
   * Updates existing orders or inserts new ones
   * Now handles all 20 Order List + 11 DDT columns
   */
  upsertOrders(userId: string, orders: StoredOrder[]): void {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO orders (
        id, userId,
        orderNumber, customerProfileId, customerName, deliveryName, deliveryAddress,
        creationDate, deliveryDate, remainingSalesFinancial, customerReference,
        salesStatus, orderType, documentStatus, salesOrigin, transferStatus,
        transferDate, completionDate, discountPercent, grossAmount, totalAmount,
        status,
        lastScraped, lastUpdated, isOpen,
        detailJson,
        sentToMilanoAt, currentState,
        ddtId, ddtNumber, ddtDeliveryDate, ddtOrderNumber, ddtCustomerAccount,
        ddtSalesName, ddtDeliveryName, trackingNumber, deliveryTerms,
        deliveryMethod, deliveryCity,
        trackingUrl, trackingCourier,
        invoice_number, invoice_date, invoice_amount
      ) VALUES (
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?,
        ?, ?, ?,
        ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?
      )
      ON CONFLICT(id, userId) DO UPDATE SET
        orderNumber = excluded.orderNumber,
        customerProfileId = excluded.customerProfileId,
        customerName = excluded.customerName,
        deliveryName = excluded.deliveryName,
        deliveryAddress = excluded.deliveryAddress,
        creationDate = excluded.creationDate,
        deliveryDate = excluded.deliveryDate,
        remainingSalesFinancial = excluded.remainingSalesFinancial,
        customerReference = excluded.customerReference,
        salesStatus = excluded.salesStatus,
        orderType = excluded.orderType,
        documentStatus = excluded.documentStatus,
        salesOrigin = excluded.salesOrigin,
        transferStatus = excluded.transferStatus,
        transferDate = excluded.transferDate,
        completionDate = excluded.completionDate,
        discountPercent = excluded.discountPercent,
        grossAmount = excluded.grossAmount,
        totalAmount = excluded.totalAmount,
        status = excluded.status,
        lastScraped = excluded.lastScraped,
        lastUpdated = CASE
          WHEN status != excluded.status THEN excluded.lastScraped
          ELSE lastUpdated
        END,
        isOpen = excluded.isOpen,
        detailJson = excluded.detailJson,
        ddtId = excluded.ddtId,
        ddtNumber = excluded.ddtNumber,
        ddtDeliveryDate = excluded.ddtDeliveryDate,
        ddtOrderNumber = excluded.ddtOrderNumber,
        ddtCustomerAccount = excluded.ddtCustomerAccount,
        ddtSalesName = excluded.ddtSalesName,
        ddtDeliveryName = excluded.ddtDeliveryName,
        trackingNumber = excluded.trackingNumber,
        deliveryTerms = excluded.deliveryTerms,
        deliveryMethod = excluded.deliveryMethod,
        deliveryCity = excluded.deliveryCity,
        trackingUrl = excluded.trackingUrl,
        trackingCourier = excluded.trackingCourier,
        invoice_number = excluded.invoice_number,
        invoice_date = excluded.invoice_date,
        invoice_amount = excluded.invoice_amount
    `);

    const transaction = this.db.transaction((orders: StoredOrder[]) => {
      for (const order of orders) {
        const isOpen =
          typeof order.isOpen === "boolean"
            ? order.isOpen
            : this.isOrderOpen(order.status);
        stmt.run(
          // Primary keys
          order.id,
          userId,

          // Order List fields (20 columns)
          order.orderNumber,
          order.customerProfileId || "",
          order.customerName,
          order.deliveryName || "",
          order.deliveryAddress || "",
          order.creationDate,
          order.deliveryDate || "",
          order.remainingSalesFinancial || null,
          order.customerReference || null,
          order.salesStatus || null,
          order.orderType || null,
          order.documentStatus || null,
          order.salesOrigin || null,
          order.transferStatus || null,
          order.transferDate || null,
          order.completionDate || null,
          order.discountPercent || null,
          order.grossAmount || null,
          order.totalAmount || null,

          // Legacy status field
          order.status,

          // Metadata
          order.lastScraped || now,
          order.lastUpdated || now,
          isOpen ? 1 : 0,

          // Detail JSON
          order.detailJson || null,

          // Order management
          order.sentToMilanoAt || null,
          order.currentState || "unknown",

          // DDT fields (11 columns)
          order.ddtId || null,
          order.ddtNumber || null,
          order.ddtDeliveryDate || null,
          order.ddtOrderNumber || null,
          order.ddtCustomerAccount || null,
          order.ddtSalesName || null,
          order.ddtDeliveryName || null,
          order.trackingNumber || null,
          order.deliveryTerms || null,
          order.deliveryMethod || null,
          order.deliveryCity || null,

          // Computed tracking fields
          order.trackingUrl || null,
          order.trackingCourier || null,

          // Invoice fields
          order.invoiceNumber || null,
          order.invoiceDate || null,
          order.invoiceAmount || null,
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

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map((row) => ({
      ...row,
      isOpen: Boolean(row.isOpen),

      // Ensure all nullable fields are properly typed
      remainingSalesFinancial: row.remainingSalesFinancial || null,
      customerReference: row.customerReference || null,
      salesStatus: row.salesStatus || null,
      orderType: row.orderType || null,
      documentStatus: row.documentStatus || null,
      salesOrigin: row.salesOrigin || null,
      transferStatus: row.transferStatus || null,
      transferDate: row.transferDate || null,
      completionDate: row.completionDate || null,
      discountPercent: row.discountPercent || null,
      grossAmount: row.grossAmount || null,
      totalAmount: row.totalAmount || null,

      sentToMilanoAt: row.sentToMilanoAt || null,
      currentState: row.currentState || "creato",

      // DDT fields
      ddtId: row.ddtId || null,
      ddtNumber: row.ddtNumber || null,
      ddtDeliveryDate: row.ddtDeliveryDate || null,
      ddtOrderNumber: row.ddtOrderNumber || null,
      ddtCustomerAccount: row.ddtCustomerAccount || null,
      ddtSalesName: row.ddtSalesName || null,
      ddtDeliveryName: row.ddtDeliveryName || null,
      trackingNumber: row.trackingNumber || null,
      deliveryTerms: row.deliveryTerms || null,
      deliveryMethod: row.deliveryMethod || null,
      deliveryCity: row.deliveryCity || null,
      trackingUrl: row.trackingUrl || null,
      trackingCourier: row.trackingCourier || null,

      // Invoice fields (map from snake_case DB columns)
      invoiceNumber: row.invoice_number || null,
      invoiceDate: row.invoice_date || null,
      invoiceAmount: row.invoice_amount || null,
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
      .all(userId, cutoffDate) as any[];

    return rows.map((row) => ({
      ...row,
      isOpen: Boolean(row.isOpen),
      sentToMilanoAt: row.sentToMilanoAt || null,
      currentState: row.currentState || "creato",
      ddtNumber: row.ddtNumber || null,
      trackingNumber: row.trackingNumber || null,
      trackingUrl: row.trackingUrl || null,
      trackingCourier: row.trackingCourier || null,

      // Invoice fields (map from snake_case DB columns)
      invoiceNumber: row.invoice_number || null,
      invoiceDate: row.invoice_date || null,
      invoiceAmount: row.invoice_amount || null,
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
      sentToMilanoAt: row.sentToMilanoAt || null,
      currentState: row.currentState || "creato",
      ddtNumber: row.ddtNumber || null,
      trackingNumber: row.trackingNumber || null,
      trackingUrl: row.trackingUrl || null,
      trackingCourier: row.trackingCourier || null,
    };
  }

  /**
   * Update order state after sending to Milano
   */
  updateOrderMilanoState(
    userId: string,
    orderId: string,
    sentToMilanoAt: string,
  ): void {
    this.db
      .prepare(
        `
      UPDATE orders
      SET sentToMilanoAt = ?, currentState = 'inviato_milano'
      WHERE id = ? AND userId = ?
    `,
      )
      .run(sentToMilanoAt, orderId, userId);

    logger.info(`Updated order ${orderId} Milano state for user ${userId}`);
  }

  /**
   * Update order DDT and tracking data
   */
  updateOrderDDT(
    userId: string,
    orderId: string,
    ddtData: {
      ddtNumber: string;
      trackingNumber?: string;
      trackingUrl?: string;
      trackingCourier?: string;
    },
  ): void {
    this.db
      .prepare(
        `
      UPDATE orders
      SET ddtNumber = ?, trackingNumber = ?, trackingUrl = ?, trackingCourier = ?
      WHERE id = ? AND userId = ?
    `,
      )
      .run(
        ddtData.ddtNumber,
        ddtData.trackingNumber || null,
        ddtData.trackingUrl || null,
        ddtData.trackingCourier || null,
        orderId,
        userId,
      );

    logger.info(`Updated order ${orderId} DDT data for user ${userId}`);
  }

  /**
   * Update order invoice data
   */
  updateInvoiceData(
    userId: string,
    orderId: string,
    invoiceData: {
      invoiceNumber: string;
      invoiceDate: string | null;
      invoiceAmount: number | null;
    },
  ): void {
    this.db
      .prepare(
        `
      UPDATE orders
      SET invoice_number = ?, invoice_date = ?, invoice_amount = ?
      WHERE id = ? AND userId = ?
    `,
      )
      .run(
        invoiceData.invoiceNumber,
        invoiceData.invoiceDate,
        invoiceData.invoiceAmount,
        orderId,
        userId,
      );

    logger.info(`Updated order ${orderId} invoice data for user ${userId}`);
  }

  /**
   * Insert audit log entry
   */
  insertAuditLog(
    orderId: string,
    action: string,
    performedBy: string,
    details?: Record<string, any>,
  ): void {
    const performedAt = new Date().toISOString();
    const detailsJson = details ? JSON.stringify(details) : null;

    this.db
      .prepare(
        `
      INSERT INTO order_audit_log (order_id, action, performed_by, performed_at, details)
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(orderId, action, performedBy, performedAt, detailsJson);

    logger.info(`Audit log entry created for order ${orderId}: ${action}`);
  }

  /**
   * Get audit log for an order
   */
  getAuditLog(orderId: string): OrderAuditLog[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM order_audit_log
      WHERE order_id = ?
      ORDER BY performed_at DESC
    `,
      )
      .all(orderId) as OrderAuditLog[];

    return rows;
  }

  /**
   * Insert state history entry
   */
  insertStateHistory(
    orderId: string,
    state: string,
    changedBy?: string,
    notes?: string,
  ): void {
    const changedAt = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO order_state_history (order_id, state, changed_at, changed_by, notes)
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(orderId, state, changedAt, changedBy || null, notes || null);

    logger.info(`State history entry created for order ${orderId}: ${state}`);
  }

  /**
   * Get state history for an order
   */
  getStateHistory(orderId: string): OrderStateHistory[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM order_state_history
      WHERE order_id = ?
      ORDER BY changed_at DESC
    `,
      )
      .all(orderId) as OrderStateHistory[];

    return rows.map((row) => ({
      ...row,
      changedBy: row.changedBy || undefined,
      notes: row.notes || undefined,
    }));
  }

  /**
   * Update order current state and record in history
   */
  updateOrderState(
    orderId: string,
    userId: string,
    newState: string,
    changedBy?: string,
    notes?: string,
  ): void {
    // Update current state
    this.db
      .prepare(
        `
      UPDATE orders
      SET currentState = ?
      WHERE id = ? AND userId = ?
    `,
      )
      .run(newState, orderId, userId);

    // Record in history
    this.insertStateHistory(orderId, newState, changedBy, notes);

    logger.info(
      `Updated order ${orderId} state to ${newState} for user ${userId}`,
    );
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
    // First, get all order IDs for this user
    const orderIds = this.db
      .prepare("SELECT id FROM orders WHERE userId = ?")
      .all(userId)
      .map((row: any) => row.id);

    if (orderIds.length === 0) {
      logger.info(`No orders to clear for user ${userId}`);
      return;
    }

    // Temporarily disable foreign key constraints to avoid mismatch errors
    this.db.prepare("PRAGMA foreign_keys = OFF").run();

    try {
      // Delete related records first to avoid foreign key constraint errors
      const placeholders = orderIds.map(() => "?").join(",");

      // Delete from order_state_history
      const stateResult = this.db
        .prepare(
          `DELETE FROM order_state_history WHERE order_id IN (${placeholders})`,
        )
        .run(...orderIds);
      logger.info(`Cleared ${stateResult.changes} state history entries`);

      // Delete from order_audit_log
      const auditResult = this.db
        .prepare(
          `DELETE FROM order_audit_log WHERE order_id IN (${placeholders})`,
        )
        .run(...orderIds);
      logger.info(`Cleared ${auditResult.changes} audit log entries`);

      // Finally delete orders
      const result = this.db
        .prepare("DELETE FROM orders WHERE userId = ?")
        .run(userId);
      logger.info(`Cleared ${result.changes} orders for user ${userId}`);
    } finally {
      // Re-enable foreign key constraints
      this.db.prepare("PRAGMA foreign_keys = ON").run();
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info("OrderDatabase closed");
  }
}
