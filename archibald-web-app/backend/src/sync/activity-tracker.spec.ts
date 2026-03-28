import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { getAgentStatus, ACTIVE_THRESHOLD_MS, IDLE_THRESHOLD_MS } from './activity-tracker';

describe('getAgentStatus', () => {
  const now = new Date('2026-03-28T12:00:00Z');

  test('returns "offline" when lastActivityAt is null', () => {
    expect(getAgentStatus(null, now)).toBe('offline');
  });

  test('returns "active" when last activity is within 2 hours', () => {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    expect(getAgentStatus(oneHourAgo, now)).toBe('active');
  });

  test('returns "active" at exact 2h boundary', () => {
    const exactlyTwoHoursAgo = new Date(now.getTime() - ACTIVE_THRESHOLD_MS);
    expect(getAgentStatus(exactlyTwoHoursAgo, now)).toBe('active');
  });

  test('returns "idle" when last activity is between 2h and 24h ago', () => {
    const tenHoursAgo = new Date(now.getTime() - 10 * 60 * 60 * 1000);
    expect(getAgentStatus(tenHoursAgo, now)).toBe('idle');
  });

  test('returns "idle" at exact 24h boundary', () => {
    const exactlyTwentyFourHoursAgo = new Date(now.getTime() - IDLE_THRESHOLD_MS);
    expect(getAgentStatus(exactlyTwentyFourHoursAgo, now)).toBe('idle');
  });

  test('returns "offline" when last activity is more than 24h ago', () => {
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    expect(getAgentStatus(twoDaysAgo, now)).toBe('offline');
  });

  test('returns "idle" 1ms after active threshold', () => {
    const justPastActive = new Date(now.getTime() - ACTIVE_THRESHOLD_MS - 1);
    expect(getAgentStatus(justPastActive, now)).toBe('idle');
  });

  test('returns "offline" 1ms after idle threshold', () => {
    const justPastIdle = new Date(now.getTime() - IDLE_THRESHOLD_MS - 1);
    expect(getAgentStatus(justPastIdle, now)).toBe('offline');
  });

  test('elapsed time determines status monotonically', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 7 * 24 * 60 * 60 * 1000 }),
        (elapsedMs) => {
          const lastActivity = new Date(now.getTime() - elapsedMs);
          const status = getAgentStatus(lastActivity, now);

          if (elapsedMs <= ACTIVE_THRESHOLD_MS) return status === 'active';
          if (elapsedMs <= IDLE_THRESHOLD_MS) return status === 'idle';
          return status === 'offline';
        },
      ),
    );
  });
});
