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
   * Chiude la connessione al database
   */
  close(): void {
    this.db.close();
  }
}
