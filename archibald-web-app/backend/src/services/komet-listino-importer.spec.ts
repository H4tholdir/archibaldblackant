import { describe, expect, test, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { calculateDiscountPercent, importKometListino } from './komet-listino-importer';
import type { KometListinoImporterDeps } from './komet-listino-importer';

const KOMET_HEADER = [
  'Nome Gruppi', 'ID', 'Codice Articolo', 'Descrizione', 'Conf.',
  'Prezzo di listino unit.', 'Prezzo di listino conf.',
  'Prezzo KP unit. ', 'Prezzo KP conf.', 'IVA',
];

const mockProduct = {
  id: '001627K0', name: 'Fresa ACC', vat: 22, price: 1.957,
  articleCode: '1.204.005', category: null, unit: null,
};

function buildExcelBuffer(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

function makeDeps(): KometListinoImporterDeps {
  return {
    getProductById: vi.fn().mockResolvedValue(mockProduct),
    findSiblingVariants: vi.fn().mockResolvedValue([]),
    updateProductVat: vi.fn().mockResolvedValue(true),
    updateProductPrice: vi.fn().mockResolvedValue(true),
    recordPriceChange: vi.fn().mockResolvedValue(undefined),
    recordImport: vi.fn().mockResolvedValue({ id: 1 }),
    upsertDiscount: vi.fn().mockResolvedValue(undefined),
  };
}

describe('calculateDiscountPercent', () => {
  test('real Komet value: listino=1.957, kp=0.72409 -> 63', () => {
    expect(calculateDiscountPercent(1.957, 0.72409)).toBe(63);
  });

  test('listino=1.0, kp=0.47 -> 53', () => {
    expect(calculateDiscountPercent(1.0, 0.47)).toBe(53);
  });

  test('listino=1.70, kp=0.629 -> 63 (62.99... rounds to 63)', () => {
    expect(calculateDiscountPercent(1.70, 0.629)).toBe(63);
  });

  test('listino=0, kp=0.5 -> null (zero listino guard)', () => {
    expect(calculateDiscountPercent(0, 0.5)).toBeNull();
  });

  test('listino=-1, kp=0.5 -> null (negative listino guard)', () => {
    expect(calculateDiscountPercent(-1, 0.5)).toBeNull();
  });

  test('ritorna null se kp <= 0 (prezzo KP non valido)', () => {
    expect(calculateDiscountPercent(1.957, 0)).toBeNull();
  });

  test('ritorna null se kp > listino (sconto negativo non valido)', () => {
    expect(calculateDiscountPercent(1.0, 1.5)).toBeNull();
  });
});

describe('importKometListino', () => {
  test('row with valid listino and kp: scontiUpdated=1, upsertDiscount called with correct args', async () => {
    const buffer = buildExcelBuffer([
      KOMET_HEADER,
      ['Utensili', '001627K0', '1.204.005', 'Fresa ACC', '10pz', 1.957, 19.57, 0.72409, 7.2409, 22],
    ]);
    const deps = makeDeps();

    const result = await importKometListino(buffer, 'komet.xlsx', 'user1', deps);

    expect(result.scontiUpdated).toBe(1);
    expect(deps.upsertDiscount).toHaveBeenCalledWith('001627K0', '1.204.005', 63, 0.72409);
  });

  test('row with null listino and null kp: scontiUpdated=0, upsertDiscount not called', async () => {
    const buffer = buildExcelBuffer([
      KOMET_HEADER,
      ['Utensili', '001627K0', '1.204.005', 'Fresa ACC', '10pz', null, null, null, null, 22],
    ]);
    const deps = makeDeps();

    const result = await importKometListino(buffer, 'komet.xlsx', 'user1', deps);

    expect(result.scontiUpdated).toBe(0);
    expect(deps.upsertDiscount).not.toHaveBeenCalled();
  });

  test('row with listino=0 and kp=0: scontiUpdated=0, upsertDiscount not called', async () => {
    const buffer = buildExcelBuffer([
      KOMET_HEADER,
      ['Utensili', '001627K0', '1.204.005', 'Fresa ACC', '10pz', 0, 0, 0, 0, 22],
    ]);
    const deps = makeDeps();

    const result = await importKometListino(buffer, 'komet.xlsx', 'user1', deps);

    expect(result.scontiUpdated).toBe(0);
    expect(deps.upsertDiscount).not.toHaveBeenCalled();
  });

  test('invalid (non-Excel) buffer: returns zeroed result', async () => {
    const buffer = Buffer.from('this is not an excel file at all');
    const deps = makeDeps();

    const result = await importKometListino(buffer, 'bad.xlsx', 'user1', deps);

    expect(result).toEqual(expect.objectContaining({
      totalRows: 0,
      ivaUpdated: 0,
      scontiUpdated: 0,
    }));
    expect(deps.upsertDiscount).not.toHaveBeenCalled();
  });

  test('truncated ZIP buffer that XLSX rejects: errors contain parse message', async () => {
    const truncatedZip = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const deps = makeDeps();

    const result = await importKometListino(truncatedZip, 'bad.xlsx', 'user1', deps);

    expect(result).toEqual(expect.objectContaining({
      totalRows: 0,
      ivaUpdated: 0,
      scontiUpdated: 0,
      errors: expect.arrayContaining([expect.stringMatching(/Errore lettura file Excel/i)]),
    }));
  });
});
