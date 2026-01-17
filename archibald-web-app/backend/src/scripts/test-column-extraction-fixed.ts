#!/usr/bin/env tsx
/**
 * Test script: Verify column extraction using FIXED indices
 */

import { ArchibaldBot } from "../archibald-bot";
import { logger } from "../logger";
import type { Page } from "puppeteer";

interface OrderListRow {
  col0_id: string;
  col1_orderNumber: string;
  col2_customerProfileId: string;
  col3_customerName: string;
  col4_deliveryName: string;
  col5_deliveryAddress: string;
  col6_creationDate: string;
  col7_deliveryDate: string;
  col8_remainingSalesFinancial: string;
  col9_customerReference: string;
  col10_salesStatus: string;
  col11_orderType: string;
  col12_documentStatus: string;
  col13_salesOrigin: string;
  col14_transferStatus: string;
  col15_transferDate: string;
  col16_completionDate: string;
  col17_discountPercent: string;
  col18_grossAmount: string;
  col19_totalAmount: string;
}

async function extractOrderListSample(page: Page): Promise<OrderListRow[]> {
  console.log("\n🔍 Navigating to Order List table...");

  await page.goto("https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("📊 Extracting first 2 rows with FIXED column indices...\n");

  return await page.evaluate(() => {
    const table = document.querySelector(
      'table[id$="_DXMainTable"].dxgvTable_XafTheme',
    );
    if (!table) {
      console.error("❌ Table not found!");
      return [];
    }

    const dataRows = Array.from(
      table.querySelectorAll(
        "tbody tr.dxgvDataRow, tbody tr.dxgvDataRow_XafTheme",
      ),
    );
    const results: any[] = [];

    console.log(`✓ Found ${dataRows.length} data rows\n`);

    // Extract first 2 rows using FIXED indices
    for (let i = 0; i < Math.min(2, dataRows.length); i++) {
      const row = dataRows[i];
      const cells = Array.from(row.querySelectorAll("td"));

      console.log(`Row ${i + 1}: ${cells.length} cells`);

      const rowData: any = {
        col0_id: cells[2]?.textContent?.trim() || "",
        col1_orderNumber: cells[3]?.textContent?.trim() || "",
        col2_customerProfileId: cells[4]?.textContent?.trim() || "",
        col3_customerName: cells[5]?.textContent?.trim() || "",
        col4_deliveryName: cells[6]?.textContent?.trim() || "",
        col5_deliveryAddress: cells[7]?.textContent?.trim() || "",
        col6_creationDate: cells[8]?.textContent?.trim() || "",
        col7_deliveryDate: cells[9]?.textContent?.trim() || "",
        col8_remainingSalesFinancial: cells[10]?.textContent?.trim() || "",
        col9_customerReference: cells[11]?.textContent?.trim() || "",
        col10_salesStatus: cells[12]?.textContent?.trim() || "",
        col11_orderType: cells[13]?.textContent?.trim() || "",
        col12_documentStatus: cells[14]?.textContent?.trim() || "",
        col13_salesOrigin: cells[15]?.textContent?.trim() || "",
        col14_transferStatus: cells[16]?.textContent?.trim() || "",
        col15_transferDate: cells[17]?.textContent?.trim() || "",
        col16_completionDate: cells[18]?.textContent?.trim() || "",
        col17_discountPercent: cells[20]?.textContent?.trim() || "",
        col18_grossAmount: cells[21]?.textContent?.trim() || "",
        col19_totalAmount: cells[22]?.textContent?.trim() || "",
      };

      results.push(rowData);
    }

    return results;
  });
}

function printOrderListResults(rows: OrderListRow[]) {
  console.log("\n" + "=".repeat(80));
  console.log("📋 TABELLA 1: SALESTABLE_ListView_Agent - RISULTATI ESTRATTI");
  console.log("=".repeat(80));

  rows.forEach((row, index) => {
    console.log(`\n🔹 RIGA ${index + 1}:`);
    console.log(`   Col 0  [ID]:                         "${row.col0_id}"`);
    console.log(
      `   Col 1  [ID DI VENDITA]:              "${row.col1_orderNumber}"`,
    );
    console.log(
      `   Col 2  [PROFILO CLIENTE]:            "${row.col2_customerProfileId}"`,
    );
    console.log(
      `   Col 3  [NOME VENDITE]:               "${row.col3_customerName}"`,
    );
    console.log(
      `   Col 4  [NOME DI CONSEGNA]:           "${row.col4_deliveryName}"`,
    );
    console.log(
      `   Col 5  [INDIRIZZO DI CONSEGNA]:      "${row.col5_deliveryAddress.substring(0, 40)}..."`,
    );
    console.log(
      `   Col 6  [DATA DI CREAZIONE]:          "${row.col6_creationDate}"`,
    );
    console.log(
      `   Col 7  [DATA DI CONSEGNA]:           "${row.col7_deliveryDate}"`,
    );
    console.log(
      `   Col 8  [RIMANI VENDITE FINANZIARIE]: "${row.col8_remainingSalesFinancial}"`,
    );
    console.log(
      `   Col 9  [RIFERIMENTO CLIENTE]:        "${row.col9_customerReference}"`,
    );
    console.log(
      `   Col 10 [STATO DELLE VENDITE]:        "${row.col10_salesStatus}"`,
    );
    console.log(
      `   Col 11 [TIPO DI ORDINE]:             "${row.col11_orderType}"`,
    );
    console.log(
      `   Col 12 [STATO DEL DOCUMENTO]:        "${row.col12_documentStatus}"`,
    );
    console.log(
      `   Col 13 [ORIGINE VENDITE]:            "${row.col13_salesOrigin}"`,
    );
    console.log(
      `   Col 14 [STATO DEL TRASFERIMENTO]:    "${row.col14_transferStatus}"`,
    );
    console.log(
      `   Col 15 [DATA DI TRASFERIMENTO]:      "${row.col15_transferDate}"`,
    );
    console.log(
      `   Col 16 [DATA DI COMPLETAMENTO]:      "${row.col16_completionDate}"`,
    );
    console.log(
      `   Col 17 [APPLICA SCONTO %]:           "${row.col17_discountPercent}"`,
    );
    console.log(
      `   Col 18 [IMPORTO LORDO]:              "${row.col18_grossAmount}"`,
    );
    console.log(
      `   Col 19 [IMPORTO TOTALE]:             "${row.col19_totalAmount}"`,
    );
  });
}

async function main() {
  console.log("🚀 Starting Column Extraction Test (FIXED INDICES)\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    // Extract Order List samples
    const orderRows = await extractOrderListSample(bot.page);

    // Print results
    printOrderListResults(orderRows);

    console.log("\n" + "=".repeat(80));
    console.log("✅ TEST COMPLETATO");
    console.log("=".repeat(80));
    console.log("\n📌 VERIFICA CHE:");
    console.log(
      "   1. Tutte le 20 colonne della Tabella 1 siano popolate correttamente",
    );
    console.log("   2. I dati estratti siano leggibili e corretti");
    console.log("   3. L'ID di vendita inizi con 'ORD/'");
    console.log("   4. Tutti i campi siano nel formato atteso\n");
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

main();
