/**
 * Test to extract ACTUAL DATA from PRICEDISCTABLE rows
 *
 * This will show us the real cell indices for extracting price data
 */

import { ArchibaldBot } from "./archibald-bot";
import { logger } from "./logger";
import { config } from "./config";

async function testPriceDataCells() {
  logger.info("🧪 Testing PRICEDISCTABLE data cell extraction...");

  const bot = new ArchibaldBot(); // Legacy mode

  try {
    await bot.initialize();
    await bot.login();

    if (!bot.page) {
      throw new Error("Bot page is null");
    }

    // Navigate to price list
    logger.info("📍 Navigating to PRICEDISCTABLE...");
    await bot.page.goto(`${config.archibald.url}/PRICEDISCTABLE_ListView/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await bot.page.waitForSelector('table[id*="_DXMainTable"]', { timeout: 30000 });
    await bot.page.waitForSelector('tbody tr[id*="_DXDataRow"]', { timeout: 30000 });
    logger.info("✅ Table loaded");

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Extract data using the SAME logic as product-sync
    const dataExtraction = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id*="_DXMainTable"]');
      if (!table) return null;

      // Get first 5 data rows
      const dataRows = Array.from(
        table.querySelectorAll('tbody tr[id*="_DXDataRow"]')
      ).slice(0, 5);

      const extractedRows: Array<{ [key: number]: string }> = [];

      dataRows.forEach((row, rowIdx) => {
        const cells = Array.from(row.querySelectorAll("td")) as Element[];

        const rowData: { [key: number]: string } = {};
        cells.forEach((cell, cellIdx) => {
          const text = (cell as Element)?.textContent?.trim() || "";
          if (text && text.length > 0 && !text.includes("Column Chooser")) {
            rowData[cellIdx] = text.substring(0, 200); // Limit to 200 chars
          }
        });

        extractedRows.push(rowData);
      });

      return {
        totalRows: dataRows.length,
        cellCountFirstRow: extractedRows[0] ? Object.keys(extractedRows[0]).length : 0,
        extractedRows,
      };
    });

    if (!dataExtraction) {
      logger.error("❌ Could not extract data");
      return;
    }

    logger.info(`\n📊 Data Extraction Results:`);
    logger.info(`   Total rows: ${dataExtraction.totalRows}`);
    logger.info(`   Cells in first row: ${dataExtraction.cellCountFirstRow}`);

    logger.info(`\n📋 Cell Contents (first 5 rows):`);
    dataExtraction.extractedRows.forEach((row, rowIdx) => {
      logger.info(`\n   === ROW ${rowIdx + 1} ===`);
      Object.entries(row).forEach(([cellIdx, text]) => {
        logger.info(`   [${cellIdx}] "${text}"`);
      });
    });

    // Analyze column patterns
    logger.info(`\n🔍 Column Pattern Analysis:`);

    // Check which cells have consistent data across rows
    const cellIdx = 0;
    const maxCells = dataExtraction.cellCountFirstRow;

    for (let i = 0; i < maxCells; i++) {
      const valuesInColumn: string[] = [];
      dataExtraction.extractedRows.forEach((row) => {
        if (row[i]) {
          valuesInColumn.push(row[i]);
        }
      });

      if (valuesInColumn.length > 0) {
        const samples = valuesInColumn.slice(0, 3).join(" | ");
        logger.info(`   [${i}] ${valuesInColumn.length}/${dataExtraction.totalRows} filled: ${samples}`);
      }
    }

    logger.info("\n✅ Test completed!");
  } catch (error) {
    logger.error("❌ Test failed:", error);
    throw error;
  } finally {
    await bot.close();
  }
}

if (require.main === module) {
  testPriceDataCells()
    .then(() => {
      logger.info("\n✅ All tests passed!");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}

export { testPriceDataCells };
