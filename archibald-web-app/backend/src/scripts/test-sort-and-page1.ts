#!/usr/bin/env tsx
/**
 * Test: Navigate to page 1 and sort by delivery date (newest first)
 */

import { ArchibaldBot } from "../archibald-bot";

async function main() {
  console.log("🧪 Test: Page 1 Navigation and Sort by Delivery Date\n");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    console.log("✅ Logged in successfully\n");

    // ==================== ORDER LIST ====================
    console.log("=" .repeat(80));
    console.log("STEP 1: ORDER LIST - Navigate to Page 1 and Sort");
    console.log("=".repeat(80));

    await bot.page.goto(
      "https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log("\n🔍 Looking for 'Data di consegna' column header to sort...");

    // Find and click delivery date header to sort
    const orderSortResult = await bot.page.evaluate(() => {
      // Find all header cells
      const headers = Array.from(document.querySelectorAll('td[class*="dxgvHeader"]'));

      console.log(`Found ${headers.length} header cells`);

      // Find "Data di consegna" header
      let deliveryDateHeader: Element | null = null;
      headers.forEach((header, idx) => {
        const text = header.textContent?.trim().toUpperCase() || "";
        if (text.includes("DATA DI CONSEGNA")) {
          console.log(`Found 'Data di consegna' at header index ${idx}`);
          deliveryDateHeader = header;
        }
      });

      if (!deliveryDateHeader) {
        return { error: "Delivery date header not found" };
      }

      // Click the header to sort (may need to click twice for descending)
      const clickableLink = deliveryDateHeader.querySelector("a");
      if (clickableLink) {
        (clickableLink as HTMLElement).click();
        console.log("Clicked delivery date header (first time - ascending)");
        return { success: true, needsSecondClick: true };
      }

      return { error: "No clickable element in header" };
    });

    if ("error" in orderSortResult) {
      console.error(`\n❌ ${orderSortResult.error}`);
    } else if (orderSortResult.needsSecondClick) {
      console.log("✅ Clicked once (ascending), waiting for page refresh...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Click again for descending order
      await bot.page.evaluate(() => {
        const headers = Array.from(document.querySelectorAll('td[class*="dxgvHeader"]'));
        const deliveryDateHeader = headers.find(h =>
          h.textContent?.trim().toUpperCase().includes("DATA DI CONSEGNA")
        );
        if (deliveryDateHeader) {
          const clickableLink = deliveryDateHeader.querySelector("a");
          if (clickableLink) {
            (clickableLink as HTMLElement).click();
            console.log("Clicked delivery date header (second time - descending)");
          }
        }
      });

      console.log("✅ Clicked twice (descending - newest first)");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // Navigate to page 1
    console.log("\n🔍 Navigating to page 1...");

    const orderPageResult = await bot.page.evaluate(() => {
      // Find page 1 button
      const pageButtons = Array.from(document.querySelectorAll('a[class*="dxp"], div[class*="dxp"]'));

      let page1Button: Element | null = null;
      pageButtons.forEach(btn => {
        const text = btn.textContent?.trim() || "";
        if (text === "1") {
          page1Button = btn;
        }
      });

      if (page1Button) {
        (page1Button as HTMLElement).click();
        console.log("Clicked page 1 button");
        return { success: true };
      }

      return { info: "Already on page 1 or page 1 button not found" };
    });

    console.log(`✅ ${orderPageResult.info || "Navigated to page 1"}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Extract first 5 orders
    const orderData = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) return { error: "Order table not found" };

      const dataRows = Array.from(table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"));
      const results: any[] = [];

      for (let i = 0; i < Math.min(5, dataRows.length); i++) {
        const cells = Array.from(dataRows[i].querySelectorAll("td"));
        results.push({
          id: cells[2]?.textContent?.trim() || "",
          orderNumber: cells[3]?.textContent?.trim() || "",
          deliveryDate: cells[9]?.textContent?.trim() || "",
        });
      }

      return { results };
    });

    if ("error" in orderData) {
      console.error(`\n❌ ${orderData.error}`);
    } else {
      console.log("\n📦 First 5 Orders (sorted by delivery date, newest first):");
      orderData.results.forEach((row: any, idx: number) => {
        console.log(`   ${idx + 1}. ID: "${row.id}", Order#: "${row.orderNumber}", Date: "${row.deliveryDate}"`);
      });
    }

    // ==================== DDT TABLE ====================
    console.log("\n" + "=".repeat(80));
    console.log("STEP 2: DDT TABLE - Navigate to Page 1 and Sort");
    console.log("=".repeat(80));

    await bot.page.goto(
      "https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log("\n🔍 Looking for 'Data di consegna' column header to sort...");

    // Find and click delivery date header to sort
    const ddtSortResult = await bot.page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('td[class*="dxgvHeader"]'));

      console.log(`Found ${headers.length} header cells`);

      let deliveryDateHeader: Element | null = null;
      headers.forEach((header, idx) => {
        const text = header.textContent?.trim().toUpperCase() || "";
        if (text.includes("DATA DI CONSEGNA")) {
          console.log(`Found 'Data di consegna' at header index ${idx}`);
          deliveryDateHeader = header;
        }
      });

      if (!deliveryDateHeader) {
        return { error: "Delivery date header not found" };
      }

      const clickableLink = deliveryDateHeader.querySelector("a");
      if (clickableLink) {
        (clickableLink as HTMLElement).click();
        console.log("Clicked delivery date header (first time - ascending)");
        return { success: true, needsSecondClick: true };
      }

      return { error: "No clickable element in header" };
    });

    if ("error" in ddtSortResult) {
      console.error(`\n❌ ${ddtSortResult.error}`);
    } else if (ddtSortResult.needsSecondClick) {
      console.log("✅ Clicked once (ascending), waiting for page refresh...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Click again for descending order
      await bot.page.evaluate(() => {
        const headers = Array.from(document.querySelectorAll('td[class*="dxgvHeader"]'));
        const deliveryDateHeader = headers.find(h =>
          h.textContent?.trim().toUpperCase().includes("DATA DI CONSEGNA")
        );
        if (deliveryDateHeader) {
          const clickableLink = deliveryDateHeader.querySelector("a");
          if (clickableLink) {
            (clickableLink as HTMLElement).click();
            console.log("Clicked delivery date header (second time - descending)");
          }
        }
      });

      console.log("✅ Clicked twice (descending - newest first)");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // Navigate to page 1
    console.log("\n🔍 Navigating to page 1...");

    const ddtPageResult = await bot.page.evaluate(() => {
      const pageButtons = Array.from(document.querySelectorAll('a[class*="dxp"], div[class*="dxp"]'));

      let page1Button: Element | null = null;
      pageButtons.forEach(btn => {
        const text = btn.textContent?.trim() || "";
        if (text === "1") {
          page1Button = btn;
        }
      });

      if (page1Button) {
        (page1Button as HTMLElement).click();
        console.log("Clicked page 1 button");
        return { success: true };
      }

      return { info: "Already on page 1 or page 1 button not found" };
    });

    console.log(`✅ ${ddtPageResult.info || "Navigated to page 1"}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Extract first 5 DDT entries
    const ddtData = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) return { error: "DDT table not found" };

      const dataRows = Array.from(table.querySelectorAll("tr.dxgvDataRow, tr.dxgvDataRow_XafTheme"));
      const results: any[] = [];

      for (let i = 0; i < Math.min(5, dataRows.length); i++) {
        const cells = Array.from(dataRows[i].querySelectorAll("td"));
        results.push({
          ddtId: cells[6]?.textContent?.trim() || "",
          ddtNumber: cells[7]?.textContent?.trim() || "",
          deliveryDate: cells[8]?.textContent?.trim() || "",
          orderId: cells[9]?.textContent?.trim() || "",
        });
      }

      return { results };
    });

    if ("error" in ddtData) {
      console.error(`\n❌ ${ddtData.error}`);
    } else {
      console.log("\n📄 First 5 DDT entries (sorted by delivery date, newest first):");
      ddtData.results.forEach((row: any, idx: number) => {
        console.log(`   ${idx + 1}. DDT ID: "${row.ddtId}", DDT#: "${row.ddtNumber}", Date: "${row.deliveryDate}", OrderID: "${row.orderId}"`);
      });
    }

    // ==================== VERIFY MATCH ====================
    console.log("\n" + "=".repeat(80));
    console.log("STEP 3: VERIFY MATCH BY ID");
    console.log("=".repeat(80));

    if (!("error" in orderData) && !("error" in ddtData)) {
      console.log("\n🔍 Checking if IDs match after sorting...\n");

      let matchCount = 0;
      orderData.results.forEach((order: any) => {
        const matchingDdt = ddtData.results.find((ddt: any) => ddt.ddtId === order.id);
        if (matchingDdt) {
          matchCount++;
          console.log(`✅ MATCH: Order ID "${order.id}" = DDT ID "${matchingDdt.ddtId}"`);
          console.log(`   Order Date: ${order.deliveryDate}, DDT Date: ${matchingDdt.deliveryDate}`);
        }
      });

      if (matchCount === 0) {
        console.log("⚠️  No matches found even after sorting.");
        console.log("\n   This could mean:");
        console.log("   1. The match key is NOT the ID field");
        console.log("   2. OR the data is still from different time periods");
        console.log("   3. OR we need to use orderNumber ↔ orderId for matching");
      } else {
        console.log(`\n✅ Found ${matchCount} matches!`);
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
