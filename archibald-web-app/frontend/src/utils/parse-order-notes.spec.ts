import { describe, expect, test } from 'vitest';
import { parseOrderNotesForEdit, NO_SHIPPING_MARKER } from './parse-order-notes';

describe('parseOrderNotesForEdit', () => {
  test('detects marker on first line and extracts clean notes', () => {
    expect(parseOrderNotesForEdit(`${NO_SHIPPING_MARKER}\nconsegna urgente`)).toEqual({
      noShipping: true,
      notes: 'consegna urgente',
    });
  });

  test('detects marker alone (no notes)', () => {
    expect(parseOrderNotesForEdit(NO_SHIPPING_MARKER)).toEqual({
      noShipping: true,
      notes: '',
    });
  });

  test('no marker → noShipping false, notes preserved', () => {
    expect(parseOrderNotesForEdit('consegna urgente')).toEqual({
      noShipping: false,
      notes: 'consegna urgente',
    });
  });

  test('null input → empty result', () => {
    expect(parseOrderNotesForEdit(null)).toEqual({ noShipping: false, notes: '' });
  });

  test('undefined input → empty result', () => {
    expect(parseOrderNotesForEdit(undefined)).toEqual({ noShipping: false, notes: '' });
  });

  test('empty string → empty result', () => {
    expect(parseOrderNotesForEdit('')).toEqual({ noShipping: false, notes: '' });
  });

  test('marker in second line is NOT treated as flag', () => {
    expect(parseOrderNotesForEdit(`prima riga\n${NO_SHIPPING_MARKER}`)).toEqual({
      noShipping: false,
      notes: `prima riga\n${NO_SHIPPING_MARKER}`,
    });
  });
});
