import * as XLSX from "xlsx";
import { logger } from "./logger";

export interface WarehouseItem {
  articleCode: string; // Da colonna "Codice Corretto"
  description: string; // Da colonna "Descrizione"
  quantity: number; // Da colonna "quantità"
  boxName: string; // Nome del foglio (es: "SCATOLO 1")
}

export interface WarehouseParseResult {
  items: WarehouseItem[];
  totalItems: number;
  totalQuantity: number;
  boxesCount: number;
  errors: string[];
}

/**
 * Parse Excel warehouse file
 *
 * CURRENT FORMAT (Phase 1):
 * - Reads "Codice Corretto", "Descrizione", "quantità" from Excel
 * - Each sheet = one box (scatolo)
 *
 * TODO FUTURE (Phase 2 - Auto-correction):
 * 1. User will upload Excel with ONLY "codice manuale" + "quantità"
 * 2. System will:
 *    - Match "codice manuale" against products DB (fuzzy matching)
 *    - Generate "Codice Corretto" (corrected code if typos found)
 *    - Generate "Descrizione" from matched product
 *    - Flag items that couldn't be matched for manual review
 * 3. AI-powered typo correction using product database
 */
export function parseWarehouseFile(
  buffer: Buffer,
): WarehouseParseResult | null {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const items: WarehouseItem[] = [];
    const errors: string[] = [];
    let totalQuantity = 0;

    logger.info("📊 Parsing warehouse file", {
      sheets: workbook.SheetNames.length,
      sheetNames: workbook.SheetNames,
    });

    // Parse each sheet (each sheet = one box/scatolo)
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        worksheet,
        {
          defval: "",
        },
      );

      logger.debug(`Processing sheet: ${sheetName}`, { rows: data.length });

      // Parse each row
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2; // Excel row number (header = 1, data starts at 2)

        try {
          // Extract fields (handle case-insensitive column names)
          const articleCode = String(
            row["Codice Corretto"] || row["codice corretto"] || "",
          ).trim();
          const description = String(
            row["Descrizione"] || row["descrizione"] || "",
          ).trim();
          const quantity = Number(row["quantità"] || row["Quantità"] || 0);

          // Validate
          if (!articleCode) {
            errors.push(
              `${sheetName} row ${rowNum}: Missing "Codice Corretto"`,
            );
            continue;
          }

          if (!quantity || quantity <= 0) {
            errors.push(
              `${sheetName} row ${rowNum}: Invalid quantity "${row["quantità"]}"`,
            );
            continue;
          }

          // Add valid item
          items.push({
            articleCode,
            description,
            quantity,
            boxName: sheetName,
          });

          totalQuantity += quantity;
        } catch (error) {
          errors.push(
            `${sheetName} row ${rowNum}: Parse error - ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    logger.info("✅ Warehouse file parsed", {
      totalItems: items.length,
      totalQuantity,
      boxesCount: workbook.SheetNames.length,
      errors: errors.length,
    });

    return {
      items,
      totalItems: items.length,
      totalQuantity,
      boxesCount: workbook.SheetNames.length,
      errors,
    };
  } catch (error) {
    logger.error("❌ Failed to parse warehouse file", { error });
    return null;
  }
}

/**
 * Validate warehouse Excel format
 * Returns error message if invalid, null if valid
 */
export function validateWarehouseFormat(buffer: Buffer): string | null {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    if (workbook.SheetNames.length === 0) {
      return "File Excel vuoto (nessun foglio trovato)";
    }

    // Check first sheet has required columns
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
      defval: "",
    });

    if (data.length === 0) {
      return "Il primo foglio è vuoto";
    }

    const firstRow = data[0];
    const hasArticleCode =
      "Codice Corretto" in firstRow || "codice corretto" in firstRow;
    const hasQuantity = "quantità" in firstRow || "Quantità" in firstRow;

    if (!hasArticleCode) {
      return 'Colonna "Codice Corretto" non trovata';
    }

    if (!hasQuantity) {
      return 'Colonna "quantità" non trovata';
    }

    return null; // Valid
  } catch (error) {
    return `Errore validazione: ${error instanceof Error ? error.message : String(error)}`;
  }
}
