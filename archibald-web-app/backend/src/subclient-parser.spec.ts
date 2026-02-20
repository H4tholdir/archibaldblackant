import * as XLSX from 'xlsx';
import { describe, expect, test } from 'vitest';
import { parseSubclientsExcel } from './subclient-parser';

function buildExcelBuffer(
  rows: Record<string, unknown>[],
  sheetName = 'Sheet1',
): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

describe('parseSubclientsExcel', () => {
  test('parses valid Excel with typical columns', () => {
    const rows = [
      {
        Codice: '123',
        'Ragione Sociale': 'Acme Srl',
        Indirizzo: 'Via Roma 1',
        CAP: '20100',
        'Località': 'Milano',
        Prov: 'MI',
        Telefono: '02-1234567',
        Fax: '02-7654321',
        Email: 'info@acme.it',
        'Partita Iva': '01234567890',
        'Cod Fiscale': 'ABCDEF01G23H456I',
        Zona: 'Nord',
        'Pers da contattare': 'Mario Rossi',
        'Email amministraz': 'admin@acme.it',
        'Suppl Ragione Sociale': 'Acme International',
      },
      {
        Codice: '456',
        'Ragione Sociale': 'Beta SpA',
        Indirizzo: 'Via Verdi 10',
        CAP: '10100',
        'Località': 'Torino',
        Prov: 'TO',
      },
    ];

    const result = parseSubclientsExcel(buildExcelBuffer(rows));

    expect(result.totalRows).toBe(2);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.subclients).toEqual([
      {
        codice: 'C00123',
        ragioneSociale: 'Acme Srl',
        supplRagioneSociale: 'Acme International',
        indirizzo: 'Via Roma 1',
        cap: '20100',
        localita: 'Milano',
        prov: 'MI',
        telefono: '02-1234567',
        fax: '02-7654321',
        email: 'info@acme.it',
        partitaIva: '01234567890',
        codFiscale: 'ABCDEF01G23H456I',
        zona: 'Nord',
        persDaContattare: 'Mario Rossi',
        emailAmministraz: 'admin@acme.it',
      },
      {
        codice: 'C00456',
        ragioneSociale: 'Beta SpA',
        supplRagioneSociale: null,
        indirizzo: 'Via Verdi 10',
        cap: '10100',
        localita: 'Torino',
        prov: 'TO',
        telefono: null,
        fax: null,
        email: null,
        partitaIva: null,
        codFiscale: null,
        zona: null,
        persDaContattare: null,
        emailAmministraz: null,
      },
    ]);
  });

  test('handles header variations (case-insensitive, extra spaces)', () => {
    const rows = [
      {
        codice: 'C00100',
        'ragione sociale': 'Gamma Srl',
        INDIRIZZO: 'Piazza Duomo 5',
        cap: '30100',
        citta: 'Venezia',
        provincia: 'VE',
        tel: '041-555666',
      },
    ];

    const result = parseSubclientsExcel(buildExcelBuffer(rows));

    expect(result.imported).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.subclients[0]).toEqual({
      codice: 'C00100',
      ragioneSociale: 'Gamma Srl',
      supplRagioneSociale: null,
      indirizzo: 'Piazza Duomo 5',
      cap: '30100',
      localita: 'Venezia',
      prov: 'VE',
      telefono: '041-555666',
      fax: null,
      email: null,
      partitaIva: null,
      codFiscale: null,
      zona: null,
      persDaContattare: null,
      emailAmministraz: null,
    });
  });

  test('returns empty result for empty Excel', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const result = parseSubclientsExcel(buffer);

    expect(result).toEqual({
      subclients: [],
      totalRows: 0,
      imported: 0,
      skipped: 0,
      errors: [],
    });
  });

  test('skips rows missing required codice with error', () => {
    const rows = [
      { 'Ragione Sociale': 'No Code Srl', Indirizzo: 'Via Missing 1' },
      { Codice: '789', 'Ragione Sociale': 'Valid Srl' },
    ];

    const result = parseSubclientsExcel(buildExcelBuffer(rows));

    expect(result.totalRows).toBe(2);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual(['Row 2: missing required field "codice"']);
    expect(result.subclients).toHaveLength(1);
    expect(result.subclients[0].codice).toBe('C00789');
  });

  test('skips rows missing required ragione_sociale with error', () => {
    const rows = [
      { Codice: '111' },
      { Codice: '222', 'Ragione Sociale': 'Ok Srl' },
    ];

    const result = parseSubclientsExcel(buildExcelBuffer(rows));

    expect(result.totalRows).toBe(2);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual(['Row 2: missing required field "ragione_sociale"']);
    expect(result.subclients[0].ragioneSociale).toBe('Ok Srl');
  });

  test('handles nome as alias for ragione_sociale', () => {
    const rows = [
      { Codice: 'C00500', Nome: 'Alias Srl' },
    ];

    const result = parseSubclientsExcel(buildExcelBuffer(rows));

    expect(result.imported).toBe(1);
    expect(result.subclients[0].ragioneSociale).toBe('Alias Srl');
  });

  test('normalizes subclient codes', () => {
    const rows = [
      { Codice: '42', 'Ragione Sociale': 'Short Code' },
      { Codice: 'C123', 'Ragione Sociale': 'With Prefix' },
      { Codice: 'C00999', 'Ragione Sociale': 'Already Normal' },
    ];

    const result = parseSubclientsExcel(buildExcelBuffer(rows));

    expect(result.subclients.map(s => s.codice)).toEqual([
      'C00042',
      'C00123',
      'C00999',
    ]);
  });
});
