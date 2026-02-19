/**
 * Test script to analyze PRICEDISCTABLE_ListView structure
 *
 * Based on best practices from test-all-columns.ts
 * This will:
 * 1. Count header columns
 * 2. Count data row columns
 * 3. Extract column headers to understand mapping
 * 4. Identify key columns for price data
 */

import { ArchibaldBot } from "./bot/archibald-bot";
import { logger } from "./logger";
import { config } from "./config";

async function testPriceTableStructure() {
  logger.info("🧪 Testing PRICEDISCTABLE structure...");

  const bot = new ArchibaldBot(); // Legacy mode

  try {
    await bot.initialize();
    await bot.login();

    if (!bot.page) {
      throw new Error("Bot page is null");
    }

    const page = bot.page;

    // Navigate to price list
    const priceUrl = `${config.archibald.url}/PRICEDISCTABLE_ListView/`;
    logger.info(`📍 Navigating to: ${priceUrl}`);
    await page.goto(priceUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for table
    await page.waitForSelector('table[id*="_DXMainTable"]', { timeout: 30000 });
    await page.waitForSelector('tbody tr[id*="_DXDataRow"]', {
      timeout: 30000,
    });
    logger.info("✅ Table loaded");

    // Wait for full render
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Extract ALL column information
    const columnInfo = await page.evaluate(() => {
      const table = document.querySelector('table[id*="_DXMainTable"]');
      if (!table) return null;

      // Get header row
      const headerRow = table.querySelector('tbody tr[id*="_DXHeadersRow"]');
      const headerCells = headerRow
        ? Array.from(headerRow.querySelectorAll("td"))
        : [];

      // Get first 3 data rows
      const dataRows = Array.from(
        table.querySelectorAll('tbody tr[id*="_DXDataRow"]'),
      ).slice(0, 3);

      // Extract header texts
      const headers = headerCells.map((cell, idx) => {
        const id = cell.id || "";
        const text = cell.textContent?.trim().split("\n")[0] || "";
        return {
          index: idx,
          id,
          text,
          colNumber: id.match(/_col(\d+)/)?.[1] || null,
        };
      });

      // Extract data from multiple rows
      const allRowData: Array<
        Array<{
          index: number;
          text: string;
          hasImage: boolean;
          hasCheckbox: boolean;
        }>
      > = [];

      dataRows.forEach((row) => {
        const dataCells = Array.from(row.querySelectorAll("td"));
        const rowData = dataCells.map((cell, idx) => {
          const text = cell.textContent?.trim().substring(0, 100) || "";
          const hasImage = !!cell.querySelector("img");
          const hasCheckbox = !!cell.querySelector('input[type="checkbox"]');

          return {
            index: idx,
            text,
            hasImage,
            hasCheckbox,
          };
        });
        allRowData.push(rowData);
      });

      return {
        headerCount: headerCells.length,
        dataRowCellCount: allRowData.length > 0 ? allRowData[0].length : 0,
        headers,
        allRowData,
      };
    });

    if (!columnInfo) {
      logger.error("❌ Could not extract column info");
      return;
    }

    logger.info(`\n📊 Column Analysis:`);
    logger.info(`   Header columns: ${columnInfo.headerCount}`);
    logger.info(`   Data row cells: ${columnInfo.dataRowCellCount}`);
    logger.info(`   Sample rows extracted: ${columnInfo.allRowData.length}`);

    // Map headers to find key columns
    const headerMap: { [key: string]: number } = {};
    columnInfo.headers.forEach((header, idx) => {
      if (header.text) {
        headerMap[header.text.toUpperCase()] = idx;
      }
    });

    logger.info(`\n🔑 Key Column Mapping:`);
    const keyColumns = [
      "ACCOUNT:",
      "DESCRIZIONE ACCOUNT:",
      "ITEM SELECTION:",
      "ITEM DESCRIPTION:",
      "DA DATA",
      "DATA",
      "QUANTITÀIMPORTODA",
      "QUANTITÀIMPORTO",
      "UNITÀ DI PREZZO",
      "IMPORTO UNITARIO:",
      "VALUTA",
      "PREZZO NETTO BRASSELER",
      "CODICE ARTICOLO",
      "DATAAREAID",
    ];

    keyColumns.forEach((key) => {
      const idx = headerMap[key];
      if (idx !== undefined) {
        logger.info(`   [${idx}] ${key}`);
      } else {
        logger.warn(`   ❌ NOT FOUND: ${key}`);
      }
    });

    logger.info(`\n📋 Full Header List (all columns):`);
    columnInfo.headers.forEach((header) => {
      if (header.text && header.text.length > 0) {
        logger.info(
          `   [${header.index}] col${header.colNumber}: "${header.text}"`,
        );
      }
    });

    logger.info(`\n📊 Sample Data (first 3 rows):`);
    columnInfo.allRowData.forEach((rowData, rowIdx) => {
      logger.info(`\n   === ROW ${rowIdx + 1} ===`);

      // Show only key columns with data
      keyColumns.forEach((key) => {
        const idx = headerMap[key];
        if (idx !== undefined && rowData[idx]) {
          const cellData = rowData[idx];
          if (cellData.text && cellData.text.length > 0) {
            logger.info(`   [${idx}] ${key}: "${cellData.text}"`);
          }
        }
      });
    });

    // Check if header count matches data cell count
    if (columnInfo.headerCount !== columnInfo.dataRowCellCount) {
      logger.warn(
        `\n⚠️  MISMATCH: Headers (${columnInfo.headerCount}) != Data cells (${columnInfo.dataRowCellCount})`,
      );
    } else {
      logger.info(
        `\n✅ Column count matches: ${columnInfo.headerCount} columns`,
      );
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
  testPriceTableStructure()
    .then(() => {
      logger.info("\n✅ All tests passed!");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}

export { testPriceTableStructure };
