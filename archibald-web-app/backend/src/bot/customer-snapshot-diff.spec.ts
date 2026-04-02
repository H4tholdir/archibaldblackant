import { describe, test, expect } from 'vitest';
import type { CustomerFormData, CustomerSnapshot } from '../types.js';
import { diffSnapshot } from './customer-snapshot-diff.js';

const baseSnapshot: NonNullable<CustomerSnapshot> = {
  internalId: '57396',
  name: 'BRACIO SRL',
  nameAlias: 'BRACIO',
  vatNumber: '15576861007',
  vatValidated: 'Sì',
  fiscalCode: '15576861007',
  pec: 'test@pec.it',
  sdi: '0000000',
  notes: 'note',
  street: 'Via Test 1',
  postalCode: '80038',
  city: 'Pomigliano d\'Arco',
  county: 'NA',
  state: 'Campania',
  country: 'IT',
  phone: '+39081000001',
  mobile: '+39333000001',
  email: 'info@test.it',
  url: 'test.it',
  attentionTo: 'Sig. Test',
  deliveryMode: 'FedEx',
  paymentTerms: '206',
  sector: null,
  priceGroup: null,
  lineDiscount: 'N/A',
};

const baseFormData: CustomerFormData = {
  name: 'BRACIO SRL',
  vatNumber: '15576861007',
  fiscalCode: '15576861007',
  pec: 'test@pec.it',
  sdi: '0000000',
  notes: 'note',
  street: 'Via Test 1',
  postalCode: '80038',
  phone: '+39081000001',
  mobile: '+39333000001',
  email: 'info@test.it',
  url: 'test.it',
  attentionTo: 'Sig. Test',
  deliveryMode: 'FedEx',
  paymentTerms: '206',
  lineDiscount: 'N/A',
};

describe('diffSnapshot', () => {
  test('returns empty array when formData matches snapshot exactly', () => {
    const result = diffSnapshot(baseSnapshot, baseFormData);
    expect(result).toEqual([]);
  });

  test('detects name divergence', () => {
    const snapshot = { ...baseSnapshot, name: 'BRACIO SRL DIVERSO' };
    const result = diffSnapshot(snapshot, baseFormData);
    expect(result).toEqual([
      { field: 'name', sent: 'bracio srl', actual: 'bracio srl diverso' },
    ]);
  });

  test('normalizes case and trim for comparison', () => {
    const snapshot = { ...baseSnapshot, name: '  bracio srl  ' };
    const result = diffSnapshot(snapshot, baseFormData);
    expect(result).toEqual([]);
  });

  test('treats null snapshot field as empty string', () => {
    const snapshot = { ...baseSnapshot, pec: null };
    const formData = { ...baseFormData, pec: undefined };
    const result = diffSnapshot(snapshot, formData);
    expect(result).toEqual([]);
  });

  test('detects vatNumber divergence', () => {
    const snapshot = { ...baseSnapshot, vatNumber: '00000000000' };
    const result = diffSnapshot(snapshot, baseFormData);
    expect(result).toEqual([
      { field: 'vatNumber', sent: '15576861007', actual: '00000000000' },
    ]);
  });

  test('treats postalCode "N/A" in snapshot as empty (normalization)', () => {
    const snapshot = { ...baseSnapshot, postalCode: 'N/A' };
    const formData = { ...baseFormData, postalCode: undefined };
    const result = diffSnapshot(snapshot, formData);
    expect(result).toEqual([]);
  });

  test('treats url "nd.it" in snapshot as empty (normalization)', () => {
    const snapshot = { ...baseSnapshot, url: 'nd.it' };
    const formData = { ...baseFormData, url: undefined };
    const result = diffSnapshot(snapshot, formData);
    expect(result).toEqual([]);
  });

  test('returns multiple divergences when multiple fields differ', () => {
    const snapshot = { ...baseSnapshot, name: 'WRONG NAME', vatNumber: '00000000000' };
    const result = diffSnapshot(snapshot, baseFormData);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ field: 'name', sent: 'bracio srl', actual: 'wrong name' });
    expect(result).toContainEqual({ field: 'vatNumber', sent: '15576861007', actual: '00000000000' });
  });

  test('returns empty array when snapshot is null', () => {
    const result = diffSnapshot(null, baseFormData);
    expect(result).toEqual([]);
  });

  test('ignores fields not in COMPARABLE_FIELDS (priceGroup, nameAlias, internalId)', () => {
    const snapshot = { ...baseSnapshot, priceGroup: 'DIFFERENT', nameAlias: 'DIFFERENT' };
    const result = diffSnapshot(snapshot, baseFormData);
    expect(result).toEqual([]);
  });
});
