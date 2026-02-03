/**
 * Quick test to verify price extraction logic
 * Extracts only first page without saving to DB
 */

import { ArchibaldBot } from "./archibald-bot";
import { logger } from "./logger";
import { config } from "./config";

async function testPriceExtractionOnly() {
  logger.info("🧪 Testing price extraction (first page only)...");

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

    await bot.page.waitForSelector('table[id*="_DXMainTable"]', {
      timeout: 30000,
    });
    await bot.page.waitForSelector('tbody tr[id*="_DXDataRow"]', {
      timeout: 30000,
    });
    logger.info("✅ Table loaded");

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Extract prices using OPTIMIZED logic (same as price-sync-service.ts)
    const pagePrices = await bot.page.evaluate(() => {
      // Use same table detection as product-sync (DevExtreme table structure)
      const table = document.querySelector('table[id*="_DXMainTable"]');

      if (!table) {
        return { prices: [], error: "Table not found" };
      }

      // Get data rows (same pattern as product-sync)
      const dataRows = Array.from(
        table.querySelectorAll('tbody tr[id*="_DXDataRow"]'),
      ) as Element[];

      const results: Array<{
        itemSelection: string;
        itemDescription: string;
        price: number;
        accountCode: string;
        accountDescription: string;
        fromDate: string;
        toDate: string;
        qtyFrom: string;
        qtyTo: string;
        currency: string;
      }> = [];

      for (const row of dataRows) {
        const cells = Array.from(row.querySelectorAll("td")) as Element[];

        // Need at least 14 cells for price data
        if (cells.length < 14) continue;

        /**
         * PRICEDISCTABLE Column Mapping (based on test-price-data-cells.ts):
         * [6] = ITEM SELECTION (ID prodotto: "10004473", "051953K0")
         * [7] = ITEM DESCRIPTION (Nome: "XTD3324.314.", "TD3233.314.")
         * [8] = DA DATA (from date: "01/07/2022")
         * [9] = DATA (to date: "31/12/2154")
         * [10] = QUANTITÀ FROM (qty from: "1")
         * [11] = QUANTITÀ TO (qty to: "100.000.000")
         * [13] = VALUTA/PREZZO ("234,59 €", "275,00 €")
         * [14] = CURRENCY ("EUR")
         * [4] = Account code (es. "002")
         * [5] = Account description (es. "DETTAGLIO (consigliato)")
         */

        const itemSelection = (cells[6] as Element)?.textContent?.trim() || "";
        const itemDescription =
          (cells[7] as Element)?.textContent?.trim() || "";
        const fromDate = (cells[8] as Element)?.textContent?.trim() || "";
        const toDate = (cells[9] as Element)?.textContent?.trim() || "";
        const qtyFrom = (cells[10] as Element)?.textContent?.trim() || "";
        const qtyTo = (cells[11] as Element)?.textContent?.trim() || "";
        const priceText = (cells[13] as Element)?.textContent?.trim() || "";
        const currency = (cells[14] as Element)?.textContent?.trim() || "";
        const accountCode = (cells[4] as Element)?.textContent?.trim() || "";
        const accountDescription =
          (cells[5] as Element)?.textContent?.trim() || "";

        // Validazione: need at least ITEM SELECTION or ITEM DESCRIPTION
        if (
          (!itemDescription && !itemSelection) ||
          itemDescription.includes("Loading") ||
          itemDescription.includes("<") ||
          itemSelection.includes("Loading")
        ) {
          continue;
        }

        // Parse prezzo (format: "234,59 €")
        let price = 0;
        if (priceText) {
          const priceStr = priceText.replace(/[€\s]/g, "").replace(",", ".");
          const parsedPrice = parseFloat(priceStr);
          if (!isNaN(parsedPrice) && parsedPrice >= 0) {
            price = parsedPrice;
          }
        }

        results.push({
          itemSelection, // ID ARTICOLO per matching primario
          itemDescription, // NOME ARTICOLO per matching secondario
          price,
          accountCode,
          accountDescription,
          fromDate,
          toDate,
          qtyFrom,
          qtyTo,
          currency,
        });
      }

      return { prices: results };
    });

    const prices = pagePrices.prices;
    logger.info(`\n📊 Extraction Results:`);
    logger.info(`   Total prices extracted: ${prices.length}`);

    if (prices.length > 0) {
      logger.info(`\n📋 First 5 price entries:`);
      prices.slice(0, 5).forEach((p, idx) => {
        logger.info(
          `\n   ${idx + 1}. ${p.itemSelection} - ${p.itemDescription}`,
        );
        logger.info(`      Price: ${p.price} ${p.currency}`);
        logger.info(
          `      Account: ${p.accountCode} - ${p.accountDescription}`,
        );
        logger.info(`      Valid from: ${p.fromDate} to ${p.toDate}`);
        logger.info(`      Qty range: ${p.qtyFrom} - ${p.qtyTo}`);
      });
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
  testPriceExtractionOnly()
    .then(() => {
      logger.info("\n✅ All tests passed!");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}

export { testPriceExtractionOnly };
