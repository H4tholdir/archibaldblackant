#!/usr/bin/env tsx
/**
 * Test script: Verify exact column extraction from Archibald tables
 *
 * This script navigates to both tables and prints the EXACT data extracted
 * to verify that our scraping logic correctly maps all 20+11 columns.
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

interface DDTRow {
  col0_ddtId: string;
  col1_ddtNumber: string;
  col2_ddtDeliveryDate: string;
  col3_orderId: string;
  col4_customerAccount: string;
  col5_salesName: string;
  col6_deliveryName: string;
  col7_trackingNumber: string;
  col8_deliveryTerms: string;
  col9_deliveryMethod: string;
  col10_deliveryCity: string;
}

async function extractOrderListSample(page: Page): Promise<OrderListRow[]> {
  console.log("\n🔍 Navigating to Order List table...");

  await page.goto(
    "https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/",
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("📊 Extracting first 2 rows with ALL 20 columns using HEADER-BASED detection...\n");

  return await page.evaluate(() => {
    const table = document.querySelector('table[id$="_DXMainTable"]');
    if (!table) {
      console.error("❌ Table not found!");
      return [];
    }

    // Detect column indices by header text
    const headerRow = table.querySelector("tr.dxgvHeader");
    if (!headerRow) {
      console.error("❌ Header row not found!");
      return [];
    }

    const headers = Array.from(headerRow.querySelectorAll("td"));
    const columnMap: Record<string, number> = {};

    console.log(`\n📋 Found ${headers.length} headers. Mapping columns...\n`);

    headers.forEach((header, index) => {
      const text = header.textContent?.trim().toUpperCase() || "";

      if (text.includes("ID") && !text.includes("VENDITA") && !text.includes("ORDINE")) {
        columnMap.id = index;
        console.log(`  ✓ Col ${index}: ID`);
      } else if (text.includes("ID DI VENDITA")) {
        columnMap.orderNumber = index;
        console.log(`  ✓ Col ${index}: ID DI VENDITA`);
      } else if (text.includes("PROFILO CLIENTE")) {
        columnMap.customerProfileId = index;
        console.log(`  ✓ Col ${index}: PROFILO CLIENTE`);
      } else if (text.includes("NOME VENDITE")) {
        columnMap.customerName = index;
        console.log(`  ✓ Col ${index}: NOME VENDITE`);
      } else if (text.includes("NOME DI CONSEGNA")) {
        columnMap.deliveryName = index;
        console.log(`  ✓ Col ${index}: NOME DI CONSEGNA`);
      } else if (text.includes("INDIRIZZO DI CONSEGNA")) {
        columnMap.deliveryAddress = index;
        console.log(`  ✓ Col ${index}: INDIRIZZO DI CONSEGNA`);
      } else if (text.includes("DATA DI CREAZIONE")) {
        columnMap.creationDate = index;
        console.log(`  ✓ Col ${index}: DATA DI CREAZIONE`);
      } else if (text.includes("DATA DI CONSEGNA")) {
        columnMap.deliveryDate = index;
        console.log(`  ✓ Col ${index}: DATA DI CONSEGNA`);
      } else if (text.includes("RIMANI VENDITE FINANZIARIE")) {
        columnMap.remainingSalesFinancial = index;
        console.log(`  ✓ Col ${index}: RIMANI VENDITE FINANZIARIE`);
      } else if (text.includes("RIFERIMENTO CLIENTE")) {
        columnMap.customerReference = index;
        console.log(`  ✓ Col ${index}: RIFERIMENTO CLIENTE`);
      } else if (text.includes("STATO DELLE VENDITE")) {
        columnMap.salesStatus = index;
        console.log(`  ✓ Col ${index}: STATO DELLE VENDITE`);
      } else if (text.includes("TIPO DI ORDINE")) {
        columnMap.orderType = index;
        console.log(`  ✓ Col ${index}: TIPO DI ORDINE`);
      } else if (text.includes("STATO DEL DOCUMENTO")) {
        columnMap.documentStatus = index;
        console.log(`  ✓ Col ${index}: STATO DEL DOCUMENTO`);
      } else if (text.includes("ORIGINE VENDITE")) {
        columnMap.salesOrigin = index;
        console.log(`  ✓ Col ${index}: ORIGINE VENDITE`);
      } else if (text.includes("STATO DEL TRASFERIMENTO")) {
        columnMap.transferStatus = index;
        console.log(`  ✓ Col ${index}: STATO DEL TRASFERIMENTO`);
      } else if (text.includes("DATA DI TRASFERIMENTO")) {
        columnMap.transferDate = index;
        console.log(`  ✓ Col ${index}: DATA DI TRASFERIMENTO`);
      } else if (text.includes("DATA DI COMPLETAMENTO")) {
        columnMap.completionDate = index;
        console.log(`  ✓ Col ${index}: DATA DI COMPLETAMENTO`);
      } else if (text.includes("APPLICA SCONTO")) {
        columnMap.discountPercent = index;
        console.log(`  ✓ Col ${index}: APPLICA SCONTO %`);
      } else if (text.includes("IMPORTO LORDO")) {
        columnMap.grossAmount = index;
        console.log(`  ✓ Col ${index}: IMPORTO LORDO`);
      } else if (text.includes("IMPORTO TOTALE")) {
        columnMap.totalAmount = index;
        console.log(`  ✓ Col ${index}: IMPORTO TOTALE`);
      }
    });

    // Validate required columns
    if (columnMap.id === undefined || columnMap.orderNumber === undefined) {
      console.error("❌ Required columns not found!", columnMap);
      return [];
    }

    const rows = Array.from(table.querySelectorAll("tbody tr.dxgvDataRow, tbody tr.dxgvDataRow_XafTheme"));
    const results: any[] = [];

    // Extract first 2 rows using column map
    for (let i = 0; i < Math.min(2, rows.length); i++) {
      const row = rows[i];
      const cells = Array.from(row.querySelectorAll("td"));

      const rowData: any = {
        col0_id: cells[columnMap.id]?.textContent?.trim() || "",
        col1_orderNumber: cells[columnMap.orderNumber]?.textContent?.trim() || "",
        col2_customerProfileId: columnMap.customerProfileId !== undefined ? cells[columnMap.customerProfileId]?.textContent?.trim() || "" : "",
        col3_customerName: columnMap.customerName !== undefined ? cells[columnMap.customerName]?.textContent?.trim() || "" : "",
        col4_deliveryName: columnMap.deliveryName !== undefined ? cells[columnMap.deliveryName]?.textContent?.trim() || "" : "",
        col5_deliveryAddress: columnMap.deliveryAddress !== undefined ? cells[columnMap.deliveryAddress]?.textContent?.trim() || "" : "",
        col6_creationDate: columnMap.creationDate !== undefined ? cells[columnMap.creationDate]?.textContent?.trim() || "" : "",
        col7_deliveryDate: columnMap.deliveryDate !== undefined ? cells[columnMap.deliveryDate]?.textContent?.trim() || "" : "",
        col8_remainingSalesFinancial: columnMap.remainingSalesFinancial !== undefined ? cells[columnMap.remainingSalesFinancial]?.textContent?.trim() || "" : "",
        col9_customerReference: columnMap.customerReference !== undefined ? cells[columnMap.customerReference]?.textContent?.trim() || "" : "",
        col10_salesStatus: columnMap.salesStatus !== undefined ? cells[columnMap.salesStatus]?.textContent?.trim() || "" : "",
        col11_orderType: columnMap.orderType !== undefined ? cells[columnMap.orderType]?.textContent?.trim() || "" : "",
        col12_documentStatus: columnMap.documentStatus !== undefined ? cells[columnMap.documentStatus]?.textContent?.trim() || "" : "",
        col13_salesOrigin: columnMap.salesOrigin !== undefined ? cells[columnMap.salesOrigin]?.textContent?.trim() || "" : "",
        col14_transferStatus: columnMap.transferStatus !== undefined ? cells[columnMap.transferStatus]?.textContent?.trim() || "" : "",
        col15_transferDate: columnMap.transferDate !== undefined ? cells[columnMap.transferDate]?.textContent?.trim() || "" : "",
        col16_completionDate: columnMap.completionDate !== undefined ? cells[columnMap.completionDate]?.textContent?.trim() || "" : "",
        col17_discountPercent: columnMap.discountPercent !== undefined ? cells[columnMap.discountPercent]?.textContent?.trim() || "" : "",
        col18_grossAmount: columnMap.grossAmount !== undefined ? cells[columnMap.grossAmount]?.textContent?.trim() || "" : "",
        col19_totalAmount: columnMap.totalAmount !== undefined ? cells[columnMap.totalAmount]?.textContent?.trim() || "" : "",
      };

      results.push(rowData);
    }

    return results;
  });
}

async function extractDDTSample(page: Page): Promise<DDTRow[]> {
  console.log("\n🔍 Navigating to DDT table...");

  await page.goto(
    "https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/",
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("📊 Extracting first 2 rows with ALL 11 columns using HEADER-BASED detection...\n");

  return await page.evaluate(() => {
    const table = document.querySelector('table[id$="_DXMainTable"]');
    if (!table) {
      console.error("❌ Table not found!");
      return [];
    }

    // Detect column indices by header text
    const headerRow = table.querySelector("tr.dxgvHeader");
    if (!headerRow) {
      console.error("❌ Header row not found!");
      return [];
    }

    const headers = Array.from(headerRow.querySelectorAll("td"));
    const columnMap: Record<string, number> = {};

    console.log(`\n📋 Found ${headers.length} headers. Mapping columns...\n`);

    headers.forEach((header, index) => {
      const text = header.textContent?.trim().toUpperCase() || "";

      if (text.includes("ID") && !text.includes("VENDITA") && !text.includes("TRACCIABILIT")) {
        columnMap.ddtId = index;
        console.log(`  ✓ Col ${index}: ID`);
      } else if (text.includes("DOCUMENTO DI TRASPORTO")) {
        columnMap.ddtNumber = index;
        console.log(`  ✓ Col ${index}: DOCUMENTO DI TRASPORTO`);
      } else if (text.includes("DATA DI CONSEGNA")) {
        columnMap.deliveryDate = index;
        console.log(`  ✓ Col ${index}: DATA DI CONSEGNA`);
      } else if (text.includes("ID DI VENDITA")) {
        columnMap.orderId = index;
        console.log(`  ✓ Col ${index}: ID DI VENDITA (MATCH KEY)`);
      } else if (text.includes("CONTO DELL'ORDINE")) {
        columnMap.customerAccountId = index;
        console.log(`  ✓ Col ${index}: CONTO DELL'ORDINE`);
      } else if (text.includes("NOME VENDITE")) {
        columnMap.salesName = index;
        console.log(`  ✓ Col ${index}: NOME VENDITE`);
      } else if (text.includes("NOME DI CONSEGNA")) {
        columnMap.deliveryName = index;
        console.log(`  ✓ Col ${index}: NOME DI CONSEGNA`);
      } else if (text.includes("TRACCIABILITÀ") || text.includes("NUMERO DI TRACCIABILITÀ")) {
        columnMap.tracking = index;
        console.log(`  ✓ Col ${index}: NUMERO DI TRACCIABILITÀ`);
      } else if (text.includes("TERMINI DI CONSEGNA")) {
        columnMap.deliveryTerms = index;
        console.log(`  ✓ Col ${index}: TERMINI DI CONSEGNA`);
      } else if (text.includes("MODALITÀ DI CONSEGNA")) {
        columnMap.deliveryMethod = index;
        console.log(`  ✓ Col ${index}: MODALITÀ DI CONSEGNA`);
      } else if (text.includes("CITTÀ DI CONSEGNA")) {
        columnMap.deliveryCity = index;
        console.log(`  ✓ Col ${index}: CITTÀ DI CONSEGNA`);
      }
    });

    // Validate required columns
    if (columnMap.ddtNumber === undefined || columnMap.orderId === undefined) {
      console.error("❌ Required columns not found!", columnMap);
      return [];
    }

    const rows = Array.from(table.querySelectorAll("tbody tr.dxgvDataRow, tbody tr.dxgvDataRow_XafTheme"));
    const results: any[] = [];

    // Extract first 2 rows using column map
    for (let i = 0; i < Math.min(2, rows.length); i++) {
      const row = rows[i];
      const cells = Array.from(row.querySelectorAll("td"));

      // Extract tracking info from link if present
      let trackingText = "";
      if (columnMap.tracking !== undefined) {
        const trackingCell = cells[columnMap.tracking];
        if (trackingCell) {
          const link = trackingCell.querySelector("a");
          if (link) {
            trackingText = link.textContent?.trim() || "";
          } else {
            trackingText = trackingCell.textContent?.trim() || "";
          }
        }
      }

      const rowData: any = {
        col0_ddtId: columnMap.ddtId !== undefined ? cells[columnMap.ddtId]?.textContent?.trim() || "" : "",
        col1_ddtNumber: cells[columnMap.ddtNumber]?.textContent?.trim() || "",
        col2_ddtDeliveryDate: columnMap.deliveryDate !== undefined ? cells[columnMap.deliveryDate]?.textContent?.trim() || "" : "",
        col3_orderId: cells[columnMap.orderId]?.textContent?.trim() || "",
        col4_customerAccount: columnMap.customerAccountId !== undefined ? cells[columnMap.customerAccountId]?.textContent?.trim() || "" : "",
        col5_salesName: columnMap.salesName !== undefined ? cells[columnMap.salesName]?.textContent?.trim() || "" : "",
        col6_deliveryName: columnMap.deliveryName !== undefined ? cells[columnMap.deliveryName]?.textContent?.trim() || "" : "",
        col7_trackingNumber: trackingText,
        col8_deliveryTerms: columnMap.deliveryTerms !== undefined ? cells[columnMap.deliveryTerms]?.textContent?.trim() || "" : "",
        col9_deliveryMethod: columnMap.deliveryMethod !== undefined ? cells[columnMap.deliveryMethod]?.textContent?.trim() || "" : "",
        col10_deliveryCity: columnMap.deliveryCity !== undefined ? cells[columnMap.deliveryCity]?.textContent?.trim() || "" : "",
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
    console.log(`   Col 1  [ID DI VENDITA]:              "${row.col1_orderNumber}"`);
    console.log(`   Col 2  [PROFILO CLIENTE]:            "${row.col2_customerProfileId}"`);
    console.log(`   Col 3  [NOME VENDITE]:               "${row.col3_customerName}"`);
    console.log(`   Col 4  [NOME DI CONSEGNA]:           "${row.col4_deliveryName}"`);
    console.log(`   Col 5  [INDIRIZZO DI CONSEGNA]:      "${row.col5_deliveryAddress}"`);
    console.log(`   Col 6  [DATA DI CREAZIONE]:          "${row.col6_creationDate}"`);
    console.log(`   Col 7  [DATA DI CONSEGNA]:           "${row.col7_deliveryDate}"`);
    console.log(`   Col 8  [RIMANI VENDITE FINANZIARIE]: "${row.col8_remainingSalesFinancial}"`);
    console.log(`   Col 9  [RIFERIMENTO CLIENTE]:        "${row.col9_customerReference}"`);
    console.log(`   Col 10 [STATO DELLE VENDITE]:        "${row.col10_salesStatus}"`);
    console.log(`   Col 11 [TIPO DI ORDINE]:             "${row.col11_orderType}"`);
    console.log(`   Col 12 [STATO DEL DOCUMENTO]:        "${row.col12_documentStatus}"`);
    console.log(`   Col 13 [ORIGINE VENDITE]:            "${row.col13_salesOrigin}"`);
    console.log(`   Col 14 [STATO DEL TRASFERIMENTO]:    "${row.col14_transferStatus}"`);
    console.log(`   Col 15 [DATA DI TRASFERIMENTO]:      "${row.col15_transferDate}"`);
    console.log(`   Col 16 [DATA DI COMPLETAMENTO]:      "${row.col16_completionDate}"`);
    console.log(`   Col 17 [APPLICA SCONTO %]:           "${row.col17_discountPercent}"`);
    console.log(`   Col 18 [IMPORTO LORDO]:              "${row.col18_grossAmount}"`);
    console.log(`   Col 19 [IMPORTO TOTALE]:             "${row.col19_totalAmount}"`);
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
    console.log(`   Col 8  [TERMINI DI CONSEGNA]:     "${row.col8_deliveryTerms}"`);
    console.log(`   Col 9  [MODALITÀ DI CONSEGNA]:    "${row.col9_deliveryMethod}"`);
    console.log(`   Col 10 [CITTÀ DI CONSEGNA]:       "${row.col10_deliveryCity}"`);
  });
}

function verifyMatch(orderRows: OrderListRow[], ddtRows: DDTRow[]) {
  console.log("\n" + "=".repeat(80));
  console.log("🔗 VERIFICA MATCH TRA TABELLE");
  console.log("=".repeat(80));

  orderRows.forEach((orderRow) => {
    const matchingDDT = ddtRows.find((ddt) => ddt.col3_orderId === orderRow.col1_orderNumber);

    if (matchingDDT) {
      console.log(`\n✅ MATCH TROVATO:`);
      console.log(`   Order: ${orderRow.col1_orderNumber} (Tabella 1, Col 1)`);
      console.log(`   DDT:   ${matchingDDT.col3_orderId} (Tabella 2, Col 3)`);
      console.log(`   DDT Number: ${matchingDDT.col1_ddtNumber}`);
    } else {
      console.log(`\n⚠️  NO MATCH per ordine: ${orderRow.col1_orderNumber}`);
    }
  });
}

async function main() {
  console.log("🚀 Starting Column Extraction Test\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    // Extract Order List samples
    const orderRows = await extractOrderListSample(bot.page);

    // Extract DDT samples
    const ddtRows = await extractDDTSample(bot.page);

    // Print results
    printOrderListResults(orderRows);
    printDDTResults(ddtRows);

    // Verify matching
    verifyMatch(orderRows, ddtRows);

    console.log("\n" + "=".repeat(80));
    console.log("✅ TEST COMPLETATO");
    console.log("=".repeat(80));
    console.log("\n📌 VERIFICA CHE:");
    console.log("   1. Tutte le 20 colonne della Tabella 1 siano popolate");
    console.log("   2. Tutte le 11 colonne della Tabella 2 siano popolate");
    console.log("   3. Il match tra 'ID DI VENDITA' funzioni correttamente");
    console.log("   4. I dati estratti siano leggibili e corretti\n");

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

main();
