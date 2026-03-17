import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { AltAddress } from '../../db/repositories/customer-addresses';
import {
  handleSyncCustomerAddresses,
  type SyncCustomerAddressesBot,
  type SyncCustomerAddressesData,
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
  customerProfile: 'CUST-001',
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
    navigateToEditCustomerForm: vi.fn().mockResolvedValue(undefined),
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
    expect(bot.navigateToEditCustomerForm).toHaveBeenCalledWith(data.customerName);
    expect(bot.readAltAddresses).toHaveBeenCalledOnce();
    expect(pool.withTransaction).toHaveBeenCalledOnce();
    const updateCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('addresses_synced_at = NOW()'),
    );
    expect(updateCall).toBeDefined();
    expect(result).toEqual({ addressesCount: mockAltAddresses.length });
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

    expect(result).toEqual({ addressesCount: 0 });
  });
});
