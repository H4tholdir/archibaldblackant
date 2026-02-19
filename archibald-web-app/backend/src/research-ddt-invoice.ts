#!/usr/bin/env tsx
/**
 * Research script for DDT and Invoice pages (Plan 11-01, Tasks 1-2)
 *
 * This script:
 * 1. Analyzes DDT page structure (CUSTPACKINGSLIPJOUR_ListView)
 * 2. Analyzes Invoice page structure (CUSTINVOICEJOUR_ListView)
 * 3. Takes screenshots
 * 4. Documents findings in console output
 */

import { ArchibaldBot } from "./bot/archibald-bot";
import { logger } from "./logger";
import { config } from "./config";
import * as fs from "fs";
import * as path from "path";

/**
 * Create screenshots directory if it doesn't exist
 */
function ensureScreenshotsDir(): string {
  const screenshotsDir = path.join(
    __dirname,
    "../../../.planning/phases/11-order-management/screenshots",
  );
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  return screenshotsDir;
}

/**
 * Wait for DevExpress table to be fully loaded
 */
async function waitForDevExpressTable(bot: ArchibaldBot): Promise<void> {
  if (!bot.page) {
    throw new Error("Browser page is null");
  }

  await bot.page.waitForFunction(
    () => {
      const rows = document.querySelectorAll("table tbody tr");
      if (rows.length === 0) return false;

      // Check if at least one row has multiple cells (real data)
      for (const row of Array.from(rows)) {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 5) {
          return true;
        }
      }
      return false;
    },
    { timeout: 15000 },
  );
}

/**
 * Analyze DDT page structure (Task 1)
 */
async function analyzeDDTPage(
  bot: ArchibaldBot,
  screenshotsDir: string,
): Promise<void> {
  logger.info("=== TASK 1: Analyzing DDT Page Structure ===");

  if (!bot.page) {
    throw new Error("Browser page is null");
  }

  // Navigate to DDT page
  const ddtUrl = `${config.archibald.url}/CUSTPACKINGSLIPJOUR_ListView/`;
  logger.info(`Navigating to DDT page: ${ddtUrl}`);

  await bot.page.goto(ddtUrl, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  logger.info("DDT page loaded, waiting for table...");
  await waitForDevExpressTable(bot);

  // Wait extra time for dynamic content
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Take full page screenshot
  const screenshotPath = path.join(screenshotsDir, "11-01-ddt-page-full.png");
  await bot.page.screenshot({ path: screenshotPath, fullPage: true });
  logger.info(`Screenshot saved: ${screenshotPath}`);

  // Extract table structure and analyze columns
  const ddtAnalysis = await bot.page.evaluate(() => {
    const results: any = {
      tableFound: false,
      headerColumns: [],
      sampleRows: [],
      trackingLinks: [],
      paginationElements: [],
    };

    // Find main DevExpress table (same pattern as order-history-service.ts)
    const mainTable = document.querySelector(
      'table[id$="_DXMainTable"].dxgvTable_XafTheme',
    ) as HTMLTableElement;

    if (!mainTable) {
      return results;
    }

    results.tableFound = true;

    // Extract header columns
    const headers = Array.from(mainTable.querySelectorAll("th, thead td"));
    results.headerColumns = headers.map((h, index) => ({
      index,
      text: h.textContent?.trim() || "",
      classes: Array.from(h.classList),
    }));

    // Extract first 3 data rows as samples
    const dataRows = Array.from(mainTable.querySelectorAll("tbody tr")).slice(
      0,
      3,
    );
    results.sampleRows = dataRows.map((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll("td"));
      return {
        rowIndex,
        cells: cells.map((cell, cellIndex) => ({
          cellIndex,
          text: cell.textContent?.trim() || "",
          hasLink: cell.querySelector("a") !== null,
          linkHref: cell.querySelector("a")?.getAttribute("href") || null,
          linkText: cell.querySelector("a")?.textContent?.trim() || null,
        })),
      };
    });

    // Extract all tracking links (look for courier patterns: fedex, ups, etc.)
    const allLinks = Array.from(mainTable.querySelectorAll("a"));
    results.trackingLinks = allLinks
      .filter((link) => {
        const text = link.textContent?.toLowerCase() || "";
        return (
          text.includes("fedex") ||
          text.includes("ups") ||
          text.includes("tracking") ||
          text.includes("tracciab") ||
          /\d{10,}/.test(text) // Tracking number pattern
        );
      })
      .map((link) => ({
        text: link.textContent?.trim(),
        href: link.getAttribute("href"),
        title: link.getAttribute("title"),
      }));

    // Check for pagination elements
    const paginationSelectors = [
      'img[alt="Next"]',
      'img[title="Next"]',
      'a[title="Next"]',
      ".dxp-button",
      ".dxp-num",
      'div[id*="DXDataPager"]',
    ];

    for (const selector of paginationSelectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      if (elements.length > 0) {
        results.paginationElements.push({
          selector,
          count: elements.length,
          sampleText: elements[0]?.textContent?.trim() || "",
        });
      }
    }

    return results;
  });

  // Log findings
  logger.info("\n=== DDT PAGE ANALYSIS ===");
  logger.info(`Table found: ${ddtAnalysis.tableFound}`);
  logger.info(`\nHeader columns (${ddtAnalysis.headerColumns.length}):`);
  ddtAnalysis.headerColumns.forEach((col: any) => {
    logger.info(`  [${col.index}] ${col.text}`);
  });

  logger.info(`\nSample rows (${ddtAnalysis.sampleRows.length}):`);
  ddtAnalysis.sampleRows.forEach((row: any, idx: number) => {
    logger.info(`\n  Row ${idx + 1}:`);
    row.cells.forEach((cell: any) => {
      if (cell.text) {
        logger.info(
          `    [${cell.cellIndex}] ${cell.text}${cell.hasLink ? " (LINK)" : ""}`,
        );
        if (cell.hasLink && cell.linkHref) {
          logger.info(`        → ${cell.linkHref}`);
        }
      }
    });
  });

  logger.info(`\nTracking links found: ${ddtAnalysis.trackingLinks.length}`);
  ddtAnalysis.trackingLinks.forEach((link: any, idx: number) => {
    logger.info(`  ${idx + 1}. "${link.text}" → ${link.href}`);
  });

  logger.info(`\nPagination elements:`);
  ddtAnalysis.paginationElements.forEach((elem: any) => {
    logger.info(`  ${elem.selector}: ${elem.count} elements`);
  });

  logger.info("\n=== END DDT PAGE ANALYSIS ===\n");

  // Save analysis to JSON file
  const analysisPath = path.join(screenshotsDir, "11-01-ddt-analysis.json");
  fs.writeFileSync(analysisPath, JSON.stringify(ddtAnalysis, null, 2));
  logger.info(`Analysis saved to: ${analysisPath}`);
}

/**
 * Analyze Invoice page structure (Task 2)
 */
async function analyzeInvoicePage(
  bot: ArchibaldBot,
  screenshotsDir: string,
): Promise<void> {
  logger.info("\n=== TASK 2: Analyzing Invoice Page Structure ===");

  if (!bot.page) {
    throw new Error("Browser page is null");
  }

  // Navigate to Invoice page
  const invoiceUrl = `${config.archibald.url}/CUSTINVOICEJOUR_ListView/`;
  logger.info(`Navigating to Invoice page: ${invoiceUrl}`);

  await bot.page.goto(invoiceUrl, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  logger.info("Invoice page loaded, waiting for table...");
  await waitForDevExpressTable(bot);

  // Wait extra time for dynamic content
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Take full page screenshot
  const screenshotPath = path.join(
    screenshotsDir,
    "11-01-invoice-page-full.png",
  );
  await bot.page.screenshot({ path: screenshotPath, fullPage: true });
  logger.info(`Screenshot saved: ${screenshotPath}`);

  // Extract table structure and analyze columns
  const invoiceAnalysis = await bot.page.evaluate(() => {
    const results: any = {
      tableFound: false,
      headerColumns: [],
      sampleRows: [],
      pdfDownloadButtons: [],
      paginationElements: [],
    };

    // Find main DevExpress table (same pattern as order-history-service.ts)
    const mainTable = document.querySelector(
      'table[id$="_DXMainTable"].dxgvTable_XafTheme',
    ) as HTMLTableElement;

    if (!mainTable) {
      return results;
    }

    results.tableFound = true;

    // Extract header columns
    const headers = Array.from(mainTable.querySelectorAll("th, thead td"));
    results.headerColumns = headers.map((h, index) => ({
      index,
      text: h.textContent?.trim() || "",
      classes: Array.from(h.classList),
    }));

    // Extract first 3 data rows as samples
    const dataRows = Array.from(mainTable.querySelectorAll("tbody tr")).slice(
      0,
      3,
    );
    results.sampleRows = dataRows.map((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll("td"));
      return {
        rowIndex,
        cells: cells.map((cell, cellIndex) => ({
          cellIndex,
          text: cell.textContent?.trim() || "",
          hasLink: cell.querySelector("a") !== null,
          linkHref: cell.querySelector("a")?.getAttribute("href") || null,
          linkText: cell.querySelector("a")?.textContent?.trim() || null,
          hasButton:
            cell.querySelector("button") !== null ||
            cell.querySelector('img[alt*="Download"]') !== null,
          buttonInfo: (() => {
            const button = cell.querySelector("button");
            const img = cell.querySelector("img");
            if (button) {
              return {
                type: "button",
                text: button.textContent?.trim(),
                onclick: button.getAttribute("onclick"),
              };
            } else if (img) {
              return {
                type: "image",
                alt: img.getAttribute("alt"),
                src: img.getAttribute("src"),
                onclick:
                  img.getAttribute("onclick") ||
                  img.parentElement?.getAttribute("onclick"),
              };
            }
            return null;
          })(),
        })),
      };
    });

    // Extract all PDF download links/buttons
    const allLinks = Array.from(mainTable.querySelectorAll("a, button, img"));
    results.pdfDownloadButtons = allLinks
      .filter((elem) => {
        const text = elem.textContent?.toLowerCase() || "";
        const alt = elem.getAttribute("alt")?.toLowerCase() || "";
        const title = elem.getAttribute("title")?.toLowerCase() || "";
        const href = elem.getAttribute("href")?.toLowerCase() || "";

        return (
          text.includes("pdf") ||
          text.includes("download") ||
          text.includes("scarica") ||
          alt.includes("pdf") ||
          alt.includes("download") ||
          title.includes("pdf") ||
          href.includes("pdf")
        );
      })
      .map((elem) => ({
        tagName: elem.tagName,
        text: elem.textContent?.trim(),
        href: elem.getAttribute("href"),
        alt: elem.getAttribute("alt"),
        title: elem.getAttribute("title"),
        onclick: elem.getAttribute("onclick"),
      }));

    // Check for pagination elements
    const paginationSelectors = [
      'img[alt="Next"]',
      'img[title="Next"]',
      'a[title="Next"]',
      ".dxp-button",
      ".dxp-num",
      'div[id*="DXDataPager"]',
    ];

    for (const selector of paginationSelectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      if (elements.length > 0) {
        results.paginationElements.push({
          selector,
          count: elements.length,
          sampleText: elements[0]?.textContent?.trim() || "",
        });
      }
    }

    return results;
  });

  // Log findings
  logger.info("\n=== INVOICE PAGE ANALYSIS ===");
  logger.info(`Table found: ${invoiceAnalysis.tableFound}`);
  logger.info(`\nHeader columns (${invoiceAnalysis.headerColumns.length}):`);
  invoiceAnalysis.headerColumns.forEach((col: any) => {
    logger.info(`  [${col.index}] ${col.text}`);
  });

  logger.info(`\nSample rows (${invoiceAnalysis.sampleRows.length}):`);
  invoiceAnalysis.sampleRows.forEach((row: any, idx: number) => {
    logger.info(`\n  Row ${idx + 1}:`);
    row.cells.forEach((cell: any) => {
      if (cell.text || cell.hasLink || cell.hasButton) {
        logger.info(
          `    [${cell.cellIndex}] ${cell.text}${cell.hasLink ? " (LINK)" : ""}${cell.hasButton ? " (BUTTON)" : ""}`,
        );
        if (cell.hasLink && cell.linkHref) {
          logger.info(`        → LINK: ${cell.linkHref}`);
        }
        if (cell.hasButton && cell.buttonInfo) {
          logger.info(`        → BUTTON: ${JSON.stringify(cell.buttonInfo)}`);
        }
      }
    });
  });

  logger.info(
    `\nPDF download buttons found: ${invoiceAnalysis.pdfDownloadButtons.length}`,
  );
  invoiceAnalysis.pdfDownloadButtons.forEach((btn: any, idx: number) => {
    logger.info(
      `  ${idx + 1}. <${btn.tagName}> "${btn.text || btn.alt}" → ${btn.href || btn.onclick}`,
    );
  });

  logger.info(`\nPagination elements:`);
  invoiceAnalysis.paginationElements.forEach((elem: any) => {
    logger.info(`  ${elem.selector}: ${elem.count} elements`);
  });

  logger.info("\n=== END INVOICE PAGE ANALYSIS ===\n");

  // Save analysis to JSON file
  const analysisPath = path.join(screenshotsDir, "11-01-invoice-analysis.json");
  fs.writeFileSync(analysisPath, JSON.stringify(invoiceAnalysis, null, 2));
  logger.info(`Analysis saved to: ${analysisPath}`);
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const screenshotsDir = ensureScreenshotsDir();
  logger.info(`Screenshots will be saved to: ${screenshotsDir}`);

  let bot: ArchibaldBot | null = null;

  try {
    // Initialize bot
    logger.info("Initializing ArchibaldBot...");
    bot = new ArchibaldBot();
    await bot.initialize();
    await bot.login();

    logger.info("ArchibaldBot initialized and logged in successfully\n");

    // Execute Task 1: Analyze DDT page
    await analyzeDDTPage(bot, screenshotsDir);

    // Execute Task 2: Analyze Invoice page
    await analyzeInvoicePage(bot, screenshotsDir);

    logger.info("\n✅ Research completed successfully!");
    logger.info(`\nFiles created:`);
    logger.info(`  - ${screenshotsDir}/11-01-ddt-page-full.png`);
    logger.info(`  - ${screenshotsDir}/11-01-ddt-analysis.json`);
    logger.info(`  - ${screenshotsDir}/11-01-invoice-page-full.png`);
    logger.info(`  - ${screenshotsDir}/11-01-invoice-analysis.json`);
  } catch (error) {
    logger.error("Error during research:", error);
    throw error;
  } finally {
    if (bot) {
      await bot.close();
    }
  }
}

// Run main function
main()
  .then(() => {
    logger.info("\nScript completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    logger.error("Script failed:", error);
    process.exit(1);
  });
