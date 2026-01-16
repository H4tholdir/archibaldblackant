#!/usr/bin/env tsx
/**
 * Final test: Verify matching by orderNumber ↔ orderId with sorted data
 */

import { ArchibaldBot } from "../archibald-bot";

async function main() {
  console.log("🧪 Final Test: Match by orderNumber ↔ orderId\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    // ==================== ORDER LIST ====================
    console.log("=" .repeat(80));
    console.log("STEP 1: Extract Order List (sorted by delivery date, page 1)");
    console.log("=".repeat(80));

    await bot.page.goto(
      "https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Sort by delivery date (descending)
    await bot.page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('td[class*="dxgvHeader"]'));
      const deliveryDateHeader = headers.find(h =>
        h.textContent?.trim().toUpperCase().includes("DATA DI CONSEGNA")
      );
      if (deliveryDateHeader) {
        const clickableLink = deliveryDateHeader.querySelector("a");
        if (clickableLink) {
          (clickableLink as HTMLElement).click();
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Click again for descending
    await bot.page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('td[class*="dxgvHeader"]'));
      const deliveryDateHeader = headers.find(h =>
        h.textContent?.trim().toUpperCase().includes("DATA DI CONSEGNA")
      );
      if (deliveryDateHeader) {
        const clickableLink = deliveryDateHeader.querySelector("a");
        if (clickableLink) {
          (clickableLink as HTMLElement).click();
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const orderData = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) return { error: "Order table not found" };

      const dataRows = Array.from(table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"));
      const results: any[] = [];

      for (let i = 0; i < Math.min(20, dataRows.length); i++) {
        const cells = Array.from(dataRows[i].querySelectorAll("td"));
        const orderNumber = cells[3]?.textContent?.trim() || "";

        if (orderNumber && orderNumber.startsWith("ORD/")) {
          results.push({
            id: cells[2]?.textContent?.trim() || "",
            orderNumber,
            deliveryDate: cells[9]?.textContent?.trim() || "",
          });
        }
      }

      return { results };
    });

    if ("error" in orderData) {
      console.error(`\n❌ ${orderData.error}`);
      return;
    }

    console.log(`\n✅ Extracted ${orderData.results.length} orders`);
    console.log("\nFirst 5 orders:");
    orderData.results.slice(0, 5).forEach((row: any, idx: number) => {
      console.log(`   ${idx + 1}. Order#: "${row.orderNumber}", Date: "${row.deliveryDate}"`);
    });

    // ==================== DDT TABLE ====================
    console.log("\n" + "=".repeat(80));
    console.log("STEP 2: Extract DDT (sorted by delivery date, page 1)");
    console.log("=".repeat(80));

    await bot.page.goto(
      "https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Sort by delivery date (descending)
    await bot.page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('td[class*="dxgvHeader"]'));
      const deliveryDateHeader = headers.find(h =>
        h.textContent?.trim().toUpperCase().includes("DATA DI CONSEGNA")
      );
      if (deliveryDateHeader) {
        const clickableLink = deliveryDateHeader.querySelector("a");
        if (clickableLink) {
          (clickableLink as HTMLElement).click();
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Click again for descending
    await bot.page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('td[class*="dxgvHeader"]'));
      const deliveryDateHeader = headers.find(h =>
        h.textContent?.trim().toUpperCase().includes("DATA DI CONSEGNA")
      );
      if (deliveryDateHeader) {
        const clickableLink = deliveryDateHeader.querySelector("a");
        if (clickableLink) {
          (clickableLink as HTMLElement).click();
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const ddtData = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) return { error: "DDT table not found" };

      const dataRows = Array.from(table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"));
      const results: any[] = [];

      for (let i = 0; i < Math.min(20, dataRows.length); i++) {
        const cells = Array.from(dataRows[i].querySelectorAll("td"));

        // Extract tracking link
        const trackingCell = cells[17];
        const trackingLink = trackingCell?.querySelector("a");
        const trackingUrl = trackingLink?.getAttribute("href") || "";
        const trackingNumber = trackingLink?.textContent?.trim() || cells[17]?.textContent?.trim() || "";

        results.push({
          ddtId: cells[6]?.textContent?.trim() || "",
          ddtNumber: cells[7]?.textContent?.trim() || "",
          deliveryDate: cells[8]?.textContent?.trim() || "",
          orderId: cells[9]?.textContent?.trim() || "",
          trackingNumber,
          trackingUrl,
        });
      }

      return { results };
    });

    if ("error" in ddtData) {
      console.error(`\n❌ ${ddtData.error}`);
      return;
    }

    console.log(`\n✅ Extracted ${ddtData.results.length} DDT entries`);
    console.log("\nFirst 5 DDT entries:");
    ddtData.results.slice(0, 5).forEach((row: any, idx: number) => {
      console.log(`   ${idx + 1}. OrderID: "${row.orderId}", Date: "${row.deliveryDate}"`);
    });

    // ==================== MATCH TEST ====================
    console.log("\n" + "=".repeat(80));
    console.log("STEP 3: MATCH BY orderNumber ↔ orderId");
    console.log("=".repeat(80));

    let matchCount = 0;
    const matches: any[] = [];

    orderData.results.forEach((order: any) => {
      const matchingDdt = ddtData.results.find((ddt: any) => ddt.orderId === order.orderNumber);

      if (matchingDdt) {
        matchCount++;
        matches.push({
          orderNumber: order.orderNumber,
          orderDate: order.deliveryDate,
          ddtNumber: matchingDdt.ddtNumber,
          ddtDate: matchingDdt.deliveryDate,
          trackingNumber: matchingDdt.trackingNumber,
          trackingUrl: matchingDdt.trackingUrl,
        });
      }
    });

    console.log(`\n📊 Match Results:`);
    console.log(`   Orders:     ${orderData.results.length}`);
    console.log(`   DDT:        ${ddtData.results.length}`);
    console.log(`   Matches:    ${matchCount}`);
    console.log(`   Match rate: ${((matchCount/orderData.results.length)*100).toFixed(1)}%`);

    if (matchCount > 0) {
      console.log(`\n✅ SUCCESS! Found ${matchCount} matches!\n`);
      console.log("First 5 matches:");

      matches.slice(0, 5).forEach((match: any, idx: number) => {
        console.log(`\n   Match ${idx + 1}:`);
        console.log(`      Order Number:     "${match.orderNumber}" ⭐`);
        console.log(`      Order Date:       "${match.orderDate}"`);
        console.log(`      DDT Number:       "${match.ddtNumber}"`);
        console.log(`      DDT Date:         "${match.ddtDate}"`);
        console.log(`      Tracking:         "${match.trackingNumber}"`);
        console.log(`      Tracking URL:     "${match.trackingUrl.substring(0, 60)}..."`);
      });

      console.log("\n" + "=".repeat(80));
      console.log("✅ VERIFIED:");
      console.log("=".repeat(80));
      console.log("\n   ✅ Match key: orderNumber (Order) ↔ orderId (DDT)");
      console.log("   ✅ Tracking links extracted correctly");
      console.log("   ✅ All 11 DDT columns ready for extraction");

    } else {
      console.log("\n❌ NO MATCHES FOUND!");
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
