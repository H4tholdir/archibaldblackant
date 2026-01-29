import { EventEmitter } from "events";
import type { BrowserContext } from "puppeteer";
import { ArchibaldBot } from "./archibald-bot";
import { BrowserPool } from "./browser-pool";
import { logger } from "./logger";
import {
  PDFParserInvoicesService,
  ParsedInvoice,
} from "./pdf-parser-invoices-service";
import { OrderDatabaseNew } from "./order-db-new";
import * as fs from "fs/promises";
import { SyncStopError, isSyncStopError } from "./sync-stop";

export interface InvoiceSyncProgress {
  status: "idle" | "downloading" | "parsing" | "saving" | "completed" | "error";
  message: string;
  invoicesProcessed: number;
  invoicesInserted: number;
  invoicesUpdated: number;
  invoicesSkipped: number;
  error?: string;
}

export class InvoiceSyncService extends EventEmitter {
  private static instance: InvoiceSyncService;
  private browserPool: BrowserPool;
  private pdfParser: PDFParserInvoicesService;
  private orderDb: OrderDatabaseNew;
  private syncInProgress = false;
  private paused = false;
  private stopRequested = false;
  private activeContext: BrowserContext | null = null;
  private activeUserId: string | null = null;
  private progress: InvoiceSyncProgress = {
    status: "idle",
    message: "Nessuna sincronizzazione fatture in corso",
    invoicesProcessed: 0,
    invoicesInserted: 0,
    invoicesUpdated: 0,
    invoicesSkipped: 0,
  };

  private constructor() {
    super();
    this.browserPool = BrowserPool.getInstance();
    this.pdfParser = PDFParserInvoicesService.getInstance();
    this.orderDb = OrderDatabaseNew.getInstance();
  }

  static getInstance(): InvoiceSyncService {
    if (!InvoiceSyncService.instance) {
      InvoiceSyncService.instance = new InvoiceSyncService();
    }
    return InvoiceSyncService.instance;
  }

  private throwIfStopRequested(stage: string): void {
    if (this.stopRequested) {
      throw new SyncStopError(
        `[InvoiceSyncService] Stop requested during ${stage}`,
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
      logger.warn("[InvoiceSyncService] Failed to release context", {
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
    logger.warn("[InvoiceSyncService] Aborting active context", {
      reason,
      userId,
    });
    await this.releaseActiveContext(false, reason);
  }

  async pause(): Promise<void> {
    logger.info("[InvoiceSyncService] Pause requested");
    this.paused = true;

    if (this.syncInProgress) {
      this.requestStop();
      logger.info(
        "[InvoiceSyncService] Waiting for current sync to complete...",
      );
      while (this.syncInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info("[InvoiceSyncService] Paused");
  }

  resume(): void {
    logger.info("[InvoiceSyncService] Resumed");
    this.paused = false;
  }

  getProgress(): InvoiceSyncProgress {
    return { ...this.progress };
  }

  async syncInvoices(userId: string): Promise<void> {
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
        message: "Scaricamento PDF fatture da Archibald...",
        invoicesProcessed: 0,
        invoicesInserted: 0,
        invoicesUpdated: 0,
        invoicesSkipped: 0,
      };
      this.emit("progress", this.progress);

      // Step 1: Download PDF via bot
      const pdfPath = await this.downloadInvoicesPDF(userId);
      logger.info(`[InvoiceSyncService] PDF downloaded to ${pdfPath}`);
      this.throwIfStopRequested("download");

      // Step 2: Parse PDF
      this.progress = {
        ...this.progress,
        status: "parsing",
        message: "Estrazione dati PDF...",
      };
      this.emit("progress", this.progress);

      const parsedInvoices = await this.pdfParser.parseInvoicesPDF(pdfPath);
      logger.info(
        `[InvoiceSyncService] Parsed ${parsedInvoices.length} invoices from PDF`,
      );
      this.throwIfStopRequested("parse");

      // Step 3: Save with delta detection
      this.progress = {
        ...this.progress,
        status: "saving",
        message: `Salvataggio ${parsedInvoices.length} fatture...`,
      };
      this.emit("progress", this.progress);

      const saveResults = await this.saveInvoices(userId, parsedInvoices);
      this.throwIfStopRequested("saving");

      // Step 4: Cleanup PDF
      await fs.unlink(pdfPath).catch((err) => {
        logger.warn(
          `[InvoiceSyncService] Failed to delete PDF ${pdfPath}:`,
          err,
        );
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

      logger.info("[InvoiceSyncService] Sync completed", {
        duration,
        ...saveResults,
      });
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      if (isSyncStopError(error)) {
        logger.warn("[InvoiceSyncService] Sync stopped", {
          error: error.message,
          duration,
        });
      } else {
        logger.error("[InvoiceSyncService] Sync failed", { error, duration });
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

  private async downloadInvoicesPDF(userId: string): Promise<string> {
    const context = await this.browserPool.acquireContext(userId);
    this.activeContext = context;
    this.activeUserId = userId;
    this.throwIfStopRequested("login");
    const bot = new ArchibaldBot(userId);
    let success = false;

    try {
      const pdfPath = await bot.downloadInvoicesPDF(context);
      success = true;
      return pdfPath;
    } finally {
      await this.releaseActiveContext(success, "download-invoices-pdf");
    }
  }

  private async saveInvoices(
    userId: string,
    parsedInvoices: ParsedInvoice[],
  ): Promise<{
    invoicesProcessed: number;
    invoicesInserted: number;
    invoicesUpdated: number;
    invoicesSkipped: number;
  }> {
    let updated = 0;
    let notFound = 0;

    for (const parsedInvoice of parsedInvoices) {
      this.throwIfStopRequested("saving");
      // Skip invoices without order number
      if (!parsedInvoice.order_number) {
        notFound++;
        logger.debug(
          `[InvoiceSyncService] Invoice ${parsedInvoice.invoice_number} has no order number`,
        );
        continue;
      }

      // Match invoice to order by order number
      const order = this.orderDb.getOrderById(
        userId,
        parsedInvoice.order_number,
      );

      if (!order) {
        notFound++;
        logger.debug(
          `[InvoiceSyncService] Order ${parsedInvoice.order_number} not found for invoice ${parsedInvoice.invoice_number}`,
        );
        continue;
      }

      // Update order with invoice data
      try {
        this.orderDb.updateInvoiceData(userId, parsedInvoice.order_number, {
          invoiceNumber: parsedInvoice.invoice_number,
          invoiceDate: parsedInvoice.invoice_date || null,
          invoiceAmount: parsedInvoice.invoice_amount || null,
          invoiceCustomerAccount: parsedInvoice.customer_account || null,
          invoiceBillingName: parsedInvoice.billing_name || null,
          invoiceQuantity: parsedInvoice.quantity
            ? parseInt(parsedInvoice.quantity)
            : null,
          invoiceRemainingAmount: parsedInvoice.remaining_amount || null,
          invoiceTaxAmount: parsedInvoice.tax_sum || null,
          invoiceLineDiscount: parsedInvoice.discount_amount || null,
          invoiceTotalDiscount: parsedInvoice.discount_amount || null, // Same as line discount
          invoiceDueDate: parsedInvoice.due_date || null,
          invoicePaymentTermsId: parsedInvoice.payment_term_id || null,
          invoicePurchaseOrder: parsedInvoice.purchase_order || null,
          invoiceClosed: parsedInvoice.closed ? parsedInvoice.closed === "Sì" || parsedInvoice.closed === "1" : null,
        });
        updated++;
      } catch (error) {
        logger.error(
          `[InvoiceSyncService] Failed to update order ${parsedInvoice.order_number} with invoice ${parsedInvoice.invoice_number}`,
          error,
        );
      }
    }

    logger.info(
      `[InvoiceSyncService] Updated ${updated} orders, ${notFound} not found`,
    );

    return {
      invoicesProcessed: parsedInvoices.length,
      invoicesInserted: 0, // We don't insert new orders, we update existing ones
      invoicesUpdated: updated,
      invoicesSkipped: notFound,
    };
  }

  requestStop(): void {
    logger.warn("[InvoiceSyncService] Stop requested");
    this.stopRequested = true;
    if (this.syncInProgress) {
      void this.abortActiveContext("stop-requested");
    }
  }
}
