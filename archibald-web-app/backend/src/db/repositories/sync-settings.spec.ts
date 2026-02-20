import { describe, test, expect, vi } from 'vitest';
import type { DbPool } from '../pool';
import type { QueryResult } from 'pg';

function createMockPool(queryFn: ReturnType<typeof vi.fn>): DbPool {
  return {
    query: queryFn,
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

const ALL_SETTINGS_ROWS = [
  { sync_type: 'orders', interval_minutes: 10, enabled: true, updated_at: '2026-01-01T00:00:00Z' },
  { sync_type: 'customers', interval_minutes: 15, enabled: true, updated_at: '2026-01-01T00:00:00Z' },
  { sync_type: 'ddt', interval_minutes: 20, enabled: true, updated_at: '2026-01-01T00:00:00Z' },
  { sync_type: 'invoices', interval_minutes: 20, enabled: true, updated_at: '2026-01-01T00:00:00Z' },
  { sync_type: 'products', interval_minutes: 30, enabled: true, updated_at: '2026-01-01T00:00:00Z' },
  { sync_type: 'prices', interval_minutes: 60, enabled: false, updated_at: '2026-01-01T00:00:00Z' },
];

describe('getAllIntervals', () => {
  test('maps all rows to a Record keyed by sync_type', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: ALL_SETTINGS_ROWS,
      rowCount: 6,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getAllIntervals } = await import('./sync-settings');
    const result = await getAllIntervals(pool);

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('SELECT sync_type, interval_minutes FROM system.sync_settings'),
    );
    expect(result).toEqual({
      orders: 10,
      customers: 15,
      ddt: 20,
      invoices: 20,
      products: 30,
      prices: 60,
    });
  });

  test('returns empty object when no settings exist', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getAllIntervals } = await import('./sync-settings');
    const result = await getAllIntervals(pool);

    expect(result).toEqual({});
  });
});

describe('getInterval', () => {
  test('returns interval_minutes for the requested sync type', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [{ interval_minutes: 10 }],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getInterval } = await import('./sync-settings');
    const result = await getInterval(pool, 'orders');

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('WHERE sync_type = $1'),
      ['orders'],
    );
    expect(result).toBe(10);
  });

  test('throws when sync type is not found', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getInterval } = await import('./sync-settings');

    await expect(getInterval(pool, 'orders')).rejects.toThrow(
      'Sync setting not found for type: orders',
    );
  });
});

describe('updateInterval', () => {
  test('executes UPDATE with correct parameters', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { updateInterval } = await import('./sync-settings');
    await updateInterval(pool, 'customers', 25);

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE system.sync_settings SET interval_minutes = $2'),
      ['customers', 25],
    );
  });
});

describe('isEnabled', () => {
  test('returns true when sync type is enabled', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [{ enabled: true }],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { isEnabled } = await import('./sync-settings');
    const result = await isEnabled(pool, 'orders');

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('SELECT enabled FROM system.sync_settings'),
      ['orders'],
    );
    expect(result).toBe(true);
  });

  test('returns false when sync type is disabled', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [{ enabled: false }],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { isEnabled } = await import('./sync-settings');
    const result = await isEnabled(pool, 'prices');

    expect(result).toBe(false);
  });

  test('throws when sync type is not found', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { isEnabled } = await import('./sync-settings');

    await expect(isEnabled(pool, 'orders')).rejects.toThrow(
      'Sync setting not found for type: orders',
    );
  });
});

describe('setEnabled', () => {
  test('executes UPDATE with enabled = true', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { setEnabled } = await import('./sync-settings');
    await setEnabled(pool, 'ddt', true);

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE system.sync_settings SET enabled = $2'),
      ['ddt', true],
    );
  });

  test('executes UPDATE with enabled = false', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { setEnabled } = await import('./sync-settings');
    await setEnabled(pool, 'invoices', false);

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('SET enabled = $2'),
      ['invoices', false],
    );
  });
});
