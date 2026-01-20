import Database from "better-sqlite3";
import crypto from "crypto";
import { logger } from "./logger";
import path from "node:path";

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  customerAccount: string; // Match key!
  billingName: string | null;
  quantity: string | null;
  salesBalance: string | null;
  amount: string | null;
  vatAmount: string | null;
  totalAmount: string | null;
  paymentTerms: string | null;
  lastSync: number;
}

export interface OrderInvoiceMapping {
  orderNumber: string;
  invoiceNumber: string;
  matchType: "auto" | "manual";
  matchScore: number;
  createdAt: string;
}

export class InvoicesDatabase {
  private static instance: InvoicesDatabase;
  private db: Database.Database;

  private constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(process.cwd(), "data", "invoices.db");
    this.db = new Database(finalPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
    logger.info("InvoicesDatabase initialized", { path: finalPath });
  }

  static getInstance(dbPath?: string): InvoicesDatabase {
    if (!InvoicesDatabase.instance) {
      InvoicesDatabase.instance = new InvoicesDatabase(dbPath);
    }
    return InvoicesDatabase.instance;
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT NOT NULL UNIQUE,
        invoice_date TEXT,
        customer_account TEXT NOT NULL,
        billing_name TEXT,
        quantity TEXT,
        sales_balance TEXT,
        amount TEXT,
        vat_amount TEXT,
        total_amount TEXT,
        payment_terms TEXT,
        hash TEXT NOT NULL,
        last_sync INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_invoice_mapping (
        order_number TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        match_type TEXT NOT NULL CHECK(match_type IN ('auto', 'manual')),
        match_score REAL NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (order_number, invoice_number)
      );

      CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_account);
      CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
      CREATE INDEX IF NOT EXISTS idx_invoices_sync ON invoices(last_sync);
      CREATE INDEX IF NOT EXISTS idx_mapping_order ON order_invoice_mapping(order_number);
      CREATE INDEX IF NOT EXISTS idx_mapping_invoice ON order_invoice_mapping(invoice_number);
    `);
  }

  private computeHash(invoice: Omit<InvoiceRecord, "lastSync">): string {
    const hashInput = [
      invoice.id,
      invoice.invoiceNumber,
      invoice.invoiceDate,
      invoice.customerAccount,
      invoice.totalAmount,
    ].join("|");
    return crypto.createHash("md5").update(hashInput).digest("hex");
  }

  upsertInvoice(
    invoice: Omit<InvoiceRecord, "lastSync">,
  ): "inserted" | "updated" | "skipped" {
    const now = Math.floor(Date.now() / 1000);
    const hash = this.computeHash(invoice);

    // Check if exists
    const existing = this.db
      .prepare(
        `
      SELECT hash FROM invoices WHERE invoice_number = ?
    `,
      )
      .get(invoice.invoiceNumber) as { hash: string } | undefined;

    if (!existing) {
      // Insert
      this.db
        .prepare(
          `
        INSERT INTO invoices (
          id, invoice_number, invoice_date, customer_account,
          billing_name, quantity, sales_balance, amount,
          vat_amount, total_amount, payment_terms,
          hash, last_sync, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          invoice.id,
          invoice.invoiceNumber,
          invoice.invoiceDate,
          invoice.customerAccount,
          invoice.billingName,
          invoice.quantity,
          invoice.salesBalance,
          invoice.amount,
          invoice.vatAmount,
          invoice.totalAmount,
          invoice.paymentTerms,
          hash,
          now,
          new Date().toISOString(),
        );
      return "inserted";
    }

    if (existing.hash === hash) {
      this.db
        .prepare(`UPDATE invoices SET last_sync = ? WHERE invoice_number = ?`)
        .run(now, invoice.invoiceNumber);
      return "skipped";
    }

    // Update
    this.db
      .prepare(
        `
      UPDATE invoices SET
        invoice_date = ?, customer_account = ?, billing_name = ?,
        quantity = ?, sales_balance = ?, amount = ?,
        vat_amount = ?, total_amount = ?, payment_terms = ?,
        hash = ?, last_sync = ?
      WHERE invoice_number = ?
    `,
      )
      .run(
        invoice.invoiceDate,
        invoice.customerAccount,
        invoice.billingName,
        invoice.quantity,
        invoice.salesBalance,
        invoice.amount,
        invoice.vatAmount,
        invoice.totalAmount,
        invoice.paymentTerms,
        hash,
        now,
        invoice.invoiceNumber,
      );
    return "updated";
  }

  /**
   * Auto-match invoices to orders based on:
   * 1. Customer account match
   * 2. Date proximity (within 30 days)
   * 3. Scoring: closer dates = higher score
   */
  autoMatchInvoiceToOrders(
    invoiceNumber: string,
    ordersDb: any,
  ): { matched: number; skipped: number } {
    // Get invoice details
    const invoice = this.db
      .prepare(
        `
      SELECT customer_account, invoice_date FROM invoices WHERE invoice_number = ?
    `,
      )
      .get(invoiceNumber) as
      | { customer_account: string; invoice_date: string | null }
      | undefined;

    if (!invoice || !invoice.invoice_date) {
      return { matched: 0, skipped: 1 };
    }

    // Find matching orders (same customer, within 30 days)
    const invoiceDate = new Date(invoice.invoice_date);
    const matchWindow = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

    const matchingOrders = ordersDb
      .prepare(
        `
      SELECT order_number, creation_date
      FROM orders
      WHERE customer_profile_id = ?
        AND creation_date IS NOT NULL
    `,
      )
      .all(invoice.customer_account) as Array<{
      order_number: string;
      creation_date: string;
    }>;

    let matched = 0;
    let skipped = 0;

    for (const order of matchingOrders) {
      const orderDate = new Date(order.creation_date);
      const dateDiff = Math.abs(invoiceDate.getTime() - orderDate.getTime());

      // Skip if outside 30-day window
      if (dateDiff > matchWindow) {
        skipped++;
        continue;
      }

      // Calculate match score (1.0 = same day, 0.0 = 30 days apart)
      const matchScore = 1.0 - dateDiff / matchWindow;

      // Create mapping if not exists
      try {
        this.db
          .prepare(
            `
          INSERT OR IGNORE INTO order_invoice_mapping
          (order_number, invoice_number, match_type, match_score, created_at)
          VALUES (?, ?, 'auto', ?, ?)
        `,
          )
          .run(
            order.order_number,
            invoiceNumber,
            matchScore,
            new Date().toISOString(),
          );
        matched++;
      } catch (e) {
        // Already exists
        skipped++;
      }
    }

    return { matched, skipped };
  }

  /**
   * Manually add order-invoice mapping
   */
  addManualMapping(orderNumber: string, invoiceNumber: string): boolean {
    try {
      this.db
        .prepare(
          `
        INSERT OR REPLACE INTO order_invoice_mapping
        (order_number, invoice_number, match_type, match_score, created_at)
        VALUES (?, ?, 'manual', 1.0, ?)
      `,
        )
        .run(orderNumber, invoiceNumber, new Date().toISOString());
      return true;
    } catch (e) {
      logger.error("Failed to add manual mapping", { error: e });
      return false;
    }
  }

  /**
   * Get invoices for an order
   */
  getInvoicesByOrderNumber(orderNumber: string): InvoiceRecord[] {
    const rows = this.db
      .prepare(
        `
      SELECT i.*
      FROM invoices i
      JOIN order_invoice_mapping m ON i.invoice_number = m.invoice_number
      WHERE m.order_number = ?
      ORDER BY i.invoice_date DESC
    `,
      )
      .all(orderNumber) as any[];

    return rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      customerAccount: row.customer_account,
      billingName: row.billing_name,
      quantity: row.quantity,
      salesBalance: row.sales_balance,
      amount: row.amount,
      vatAmount: row.vat_amount,
      totalAmount: row.total_amount,
      paymentTerms: row.payment_terms,
      lastSync: row.last_sync,
    }));
  }

  /**
   * Get orders for an invoice
   */
  getOrdersByInvoiceNumber(invoiceNumber: string): Array<{
    orderNumber: string;
    matchType: string;
    matchScore: number;
  }> {
    return this.db
      .prepare(
        `
      SELECT order_number, match_type, match_score
      FROM order_invoice_mapping
      WHERE invoice_number = ?
      ORDER BY match_score DESC
    `,
      )
      .all(invoiceNumber) as Array<{
      orderNumber: string;
      matchType: string;
      matchScore: number;
    }>;
  }

  getTotalCount(): number {
    const result = this.db
      .prepare(`SELECT COUNT(*) as count FROM invoices`)
      .get() as { count: number };
    return result.count;
  }

  getMappingCount(): number {
    const result = this.db
      .prepare(`SELECT COUNT(*) as count FROM order_invoice_mapping`)
      .get() as { count: number };
    return result.count;
  }

  getMappingStats(): {
    total: number;
    auto: number;
    manual: number;
  } {
    const total = this.getMappingCount();
    const auto = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM order_invoice_mapping WHERE match_type = 'auto'`,
      )
      .get() as { count: number };
    const manual = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM order_invoice_mapping WHERE match_type = 'manual'`,
      )
      .get() as { count: number };

    return {
      total,
      auto: auto.count,
      manual: manual.count,
    };
  }

  getAllMappings(): OrderInvoiceMapping[] {
    const rows = this.db
      .prepare(
        `SELECT
          order_number,
          invoice_number,
          match_type,
          match_score,
          created_at
        FROM order_invoice_mapping`,
      )
      .all() as Array<{
      order_number: string;
      invoice_number: string;
      match_type: "auto" | "manual";
      match_score: number;
      created_at: string;
    }>;

    return rows.map((row) => ({
      orderNumber: row.order_number,
      invoiceNumber: row.invoice_number,
      matchType: row.match_type,
      matchScore: row.match_score,
      createdAt: row.created_at,
    }));
  }

  close(): void {
    this.db.close();
    logger.info("InvoicesDatabase closed");
  }
}
