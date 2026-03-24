import { describe, expect, test } from 'vitest';
import { buildOrderNotesText } from './order-notes';

const MARKER = 'NO SPESE DI SPEDIZIONE';

describe('buildOrderNotesText', () => {
  test('noShipping=true + notes → marker then notes', () => {
    expect(buildOrderNotesText(true, 'consegna urgente')).toBe(`${MARKER}\nconsegna urgente`);
  });

  test('noShipping=true + no notes → marker only', () => {
    expect(buildOrderNotesText(true, undefined)).toBe(MARKER);
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
