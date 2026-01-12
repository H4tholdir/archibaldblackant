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

  private constructor() {
    const dbPath = path.join(__dirname, "../data/customers.db");
    this.db = new Database(dbPath);
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
   * Chiude la connessione al database
   */
  close(): void {
    this.db.close();
  }
}
