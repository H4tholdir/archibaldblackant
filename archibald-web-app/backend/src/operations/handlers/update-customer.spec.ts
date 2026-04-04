import { describe, expect, test } from 'vitest';
import type { CustomerDiff } from '../../types';

function buildCustomerDiff(
  original: Record<string, string | null>,
  edited: Record<string, string | null>,
): CustomerDiff {
  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(edited)) {
    if (edited[key] !== original[key]) {
      diff[key] = edited[key];
    }
  }
  return diff as CustomerDiff;
}

describe('buildCustomerDiff', () => {
  test('diff vuoto se nessuna modifica', () => {
    const original = { name: 'Test', email: 'test@test.com' };
    expect(buildCustomerDiff(original, original)).toEqual({});
  });

  test('diff include solo campi modificati', () => {
    const original = { name: 'Test', email: 'old@test.com' };
    const edited = { name: 'Test', email: 'new@test.com' };
    expect(buildCustomerDiff(original, edited)).toEqual({ email: 'new@test.com' });
  });

  test('diff include agentNotes', () => {
    const original = { agentNotes: null };
    const edited = { agentNotes: 'note' };
    expect(buildCustomerDiff(original, edited)).toEqual({ agentNotes: 'note' });
  });
});
