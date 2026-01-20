import { EventEmitter } from "events";
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

export interface PriceSyncProgress {
  status: "idle" | "downloading" | "parsing" | "saving" | "completed" | "error";
  message: string;
  pricesProcessed: number;
  pricesInserted: number;
  pricesUpdated: number;
  pricesSkipped: number;
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

  /**
   * Pause sync service (for PriorityManager)
   */
  async pause(): Promise<void> {
    logger.info("[PriceSyncService] Pause requested");
    this.paused = true;

    if (this.syncInProgress) {
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

      // Step 3: Save with delta detection
      this.progress = {
        ...this.progress,
        status: "saving",
        message: `Salvataggio ${parsedPrices.length} prezzi...`,
      };
      this.emit("progress", this.progress);

      const saveResults = await this.savePrices(parsedPrices);

      // Step 4: Cleanup PDF
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
      };
      this.emit("progress", this.progress);

      logger.info("[PriceSyncService] Sync completed", {
        duration,
        ...saveResults,
      });
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      logger.error("[PriceSyncService] Sync failed", { error, duration });

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
    }
  }

  /**
   * Download prices PDF via bot
   * Follows Phase 18/19 bot pattern with Italian locale forcing
   */
  private async downloadPricesPDF(): Promise<string> {
    const browser = await this.browserPool.acquire("price-sync");

    try {
      const page = await browser.newPage();

      // Set Italian locale (following Phase 18/19 pattern)
      await page.setExtraHTTPHeaders({
        "Accept-Language": "it-IT,it;q=0.9",
      });

      // Navigate to products list page
      await page.goto("https://4.231.124.90/Archibald/INVENTTABLE_ListView/", {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      logger.info("[PriceSyncService] Navigated to products page");

      // Wait for page to load
      await page.waitForSelector("body", { timeout: 10000 });

      // Setup download handling
      const downloadPath = path.join("/tmp", `prezzi-${Date.now()}.pdf`);
      const client = await page.target().createCDPSession();
      await client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: "/tmp",
      });

      // Click "Esportare in PDF File" button
      // NOTE: Exact selector needs verification with real page
      // This is a placeholder - adjust based on actual page structure
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, a"));
        const pdfButton = buttons.find((btn) =>
          btn.textContent?.includes("Esportare in PDF"),
        );
        if (pdfButton) {
          (pdfButton as HTMLElement).click();
        } else {
          throw new Error("PDF export button not found");
        }
      });

      logger.info("[PriceSyncService] Clicked PDF export button");

      // Wait for download to complete (max 60s)
      const maxWait = 60000;
      const startWait = Date.now();

      while (Date.now() - startWait < maxWait) {
        const files = await fs.readdir("/tmp");
        const pdfFile = files.find(
          (f) => f.startsWith("prezzi-") && f.endsWith(".pdf"),
        );

        if (pdfFile) {
          const fullPath = path.join("/tmp", pdfFile);
          logger.info(`[PriceSyncService] PDF download complete: ${fullPath}`);
          return fullPath;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      throw new Error("PDF download timeout (60s)");
    } finally {
      await this.browserPool.release(browser);
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
      // Map ParsedPrice to Price schema
      const priceData = {
        productId: parsedPrice.product_id,
        productName: parsedPrice.product_name,
        unitPrice: parsedPrice.unit_price ?? null,
        itemSelection: parsedPrice.item_selection ?? null,
        packagingDescription: parsedPrice.packaging_description ?? null,
        currency: parsedPrice.currency ?? null,
        priceValidFrom: parsedPrice.price_valid_from ?? null,
        priceValidTo: parsedPrice.price_valid_to ?? null,
        priceUnit: parsedPrice.price_unit ?? null,
        accountDescription: parsedPrice.account_description ?? null,
        accountCode: parsedPrice.account_code ?? null,
        priceQtyFrom: parsedPrice.price_qty_from ?? null,
        priceQtyTo: parsedPrice.price_qty_to ?? null,
        lastModified: parsedPrice.last_modified ?? null,
        dataAreaId: parsedPrice.data_area_id ?? null,
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
}
