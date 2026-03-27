import { describe, expect, test } from 'vitest';
import { checkCustomerCompleteness } from './customer-completeness';
import type { Customer } from '../types/customer';

const base: Customer = {
  customerProfile: '55.261',
  internalId: null,
  name: 'Mario Rossi S.r.l.',
  vatNumber: 'IT08246131216',
  vatValidatedAt: '2026-01-01T00:00:00Z',
  pec: 'mario@pec.it',
  sdi: null,
  street: 'Via Roma 12',
  postalCode: '80100',
  city: 'Napoli',
  fiscalCode: null, mobile: null, phone: null, email: null, url: null,
  attentionTo: null, logisticsAddress: null, customerType: null, type: null,
  deliveryTerms: null, description: null, lastOrderDate: null,
  actualOrderCount: 0, actualSales: 0, previousOrderCount1: 0, previousSales1: 0,
  previousOrderCount2: 0, previousSales2: 0,
  externalAccountNumber: null, ourAccountNumber: null,
  hash: '', lastSync: 0, createdAt: 0, updatedAt: 0,
  botStatus: 'placed', photoUrl: null,
  sector: null, priceGroup: null, lineDiscount: null,
  paymentTerms: null, notes: null, nameAlias: null,
  county: null, state: null, country: null,
};

describe('checkCustomerCompleteness', () => {
  test('returns ok=true when all mandatory fields are present', () => {
    const result = checkCustomerCompleteness(base);
    expect(result.ok).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  test('returns ok=true when sdi provided instead of pec', () => {
    const result = checkCustomerCompleteness({ ...base, pec: null, sdi: 'AAABBB1' });
    expect(result.ok).toBe(true);
  });

  test('returns missingFields with vatNumber when vatNumber is null', () => {
    const result = checkCustomerCompleteness({ ...base, vatNumber: null });
    expect(result.ok).toBe(false);
    expect(result.missingFields).toContain('vatNumber');
  });

  test('returns vatValidatedAt (not vatNumber) when vatNumber present but not validated', () => {
    const result = checkCustomerCompleteness({ ...base, vatValidatedAt: null });
    expect(result.ok).toBe(false);
    expect(result.missingFields).toContain('vatValidatedAt');
    expect(result.missingFields).not.toContain('vatNumber');
  });

  test('returns pec_or_sdi when both pec and sdi are null', () => {
    const result = checkCustomerCompleteness({ ...base, pec: null, sdi: null });
    expect(result.ok).toBe(false);
    expect(result.missingFields).toContain('pec_or_sdi');
  });

  test('returns street when street is null', () => {
    const result = checkCustomerCompleteness({ ...base, street: null });
    expect(result.missingFields).toContain('street');
  });

  test('returns postalCode when postalCode is null', () => {
    const result = checkCustomerCompleteness({ ...base, postalCode: null });
    expect(result.missingFields).toContain('postalCode');
  });

  test('returns city when city is null', () => {
    const result = checkCustomerCompleteness({ ...base, city: null });
    expect(result.missingFields).toContain('city');
  });

  test('preserves human-readable missing strings for backward compatibility', () => {
    const result = checkCustomerCompleteness({ ...base, pec: null, sdi: null });
    expect(result.missing.some((s) => s.toLowerCase().includes('pec'))).toBe(true);
  });

  test('accumulates multiple missingFields', () => {
    const result = checkCustomerCompleteness({ ...base, pec: null, sdi: null, street: null });
    expect(result.missingFields).toContain('pec_or_sdi');
    expect(result.missingFields).toContain('street');
    expect(result.missingFields).toHaveLength(2);
  });
});
