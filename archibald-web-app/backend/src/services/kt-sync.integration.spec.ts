import { describe, expect, test, vi } from 'vitest';
import { generateArcaDataFromOrder } from './generate-arca-data-from-order';
import type { OrderForKt, OrderArticleForKt } from './generate-arca-data-from-order';
import { generateVbsScript } from './arca-sync-service';
import type { Subclient } from '../db/repositories/subclients';

function makeSubclient(overrides: Partial<Subclient> = {}): Subclient {
  return {
    codice: '00150',
    ragioneSociale: 'Test Sottocliente S.r.l.',
    supplRagioneSociale: null,
    indirizzo: 'Via Test 1',
    cap: '20100',
    localita: 'Milano',
    prov: 'MI',
    telefono: null,
    fax: null,
    email: null,
    partitaIva: 'IT12345678901',
    codFiscale: null,
    zona: '03',
    persDaContattare: null,
    emailAmministraz: null,
    agente: null,
    agente2: null,
    settore: null,
    classe: null,
    pag: 'RB60',
    listino: '2',
    banca: null,
    valuta: null,
    codNazione: 'IT',
    aliiva: null,
    contoscar: null,
    tipofatt: null,
    telefono2: null,
    telefono3: null,
    url: null,
    cbNazione: null,
    cbBic: null,
    cbCinUe: null,
    cbCinIt: null,
    abicab: null,
    contocorr: null,
    matchedCustomerProfileId: 'CUST-001',
    matchConfidence: 'vat',
    arcaSyncedAt: null,
    ...overrides,
  };
}

const testOrder: OrderForKt = {
  id: 'ORD-INT-001',
  creationDate: '2026-03-10',
  customerName: 'Test Sottocliente S.r.l.',
  discountPercent: null,
  notes: 'Nota di prova per integration test',
};

const testArticles: OrderArticleForKt[] = [
  {
    articleCode: '10.150.001',
    articleDescription: 'Prodotto A',
    quantity: 5,
    unitPrice: 12.50,
    discountPercent: 0,
    vatPercent: 22,
    lineAmount: 62.50,
    unit: 'PZ',
  },
  {
    articleCode: '10.200.003',
    articleDescription: 'Prodotto B',
    quantity: 2,
    unitPrice: 35.00,
    discountPercent: 10,
    vatPercent: 22,
    lineAmount: 63.00,
    unit: 'PZ',
  },
];

describe('KT sync round-trip', () => {
  test('generates valid KT ArcaData and VBS with all required fields', () => {
    const subclient = makeSubclient();
    const docNumber = 201;
    const esercizio = '2026';

    const arcaData = generateArcaDataFromOrder(
      testOrder,
      testArticles,
      subclient,
      docNumber,
      esercizio,
    );

    // Verify TIPODOC=KT on testata and all righe
    expect(arcaData.testata.TIPODOC).toBe('KT');
    for (const riga of arcaData.righe) {
      expect(riga.TIPODOC).toBe('KT');
    }

    // Verify CODICECF from subclient
    expect(arcaData.testata.CODICECF).toBe('00150');
    expect(arcaData.testata.ZONA).toBe('03');
    expect(arcaData.testata.PAG).toBe('RB60');
    expect(arcaData.testata.LISTINO).toBe('2');

    // Verify required Arca fields
    expect(arcaData.testata.CODCNT).toBe('001');
    expect(arcaData.testata.CODCAUMAG).toBe('99');
    expect(arcaData.testata.MAGPARTENZ).toBe('00001');
    expect(arcaData.testata.MAGARRIVO).toBe('00001');
    expect(arcaData.testata.EUROCAMBIO).toBe(1);
    expect(arcaData.testata.CODBANCA).toBe('1');
    expect(arcaData.testata.CB_NAZIONE).toBe('IT');
    expect(arcaData.testata.TIPOFATT).toBe('N');
    expect(arcaData.testata.TIPOMODULO).toBe('F');

    // Verify righe fields
    expect(arcaData.righe).toHaveLength(2);
    for (const riga of arcaData.righe) {
      expect(riga.CONTOSCARI).toBe('01');
      expect(riga.FATT).toBe(1);
      expect(riga.CODCAUMAG).toBe('99');
      expect(riga.MAGPARTENZ).toBe('00001');
      expect(riga.MAGARRIVO).toBe('00001');
      expect(riga.GRUPPO).toBe('00001');
    }

    // Verify totals
    const expectedTotMerce = 5 * 12.50 + 2 * 35.00; // 62.50 + 70 = 132.50
    const expectedTotNetto = 62.50 + 63.00; // 125.50
    const expectedTotIva = Math.round(expectedTotNetto * 22 / 100 * 100) / 100; // 27.61
    const expectedTotDoc = Math.round((expectedTotNetto + expectedTotIva) * 100) / 100;

    expect(arcaData.testata.TOTMERCE).toBe(expectedTotMerce);
    expect(arcaData.testata.TOTNETTO).toBe(expectedTotNetto);
    expect(arcaData.testata.TOTIVA).toBe(expectedTotIva);
    expect(arcaData.testata.TOTDOC).toBe(expectedTotDoc);
    expect(arcaData.testata.NOTE).toBe('Nota di prova per integration test');

    // Generate VBS and verify it contains KT-specific content
    const vbs = generateVbsScript([{
      invoiceNumber: `KT ${docNumber}/${esercizio}`,
      arcaData,
    }]);

    expect(vbs.vbs).toContain('EXECSCRIPT(FILETOSTR(');
    expect(vbs.vbs).toContain('REPLACE TIPODOC WITH [KT]');
    expect(vbs.vbs).toContain('REPLACE CODICECF WITH [00150]');
    expect(vbs.vbs).toContain('REPLACE CONTOSCARI WITH [01]');
    expect(vbs.vbs).toContain('REPLACE CODCAUMAG WITH [99]');
    expect(vbs.vbs).toContain('REPLACE MAGPARTENZ WITH [00001]');

    // Verify SCADENZE record is included
    expect(vbs.vbs).toContain('USE SCADENZE IN 0 SHARED AGAIN ALIAS _ins');
    expect(vbs.vbs).toContain('REPLACE TIPOMOD WITH [KT]');
    expect(vbs.vbs).toContain('REPLACE TIPO WITH [A]');
    expect(vbs.vbs).toContain('REPLACE TRANSIT WITH .T.');

    // Verify bat wrapper
    expect(vbs.bat).toContain('SysWOW64');
    expect(vbs.bat).toContain('sync_arca.vbs');
  });

  test('VBS contains correct NUMERODOC with padding', () => {
    const subclient = makeSubclient();
    const arcaData = generateArcaDataFromOrder(
      testOrder,
      [testArticles[0]],
      subclient,
      42,
      '2026',
    );

    const vbs = generateVbsScript([{
      invoiceNumber: 'KT 42/2026',
      arcaData,
    }]);

    // NUMERODOC should be padded to 6 chars
    expect(vbs.vbs).toContain('[    42]');
  });

  test('multiple KT orders generate sequential EXECSCRIPT blocks', () => {
    const subclient = makeSubclient();

    const order1 = generateArcaDataFromOrder(
      { ...testOrder, id: 'ORD-1' },
      [testArticles[0]],
      subclient,
      201,
      '2026',
    );

    const order2 = generateArcaDataFromOrder(
      { ...testOrder, id: 'ORD-2', customerName: 'Altro Cliente' },
      testArticles,
      makeSubclient({ codice: '00200' }),
      202,
      '2026',
    );

    const vbs = generateVbsScript([
      { invoiceNumber: 'KT 201/2026', arcaData: order1 },
      { invoiceNumber: 'KT 202/2026', arcaData: order2 },
    ]);

    // batch: 3 EXECSCRIPT totali (doctes + docrig + scadenze), indipendente dal numero di documenti
    const execCount = (vbs.vbs.match(/EXECSCRIPT\(FILETOSTR\(\[/g) || []).length;
    expect(execCount).toBe(3);

    expect(vbs.vbs).toContain('KT 201/2026');
    expect(vbs.vbs).toContain('KT 202/2026');
  });
});
