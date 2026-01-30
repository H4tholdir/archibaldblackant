import { EventEmitter } from "events";
import type { BrowserContext } from "puppeteer";
import { ArchibaldBot } from "./archibald-bot";
import { BrowserPool } from "./browser-pool";
import { logger } from "./logger";
import {
  PDFParserSaleslinesService,
  ParsedArticle,
} from "./pdf-parser-saleslines-service";
import { OrderDatabaseNew, OrderArticleRecord } from "./order-db-new";
import { ProductDatabase } from "./product-db";
import * as fs from "fs/promises";
import { ERROR_MESSAGES } from "./error-messages";
import Decimal from "decimal.js";

/**
 * Utility: wrap promise with timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`Timeout: ${operationName} superato ${timeoutMs}ms`),
          ),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Utility: retry promise with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number;
    backoffMs: number;
    operationName: string;
  },
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < options.maxAttempts) {
        const delay = options.backoffMs * Math.pow(2, attempt - 1);
        logger.warn(
          `[OrderArticlesSync] ${options.operationName} failed, retrying in ${delay}ms (attempt ${attempt}/${options.maxAttempts})`,
          { error: error instanceof Error ? error.message : String(error) },
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export interface ArticlesSyncProgress {
  status:
    | "idle"
    | "downloading"
    | "parsing"
    | "enriching"
    | "saving"
    | "completed"
    | "error";
  message: string;
  articlesProcessed: number;
  error?: string;
}

export class OrderArticlesSyncService extends EventEmitter {
  private static instance: OrderArticlesSyncService;
  private browserPool: BrowserPool;
  private pdfParser: PDFParserSaleslinesService;
  private orderDb: OrderDatabaseNew;
  private productDb: ProductDatabase;
  private syncInProgress = new Map<string, boolean>();

  private constructor() {
    super();
    this.browserPool = BrowserPool.getInstance();
    this.pdfParser = PDFParserSaleslinesService.getInstance();
    this.orderDb = OrderDatabaseNew.getInstance();
    this.productDb = ProductDatabase.getInstance();
  }

  static getInstance(): OrderArticlesSyncService {
    if (!OrderArticlesSyncService.instance) {
      OrderArticlesSyncService.instance = new OrderArticlesSyncService();
    }
    return OrderArticlesSyncService.instance;
  }

  async syncOrderArticles(
    userId: string,
    orderId: string,
  ): Promise<{
    articles: OrderArticleRecord[];
    totalVatAmount: number;
    totalWithVat: number;
  }> {
    const lockKey = `${userId}:${orderId}`;

    // Atomic check-and-set to prevent race conditions
    if (this.syncInProgress.get(lockKey)) {
      throw new Error(ERROR_MESSAGES.SYNC_IN_PROGRESS);
    }

    this.syncInProgress.set(lockKey, true);
    const startTime = Date.now();
    let pdfPath: string | null = null;

    try {
      logger.info("[OrderArticlesSync] Starting", { userId, orderId });

      // Emit progress: starting
      this.emit("progress", {
        status: "downloading",
        message: "Download PDF in corso...",
        articlesProcessed: 0,
      } as ArticlesSyncProgress);

      // Step 1: Get order and validate archibald_order_id
      const order = this.orderDb.getOrderById(userId, orderId);
      if (!order) {
        throw new Error(ERROR_MESSAGES.ORDER_NOT_FOUND);
      }

      if (!order.archibaldOrderId) {
        throw new Error(ERROR_MESSAGES.ORDER_ARCHIBALD_ID_MISSING);
      }

      const archibaldOrderId = order.archibaldOrderId; // Type narrowing

      // Step 2: Download PDF (with 90s timeout + 2 retry attempts)
      logger.info("[OrderArticlesSync] Downloading PDF...", {
        archibaldOrderId,
      });

      pdfPath = await withRetry(
        () =>
          withTimeout(
            this.downloadArticlesPDF(userId, archibaldOrderId),
            90000,
            "Download PDF",
          ),
        {
          maxAttempts: 2,
          backoffMs: 2000,
          operationName: "Download PDF",
        },
      );

      logger.info("[OrderArticlesSync] PDF downloaded", { pdfPath });

      // Emit progress: parsing
      this.emit("progress", {
        status: "parsing",
        message: "Lettura PDF in corso...",
        articlesProcessed: 0,
      } as ArticlesSyncProgress);

      // Step 3: Parse PDF (with 30s timeout + 1 retry attempt)
      logger.info("[OrderArticlesSync] Parsing PDF...");
      const parsedArticles = await withRetry(
        () =>
          withTimeout(
            this.pdfParser.parseSaleslinesPDF(pdfPath!),
            30000,
            "Parsing PDF",
          ),
        {
          maxAttempts: 2,
          backoffMs: 1000,
          operationName: "Parsing PDF",
        },
      );

      logger.info("[OrderArticlesSync] PDF parsed", {
        articlesCount: parsedArticles.length,
      });

      // Emit progress: enriching
      this.emit("progress", {
        status: "enriching",
        message: `Arricchimento ${parsedArticles.length} articoli con IVA...`,
        articlesProcessed: parsedArticles.length,
      } as ArticlesSyncProgress);

      // Step 4: Enrich with VAT from product database (using Decimal for precision)
      logger.info("[OrderArticlesSync] Enriching with VAT...");
      const enrichedArticles = parsedArticles.map((article) => {
        const products = this.productDb.getProducts(article.articleCode);
        const vat =
          products.length > 0 && products[0].vat ? products[0].vat : 22; // Default 22%

        // Use Decimal.js for precise calculations
        const lineAmountDec = new Decimal(article.lineAmount);
        const vatPercentDec = new Decimal(vat);

        const vatAmountDec = lineAmountDec.times(vatPercentDec).dividedBy(100);
        const lineTotalWithVatDec = lineAmountDec.plus(vatAmountDec);

        return {
          orderId,
          articleCode: article.articleCode,
          articleDescription: article.description || null,
          quantity: article.quantity,
          unitPrice: article.unitPrice,
          discountPercent: article.discountPercent,
          lineAmount: article.lineAmount,
          vatPercent: vat,
          vatAmount: parseFloat(vatAmountDec.toFixed(2)),
          lineTotalWithVat: parseFloat(lineTotalWithVatDec.toFixed(2)),
        } as OrderArticleRecord & {
          vatPercent: number;
          vatAmount: number;
          lineTotalWithVat: number;
        };
      });

      logger.info("[OrderArticlesSync] VAT enrichment completed", {
        articlesCount: enrichedArticles.length,
      });

      // Step 5: Calculate totals (using Decimal for precision)
      const totalVatAmountDec = enrichedArticles.reduce(
        (sum, a) => sum.plus(a.vatAmount),
        new Decimal(0),
      );
      const totalWithVatDec = enrichedArticles.reduce(
        (sum, a) => sum.plus(a.lineTotalWithVat),
        new Decimal(0),
      );

      const totalVatAmount = parseFloat(totalVatAmountDec.toFixed(2));
      const totalWithVat = parseFloat(totalWithVatDec.toFixed(2));

      logger.info("[OrderArticlesSync] Totals calculated", {
        totalVatAmount,
        totalWithVat,
      });

      // Step 6: Verify order still exists (race condition check)
      const orderCheck = this.orderDb.getOrderById(userId, orderId);
      if (!orderCheck) {
        throw new Error(ERROR_MESSAGES.ORDER_NOT_FOUND);
      }

      // Emit progress: saving
      this.emit("progress", {
        status: "saving",
        message: "Salvataggio articoli nel database...",
        articlesProcessed: enrichedArticles.length,
      } as ArticlesSyncProgress);

      // Step 7: Delete existing articles
      logger.info("[OrderArticlesSync] Deleting existing articles...");
      this.orderDb.deleteOrderArticles(orderId);

      // Step 8: Insert new articles
      logger.info("[OrderArticlesSync] Inserting articles...");
      this.orderDb.saveOrderArticlesWithVat(enrichedArticles);

      // Step 9: Update order totals
      logger.info("[OrderArticlesSync] Updating order totals...");
      this.orderDb.updateOrderTotals(orderId, {
        totalVatAmount,
        totalWithVat,
      });

      const duration = Date.now() - startTime;
      logger.info("[OrderArticlesSync] Completed", {
        orderId,
        articlesCount: enrichedArticles.length,
        totalVatAmount,
        totalWithVat,
        duration,
      });

      // Emit progress: completed
      this.emit("progress", {
        status: "completed",
        message: `Completato! ${enrichedArticles.length} articoli sincronizzati`,
        articlesProcessed: enrichedArticles.length,
      } as ArticlesSyncProgress);

      return {
        articles: enrichedArticles,
        totalVatAmount,
        totalWithVat,
      };
    } catch (error) {
      logger.error("[OrderArticlesSync] Failed", {
        userId,
        orderId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration: Date.now() - startTime,
      });

      // Emit progress: error
      this.emit("progress", {
        status: "error",
        message: "Errore durante la sincronizzazione",
        articlesProcessed: 0,
        error: error instanceof Error ? error.message : String(error),
      } as ArticlesSyncProgress);

      throw error;
    } finally {
      // Cleanup: release lock
      this.syncInProgress.delete(lockKey);

      // Cleanup: delete PDF file if downloaded
      if (pdfPath) {
        await fs.unlink(pdfPath).catch((err) =>
          logger.warn("[OrderArticlesSync] Failed to delete PDF", {
            pdfPath,
            err,
          }),
        );
      }
    }
  }

  private async downloadArticlesPDF(
    userId: string,
    archibaldOrderId: string,
  ): Promise<string> {
    const context = await this.browserPool.acquireContext(userId);
    const bot = new ArchibaldBot(userId);

    try {
      const pdfPath = await bot.downloadOrderArticlesPDF(
        context,
        archibaldOrderId,
      );
      await this.browserPool.releaseContext(userId, context, true);
      return pdfPath;
    } catch (error) {
      await this.browserPool.releaseContext(userId, context, false);
      throw error;
    }
  }
}
