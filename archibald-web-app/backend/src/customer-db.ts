import Database from "better-sqlite3";
import { createHash } from "crypto";
import path from "path";
import { logger } from "./logger";

export interface Customer {
  id: string;
  name: string;
  vatNumber?: string;
  email?: string;
  hash: string;
  lastSync: number;
}

export class CustomerDatabase {
  private db: Database.Database;
  private static instance: CustomerDatabase;

  constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(__dirname, "../data/customers.db");
    this.db = new Database(finalPath);
    this.initializeSchema();
  }

  static getInstance(): CustomerDatabase {
    if (!CustomerDatabase.instance) {
      CustomerDatabase.instance = new CustomerDatabase();
    }
    return CustomerDatabase.instance;
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        vatNumber TEXT,
        email TEXT,
        hash TEXT NOT NULL,
        lastSync INTEGER NOT NULL,
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_name ON customers(name);
      CREATE INDEX IF NOT EXISTS idx_hash ON customers(hash);
      CREATE INDEX IF NOT EXISTS idx_lastSync ON customers(lastSync);
    `);

    logger.info("Database schema initialized");
  }

  /**
   * Calcola hash per un cliente (per rilevare modifiche)
   */
  static calculateHash(customer: Omit<Customer, "hash" | "lastSync">): string {
    const data = `${customer.id}|${customer.name}|${customer.vatNumber || ""}|${customer.email || ""}`;
    return createHash("sha256").update(data).digest("hex");
  }

  /**
   * Inserisce o aggiorna clienti in batch
   */
  upsertCustomers(customers: Array<Omit<Customer, "hash" | "lastSync">>): {
    inserted: number;
    updated: number;
    unchanged: number;
  } {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    const insertStmt = this.db.prepare(`
      INSERT INTO customers (id, name, vatNumber, email, hash, lastSync)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        vatNumber = excluded.vatNumber,
        email = excluded.email,
        hash = excluded.hash,
        lastSync = excluded.lastSync,
        updatedAt = strftime('%s', 'now')
      WHERE customers.hash != excluded.hash
    `);

    const checkStmt = this.db.prepare(
      "SELECT hash FROM customers WHERE id = ?",
    );

    const transaction = this.db.transaction(
      (customersToSync: Array<Omit<Customer, "hash" | "lastSync">>) => {
        for (const customer of customersToSync) {
          const hash = CustomerDatabase.calculateHash(customer);
          const existing = checkStmt.get(customer.id) as
            | { hash: string }
            | undefined;

          if (!existing) {
            insertStmt.run(
              customer.id,
              customer.name,
              customer.vatNumber,
              customer.email,
              hash,
              now,
            );
            inserted++;
          } else if (existing.hash !== hash) {
            insertStmt.run(
              customer.id,
              customer.name,
              customer.vatNumber,
              customer.email,
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

    transaction(customers);

    return { inserted, updated, unchanged };
  }

  /**
   * Trova clienti eliminati in Archibald (presenti in DB ma non nella lista sync)
   */
  findDeletedCustomers(currentIds: string[]): string[] {
    if (currentIds.length === 0) {
      return [];
    }

    const placeholders = currentIds.map(() => "?").join(",");
    const stmt = this.db.prepare(`
      SELECT id FROM customers
      WHERE id NOT IN (${placeholders})
    `);

    const deleted = stmt.all(...currentIds) as Array<{ id: string }>;
    return deleted.map((c) => c.id);
  }

  /**
   * Elimina clienti per ID
   */
  deleteCustomers(ids: string[]): number {
    if (ids.length === 0) {
      return 0;
    }

    const placeholders = ids.map(() => "?").join(",");
    const stmt = this.db.prepare(
      `DELETE FROM customers WHERE id IN (${placeholders})`,
    );
    const result = stmt.run(...ids);
    return result.changes;
  }

  /**
   * Ottiene tutti i clienti (con ricerca opzionale)
   */
  getCustomers(searchQuery?: string): Customer[] {
    let stmt;

    if (searchQuery) {
      const query = `%${searchQuery}%`;
      stmt = this.db.prepare(`
        SELECT id, name, vatNumber, email, hash, lastSync
        FROM customers
        WHERE name LIKE ? OR id LIKE ? OR vatNumber LIKE ?
        ORDER BY name ASC
        LIMIT 100
      `);
      return stmt.all(query, query, query) as Customer[];
    }

    stmt = this.db.prepare(`
      SELECT id, name, vatNumber, email, hash, lastSync
      FROM customers
      ORDER BY name ASC
    `);
    return stmt.all() as Customer[];
  }

  /**
   * Conta totale clienti
   */
  getCustomerCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM customers")
      .get() as { count: number };
    return result.count;
  }

  /**
   * Ottiene timestamp dell'ultimo sync
   */
  getLastSyncTime(): number | null {
    const result = this.db
      .prepare("SELECT MAX(lastSync) as lastSync FROM customers")
      .get() as { lastSync: number | null };
    return result.lastSync;
  }

  /**
   * Ricerca fuzzy di clienti per nome
   * Usa similarità fonetica e Levenshtein distance
   */
  searchCustomersByName(
    query: string,
    limit: number = 5,
  ): Array<{ customer: Customer; confidence: number }> {
    const normalizedQuery = query.toLowerCase().trim();

    // Get all customers for fuzzy matching (ordered by most recent first)
    const allCustomers = this.db
      .prepare(
        `
      SELECT id, name, vatNumber, email, hash, lastSync
      FROM customers
      ORDER BY lastSync DESC
    `,
      )
      .all() as Customer[];

    // Calculate similarity scores with recency boost
    const now = Date.now();
    const results = allCustomers
      .map((customer) => {
        const normalizedName = customer.name.toLowerCase();
        let confidence = this.calculateSimilarity(
          normalizedQuery,
          normalizedName,
        );

        // Small recency boost: +0.02 for customers synced in last 7 days
        if (customer.lastSync) {
          const daysSinceSync =
            (now - customer.lastSync) / (1000 * 60 * 60 * 24);
          if (daysSinceSync <= 7) {
            confidence = Math.min(1.0, confidence + 0.02);
          }
        }

        return { customer, confidence };
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
   * - Phonetic similarity (italiano)
   */
  private calculateSimilarity(query: string, target: string): number {
    // Exact match
    if (query === target) return 1.0;

    // Substring match (high score)
    if (target.includes(query)) {
      const ratio = query.length / target.length;
      return 0.7 + ratio * 0.3; // 0.7-1.0 based on length ratio
    }
    if (query.includes(target)) {
      const ratio = target.length / query.length;
      return 0.7 + ratio * 0.3;
    }

    // Levenshtein distance
    const distance = this.levenshteinDistance(query, target);
    const maxLen = Math.max(query.length, target.length);
    const levenshteinScore = 1 - distance / maxLen;

    // Phonetic bonus for Italian names
    const phoneticBonus = this.phoneticSimilarity(query, target);

    return Math.max(levenshteinScore, phoneticBonus);
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
   * Similarità fonetica per nomi italiani
   * Gestisce variazioni comuni: c/k, s/z, ph/f, etc.
   */
  private phoneticSimilarity(query: string, target: string): number {
    const normalizePhonetic = (str: string): string => {
      return str
        .toLowerCase()
        .replace(/k/g, "c")
        .replace(/ph/g, "f")
        .replace(/y/g, "i")
        .replace(/[àá]/g, "a")
        .replace(/[èé]/g, "e")
        .replace(/[ìí]/g, "i")
        .replace(/[òó]/g, "o")
        .replace(/[ùú]/g, "u")
        .replace(/[sz]/g, "s") // s/z confusion
        .replace(/ch/g, "c")
        .replace(/gh/g, "g");
    };

    const phoneticQuery = normalizePhonetic(query);
    const phoneticTarget = normalizePhonetic(target);

    if (phoneticQuery === phoneticTarget) return 0.95;

    const distance = this.levenshteinDistance(phoneticQuery, phoneticTarget);
    const maxLen = Math.max(phoneticQuery.length, phoneticTarget.length);
    return Math.max(0, 1 - distance / maxLen);
  }

  /**
   * Get all customers for cache export
   */
  getAllCustomers(): Customer[] {
    const stmt = this.db.prepare(`
      SELECT id, name, vatNumber, email, hash, lastSync
      FROM customers
      ORDER BY name ASC
    `);
    return stmt.all() as Customer[];
  }

  /**
   * Chiude la connessione al database
   */
  close(): void {
    this.db.close();
  }
}
