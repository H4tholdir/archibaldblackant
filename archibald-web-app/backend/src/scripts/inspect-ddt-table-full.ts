#!/usr/bin/env tsx
/**
 * Full inspection of DDT table structure including all rows
 */

import { ArchibaldBot } from "../bot/archibald-bot";

async function main() {
  console.log("🔍 Full DDT Table Structure Inspection\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    await bot.page.goto(
      "https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/",
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const analysis = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) {
        return { error: "Table not found" };
      }

      console.log(`Table ID: ${table.id}`);

      const allRows = Array.from(table.querySelectorAll("tr"));
      console.log(`Total rows: ${allRows.length}`);

      const info: any = {
        tableId: table.id,
        totalRows: allRows.length,
        first20Rows: [],
      };

      // Inspect first 20 rows to find header
      for (let i = 0; i < Math.min(20, allRows.length); i++) {
        const row = allRows[i];
        const cells = Array.from(row.querySelectorAll("td, th"));

        const cellTexts = cells
          .slice(0, 15)
          .map((c) => c.textContent?.trim().substring(0, 40) || "");

        info.first20Rows.push({
          index: i,
          className: row.className,
          cellCount: cells.length,
          cellTypes: cells.slice(0, 3).map((c) => c.tagName),
          first15Cells: cellTexts,
          // Check if this is header row (contains "ID", "Documento", etc.)
          looksLikeHeader: cellTexts.some(
            (t) =>
              t.toLowerCase().includes("documento") ||
              t.toLowerCase().includes("consegna") ||
              t.toLowerCase().includes("vendita"),
          ),
        });
      }

      return info;
    });

    console.log("\n" + "=".repeat(80));
    console.log("📊 DDT TABLE STRUCTURE:");
    console.log("=".repeat(80));

    if ("error" in analysis) {
      console.error(`\n❌ ${analysis.error}`);
    } else {
      console.log(`\nTable ID: ${analysis.tableId}`);
      console.log(`Total rows: ${analysis.totalRows}\n`);

      console.log("FIRST 20 ROWS:\n");

      analysis.first20Rows.forEach((row: any) => {
        const headerFlag = row.looksLikeHeader ? " ⭐ POTENTIAL HEADER" : "";
        console.log(`\n[Row ${row.index}] ${row.className}${headerFlag}`);
        console.log(
          `  Cells: ${row.cellCount}, Types: ${row.cellTypes.join(", ")}`,
        );

        if (row.first15Cells.some((c: string) => c !== "")) {
          console.log(`  Content preview:`);
          row.first15Cells.forEach((text: string, idx: number) => {
            if (text && text !== "") {
              console.log(`    [${idx}]: "${text}"`);
            }
          });
        }
      });
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

main();
