import { describe, it, expect } from 'vitest';
import { shouldSendForCustomer } from './tick';

describe('shouldSendForCustomer', () => {
  it('restituisce false se sync non è fresca', () => {
    const staleDate = new Date(Date.now() - 7 * 60 * 60 * 1000);
    expect(shouldSendForCustomer(staleDate, 6 * 60 * 60 * 1000)).toBe(false);
  });

  it('restituisce true se sync è recente', () => {
    const freshDate = new Date(Date.now() - 1 * 60 * 60 * 1000);
    expect(shouldSendForCustomer(freshDate, 6 * 60 * 60 * 1000)).toBe(true);
  });

  it('restituisce false se syncAt è null', () => {
    expect(shouldSendForCustomer(null, 6 * 60 * 60 * 1000)).toBe(false);
  });
});
