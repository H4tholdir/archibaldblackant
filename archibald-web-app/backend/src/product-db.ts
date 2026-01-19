import Database from "better-sqlite3";
import { createHash } from "crypto";
import path from "path";
import { logger } from "./logger";

export interface Product {
  // ========== CORE FIELDS (Page 1) ==========
  id: string; // ID ARTICOLO
  name: string; // NOME ARTICOLO
  description?: string; // DESCRIZIONE

  // ========== PAGE 2 FIELDS ==========
  groupCode?: string; // GRUPPO ARTICOLO
  packageContent?: string; // CONTENUTO DELL'IMBALLAGGIO
  searchName?: string; // NOME DELLA RICERCA

  // ========== PAGE 3 FIELDS ==========
  priceUnit?: string; // UNITÀ DI PREZZO
  productGroupId?: string; // ID GRUPPO DI PRODOTTI
  productGroupDescription?: string; // DESCRIZIONE GRUPPO ARTICOLO
  minQty?: number; // QTÀ MINIMA

  // ========== PAGE 4 FIELDS ==========
  multipleQty?: number; // QTÀ MULTIPLI
  maxQty?: number; // QTÀ MASSIMA
  figure?: string; // FIGURA
  bulkArticleId?: string; // ID IN BLOCCO DELL'ARTICOLO
  legPackage?: string; // PACCO GAMBA

  // ========== PAGE 5 FIELDS ==========
  size?: string; // GRANDEZZA
  configurationId?: string; // ID DI CONFIGURAZIONE
  createdBy?: string; // CREATO DA
  createdDate?: string; // DATA CREATA
  dataAreaId?: string; // DATAAREAID

  // ========== PAGE 6 FIELDS ==========
  defaultQty?: string; // QTÀ PREDEFINITA
  displayProductNumber?: string; // VISUALIZZA IL NUMERO DI PRODOTTO
  totalAbsoluteDiscount?: string; // SCONTO ASSOLUTO TOTALE
  productId?: string; // ID (duplicate?)

  // ========== PAGE 7 FIELDS ==========
  lineDiscount?: string; // SCONTO LINEA
  modifiedBy?: string; // MODIFICATO DA
  modifiedDatetime?: string; // DATETIME MODIFICATO
  orderableArticle?: string; // ARTICOLO ORDINABILE

  // ========== PAGE 8 FIELDS ==========
  purchPrice?: string; // PURCH PRICE
  pcsStandardConfigurationId?: string; // PCS ID DI CONFIGURAZIONE STANDARD
  standardQty?: string; // QTÀ STANDARD
  stopped?: string; // FERMATO
  unitId?: string; // ID UNITÀ

  // ========== PRICE FIELDS (keep existing) ==========
  price?: number;
  priceSource?: "archibald" | "excel" | null;
  priceUpdatedAt?: number;
  vat?: number;
  vatSource?: "archibald" | "excel" | null;
  vatUpdatedAt?: number;

  // ========== SYSTEM FIELDS ==========
  hash: string; // MD5 hash for delta detection
  lastSync: number; // Unix timestamp
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  suggestions?: number[];
}

export interface ProductChange {
  id?: number;
  productId: string;
  changeType: "created" | "updated" | "deleted";
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
  changedAt: number;
  syncSessionId: string;
}

export interface SyncSession {
  id: string; // UUID v4
  syncType: "products";
  startedAt: number;
  completedAt?: number;
  status: "running" | "completed" | "failed" | "partial";
  totalPages?: number;
  pagesProcessed?: number;
  itemsProcessed?: number;
  itemsCreated?: number;
  itemsUpdated?: number;
  itemsDeleted?: number;
  imagesDownloaded?: number;
  errorMessage?: string;
  syncMode: "full" | "incremental" | "forced" | "auto";
}

export interface ProductImage {
  productId: string;
  imageUrl?: string;
  localPath?: string;
  downloadedAt?: number;
  fileSize?: number;
  mimeType?: string;
  hash?: string;
  width?: number;
  height?: number;
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
    // Create base products table
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

    // Legacy migration: add price column if missing
    try {
      this.db.exec(`ALTER TABLE products ADD COLUMN price REAL`);
      logger.info("Added price column to products table");
    } catch (error) {
      // Column already exists, ignore
    }

    // Run migration to add image and audit tables
    try {
      // Import and run migration inline to avoid circular dependencies
      const tableInfo = this.db
        .prepare("PRAGMA table_info(products)")
        .all() as Array<{
        name: string;
      }>;
      const existingColumns = new Set(tableInfo.map((col: any) => col.name));

      if (!existingColumns.has("imageUrl")) {
        logger.info(
          "Running schema migration to add image and audit tables...",
        );
        this.runMigration001();
      }
    } catch (error) {
      logger.warn("Migration already applied or failed:", error);
    }

    logger.info("Product database schema initialized");
  }

  private runMigration001(): void {
    logger.info("  ➡️  Adding image columns to products table...");

    // Add image columns
    this.db.exec(`
      ALTER TABLE products ADD COLUMN imageUrl TEXT;
      ALTER TABLE products ADD COLUMN imageLocalPath TEXT;
      ALTER TABLE products ADD COLUMN imageDownloadedAt INTEGER;

      CREATE INDEX IF NOT EXISTS idx_product_imageLocalPath
      ON products(imageLocalPath);
    `);

    // Create audit tables
    logger.info("  ➡️  Creating audit tables...");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS product_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId TEXT NOT NULL,
        changeType TEXT NOT NULL CHECK(changeType IN ('created', 'updated', 'deleted')),
        fieldChanged TEXT,
        oldValue TEXT,
        newValue TEXT,
        changedAt INTEGER NOT NULL,
        syncSessionId TEXT NOT NULL,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_changes_productId ON product_changes(productId);
      CREATE INDEX IF NOT EXISTS idx_changes_changedAt ON product_changes(changedAt);
      CREATE INDEX IF NOT EXISTS idx_changes_syncSessionId ON product_changes(syncSessionId);
      CREATE INDEX IF NOT EXISTS idx_changes_changeType ON product_changes(changeType);

      CREATE TABLE IF NOT EXISTS sync_sessions (
        id TEXT PRIMARY KEY,
        syncType TEXT NOT NULL CHECK(syncType = 'products'),
        startedAt INTEGER NOT NULL,
        completedAt INTEGER,
        status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed', 'partial')),
        totalPages INTEGER,
        pagesProcessed INTEGER,
        itemsProcessed INTEGER,
        itemsCreated INTEGER DEFAULT 0,
        itemsUpdated INTEGER DEFAULT 0,
        itemsDeleted INTEGER DEFAULT 0,
        imagesDownloaded INTEGER DEFAULT 0,
        errorMessage TEXT,
        syncMode TEXT NOT NULL CHECK(syncMode IN ('full', 'incremental', 'forced', 'auto'))
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_startedAt ON sync_sessions(startedAt);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sync_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_syncMode ON sync_sessions(syncMode);

      CREATE TABLE IF NOT EXISTS product_images (
        productId TEXT PRIMARY KEY,
        imageUrl TEXT,
        localPath TEXT,
        downloadedAt INTEGER,
        fileSize INTEGER,
        mimeType TEXT,
        hash TEXT,
        width INTEGER,
        height INTEGER,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_product_images_hash ON product_images(hash);
      CREATE INDEX IF NOT EXISTS idx_product_images_downloadedAt ON product_images(downloadedAt);
    `);

    logger.info("  ✅ Migration 001 completed");
  }

  /**
   * Calcola hash per un prodotto (per rilevare modifiche)
   * Include TUTTI i campi estrattibili per rilevare qualsiasi cambiamento
   */
  static calculateHash(product: Omit<Product, "hash" | "lastSync">): string {
    const data = `${product.id}|${product.name}|${product.description || ""}|${product.groupCode || ""}|${product.packageContent || ""}|${product.searchName || ""}|${product.priceUnit || ""}|${product.productGroupId || ""}|${product.productGroupDescription || ""}|${product.minQty || ""}|${product.multipleQty || ""}|${product.maxQty || ""}|${product.figure || ""}|${product.bulkArticleId || ""}|${product.legPackage || ""}|${product.size || ""}|${product.configurationId || ""}|${product.createdBy || ""}|${product.createdDate || ""}|${product.dataAreaId || ""}|${product.defaultQty || ""}|${product.displayProductNumber || ""}|${product.totalAbsoluteDiscount || ""}|${product.productId || ""}|${product.lineDiscount || ""}|${product.modifiedBy || ""}|${product.modifiedDatetime || ""}|${product.orderableArticle || ""}|${product.purchPrice || ""}|${product.pcsStandardConfigurationId || ""}|${product.standardQty || ""}|${product.stopped || ""}|${product.unitId || ""}|${product.price || ""}`;
    return createHash("sha256").update(data).digest("hex");
  }

  /**
   * Inserisce o aggiorna prodotti in batch
   */
  upsertProducts(
    products: Array<Omit<Product, "hash" | "lastSync">>,
    syncSessionId?: string,
  ): {
    inserted: number;
    updated: number;
    unchanged: number;
  } {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    const insertStmt = this.db.prepare(`
      INSERT INTO products (id, name, description, groupCode, imageUrl, searchName, priceUnit, productGroupId, productGroupDescription, packageContent, minQty, multipleQty, maxQty, price, hash, lastSync)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        groupCode = excluded.groupCode,
        imageUrl = excluded.imageUrl,
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
        lastSync = excluded.lastSync
      WHERE products.hash != excluded.hash
    `);

    const checkStmt = this.db.prepare("SELECT * FROM products WHERE id = ?");

    const changeLogStmt = syncSessionId
      ? this.db.prepare(`
        INSERT INTO product_changes (
          productId, changeType, fieldChanged, oldValue, newValue, changedAt, syncSessionId
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      : null;

    const transaction = this.db.transaction(
      (
        productsToSync: Array<Omit<Product, "hash" | "lastSync">>,
        sessionId?: string,
      ) => {
        for (const product of productsToSync) {
          const hash = ProductDatabase.calculateHash(product);
          const existing = checkStmt.get(product.id) as Product | undefined;

          if (!existing) {
            // NEW PRODUCT
            insertStmt.run(
              product.id,
              product.name,
              product.description,
              product.groupCode,
              product.imageUrl,
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

            // Log creation
            if (changeLogStmt && sessionId) {
              changeLogStmt.run(
                product.id,
                "created",
                null,
                null,
                null,
                now,
                sessionId,
              );
            }
          } else if (existing.hash !== hash) {
            // PRODUCT UPDATED
            insertStmt.run(
              product.id,
              product.name,
              product.description,
              product.groupCode,
              product.imageUrl,
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

            // Log field-level changes
            if (changeLogStmt && sessionId) {
              const fieldChanges = this.detectFieldChanges(existing, {
                ...product,
                hash,
                lastSync: now,
              });

              for (const change of fieldChanges) {
                changeLogStmt.run(
                  product.id,
                  "updated",
                  change.field,
                  change.oldValue,
                  change.newValue,
                  now,
                  sessionId,
                );
              }
            }
          } else {
            unchanged++;
          }
        }
      },
    );

    transaction(products, syncSessionId);

    return { inserted, updated, unchanged };
  }

  /**
   * Detect field-level changes between old and new product
   */
  private detectFieldChanges(
    oldProduct: Product,
    newProduct: Product,
  ): Array<{ field: string; oldValue: string; newValue: string }> {
    const changes: Array<{
      field: string;
      oldValue: string;
      newValue: string;
    }> = [];

    const fields: Array<keyof Product> = [
      "name",
      "description",
      "groupCode",
      "packageContent",
      "searchName",
      "priceUnit",
      "productGroupId",
      "productGroupDescription",
      "minQty",
      "multipleQty",
      "maxQty",
      "figure",
      "bulkArticleId",
      "legPackage",
      "size",
      "configurationId",
      "createdBy",
      "createdDate",
      "dataAreaId",
      "defaultQty",
      "displayProductNumber",
      "totalAbsoluteDiscount",
      "productId",
      "lineDiscount",
      "modifiedBy",
      "modifiedDatetime",
      "orderableArticle",
      "purchPrice",
      "pcsStandardConfigurationId",
      "standardQty",
      "stopped",
      "unitId",
      "price",
    ];

    for (const field of fields) {
      const oldValue = oldProduct[field];
      const newValue = newProduct[field];

      if (oldValue !== newValue) {
        changes.push({
          field,
          oldValue: String(oldValue ?? ""),
          newValue: String(newValue ?? ""),
        });
      }
    }

    return changes;
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
   * Create a new sync session
   */
  createSyncSession(syncMode: "full" | "incremental" | "forced" | "auto"): string {
    const sessionId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const stmt = this.db.prepare(`
      INSERT INTO sync_sessions (
        id, syncType, startedAt, status, syncMode
      )
      VALUES (?, 'products', ?, 'running', ?)
    `);

    stmt.run(sessionId, Date.now(), syncMode);
    return sessionId;
  }

  /**
   * Update sync session progress
   */
  updateSyncSession(
    sessionId: string,
    data: {
      totalPages?: number;
      pagesProcessed?: number;
      itemsProcessed?: number;
      itemsCreated?: number;
      itemsUpdated?: number;
      itemsDeleted?: number;
      imagesDownloaded?: number;
    },
  ): void {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.totalPages !== undefined) {
      updates.push("totalPages = ?");
      values.push(data.totalPages);
    }
    if (data.pagesProcessed !== undefined) {
      updates.push("pagesProcessed = ?");
      values.push(data.pagesProcessed);
    }
    if (data.itemsProcessed !== undefined) {
      updates.push("itemsProcessed = ?");
      values.push(data.itemsProcessed);
    }
    if (data.itemsCreated !== undefined) {
      updates.push("itemsCreated = ?");
      values.push(data.itemsCreated);
    }
    if (data.itemsUpdated !== undefined) {
      updates.push("itemsUpdated = ?");
      values.push(data.itemsUpdated);
    }
    if (data.itemsDeleted !== undefined) {
      updates.push("itemsDeleted = ?");
      values.push(data.itemsDeleted);
    }
    if (data.imagesDownloaded !== undefined) {
      updates.push("imagesDownloaded = ?");
      values.push(data.imagesDownloaded);
    }

    if (updates.length === 0) return;

    values.push(sessionId);

    const stmt = this.db.prepare(`
      UPDATE sync_sessions
      SET ${updates.join(", ")}
      WHERE id = ?
    `);

    stmt.run(...values);
  }

  /**
   * Complete sync session
   */
  completeSyncSession(
    sessionId: string,
    status: "completed" | "failed" | "partial",
    errorMessage?: string,
  ): void {
    const stmt = this.db.prepare(`
      UPDATE sync_sessions
      SET status = ?, completedAt = ?, errorMessage = ?
      WHERE id = ?
    `);

    stmt.run(status, Date.now(), errorMessage || null, sessionId);
  }

  /**
   * Get sync session by ID
   */
  getSyncSession(sessionId: string): SyncSession | null {
    const stmt = this.db.prepare("SELECT * FROM sync_sessions WHERE id = ?");
    return (stmt.get(sessionId) as SyncSession) || null;
  }

  /**
   * Get recent sync sessions
   */
  getRecentSyncSessions(limit: number = 10): SyncSession[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_sessions
      ORDER BY startedAt DESC
      LIMIT ?
    `);
    return stmt.all(limit) as SyncSession[];
  }

  /**
   * Get sync history (last N sessions)
   */
  getSyncHistory(limit: number = 20): SyncSession[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_sessions
      WHERE syncType = 'products'
      ORDER BY startedAt DESC
      LIMIT ?
    `);

    return stmt.all(limit) as SyncSession[];
  }

  /**
   * Get sync metrics (success rate, avg duration, last sync)
   */
  getSyncMetrics(): {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    successRate: number;
    avgDurationMs: number;
    lastSyncAt: number | null;
    lastSyncStatus: string | null;
  } {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as totalSyncs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successfulSyncs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedSyncs,
        AVG(CASE WHEN completedAt IS NOT NULL THEN completedAt - startedAt ELSE NULL END) as avgDurationMs,
        MAX(startedAt) as lastSyncAt
      FROM sync_sessions
      WHERE syncType = 'products'
    `).get() as any;

    const lastSync = this.db.prepare(`
      SELECT status FROM sync_sessions
      WHERE syncType = 'products'
      ORDER BY startedAt DESC
      LIMIT 1
    `).get() as any;

    return {
      totalSyncs: stats.totalSyncs || 0,
      successfulSyncs: stats.successfulSyncs || 0,
      failedSyncs: stats.failedSyncs || 0,
      successRate: stats.totalSyncs > 0 ? (stats.successfulSyncs / stats.totalSyncs) * 100 : 0,
      avgDurationMs: stats.avgDurationMs || 0,
      lastSyncAt: stats.lastSyncAt || null,
      lastSyncStatus: lastSync?.status || null,
    };
  }

  /**
   * Get product by ID
   */
  getProductById(productId: string): Product | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM products WHERE id = ?
    `);
    return stmt.get(productId) as Product | undefined;
  }

  /**
   * Log a product change
   */
  logProductChange(change: Omit<ProductChange, "id" | "changedAt">): void {
    const stmt = this.db.prepare(`
      INSERT INTO product_changes (
        productId, changeType, fieldChanged, oldValue, newValue, changedAt, syncSessionId
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      change.productId,
      change.changeType,
      change.fieldChanged || null,
      change.oldValue || null,
      change.newValue || null,
      Date.now(),
      change.syncSessionId,
    );
  }

  /**
   * Get product change history
   */
  getProductChangeHistory(
    productId: string,
    limit: number = 50,
  ): ProductChange[] {
    const stmt = this.db.prepare(`
      SELECT * FROM product_changes
      WHERE productId = ?
      ORDER BY changedAt DESC
      LIMIT ?
    `);
    return stmt.all(productId, limit) as ProductChange[];
  }

  /**
   * Get all changes for a sync session
   */
  getChangesForSession(sessionId: string): ProductChange[] {
    const stmt = this.db.prepare(`
      SELECT * FROM product_changes
      WHERE syncSessionId = ?
      ORDER BY changedAt ASC
    `);
    return stmt.all(sessionId) as ProductChange[];
  }

  /**
   * Update product image metadata (imageLocalPath, imageDownloadedAt)
   */
  updateProductImage(
    productId: string,
    imageLocalPath: string,
    downloadedAt: number,
  ): void {
    const stmt = this.db.prepare(`
      UPDATE products
      SET imageLocalPath = ?, imageDownloadedAt = ?
      WHERE id = ?
    `);

    stmt.run(imageLocalPath, downloadedAt, productId);
  }

  /**
   * Upsert product image metadata in product_images table
   */
  upsertProductImage(imageData: ProductImage): void {
    const stmt = this.db.prepare(`
      INSERT INTO product_images (
        productId, imageUrl, localPath, downloadedAt,
        fileSize, mimeType, hash, width, height
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(productId) DO UPDATE SET
        imageUrl = excluded.imageUrl,
        localPath = excluded.localPath,
        downloadedAt = excluded.downloadedAt,
        fileSize = excluded.fileSize,
        mimeType = excluded.mimeType,
        hash = excluded.hash,
        width = excluded.width,
        height = excluded.height
    `);

    stmt.run(
      imageData.productId,
      imageData.imageUrl || null,
      imageData.localPath || null,
      imageData.downloadedAt || null,
      imageData.fileSize || null,
      imageData.mimeType || null,
      imageData.hash || null,
      imageData.width || null,
      imageData.height || null,
    );
  }

  /**
   * Execute a database query that modifies data (INSERT, UPDATE, DELETE)
   * @returns RunResult with lastInsertRowid and changes
   */
  run(sql: string, params?: any[]): Database.RunResult {
    return this.db.prepare(sql).run(...(params || []));
  }

  /**
   * Execute a database query that returns a single row
   * @returns Single row object or undefined if not found
   */
  get<T = any>(sql: string, params?: any[]): T | undefined {
    return this.db.prepare(sql).get(...(params || [])) as T | undefined;
  }

  /**
   * Execute a database query that returns multiple rows
   * @returns Array of row objects
   */
  all<T = any>(sql: string, params?: any[]): T[] {
    return this.db.prepare(sql).all(...(params || [])) as T[];
  }

  /**
   * Chiude la connessione al database
   */
  close(): void {
    this.db.close();
  }
}

// Export singleton instance
export const productDb = ProductDatabase.getInstance();
