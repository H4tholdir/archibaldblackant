import { Page } from "puppeteer";
import { logger } from "./logger";
import { config } from "./config";
import { OrderDatabaseNew, type OrderRecord } from "./order-db-new";
import { DDTDatabase, type DDTRecord } from "./ddt-db";
import { InvoicesDatabase } from "./invoices-db";
import type { DDTData } from "./ddt-scraper-service";
import { EventEmitter } from "events";

/**
 * Options for fetching order list
 */
export interface OrderListOptions {
  limit?: number; // Max orders to fetch (default: 100)
  offset?: number; // Pagination offset (default: 0)
  filters?: OrderFilters; // Customer, date range, status (Plan 10-05)
}

/**
 * Filters for order list (to be implemented in Plan 10-05)
 */
export interface OrderFilters {
  customer?: string; // Customer name search (partial match)
  dateFrom?: string; // ISO date (e.g., "2024-01-01")
  dateTo?: string; // ISO date
  status?: string; // e.g., "In lavorazione", "Evaso", "Spedito"
}

/**
 * Result from getOrderList()
 */
export interface OrderListResult {
  orders: Order[];
  total: number;
  hasMore: boolean;
}

/**
 * DDT (Documento di Trasporto) information
 */
export interface DDTInfo {
  ddtId?: string | null;
  ddtNumber?: string | null;
  ddtDeliveryDate?: string | null;
  orderId?: string | null;
  customerAccountId?: string | null;
  salesName?: string | null;
  deliveryName?: string | null;
  deliveryTerms?: string | null;
  deliveryMethod?: string | null;
  deliveryCity?: string | null;
  // Tracking fields (nested in DDT)
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  trackingCourier?: string | null;
}

/**
 * Document info (invoice, DDT PDF, etc.)
 */
export interface DocumentInfo {
  type: string;
  name: string;
  url: string;
  filename?: string;
  uploadedAt?: string;
}

/**
 * Single order in list view
 * UPDATED: Uses nested DDT structure to match frontend (fixes Problem #1)
 */
export interface Order {
  // All 20 columns from SALESTABLE_ListView_Agent table
  id: string; // Col 0: ID interno
  orderNumber: string; // Col 1: ID di vendita (e.g., "ORD/26000405")
  customerProfileId: string; // Col 2: Profilo cliente (e.g., "1002209")
  customerName: string; // Col 3: Nome vendite
  deliveryName?: string; // Col 4: Nome di consegna
  deliveryAddress?: string; // Col 5: Indirizzo di consegna
  creationDate: string; // Col 6: Data di creazione (ISO 8601)
  deliveryDate: string; // Col 7: Data di consegna (ISO 8601)
  remainingSalesFinancial?: string | null; // Col 8: Rimani vendite finanziarie
  customerReference?: string | null; // Col 9: Riferimento cliente
  salesStatus?: string | null; // Col 10: Stato delle vendite
  orderType?: string | null; // Col 11: Tipo di ordine
  documentStatus?: string | null; // Col 12: Stato del documento
  salesOrigin?: string | null; // Col 13: Origine vendite
  transferStatus?: string | null; // Col 14: Stato del trasferimento
  transferDate?: string | null; // Col 15: Data di trasferimento
  completionDate?: string | null; // Col 16: Data di completamento
  discountPercent?: string | null; // Col 17: Applica sconto %
  grossAmount?: string | null; // Col 18: Importo lordo
  totalAmount?: string | null; // Col 19: Importo totale

  // Legacy field (for backward compatibility)
  status: string; // Required field, can't be undefined

  // Nested DDT object (replaces flat fields - Problem #1 fix)
  ddt?: DDTInfo;

  // Invoice information
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  invoiceAmount?: string | null;

  // Current state tracking
  currentState?: string | null;

  // Tracking is NO LONGER separate (user decision: removed duplicate)
  // Use ddt.trackingXxx fields instead

  // Items, timeline, documents (populated on-demand or at creation)
  items?: OrderItem[];
  stateTimeline?: StatusUpdate[];
  documents?: DocumentInfo[];

  // Metadata
  botUserId?: string;
  lastUpdatedAt?: string;
}

/**
 * Internal scraping result from page.evaluate()
 * Uses plain types (any[]) because page.evaluate runs in browser context
 * where TypeScript types are not available
 */
interface ScrapeResult {
  success: boolean;
  error: string | null;
  orders: any[]; // Will be cast to Order[] after returning from browser
}

/**
 * Complete order detail with items and timeline
 */
export interface OrderDetail {
  id: string; // Internal ID (e.g., "70.309")
  orderNumber: string; // e.g., "ORD/26000374"
  date: string; // Creation date ISO 8601
  deliveryDate: string; // Delivery date ISO 8601
  customerName: string; // Seller name
  customerProfileId: string; // Customer profile code
  customerAddress?: string; // Full delivery address
  customerEmail?: string; // Delivery email
  customerReference?: string; // Customer reference
  status: string; // Current status (e.g., "Consegnato")
  documentStatus?: string; // Document status (e.g., "Documento di trasporto")
  transferStatus?: string; // Transfer status (e.g., "Trasferito")
  transferDate?: string; // Transfer date ISO 8601
  completionDate?: string; // Completion date ISO 8601
  items: OrderItem[]; // Article list
  statusTimeline: StatusUpdate[]; // Status history
  tracking?: TrackingInfo; // Shipping tracking (Plan 10-04)
  documents?: OrderDocument[]; // Documents (DDT, invoices) (Plan 10-04)
}

/**
 * Single item/article in order
 */
export interface OrderItem {
  articleCode: string; // e.g., "0180480"
  articleName: string; // Product description
  quantity: number; // Quantity ordered
  unitPrice: string; // Unit price with € symbol
  subtotal: string; // Line total with € symbol
  discount?: string; // Discount % if visible
}

/**
 * Status update in timeline
 */
export interface StatusUpdate {
  status: string; // Status name
  timestamp: string; // ISO 8601
  note?: string; // Optional note
}

/**
 * Shipping tracking information
 */
export interface TrackingInfo {
  courier: string; // Courier name (e.g., "fedex", "fidex")
  trackingNumber: string; // Tracking number
  trackingUrl?: string; // Full tracking URL if available
}

/**
 * Order document (invoice, DDT, etc.)
 */
export interface OrderDocument {
  type: "invoice" | "ddt" | "other"; // Document type
  name: string; // Document name/reference
  url: string; // Document URL (PDF link)
  date?: string; // Document date ISO 8601 (if available)
}

/**
 * Service for scraping order history from Archibald
 * Refactored to use ArchibaldBot pattern from customer-sync-service.ts
 *
 * KEY CHANGES (2026-01-15):
 * - Use ArchibaldBot instead of BrowserPool directly
 * - Direct navigation to URL with waitUntil: "networkidle2" (like customer sync)
 * - Simplified scraping with table tbody tr selector (no complex DevExpress selectors)
 */
export interface SyncProgressEvent {
  phase: "init" | "step1" | "step2" | "step3" | "completed";
  percentage: number;
  message: string;
  itemsProcessed?: number;
}

export class OrderHistoryService {
  public orderDb: OrderDatabaseNew; // Public for force-sync endpoint access
  private readonly SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  private progressEmitter: EventEmitter;

  constructor() {
    this.orderDb = OrderDatabaseNew.getInstance();
    this.progressEmitter = new EventEmitter();
  }

  /**
   * Allow external listeners to track sync progress
   */
  public onProgress(callback: (progress: SyncProgressEvent) => void): void {
    this.progressEmitter.on("progress", callback);
  }

  /**
   * Emit progress event (for internal use)
   */
  private emitProgress(progress: SyncProgressEvent): void {
    this.progressEmitter.emit("progress", progress);
  }

  /**
   * Get order list - Cache-first strategy with incremental sync
   *
   * Strategy:
   * 1. Try DB first (fast path)
   * 2. If DB empty OR last sync > 10min ago → scrape from Archibald
   * 3. Save new orders to DB
   * 4. Return from DB
   *
   * @param userId User ID for multi-user ArchibaldBot mode
   * @param options Pagination and filter options
   * @returns OrderListResult with orders, total, and hasMore flag
   */
  async getOrderList(
    userId: string,
    options?: OrderListOptions & { skipSync?: boolean },
  ): Promise<OrderListResult> {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    const filters = options?.filters;
    const skipSync = options?.skipSync || false;

    logger.info(
      `[OrderHistoryService] Fetching order list for user ${userId} (limit: ${limit}, offset: ${offset}, skipSync: ${skipSync})`,
    );

    try {
      // Check if we need to sync from Archibald (only if not skipping)
      if (!skipSync) {
        const needsSync = await this.needsSync(userId);

        if (needsSync) {
          logger.info(
            "[OrderHistoryService] DB empty or stale, syncing from Archibald...",
          );
          await this.syncFromArchibald(userId);
        } else {
          logger.info("[OrderHistoryService] Using cached orders from DB");
        }
      } else {
        logger.info(
          "[OrderHistoryService] Skipping sync check, using cached orders from DB",
        );
      }

      // Always return from DB (cache-first)
      const dbOrders = this.orderDb.getOrdersByUser(userId, {
        limit,
        offset,
        status: filters?.status,
        customer: filters?.customer,
        dateFrom: filters?.dateFrom,
        dateTo: filters?.dateTo,
      });

      const total = this.orderDb.countOrders(userId, {
        status: filters?.status,
        customer: filters?.customer,
        dateFrom: filters?.dateFrom,
        dateTo: filters?.dateTo,
      });

      const hasMore = offset + limit < total;

      logger.info(
        `[OrderHistoryService] Returning ${dbOrders.length} orders from DB (total: ${total}, hasMore: ${hasMore})`,
      );

      // Enrich orders with DDT and invoice data from separate databases
      const ddtDb = DDTDatabase.getInstance();
      const invoicesDb = InvoicesDatabase.getInstance();
      logger.info(
        `[OrderHistoryService] Enriching ${dbOrders.length} orders with DDT and invoice data`,
      );

      const enrichedOrders = dbOrders.map((order) => {
        // Load DDT for this order
        const ddts = ddtDb.getDDTsByOrderNumber(order.orderNumber);
        const ddt = ddts.length > 0 ? ddts[0] : null; // Take first DDT if multiple exist

        // Load invoices for this order
        const invoices = invoicesDb.getInvoicesByOrderNumber(order.orderNumber);
        const invoice = invoices.length > 0 ? invoices[0] : null; // Take first invoice if multiple exist

        let enrichedOrder: OrderRecord = { ...order };

        if (ddt) {
          logger.debug(
            `[OrderHistoryService] Found DDT ${ddt.ddtNumber} for order ${order.orderNumber}`,
          );
          // Enrich order with DDT fields
          enrichedOrder = {
            ...enrichedOrder,
            ddtId: ddt.id,
            ddtNumber: ddt.ddtNumber,
            ddtDeliveryDate: ddt.deliveryDate,
            ddtOrderNumber: ddt.orderNumber,
            ddtCustomerAccount: ddt.customerAccount,
            ddtSalesName: ddt.salesName,
            ddtDeliveryName: ddt.deliveryName,
            trackingNumber: ddt.trackingNumber,
            deliveryTerms: ddt.deliveryTerms,
            deliveryMethod: ddt.deliveryMethod,
            deliveryCity: ddt.deliveryCity,
            trackingUrl: ddt.trackingUrl,
            trackingCourier: ddt.trackingCourier,
          } as OrderRecord;
        }

        if (invoice) {
          logger.debug(
            `[OrderHistoryService] Found invoice ${invoice.invoiceNumber} for order ${order.orderNumber}`,
          );
          // Enrich order with invoice fields
          enrichedOrder = {
            ...enrichedOrder,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            invoiceAmount: invoice.totalAmount || invoice.amount,
          } as OrderRecord;
        }

        return enrichedOrder;
      });

      // Convert OrderRecord to Order (transform flat DDT to nested structure)
      const orders: Order[] = enrichedOrders.map(this.storedOrderToOrder);

      return {
        orders,
        total,
        hasMore,
      };
    } catch (error) {
      logger.error(
        `[OrderHistoryService] Error fetching order list for user ${userId}`,
        {
          error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );

      // Fallback: try to return from DB even on error
      try {
        const dbOrders = this.orderDb.getOrdersByUser(userId, {
          limit,
          offset,
        });
        const total = this.orderDb.countOrders(userId);

        // Enrich with DDT and invoice data
        const ddtDb = DDTDatabase.getInstance();
        const invoicesDb = InvoicesDatabase.getInstance();
        const enrichedOrders = dbOrders.map((order) => {
          const ddts = ddtDb.getDDTsByOrderNumber(order.orderNumber);
          const ddt = ddts.length > 0 ? ddts[0] : null;

          const invoices = invoicesDb.getInvoicesByOrderNumber(
            order.orderNumber,
          );
          const invoice = invoices.length > 0 ? invoices[0] : null;

          let enrichedOrder: OrderRecord = { ...order };

          if (ddt) {
            enrichedOrder = {
              ...enrichedOrder,
              ddtId: ddt.id,
              ddtNumber: ddt.ddtNumber,
              ddtDeliveryDate: ddt.deliveryDate,
              ddtOrderNumber: ddt.orderNumber,
              ddtCustomerAccount: ddt.customerAccount,
              ddtSalesName: ddt.salesName,
              ddtDeliveryName: ddt.deliveryName,
              trackingNumber: ddt.trackingNumber,
              deliveryTerms: ddt.deliveryTerms,
              deliveryMethod: ddt.deliveryMethod,
              deliveryCity: ddt.deliveryCity,
              trackingUrl: ddt.trackingUrl,
              trackingCourier: ddt.trackingCourier,
            } as OrderRecord;
          }

          if (invoice) {
            enrichedOrder = {
              ...enrichedOrder,
              invoiceNumber: invoice.invoiceNumber,
              invoiceDate: invoice.invoiceDate,
              invoiceAmount: invoice.totalAmount || invoice.amount,
            } as OrderRecord;
          }

          return enrichedOrder;
        });

        return {
          orders: enrichedOrders.map(this.storedOrderToOrder),
          total,
          hasMore: offset + limit < total,
        };
      } catch {
        // Return empty result on error (graceful degradation)
        return {
          orders: [],
          total: 0,
          hasMore: false,
        };
      }
    }
  }

  /**
   * Check if we need to sync from Archibald
   * Returns true if DB is empty or last sync was > 10 minutes ago
   */
  private async needsSync(userId: string): Promise<boolean> {
    const lastScraped = this.orderDb.getLastScrapedTimestamp(userId);

    if (!lastScraped) {
      // DB empty - need initial sync
      return true;
    }

    const lastScrapedMs = new Date(lastScraped).getTime();
    const ageMs = Date.now() - lastScrapedMs;

    // Sync if older than threshold
    return ageMs > this.SYNC_INTERVAL_MS;
  }

  /**
   * Sync orders from Archibald and save to DB
   * UNIFIED STRATEGY: Scrape order list, DDT data, and order details in one session
   * All data is matched and combined before saving to DB
   *
   * INTELLIGENT SYNC:
   * - First sync: Scrapes from beginning of current year
   * - Subsequent syncs: Stops when reaching orders already synced 30+ days ago
   */
  public async syncFromArchibald(userId: string): Promise<void> {
    let bot = null;

    try {
      // Emit: Initializing (10%)
      this.emitProgress({
        phase: "init",
        percentage: 10,
        message: "Inizializzazione browser e login...",
      });

      // Use legacy ArchibaldBot for system sync operations (like customer-sync)
      const { ArchibaldBot } = await import("./archibald-bot");
      bot = new ArchibaldBot(); // No userId = legacy mode
      await bot.initialize();
      await bot.login(); // Uses config credentials

      // Verify page exists
      if (!bot.page) {
        throw new Error("Browser page is null after initialization");
      }

      logger.info(
        "[OrderHistoryService] ArchibaldBot initialized (legacy mode), starting unified sync...",
      );

      // Step 1/3: Scrape order list (with intelligent stop)
      this.emitProgress({
        phase: "step1",
        percentage: 20,
        message: "Step 1/3: Lettura lista ordini da Archibald...",
      });

      logger.info("[OrderHistoryService] Step 1/3: Scraping order list");
      const allOrders = await this.scrapeOrderList(bot.page, userId);
      logger.info(
        `[OrderHistoryService] Scraped ${allOrders.length} orders from order list`,
      );

      // Emit: Step 1 completed (40%)
      this.emitProgress({
        phase: "step1",
        percentage: 40,
        message: `Step 1/3 completato: ${allOrders.length} ordini trovati`,
        itemsProcessed: allOrders.length,
      });

      // Step 2/3: Scrape DDT data (only for orders we just scraped)
      this.emitProgress({
        phase: "step2",
        percentage: 50,
        message: "Step 2/3: Lettura dati DDT (documenti di trasporto)...",
      });

      logger.info("[OrderHistoryService] Step 2/3: Scraping DDT data");
      // Use orderNumber when available (orders with ORD/), fallback to id for orders without ORD/ (piazzato state)
      const orderNumbers = allOrders.map((o) => o.orderNumber || o.id);
      const ddtData = await this.scrapeDDTData(bot.page, orderNumbers);
      logger.info(
        `[OrderHistoryService] Scraped ${ddtData.length} DDT entries (filtered for ${orderNumbers.length} orders)`,
      );

      // Emit: Step 2 completed (75%)
      this.emitProgress({
        phase: "step2",
        percentage: 75,
        message: `Step 2/3 completato: ${ddtData.length} DDT trovati`,
        itemsProcessed: ddtData.length,
      });

      // Step 3/3: Enrich orders with details and DDT data
      this.emitProgress({
        phase: "step3",
        percentage: 85,
        message: "Step 3/3: Arricchimento ordini con dettagli...",
      });

      logger.info(
        "[OrderHistoryService] Step 3/3: Enriching orders with details and DDT data",
      );
      const enrichedOrders = await this.enrichOrdersWithDetails(
        bot.page,
        allOrders,
        ddtData,
        userId,
      );
      logger.info(
        `[OrderHistoryService] Enriched ${enrichedOrders.length} orders with full details`,
      );

      // Save to DB (upsert - updates existing, inserts new)
      this.orderDb.upsertOrders(userId, enrichedOrders);

      logger.info(
        `[OrderHistoryService] Unified sync completed: ${enrichedOrders.length} orders with full details saved to DB`,
      );

      // Emit: Completed (100%)
      this.emitProgress({
        phase: "completed",
        percentage: 100,
        message: `Sincronizzazione completata: ${enrichedOrders.length} ordini sincronizzati`,
        itemsProcessed: enrichedOrders.length,
      });
    } catch (error) {
      logger.error(
        `[OrderHistoryService] Error syncing from Archibald for user ${userId}`,
        {
          error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      throw error; // Re-throw so caller knows sync failed
    } finally {
      if (bot) {
        // Close bot after operation (releases context)
        await bot.close();
      }
    }
  }

  /**
   * Step 1: Scrape order list from SALESTABLE_ListView_Agent
   * Returns base order data without details or DDT info
   *
   * INTELLIGENT SYNC:
   * - Scrapes from beginning of current year
   * - Stops when reaching orders already synced 30+ days ago
   *
   * @param page - Puppeteer page with active session
   * @param userId - User ID for DB lookup (optional for early termination)
   */
  private async scrapeOrderList(page: Page, userId?: string): Promise<Order[]> {
    // Navigate to order list page
    const orderListUrl = `${config.archibald.url}/SALESTABLE_ListView_Agent/`;

    await page.goto(orderListUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    logger.info(`[OrderHistoryService] Navigated to ${orderListUrl}`);

    // Wait for table to be present
    await page.waitForSelector("table", { timeout: 10000 });

    // Wait for DevExpress table to be fully loaded
    await this.waitForDevExpressTableReady(page);

    // Additional wait for dynamic content
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Ensure "Tutti gli ordini" filter is selected
    await this.ensureAllOrdersFilterSelected(page);

    // Navigate to page 1
    await this.navigateToFirstPage(page);

    // Sort table by creation date DESC (newest first)
    await this.sortTableByCreationDate(page);

    // Scrape orders with intelligent stop (pass userId for DB lookup)
    const allOrders = await this.scrapeAllPages(
      page,
      Number.MAX_SAFE_INTEGER,
      userId,
    );

    return allOrders;
  }

  /**
   * Step 2: Scrape DDT data from CUSTPACKINGSLIPJOUR_ListView
   * Only scrapes DDT entries that match the provided order numbers
   *
   * INTELLIGENT SYNC:
   * - Inherits date filtering from order list (only DDT for current year orders)
   * - Early exit when all matching DDT entries found
   *
   * @param page Browser page with active session
   * @param orderNumbers Array of order numbers to match (e.g., ["ORD/26000552"])
   * @returns DDT entries with tracking info (filtered by orderNumbers)
   */
  private async scrapeDDTData(
    page: Page,
    orderNumbers: string[],
  ): Promise<DDTData[]> {
    const ddtUrl = `${config.archibald.url}/CUSTPACKINGSLIPJOUR_ListView/`;

    await page.goto(ddtUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    logger.info(`[OrderHistoryService] Navigated to ${ddtUrl}`);

    // Wait for table to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Ensure we're on page 1 and table is loaded
    await this.ensureDDTPageOne(page);

    // Create a Set for O(1) lookup performance
    const orderNumberSet = new Set(orderNumbers);

    const allDDT: DDTData[] = [];
    let pageNum = 1;
    let matchedCount = 0;
    let consecutiveEmptyPages = 0;
    const CONSECUTIVE_EMPTY_PAGES_LIMIT = 10; // Stop if 10 consecutive pages with no matches

    do {
      logger.info(
        `[OrderHistoryService] Scraping DDT page ${pageNum} (matched ${matchedCount}/${orderNumbers.length} so far)`,
      );

      const pageData = await this.scrapeDDTPage(page);

      // Filter: only keep DDT entries that match our order numbers
      const matchedDDT = pageData.filter((ddt) =>
        orderNumberSet.has(ddt.orderId),
      );

      allDDT.push(...matchedDDT);
      matchedCount = allDDT.length;

      logger.info(
        `[OrderHistoryService] Found ${matchedDDT.length}/${pageData.length} matching DDT entries on page ${pageNum}`,
      );

      // Track consecutive empty pages for early stop optimization
      if (matchedDDT.length === 0) {
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= CONSECUTIVE_EMPTY_PAGES_LIMIT) {
          logger.info(
            `[OrderHistoryService] No matching DDT found in last ${CONSECUTIVE_EMPTY_PAGES_LIMIT} consecutive pages, stopping early at page ${pageNum}`,
          );
          break;
        }
      } else {
        consecutiveEmptyPages = 0; // Reset counter when we find matches
      }

      // Early exit optimization: if we've found DDT for all orders, stop scraping
      if (matchedCount >= orderNumbers.length) {
        logger.info(
          `[OrderHistoryService] Found DDT for all ${orderNumbers.length} orders, stopping early at page ${pageNum}`,
        );
        break;
      }

      const hasNext = await this.hasNextPageDDT(page);
      if (!hasNext) break;

      await this.clickNextPageDDT(page);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      pageNum++;
    } while (pageNum <= 100); // Safety limit (increased to match order scraper)

    logger.info(
      `[OrderHistoryService] DDT scraping complete: ${matchedCount}/${orderNumbers.length} orders have DDT data`,
    );

    return allDDT;
  }

  /**
   * Step 3: Enrich orders with details and match DDT data
   * Processes orders in batches to avoid overwhelming the system
   */
  private async enrichOrdersWithDetails(
    page: Page,
    orders: Order[],
    ddtData: DDTData[],
    userId: string,
  ): Promise<OrderRecord[]> {
    const BATCH_SIZE = 5; // Process 5 orders at a time
    const results: OrderRecord[] = [];

    logger.info(
      `[OrderHistoryService] Enriching ${orders.length} orders in batches of ${BATCH_SIZE}`,
    );

    for (let i = 0; i < orders.length; i += BATCH_SIZE) {
      const batch = orders.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(orders.length / BATCH_SIZE);

      logger.info(
        `[OrderHistoryService] Processing batch ${batchNum}/${totalBatches} (${batch.length} orders)`,
      );

      for (const order of batch) {
        try {
          // Match DDT data by Order Number (orderNumber ↔ orderId)
          // For orders without ORD/ (piazzato state), match by id
          const orderIdentifier = order.orderNumber || order.id;
          const ddt = ddtData.find((d) => d.orderId === orderIdentifier);

          if (ddt) {
            logger.info(
              `[OrderHistoryService] Matched DDT ${ddt.ddtNumber} to order ${orderIdentifier}`,
            );
          }

          // SKIP detail scraping - we have all data from Order List + DDT
          // const detail = await this.scrapeOrderDetailFromPage(page, order.id);

          // Build enriched order with all DDT fields (explicitly set all OrderRecord fields)
          const enrichedOrder: OrderRecord = {
            // Order List fields (20 columns) - convert undefined to null for OrderRecord compatibility
            id: order.id,
            orderNumber: order.orderNumber,
            customerProfileId: order.customerProfileId,
            customerName: order.customerName,
            deliveryName: order.deliveryName || "",
            deliveryAddress: order.deliveryAddress || "",
            creationDate: order.creationDate,
            deliveryDate: order.deliveryDate,
            remainingSalesFinancial: order.remainingSalesFinancial ?? null,
            customerReference: order.customerReference ?? null,
            salesStatus: order.salesStatus ?? null,
            orderType: order.orderType ?? null,
            documentStatus: order.documentStatus ?? null,
            salesOrigin: order.salesOrigin ?? null,
            transferStatus: order.transferStatus ?? null,
            transferDate: order.transferDate ?? null,
            completionDate: order.completionDate ?? null,
            discountPercent: order.discountPercent ?? null,
            grossAmount: order.grossAmount ?? null,
            totalAmount: order.totalAmount ?? null,
            status: order.status,

            // Metadata
            userId,
            lastScraped: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            lastSync: Date.now(),
            isOpen: order.status.toLowerCase().includes("aperto"),
            detailJson: null,
            sentToMilanoAt: null,
            currentState: "unknown",

            // DDT fields (all 11 columns)
            ddtId: ddt?.ddtId || null,
            ddtNumber: ddt?.ddtNumber || null,
            ddtDeliveryDate: ddt?.ddtDeliveryDate || null,
            ddtOrderNumber: ddt?.orderId || null,
            ddtCustomerAccount: ddt?.customerAccountId || null,
            ddtSalesName: ddt?.salesName || null,
            ddtDeliveryName: ddt?.deliveryName || null,
            trackingNumber: ddt?.trackingNumber || null,
            deliveryTerms: ddt?.deliveryTerms || null,
            deliveryMethod: ddt?.deliveryMethod || null,
            deliveryCity: ddt?.deliveryCity || null,
            trackingUrl: ddt?.trackingUrl || null,
            trackingCourier: ddt?.trackingCourier || null,

            // Invoice fields
            invoiceNumber: null,
          };

          results.push(enrichedOrder);
        } catch (error) {
          logger.error(
            `[OrderHistoryService] Error enriching order ${order.id}`,
            { error },
          );

          // Add order without detail on error (graceful degradation)
          const fallbackOrder: OrderRecord = {
            // Order List fields (20 columns) - convert undefined to null for OrderRecord compatibility
            id: order.id,
            orderNumber: order.orderNumber,
            customerProfileId: order.customerProfileId,
            customerName: order.customerName,
            deliveryName: order.deliveryName || "",
            deliveryAddress: order.deliveryAddress || "",
            creationDate: order.creationDate,
            deliveryDate: order.deliveryDate,
            remainingSalesFinancial: order.remainingSalesFinancial ?? null,
            customerReference: order.customerReference ?? null,
            salesStatus: order.salesStatus ?? null,
            orderType: order.orderType ?? null,
            documentStatus: order.documentStatus ?? null,
            salesOrigin: order.salesOrigin ?? null,
            transferStatus: order.transferStatus ?? null,
            transferDate: order.transferDate ?? null,
            completionDate: order.completionDate ?? null,
            discountPercent: order.discountPercent ?? null,
            grossAmount: order.grossAmount ?? null,
            totalAmount: order.totalAmount ?? null,
            status: order.status,

            // Metadata
            userId,
            lastScraped: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            lastSync: Date.now(),
            isOpen: order.status.toLowerCase().includes("aperto"),
            detailJson: null,
            sentToMilanoAt: null,
            currentState: "unknown",

            // DDT fields (all null in fallback)
            ddtId: null,
            ddtNumber: null,
            ddtDeliveryDate: null,
            ddtOrderNumber: null,
            ddtCustomerAccount: null,
            ddtSalesName: null,
            ddtDeliveryName: null,
            trackingNumber: null,
            deliveryTerms: null,
            deliveryMethod: null,
            deliveryCity: null,
            trackingUrl: null,
            trackingCourier: null,

            // Invoice fields
            invoiceNumber: null,
          };

          results.push(fallbackOrder);
        }
      }
    }

    return results;
  }

  /**
   * Navigate to page 1 of the order list
   * ALWAYS clicks page 1 button to ensure we're on the correct page
   * Includes scroll trigger to ensure table loads properly
   */
  private async navigateToFirstPage(page: Page): Promise<void> {
    try {
      logger.info("[OrderHistoryService] FORCING navigation to page 1...");

      // Scroll to table to trigger any lazy loading
      await page.evaluate(() => {
        const table = document.querySelector("table");
        if (table) {
          table.scrollIntoView({ behavior: "auto", block: "start" });
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // ALWAYS click page 1 button (don't just check)
      logger.info("[OrderHistoryService] Clicking page 1 button...");
      const clickedPageOne = await page.evaluate(() => {
        // Strategy 1: Look for button with text "1"
        const pageButtons = Array.from(
          document.querySelectorAll(
            'div[id*="DXDataPager"] div.dxp-num, div[id*="DXDataPager"] span',
          ),
        );

        for (const button of pageButtons) {
          const text = button.textContent?.trim();
          if (text === "1") {
            (button as HTMLElement).click();
            return true;
          }
        }

        // Strategy 2: Look for "First" button (<<)
        const firstButtons = Array.from(
          document.querySelectorAll('div[id*="DXDataPager"] *'),
        );

        for (const btn of firstButtons) {
          const text = btn.textContent?.trim();
          if (text?.includes("<<") || text?.includes("First")) {
            (btn as HTMLElement).click();
            return true;
          }
        }

        // Strategy 3: Look for any clickable element with "1" in pager area
        const allPagerElements = Array.from(
          document.querySelectorAll('div[id*="Pager"] *'),
        );

        for (const elem of allPagerElements) {
          if (elem.textContent?.trim() === "1") {
            (elem as HTMLElement).click();
            return true;
          }
        }

        return false;
      });

      if (!clickedPageOne) {
        logger.error(
          "[OrderHistoryService] FAILED to find and click page 1 button!",
        );
        // Continue anyway, might already be on page 1
      } else {
        logger.info("[OrderHistoryService] Successfully clicked page 1 button");
      }

      // Wait for table to reload after click
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Scroll to trigger loading
      await page.evaluate(() => {
        const table = document.querySelector("table tbody");
        if (table) {
          window.scrollBy(0, 150);
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      await page.evaluate(() => {
        window.scrollBy(0, -150);
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Wait for table rows
      await page.waitForSelector("table tbody tr", { timeout: 15000 });

      // Verify we're on page 1
      const finalPage = await page.evaluate(() => {
        const pageSpan = document.querySelector('span[id*="DXDataPager_PSI"]');
        return pageSpan?.textContent?.trim() || "?";
      });

      logger.info(
        `[OrderHistoryService] Final page after navigation: ${finalPage}`,
      );
    } catch (error) {
      logger.error("[OrderHistoryService] Error navigating to page 1", {
        error,
      });
      throw error; // Re-throw to stop sync if page 1 navigation fails
    }
  }

  /**
   * Convert OrderRecord (DB) to Order (API response)
   * Transforms flat DDT/tracking fields into nested structure
   *
   * FIXES Problem #1: DDT/Tracking Structure Mismatch
   * - Backend stores flat fields (ddtNumber, trackingNumber, etc.)
   * - Frontend expects nested ddt object with all fields including tracking
   * - Removed separate tracking object (user decision: Option A)
   */
  private storedOrderToOrder(stored: OrderRecord): Order {
    // Build nested DDT object when DDT data exists
    const ddt = stored.ddtNumber
      ? {
          ddtId: stored.ddtId,
          ddtNumber: stored.ddtNumber,
          ddtDeliveryDate: stored.ddtDeliveryDate,
          orderId: stored.ddtOrderNumber,
          customerAccountId: stored.ddtCustomerAccount,
          salesName: stored.ddtSalesName,
          deliveryName: stored.ddtDeliveryName,
          deliveryTerms: stored.deliveryTerms,
          deliveryMethod: stored.deliveryMethod,
          deliveryCity: stored.deliveryCity,
          // Include tracking fields in DDT object (user decision: remove duplicate tracking)
          trackingNumber: stored.trackingNumber,
          trackingUrl: stored.trackingUrl,
          trackingCourier: stored.trackingCourier,
        }
      : undefined;

    return {
      // All 20 Order List columns
      id: stored.id,
      orderNumber: stored.orderNumber || "",
      customerProfileId: stored.customerProfileId || "",
      customerName: stored.customerName,
      deliveryName: stored.deliveryName || undefined,
      deliveryAddress: stored.deliveryAddress || undefined,
      creationDate: stored.creationDate,
      deliveryDate: stored.deliveryDate || stored.creationDate, // Fallback to creationDate if null
      remainingSalesFinancial: stored.remainingSalesFinancial || undefined,
      customerReference: stored.customerReference || undefined,
      salesStatus: stored.salesStatus || undefined,
      orderType: stored.orderType || undefined,
      documentStatus: stored.documentStatus || undefined,
      salesOrigin: stored.salesOrigin || undefined,
      transferStatus: stored.transferStatus || undefined,
      transferDate: stored.transferDate || undefined,
      completionDate: stored.completionDate || undefined,
      discountPercent: stored.discountPercent || undefined,
      grossAmount: stored.grossAmount || undefined,
      totalAmount: stored.totalAmount || undefined,

      // Legacy status field (required, can't be null)
      status: stored.status || stored.salesStatus || "Unknown",

      // Nested DDT object (Problem #1 fix)
      ddt,

      // Invoice information
      invoiceNumber: stored.invoiceNumber,
      invoiceDate: stored.invoiceDate,
      invoiceAmount: stored.invoiceAmount,

      // Current state tracking
      currentState: stored.currentState,

      // NO tracking field (removed per user decision - tracking is now inside ddt)

      // Items, timeline, documents (empty for now - populated on-demand)
      items: [],
      stateTimeline: [],
      documents: [],

      // Metadata
      botUserId: stored.userId,
      lastUpdatedAt: stored.lastUpdated,
    };
  }

  /**
   * Wait for DevExpress table to be fully rendered with data
   * DevExpress uses dynamic loading, so we need to wait for actual data rows
   */
  private async waitForDevExpressTableReady(page: Page): Promise<void> {
    try {
      // Wait for table rows with multiple cells (not just loading placeholders)
      await page.waitForFunction(
        () => {
          const rows = document.querySelectorAll("table tbody tr");
          if (rows.length === 0) return false;

          // Check if at least one row has multiple cells (real data)
          for (const row of Array.from(rows)) {
            const cells = row.querySelectorAll("td");
            if (cells.length >= 10) {
              // Found a row with enough cells - table is ready
              return true;
            }
          }
          return false;
        },
        { timeout: 15000 },
      );
      logger.info(
        "[OrderHistoryService] DevExpress table ready with data rows",
      );
    } catch (error) {
      logger.warn(
        "[OrderHistoryService] Timeout waiting for table data, proceeding anyway",
        { error },
      );
    }
  }

  /**
   * Ensure "Tutti gli ordini" (All orders) filter is selected
   * This filter can be visible directly or hidden behind "Show hidden items" menu
   */
  private async ensureAllOrdersFilterSelected(page: Page): Promise<void> {
    try {
      // Check current filter value
      const currentFilter = await page.evaluate(() => {
        // Look for the hidden input with filter value
        const filterInput = document.querySelector(
          'input[id*="xaf_a1_Cb_VI"]',
        ) as HTMLInputElement;
        return filterInput?.value || null;
      });

      logger.info(
        `[OrderHistoryService] Current filter value: ${currentFilter}`,
      );

      // Check if already on "Tutti gli ordini" (All orders)
      if (currentFilter === "xaf_xaf_a1ListViewSalesTableOrdersAll") {
        logger.info(
          "[OrderHistoryService] Filter already set to 'Tutti gli ordini'",
        );
        return;
      }

      // Need to change filter - first check if it's visible
      const filterVisible = await page.evaluate(() => {
        const comboInput = document.querySelector(
          'input[id*="xaf_a1_Cb_I"]',
        ) as HTMLInputElement;
        return comboInput !== null && comboInput.offsetParent !== null;
      });

      if (!filterVisible) {
        // Filter is hidden - need to click "Show hidden items" first
        logger.info(
          "[OrderHistoryService] Filter hidden, clicking 'Show hidden items'...",
        );
        await page.evaluate(() => {
          const showHiddenButton = Array.from(
            document.querySelectorAll("a, button"),
          ).find((el) => el.textContent?.includes("Show hidden items"));
          if (showHiddenButton) {
            (showHiddenButton as HTMLElement).click();
          }
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Click on combobox to open dropdown
      logger.info("[OrderHistoryService] Opening filter dropdown...");
      await page.evaluate(() => {
        const dropdownButton = document.querySelector(
          'td[id*="xaf_a1_Cb_B-1"]',
        ) as HTMLElement;
        if (dropdownButton) {
          dropdownButton.click();
        }
      });

      // Wait for dropdown to appear
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Select "Tutti gli ordini" from dropdown
      logger.info("[OrderHistoryService] Selecting 'Tutti gli ordini'...");
      await page.evaluate(() => {
        // Find the list item with "Tutti gli ordini" text
        const items = Array.from(
          document.querySelectorAll('td[class*="dxeListBoxItem"]'),
        );
        for (const item of items) {
          if (item.textContent?.includes("Tutti gli ordini")) {
            (item as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      // Wait for page to reload with new filter
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await page.waitForSelector("table tbody tr", { timeout: 10000 });

      logger.info("[OrderHistoryService] Filter changed to 'Tutti gli ordini'");
    } catch (error) {
      logger.error("[OrderHistoryService] Error setting filter", { error });
      // Non-blocking - continue scraping even if filter change fails
      // (it might already be on the correct filter)
    }
  }

  /**
   * Scrape all pages of orders up to limit
   * Implements pagination pattern from customer-sync-service.ts
   */
  /**
   * Sort DevExpress table by creation date column (newest first - DESC)
   * Clicks on the "Data Creazione" header twice: first for ASC, then for DESC
   */
  private async sortTableByCreationDate(page: Page): Promise<void> {
    try {
      // Find the "DATA DI CREAZIONE" header
      const headerFound = await page.evaluate(() => {
        // Look for column header containing "creazione"
        const headers = Array.from(
          document.querySelectorAll('th, td[class*="Header"]'),
        );

        for (const header of headers) {
          const text = header.textContent?.toLowerCase() || "";
          if (
            text.includes("creazione") ||
            text.includes("data di creazione")
          ) {
            // Found the header - return its selector info for clicking
            return true;
          }
        }
        return false;
      });

      if (!headerFound) {
        logger.warn(
          "[OrderHistoryService] Could not find creation date column header",
        );
        return;
      }

      // Click once for ASC sort
      logger.info(
        "[OrderHistoryService] Clicking creation date header (1st click - ASC)...",
      );
      await page.evaluate(() => {
        const headers = Array.from(
          document.querySelectorAll('th, td[class*="Header"]'),
        );
        for (const header of headers) {
          const text = header.textContent?.toLowerCase() || "";
          if (
            text.includes("creazione") ||
            text.includes("data di creazione")
          ) {
            (header as HTMLElement).click();
            return;
          }
        }
      });

      // Wait for sort to apply (table reload)
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await page.waitForSelector("table tbody tr", { timeout: 10000 });

      // Click again for DESC sort
      logger.info(
        "[OrderHistoryService] Clicking creation date header (2nd click - DESC)...",
      );
      await page.evaluate(() => {
        const headers = Array.from(
          document.querySelectorAll('th, td[class*="Header"]'),
        );
        for (const header of headers) {
          const text = header.textContent?.toLowerCase() || "";
          if (
            text.includes("creazione") ||
            text.includes("data di creazione")
          ) {
            (header as HTMLElement).click();
            return;
          }
        }
      });

      // Wait for sort to apply again
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await page.waitForSelector("table tbody tr", { timeout: 10000 });

      logger.info(
        "[OrderHistoryService] Table sorted by creation date DESC (newest first)",
      );
    } catch (error) {
      logger.error("[OrderHistoryService] Error sorting table", { error });
      // Non-blocking - continue scraping even if sort fails
    }
  }

  private async scrapeAllPages(
    page: Page,
    limit: number,
    userId?: string,
  ): Promise<Order[]> {
    const allOrders: Order[] = [];
    let currentPage = 1;
    let hasMorePages = true;
    const MAX_PAGES = 100; // Safety limit

    // Date cutoff: Beginning of current year
    const currentYear = new Date().getFullYear();
    const yearStartDate = new Date(currentYear, 0, 1); // January 1st of current year

    // Early termination: Stop when reaching orders synced 30+ days ago
    const EARLY_STOP_DAYS = 30;
    const earlyStopDate = new Date();
    earlyStopDate.setDate(earlyStopDate.getDate() - EARLY_STOP_DAYS);

    logger.info(
      `[OrderHistoryService] Starting intelligent multi-page scraping (up to 100 pages)`,
    );
    logger.info(
      `[OrderHistoryService] Year cutoff: ${yearStartDate.toISOString().split("T")[0]} (beginning of ${currentYear})`,
    );
    logger.info(
      `[OrderHistoryService] Early stop: Orders synced before ${earlyStopDate.toISOString().split("T")[0]} (30+ days ago)`,
    );

    while (
      hasMorePages &&
      allOrders.length < limit &&
      currentPage <= MAX_PAGES
    ) {
      logger.info(
        `[OrderHistoryService] Scraping page ${currentPage}, ${allOrders.length} orders so far`,
      );

      // Wait for table to be ready
      await page.waitForSelector("table tbody tr", { timeout: 10000 });
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Scrape current page
      const pageOrders = await this.scrapeOrderPage(page);
      logger.info(
        `[OrderHistoryService] Scraped ${pageOrders.length} orders from page ${currentPage}`,
      );

      if (pageOrders.length === 0) {
        logger.warn(
          `[OrderHistoryService] Page ${currentPage} returned 0 orders, stopping`,
        );
        break;
      }

      // Filter orders by date (only keep orders from current year)
      const currentYearOrders = pageOrders.filter((order) => {
        const orderDate = new Date(order.creationDate);
        return orderDate >= yearStartDate;
      });

      logger.info(
        `[OrderHistoryService] ${currentYearOrders.length}/${pageOrders.length} orders are from year ${currentYear}`,
      );

      // Early termination check: If userId provided, check DB for already-synced orders
      if (userId && currentYearOrders.length > 0) {
        // Check if any order on this page was synced 30+ days ago
        const ordersToCheck = currentYearOrders.slice(0, 5); // Check first 5 orders
        let foundOldSyncedOrder = false;

        for (const order of ordersToCheck) {
          try {
            const existingOrder = this.orderDb.getOrderById(
              order.id,
              userId as any,
            );
            if (existingOrder && existingOrder.lastScraped) {
              const lastScraped = new Date(existingOrder.lastScraped);
              if (lastScraped < earlyStopDate) {
                logger.info(
                  `[OrderHistoryService] Found order ${order.orderNumber} synced ${Math.floor((Date.now() - lastScraped.getTime()) / (1000 * 60 * 60 * 24))} days ago (before ${EARLY_STOP_DAYS}-day threshold)`,
                );
                foundOldSyncedOrder = true;
                break;
              }
            }
          } catch (error) {
            // Order not in DB yet, continue
            continue;
          }
        }

        if (foundOldSyncedOrder) {
          logger.info(
            `[OrderHistoryService] Reached orders already synced 30+ days ago, stopping scraping (intelligent early termination)`,
          );
          // Add orders from this page before stopping
          allOrders.push(...currentYearOrders);
          break;
        }
      }

      // Add current year orders
      allOrders.push(...currentYearOrders);

      // If we found orders older than current year, stop scraping (table is sorted by date DESC)
      if (currentYearOrders.length < pageOrders.length) {
        logger.info(
          `[OrderHistoryService] Found orders older than year ${currentYear}, stopping scraping`,
        );
        break;
      }

      // Check if we have enough orders
      if (allOrders.length >= limit) {
        logger.info(
          `[OrderHistoryService] Reached limit of ${limit} orders, stopping`,
        );
        break;
      }

      // Check for next page button (same pattern as customer sync)
      hasMorePages = await page.evaluate(() => {
        const nextButtons = [
          document.querySelector('img[alt="Next"]'),
          document.querySelector('img[title="Next"]'),
          document.querySelector('a[title="Next"]'),
          document.querySelector('button[title="Next"]'),
          document.querySelector('.dxp-button.dxp-bi[title*="Next"]'),
          document.querySelector(".dxWeb_pNext_XafTheme"),
        ];

        for (const btn of nextButtons) {
          if (
            btn &&
            !(btn as HTMLElement).classList?.contains("dxp-disabled") &&
            !(btn.parentElement as HTMLElement)?.classList?.contains(
              "dxp-disabled",
            )
          ) {
            return true;
          }
        }

        return false;
      });

      if (hasMorePages) {
        // Click next page
        const clicked = await page.evaluate(() => {
          const nextButtons = [
            document.querySelector('img[alt="Next"]'),
            document.querySelector('img[title="Next"]'),
            document.querySelector('a[title="Next"]'),
            document.querySelector('button[title="Next"]'),
            document.querySelector('.dxp-button.dxp-bi[title*="Next"]'),
            document.querySelector(".dxWeb_pNext_XafTheme"),
          ];

          for (const btn of nextButtons) {
            if (
              btn &&
              !(btn as HTMLElement).classList?.contains("dxp-disabled")
            ) {
              const clickable =
                btn.tagName === "A" || btn.tagName === "BUTTON"
                  ? btn
                  : btn.closest("a") ||
                    btn.closest("button") ||
                    btn.parentElement;

              if (clickable) {
                (clickable as HTMLElement).click();
                return true;
              }
            }
          }
          return false;
        });

        if (!clicked) {
          logger.warn(
            "[OrderHistoryService] Next button found but not clickable",
          );
          hasMorePages = false;
        } else {
          // Wait for page transition
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await page.waitForSelector("table tbody tr", {
            timeout: 10000,
          });

          currentPage++;
        }
      }
    }

    if (currentPage >= MAX_PAGES) {
      logger.warn(
        `[OrderHistoryService] Reached MAX_PAGES safety limit (${MAX_PAGES})`,
      );
    }

    logger.info(
      `[OrderHistoryService] Completed scraping ${currentPage} pages, ${allOrders.length} total orders`,
    );

    return allOrders;
  }

  /**
   * Parse date from DD/MM/YYYY format to ISO 8601
   * Extracted outside page.evaluate to avoid TypeScript transpiler __name issues
   */
  private parseDate(dateStr: string): string {
    if (!dateStr) return "";

    // Format: "DD/MM/YYYY HH:MM:SS" or "DD/MM/YYYY"
    const match = dateStr.match(
      /(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/,
    );
    if (match) {
      const [, day, month, year, hour, minute, second] = match;
      if (hour) {
        return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
      } else {
        return `${year}-${month}-${day}T00:00:00Z`;
      }
    }
    return dateStr; // Return as-is if parse fails
  }

  /**
   * Scrape orders from current page
   * Simplified pattern like customer-sync-service.ts
   */
  private async scrapeOrderPage(page: Page): Promise<Order[]> {
    logger.info("[OrderHistoryService] Starting scrapeOrderPage...");

    // Wait longer for DevExpress table to fully render
    // DevExpress tables have dynamic loading, need to wait for actual data rows
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Use VERY SPECIFIC selector for the order table to avoid calendars and other tables
    // Based on actual page structure: id ends with "_DXMainTable" and has class "dxgvTable_XafTheme"
    const tableSelector = 'table[id$="_DXMainTable"].dxgvTable_XafTheme';
    await page.waitForSelector(tableSelector, { timeout: 10000 }).catch(() => {
      logger.warn(
        "[OrderHistoryService] DevExpress main table selector not found",
      );
    });

    // Use header-based column detection (robust to column reordering)
    const orders = await page.evaluate(() => {
      // Find table
      const table = document.querySelector(
        'table[id$="_DXMainTable"].dxgvTable_XafTheme',
      );
      if (!table) {
        console.error("[OrderHistoryService] Order table not found");
        return [];
      }

      // Extract data from rows using FIXED column indices
      // DevExpress table structure: 24 cells per row
      // [0]: empty, [1]: JavaScript, [2-22]: actual data, [23]: empty
      const dataRows = Array.from(
        table.querySelectorAll(
          "tbody tr.dxgvDataRow, tbody tr.dxgvDataRow_XafTheme",
        ),
      );
      const results: any[] = [];

      console.log(`[OrderHistoryService] Found ${dataRows.length} data rows`);

      for (const row of dataRows) {
        try {
          const cells = Array.from(row.querySelectorAll("td"));

          if (cells.length < 23) {
            console.warn(
              `[OrderHistoryService] Row has only ${cells.length} cells, expected 24`,
            );
            continue;
          }

          // Extract all 20 columns using FIXED indices (verified via physical scraping)
          const id = cells[2]?.textContent?.trim() || "";
          const orderNumber = cells[3]?.textContent?.trim() || "";

          // Validation - check if id looks valid
          if (
            !id ||
            id.includes("Loading") ||
            id.includes("<") ||
            !/\d/.test(id)
          ) {
            continue;
          }

          // Accept orders with or without ORD/ number
          // Orders in "piazzato" state don't have ORD/ yet (Milano assigns after "Invia a Milano")
          // For these orders, we use the id as the primary identifier

          // Extract all remaining fields using FIXED indices
          const customerProfileId = cells[4]?.textContent?.trim() || "";
          const customerName = cells[5]?.textContent?.trim() || "";
          const deliveryName = cells[6]?.textContent?.trim() || "";
          const deliveryAddress = cells[7]?.textContent?.trim() || "";
          const creationDateText = cells[8]?.textContent?.trim() || "";
          const deliveryDateText = cells[9]?.textContent?.trim() || "";
          const remainingSalesFinancial = cells[10]?.textContent?.trim() || "";
          const customerReference = cells[11]?.textContent?.trim() || "";
          const salesStatus = cells[12]?.textContent?.trim() || "";
          const orderType = cells[13]?.textContent?.trim() || "";
          const documentStatus = cells[14]?.textContent?.trim() || "";
          const salesOrigin = cells[15]?.textContent?.trim() || "";
          const transferStatus = cells[16]?.textContent?.trim() || "";
          const transferDateText = cells[17]?.textContent?.trim() || "";
          const completionDateText = cells[18]?.textContent?.trim() || "";
          // cells[19] contains unknown field ("No"/"Yes")
          const discountPercent = cells[20]?.textContent?.trim() || "";
          const grossAmount = cells[21]?.textContent?.trim() || "";
          const totalAmount = cells[22]?.textContent?.trim() || "";

          results.push({
            id,
            orderNumber,
            customerProfileId,
            customerName,
            deliveryName,
            deliveryAddress,
            creationDate: creationDateText,
            deliveryDate: deliveryDateText,
            remainingSalesFinancial: remainingSalesFinancial || null,
            customerReference: customerReference || null,
            salesStatus: salesStatus || null,
            orderType: orderType || null,
            documentStatus: documentStatus || null,
            salesOrigin: salesOrigin || null,
            transferStatus: transferStatus || null,
            transferDate: transferDateText || null,
            completionDate: completionDateText || null,
            discountPercent: discountPercent || null,
            grossAmount: grossAmount || null,
            totalAmount: totalAmount || null,
            status: salesStatus || "Unknown",
          });
        } catch (error) {
          console.error("[OrderHistoryService] Error parsing row:", error);
        }
      }

      return results;
    });

    logger.info(
      `[OrderHistoryService] Scraped ${orders.length} orders from current page`,
    );

    // Parse dates outside browser context to avoid TypeScript transpiler issues
    const ordersWithParsedDates = orders.map((order: any) => ({
      ...order,
      creationDate: this.parseDate(order.creationDate),
      deliveryDate: this.parseDate(order.deliveryDate),
      transferDate: order.transferDate
        ? this.parseDate(order.transferDate)
        : null,
      completionDate: order.completionDate
        ? this.parseDate(order.completionDate)
        : null,
    }));

    return ordersWithParsedDates;
  }

  /**
   * Get complete order detail for a single order
   * @param userId User ID for multi-user mode
   * @param orderId Internal order ID (from Order.id)
   * @returns OrderDetail with items and timeline, or null if not found
   */
  async getOrderDetail(
    userId: string,
    orderId: string,
  ): Promise<OrderDetail | null> {
    logger.info(
      `[OrderHistoryService] Fetching order detail for user ${userId}, order ${orderId}`,
    );

    // First, check if order exists and try to get cached detail
    const cachedOrder = this.orderDb.getOrderById(userId, orderId);

    if (!cachedOrder) {
      logger.warn(
        `[OrderHistoryService] Order ${orderId} not found in database for user ${userId}`,
      );
      return null;
    }

    logger.info(
      `[OrderHistoryService] Database lookup result for order ${orderId}`,
      {
        found: true,
        hasDetailJson: !!cachedOrder.detailJson,
        userId,
        orderId,
      },
    );

    // If detail is already cached, return it
    if (cachedOrder.detailJson) {
      try {
        logger.info(
          `[OrderHistoryService] Returning cached detail for order ${orderId}`,
        );
        const detail = JSON.parse(cachedOrder.detailJson);

        // Add currentState and tracking fields from DB to detail
        return {
          ...detail,
          currentState: cachedOrder.currentState,
          ddtNumber: cachedOrder.ddtNumber,
          trackingNumber: cachedOrder.trackingNumber,
          trackingUrl: cachedOrder.trackingUrl,
          trackingCourier: cachedOrder.trackingCourier,
        };
      } catch (err) {
        logger.warn(
          `[OrderHistoryService] Error parsing cached detail for order ${orderId}, will scrape`,
          { error: err },
        );
      }
    }

    // No cached detail available
    // With unified scraping, all details should be pre-populated during sync
    // If we reach here, it means the order exists but detail wasn't scraped
    logger.warn(
      `[OrderHistoryService] No cached detail found for order ${orderId}. Order may need to be synced again.`,
    );

    return null;
  }

  /**
   * Extract complete order data from detail page
   * Scrapes Panoramica tab fields and Linee di vendita table
   */
  private async extractOrderDetail(
    page: Page,
    orderId: string,
  ): Promise<OrderDetail | null> {
    return await page.evaluate((id) => {
      // Helper: find text content by label
      const findByLabel = (labelText: string): string => {
        const labels = Array.from(document.querySelectorAll("td, div, span"));
        for (const label of labels) {
          if (label.textContent?.trim() === labelText) {
            // Look for adjacent cell or next sibling with value
            const parent = label.parentElement;
            if (parent) {
              const cells = Array.from(
                parent.querySelectorAll<HTMLTableCellElement>("td"),
              );
              const labelIndex = cells.indexOf(label as HTMLTableCellElement);
              if (labelIndex >= 0 && labelIndex + 1 < cells.length) {
                return cells[labelIndex + 1].textContent?.trim() || "";
              }
            }
            // Try next sibling
            const next = label.nextElementSibling;
            if (next) {
              return next.textContent?.trim() || "";
            }
          }
        }
        return "";
      };

      // Helper: parse date DD/MM/YYYY to ISO 8601
      const parseDate = (dateStr: string): string => {
        const match = dateStr.match(
          /(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/,
        );
        if (match) {
          const [, day, month, year, hour, minute, second] = match;
          if (hour) {
            return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
          } else {
            return `${year}-${month}-${day}T00:00:00Z`;
          }
        }
        return dateStr;
      };

      try {
        // Extract fields from Dettagli di vendita sections
        const orderNumber =
          findByLabel("ORDINE DI VENDITA:") || findByLabel("ORDINE DI VENDITA");
        const customerProfileId =
          findByLabel("PROFILO CLIENTE:") || findByLabel("PROFILO CLIENTE");
        const customerName =
          findByLabel("NOME VENDITORE:") || findByLabel("NOME VENDITORE");
        const dateText =
          findByLabel("DATA ORDINE:") || findByLabel("DATA ORDINE");
        const deliveryDateText =
          findByLabel("DELIVERY DATE:") || findByLabel("DELIVERY DATE");
        const customerAddress =
          findByLabel("INDIRIZZO DI CONSEGNA:") ||
          findByLabel("INDIRIZZO DI CONSEGNA");
        const customerEmail =
          findByLabel("E-MAIL DI CONSEGNA:") ||
          findByLabel("E-MAIL DI CONSEGNA");
        const customerReference =
          findByLabel("RIFERIMENTO CLIENTE:") ||
          findByLabel("RIFERIMENTO CLIENTE");
        const completionDateText =
          findByLabel("DATA COMPLETAMENTO:") ||
          findByLabel("DATA COMPLETAMENTO");

        // Extract status fields
        const status = findByLabel("STATO:") || findByLabel("STATO");
        const documentStatus =
          findByLabel("STATO DEL DOCUMENTO:") ||
          findByLabel("STATO DEL DOCUMENTO");
        const transferStatus =
          findByLabel("STATO DEL TRASFERIMENTO:") ||
          findByLabel("STATO DEL TRASFERIMENTO");
        const transferDateText =
          findByLabel("DATA DEL TRASFERIMENTO:") ||
          findByLabel("DATA DEL TRASFERIMENTO");

        // Parse dates
        const date = parseDate(dateText);
        const deliveryDate = parseDate(deliveryDateText);
        const completionDate = completionDateText
          ? parseDate(completionDateText)
          : undefined;
        const transferDate = transferDateText
          ? parseDate(transferDateText)
          : undefined;

        // Extract items from "Linee di vendita" table
        const items: Array<{
          articleCode: string;
          articleName: string;
          quantity: number;
          unitPrice: string;
          subtotal: string;
          discount?: string;
        }> = [];

        // Find tables on page (DevExpress tables)
        const tables = Array.from(document.querySelectorAll("table"));

        for (const table of tables) {
          const rows = Array.from(
            table.querySelectorAll("tbody tr"),
          ) as HTMLElement[];

          for (const row of rows) {
            const cells = Array.from(
              row.querySelectorAll("td"),
            ) as HTMLElement[];

            // Check if this looks like an item row (has quantity and price patterns)
            if (cells.length >= 5) {
              // Look for numeric patterns in cells
              let articleCode = "";
              let articleName = "";
              let quantity = 0;
              let unitPrice = "";
              let subtotal = "";

              // Try to identify columns by content patterns
              for (let i = 0; i < cells.length; i++) {
                const text = cells[i].textContent?.trim() || "";

                // Article code: numeric pattern
                if (!articleCode && /^\d{5,}$/.test(text)) {
                  articleCode = text;
                }

                // Quantity: small number pattern
                if (!quantity && /^\d{1,4}$/.test(text)) {
                  const num = parseInt(text, 10);
                  if (num > 0 && num < 10000) {
                    quantity = num;
                  }
                }

                // Price: contains € or decimal with comma
                if (
                  !unitPrice &&
                  (text.includes("€") || /\d+[.,]\d+/.test(text))
                ) {
                  unitPrice = text;
                }

                // Article name: longer text without numbers
                if (
                  !articleName &&
                  text.length > 10 &&
                  !/^\d+$/.test(text) &&
                  !text.includes("€")
                ) {
                  articleName = text;
                }
              }

              // If we found basic item data, add it
              if (articleCode && quantity > 0) {
                items.push({
                  articleCode,
                  articleName: articleName || articleCode,
                  quantity,
                  unitPrice: unitPrice || "0 €",
                  subtotal: unitPrice || "0 €", // Approximate for now
                });
              }
            }
          }
        }

        // Create status timeline from available dates
        const statusTimeline: Array<{
          status: string;
          timestamp: string;
          note?: string;
        }> = [];

        // Add creation
        if (date) {
          statusTimeline.push({
            status: "Creato",
            timestamp: date,
          });
        }

        // Add transfer if exists
        if (transferDate && transferStatus) {
          statusTimeline.push({
            status: transferStatus,
            timestamp: transferDate,
          });
        }

        // Add completion if exists
        if (completionDate) {
          statusTimeline.push({
            status: documentStatus || "Completato",
            timestamp: completionDate,
          });
        }

        // Add current status
        if (status && deliveryDate) {
          statusTimeline.push({
            status: status,
            timestamp: deliveryDate,
          });
        }

        // Sort timeline by timestamp descending (newest first)
        statusTimeline.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        // Extract tracking information from "Cronologia documento di trasporto" section
        let tracking:
          | { courier: string; trackingNumber: string; trackingUrl?: string }
          | undefined;

        // Search for tracking data in tables
        const allTables = Array.from(document.querySelectorAll("table"));

        for (const table of allTables) {
          // Check if this table has tracking column header
          const headers = Array.from(table.querySelectorAll("th"));
          const trackingColIndex = headers.findIndex(
            (h) =>
              h.textContent?.includes("TRACCIABILITÀ") ||
              h.textContent?.includes("TRACKING"),
          );

          if (trackingColIndex >= 0) {
            // Found tracking column, extract from first data row
            const dataRows = Array.from(table.querySelectorAll("tbody tr"));

            for (const row of dataRows) {
              const cells = Array.from(row.querySelectorAll("td"));

              if (cells[trackingColIndex]) {
                const trackingCell = cells[trackingColIndex];

                // Look for link with tracking text
                const trackingLink = trackingCell.querySelector("a");
                if (trackingLink) {
                  const trackingText = trackingLink.textContent?.trim() || "";
                  const trackingUrl =
                    trackingLink.getAttribute("href") || undefined;

                  // Parse format "courier trackingNumber" (e.g., "fedex 445501887029")
                  const parts = trackingText.split(/\s+/);
                  if (parts.length >= 2) {
                    tracking = {
                      courier: parts[0].toLowerCase(),
                      trackingNumber: parts.slice(1).join(" "),
                      trackingUrl,
                    };
                    break;
                  }
                } else {
                  // No link, try plain text
                  const trackingText = trackingCell.textContent?.trim() || "";
                  const parts = trackingText.split(/\s+/);
                  if (parts.length >= 2) {
                    tracking = {
                      courier: parts[0].toLowerCase(),
                      trackingNumber: parts.slice(1).join(" "),
                    };
                    break;
                  }
                }
              }
            }

            if (tracking) break;
          }
        }

        // Extract document links (DDT and invoices) from tables
        const documents: Array<{
          type: "invoice" | "ddt" | "other";
          name: string;
          url: string;
          date?: string;
        }> = [];

        for (const table of allTables) {
          const headers = Array.from(table.querySelectorAll("th"));

          // Find DDT and invoice column indices
          const ddtColIndex = headers.findIndex(
            (h) =>
              h.textContent?.includes("DOCUMENTO DI TRASPORTO") ||
              h.textContent?.includes("DDT"),
          );
          const invoiceColIndex = headers.findIndex(
            (h) =>
              h.textContent?.includes("FATTURA PDF") ||
              h.textContent?.includes("INVOICE PDF"),
          );
          const dateColIndex = headers.findIndex(
            (h) =>
              h.textContent?.includes("DATA") &&
              !h.textContent?.includes("DELIVERY"),
          );

          if (ddtColIndex >= 0 || invoiceColIndex >= 0) {
            // Found document columns, extract from data rows
            const dataRows = Array.from(table.querySelectorAll("tbody tr"));

            for (const row of dataRows) {
              const cells = Array.from(row.querySelectorAll("td"));

              // Extract DDT reference
              if (ddtColIndex >= 0 && cells[ddtColIndex]) {
                const ddtCell = cells[ddtColIndex];
                const ddtLink = ddtCell.querySelector("a");

                if (ddtLink) {
                  const ddtName = ddtLink.textContent?.trim() || "";
                  let ddtUrl = ddtLink.getAttribute("href") || "";

                  // Normalize URL (prepend base if relative)
                  if (ddtUrl && !ddtUrl.startsWith("http")) {
                    ddtUrl = `https://4.231.124.90${ddtUrl.startsWith("/") ? "" : "/"}${ddtUrl}`;
                  }

                  if (ddtName && ddtUrl) {
                    // Extract date if available
                    let docDate: string | undefined;
                    if (dateColIndex >= 0 && cells[dateColIndex]) {
                      const dateText =
                        cells[dateColIndex].textContent?.trim() || "";
                      docDate = dateText ? parseDate(dateText) : undefined;
                    }

                    documents.push({
                      type: "ddt",
                      name: ddtName,
                      url: ddtUrl,
                      date: docDate,
                    });
                  }
                }
              }

              // Extract invoice PDF link
              if (invoiceColIndex >= 0 && cells[invoiceColIndex]) {
                const invoiceCell = cells[invoiceColIndex];
                const invoiceLink = invoiceCell.querySelector("a");

                if (invoiceLink) {
                  const invoiceName = invoiceLink.textContent?.trim() || "";
                  let invoiceUrl = invoiceLink.getAttribute("href") || "";

                  // Normalize URL
                  if (invoiceUrl && !invoiceUrl.startsWith("http")) {
                    invoiceUrl = `https://4.231.124.90${invoiceUrl.startsWith("/") ? "" : "/"}${invoiceUrl}`;
                  }

                  if (invoiceName && invoiceUrl) {
                    // Extract date if available
                    let docDate: string | undefined;
                    if (dateColIndex >= 0 && cells[dateColIndex]) {
                      const dateText =
                        cells[dateColIndex].textContent?.trim() || "";
                      docDate = dateText ? parseDate(dateText) : undefined;
                    }

                    documents.push({
                      type: "invoice",
                      name: invoiceName,
                      url: invoiceUrl,
                      date: docDate,
                    });
                  }
                }
              }
            }
          }
        }

        const orderDetail: OrderDetail = {
          id,
          orderNumber,
          date,
          deliveryDate,
          customerName,
          customerProfileId,
          customerAddress: customerAddress || undefined,
          customerEmail: customerEmail || undefined,
          customerReference: customerReference || undefined,
          status,
          documentStatus: documentStatus || undefined,
          transferStatus: transferStatus || undefined,
          transferDate,
          completionDate,
          items,
          statusTimeline,
          tracking,
          documents: documents.length > 0 ? documents : undefined,
        };

        return orderDetail;
      } catch (error) {
        console.error(
          "[OrderHistoryService] Error extracting order detail:",
          error,
        );
        return null;
      }
    }, orderId);
  }

  /**
   * Scrape DDT data from current page
   * Reuses logic from DDTScraperService but works with existing page session
   */
  private async scrapeDDTPage(page: Page): Promise<DDTData[]> {
    return await page.evaluate(() => {
      // Find table
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) {
        console.error("[OrderHistoryService] DDT table not found");
        return [];
      }

      // Extract data from rows using FIXED column indices
      // DDT table structure: 22 cells per row
      // ALL 11 REQUIRED COLUMNS (verified via header inspection):
      // [6]=ID, [7]=DDT#, [8]=Date, [9]=OrderID, [10]=Account, [11]=Sales, [12]=Delivery,
      // [15]=DeliveryTerms, [17]=Tracking, [18]=DeliveryCity, [19]=Method
      const dataRows = Array.from(
        table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"),
      );
      const ddtData: any[] = [];

      console.log(`[OrderHistoryService] Found ${dataRows.length} DDT rows`);

      for (const row of dataRows) {
        const cells = Array.from(row.querySelectorAll("td"));

        if (cells.length < 20) {
          console.warn(
            `[OrderHistoryService] DDT row has only ${cells.length} cells, expected 22`,
          );
          continue;
        }

        // Extract ALL 11 columns using FIXED indices (verified via physical scraping & header mapping)
        // cells[0-5]: UI elements, empty, JavaScript
        const ddtId = cells[6]?.textContent?.trim() || "";
        const ddtNumber = cells[7]?.textContent?.trim() || "";
        const ddtDeliveryDate = cells[8]?.textContent?.trim() || "";
        const orderId = cells[9]?.textContent?.trim() || "";
        const customerAccountId = cells[10]?.textContent?.trim() || "";
        const salesName = cells[11]?.textContent?.trim() || "";
        const deliveryName = cells[12]?.textContent?.trim() || "";
        // cells[13-14, 16]: other data (address, etc.)
        const deliveryTerms = cells[15]?.textContent?.trim() || undefined;
        const trackingText = cells[17]?.textContent?.trim() || "";
        const deliveryCity = cells[18]?.textContent?.trim() || undefined;
        const deliveryMethod = cells[19]?.textContent?.trim() || "";

        // Validation
        if (!ddtNumber || !ddtNumber.startsWith("DDT/")) {
          continue;
        }

        if (!orderId || !orderId.startsWith("ORD/")) {
          console.warn(
            `[OrderHistoryService] Skipping DDT ${ddtNumber} - missing order ID`,
          );
          continue;
        }

        // Extract tracking as clickable link
        let trackingNumber: string | undefined;
        let trackingCourier: string | undefined;
        let trackingUrl: string | undefined;

        const trackingCell = cells[17];
        const trackingLink = trackingCell?.querySelector("a");

        if (trackingLink) {
          // Extract link URL and text
          trackingUrl = trackingLink.getAttribute("href") || undefined;
          const linkText = trackingLink.textContent?.trim() || "";

          if (linkText) {
            // Parse "Ups 1Z4V26Y86872714384" or "fedex 445291888246"
            const parts = linkText.split(/\s+/);
            if (parts.length >= 2) {
              trackingCourier = parts[0].toLowerCase();
              trackingNumber = parts.slice(1).join(" ");
            } else {
              trackingNumber = linkText;
            }
          }
        } else if (trackingText && trackingText !== "") {
          // Fallback: no link, just text
          const parts = trackingText.split(/\s+/);
          if (parts.length >= 2) {
            trackingCourier = parts[0].toLowerCase();
            trackingNumber = parts.slice(1).join(" ");
          } else {
            trackingNumber = trackingText;
          }
        }

        // All 11 DDT columns mapped (some may be empty/undefined if not populated in source)
        ddtData.push({
          ddtId,
          ddtNumber,
          ddtDeliveryDate,
          orderId, // Match key: orderId (DDT) ↔ orderNumber (Order List)
          customerAccountId,
          salesName,
          deliveryName,
          trackingNumber,
          trackingUrl,
          trackingCourier,
          deliveryTerms, // cells[15] - may be empty
          deliveryMethod,
          deliveryCity, // cells[18] - may be empty
        });
      }

      console.log(
        `[OrderHistoryService] Extracted ${ddtData.length} DDT entries`,
      );
      return ddtData;
    });
  }

  /**
   * Check if there's a next page for DDT table
   */
  private async hasNextPageDDT(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
      const nextBtn = document.querySelector('img[alt="Next"]');
      return nextBtn && !nextBtn.closest(".dxp-disabled") ? true : false;
    });
  }

  /**
   * Click next page button for DDT table
   */
  private async clickNextPageDDT(page: Page): Promise<void> {
    await page.evaluate(() => {
      const nextBtn = document.querySelector('img[alt="Next"]');
      if (nextBtn) {
        (nextBtn as HTMLElement).click();
      }
    });
  }

  /**
   * Scrape order detail from page (used during unified sync)
   * Reuses existing extractOrderDetail logic but with explicit page parameter
   */
  private async scrapeOrderDetailFromPage(
    page: Page,
    orderId: string,
  ): Promise<OrderDetail | null> {
    try {
      // Navigate directly to order detail URL
      const detailUrl = `${config.archibald.url}/SALESTABLE_DetailViewAgent/${orderId}?mode=View`;

      logger.info(
        `[OrderHistoryService] Navigating to order detail URL: ${detailUrl}`,
      );

      await page.goto(detailUrl, {
        waitUntil: "domcontentloaded", // Changed from networkidle2 - faster
        timeout: 10000, // Reduced from 60000ms to 10000ms
      });

      // Wait for detail view to load (check for "Panoramica" tab)
      await page.waitForSelector("text=Panoramica", { timeout: 5000 }); // Reduced from 30000ms to 5000ms

      logger.info(
        `[OrderHistoryService] Order detail page loaded for order ${orderId}`,
      );

      // Extract order detail data (reuse existing method)
      const orderDetail = await this.extractOrderDetail(page, orderId);

      if (!orderDetail) {
        logger.warn(
          `[OrderHistoryService] Failed to extract data for order ${orderId}`,
        );
        return null;
      }

      logger.info(
        `[OrderHistoryService] Extracted ${orderDetail.items.length} items, ${orderDetail.statusTimeline.length} status updates for order ${orderId}`,
      );

      return orderDetail;
    } catch (error) {
      logger.error(
        `[OrderHistoryService] Error scraping detail for order ${orderId}`,
        { error },
      );
      return null;
    }
  }

  /**
   * Ensure DDT table is on page 1 with scroll trigger
   * ALWAYS clicks page 1 button to ensure we're on the correct page
   */
  private async ensureDDTPageOne(page: Page): Promise<void> {
    try {
      logger.info(
        "[OrderHistoryService] FORCING DDT table navigation to page 1...",
      );

      // Scroll to table to trigger any lazy loading
      await page.evaluate(() => {
        const table = document.querySelector("table");
        if (table) {
          table.scrollIntoView({ behavior: "auto", block: "start" });
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // ALWAYS click page 1 button (don't just check)
      logger.info("[OrderHistoryService] Clicking DDT page 1 button...");
      const clickedPageOne = await page.evaluate(() => {
        // Strategy 1: Look for button with text "1"
        const pageButtons = Array.from(
          document.querySelectorAll(
            'div[id*="DXDataPager"] div.dxp-num, div[id*="DXDataPager"] span',
          ),
        );

        for (const button of pageButtons) {
          const text = button.textContent?.trim();
          if (text === "1") {
            (button as HTMLElement).click();
            return true;
          }
        }

        // Strategy 2: Look for "First" button (<<)
        const firstButtons = Array.from(
          document.querySelectorAll('div[id*="DXDataPager"] *'),
        );

        for (const btn of firstButtons) {
          const text = btn.textContent?.trim();
          if (text?.includes("<<") || text?.includes("First")) {
            (btn as HTMLElement).click();
            return true;
          }
        }

        // Strategy 3: Look for any clickable element with "1" in pager area
        const allPagerElements = Array.from(
          document.querySelectorAll('div[id*="Pager"] *'),
        );

        for (const elem of allPagerElements) {
          if (elem.textContent?.trim() === "1") {
            (elem as HTMLElement).click();
            return true;
          }
        }

        return false;
      });

      if (!clickedPageOne) {
        logger.error(
          "[OrderHistoryService] FAILED to find and click DDT page 1 button!",
        );
      } else {
        logger.info(
          "[OrderHistoryService] Successfully clicked DDT page 1 button",
        );
      }

      // Wait for table to reload after click
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Scroll to trigger loading
      await page.evaluate(() => {
        window.scrollBy(0, 150);
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      await page.evaluate(() => {
        window.scrollBy(0, -150);
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify we're on page 1
      const finalPage = await page.evaluate(() => {
        const pageSpan = document.querySelector('span[id*="DXDataPager_PSI"]');
        return pageSpan?.textContent?.trim() || "?";
      });

      logger.info(
        `[OrderHistoryService] DDT table final page after navigation: ${finalPage}`,
      );
    } catch (error) {
      logger.error("[OrderHistoryService] Error ensuring DDT page 1", {
        error,
      });
      throw error; // Re-throw to stop sync if page 1 navigation fails
    }
  }
}
