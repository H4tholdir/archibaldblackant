import { describe, test, expect, afterEach } from 'vitest';
import { relayTimeout } from './relay-timeout';

describe('relayTimeout', () => {
  afterEach(() => {
    delete process.env.BOT_RELAY_TIMEOUT_MULTIPLIER;
  });

  test('returns base value when multiplier not set', () => {
    expect(relayTimeout(3000)).toBe(3000);
  });

  test('returns base value with multiplier 1.0', () => {
    process.env.BOT_RELAY_TIMEOUT_MULTIPLIER = '1.0';
    expect(relayTimeout(5000)).toBe(5000);
  });

  test('scales by 2.5 for relay mode', () => {
    process.env.BOT_RELAY_TIMEOUT_MULTIPLIER = '2.5';
    expect(relayTimeout(3000)).toBe(7500);
  });

  test('rounds up fractional results', () => {
    process.env.BOT_RELAY_TIMEOUT_MULTIPLIER = '1.3';
    expect(relayTimeout(3000)).toBe(3900);
  });

  test('handles 2000ms base', () => {
    process.env.BOT_RELAY_TIMEOUT_MULTIPLIER = '2.5';
    expect(relayTimeout(2000)).toBe(5000);
  });

  test('handles 6000ms base', () => {
    process.env.BOT_RELAY_TIMEOUT_MULTIPLIER = '2.5';
    expect(relayTimeout(6000)).toBe(15000);
  });
});
