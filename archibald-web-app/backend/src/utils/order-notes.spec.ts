import { describe, expect, test } from 'vitest';
import { buildOrderNotesText, NO_SHIPPING_MARKER } from './order-notes';

describe('buildOrderNotesText', () => {
  test('noShipping=true + notes → marker then notes', () => {
    expect(buildOrderNotesText(true, 'consegna urgente')).toBe(`${NO_SHIPPING_MARKER}\nconsegna urgente`);
  });

  test('noShipping=true + no notes → marker only', () => {
    expect(buildOrderNotesText(true, undefined)).toBe(NO_SHIPPING_MARKER);
  });

  test('noShipping=false + notes → notes only', () => {
    expect(buildOrderNotesText(false, 'solo note')).toBe('solo note');
  });

  test('noShipping=undefined + notes → notes only', () => {
    expect(buildOrderNotesText(undefined, 'testo')).toBe('testo');
  });

  test('noShipping=false + empty notes → empty string', () => {
    expect(buildOrderNotesText(false, '')).toBe('');
  });

  test('noShipping=undefined + undefined notes → empty string', () => {
    expect(buildOrderNotesText(undefined, undefined)).toBe('');
  });
});
