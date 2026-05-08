import { describe, expect, test } from 'vitest';
import { stalenessScore, getTargetFreshnessMs } from './adaptive-scheduler';

describe('stalenessScore', () => {
  test('ritorna 2.0 se lastSyncAt è null (mai sincronizzato)', () => {
    expect(stalenessScore(null, 20 * 60_000)).toBe(2.0);
  });

  test('ritorna ~0 se sincronizzato ora', () => {
    expect(stalenessScore(new Date(), 20 * 60_000)).toBeCloseTo(0, 1);
  });

  test('ritorna 1.0 se il tempo trascorso è uguale al target (alla soglia)', () => {
    const targetMs = 20 * 60_000;
    const lastSync = new Date(Date.now() - targetMs);
    expect(stalenessScore(lastSync, targetMs)).toBeCloseTo(1.0, 1);
  });

  test('ritorna >1 se dati scaduti (tempo > target)', () => {
    const targetMs = 20 * 60_000;
    const lastSync = new Date(Date.now() - targetMs * 1.5);
    expect(stalenessScore(lastSync, targetMs)).toBeGreaterThan(1.0);
  });
});

describe('getTargetFreshnessMs', () => {
  test('sync-orders active: 20 minuti', () => {
    expect(getTargetFreshnessMs('sync-orders', 'active')).toBe(20 * 60_000);
  });

  test('sync-ddt idle: null (sospeso)', () => {
    expect(getTargetFreshnessMs('sync-ddt', 'idle')).toBeNull();
  });

  test('sync-orders offline: null (sospeso)', () => {
    expect(getTargetFreshnessMs('sync-orders', 'offline')).toBeNull();
  });

  test('sync-tracking active: 15 minuti', () => {
    expect(getTargetFreshnessMs('sync-tracking', 'active')).toBe(15 * 60_000);
  });
});
