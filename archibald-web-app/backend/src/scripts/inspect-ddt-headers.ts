#!/usr/bin/env tsx
/**
 * Inspect DDT table headers to find all column names
 */

import { ArchibaldBot } from "../archibald-bot";

async function main() {
  console.log("🔍 Inspecting DDT Table Headers\n");

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

    const headerAnalysis = await bot.page.evaluate(() => {
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) {
        return { error: "Table not found" };
      }

      // Find header row
      const headerRow = table.querySelector(
        "tr.dxgvHeader, tr.dxgvHeader_XafTheme",
      );
      if (!headerRow) {
        return { error: "Header row not found" };
      }

      const headers = Array.from(headerRow.querySelectorAll("td"));

      console.log(`Found ${headers.length} header cells\n`);

      const headerData: any[] = [];
      headers.forEach((header, index) => {
        const text = header.textContent?.trim() || "";
        if (text && text !== "") {
          console.log(`[${index}]: "${text}"`);
          headerData.push({ index, text });
        }
      });

      return {
        totalHeaders: headers.length,
        headers: headerData,
      };
    });

    console.log("\n" + "=".repeat(80));
    console.log("📋 DDT TABLE HEADERS:");
    console.log("=".repeat(80));

    if ("error" in headerAnalysis) {
      console.error(`\n❌ ${headerAnalysis.error}`);
    } else {
      console.log(`\nTotal header cells: ${headerAnalysis.totalHeaders}`);
      console.log(`\nNon-empty headers (${headerAnalysis.headers.length}):\n`);

      headerAnalysis.headers.forEach((h: any) => {
        console.log(`   [${h.index}]: "${h.text}"`);
      });

      console.log("\n" + "=".repeat(80));
      console.log("🎯 REQUIRED COLUMNS (11):");
      console.log("=".repeat(80));

      const required = [
        "id",
        "documento di trasporto",
        "data di consegna",
        "id di vendita",
        "conto dell'ordine",
        "nome vendite",
        "nome di consegna",
        "numero di tracciabilità",
        "termini di consegna",
        "modalità di consegna",
        "città di consegna",
      ];

      required.forEach((col, idx) => {
        const found = headerAnalysis.headers.find((h: any) =>
          h.text.toLowerCase().includes(col.toLowerCase()),
        );
        if (found) {
          console.log(
            `   ✅ [${idx + 1}] "${col}" → FOUND at index ${found.index}`,
          );
        } else {
          console.log(`   ❌ [${idx + 1}] "${col}" → NOT FOUND`);
        }
      });
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

main();
