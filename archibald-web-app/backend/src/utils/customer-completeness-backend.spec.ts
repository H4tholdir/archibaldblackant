import { describe, expect, test } from 'vitest';
import { isCustomerComplete } from './customer-completeness-backend';

type CustomerCompleteness = {
  vat_validated_at: string | null;
  pec: string | null;
  sdi: string | null;
  street: string | null;
  postal_code: string | null;
};

const BASE_COMPLETE: CustomerCompleteness = {
  vat_validated_at: '2026-01-01T00:00:00Z',
  pec: 'mario@pec.it',
  sdi: 'ABCDEFG',
  street: 'Via Roma 1',
  postal_code: '80100',
};

describe('isCustomerComplete', () => {
  test('all fields present → true', () => {
    expect(isCustomerComplete(BASE_COMPLETE)).toBe(true);
  });

  test('vat_validated_at null → false', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, vat_validated_at: null })).toBe(false);
  });

  test('vat_validated_at empty string → false (truthy check)', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, vat_validated_at: '' })).toBe(false);
  });

  test('pec present without sdi → true', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, sdi: null })).toBe(true);
  });

  test('sdi present without pec → true', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, pec: null })).toBe(true);
  });

  test('neither pec nor sdi → false', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, pec: null, sdi: null })).toBe(false);
  });

  test('pec empty string and sdi null → false (truthy check)', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, pec: '', sdi: null })).toBe(false);
  });

  test('street null → false', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, street: null })).toBe(false);
  });

  test('street empty string → false (truthy check)', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, street: '' })).toBe(false);
  });

  test('postal_code null → false', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, postal_code: null })).toBe(false);
  });

  test('postal_code empty string → false (truthy check)', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, postal_code: '' })).toBe(false);
  });

  test('multiple fields missing → false', () => {
    expect(isCustomerComplete({
      vat_validated_at: null,
      pec: null,
      sdi: null,
      street: null,
      postal_code: null,
    })).toBe(false);
  });
});
