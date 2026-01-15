import { Page } from "puppeteer";
import { logger } from "./logger";
import { config } from "./config";
import { OrderDatabase, type StoredOrder } from "./order-db";

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
 * Single order in list view
 */
export interface Order {
  id: string; // Internal ID
  orderNumber: string; // e.g., "ORD/26000405"
  customerProfileId: string; // e.g., "1002209"
  customerName: string; // Seller name
  deliveryName: string; // Delivery recipient
  deliveryAddress: string; // Full delivery address
  creationDate: string; // ISO 8601 format
  deliveryDate: string; // ISO 8601 format
  status: string; // e.g., "Ordine aperto", "Consegnato", "Ordine di vendita"
  customerReference?: string; // Optional customer reference
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
export class OrderHistoryService {
  public orderDb: OrderDatabase; // Public for force-sync endpoint access
  private readonly SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  constructor() {
    this.orderDb = OrderDatabase.getInstance();
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

      // Convert StoredOrder to Order (remove DB metadata)
      const orders: Order[] = dbOrders.map(this.storedOrderToOrder);

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
        return {
          orders: dbOrders.map(this.storedOrderToOrder),
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
   * This is the actual scraping logic (extracted from old getOrderList)
   */
  private async syncFromArchibald(userId: string): Promise<void> {
    let bot = null;

    try {
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
        "[OrderHistoryService] ArchibaldBot initialized (legacy mode), navigating to order list...",
      );

      // Navigate to order list page (direct URL like customer sync)
      const orderListUrl = `${config.archibald.url}/SALESTABLE_ListView_Agent/`;

      await bot.page.goto(orderListUrl, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      logger.info(`[OrderHistoryService] Navigated to ${orderListUrl}`);

      // Wait for table to be present
      await bot.page.waitForSelector("table", { timeout: 10000 });

      // Wait for DevExpress table to be fully loaded
      logger.info("[OrderHistoryService] Waiting for DevExpress table to fully render...");
      await this.waitForDevExpressTableReady(bot.page);

      // Additional wait for dynamic content
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Ensure "Tutti gli ordini" filter is selected
      logger.info(
        "[OrderHistoryService] Verifying 'Tutti gli ordini' filter is selected...",
      );
      await this.ensureAllOrdersFilterSelected(bot.page);

      // Navigate to page 1 (in case we're on a different page when forcing sync)
      logger.info("[OrderHistoryService] Ensuring we start from page 1...");
      await this.navigateToFirstPage(bot.page);

      // Sort table by creation date DESC (newest first)
      // sortTableByCreationDate already includes waits for table reload
      logger.info(
        "[OrderHistoryService] Sorting table by creation date (newest first)...",
      );
      await this.sortTableByCreationDate(bot.page);

      // Scrape ALL orders (no limit - we want full sync)
      const allOrders = await this.scrapeAllPages(
        bot.page,
        Number.MAX_SAFE_INTEGER,
      );

      logger.info(
        `[OrderHistoryService] Scraped ${allOrders.length} orders from Archibald`,
      );

      // Save to DB (upsert - updates existing, inserts new)
      this.orderDb.upsertOrders(userId, allOrders);

      logger.info(
        `[OrderHistoryService] Saved ${allOrders.length} orders to DB for user ${userId}`,
      );
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
   * Navigate to page 1 of the order list
   * Required when forcing sync while on a different page
   */
  private async navigateToFirstPage(page: Page): Promise<void> {
    try {
      logger.info("[OrderHistoryService] Checking current page and navigating to page 1...");

      // Check if we're already on page 1
      const currentPage = await page.evaluate(() => {
        const currentPageSpan = document.querySelector(
          'span[id*="xaf_a1DXDataPager_PSI"]',
        ) as HTMLSpanElement;
        return currentPageSpan?.textContent?.trim() || "1";
      });

      logger.info(`[OrderHistoryService] Current page: ${currentPage}`);

      if (currentPage === "1") {
        logger.info("[OrderHistoryService] Already on page 1, skipping navigation");
        return;
      }

      // Find and click page 1 button
      logger.info("[OrderHistoryService] Navigating to page 1...");
      const navigatedToFirst = await page.evaluate(() => {
        // Look for first page button - usually has class "dxp-num" and text "1"
        const pageButtons = Array.from(
          document.querySelectorAll('div[id*="xaf_a1DXDataPager"] div.dxp-num'),
        );

        for (const button of pageButtons) {
          if (button.textContent?.trim() === "1") {
            (button as HTMLElement).click();
            return true;
          }
        }

        // Alternative: Look for "First" button with class "dxp-lead"
        const firstButton = Array.from(
          document.querySelectorAll('div[id*="xaf_a1DXDataPager"] div.dxp-lead'),
        ).find((el) => el.textContent?.includes("<<"));

        if (firstButton) {
          (firstButton as HTMLElement).click();
          return true;
        }

        return false;
      });

      if (!navigatedToFirst) {
        logger.warn("[OrderHistoryService] Could not find page 1 button");
        return;
      }

      // Wait for table to reload
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await page.waitForSelector("table tbody tr", { timeout: 10000 });

      logger.info("[OrderHistoryService] Successfully navigated to page 1");
    } catch (error) {
      logger.error("[OrderHistoryService] Error navigating to page 1", { error });
    }
  }

  /**
   * Convert StoredOrder (DB) to Order (API response)
   * Removes DB metadata fields
   */
  private storedOrderToOrder(stored: StoredOrder): Order {
    return {
      id: stored.id,
      orderNumber: stored.orderNumber,
      customerProfileId: stored.customerProfileId,
      customerName: stored.customerName,
      deliveryName: stored.deliveryName,
      deliveryAddress: stored.deliveryAddress,
      creationDate: stored.creationDate,
      deliveryDate: stored.deliveryDate,
      status: stored.status,
      customerReference: stored.customerReference || undefined,
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
        { timeout: 15000 }
      );
      logger.info("[OrderHistoryService] DevExpress table ready with data rows");
    } catch (error) {
      logger.warn("[OrderHistoryService] Timeout waiting for table data, proceeding anyway", { error });
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

  private async scrapeAllPages(page: Page, limit: number): Promise<Order[]> {
    const allOrders: Order[] = [];
    let currentPage = 1;
    let hasMorePages = true;
    const MAX_PAGES = 100; // Increased to handle large order histories (was 10)

    logger.info(
      "[OrderHistoryService] Starting multi-page scraping (up to 100 pages)",
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

      // Add all orders from page (no duplicate check - Archibald data is authoritative)
      allOrders.push(...pageOrders);

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
      logger.warn("[OrderHistoryService] DevExpress main table selector not found");
    });

    // Use $$eval with VERY SPECIFIC table selector - only the main order grid
    // This avoids scraping calendars, filter dropdowns, and other auxiliary tables
    const orders = await page.$$eval('table[id$="_DXMainTable"].dxgvTable_XafTheme tbody tr', (rows) => {
      const results: any[] = [];

      for (const row of rows) {
        try {
          const cells = Array.from(row.querySelectorAll("td"));

          // DEBUG: Log cell count and first row content for verification
          if (results.length === 0) {
            const cellContents = cells.slice(0, 15).map((c, i) => `[${i}]=${c.textContent?.trim()}`);
            console.log(`[DEBUG] First row has ${cells.length} cells`);
            console.log(`[DEBUG] First 15 cell contents: ${cellContents.join(', ')}`);
          }

          if (cells.length < 10) {
            continue;
          }

          // Extract all visible columns based on actual HTML structure from elementi pagina ordini.txt
          // Cell mapping verified from real page HTML:
          // [0] = checkbox, [1] = edit button with scripts
          // [2] = ID, [3] = Order Number, [4] = Customer Profile ID
          // [5] = Customer Name, [6] = Delivery Name, [7] = Delivery Address
          // [8] = Creation Date, [9] = Delivery Date, [10-11] = empty
          // [12] = Status, [13-19] = other fields, [20-22] = amounts, [23] = checkbox
          const id = cells[2]?.textContent?.trim() || "";
          const orderNumber = cells[3]?.textContent?.trim() || "";
          const customerProfileId = cells[4]?.textContent?.trim() || "";
          const customerName = cells[5]?.textContent?.trim() || "";
          const deliveryName = cells[6]?.textContent?.trim() || "";
          const deliveryAddress = cells[7]?.textContent?.trim() || "";
          const creationDateText = cells[8]?.textContent?.trim() || "";
          const deliveryDateText = cells[9]?.textContent?.trim() || "";
          const customerReference = cells[10]?.textContent?.trim() || "";
          const status = cells[12]?.textContent?.trim() || "";

          // Validation - check if id looks like a valid order ID (numeric or "XX.XXX" format)
          if (!id || id.includes("Loading") || id.includes("<") || !/\d/.test(id)) {
            continue;
          }

          // Additional validation - check if this looks like a real order row
          if (!customerName && !deliveryName) {
            continue; // Skip rows with no customer data
          }

          if (id) {
            results.push({
              id,
              orderNumber: orderNumber || id,
              customerProfileId: customerProfileId || "",
              customerName,
              deliveryName,
              deliveryAddress,
              creationDate: creationDateText,
              deliveryDate: deliveryDateText,
              status,
              customerReference: customerReference || undefined,
            });
          }
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

    let bot = null;

    try {
      // Use legacy ArchibaldBot for system sync operations (like customer-sync)
      const { ArchibaldBot } = await import("./archibald-bot");
      bot = new ArchibaldBot(); // No userId = legacy mode
      await bot.initialize();
      await bot.login(); // Uses config credentials

      if (!bot.page) {
        throw new Error("Browser page is null after initialization");
      }

      // Navigate directly to order detail URL
      const detailUrl = `${config.archibald.url}/SALESTABLE_DetailViewAgent/${orderId}?mode=View`;

      await bot.page.goto(detailUrl, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      // Wait for detail view to load (check for "Panoramica" tab)
      await bot.page.waitForSelector("text=Panoramica", { timeout: 30000 });

      logger.info(
        `[OrderHistoryService] Order detail page loaded for order ${orderId}`,
      );

      // Extract order detail data
      const orderDetail = await this.extractOrderDetail(bot.page, orderId);

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
        `[OrderHistoryService] Error fetching order detail for user ${userId}, order ${orderId}`,
        { error },
      );

      return null;
    } finally {
      if (bot) {
        await bot.close();
      }
    }
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
              const cells = Array.from(parent.querySelectorAll("td"));
              const labelIndex = cells.indexOf(label as HTMLElement);
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
}
