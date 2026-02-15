import * as XLSX from "xlsx";
import { SubClientDatabase } from "./subclient-db";
import type { SubClient } from "./subclient-db";
import { logger } from "./logger";

export interface SubClientImportResult {
  success: boolean;
  totalRows: number;
  inserted: number;
  updated: number;
  deleted: number;
  unchanged: number;
  error?: string;
}

const EXPECTED_HEADERS: Record<string, keyof SubClient> = {
  codice: "codice",
  "ragione sociale": "ragioneSociale",
  "suppl. ragione sociale": "supplRagioneSociale",
  indirizzo: "indirizzo",
  cap: "cap",
  "località": "localita",
  localita: "localita",
  prov: "prov",
  telefono: "telefono",
  fax: "fax",
  "e-mail": "email",
  email: "email",
  "part. iva": "partitaIva",
  "partita iva": "partitaIva",
  "cod. fiscale": "codFiscale",
  "cod.fiscale": "codFiscale",
  zona: "zona",
  "pers. da contattare": "persDaContattare",
  "e-mail amministraz.": "emailAmministraz",
  "email amministraz": "emailAmministraz",
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim();
}

function trimValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeSubClientCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return trimmed;
  const numericPart = trimmed.startsWith("C") ? trimmed.slice(1) : trimmed;
  if (/^\d+$/.test(numericPart)) {
    return `C${numericPart.padStart(5, "0")}`;
  }
  return trimmed;
}

export function importSubClientsFromExcel(
  filePath: string,
  subClientDb: SubClientDatabase,
): SubClientImportResult {
  try {
    logger.info(`Parsing subclient Excel file: ${filePath}`);
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
    }) as unknown[][];

    if (rawData.length < 2) {
      return {
        success: false,
        totalRows: 0,
        inserted: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        error: "Excel file is empty or has no data rows",
      };
    }

    const headers = (rawData[0] as string[]).map(normalizeHeader);

    const columnMap = new Map<number, keyof SubClient>();
    for (let i = 0; i < headers.length; i++) {
      const mapped = EXPECTED_HEADERS[headers[i]];
      if (mapped) {
        columnMap.set(i, mapped);
      }
    }

    if (![...columnMap.values()].includes("codice")) {
      const codiceIdx = headers.findIndex((h) => h.includes("codice") && !h.includes("fiscale"));
      if (codiceIdx >= 0) {
        columnMap.set(codiceIdx, "codice");
      }
    }

    const hasCodice = [...columnMap.values()].includes("codice");
    const hasRagioneSociale = [...columnMap.values()].includes("ragioneSociale");

    if (!hasCodice || !hasRagioneSociale) {
      return {
        success: false,
        totalRows: 0,
        inserted: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        error: `Missing required columns. Found: ${[...columnMap.values()].join(", ")}. Need: codice, ragioneSociale`,
      };
    }

    const clients: SubClient[] = [];
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const client: Record<string, string> = {};
      for (const [colIdx, field] of columnMap.entries()) {
        client[field] = trimValue(row[colIdx]);
      }

      if (!client.codice) continue;

      clients.push({
        codice: normalizeSubClientCode(client.codice),
        ragioneSociale: client.ragioneSociale || "",
        supplRagioneSociale: client.supplRagioneSociale || undefined,
        indirizzo: client.indirizzo || undefined,
        cap: client.cap || undefined,
        localita: client.localita || undefined,
        prov: client.prov || undefined,
        telefono: client.telefono || undefined,
        fax: client.fax || undefined,
        email: client.email || undefined,
        partitaIva: client.partitaIva || undefined,
        codFiscale: client.codFiscale || undefined,
        zona: client.zona || undefined,
        persDaContattare: client.persDaContattare || undefined,
        emailAmministraz: client.emailAmministraz || undefined,
      });
    }

    logger.info(`Found ${clients.length} subclient rows in Excel`);

    const upsertResult = subClientDb.upsertSubClients(clients);

    const excelCodici = new Set(clients.map((c) => c.codice));
    const dbCodici = subClientDb.getAllCodici();
    const toDelete = dbCodici.filter((c) => !excelCodici.has(c));
    let deleted = 0;
    if (toDelete.length > 0) {
      deleted = subClientDb.deleteByCodici(toDelete);
      logger.info(`Deleted ${deleted} subclients not in new Excel`);
    }

    logger.info(
      `Subclient import completed: ${upsertResult.inserted} inserted, ${upsertResult.updated} updated, ${upsertResult.unchanged} unchanged, ${deleted} deleted`,
    );

    return {
      success: true,
      totalRows: clients.length,
      inserted: upsertResult.inserted,
      updated: upsertResult.updated,
      deleted,
      unchanged: upsertResult.unchanged,
    };
  } catch (error: any) {
    logger.error("Subclient Excel import failed:", error);
    return {
      success: false,
      totalRows: 0,
      inserted: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      error: error.message,
    };
  }
}
