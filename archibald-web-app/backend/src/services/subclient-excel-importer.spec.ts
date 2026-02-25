import { describe, expect, test, vi } from 'vitest';
import * as XLSX from 'xlsx';
import type { ImportDeps } from './subclient-excel-importer';
import { normalizeSubClientCode, importSubClients } from './subclient-excel-importer';

function makeExcelBuffer(headers: string[], rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

function makeDeps(overrides: Partial<ImportDeps> = {}): ImportDeps {
  return {
    upsertSubclients: vi.fn().mockResolvedValue(0),
    getAllCodici: vi.fn().mockResolvedValue([]),
    deleteSubclientsByCodici: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe('normalizeSubClientCode', () => {
  test('strips "C" prefix: "C00123" -> "00123"', () => {
    expect(normalizeSubClientCode('C00123')).toBe('00123');
  });

  test('strips lowercase "c" prefix: "c00123" -> "00123"', () => {
    expect(normalizeSubClientCode('c00123')).toBe('00123');
  });

  test('pads short codes to 5 digits: "123" -> "00123"', () => {
    expect(normalizeSubClientCode('123')).toBe('00123');
  });

  test('already normalized code is unchanged: "00123" -> "00123"', () => {
    expect(normalizeSubClientCode('00123')).toBe('00123');
  });

  test('handles numeric input: 123 -> "00123"', () => {
    expect(normalizeSubClientCode(123)).toBe('00123');
  });

  test('trims whitespace: " C00123 " -> "00123"', () => {
    expect(normalizeSubClientCode(' C00123 ')).toBe('00123');
  });

  test('returns empty string for empty input', () => {
    expect(normalizeSubClientCode('')).toBe('');
  });

  test('returns empty string for null/undefined', () => {
    expect(normalizeSubClientCode(null as unknown as string)).toBe('');
    expect(normalizeSubClientCode(undefined as unknown as string)).toBe('');
  });

  test('strips C prefix then pads: "C5" -> "00005"', () => {
    expect(normalizeSubClientCode('C5')).toBe('00005');
  });

  test('does not strip C from non-prefix position: "12C34" stays as-is padded', () => {
    expect(normalizeSubClientCode('12C34')).toBe('12C34');
  });

  test('handles zero: 0 -> "00000"', () => {
    expect(normalizeSubClientCode(0)).toBe('00000');
  });

  test('handles code longer than 5 digits: "123456" -> "123456"', () => {
    expect(normalizeSubClientCode('123456')).toBe('123456');
  });
});

describe('importSubClients', () => {
  const canonicalHeaders = [
    'Codice', 'Ragione Sociale', 'Suppl. Rag. Sociale',
    'Indirizzo', 'CAP', 'Localita', 'Prov',
    'Telefono', 'Fax', 'Email',
    'Partita IVA', 'Cod. Fiscale', 'Zona',
    'Pers. da contattare', 'Email Amministraz.',
  ];

  test('imports valid Excel with canonical headers', async () => {
    const row = [
      'C00123', 'Test Srl', 'Suppl Test',
      'Via Roma 1', '00100', 'Roma', 'RM',
      '0612345', '0612346', 'test@test.it',
      '12345678901', 'ABCDEF12G34H567I', 'Centro',
      'Mario Rossi', 'admin@test.it',
    ];
    const buffer = makeExcelBuffer(canonicalHeaders, [row]);
    const upsertSubclients = vi.fn().mockResolvedValue(1);
    const deps = makeDeps({ upsertSubclients });

    const result = await importSubClients(buffer, 'test.xlsx', deps);

    expect(result).toEqual({ success: true, imported: 1, skipped: 0 });
    expect(upsertSubclients).toHaveBeenCalledTimes(1);
    const subclients = upsertSubclients.mock.calls[0][0];
    expect(subclients).toHaveLength(1);
    expect(subclients[0].codice).toBe('00123');
    expect(subclients[0].ragioneSociale).toBe('Test Srl');
  });

  test('maps uppercase header variations: "CODICE", "RAGIONE SOCIALE"', async () => {
    const headers = [
      'CODICE', 'RAGIONE SOCIALE', 'SUPPL. RAG. SOCIALE',
      'INDIRIZZO', 'CAP', 'LOCALITA', 'PROV',
      'TELEFONO', 'FAX', 'EMAIL',
      'PARTITA IVA', 'COD. FISCALE', 'ZONA',
      'PERS. DA CONTATTARE', 'EMAIL AMMINISTRAZ.',
    ];
    const row = ['C00456', 'Altra Srl', null, null, null, null, null, null, null, null, null, null, null, null, null];
    const buffer = makeExcelBuffer(headers, [row]);
    const upsertSubclients = vi.fn().mockResolvedValue(1);
    const deps = makeDeps({ upsertSubclients });

    const result = await importSubClients(buffer, 'test.xlsx', deps);

    expect(result.success).toBe(true);
    const subclients = upsertSubclients.mock.calls[0][0];
    expect(subclients[0].codice).toBe('00456');
    expect(subclients[0].ragioneSociale).toBe('Altra Srl');
  });

  test('maps abbreviated header variations: "Cod.", "Rag. Sociale", "P.IVA"', async () => {
    const headers = [
      'Cod.', 'Rag. Sociale', 'Suppl. Rag. Sociale',
      'Indirizzo', 'C.A.P.', 'Localit\u00e0', 'Prov.',
      'Tel.', 'Fax', 'E-mail',
      'P.IVA', 'Codice Fiscale', 'Zona',
      'Persona da contattare', 'Email Amministrazione',
    ];
    const row = ['C00789', 'Abbr Srl', null, null, '20100', 'Milano', 'MI', null, null, null, '99887766554', null, null, null, null];
    const buffer = makeExcelBuffer(headers, [row]);
    const upsertSubclients = vi.fn().mockResolvedValue(1);
    const deps = makeDeps({ upsertSubclients });

    const result = await importSubClients(buffer, 'test.xlsx', deps);

    expect(result.success).toBe(true);
    const subclients = upsertSubclients.mock.calls[0][0];
    expect(subclients[0].codice).toBe('00789');
    expect(subclients[0].ragioneSociale).toBe('Abbr Srl');
    expect(subclients[0].cap).toBe('20100');
    expect(subclients[0].localita).toBe('Milano');
    expect(subclients[0].partitaIva).toBe('99887766554');
  });

  test('skips rows with empty codice', async () => {
    const rows = [
      ['C00123', 'Valid Srl', null, null, null, null, null, null, null, null, null, null, null, null, null],
      ['', 'No Code Srl', null, null, null, null, null, null, null, null, null, null, null, null, null],
      [null, 'Null Code Srl', null, null, null, null, null, null, null, null, null, null, null, null, null],
    ];
    const buffer = makeExcelBuffer(canonicalHeaders, rows);
    const upsertSubclients = vi.fn().mockResolvedValue(1);
    const deps = makeDeps({ upsertSubclients });

    const result = await importSubClients(buffer, 'test.xlsx', deps);

    expect(result).toEqual({ success: true, imported: 1, skipped: 2 });
    const subclients = upsertSubclients.mock.calls[0][0];
    expect(subclients).toHaveLength(1);
    expect(subclients[0].codice).toBe('00123');
  });

  test('calls deleteSubclientsByCodici for removed records', async () => {
    const row = ['C00123', 'Test Srl', null, null, null, null, null, null, null, null, null, null, null, null, null];
    const buffer = makeExcelBuffer(canonicalHeaders, [row]);
    const getAllCodici = vi.fn().mockResolvedValue(['00123', '00456', '00789']);
    const deleteSubclientsByCodici = vi.fn().mockResolvedValue(2);
    const deps = makeDeps({ getAllCodici, deleteSubclientsByCodici });

    await importSubClients(buffer, 'test.xlsx', deps);

    expect(deleteSubclientsByCodici).toHaveBeenCalledWith(['00456', '00789']);
  });

  test('does not call delete when no records removed', async () => {
    const row = ['C00123', 'Test Srl', null, null, null, null, null, null, null, null, null, null, null, null, null];
    const buffer = makeExcelBuffer(canonicalHeaders, [row]);
    const getAllCodici = vi.fn().mockResolvedValue(['00123']);
    const deleteSubclientsByCodici = vi.fn().mockResolvedValue(0);
    const deps = makeDeps({ getAllCodici, deleteSubclientsByCodici });

    await importSubClients(buffer, 'test.xlsx', deps);

    expect(deleteSubclientsByCodici).not.toHaveBeenCalled();
  });

  test('handles empty Excel file (no data rows)', async () => {
    const buffer = makeExcelBuffer(canonicalHeaders, []);
    const upsertSubclients = vi.fn().mockResolvedValue(0);
    const deps = makeDeps({ upsertSubclients });

    const result = await importSubClients(buffer, 'test.xlsx', deps);

    expect(result).toEqual({ success: true, imported: 0, skipped: 0 });
    expect(upsertSubclients).not.toHaveBeenCalled();
  });

  test('handles invalid Excel buffer gracefully', async () => {
    const truncatedZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const deps = makeDeps();

    const result = await importSubClients(truncatedZip, 'bad.xlsx', deps);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('imports multiple rows correctly', async () => {
    const rows = [
      ['C00001', 'Alpha Srl', null, 'Via A 1', null, null, null, null, null, null, null, null, null, null, null],
      ['C00002', 'Beta Srl', null, 'Via B 2', null, null, null, null, null, null, null, null, null, null, null],
      ['C00003', 'Gamma Srl', null, 'Via C 3', null, null, null, null, null, null, null, null, null, null, null],
    ];
    const buffer = makeExcelBuffer(canonicalHeaders, rows);
    const upsertSubclients = vi.fn().mockResolvedValue(3);
    const deps = makeDeps({ upsertSubclients });

    const result = await importSubClients(buffer, 'test.xlsx', deps);

    expect(result).toEqual({ success: true, imported: 3, skipped: 0 });
    const subclients = upsertSubclients.mock.calls[0][0];
    expect(subclients).toHaveLength(3);
    expect(subclients.map((s: { codice: string }) => s.codice)).toEqual(['00001', '00002', '00003']);
  });

  test('converts numeric cell values to strings for text fields', async () => {
    const row = [123, 'Test Srl', null, null, 20100, null, null, 612345, null, null, 12345678901, null, null, null, null];
    const buffer = makeExcelBuffer(canonicalHeaders, [row]);
    const upsertSubclients = vi.fn().mockResolvedValue(1);
    const deps = makeDeps({ upsertSubclients });

    const result = await importSubClients(buffer, 'test.xlsx', deps);

    expect(result.success).toBe(true);
    const subclients = upsertSubclients.mock.calls[0][0];
    expect(subclients[0].codice).toBe('00123');
    expect(subclients[0].cap).toBe('20100');
    expect(subclients[0].telefono).toBe('612345');
    expect(subclients[0].partitaIva).toBe('12345678901');
  });

  test('maps lowercase header variation: "codice", "ragione sociale"', async () => {
    const headers = [
      'codice', 'ragione sociale', 'Suppl. Rag. Sociale',
      'Indirizzo', 'Cap', 'Localita', 'Prov',
      'Tel', 'Fax', 'e-mail',
      'P. IVA', 'Cod. Fiscale', 'Zona',
      'Pers. da contattare', 'Email Amministraz.',
    ];
    const row = ['C00999', 'Lower Srl', null, null, null, null, null, null, null, 'lower@test.it', null, null, null, null, null];
    const buffer = makeExcelBuffer(headers, [row]);
    const upsertSubclients = vi.fn().mockResolvedValue(1);
    const deps = makeDeps({ upsertSubclients });

    const result = await importSubClients(buffer, 'test.xlsx', deps);

    expect(result.success).toBe(true);
    const subclients = upsertSubclients.mock.calls[0][0];
    expect(subclients[0].codice).toBe('00999');
    expect(subclients[0].email).toBe('lower@test.it');
  });

  test('maps "COD." header variation for codice', async () => {
    const headers = [
      'COD.', 'Ragione Sociale', 'Suppl. Rag. Sociale',
      'Indirizzo', 'CAP', 'Localita', 'Prov',
      'Telefono', 'Fax', 'Email',
      'Partita IVA', 'Cod. Fiscale', 'Zona',
      'Pers. da contattare', 'Email Amministraz.',
    ];
    const row = ['C00555', 'Cod Dot Srl', null, null, null, null, null, null, null, null, null, null, null, null, null];
    const buffer = makeExcelBuffer(headers, [row]);
    const upsertSubclients = vi.fn().mockResolvedValue(1);
    const deps = makeDeps({ upsertSubclients });

    const result = await importSubClients(buffer, 'test.xlsx', deps);

    expect(result.success).toBe(true);
    const subclients = upsertSubclients.mock.calls[0][0];
    expect(subclients[0].codice).toBe('00555');
  });

  test('maps "Provincia" header for prov field', async () => {
    const headers = [
      'Codice', 'Ragione Sociale', 'Suppl. Rag. Sociale',
      'Indirizzo', 'CAP', 'Localita', 'Provincia',
      'Telefono', 'Fax', 'Email',
      'Partita IVA', 'Cod. Fiscale', 'Zona',
      'Pers. da contattare', 'Email Amministraz.',
    ];
    const row = ['C00111', 'Prov Test Srl', null, null, null, null, 'TO', null, null, null, null, null, null, null, null];
    const buffer = makeExcelBuffer(headers, [row]);
    const upsertSubclients = vi.fn().mockResolvedValue(1);
    const deps = makeDeps({ upsertSubclients });

    const result = await importSubClients(buffer, 'test.xlsx', deps);

    expect(result.success).toBe(true);
    const subclients = upsertSubclients.mock.calls[0][0];
    expect(subclients[0].prov).toBe('TO');
  });
});
