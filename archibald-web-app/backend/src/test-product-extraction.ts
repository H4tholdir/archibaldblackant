/**
 * Test script to analyze HTML structure of product table
 *
 * Purpose:
 * - Extract all 37 columns from product table
 * - Understand image structure (img src, data attributes, etc.)
 * - Validate cell mapping to database fields
 * - Test data extraction patterns
 *
 * Usage:
 *   npx ts-node src/test-product-extraction.ts
 */

import { ArchibaldBot } from "./bot/archibald-bot";
import { logger } from "./logger";
import fs from "fs";
import path from "path";

interface TestProductRow {
  // Critical fields
  id?: string; // Cell[2]
  name?: string; // Cell[3]
  description?: string; // Cell[4]
  groupCode?: string; // Cell[5]
  imageHtml?: string; // Cell[6] - Raw HTML
  imageSrc?: string; // Extracted src attribute
  imageDataUri?: string; // Data URI if embedded
  packageContent?: string; // Cell[7]
  searchName?: string; // Cell[8]
  priceUnit?: string; // Cell[9]
  productGroupId?: string; // Cell[10]
  productGroupDescription?: string; // Cell[11]
  minQty?: string; // Cell[12]
  multipleQty?: string; // Cell[13]
  maxQty?: string; // Cell[14]

  // Additional fields (15-37)
  cell15?: string; // FIGURA
  cell16?: string; // ID IN BLOCCO DELL'ARTICOLO
  cell17?: string; // PACCO
  cell18?: string; // GAMBA
  cell19?: string; // GRANDEZZA
  cell20?: string; // ID DI CONFIGURAZIONE
  cell21?: string; // CREATO DA
  cell22?: string; // DATA CREATA
  cell23?: string; // DATA/ORA MODIFICA
  cell24?: string; // QTÀ PREDEFINITA
  cell25?: string; // VISUALIZZA
  cell26?: string; // VISUALIZZA IL NUMERO DI PRODOTTO
  cell27?: string; // SCONTO ASSOLUTO TOTALE
  cell28?: string; // ID
  cell29?: string; // SCONTO LINEA
  cell30?: string; // MODIFICATO DA
  cell31?: string; // DATETIME MODIFICATO
  cell32?: string; // ARTICOLO ORDINABILE (✓/✗)
  cell33?: string; // PURSH PRICE PCS
  cell34?: string; // ID DI CONFIGURAZIONE STANDARD
  cell35?: string; // QTÀ STANDARD
  cell36?: string; // FERMATO
  cell37?: string; // ID UNITÀ
}

async function testProductExtraction() {
  logger.info("🧪 Starting product extraction test...");

  const bot = new ArchibaldBot();

  try {
    // Initialize bot (no userId - system level)
    await bot.initialize();
    logger.info("✅ Bot initialized");

    if (!bot.page) {
      throw new Error("Bot page is null after initialization");
    }

    const page = bot.page;

    // Login first
    logger.info("🔐 Logging in...");
    await bot.login();
    logger.info("✅ Login successful");

    // Navigate to products page
    const productsUrl = `${process.env.ARCHIBALD_URL}/INVENTTABLE_ListView/`;
    logger.info(`📍 Navigating to: ${productsUrl}`);

    await page.goto(productsUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    logger.info("✅ Page loaded");

    // Wait for product table to load (DevExpress GridView)
    const tableSelector = 'table[id*="_DXMainTable"]';
    await page.waitForSelector(tableSelector, { timeout: 30000 });
    logger.info("✅ Product table loaded");

    // Wait for data rows to appear
    await page.waitForSelector(`${tableSelector} tbody tr[id*="_DXDataRow"]`, {
      timeout: 30000,
    });
    logger.info("✅ Data rows loaded");

    // Extract first 5 rows for analysis
    logger.info("🔍 Extracting first 5 product rows...");

    const testRows = await page.evaluate(() => {
      const table = document.querySelector('table[id*="_DXMainTable"]');
      if (!table) return [];

      // Get only data rows (skip header)
      const rows = Array.from(
        table.querySelectorAll('tbody tr[id*="_DXDataRow"]'),
      );
      const extractedRows: any[] = [];

      // Process first 5 data rows
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const row = rows[i];
        const cells = Array.from(row.querySelectorAll("td"));

        if (cells.length === 0) continue;

        const rowData: any = {
          totalCells: cells.length,
          cells: [],
        };

        // Extract each cell with detailed info
        cells.forEach((cell, index) => {
          const cellData: any = {
            index,
            text: cell.textContent?.trim() || "",
            innerHTML: cell.innerHTML.substring(0, 200), // First 200 chars
            hasImage: !!cell.querySelector("img"),
            hasCheckbox: !!cell.querySelector("input[type='checkbox']"),
            hasButton:
              !!cell.querySelector("button") ||
              !!cell.querySelector("a.dx-link"),
            classes: cell.className,
          };

          // Extract image details if present
          if (cellData.hasImage) {
            const img = cell.querySelector("img");
            if (img) {
              cellData.image = {
                src: img.getAttribute("src") || "",
                alt: img.getAttribute("alt") || "",
                width: img.getAttribute("width") || "",
                height: img.getAttribute("height") || "",
                className: img.className,
                isDataUri:
                  img.getAttribute("src")?.startsWith("data:") || false,
                hasOnClick: img.hasAttribute("onclick"),
                parentHtml:
                  img.parentElement?.outerHTML.substring(0, 300) || "",
              };
            }
          }

          rowData.cells.push(cellData);
        });

        // Map known fields (first 15 columns)
        rowData.mapped = {
          id: cells[2]?.textContent?.trim(),
          name: cells[3]?.textContent?.trim(),
          description: cells[4]?.textContent?.trim(),
          groupCode: cells[5]?.textContent?.trim(),
          imageCell: cells[6]
            ? {
                text: cells[6].textContent?.trim(),
                html: cells[6].innerHTML.substring(0, 500),
                hasImg: !!cells[6].querySelector("img"),
              }
            : null,
          packageContent: cells[7]?.textContent?.trim(),
          searchName: cells[8]?.textContent?.trim(),
          priceUnit: cells[9]?.textContent?.trim(),
          productGroupId: cells[10]?.textContent?.trim(),
          productGroupDescription: cells[11]?.textContent?.trim(),
          minQty: cells[12]?.textContent?.trim(),
          multipleQty: cells[13]?.textContent?.trim(),
          maxQty: cells[14]?.textContent?.trim(),
        };

        extractedRows.push(rowData);
      }

      return extractedRows;
    });

    // Log results
    logger.info(`✅ Extracted ${testRows.length} rows`);

    testRows.forEach((row, idx) => {
      logger.info(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      logger.info(`📦 ROW ${idx + 1} - Total cells: ${row.totalCells}`);
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // Log mapped fields
      logger.info("\n🏷️  Mapped Fields:");
      logger.info(`  ID: ${row.mapped.id}`);
      logger.info(`  Name: ${row.mapped.name}`);
      logger.info(`  Description: ${row.mapped.description}`);
      logger.info(`  Group: ${row.mapped.groupCode}`);
      logger.info(`  Package Content: ${row.mapped.packageContent}`);
      logger.info(
        `  Min/Multiple/Max: ${row.mapped.minQty}/${row.mapped.multipleQty}/${row.mapped.maxQty}`,
      );

      // Log image details
      if (row.mapped.imageCell?.hasImg) {
        logger.info("\n🖼️  Image Cell Details:");
        logger.info(`  HTML: ${row.mapped.imageCell.html}`);

        // Find image in cells
        const imgCell = row.cells.find((c: any) => c.index === 6);
        if (imgCell?.image) {
          logger.info(`  Image SRC: ${imgCell.image.src.substring(0, 100)}...`);
          logger.info(`  Is Data URI: ${imgCell.image.isDataUri}`);
          logger.info(`  Has onClick: ${imgCell.image.hasOnClick}`);
          logger.info(`  Alt: ${imgCell.image.alt}`);
          logger.info(
            `  Dimensions: ${imgCell.image.width}x${imgCell.image.height}`,
          );
        }
      } else {
        logger.info("\n🖼️  No image found in cell[6]");
      }

      // Log all cells summary
      logger.info("\n📊 All Cells Summary:");
      row.cells.forEach((cell: any) => {
        const preview = cell.text.substring(0, 50);
        const type = cell.hasCheckbox
          ? "☑️"
          : cell.hasButton
            ? "🔘"
            : cell.hasImage
              ? "🖼️"
              : "📝";
        logger.info(
          `  [${cell.index}] ${type} ${preview}${cell.text.length > 50 ? "..." : ""}`,
        );
      });
    });

    // Save detailed output to file
    const outputPath = path.join(
      __dirname,
      "../data/test-product-extraction.json",
    );
    fs.writeFileSync(outputPath, JSON.stringify(testRows, null, 2));
    logger.info(`\n💾 Detailed output saved to: ${outputPath}`);

    // Test scrolling to see if more columns are visible
    logger.info("\n🔄 Testing horizontal scroll to reveal hidden columns...");

    const hasHorizontalScroll = await page.evaluate(() => {
      const table = document.querySelector("table");
      const container = document.querySelector(".dx-scrollable-container");

      if (!table || !container) {
        return { hasScroll: false, tableWidth: 0, containerWidth: 0 };
      }

      const tableWidth = table.scrollWidth;
      const containerWidth = container.clientWidth;

      return {
        hasScroll: tableWidth > containerWidth,
        tableWidth,
        containerWidth,
        scrollNeeded: tableWidth - containerWidth,
      };
    });

    logger.info("📏 Scroll info:", hasHorizontalScroll);

    if (hasHorizontalScroll.hasScroll) {
      logger.info(
        "⚠️  Table has horizontal scroll - may need to scroll to extract all columns",
      );

      // Try scrolling and extracting again
      logger.info("🔄 Scrolling right to reveal more columns...");

      await page.evaluate(() => {
        const container = document.querySelector(".dx-scrollable-container");
        if (container) {
          container.scrollLeft = container.scrollWidth;
        }
      });

      // Wait for scroll animation
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const scrolledCellCount = await page.evaluate(() => {
        const firstRow = document.querySelector("table tbody tr");
        if (!firstRow) return 0;
        return firstRow.querySelectorAll("td").length;
      });

      logger.info(`📊 Cell count after scroll: ${scrolledCellCount}`);
    }

    logger.info("\n✅ Test completed successfully!");
  } catch (error) {
    logger.error("❌ Test failed:", error);
    throw error;
  } finally {
    await bot.close();
    logger.info("🔒 Bot closed");
  }
}

// Run test
if (require.main === module) {
  testProductExtraction()
    .then(() => {
      logger.info("\n✅ All tests passed!");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}

export { testProductExtraction };
