import { EventEmitter } from "events";
import { ArchibaldBot } from "./archibald-bot";
import { BrowserPool } from "./browser-pool";
import { logger } from "./logger";
import {
  PDFParserOrdersService,
  ParsedOrder,
} from "./pdf-parser-orders-service";
import { OrderDatabaseNew } from "./order-db-new";
import * as fs from "fs/promises";

export interface OrderSyncProgress {
  status: "idle" | "downloading" | "parsing" | "saving" | "completed" | "error";
  message: string;
  ordersProcessed: number;
  ordersInserted: number;
  ordersUpdated: number;
  ordersSkipped: number;
  error?: string;
}

export class OrderSyncService extends EventEmitter {
  private static instance: OrderSyncService;
  private browserPool: BrowserPool;
  private pdfParser: PDFParserOrdersService;
  private orderDb: OrderDatabaseNew;
  private syncInProgress = false;
  private paused = false;
  private progress: OrderSyncProgress = {
    status: "idle",
    message: "Nessuna sincronizzazione ordini in corso",
    ordersProcessed: 0,
    ordersInserted: 0,
    ordersUpdated: 0,
    ordersSkipped: 0,
  };

  private constructor() {
    super();
    this.browserPool = BrowserPool.getInstance();
    this.pdfParser = PDFParserOrdersService.getInstance();
    this.orderDb = OrderDatabaseNew.getInstance();
  }

  static getInstance(): OrderSyncService {
    if (!OrderSyncService.instance) {
      OrderSyncService.instance = new OrderSyncService();
    }
    return OrderSyncService.instance;
  }

  async pause(): Promise<void> {
    logger.info("[OrderSyncService] Pause requested");
    this.paused = true;

    if (this.syncInProgress) {
      logger.info("[OrderSyncService] Waiting for current sync to complete...");
      while (this.syncInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info("[OrderSyncService] Paused");
  }

  resume(): void {
    logger.info("[OrderSyncService] Resumed");
    this.paused = false;
  }

  getProgress(): OrderSyncProgress {
    return { ...this.progress };
  }

  async syncOrders(userId: string): Promise<void> {
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
        message: "Scaricamento PDF ordini da Archibald...",
        ordersProcessed: 0,
        ordersInserted: 0,
        ordersUpdated: 0,
        ordersSkipped: 0,
      };
      this.emit("progress", this.progress);

      // Step 1: Download PDF via bot
      const pdfPath = await this.downloadOrdersPDF(userId);
      logger.info(`[OrderSyncService] PDF downloaded to ${pdfPath}`);

      // Step 2: Parse PDF
      this.progress = {
        ...this.progress,
        status: "parsing",
        message: "Estrazione dati PDF...",
      };
      this.emit("progress", this.progress);

      const parsedOrders = await this.pdfParser.parseOrdersPDF(pdfPath);
      logger.info(
        `[OrderSyncService] Parsed ${parsedOrders.length} orders from PDF`,
      );

      // Step 3: Save with delta detection
      this.progress = {
        ...this.progress,
        status: "saving",
        message: `Salvataggio ${parsedOrders.length} ordini...`,
      };
      this.emit("progress", this.progress);

      const saveResults = await this.saveOrders(userId, parsedOrders);

      // Step 4: Cleanup PDF
      await fs.unlink(pdfPath).catch((err) => {
        logger.warn(`[OrderSyncService] Failed to delete PDF ${pdfPath}:`, err);
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

      logger.info("[OrderSyncService] Sync completed", {
        duration,
        ...saveResults,
      });
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      logger.error("[OrderSyncService] Sync failed", { error, duration });

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

  private async downloadOrdersPDF(userId: string): Promise<string> {
    const context = await this.browserPool.acquireContext(userId);
    const bot = new ArchibaldBot(userId);

    try {
      const pdfPath = await bot.downloadOrdersPDF(context);
      return pdfPath;
    } finally {
      await this.browserPool.releaseContext(userId, context, true);
    }
  }

  private async saveOrders(
    userId: string,
    parsedOrders: ParsedOrder[],
  ): Promise<{
    ordersProcessed: number;
    ordersInserted: number;
    ordersUpdated: number;
    ordersSkipped: number;
  }> {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const parsedOrder of parsedOrders) {
      const orderData = {
        id: parsedOrder.id,
        orderNumber: parsedOrder.order_number,
        customerProfileId: parsedOrder.customer_profile_id || null,
        customerName: parsedOrder.customer_name,
        deliveryName: parsedOrder.delivery_name,
        deliveryAddress: parsedOrder.delivery_address,
        creationDate: parsedOrder.creation_date,
        deliveryDate: parsedOrder.delivery_date,
        remainingSalesFinancial: parsedOrder.remaining_sales_financial,
        customerReference: parsedOrder.customer_reference,
        salesStatus: parsedOrder.sales_status,
        orderType: parsedOrder.order_type,
        documentStatus: parsedOrder.document_status,
        salesOrigin: parsedOrder.sales_origin,
        transferStatus: parsedOrder.transfer_status,
        transferDate: parsedOrder.transfer_date,
        completionDate: parsedOrder.completion_date,
        discountPercent: parsedOrder.discount_percent,
        grossAmount: parsedOrder.gross_amount,
        totalAmount: parsedOrder.total_amount,
      };

      const result = this.orderDb.upsertOrder(userId, orderData);

      if (result === "inserted") inserted++;
      else if (result === "updated") updated++;
      else if (result === "skipped") skipped++;
    }

    return {
      ordersProcessed: parsedOrders.length,
      ordersInserted: inserted,
      ordersUpdated: updated,
      ordersSkipped: skipped,
    };
  }
}
