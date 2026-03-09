import * as XLSX from 'xlsx';
import { importExcelVat } from './excel-vat-importer';
import type { ImportVatDeps } from './excel-vat-importer';

type UpsertDiscountFn = (
  id: string,
  articleCode: string,
  discountPercent: number,
  kpPriceUnit: number | null,
) => Promise<void>;

type KometListinoImporterDeps = ImportVatDeps & {
  upsertDiscount: UpsertDiscountFn;
};

type KometListinoResult = {
  totalRows: number;
  ivaUpdated: number;
  scontiUpdated: number;
  unmatched: number;
  unmatchedProducts: Array<{ excelId: string; excelCodiceArticolo: string; reason: string }>;
  errors: string[];
};

function calculateDiscountPercent(listino: number, kp: number): number | null {
  if (listino <= 0) return null;
  if (kp > listino) return null;
  return Math.round((1 - kp / listino) * 100);
}

function parseNumericCell(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(',', '.');
  if (cleaned === '') return null;
  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

function findColumnIndex(headers: string[], target: string): number {
  const normalised = target.trim().toLowerCase();
  return headers.findIndex(h => (h ?? '').trim().toLowerCase() === normalised);
}

async function importKometListino(
  buffer: Buffer,
  filename: string,
  userId: string,
  deps: KometListinoImporterDeps,
): Promise<KometListinoResult> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (err) {
    return {
      totalRows: 0,
      ivaUpdated: 0,
      scontiUpdated: 0,
      unmatched: 0,
      unmatchedProducts: [],
      errors: [`Errore lettura file Excel: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      totalRows: 0,
      ivaUpdated: 0,
      scontiUpdated: 0,
      unmatched: 0,
      unmatchedProducts: [],
      errors: ['File Excel senza fogli'],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rawData.length < 2) {
    return {
      totalRows: 0,
      ivaUpdated: 0,
      scontiUpdated: 0,
      unmatched: 0,
      unmatchedProducts: [],
      errors: [],
    };
  }

  const headerRow = (rawData[0] as string[]).map(h => String(h ?? ''));
  const idCol = findColumnIndex(headerRow, 'id');
  const codiceArticoloCol = findColumnIndex(headerRow, 'codice articolo');
  const listinoCol = findColumnIndex(headerRow, 'prezzo di listino unit.');
  const kpCol = findColumnIndex(headerRow, 'prezzo kp unit.');

  if (idCol === -1 || listinoCol === -1 || kpCol === -1) {
    return {
      totalRows: 0,
      ivaUpdated: 0,
      scontiUpdated: 0,
      unmatched: 0,
      unmatchedProducts: [],
      errors: ['Colonne richieste non trovate (ID, Prezzo di listino unit., Prezzo KP unit.)'],
    };
  }

  const vatResult = await importExcelVat(buffer, filename, userId, deps);

  const dataRows = rawData.slice(1);
  let scontiUpdated = 0;
  const unmatchedProducts: Array<{ excelId: string; excelCodiceArticolo: string; reason: string }> = [];
  const errors: string[] = [...vatResult.errors];

  for (const row of dataRows as unknown[][]) {
    const rawId = row[idCol];
    const excelId = rawId != null ? String(rawId).trim() : '';
    const rawCodice = codiceArticoloCol !== -1 ? row[codiceArticoloCol] : null;
    const excelCodiceArticolo = rawCodice != null ? String(rawCodice).trim() : '';

    if (!excelId) continue;

    const listino = parseNumericCell(row[listinoCol]);
    const kp = parseNumericCell(row[kpCol]);

    if (listino === null || kp === null) {
      unmatchedProducts.push({ excelId, excelCodiceArticolo, reason: 'prezzi mancanti o non validi' });
      continue;
    }

    const discountPercent = calculateDiscountPercent(listino, kp);
    if (discountPercent === null) {
      unmatchedProducts.push({ excelId, excelCodiceArticolo, reason: 'prezzo KP superiore al prezzo di listino' });
      continue;
    }

    await deps.upsertDiscount(excelId, excelCodiceArticolo, discountPercent, kp);
    scontiUpdated++;
  }

  return {
    totalRows: vatResult.totalRows,
    ivaUpdated: vatResult.vatUpdated,
    scontiUpdated,
    unmatched: vatResult.unmatched,
    unmatchedProducts,
    errors,
  };
}

export { calculateDiscountPercent, importKometListino };
export type { KometListinoImporterDeps, KometListinoResult };
