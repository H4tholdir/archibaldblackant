import { describe, expect, test } from 'vitest';
import { checkCustomerCompleteness } from './customer-completeness';
import type { Customer } from '../types/customer';

const BASE_COMPLETE: Customer = {
  customerProfile: 'CUST-001',
  internalId: '123',
  name: 'Rossi Mario',
  vatNumber: '12345678901',
  fiscalCode: null,
  sdi: 'ABCDEFG',
  pec: 'mario@pec.it',
  email: null,
  phone: null,
  mobile: null,
  url: null,
  attentionTo: null,
  street: 'Via Roma 1',
  logisticsAddress: null,
  postalCode: '80100',
  city: 'Napoli',
  customerType: null,
  type: null,
  deliveryTerms: null,
  description: null,
  lastOrderDate: null,
  actualOrderCount: 0,
  actualSales: 0,
  previousOrderCount1: 0,
  previousSales1: 0,
  previousOrderCount2: 0,
  previousSales2: 0,
  externalAccountNumber: null,
  ourAccountNumber: null,
  hash: 'abc',
  lastSync: 0,
  createdAt: 0,
  updatedAt: 0,
  botStatus: null,
  photoUrl: null,
  vatValidatedAt: '2026-01-01T00:00:00Z',
};

describe('checkCustomerCompleteness', () => {
  test('all fields present → ok with empty missing list', () => {
    expect(checkCustomerCompleteness(BASE_COMPLETE)).toEqual({ ok: true, missing: [] });
  });

  test('vatValidatedAt null → missing includes P.IVA non validata', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, vatValidatedAt: null });
    expect(result).toEqual({ ok: false, missing: ['P.IVA non validata'] });
  });

  test('vatValidatedAt empty string → missing includes P.IVA non validata (truthy check)', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, vatValidatedAt: '' });
    expect(result).toEqual({ ok: false, missing: ['P.IVA non validata'] });
  });

  test('pec present without sdi → ok', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, sdi: null });
    expect(result).toEqual({ ok: true, missing: [] });
  });

  test('sdi present without pec → ok', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, pec: null });
    expect(result).toEqual({ ok: true, missing: [] });
  });

  test('neither pec nor sdi → missing includes PEC o SDI mancante', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, pec: null, sdi: null });
    expect(result).toEqual({ ok: false, missing: ['PEC o SDI mancante'] });
  });

  test('pec empty string and sdi null → missing includes PEC o SDI mancante (truthy check)', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, pec: '', sdi: null });
    expect(result).toEqual({ ok: false, missing: ['PEC o SDI mancante'] });
  });

  test('street null → missing includes Indirizzo mancante', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, street: null });
    expect(result).toEqual({ ok: false, missing: ['Indirizzo mancante'] });
  });

  test('street empty string → missing includes Indirizzo mancante (truthy check)', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, street: '' });
    expect(result).toEqual({ ok: false, missing: ['Indirizzo mancante'] });
  });

  test('postalCode null → missing includes CAP mancante', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, postalCode: null });
    expect(result).toEqual({ ok: false, missing: ['CAP mancante'] });
  });

  test('postalCode empty string → missing includes CAP mancante (truthy check)', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, postalCode: '' });
    expect(result).toEqual({ ok: false, missing: ['CAP mancante'] });
  });

  test('multiple fields missing → all labels listed in order', () => {
    const result = checkCustomerCompleteness({
      ...BASE_COMPLETE,
      vatValidatedAt: null,
      pec: null,
      sdi: null,
      street: null,
      postalCode: null,
    });
    expect(result).toEqual({
      ok: false,
      missing: ['P.IVA non validata', 'PEC o SDI mancante', 'Indirizzo mancante', 'CAP mancante'],
    });
  });
});
