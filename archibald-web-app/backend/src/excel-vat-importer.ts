/**
 * Excel VAT Importer Service
 *
 * Imports VAT (IVA) data from Excel file with hierarchical priority:
 * - Excel data > Archibald data
 * - Tracks all changes in price_changes audit log
 * - Matches products by ID and Codice Articolo
 * - Returns detailed report with unmatched products
 *
 * Expected Excel structure (Listino_2026_vendita.xlsx):
 * - Column 1: "ID" (e.g., "001627K0")
 * - Column 2: "Codice Articolo" (e.g., "1.204.005")
 * - Column 5: "Prezzo di listino unit." (optional)
 * - Column 6: "Prezzo di listino conf." (optional)
 * - Column 7: "IVA" (e.g., 22)
 */

import * as XLSX from "xlsx";
import Database from "better-sqlite3";
import path from "path";
import { logger } from "./logger";

export interface ExcelVatImportResult {
  success: boolean;
  importId: number;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  vatUpdatedCount: number;
  priceUpdatedCount: number;
  unmatchedProducts: Array<{
    excelId: string;
    excelCodiceArticolo: string;
    excelDescrizione: string;
    reason: string;
  }>;
  error?: string;
}

interface ExcelRow {
  nomeGruppi: string;
  id: string;
  codiceArticolo: string;
  descrizione: string;
  conf: number;
  prezzoUnit: number;
  prezzoConf: number;
  iva: number;
}

export class ExcelVatImporter {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(__dirname, "../data/products.db");
    this.db = new Database(finalPath);
  }

  /**
   * Import VAT and prices from Excel file
   *
   * @param filePath - Path to Excel file
   * @param uploadedBy - User ID who uploaded the file
   * @param overwritePrices - Whether to overwrite existing prices from Archibald (default: true)
   * @returns Import result with statistics and unmatched products
   */
  async importFromExcel(
    filePath: string,
    uploadedBy?: string,
    overwritePrices: boolean = true,
  ): Promise<ExcelVatImportResult> {
    const filename = path.basename(filePath);
    const uploadedAt = Math.floor(Date.now() / 1000);

    // Create import record
    const importRecord = this.db
      .prepare(
        `
      INSERT INTO excel_vat_imports (
        filename, uploadedAt, uploadedBy, totalRows, matchedRows, unmatchedRows,
        vatUpdatedCount, priceUpdatedCount, status
      ) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 'processing')
    `,
      )
      .run(filename, uploadedAt, uploadedBy || null);

    const importId = importRecord.lastInsertRowid as number;

    try {
      // Parse Excel file
      logger.info(`📊 Parsing Excel file: ${filename}`);
      const workbook = XLSX.readFile(filePath);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Convert to JSON (header row = first row)
      const rawData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
      }) as any[][];

      if (rawData.length < 2) {
        throw new Error("Excel file is empty or has no data rows");
      }

      // Validate headers
      const headers = rawData[0] as string[];
      const requiredColumns = ["ID", "IVA"];
      const missingColumns = requiredColumns.filter(
        (col) => !headers.includes(col),
      );

      if (missingColumns.length > 0) {
        throw new Error(
          `Missing required columns: ${missingColumns.join(", ")}`,
        );
      }

      // Get column indices
      const idxId = headers.indexOf("ID");
      const idxCodiceArticolo = headers.indexOf("Codice Articolo");
      const idxDescrizione = headers.indexOf("Descrizione");
      const idxPrezzoUnit = headers.indexOf("Prezzo di listino unit.");
      const idxIva = headers.indexOf("IVA");

      // Parse data rows
      const excelRows: ExcelRow[] = [];
      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];

        // Skip empty rows
        if (!row[idxId] && !row[idxCodiceArticolo]) {
          continue;
        }

        excelRows.push({
          nomeGruppi: row[0] || "",
          id: row[idxId] ? String(row[idxId]).trim() : "",
          codiceArticolo: row[idxCodiceArticolo]
            ? String(row[idxCodiceArticolo]).trim()
            : "",
          descrizione: row[idxDescrizione]
            ? String(row[idxDescrizione]).trim()
            : "",
          conf: row[4] || 0,
          prezzoUnit:
            idxPrezzoUnit >= 0 ? parseFloat(row[idxPrezzoUnit]) || 0 : 0,
          prezzoConf: parseFloat(row[6]) || 0,
          iva: parseFloat(row[idxIva]) || 0,
        });
      }

      logger.info(`   Found ${excelRows.length} data rows in Excel`);

      // Process each row
      const stats = {
        totalRows: excelRows.length,
        matchedRows: 0,
        unmatchedRows: 0,
        vatUpdatedCount: 0,
        priceUpdatedCount: 0,
      };

      const unmatchedProducts: ExcelVatImportResult["unmatchedProducts"] = [];

      // Prepare statements
      const getProductById = this.db.prepare(`
        SELECT id, name, price, vat, priceSource, vatSource
        FROM products WHERE id = ?
      `);

      const getProductByNormalizedName = this.db.prepare(`
        SELECT id, name, price, vat, priceSource, vatSource
        FROM products
        WHERE REPLACE(REPLACE(REPLACE(LOWER(name), '.', ''), ' ', ''), '-', '') = ?
      `);

      const updateProduct = this.db.prepare(`
        UPDATE products
        SET price = ?, vat = ?, priceSource = ?, vatSource = ?,
            priceUpdatedAt = ?, vatUpdatedAt = ?
        WHERE id = ?
      `);

      const insertPriceChange = this.db.prepare(`
        INSERT INTO price_changes (
          productId, changeType,
          oldPrice, oldVat, oldPriceSource, oldVatSource,
          newPrice, newVat, newPriceSource, newVatSource,
          changedAt, syncSessionId, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'excel_import')
      `);

      // Process in transaction
      const transaction = this.db.transaction(() => {
        for (const excelRow of excelRows) {
          // Match product (Level 1: by ID)
          let product = getProductById.get(excelRow.id) as any;

          // Fallback: Match by Codice Articolo (normalized)
          if (!product && excelRow.codiceArticolo) {
            const normalized = this.normalizeString(excelRow.codiceArticolo);
            product = getProductByNormalizedName.get(normalized) as any;
          }

          if (!product) {
            // Unmatched
            stats.unmatchedRows++;
            unmatchedProducts.push({
              excelId: excelRow.id,
              excelCodiceArticolo: excelRow.codiceArticolo,
              excelDescrizione: excelRow.descrizione,
              reason: "no_match_found",
            });
            continue;
          }

          // Matched!
          stats.matchedRows++;

          // Determine changes
          const oldPrice = product.price;
          const oldVat = product.vat;
          const oldPriceSource = product.priceSource;
          const oldVatSource = product.vatSource;

          const newPrice = overwritePrices ? excelRow.prezzoUnit : oldPrice;
          const newVat = excelRow.iva;
          const now = Math.floor(Date.now() / 1000);

          const priceChanged =
            overwritePrices && newPrice !== oldPrice && newPrice > 0;
          const vatChanged = newVat !== oldVat && newVat > 0;

          if (!priceChanged && !vatChanged) {
            continue; // No changes
          }

          // Determine change type
          let changeType: string;
          if (priceChanged && vatChanged) {
            changeType = "both_updated";
            stats.priceUpdatedCount++;
            stats.vatUpdatedCount++;
          } else if (priceChanged) {
            changeType = "price_updated";
            stats.priceUpdatedCount++;
          } else {
            changeType = "vat_updated";
            stats.vatUpdatedCount++;
          }

          // Update product
          updateProduct.run(
            priceChanged ? newPrice : oldPrice,
            vatChanged ? newVat : oldVat,
            priceChanged ? "excel" : oldPriceSource,
            vatChanged ? "excel" : oldVatSource,
            priceChanged ? now : null,
            vatChanged ? now : null,
            product.id,
          );

          // Create audit log entry
          insertPriceChange.run(
            product.id,
            changeType,
            oldPrice,
            oldVat,
            oldPriceSource,
            oldVatSource,
            priceChanged ? newPrice : oldPrice,
            vatChanged ? newVat : oldVat,
            priceChanged ? "excel" : oldPriceSource,
            vatChanged ? "excel" : oldVatSource,
            now,
            null, // No syncSessionId for Excel imports
          );
        }
      });

      transaction();

      // Update import record
      this.db
        .prepare(
          `
        UPDATE excel_vat_imports
        SET totalRows = ?, matchedRows = ?, unmatchedRows = ?,
            vatUpdatedCount = ?, priceUpdatedCount = ?, status = 'completed'
        WHERE id = ?
      `,
        )
        .run(
          stats.totalRows,
          stats.matchedRows,
          stats.unmatchedRows,
          stats.vatUpdatedCount,
          stats.priceUpdatedCount,
          importId,
        );

      logger.info(`✅ Excel import completed:`);
      logger.info(`   Total rows: ${stats.totalRows}`);
      logger.info(`   Matched: ${stats.matchedRows}`);
      logger.info(`   Unmatched: ${stats.unmatchedRows}`);
      logger.info(`   VAT updated: ${stats.vatUpdatedCount}`);
      logger.info(`   Price updated: ${stats.priceUpdatedCount}`);

      return {
        success: true,
        importId,
        ...stats,
        unmatchedProducts: unmatchedProducts.slice(0, 100), // Limit to first 100
      };
    } catch (error: any) {
      // Update import record as failed
      this.db
        .prepare(
          `
        UPDATE excel_vat_imports
        SET status = 'failed', errorMessage = ?
        WHERE id = ?
      `,
        )
        .run(error.message, importId);

      logger.error(`❌ Excel import failed:`, error);

      return {
        success: false,
        importId,
        totalRows: 0,
        matchedRows: 0,
        unmatchedRows: 0,
        vatUpdatedCount: 0,
        priceUpdatedCount: 0,
        unmatchedProducts: [],
        error: error.message,
      };
    }
  }

  /**
   * Get import history
   */
  getImportHistory(limit: number = 10) {
    return this.db
      .prepare(
        `
      SELECT id, filename, uploadedAt, uploadedBy,
             totalRows, matchedRows, unmatchedRows,
             vatUpdatedCount, priceUpdatedCount, status, errorMessage
      FROM excel_vat_imports
      ORDER BY uploadedAt DESC
      LIMIT ?
    `,
      )
      .all(limit);
  }

  /**
   * Get products without VAT
   */
  getProductsWithoutVat(limit: number = 100) {
    return this.db
      .prepare(
        `
      SELECT id, name, price, vat, priceSource, vatSource
      FROM products
      WHERE vat IS NULL OR vat = 0
      LIMIT ?
    `,
      )
      .all(limit);
  }

  /**
   * Normalize string for matching (remove dots, spaces, dashes, lowercase)
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s/g, "")
      .replace(/-/g, "");
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}
