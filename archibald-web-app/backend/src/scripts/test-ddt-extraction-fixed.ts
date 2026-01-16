#!/usr/bin/env tsx
/**
 * Test script: Verify DDT column extraction using FIXED indices
 */

import { ArchibaldBot } from "../archibald-bot";
import { logger } from "../logger";
import type { Page } from "puppeteer";

interface DDTRow {
  col0_ddtId: string;
  col1_ddtNumber: string;
  col2_ddtDeliveryDate: string;
  col3_orderId: string;
  col4_customerAccount: string;
  col5_salesName: string;
  col6_deliveryName: string;
  col7_trackingNumber: string;
  col8_deliveryMethod: string;
}

async function extractDDTSample(page: Page): Promise<DDTRow[]> {
  console.log("\n🔍 Navigating to DDT table...");

  await page.goto(
    "https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/",
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("📊 Extracting first 2 rows with FIXED column indices...\n");

  return await page.evaluate(() => {
    const table = document.querySelector('table[id$="_DXMainTable"]');
    if (!table) {
      console.error("❌ Table not found!");
      return [];
    }

    const dataRows = Array.from(table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"));
    const results: any[] = [];

    console.log(`✓ Found ${dataRows.length} data rows\n`);

    // Extract first 2 rows using FIXED indices
    for (let i = 0; i < Math.min(2, dataRows.length); i++) {
      const row = dataRows[i];
      const cells = Array.from(row.querySelectorAll("td"));

      console.log(`Row ${i + 1}: ${cells.length} cells`);

      const trackingText = cells[17]?.textContent?.trim() || "";
      const parts = trackingText.split(/\s+/);
      const trackingFull = parts.length >= 2 ? `${parts[0]} ${parts.slice(1).join(" ")}` : trackingText;

      const rowData: any = {
        col0_ddtId: cells[6]?.textContent?.trim() || "",
        col1_ddtNumber: cells[7]?.textContent?.trim() || "",
        col2_ddtDeliveryDate: cells[8]?.textContent?.trim() || "",
        col3_orderId: cells[9]?.textContent?.trim() || "",
        col4_customerAccount: cells[10]?.textContent?.trim() || "",
        col5_salesName: cells[11]?.textContent?.trim() || "",
        col6_deliveryName: cells[12]?.textContent?.trim() || "",
        col7_trackingNumber: trackingFull,
        col8_deliveryMethod: cells[19]?.textContent?.trim() || "",
      };

      results.push(rowData);
    }

    return results;
  });
}

function printDDTResults(rows: DDTRow[]) {
  console.log("\n" + "=".repeat(80));
  console.log("📋 TABELLA 2: CUSTPACKINGSLIPJOUR_ListView - RISULTATI ESTRATTI");
  console.log("=".repeat(80));

  rows.forEach((row, index) => {
    console.log(`\n🔹 RIGA ${index + 1}:`);
    console.log(`   Col 0  [ID]:                      "${row.col0_ddtId}"`);
    console.log(`   Col 1  [DOCUMENTO DI TRASPORTO]:  "${row.col1_ddtNumber}"`);
    console.log(`   Col 2  [DATA DI CONSEGNA]:        "${row.col2_ddtDeliveryDate}"`);
    console.log(`   Col 3  [ID DI VENDITA]:           "${row.col3_orderId}"  ⭐ MATCH KEY`);
    console.log(`   Col 4  [CONTO DELL'ORDINE]:       "${row.col4_customerAccount}"`);
    console.log(`   Col 5  [NOME VENDITE]:            "${row.col5_salesName}"`);
    console.log(`   Col 6  [NOME DI CONSEGNA]:        "${row.col6_deliveryName}"`);
    console.log(`   Col 7  [NUMERO TRACCIABILITÀ]:    "${row.col7_trackingNumber}"`);
    console.log(`   Col 8  [MODALITÀ DI CONSEGNA]:    "${row.col8_deliveryMethod}"`);
  });
}

async function main() {
  console.log("🚀 Starting DDT Column Extraction Test (FIXED INDICES)\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    // Extract DDT samples
    const ddtRows = await extractDDTSample(bot.page);

    // Print results
    printDDTResults(ddtRows);

    console.log("\n" + "=".repeat(80));
    console.log("✅ TEST COMPLETATO");
    console.log("=".repeat(80));
    console.log("\n📌 VERIFICA CHE:");
    console.log("   1. Tutti i campi DDT siano popolati correttamente");
    console.log("   2. L'ID di vendita (col 3) inizi con 'ORD/'");
    console.log("   3. Il numero DDT (col 1) inizi con 'DDT/'");
    console.log("   4. Il numero di tracciabilità sia nel formato 'Corriere XXXXX'\n");

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

main();
