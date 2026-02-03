import Database from "better-sqlite3";
import path from "path";
import { logger } from "./logger";
import crypto from "crypto";

/**
 * Price record in database
 * Matches ParsedPrice from PDF parser with additional metadata
 */
export interface Price {
  // Core identification
  id: number; // Auto-increment primary key
  productId: string; // ID ARTICOLO (matches Product.id in products.db)
  productName: string; // NOME ARTICOLO

  // Price data (Italian format preserved)
  unitPrice: string | null; // IMPORTO UNITARIO (Italian format: "1.234,56 €")

  // Variant identification (critical for matching)
  itemSelection: string | null; // K2, K3, etc. (packaging type)
  packagingDescription: string | null;

  // Additional metadata
  currency: string | null;
  priceValidFrom: string | null;
  priceValidTo: string | null;
  priceUnit: string | null;
  accountDescription: string | null;
  accountCode: string | null;
  priceQtyFrom: number | null;
  priceQtyTo: number | null;

  // System fields
  lastModified: string | null;
  dataAreaId: string | null;

  // Delta detection
  hash: string; // MD5 hash of key fields for change detection
  lastSync: number; // Unix timestamp of last sync

  // Metadata
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
}

/**
 * Price database manager - separate database for prices
 * Follows Phase 18/19 pattern: separate DB per entity
 */
export class PriceDatabase {
  private static instance: PriceDatabase;
  private db: Database.Database;

  private constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(__dirname, "../data/prices.db");
    this.db = new Database(finalPath);
    this.initSchema();
    logger.info(`[PriceDatabase] Initialized at ${finalPath}`);
  }

  static getInstance(dbPath?: string): PriceDatabase {
    if (!PriceDatabase.instance) {
      PriceDatabase.instance = new PriceDatabase(dbPath);
    }
    return PriceDatabase.instance;
  }

  /**
   * Initialize database schema
   * Creates prices table and indexes
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Core identification
        productId TEXT NOT NULL,
        productName TEXT NOT NULL,

        -- Price data (Italian format preserved as TEXT)
        unitPrice TEXT,

        -- Variant identification
        itemSelection TEXT,
        packagingDescription TEXT,

        -- Additional metadata
        currency TEXT,
        priceValidFrom TEXT,
        priceValidTo TEXT,
        priceUnit TEXT,
        accountDescription TEXT,
        accountCode TEXT,
        priceQtyFrom INTEGER,
        priceQtyTo INTEGER,

        -- System fields
        lastModified TEXT,
        dataAreaId TEXT,

        -- Delta detection
        hash TEXT NOT NULL UNIQUE,
        lastSync INTEGER NOT NULL,

        -- Metadata
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      -- Indexes for fast lookups
      CREATE INDEX IF NOT EXISTS idx_prices_productId ON prices(productId);
      CREATE INDEX IF NOT EXISTS idx_prices_itemSelection ON prices(itemSelection);
      CREATE INDEX IF NOT EXISTS idx_prices_hash ON prices(hash);
      CREATE INDEX IF NOT EXISTS idx_prices_lastSync ON prices(lastSync);

      -- Compound index for variant matching
      CREATE INDEX IF NOT EXISTS idx_prices_product_variant
        ON prices(productId, itemSelection);
    `);

    logger.info("[PriceDatabase] Schema initialized");
  }

  /**
   * Calculate MD5 hash for price record
   * Used for delta detection - only key fields included
   */
  private calculateHash(price: Partial<Price>): string {
    const hashInput = [
      price.productId,
      price.productName,
      price.unitPrice?.toString() || "",
      price.itemSelection || "",
      price.currency || "",
      price.priceValidFrom || "",
      price.priceValidTo || "",
    ].join("|");

    return crypto.createHash("md5").update(hashInput).digest("hex");
  }

  /**
   * Upsert price record with delta detection
   * Only updates if hash changed (following Phase 18/19 pattern)
   *
   * @returns 'inserted' | 'updated' | 'skipped'
   */
  upsertPrice(
    priceData: Omit<Price, "id" | "hash" | "createdAt" | "updatedAt">,
  ): "inserted" | "updated" | "skipped" {
    const hash = this.calculateHash(priceData);
    const now = Math.floor(Date.now() / 1000);

    // Check if price exists with same hash
    const existing = this.db
      .prepare(
        "SELECT id, hash FROM prices WHERE productId = ? AND itemSelection = ?",
      )
      .get(priceData.productId, priceData.itemSelection || null) as
      | { id: number; hash: string }
      | undefined;

    if (existing) {
      if (existing.hash === hash) {
        // No changes - skip update
        return "skipped";
      }

      // Hash changed - update
      this.db
        .prepare(
          `
          UPDATE prices SET
            productName = ?,
            unitPrice = ?,
            packagingDescription = ?,
            currency = ?,
            priceValidFrom = ?,
            priceValidTo = ?,
            priceUnit = ?,
            accountDescription = ?,
            accountCode = ?,
            priceQtyFrom = ?,
            priceQtyTo = ?,
            lastModified = ?,
            dataAreaId = ?,
            hash = ?,
            lastSync = ?,
            updatedAt = ?
          WHERE id = ?
        `,
        )
        .run(
          priceData.productName,
          priceData.unitPrice,
          priceData.packagingDescription,
          priceData.currency,
          priceData.priceValidFrom,
          priceData.priceValidTo,
          priceData.priceUnit,
          priceData.accountDescription,
          priceData.accountCode,
          priceData.priceQtyFrom,
          priceData.priceQtyTo,
          priceData.lastModified,
          priceData.dataAreaId,
          hash,
          priceData.lastSync,
          now,
          existing.id,
        );

      return "updated";
    }

    // New price - insert
    this.db
      .prepare(
        `
        INSERT INTO prices (
          productId, productName, unitPrice, itemSelection, packagingDescription,
          currency, priceValidFrom, priceValidTo, priceUnit,
          accountDescription, accountCode, priceQtyFrom, priceQtyTo,
          lastModified, dataAreaId, hash, lastSync, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        priceData.productId,
        priceData.productName,
        priceData.unitPrice,
        priceData.itemSelection,
        priceData.packagingDescription,
        priceData.currency,
        priceData.priceValidFrom,
        priceData.priceValidTo,
        priceData.priceUnit,
        priceData.accountDescription,
        priceData.accountCode,
        priceData.priceQtyFrom,
        priceData.priceQtyTo,
        priceData.lastModified,
        priceData.dataAreaId,
        hash,
        priceData.lastSync,
        now,
        now,
      );

    return "inserted";
  }

  /**
   * Get price for specific product and variant
   * Used for matching with products.db
   */
  getPrice(productId: string, itemSelection: string | null): Price | undefined {
    return this.db
      .prepare("SELECT * FROM prices WHERE productId = ? AND itemSelection = ?")
      .get(productId, itemSelection || null) as Price | undefined;
  }

  /**
   * Get all prices for a product (all variants)
   */
  getPricesByProductId(productId: string): Price[] {
    return this.db
      .prepare(
        "SELECT * FROM prices WHERE productId = ? ORDER BY itemSelection",
      )
      .all(productId) as Price[];
  }

  /**
   * Get total count of prices
   */
  getTotalCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM prices")
      .get() as { count: number };
    return result.count;
  }

  /**
   * Get all prices (for matching with products)
   * Returns all price records ordered by productId
   */
  getAllPrices(): Price[] {
    return this.db
      .prepare("SELECT * FROM prices ORDER BY productId, itemSelection")
      .all() as Price[];
  }

  /**
   * Search prices by product name (fuzzy match)
   */
  searchPricesByName(searchTerm: string): Price[] {
    return this.db
      .prepare(
        "SELECT * FROM prices WHERE productName LIKE ? ORDER BY productName",
      )
      .all(`%${searchTerm}%`) as Price[];
  }

  /**
   * Get sync statistics
   */
  getSyncStats(): {
    totalPrices: number;
    lastSyncTimestamp: number | null;
    pricesWithNullPrice: number;
  } {
    const total = this.getTotalCount();

    const lastSyncResult = this.db
      .prepare("SELECT MAX(lastSync) as lastSync FROM prices")
      .get() as { lastSync: number | null };

    const nullPriceResult = this.db
      .prepare("SELECT COUNT(*) as count FROM prices WHERE unitPrice IS NULL")
      .get() as { count: number };

    return {
      totalPrices: total,
      lastSyncTimestamp: lastSyncResult.lastSync,
      pricesWithNullPrice: nullPriceResult.count,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info("[PriceDatabase] Database closed");
  }
}
