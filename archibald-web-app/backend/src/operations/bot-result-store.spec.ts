import { describe, expect, test, vi } from 'vitest';
import { checkBotResult, saveBotResult, clearBotResult } from './bot-result-store';
import type { DbPool } from '../db/pool';

function createMockPool(rows: Record<string, unknown>[] = []): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

const userId = 'user-42';
const operationType = 'submit-order';
const operationKey = 'pending-abc';

describe('checkBotResult', () => {
  test('returns result_data when found', async () => {
    const savedData = { orderId: 'ORD-999' };
    const pool = createMockPool([{ result_data: savedData }]);

    const result = await checkBotResult(pool, userId, operationType, operationKey);

    expect(result).toEqual({ orderId: 'ORD-999' });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT result_data FROM agents.bot_results'),
      [userId, operationType, operationKey],
    );
  });

  test('returns null when not found', async () => {
    const pool = createMockPool([]);

    const result = await checkBotResult(pool, userId, operationType, operationKey);

    expect(result).toBeNull();
  });
});

describe('saveBotResult', () => {
  test('calls INSERT with correct parameters', async () => {
    const pool = createMockPool();
    const resultData = { orderId: 'ORD-123' };

    await saveBotResult(pool, userId, operationType, operationKey, resultData);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agents.bot_results'),
      [userId, operationType, operationKey, JSON.stringify(resultData)],
    );
  });
});

describe('clearBotResult', () => {
  test('calls DELETE with correct parameters', async () => {
    const pool = createMockPool();

    await clearBotResult(pool, userId, operationType, operationKey);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM agents.bot_results'),
      [userId, operationType, operationKey],
    );
  });
});
