import { EventEmitter } from "events";
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
   * Follows Phase 18/19 bot pattern - uses BrowserPool and ArchibaldBot
   */
  private async downloadPricesPDF(): Promise<string> {
    // Use browser pool context (same pattern as customer/product sync)
    const syncUserId = "price-sync-service";
    const context = await this.browserPool.acquireContext(syncUserId);
    const bot = new ArchibaldBot(syncUserId);

    try {
      // Download PDF using bot with context
      const pdfPath = await this.downloadPricesPDFFromContext(context, bot);

      return pdfPath;
    } finally {
      await this.browserPool.releaseContext(syncUserId, context, true);
    }
  }

  /**
   * Download prices PDF from authenticated context
   * Same pattern as downloadProductsPDF but for PRICEDISCTABLE_ListView
   */
  private async downloadPricesPDFFromContext(
    context: any,
    bot: ArchibaldBot,
  ): Promise<string> {
    const page = await context.newPage();
    const startTime = Date.now();

    try {
      logger.info("[PriceSyncService] Starting Prices PDF download");

      // Force Italian language for PDF export
      await page.setExtraHTTPHeaders({
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      });

      // Navigate to Prices ListView page
      const pricesUrl =
        "https://4.231.124.90/Archibald/PRICEDISCTABLE_ListView/";
      await page.goto(pricesUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      logger.info("[PriceSyncService] Navigated to Prices ListView page");

      // Wait for dynamic content to load (same pattern as products/customers sync)
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Setup download handling
      const timestamp = Date.now();
      const downloadPath = `/tmp/prezzi-${timestamp}.pdf`;

      const client = await page.target().createCDPSession();
      await client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: "/tmp",
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Trigger PDF export - same button ID as products
      // Button ID: Vertical_mainMenu_Menu_DXI3_T
      logger.info("[PriceSyncService] Searching for PDF export button...");

      await page.waitForSelector("#Vertical_mainMenu_Menu_DXI3_", {
        timeout: 10000,
      });

      logger.info("[PriceSyncService] Menu container found");
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check button visibility
      const isVisible = await page.evaluate(() => {
        const li = document.querySelector("#Vertical_mainMenu_Menu_DXI3_");
        const a = document.querySelector("#Vertical_mainMenu_Menu_DXI3_T");

        if (!li || !a) return false;

        const liRect = li.getBoundingClientRect();
        const aRect = a.getBoundingClientRect();

        return (
          liRect.width > 0 &&
          liRect.height > 0 &&
          aRect.width > 0 &&
          aRect.height > 0
        );
      });

      logger.info(`[PriceSyncService] Button visibility: ${isVisible}`);

      if (!isVisible) {
        logger.info(
          "[PriceSyncService] Button not visible, checking parent menu...",
        );

        try {
          await page.hover("a.dxm-content");
          logger.info("[PriceSyncService] Hovered on parent menu");
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          logger.warn(
            "[PriceSyncService] Could not hover on parent menu, proceeding anyway",
          );
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Setup download promise before clicking
      const downloadComplete = new Promise<void>((resolve, reject) => {
        const fs = require("fs");
        const timeout = setTimeout(() => {
          reject(
            new Error(
              "PDF download timeout (120s exceeded). Archibald may be generating PDF.",
            ),
          );
        }, 120000);

        // Poll for file creation
        const checkFile = setInterval(() => {
          // Look for "Tabella prezzi.pdf" (Italian) or "Price table.pdf" (English) - Archibald's default names
          const files = fs.readdirSync("/tmp");
          const pdfFiles = files.filter(
            (f: string) =>
              f === "Tabella prezzi.pdf" ||
              f === "Price table.pdf" ||
              (f.startsWith("prezzi-") && f.endsWith(".pdf")),
          );

          if (pdfFiles.length > 0) {
            // Find the most recent one (prefer "Tabella prezzi.pdf" if it exists)
            const recentPdf =
              pdfFiles.find((f: string) => f === "Tabella prezzi.pdf") ||
              pdfFiles.find((f: string) => f === "Price table.pdf") ||
              pdfFiles[pdfFiles.length - 1];
            const tempPath = `/tmp/${recentPdf}`;

            // Rename to our expected path
            fs.renameSync(tempPath, downloadPath);

            clearTimeout(timeout);
            clearInterval(checkFile);
            resolve();
          }
        }, 500);
      });

      // Click PDF export button
      await page.click("#Vertical_mainMenu_Menu_DXI3_T");
      logger.info("[PriceSyncService] Clicked PDF export button");

      // Wait for download to complete
      await downloadComplete;

      const duration = Date.now() - startTime;
      logger.info(
        `[PriceSyncService] PDF download complete in ${duration}ms: ${downloadPath}`,
      );

      return downloadPath;
    } catch (error) {
      logger.error("[PriceSyncService] PDF download failed", { error });
      throw error;
    } finally {
      await page.close();
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
}
