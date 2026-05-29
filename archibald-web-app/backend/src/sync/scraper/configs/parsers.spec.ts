import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import {
  parseDate,
  parseNumber,
  parseBoolean,
  parseCurrency,
  parseErpId,
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
    // ERP locale IT — dot come separatore migliaia (X.YYY con X>0 e YYY=3 cifre)
    { input: '1.895', expected: 'it' },    // QTY fattura: 1895 non 1.895
    { input: '12.345', expected: 'it' },   // IT thousands
    { input: '1.000', expected: 'it' },    // IT zero-padded thousands
    { input: '0.895', expected: 'en' },    // X=0 → decimale EN
    { input: '52.38', expected: 'en' },    // 2 cifre → decimale EN
    { input: '1.8', expected: 'en' },      // 1 cifra → decimale EN
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
    // ERP IT locale: separatore migliaia → intero
    { input: '1.895', expected: 1895 },   // QTY fattura: il bug in prod
    { input: '12.345', expected: 12345 },
    { input: '0.895', expected: 0.895 },  // decimale EN
  ])('normalizes "$input" to $expected', ({ input, expected }) => {
    expect(normalizeNumber(input)).toBe(expected);
  });
});

describe('disambiguateMDY', () => {
  test('p1 > 12 significa giorno > 12: DD/MM → month=p2, day=p1', () => {
    expect(disambiguateMDY(28, 3)).toEqual({ month: 3, day: 28 });
  });

  test('p2 > 12 significa giorno > 12: MM/DD → month=p1, day=p2', () => {
    expect(disambiguateMDY(3, 28)).toEqual({ month: 3, day: 28 });
  });

  test('caso ambiguo (entrambi ≤ 12): default IT D/M — textContent ERP è in formato italiano DD/MM', () => {
    // DevExpress XAF usa formato IT DD/MM/YYYY nel textContent delle celle.
    // Confermato in prod su ORD/26008226: "06/05/2026" = 6 maggio (D/M), non giugno 5 (M/D).
    // p1=5, p2=12 → D/M: giorno=5, mese=12 → 5 dicembre.
    expect(disambiguateMDY(5, 12)).toEqual({ month: 12, day: 5 });
  });

  test('caso ambiguo speculare: "3/5/2026" IT D/M → 3 maggio', () => {
    expect(disambiguateMDY(3, 5)).toEqual({ month: 5, day: 3 });
  });
});

describe('parseDate — formato IT D/M ERP (regressione prod)', () => {
  test('"06/05/2026 09:46:10" deve dare 6 maggio, non 5 giugno', () => {
    // Confermato in prod su ORD/26008226: ERP mostra "06/05/2026 09:46:10" = 6 maggio 2026 (D/M).
    expect(parseDate('06/05/2026 09:46:10')).toBe('2026-05-06T09:46:10');
  });

  test('"12/05/2026" deve dare 12 maggio, non 5 dicembre', () => {
    // D/M: giorno=12, mese=5 → maggio 12.
    expect(parseDate('12/05/2026')).toBe('2026-05-12');
  });

  test('"11/05/2026" deve dare 11 maggio, non 5 novembre', () => {
    // D/M: giorno=11, mese=5 → maggio 11.
    expect(parseDate('11/05/2026')).toBe('2026-05-11');
  });
});

describe('normalizeNumber — notazione accounting per negativi (note di credito ERP)', () => {
  test.each([
    // Parentesi contabili formato IT (separatore migliaia = punto, decimale = virgola)
    { input: '(360,65)',     expected: -360.65  },
    { input: '(1.234,56)',   expected: -1234.56 },
    { input: '(3.300)',      expected: -3300    },
    // Parentesi contabili formato EN (separatore migliaia = virgola, decimale = punto)
    { input: '(360.65)',     expected: -360.65  },
    { input: '(1,234.56)',   expected: -1234.56 },
    // Meno in coda formato IT
    { input: '360,65-',     expected: -360.65  },
    { input: '1.234,56-',   expected: -1234.56 },
    // Meno in coda formato EN
    { input: '360.65-',     expected: -360.65  },
    { input: '1,234.56-',   expected: -1234.56 },
  ])('converte "$input" in $expected', ({ input, expected }) => {
    expect(normalizeNumber(input)).toBe(expected);
  });

  test('i positivi esistenti non vengono toccati', () => {
    expect(normalizeNumber('360,65')).toBe(360.65);
    expect(normalizeNumber('1.234,56')).toBe(1234.56);
    expect(normalizeNumber('-360,65')).toBe(-360.65);
  });
});

describe('parseDate', () => {
  test('returns undefined for empty string', () => {
    expect(parseDate('')).toBe(undefined);
  });

  test('returns undefined for whitespace-only', () => {
    expect(parseDate('   ')).toBe(undefined);
  });

  test('parses date with day > 12 (non ambigua): p2=28 > 12 → mese=3 giorno=28', () => {
    expect(parseDate('3/28/2026 6:24:57 AM')).toBe('2026-03-28T06:24:57');
  });

  test('parses date with day > 12 (PM): p2=28 > 12 → mese=3 giorno=28', () => {
    expect(parseDate('3/28/2026 2:15:30 PM')).toBe('2026-03-28T14:15:30');
  });

  test('handles 12 AM correctly (midnight)', () => {
    expect(parseDate('1/15/2026 12:00:00 AM')).toBe('2026-01-15T00:00:00');
  });

  test('handles 12 PM correctly (noon)', () => {
    expect(parseDate('1/15/2026 12:00:00 PM')).toBe('2026-01-15T12:00:00');
  });

  test('parses date-only non ambigua (p2=30 > 12): mese=3 giorno=30', () => {
    expect(parseDate('3/30/2026')).toBe('2026-03-30');
  });

  test('parses date with unambiguous day > 12 as DD/MM/YYYY', () => {
    expect(parseDate('28/3/2026')).toBe('2026-03-28');
  });

  test('caso ambiguo (entrambi ≤ 12): default IT D/M — giorno=1, mese=5 → 1 maggio', () => {
    // ERP textContent è in IT D/M/YYYY: "1/5/2026" = giorno=1 mese=5 → 1 maggio
    expect(parseDate('1/5/2026')).toBe('2026-05-01');
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

describe('parseErpId', () => {
  test.each([
    { input: '55.220', expected: '55.220' }, // already canonical
    { input: '55.22',  expected: '55.220' }, // trailing zero lost by JS float
    { input: '55220',  expected: '55.220' }, // no dot (old EN-mode parse)
    { input: '55,220', expected: '55.220' }, // EN comma format from VPS
    { input: '1.610',  expected: '1.610' },  // 3 digits: correct
    { input: '1.61',   expected: '1.610' },  // 2 digits: trailing zero lost
    { input: '1610',   expected: '1.610' },  // no dot
    { input: '48.900', expected: '48.900' }, // correct
    { input: '48.9',   expected: '48.900' }, // 1 digit: 2 trailing zeros lost
    { input: '48900',  expected: '48.900' }, // no dot
    { input: '55.261', expected: '55.261' }, // no trailing zeros: unchanged
    { input: '10.880', expected: '10.880' }, // trailing zero preserved
    { input: '55.200', expected: '55.200' }, // two trailing zeros preserved
  ])('normalizes ERP ID "$input" to "$expected"', ({ input, expected }) => {
    expect(parseErpId(input)).toBe(expected);
  });

  test('returns undefined for empty string', () => {
    expect(parseErpId('')).toBe(undefined);
  });

  test('returns raw trimmed string for non-numeric input', () => {
    expect(parseErpId('abc')).toBe('abc');
  });

  test('property: result always contains a dot for numeric ERP IDs >= 4 digits', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 999999 }),
        (n) => {
          const result = parseErpId(String(n));
          return typeof result === 'string' && result.includes('.');
        },
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
