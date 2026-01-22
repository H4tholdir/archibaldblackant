import { EventEmitter } from "events";
import { ArchibaldBot } from "./archibald-bot";
import { CustomerDatabase, Customer } from "./customer-db";
import { pdfParserService, ParsedCustomer } from "./pdf-parser-service";
import { BrowserPool } from "./browser-pool";
import { logger } from "./logger";
import * as fs from "fs";
import * as crypto from "crypto";

export interface SyncProgress {
  stage: string;
  current: number;
  total: number;
  message: string;
  status?: "idle" | "syncing" | "completed" | "error"; // For backward compatibility
}

export type ProgressCallback = (progress: SyncProgress) => void;

export interface SyncResult {
  success: boolean;
  customersProcessed: number;
  newCustomers: number;
  updatedCustomers: number;
  deletedCustomers: number;
  duration: number;
  error?: string;
}

export interface SyncMetrics {
  lastSyncTime: Date | null;
  lastSyncResult: SyncResult | null;
  totalSyncs: number;
  consecutiveFailures: number;
  averageDuration: number;
}

/**
 * Service for syncing customers from Archibald PDF export
 * Replaces old HTML scraping approach with faster, more stable PDF parsing
 */
export class CustomerSyncService extends EventEmitter {
  private static instance: CustomerSyncService;
  private db: CustomerDatabase;
  private browserPool: BrowserPool;
  private syncInProgress = false;
  private lastSyncTime: Date | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private currentProgress: SyncProgress = {
    stage: "idle",
    current: 0,
    total: 0,
    message: "Nessuna sincronizzazione in corso",
    status: "idle",
  };

  // Metrics tracking
  private metrics: SyncMetrics = {
    lastSyncTime: null,
    lastSyncResult: null,
    totalSyncs: 0,
    consecutiveFailures: 0,
    averageDuration: 0,
  };

  private constructor() {
    super();
    this.db = CustomerDatabase.getInstance();
    this.browserPool = BrowserPool.getInstance();
  }

  static getInstance(): CustomerSyncService {
    if (!CustomerSyncService.instance) {
      CustomerSyncService.instance = new CustomerSyncService();
    }
    return CustomerSyncService.instance;
  }

  /**
   * Update progress and emit events
   */
  private updateProgress(progress: SyncProgress): void {
    this.currentProgress = progress;
    this.emit("progress", progress);
  }

  /**
   * Sync customers from Archibald PDF export
   * @param progressCallback Optional callback for progress updates
   * @param userId Optional user ID for browser context (defaults to "customer-sync-service")
   * @returns Sync result summary
   */
  async syncCustomers(
    progressCallback?: ProgressCallback,
    userId?: string,
  ): Promise<SyncResult> {
    // Prevent concurrent syncs
    if (this.syncInProgress) {
      logger.warn("[CustomerSync] Sync already in progress, skipping");
      throw new Error("Customer sync already in progress");
    }

    this.syncInProgress = true;
    const startTime = Date.now();
    let pdfPath: string | null = null;

    try {
      logger.info("[CustomerSync] Starting PDF-based customer sync");

      // Stage 1: Acquire bot context
      const progress1 = {
        stage: "login",
        current: 0,
        total: 5,
        message: "Connessione ad Archibald...",
        status: "syncing" as const,
      };
      this.updateProgress(progress1);
      progressCallback?.(progress1);

      // Use provided userId or default to "customer-sync-service"
      const syncUserId = userId || "customer-sync-service";
      const context = await this.browserPool.acquireContext(syncUserId);
      const bot = new ArchibaldBot(syncUserId);

      // Stage 2: Download PDF
      const progress2 = {
        stage: "download",
        current: 1,
        total: 5,
        message: "Scaricamento PDF clienti...",
      };
      this.updateProgress(progress2);
      progressCallback?.(progress2);

      pdfPath = await bot.downloadCustomersPDF(context);
      logger.info(`[CustomerSync] PDF downloaded: ${pdfPath}`);

      // Stage 3: Parse PDF
      const progress3 = {
        stage: "parse",
        current: 2,
        total: 5,
        message: "Analisi PDF in corso...",
      };
      this.updateProgress(progress3);
      progressCallback?.(progress3);

      const parseResult = await pdfParserService.parsePDF(pdfPath);
      logger.info(
        `[CustomerSync] Parsed ${parseResult.total_customers} customers from PDF`,
      );

      // Stage 4: Delta detection & DB update
      const progress4 = {
        stage: "update",
        current: 3,
        total: 5,
        message: `Aggiornamento ${parseResult.total_customers} clienti...`,
      };
      this.updateProgress(progress4);
      progressCallback?.(progress4);

      const deltaResult = await this.applyDelta(parseResult.customers);

      // Stage 5: Cleanup
      const progress5 = {
        stage: "cleanup",
        current: 4,
        total: 5,
        message: "Finalizzazione...",
      };
      this.updateProgress(progress5);
      progressCallback?.(progress5);

      if (pdfPath) {
        fs.unlinkSync(pdfPath);
        logger.info(`[CustomerSync] Cleaned up temp PDF: ${pdfPath}`);
      }

      // Release browser context
      await this.browserPool.releaseContext(syncUserId, context, true);

      this.lastSyncTime = new Date();

      const duration = Date.now() - startTime;
      const result: SyncResult = {
        success: true,
        customersProcessed: parseResult.total_customers,
        newCustomers: deltaResult.inserted,
        updatedCustomers: deltaResult.updated,
        deletedCustomers: 0, // MVP: no deletions yet
        duration,
      };

      logger.info(`[CustomerSync] Completed in ${duration}ms:`, result);

      const progress6 = {
        stage: "complete",
        current: 5,
        total: 5,
        message: `Completato: ${result.newCustomers} nuovi, ${result.updatedCustomers} aggiornati`,
        status: "completed" as const,
      };
      this.updateProgress(progress6);
      progressCallback?.(progress6);

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error(`[CustomerSync] Failed after ${duration}ms:`, error);

      // Cleanup temp file on error
      if (pdfPath && fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }

      return {
        success: false,
        customersProcessed: 0,
        newCustomers: 0,
        updatedCustomers: 0,
        deletedCustomers: 0,
        duration,
        error: error.message,
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Apply delta changes to database (insert new, update changed)
   * @param pdfCustomers Customers from PDF parser
   * @returns Stats: inserted, updated, skipped
   */
  private async applyDelta(pdfCustomers: ParsedCustomer[]): Promise<{
    inserted: number;
    updated: number;
    skipped: number;
  }> {
    // Convert ParsedCustomers to Customer objects with hashes
    const customersToUpsert = pdfCustomers.map((pdf) => {
      const hash = this.computeHash(pdf);
      return this.mapPDFToCustomer(pdf, hash);
    });

    // Use upsertCustomers which handles the delta detection internally
    const result = this.db.upsertCustomers(customersToUpsert);

    logger.info(
      `[CustomerSync] Delta: ${result.inserted} inserted, ${result.updated} updated, ${result.unchanged} skipped`,
    );

    return {
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.unchanged,
    };
  }

  /**
   * Compute hash from all PDF fields for delta detection
   * @param customer Parsed customer from PDF
   * @returns MD5 hash hex string
   */
  private computeHash(customer: ParsedCustomer): string {
    // Include all 27 business fields in deterministic order (pages 0-7)
    const hashFields = [
      // Page 0: Identification
      customer.customer_profile,
      customer.name,
      customer.vat_number || "",
      // Page 1: Fiscal & Delivery
      customer.pec || "",
      customer.sdi || "",
      customer.fiscal_code || "",
      customer.delivery_terms || "",
      // Page 2: Address
      customer.street || "",
      customer.logistics_address || "",
      customer.postal_code || "",
      customer.city || "",
      // Page 3: Contact & Last Order
      customer.phone || "",
      customer.mobile || "",
      customer.url || "",
      customer.attention_to || "",
      customer.last_order_date || "",
      // Page 4: Order Analytics
      String(customer.actual_order_count ?? ""),
      customer.customer_type || "",
      String(customer.previous_order_count_1 ?? ""),
      // Page 5: Sales Analytics
      String(customer.previous_sales_1 ?? ""),
      String(customer.previous_order_count_2 ?? ""),
      String(customer.previous_sales_2 ?? ""),
      // Page 6: Business Info
      customer.description || "",
      customer.type || "",
      customer.external_account_number || "",
      // Page 7: Internal Account
      customer.our_account_number || "",
    ];

    const data = hashFields.join("|");
    return crypto.createHash("md5").update(data).digest("hex");
  }

  /**
   * Map ParsedCustomer to Customer schema
   * @param pdf Parsed customer from PDF
   * @param hash Computed hash
   * @returns Customer object for DB (without hash and lastSync, handled by upsertCustomers)
   */
  private mapPDFToCustomer(
    pdf: ParsedCustomer,
    hash: string,
  ): Omit<Customer, "hash" | "lastSync"> {
    return {
      customerProfile: pdf.customer_profile,
      name: pdf.name,
      vatNumber: pdf.vat_number || undefined,
      fiscalCode: pdf.fiscal_code || undefined,
      sdi: pdf.sdi || undefined,
      pec: pdf.pec || undefined,
      phone: pdf.phone || undefined,
      mobile: pdf.mobile || undefined,
      url: pdf.url || undefined,
      attentionTo: pdf.attention_to || undefined,
      street: pdf.street || undefined,
      logisticsAddress: pdf.logistics_address || undefined,
      postalCode: pdf.postal_code || undefined,
      city: pdf.city || undefined,
      customerType: pdf.customer_type || undefined,
      type: pdf.type || undefined,
      deliveryTerms: pdf.delivery_terms || undefined,
      description: pdf.description || undefined,
      lastOrderDate: pdf.last_order_date || undefined,
      actualOrderCount: pdf.actual_order_count ?? undefined,
      previousOrderCount1: pdf.previous_order_count_1 ?? undefined,
      previousSales1: pdf.previous_sales_1 ?? undefined,
      previousOrderCount2: pdf.previous_order_count_2 ?? undefined,
      previousSales2: pdf.previous_sales_2 ?? undefined,
      externalAccountNumber: pdf.external_account_number || undefined,
      ourAccountNumber: pdf.our_account_number || undefined,
    };
  }

  /**
   * Get last sync timestamp
   */
  getLastSyncTime(): Date | null {
    return this.lastSyncTime;
  }

  /**
   * Check if sync is currently running
   */
  isSyncInProgress(): boolean {
    return this.syncInProgress;
  }

  /**
   * Get current progress (for compatibility with old interface)
   */
  getProgress(): SyncProgress {
    return this.currentProgress;
  }

  /**
   * Request sync stop (for compatibility - not implemented in MVP)
   */
  requestStop(): void {
    logger.warn(
      "[CustomerSync] requestStop called but not implemented in PDF-based sync",
    );
  }

  /**
   * Start automatic background sync
   * @param intervalMinutes Sync frequency in minutes (default: 30)
   */
  startAutoSync(intervalMinutes: number = 30): void {
    if (this.syncInterval) {
      logger.warn("[CustomerSync] Auto-sync already running");
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    logger.info(
      `[CustomerSync] Starting auto-sync every ${intervalMinutes} minutes`,
    );

    // Initial sync after 5s (let server stabilize)
    setTimeout(() => {
      this.runBackgroundSync();
    }, 5000);

    // Recurring sync
    this.syncInterval = setInterval(() => {
      this.runBackgroundSync();
    }, intervalMs);

    logger.info("[CustomerSync] Auto-sync scheduler started");
  }

  /**
   * Stop automatic background sync
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info("[CustomerSync] Auto-sync scheduler stopped");
    }
  }

  /**
   * Run background sync with retry logic
   * @private
   */
  private async runBackgroundSync(): Promise<void> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        logger.info(
          `[CustomerSync] Background sync attempt ${attempt + 1}/${maxRetries}`,
        );

        const result = await this.syncCustomers();

        // Update metrics
        this.updateMetrics(result);

        if (result.success) {
          logger.info("[CustomerSync] Background sync successful:", {
            new: result.newCustomers,
            updated: result.updatedCustomers,
            duration: result.duration,
          });

          // Reset failure counter on success
          this.metrics.consecutiveFailures = 0;
          return;
        } else {
          throw new Error(result.error || "Sync failed");
        }
      } catch (error: any) {
        attempt++;
        logger.error(
          `[CustomerSync] Background sync failed (attempt ${attempt}):`,
          error,
        );

        if (attempt < maxRetries) {
          // Exponential backoff: 5s, 10s, 20s
          const delayMs = 5000 * Math.pow(2, attempt - 1);
          logger.info(`[CustomerSync] Retrying in ${delayMs / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          // All retries exhausted
          logger.error("[CustomerSync] All retries exhausted, giving up");
          this.metrics.consecutiveFailures++;

          // Alert if 3 consecutive background syncs failed
          if (this.metrics.consecutiveFailures >= 3) {
            logger.error(
              "🚨 [CustomerSync] ALERT: 3 consecutive sync failures detected!",
            );
            // TODO: Send alert (email, Slack, etc.) - deferred to Phase 25
          }
        }
      }
    }
  }

  /**
   * Update sync metrics
   * @private
   */
  private updateMetrics(result: SyncResult): void {
    this.metrics.lastSyncTime = new Date();
    this.metrics.lastSyncResult = result;
    this.metrics.totalSyncs++;

    // Update average duration (rolling average)
    if (this.metrics.averageDuration === 0) {
      this.metrics.averageDuration = result.duration;
    } else {
      this.metrics.averageDuration =
        (this.metrics.averageDuration * (this.metrics.totalSyncs - 1) +
          result.duration) /
        this.metrics.totalSyncs;
    }
  }

  /**
   * Get sync metrics (for monitoring endpoint)
   */
  getMetrics(): SyncMetrics {
    return { ...this.metrics };
  }

  /**
   * Get quick hash (for compatibility - returns empty string in MVP)
   */
  getQuickHash(): string {
    return "";
  }

  /**
   * Smart Customer Sync: fast, on-demand sync for order form.
   * Optimized for 3-5 second completion time.
   * @param userId User ID for browser context
   */
  async smartSync(userId?: string): Promise<SyncResult> {
    logger.info("[CustomerSync] Smart sync triggered", { userId });
    // For now, use the same implementation as regular sync
    // In future iterations, this could be optimized with:
    // - Smaller page size
    // - Skip unchanged records
    // - Parallel processing
    return this.syncCustomers(undefined, userId);
  }

  /**
   * Pause sync (for PriorityManager compatibility)
   */
  async pause(): Promise<void> {
    logger.info("[CustomerSync] Pause requested");
    // Wait for current sync to complete if running
    while (this.syncInProgress) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Resume sync (for PriorityManager compatibility)
   */
  resume(): void {
    logger.info("[CustomerSync] Resume requested");
  }
}

// Singleton instance
export const customerSyncService = CustomerSyncService.getInstance();
