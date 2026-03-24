import { describe, test, expect } from 'vitest';
import { buildOrderNotesText } from '../utils/order-notes';

describe('buildOrderNotesText', () => {
  test('returns empty string when neither noShipping nor notes', () => {
    expect(buildOrderNotesText()).toBe('');
    expect(buildOrderNotesText(false, '')).toBe('');
    expect(buildOrderNotesText(false, '   ')).toBe('');
    expect(buildOrderNotesText(undefined, undefined)).toBe('');
  });

  test('returns no-shipping text when only noShipping is true', () => {
    expect(buildOrderNotesText(true)).toBe('NO SPESE DI SPEDIZIONE');
    expect(buildOrderNotesText(true, '')).toBe('NO SPESE DI SPEDIZIONE');
    expect(buildOrderNotesText(true, '  ')).toBe('NO SPESE DI SPEDIZIONE');
  });

  test('returns notes when only notes provided', () => {
    expect(buildOrderNotesText(false, 'Consegna al mattino')).toBe('Consegna al mattino');
  });

  test('trims whitespace from notes', () => {
    expect(buildOrderNotesText(false, '  Consegna al mattino  ')).toBe('Consegna al mattino');
  });

  test('combines no-shipping and notes with newline when both provided', () => {
    expect(buildOrderNotesText(true, 'Consegna urgente')).toBe(
      'NO SPESE DI SPEDIZIONE\nConsegna urgente',
    );
  });

  test('no-shipping always comes before notes', () => {
    const result = buildOrderNotesText(true, 'Note varie');
    const lines = result.split('\n');
    expect(lines).toEqual(['NO SPESE DI SPEDIZIONE', 'Note varie']);
  });
});
