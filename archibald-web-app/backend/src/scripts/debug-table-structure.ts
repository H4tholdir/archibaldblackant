#!/usr/bin/env tsx
/**
 * Debug script: Inspect actual table structure
 */

import { ArchibaldBot } from "../archibald-bot";
import { logger } from "../logger";

async function main() {
  console.log("🔍 Inspecting table structure\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    // Navigate to Order List
    console.log("Navigating to Order List...");
    await bot.page.goto(
      "https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/",
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const structure = await bot.page.evaluate(() => {
      // Find all tables
      const allTables = Array.from(document.querySelectorAll("table"));
      const mainTables = Array.from(
        document.querySelectorAll('table[id$="_DXMainTable"]'),
      );
      const themedTables = Array.from(
        document.querySelectorAll(
          'table[id$="_DXMainTable"].dxgvTable_XafTheme',
        ),
      );

      console.log(`Total tables: ${allTables.length}`);
      console.log(`Tables with _DXMainTable: ${mainTables.length}`);
      console.log(
        `Tables with both _DXMainTable and dxgvTable_XafTheme: ${themedTables.length}`,
      );

      const table = document.querySelector(
        'table[id$="_DXMainTable"].dxgvTable_XafTheme',
      );
      if (!table) {
        return {
          error: "Themed table not found",
          tablesFound: allTables.length,
          mainTables: mainTables.length,
        };
      }

      console.log(`Using table with id: ${table.id}`);

      const allRows = Array.from(table.querySelectorAll("tr"));
      const dataRows = Array.from(
        table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"),
      );

      console.log(`Total rows in table: ${allRows.length}`);
      console.log(`Data rows (dxgvDataRow): ${dataRows.length}`);

      const info: any = {
        totalRows: allRows.length,
        dataRowCount: dataRows.length,
        firstFewRows: [],
        firstDataRows: [],
      };

      // Inspect first 30 rows to find where data starts
      for (let i = 0; i < Math.min(30, allRows.length); i++) {
        const row = allRows[i];
        const cells = Array.from(row.querySelectorAll("td, th"));

        const cellTexts = cells
          .slice(0, 10)
          .map((c) => c.textContent?.trim().substring(0, 30) || "");

        info.firstFewRows.push({
          index: i,
          className: row.className,
          tagName: row.tagName,
          cellCount: cells.length,
          firstCellText: cells[0]?.textContent?.trim().substring(0, 50) || "",
          cellTypes: cells.slice(0, 5).map((c) => c.tagName),
          first10Cells: cellTexts,
          // Check if looks like data row (has "ORD/" in some cell)
          hasOrderNumber: cellTexts.some((t) => t.includes("ORD/")),
        });
      }

      // Also inspect first 3 data rows
      for (let i = 0; i < Math.min(3, dataRows.length); i++) {
        const row = dataRows[i];
        const cells = Array.from(row.querySelectorAll("td"));
        const cellTexts = cells.map(
          (c) => c.textContent?.trim().substring(0, 30) || "",
        );

        info.firstDataRows.push({
          index: i,
          className: row.className,
          cellCount: cells.length,
          allCells: cellTexts,
        });
      }

      return info;
    });

    console.log("\n📊 Table Structure:");
    console.log(JSON.stringify(structure, null, 2));
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

main();
