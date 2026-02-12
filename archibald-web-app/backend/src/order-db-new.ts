import Database from "better-sqlite3";
import crypto from "crypto";
import { logger } from "./logger";
import path from "node:path";

export interface OrderRecord {
  id: string;
  userId: string;
  orderNumber: string; // Format: "ORD/xxxxxxxx" or "PENDING-{id}" for orders awaiting Verona processing
  customerProfileId: string | null;
  customerName: string; // May be "In attesa elaborazione" for pending orders
  deliveryName: string | null;
  deliveryAddress: string | null;
  creationDate: string; // ISO 8601
  deliveryDate: string | null;
  remainingSalesFinancial: string | null;
  customerReference: string | null;
  salesStatus: string | null;
  orderType: string | null;
  documentStatus: string | null;
  salesOrigin: string | null;
  transferStatus: string | null;
  transferDate: string | null;
  completionDate: string | null;
  discountPercent: string | null;
  grossAmount: string | null;
  totalAmount: string | null;
  isQuote?: string | null;
  isGiftOrder?: string | null;
  lastSync: number;

  // Core DDT fields (stored directly in orders table)
  ddtNumber?: string | null;
  ddtDeliveryDate?: string | null;
  ddtId?: string | null;
  ddtCustomerAccount?: string | null;
  ddtSalesName?: string | null;
  ddtDeliveryName?: string | null;
  deliveryTerms?: string | null;
  deliveryMethod?: string | null;
  deliveryCity?: string | null;
  attentionTo?: string | null;
  ddtDeliveryAddress?: string | null;
  ddtTotal?: string | null;
  ddtCustomerReference?: string | null;
  ddtDescription?: string | null;

  // Tracking fields (stored directly in orders table)
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  trackingCourier?: string | null;
  deliveryCompletedDate?: string | null; // ISO timestamp when delivery was completed

  // Invoice fields (stored directly in orders table)
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  invoiceAmount?: string | null;
  invoiceCustomerAccount?: string | null;
  invoiceBillingName?: string | null;
  invoiceQuantity?: number | null;
  invoiceRemainingAmount?: string | null;
  invoiceTaxAmount?: string | null;
  invoiceLineDiscount?: string | null;
  invoiceTotalDiscount?: string | null;
  invoiceDueDate?: string | null;
  invoicePaymentTermsId?: string | null;
  invoicePurchaseOrder?: string | null;
  invoiceClosed?: boolean | null;
  invoiceDaysPastDue?: string | null;
  invoiceSettledAmount?: string | null;
  invoiceLastPaymentId?: string | null;
  invoiceLastSettlementDate?: string | null;
  invoiceClosedDate?: string | null;

  // State tracking fields
  currentState?: string | null;
  sentToMilanoAt?: string | null;
  archibaldOrderId?: string | null;

  // VAT/Totals fields (for article sync)
  totalVatAmount?: string | null; // Italian format: "123,45 €"
  totalWithVat?: string | null; // Italian format: "987,65 €"
  articlesSyncedAt?: string | null; // ISO timestamp

  // Shipping costs fields (automatic for imponibile < 200€)
  shippingCost?: number | null; // Spese di trasporto K3 (imponibile)
  shippingTax?: number | null; // IVA on shipping (22%)

  // Legacy/compatibility fields
  status?: string; // Legacy field (same as salesStatus for compatibility)
  lastScraped?: string; // ISO timestamp
  lastUpdated?: string; // ISO timestamp
  ddtOrderNumber?: string | null; // Legacy alias for orderNumber in DDT context
  isOpen?: boolean; // Whether order is still open
  detailJson?: string | null; // JSON string with full order details
}

export interface OrderStateHistoryRecord {
  id?: number;
  orderId: string;
  oldState: string | null;
  newState: string;
  actor: string;
  notes: string | null;
  confidence?: string | null;
  source?: string | null;
  timestamp: string;
  createdAt?: string;
}

export interface OrderArticleRecord {
  orderId: string;
  articleCode: string;
  articleDescription?: string;
  quantity: number;
  unitPrice?: number;
  discountPercent?: number;
  lineAmount?: number;
  vatPercent?: number;
  vatAmount?: number;
  lineTotalWithVat?: number;
  // Warehouse integration fields
  warehouseQuantity?: number;
  warehouseSourcesJson?: string; // JSON string of warehouseSources array
}

export class OrderDatabaseNew {
  private static instance: OrderDatabaseNew;
  private db: Database.Database;

  private constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(__dirname, "../data/orders-new.db");
    this.db = new Database(finalPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
    this.runMigrations();
    logger.info("[OrderDatabaseNew] Initialized", { path: finalPath });
  }

  static getInstance(dbPath?: string): OrderDatabaseNew {
    if (!OrderDatabaseNew.instance) {
      OrderDatabaseNew.instance = new OrderDatabaseNew(dbPath);
    }
    return OrderDatabaseNew.instance;
  }

  private initSchema(): void {
    // Create tables first (with all columns for new databases)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        order_number TEXT NOT NULL UNIQUE,
        customer_profile_id TEXT,
        customer_name TEXT NOT NULL,
        delivery_name TEXT,
        delivery_address TEXT,
        creation_date TEXT NOT NULL,
        delivery_date TEXT,
        remaining_sales_financial TEXT,
        customer_reference TEXT,
        sales_status TEXT,
        order_type TEXT,
        document_status TEXT,
        sales_origin TEXT,
        transfer_status TEXT,
        transfer_date TEXT,
        completion_date TEXT,
        discount_percent TEXT,
        gross_amount TEXT,
        total_amount TEXT,
        is_quote TEXT,
        is_gift_order TEXT,
        hash TEXT NOT NULL,
        last_sync INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        ddt_number TEXT,
        ddt_delivery_date TEXT,
        ddt_id TEXT,
        ddt_customer_account TEXT,
        ddt_sales_name TEXT,
        ddt_delivery_name TEXT,
        delivery_terms TEXT,
        delivery_method TEXT,
        delivery_city TEXT,
        attention_to TEXT,
        ddt_delivery_address TEXT,
        ddt_total TEXT,
        ddt_customer_reference TEXT,
        ddt_description TEXT,
        tracking_number TEXT,
        tracking_url TEXT,
        tracking_courier TEXT,
        invoice_number TEXT,
        invoice_date TEXT,
        invoice_amount TEXT,
        invoice_customer_account TEXT,
        invoice_billing_name TEXT,
        invoice_quantity INTEGER,
        invoice_remaining_amount TEXT,
        invoice_tax_amount TEXT,
        invoice_line_discount TEXT,
        invoice_total_discount TEXT,
        invoice_due_date TEXT,
        invoice_payment_terms_id TEXT,
        invoice_purchase_order TEXT,
        invoice_closed INTEGER,
        invoice_days_past_due TEXT,
        invoice_settled_amount TEXT,
        invoice_last_payment_id TEXT,
        invoice_last_settlement_date TEXT,
        invoice_closed_date TEXT,
        current_state TEXT,
        sent_to_milano_at TEXT,
        archibald_order_id TEXT
      );

      CREATE TABLE IF NOT EXISTS order_articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        article_code TEXT NOT NULL,
        article_description TEXT,
        quantity REAL NOT NULL,
        unit_price REAL,
        discount_percent REAL,
        line_amount REAL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );

      CREATE TABLE IF NOT EXISTS order_state_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        old_state TEXT,
        new_state TEXT NOT NULL,
        actor TEXT NOT NULL,
        notes TEXT,
        confidence TEXT,
        source TEXT,
        timestamp TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );

      CREATE TABLE IF NOT EXISTS widget_order_exclusions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        excluded_from_yearly BOOLEAN NOT NULL DEFAULT 0,
        excluded_from_monthly BOOLEAN NOT NULL DEFAULT 0,
        reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, order_id),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      );
    `);

    // Create core indexes that work on all database versions
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_profile_id);
      CREATE INDEX IF NOT EXISTS idx_orders_sync ON orders(last_sync);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(sales_status);
      CREATE INDEX IF NOT EXISTS idx_articles_order_id ON order_articles(order_id);
      CREATE INDEX IF NOT EXISTS idx_articles_code ON order_articles(article_code);
      CREATE INDEX IF NOT EXISTS idx_state_history_order ON order_state_history(order_id);
      CREATE INDEX IF NOT EXISTS idx_state_history_timestamp ON order_state_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_exclusions_user_order ON widget_order_exclusions(user_id, order_id);
      CREATE INDEX IF NOT EXISTS idx_exclusions_yearly ON widget_order_exclusions(excluded_from_yearly);
      CREATE INDEX IF NOT EXISTS idx_exclusions_monthly ON widget_order_exclusions(excluded_from_monthly);
    `);
  }

  private runMigrations(): void {
    logger.info("[OrderDatabaseNew] Running migrations...");

    // Get existing columns
    const columns = this.db
      .prepare("PRAGMA table_info(orders)")
      .all() as Array<{ name: string }>;
    const existingColumns = new Set(columns.map((c) => c.name));

    // List of all columns that may be missing (comprehensive migration)
    const newColumns = [
      // Core DDT fields (may be missing in old VPS database)
      { name: "ddt_number", type: "TEXT" },
      { name: "ddt_delivery_date", type: "TEXT" },
      { name: "ddt_id", type: "TEXT" },
      { name: "ddt_customer_account", type: "TEXT" },
      { name: "ddt_sales_name", type: "TEXT" },
      { name: "ddt_delivery_name", type: "TEXT" },
      { name: "delivery_terms", type: "TEXT" },
      { name: "delivery_method", type: "TEXT" },
      { name: "delivery_city", type: "TEXT" },
      { name: "attention_to", type: "TEXT" },
      // Additional DDT fields
      { name: "ddt_delivery_address", type: "TEXT" },
      { name: "ddt_total", type: "TEXT" },
      { name: "ddt_customer_reference", type: "TEXT" },
      { name: "ddt_description", type: "TEXT" },
      // Tracking fields (may be missing)
      { name: "tracking_number", type: "TEXT" },
      { name: "tracking_url", type: "TEXT" },
      { name: "tracking_courier", type: "TEXT" },
      { name: "delivery_completed_date", type: "TEXT" }, // ISO timestamp when delivery was completed
      // Core Invoice fields (may be missing)
      { name: "invoice_number", type: "TEXT" },
      { name: "invoice_date", type: "TEXT" },
      { name: "invoice_amount", type: "TEXT" },
      // Additional Invoice fields (from data leak fix)
      { name: "invoice_customer_account", type: "TEXT" },
      { name: "invoice_billing_name", type: "TEXT" },
      { name: "invoice_quantity", type: "INTEGER" },
      { name: "invoice_remaining_amount", type: "TEXT" },
      { name: "invoice_tax_amount", type: "TEXT" },
      { name: "invoice_line_discount", type: "TEXT" },
      { name: "invoice_total_discount", type: "TEXT" },
      { name: "invoice_due_date", type: "TEXT" },
      { name: "invoice_payment_terms_id", type: "TEXT" },
      { name: "invoice_purchase_order", type: "TEXT" },
      { name: "invoice_closed", type: "INTEGER" },
      // Additional invoice payment fields
      { name: "invoice_days_past_due", type: "TEXT" },
      { name: "invoice_settled_amount", type: "TEXT" },
      { name: "invoice_last_payment_id", type: "TEXT" },
      { name: "invoice_last_settlement_date", type: "TEXT" },
      { name: "invoice_closed_date", type: "TEXT" },
      // State tracking fields (may be missing)
      { name: "current_state", type: "TEXT" },
      { name: "sent_to_milano_at", type: "TEXT" },
      { name: "archibald_order_id", type: "TEXT" },
      // Quote/Gift order fields
      { name: "is_quote", type: "TEXT" },
      { name: "is_gift_order", type: "TEXT" },
      // VAT/Totals fields (for article sync)
      { name: "total_vat_amount", type: "TEXT" },
      { name: "total_with_vat", type: "TEXT" },
      { name: "articles_synced_at", type: "TEXT" }, // ISO timestamp of last articles sync
    ];

    // Add missing columns
    let addedCount = 0;
    for (const col of newColumns) {
      if (!existingColumns.has(col.name)) {
        try {
          this.db.exec(`ALTER TABLE orders ADD COLUMN ${col.name} ${col.type}`);
          logger.info(
            `[OrderDatabaseNew] Added missing column: ${col.name} (${col.type})`,
          );
          addedCount++;
        } catch (error) {
          logger.error(
            `[OrderDatabaseNew] Failed to add column ${col.name}`,
            error,
          );
        }
      }
    }

    if (addedCount > 0) {
      logger.info(
        `[OrderDatabaseNew] Migration completed: added ${addedCount} columns`,
      );
    } else {
      logger.info(
        "[OrderDatabaseNew] No migrations needed - schema up to date",
      );
    }

    // Create indexes for new columns (after migration ensures columns exist)
    // Re-check columns after migration to ensure new columns are present
    const updatedColumns = this.db
      .prepare("PRAGMA table_info(orders)")
      .all() as Array<{ name: string }>;
    const finalColumns = new Set(updatedColumns.map((c) => c.name));

    // Create indexes only if columns exist
    const indexesToCreate = [
      {
        name: "idx_orders_current_state",
        column: "current_state",
        sql: "CREATE INDEX IF NOT EXISTS idx_orders_current_state ON orders(current_state)",
      },
      {
        name: "idx_orders_ddt",
        column: "ddt_number",
        sql: "CREATE INDEX IF NOT EXISTS idx_orders_ddt ON orders(ddt_number)",
      },
      {
        name: "idx_orders_invoice",
        column: "invoice_number",
        sql: "CREATE INDEX IF NOT EXISTS idx_orders_invoice ON orders(invoice_number)",
      },
    ];

    for (const idx of indexesToCreate) {
      if (finalColumns.has(idx.column)) {
        try {
          this.db.exec(idx.sql);
          logger.debug(
            `[OrderDatabaseNew] Created index ${idx.name} on ${idx.column}`,
          );
        } catch (error) {
          logger.warn(
            `[OrderDatabaseNew] Failed to create index ${idx.name}`,
            error,
          );
        }
      }
    }

    // Migrate order_articles table for VAT fields
    logger.info("[OrderDatabaseNew] Migrating order_articles table...");

    const articlesColumns = this.db
      .prepare("PRAGMA table_info(order_articles)")
      .all() as Array<{ name: string }>;
    const existingArticlesColumns = new Set(articlesColumns.map((c) => c.name));

    const newArticlesColumns = [
      { name: "vat_percent", type: "REAL" },
      { name: "vat_amount", type: "REAL" },
      { name: "line_total_with_vat", type: "REAL" },
      // Warehouse integration fields
      { name: "warehouse_quantity", type: "REAL" },
      { name: "warehouse_sources_json", type: "TEXT" },
    ];

    let articlesAddedCount = 0;
    for (const col of newArticlesColumns) {
      if (!existingArticlesColumns.has(col.name)) {
        try {
          this.db.exec(
            `ALTER TABLE order_articles ADD COLUMN ${col.name} ${col.type}`,
          );
          logger.info(
            `[OrderDatabaseNew] Added missing column to order_articles: ${col.name} (${col.type})`,
          );
          articlesAddedCount++;
        } catch (error) {
          logger.error(
            `[OrderDatabaseNew] Failed to add column ${col.name} to order_articles`,
            error,
          );
        }
      }
    }

    if (articlesAddedCount > 0) {
      logger.info(
        `[OrderDatabaseNew] order_articles migration completed: added ${articlesAddedCount} columns`,
      );
    } else {
      logger.info("[OrderDatabaseNew] order_articles schema up to date");
    }
  }

  private computeHash(order: Omit<OrderRecord, "lastSync" | "userId">): string {
    // Hash key fields for delta detection
    const hashInput = [
      order.id,
      order.orderNumber,
      order.salesStatus,
      order.documentStatus,
      order.transferStatus,
      order.totalAmount,
    ].join("|");
    return crypto.createHash("md5").update(hashInput).digest("hex");
  }

  upsertOrder(
    userId: string,
    order: Omit<OrderRecord, "userId" | "lastSync">,
  ): {
    action: "inserted" | "updated" | "skipped";
    orderNumberChanged?: { from: string; to: string };
  } {
    const now = Math.floor(Date.now() / 1000);
    const hash = this.computeHash(order);

    // Check if exists by id (PRIMARY KEY) instead of order_number
    // This handles the case where order_number changes from PENDING-X to ORD/Y
    const existing = this.db
      .prepare(
        `
      SELECT hash, order_number FROM orders WHERE user_id = ? AND id = ?
    `,
      )
      .get(userId, order.id) as
      | { hash: string; order_number: string }
      | undefined;

    const orderNumberChanged =
      existing && existing.order_number !== order.orderNumber
        ? { from: existing.order_number, to: order.orderNumber }
        : undefined;

    if (!existing) {
      // Insert new order
      this.db
        .prepare(
          `
        INSERT INTO orders (
          id, user_id, order_number, customer_profile_id, customer_name,
          delivery_name, delivery_address, creation_date, delivery_date,
          remaining_sales_financial, customer_reference, sales_status,
          order_type, document_status, sales_origin, transfer_status,
          transfer_date, completion_date, discount_percent, gross_amount,
          total_amount, is_quote, is_gift_order, hash, last_sync, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          order.id,
          userId,
          order.orderNumber,
          order.customerProfileId,
          order.customerName,
          order.deliveryName,
          order.deliveryAddress,
          order.creationDate,
          order.deliveryDate,
          order.remainingSalesFinancial,
          order.customerReference,
          order.salesStatus,
          order.orderType,
          order.documentStatus,
          order.salesOrigin,
          order.transferStatus,
          order.transferDate,
          order.completionDate,
          order.discountPercent,
          order.grossAmount,
          order.totalAmount,
          order.isQuote || null,
          order.isGiftOrder || null,
          hash,
          now,
          new Date().toISOString(),
        );
      return { action: "inserted" };
    }

    // Check if changed
    if (existing.hash === hash) {
      // Unchanged - update only last_sync timestamp and order_number (in case it changed from PENDING to ORD)
      this.db
        .prepare(
          `UPDATE orders SET last_sync = ?, order_number = ? WHERE user_id = ? AND id = ?`,
        )
        .run(now, order.orderNumber, userId, order.id);
      return { action: "skipped", orderNumberChanged };
    }

    // Update changed order (including order_number in case it changed from PENDING to ORD)
    this.db
      .prepare(
        `
      UPDATE orders SET
        order_number = ?, customer_profile_id = ?, customer_name = ?, delivery_name = ?,
        delivery_address = ?, creation_date = ?, delivery_date = ?,
        remaining_sales_financial = ?, customer_reference = ?, sales_status = ?,
        order_type = ?, document_status = ?, sales_origin = ?, transfer_status = ?,
        transfer_date = ?, completion_date = ?, discount_percent = ?,
        gross_amount = ?, total_amount = ?, is_quote = ?, is_gift_order = ?,
        hash = ?, last_sync = ?
      WHERE user_id = ? AND id = ?
    `,
      )
      .run(
        order.orderNumber,
        order.customerProfileId,
        order.customerName,
        order.deliveryName,
        order.deliveryAddress,
        order.creationDate,
        order.deliveryDate,
        order.remainingSalesFinancial,
        order.customerReference,
        order.salesStatus,
        order.orderType,
        order.documentStatus,
        order.salesOrigin,
        order.transferStatus,
        order.transferDate,
        order.completionDate,
        order.discountPercent,
        order.grossAmount,
        order.totalAmount,
        order.isQuote || null,
        order.isGiftOrder || null,
        hash,
        now,
        userId,
        order.id,
      );
    return { action: "updated", orderNumberChanged };
  }

  getOrderNumbersByIds(
    userId: string,
    orderIds: string[],
  ): Array<{ id: string; orderNumber: string }> {
    if (orderIds.length === 0) return [];
    const placeholders = orderIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT id, order_number FROM orders WHERE user_id = ? AND id IN (${placeholders})`,
      )
      .all(userId, ...orderIds) as Array<{ id: string; order_number: string }>;
    return rows.map((r) => ({ id: r.id, orderNumber: r.order_number }));
  }

  getTotalCount(): number {
    const result = this.db
      .prepare(`SELECT COUNT(*) as count FROM orders`)
      .get() as { count: number };
    return result.count;
  }

  getLastSyncTime(): Date | null {
    const result = this.db
      .prepare(
        `
      SELECT MAX(last_sync) as lastSync FROM orders
    `,
      )
      .get() as { lastSync: number | null };

    return result.lastSync ? new Date(result.lastSync * 1000) : null;
  }

  getOrdersByUser(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: string;
      customer?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string; // Global search parameter
    },
  ): OrderRecord[] {
    const limit = options?.limit || 1000; // Default high limit for backward compatibility
    const offset = options?.offset || 0;

    let query = `SELECT * FROM orders WHERE user_id = ?`;
    const params: any[] = [userId];

    // Global search (searches across multiple fields)
    if (options?.search) {
      const searchTerm = `%${options.search}%`;
      query += ` AND (
        order_number LIKE ? OR
        customer_name LIKE ? OR
        total_amount LIKE ? OR
        gross_amount LIKE ? OR
        tracking_number LIKE ? OR
        ddt_number LIKE ? OR
        invoice_number LIKE ? OR
        delivery_address LIKE ? OR
        customer_reference LIKE ?
      )`;
      // Add search term for each field
      for (let i = 0; i < 9; i++) {
        params.push(searchTerm);
      }
    }

    // Add filters
    if (options?.customer) {
      query += ` AND customer_name LIKE ?`;
      params.push(`%${options.customer}%`);
    }

    if (options?.status) {
      query += ` AND sales_status = ?`;
      params.push(options.status);
    }

    if (options?.dateFrom) {
      query += ` AND creation_date >= ?`;
      params.push(options.dateFrom);
    }

    if (options?.dateTo) {
      query += ` AND creation_date <= ?`;
      params.push(options.dateTo);
    }

    query += ` ORDER BY creation_date DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params) as any[];

    // Map snake_case to camelCase
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      orderNumber: row.order_number,
      customerProfileId: row.customer_profile_id,
      customerName: row.customer_name,
      deliveryName: row.delivery_name,
      deliveryAddress: row.delivery_address,
      creationDate: row.creation_date,
      deliveryDate: row.delivery_date,
      remainingSalesFinancial: row.remaining_sales_financial,
      customerReference: row.customer_reference,
      salesStatus: row.sales_status,
      orderType: row.order_type,
      documentStatus: row.document_status,
      salesOrigin: row.sales_origin,
      transferStatus: row.transfer_status,
      transferDate: row.transfer_date,
      completionDate: row.completion_date,
      discountPercent: row.discount_percent,
      grossAmount: row.gross_amount,
      totalAmount: row.total_amount,
      isQuote: row.is_quote || null,
      isGiftOrder: row.is_gift_order || null,
      lastSync: row.last_sync,
      // DDT fields
      ddtNumber: row.ddt_number,
      ddtDeliveryDate: row.ddt_delivery_date,
      ddtId: row.ddt_id,
      ddtCustomerAccount: row.ddt_customer_account,
      ddtSalesName: row.ddt_sales_name,
      ddtDeliveryName: row.ddt_delivery_name,
      deliveryTerms: row.delivery_terms,
      deliveryMethod: row.delivery_method,
      deliveryCity: row.delivery_city,
      attentionTo: row.attention_to,
      ddtDeliveryAddress: row.ddt_delivery_address,
      ddtTotal: row.ddt_total,
      ddtCustomerReference: row.ddt_customer_reference,
      ddtDescription: row.ddt_description,
      // Tracking fields
      trackingNumber: row.tracking_number,
      trackingUrl: row.tracking_url,
      trackingCourier: row.tracking_courier,
      // Invoice fields
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      invoiceAmount: row.invoice_amount,
      invoiceCustomerAccount: row.invoice_customer_account,
      invoiceBillingName: row.invoice_billing_name,
      invoiceQuantity: row.invoice_quantity,
      invoiceRemainingAmount: row.invoice_remaining_amount,
      invoiceTaxAmount: row.invoice_tax_amount,
      invoiceLineDiscount: row.invoice_line_discount,
      invoiceTotalDiscount: row.invoice_total_discount,
      invoiceDueDate: row.invoice_due_date,
      invoicePaymentTermsId: row.invoice_payment_terms_id,
      invoicePurchaseOrder: row.invoice_purchase_order,
      invoiceClosed: row.invoice_closed ? true : false,
      invoiceDaysPastDue: row.invoice_days_past_due,
      invoiceSettledAmount: row.invoice_settled_amount,
      invoiceLastPaymentId: row.invoice_last_payment_id,
      invoiceLastSettlementDate: row.invoice_last_settlement_date,
      invoiceClosedDate: row.invoice_closed_date,
      // State fields
      currentState: row.current_state,
      sentToMilanoAt: row.sent_to_milano_at,
      archibaldOrderId: row.archibald_order_id,
      // Articles totals
      totalVatAmount: row.total_vat_amount,
      totalWithVat: row.total_with_vat,
      articlesSyncedAt: row.articles_synced_at,
    }));
  }

  saveOrderArticles(articles: OrderArticleRecord[]): number {
    if (articles.length === 0) {
      return 0;
    }

    const insert = this.db.prepare(`
      INSERT INTO order_articles (
        order_id, article_code, article_description, quantity,
        unit_price, discount_percent, line_amount,
        warehouse_quantity, warehouse_sources_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const insertMany = this.db.transaction(
      (articlesToInsert: OrderArticleRecord[]) => {
        for (const article of articlesToInsert) {
          insert.run(
            article.orderId,
            article.articleCode,
            article.articleDescription || null,
            article.quantity,
            article.unitPrice || null,
            article.discountPercent || null,
            article.lineAmount || null,
            article.warehouseQuantity || null,
            article.warehouseSourcesJson || null,
            now,
          );
        }
      },
    );

    insertMany(articles);
    logger.info(
      `[OrderDatabaseNew] Saved ${articles.length} articles for order ${articles[0]?.orderId}`,
    );

    // Automatically fix K3 article VAT if Archibald synced without calculating it
    const orderId = articles[0]?.orderId;
    if (orderId) {
      this.fixK3ArticleVAT(orderId);
    }

    return articles.length;
  }

  getOrderArticles(orderId: string): OrderArticleRecord[] {
    const rows = this.db
      .prepare(
        `SELECT
          order_id, article_code, article_description, quantity,
          unit_price, discount_percent, line_amount,
          vat_percent, vat_amount, line_total_with_vat,
          warehouse_quantity, warehouse_sources_json
        FROM order_articles
        WHERE order_id = ?
        ORDER BY id`,
      )
      .all(orderId) as Array<{
      order_id: string;
      article_code: string;
      article_description: string | null;
      quantity: number;
      unit_price: number | null;
      discount_percent: number | null;
      line_amount: number | null;
      vat_percent: number | null;
      vat_amount: number | null;
      line_total_with_vat: number | null;
      warehouse_quantity: number | null;
      warehouse_sources_json: string | null;
    }>;

    return rows.map((row) => ({
      orderId: row.order_id,
      articleCode: row.article_code,
      articleDescription: row.article_description || undefined,
      quantity: row.quantity,
      unitPrice: row.unit_price || undefined,
      discountPercent: row.discount_percent || undefined,
      lineAmount: row.line_amount || undefined,
      vatPercent: row.vat_percent || undefined,
      vatAmount: row.vat_amount || undefined,
      lineTotalWithVat: row.line_total_with_vat || undefined,
      warehouseQuantity: row.warehouse_quantity || undefined,
      warehouseSourcesJson: row.warehouse_sources_json || undefined,
    }));
  }

  getArticleSearchTexts(orderIds: string[]): Map<string, string> {
    if (orderIds.length === 0) return new Map();
    const placeholders = orderIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT order_id, GROUP_CONCAT(article_code || ' ' || COALESCE(article_description, ''), ' | ') as search_text
         FROM order_articles
         WHERE order_id IN (${placeholders})
         GROUP BY order_id`,
      )
      .all(...orderIds) as Array<{ order_id: string; search_text: string }>;
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.order_id, row.search_text);
    }
    return map;
  }

  deleteOrderById(userId: string, orderId: string): void {
    this.db
      .prepare("DELETE FROM order_state_history WHERE order_id = ?")
      .run(orderId);
    this.db
      .prepare("DELETE FROM order_articles WHERE order_id = ?")
      .run(orderId);
    const result = this.db
      .prepare("DELETE FROM orders WHERE id = ? AND user_id = ?")
      .run(orderId, userId);
    logger.info(
      `[OrderDatabaseNew] Deleted order ${orderId} (${result.changes} rows)`,
    );
  }

  deleteOrderArticles(orderId: string): void {
    const result = this.db
      .prepare("DELETE FROM order_articles WHERE order_id = ?")
      .run(orderId);

    logger.info(
      `[OrderDatabaseNew] Deleted ${result.changes} articles for order ${orderId}`,
    );
  }

  saveOrderArticlesWithVat(
    articles: Array<
      OrderArticleRecord & {
        vatPercent: number;
        vatAmount: number;
        lineTotalWithVat: number;
      }
    >,
  ): number {
    if (articles.length === 0) {
      return 0;
    }

    const insert = this.db.prepare(`
      INSERT INTO order_articles (
        order_id, article_code, article_description, quantity,
        unit_price, discount_percent, line_amount,
        vat_percent, vat_amount, line_total_with_vat,
        warehouse_quantity, warehouse_sources_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const insertMany = this.db.transaction(
      (
        articlesToInsert: Array<
          OrderArticleRecord & {
            vatPercent: number;
            vatAmount: number;
            lineTotalWithVat: number;
          }
        >,
      ) => {
        for (const article of articlesToInsert) {
          insert.run(
            article.orderId,
            article.articleCode,
            article.articleDescription || null,
            article.quantity,
            article.unitPrice || null,
            article.discountPercent || null,
            article.lineAmount || null,
            article.vatPercent,
            article.vatAmount,
            article.lineTotalWithVat,
            article.warehouseQuantity || null,
            article.warehouseSourcesJson || null,
            now,
          );
        }
      },
    );

    insertMany(articles);
    logger.info(
      `[OrderDatabaseNew] Saved ${articles.length} articles with VAT for order ${articles[0]?.orderId}`,
    );

    // Automatically fix K3 article VAT if Archibald synced without calculating it
    const orderId = articles[0]?.orderId;
    if (orderId) {
      this.fixK3ArticleVAT(orderId);
    }

    return articles.length;
  }

  updateOrderTotals(
    orderId: string,
    totals: { totalVatAmount: number; totalWithVat: number },
  ): void {
    // Store as plain numbers in string format (e.g., "144.98") for backward compatibility
    // Frontend/API can format for display
    const totalVatAmountStr = totals.totalVatAmount.toFixed(2);
    const totalWithVatStr = totals.totalWithVat.toFixed(2);
    const syncedAt = new Date().toISOString();

    const result = this.db
      .prepare(
        `UPDATE orders
         SET total_vat_amount = ?, total_with_vat = ?, articles_synced_at = ?
         WHERE id = ?`,
      )
      .run(totalVatAmountStr, totalWithVatStr, syncedAt, orderId);

    logger.info(`[OrderDatabaseNew] Updated totals for order ${orderId}`, {
      totalVatAmount: totalVatAmountStr,
      totalWithVat: totalWithVatStr,
      articlesSyncedAt: syncedAt,
      rowsAffected: result.changes,
    });

    // Verify the update was successful by reading back
    const verification = this.db
      .prepare(
        `SELECT total_vat_amount, total_with_vat, articles_synced_at FROM orders WHERE id = ?`,
      )
      .get(orderId) as {
      total_vat_amount: string | null;
      total_with_vat: string | null;
      articles_synced_at: string | null;
    };

    logger.info(`[OrderDatabaseNew] Verified totals in database`, {
      orderId,
      storedValues: verification,
      expectedValues: {
        total_vat_amount: totalVatAmountStr,
        total_with_vat: totalWithVatStr,
      },
      match:
        verification?.total_vat_amount === totalVatAmountStr &&
        verification?.total_with_vat === totalWithVatStr,
    });
  }

  /**
   * Fix K3 shipping article VAT when Archibald syncs without calculating it
   * Identifies "Spese di trasporto K3" articles and adds missing 22% VAT
   */
  fixK3ArticleVAT(orderId: string): number {
    const K3_VAT_RATE = 0.22; // 22% IVA
    let fixedCount = 0;

    logger.info(
      `[OrderDatabaseNew] fixK3ArticleVAT called for order ${orderId}`,
    );

    // First, check ALL articles for this order to see what we have
    const allArticles = this.db
      .prepare(
        `SELECT id, article_code, article_description, vat_percent, vat_amount, line_total_with_vat
         FROM order_articles
         WHERE order_id = ?`,
      )
      .all(orderId);
    logger.info(
      `[OrderDatabaseNew] Found ${allArticles.length} total articles for order ${orderId}`,
      { articles: allArticles },
    );

    // Find K3 articles without VAT calculated (vat_percent NULL or 0)
    const k3Articles = this.db
      .prepare(
        `SELECT id, article_code, article_description, unit_price, line_amount, vat_percent
         FROM order_articles
         WHERE order_id = ?
         AND (article_code = 'K3' OR article_code LIKE '%Spese di trasporto%K3%' OR article_description LIKE '%Spese di trasporto K3%')
         AND (vat_percent IS NULL OR vat_percent = 0)`,
      )
      .all(orderId) as Array<{
      id: number;
      article_code: string;
      article_description: string | null;
      unit_price: number | null;
      line_amount: number | null;
      vat_percent: number | null;
    }>;

    logger.info(
      `[OrderDatabaseNew] Found ${k3Articles.length} K3 articles with missing VAT`,
      { k3Articles },
    );

    if (k3Articles.length === 0) {
      return 0;
    }

    const updateStmt = this.db.prepare(`
      UPDATE order_articles
      SET vat_percent = ?,
          vat_amount = ?,
          line_total_with_vat = ?
      WHERE id = ?
    `);

    const fixMany = this.db.transaction((articles: typeof k3Articles) => {
      for (const article of articles) {
        // Calculate VAT based on line_amount (imponibile)
        const imponibile = article.line_amount || article.unit_price || 0;
        const vatAmount = imponibile * K3_VAT_RATE;
        const totalWithVat = imponibile + vatAmount;

        updateStmt.run(
          K3_VAT_RATE * 100, // Store as percentage (22)
          parseFloat(vatAmount.toFixed(2)),
          parseFloat(totalWithVat.toFixed(2)),
          article.id,
        );

        fixedCount++;

        logger.info(
          `[OrderDatabaseNew] Fixed K3 article VAT for order ${orderId}`,
          {
            articleId: article.id,
            articleCode: article.article_code,
            imponibile: imponibile.toFixed(2),
            vatAmount: vatAmount.toFixed(2),
            totalWithVat: totalWithVat.toFixed(2),
          },
        );
      }
    });

    fixMany(k3Articles);

    if (fixedCount > 0) {
      logger.info(
        `[OrderDatabaseNew] Fixed ${fixedCount} K3 articles for order ${orderId}`,
      );
    }

    return fixedCount;
  }

  countOrders(
    userId: string,
    options?: {
      status?: string;
      customer?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string; // Global search parameter
    },
  ): number {
    let query = `SELECT COUNT(*) as count FROM orders WHERE user_id = ?`;
    const params: any[] = [userId];

    // Global search (searches across multiple fields)
    if (options?.search) {
      const searchTerm = `%${options.search}%`;
      query += ` AND (
        order_number LIKE ? OR
        customer_name LIKE ? OR
        total_amount LIKE ? OR
        gross_amount LIKE ? OR
        tracking_number LIKE ? OR
        ddt_number LIKE ? OR
        invoice_number LIKE ? OR
        delivery_address LIKE ? OR
        customer_reference LIKE ?
      )`;
      // Add search term for each field
      for (let i = 0; i < 9; i++) {
        params.push(searchTerm);
      }
    }

    // Add filters
    if (options?.customer) {
      query += ` AND customer_name LIKE ?`;
      params.push(`%${options.customer}%`);
    }

    if (options?.status) {
      query += ` AND sales_status = ?`;
      params.push(options.status);
    }

    if (options?.dateFrom) {
      query += ` AND creation_date >= ?`;
      params.push(options.dateFrom);
    }

    if (options?.dateTo) {
      query += ` AND creation_date <= ?`;
      params.push(options.dateTo);
    }

    const result = this.db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  getLastScrapedTimestamp(userId: string): Date | null {
    const result = this.db
      .prepare(
        `SELECT MAX(last_sync) as lastSync FROM orders WHERE user_id = ?`,
      )
      .get(userId) as { lastSync: number | null };

    return result.lastSync ? new Date(result.lastSync * 1000) : null;
  }

  upsertOrders(
    userId: string,
    orders: Omit<OrderRecord, "userId" | "lastSync">[],
  ): void {
    for (const order of orders) {
      this.upsertOrder(userId, order);
    }
  }

  /**
   * Delete orders that are not in the provided list of IDs
   * Used for reconciliation: removes orders from local DB that no longer exist in Archibald
   * @returns number of orders deleted
   */
  deleteOrdersNotInList(userId: string, validOrderIds: string[]): number {
    if (validOrderIds.length === 0) {
      logger.warn(
        "[OrderDatabaseNew] deleteOrdersNotInList: empty validOrderIds list - skipping deletion",
        { userId },
      );
      return 0;
    }

    const placeholders = validOrderIds.map(() => "?").join(",");
    const params = [userId, ...validOrderIds];

    const staleOrderIds = this.db
      .prepare(
        `SELECT id FROM orders WHERE user_id = ? AND id NOT IN (${placeholders})`,
      )
      .all(...params) as { id: string }[];

    if (staleOrderIds.length === 0) {
      logger.info(
        "[OrderDatabaseNew] deleteOrdersNotInList: no stale orders found",
        { userId, validOrderIdsCount: validOrderIds.length },
      );
      return 0;
    }

    const staleIds = staleOrderIds.map((r) => r.id);
    const stalePlaceholders = staleIds.map(() => "?").join(",");

    logger.info(
      "[OrderDatabaseNew] deleteOrdersNotInList: removing stale orders and their child records",
      { userId, staleOrderIds: staleIds },
    );

    const deleteChildren = this.db.transaction(() => {
      this.db
        .prepare(
          `DELETE FROM order_articles WHERE order_id IN (${stalePlaceholders})`,
        )
        .run(...staleIds);
      this.db
        .prepare(
          `DELETE FROM order_state_history WHERE order_id IN (${stalePlaceholders})`,
        )
        .run(...staleIds);
      const result = this.db
        .prepare(
          `DELETE FROM orders WHERE user_id = ? AND id IN (${stalePlaceholders})`,
        )
        .run(userId, ...staleIds);
      return result.changes;
    });

    const deletedCount = deleteChildren();

    logger.info("[OrderDatabaseNew] deleteOrdersNotInList: completed", {
      userId,
      validOrderIdsCount: validOrderIds.length,
      deletedCount,
    });

    return deletedCount;
  }

  getOrderById(userId: string, orderId: string): OrderRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM orders WHERE user_id = ? AND id = ? LIMIT 1`)
      .get(userId, orderId) as any;

    if (!row) {
      return null;
    }

    // Map snake_case to camelCase
    return {
      id: row.id,
      userId: row.user_id,
      orderNumber: row.order_number,
      customerProfileId: row.customer_profile_id,
      customerName: row.customer_name,
      deliveryName: row.delivery_name,
      deliveryAddress: row.delivery_address,
      creationDate: row.creation_date,
      deliveryDate: row.delivery_date,
      remainingSalesFinancial: row.remaining_sales_financial,
      customerReference: row.customer_reference,
      salesStatus: row.sales_status,
      orderType: row.order_type,
      documentStatus: row.document_status,
      salesOrigin: row.sales_origin,
      transferStatus: row.transfer_status,
      transferDate: row.transfer_date,
      completionDate: row.completion_date,
      discountPercent: row.discount_percent,
      grossAmount: row.gross_amount,
      totalAmount: row.total_amount,
      isQuote: row.is_quote || null,
      isGiftOrder: row.is_gift_order || null,
      lastSync: row.last_sync,
      // DDT fields
      ddtNumber: row.ddt_number,
      ddtDeliveryDate: row.ddt_delivery_date,
      ddtId: row.ddt_id,
      ddtCustomerAccount: row.ddt_customer_account,
      ddtSalesName: row.ddt_sales_name,
      ddtDeliveryName: row.ddt_delivery_name,
      deliveryTerms: row.delivery_terms,
      deliveryMethod: row.delivery_method,
      deliveryCity: row.delivery_city,
      attentionTo: row.attention_to,
      ddtDeliveryAddress: row.ddt_delivery_address,
      ddtTotal: row.ddt_total,
      ddtCustomerReference: row.ddt_customer_reference,
      ddtDescription: row.ddt_description,
      // Tracking fields
      trackingNumber: row.tracking_number,
      trackingUrl: row.tracking_url,
      trackingCourier: row.tracking_courier,
      // Invoice fields
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      invoiceAmount: row.invoice_amount,
      invoiceCustomerAccount: row.invoice_customer_account,
      invoiceBillingName: row.invoice_billing_name,
      invoiceQuantity: row.invoice_quantity,
      invoiceRemainingAmount: row.invoice_remaining_amount,
      invoiceTaxAmount: row.invoice_tax_amount,
      invoiceLineDiscount: row.invoice_line_discount,
      invoiceTotalDiscount: row.invoice_total_discount,
      invoiceDueDate: row.invoice_due_date,
      invoicePaymentTermsId: row.invoice_payment_terms_id,
      invoicePurchaseOrder: row.invoice_purchase_order,
      invoiceClosed: row.invoice_closed ? true : false,
      invoiceDaysPastDue: row.invoice_days_past_due,
      invoiceSettledAmount: row.invoice_settled_amount,
      invoiceLastPaymentId: row.invoice_last_payment_id,
      invoiceLastSettlementDate: row.invoice_last_settlement_date,
      invoiceClosedDate: row.invoice_closed_date,
      // State fields
      currentState: row.current_state,
      sentToMilanoAt: row.sent_to_milano_at,
      archibaldOrderId: row.archibald_order_id,
      // Articles totals
      totalVatAmount: row.total_vat_amount,
      totalWithVat: row.total_with_vat,
      articlesSyncedAt: row.articles_synced_at,
    };
  }

  getOrderByNumber(userId: string, orderNumber: string): OrderRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM orders WHERE user_id = ? AND order_number = ? LIMIT 1`,
      )
      .get(userId, orderNumber) as any;

    if (!row) {
      return null;
    }

    // Map snake_case to camelCase
    return {
      id: row.id,
      userId: row.user_id,
      orderNumber: row.order_number,
      customerProfileId: row.customer_profile_id,
      customerName: row.customer_name,
      deliveryName: row.delivery_name,
      deliveryAddress: row.delivery_address,
      creationDate: row.creation_date,
      deliveryDate: row.delivery_date,
      remainingSalesFinancial: row.remaining_sales_financial,
      customerReference: row.customer_reference,
      salesStatus: row.sales_status,
      orderType: row.order_type,
      documentStatus: row.document_status,
      salesOrigin: row.sales_origin,
      transferStatus: row.transfer_status,
      transferDate: row.transfer_date,
      completionDate: row.completion_date,
      discountPercent: row.discount_percent,
      grossAmount: row.gross_amount,
      totalAmount: row.total_amount,
      isQuote: row.is_quote || null,
      isGiftOrder: row.is_gift_order || null,
      lastSync: row.last_sync,
      // DDT fields
      ddtNumber: row.ddt_number,
      ddtDeliveryDate: row.ddt_delivery_date,
      ddtId: row.ddt_id,
      ddtCustomerAccount: row.ddt_customer_account,
      ddtSalesName: row.ddt_sales_name,
      ddtDeliveryName: row.ddt_delivery_name,
      deliveryTerms: row.delivery_terms,
      deliveryMethod: row.delivery_method,
      deliveryCity: row.delivery_city,
      attentionTo: row.attention_to,
      ddtDeliveryAddress: row.ddt_delivery_address,
      ddtTotal: row.ddt_total,
      ddtCustomerReference: row.ddt_customer_reference,
      ddtDescription: row.ddt_description,
      // Tracking fields
      trackingNumber: row.tracking_number,
      trackingUrl: row.tracking_url,
      trackingCourier: row.tracking_courier,
      // Invoice fields
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      invoiceAmount: row.invoice_amount,
      invoiceCustomerAccount: row.invoice_customer_account,
      invoiceBillingName: row.invoice_billing_name,
      invoiceQuantity: row.invoice_quantity,
      invoiceRemainingAmount: row.invoice_remaining_amount,
      invoiceTaxAmount: row.invoice_tax_amount,
      invoiceLineDiscount: row.invoice_line_discount,
      invoiceTotalDiscount: row.invoice_total_discount,
      invoiceDueDate: row.invoice_due_date,
      invoicePaymentTermsId: row.invoice_payment_terms_id,
      invoicePurchaseOrder: row.invoice_purchase_order,
      invoiceClosed: row.invoice_closed ? true : false,
      invoiceDaysPastDue: row.invoice_days_past_due,
      invoiceSettledAmount: row.invoice_settled_amount,
      invoiceLastPaymentId: row.invoice_last_payment_id,
      invoiceLastSettlementDate: row.invoice_last_settlement_date,
      invoiceClosedDate: row.invoice_closed_date,
      // State fields
      currentState: row.current_state,
      sentToMilanoAt: row.sent_to_milano_at,
      archibaldOrderId: row.archibald_order_id,
      // Articles totals
      totalVatAmount: row.total_vat_amount,
      totalWithVat: row.total_with_vat,
      articlesSyncedAt: row.articles_synced_at,
    };
  }

  clearUserOrders(userId: string): void {
    const result = this.db
      .prepare(`DELETE FROM orders WHERE user_id = ?`)
      .run(userId);
    logger.info(
      `[OrderDatabaseNew] Cleared ${result.changes} orders for user ${userId}`,
    );
  }

  updateOrderDDT(
    userId: string,
    orderId: string,
    ddtData: {
      ddtNumber: string;
      ddtDeliveryDate?: string | null;
      ddtId?: string | null;
      ddtCustomerAccount?: string | null;
      ddtSalesName?: string | null;
      ddtDeliveryName?: string | null;
      deliveryTerms?: string | null;
      deliveryMethod?: string | null;
      deliveryCity?: string | null;
      attentionTo?: string | null;
      ddtDeliveryAddress?: string | null;
      ddtTotal?: string | null;
      ddtCustomerReference?: string | null;
      ddtDescription?: string | null;
      trackingNumber?: string | null;
      trackingUrl?: string | null;
      trackingCourier?: string | null;
    },
  ): void {
    const now = Math.floor(Date.now() / 1000);

    const result = this.db
      .prepare(
        `
      UPDATE orders SET
        ddt_number = ?,
        ddt_delivery_date = ?,
        ddt_id = ?,
        ddt_customer_account = ?,
        ddt_sales_name = ?,
        ddt_delivery_name = ?,
        delivery_terms = ?,
        delivery_method = ?,
        delivery_city = ?,
        attention_to = ?,
        ddt_delivery_address = ?,
        ddt_total = ?,
        ddt_customer_reference = ?,
        ddt_description = ?,
        tracking_number = ?,
        tracking_url = ?,
        tracking_courier = ?,
        last_sync = ?
      WHERE user_id = ? AND order_number = ?
    `,
      )
      .run(
        ddtData.ddtNumber,
        ddtData.ddtDeliveryDate || null,
        ddtData.ddtId || null,
        ddtData.ddtCustomerAccount || null,
        ddtData.ddtSalesName || null,
        ddtData.ddtDeliveryName || null,
        ddtData.deliveryTerms || null,
        ddtData.deliveryMethod || null,
        ddtData.deliveryCity || null,
        ddtData.attentionTo || null,
        ddtData.ddtDeliveryAddress || null,
        ddtData.ddtTotal || null,
        ddtData.ddtCustomerReference || null,
        ddtData.ddtDescription || null,
        ddtData.trackingNumber || null,
        ddtData.trackingUrl || null,
        ddtData.trackingCourier || null,
        now,
        userId,
        orderId,
      );

    if (result.changes === 0) {
      logger.warn(
        `[OrderDatabaseNew] updateOrderDDT: No order found for userId=${userId}, orderId=${orderId}`,
      );
    } else {
      logger.info(
        `[OrderDatabaseNew] Updated DDT for order ${orderId}: ${ddtData.ddtNumber}`,
      );
    }
  }

  updateInvoiceData(
    userId: string,
    orderId: string,
    invoiceData: {
      invoiceNumber: string;
      invoiceDate?: string | null;
      invoiceAmount?: string | null;
      invoiceCustomerAccount?: string | null;
      invoiceBillingName?: string | null;
      invoiceQuantity?: number | null;
      invoiceRemainingAmount?: string | null;
      invoiceTaxAmount?: string | null;
      invoiceLineDiscount?: string | null;
      invoiceTotalDiscount?: string | null;
      invoiceDueDate?: string | null;
      invoicePaymentTermsId?: string | null;
      invoicePurchaseOrder?: string | null;
      invoiceClosed?: boolean | null;
      invoiceDaysPastDue?: string | null;
      invoiceSettledAmount?: string | null;
      invoiceLastPaymentId?: string | null;
      invoiceLastSettlementDate?: string | null;
      invoiceClosedDate?: string | null;
    },
  ): void {
    const now = Math.floor(Date.now() / 1000);

    const result = this.db
      .prepare(
        `
      UPDATE orders SET
        invoice_number = ?,
        invoice_date = ?,
        invoice_amount = ?,
        invoice_customer_account = ?,
        invoice_billing_name = ?,
        invoice_quantity = ?,
        invoice_remaining_amount = ?,
        invoice_tax_amount = ?,
        invoice_line_discount = ?,
        invoice_total_discount = ?,
        invoice_due_date = ?,
        invoice_payment_terms_id = ?,
        invoice_purchase_order = ?,
        invoice_closed = ?,
        invoice_days_past_due = ?,
        invoice_settled_amount = ?,
        invoice_last_payment_id = ?,
        invoice_last_settlement_date = ?,
        invoice_closed_date = ?,
        last_sync = ?
      WHERE user_id = ? AND order_number = ?
    `,
      )
      .run(
        invoiceData.invoiceNumber,
        invoiceData.invoiceDate || null,
        invoiceData.invoiceAmount || null,
        invoiceData.invoiceCustomerAccount || null,
        invoiceData.invoiceBillingName || null,
        invoiceData.invoiceQuantity || null,
        invoiceData.invoiceRemainingAmount || null,
        invoiceData.invoiceTaxAmount || null,
        invoiceData.invoiceLineDiscount || null,
        invoiceData.invoiceTotalDiscount || null,
        invoiceData.invoiceDueDate || null,
        invoiceData.invoicePaymentTermsId || null,
        invoiceData.invoicePurchaseOrder || null,
        invoiceData.invoiceClosed ? 1 : 0,
        invoiceData.invoiceDaysPastDue || null,
        invoiceData.invoiceSettledAmount || null,
        invoiceData.invoiceLastPaymentId || null,
        invoiceData.invoiceLastSettlementDate || null,
        invoiceData.invoiceClosedDate || null,
        now,
        userId,
        orderId,
      );

    if (result.changes === 0) {
      logger.warn(
        `[OrderDatabaseNew] updateInvoiceData: No order found for userId=${userId}, orderId=${orderId}`,
      );
    } else {
      logger.info(
        `[OrderDatabaseNew] Updated invoice for order ${orderId}: ${invoiceData.invoiceNumber}`,
      );
    }
  }

  updateOrderState(
    userId: string,
    orderId: string,
    newState: string,
    actor: string,
    notes: string | null,
    confidence?: string | null,
    source?: string | null,
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const timestamp = new Date().toISOString();

    // Get current state before updating
    const currentOrder = this.db
      .prepare(
        `SELECT current_state FROM orders WHERE user_id = ? AND order_number = ?`,
      )
      .get(userId, orderId) as { current_state: string | null } | undefined;

    if (!currentOrder) {
      logger.warn(
        `[OrderDatabaseNew] updateOrderState: No order found for userId=${userId}, orderId=${orderId}`,
      );
      return;
    }

    const oldState = currentOrder.current_state;

    // Update order state
    const result = this.db
      .prepare(
        `
      UPDATE orders SET
        current_state = ?,
        last_sync = ?
      WHERE user_id = ? AND order_number = ?
    `,
      )
      .run(newState, now, userId, orderId);

    if (result.changes === 0) {
      logger.warn(
        `[OrderDatabaseNew] updateOrderState: Failed to update order ${orderId}`,
      );
      return;
    }

    // Insert state history record
    this.db
      .prepare(
        `
      INSERT INTO order_state_history (
        order_id, old_state, new_state, actor, notes, confidence, source, timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        orderId,
        oldState,
        newState,
        actor,
        notes,
        confidence || null,
        source || null,
        timestamp,
        timestamp,
      );

    logger.info(
      `[OrderDatabaseNew] Updated state for order ${orderId}: ${oldState} → ${newState} (actor: ${actor}, confidence: ${confidence}, source: ${source})`,
    );
  }

  getStateHistory(userId: string, orderId: string): OrderStateHistoryRecord[] {
    // Verify order belongs to user
    const order = this.db
      .prepare(`SELECT id FROM orders WHERE user_id = ? AND order_number = ?`)
      .get(userId, orderId);

    if (!order) {
      logger.warn(
        `[OrderDatabaseNew] getStateHistory: No order found for userId=${userId}, orderId=${orderId}`,
      );
      return [];
    }

    const rows = this.db
      .prepare(
        `
      SELECT
        id, order_id, old_state, new_state, actor, notes, confidence, source, timestamp, created_at
      FROM order_state_history
      WHERE order_id = ?
      ORDER BY timestamp DESC
    `,
      )
      .all(orderId) as Array<{
      id: number;
      order_id: string;
      old_state: string | null;
      new_state: string;
      actor: string;
      notes: string | null;
      confidence: string | null;
      source: string | null;
      timestamp: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      oldState: row.old_state,
      newState: row.new_state,
      actor: row.actor,
      notes: row.notes,
      confidence: row.confidence,
      source: row.source,
      timestamp: row.timestamp,
      createdAt: row.created_at,
    }));
  }

  updateOrderMilanoState(
    userId: string,
    orderId: string,
    state: string,
    timestamp: string,
  ): void {
    // Delegate to updateOrderState with Milano actor
    this.updateOrderState(
      userId,
      orderId,
      state,
      "milano",
      null,
      "high",
      "milano",
    );
  }

  insertAuditLog(
    userId: string,
    action: string,
    orderId: string,
    details: string,
  ): void {
    // Use state history for audit logging
    const order = this.getOrderById(userId, orderId);
    if (order) {
      this.updateOrderState(
        userId,
        orderId,
        order.currentState || "unknown",
        "system",
        `${action}: ${details}`,
        null,
        "audit",
      );
    }
  }

  // ===== Widget Order Exclusions Methods =====

  /**
   * Set order exclusion for yearly/monthly budget calculations
   */
  setOrderExclusion(
    userId: string,
    orderId: string,
    excludeFromYearly: boolean,
    excludeFromMonthly: boolean,
    reason?: string,
  ): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO widget_order_exclusions (user_id, order_id, excluded_from_yearly, excluded_from_monthly, reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, order_id) DO UPDATE SET
        excluded_from_yearly = excluded.excluded_from_yearly,
        excluded_from_monthly = excluded.excluded_from_monthly,
        reason = excluded.reason,
        updated_at = excluded.updated_at
    `,
      )
      .run(
        userId,
        orderId,
        excludeFromYearly ? 1 : 0,
        excludeFromMonthly ? 1 : 0,
        reason || null,
        now,
        now,
      );
  }

  /**
   * Get order exclusion status for a specific order
   */
  getOrderExclusion(
    userId: string,
    orderId: string,
  ): {
    excludedFromYearly: boolean;
    excludedFromMonthly: boolean;
    reason: string | null;
  } | null {
    const row = this.db
      .prepare(
        `
      SELECT excluded_from_yearly, excluded_from_monthly, reason
      FROM widget_order_exclusions
      WHERE user_id = ? AND order_id = ?
    `,
      )
      .get(userId, orderId) as
      | {
          excluded_from_yearly: number;
          excluded_from_monthly: number;
          reason: string | null;
        }
      | undefined;

    if (!row) return null;

    return {
      excludedFromYearly: row.excluded_from_yearly === 1,
      excludedFromMonthly: row.excluded_from_monthly === 1,
      reason: row.reason,
    };
  }

  /**
   * Get all excluded orders for a user
   */
  getExcludedOrders(userId: string): Array<{
    orderId: string;
    orderNumber: string;
    excludedFromYearly: boolean;
    excludedFromMonthly: boolean;
    reason: string | null;
  }> {
    const rows = this.db
      .prepare(
        `
      SELECT
        e.order_id as orderId,
        o.order_number as orderNumber,
        e.excluded_from_yearly as excludedFromYearly,
        e.excluded_from_monthly as excludedFromMonthly,
        e.reason
      FROM widget_order_exclusions e
      INNER JOIN orders o ON e.order_id = o.id
      WHERE e.user_id = ?
    `,
      )
      .all(userId) as Array<{
      orderId: string;
      orderNumber: string;
      excludedFromYearly: number;
      excludedFromMonthly: number;
      reason: string | null;
    }>;

    return rows.map((row) => ({
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      excludedFromYearly: row.excludedFromYearly === 1,
      excludedFromMonthly: row.excludedFromMonthly === 1,
      reason: row.reason,
    }));
  }

  /**
   * Remove order exclusion
   */
  removeOrderExclusion(userId: string, orderId: string): void {
    this.db
      .prepare(
        `
      DELETE FROM widget_order_exclusions
      WHERE user_id = ? AND order_id = ?
    `,
      )
      .run(userId, orderId);
  }

  /**
   * Get orders for a specific period with exclusion status
   */
  getOrdersWithExclusionStatus(
    userId: string,
    startDate: string,
    endDate: string,
  ): Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    totalAmount: string | null;
    creationDate: string;
    excludedFromYearly: boolean;
    excludedFromMonthly: boolean;
    exclusionReason: string | null;
  }> {
    const rows = this.db
      .prepare(
        `
      SELECT
        o.id,
        o.order_number as orderNumber,
        o.customer_name as customerName,
        o.total_amount as totalAmount,
        o.creation_date as creationDate,
        COALESCE(e.excluded_from_yearly, 0) as excludedFromYearly,
        COALESCE(e.excluded_from_monthly, 0) as excludedFromMonthly,
        e.reason as exclusionReason
      FROM orders o
      LEFT JOIN widget_order_exclusions e ON o.id = e.order_id AND e.user_id = ?
      WHERE o.user_id = ?
        AND o.creation_date >= ?
        AND o.creation_date <= ?
      ORDER BY o.creation_date DESC
    `,
      )
      .all(userId, userId, startDate, endDate) as Array<{
      id: string;
      orderNumber: string;
      customerName: string;
      totalAmount: string | null;
      creationDate: string;
      excludedFromYearly: number;
      excludedFromMonthly: number;
      exclusionReason: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      customerName: row.customerName,
      totalAmount: row.totalAmount,
      creationDate: row.creationDate,
      excludedFromYearly: row.excludedFromYearly === 1,
      excludedFromMonthly: row.excludedFromMonthly === 1,
      exclusionReason: row.exclusionReason,
    }));
  }

  close(): void {
    this.db.close();
    logger.info("[OrderDatabaseNew] Database closed");
  }
}
