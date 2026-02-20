import * as XLSX from "xlsx";
import { logger } from "./logger";

type PriceExcelRow = {
  productId: string;
  price: number | null;
  vat: number | null;
};

type PriceExcelParseResult = {
  rows: PriceExcelRow[];
  totalRows: number;
  errors: string[];
};

function parsePriceExcel(buffer: Buffer): PriceExcelParseResult | null {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const rows: PriceExcelRow[] = [];
    const errors: string[] = [];

    if (workbook.SheetNames.length === 0) {
      return { rows: [], totalRows: 0, errors: ["File Excel vuoto"] };
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: "",
    });

    logger.info("Parsing price Excel file", {
      sheet: sheetName,
      rows: data.length,
    });

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2;

      try {
        const productId = String(
          row["Codice"] ??
            row["codice"] ??
            row["Codice Articolo"] ??
            row["codice articolo"] ??
            row["ID"] ??
            row["id"] ??
            row["ItemId"] ??
            row["itemId"] ??
            "",
        ).trim();

        if (!productId) {
          errors.push(`Riga ${rowNum}: codice prodotto mancante`);
          continue;
        }

        const rawVat =
          row["IVA"] ??
          row["iva"] ??
          row["Iva"] ??
          row["VAT"] ??
          row["vat"] ??
          row["Aliquota IVA"] ??
          row["aliquota iva"] ??
          null;

        const rawPrice =
          row["Prezzo"] ??
          row["prezzo"] ??
          row["Price"] ??
          row["price"] ??
          row["Prezzo Unitario"] ??
          row["prezzo unitario"] ??
          null;

        const vat = rawVat !== null && rawVat !== "" ? Number(rawVat) : null;
        const price =
          rawPrice !== null && rawPrice !== "" ? Number(rawPrice) : null;

        if (vat !== null && isNaN(vat)) {
          errors.push(`Riga ${rowNum}: valore IVA non valido "${rawVat}"`);
          continue;
        }

        if (price !== null && isNaN(price)) {
          errors.push(
            `Riga ${rowNum}: valore prezzo non valido "${rawPrice}"`,
          );
          continue;
        }

        rows.push({ productId, price, vat });
      } catch (error) {
        errors.push(
          `Riga ${rowNum}: errore parsing - ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    logger.info("Price Excel file parsed", {
      totalRows: rows.length,
      errors: errors.length,
    });

    return { rows, totalRows: data.length, errors };
  } catch (error) {
    logger.error("Failed to parse price Excel file", { error });
    return null;
  }
}

export { parsePriceExcel, type PriceExcelRow, type PriceExcelParseResult };
