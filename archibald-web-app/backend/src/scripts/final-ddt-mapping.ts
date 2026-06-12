#!/usr/bin/env tsx
/**
 * Final DDT mapping: match 54-cell header row to 22-cell data rows
 */

import { ArchibaldBot } from "../bot/archibald-bot";

async function main() {
  console.log("🔍 Final DDT Column Mapping\n");

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

      const allRows = Array.from(table.querySelectorAll("tr"));

      // Header row (54 cells)
      const headerRow = allRows[0];
      const headerCells = Array.from(headerRow.querySelectorAll("td, th"));

      console.log(`Header row: ${headerCells.length} cells`);

      // Extract header texts
      const headers: string[] = [];
      headerCells.forEach((cell, index) => {
        const text = cell.textContent?.trim() || "";
        headers.push(text);
        if (text && text !== "") {
          console.log(`  Header[${index}]: "${text.substring(0, 40)}"`);
        }
      });

      // Data rows (22 cells)
      const dataRows = Array.from(
        table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"),
      );
      const firstDataRow = dataRows[0];
      const dataCells = Array.from(firstDataRow.querySelectorAll("td"));

      console.log(`\nFirst data row: ${dataCells.length} cells`);

      // Print all data cells with content
      const dataCellsContent: any[] = [];
      dataCells.forEach((cell, index) => {
        const text = cell.textContent?.trim() || "";
        if (text && text !== "" && text !== "N/A" && !text.includes("<!--")) {
          const short = text.substring(0, 50).replace(/\n/g, " ");
          console.log(`  Data[${index}]: "${short}"`);
          dataCellsContent.push({ index, content: short });
        }
      });

      return {
        headerCount: headerCells.length,
        dataRowCellCount: dataCells.length,
        dataCellsContent,
      };
    });

    console.log("\n" + "=".repeat(80));
    console.log("📊 STRUCTURE ANALYSIS:");
    console.log("=".repeat(80));

    if ("error" in result) {
      console.error(`\n❌ ${result.error}`);
    } else {
      console.log(`\n✅ Header row: ${result.headerCount} cells`);
      console.log(`✅ Data row: ${result.dataRowCellCount} cells`);

      console.log("\n" + "=".repeat(80));
      console.log("📋 DATA CELLS WITH CONTENT:");
      console.log("=".repeat(80));

      result.dataCellsContent.forEach((cell: any) => {
        console.log(`   [${cell.index}]: "${cell.content}"`);
      });

      console.log("\n" + "=".repeat(80));
      console.log("💡 CONCLUSION:");
      console.log("=".repeat(80));
      console.log(
        "\nThe header row (54 cells) does NOT match data row structure (22 cells).",
      );
      console.log("We must use FIXED INDICES from physical data extraction:");
      console.log("\n  Known mappings from previous debug:");
      console.log("    cells[6]  → ID");
      console.log("    cells[7]  → Documento di trasporto");
      console.log("    cells[8]  → Data di consegna");
      console.log("    cells[9]  → ID di vendita (MATCH KEY)");
      console.log("    cells[10] → Conto dell'ordine");
      console.log("    cells[11] → Nome vendite");
      console.log("    cells[12] → Nome di consegna");
      console.log("    cells[17] → Numero di tracciabilità");
      console.log("    cells[19] → Modalità di consegna");
      console.log("\n  MISSING - Need to identify:");
      console.log("    cells[?]  → Termini di consegna");
      console.log("    cells[?]  → Città di consegna");
      console.log(
        "\n  Based on current output, let's check cells[13-16], [18], [20-21]",
      );
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

main();
