import Database from "better-sqlite3";
import crypto from "crypto";
import { logger } from "./logger";
import path from "node:path";

export interface OrderRecord {
  id: string;
  userId: string;
  orderNumber: string;
  customerProfileId: string | null;
  customerName: string;
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

  // Tracking fields (stored directly in orders table)
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  trackingCourier?: string | null;

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

  // State tracking fields
  currentState?: string | null;
  sentToMilanoAt?: string | null;
  archibaldOrderId?: string | null;

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
      // Tracking fields (may be missing)
      { name: "tracking_number", type: "TEXT" },
      { name: "tracking_url", type: "TEXT" },
      { name: "tracking_courier", type: "TEXT" },
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
      // State tracking fields (may be missing)
      { name: "current_state", type: "TEXT" },
      { name: "sent_to_milano_at", type: "TEXT" },
      { name: "archibald_order_id", type: "TEXT" },
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
      logger.info("[OrderDatabaseNew] No migrations needed - schema up to date");
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
  ): "inserted" | "updated" | "skipped" {
    const now = Math.floor(Date.now() / 1000);
    const hash = this.computeHash(order);

    // Check if exists
    const existing = this.db
      .prepare(
        `
      SELECT hash FROM orders WHERE user_id = ? AND order_number = ?
    `,
      )
      .get(userId, order.orderNumber) as { hash: string } | undefined;

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
          total_amount, hash, last_sync, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          hash,
          now,
          new Date().toISOString(),
        );
      return "inserted";
    }

    // Check if changed
    if (existing.hash === hash) {
      // Unchanged - update only last_sync timestamp
      this.db
        .prepare(
          `UPDATE orders SET last_sync = ? WHERE user_id = ? AND order_number = ?`,
        )
        .run(now, userId, order.orderNumber);
      return "skipped";
    }

    // Update changed order
    this.db
      .prepare(
        `
      UPDATE orders SET
        customer_profile_id = ?, customer_name = ?, delivery_name = ?,
        delivery_address = ?, creation_date = ?, delivery_date = ?,
        remaining_sales_financial = ?, customer_reference = ?, sales_status = ?,
        order_type = ?, document_status = ?, sales_origin = ?, transfer_status = ?,
        transfer_date = ?, completion_date = ?, discount_percent = ?,
        gross_amount = ?, total_amount = ?, hash = ?, last_sync = ?
      WHERE user_id = ? AND order_number = ?
    `,
      )
      .run(
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
        hash,
        now,
        userId,
        order.orderNumber,
      );
    return "updated";
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
    },
  ): OrderRecord[] {
    const limit = options?.limit || 1000; // Default high limit for backward compatibility
    const offset = options?.offset || 0;

    let query = `SELECT * FROM orders WHERE user_id = ?`;
    const params: any[] = [userId];

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
      // State fields
      currentState: row.current_state,
      sentToMilanoAt: row.sent_to_milano_at,
      archibaldOrderId: row.archibald_order_id,
    }));
  }

  saveOrderArticles(articles: OrderArticleRecord[]): number {
    if (articles.length === 0) {
      return 0;
    }

    const insert = this.db.prepare(`
      INSERT INTO order_articles (
        order_id, article_code, article_description, quantity,
        unit_price, discount_percent, line_amount, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
            now,
          );
        }
      },
    );

    insertMany(articles);
    logger.info(
      `[OrderDatabaseNew] Saved ${articles.length} articles for order ${articles[0]?.orderId}`,
    );
    return articles.length;
  }

  getOrderArticles(orderId: string): OrderArticleRecord[] {
    const rows = this.db
      .prepare(
        `SELECT
          order_id, article_code, article_description, quantity,
          unit_price, discount_percent, line_amount
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
    }>;

    return rows.map((row) => ({
      orderId: row.order_id,
      articleCode: row.article_code,
      articleDescription: row.article_description || undefined,
      quantity: row.quantity,
      unitPrice: row.unit_price || undefined,
      discountPercent: row.discount_percent || undefined,
      lineAmount: row.line_amount || undefined,
    }));
  }

  countOrders(
    userId: string,
    options?: {
      status?: string;
      customer?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ): number {
    let query = `SELECT COUNT(*) as count FROM orders WHERE user_id = ?`;
    const params: any[] = [userId];

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

  getOrderById(userId: string, orderId: string): OrderRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM orders WHERE user_id = ? AND order_number = ? LIMIT 1`)
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
      // State fields
      currentState: row.current_state,
      sentToMilanoAt: row.sent_to_milano_at,
      archibaldOrderId: row.archibald_order_id,
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
        tracking_number = ?,
        tracking_url = ?,
        tracking_courier = ?,
        last_sync = ?
      WHERE user_id = ? AND id = ?
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
        last_sync = ?
      WHERE user_id = ? AND id = ?
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
      .prepare(`SELECT current_state FROM orders WHERE user_id = ? AND id = ?`)
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
      WHERE user_id = ? AND id = ?
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
      .prepare(`SELECT id FROM orders WHERE user_id = ? AND id = ?`)
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

  close(): void {
    this.db.close();
    logger.info("[OrderDatabaseNew] Database closed");
  }
}
