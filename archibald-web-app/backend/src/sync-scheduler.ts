import { logger } from "./logger";
import { customerSyncService } from "./customer-sync-service";
import { productSyncService } from "./product-sync-service";
import { priceSyncService } from "./price-sync-service";
import { productDb } from "./product-db";
import crypto from "crypto";

/**
 * Sync priority order (from user requirement):
 * 1. Customers (highest priority - contatti, indirizzi cambiano spesso)
 * 2. Orders (ordini nuovi/aggiornati)
 * 3. Products (catalogo articoli)
 * 4. Prices (prezzi e sconti)
 */

export interface SyncSchedule {
  customers: { fullEvery: number; deltaEvery: number }; // hours
  orders: { fullEvery: number; deltaEvery: number };
  products: { fullEvery: number; deltaEvery: number };
  prices: { fullEvery: number; deltaEvery: number };
}

// Optimal configuration based on priority
const SCHEDULE: SyncSchedule = {
  customers: {
    fullEvery: 24, // Full: giornaliero (HIGHEST priority)
    deltaEvery: 0.5, // Delta: ogni 30 minuti (frequente!)
  },
  orders: {
    fullEvery: 12, // Full: 2 volte al giorno
    deltaEvery: 1, // Delta: ogni ora
  },
  products: {
    fullEvery: 24, // Full: giornaliero
    deltaEvery: 2, // Delta: ogni 2 ore
  },
  prices: {
    fullEvery: 24, // Full: giornaliero
    deltaEvery: 3, // Delta: ogni 3 ore (lowest priority per user)
  },
};

export interface SyncProgress {
  syncType: "customers" | "orders" | "products" | "prices";
  mode: "full" | "delta" | "manual" | "forced";
  status: "running" | "completed" | "error";
  currentPage?: number;
  totalPages?: number;
  itemsProcessed: number;
  itemsChanged: number;
  percentage: number;
  startedAt: number;
  estimatedCompletion?: number;
  error?: string;
}

type SyncProgressCallback = (progress: SyncProgress) => void;

export class SyncScheduler {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private progressCallbacks: Set<SyncProgressCallback> = new Set();

  async start() {
    if (this.isRunning) {
      logger.warn("Sync Scheduler already running");
      return;
    }

    this.isRunning = true;
    logger.info("🔄 Sync Scheduler avviato", { schedule: SCHEDULE });

    // Schedule all sync types in priority order
    this.scheduleSync("customers", SCHEDULE.customers);
    this.scheduleSync("orders", SCHEDULE.orders);
    this.scheduleSync("products", SCHEDULE.products);
    this.scheduleSync("prices", SCHEDULE.prices);

    // Initial delta sync after 30 seconds (staggered start)
    setTimeout(() => this.runDeltaSync("customers"), 5000);
    setTimeout(() => this.runDeltaSync("orders"), 15000);
    setTimeout(() => this.runDeltaSync("products"), 25000);
    setTimeout(() => this.runDeltaSync("prices"), 35000);
  }

  private scheduleSync(
    type: "customers" | "orders" | "products" | "prices",
    config: { fullEvery: number; deltaEvery: number },
  ) {
    // Full sync timer
    const fullInterval = config.fullEvery * 60 * 60 * 1000;
    const fullTimer = setInterval(async () => {
      logger.info(`🔄 Scheduled FULL sync: ${type}`);
      await this.runFullSync(type, "scheduler");
    }, fullInterval);

    // Delta sync timer
    const deltaInterval = config.deltaEvery * 60 * 60 * 1000;
    const deltaTimer = setInterval(async () => {
      logger.info(`🔄 Scheduled DELTA sync: ${type}`);
      await this.runDeltaSync(type);
    }, deltaInterval);

    this.timers.set(`${type}-full`, fullTimer);
    this.timers.set(`${type}-delta`, deltaTimer);

    logger.debug(`Scheduled ${type}:`, {
      fullEvery: `${config.fullEvery}h`,
      deltaEvery: `${config.deltaEvery}h`,
    });
  }

  /**
   * Register callback for sync progress updates
   */
  onProgress(callback: SyncProgressCallback) {
    this.progressCallbacks.add(callback);
  }

  offProgress(callback: SyncProgressCallback) {
    this.progressCallbacks.delete(callback);
  }

  private notifyProgress(progress: SyncProgress) {
    this.progressCallbacks.forEach((cb) => cb(progress));
  }

  /**
   * Run FULL sync (scrape everything from Archibald)
   */
  async runFullSync(
    type: "customers" | "orders" | "products" | "prices",
    triggeredBy: "scheduler" | "admin" | "api" = "scheduler",
    userId?: string,
  ): Promise<void> {
    const eventId = await this.logSyncStart(type, "full", triggeredBy, userId);

    try {
      // Check if sync already running
      if (await this.isSyncInProgress(type)) {
        logger.warn(`Full sync ${type} already in progress, skipping`);
        return;
      }

      await this.markSyncInProgress(type, true);

      const startTime = Date.now();
      let itemsProcessed = 0;

      // Progress callback wrapper
      const progressCallback = (current: number, total: number) => {
        itemsProcessed = current;
        this.notifyProgress({
          syncType: type,
          mode: "full",
          status: "running",
          currentPage: current,
          totalPages: total,
          itemsProcessed: current,
          itemsChanged: 0,
          percentage: total > 0 ? Math.round((current / total) * 100) : 0,
          startedAt: startTime,
        });
      };

      // Execute sync based on type
      // Note: Sync services emit progress events, no callback needed
      switch (type) {
        case "customers":
          await customerSyncService.syncCustomers();
          break;
        case "products":
          await productSyncService.syncProducts();
          break;
        case "prices":
          await priceSyncService.syncPrices();
          break;
        case "orders":
          // Orders sync not yet implemented (future)
          logger.info("Orders sync not yet implemented");
          break;
      }

      const duration = Date.now() - startTime;
      await this.updateSyncMetadata(type, "full");
      await this.logSyncComplete(eventId, duration, itemsProcessed, 0);

      logger.info(`✅ Full sync completed: ${type}`, {
        durationMs: duration,
        itemsProcessed,
      });

      this.notifyProgress({
        syncType: type,
        mode: "full",
        status: "completed",
        itemsProcessed,
        itemsChanged: 0,
        percentage: 100,
        startedAt: startTime,
      });
    } catch (error: any) {
      logger.error(`❌ Full sync failed: ${type}`, { error });
      await this.logSyncError(eventId, error.message);
      await this.incrementErrorCount(type);

      this.notifyProgress({
        syncType: type,
        mode: "full",
        status: "error",
        itemsProcessed: 0,
        itemsChanged: 0,
        percentage: 0,
        startedAt: Date.now(),
        error: error.message,
      });
    } finally {
      await this.markSyncInProgress(type, false);
    }
  }

  /**
   * Run DELTA sync (check for changes only)
   */
  async runDeltaSync(
    type: "customers" | "orders" | "products" | "prices",
  ): Promise<void> {
    const eventId = await this.logSyncStart(type, "delta", "scheduler");

    try {
      if (await this.isSyncInProgress(type)) {
        logger.debug(`Delta sync ${type} skipped (sync in progress)`);
        return;
      }

      await this.markSyncInProgress(type, true);

      const startTime = Date.now();
      const oldHash = await this.getContentHash(type);

      // Quick check: scrape first page only and compare hash
      let newHash: string;
      switch (type) {
        case "prices":
          newHash = await priceSyncService.getQuickHash();
          break;
        case "products":
          newHash = await productSyncService.getQuickHash();
          break;
        case "customers":
          newHash = await customerSyncService.getQuickHash();
          break;
        default:
          newHash = oldHash; // Orders not implemented yet
      }

      if (oldHash === newHash) {
        logger.debug(`✅ Delta sync: no changes detected in ${type}`);
        await this.updateSyncMetadata(type, "delta");
        await this.logSyncComplete(eventId, Date.now() - startTime, 0, 0);
        return;
      }

      // Changes detected! Trigger full sync
      logger.info(
        `🔄 Delta sync detected changes in ${type}, triggering full sync`,
      );
      await this.markSyncInProgress(type, false); // Release lock
      await this.runFullSync(type, "scheduler");

      await this.logSyncComplete(eventId, Date.now() - startTime, 0, 1);
    } catch (error: any) {
      logger.error(`❌ Delta sync failed: ${type}`, { error });
      await this.logSyncError(eventId, error.message);
    } finally {
      await this.markSyncInProgress(type, false);
    }
  }

  /**
   * Manual sync (triggered by user/admin)
   */
  async runManualSync(
    type: "customers" | "orders" | "products" | "prices",
    userId?: string,
  ): Promise<void> {
    logger.info(`🔄 Manual sync triggered: ${type}`, { userId });
    await this.runFullSync(type, "admin", userId);
  }

  /**
   * Forced sync (delete DB + full rescrape)
   */
  async runForcedSync(
    type: "customers" | "orders" | "products" | "prices",
    userId: string,
  ): Promise<void> {
    logger.warn(`⚠️  FORCED sync triggered: ${type}`, { userId });

    const eventId = await this.logSyncStart(type, "forced", "admin", userId);

    try {
      // Delete all records for this type
      switch (type) {
        case "customers":
          productDb.run("DELETE FROM customers");
          logger.info("🗑️  Deleted all customers from DB");
          break;
        case "products":
          productDb.run("DELETE FROM products");
          logger.info("🗑️  Deleted all products from DB");
          break;
        case "prices":
          productDb.run("UPDATE products SET price = NULL, vat = NULL");
          logger.info("🗑️  Cleared all prices from DB");
          break;
        case "orders":
          logger.info("Orders DB deletion not implemented");
          break;
      }

      // Reset sync metadata
      await this.resetSyncMetadata(type);

      // Run full sync
      await this.runFullSync(type, "admin", userId);

      await this.logSyncComplete(eventId, 0, 0, 0);
    } catch (error: any) {
      logger.error(`❌ Forced sync failed: ${type}`, { error });
      await this.logSyncError(eventId, error.message);
      throw error;
    }
  }

  /**
   * Get current sync status for all types
   */
  async getSyncStatus(): Promise<Record<string, any>> {
    const types = ["customers", "orders", "products", "prices"];
    const status: Record<string, any> = {};

    for (const type of types) {
      const metadata = productDb.get(
        "SELECT * FROM sync_metadata WHERE key = ?",
        [type],
      );
      status[type] = metadata || null;
    }

    return status;
  }

  // ========== HELPER METHODS ==========

  private async isSyncInProgress(type: string): Promise<boolean> {
    const result = productDb.get(
      "SELECT sync_in_progress FROM sync_metadata WHERE key = ?",
      [type],
    ) as { sync_in_progress: number } | undefined;

    return result?.sync_in_progress === 1;
  }

  private async markSyncInProgress(
    type: string,
    inProgress: boolean,
  ): Promise<void> {
    productDb.run(
      "UPDATE sync_metadata SET sync_in_progress = ? WHERE key = ?",
      [inProgress ? 1 : 0, type],
    );
  }

  private async updateSyncMetadata(
    type: string,
    syncType: "full" | "delta",
  ): Promise<void> {
    const now = Date.now();
    const version = await this.incrementVersion(type);
    const hash = await this.computeContentHash(type);

    const column = syncType === "full" ? "last_full_sync" : "last_delta_sync";

    productDb.run(
      `UPDATE sync_metadata
       SET version = ?, ${column} = ?, content_hash = ?, consecutive_errors = 0
       WHERE key = ?`,
      [version, now, hash, type],
    );
  }

  private async resetSyncMetadata(type: string): Promise<void> {
    productDb.run(
      `UPDATE sync_metadata
       SET version = 0, last_full_sync = NULL, last_delta_sync = NULL,
           total_records = 0, content_hash = NULL, consecutive_errors = 0
       WHERE key = ?`,
      [type],
    );
  }

  private async incrementVersion(type: string): Promise<number> {
    const result = productDb.get(
      "SELECT version FROM sync_metadata WHERE key = ?",
      [type],
    ) as { version: number } | undefined;

    const newVersion = (result?.version || 0) + 1;
    return newVersion;
  }

  private async incrementErrorCount(type: string): Promise<void> {
    productDb.run(
      `UPDATE sync_metadata
       SET consecutive_errors = consecutive_errors + 1,
           last_error_at = ?,
           last_error = ?
       WHERE key = ?`,
      [Date.now(), "Sync failed", type],
    );
  }

  private async computeContentHash(type: string): Promise<string> {
    let data: string;

    switch (type) {
      case "products":
        const products = productDb.all(
          "SELECT id, name, price FROM products ORDER BY id",
        );
        data = JSON.stringify(products);
        break;
      case "customers":
        const customers = productDb.all(
          "SELECT id, name, code FROM customers ORDER BY id",
        );
        data = JSON.stringify(customers);
        break;
      case "prices":
        const prices = productDb.all(
          "SELECT id, price, vat FROM products WHERE price IS NOT NULL ORDER BY id",
        );
        data = JSON.stringify(prices);
        break;
      default:
        data = "";
    }

    return crypto.createHash("md5").update(data).digest("hex");
  }

  private async getContentHash(type: string): Promise<string> {
    const result = productDb.get(
      "SELECT content_hash FROM sync_metadata WHERE key = ?",
      [type],
    ) as { content_hash: string } | undefined;

    return result?.content_hash || "";
  }

  private async logSyncStart(
    syncType: string,
    syncMode: "full" | "delta" | "forced",
    triggeredBy: "scheduler" | "admin" | "api",
    userId?: string,
  ): Promise<number> {
    const result = productDb.run(
      `INSERT INTO sync_events
       (sync_type, event_type, sync_mode, triggered_by, user_id, started_at)
       VALUES (?, 'start', ?, ?, ?, ?)`,
      [syncType, syncMode, triggeredBy, userId || null, Date.now()],
    );

    return result.lastInsertRowid as number;
  }

  private async logSyncComplete(
    eventId: number,
    durationMs: number,
    recordsProcessed: number,
    recordsChanged: number,
  ): Promise<void> {
    productDb.run(
      `UPDATE sync_events
       SET event_type = 'complete', completed_at = ?, duration_ms = ?,
           records_processed = ?, records_changed = ?
       WHERE id = ?`,
      [Date.now(), durationMs, recordsProcessed, recordsChanged, eventId],
    );
  }

  private async logSyncError(
    eventId: number,
    errorMessage: string,
  ): Promise<void> {
    productDb.run(
      `UPDATE sync_events
       SET event_type = 'error', completed_at = ?, error_message = ?
       WHERE id = ?`,
      [Date.now(), errorMessage, eventId],
    );
  }

  stop() {
    this.timers.forEach((timer) => clearInterval(timer));
    this.timers.clear();
    this.isRunning = false;
    this.progressCallbacks.clear();
    logger.info("🛑 Sync Scheduler fermato");
  }
}

export const syncScheduler = new SyncScheduler();
