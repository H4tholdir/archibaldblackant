#!/usr/bin/env tsx
/**
 * Find the common field between Order List and DDT for matching
 */

import { ArchibaldBot } from "../bot/archibald-bot";

async function main() {
  console.log("🔍 Finding Common Match Field between Order List and DDT\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    // Extract Order List data (ALL fields)
    console.log("=".repeat(80));
    console.log("EXTRACTING ORDER LIST DATA (First 2 rows)");
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
      const results: any[] = [];

      for (let i = 0; i < Math.min(2, dataRows.length); i++) {
        const cells = Array.from(dataRows[i].querySelectorAll("td"));

        // Extract ALL key fields
        results.push({
          id: cells[2]?.textContent?.trim() || "",
          orderNumber: cells[3]?.textContent?.trim() || "",
          customerProfileId: cells[4]?.textContent?.trim() || "",
          customerName: cells[5]?.textContent?.trim() || "",
        });
      }

      return { results };
    });

    if ("error" in orderData) {
      console.error(`\n❌ ${orderData.error}`);
      return;
    }

    orderData.results.forEach((row: any, idx: number) => {
      console.log(`\n📦 Order ${idx + 1}:`);
      console.log(`   ID:                  "${row.id}"`);
      console.log(`   Order Number:        "${row.orderNumber}"`);
      console.log(`   Customer Profile ID: "${row.customerProfileId}"`);
      console.log(`   Customer Name:       "${row.customerName}"`);
    });

    // Extract DDT data (ALL fields)
    console.log("\n" + "=".repeat(80));
    console.log("EXTRACTING DDT DATA (First 2 rows)");
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
      const results: any[] = [];

      for (let i = 0; i < Math.min(2, dataRows.length); i++) {
        const cells = Array.from(dataRows[i].querySelectorAll("td"));

        // Extract ALL key fields
        results.push({
          ddtId: cells[6]?.textContent?.trim() || "",
          ddtNumber: cells[7]?.textContent?.trim() || "",
          deliveryDate: cells[8]?.textContent?.trim() || "",
          orderId: cells[9]?.textContent?.trim() || "",
          customerAccount: cells[10]?.textContent?.trim() || "",
          salesName: cells[11]?.textContent?.trim() || "",
        });
      }

      return { results };
    });

    if ("error" in ddtData) {
      console.error(`\n❌ ${ddtData.error}`);
      return;
    }

    ddtData.results.forEach((row: any, idx: number) => {
      console.log(`\n📄 DDT ${idx + 1}:`);
      console.log(`   DDT ID:              "${row.ddtId}"`);
      console.log(`   DDT Number:          "${row.ddtNumber}"`);
      console.log(`   Delivery Date:       "${row.deliveryDate}"`);
      console.log(`   Order ID:            "${row.orderId}"`);
      console.log(`   Customer Account:    "${row.customerAccount}"`);
      console.log(`   Sales Name:          "${row.salesName}"`);
    });

    // Find common fields
    console.log("\n" + "=".repeat(80));
    console.log("🔍 FINDING COMMON MATCH FIELD");
    console.log("=".repeat(80));

    console.log("\n📊 Comparing fields between Order List and DDT:\n");

    console.log("Potential match fields:");
    console.log(
      "   1. Order.id          ↔️  DDT.ddtId          (Different sequences)",
    );
    console.log(
      "   2. Order.orderNumber ↔️  DDT.orderId        (Both ORD/XXXXX format) ⭐",
    );
    console.log(
      "   3. Order.customerProfileId ↔️  DDT.customerAccount (Customer ID)",
    );

    console.log("\n" + "=".repeat(80));
    console.log("💡 CONCLUSION");
    console.log("=".repeat(80));
    console.log("\nThe correct MATCH KEY is:");
    console.log("   Order List: orderNumber (cells[3]) → 'ORD/25020453'");
    console.log("   DDT:        orderId (cells[9])     → 'ORD/23000787'");
    console.log(
      "\n⚠️  NOTE: These are DIFFERENT orders, so no match expected.",
    );
    console.log(
      "   The match should be done by orderNumber/orderId field, NOT by id/ddtId.",
    );
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

main();
