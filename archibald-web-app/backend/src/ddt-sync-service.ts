import { EventEmitter } from "events";
import { ArchibaldBot } from "./archibald-bot";
import { BrowserPool } from "./browser-pool";
import { logger } from "./logger";
import { PDFParserDDTService, ParsedDDT } from "./pdf-parser-ddt-service";
import { OrderDatabaseNew } from "./order-db-new";
import * as fs from "fs/promises";

export interface DDTSyncProgress {
  status: "idle" | "downloading" | "parsing" | "saving" | "completed" | "error";
  message: string;
  ddtProcessed: number;
  ddtInserted: number;
  ddtUpdated: number;
  ddtSkipped: number;
  error?: string;
}

export class DDTSyncService extends EventEmitter {
  private static instance: DDTSyncService;
  private browserPool: BrowserPool;
  private pdfParser: PDFParserDDTService;
  private orderDb: OrderDatabaseNew;
  private syncInProgress = false;
  private paused = false;
  private progress: DDTSyncProgress = {
    status: "idle",
    message: "Nessuna sincronizzazione DDT in corso",
    ddtProcessed: 0,
    ddtInserted: 0,
    ddtUpdated: 0,
    ddtSkipped: 0,
  };

  private constructor() {
    super();
    this.browserPool = BrowserPool.getInstance();
    this.pdfParser = PDFParserDDTService.getInstance();
    this.orderDb = OrderDatabaseNew.getInstance();
  }

  static getInstance(): DDTSyncService {
    if (!DDTSyncService.instance) {
      DDTSyncService.instance = new DDTSyncService();
    }
    return DDTSyncService.instance;
  }

  async pause(): Promise<void> {
    logger.info("[DDTSyncService] Pause requested");
    this.paused = true;

    if (this.syncInProgress) {
      logger.info("[DDTSyncService] Waiting for current sync to complete...");
      while (this.syncInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info("[DDTSyncService] Paused");
  }

  resume(): void {
    logger.info("[DDTSyncService] Resumed");
    this.paused = false;
  }

  getProgress(): DDTSyncProgress {
    return { ...this.progress };
  }

  async syncDDT(userId: string): Promise<void> {
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
        message: "Scaricamento PDF DDT da Archibald...",
        ddtProcessed: 0,
        ddtInserted: 0,
        ddtUpdated: 0,
        ddtSkipped: 0,
      };
      this.emit("progress", this.progress);

      // Step 1: Download PDF via bot
      const pdfPath = await this.downloadDDTPDF(userId);
      logger.info(`[DDTSyncService] PDF downloaded to ${pdfPath}`);

      // Step 2: Parse PDF
      this.progress = {
        ...this.progress,
        status: "parsing",
        message: "Estrazione dati PDF...",
      };
      this.emit("progress", this.progress);

      const parsedDDTs = await this.pdfParser.parseDDTPDF(pdfPath);
      logger.info(`[DDTSyncService] Parsed ${parsedDDTs.length} DDTs from PDF`);

      // Step 3: Save with delta detection
      this.progress = {
        ...this.progress,
        status: "saving",
        message: `Salvataggio ${parsedDDTs.length} DDT...`,
      };
      this.emit("progress", this.progress);

      const saveResults = await this.saveDDTs(userId, parsedDDTs);

      // Step 4: Cleanup PDF
      await fs.unlink(pdfPath).catch((err) => {
        logger.warn(`[DDTSyncService] Failed to delete PDF ${pdfPath}:`, err);
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

      logger.info("[DDTSyncService] Sync completed", {
        duration,
        ...saveResults,
      });
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      logger.error("[DDTSyncService] Sync failed", { error, duration });

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

  private async downloadDDTPDF(userId: string): Promise<string> {
    const context = await this.browserPool.acquireContext(userId);
    const bot = new ArchibaldBot(userId);

    try {
      const pdfPath = await bot.downloadDDTPDF(context);
      return pdfPath;
    } finally {
      await this.browserPool.releaseContext(userId, context, true);
    }
  }

  private async saveDDTs(
    userId: string,
    parsedDDTs: ParsedDDT[],
  ): Promise<{
    ddtProcessed: number;
    ddtInserted: number;
    ddtUpdated: number;
    ddtSkipped: number;
  }> {
    let updated = 0;
    let notFound = 0;

    // Debug: Log first 5 DDTs to understand format
    logger.info(`[DDTSyncService] Sample of first 5 parsed DDTs:`, {
      sample: parsedDDTs.slice(0, 5).map((d: ParsedDDT) => ({
        order_number: d.order_number,
        ddt_number: d.ddt_number,
        tracking: d.tracking_number
      }))
    });

    for (const parsedDDT of parsedDDTs) {
      // Match DDT to order by order number
      const order = this.orderDb.getOrderById(userId, parsedDDT.order_number);

      if (!order) {
        notFound++;
        // Log first few not-found for debugging
        if (notFound <= 5) {
          logger.warn(
            `[DDTSyncService] Order not found - order_number: "${parsedDDT.order_number}" (length: ${parsedDDT.order_number?.length || 0}, DDT: ${parsedDDT.ddt_number})`,
          );
        }
        continue;
      }

      // Update order with DDT data
      try {
        this.orderDb.updateOrderDDT(userId, parsedDDT.order_number, {
          ddtNumber: parsedDDT.ddt_number,
          ddtDeliveryDate: parsedDDT.delivery_date || null,
          ddtId: parsedDDT.id || null,
          ddtCustomerAccount: parsedDDT.customer_account || null,
          ddtSalesName: parsedDDT.sales_name || null,
          ddtDeliveryName: parsedDDT.delivery_name || null,
          deliveryTerms: parsedDDT.delivery_terms || null,
          deliveryMethod: parsedDDT.delivery_method || null,
          deliveryCity: parsedDDT.delivery_city || null,
          attentionTo: null, // Not in PDF parser
          trackingNumber: parsedDDT.tracking_number || null,
          trackingUrl: parsedDDT.tracking_url || null,
          trackingCourier: parsedDDT.tracking_courier || null,
        });
        updated++;
      } catch (error) {
        logger.error(
          `[DDTSyncService] Failed to update order ${parsedDDT.order_number} with DDT ${parsedDDT.ddt_number}`,
          error,
        );
      }
    }

    logger.info(`[DDTSyncService] Updated ${updated} orders, ${notFound} not found`);

    return {
      ddtProcessed: parsedDDTs.length,
      ddtInserted: 0, // We don't insert new orders, we update existing ones
      ddtUpdated: updated,
      ddtSkipped: notFound,
    };
  }
}
