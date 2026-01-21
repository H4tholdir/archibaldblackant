import type { BrowserContext, Page } from "puppeteer";
import { logger } from "./logger";
import { config } from "./config";
import { BrowserPool } from "./browser-pool";
import { OrderDatabaseNew, type OrderRecord } from "./order-db-new";

export interface InvoiceData {
  invoiceNumber: string; // Invoice number (e.g., "FT/2026/00123")
  invoiceDate?: string; // Invoice date (ISO 8601)
  invoiceAmount?: number; // Invoice total amount
  customerAccountId?: string; // Customer account ID for matching
  customerName?: string; // Customer name for matching
  quantity?: number; // Invoice quantity
  remainingAmount?: number; // Remaining amount to be paid
  taxAmount?: number; // Tax amount (Somma fiscale MST)
  lineDiscount?: number; // Line discount (Somma linea sconto MST)
  totalDiscount?: number; // Total discount
  dueDate?: string; // Invoice due date (Scadenza)
  paymentTermsId?: string; // Payment terms ID
  purchaseOrderNumber?: string; // Purchase order number
  closed?: boolean; // Whether invoice is closed
  rowId?: string; // Row ID for checkbox selection (PDF download)
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
 * InvoiceScraperService - Scrape invoice data and download PDFs
 *
 * Workflow:
 * 1. Navigate to CUSTINVOICEJOUR_ListView page
 * 2. Detect column positions by header text (robust to column reordering)
 * 3. Extract invoice data from table rows
 * 4. Handle pagination if needed
 * 5. Match invoices to orders by customer ID + date range
 * 6. Update database with invoice information
 * 7. Download PDF on demand via Puppeteer CDP
 *
 * Features:
 * - Header-based column detection (Phase 10-04 pattern)
 * - Customer + date-based matching (no direct order ID)
 * - PDF download via Chrome DevTools Protocol
 * - Pagination support
 * - Transactional database updates
 * - Comprehensive error handling
 */
export class InvoiceScraperService {
  private readonly invoicePageUrl = `${config.archibald.url}/CUSTINVOICEJOUR_ListView/`;
  private readonly orderDb = OrderDatabaseNew.getInstance();

  /**
   * Scrape all invoice data from Archibald
   */
  async scrapeInvoiceData(userId: string): Promise<InvoiceData[]> {
    logger.info(
      `[InvoiceScraper] Starting invoice scraping for user ${userId}`,
    );

    const browserPool = BrowserPool.getInstance();
    let context: BrowserContext | null = null;
    let success = false;

    try {
      // Acquire browser context with fresh login
      context = await browserPool.acquireContext(userId);
      const page = await context.newPage();

      try {
        // Navigate to Invoice page
        logger.info("[InvoiceScraper] Navigating to Invoice page");
        await page.goto(this.invoicePageUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        // Wait for table to load
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Scrape all pages
        const allInvoiceData: InvoiceData[] = [];
        let pageNum = 1;

        do {
          logger.info(`[InvoiceScraper] Scraping page ${pageNum}`);

          const pageData = await this.scrapeInvoicePage(page);
          allInvoiceData.push(...pageData);

          // Check for next page
          const hasNext = await this.hasNextPage(page);
          if (!hasNext) break;

          await this.clickNextPage(page);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          pageNum++;
        } while (pageNum <= 20); // Safety limit

        logger.info(
          `[InvoiceScraper] Scraped ${allInvoiceData.length} invoice entries from ${pageNum} pages`,
        );

        success = true;
        return allInvoiceData;
      } finally {
        if (!page.isClosed()) {
          await page.close().catch(() => {});
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("[InvoiceScraper] Failed to scrape invoice data", {
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
   * Scrape invoice data from current page
   */
  private async scrapeInvoicePage(page: Page): Promise<InvoiceData[]> {
    return await page.evaluate(() => {
      // Find table
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) {
        console.error("[InvoiceScraper] Invoice table not found");
        return [];
      }

      // Detect column indices by header text
      const headerRow = table.querySelector("tr.dxgvHeader");
      if (!headerRow) {
        console.error("[InvoiceScraper] Header row not found");
        return [];
      }

      const headers = Array.from(headerRow.querySelectorAll("td"));
      const columnMap: Record<string, number> = {};

      headers.forEach((header, index) => {
        const text = header.textContent?.trim().toUpperCase() || "";

        // Map invoice columns based on PDF analysis
        if (
          text.includes("NUMERO FATTURA") ||
          (text.includes("FATTURA") && text.includes("ID"))
        ) {
          columnMap.invoiceNumber = index;
        } else if (
          text.includes("DATA EMISSIONE") ||
          text.includes("DATA FATTURA")
        ) {
          columnMap.invoiceDate = index;
        } else if (
          text.includes("IMPORTO FATTURA") ||
          (text.includes("IMPORTO") &&
            !text.includes("RESIDUO") &&
            !text.includes("SALDO") &&
            !text.includes("LIQUIDA"))
        ) {
          columnMap.invoiceAmount = index;
        } else if (
          text.includes("CONTO FATTUR") ||
          text.includes("CONTO CLIENTE")
        ) {
          columnMap.customerAccountId = index;
        } else if (
          text.includes("NOME DI FATTURAZIONE") ||
          (text.includes("NOME") && text.includes("VENDITE"))
        ) {
          columnMap.customerName = index;
        } else if (text.includes("QUANTITÀ") || text.includes("QUANTITA")) {
          columnMap.quantity = index;
        } else if (
          text.includes("IMPORTO RIMANENTE") ||
          text.includes("RESIDUO")
        ) {
          columnMap.remainingAmount = index;
        } else if (text.includes("SOMMA FISCALE")) {
          columnMap.taxAmount = index;
        } else if (text.includes("SOMMA LINEA SCONTO")) {
          columnMap.lineDiscount = index;
        } else if (text.includes("SCONTO TOTALE")) {
          columnMap.totalDiscount = index;
        } else if (text.includes("SCADENZA") && !text.includes("OLTRE")) {
          columnMap.dueDate = index;
        } else if (text.includes("ID TERMINE DI PAGAMENTO")) {
          columnMap.paymentTermsId = index;
        } else if (text.includes("ORDINE DI ACQUISTO")) {
          columnMap.purchaseOrder = index;
        } else if (text.includes("CHIUSO")) {
          columnMap.closed = index;
        }
      });

      // Validate required columns
      if (columnMap.invoiceNumber === undefined) {
        console.error(
          "[InvoiceScraper] Required column (NUMERO FATTURA) not found",
          columnMap,
        );
        return [];
      }

      // Extract data from rows
      const dataRows = Array.from(
        table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"),
      );
      const invoiceData: any[] = [];

      for (const row of dataRows) {
        const cells = Array.from(row.querySelectorAll("td"));

        if (cells.length === 0) continue;

        // Extract invoice number
        const invoiceNumber =
          cells[columnMap.invoiceNumber]?.textContent?.trim();
        if (!invoiceNumber) continue;

        // Parse invoice date to ISO 8601
        let invoiceDate: string | undefined;
        if (columnMap.invoiceDate !== undefined) {
          const dateText = cells[columnMap.invoiceDate]?.textContent?.trim();
          if (dateText) {
            // Parse Italian date format (dd/MM/yyyy) to ISO 8601
            const dateParts = dateText.split("/");
            if (dateParts.length === 3) {
              invoiceDate = `${dateParts[2]}-${dateParts[1].padStart(2, "0")}-${dateParts[0].padStart(2, "0")}`;
            }
          }
        }

        // Parse invoice amount (handle currency format: €1.234,56)
        let invoiceAmount: number | undefined;
        if (columnMap.invoiceAmount !== undefined) {
          const amountText =
            cells[columnMap.invoiceAmount]?.textContent?.trim();
          if (amountText) {
            // Remove currency symbol and convert to float
            // Italian format: €1.234,56 → 1234.56
            const cleanAmount = amountText
              .replace(/[€\s]/g, "")
              .replace(/\./g, "")
              .replace(/,/, ".");
            const parsedAmount = parseFloat(cleanAmount);
            if (!isNaN(parsedAmount)) {
              invoiceAmount = parsedAmount;
            } else {
              console.warn(
                `[InvoiceScraper] Failed to parse amount: ${amountText}`,
              );
            }
          }
        }

        // Helper function to parse currency amounts
        const parseAmount = (text: string | undefined): number | undefined => {
          if (!text) return undefined;
          const cleanAmount = text
            .replace(/[€\s]/g, "")
            .replace(/\./g, "")
            .replace(/,/, ".");
          const parsed = parseFloat(cleanAmount);
          return isNaN(parsed) ? undefined : parsed;
        };

        // Helper function to parse date
        const parseDate = (text: string | undefined): string | undefined => {
          if (!text) return undefined;
          const dateParts = text.split("/");
          if (dateParts.length === 3) {
            return `${dateParts[2]}-${dateParts[1].padStart(2, "0")}-${dateParts[0].padStart(2, "0")}`;
          }
          return undefined;
        };

        // Build invoice entry with ALL fields
        invoiceData.push({
          invoiceNumber,
          invoiceDate,
          invoiceAmount,
          customerAccountId:
            columnMap.customerAccountId !== undefined
              ? cells[columnMap.customerAccountId]?.textContent?.trim()
              : undefined,
          customerName:
            columnMap.customerName !== undefined
              ? cells[columnMap.customerName]?.textContent?.trim()
              : undefined,
          quantity:
            columnMap.quantity !== undefined
              ? parseInt(cells[columnMap.quantity]?.textContent?.trim() || "0")
              : undefined,
          remainingAmount:
            columnMap.remainingAmount !== undefined
              ? parseAmount(
                  cells[columnMap.remainingAmount]?.textContent?.trim(),
                )
              : undefined,
          taxAmount:
            columnMap.taxAmount !== undefined
              ? parseAmount(cells[columnMap.taxAmount]?.textContent?.trim())
              : undefined,
          lineDiscount:
            columnMap.lineDiscount !== undefined
              ? parseAmount(cells[columnMap.lineDiscount]?.textContent?.trim())
              : undefined,
          totalDiscount:
            columnMap.totalDiscount !== undefined
              ? parseAmount(cells[columnMap.totalDiscount]?.textContent?.trim())
              : undefined,
          dueDate:
            columnMap.dueDate !== undefined
              ? parseDate(cells[columnMap.dueDate]?.textContent?.trim())
              : undefined,
          paymentTermsId:
            columnMap.paymentTermsId !== undefined
              ? cells[columnMap.paymentTermsId]?.textContent?.trim()
              : undefined,
          purchaseOrderNumber:
            columnMap.purchaseOrder !== undefined
              ? cells[columnMap.purchaseOrder]?.textContent?.trim()
              : undefined,
          closed:
            columnMap.closed !== undefined
              ? cells[columnMap.closed]?.textContent?.trim().toLowerCase() ===
                  "sì" ||
                cells[columnMap.closed]?.textContent?.trim().toLowerCase() ===
                  "yes"
              : undefined,
          rowId: row.id || undefined, // Store row ID for PDF download
        });
      }

      return invoiceData;
    });
  }

  /**
   * Sync invoices to orders in database
   * Matches by customer ID + date range
   */
  async syncInvoicesToOrders(
    userId: string,
    invoiceData: InvoiceData[],
  ): Promise<SyncResult> {
    logger.info(
      `[InvoiceScraper] Syncing ${invoiceData.length} invoices for user ${userId}`,
    );

    const orders = this.orderDb.getOrdersByUser(userId);
    let matched = 0;
    let notFound = 0;

    // Match each invoice to an order
    for (const invoice of invoiceData) {
      // Find matching order by customer ID + date range
      const matchedOrder = this.matchInvoiceToOrder(invoice, orders);

      if (matchedOrder) {
        // Update order with invoice data - pass ALL extracted fields
        this.orderDb.updateInvoiceData(userId, matchedOrder.id, {
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate || null,
          invoiceAmount: invoice.invoiceAmount
            ? String(invoice.invoiceAmount)
            : null,
          invoiceCustomerAccount: invoice.customerAccountId || null,
          invoiceBillingName: invoice.customerName || null,
          invoiceQuantity: invoice.quantity || null,
          invoiceRemainingAmount: invoice.remainingAmount
            ? String(invoice.remainingAmount)
            : null,
          invoiceTaxAmount: invoice.taxAmount
            ? String(invoice.taxAmount)
            : null,
          invoiceLineDiscount: invoice.lineDiscount
            ? String(invoice.lineDiscount)
            : null,
          invoiceTotalDiscount: invoice.totalDiscount
            ? String(invoice.totalDiscount)
            : null,
          invoiceDueDate: invoice.dueDate || null,
          invoicePaymentTermsId: invoice.paymentTermsId || null,
          invoicePurchaseOrder: invoice.purchaseOrderNumber || null,
          invoiceClosed: invoice.closed || null,
        });
        matched++;
        logger.debug(
          `[InvoiceScraper] Matched invoice ${invoice.invoiceNumber} to order ${matchedOrder.id}`,
        );
      } else {
        notFound++;
        logger.warn(
          `[InvoiceScraper] No matching order for invoice ${invoice.invoiceNumber}`,
        );
      }
    }

    logger.info(
      `[InvoiceScraper] Sync complete: ${matched} matched, ${notFound} not found`,
    );

    return {
      success: true,
      matched,
      notFound,
      scrapedCount: invoiceData.length,
      message: `Matched ${matched} invoices to orders`,
    };
  }

  /**
   * Match invoice to order by customer ID + date range
   * Strategy from 11-01-RESEARCH.md:
   * 1. Filter by customer ID
   * 2. Filter by date (invoice after order placed)
   * 3. Take most recent match
   */
  private matchInvoiceToOrder(
    invoice: InvoiceData,
    orders: OrderRecord[],
  ): OrderRecord | null {
    if (!invoice.customerAccountId) {
      logger.warn(
        `[InvoiceScraper] Invoice ${invoice.invoiceNumber} has no customer ID`,
      );
      return null;
    }

    // Filter by customer ID
    const customerOrders = orders.filter(
      (order) => order.customerProfileId === invoice.customerAccountId,
    );

    if (customerOrders.length === 0) {
      return null;
    }

    // Filter by date range (invoice after order placed)
    let dateFiltered = customerOrders;
    if (invoice.invoiceDate) {
      dateFiltered = customerOrders.filter((order) => {
        if (!order.creationDate) return false;
        return invoice.invoiceDate! >= order.creationDate;
      });
    }

    if (dateFiltered.length === 0) {
      // Fallback: return most recent customer order
      return customerOrders.sort(
        (a, b) =>
          new Date(b.creationDate).getTime() -
          new Date(a.creationDate).getTime(),
      )[0];
    }

    // Sort by creation date (most recent first) and take first match
    return dateFiltered.sort(
      (a, b) =>
        new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime(),
    )[0];
  }

  /**
   * Download invoice PDF for a specific order
   * Workflow:
   * 1. Navigate to invoice page
   * 2. Find invoice by customer ID + date matching
   * 3. Select invoice row
   * 4. Click "Scarica PDF" button
   * 5. Wait for PDF link generation
   * 6. Download PDF via Puppeteer CDP
   */
  async downloadInvoicePDF(
    userId: string,
    order: OrderRecord,
  ): Promise<Buffer> {
    logger.info(
      `[InvoiceScraper] Downloading invoice PDF for order ${order.id}`,
    );

    const browserPool = BrowserPool.getInstance();
    let context: BrowserContext | null = null;
    let success = false;

    try {
      // Acquire browser context
      context = await browserPool.acquireContext(userId);
      const page = await context.newPage();

      try {
        // Navigate to Invoice page
        logger.info("[InvoiceScraper] Navigating to Invoice page");
        await page.goto(this.invoicePageUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        // Wait for table to load
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Scrape invoices to find the matching one
        const invoices = await this.scrapeInvoicePage(page);

        // Match invoice to order
        const matchedInvoice = invoices.find((inv) => {
          // Match by customer ID
          if (inv.customerAccountId !== order.customerProfileId) {
            return false;
          }
          // Match by date (invoice after order placed)
          if (inv.invoiceDate && order.creationDate) {
            return inv.invoiceDate >= order.creationDate;
          }
          return true;
        });

        if (!matchedInvoice) {
          throw new Error(
            `No invoice found for order ${order.id} (customer: ${order.customerProfileId})`,
          );
        }

        logger.info(
          `[InvoiceScraper] Found invoice ${matchedInvoice.invoiceNumber} for order ${order.id}`,
        );

        // Select invoice row by clicking checkbox
        if (!matchedInvoice.rowId) {
          throw new Error(
            `Invoice ${matchedInvoice.invoiceNumber} has no row ID`,
          );
        }

        logger.info("[InvoiceScraper] Selecting invoice row");
        await page.evaluate((rowId) => {
          const checkbox = document.querySelector(
            `input[type="checkbox"][id*="${rowId}"]`,
          ) as HTMLInputElement;
          if (checkbox) {
            checkbox.click();
          } else {
            throw new Error(`Checkbox not found for row ${rowId}`);
          }
        }, matchedInvoice.rowId);

        // Wait for selection to register
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Trigger PDF generation
        logger.info('[InvoiceScraper] Clicking "Scarica PDF" button');
        await page.click('li[title="Scarica PDF"] a.dxm-content');

        // Wait for PDF link to appear (different selector than DDT)
        logger.info("[InvoiceScraper] Waiting for PDF link generation");
        await page.waitForSelector(
          'div[id$="_xaf_InvoicePDF"] a.XafFileDataAnchor',
          {
            timeout: 15000,
          },
        );

        // Setup Puppeteer download interception via CDP
        const client = await (page.target() as any).createCDPSession();
        const tmpDir = "/tmp/archibald-invoices";

        // Ensure tmp directory exists
        const fs = await import("node:fs/promises");
        await fs.mkdir(tmpDir, { recursive: true });

        await client.send("Page.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: tmpDir,
        });

        logger.info("[InvoiceScraper] Clicking PDF link to download");

        // Click PDF link
        await page.click('div[id$="_xaf_InvoicePDF"] a.XafFileDataAnchor');

        // Wait for download to complete
        logger.info("[InvoiceScraper] Waiting for download to complete");
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Find the downloaded file
        const files = await fs.readdir(tmpDir);
        const pdfFile = files.find((f) => f.endsWith(".pdf"));

        if (!pdfFile) {
          throw new Error("PDF file not found in download directory");
        }

        const pdfPath = `${tmpDir}/${pdfFile}`;
        logger.info(`[InvoiceScraper] Reading PDF from ${pdfPath}`);

        // Read PDF into Buffer
        const pdfBuffer = await fs.readFile(pdfPath);

        // Clean up temp file
        await fs.unlink(pdfPath).catch(() => {});

        logger.info(
          `[InvoiceScraper] Successfully downloaded invoice PDF (${pdfBuffer.length} bytes)`,
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
      logger.error("[InvoiceScraper] Failed to download invoice PDF", {
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
   * Check if there's a next page
   */
  private async hasNextPage(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
      const nextButton = document.querySelector(
        'img[alt="Next"][style*="cursor: pointer"]',
      );
      return !!nextButton;
    });
  }

  /**
   * Click next page button
   */
  private async clickNextPage(page: Page): Promise<void> {
    await page.evaluate(() => {
      const nextButton = document.querySelector(
        'img[alt="Next"][style*="cursor: pointer"]',
      ) as HTMLImageElement;
      if (nextButton) {
        nextButton.click();
      }
    });
  }
}
