import Database from "better-sqlite3";
import { createHash } from "crypto";
import path from "path";
import { logger } from "./logger";

export interface Customer {
  // Primary Identification
  customerProfile: string; // Account number (PRIMARY KEY)
  internalId?: string; // Archibald internal ID
  name: string; // Company/Customer name

  // Italian Fiscal Data
  vatNumber?: string; // Partita IVA (11 digits)
  fiscalCode?: string; // Codice Fiscale (16 chars)
  sdi?: string; // Codice SDI (7 chars)
  pec?: string; // PEC email

  // Contact Information
  phone?: string; // Telefono
  mobile?: string; // Cellulare
  url?: string; // Website
  attentionTo?: string; // Contact person

  // Address Information
  street?: string; // Via
  logisticsAddress?: string; // Indirizzo Logistico
  postalCode?: string; // CAP
  city?: string; // Città

  // Business Information
  customerType?: string; // Tipo di Cliente
  type?: string; // Type classification
  deliveryTerms?: string; // Termini di Consegna
  description?: string; // Descrizione

  // Order History & Analytics
  lastOrderDate?: string; // Data ultimo ordine (ISO 8601)
  actualOrderCount?: number; // Conteggio ordini effettivi
  previousOrderCount1?: number; // Conteggio ordini precedente
  previousSales1?: number; // Vendite precedente
  previousOrderCount2?: number; // Conteggio ordini precedente 2
  previousSales2?: number; // Vendite precedente 2

  // Account References
  externalAccountNumber?: string; // Numero conto esterno
  ourAccountNumber?: string; // Il nostro numero di conto

  // System Fields
  hash: string; // SHA256 hash for change detection
  lastSync: number; // Unix timestamp of last sync
  botStatus?: "pending" | "placed" | "failed";
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
        -- Primary Identification
        customerProfile TEXT PRIMARY KEY,
        internalId TEXT,
        name TEXT NOT NULL,

        -- Italian Fiscal Data
        vatNumber TEXT,
        fiscalCode TEXT,
        sdi TEXT,
        pec TEXT,

        -- Contact Information
        phone TEXT,
        mobile TEXT,
        url TEXT,
        attentionTo TEXT,

        -- Address Information
        street TEXT,
        logisticsAddress TEXT,
        postalCode TEXT,
        city TEXT,

        -- Business Information
        customerType TEXT,
        type TEXT,
        deliveryTerms TEXT,
        description TEXT,

        -- Order History & Analytics
        lastOrderDate TEXT,
        actualOrderCount INTEGER DEFAULT 0,
        previousOrderCount1 INTEGER DEFAULT 0,
        previousSales1 REAL DEFAULT 0.0,
        previousOrderCount2 INTEGER DEFAULT 0,
        previousSales2 REAL DEFAULT 0.0,

        -- Account References
        externalAccountNumber TEXT,
        ourAccountNumber TEXT,

        -- System Fields
        hash TEXT NOT NULL,
        lastSync INTEGER NOT NULL,
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
        botStatus TEXT DEFAULT 'placed'
      );

    `);

    // Migration: Add new columns if they don't exist (backward compatibility)
    // MUST run before index creation so columns exist for existing databases
    this.migrateSchema();

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
      CREATE INDEX IF NOT EXISTS idx_customers_hash ON customers(hash);
      CREATE INDEX IF NOT EXISTS idx_customers_lastSync ON customers(lastSync);
      CREATE INDEX IF NOT EXISTS idx_customers_vatNumber ON customers(vatNumber);
      CREATE INDEX IF NOT EXISTS idx_customers_fiscalCode ON customers(fiscalCode);
      CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city);
      CREATE INDEX IF NOT EXISTS idx_customers_customerType ON customers(customerType);
      CREATE INDEX IF NOT EXISTS idx_customers_lastOrderDate ON customers(lastOrderDate);
      CREATE INDEX IF NOT EXISTS idx_customers_botStatus ON customers(botStatus);
    `);

    logger.info("Customer database schema initialized");
  }

  /**
   * Schema migration for existing databases
   * Adds new columns introduced in the 27-field expansion
   */
  private migrateSchema(): void {
    const migrations = [
      // Add customerProfile column and migrate from id
      { column: "customerProfile", type: "TEXT" },
      { column: "internalId", type: "TEXT" },
      { column: "fiscalCode", type: "TEXT" },
      { column: "sdi", type: "TEXT" },
      { column: "pec", type: "TEXT" },
      { column: "phone", type: "TEXT" },
      { column: "mobile", type: "TEXT" },
      { column: "url", type: "TEXT" },
      { column: "attentionTo", type: "TEXT" },
      { column: "street", type: "TEXT" },
      { column: "logisticsAddress", type: "TEXT" },
      { column: "postalCode", type: "TEXT" },
      { column: "city", type: "TEXT" },
      { column: "customerType", type: "TEXT" },
      { column: "type", type: "TEXT" },
      { column: "deliveryTerms", type: "TEXT" },
      { column: "description", type: "TEXT" },
      { column: "lastOrderDate", type: "TEXT" },
      { column: "actualOrderCount", type: "INTEGER DEFAULT 0" },
      { column: "previousOrderCount1", type: "INTEGER DEFAULT 0" },
      { column: "previousSales1", type: "REAL DEFAULT 0.0" },
      { column: "previousOrderCount2", type: "INTEGER DEFAULT 0" },
      { column: "previousSales2", type: "REAL DEFAULT 0.0" },
      { column: "externalAccountNumber", type: "TEXT" },
      { column: "ourAccountNumber", type: "TEXT" },
      { column: "botStatus", type: "TEXT DEFAULT 'placed'" },
    ];

    for (const migration of migrations) {
      try {
        this.db.exec(
          `ALTER TABLE customers ADD COLUMN ${migration.column} ${migration.type}`,
        );
        logger.info(`Added column ${migration.column} to customers table`);
      } catch (error) {
        // Column already exists, ignore error
      }
    }

    // Migrate existing data: id → customerProfile (if old schema exists)
    try {
      const hasOldId = this.db
        .prepare("SELECT id FROM customers LIMIT 1")
        .get();
      if (hasOldId) {
        this.db.exec(
          `UPDATE customers SET customerProfile = id WHERE customerProfile IS NULL`,
        );
        logger.info("Migrated id to customerProfile for existing customers");
      }
    } catch (error) {
      // Old id column doesn't exist, skip migration
    }
  }

  /**
   * Calcola hash per un cliente (per rilevare modifiche)
   * Include tutti i 27 campi per rilevare qualsiasi modifica
   */
  static calculateHash(customer: Omit<Customer, "hash" | "lastSync">): string {
    const data = [
      customer.customerProfile,
      customer.internalId,
      customer.name,
      customer.vatNumber,
      customer.fiscalCode,
      customer.sdi,
      customer.pec,
      customer.phone,
      customer.mobile,
      customer.url,
      customer.attentionTo,
      customer.street,
      customer.logisticsAddress,
      customer.postalCode,
      customer.city,
      customer.customerType,
      customer.type,
      customer.deliveryTerms,
      customer.description,
      customer.lastOrderDate,
      customer.actualOrderCount,
      customer.previousOrderCount1,
      customer.previousSales1,
      customer.previousOrderCount2,
      customer.previousSales2,
      customer.externalAccountNumber,
      customer.ourAccountNumber,
    ]
      .map((v) => String(v ?? "")) // Handle undefined/null
      .join("|");

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
      INSERT INTO customers (
        customerProfile, internalId, name,
        vatNumber, fiscalCode, sdi, pec,
        phone, mobile, url, attentionTo,
        street, logisticsAddress, postalCode, city,
        customerType, type, deliveryTerms, description,
        lastOrderDate, actualOrderCount,
        previousOrderCount1, previousSales1,
        previousOrderCount2, previousSales2,
        externalAccountNumber, ourAccountNumber,
        hash, lastSync
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(customerProfile) DO UPDATE SET
        internalId = excluded.internalId,
        name = excluded.name,
        vatNumber = excluded.vatNumber,
        fiscalCode = excluded.fiscalCode,
        sdi = excluded.sdi,
        pec = excluded.pec,
        phone = excluded.phone,
        mobile = excluded.mobile,
        url = excluded.url,
        attentionTo = excluded.attentionTo,
        street = excluded.street,
        logisticsAddress = excluded.logisticsAddress,
        postalCode = excluded.postalCode,
        city = excluded.city,
        customerType = excluded.customerType,
        type = excluded.type,
        deliveryTerms = excluded.deliveryTerms,
        description = excluded.description,
        lastOrderDate = excluded.lastOrderDate,
        actualOrderCount = excluded.actualOrderCount,
        previousOrderCount1 = excluded.previousOrderCount1,
        previousSales1 = excluded.previousSales1,
        previousOrderCount2 = excluded.previousOrderCount2,
        previousSales2 = excluded.previousSales2,
        externalAccountNumber = excluded.externalAccountNumber,
        ourAccountNumber = excluded.ourAccountNumber,
        hash = excluded.hash,
        lastSync = excluded.lastSync,
        updatedAt = strftime('%s', 'now')
      WHERE customers.hash != excluded.hash
    `);

    const checkStmt = this.db.prepare(
      "SELECT hash FROM customers WHERE customerProfile = ?",
    );

    const transaction = this.db.transaction(
      (customersToSync: Array<Omit<Customer, "hash" | "lastSync">>) => {
        for (const customer of customersToSync) {
          const hash = CustomerDatabase.calculateHash(customer);
          const existing = checkStmt.get(customer.customerProfile) as
            | { hash: string }
            | undefined;

          if (!existing) {
            insertStmt.run(
              customer.customerProfile,
              customer.internalId ?? null,
              customer.name,
              customer.vatNumber ?? null,
              customer.fiscalCode ?? null,
              customer.sdi ?? null,
              customer.pec ?? null,
              customer.phone ?? null,
              customer.mobile ?? null,
              customer.url ?? null,
              customer.attentionTo ?? null,
              customer.street ?? null,
              customer.logisticsAddress ?? null,
              customer.postalCode ?? null,
              customer.city ?? null,
              customer.customerType ?? null,
              customer.type ?? null,
              customer.deliveryTerms ?? null,
              customer.description ?? null,
              customer.lastOrderDate ?? null,
              customer.actualOrderCount ?? 0,
              customer.previousOrderCount1 ?? 0,
              customer.previousSales1 ?? 0.0,
              customer.previousOrderCount2 ?? 0,
              customer.previousSales2 ?? 0.0,
              customer.externalAccountNumber ?? null,
              customer.ourAccountNumber ?? null,
              hash,
              now,
            );
            inserted++;
          } else if (existing.hash !== hash) {
            insertStmt.run(
              customer.customerProfile,
              customer.internalId ?? null,
              customer.name,
              customer.vatNumber ?? null,
              customer.fiscalCode ?? null,
              customer.sdi ?? null,
              customer.pec ?? null,
              customer.phone ?? null,
              customer.mobile ?? null,
              customer.url ?? null,
              customer.attentionTo ?? null,
              customer.street ?? null,
              customer.logisticsAddress ?? null,
              customer.postalCode ?? null,
              customer.city ?? null,
              customer.customerType ?? null,
              customer.type ?? null,
              customer.deliveryTerms ?? null,
              customer.description ?? null,
              customer.lastOrderDate ?? null,
              customer.actualOrderCount ?? 0,
              customer.previousOrderCount1 ?? 0,
              customer.previousSales1 ?? 0.0,
              customer.previousOrderCount2 ?? 0,
              customer.previousSales2 ?? 0.0,
              customer.externalAccountNumber ?? null,
              customer.ourAccountNumber ?? null,
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
      SELECT customerProfile FROM customers
      WHERE customerProfile NOT IN (${placeholders})
    `);

    const deleted = stmt.all(...currentIds) as Array<{
      customerProfile: string;
    }>;
    return deleted.map((c) => c.customerProfile);
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
      `DELETE FROM customers WHERE customerProfile IN (${placeholders})`,
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
        SELECT * FROM customers
        WHERE name LIKE ?
           OR customerProfile LIKE ?
           OR vatNumber LIKE ?
           OR city LIKE ?
           OR fiscalCode LIKE ?
           OR street LIKE ?
           OR postalCode LIKE ?
        ORDER BY name ASC
        LIMIT 100
      `);
      return stmt.all(query, query, query, query, query, query, query) as Customer[];
    }

    stmt = this.db.prepare(`
      SELECT * FROM customers
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
      SELECT * FROM customers
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
  getAllCustomers(limit?: number, offset?: number): Customer[] {
    let query = `
      SELECT * FROM customers
      ORDER BY name ASC
    `;

    if (limit !== undefined) {
      query += ` LIMIT ${limit}`;
      if (offset !== undefined) {
        query += ` OFFSET ${offset}`;
      }
    }

    const stmt = this.db.prepare(query);
    return stmt.all() as Customer[];
  }

  /**
   * Count total customers in database
   */
  countCustomers(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM customers`);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Ottiene un singolo cliente per customerProfile (PK lookup)
   */
  getCustomerByProfile(customerProfile: string): Customer | undefined {
    return this.db
      .prepare("SELECT * FROM customers WHERE customerProfile = ?")
      .get(customerProfile) as Customer | undefined;
  }

  /**
   * Upsert di un singolo cliente (write-through dalla form)
   */
  upsertSingleCustomer(
    formData: import("./types").CustomerFormData,
    customerProfile: string,
    botStatus: "pending" | "placed" | "failed",
  ): Customer {
    const now = Date.now();
    const customerData: Omit<Customer, "hash" | "lastSync" | "botStatus"> = {
      customerProfile,
      name: formData.name,
      vatNumber: formData.vatNumber ?? undefined,
      pec: formData.pec ?? undefined,
      sdi: formData.sdi ?? undefined,
      street: formData.street ?? undefined,
      postalCode: formData.postalCode ?? undefined,
      phone: formData.phone ?? undefined,
      deliveryTerms: formData.deliveryMode ?? undefined,
    };

    const hash = CustomerDatabase.calculateHash(customerData);

    const stmt = this.db.prepare(`
      INSERT INTO customers (
        customerProfile, name, vatNumber, pec, sdi, street, postalCode, phone,
        deliveryTerms, hash, lastSync, botStatus
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(customerProfile) DO UPDATE SET
        name = excluded.name,
        vatNumber = excluded.vatNumber,
        pec = excluded.pec,
        sdi = excluded.sdi,
        street = excluded.street,
        postalCode = excluded.postalCode,
        phone = excluded.phone,
        deliveryTerms = excluded.deliveryTerms,
        hash = excluded.hash,
        lastSync = excluded.lastSync,
        botStatus = excluded.botStatus,
        updatedAt = strftime('%s', 'now')
    `);

    stmt.run(
      customerProfile,
      formData.name,
      formData.vatNumber ?? null,
      formData.pec ?? null,
      formData.sdi ?? null,
      formData.street ?? null,
      formData.postalCode ?? null,
      formData.phone ?? null,
      formData.deliveryMode ?? null,
      hash,
      now,
      botStatus,
    );

    const row = this.db
      .prepare("SELECT * FROM customers WHERE customerProfile = ?")
      .get(customerProfile) as Customer;

    return row;
  }

  /**
   * Aggiorna lo stato bot di un cliente
   */
  updateCustomerBotStatus(
    customerProfile: string,
    status: "pending" | "placed" | "failed",
  ): void {
    this.db
      .prepare("UPDATE customers SET botStatus = ? WHERE customerProfile = ?")
      .run(status, customerProfile);
  }

  /**
   * Ottiene clienti per stato bot
   */
  getCustomersByBotStatus(
    status: "pending" | "placed" | "failed",
  ): Customer[] {
    return this.db
      .prepare("SELECT * FROM customers WHERE botStatus = ?")
      .all(status) as Customer[];
  }

  /**
   * Chiude la connessione al database
   */
  close(): void {
    this.db.close();
  }
}
