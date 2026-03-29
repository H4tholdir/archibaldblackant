import { describe, expect, test, vi, beforeEach } from 'vitest';
import {
  computeMultiFieldScore,
  normalizeForComparison,
  normalizePhone,
  tokenOverlap,
} from './subclient-matcher';
import type { Subclient } from '../db/repositories/subclients';
import type { Customer } from '../db/repositories/customers';

function makeSubclient(overrides: Partial<Subclient> = {}): Subclient {
  return {
    codice: '00100',
    ragioneSociale: 'Test S.r.l.',
    supplRagioneSociale: null,
    indirizzo: null,
    cap: null,
    localita: null,
    prov: null,
    telefono: null,
    fax: null,
    email: null,
    partitaIva: null,
    codFiscale: null,
    zona: null,
    persDaContattare: null,
    emailAmministraz: null,
    agente: null,
    agente2: null,
    settore: null,
    classe: null,
    pag: null,
    listino: null,
    banca: null,
    valuta: null,
    codNazione: null,
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

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    erpId: 'CUST-001',
    userId: 'user-1',
    name: 'Test S.r.l.',
    phone: null,
    mobile: null,
    street: null,
    postalCode: null,
    city: null,
    vatNumber: null,
    email: null,
    pec: null,
    sdi: null,
    fiscalCode: null,
    fax: null,
    district: null,
    region: null,
    country: null,
    notes: null,
    contactPerson: null,
    discountPercent: null,
    deliveryInfo: null,
    priceList: null,
    paymentTerms: null,
    searchText: null,
    syncedAt: null,
    lastOrderDate: null,
    orderCount: null,
    totalAmount: null,
    blocked: null,
    isPotentialCustomer: null,
    ...overrides,
  } as Customer;
}

describe('normalizeForComparison', () => {
  test('lowercases and strips non-alphanumeric', () => {
    expect(normalizeForComparison('IT 123-456.789')).toBe('it123456789');
  });

  test('returns empty string for null', () => {
    expect(normalizeForComparison(null)).toBe('');
  });
});

describe('normalizePhone', () => {
  test('keeps only digits', () => {
    expect(normalizePhone('+39 02 1234567')).toBe('39021234567');
  });

  test('returns empty string for null', () => {
    expect(normalizePhone(null)).toBe('');
  });
});

describe('tokenOverlap', () => {
  test('returns 1 for identical strings', () => {
    expect(tokenOverlap('Acme Corp', 'Acme Corp')).toBe(1);
  });

  test('returns partial score for partial overlap', () => {
    expect(tokenOverlap('Acme Corp SRL', 'Acme SRL')).toBeCloseTo(2 / 3);
  });

  test('returns 0 for no overlap', () => {
    expect(tokenOverlap('Acme', 'Beta')).toBe(0);
  });

  test('returns 0 for empty strings', () => {
    expect(tokenOverlap('', '')).toBe(0);
  });
});

describe('computeMultiFieldScore', () => {
  test('scores 1 for name match only', () => {
    const sub = makeSubclient({ ragioneSociale: 'Rossi Mario S.r.l.' });
    const cust = makeCustomer({ name: 'Rossi Mario S.r.l.' });
    expect(computeMultiFieldScore(sub, cust)).toBe(1);
  });

  test('scores 2 for name + phone match', () => {
    const sub = makeSubclient({
      ragioneSociale: 'Rossi Mario S.r.l.',
      telefono: '02 1234567',
    });
    const cust = makeCustomer({
      name: 'Rossi Mario S.r.l.',
      phone: '021234567',
    });
    expect(computeMultiFieldScore(sub, cust)).toBe(2);
  });

  test('scores 3 for name + phone + address match', () => {
    const sub = makeSubclient({
      ragioneSociale: 'Rossi Mario S.r.l.',
      telefono: '021234567',
      indirizzo: 'Via Roma 1',
    });
    const cust = makeCustomer({
      name: 'Rossi Mario S.r.l.',
      phone: '021234567',
      street: 'Via Roma 1',
    });
    expect(computeMultiFieldScore(sub, cust)).toBe(3);
  });

  test('scores 0 for completely different data', () => {
    const sub = makeSubclient({ ragioneSociale: 'Alpha' });
    const cust = makeCustomer({ name: 'Beta' });
    expect(computeMultiFieldScore(sub, cust)).toBe(0);
  });

  test('phone match works with mobile', () => {
    const sub = makeSubclient({
      ragioneSociale: 'Different Name',
      telefono: '3331234567',
    });
    const cust = makeCustomer({
      name: 'Also Different',
      mobile: '+39 333 1234567',
    });
    expect(computeMultiFieldScore(sub, cust)).toBe(1);
  });

  test('ignores short phone numbers', () => {
    const sub = makeSubclient({ ragioneSociale: 'Test', telefono: '123' });
    const cust = makeCustomer({ name: 'Test', phone: '123' });
    // name matches (1) but phone too short
    expect(computeMultiFieldScore(sub, cust)).toBe(1);
  });
});

describe('matchSubclients', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('matches by VAT number with confidence=vat', async () => {
    const subclientsMod = await import('../db/repositories/subclients');
    const customersMod = await import('../db/repositories/customers');
    const matcherMod = await import('./subclient-matcher');

    const sub = makeSubclient({ codice: 'C001', partitaIva: 'IT12345678901' });
    const cust = makeCustomer({ erpId: 'PROF-1', vatNumber: 'IT12345678901' });

    vi.spyOn(subclientsMod, 'getUnmatchedSubclients').mockResolvedValue([sub]);
    vi.spyOn(customersMod, 'getCustomers').mockResolvedValue([cust]);
    const setMatchSpy = vi.spyOn(subclientsMod, 'setSubclientMatch').mockResolvedValue(true);

    const result = await matcherMod.matchSubclients({} as any, 'user-1');

    expect(result).toEqual({ matched: 1, unmatched: 0 });
    expect(setMatchSpy).toHaveBeenCalledWith({}, 'C001', 'PROF-1', 'vat');
  });

  test('matches by multi-field with confidence=multi-field', async () => {
    const subclientsMod = await import('../db/repositories/subclients');
    const customersMod = await import('../db/repositories/customers');
    const matcherMod = await import('./subclient-matcher');

    const sub = makeSubclient({
      codice: 'C002',
      ragioneSociale: 'Rossi Mario S.r.l.',
      telefono: '021234567',
    });
    const cust = makeCustomer({
      erpId: 'PROF-2',
      name: 'Rossi Mario S.r.l.',
      phone: '021234567',
    });

    vi.spyOn(subclientsMod, 'getUnmatchedSubclients').mockResolvedValue([sub]);
    vi.spyOn(customersMod, 'getCustomers').mockResolvedValue([cust]);
    const setMatchSpy = vi.spyOn(subclientsMod, 'setSubclientMatch').mockResolvedValue(true);

    const result = await matcherMod.matchSubclients({} as any, 'user-1');

    expect(result).toEqual({ matched: 1, unmatched: 0 });
    expect(setMatchSpy).toHaveBeenCalledWith({}, 'C002', 'PROF-2', 'multi-field');
  });

  test('does not match when score below threshold', async () => {
    const subclientsMod = await import('../db/repositories/subclients');
    const customersMod = await import('../db/repositories/customers');
    const matcherMod = await import('./subclient-matcher');

    const sub = makeSubclient({ codice: 'C003', ragioneSociale: 'Alpha' });
    const cust = makeCustomer({ erpId: 'PROF-3', name: 'Beta' });

    vi.spyOn(subclientsMod, 'getUnmatchedSubclients').mockResolvedValue([sub]);
    vi.spyOn(customersMod, 'getCustomers').mockResolvedValue([cust]);
    const setMatchSpy = vi.spyOn(subclientsMod, 'setSubclientMatch').mockResolvedValue(true);

    const result = await matcherMod.matchSubclients({} as any, 'user-1');

    expect(result).toEqual({ matched: 0, unmatched: 1 });
    expect(setMatchSpy).not.toHaveBeenCalled();
  });

  test('skips already matched subclients', async () => {
    const subclientsMod = await import('../db/repositories/subclients');
    const customersMod = await import('../db/repositories/customers');
    const matcherMod = await import('./subclient-matcher');

    // getUnmatchedSubclients returns only unmatched ones
    vi.spyOn(subclientsMod, 'getUnmatchedSubclients').mockResolvedValue([]);
    vi.spyOn(customersMod, 'getCustomers').mockResolvedValue([]);

    const result = await matcherMod.matchSubclients({} as any, 'user-1');

    expect(result).toEqual({ matched: 0, unmatched: 0 });
  });
});
