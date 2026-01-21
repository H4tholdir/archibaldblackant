import type { BrowserContext, Page } from "puppeteer";
import { logger } from "./logger";
import { config } from "./config";
import { BrowserPool } from "./browser-pool";
import { OrderDatabaseNew, type OrderRecord } from "./order-db-new";

export interface DDTData {
  // All 11 columns from CUSTPACKINGSLIPJOUR_ListView table
  ddtId?: string; // Col 0: ID (DDT internal ID)
  ddtNumber: string; // Col 1: Documento di trasporto (e.g., "DDT/26000515")
  ddtDeliveryDate?: string; // Col 2: Data di consegna (ISO 8601)
  orderId: string; // Col 3: ID di vendita (e.g., "ORD/26000552") - MATCH KEY
  customerAccountId?: string; // Col 4: Conto dell'ordine (e.g., "1002209")
  salesName?: string; // Col 5: Nome vendite
  deliveryName?: string; // Col 6: Nome di consegna
  trackingNumber?: string; // Col 7: Numero di tracciabilità (e.g., "445291888246")
  deliveryTerms?: string; // Col 8: Termini di consegna
  deliveryMethod?: string; // Col 9: Modalità di consegna (e.g., "FedEx", "UPS Italia")
  deliveryCity?: string; // Col 10: Città di consegna

  // Computed fields
  trackingUrl?: string; // Full courier tracking URL (computed from tracking)
  trackingCourier?: string; // Normalized courier name: "fedex", "ups", "dhl" (computed)
}

export interface SyncResult {
  success: boolean;
  matched: number;
  notFound: number;
  scrapedCount: number;
  message?: string;
  error?: string;
}

/**
 * DDTScraperService - Scrape transport documents (DDT) and tracking data
 *
 * Workflow:
 * 1. Navigate to CUSTPACKINGSLIPJOUR_ListView page
 * 2. Detect column positions by header text (robust to column reordering)
 * 3. Extract DDT data from table rows
 * 4. Handle pagination if needed
 * 5. Match DDT to orders by order ID
 * 6. Update database with tracking information
 *
 * Features:
 * - Header-based column detection (Phase 10-04 pattern)
 * - Courier-specific tracking URL normalization
 * - Pagination support
 * - Transactional database updates
 * - Comprehensive error handling
 */
export class DDTScraperService {
  private readonly ddtPageUrl = `${config.archibald.url}/CUSTPACKINGSLIPJOUR_ListView/`;
  private readonly orderDb = OrderDatabaseNew.getInstance();

  /**
   * Scrape all DDT data from Archibald
   */
  async scrapeDDTData(userId: string): Promise<DDTData[]> {
    logger.info(`[DDTScraper] Starting DDT scraping for user ${userId}`);

    const browserPool = BrowserPool.getInstance();
    let context: BrowserContext | null = null;
    let success = false;

    try {
      // Acquire browser context with fresh login
      context = await browserPool.acquireContext(userId);
      const page = await context.newPage();

      try {
        // Navigate to DDT page
        logger.info("[DDTScraper] Navigating to DDT page");
        await page.goto(this.ddtPageUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        // Wait for table to load
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Scrape all pages
        const allDDTData: DDTData[] = [];
        let pageNum = 1;

        do {
          logger.info(`[DDTScraper] Scraping page ${pageNum}`);

          const pageData = await this.scrapeDDTPage(page);
          allDDTData.push(...pageData);

          // Check for next page
          const hasNext = await this.hasNextPage(page);
          if (!hasNext) break;

          await this.clickNextPage(page);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          pageNum++;
        } while (pageNum <= 20); // Safety limit

        logger.info(
          `[DDTScraper] Scraped ${allDDTData.length} DDT entries from ${pageNum} pages`,
        );

        success = true;
        return allDDTData;
      } finally {
        if (!page.isClosed()) {
          await page.close().catch(() => {});
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("[DDTScraper] Failed to scrape DDT data", {
        error: errorMessage,
      });
      throw error;
    } finally {
      if (context) {
        await browserPool.releaseContext(userId, context, success);
      }
    }
  }

  /**
   * Scrape DDT data from current page
   */
  private async scrapeDDTPage(page: Page): Promise<DDTData[]> {
    return await page.evaluate(() => {
      // Find table
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) {
        console.error("[DDTScraper] DDT table not found");
        return [];
      }

      // Detect column indices by header text
      const headerRow = table.querySelector("tr.dxgvHeader");
      if (!headerRow) {
        console.error("[DDTScraper] Header row not found");
        return [];
      }

      const headers = Array.from(headerRow.querySelectorAll("td"));
      const columnMap: Record<string, number> = {};

      headers.forEach((header, index) => {
        const text = header.textContent?.trim().toUpperCase() || "";

        // Map all 11 DDT columns based on TABLE-ANALYSIS.md
        if (
          text.includes("ID") &&
          !text.includes("VENDITA") &&
          !text.includes("TRACCIABILIT")
        ) {
          columnMap.ddtId = index;
        } else if (
          text.includes("DOCUMENTO DI TRASPORTO") ||
          text.includes("NUMERO DDT")
        ) {
          columnMap.ddtNumber = index;
        } else if (
          text.includes("DATA DI CONSEGNA") ||
          text.includes("DATA CONSEGNA")
        ) {
          columnMap.deliveryDate = index;
        } else if (text.includes("ID DI VENDITA")) {
          columnMap.orderId = index;
        } else if (
          text.includes("CONTO DELL'ORDINE") ||
          text.includes("CONTO ORDINE")
        ) {
          columnMap.customerAccountId = index;
        } else if (
          text.includes("NOME VENDITE") ||
          text.includes("NOME VENDITORE")
        ) {
          columnMap.salesName = index;
        } else if (
          text.includes("NOME DI CONSEGNA") ||
          text.includes("NOME CONSEGNA")
        ) {
          columnMap.deliveryName = index;
        } else if (
          text.includes("TRACCIABILITÀ") ||
          text.includes("NUMERO DI TRACCIABILITÀ")
        ) {
          columnMap.tracking = index;
        } else if (
          text.includes("TERMINI DI CONSEGNA") ||
          text.includes("TERMINI CONSEGNA")
        ) {
          columnMap.deliveryTerms = index;
        } else if (
          text.includes("MODALITÀ DI CONSEGNA") ||
          text.includes("MODALITA")
        ) {
          columnMap.deliveryMethod = index;
        } else if (
          text.includes("CITTÀ DI CONSEGNA") ||
          text.includes("CITTA")
        ) {
          columnMap.deliveryCity = index;
        }
      });

      // Validate required columns
      if (
        columnMap.ddtNumber === undefined ||
        columnMap.orderId === undefined
      ) {
        console.error("[DDTScraper] Required columns not found", columnMap);
        return [];
      }

      // Extract data from rows
      const dataRows = Array.from(
        table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"),
      );
      const ddtData: any[] = [];

      for (const row of dataRows) {
        const cells = Array.from(row.querySelectorAll("td"));

        if (cells.length === 0) continue;

        // Extract DDT number
        const ddtNumber = cells[columnMap.ddtNumber]?.textContent?.trim();
        if (!ddtNumber || !ddtNumber.startsWith("DDT/")) continue;

        // Extract order ID
        const orderId = cells[columnMap.orderId]?.textContent?.trim();
        if (!orderId || !orderId.startsWith("ORD/")) {
          console.warn(
            `[DDTScraper] Skipping DDT ${ddtNumber} - missing order ID`,
          );
          continue;
        }

        // Extract tracking info
        let trackingNumber: string | undefined;
        let trackingUrl: string | undefined;
        let trackingCourier: string | undefined;

        if (columnMap.tracking !== undefined) {
          const trackingCell = cells[columnMap.tracking];
          const trackingLink = trackingCell?.querySelector("a");

          if (trackingLink) {
            const trackingText = trackingLink.textContent?.trim() || "";
            const href = trackingLink.getAttribute("href");

            // Parse "fedex 445291888246" or "Ups 1Z4V26Y86873288996"
            const parts = trackingText.split(/\s+/);
            if (parts.length >= 2) {
              trackingCourier = parts[0].toLowerCase();
              trackingNumber = parts.slice(1).join(" ");
              trackingUrl = href || undefined;
            }
          }
        }

        // Build DDT entry with all 11 columns
        ddtData.push({
          ddtId:
            columnMap.ddtId !== undefined
              ? cells[columnMap.ddtId]?.textContent?.trim()
              : undefined,
          ddtNumber,
          ddtDeliveryDate:
            columnMap.deliveryDate !== undefined
              ? cells[columnMap.deliveryDate]?.textContent?.trim()
              : undefined,
          orderId, // Match key
          customerAccountId:
            columnMap.customerAccountId !== undefined
              ? cells[columnMap.customerAccountId]?.textContent?.trim()
              : undefined,
          salesName:
            columnMap.salesName !== undefined
              ? cells[columnMap.salesName]?.textContent?.trim()
              : undefined,
          deliveryName:
            columnMap.deliveryName !== undefined
              ? cells[columnMap.deliveryName]?.textContent?.trim()
              : undefined,
          trackingNumber,
          trackingUrl,
          trackingCourier,
          deliveryTerms:
            columnMap.deliveryTerms !== undefined
              ? cells[columnMap.deliveryTerms]?.textContent?.trim()
              : undefined,
          deliveryMethod:
            columnMap.deliveryMethod !== undefined
              ? cells[columnMap.deliveryMethod]?.textContent?.trim()
              : undefined,
          deliveryCity:
            columnMap.deliveryCity !== undefined
              ? cells[columnMap.deliveryCity]?.textContent?.trim()
              : undefined,
        });
      }

      return ddtData;
    });
  }

  /**
   * Check if there's a next page
   */
  private async hasNextPage(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
      const nextBtn = document.querySelector('img[alt="Next"]');
      return nextBtn && !nextBtn.closest(".dxp-disabled") ? true : false;
    });
  }

  /**
   * Click next page button
   */
  private async clickNextPage(page: Page): Promise<void> {
    await page.evaluate(() => {
      const nextBtn = document.querySelector('img[alt="Next"]');
      if (nextBtn) {
        (nextBtn as HTMLElement).click();
      }
    });
  }

  /**
   * Match DDT data to orders and update database
   */
  async syncDDTToOrders(
    userId: string,
    ddtData: DDTData[],
  ): Promise<SyncResult> {
    logger.info(
      `[DDTScraper] Syncing ${ddtData.length} DDT entries for user ${userId}`,
    );

    let matched = 0;
    let notFound = 0;

    try {
      for (const ddt of ddtData) {
        // Find order by order ID
        const order = this.orderDb.getOrderById(userId, ddt.orderId);

        if (!order) {
          notFound++;
          logger.warn(
            `[DDTScraper] Order ${ddt.orderId} not found in database for DDT ${ddt.ddtNumber}`,
          );
          continue;
        }

        // Update order with DDT data - pass ALL extracted fields
        this.orderDb.updateOrderDDT(userId, ddt.orderId, {
          ddtNumber: ddt.ddtNumber,
          ddtDeliveryDate: ddt.ddtDeliveryDate,
          ddtId: ddt.ddtId,
          ddtCustomerAccount: ddt.customerAccountId,
          ddtSalesName: ddt.salesName,
          ddtDeliveryName: ddt.deliveryName,
          deliveryTerms: ddt.deliveryTerms,
          deliveryMethod: ddt.deliveryMethod,
          deliveryCity: ddt.deliveryCity,
          trackingNumber: ddt.trackingNumber,
          trackingUrl: ddt.trackingUrl,
          trackingCourier: ddt.trackingCourier,
        });

        matched++;
        logger.info(
          `[DDTScraper] Matched DDT ${ddt.ddtNumber} to order ${ddt.orderId}`,
        );
      }

      const message = `Synced ${matched} DDT entries, ${notFound} not found in database`;
      logger.info(`[DDTScraper] ${message}`);

      return {
        success: true,
        matched,
        notFound,
        scrapedCount: ddtData.length,
        message,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("[DDTScraper] Failed to sync DDT data", {
        error: errorMessage,
      });

      return {
        success: false,
        matched,
        notFound,
        scrapedCount: ddtData.length,
        error: `Failed to sync DDT data: ${errorMessage}`,
      };
    }
  }

  /**
   * Download DDT PDF for a specific order
   * Workflow:
   * 1. Navigate to DDT page
   * 2. Find DDT by order ID (direct match via ddtOrderNumber)
   * 3. Select DDT row
   * 4. Click "Scarica PDF" button
   * 5. Wait for PDF link generation
   * 6. Download PDF via Puppeteer CDP
   */
  async downloadDDTPDF(userId: string, order: OrderRecord): Promise<Buffer> {
    logger.info(`[DDTScraper] Downloading DDT PDF for order ${order.id}`, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      ddtNumber: order.ddtNumber,
      trackingNumber: order.trackingNumber,
    });

    // Verify order has DDT
    if (!order.ddtNumber) {
      throw new Error(`Order ${order.id} has no DDT number`);
    }

    const browserPool = BrowserPool.getInstance();
    let context: BrowserContext | null = null;
    let success = false;

    try {
      // Acquire browser context
      logger.info(`[DDTScraper] Acquiring browser context for user ${userId}`);
      context = await browserPool.acquireContext(userId);
      const page = await context.newPage();

      try {
        // Navigate to DDT page
        logger.info(`[DDTScraper] Navigating to DDT page: ${this.ddtPageUrl}`);
        await page.goto(this.ddtPageUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        // Wait for page to load
        logger.info("[DDTScraper] Waiting for page to load (2s)");
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Use search bar to filter for specific order
        logger.info(
          `[DDTScraper] Using search bar to filter for order ${order.orderNumber}`,
        );
        const searchInputSelector =
          'input[id*="SearchAC"][id*="Ed_I"][type="text"]';
        await page.waitForSelector(searchInputSelector, { timeout: 10000 });

        // Click on search field to focus it
        await page.click(searchInputSelector);
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Paste order number (faster than typing)
        logger.info(
          `[DDTScraper] Pasting order number "${order.orderNumber}" into search field`,
        );
        await page.evaluate(
          (selector, orderNumber) => {
            const input = document.querySelector(selector) as HTMLInputElement;
            if (input) {
              // Clear existing value
              input.value = "";
              input.focus();

              // Set new value
              input.value = orderNumber || "";

              // Trigger all relevant events that DevExpress might listen to
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
              input.dispatchEvent(
                new KeyboardEvent("keyup", {
                  bubbles: true,
                  key: "Enter",
                  keyCode: 13,
                }),
              );

              // Trigger DevExpress-specific events if they exist
              if (typeof (window as any).ASPx !== "undefined") {
                const aspx = (window as any).ASPx;
                if (aspx.EValueChanged) {
                  aspx.EValueChanged(input.id);
                }
              }
            }
          },
          searchInputSelector,
          order.orderNumber,
        );

        // Small delay for DevExpress to process
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Trigger search by pressing Enter
        logger.info("[DDTScraper] Triggering search with Enter key");
        await page.keyboard.press("Enter");

        // Wait for filtered results to load
        logger.info("[DDTScraper] Waiting for filtered results (3s)");
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Verify that we have exactly 1 result row
        logger.info("[DDTScraper] Verifying filtered results");
        const rowCount = await page.evaluate(() => {
          const rows = document.querySelectorAll(
            "tr.dxgvDataRow, tr.dxgvDataRow_XafTheme",
          );
          return rows.length;
        });

        logger.info(`[DDTScraper] Found ${rowCount} row(s) after filtering`);

        if (rowCount === 0) {
          throw new Error(
            `No DDT found for order ${order.orderNumber} after search`,
          );
        }

        // Get the row ID from the first (and should be only) result
        logger.info("[DDTScraper] Getting row ID from filtered result");
        const rowId = await page.evaluate(() => {
          const row = document.querySelector(
            "tr.dxgvDataRow, tr.dxgvDataRow_XafTheme",
          );
          return row?.id || null;
        });

        if (!rowId) {
          throw new Error(
            `Could not find row ID for order ${order.orderNumber}`,
          );
        }

        logger.info(`[DDTScraper] Found row ID: ${rowId}`);

        // Select DDT row by clicking checkbox (DevExpress style)
        logger.info(`[DDTScraper] Selecting DDT row (rowId: ${rowId})`);
        await page.evaluate((id) => {
          // Find the row first
          const row = document.getElementById(id);
          if (!row) {
            throw new Error(`Row not found with id: ${id}`);
          }

          // Find the td.dxgvCommandColumn with onclick attribute
          const checkboxTd = row.querySelector(
            'td.dxgvCommandColumn_XafTheme[onclick*="Select"]',
          ) as HTMLElement;

          if (checkboxTd) {
            // Click the td element (DevExpress handles the rest)
            checkboxTd.click();
          } else {
            throw new Error(`Checkbox td not found for row ${id}`);
          }
        }, rowId);

        // Wait for selection to register
        logger.info("[DDTScraper] Waiting for selection to register (1s)");
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Trigger PDF generation
        logger.info('[DDTScraper] Clicking "Scarica PDF" button');
        await page.click('li[title="Scarica PDF"] a.dxm-content');

        // Wait for PDF link to appear (div selector for DDT)
        logger.info(
          "[DDTScraper] Waiting for PDF link generation (15s timeout)",
        );
        await page.waitForSelector(
          'div[id$="_xaf_InvoicePDF"] a.XafFileDataAnchor',
          {
            timeout: 15000,
          },
        );
        logger.info("[DDTScraper] PDF link appeared");

        // Setup Puppeteer download interception via CDP
        const client = await (page.target() as any).createCDPSession();
        const tmpDir = "/tmp/archibald-ddt";

        // Ensure tmp directory exists
        const fs = await import("node:fs/promises");
        await fs.mkdir(tmpDir, { recursive: true });

        await client.send("Page.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: tmpDir,
        });

        logger.info("[DDTScraper] Clicking PDF link to download");

        // Click PDF link
        await page.click('div[id$="_xaf_InvoicePDF"] a.XafFileDataAnchor');

        // Wait for download to complete
        logger.info("[DDTScraper] Waiting for download to complete (5s)");
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Find the downloaded file
        logger.info(`[DDTScraper] Looking for PDF in ${tmpDir}`);
        const files = await fs.readdir(tmpDir);
        logger.info(
          `[DDTScraper] Found ${files.length} files in download dir: ${files.join(", ")}`,
        );
        const pdfFile = files.find((f) => f.endsWith(".pdf"));

        if (!pdfFile) {
          logger.error(
            `[DDTScraper] PDF file not found in download directory`,
            {
              tmpDir,
              filesFound: files,
            },
          );
          throw new Error("PDF file not found in download directory");
        }

        const pdfPath = `${tmpDir}/${pdfFile}`;
        logger.info(`[DDTScraper] Reading PDF from ${pdfPath}`);

        // Read PDF into Buffer
        const pdfBuffer = await fs.readFile(pdfPath);

        // Clean up temp file
        await fs.unlink(pdfPath).catch(() => {});

        logger.info(
          `[DDTScraper] Successfully downloaded DDT PDF (${pdfBuffer.length} bytes)`,
        );

        success = true;
        return pdfBuffer;
      } finally {
        if (!page.isClosed()) {
          await page.close().catch(() => {});
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("[DDTScraper] Failed to download DDT PDF", {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        orderId: order.id,
        orderNumber: order.orderNumber,
        ddtNumber: order.ddtNumber,
        userId,
      });
      throw error;
    } finally {
      if (context) {
        logger.info(
          `[DDTScraper] Releasing browser context (success: ${success})`,
        );
        await browserPool.releaseContext(userId, context, success);
      }
    }
  }

  /**
   * Normalize tracking URL by courier
   */
  private normalizeTrackingUrl(
    courier: string,
    trackingNumber: string,
  ): string {
    const courierLower = courier.toLowerCase();

    switch (courierLower) {
      case "fedex":
        return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}&locale=it_IT`;

      case "ups":
        return `https://www.ups.com/track?HTMLVersion=5.0&loc=it_IT&Requester=UPSHome&tracknum=${trackingNumber}`;

      case "dhl":
        return `https://www.dhl.com/it-it/home/tracking.html?tracking-id=${trackingNumber}`;

      default:
        logger.warn(
          `[DDTScraper] Unknown courier: ${courier}, cannot normalize URL`,
        );
        return "";
    }
  }
}
