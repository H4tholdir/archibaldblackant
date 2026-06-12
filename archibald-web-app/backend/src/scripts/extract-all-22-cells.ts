#!/usr/bin/env tsx
/**
 * Extract ALL 22 cells including empty ones to find missing fields
 */

import { ArchibaldBot } from "../bot/archibald-bot";

async function main() {
  console.log("🔍 Extracting ALL 22 DDT Cells\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    await bot.page.goto(
      "https://archibald.komet.it/Archibald/CUSTPACKINGSLIPJOUR_ListView/",
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const result = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) {
        return { error: "Table not found" };
      }

      const dataRows = Array.from(
        table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"),
      );
      const firstRow = dataRows[0];
      const cells = Array.from(firstRow.querySelectorAll("td"));

      console.log(`Data row: ${cells.length} cells\n`);

      // Extract ALL cells (including empty)
      const allCells: any[] = [];
      cells.forEach((cell, index) => {
        const text = cell.textContent?.trim() || "";
        const displayText = text.substring(0, 60).replace(/\n/g, " ");

        console.log(`[${index}]: "${displayText}"`);

        allCells.push({
          index,
          content: displayText,
          isEmpty: text === "" || text === "N/A",
        });
      });

      return { cellCount: cells.length, allCells };
    });

    console.log("\n" + "=".repeat(80));
    console.log("📊 ALL 22 DDT CELLS:");
    console.log("=".repeat(80));

    if ("error" in result) {
      console.error(`\n❌ ${result.error}`);
    } else {
      console.log(`\nTotal cells: ${result.cellCount}\n`);

      result.allCells.forEach((cell: any) => {
        const emptyFlag = cell.isEmpty ? " (EMPTY)" : "";
        console.log(`   [${cell.index}]: "${cell.content}"${emptyFlag}`);
      });

      console.log("\n" + "=".repeat(80));
      console.log("🎯 KNOWN MAPPINGS:");
      console.log("=".repeat(80));
      console.log("\n   [6]  → ID");
      console.log("   [7]  → Documento di trasporto");
      console.log("   [8]  → Data di consegna");
      console.log("   [9]  → ID di vendita (MATCH KEY)");
      console.log("   [10] → Conto dell'ordine");
      console.log("   [11] → Nome vendite");
      console.log("   [12] → Nome di consegna");
      console.log("   [13] → Indirizzo di consegna (includes city)");
      console.log("   [17] → Numero di tracciabilità");
      console.log("   [19] → Modalità di consegna");
      console.log("   [21] → Email (not required)");

      console.log("\n" + "=".repeat(80));
      console.log("❓ REMAINING CELLS TO IDENTIFY:");
      console.log("=".repeat(80));
      console.log("\n   [14] → ?");
      console.log("   [15] → ?");
      console.log("   [16] → ?");
      console.log("   [18] → ?");
      console.log("   [20] → ?");

      console.log("\n" + "=".repeat(80));
      console.log("💡 NEXT STEPS:");
      console.log("=".repeat(80));
      console.log(
        "\n1. Check if 'Termini di consegna' is in [14], [15], [16], [18], or [20]",
      );
      console.log(
        "2. Check if 'Città di consegna' is in [14], [15], [16], [18], or [20]",
      );
      console.log("3. If not found, extract city from address field [13]");
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

main();
