import { describe, expect, test, afterEach } from 'vitest';
import { stalenessScore, getTargetFreshnessMs, isWithinWorkingHours } from './adaptive-scheduler';

describe('stalenessScore', () => {
  test('ritorna 2.0 se lastSyncAt è null (mai sincronizzato)', () => {
    expect(stalenessScore(null, 20 * 60_000)).toBe(2.0);
  });

  test('ritorna ~0 se sincronizzato ora', () => {
    expect(stalenessScore(new Date(), 20 * 60_000)).toBeCloseTo(0, 1);
  });

  test('ritorna 0 se lastSyncAt è nel futuro (clock skew)', () => {
    const futureDate = new Date(Date.now() + 60_000);
    expect(stalenessScore(futureDate, 20 * 60_000)).toBe(0);
  });

  test('ritorna 0 se targetFreshnessMs <= 0 (target invalido)', () => {
    const lastSync = new Date(Date.now() - 60_000);
    expect(stalenessScore(lastSync, 0)).toBe(0);
    expect(stalenessScore(lastSync, -1)).toBe(0);
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

  test('sync-order-states active: 10 minuti', () => {
    expect(getTargetFreshnessMs('sync-order-states', 'active')).toBe(10 * 60_000);
  });
});

describe('isWithinWorkingHours', () => {
  afterEach(() => {
    delete process.env.SYNC_WORKING_HOURS_START;
    delete process.env.SYNC_WORKING_HOURS_END;
    delete process.env.SYNC_WORKING_HOURS_TZ;
  });

  // Italy in January = CET (UTC+1), so Rome hour = UTC hour + 1
  const jan15utc = (utcHour: number) =>
    new Date(`2026-01-15T${String(utcHour).padStart(2, '0')}:00:00Z`);

  test('true a mezzogiorno (12:00 Rome = 11:00 UTC)', () => {
    expect(isWithinWorkingHours(jan15utc(11))).toBe(true);
  });

  test('true all\'inizio esatto (7:00 Rome = 06:00 UTC)', () => {
    expect(isWithinWorkingHours(jan15utc(6))).toBe(true);
  });

  test('false prima dell\'inizio (6:00 Rome = 05:00 UTC)', () => {
    expect(isWithinWorkingHours(jan15utc(5))).toBe(false);
  });

  test('false al termine esatto (20:00 Rome = 19:00 UTC, escluso)', () => {
    expect(isWithinWorkingHours(jan15utc(19))).toBe(false);
  });

  test('false di notte (3:00 Rome = 02:00 UTC)', () => {
    expect(isWithinWorkingHours(jan15utc(2))).toBe(false);
  });

  test('rispetta variabili env personalizzate', () => {
    process.env.SYNC_WORKING_HOURS_START = '9';
    process.env.SYNC_WORKING_HOURS_END = '17';
    expect(isWithinWorkingHours(jan15utc(7))).toBe(false);  // 8:00 Rome < 9
    expect(isWithinWorkingHours(jan15utc(9))).toBe(true);   // 10:00 Rome ≥ 9
    expect(isWithinWorkingHours(jan15utc(16))).toBe(false); // 17:00 Rome = end, escluso
  });
});
