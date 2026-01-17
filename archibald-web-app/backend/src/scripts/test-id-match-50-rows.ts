#!/usr/bin/env tsx
/**
 * Test: Extract 50 rows from both tables and verify ID matching
 */

import { ArchibaldBot } from "../archibald-bot";

async function main() {
  console.log("🧪 Test: ID Matching on 50 Rows from Both Tables\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    // Extract Order List (50 rows)
    console.log("=".repeat(80));
    console.log("STEP 1: Extracting 50 rows from ORDER LIST");
    console.log("=".repeat(80));

    await bot.page.goto(
      "https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/",
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const orderData = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) return { error: "Order table not found" };

      const dataRows = Array.from(
        table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"),
      );
      console.log(`Found ${dataRows.length} order rows`);

      const results: any[] = [];

      for (let i = 0; i < Math.min(50, dataRows.length); i++) {
        const cells = Array.from(dataRows[i].querySelectorAll("td"));

        const id = cells[2]?.textContent?.trim() || "";
        const orderNumber = cells[3]?.textContent?.trim() || "";

        if (id && orderNumber.startsWith("ORD/")) {
          results.push({ id, orderNumber });
        }
      }

      return { count: results.length, results };
    });

    if ("error" in orderData) {
      console.error(`\n❌ ${orderData.error}`);
      return;
    }

    console.log(`\n✅ Extracted ${orderData.count} valid orders`);
    console.log(`\nFirst 3 orders:`);
    orderData.results.slice(0, 3).forEach((row: any, idx: number) => {
      console.log(
        `   ${idx + 1}. ID: "${row.id}", Order#: "${row.orderNumber}"`,
      );
    });

    // Extract DDT (50 rows)
    console.log("\n" + "=".repeat(80));
    console.log("STEP 2: Extracting 50 rows from DDT TABLE");
    console.log("=".repeat(80));

    await bot.page.goto(
      "https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/",
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const ddtData = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) return { error: "DDT table not found" };

      const dataRows = Array.from(
        table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"),
      );
      console.log(`Found ${dataRows.length} DDT rows`);

      const results: any[] = [];

      for (let i = 0; i < Math.min(50, dataRows.length); i++) {
        const cells = Array.from(dataRows[i].querySelectorAll("td"));

        const ddtId = cells[6]?.textContent?.trim() || "";
        const ddtNumber = cells[7]?.textContent?.trim() || "";
        const orderId = cells[9]?.textContent?.trim() || "";

        if (ddtId && ddtNumber.startsWith("DDT/")) {
          results.push({ ddtId, ddtNumber, orderId });
        }
      }

      return { count: results.length, results };
    });

    if ("error" in ddtData) {
      console.error(`\n❌ ${ddtData.error}`);
      return;
    }

    console.log(`\n✅ Extracted ${ddtData.count} valid DDT entries`);
    console.log(`\nFirst 3 DDT entries:`);
    ddtData.results.slice(0, 3).forEach((row: any, idx: number) => {
      console.log(
        `   ${idx + 1}. DDT ID: "${row.ddtId}", DDT#: "${row.ddtNumber}", OrderID: "${row.orderId}"`,
      );
    });

    // Match by ID
    console.log("\n" + "=".repeat(80));
    console.log("STEP 3: MATCHING BY ID FIELD");
    console.log("=".repeat(80));

    let matchCount = 0;
    const matches: any[] = [];

    orderData.results.forEach((order: any) => {
      const matchingDdt = ddtData.results.find(
        (ddt: any) => ddt.ddtId === order.id,
      );

      if (matchingDdt) {
        matchCount++;
        matches.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          ddtId: matchingDdt.ddtId,
          ddtNumber: matchingDdt.ddtNumber,
          ddtOrderId: matchingDdt.orderId,
        });
      }
    });

    console.log(`\n📊 Match Results:`);
    console.log(`   Orders extracted:     ${orderData.count}`);
    console.log(`   DDT entries extracted: ${ddtData.count}`);
    console.log(`   Matches found:        ${matchCount}`);

    if (matchCount > 0) {
      console.log(`\n✅ SUCCESS! Found ${matchCount} matches by ID field!\n`);
      console.log("First 5 matches:");
      matches.slice(0, 5).forEach((match: any, idx: number) => {
        console.log(`\n   Match ${idx + 1}:`);
        console.log(`      Order ID:     "${match.orderId}"`);
        console.log(`      Order Number: "${match.orderNumber}"`);
        console.log(`      DDT ID:       "${match.ddtId}"`);
        console.log(`      DDT Number:   "${match.ddtNumber}"`);
        console.log(`      DDT OrderID:  "${match.ddtOrderId}"`);
      });

      console.log("\n" + "=".repeat(80));
      console.log("💡 CONCLUSION");
      console.log("=".repeat(80));
      console.log("\n✅ The match key is CONFIRMED:");
      console.log("   Order List: id (cells[2])");
      console.log("   DDT:        ddtId (cells[6])");
      console.log(
        `\n   Match rate: ${matchCount}/${orderData.count} orders (${((matchCount / orderData.count) * 100).toFixed(1)}%)`,
      );
    } else {
      console.log("\n❌ NO MATCHES FOUND!");
      console.log("\nThis means:");
      console.log("   - The ID fields are from different sequences");
      console.log(
        "   - OR these are different datasets (different time periods)",
      );
      console.log("   - Need to use a different match key");

      console.log("\n" + "=".repeat(80));
      console.log("🔍 ALTERNATIVE: Try matching by Order Number");
      console.log("=".repeat(80));

      let altMatchCount = 0;
      const altMatches: any[] = [];

      orderData.results.forEach((order: any) => {
        const matchingDdt = ddtData.results.find(
          (ddt: any) => ddt.orderId === order.orderNumber,
        );

        if (matchingDdt) {
          altMatchCount++;
          altMatches.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            ddtId: matchingDdt.ddtId,
            ddtOrderId: matchingDdt.orderId,
          });
        }
      });

      console.log(`\n📊 Alternative Match Results (by Order Number):`);
      console.log(`   Matches found: ${altMatchCount}`);

      if (altMatchCount > 0) {
        console.log(`\n✅ SUCCESS with Order Number matching!\n`);
        console.log("First 5 matches:");
        altMatches.slice(0, 5).forEach((match: any, idx: number) => {
          console.log(`\n   Match ${idx + 1}:`);
          console.log(`      Order ID:        "${match.orderId}"`);
          console.log(`      Order Number:    "${match.orderNumber}" ⭐`);
          console.log(`      DDT ID:          "${match.ddtId}"`);
          console.log(`      DDT Order ID:    "${match.ddtOrderId}" ⭐`);
        });

        console.log("\n" + "=".repeat(80));
        console.log("💡 CORRECT MATCH KEY:");
        console.log("=".repeat(80));
        console.log("\n   Order List: orderNumber (cells[3]) → 'ORD/XXXXX'");
        console.log("   DDT:        orderId (cells[9])     → 'ORD/XXXXX'");
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ TEST COMPLETATO");
    console.log("=".repeat(80));
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

main();
