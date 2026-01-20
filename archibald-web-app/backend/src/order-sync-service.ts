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
    logger.info("[OrderSyncService] syncOrders called", { userId });

    if (this.syncInProgress) {
      logger.warn("[OrderSyncService] Sync already in progress - rejecting");
      throw new Error("Sync already in progress");
    }

    if (this.paused) {
      logger.warn("[OrderSyncService] Sync service is paused - rejecting");
      throw new Error("Sync service is paused");
    }

    this.syncInProgress = true;
    const startTime = Date.now();
    logger.info("[OrderSyncService] Starting sync operation", {
      userId,
      startTime: new Date(startTime).toISOString(),
    });

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
      logger.info("[OrderSyncService] Progress updated: downloading");

      // Step 1: Download PDF via bot
      logger.info("[OrderSyncService] Step 1/4: Starting PDF download...");
      let pdfPath: string;
      try {
        pdfPath = await this.downloadOrdersPDF(userId);
        logger.info("[OrderSyncService] PDF download completed successfully", {
          pdfPath,
          sizeBytes: (await fs.stat(pdfPath)).size,
        });
      } catch (downloadError) {
        logger.error("[OrderSyncService] PDF download failed", {
          error:
            downloadError instanceof Error
              ? downloadError.message
              : String(downloadError),
          stack:
            downloadError instanceof Error ? downloadError.stack : undefined,
          duration: Date.now() - startTime,
        });
        throw downloadError;
      }

      // Step 2: Parse PDF
      logger.info("[OrderSyncService] Step 2/4: Starting PDF parsing...");
      this.progress = {
        ...this.progress,
        status: "parsing",
        message: "Estrazione dati PDF...",
      };
      this.emit("progress", this.progress);

      let parsedOrders: ParsedOrder[];
      try {
        parsedOrders = await this.pdfParser.parseOrdersPDF(pdfPath);
        logger.info("[OrderSyncService] PDF parsing completed successfully", {
          ordersCount: parsedOrders.length,
          duration: Date.now() - startTime,
        });
      } catch (parseError) {
        logger.error("[OrderSyncService] PDF parsing failed", {
          pdfPath,
          error:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
          stack: parseError instanceof Error ? parseError.stack : undefined,
          duration: Date.now() - startTime,
        });
        throw parseError;
      }

      // Step 3: Save with delta detection
      logger.info("[OrderSyncService] Step 3/4: Starting database save...");
      this.progress = {
        ...this.progress,
        status: "saving",
        message: `Salvataggio ${parsedOrders.length} ordini...`,
      };
      this.emit("progress", this.progress);

      let saveResults: {
        ordersProcessed: number;
        ordersInserted: number;
        ordersUpdated: number;
        ordersSkipped: number;
      };
      try {
        saveResults = await this.saveOrders(userId, parsedOrders);
        logger.info("[OrderSyncService] Database save completed successfully", {
          ...saveResults,
          duration: Date.now() - startTime,
        });
      } catch (saveError) {
        logger.error("[OrderSyncService] Database save failed", {
          ordersCount: parsedOrders.length,
          error:
            saveError instanceof Error ? saveError.message : String(saveError),
          stack: saveError instanceof Error ? saveError.stack : undefined,
          duration: Date.now() - startTime,
        });
        throw saveError;
      }

      // Step 4: Cleanup PDF
      logger.info("[OrderSyncService] Step 4/4: Cleaning up PDF...");
      await fs.unlink(pdfPath).catch((err) => {
        logger.warn(`[OrderSyncService] Failed to delete PDF ${pdfPath}`, {
          error: err instanceof Error ? err.message : String(err),
        });
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

      logger.info("[OrderSyncService] Sync completed successfully", {
        duration,
        durationMs: Date.now() - startTime,
        ...saveResults,
      });
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error("[OrderSyncService] Sync operation failed", {
        error: errorMessage,
        stack: errorStack,
        duration,
        durationMs: Date.now() - startTime,
        progressStatus: this.progress.status,
      });

      this.progress = {
        ...this.progress,
        status: "error",
        message: `❌ Errore sync: ${errorMessage}`,
        error: errorMessage,
      };
      this.emit("progress", this.progress);

      throw error;
    } finally {
      this.syncInProgress = false;
      logger.info("[OrderSyncService] syncInProgress flag reset to false");
    }
  }

  private async downloadOrdersPDF(userId: string): Promise<string> {
    logger.info(
      "[OrderSyncService] downloadOrdersPDF: acquiring browser context",
      {
        userId,
      },
    );

    let context;
    try {
      context = await this.browserPool.acquireContext(userId);
      logger.info(
        "[OrderSyncService] downloadOrdersPDF: browser context acquired",
      );
    } catch (acquireError) {
      logger.error(
        "[OrderSyncService] downloadOrdersPDF: failed to acquire browser context",
        {
          error:
            acquireError instanceof Error
              ? acquireError.message
              : String(acquireError),
          stack: acquireError instanceof Error ? acquireError.stack : undefined,
        },
      );
      throw acquireError;
    }

    const bot = new ArchibaldBot(userId);
    logger.info("[OrderSyncService] downloadOrdersPDF: ArchibaldBot created");

    try {
      logger.info(
        "[OrderSyncService] downloadOrdersPDF: calling bot.downloadOrdersPDF",
      );
      const pdfPath = await bot.downloadOrdersPDF(context);
      logger.info(
        "[OrderSyncService] downloadOrdersPDF: bot.downloadOrdersPDF completed",
        { pdfPath },
      );
      return pdfPath;
    } catch (botError) {
      logger.error(
        "[OrderSyncService] downloadOrdersPDF: bot.downloadOrdersPDF failed",
        {
          error:
            botError instanceof Error ? botError.message : String(botError),
          stack: botError instanceof Error ? botError.stack : undefined,
        },
      );
      throw botError;
    } finally {
      logger.info(
        "[OrderSyncService] downloadOrdersPDF: releasing browser context",
      );
      try {
        await this.browserPool.releaseContext(userId, context, true);
        logger.info(
          "[OrderSyncService] downloadOrdersPDF: browser context released",
        );
      } catch (releaseError) {
        logger.error(
          "[OrderSyncService] downloadOrdersPDF: failed to release browser context",
          {
            error:
              releaseError instanceof Error
                ? releaseError.message
                : String(releaseError),
            stack:
              releaseError instanceof Error ? releaseError.stack : undefined,
          },
        );
      }
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
    logger.info("[OrderSyncService] saveOrders: starting", {
      userId,
      ordersCount: parsedOrders.length,
    });

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < parsedOrders.length; i++) {
      const parsedOrder = parsedOrders[i];

      try {
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

        // Log progress every 100 orders
        if ((i + 1) % 100 === 0) {
          logger.info("[OrderSyncService] saveOrders: progress", {
            processed: i + 1,
            total: parsedOrders.length,
            inserted,
            updated,
            skipped,
          });
        }
      } catch (upsertError) {
        logger.error("[OrderSyncService] saveOrders: failed to upsert order", {
          orderIndex: i,
          orderId: parsedOrder.id,
          orderNumber: parsedOrder.order_number,
          error:
            upsertError instanceof Error
              ? upsertError.message
              : String(upsertError),
          stack: upsertError instanceof Error ? upsertError.stack : undefined,
        });
        // Continue with next order instead of failing entire sync
      }
    }

    const results = {
      ordersProcessed: parsedOrders.length,
      ordersInserted: inserted,
      ordersUpdated: updated,
      ordersSkipped: skipped,
    };

    logger.info("[OrderSyncService] saveOrders: completed", results);
    return results;
  }
}
