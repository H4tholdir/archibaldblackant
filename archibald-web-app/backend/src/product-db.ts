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

    // Multiple variants: find the variant where quantity is a valid multiple
    // variants already sorted by multipleQty DESC (highest first)

    // Find all variants where quantity is a valid multiple
    const validVariants = variants.filter((v) => {
      const multiple = v.multipleQty || 1;
      return quantity % multiple === 0;
    });

    if (validVariants.length === 0) {
      // No valid variant found - this shouldn't happen if product data is correct
      // Fall back to the variant with smallest multipleQty (most flexible)
      return variants[variants.length - 1];
    }

    // Prefer the variant with the largest multipleQty that's still valid
    // This uses the most efficient packaging while still being valid
    // validVariants is already sorted DESC due to original variants sort
    return validVariants[0];
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

    // NOTE: maxQty is NOT validated - it's an Archibald constraint that doesn't apply to our bot
    // The bot can order any quantity that is a valid multiple of multipleQty

    // Generate suggestions if invalid
    let suggestions: number[] | undefined;
    if (errors.length > 0 && product.multipleQty) {
      const minQty = product.minQty || product.multipleQty;

      // Suggest nearest multiples
      const lower =
        Math.floor(quantity / product.multipleQty) * product.multipleQty;
      const higher =
        Math.ceil(quantity / product.multipleQty) * product.multipleQty;

      suggestions = [Math.max(lower, minQty), higher].filter(
        (v, i, arr) => arr.indexOf(v) === i,
      ); // Unique values
    }

    return {
      valid: errors.length === 0,
      errors,
      suggestions,
    };
  }

  /**
   * Ricerca fuzzy di prodotti per codice/nome
   * Usa similarità fonetica e Levenshtein distance
   */
  searchProductsByName(
    query: string,
    limit: number = 5,
  ): Array<{ product: Product; confidence: number }> {
    const normalizedQuery = query.toLowerCase().trim();

    // Get all products for fuzzy matching
    const allProducts = this.db
      .prepare(
        `
      SELECT id, name, description, groupCode, searchName, priceUnit, productGroupId, productGroupDescription, packageContent, minQty, multipleQty, maxQty, price, hash, lastSync
      FROM products
      ORDER BY name ASC
    `,
      )
      .all() as Product[];

    // Calculate similarity scores
    const results = allProducts
      .map((product) => {
        const normalizedName = product.name.toLowerCase();
        const confidence = this.calculateSimilarity(
          normalizedQuery,
          normalizedName,
        );
        return { product, confidence };
      })
      .filter((result) => result.confidence > 0.3) // Threshold: 30% similarity
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    return results;
  }

  /**
   * Calcola similarità tra due stringhe (0-1)
   * Combina:
   * - Levenshtein distance normalizzata
   * - Substring match bonus
   * - Normalization of special characters (dots, spaces)
   */
  private calculateSimilarity(query: string, target: string): number {
    // Exact match
    if (query === target) return 1.0;

    // Normalize by removing dots, spaces, dashes for product codes
    const normalizeCode = (str: string) =>
      str.replace(/[.\s-]/g, "").toLowerCase();

    const normalizedQuery = normalizeCode(query);
    const normalizedTarget = normalizeCode(target);

    // Exact match after normalization
    if (normalizedQuery === normalizedTarget) return 0.98;

    // Substring match (high score)
    if (normalizedTarget.includes(normalizedQuery)) {
      const ratio = normalizedQuery.length / normalizedTarget.length;
      return 0.7 + ratio * 0.28; // 0.7-0.98 based on length ratio
    }
    if (normalizedQuery.includes(normalizedTarget)) {
      const ratio = normalizedTarget.length / normalizedQuery.length;
      return 0.7 + ratio * 0.28;
    }

    // Levenshtein distance
    const distance = this.levenshteinDistance(
      normalizedQuery,
      normalizedTarget,
    );
    const maxLen = Math.max(normalizedQuery.length, normalizedTarget.length);
    const levenshteinScore = 1 - distance / maxLen;

    return levenshteinScore;
  }

  /**
   * Calcola Levenshtein distance tra due stringhe
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Get all products for cache export
   */
  getAllProducts(): Product[] {
    const stmt = this.db.prepare(`
      SELECT id, name, description, groupCode, searchName, priceUnit, productGroupId, productGroupDescription, packageContent, minQty, multipleQty, maxQty, price, hash, lastSync
      FROM products
      ORDER BY name ASC
    `);
    return stmt.all() as Product[];
  }

  /**
   * Get all product variants for cache export
   */
  getAllProductVariants(): Array<{
    productId: string;
    variantId: string;
    multipleQty: number;
    minQty: number;
    maxQty: number;
    packageContent: string;
  }> {
    // Extract variant info from products table
    // Products with same name but different IDs are variants
    const stmt = this.db.prepare(`
      SELECT
        name as productId,
        id as variantId,
        multipleQty,
        minQty,
        maxQty,
        packageContent
      FROM products
      WHERE multipleQty IS NOT NULL
      ORDER BY name, multipleQty DESC
    `);

    return stmt.all() as any[];
  }

  /**
   * Get all prices for cache export
   */
  getAllPrices(): Array<{
    articleId: string;
    articleName: string;
    price: number;
    lastSynced: string;
  }> {
    const stmt = this.db.prepare(`
      SELECT
        id as articleId,
        name as articleName,
        price,
        datetime(lastSync / 1000, 'unixepoch') as lastSynced
      FROM products
      WHERE price IS NOT NULL
      ORDER BY name
    `);

    return stmt.all() as any[];
  }

  /**
   * Chiude la connessione al database
   */
  close(): void {
    this.db.close();
  }
}
