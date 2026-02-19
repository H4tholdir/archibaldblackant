#!/usr/bin/env tsx
/**
 * Test: Verify match key (ID) and tracking link extraction
 */

import { ArchibaldBot } from "../bot/archibald-bot";

async function main() {
  console.log("🧪 Test: Match Key (ID) and Tracking Link Extraction\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    // Test 1: Extract Order List IDs
    console.log("=".repeat(80));
    console.log("TEST 1: ORDER LIST - Extract ID (Match Key)");
    console.log("=".repeat(80));

    await bot.page.goto(
      "https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/",
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const orderIds = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) return { error: "Order table not found" };

      const dataRows = Array.from(
        table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"),
      );
      const results: any[] = [];

      for (let i = 0; i < Math.min(3, dataRows.length); i++) {
        const cells = Array.from(dataRows[i].querySelectorAll("td"));
        results.push({
          id: cells[2]?.textContent?.trim() || "",
          orderNumber: cells[3]?.textContent?.trim() || "",
        });
      }

      return { results };
    });

    if ("error" in orderIds) {
      console.error(`\n❌ ${orderIds.error}`);
    } else {
      orderIds.results.forEach((row: any, idx: number) => {
        console.log(`\nOrder ${idx + 1}:`);
        console.log(`   ID (MATCH KEY):     "${row.id}"`);
        console.log(`   Order Number:       "${row.orderNumber}"`);
      });
    }

    // Test 2: Extract DDT IDs and Tracking Links
    console.log("\n" + "=".repeat(80));
    console.log("TEST 2: DDT TABLE - Extract ID (Match Key) and Tracking Link");
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

      for (let i = 0; i < Math.min(3, dataRows.length); i++) {
        const cells = Array.from(dataRows[i].querySelectorAll("td"));

        // Extract ID (match key)
        const ddtId = cells[6]?.textContent?.trim() || "";
        const ddtNumber = cells[7]?.textContent?.trim() || "";

        // Extract tracking link
        const trackingCell = cells[17];
        const trackingLink = trackingCell?.querySelector("a");

        let trackingNumber = "";
        let trackingUrl = "";
        let hasLink = false;

        if (trackingLink) {
          hasLink = true;
          trackingUrl = trackingLink.getAttribute("href") || "";
          trackingNumber = trackingLink.textContent?.trim() || "";
        } else {
          // Fallback to text
          trackingNumber = trackingCell?.textContent?.trim() || "";
        }

        results.push({
          ddtId,
          ddtNumber,
          trackingNumber,
          trackingUrl,
          hasLink,
        });
      }

      return { results };
    });

    if ("error" in ddtData) {
      console.error(`\n❌ ${ddtData.error}`);
    } else {
      ddtData.results.forEach((row: any, idx: number) => {
        console.log(`\nDDT ${idx + 1}:`);
        console.log(`   ID (MATCH KEY):     "${row.ddtId}"`);
        console.log(`   DDT Number:         "${row.ddtNumber}"`);
        console.log(`   Tracking Number:    "${row.trackingNumber}"`);
        console.log(`   Tracking URL:       "${row.trackingUrl}"`);
        console.log(
          `   Has Clickable Link: ${row.hasLink ? "✅ YES" : "❌ NO"}`,
        );
      });
    }

    // Test 3: Verify Match
    console.log("\n" + "=".repeat(80));
    console.log("TEST 3: MATCH VERIFICATION");
    console.log("=".repeat(80));

    if (!("error" in orderIds) && !("error" in ddtData)) {
      console.log("\n📊 Checking if Order IDs match DDT IDs...\n");

      orderIds.results.forEach((order: any) => {
        const matchingDdt = ddtData.results.find(
          (ddt: any) => ddt.ddtId === order.id,
        );

        if (matchingDdt) {
          console.log(`✅ MATCH FOUND:`);
          console.log(`   Order ID:    "${order.id}"`);
          console.log(`   DDT ID:      "${matchingDdt.ddtId}"`);
          console.log(`   DDT Number:  "${matchingDdt.ddtNumber}"`);
        } else {
          console.log(`⚠️  NO MATCH:`);
          console.log(`   Order ID:    "${order.id}"`);
          console.log(`   (No corresponding DDT found)`);
        }
      });
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
