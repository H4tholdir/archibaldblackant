import { EventEmitter } from "events";
import type { BrowserContext } from "puppeteer";
import { ArchibaldBot } from "./archibald-bot";
import { BrowserPool } from "./browser-pool";
import { logger } from "./logger";
import { SyncCheckpointManager } from "./sync-checkpoint";
import {
  PDFParserPricesService,
  ParsedPrice,
} from "./pdf-parser-prices-service";
import { PriceDatabase } from "./price-db";
import * as fs from "fs/promises";
import * as path from "path";
import { SyncStopError, isSyncStopError } from "./sync-stop";

export interface PriceSyncProgress {
  status:
    | "idle"
    | "downloading"
    | "parsing"
    | "saving"
    | "matching"
    | "completed"
    | "error";
  message: string;
  pricesProcessed: number;
  pricesInserted: number;
  pricesUpdated: number;
  pricesSkipped: number;
  matchedProducts?: number;
  unmatchedPrices?: number;
  error?: string;
}

/**
 * Price Sync Service - PDF-based sync
 * Follows Phase 18/19 pattern: bot download → PDF parse → delta save
 */
export class PriceSyncService extends EventEmitter {
  private static instance: PriceSyncService;
  private browserPool: BrowserPool;
  private pdfParser: PDFParserPricesService;
  private priceDb: PriceDatabase;
  private checkpointManager: SyncCheckpointManager;
  private syncInProgress = false;
  private paused = false;
  private stopRequested = false;
  private activeContext: BrowserContext | null = null;
  private activeUserId: string | null = null;
  private progress: PriceSyncProgress = {
    status: "idle",
    message: "Nessuna sincronizzazione prezzi in corso",
    pricesProcessed: 0,
    pricesInserted: 0,
    pricesUpdated: 0,
    pricesSkipped: 0,
  };

  private constructor() {
    super();
    this.browserPool = BrowserPool.getInstance();
    this.pdfParser = PDFParserPricesService.getInstance();
    this.priceDb = PriceDatabase.getInstance();
    this.checkpointManager = SyncCheckpointManager.getInstance();
  }

  static getInstance(): PriceSyncService {
    if (!PriceSyncService.instance) {
      PriceSyncService.instance = new PriceSyncService();
    }
    return PriceSyncService.instance;
  }

  private throwIfStopRequested(stage: string): void {
    if (this.stopRequested) {
      throw new SyncStopError(
        `[PriceSyncService] Stop requested during ${stage}`,
      );
    }
  }

  private async releaseActiveContext(
    success: boolean,
    reason: string,
  ): Promise<void> {
    if (!this.activeContext || !this.activeUserId) {
      return;
    }

    const context = this.activeContext;
    const userId = this.activeUserId;
    this.activeContext = null;
    this.activeUserId = null;

    try {
      await this.browserPool.releaseContext(userId, context, success);
    } catch (error) {
      logger.warn("[PriceSyncService] Failed to release context", {
        reason,
        userId,
        error,
      });
    }
  }

  private async abortActiveContext(reason: string): Promise<void> {
    if (!this.activeContext || !this.activeUserId) {
      return;
    }

    const userId = this.activeUserId;
    logger.warn("[PriceSyncService] Aborting active context", {
      reason,
      userId,
    });
    await this.releaseActiveContext(false, reason);
  }

  /**
   * Pause sync service (for PriorityManager)
   */
  async pause(): Promise<void> {
    logger.info("[PriceSyncService] Pause requested");
    this.paused = true;

    if (this.syncInProgress) {
      this.requestStop();
      logger.info("[PriceSyncService] Waiting for current sync to complete...");
      while (this.syncInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info("[PriceSyncService] Paused");
  }

  /**
   * Resume sync service
   */
  resume(): void {
    logger.info("[PriceSyncService] Resumed");
    this.paused = false;
  }

  /**
   * Get current sync progress
   */
  getProgress(): PriceSyncProgress {
    return { ...this.progress };
  }

  /**
   * Main sync method: Download PDF → Parse → Save with delta detection
   * Follows Phase 18/19 pattern
   */
  async syncPrices(): Promise<void> {
    if (this.syncInProgress) {
      throw new Error("Sync already in progress");
    }

    if (this.paused) {
      throw new Error("Sync service is paused");
    }

    this.syncInProgress = true;
    this.stopRequested = false;
    const startTime = Date.now();

    try {
      // Reset progress
      this.progress = {
        status: "downloading",
        message: "Scaricamento PDF prezzi da Archibald...",
        pricesProcessed: 0,
        pricesInserted: 0,
        pricesUpdated: 0,
        pricesSkipped: 0,
      };
      this.emit("progress", this.progress);

      // Step 1: Download PDF via bot
      const pdfPath = await this.downloadPricesPDF();
      logger.info(`[PriceSyncService] PDF downloaded to ${pdfPath}`);
      this.throwIfStopRequested("download");

      // Step 2: Parse PDF
      this.progress = {
        ...this.progress,
        status: "parsing",
        message: "Estrazione dati PDF...",
      };
      this.emit("progress", this.progress);

      const parsedPrices = await this.pdfParser.parsePDF(pdfPath);
      logger.info(
        `[PriceSyncService] Parsed ${parsedPrices.length} prices from PDF`,
      );
      this.throwIfStopRequested("parse");

      // Step 3: Save with delta detection
      this.progress = {
        ...this.progress,
        status: "saving",
        message: `Salvataggio ${parsedPrices.length} prezzi...`,
      };
      this.emit("progress", this.progress);

      const saveResults = await this.savePrices(parsedPrices);
      this.throwIfStopRequested("saving");

      // Step 4: Auto-match prices to products
      this.progress = {
        ...this.progress,
        status: "matching",
        message: "Matching prezzi a prodotti...",
      };
      this.emit("progress", this.progress);

      const { PriceMatchingService } = await import("./price-matching-service");
      const matchingService = PriceMatchingService.getInstance();
      const matchingResults = await matchingService.matchPricesToProducts();
      this.throwIfStopRequested("matching");

      logger.info("[PriceSyncService] Price matching completed", {
        matchedProducts: matchingResults.result.matchedProducts,
        unmatchedPrices: matchingResults.result.unmatchedPrices,
      });

      // Step 5: Cleanup PDF
      await fs.unlink(pdfPath).catch((err) => {
        logger.warn(`[PriceSyncService] Failed to delete PDF ${pdfPath}:`, err);
      });

      // Complete
      const duration = Math.floor((Date.now() - startTime) / 1000);
      this.progress = {
        ...this.progress,
        status: "completed",
        message: `✓ Sync completato in ${duration}s`,
        ...saveResults,
        matchedProducts: matchingResults.result.matchedProducts,
        unmatchedPrices: matchingResults.result.unmatchedPrices,
      };
      this.emit("progress", this.progress);

      logger.info("[PriceSyncService] Sync completed", {
        duration,
        ...saveResults,
        matching: matchingResults.result,
      });
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      if (isSyncStopError(error)) {
        logger.warn("[PriceSyncService] Sync stopped", {
          error: error.message,
          duration,
        });
      } else {
        logger.error("[PriceSyncService] Sync failed", { error, duration });
      }

      this.progress = {
        ...this.progress,
        status: "error",
        message: `❌ Errore sync: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
      this.emit("progress", this.progress);

      throw error;
    } finally {
      this.syncInProgress = false;
      this.stopRequested = false;
    }
  }

  private async downloadPricesPDF(): Promise<string> {
    const syncUserId = "price-sync-service";
    const context = await this.browserPool.acquireContext(syncUserId);
    this.activeContext = context;
    this.activeUserId = syncUserId;
    this.throwIfStopRequested("login");
    const bot = new ArchibaldBot(syncUserId);
    let success = false;

    try {
      const pdfPath = await bot.downloadPricesPDF(context);
      success = true;
      return pdfPath;
    } finally {
      await this.releaseActiveContext(success, "download-prices-pdf");
    }
  }

  /**
   * Save prices to database with delta detection
   * Returns statistics: inserted, updated, skipped
   */
  private async savePrices(parsedPrices: ParsedPrice[]): Promise<{
    pricesProcessed: number;
    pricesInserted: number;
    pricesUpdated: number;
    pricesSkipped: number;
  }> {
    const now = Math.floor(Date.now() / 1000);
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const parsedPrice of parsedPrices) {
      this.throwIfStopRequested("saving");
      // Map ParsedPrice to Price schema
      // Python parser uses Italian field names from PDF columns
      const priceData = {
        productId: (parsedPrice as any).id, // Python: 'id'
        productName: (parsedPrice as any).item_description ?? "", // Python: 'item_description'
        unitPrice: (parsedPrice as any).importo_unitario ?? null, // Python: 'importo_unitario'
        itemSelection: parsedPrice.item_selection ?? null,
        packagingDescription: null, // Not in PDF
        currency: (parsedPrice as any).valuta ?? null, // Python: 'valuta'
        priceValidFrom: (parsedPrice as any).da_data ?? null, // Python: 'da_data'
        priceValidTo: (parsedPrice as any).data ?? null, // Python: 'data'
        priceUnit: (parsedPrice as any).unita_di_prezzo ?? null, // Python: 'unita_di_prezzo'
        accountDescription: (parsedPrice as any).descrizione_account ?? null, // Python: 'descrizione_account'
        accountCode: (parsedPrice as any).account ?? null, // Python: 'account'
        priceQtyFrom: (parsedPrice as any).quantita_p2
          ? parseInt((parsedPrice as any).quantita_p2)
          : null, // Python: 'quantita_p2'
        priceQtyTo: (parsedPrice as any).quantita_p3
          ? parseInt((parsedPrice as any).quantita_p3)
          : null, // Python: 'quantita_p3'
        lastModified: null, // Not in PDF
        dataAreaId: null, // Not in PDF
        lastSync: now,
      };

      // Upsert with delta detection
      const result = this.priceDb.upsertPrice(priceData);

      if (result === "inserted") inserted++;
      else if (result === "updated") updated++;
      else if (result === "skipped") skipped++;
    }

    return {
      pricesProcessed: parsedPrices.length,
      pricesInserted: inserted,
      pricesUpdated: updated,
      pricesSkipped: skipped,
    };
  }

  requestStop(): void {
    logger.warn("[PriceSyncService] Stop requested");
    this.stopRequested = true;
    if (this.syncInProgress) {
      void this.abortActiveContext("stop-requested");
    }
  }
}
