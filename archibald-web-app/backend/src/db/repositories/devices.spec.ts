import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import type { QueryResult } from 'pg';

function createMockPool(queryFn: ReturnType<typeof vi.fn>): DbPool {
  return {
    query: queryFn,
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
}

const SAMPLE_DEVICE_ROW = {
  id: 'device-abc-123',
  user_id: 'user-1',
  device_identifier: 'fp-xyz-789',
  platform: 'iOS',
  device_name: 'iPhone',
  last_seen: 1700000000000,
  created_at: 1699000000000,
};

describe('registerDevice', () => {
  test('inserts device with ON CONFLICT and returns mapped UserDevice', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [SAMPLE_DEVICE_ROW],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { registerDevice } = await import('./devices');
    const result = await registerDevice(pool, 'user-1', 'fp-xyz-789', 'iOS', 'iPhone');

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agents.user_devices'),
      expect.arrayContaining(['user-1', 'fp-xyz-789', 'iOS', 'iPhone']),
    );
    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT'),
      expect.any(Array),
    );
    expect(result).toEqual({
      id: 'device-abc-123',
      userId: 'user-1',
      deviceIdentifier: 'fp-xyz-789',
      platform: 'iOS',
      deviceName: 'iPhone',
      lastSeen: 1700000000000,
      createdAt: 1699000000000,
    });
  });
});

describe('getUserDevices', () => {
  test('returns mapped array ordered by last_seen DESC', async () => {
    const olderDevice = {
      ...SAMPLE_DEVICE_ROW,
      id: 'device-old',
      device_identifier: 'fp-old',
      last_seen: 1690000000000,
    };
    const queryFn = vi.fn().mockResolvedValue({
      rows: [SAMPLE_DEVICE_ROW, olderDevice],
      rowCount: 2,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getUserDevices } = await import('./devices');
    const result = await getUserDevices(pool, 'user-1');

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY last_seen DESC'),
      ['user-1'],
    );
    expect(result).toEqual([
      {
        id: 'device-abc-123',
        userId: 'user-1',
        deviceIdentifier: 'fp-xyz-789',
        platform: 'iOS',
        deviceName: 'iPhone',
        lastSeen: 1700000000000,
        createdAt: 1699000000000,
      },
      {
        id: 'device-old',
        userId: 'user-1',
        deviceIdentifier: 'fp-old',
        platform: 'iOS',
        deviceName: 'iPhone',
        lastSeen: 1690000000000,
        createdAt: 1699000000000,
      },
    ]);
  });

  test('returns empty array when user has no devices', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getUserDevices } = await import('./devices');
    const result = await getUserDevices(pool, 'user-no-devices');

    expect(result).toEqual([]);
  });
});

describe('deleteDevice', () => {
  test('deletes device by id', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { deleteDevice } = await import('./devices');
    await deleteDevice(pool, 'device-abc-123');

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM agents.user_devices WHERE id'),
      ['device-abc-123'],
    );
  });
});

describe('cleanupOldDevices', () => {
  test('deletes devices older than threshold and returns count', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 5,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const now = Date.now();
    const { cleanupOldDevices } = await import('./devices');
    const result = await cleanupOldDevices(pool, 90);

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM agents.user_devices WHERE last_seen'),
      [expect.any(Number)],
    );

    const calledThreshold = (queryFn.mock.calls[0][1] as number[])[0];
    const expectedThreshold = now - 90 * 86_400_000;
    expect(Math.abs(calledThreshold - expectedThreshold)).toBeLessThan(1000);

    expect(result).toBe(5);
  });

  test('defaults to 90 days threshold', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const now = Date.now();
    const { cleanupOldDevices } = await import('./devices');
    await cleanupOldDevices(pool);

    const calledThreshold = (queryFn.mock.calls[0][1] as number[])[0];
    const expectedThreshold = now - 90 * 86_400_000;
    expect(Math.abs(calledThreshold - expectedThreshold)).toBeLessThan(1000);
  });

  test('returns zero when no old devices exist', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { cleanupOldDevices } = await import('./devices');
    const result = await cleanupOldDevices(pool);

    expect(result).toBe(0);
  });
});
