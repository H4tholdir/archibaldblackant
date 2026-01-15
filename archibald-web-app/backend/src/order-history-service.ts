import { BrowserContext, Page } from "puppeteer";
import { logger } from "./logger";

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
 * Service for scraping order history from Archibald
 * Follows patterns from customer-sync-service.ts and discovery from UI-SELECTORS.md
 */
export class OrderHistoryService {
  /**
   * Get order list from Archibald
   * @param context BrowserContext for the user session (from BrowserPool)
   * @param userId User ID for logging context
   * @param options Pagination and filter options
   * @returns OrderListResult with orders, total, and hasMore flag
   */
  async getOrderList(
    context: BrowserContext,
    userId: string,
    options?: OrderListOptions,
  ): Promise<OrderListResult> {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    logger.info(
      `[OrderHistoryService] Fetching order list for user ${userId} (limit: ${limit}, offset: ${offset})`,
    );

    try {
      // Create new page in user's context
      const page = await context.newPage();

      try {
        // Navigate to order list
        await this.navigateToOrderList(page);

        // Scrape all pages up to limit
        const allOrders = await this.scrapeAllPages(page, limit);

        // Apply offset and limit
        const paginatedOrders = allOrders.slice(offset, offset + limit);
        const hasMore = allOrders.length > offset + limit;

        logger.info(
          `[OrderHistoryService] Fetched ${allOrders.length} orders for user ${userId}, returning ${paginatedOrders.length} (hasMore: ${hasMore})`,
        );

        return {
          orders: paginatedOrders,
          total: allOrders.length,
          hasMore,
        };
      } finally {
        await page.close();
      }
    } catch (error) {
      logger.error(
        `[OrderHistoryService] Error fetching order list for user ${userId}`,
        { error },
      );

      // Return empty result on error (graceful degradation)
      return {
        orders: [],
        total: 0,
        hasMore: false,
      };
    }
  }

  /**
   * Navigate to Archibald order list page
   * Path: AGENT → Ordini (from UI-SELECTORS.md)
   */
  private async navigateToOrderList(page: Page): Promise<void> {
    logger.info("[OrderHistoryService] Navigating to order list");

    // Navigate directly to order list URL (from UI-SELECTORS.md)
    const orderListUrl =
      "https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/";

    await page.goto(orderListUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for DevExpress table to load
    await page.waitForSelector(".dxgvControl", { timeout: 30000 });

    // Additional wait for table content to populate
    await page.waitForSelector(".dxgvDataRow", { timeout: 30000 });

    logger.info("[OrderHistoryService] Order list loaded successfully");
  }

  /**
   * Scrape all pages of orders up to limit
   * Implements pagination pattern from customer-sync-service.ts
   */
  private async scrapeAllPages(page: Page, limit: number): Promise<Order[]> {
    const allOrders: Order[] = [];
    let currentPage = 1;
    let hasMorePages = true;
    const MAX_PAGES = 10; // Safety limit to prevent infinite loops

    logger.info("[OrderHistoryService] Starting multi-page scraping");

    while (hasMorePages && allOrders.length < limit && currentPage <= MAX_PAGES) {
      logger.info(
        `[OrderHistoryService] Scraping page ${currentPage}, ${allOrders.length} orders so far`,
      );

      // Wait for table to be ready
      await page.waitForSelector(".dxgvDataRow", { timeout: 10000 });
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Scrape current page
      const pageOrders = await this.scrapeOrderPage(page);

      if (pageOrders.length === 0) {
        logger.warn(
          `[OrderHistoryService] Page ${currentPage} returned 0 orders, stopping`,
        );
        break;
      }

      // Check for duplicates (same order ID on consecutive pages)
      const newOrders = pageOrders.filter(
        (order) => !allOrders.some((existing) => existing.id === order.id),
      );

      if (newOrders.length === 0 && pageOrders.length > 0) {
        logger.warn(
          `[OrderHistoryService] Page ${currentPage} only contains duplicates, stopping`,
        );
        break;
      }

      allOrders.push(...newOrders);

      // Check if we have enough orders
      if (allOrders.length >= limit) {
        logger.info(
          `[OrderHistoryService] Reached limit of ${limit} orders, stopping`,
        );
        break;
      }

      // Check for next page button
      hasMorePages = await this.hasNextPage(page);

      if (hasMorePages) {
        // Click next page and wait for reload
        const clicked = await this.clickNextPage(page);

        if (!clicked) {
          logger.warn(
            "[OrderHistoryService] Failed to click next page button, stopping",
          );
          break;
        }

        // Wait for page transition
        await page.waitForSelector(".dxgvDataRow", { timeout: 10000 });
        await new Promise((resolve) => setTimeout(resolve, 1000));

        currentPage++;
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
   * Scrape orders from current page
   * Extracts data from DevExpress table using UI-SELECTORS.md column mapping
   */
  private async scrapeOrderPage(page: Page): Promise<Order[]> {
    return await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll(".dxgvDataRow"),
      ) as HTMLElement[];

      const orders: Order[] = [];

      for (const row of rows) {
        try {
          // Extract cells from row
          const cells = Array.from(
            row.querySelectorAll("td"),
          ) as HTMLElement[];

          if (cells.length < 10) {
            // Expected at least 10 columns (see UI-SELECTORS.md)
            continue;
          }

          // Column mapping from UI-SELECTORS.md:
          // 0: ID (edit icon) - extract ID from link or adjacent text
          // 1: ORDI VENDITA (Order Number) - e.g., "ORD/26000405"
          // 2: PROFILO CLIENTE (Customer Profile ID) - e.g., "1002209"
          // 3: NOME VENDITORE (Seller Name)
          // 4: NOME DI CONSEGNA (Delivery Name)
          // 5: INDIRIZZO DI CONSEGNA (Delivery Address)
          // 6: DATA DI CREAZIONE (Creation Date) - "DD/MM/YYYY HH:MM:SS"
          // 7: DATA DI CONSEGNA (Delivery Date) - "DD/MM/YYYY"
          // 8: RIMANI VENDUTE FINANZIARE (Financial Remains) - skip
          // 9: RIFERIMENTO CLIENTE (Customer Reference) - optional
          // 10: STATO DELLE VENDITE (Sales Status)

          // Extract ID from first cell (may be in link or text)
          const idCell = cells[0];
          let id = "";
          const idLink = idCell.querySelector("a");
          if (idLink) {
            // Extract ID from href or text
            const href = idLink.getAttribute("href") || "";
            const match = href.match(/\/(\d+)\?/);
            if (match) {
              id = match[1];
            } else {
              id = idLink.textContent?.trim() || "";
            }
          } else {
            // Fallback: try to find ID in text content
            const textMatch = idCell.textContent?.match(/\d+/);
            id = textMatch ? textMatch[0] : "";
          }

          const orderNumber = cells[1]?.textContent?.trim() || "";
          const customerProfileId = cells[2]?.textContent?.trim() || "";
          const customerName = cells[3]?.textContent?.trim() || "";
          const deliveryName = cells[4]?.textContent?.trim() || "";
          const deliveryAddress = cells[5]?.textContent?.trim() || "";
          const creationDateText = cells[6]?.textContent?.trim() || "";
          const deliveryDateText = cells[7]?.textContent?.trim() || "";
          const customerReference = cells[9]?.textContent?.trim() || "";
          const status = cells[10]?.textContent?.trim() || "";

          // Parse dates from DD/MM/YYYY format to ISO 8601
          const parseDate = (dateStr: string): string => {
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
          };

          const creationDate = parseDate(creationDateText);
          const deliveryDate = parseDate(deliveryDateText);

          // Only add if we have minimum required fields
          if (id && orderNumber) {
            orders.push({
              id,
              orderNumber,
              customerProfileId,
              customerName,
              deliveryName,
              deliveryAddress,
              creationDate,
              deliveryDate,
              status,
              customerReference: customerReference || undefined,
            });
          }
        } catch (error) {
          // Skip row on error
          console.error("Error parsing order row:", error);
        }
      }

      return orders;
    });
  }

  /**
   * Check if next page button exists and is enabled
   * Follows pagination pattern from customer-sync-service.ts
   */
  private async hasNextPage(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
      // Check for ">" next button (from pagination screenshots)
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
          !btn.classList.contains("dxp-disabled") &&
          !btn.classList.contains("aspNetDisabled")
        ) {
          return true;
        }
      }

      return false;
    });
  }

  /**
   * Click next page button
   * Returns true if successfully clicked, false otherwise
   */
  private async clickNextPage(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
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
          !btn.classList.contains("dxp-disabled") &&
          !btn.classList.contains("aspNetDisabled")
        ) {
          (btn as HTMLElement).click();
          return true;
        }
      }

      return false;
    });
  }
}
