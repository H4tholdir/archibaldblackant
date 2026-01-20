import Database from "better-sqlite3";
import crypto from "crypto";
import { logger } from "./logger";
import path from "node:path";

export interface DDTRecord {
  id: string;
  ddtNumber: string;
  deliveryDate: string | null;
  orderNumber: string; // Match key!
  customerAccount: string | null;
  salesName: string | null;
  deliveryName: string | null;
  trackingNumber: string | null;
  deliveryTerms: string | null;
  deliveryMethod: string | null;
  deliveryCity: string | null;
  trackingUrl: string | null;
  trackingCourier: string | null;
  lastSync: number;
}

export class DDTDatabase {
  private static instance: DDTDatabase;
  private db: Database.Database;

  private constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(process.cwd(), "data", "ddt.db");
    this.db = new Database(finalPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
    logger.info("DDTDatabase initialized", { path: finalPath });
  }

  static getInstance(dbPath?: string): DDTDatabase {
    if (!DDTDatabase.instance) {
      DDTDatabase.instance = new DDTDatabase(dbPath);
    }
    return DDTDatabase.instance;
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ddt (
        id TEXT PRIMARY KEY,
        ddt_number TEXT NOT NULL UNIQUE,
        delivery_date TEXT,
        order_number TEXT NOT NULL,
        customer_account TEXT,
        sales_name TEXT,
        delivery_name TEXT,
        tracking_number TEXT,
        delivery_terms TEXT,
        delivery_method TEXT,
        delivery_city TEXT,
        tracking_url TEXT,
        tracking_courier TEXT,
        hash TEXT NOT NULL,
        last_sync INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ddt_order_number ON ddt(order_number);
      CREATE INDEX IF NOT EXISTS idx_ddt_tracking ON ddt(tracking_number);
      CREATE INDEX IF NOT EXISTS idx_ddt_sync ON ddt(last_sync);
    `);
  }

  private normalizeCourier(courier: string | null): string | null {
    if (!courier) return null;
    const lower = courier.toLowerCase().trim();

    // Normalize common variations
    if (lower.includes("fedex") || lower.includes("fidex")) return "fedex";
    if (lower.includes("ups")) return "ups";
    if (lower.includes("dhl")) return "dhl";
    if (lower.includes("tnt")) return "tnt";
    if (lower.includes("gls")) return "gls";
    if (lower.includes("bartolini") || lower.includes("brt")) return "brt";
    if (lower.includes("sda")) return "sda";

    return lower;
  }

  private generateTrackingUrl(
    trackingNumber: string,
    courier: string | null,
  ): string | null {
    if (!trackingNumber || !courier) return null;

    const normalized = this.normalizeCourier(courier);

    switch (normalized) {
      case "fedex":
        return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
      case "ups":
        return `https://www.ups.com/track?tracknum=${trackingNumber}`;
      case "dhl":
        return `https://www.dhl.com/it-it/home/tracking/tracking-express.html?submit=1&tracking-id=${trackingNumber}`;
      case "tnt":
        return `https://www.tnt.com/express/it_it/site/tracking.html?searchType=con&cons=${trackingNumber}`;
      case "gls":
        return `https://www.gls-italy.com/?option=com_gls&view=track_e_trace&mode=search&trackNumber=${trackingNumber}`;
      case "brt":
        return `https://vas.brt.it/vas/sped_nuova_ui.htm?brtCode=${trackingNumber}`;
      case "sda":
        return `https://www.sda.it/wps/portal/Servizi_online/dettaglio-spedizione?locale=it&tracing.letteraVettura=${trackingNumber}`;
      default:
        return null;
    }
  }

  private computeHash(
    ddt: Omit<DDTRecord, "lastSync" | "trackingUrl" | "trackingCourier">,
  ): string {
    const hashInput = [
      ddt.id,
      ddt.ddtNumber,
      ddt.orderNumber,
      ddt.trackingNumber,
      ddt.deliveryDate,
    ].join("|");
    return crypto.createHash("md5").update(hashInput).digest("hex");
  }

  upsertDDT(
    ddt: Omit<DDTRecord, "lastSync" | "trackingUrl" | "trackingCourier">,
  ): "inserted" | "updated" | "skipped" {
    const now = Math.floor(Date.now() / 1000);
    const hash = this.computeHash(ddt);

    // Compute tracking fields
    const trackingCourier = this.normalizeCourier(ddt.deliveryMethod);
    const trackingUrl = ddt.trackingNumber
      ? this.generateTrackingUrl(ddt.trackingNumber, ddt.deliveryMethod)
      : null;

    // Check if exists
    const existing = this.db
      .prepare(
        `
      SELECT hash FROM ddt WHERE ddt_number = ?
    `,
      )
      .get(ddt.ddtNumber) as { hash: string } | undefined;

    if (!existing) {
      // Insert
      this.db
        .prepare(
          `
        INSERT INTO ddt (
          id, ddt_number, delivery_date, order_number, customer_account,
          sales_name, delivery_name, tracking_number, delivery_terms,
          delivery_method, delivery_city, tracking_url, tracking_courier,
          hash, last_sync, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          ddt.id,
          ddt.ddtNumber,
          ddt.deliveryDate,
          ddt.orderNumber,
          ddt.customerAccount,
          ddt.salesName,
          ddt.deliveryName,
          ddt.trackingNumber,
          ddt.deliveryTerms,
          ddt.deliveryMethod,
          ddt.deliveryCity,
          trackingUrl,
          trackingCourier,
          hash,
          now,
          new Date().toISOString(),
        );
      return "inserted";
    }

    if (existing.hash === hash) {
      this.db
        .prepare(`UPDATE ddt SET last_sync = ? WHERE ddt_number = ?`)
        .run(now, ddt.ddtNumber);
      return "skipped";
    }

    // Update
    this.db
      .prepare(
        `
      UPDATE ddt SET
        delivery_date = ?, order_number = ?, customer_account = ?,
        sales_name = ?, delivery_name = ?, tracking_number = ?,
        delivery_terms = ?, delivery_method = ?, delivery_city = ?,
        tracking_url = ?, tracking_courier = ?, hash = ?, last_sync = ?
      WHERE ddt_number = ?
    `,
      )
      .run(
        ddt.deliveryDate,
        ddt.orderNumber,
        ddt.customerAccount,
        ddt.salesName,
        ddt.deliveryName,
        ddt.trackingNumber,
        ddt.deliveryTerms,
        ddt.deliveryMethod,
        ddt.deliveryCity,
        trackingUrl,
        trackingCourier,
        hash,
        now,
        ddt.ddtNumber,
      );
    return "updated";
  }

  getDDTsByOrderNumber(orderNumber: string): DDTRecord[] {
    return this.db
      .prepare(
        `
      SELECT * FROM ddt WHERE order_number = ? ORDER BY delivery_date DESC
    `,
      )
      .all(orderNumber) as DDTRecord[];
  }

  getTotalCount(): number {
    const result = this.db
      .prepare(`SELECT COUNT(*) as count FROM ddt`)
      .get() as { count: number };
    return result.count;
  }

  getTrackingCoverage(): {
    total: number;
    withTracking: number;
    percentage: number;
  } {
    const total = this.getTotalCount();
    const withTracking = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM ddt WHERE tracking_number IS NOT NULL AND tracking_number != ''
    `,
      )
      .get() as { count: number };

    return {
      total,
      withTracking: withTracking.count,
      percentage:
        total > 0 ? Math.round((withTracking.count / total) * 100) : 0,
    };
  }
}
