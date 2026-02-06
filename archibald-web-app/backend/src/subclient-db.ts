import Database from "better-sqlite3";
import path from "path";
import { logger } from "./logger";

export interface SubClient {
  codice: string;
  ragioneSociale: string;
  supplRagioneSociale?: string;
  indirizzo?: string;
  cap?: string;
  localita?: string;
  prov?: string;
  telefono?: string;
  fax?: string;
  email?: string;
  partitaIva?: string;
  codFiscale?: string;
  zona?: string;
  persDaContattare?: string;
  emailAmministraz?: string;
  createdAt?: number;
  updatedAt?: number;
}

export class SubClientDatabase {
  private db: Database.Database;
  private static instance: SubClientDatabase;

  constructor(dbPath?: string) {
    const finalPath =
      dbPath || path.join(__dirname, "../data/subclients.db");
    this.db = new Database(finalPath);
    this.initializeSchema();
  }

  static getInstance(): SubClientDatabase {
    if (!SubClientDatabase.instance) {
      SubClientDatabase.instance = new SubClientDatabase();
    }
    return SubClientDatabase.instance;
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sub_clients (
        codice TEXT PRIMARY KEY,
        ragione_sociale TEXT NOT NULL,
        suppl_ragione_sociale TEXT,
        indirizzo TEXT,
        cap TEXT,
        localita TEXT,
        prov TEXT,
        telefono TEXT,
        fax TEXT,
        email TEXT,
        partita_iva TEXT,
        cod_fiscale TEXT,
        zona TEXT,
        pers_da_contattare TEXT,
        email_amministraz TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sub_clients_ragione_sociale ON sub_clients(ragione_sociale);
      CREATE INDEX IF NOT EXISTS idx_sub_clients_suppl_ragione_sociale ON sub_clients(suppl_ragione_sociale);
      CREATE INDEX IF NOT EXISTS idx_sub_clients_partita_iva ON sub_clients(partita_iva);
    `);

    logger.info("SubClient database schema initialized");
  }

  upsertSubClients(
    clients: SubClient[],
  ): { inserted: number; updated: number; unchanged: number } {
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    const checkStmt = this.db.prepare(
      "SELECT codice, ragione_sociale, suppl_ragione_sociale, indirizzo, cap, localita, prov, telefono, fax, email, partita_iva, cod_fiscale, zona, pers_da_contattare, email_amministraz FROM sub_clients WHERE codice = ?",
    );

    const insertStmt = this.db.prepare(`
      INSERT INTO sub_clients (
        codice, ragione_sociale, suppl_ragione_sociale,
        indirizzo, cap, localita, prov,
        telefono, fax, email,
        partita_iva, cod_fiscale, zona,
        pers_da_contattare, email_amministraz
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(codice) DO UPDATE SET
        ragione_sociale = excluded.ragione_sociale,
        suppl_ragione_sociale = excluded.suppl_ragione_sociale,
        indirizzo = excluded.indirizzo,
        cap = excluded.cap,
        localita = excluded.localita,
        prov = excluded.prov,
        telefono = excluded.telefono,
        fax = excluded.fax,
        email = excluded.email,
        partita_iva = excluded.partita_iva,
        cod_fiscale = excluded.cod_fiscale,
        zona = excluded.zona,
        pers_da_contattare = excluded.pers_da_contattare,
        email_amministraz = excluded.email_amministraz,
        updated_at = strftime('%s','now')
    `);

    const transaction = this.db.transaction((clientsToSync: SubClient[]) => {
      for (const client of clientsToSync) {
        const existing = checkStmt.get(client.codice) as
          | Record<string, string | null>
          | undefined;

        if (!existing) {
          insertStmt.run(
            client.codice,
            client.ragioneSociale,
            client.supplRagioneSociale ?? null,
            client.indirizzo ?? null,
            client.cap ?? null,
            client.localita ?? null,
            client.prov ?? null,
            client.telefono ?? null,
            client.fax ?? null,
            client.email ?? null,
            client.partitaIva ?? null,
            client.codFiscale ?? null,
            client.zona ?? null,
            client.persDaContattare ?? null,
            client.emailAmministraz ?? null,
          );
          inserted++;
        } else {
          const hasChanged =
            existing.ragione_sociale !== client.ragioneSociale ||
            (existing.suppl_ragione_sociale ?? null) !==
              (client.supplRagioneSociale ?? null) ||
            (existing.indirizzo ?? null) !== (client.indirizzo ?? null) ||
            (existing.cap ?? null) !== (client.cap ?? null) ||
            (existing.localita ?? null) !== (client.localita ?? null) ||
            (existing.prov ?? null) !== (client.prov ?? null) ||
            (existing.telefono ?? null) !== (client.telefono ?? null) ||
            (existing.fax ?? null) !== (client.fax ?? null) ||
            (existing.email ?? null) !== (client.email ?? null) ||
            (existing.partita_iva ?? null) !== (client.partitaIva ?? null) ||
            (existing.cod_fiscale ?? null) !== (client.codFiscale ?? null) ||
            (existing.zona ?? null) !== (client.zona ?? null) ||
            (existing.pers_da_contattare ?? null) !==
              (client.persDaContattare ?? null) ||
            (existing.email_amministraz ?? null) !==
              (client.emailAmministraz ?? null);

          if (hasChanged) {
            insertStmt.run(
              client.codice,
              client.ragioneSociale,
              client.supplRagioneSociale ?? null,
              client.indirizzo ?? null,
              client.cap ?? null,
              client.localita ?? null,
              client.prov ?? null,
              client.telefono ?? null,
              client.fax ?? null,
              client.email ?? null,
              client.partitaIva ?? null,
              client.codFiscale ?? null,
              client.zona ?? null,
              client.persDaContattare ?? null,
              client.emailAmministraz ?? null,
            );
            updated++;
          } else {
            unchanged++;
          }
        }
      }
    });

    transaction(clients);
    return { inserted, updated, unchanged };
  }

  searchSubClients(query: string): SubClient[] {
    const searchTerm = `%${query}%`;
    const stmt = this.db.prepare(`
      SELECT
        codice, ragione_sociale, suppl_ragione_sociale,
        indirizzo, cap, localita, prov,
        telefono, fax, email,
        partita_iva, cod_fiscale, zona,
        pers_da_contattare, email_amministraz,
        created_at, updated_at
      FROM sub_clients
      WHERE codice LIKE ?
         OR ragione_sociale LIKE ?
         OR suppl_ragione_sociale LIKE ?
      ORDER BY ragione_sociale ASC
      LIMIT 50
    `);
    const rows = stmt.all(searchTerm, searchTerm, searchTerm) as any[];
    return rows.map(this.mapRow);
  }

  getAllSubClients(): SubClient[] {
    const stmt = this.db.prepare(`
      SELECT
        codice, ragione_sociale, suppl_ragione_sociale,
        indirizzo, cap, localita, prov,
        telefono, fax, email,
        partita_iva, cod_fiscale, zona,
        pers_da_contattare, email_amministraz,
        created_at, updated_at
      FROM sub_clients
      ORDER BY ragione_sociale ASC
    `);
    const rows = stmt.all() as any[];
    return rows.map(this.mapRow);
  }

  getSubClientByCodice(codice: string): SubClient | undefined {
    const stmt = this.db.prepare(`
      SELECT
        codice, ragione_sociale, suppl_ragione_sociale,
        indirizzo, cap, localita, prov,
        telefono, fax, email,
        partita_iva, cod_fiscale, zona,
        pers_da_contattare, email_amministraz,
        created_at, updated_at
      FROM sub_clients
      WHERE codice = ?
    `);
    const row = stmt.get(codice) as any | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  deleteSubClient(codice: string): boolean {
    const stmt = this.db.prepare("DELETE FROM sub_clients WHERE codice = ?");
    const result = stmt.run(codice);
    return result.changes > 0;
  }

  deleteAllSubClients(): number {
    const stmt = this.db.prepare("DELETE FROM sub_clients");
    const result = stmt.run();
    return result.changes;
  }

  countSubClients(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM sub_clients")
      .get() as { count: number };
    return result.count;
  }

  getAllCodici(): string[] {
    const rows = this.db
      .prepare("SELECT codice FROM sub_clients")
      .all() as Array<{ codice: string }>;
    return rows.map((r) => r.codice);
  }

  deleteByCodici(codici: string[]): number {
    if (codici.length === 0) return 0;
    const placeholders = codici.map(() => "?").join(",");
    const stmt = this.db.prepare(
      `DELETE FROM sub_clients WHERE codice IN (${placeholders})`,
    );
    const result = stmt.run(...codici);
    return result.changes;
  }

  private mapRow(row: any): SubClient {
    return {
      codice: row.codice,
      ragioneSociale: row.ragione_sociale,
      supplRagioneSociale: row.suppl_ragione_sociale ?? undefined,
      indirizzo: row.indirizzo ?? undefined,
      cap: row.cap ?? undefined,
      localita: row.localita ?? undefined,
      prov: row.prov ?? undefined,
      telefono: row.telefono ?? undefined,
      fax: row.fax ?? undefined,
      email: row.email ?? undefined,
      partitaIva: row.partita_iva ?? undefined,
      codFiscale: row.cod_fiscale ?? undefined,
      zona: row.zona ?? undefined,
      persDaContattare: row.pers_da_contattare ?? undefined,
      emailAmministraz: row.email_amministraz ?? undefined,
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    };
  }

  close(): void {
    this.db.close();
  }
}
