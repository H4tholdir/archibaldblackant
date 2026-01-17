import Database from "better-sqlite3";
import path from "path";
import { logger } from "./logger";

export interface SyncCheckpoint {
  syncType: "customers" | "products" | "prices";
  status: "in_progress" | "completed" | "failed";
  currentPage: number;
  totalPages: number;
  itemsProcessed: number;
  lastSuccessfulPage: number;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
}

export class SyncCheckpointManager {
  private db: Database.Database;
  private static instance: SyncCheckpointManager;

  constructor(dbPath?: string) {
    const finalPath =
      dbPath || path.join(__dirname, "../data/sync-checkpoints.db");
    this.db = new Database(finalPath);
    this.initializeSchema();
  }

  static getInstance(): SyncCheckpointManager {
    if (!SyncCheckpointManager.instance) {
      SyncCheckpointManager.instance = new SyncCheckpointManager();
    }
    return SyncCheckpointManager.instance;
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_checkpoints (
        syncType TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        currentPage INTEGER NOT NULL DEFAULT 0,
        totalPages INTEGER NOT NULL DEFAULT 0,
        itemsProcessed INTEGER NOT NULL DEFAULT 0,
        lastSuccessfulPage INTEGER NOT NULL DEFAULT 0,
        startedAt INTEGER NOT NULL,
        completedAt INTEGER,
        error TEXT,
        updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_status ON sync_checkpoints(status);
      CREATE INDEX IF NOT EXISTS idx_startedAt ON sync_checkpoints(startedAt);
    `);

    logger.info("Sync checkpoint database initialized");
  }

  /**
   * Crea o aggiorna un checkpoint per una sync
   */
  saveCheckpoint(checkpoint: SyncCheckpoint): void {
    const stmt = this.db.prepare(`
      INSERT INTO sync_checkpoints (
        syncType, status, currentPage, totalPages, itemsProcessed,
        lastSuccessfulPage, startedAt, completedAt, error, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
      ON CONFLICT(syncType) DO UPDATE SET
        status = excluded.status,
        currentPage = excluded.currentPage,
        totalPages = excluded.totalPages,
        itemsProcessed = excluded.itemsProcessed,
        lastSuccessfulPage = excluded.lastSuccessfulPage,
        completedAt = excluded.completedAt,
        error = excluded.error,
        updatedAt = strftime('%s', 'now')
    `);

    stmt.run(
      checkpoint.syncType,
      checkpoint.status,
      checkpoint.currentPage,
      checkpoint.totalPages,
      checkpoint.itemsProcessed,
      checkpoint.lastSuccessfulPage,
      checkpoint.startedAt,
      checkpoint.completedAt,
      checkpoint.error,
    );

    logger.debug(`Checkpoint salvato per ${checkpoint.syncType}`, {
      currentPage: checkpoint.currentPage,
      lastSuccessfulPage: checkpoint.lastSuccessfulPage,
      status: checkpoint.status,
    });
  }

  /**
   * Recupera l'ultimo checkpoint per un tipo di sync
   */
  getCheckpoint(
    syncType: "customers" | "products" | "prices",
  ): SyncCheckpoint | null {
    const stmt = this.db.prepare(
      "SELECT * FROM sync_checkpoints WHERE syncType = ?",
    );
    const row = stmt.get(syncType) as SyncCheckpoint | undefined;
    return row || null;
  }

  /**
   * Determina da quale pagina riprendere la sync
   * - Se sync completata: riparte da pagina 1 (re-sync completo)
   * - Se sync in_progress o failed: riprende da lastSuccessfulPage + 1
   */
  getResumePoint(syncType: "customers" | "products" | "prices"): number {
    const checkpoint = this.getCheckpoint(syncType);

    if (!checkpoint) {
      logger.info(
        `Nessun checkpoint trovato per ${syncType}, inizio da pagina 1`,
      );
      return 1;
    }

    // Se l'ultima sync è completata, verifichiamo se è recente (< 24 ore)
    if (checkpoint.status === "completed") {
      const now = Date.now();
      const completedAt = checkpoint.completedAt || checkpoint.startedAt;
      const ageHours = (now - completedAt) / (1000 * 60 * 60);

      // Se la sync è molto recente (< 1 ora), skippa
      if (ageHours < 1) {
        logger.info(
          `Sync ${syncType} completata ${Math.round(ageHours * 60)} minuti fa, skip`,
        );
        return -1; // Segnale per saltare la sync
      }

      // Se la sync è recente (< 24 ore), skippa
      if (ageHours < 24) {
        logger.info(
          `Sync ${syncType} completata ${Math.round(ageHours)} ore fa, skip (threshold 24h)`,
        );
        return -1; // Segnale per saltare la sync
      }

      // Altrimenti re-sync completo (>= 24 ore)
      logger.info(
        `Sync ${syncType} completata ${Math.round(ageHours)} ore fa, re-sync completo da pagina 1`,
      );
      return 1;
    }

    // Se la sync è in_progress o failed, riprendi dall'ultima pagina salvata
    const resumePage = checkpoint.lastSuccessfulPage + 1;
    logger.info(
      `Sync ${syncType} ${checkpoint.status}, ripresa da pagina ${resumePage} (ultima salvata: ${checkpoint.lastSuccessfulPage})`,
    );
    return resumePage;
  }

  /**
   * Segna una sync come iniziata
   */
  startSync(syncType: "customers" | "products" | "prices"): void {
    const checkpoint: SyncCheckpoint = {
      syncType,
      status: "in_progress",
      currentPage: 0,
      totalPages: 0,
      itemsProcessed: 0,
      lastSuccessfulPage: 0,
      startedAt: Date.now(),
      completedAt: null,
      error: null,
    };

    this.saveCheckpoint(checkpoint);
  }

  /**
   * Aggiorna il progresso della sync (chiamato dopo ogni pagina completata)
   */
  updateProgress(
    syncType: "customers" | "products" | "prices",
    currentPage: number,
    totalPages: number,
    itemsProcessed: number,
  ): void {
    const checkpoint = this.getCheckpoint(syncType);

    if (!checkpoint) {
      logger.warn(
        `Tentativo di aggiornare checkpoint inesistente per ${syncType}`,
      );
      return;
    }

    checkpoint.status = "in_progress";
    checkpoint.currentPage = currentPage;
    checkpoint.totalPages = totalPages;
    checkpoint.itemsProcessed = itemsProcessed;
    checkpoint.lastSuccessfulPage = currentPage; // Aggiorna l'ultima pagina completata
    checkpoint.error = null;

    this.saveCheckpoint(checkpoint);
  }

  /**
   * Segna una sync come completata
   */
  completeSync(
    syncType: "customers" | "products" | "prices",
    totalPages: number,
    itemsProcessed: number,
  ): void {
    const checkpoint = this.getCheckpoint(syncType);

    if (!checkpoint) {
      logger.warn(
        `Tentativo di completare checkpoint inesistente per ${syncType}`,
      );
      return;
    }

    checkpoint.status = "completed";
    checkpoint.currentPage = totalPages;
    checkpoint.totalPages = totalPages;
    checkpoint.itemsProcessed = itemsProcessed;
    checkpoint.lastSuccessfulPage = totalPages;
    checkpoint.completedAt = Date.now();
    checkpoint.error = null;

    this.saveCheckpoint(checkpoint);
    logger.info(`✅ Checkpoint completato per ${syncType}`, {
      totalPages,
      itemsProcessed,
      duration: checkpoint.completedAt - checkpoint.startedAt,
    });
  }

  /**
   * Segna una sync come fallita
   */
  failSync(
    syncType: "customers" | "products" | "prices",
    error: string,
    currentPage: number,
  ): void {
    const checkpoint = this.getCheckpoint(syncType);

    if (!checkpoint) {
      logger.warn(
        `Tentativo di fallire checkpoint inesistente per ${syncType}`,
      );
      return;
    }

    checkpoint.status = "failed";
    checkpoint.currentPage = currentPage;
    checkpoint.error = error;
    checkpoint.completedAt = Date.now();

    this.saveCheckpoint(checkpoint);
    logger.error(`❌ Checkpoint fallito per ${syncType}`, {
      error,
      currentPage,
      lastSuccessfulPage: checkpoint.lastSuccessfulPage,
    });
  }

  /**
   * Ottieni statistiche su tutte le sync
   */
  getSyncStats(): {
    customers: SyncCheckpoint | null;
    products: SyncCheckpoint | null;
    prices: SyncCheckpoint | null;
  } {
    return {
      customers: this.getCheckpoint("customers"),
      products: this.getCheckpoint("products"),
      prices: this.getCheckpoint("prices"),
    };
  }

  /**
   * Reset checkpoint per un tipo di sync (forza re-sync completo)
   */
  resetCheckpoint(syncType: "customers" | "products" | "prices"): void {
    const stmt = this.db.prepare(
      "DELETE FROM sync_checkpoints WHERE syncType = ?",
    );
    stmt.run(syncType);
    logger.info(`🔄 Checkpoint resettato per ${syncType}`);
  }

  /**
   * Chiude la connessione al database
   */
  close(): void {
    this.db.close();
  }
}
