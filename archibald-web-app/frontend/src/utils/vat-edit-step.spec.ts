import { describe, expect, test } from 'vitest';
import { determineVatEditStep } from './vat-edit-step';
import type { Customer } from '../types/customer';

const base: Customer = {
  customerProfile: 'TEST-001',
  internalId: '55.123',
  name: 'Test Cliente',
  vatNumber: null,
  fiscalCode: null,
  sdi: null,
  pec: null,
  email: null,
  phone: null,
  mobile: null,
  url: null,
  attentionTo: null,
  street: null,
  logisticsAddress: null,
  postalCode: null,
  city: null,
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
  hash: 'abc123',
  lastSync: 0,
  createdAt: 0,
  updatedAt: 0,
  botStatus: null,
  photoUrl: null,
  vatValidatedAt: null,
};

describe('determineVatEditStep', () => {
  test('vatNumber null → force-vat-input', () => {
    expect(determineVatEditStep({ ...base, vatNumber: null, vatValidatedAt: null }))
      .toBe('force-vat-input');
  });

  test('vatNumber vuoto → force-vat-input', () => {
    expect(determineVatEditStep({ ...base, vatNumber: '', vatValidatedAt: null }))
      .toBe('force-vat-input');
  });

  test('vatNumber presente, mai validata → auto-validate', () => {
    expect(determineVatEditStep({ ...base, vatNumber: '12345678901', vatValidatedAt: null }))
      .toBe('auto-validate');
  });

  test('vatNumber presente, già validata → show-validated-check', () => {
    expect(determineVatEditStep({ ...base, vatNumber: '12345678901', vatValidatedAt: '2026-01-13T09:02:21Z' }))
      .toBe('show-validated-check');
  });

  test('vatValidatedAt presente ma vatNumber null → force-vat-input (inconsistenza)', () => {
    expect(determineVatEditStep({ ...base, vatNumber: null, vatValidatedAt: '2026-01-13T09:02:21Z' }))
      .toBe('force-vat-input');
  });

  test('vatValidatedAt presente ma vatNumber vuoto → force-vat-input (inconsistenza)', () => {
    expect(determineVatEditStep({ ...base, vatNumber: '', vatValidatedAt: '2026-01-13T09:02:21Z' }))
      .toBe('force-vat-input');
  });
});
