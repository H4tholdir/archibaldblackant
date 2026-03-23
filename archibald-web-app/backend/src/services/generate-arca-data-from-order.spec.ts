import { describe, expect, test } from 'vitest';
import { generateArcaDataFromOrder } from './generate-arca-data-from-order';
import type { OrderForKt, OrderArticleForKt } from './generate-arca-data-from-order';
import type { Subclient } from '../db/repositories/subclients';
import { round2 } from './generate-arca-data';

function makeSubclient(overrides: Partial<Subclient> = {}): Subclient {
  return {
    codice: '00100',
    ragioneSociale: 'Test Client S.r.l.',
    supplRagioneSociale: null,
    indirizzo: 'Via Roma 1',
    cap: '20100',
    localita: 'Milano',
    prov: 'MI',
    telefono: null,
    fax: null,
    email: null,
    partitaIva: null,
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
    matchedCustomerProfileId: null,
    matchConfidence: null,
    arcaSyncedAt: null,
    ...overrides,
  };
}

const sampleOrder: OrderForKt = {
  id: 'ORD-001',
  creationDate: '2026-03-10',
  customerName: 'Test Client S.r.l.',
  discountPercent: null,
  notes: 'Test note',
};

const sampleArticles: OrderArticleForKt[] = [
  {
    articleCode: 'ART001',
    articleDescription: 'Articolo Test 1',
    quantity: 10,
    unitPrice: 5.00,
    discountPercent: 0,
    vatPercent: 22,
    lineAmount: 50.00,
    unit: 'PZ',
  },
  {
    articleCode: 'ART002',
    articleDescription: 'Articolo Test 2',
    quantity: 3,
    unitPrice: 20.00,
    discountPercent: 10,
    vatPercent: 22,
    lineAmount: 54.00,
    unit: 'PZ',
  },
];

describe('generateArcaDataFromOrder', () => {
  test('generates KT ArcaData with TIPODOC=KT', () => {
    const result = generateArcaDataFromOrder(
      sampleOrder,
      sampleArticles,
      makeSubclient(),
      201,
      '2026',
    );

    expect(result.testata.TIPODOC).toBe('KT');
    expect(result.righe[0].TIPODOC).toBe('KT');
    expect(result.righe[1].TIPODOC).toBe('KT');
  });

  test('maps order_articles to docrig rows with correct fields', () => {
    const result = generateArcaDataFromOrder(
      sampleOrder,
      sampleArticles,
      makeSubclient(),
      201,
      '2026',
    );

    expect(result.righe).toHaveLength(2);
    expect(result.righe[0]).toEqual(expect.objectContaining({
      CODICEARTI: 'ART001',
      DESCRIZION: 'ART001 Articolo Test 1',
      QUANTITA: 10,
      PREZZOUN: 5.00,
      PREZZOTOT: 50.00,
      ALIIVA: '22',
      SCONTI: '',
      CONTOSCARI: '01',
      FATT: 1,
      CODCAUMAG: '99',
      MAGPARTENZ: '00001',
      MAGARRIVO: '00001',
      GRUPPO: '00001',
      NUMERORIGA: 1,
    }));
    expect(result.righe[1]).toEqual(expect.objectContaining({
      CODICEARTI: 'ART002',
      SCONTI: '10',
      PREZZOTOT: 54.00,
      NUMERORIGA: 2,
    }));
  });

  test('uses subclient CODICECF, ZONA, PAG from sub_clients', () => {
    const subclient = makeSubclient({
      codice: '00200',
      zona: '05',
      pag: 'RB90',
      listino: '3',
    });

    const result = generateArcaDataFromOrder(
      sampleOrder,
      sampleArticles,
      subclient,
      201,
      '2026',
    );

    expect(result.testata.CODICECF).toBe('00200');
    expect(result.testata.ZONA).toBe('05');
    expect(result.testata.PAG).toBe('RB90');
    expect(result.testata.LISTINO).toBe('3');
    expect(result.righe[0].CODICECF).toBe('00200');
    expect(result.righe[0].ZONA).toBe('05');
  });

  test('calculates TOTMERCE, TOTNETTO, TOTIVA, TOTDOC correctly', () => {
    const result = generateArcaDataFromOrder(
      sampleOrder,
      sampleArticles,
      makeSubclient(),
      201,
      '2026',
    );

    // totMerce = 10*5 + 3*20 = 50 + 60 = 110
    const expectedTotMerce = round2(10 * 5 + 3 * 20);
    // totNetto = sum of line amounts = 50 + 54 = 104
    const expectedTotNetto = round2(50 + 54);
    // totSconto = 110 - 104 = 6
    const expectedTotSconto = round2(expectedTotMerce - expectedTotNetto);
    // totIva = 104 * 22% = 22.88
    const expectedTotIva = round2(expectedTotNetto * 22 / 100);
    // totDoc = 104 + 22.88 = 126.88
    const expectedTotDoc = round2(expectedTotNetto + expectedTotIva);

    expect(result.testata.TOTMERCE).toBe(expectedTotMerce);
    expect(result.testata.TOTNETTO).toBe(expectedTotNetto);
    expect(result.testata.TOTSCONTO).toBe(expectedTotSconto);
    expect(result.testata.TOTIVA).toBe(expectedTotIva);
    expect(result.testata.TOTDOC).toBe(expectedTotDoc);
  });

  test('sets all required Arca fields', () => {
    const result = generateArcaDataFromOrder(
      sampleOrder,
      sampleArticles,
      makeSubclient(),
      201,
      '2026',
    );

    expect(result.testata.CODCNT).toBe('001');
    expect(result.testata.CODCAUMAG).toBe('99');
    expect(result.testata.MAGPARTENZ).toBe('00001');
    expect(result.testata.MAGARRIVO).toBe('00001');
    expect(result.testata.TIPOMODULO).toBe('F');
    expect(result.testata.EUROCAMBIO).toBe(1);
    expect(result.testata.CODBANCA).toBe('1');
    expect(result.testata.CB_NAZIONE).toBe('IT');
    expect(result.testata.TIPOFATT).toBe('N');
    expect(result.testata.NUMERODOC).toBe('201');
    expect(result.testata.ESERCIZIO).toBe('2026');
    expect(result.testata.DATADOC).toBe('2026-03-10');
    expect(result.testata.NOTE).toBe('Test note');
  });

  test('defaults PAG and LISTINO when subclient has null values', () => {
    const subclient = makeSubclient({ pag: null, listino: null });

    const result = generateArcaDataFromOrder(
      sampleOrder,
      sampleArticles,
      subclient,
      201,
      '2026',
    );

    expect(result.testata.PAG).toBe('0001');
    expect(result.testata.LISTINO).toBe('1');
  });

  test('handles discount percent on order level', () => {
    const orderWithDiscount = { ...sampleOrder, discountPercent: 10 };

    const result = generateArcaDataFromOrder(
      orderWithDiscount,
      sampleArticles,
      makeSubclient(),
      201,
      '2026',
    );

    expect(result.testata.SCONTI).toBe('10');
    expect(result.testata.SCONTIF).toBe(0.9);
  });
});
