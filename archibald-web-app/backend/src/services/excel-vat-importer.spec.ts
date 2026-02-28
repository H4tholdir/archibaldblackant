import { describe, expect, test, vi } from 'vitest';
import * as XLSX from 'xlsx';
import type { ImportVatDeps } from './excel-vat-importer';
import { parseVatValue, importExcelVat } from './excel-vat-importer';
import type { ProductRow } from '../db/repositories/products';

function createTestExcelBuffer(headers: string[], rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

function makeProduct(overrides: Partial<ProductRow> & { id: string }): ProductRow {
  return {
    name: overrides.id,
    description: null,
    group_code: null,
    search_name: null,
    price_unit: null,
    product_group_id: null,
    product_group_description: null,
    package_content: null,
    min_qty: null,
    multiple_qty: null,
    max_qty: null,
    price: null,
    price_source: null,
    price_updated_at: null,
    vat: null,
    vat_source: null,
    vat_updated_at: null,
    image_url: null,
    image_local_path: null,
    image_downloaded_at: null,
    deleted_at: null,
    hash: 'abc',
    last_sync: 0,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<ImportVatDeps> = {}): ImportVatDeps {
  return {
    getProductById: vi.fn().mockResolvedValue(undefined),
    findSiblingVariants: vi.fn().mockResolvedValue([]),
    updateProductVat: vi.fn().mockResolvedValue(true),
    updateProductPrice: vi.fn().mockResolvedValue(true),
    recordPriceChange: vi.fn().mockResolvedValue(undefined),
    recordImport: vi.fn().mockResolvedValue({ id: 1, filename: '', uploadedBy: '', uploadedAt: '', totalRows: 0, matched: 0, unmatched: 0, vatUpdated: 0, priceUpdated: 0, status: '' }),
    ...overrides,
  };
}

describe('parseVatValue', () => {
  test('parses integer number: 22 -> 22', () => {
    expect(parseVatValue(22)).toBe(22);
  });

  test('parses string number: "22" -> 22', () => {
    expect(parseVatValue('22')).toBe(22);
  });

  test('parses Italian comma format: "22,00" -> 22', () => {
    expect(parseVatValue('22,00')).toBe(22);
  });

  test('parses percentage string: "22%" -> 22', () => {
    expect(parseVatValue('22%')).toBe(22);
  });

  test('parses decimal number: 10.5 -> 10.5', () => {
    expect(parseVatValue(10.5)).toBe(10.5);
  });

  test('parses Italian comma decimal: "4,00" -> 4', () => {
    expect(parseVatValue('4,00')).toBe(4);
  });

  test('returns null for null', () => {
    expect(parseVatValue(null)).toBeNull();
  });

  test('returns null for undefined', () => {
    expect(parseVatValue(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseVatValue('')).toBeNull();
  });

  test('returns null for non-numeric string: "abc"', () => {
    expect(parseVatValue('abc')).toBeNull();
  });

  test('returns null for whitespace-only string', () => {
    expect(parseVatValue('   ')).toBeNull();
  });

  test('parses zero: 0 -> 0', () => {
    expect(parseVatValue(0)).toBe(0);
  });

  test('parses string zero: "0" -> 0', () => {
    expect(parseVatValue('0')).toBe(0);
  });
});

describe('importExcelVat', () => {
  const standardHeaders = ['Codice', 'IVA'];
  const headersWithPrice = ['Codice', 'IVA', 'Prezzo'];

  test('happy path: 3 rows, all found, VAT changed on 2 -> matched:3, unmatched:0', async () => {
    const productA = makeProduct({ id: 'A001', vat: 10 });
    const productB = makeProduct({ id: 'B002', vat: 10 });
    const productC = makeProduct({ id: 'C003', vat: 22 });

    const buffer = createTestExcelBuffer(standardHeaders, [
      ['A001', 22],
      ['B002', 22],
      ['C003', 22],
    ]);

    const deps = createMockDeps({
      getProductById: vi.fn()
        .mockResolvedValueOnce(productA)
        .mockResolvedValueOnce(productB)
        .mockResolvedValueOnce(productC),
      findSiblingVariants: vi.fn().mockResolvedValue([]),
    });

    const result = await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(result).toEqual({ totalRows: 3, matched: 3, unmatched: 0, vatUpdated: 2, errors: [] });
    expect(deps.updateProductVat).toHaveBeenCalledTimes(2);
    expect(deps.recordImport).toHaveBeenCalledTimes(1);
  });

  test('product not found: unmatched incremented, error message added', async () => {
    const buffer = createTestExcelBuffer(standardHeaders, [
      ['UNKNOWN', 22],
    ]);

    const deps = createMockDeps({
      getProductById: vi.fn().mockResolvedValue(undefined),
    });

    const result = await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(result).toEqual({
      totalRows: 1,
      matched: 0,
      unmatched: 1,
      vatUpdated: 0,
      errors: [expect.stringContaining('UNKNOWN')],
    });
    expect(deps.updateProductVat).not.toHaveBeenCalled();
  });

  test('VAT unchanged: product matched but no update call', async () => {
    const product = makeProduct({ id: 'A001', vat: 22 });

    const buffer = createTestExcelBuffer(standardHeaders, [
      ['A001', 22],
    ]);

    const deps = createMockDeps({
      getProductById: vi.fn().mockResolvedValue(product),
    });

    const result = await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(result).toEqual({ totalRows: 1, matched: 1, unmatched: 0, vatUpdated: 0, errors: [] });
    expect(deps.updateProductVat).not.toHaveBeenCalled();
    expect(deps.recordPriceChange).not.toHaveBeenCalled();
  });

  test('sibling propagation: VAT change on ABC123K propagates to ABC123 and ABC123R', async () => {
    const productK = makeProduct({ id: 'ABC123K', vat: 10 });
    const productBase = makeProduct({ id: 'ABC123', vat: 10 });
    const productR = makeProduct({ id: 'ABC123R', vat: 10 });

    const buffer = createTestExcelBuffer(standardHeaders, [
      ['ABC123K', 22],
    ]);

    const deps = createMockDeps({
      getProductById: vi.fn().mockResolvedValue(productK),
      findSiblingVariants: vi.fn().mockResolvedValue([productK, productBase, productR]),
    });

    const result = await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(result).toEqual({ totalRows: 1, matched: 1, unmatched: 0, vatUpdated: 1, errors: [] });
    expect(deps.updateProductVat).toHaveBeenCalledTimes(3);
    expect(deps.updateProductVat).toHaveBeenCalledWith('ABC123K', 22, 'excel-import');
    expect(deps.updateProductVat).toHaveBeenCalledWith('ABC123', 22, 'excel-import-propagated');
    expect(deps.updateProductVat).toHaveBeenCalledWith('ABC123R', 22, 'excel-import-propagated');
  });

  test('price column present: updateProductPrice called when price changed', async () => {
    const product = makeProduct({ id: 'A001', vat: 22, price: 10 });

    const buffer = createTestExcelBuffer(headersWithPrice, [
      ['A001', 22, 15],
    ]);

    const deps = createMockDeps({
      getProductById: vi.fn().mockResolvedValue(product),
    });

    const result = await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(result).toEqual({ totalRows: 1, matched: 1, unmatched: 0, vatUpdated: 0, errors: [] });
    expect(deps.updateProductPrice).toHaveBeenCalledWith('A001', 15, 22, 'excel-import', 'excel-import');
  });

  test('price column absent: only VAT updates, no price updates', async () => {
    const product = makeProduct({ id: 'A001', vat: 10 });

    const buffer = createTestExcelBuffer(standardHeaders, [
      ['A001', 22],
    ]);

    const deps = createMockDeps({
      getProductById: vi.fn().mockResolvedValue(product),
      findSiblingVariants: vi.fn().mockResolvedValue([]),
    });

    const result = await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(result.matched).toBe(1);
    expect(deps.updateProductVat).toHaveBeenCalledTimes(1);
    expect(deps.updateProductPrice).not.toHaveBeenCalled();
  });

  test('empty Excel: no data rows -> all counters zero', async () => {
    const buffer = createTestExcelBuffer(standardHeaders, []);

    const deps = createMockDeps();

    const result = await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(result).toEqual({ totalRows: 0, matched: 0, unmatched: 0, vatUpdated: 0, errors: [] });
    expect(deps.getProductById).not.toHaveBeenCalled();
  });

  test('invalid buffer: missing required columns produces column error', async () => {
    const invalidBuffer = Buffer.from('this is not an excel file');

    const deps = createMockDeps();

    const result = await importExcelVat(invalidBuffer, 'bad.xlsx', 'user1', deps);

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/Codice|Product ID|IVA|VAT/);
    expect(result.totalRows).toBe(0);
    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(0);
  });

  test('missing required IVA column: errors contains column error', async () => {
    const buffer = createTestExcelBuffer(['Codice', 'Nome'], [
      ['A001', 'Product A'],
    ]);

    const deps = createMockDeps();

    const result = await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/IVA|VAT|iva|vat/i);
    expect(result.totalRows).toBe(0);
  });

  test('missing required product ID column: errors contains column error', async () => {
    const buffer = createTestExcelBuffer(['IVA', 'Nome'], [
      [22, 'Product A'],
    ]);

    const deps = createMockDeps();

    const result = await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/codice|product|ID/i);
    expect(result.totalRows).toBe(0);
  });

  test('audit trail: recordPriceChange called with source "excel-vat-import" for VAT change', async () => {
    const product = makeProduct({ id: 'A001', vat: 10, name: 'Product A' });

    const buffer = createTestExcelBuffer(standardHeaders, [
      ['A001', 22],
    ]);

    const deps = createMockDeps({
      getProductById: vi.fn().mockResolvedValue(product),
      findSiblingVariants: vi.fn().mockResolvedValue([]),
    });

    await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(deps.recordPriceChange).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'A001',
        productName: 'Product A',
        source: 'excel-vat-import',
      }),
    );
  });

  test('audit trail for siblings: recordPriceChange with source "excel-import-propagated"', async () => {
    const productK = makeProduct({ id: 'ABC123K', vat: 10, name: 'ABC123K' });
    const productBase = makeProduct({ id: 'ABC123', vat: 10, name: 'ABC123' });

    const buffer = createTestExcelBuffer(standardHeaders, [
      ['ABC123K', 22],
    ]);

    const deps = createMockDeps({
      getProductById: vi.fn().mockResolvedValue(productK),
      findSiblingVariants: vi.fn().mockResolvedValue([productK, productBase]),
    });

    await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    const calls = (deps.recordPriceChange as ReturnType<typeof vi.fn>).mock.calls;
    const siblingCall = calls.find(
      (c: unknown[]) => (c[0] as { productId: string }).productId === 'ABC123',
    );
    expect(siblingCall).toBeDefined();
    expect((siblingCall![0] as { source: string }).source).toBe('excel-import-propagated');
  });

  test('recordImport called with correct stats after processing', async () => {
    const productA = makeProduct({ id: 'A001', vat: 10 });

    const buffer = createTestExcelBuffer(standardHeaders, [
      ['A001', 22],
      ['MISSING', 22],
    ]);

    const deps = createMockDeps({
      getProductById: vi.fn()
        .mockResolvedValueOnce(productA)
        .mockResolvedValueOnce(undefined),
      findSiblingVariants: vi.fn().mockResolvedValue([]),
    });

    await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(deps.recordImport).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'test.xlsx',
        uploadedBy: 'user1',
        totalRows: 2,
        matched: 1,
        unmatched: 1,
        status: 'completed_with_errors',
      }),
    );
  });

  test('row with empty productId is counted as unmatched', async () => {
    const buffer = createTestExcelBuffer(standardHeaders, [
      ['', 22],
      [null, 22],
    ]);

    const deps = createMockDeps();

    const result = await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(result.unmatched).toBe(2);
    expect(result.matched).toBe(0);
    expect(deps.getProductById).not.toHaveBeenCalled();
  });

  test('price column with Italian comma format: "15,50" parsed as 15.5', async () => {
    const product = makeProduct({ id: 'A001', vat: 22, price: 10 });

    const buffer = createTestExcelBuffer(headersWithPrice, [
      ['A001', 22, '15,50'],
    ]);

    const deps = createMockDeps({
      getProductById: vi.fn().mockResolvedValue(product),
    });

    await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(deps.updateProductPrice).toHaveBeenCalledWith('A001', 15.5, 22, 'excel-import', 'excel-import');
  });

  test('header variations are mapped case-insensitively: "codice articolo", "iva %"', async () => {
    const product = makeProduct({ id: 'X001', vat: 10 });

    const buffer = createTestExcelBuffer(['CODICE ARTICOLO', 'IVA %'], [
      ['X001', 22],
    ]);

    const deps = createMockDeps({
      getProductById: vi.fn().mockResolvedValue(product),
      findSiblingVariants: vi.fn().mockResolvedValue([]),
    });

    const result = await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(result).toEqual({ totalRows: 1, matched: 1, unmatched: 0, vatUpdated: 1, errors: [] });
    expect(deps.updateProductVat).toHaveBeenCalledWith('X001', 22, 'excel-import');
  });

  test('price unchanged: no updateProductPrice call', async () => {
    const product = makeProduct({ id: 'A001', vat: 22, price: 15 });

    const buffer = createTestExcelBuffer(headersWithPrice, [
      ['A001', 22, 15],
    ]);

    const deps = createMockDeps({
      getProductById: vi.fn().mockResolvedValue(product),
    });

    await importExcelVat(buffer, 'test.xlsx', 'user1', deps);

    expect(deps.updateProductPrice).not.toHaveBeenCalled();
  });
});
