import { describe, expect, test } from 'vitest';
import { buildRowExtractor } from './header-mapper';
import type { ColumnMapping } from './types';

describe('buildRowExtractor', () => {
  const columns: ColumnMapping[] = [
    { fieldName: 'SALESID', targetField: 'orderNumber' },
    { fieldName: 'CUSTACCOUNT', targetField: 'customerCode' },
    { fieldName: 'AMOUNT', targetField: 'amount', parser: (v) => parseFloat(v.replace(/\./g, '').replace(',', '.')) },
  ];

  const fieldMap: Record<string, number> = {
    SALESID: 0,
    CUSTACCOUNT: 2,
    AMOUNT: 3,
  };

  test('maps cell texts to target fields using fieldMap indices', () => {
    const extractor = buildRowExtractor(columns, fieldMap);
    const row = extractor(['ORD-001', 'ignored', 'C100', '1.234,56']);

    expect(row).toEqual({
      orderNumber: 'ORD-001',
      customerCode: 'C100',
      amount: 1234.56,
    });
  });

  test('applies parser function when provided', () => {
    const cols: ColumnMapping[] = [
      { fieldName: 'QTY', targetField: 'quantity', parser: (v) => parseInt(v, 10) },
    ];
    const map: Record<string, number> = { QTY: 0 };

    const extractor = buildRowExtractor(cols, map);
    const row = extractor(['42']);

    expect(row).toEqual({ quantity: 42 });
  });

  test('returns raw string when no parser is provided', () => {
    const cols: ColumnMapping[] = [
      { fieldName: 'NAME', targetField: 'name' },
    ];
    const map: Record<string, number> = { NAME: 1 };

    const extractor = buildRowExtractor(cols, map);
    const row = extractor(['skip', 'Mario Rossi']);

    expect(row).toEqual({ name: 'Mario Rossi' });
  });

  test('sets undefined for columns missing from fieldMap', () => {
    const cols: ColumnMapping[] = [
      { fieldName: 'SALESID', targetField: 'orderNumber' },
      { fieldName: 'MISSING_FIELD', targetField: 'ghost' },
    ];
    const map: Record<string, number> = { SALESID: 0 };

    const extractor = buildRowExtractor(cols, map);
    const row = extractor(['ORD-001']);

    expect(row).toEqual({
      orderNumber: 'ORD-001',
      ghost: undefined,
    });
  });

  test('sets undefined for out-of-range indices', () => {
    const cols: ColumnMapping[] = [
      { fieldName: 'FAR_AWAY', targetField: 'farValue' },
    ];
    const map: Record<string, number> = { FAR_AWAY: 99 };

    const extractor = buildRowExtractor(cols, map);
    const row = extractor(['only-one-cell']);

    expect(row).toEqual({ farValue: undefined });
  });

  test('handles empty cellTexts array', () => {
    const extractor = buildRowExtractor(columns, fieldMap);
    const row = extractor([]);

    expect(row).toEqual({
      orderNumber: undefined,
      customerCode: undefined,
      amount: undefined,
    });
  });

  test('handles empty columns array', () => {
    const extractor = buildRowExtractor([], fieldMap);
    const row = extractor(['a', 'b', 'c']);

    expect(row).toEqual({});
  });

  test('parser receives empty string for empty cell', () => {
    const receivedValues: string[] = [];
    const cols: ColumnMapping[] = [
      {
        fieldName: 'X',
        targetField: 'x',
        parser: (v) => {
          receivedValues.push(v);
          return v || null;
        },
      },
    ];
    const map: Record<string, number> = { X: 0 };

    const extractor = buildRowExtractor(cols, map);
    extractor(['']);

    expect(receivedValues).toEqual(['']);
  });
});
