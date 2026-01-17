#!/usr/bin/env tsx
/**
 * Analyze DDT fields: inspect 5 rows to find patterns for missing fields
 */

import { ArchibaldBot } from "../archibald-bot";

async function main() {
  console.log("🔍 Analyzing DDT Fields (5 rows)\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    // Navigate to DDT table
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

      const dataRows = Array.from(
        table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"),
      );

      const rows: any[] = [];

      // Extract first 5 rows
      for (let i = 0; i < Math.min(5, dataRows.length); i++) {
        const row = dataRows[i];
        const cells = Array.from(row.querySelectorAll("td"));

        const fullAddress = cells[13]?.textContent?.trim() || "";

        rows.push({
          rowIndex: i + 1,
          ddtNumber: cells[7]?.textContent?.trim() || "",
          orderId: cells[9]?.textContent?.trim() || "",
          deliveryName: cells[12]?.textContent?.trim() || "",
          fullAddress: fullAddress,
          cell14: cells[14]?.textContent?.trim() || "",
          cell16: cells[16]?.textContent?.trim() || "",
          trackingNumber: cells[17]?.textContent?.trim() || "",
          deliveryMethod: cells[19]?.textContent?.trim() || "",
          email: cells[21]?.textContent?.trim() || "",
        });
      }

      return { rows };
    });

    console.log("\n📊 DDT FIELD ANALYSIS (5 rows):\n");
    console.log("=".repeat(80));

    if ("error" in analysis) {
      console.error(analysis.error);
    } else {
      analysis.rows.forEach((row: any) => {
        console.log(`\n🔹 ROW ${row.rowIndex}:`);
        console.log(`   DDT Number:      "${row.ddtNumber}"`);
        console.log(`   Order ID:        "${row.orderId}"`);
        console.log(`   Delivery Name:   "${row.deliveryName}"`);
        console.log(`   Full Address:    "${row.fullAddress}"`);
        console.log(`   Cell[14]:        "${row.cell14}"`);
        console.log(`   Cell[16]:        "${row.cell16}"`);
        console.log(`   Tracking:        "${row.trackingNumber}"`);
        console.log(`   Delivery Method: "${row.deliveryMethod}"`);
        console.log(`   Email:           "${row.email}"`);
      });

      console.log("\n" + "=".repeat(80));
      console.log("\n📌 OBSERVATIONS:");
      console.log(
        "   - Full Address (cell[13]) contains: street + ZIP + CITY + province",
      );
      console.log("   - Cell[14]: Unknown numeric field");
      console.log("   - Cell[16]: Unknown numeric field");
      console.log(
        "   - 'Termini di consegna' (delivery terms): NOT FOUND in table",
      );
      console.log("\n💡 SOLUTION:");
      console.log("   - Extract CITY from full address using regex pattern");
      console.log(
        "   - 'Termini di consegna' may need to be fetched from DDT detail page",
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
