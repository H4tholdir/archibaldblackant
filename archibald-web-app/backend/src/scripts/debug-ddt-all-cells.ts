#!/usr/bin/env tsx
/**
 * Debug script: Inspect ALL cells in DDT table to find missing columns
 */

import { ArchibaldBot } from "../archibald-bot";
import { logger } from "../logger";

async function main() {
  console.log("🔍 Inspecting ALL DDT table cells\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    // Navigate to DDT table
    console.log("Navigating to DDT table...");
    await bot.page.goto(
      "https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const analysis = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) {
        return { error: "Table not found" };
      }

      const dataRows = Array.from(table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"));

      console.log(`Found ${dataRows.length} data rows`);

      // Extract first row with ALL cells
      const firstRow = dataRows[0];
      const cells = Array.from(firstRow.querySelectorAll("td"));

      console.log(`\nFirst row has ${cells.length} cells\n`);
      console.log("ALL CELLS WITH CONTENT:\n");

      const cellData: any[] = [];
      cells.forEach((cell, index) => {
        const text = cell.textContent?.trim() || "";
        if (text && text !== "" && text !== "N/A" && !text.includes("<!--")) {
          const shortText = text.substring(0, 60).replace(/\n/g, " ");
          console.log(`[${index}]: ${shortText}`);
          cellData.push({ index, content: shortText });
        }
      });

      return {
        totalCells: cells.length,
        cellsWithContent: cellData,
      };
    });

    console.log("\n📊 DDT Table Analysis:");
    console.log(JSON.stringify(analysis, null, 2));

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

main();
