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
  // tracking and documents added in Plan 10-04
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

      // Add all orders from page (no duplicate check - Archibald data is authoritative)
      allOrders.push(...pageOrders);

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

  /**
   * Get complete order detail for a single order
   * @param context BrowserContext for the user session
   * @param userId User ID for logging
   * @param orderId Internal order ID (from Order.id)
   * @returns OrderDetail with items and timeline, or null if not found
   */
  async getOrderDetail(
    context: BrowserContext,
    userId: string,
    orderId: string,
  ): Promise<OrderDetail | null> {
    logger.info(
      `[OrderHistoryService] Fetching order detail for user ${userId}, order ${orderId}`,
    );

    try {
      // Create new page in user's context
      const page = await context.newPage();

      try {
        // Navigate directly to order detail URL (from UI-SELECTORS.md)
        const detailUrl = `https://4.231.124.90/Archibald/SALESTABLE_DetailViewAgent/${orderId}?mode=View`;

        await page.goto(detailUrl, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        // Wait for detail view to load (check for "Panoramica" tab)
        await page.waitForSelector('text=Panoramica', { timeout: 30000 });

        logger.info(
          `[OrderHistoryService] Order detail page loaded for order ${orderId}`,
        );

        // Extract order detail data
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
      } finally {
        await page.close();
      }
    } catch (error) {
      logger.error(
        `[OrderHistoryService] Error fetching order detail for user ${userId}, order ${orderId}`,
        { error },
      );

      return null;
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
        // The table appears after clicking "Linee di vendita:" tab
        // For now, look for any table with article data
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
        };

        return orderDetail;
      } catch (error) {
        console.error("Error extracting order detail:", error);
        return null;
      }
    }, orderId);
  }
}
