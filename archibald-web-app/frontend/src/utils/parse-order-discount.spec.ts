import { describe, expect, test } from 'vitest';
import { parseOrderDiscountPercent } from './parse-order-discount';

describe('parseOrderDiscountPercent', () => {
  test('parses Italian locale format "17,98 %"', () => {
    expect(parseOrderDiscountPercent('17,98 %')).toBe(17.98);
  });

  test('parses dot-separated format "17.98"', () => {
    expect(parseOrderDiscountPercent('17.98')).toBe(17.98);
  });

  test('returns 0 for "0,00 %"', () => {
    expect(parseOrderDiscountPercent('0,00 %')).toBe(0);
  });

  test('returns 0 for "0%"', () => {
    expect(parseOrderDiscountPercent('0%')).toBe(0);
  });

  test('returns 0 for null', () => {
    expect(parseOrderDiscountPercent(null)).toBe(0);
  });

  test('returns 0 for undefined', () => {
    expect(parseOrderDiscountPercent(undefined)).toBe(0);
  });

  test('returns 0 for empty string', () => {
    expect(parseOrderDiscountPercent('')).toBe(0);
  });

  test('returns 0 for non-numeric string', () => {
    expect(parseOrderDiscountPercent('N/A')).toBe(0);
  });

  test('parses whole number "20 %"', () => {
    expect(parseOrderDiscountPercent('20 %')).toBe(20);
  });
});
