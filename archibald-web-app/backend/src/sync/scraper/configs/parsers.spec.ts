import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import {
  parseDate,
  parseNumber,
  parseBoolean,
  parseCurrency,
  normalizeNumber,
  detectNumberFormat,
  disambiguateMDY,
} from './parsers';

describe('detectNumberFormat', () => {
  test.each([
    { input: '51847', expected: 'en' },
    { input: '51,847', expected: 'en' },
    { input: '1,922.85', expected: 'en' },
    { input: '1.234,56', expected: 'it' },
    { input: '1234.56', expected: 'en' },
    { input: '1234', expected: 'en' },
    { input: '0.5', expected: 'en' },
    { input: '0,5', expected: 'it' },
    { input: '1,000,000.50', expected: 'en' },
    { input: '1.000.000,50', expected: 'it' },
  ])('detects "$input" as $expected format', ({ input, expected }) => {
    expect(detectNumberFormat(input)).toBe(expected);
  });
});

describe('normalizeNumber', () => {
  test.each([
    { input: '51,847', expected: 51847 },
    { input: '1,922.85', expected: 1922.85 },
    { input: '1.234,56', expected: 1234.56 },
    { input: '1234.56', expected: 1234.56 },
    { input: '1234', expected: 1234 },
    { input: '0', expected: 0 },
    { input: '-5.50', expected: -5.50 },
    { input: '-1,234.56', expected: -1234.56 },
    { input: '€ 1,922.85', expected: 1922.85 },
    { input: '$ 100.00', expected: 100 },
    { input: '  42  ', expected: 42 },
    { input: '', expected: undefined },
    { input: '   ', expected: undefined },
    { input: 'abc', expected: undefined },
  ])('normalizes "$input" to $expected', ({ input, expected }) => {
    expect(normalizeNumber(input)).toBe(expected);
  });
});

describe('disambiguateMDY', () => {
  test('p1 > 12 means DD/MM', () => {
    expect(disambiguateMDY(28, 3)).toEqual({ month: 3, day: 28 });
  });

  test('p2 > 12 means MM/DD', () => {
    expect(disambiguateMDY(3, 28)).toEqual({ month: 3, day: 28 });
  });

  test('ambiguous case defaults to MM/DD', () => {
    expect(disambiguateMDY(3, 5)).toEqual({ month: 3, day: 5 });
  });
});

describe('parseDate', () => {
  test('returns undefined for empty string', () => {
    expect(parseDate('')).toBe(undefined);
  });

  test('returns undefined for whitespace-only', () => {
    expect(parseDate('   ')).toBe(undefined);
  });

  test('parses US date with AM/PM time (M/D/YYYY h:mm:ss AM)', () => {
    expect(parseDate('3/28/2026 6:24:57 AM')).toBe('2026-03-28T06:24:57');
  });

  test('parses US date with PM time', () => {
    expect(parseDate('3/28/2026 2:15:30 PM')).toBe('2026-03-28T14:15:30');
  });

  test('handles 12 AM correctly (midnight)', () => {
    expect(parseDate('1/15/2026 12:00:00 AM')).toBe('2026-01-15T00:00:00');
  });

  test('handles 12 PM correctly (noon)', () => {
    expect(parseDate('1/15/2026 12:00:00 PM')).toBe('2026-01-15T12:00:00');
  });

  test('parses date-only US format (M/D/YYYY)', () => {
    expect(parseDate('3/30/2026')).toBe('2026-03-30');
  });

  test('parses date with unambiguous day > 12 as DD/MM/YYYY', () => {
    expect(parseDate('28/3/2026')).toBe('2026-03-28');
  });

  test('pads single-digit month and day', () => {
    expect(parseDate('1/5/2026')).toBe('2026-01-05');
  });

  test('returns raw string for non-slash date formats', () => {
    expect(parseDate('2026-03-28')).toBe('2026-03-28');
  });

  test('preserves already-ISO dates', () => {
    expect(parseDate('2026-03-28T14:15:30')).toBe('2026-03-28T14:15:30');
  });

  test('parses 24h time without AM/PM', () => {
    expect(parseDate('3/28/2026 14:15:30')).toBe('2026-03-28T14:15:30');
  });
});

describe('parseNumber', () => {
  test('returns undefined for empty string', () => {
    expect(parseNumber('')).toBe(undefined);
  });

  test('returns undefined for whitespace-only', () => {
    expect(parseNumber('   ')).toBe(undefined);
  });

  test('parses integer', () => {
    expect(parseNumber('42')).toBe(42);
  });

  test('parses EN format with comma thousands', () => {
    expect(parseNumber('51,847')).toBe(51847);
  });

  test('parses EN format with comma thousands and dot decimal', () => {
    expect(parseNumber('1,922.85')).toBe(1922.85);
  });

  test('parses IT format with dot thousands and comma decimal', () => {
    expect(parseNumber('1.234,56')).toBe(1234.56);
  });

  test('parses plain decimal', () => {
    expect(parseNumber('99.99')).toBe(99.99);
  });

  test('parses zero', () => {
    expect(parseNumber('0')).toBe(0);
  });

  test('parses negative number', () => {
    expect(parseNumber('-100')).toBe(-100);
  });

  test('returns undefined for non-numeric string', () => {
    expect(parseNumber('abc')).toBe(undefined);
  });

  test('property: integer round-trip', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -999999, max: 999999 }),
        (n) => parseNumber(String(n)) === n,
      ),
    );
  });
});

describe('parseCurrency', () => {
  test('returns undefined for empty string', () => {
    expect(parseCurrency('')).toBe(undefined);
  });

  test('strips euro sign and parses EN format', () => {
    expect(parseCurrency('€ 1,922.85')).toBe(1922.85);
  });

  test('strips dollar sign and parses', () => {
    expect(parseCurrency('$100.00')).toBe(100);
  });

  test('parses EN number without currency symbol', () => {
    expect(parseCurrency('51,847')).toBe(51847);
  });

  test('parses IT number without currency symbol', () => {
    expect(parseCurrency('1.234,56')).toBe(1234.56);
  });

  test('returns undefined for non-numeric string', () => {
    expect(parseCurrency('abc')).toBe(undefined);
  });
});

describe('parseBoolean', () => {
  test.each(['sì', 'si', 'yes', '1', 'true'])('returns true for "%s"', (input) => {
    expect(parseBoolean(input)).toBe(true);
  });

  test.each(['no', '0', 'false', ''])('returns false for "%s"', (input) => {
    expect(parseBoolean(input)).toBe(false);
  });

  test('returns undefined for unrecognized value', () => {
    expect(parseBoolean('maybe')).toBe(undefined);
  });

  test('trims whitespace', () => {
    expect(parseBoolean('  yes  ')).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(parseBoolean('YES')).toBe(true);
    expect(parseBoolean('True')).toBe(true);
    expect(parseBoolean('NO')).toBe(false);
  });
});
