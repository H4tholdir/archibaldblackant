/**
 * Script to analyze the Excel VAT file structure
 *
 * This script reads the Listino_2026_vendita.xlsx file to understand:
 * - Column structure
 * - Product identifiers
 * - VAT (IVA) field location
 * - Price information
 * - How to match with products in our database
 */

import * as XLSX from "xlsx";
import path from "path";
import { logger } from "./logger";

async function analyzeExcelVat() {
  logger.info("📊 Analyzing Excel VAT file structure...");

  const excelPath = path.join(__dirname, "../../../Listino_2026_vendita.xlsx");

  try {
    // Read the Excel file
    const workbook = XLSX.readFile(excelPath);

    logger.info(`📁 Workbook contains ${workbook.SheetNames.length} sheets:`);
    workbook.SheetNames.forEach((name, idx) => {
      logger.info(`   ${idx + 1}. ${name}`);
    });

    // Analyze first sheet (usually the main data)
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    logger.info(`\n📋 Analyzing sheet: "${firstSheetName}"`);

    // Convert to JSON with header row
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (data.length === 0) {
      logger.error("❌ Sheet is empty");
      return;
    }

    // Get header row (first row)
    const headers = data[0] as string[];
    logger.info(`\n📑 Found ${headers.length} columns:`);
    headers.forEach((header, idx) => {
      logger.info(`   [${idx}] "${header}"`);
    });

    // Analyze first 5 data rows
    logger.info(`\n🔍 Sample data (first 5 rows):`);
    for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
      const row = data[i] as any[];
      logger.info(`\n   Row ${i}:`);
      headers.forEach((header, idx) => {
        const value = row[idx];
        if (value !== undefined && value !== null && value !== "") {
          logger.info(`      ${header}: ${value}`);
        }
      });
    }

    // Try to identify key columns
    logger.info(`\n🔑 Identifying key columns:`);

    const productIdColumns = headers.filter(
      (h) =>
        h &&
        (h.toLowerCase().includes("codice") ||
          h.toLowerCase().includes("articolo") ||
          h.toLowerCase().includes("id") ||
          h.toLowerCase().includes("item")),
    );

    const vatColumns = headers.filter(
      (h) =>
        h &&
        (h.toLowerCase().includes("iva") ||
          h.toLowerCase().includes("vat") ||
          h.toLowerCase().includes("tax") ||
          h.toLowerCase().includes("aliquota")),
    );

    const priceColumns = headers.filter(
      (h) =>
        h &&
        (h.toLowerCase().includes("prezzo") ||
          h.toLowerCase().includes("price") ||
          h.toLowerCase().includes("costo") ||
          h.toLowerCase().includes("listino")),
    );

    logger.info(
      `   Product ID columns: ${productIdColumns.join(", ") || "NONE FOUND"}`,
    );
    logger.info(`   VAT/IVA columns: ${vatColumns.join(", ") || "NONE FOUND"}`);
    logger.info(`   Price columns: ${priceColumns.join(", ") || "NONE FOUND"}`);

    // Statistics
    logger.info(`\n📊 Statistics:`);
    logger.info(`   Total rows: ${data.length - 1} (excluding header)`);
    logger.info(`   Total columns: ${headers.length}`);

    // Check for empty columns
    const emptyColumns: number[] = [];
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      let hasData = false;
      for (let rowIdx = 1; rowIdx < Math.min(data.length, 100); rowIdx++) {
        const row = data[rowIdx] as any[];
        if (
          row[colIdx] !== undefined &&
          row[colIdx] !== null &&
          row[colIdx] !== ""
        ) {
          hasData = true;
          break;
        }
      }
      if (!hasData) {
        emptyColumns.push(colIdx);
      }
    }

    if (emptyColumns.length > 0) {
      logger.info(`   Empty columns (first 100 rows): ${emptyColumns.length}`);
      logger.info(
        `      Indices: ${emptyColumns.slice(0, 10).join(", ")}${emptyColumns.length > 10 ? "..." : ""}`,
      );
    }

    // Export sample as JSON for inspection
    const sampleData = data.slice(0, 11); // Header + 10 rows
    const jsonOutput = path.join(__dirname, "../data/excel-vat-sample.json");
    const fs = await import("fs");
    fs.writeFileSync(
      jsonOutput,
      JSON.stringify({ headers, sampleData }, null, 2),
    );
    logger.info(`\n💾 Sample data exported to: ${jsonOutput}`);

    logger.info("\n✅ Analysis complete!");
  } catch (error) {
    logger.error("❌ Failed to analyze Excel file:", error);
    throw error;
  }
}

if (require.main === module) {
  analyzeExcelVat()
    .then(() => {
      logger.info("\n✅ Script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("\n❌ Script failed:", error);
      process.exit(1);
    });
}

export { analyzeExcelVat };
