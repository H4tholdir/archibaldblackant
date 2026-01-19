import { EventEmitter } from "events";
import { ProductDatabase, Product, SyncSession } from "./product-db";
import { BrowserPool } from "./browser-pool";
import { ArchibaldBot } from "./archibald-bot";
import {
  PDFParserProductsService,
  ParsedProduct,
} from "./pdf-parser-products-service";
import { logger } from "./logger";
import { createHash } from "crypto";
import { promises as fs } from "fs";

export interface SyncProgress {
  stage: "login" | "download" | "parse" | "update" | "cleanup";
  message: string;
  productsProcessed?: number;
  status?: "idle" | "syncing" | "completed" | "error"; // For backward compatibility
}

export interface SyncResult {
  productsProcessed: number;
  newProducts: number;
  updatedProducts: number;
  duration: number;
}

export class ProductSyncService extends EventEmitter {
  private static instance: ProductSyncService;
  private db: ProductDatabase;
  private pdfParser: PDFParserProductsService;
  private syncInProgress = false;
  private paused = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private currentProgress: SyncProgress = {
    stage: "login",
    message: "Idle",
  };

  private constructor() {
    super();
    this.db = ProductDatabase.getInstance();
    this.pdfParser = PDFParserProductsService.getInstance();
  }

  static getInstance(): ProductSyncService {
    if (!ProductSyncService.instance) {
      ProductSyncService.instance = new ProductSyncService();
    }
    return ProductSyncService.instance;
  }

  /**
   * Pause sync service (for PriorityManager)
   */
  async pause(): Promise<void> {
    logger.info("[ProductSyncService] Pause requested");
    this.paused = true;

    if (this.syncInProgress) {
      logger.info(
        "[ProductSyncService] Waiting for current sync to complete...",
      );
      while (this.syncInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info("[ProductSyncService] Paused");
  }

  /**
   * Resume sync service
   */
  resume(): void {
    logger.info("[ProductSyncService] Resume requested");
    this.paused = false;
    logger.info("[ProductSyncService] Resumed");
  }

  /**
   * Sync products from Archibald via PDF export
   */
  async syncProducts(
    progressCallback?: (progress: SyncProgress) => void,
  ): Promise<SyncResult> {
    const startTime = Date.now();

    if (this.syncInProgress) {
      throw new Error("Sync already in progress");
    }

    this.syncInProgress = true;
    let tempPdfPath: string | null = null;
    let context: any = null;

    // Create sync session record
    const sessionId = this.db.createSyncSession("auto");

    try {
      // Stage 1: Login & acquire context
      this.currentProgress = {
        stage: "login",
        message: "Connessione ad Archibald...",
      };
      progressCallback?.(this.currentProgress);

      context = await BrowserPool.getInstance().acquireContext(
        "product-sync-service",
      );

      const bot = new ArchibaldBot("system");

      // Stage 2: Download PDF
      this.currentProgress = {
        stage: "download",
        message: "Scaricamento PDF articoli...",
      };
      progressCallback?.(this.currentProgress);

      tempPdfPath = await bot.downloadProductsPDF(context);

      // Stage 3: Parse PDF
      this.currentProgress = {
        stage: "parse",
        message: "Analisi PDF in corso...",
      };
      progressCallback?.(this.currentProgress);

      const parsedProducts = await this.pdfParser.parsePDF(tempPdfPath);

      logger.info(
        `[ProductSyncService] Parsed ${parsedProducts.length} products from PDF`,
      );

      // Stage 4: Apply delta and update DB
      this.currentProgress = {
        stage: "update",
        message: `Aggiornamento ${parsedProducts.length} articoli...`,
        productsProcessed: parsedProducts.length,
      };
      progressCallback?.(this.currentProgress);

      const { newProducts, updatedProducts } =
        await this.applyDelta(parsedProducts);

      // Stage 5: Cleanup
      this.currentProgress = {
        stage: "cleanup",
        message: "Finalizzazione...",
      };
      progressCallback?.(this.currentProgress);

      if (tempPdfPath) {
        await fs.unlink(tempPdfPath);
        logger.info("[ProductSyncService] Temp PDF cleaned up", { tempPdfPath });
      }

      await BrowserPool.getInstance().releaseContext(
        "product-sync-service",
        context,
        true, // success
      );

      const duration = Date.now() - startTime;

      // Update session as completed
      this.db.updateSyncSession(sessionId, {
        itemsProcessed: parsedProducts.length,
        itemsCreated: newProducts,
        itemsUpdated: updatedProducts,
      });
      this.db.completeSyncSession(sessionId, "completed");

      logger.info("[ProductSyncService] Sync completed", {
        productsProcessed: parsedProducts.length,
        newProducts,
        updatedProducts,
        durationMs: duration,
      });

      return {
        productsProcessed: parsedProducts.length,
        newProducts,
        updatedProducts,
        duration,
      };
    } catch (error: any) {
      logger.error("[ProductSyncService] Sync failed", { error });

      // Update session as failed
      this.db.completeSyncSession(
        sessionId,
        "failed",
        error instanceof Error ? error.message : String(error),
      );

      // Cleanup on error
      if (tempPdfPath) {
        try {
          await fs.unlink(tempPdfPath);
        } catch (cleanupError) {
          logger.error("[ProductSyncService] Cleanup failed", { cleanupError });
        }
      }

      if (context) {
        await BrowserPool.getInstance().releaseContext(
          "product-sync-service",
          context,
          false, // error
        );
      }

      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Apply delta: insert new, update changed, skip unchanged
   */
  private async applyDelta(
    parsedProducts: ParsedProduct[],
  ): Promise<{ newProducts: number; updatedProducts: number }> {
    let newProducts = 0;
    let updatedProducts = 0;

    for (const parsed of parsedProducts) {
      const productData = this.mapPDFToProduct(parsed);
      const hash = this.computeHash(productData);

      const existing = this.db.getProductById(productData.id);

      if (!existing) {
        // New product
        this.db.upsertProducts([productData]);
        newProducts++;
      } else if (existing.hash !== hash) {
        // Changed product
        this.db.upsertProducts([productData]);
        updatedProducts++;
      }
      // else: unchanged, skip
    }

    logger.info("[ProductSyncService] Delta applied", {
      newProducts,
      updatedProducts,
    });

    return { newProducts, updatedProducts };
  }

  /**
   * Map parsed PDF data to Product interface
   */
  private mapPDFToProduct(
    parsed: ParsedProduct,
  ): Omit<Product, "hash" | "lastSync"> {
    return {
      id: parsed.id_articolo,
      name: parsed.nome_articolo,
      description: parsed.descrizione,
      groupCode: parsed.gruppo_articolo,
      packageContent: parsed.contenuto_imballaggio,
      searchName: parsed.nome_ricerca,
      priceUnit: parsed.unita_prezzo,
      productGroupId: parsed.id_gruppo_prodotti,
      productGroupDescription: parsed.descrizione_gruppo_articolo,
      minQty: this.parseNumber(parsed.qta_minima),
      multipleQty: this.parseNumber(parsed.qta_multipli),
      maxQty: this.parseNumber(parsed.qta_massima),
      figure: parsed.figura,
      bulkArticleId: parsed.id_blocco_articolo,
      legPackage: parsed.pacco_gamba,
      size: parsed.grandezza,
      configurationId: parsed.id_configurazione,
      createdBy: parsed.creato_da,
      createdDate: parsed.data_creata,
      dataAreaId: parsed.dataareaid,
      defaultQty: parsed.qta_predefinita,
      displayProductNumber: parsed.visualizza_numero_prodotto,
      totalAbsoluteDiscount: parsed.sconto_assoluto_totale,
      productId: parsed.id_prodotto,
      lineDiscount: parsed.sconto_linea,
      modifiedBy: parsed.modificato_da,
      modifiedDatetime: parsed.datetime_modificato,
      orderableArticle: parsed.articolo_ordinabile,
      purchPrice: parsed.purch_price,
      pcsStandardConfigurationId: parsed.pcs_id_configurazione_standard,
      standardQty: parsed.qta_standard,
      stopped: parsed.fermato,
      unitId: parsed.id_unita,
      // Keep existing price/VAT fields (not overwritten by PDF)
      price: undefined,
      priceSource: null,
      priceUpdatedAt: undefined,
      vat: undefined,
      vatSource: null,
      vatUpdatedAt: undefined,
    };
  }

  /**
   * Compute MD5 hash of all product fields for delta detection
   */
  private computeHash(product: Partial<Product>): string {
    const fields = [
      product.id,
      product.name,
      product.description,
      product.groupCode,
      product.packageContent,
      product.searchName,
      product.priceUnit,
      product.productGroupId,
      product.productGroupDescription,
      product.minQty,
      product.multipleQty,
      product.maxQty,
      product.figure,
      product.bulkArticleId,
      product.legPackage,
      product.size,
      product.configurationId,
      product.createdBy,
      product.createdDate,
      product.dataAreaId,
      product.defaultQty,
      product.displayProductNumber,
      product.totalAbsoluteDiscount,
      product.productId,
      product.lineDiscount,
      product.modifiedBy,
      product.modifiedDatetime,
      product.orderableArticle,
      product.purchPrice,
      product.pcsStandardConfigurationId,
      product.standardQty,
      product.stopped,
      product.unitId,
    ].join("|");

    return createHash("md5").update(fields).digest("hex");
  }

  private parseNumber(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const num = parseFloat(value.replace(",", "."));
    return isNaN(num) ? undefined : num;
  }

  /**
   * Start automatic background sync with retry logic
   */
  startAutoSync(intervalMinutes: number = 30): void {
    logger.info(
      `[ProductSyncService] Starting auto-sync every ${intervalMinutes} minutes`,
    );

    // Initial sync after 5s with retry
    setTimeout(() => {
      this.syncWithRetry();
    }, 5000);

    // Recurring sync
    this.syncInterval = setInterval(() => {
      if (!this.paused) {
        this.syncWithRetry();
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Sync with exponential backoff retry (3 attempts)
   */
  private async syncWithRetry(attempt: number = 1): Promise<void> {
    const maxAttempts = 3;
    const backoffDelays = [5000, 10000, 20000]; // 5s, 10s, 20s

    try {
      await this.syncProducts();
      logger.info("[ProductSyncService] Auto-sync successful", { attempt });
    } catch (error) {
      logger.error("[ProductSyncService] Auto-sync failed", { attempt, error });

      if (attempt < maxAttempts) {
        const delay = backoffDelays[attempt - 1];
        logger.info(
          `[ProductSyncService] Retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.syncWithRetry(attempt + 1);
      } else {
        logger.error("[ProductSyncService] All retry attempts exhausted", {
          attempts: maxAttempts,
          error,
        });

        // Emit event for monitoring/alerts
        this.emit("sync-failure", {
          attempts: maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Stop automatic background sync
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info("[ProductSyncService] Auto-sync stopped");
    }
  }

  /**
   * Get current sync progress
   */
  getProgress(): SyncProgress {
    return this.currentProgress;
  }

  /**
   * Request sync stop (for compatibility - not implemented in PDF-based sync)
   */
  requestStop(): void {
    logger.warn(
      "[ProductSyncService] requestStop called but not implemented in PDF-based sync",
    );
  }

  /**
   * Get sync history
   */
  getSyncHistory(limit: number = 20): SyncSession[] {
    return this.db.getSyncHistory(limit);
  }

  /**
   * Get last sync session
   */
  getLastSyncSession(): SyncSession | null {
    const sessions = this.db.getSyncHistory(1);
    return sessions.length > 0 ? sessions[0] : null;
  }

  /**
   * Force full sync on next run (for compatibility - always full sync in PDF mode)
   */
  forceFullSync(): void {
    logger.info(
      "[ProductSyncService] forceFullSync called - PDF mode always does full sync",
    );
  }

  /**
   * Get quick hash (for compatibility - returns empty string)
   */
  getQuickHash(): string {
    return "";
  }
}

// Export singleton instance
export const productSyncService = ProductSyncService.getInstance();
