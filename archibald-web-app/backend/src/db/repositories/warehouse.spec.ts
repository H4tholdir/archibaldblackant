import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';

function createMockPool(queryFn?: DbPool['query']): DbPool {
  const query = queryFn ?? vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] }));
  return {
    query,
    withTransaction: vi.fn(async (fn) => fn({ query })),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

const TEST_USER_ID = 'user-warehouse-001';

describe('getBoxes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns boxes with item counts from aggregated query', async () => {
    const boxRows = [
      { name: 'Box A', created_at: 1700000000, updated_at: 1700000001, items_count: 3, total_quantity: 15, available_count: 2 },
      { name: 'Box B', created_at: 1700000002, updated_at: 1700000003, items_count: 1, total_quantity: 5, available_count: 1 },
    ];
    const pool = createMockPool(
      vi.fn(async () => ({ rows: boxRows, rowCount: 2, command: '', oid: 0, fields: [] })),
    );

    const { getBoxes } = await import('./warehouse');
    const result = await getBoxes(pool, TEST_USER_ID);

    expect(result).toEqual([
      { name: 'Box A', createdAt: 1700000000, updatedAt: 1700000001, itemsCount: 3, totalQuantity: 15, availableCount: 2 },
      { name: 'Box B', createdAt: 1700000002, updatedAt: 1700000003, itemsCount: 1, totalQuantity: 5, availableCount: 1 },
    ]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('warehouse_items'),
      [TEST_USER_ID],
    );
  });

  test('returns empty array when no boxes exist', async () => {
    const pool = createMockPool();

    const { getBoxes } = await import('./warehouse');
    const result = await getBoxes(pool, TEST_USER_ID);

    expect(result).toEqual([]);
  });
});

describe('createBox', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('inserts box and returns it when name is unique', async () => {
    const now = 1700000000;
    const queryFn = vi.fn(async (text: string) => {
      if (text.includes('INSERT INTO agents.warehouse_boxes')) {
        return {
          rows: [{ id: 1, user_id: TEST_USER_ID, name: 'New Box', description: 'desc', color: '#ff0000', created_at: now, updated_at: now }],
          rowCount: 1,
          command: '', oid: 0, fields: [],
        };
      }
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });
    const pool = createMockPool(queryFn);

    const { createBox } = await import('./warehouse');
    const result = await createBox(pool, TEST_USER_ID, 'New Box', 'desc', '#ff0000');

    expect(result).toEqual({
      id: 1,
      userId: TEST_USER_ID,
      name: 'New Box',
      description: 'desc',
      color: '#ff0000',
      createdAt: now,
      updatedAt: now,
    });
    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agents.warehouse_boxes'),
      expect.arrayContaining([TEST_USER_ID, 'New Box']),
    );
  });

  test('throws when box name already exists for user', async () => {
    const queryFn = vi.fn(async () => {
      const error = new Error('duplicate key value violates unique constraint');
      (error as any).code = '23505';
      throw error;
    });
    const pool = createMockPool(queryFn);

    const { createBox } = await import('./warehouse');

    await expect(createBox(pool, TEST_USER_ID, 'Existing Box')).rejects.toThrow();
  });
});

describe('addItem', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('inserts item and returns mapped result', async () => {
    const itemRow = {
      id: 42,
      user_id: TEST_USER_ID,
      article_code: 'ART-001',
      description: 'Test Article',
      quantity: 10,
      box_name: 'Box A',
      reserved_for_order: null,
      sold_in_order: null,
      uploaded_at: 1700000000,
      device_id: 'device-123',
      customer_name: null,
      sub_client_name: null,
      order_date: null,
      order_number: null,
    };
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [itemRow], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const { addItem } = await import('./warehouse');
    const result = await addItem(pool, TEST_USER_ID, 'ART-001', 'Test Article', 10, 'Box A', 'device-123');

    expect(result).toEqual({
      id: 42,
      userId: TEST_USER_ID,
      articleCode: 'ART-001',
      description: 'Test Article',
      quantity: 10,
      boxName: 'Box A',
      reservedForOrder: null,
      soldInOrder: null,
      uploadedAt: 1700000000,
      deviceId: 'device-123',
      customerName: null,
      subClientName: null,
      orderDate: null,
      orderNumber: null,
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agents.warehouse_items'),
      expect.arrayContaining([TEST_USER_ID, 'ART-001', 'Test Article', 10, 'Box A', 'device-123']),
    );
  });
});

describe('moveItems', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('updates box_name for unreserved/unsold items and returns moved count', async () => {
    const queryFn = vi.fn(async () => ({
      rows: [],
      rowCount: 3,
      command: '', oid: 0, fields: [],
    }));
    const pool = createMockPool(queryFn);

    const { moveItems } = await import('./warehouse');
    const result = await moveItems(pool, TEST_USER_ID, [1, 2, 3], 'Box B');

    expect(result).toBe(3);
    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE agents.warehouse_items'),
      expect.arrayContaining(['Box B', TEST_USER_ID]),
    );
    const callText = queryFn.mock.calls[0][0] as string;
    expect(callText).toContain('reserved_for_order IS NULL');
    expect(callText).toContain('sold_in_order IS NULL');
  });

  test('returns 0 when no item ids provided', async () => {
    const pool = createMockPool();

    const { moveItems } = await import('./warehouse');
    const result = await moveItems(pool, TEST_USER_ID, [], 'Box B');

    expect(result).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('deleteItem', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('deletes item when not reserved and not sold', async () => {
    const queryFn = vi.fn(async () => ({
      rows: [],
      rowCount: 1,
      command: '', oid: 0, fields: [],
    }));
    const pool = createMockPool(queryFn);

    const { deleteItem } = await import('./warehouse');
    const result = await deleteItem(pool, TEST_USER_ID, 42);

    expect(result).toBe(true);
    const callText = queryFn.mock.calls[0][0] as string;
    expect(callText).toContain('DELETE FROM agents.warehouse_items');
    expect(callText).toContain('reserved_for_order IS NULL');
    expect(callText).toContain('sold_in_order IS NULL');
    expect(queryFn).toHaveBeenCalledWith(
      expect.any(String),
      [42, TEST_USER_ID],
    );
  });

  test('returns false when item is reserved or sold', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
    );

    const { deleteItem } = await import('./warehouse');
    const result = await deleteItem(pool, TEST_USER_ID, 42);

    expect(result).toBe(false);
  });
});
