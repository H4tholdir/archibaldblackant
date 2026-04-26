import { describe, expect, test } from 'vitest';
import { computeDueDateFromChip } from './reminders.service';

describe('computeDueDateFromChip', () => {
  test("'Oggi' restituisce la data odierna (days=0)", () => {
    const today = new Date().toISOString().split('T')[0];
    expect(computeDueDateFromChip('Oggi').split('T')[0]).toBe(today);
  });

  test("'Domani' restituisce la data di domani", () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
    expect(computeDueDateFromChip('Domani').split('T')[0]).toBe(tomorrow);
  });

  test("'3 giorni' restituisce tra 3 giorni", () => {
    const in3 = new Date(Date.now() + 3 * 86_400_000).toISOString().split('T')[0];
    expect(computeDueDateFromChip('3 giorni').split('T')[0]).toBe(in3);
  });

  test("chip sconosciuto lancia errore", () => {
    expect(() => computeDueDateFromChip('Dopodomani')).toThrow('Unknown chip: Dopodomani');
  });
});
