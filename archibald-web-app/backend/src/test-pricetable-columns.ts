/**
 * Test script to analyze ALL columns in PRICEDISCTABLE_ListView
 *
 * This will help us understand:
 * - How many columns exist in the table
 * - What data each column contains
 * - Which columns should be extracted and stored
 *
 * Based on best practices from test-all-columns.ts for product sync
 */

import { ArchibaldBot } from "./bot/archibald-bot";
import { logger } from "./logger";
import { config } from "./config";

async function testPriceTableColumns() {
  logger.info("🔍 Analyzing PRICEDISCTABLE_ListView column structure...");

  const bot = new ArchibaldBot(); // Legacy mode

  try {
    await bot.initialize();
    await bot.login();

    if (!bot.page) {
      throw new Error("Browser page is null");
    }

    // Navigate to price list table
    logger.info("📊 Navigating to PRICEDISCTABLE_ListView...");
    await bot.page.goto(`${config.archibald.url}/PRICEDISCTABLE_ListView/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await bot.page.waitForSelector("table", { timeout: 10000 });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Extract ALL columns from the table
    const tableAnalysis = await bot.page.evaluate(() => {
      // Find the main data table
      let dataTable =
        document.querySelector(".dxgvControl") ||
        document.querySelector('table[id*="GridView"]');

      if (!dataTable) {
        const allTables = Array.from(document.querySelectorAll("table"));
        let maxRows = 0;
        for (const table of allTables) {
          const rowCount = table.querySelectorAll("tbody tr").length;
          if (rowCount > maxRows) {
            maxRows = rowCount;
            dataTable = table;
          }
        }
      }

      if (!dataTable) {
        return { error: "No data table found" };
      }

      // Find header row (usually first row or a row with <th> elements)
      const headerRow =
        dataTable.querySelector("thead tr") || dataTable.querySelector("tr");

      const headers: string[] = [];
      if (headerRow) {
        const headerCells = Array.from(headerRow.querySelectorAll("th, td"));
        headerCells.forEach((cell) => {
          headers.push((cell as Element)?.textContent?.trim() || "");
        });
      }

      // Get first 5 data rows
      const rows = Array.from(dataTable.querySelectorAll("tbody tr")).slice(
        0,
        5,
      );
      const sampleRows: Array<{ [key: string]: string }> = [];

      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("td"));

        // Skip if too few cells (likely not a data row)
        if (cells.length < 5) continue;

        const rowData: { [key: string]: string } = {};
        cells.forEach((cell, idx) => {
          const cellText = (cell as Element)?.textContent?.trim() || "";
          rowData[`col_${idx}`] = cellText.substring(0, 100); // Limit to 100 chars
        });

        sampleRows.push(rowData);
      }

      return {
        tableFound: true,
        headerCount: headers.length,
        headers: headers,
        sampleRowCount: sampleRows.length,
        sampleRows: sampleRows,
        totalCellsInFirstRow:
          sampleRows.length > 0 ? Object.keys(sampleRows[0]).length : 0,
      };
    });

    if (tableAnalysis.error) {
      logger.error(`❌ ${tableAnalysis.error}`);
      return;
    }

    logger.info("\n📋 PRICEDISCTABLE Structure Analysis:");
    logger.info(`   Headers found: ${tableAnalysis.headerCount}`);
    logger.info(`   Sample rows: ${tableAnalysis.sampleRowCount}`);
    logger.info(`   Cells per row: ${tableAnalysis.totalCellsInFirstRow}`);

    if (tableAnalysis.headers && tableAnalysis.headers.length > 0) {
      logger.info("\n📑 Column Headers:");
      tableAnalysis.headers.forEach((header, idx) => {
        logger.info(`   [${idx}] "${header}"`);
      });
    }

    logger.info("\n📊 Sample Data (first 5 rows):");
    if (tableAnalysis.sampleRows) {
      tableAnalysis.sampleRows.forEach((row, rowIdx) => {
        logger.info(`\n   ROW ${rowIdx + 1}:`);
        Object.entries(row).forEach(([colKey, value]) => {
          if (value && value !== "") {
            const colIdx = colKey.replace("col_", "");
            const headerName = tableAnalysis.headers
              ? tableAnalysis.headers[parseInt(colIdx)]
              : undefined;
            logger.info(
              `      [${colIdx}] ${headerName || "Unknown"}: "${value}"`,
            );
          }
        });
      });
    }

    // Analyze which columns contain useful data
    logger.info("\n🔍 Column Analysis:");

    const columnStats: {
      [key: number]: { empty: number; filled: number; samples: string[] };
    } = {};

    if (tableAnalysis.sampleRows) {
      tableAnalysis.sampleRows.forEach((row) => {
        Object.entries(row).forEach(([colKey, value]) => {
          const colIdx = parseInt(colKey.replace("col_", ""));
          if (!columnStats[colIdx]) {
            columnStats[colIdx] = { empty: 0, filled: 0, samples: [] };
          }
          if (value && value !== "") {
            columnStats[colIdx].filled++;
            if (columnStats[colIdx].samples.length < 3) {
              columnStats[colIdx].samples.push(value);
            }
          } else {
            columnStats[colIdx].empty++;
          }
        });
      });
    }

    Object.entries(columnStats)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([colIdx, stats]) => {
        const headerName = tableAnalysis.headers
          ? tableAnalysis.headers[parseInt(colIdx)]
          : undefined;
        const fillRate = (
          (stats.filled / (stats.filled + stats.empty)) *
          100
        ).toFixed(0);
        logger.info(`   [${colIdx}] ${headerName || "Unknown"}`);
        logger.info(
          `      Fill rate: ${fillRate}% (${stats.filled}/${stats.filled + stats.empty})`,
        );
        if (stats.samples.length > 0) {
          logger.info(
            `      Samples: ${stats.samples.slice(0, 3).join(" | ")}`,
          );
        }
      });

    logger.info("\n✅ Analysis complete!");
  } catch (error) {
    logger.error("❌ Test failed:", error);
    throw error;
  } finally {
    await bot.close();
  }
}

if (require.main === module) {
  testPriceTableColumns()
    .then(() => {
      logger.info("\n✅ Test completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}

export { testPriceTableColumns };
