import { EventEmitter } from "events";
import { ArchibaldBot } from "./archibald-bot";
import { BrowserPool } from "./browser-pool";
import { logger } from "./logger";
import {
  PDFParserInvoicesService,
  ParsedInvoice,
} from "./pdf-parser-invoices-service";
import { InvoicesDatabase } from "./invoices-db";
import * as fs from "fs/promises";

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
  private invoiceDb: InvoicesDatabase;
  private syncInProgress = false;
  private paused = false;
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
    this.invoiceDb = InvoicesDatabase.getInstance();
  }

  static getInstance(): InvoiceSyncService {
    if (!InvoiceSyncService.instance) {
      InvoiceSyncService.instance = new InvoiceSyncService();
    }
    return InvoiceSyncService.instance;
  }

  async pause(): Promise<void> {
    logger.info("[InvoiceSyncService] Pause requested");
    this.paused = true;

    if (this.syncInProgress) {
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

      // Step 3: Save with delta detection
      this.progress = {
        ...this.progress,
        status: "saving",
        message: `Salvataggio ${parsedInvoices.length} fatture...`,
      };
      this.emit("progress", this.progress);

      const saveResults = await this.saveInvoices(parsedInvoices);

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
      logger.error("[InvoiceSyncService] Sync failed", { error, duration });

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

  private async downloadInvoicesPDF(userId: string): Promise<string> {
    const context = await this.browserPool.acquireContext(userId);
    const bot = new ArchibaldBot(userId);

    try {
      const pdfPath = await bot.downloadInvoicesPDF(context);
      return pdfPath;
    } finally {
      await this.browserPool.releaseContext(userId, context, true);
    }
  }

  private async saveInvoices(parsedInvoices: ParsedInvoice[]): Promise<{
    invoicesProcessed: number;
    invoicesInserted: number;
    invoicesUpdated: number;
    invoicesSkipped: number;
  }> {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const parsedInvoice of parsedInvoices) {
      const invoiceData = {
        id: parsedInvoice.id,
        invoiceNumber: parsedInvoice.invoice_number,
        invoiceDate: parsedInvoice.invoice_date,
        customerAccount: parsedInvoice.customer_account,
        billingName: parsedInvoice.billing_name,
        quantity: parsedInvoice.quantity,
        salesBalance: parsedInvoice.sales_balance,
        amount: parsedInvoice.amount,
        vatAmount: parsedInvoice.vat_amount,
        totalAmount: parsedInvoice.total_amount,
        paymentTerms: parsedInvoice.payment_terms,
      };

      const result = this.invoiceDb.upsertInvoice(invoiceData);

      if (result === "inserted") inserted++;
      else if (result === "updated") updated++;
      else if (result === "skipped") skipped++;
    }

    return {
      invoicesProcessed: parsedInvoices.length,
      invoicesInserted: inserted,
      invoicesUpdated: updated,
      invoicesSkipped: skipped,
    };
  }
}
