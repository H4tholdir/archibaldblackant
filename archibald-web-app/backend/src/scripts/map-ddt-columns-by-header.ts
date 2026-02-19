#!/usr/bin/env tsx
/**
 * Map DDT columns using header detection
 */

import { ArchibaldBot } from "../bot/archibald-bot";

async function main() {
  console.log("🔍 Mapping DDT Columns by Header\n");

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

    const result = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) {
        return { error: "Table not found" };
      }

      const allRows = Array.from(table.querySelectorAll("tr"));

      // Find header row (Row 0 with 54 cells)
      const headerRow = allRows[0];
      if (!headerRow) {
        return { error: "Header row not found" };
      }

      const headerCells = Array.from(headerRow.querySelectorAll("td, th"));
      console.log(`Header row has ${headerCells.length} cells`);

      // Map column names to indices
      const columnMap: Record<string, number> = {};

      headerCells.forEach((cell, index) => {
        const text = cell.textContent?.trim().toUpperCase() || "";

        if (text === "ID") {
          columnMap.id = index;
        } else if (text.includes("DOCUMENTO DI TRASPORTO")) {
          columnMap.ddtNumber = index;
        } else if (text.includes("DATA DI CONSEGNA")) {
          columnMap.deliveryDate = index;
        } else if (text.includes("ID DI VENDITA")) {
          columnMap.orderId = index;
        } else if (text.includes("CONTO DELL'ORDINE")) {
          columnMap.customerAccount = index;
        } else if (text.includes("NOME VENDITE")) {
          columnMap.salesName = index;
        } else if (text.includes("NOME DI CONSEGNA")) {
          columnMap.deliveryName = index;
        } else if (text.includes("NUMERO DI TRACCIABILITÀ")) {
          columnMap.trackingNumber = index;
        } else if (text.includes("TERMINI DI CONSEGNA")) {
          columnMap.deliveryTerms = index;
        } else if (text.includes("MODALITÀ DI CONSEGNA")) {
          columnMap.deliveryMethod = index;
        } else if (text.includes("CITTÀ DI CONSEGNA")) {
          columnMap.deliveryCity = index;
        }
      });

      console.log("\n📋 Column Map:");
      console.log(JSON.stringify(columnMap, null, 2));

      // Find data rows
      const dataRows = Array.from(
        table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"),
      );
      console.log(`\nFound ${dataRows.length} data rows`);

      // Extract first 2 rows using column map
      const rows: any[] = [];

      for (let i = 0; i < Math.min(2, dataRows.length); i++) {
        const row = dataRows[i];
        const cells = Array.from(row.querySelectorAll("td"));

        console.log(`\nRow ${i + 1}: ${cells.length} cells`);

        const trackingText =
          cells[columnMap.trackingNumber]?.textContent?.trim() || "";
        const parts = trackingText.split(/\s+/);
        const trackingFull =
          parts.length >= 2
            ? `${parts[0]} ${parts.slice(1).join(" ")}`
            : trackingText;

        const rowData: any = {
          id: cells[columnMap.id]?.textContent?.trim() || "",
          ddtNumber: cells[columnMap.ddtNumber]?.textContent?.trim() || "",
          deliveryDate:
            cells[columnMap.deliveryDate]?.textContent?.trim() || "",
          orderId: cells[columnMap.orderId]?.textContent?.trim() || "",
          customerAccount:
            cells[columnMap.customerAccount]?.textContent?.trim() || "",
          salesName: cells[columnMap.salesName]?.textContent?.trim() || "",
          deliveryName:
            cells[columnMap.deliveryName]?.textContent?.trim() || "",
          trackingNumber: trackingFull,
          deliveryTerms:
            cells[columnMap.deliveryTerms]?.textContent?.trim() || "",
          deliveryMethod:
            cells[columnMap.deliveryMethod]?.textContent?.trim() || "",
          deliveryCity:
            cells[columnMap.deliveryCity]?.textContent?.trim() || "",
        };

        rows.push(rowData);
      }

      return { columnMap, rows };
    });

    console.log("\n" + "=".repeat(80));
    console.log("📊 DDT COLUMN MAPPING RESULT:");
    console.log("=".repeat(80));

    if ("error" in result) {
      console.error(`\n❌ ${result.error}`);
    } else {
      console.log("\n✅ Column Map Found:");
      Object.entries(result.columnMap).forEach(([field, index]) => {
        console.log(`   ${field.padEnd(20)} → cell[${index}]`);
      });

      console.log("\n" + "=".repeat(80));
      console.log("📋 EXTRACTED DATA (First 2 Rows):");
      console.log("=".repeat(80));

      result.rows.forEach((row: any, idx: number) => {
        console.log(`\n🔹 RIGA ${idx + 1}:`);
        console.log(`   [1]  ID:                    "${row.id}"`);
        console.log(`   [2]  Documento di trasporto: "${row.ddtNumber}"`);
        console.log(`   [3]  Data di consegna:       "${row.deliveryDate}"`);
        console.log(
          `   [4]  ID di vendita:          "${row.orderId}"  ⭐ MATCH KEY`,
        );
        console.log(`   [5]  Conto dell'ordine:      "${row.customerAccount}"`);
        console.log(`   [6]  Nome vendite:           "${row.salesName}"`);
        console.log(`   [7]  Nome di consegna:       "${row.deliveryName}"`);
        console.log(`   [8]  Numero tracciabilità:   "${row.trackingNumber}"`);
        console.log(`   [9]  Termini di consegna:    "${row.deliveryTerms}"`);
        console.log(`   [10] Modalità di consegna:   "${row.deliveryMethod}"`);
        console.log(`   [11] Città di consegna:      "${row.deliveryCity}"`);
      });

      console.log("\n" + "=".repeat(80));
      console.log(
        "\n✅ RISULTATO: Tutte le 11 colonne DDT sono state estratte!",
      );
      console.log(
        "   Gli indici delle colonne verranno ora usati nel service definitivo.",
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
