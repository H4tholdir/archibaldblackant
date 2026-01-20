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
    logger.info("[OrderDatabaseNew] Initialized", { path: finalPath });
  }

  static getInstance(dbPath?: string): OrderDatabaseNew {
    if (!OrderDatabaseNew.instance) {
      OrderDatabaseNew.instance = new OrderDatabaseNew(dbPath);
    }
    return OrderDatabaseNew.instance;
  }

  private initSchema(): void {
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
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_profile_id);
      CREATE INDEX IF NOT EXISTS idx_orders_sync ON orders(last_sync);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(sales_status);

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

      CREATE INDEX IF NOT EXISTS idx_articles_order_id ON order_articles(order_id);
      CREATE INDEX IF NOT EXISTS idx_articles_code ON order_articles(article_code);
    `);
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

  getOrdersByUser(userId: string): OrderRecord[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM orders WHERE user_id = ? ORDER BY creation_date DESC
    `,
      )
      .all(userId) as any[];

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

  close(): void {
    this.db.close();
    logger.info("[OrderDatabaseNew] Database closed");
  }
}
