import { describe, expect, test } from 'vitest';
import { parseItalianCurrency } from './temporal-comparisons';

describe('parseItalianCurrency', () => {
  test('parses Italian format with decimal comma', () => {
    expect(parseItalianCurrency('409,85')).toBe(409.85);
  });

  test('parses Italian format with thousands separator and decimal comma', () => {
    expect(parseItalianCurrency('1.791,01')).toBe(1791.01);
  });

  test('parses Italian format with euro symbol', () => {
    expect(parseItalianCurrency('105,60 €')).toBe(105.60);
  });

  test('parses plain numeric format (English decimal dot, no comma)', () => {
    expect(parseItalianCurrency('409.85')).toBe(409.85);
  });

  test('parses plain numeric format with no decimals', () => {
    expect(parseItalianCurrency('500.00')).toBe(500);
  });

  test('returns 0 for null', () => {
    expect(parseItalianCurrency(null)).toBe(0);
  });

  test('returns 0 for empty string', () => {
    expect(parseItalianCurrency('')).toBe(0);
  });

  test('returns 0 for non-numeric string', () => {
    expect(parseItalianCurrency('N/A')).toBe(0);
  });

  test('parses negative Italian format', () => {
    expect(parseItalianCurrency('-4.264,48 €')).toBe(-4264.48);
  });
});
