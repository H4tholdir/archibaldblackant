import { describe, expect, test } from 'vitest';
import { avatarGradient, customerInitials } from './customer-avatar';

describe('avatarGradient', () => {
  test('restituisce una stringa CSS gradient', () => {
    expect(avatarGradient('ABC123')).toMatch(/^linear-gradient/);
  });

  test('è deterministica — stesso erpId sempre stesso gradient', () => {
    expect(avatarGradient('ABC123')).toBe(avatarGradient('ABC123'));
  });

  test('erpId diversi possono avere gradient diversi', () => {
    const results = new Set(
      ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF'].map(avatarGradient)
    );
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('customerInitials', () => {
  test('due parole → due iniziali uppercase', () => {
    expect(customerInitials('Rossi Mario')).toBe('RM');
  });

  test('una parola → prima lettera', () => {
    expect(customerInitials('Acme')).toBe('A');
  });

  test('tre parole → solo le prime due iniziali', () => {
    expect(customerInitials('Ferrari e Figli')).toBe('FE');
  });

  test('stringa vuota → stringa vuota', () => {
    expect(customerInitials('')).toBe('');
  });
});
