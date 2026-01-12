import Database from "better-sqlite3";
import { createHash } from "crypto";
import path from "path";
import { logger } from "./logger";

export interface Product {
  id: string; // ID ARTICOLO
  name: string; // NOME ARTICOLO
  description?: string; // DESCRIZIONE
  groupCode?: string; // GRUPPO ARTICOLO
  searchName?: string; // NOME DELLA RICERCA
  priceUnit?: string; // UNITÀ DI PREZZO
  productGroupId?: string; // ID GRUPPO DI PRODOTTI
  productGroupDescription?: string; // DESCRIZIONE GRUPPO ARTICOLO
  packageContent?: string; // CONTENUTO DELL'IMBALLAGGIO
  minQty?: number; // QTÀ MINIMA
  multipleQty?: number; // QTÀ MULTIPLA
  maxQty?: number; // QTÀ MASSIMA
  price?: number; // PREZZO dal listino (PREZZO NETTO BRASSELER)
  hash: string;
  lastSync: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  suggestions?: number[];
}

export class ProductDatabase {
  private db: Database.Database;
  private static instance: ProductDatabase;

  constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(__dirname, "../data/products.db");
    this.db = new Database(finalPath);
    this.initializeSchema();
  }

  static getInstance(): ProductDatabase {
    if (!ProductDatabase.instance) {
      ProductDatabase.instance = new ProductDatabase();
    }
    return ProductDatabase.instance;
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        groupCode TEXT,
        searchName TEXT,
        priceUnit TEXT,
        productGroupId TEXT,
        productGroupDescription TEXT,
        packageContent TEXT,
        minQty REAL,
        multipleQty REAL,
        maxQty REAL,
        price REAL,
        hash TEXT NOT NULL,
        lastSync INTEGER NOT NULL,
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_product_name ON products(name);
      CREATE INDEX IF NOT EXISTS idx_product_search ON products(searchName);
      CREATE INDEX IF NOT EXISTS idx_product_hash ON products(hash);
      CREATE INDEX IF NOT EXISTS idx_product_lastSync ON products(lastSync);
      CREATE INDEX IF NOT EXISTS idx_product_groupCode ON products(groupCode);
    `);

    // Migrazione: aggiungi colonna price se non esiste
    try {
      this.db.exec(`ALTER TABLE products ADD COLUMN price REAL`);
      logger.info("Added price column to products table");
    } catch (error) {
      // Colonna già esistente, ignora l'errore
    }

    logger.info("Product database schema initialized");
  }

  /**
   * Calcola hash per un prodotto (per rilevare modifiche)
   */
  static calculateHash(product: Omit<Product, "hash" | "lastSync">): string {
    const data = `${product.id}|${product.name}|${product.description || ""}|${product.groupCode || ""}|${product.searchName || ""}|${product.priceUnit || ""}|${product.productGroupId || ""}|${product.productGroupDescription || ""}|${product.packageContent || ""}|${product.minQty || ""}|${product.multipleQty || ""}|${product.maxQty || ""}|${product.price || ""}`;
    return createHash("sha256").update(data).digest("hex");
  }

  /**
   * Inserisce o aggiorna prodotti in batch
   */
  upsertProducts(products: Array<Omit<Product, "hash" | "lastSync">>): {
    inserted: number;
    updated: number;
    unchanged: number;
  } {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    const insertStmt = this.db.prepare(`
      INSERT INTO products (id, name, description, groupCode, searchName, priceUnit, productGroupId, productGroupDescription, packageContent, minQty, multipleQty, maxQty, price, hash, lastSync)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        groupCode = excluded.groupCode,
        searchName = excluded.searchName,
        priceUnit = excluded.priceUnit,
        productGroupId = excluded.productGroupId,
        productGroupDescription = excluded.productGroupDescription,
        packageContent = excluded.packageContent,
        minQty = excluded.minQty,
        multipleQty = excluded.multipleQty,
        maxQty = excluded.maxQty,
        price = excluded.price,
        hash = excluded.hash,
        lastSync = excluded.lastSync,
        updatedAt = strftime('%s', 'now')
      WHERE products.hash != excluded.hash
    `);

    const checkStmt = this.db.prepare("SELECT hash FROM products WHERE id = ?");

    const transaction = this.db.transaction(
      (productsToSync: Array<Omit<Product, "hash" | "lastSync">>) => {
        for (const product of productsToSync) {
          const hash = ProductDatabase.calculateHash(product);
          const existing = checkStmt.get(product.id) as
            | { hash: string }
            | undefined;

          if (!existing) {
            insertStmt.run(
              product.id,
              product.name,
              product.description,
              product.groupCode,
              product.searchName,
              product.priceUnit,
              product.productGroupId,
              product.productGroupDescription,
              product.packageContent,
              product.minQty,
              product.multipleQty,
              product.maxQty,
              product.price,
              hash,
              now,
            );
            inserted++;
          } else if (existing.hash !== hash) {
            insertStmt.run(
              product.id,
              product.name,
              product.description,
              product.groupCode,
              product.searchName,
              product.priceUnit,
              product.productGroupId,
              product.productGroupDescription,
              product.packageContent,
              product.minQty,
              product.multipleQty,
              product.maxQty,
              product.price,
              hash,
              now,
            );
            updated++;
          } else {
            unchanged++;
          }
        }
      },
    );

    transaction(products);

    return { inserted, updated, unchanged };
  }

  /**
   * Trova prodotti eliminati in Archibald (presenti in DB ma non nella lista sync)
   */
  findDeletedProducts(currentIds: string[]): string[] {
    if (currentIds.length === 0) {
      return [];
    }

    const placeholders = currentIds.map(() => "?").join(",");
    const stmt = this.db.prepare(`
      SELECT id FROM products
      WHERE id NOT IN (${placeholders})
    `);

    const deleted = stmt.all(...currentIds) as Array<{ id: string }>;
    return deleted.map((p) => p.id);
  }

  /**
   * Elimina prodotti per ID
   */
  deleteProducts(ids: string[]): number {
    if (ids.length === 0) {
      return 0;
    }

    const placeholders = ids.map(() => "?").join(",");
    const stmt = this.db.prepare(
      `DELETE FROM products WHERE id IN (${placeholders})`,
    );
    const result = stmt.run(...ids);
    return result.changes;
  }

  /**
   * Ottiene tutti i prodotti (con ricerca opzionale)
   * La ricerca rimuove punti e spazi per matching flessibile
   */
  getProducts(searchQuery?: string): Product[] {
    let stmt;

    if (searchQuery) {
      // Rimuove punti, spazi e altri caratteri speciali per ricerca flessibile
      const normalizedQuery = searchQuery.replace(/[.\s-]/g, "").toLowerCase();
      const query = `%${normalizedQuery}%`;

      stmt = this.db.prepare(`
        SELECT id, name, description, groupCode, searchName, priceUnit, productGroupId, productGroupDescription, packageContent, minQty, multipleQty, maxQty, price, hash, lastSync
        FROM products
        WHERE REPLACE(REPLACE(REPLACE(LOWER(name), '.', ''), ' ', ''), '-', '') LIKE ?
           OR REPLACE(REPLACE(REPLACE(LOWER(id), '.', ''), ' ', ''), '-', '') LIKE ?
           OR REPLACE(REPLACE(REPLACE(LOWER(searchName), '.', ''), ' ', ''), '-', '') LIKE ?
           OR REPLACE(REPLACE(REPLACE(LOWER(description), '.', ''), ' ', ''), '-', '') LIKE ?
        ORDER BY name ASC
        LIMIT 100
      `);
      return stmt.all(query, query, query, query) as Product[];
    }

    stmt = this.db.prepare(`
      SELECT id, name, description, groupCode, searchName, priceUnit, productGroupId, productGroupDescription, packageContent, minQty, multipleQty, maxQty, price, hash, lastSync
      FROM products
      ORDER BY name ASC
    `);
    return stmt.all() as Product[];
  }

  /**
   * Conta totale prodotti
   */
  getProductCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM products")
      .get() as { count: number };
    return result.count;
  }

  /**
   * Ottiene il numero di prodotti con prezzi
   */
  getProductsWithPrices(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM products WHERE price IS NOT NULL")
      .get() as { count: number };
    return result.count;
  }

  /**
   * Ottiene timestamp dell'ultimo sync
   */
  getLastSyncTime(): number | null {
    const result = this.db
      .prepare("SELECT MAX(lastSync) as lastSync FROM products")
      .get() as { lastSync: number | null };
    return result.lastSync;
  }

  /**
   * Get all package variants for an article.
   * Variants are products with same name but different ID ARTICOLO.
   *
   * @param articleName - Article name (e.g., "H129FSQ.104.023")
   * @returns Array of products ordered by multipleQty DESC (highest package first)
   */
  getProductVariants(articleName: string): Product[] {
    const query = `
      SELECT * FROM products
      WHERE name = ?
      ORDER BY multipleQty DESC NULLS LAST, id ASC
    `;

    return this.db.prepare(query).all(articleName) as Product[];
  }

  /**
   * Select correct package variant based on quantity ordered.
   *
   * Logic:
   * - If quantity >= highest multipleQty → select highest package
   * - Else → select lowest package
   * - Single package → select that package
   *
   * @param articleName - Article name (e.g., "H129FSQ.104.023")
   * @param quantity - Quantity to order
   * @returns Selected product variant, or null if article not found
   */
  selectPackageVariant(articleName: string, quantity: number): Product | null {
    // Validation
    if (!articleName || articleName.trim() === "") {
      throw new Error("Article name is required");
    }

    if (quantity <= 0 || !Number.isFinite(quantity)) {
      throw new Error("Quantity must be a positive number");
    }

    const variants = this.getProductVariants(articleName);

    if (variants.length === 0) {
      return null;
    }

    if (variants.length === 1) {
      return variants[0];
    }

    // Multiple variants: apply selection logic
    // variants already sorted by multipleQty DESC (highest first)
    const highestMultiple = variants[0].multipleQty || 1;

    if (quantity >= highestMultiple) {
      return variants[0]; // Highest package
    } else {
      return variants[variants.length - 1]; // Lowest package
    }
  }

  /**
   * Validate quantity against product package rules.
   *
   * Rules:
   * - quantity >= minQty (if defined)
   * - quantity % multipleQty === 0 (if defined)
   * - quantity <= maxQty (if defined)
   *
   * @param product - Product or partial product with validation rules
   * @param quantity - Quantity to validate
   * @returns Validation result with errors and suggestions
   */
  validateQuantity(
    product: Pick<Product, "minQty" | "multipleQty" | "maxQty">,
    quantity: number,
  ): ValidationResult {
    const errors: string[] = [];

    // Check minQty
    if (product.minQty && quantity < product.minQty) {
      errors.push(`Quantity must be at least ${product.minQty}`);
    }

    // Check multipleQty
    if (product.multipleQty && quantity % product.multipleQty !== 0) {
      errors.push(`Quantity must be a multiple of ${product.multipleQty}`);
    }

    // Check maxQty
    if (product.maxQty && quantity > product.maxQty) {
      errors.push(`Quantity cannot exceed ${product.maxQty}`);
    }

    // Generate suggestions if invalid
    let suggestions: number[] | undefined;
    if (errors.length > 0 && product.multipleQty) {
      const minQty = product.minQty || product.multipleQty;
      const maxQty = product.maxQty || minQty * 10; // Reasonable default

      // Suggest nearest multiples
      const lower =
        Math.floor(quantity / product.multipleQty) * product.multipleQty;
      const higher =
        Math.ceil(quantity / product.multipleQty) * product.multipleQty;

      suggestions = [
        Math.max(lower, minQty),
        Math.min(higher, maxQty),
      ].filter((v, i, arr) => arr.indexOf(v) === i); // Unique values
    }

    return {
      valid: errors.length === 0,
      errors,
      suggestions,
    };
  }

  /**
   * Chiude la connessione al database
   */
  close(): void {
    this.db.close();
  }
}
