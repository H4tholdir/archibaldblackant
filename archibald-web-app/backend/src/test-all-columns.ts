/**
 * Test script to count ALL columns in product table
 *
 * This test will:
 * 1. Count header columns
 * 2. Count data row columns
 * 3. Extract column headers to understand mapping
 */

import { ArchibaldBot } from "./archibald-bot";
import { logger } from "./logger";

async function testAllColumns() {
  logger.info("🧪 Testing ALL columns extraction...");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    logger.info("✅ Bot initialized");

    if (!bot.page) {
      throw new Error("Bot page is null");
    }

    const page = bot.page;

    // Login
    logger.info("🔐 Logging in...");
    await bot.login();
    logger.info("✅ Login successful");

    // Navigate to products
    const productsUrl = `${process.env.ARCHIBALD_URL}/INVENTTABLE_ListView/`;
    logger.info(`📍 Navigating to: ${productsUrl}`);
    await page.goto(productsUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for table
    await page.waitForSelector('table[id*="_DXMainTable"]', { timeout: 30000 });
    await page.waitForSelector('tbody tr[id*="_DXDataRow"]', { timeout: 30000 });
    logger.info("✅ Table loaded");

    // Extract ALL column information
    const columnInfo = await page.evaluate(() => {
      const table = document.querySelector('table[id*="_DXMainTable"]');
      if (!table) return null;

      // Get header row
      const headerRow = table.querySelector('tbody tr[id*="_DXHeadersRow"]');
      const headerCells = headerRow ? Array.from(headerRow.querySelectorAll('td')) : [];

      // Get first data row
      const dataRow = table.querySelector('tbody tr[id*="_DXDataRow"]');
      const dataCells = dataRow ? Array.from(dataRow.querySelectorAll('td')) : [];

      // Extract header texts
      const headers = headerCells.map((cell, idx) => {
        const id = cell.id || '';
        const text = cell.textContent?.trim().split('\n')[0] || '';
        return {
          index: idx,
          id,
          text,
          colNumber: id.match(/_col(\d+)/)?.[1] || null
        };
      });

      // Extract data cell info
      const dataCellInfo = dataCells.map((cell, idx) => {
        const text = cell.textContent?.trim().substring(0, 50) || '';
        const hasImage = !!cell.querySelector('img');
        const hasCheckbox = !!cell.querySelector('input[type="checkbox"]');
        const classes = cell.className;

        return {
          index: idx,
          text,
          hasImage,
          hasCheckbox,
          classes
        };
      });

      return {
        headerCount: headerCells.length,
        dataRowCellCount: dataCells.length,
        headers,
        dataCells: dataCellInfo
      };
    });

    if (!columnInfo) {
      logger.error("❌ Could not extract column info");
      return;
    }

    logger.info(`\n📊 Column Analysis:`);
    logger.info(`   Header columns: ${columnInfo.headerCount}`);
    logger.info(`   Data row cells: ${columnInfo.dataRowCellCount}`);

    logger.info(`\n📋 Header Columns (first 20):`);
    columnInfo.headers.slice(0, 20).forEach((header, idx) => {
      logger.info(`   [${idx}] col${header.colNumber}: "${header.text}"`);
    });

    if (columnInfo.headers.length > 20) {
      logger.info(`   ... and ${columnInfo.headers.length - 20} more columns`);
    }

    logger.info(`\n📋 Data Row Cells (first 20):`);
    columnInfo.dataCells.slice(0, 20).forEach((cell, idx) => {
      const type = cell.hasCheckbox ? '☑️' : cell.hasImage ? '🖼️' : '📝';
      const preview = cell.text.length > 30 ? cell.text.substring(0, 30) + '...' : cell.text;
      logger.info(`   [${idx}] ${type} "${preview}"`);
    });

    if (columnInfo.dataCells.length > 20) {
      logger.info(`   ... and ${columnInfo.dataCells.length - 20} more cells`);
    }

    // Check if header count matches data cell count
    if (columnInfo.headerCount !== columnInfo.dataRowCellCount) {
      logger.warn(`\n⚠️  MISMATCH: Headers (${columnInfo.headerCount}) != Data cells (${columnInfo.dataRowCellCount})`);
    } else {
      logger.info(`\n✅ Column count matches: ${columnInfo.headerCount} columns`);
    }

    logger.info("\n✅ Test completed!");

  } catch (error) {
    logger.error("❌ Test failed:", error);
    throw error;
  } finally {
    await bot.close();
    logger.info("🔒 Bot closed");
  }
}

if (require.main === module) {
  testAllColumns()
    .then(() => {
      logger.info("\n✅ All tests passed!");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}

export { testAllColumns };
