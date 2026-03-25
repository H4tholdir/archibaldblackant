import { describe, expect, test, vi } from 'vitest';
import { handleEditOrder, type EditOrderBot, type EditOrderData } from './edit-order';
import type { DbPool } from '../../db/pool';
import { NO_SHIPPING_MARKER } from '../../utils/order-notes';

function createMockPool(): DbPool {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    query,
    withTransaction: vi.fn(async (fn) => fn({ query })),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(result = { success: true, message: 'Order edited' }): EditOrderBot {
  return {
    editOrderInArchibald: vi.fn().mockResolvedValue(result),
    setProgressCallback: vi.fn(),
  };
}

const sampleData: EditOrderData = {
  orderId: 'ORD-001',
  modifications: [{ field: 'quantity', lineIndex: 0, newValue: 5 }],
  updatedItems: [
    {
      articleCode: 'ART-01',
      articleDescription: 'Widget',
      quantity: 5,
      unitPrice: 10,
      discountPercent: 0,
      lineAmount: 50,
      vatPercent: 22,
      vatAmount: 11,
      lineTotalWithVat: 61,
    },
  ],
};

describe('handleEditOrder', () => {
  test('calls bot.editOrderInArchibald with orderId and modifications', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.editOrderInArchibald).toHaveBeenCalledWith('ORD-001', sampleData.modifications, undefined, undefined);
  });

  test('deletes existing articles and saves updated items', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn());

    const deleteCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM agents.order_articles'));
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][1]).toEqual(['ORD-001', 'user-1']);

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.order_articles'));
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toContain('ART-01');
  });

  test('skips article update when updatedItems is undefined', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const data: EditOrderData = { orderId: 'ORD-001', modifications: [{ field: 'x' }] };

    await handleEditOrder(pool, bot, data, 'user-1', vi.fn());

    const deleteCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM agents.order_articles'));
    expect(deleteCalls).toHaveLength(0);
  });

  test('returns success and message from bot', async () => {
    const pool = createMockPool();
    const bot = createMockBot({ success: true, message: 'Done' });

    const result = await handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(result).toEqual({ success: true, message: 'Done' });
  });

  test('throws when bot returns success: false', async () => {
    const pool = createMockPool();
    const bot = createMockBot({ success: false, message: 'Failed to edit' });

    await expect(
      handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn()),
    ).rejects.toThrow('Failed to edit');
  });

  test('reports progress', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleEditOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  test('passes notes to bot when data.notes is defined', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const dataWithNotes: EditOrderData = { ...sampleData, notes: 'Urgente' };

    await handleEditOrder(pool, bot, dataWithNotes, 'user-1', vi.fn());

    expect(bot.editOrderInArchibald).toHaveBeenCalledWith(
      'ORD-001',
      sampleData.modifications,
      'Urgente',
      undefined,
    );
  });

  test('does not pass notes to bot when data.notes is undefined', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.editOrderInArchibald).toHaveBeenCalledWith(
      'ORD-001',
      sampleData.modifications,
      undefined,
      undefined,
    );
  });

  test('updates order_records.notes in DB when data.notes is defined', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const dataWithNotes: EditOrderData = { ...sampleData, notes: 'Test note' };

    await handleEditOrder(pool, bot, dataWithNotes, 'user-1', vi.fn());

    const notesCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) =>
        typeof c[0] === 'string' &&
        (c[0] as string).includes('UPDATE agents.order_records') &&
        (c[0] as string).includes('notes'),
      );
    expect(notesCalls).toHaveLength(1);
    expect(notesCalls[0][1]).toEqual(['Test note', 'ORD-001', 'user-1']);
  });

  test('does not write total_amount in order_records totals UPDATE', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn());

    const totalAmountWrites = (pool.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        (c[0] as string).includes('UPDATE agents.order_records') &&
        (c[0] as string).includes('total_amount'),
    );
    expect(totalAmountWrites).toHaveLength(0);
  });

  test('does not update notes in DB when data.notes is undefined', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn());

    const notesCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) =>
        typeof c[0] === 'string' &&
        (c[0] as string).includes('UPDATE agents.order_records') &&
        (c[0] as string).includes('notes'),
      );
    expect(notesCalls).toHaveLength(0);
  });
});

describe('totals refresh', () => {
  test('updates gross_amount and total_vat_amount and total_with_vat in order_records after article update', async () => {
    const pool = createMockPool();
    const mockBot: EditOrderBot = {
      editOrderInArchibald: async () => ({ success: true, message: 'ok' }),
      setProgressCallback: () => {},
    };

    await handleEditOrder(pool, mockBot, {
      orderId: 'ORD-001',
      modifications: [],
      updatedItems: [
        {
          articleCode: 'ART001',
          quantity: 2,
          unitPrice: 10,
          discountPercent: 0,
          lineAmount: 20,
          vatPercent: 22,
          vatAmount: 4.4,
          lineTotalWithVat: 24.4,
        },
      ],
    }, 'user-1', () => {});

    const totalsCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) =>
        typeof c[0] === 'string' &&
        (c[0] as string).includes('UPDATE agents.order_records') &&
        (c[0] as string).includes('gross_amount'),
      );
    expect(totalsCalls).toHaveLength(1);
    expect(totalsCalls[0][1]).toEqual(['ORD-001', 'user-1']);
  });
});

describe('post-edit verification', () => {
  const testOrderId = 'ORD-VERIFY-001';
  const testUserId = 'user-verify';

  test('returns verificationStatus when inlineSyncDeps and updatedItems are present', async () => {
    const pool = createMockPool();
    const mockBot: EditOrderBot = {
      editOrderInArchibald: async () => ({ success: true, message: 'ok' }),
      setProgressCallback: () => {},
    };

    const parsedArticle = {
      articleCode: 'ART001',
      description: null,
      quantity: 2,
      unitPrice: 10,
      discountPercent: 0,
      lineAmount: 20,
    };

    const mockInlineSyncDeps = {
      pool,
      downloadOrderArticlesPDF: async (_archibaldOrderId: string) => '/tmp/test.pdf',
      parsePdf: async (_path: string) => [parsedArticle],
      getProductVat: async (_code: string) => 22,
      cleanupFile: async (_path: string) => {},
    };

    const result = await handleEditOrder(pool, mockBot, {
      orderId: testOrderId,
      modifications: [],
      updatedItems: [
        {
          articleCode: 'ART001',
          quantity: 2,
          unitPrice: 10,
          discountPercent: 0,
          lineAmount: 20,
          vatPercent: 22,
          vatAmount: 4.4,
          lineTotalWithVat: 24.4,
        },
      ],
    }, testUserId, () => {}, mockInlineSyncDeps);

    expect(result.verificationStatus).toBe('verified');
  });
});

describe('discount propagation', () => {
  const testOrderId = 'ORD-DISCOUNT-001';
  const testUserId = 'user-discount';

  test('passes discount=0 to bot modifications (does not skip zero discount)', async () => {
    const pool = createMockPool();
    const botCalls: Array<{ mods: unknown }> = [];
    const mockBot: EditOrderBot = {
      editOrderInArchibald: async (_id: string, mods: unknown) => {
        botCalls.push({ mods });
        return { success: true, message: 'ok' };
      },
      setProgressCallback: () => {},
    };
    await handleEditOrder(pool, mockBot as never, {
      orderId: testOrderId,
      modifications: [{ type: 'update', rowIndex: 0, discount: 0 }],
    }, testUserId, () => {});
    const mods = botCalls[0].mods as Array<{ discount?: number }>;
    expect(mods[0].discount).toEqual(0);
  });
});

describe('noShipping propagation', () => {
  test('passes noShipping=true to bot as 4th argument', async () => {
    const pool = createMockPool();
    const botCalls: Array<{ id: string; mods: unknown; notes: unknown; noShipping: unknown }> = [];
    const mockBot: EditOrderBot = {
      editOrderInArchibald: vi.fn(async (id, mods, notes, noShipping) => {
        botCalls.push({ id, mods, notes, noShipping });
        return { success: true, message: 'ok' };
      }),
      setProgressCallback: vi.fn(),
    };
    await handleEditOrder(pool, mockBot, {
      orderId: 'ORD-001',
      modifications: [],
      notes: 'consegna',
      noShipping: true,
    }, 'user-1', vi.fn());
    expect(botCalls[0].noShipping).toEqual(true);
  });

  test('noShipping=undefined when not provided', async () => {
    const pool = createMockPool();
    const botCalls: Array<{ noShipping: unknown }> = [];
    const mockBot: EditOrderBot = {
      editOrderInArchibald: vi.fn(async (_id, _mods, _notes, noShipping) => {
        botCalls.push({ noShipping });
        return { success: true, message: 'ok' };
      }),
      setProgressCallback: vi.fn(),
    };
    await handleEditOrder(pool, mockBot, {
      orderId: 'ORD-001',
      modifications: [],
    }, 'user-1', vi.fn());
    expect(botCalls[0].noShipping).toBeUndefined();
  });

  test('stores buildOrderNotesText result in order_records.notes when noShipping=true', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    await handleEditOrder(pool, bot, {
      orderId: 'ORD-001',
      modifications: [],
      notes: 'consegna',
      noShipping: true,
    }, 'user-1', vi.fn());
    const notesCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) =>
        typeof c[0] === 'string' &&
        (c[0] as string).includes('UPDATE agents.order_records') &&
        (c[0] as string).includes('notes'),
      );
    expect(notesCalls).toHaveLength(1);
    expect(notesCalls[0][1]).toEqual([`${NO_SHIPPING_MARKER} consegna`, 'ORD-001', 'user-1']);
  });

  test('stores plain notes in order_records.notes when noShipping not set', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    await handleEditOrder(pool, bot, {
      orderId: 'ORD-001',
      modifications: [],
      notes: 'solo testo',
    }, 'user-1', vi.fn());
    const notesCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) =>
        typeof c[0] === 'string' &&
        (c[0] as string).includes('UPDATE agents.order_records') &&
        (c[0] as string).includes('notes'),
      );
    expect(notesCalls).toHaveLength(1);
    expect(notesCalls[0][1]).toEqual(['solo testo', 'ORD-001', 'user-1']);
  });
});
