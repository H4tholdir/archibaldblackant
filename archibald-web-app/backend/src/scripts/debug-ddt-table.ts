#!/usr/bin/env tsx
/**
 * Debug script: Inspect DDT table structure
 */

import { ArchibaldBot } from "../bot/archibald-bot";
import { logger } from "../logger";

async function main() {
  console.log("🔍 Inspecting DDT table structure\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    // Navigate to DDT table
    console.log("Navigating to DDT table...");
    await bot.page.goto(
      "https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/",
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const structure = await bot.page.evaluate(() => {
      // Find all tables
      const allTables = Array.from(document.querySelectorAll("table"));
      const mainTables = Array.from(
        document.querySelectorAll('table[id$="_DXMainTable"]'),
      );

      console.log(`Total tables: ${allTables.length}`);
      console.log(`Tables with _DXMainTable: ${mainTables.length}`);

      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) {
        return { error: "Table not found" };
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
        firstDataRows: [],
      };

      // Inspect first 3 data rows - extract ALL cells to see the structure
      for (let i = 0; i < Math.min(3, dataRows.length); i++) {
        const row = dataRows[i];
        const cells = Array.from(row.querySelectorAll("td"));
        const cellTexts = cells.map(
          (c) => c.textContent?.trim().substring(0, 40) || "",
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

    console.log("\n📊 DDT Table Structure:");
    console.log(JSON.stringify(structure, null, 2));
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

main();
