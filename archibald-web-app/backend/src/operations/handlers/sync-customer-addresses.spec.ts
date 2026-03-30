import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { AltAddress } from '../../db/repositories/customer-addresses';
import {
  handleSyncCustomerAddresses,
  type SyncCustomerAddressesBot,
  type SyncCustomerAddressesData,
  type CustomerAddressEntry,
} from './sync-customer-addresses';

const userId = 'user-1';

const mockAltAddresses: AltAddress[] = [
  {
    tipo: 'Consegna',
    nome: null,
    via: 'Via Roma 1',
    cap: '80100',
    citta: 'Napoli',
    contea: null,
    stato: null,
    idRegione: null,
    contra: null,
  },
];

const data: SyncCustomerAddressesData = {
  erpId: 'CUST-001',
  customerName: 'Rossi Mario',
};

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn().mockImplementation(async (fn) => fn({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) })),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
}

function createMockBot(addresses: AltAddress[] = mockAltAddresses): SyncCustomerAddressesBot {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    navigateToCustomerByErpId: vi.fn().mockResolvedValue(undefined),
    readAltAddresses: vi.fn().mockResolvedValue(addresses),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('handleSyncCustomerAddresses', () => {
  it('navigates to customer, reads addresses, upserts them, and sets synced_at', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    const result = await handleSyncCustomerAddresses(pool, bot, data, userId, onProgress);

    expect(bot.initialize).toHaveBeenCalledOnce();
    expect(bot.navigateToCustomerByErpId).toHaveBeenCalledWith(data.erpId);
    expect(bot.readAltAddresses).toHaveBeenCalledOnce();
    expect(pool.withTransaction).toHaveBeenCalledOnce();
    const updateCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('addresses_synced_at = NOW()'),
    );
    expect(updateCall).toBeDefined();
    expect(result).toEqual({ addressesCount: mockAltAddresses.length, errorsCount: 0 });
  });

  it('calls bot.close() in the finally block even when readAltAddresses throws', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    (bot.readAltAddresses as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('scrape error'));
    const onProgress = vi.fn();

    await expect(
      handleSyncCustomerAddresses(pool, bot, data, userId, onProgress),
    ).rejects.toThrow('scrape error');

    expect(bot.close).toHaveBeenCalledOnce();
  });

  it('reports progress milestones', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleSyncCustomerAddresses(pool, bot, data, userId, onProgress);

    expect(onProgress).toHaveBeenCalledWith(10, expect.any(String));
    expect(onProgress).toHaveBeenCalledWith(60, expect.any(String));
    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  it('returns addressesCount 0 when no addresses found', async () => {
    const pool = createMockPool();
    const bot = createMockBot([]);
    const onProgress = vi.fn();

    const result = await handleSyncCustomerAddresses(pool, bot, data, userId, onProgress);

    expect(result).toEqual({ addressesCount: 0, errorsCount: 0 });
  });

  describe('batch mode', () => {
    const batchCustomers: CustomerAddressEntry[] = [
      { erpId: 'CUST-001', customerName: 'Rossi Mario' },
      { erpId: 'CUST-002', customerName: 'Verdi Luca' },
    ];
    const batchData: SyncCustomerAddressesData = { customers: batchCustomers };

    it('initializes bot once, processes each customer sequentially, closes bot once', async () => {
      const pool = createMockPool();
      const bot = createMockBot();
      const onProgress = vi.fn();

      const result = await handleSyncCustomerAddresses(pool, bot, batchData, userId, onProgress);

      expect(bot.initialize).toHaveBeenCalledOnce();
      expect(bot.navigateToCustomerByErpId).toHaveBeenCalledTimes(2);
      expect(bot.navigateToCustomerByErpId).toHaveBeenNthCalledWith(1, 'CUST-001');
      expect(bot.navigateToCustomerByErpId).toHaveBeenNthCalledWith(2, 'CUST-002');
      expect(bot.readAltAddresses).toHaveBeenCalledTimes(2);
      expect(bot.close).toHaveBeenCalledOnce();
      expect(result).toEqual({ addressesCount: mockAltAddresses.length * 2, errorsCount: 0 });
    });

    it('sets addresses_synced_at for each customer in batch', async () => {
      const pool = createMockPool();
      const bot = createMockBot();

      await handleSyncCustomerAddresses(pool, bot, batchData, userId, vi.fn());

      const syncedAtCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('addresses_synced_at = NOW()'),
      );
      expect(syncedAtCalls).toHaveLength(2);
    });

    it('skips a failing customer and continues with the next', async () => {
      const pool = createMockPool();
      const bot = createMockBot();
      (bot.navigateToCustomerByErpId as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('nav error'))
        .mockResolvedValueOnce(undefined);
      const onProgress = vi.fn();

      const result = await handleSyncCustomerAddresses(pool, bot, batchData, userId, onProgress);

      expect(bot.navigateToCustomerByErpId).toHaveBeenCalledTimes(2);
      expect(bot.close).toHaveBeenCalledOnce();
      expect(result).toEqual({ addressesCount: mockAltAddresses.length, errorsCount: 1 });
    });

    it('closes bot even if all customers fail', async () => {
      const pool = createMockPool();
      const bot = createMockBot();
      (bot.navigateToCustomerByErpId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nav error'));

      await handleSyncCustomerAddresses(pool, bot, batchData, userId, vi.fn());

      expect(bot.close).toHaveBeenCalledOnce();
    });

    it('reinitializes bot when a Protocol error occurs, allowing remaining customers to be processed', async () => {
      const protocolError = new Error('Protocol error: Connection closed. Most likely the page has been closed.');
      const pool = createMockPool();
      const bot = createMockBot();
      (bot.navigateToCustomerByErpId as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(protocolError)
        .mockResolvedValueOnce(undefined);

      const result = await handleSyncCustomerAddresses(pool, bot, batchData, userId, vi.fn());

      expect(bot.close).toHaveBeenCalledTimes(2); // once for recovery, once in finally
      expect(bot.initialize).toHaveBeenCalledTimes(2); // once at start, once for recovery
      expect(bot.navigateToCustomerByErpId).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ addressesCount: mockAltAddresses.length, errorsCount: 1 });
    });

    it('skips remaining customers gracefully when bot reinitialization also fails after a Protocol error', async () => {
      const protocolError = new Error('Protocol error: Connection closed. Most likely the page has been closed.');
      const pageNullError = new Error('Browser page is null'); // page is null after failed reinit
      const pool = createMockPool();
      const bot = createMockBot();
      (bot.navigateToCustomerByErpId as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(protocolError)
        .mockRejectedValueOnce(pageNullError); // page is dead because reinit failed
      (bot.initialize as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(undefined)           // first call (outer batch init)
        .mockRejectedValueOnce(new Error('login failed')); // recovery call fails

      const result = await handleSyncCustomerAddresses(pool, bot, batchData, userId, vi.fn());

      expect(result.errorsCount).toBe(2);
      expect(bot.close).toHaveBeenCalledTimes(2); // once for recovery, once in finally
    });
  });

  it('resets addresses_synced_at for all customers when called without customer data (manual trigger)', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();
    const emptyData = {} as unknown as SyncCustomerAddressesData;

    const result = await handleSyncCustomerAddresses(pool, bot, emptyData, userId, onProgress);

    const resetCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('addresses_synced_at = NULL'),
    );
    expect(resetCall).toBeDefined();
    expect(resetCall![1]).toEqual([userId]);
    expect(bot.initialize).not.toHaveBeenCalled();
    expect(result).toEqual({ addressesCount: 0, errorsCount: 0 });
  });
});
