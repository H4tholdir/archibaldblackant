import * as XLSX from 'xlsx';
import type { ProductRow } from '../db/repositories/products';
import type { PriceHistoryInsert } from '../db/repositories/prices-history';
import type { RecordImportInput, ExcelVatImport } from '../db/repositories/excel-vat-imports';

type ImportVatDeps = {
  getProductById: (id: string) => Promise<ProductRow | undefined>;
  findSiblingVariants: (productId: string) => Promise<ProductRow[]>;
  updateProductVat: (productId: string, vat: number, vatSource: string) => Promise<boolean>;
  updateProductPrice: (productId: string, price: number, vat: number | null, priceSource: string, vatSource: string | null) => Promise<boolean>;
  recordPriceChange: (data: PriceHistoryInsert) => Promise<void>;
  recordImport: (data: RecordImportInput) => Promise<ExcelVatImport>;
};

type ImportVatResult = {
  totalRows: number;
  matched: number;
  unmatched: number;
  errors: string[];
};

type HeaderMap = Record<string, string[]>;

const HEADER_VARIATIONS: HeaderMap = {
  productId: ['ID', 'Id', 'id', 'Product ID', 'Codice', 'CODICE', 'Codice Articolo', 'CODICE ARTICOLO'],
  vat: ['IVA', 'Iva', 'iva', 'IVA %', 'IVA%', 'VAT', 'Aliquota IVA'],
  price: ['Prezzo', 'PREZZO', 'Price', 'Prezzo Unitario', 'PREZZO UNITARIO'],
};

function buildHeaderLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [canonical, variations] of Object.entries(HEADER_VARIATIONS)) {
    for (const variation of variations) {
      lookup.set(variation.trim().toLowerCase(), canonical);
    }
  }
  return lookup;
}

const HEADER_LOOKUP = buildHeaderLookup();

function mapHeaders(sheetHeaders: string[]): Map<string, number> {
  const columnMap = new Map<string, number>();
  for (let i = 0; i < sheetHeaders.length; i++) {
    const header = (sheetHeaders[i] ?? '').trim().toLowerCase();
    const canonical = HEADER_LOOKUP.get(header);
    if (canonical && !columnMap.has(canonical)) {
      columnMap.set(canonical, i);
    }
  }
  return columnMap;
}

function parseVatValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed === '') return null;

  const cleaned = trimmed.replace(/%$/, '').replace(',', '.').trim();
  if (cleaned === '') return null;

  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

function parsePriceValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed === '') return null;

  const cleaned = trimmed.replace(/[^\d.,-]/g, '').replace(',', '.').trim();
  if (cleaned === '') return null;

  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

function computeChangeType(oldVat: number | null, newVat: number): 'increase' | 'decrease' | 'new' {
  if (oldVat == null) return 'new';
  if (newVat > oldVat) return 'increase';
  return 'decrease';
}

async function importExcelVat(
  buffer: Buffer,
  filename: string,
  userId: string,
  deps: ImportVatDeps,
): Promise<ImportVatResult> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (err) {
    return {
      totalRows: 0,
      matched: 0,
      unmatched: 0,
      errors: [`Errore lettura file Excel: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { totalRows: 0, matched: 0, unmatched: 0, errors: ['File Excel senza fogli'] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rawData.length < 1) {
    return { totalRows: 0, matched: 0, unmatched: 0, errors: [] };
  }

  const headerRow = rawData[0] as string[];
  const columnMap = mapHeaders(headerRow);

  if (!columnMap.has('productId')) {
    return { totalRows: 0, matched: 0, unmatched: 0, errors: ['Colonna Codice/Product ID non trovata nel file Excel'] };
  }

  if (!columnMap.has('vat')) {
    return { totalRows: 0, matched: 0, unmatched: 0, errors: ['Colonna IVA/VAT non trovata nel file Excel'] };
  }

  const productIdCol = columnMap.get('productId')!;
  const vatCol = columnMap.get('vat')!;
  const priceCol = columnMap.has('price') ? columnMap.get('price')! : null;

  const dataRows = rawData.slice(1);
  const totalRows = dataRows.length;
  let matched = 0;
  let unmatched = 0;
  let vatUpdated = 0;
  let priceUpdated = 0;
  const errors: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] as unknown[];
    const rawProductId = row[productIdCol];
    const productId = rawProductId != null ? String(rawProductId).trim() : '';

    if (!productId) {
      unmatched++;
      continue;
    }

    const newVat = parseVatValue(row[vatCol]);
    if (newVat === null) {
      errors.push(`Riga ${i + 2}: valore IVA non valido per prodotto '${productId}'`);
      unmatched++;
      continue;
    }

    const product = await deps.getProductById(productId);
    if (!product) {
      errors.push(`Riga ${i + 2}: prodotto '${productId}' non trovato`);
      unmatched++;
      continue;
    }

    if (product.vat !== newVat) {
      await deps.updateProductVat(productId, newVat, 'excel-import');

      const changeType = computeChangeType(product.vat, newVat);
      await deps.recordPriceChange({
        productId,
        productName: product.name,
        oldPrice: product.vat != null ? String(product.vat) : null,
        newPrice: String(newVat),
        oldPriceNumeric: product.vat,
        newPriceNumeric: newVat,
        changeType,
        source: 'excel-vat-import',
      });

      const siblings = await deps.findSiblingVariants(productId);
      for (const sibling of siblings) {
        if (sibling.id !== productId) {
          await deps.updateProductVat(sibling.id, newVat, 'excel-import-propagated');

          const siblingChangeType = computeChangeType(sibling.vat, newVat);
          await deps.recordPriceChange({
            productId: sibling.id,
            productName: sibling.name,
            oldPrice: sibling.vat != null ? String(sibling.vat) : null,
            newPrice: String(newVat),
            oldPriceNumeric: sibling.vat,
            newPriceNumeric: newVat,
            changeType: siblingChangeType,
            source: 'excel-import-propagated',
          });
        }
      }

      vatUpdated++;
    }

    if (priceCol !== null) {
      const newPrice = parsePriceValue(row[priceCol]);
      if (newPrice !== null && product.price !== newPrice) {
        await deps.updateProductPrice(productId, newPrice, newVat, 'excel-import', 'excel-import');

        const priceChangeType = computeChangeType(product.price, newPrice);
        await deps.recordPriceChange({
          productId,
          productName: product.name,
          oldPrice: product.price != null ? String(product.price) : null,
          newPrice: String(newPrice),
          oldPriceNumeric: product.price,
          newPriceNumeric: newPrice,
          changeType: priceChangeType,
          source: 'excel-import',
        });

        priceUpdated++;
      }
    }

    matched++;
  }

  await deps.recordImport({
    filename,
    uploadedBy: userId,
    totalRows,
    matched,
    unmatched,
    vatUpdated,
    priceUpdated,
    status: errors.length > 0 ? 'completed_with_errors' : 'completed',
  });

  return { totalRows, matched, unmatched, errors };
}

export { importExcelVat, parseVatValue };
export type { ImportVatDeps, ImportVatResult };
