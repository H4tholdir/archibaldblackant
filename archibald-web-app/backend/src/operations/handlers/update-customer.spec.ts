import { describe, expect, test } from 'vitest';
import { buildCustomerDiff } from './update-customer';

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
