import { describe, expect, test, vi } from 'vitest';
import { handleRefreshCustomer } from './refresh-customer';
import type { RefreshCustomerBot, RefreshCustomerData } from './refresh-customer';
import type { CustomerFormInput } from '../../db/repositories/customers';

const makePool = () => ({ query: vi.fn().mockResolvedValue({ rows: [{ erp_id: '57348', user_id: 'u1', name: 'Test', hash: 'h', last_sync: 1, erp_detail_read_at: null, ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`col${i}`, null])) }], rowCount: 1 }) });

const mockFields: CustomerFormInput = {
  name: 'Dr. Marco Cirmeni',
  email: 'info@cirmeni.it',
  phone: '+393914079157',
  vatNumber: '05101170651',
};

const makeBot = (fields: CustomerFormInput = mockFields): RefreshCustomerBot => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  readCustomerFields: vi.fn().mockResolvedValue(fields),
  close: vi.fn().mockResolvedValue(undefined),
});

const data: RefreshCustomerData = { erpId: '57348' };

describe('handleRefreshCustomer', () => {
  test('chiama bot.initialize() prima di readCustomerFields', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleRefreshCustomer(pool as never, bot, data, 'u1', vi.fn());
    expect(bot.initialize).toHaveBeenCalled();
    const initOrder = (bot.initialize as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const readOrder = (bot.readCustomerFields as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(initOrder).toBeLessThan(readOrder);
  });

  test('chiama readCustomerFields con erpId corretto', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleRefreshCustomer(pool as never, bot, data, 'u1', vi.fn());
    expect(bot.readCustomerFields).toHaveBeenCalledWith('57348');
  });

  test('esegue upsert su DB (pool.query con INSERT/ON CONFLICT)', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleRefreshCustomer(pool as never, bot, data, 'u1', vi.fn());
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string]>;
    const upsertCall = calls.find(([sql]) => sql.includes('ON CONFLICT'));
    expect(upsertCall).toBeDefined();
  });

  test('chiama setErpDetailReadAt con erpId e userId corretti', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleRefreshCustomer(pool as never, bot, data, 'u1', vi.fn());
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string, unknown[]]>;
    const readAtCall = calls.find(([sql]) => sql.includes('erp_detail_read_at') && sql.includes('UPDATE'));
    expect(readAtCall).toEqual([
      expect.stringContaining('erp_detail_read_at'),
      ['57348', 'u1'],
    ]);
  });

  test('chiama bot.close() nel finally anche se readCustomerFields lancia', async () => {
    const pool = makePool();
    const bot = makeBot();
    (bot.readCustomerFields as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bot error'));
    await expect(handleRefreshCustomer(pool as never, bot, data, 'u1', vi.fn())).rejects.toThrow('bot error');
    expect(bot.close).toHaveBeenCalled();
  });

  test('emette progress a 40, 90 e 100', async () => {
    const pool = makePool();
    const bot = makeBot();
    const onProgress = vi.fn();
    await handleRefreshCustomer(pool as never, bot, data, 'u1', onProgress);
    expect(onProgress).toHaveBeenCalledWith(40, 'Lettura dati ERP');
    expect(onProgress).toHaveBeenCalledWith(90, 'Aggiornamento database');
    expect(onProgress).toHaveBeenCalledWith(100, 'Completato');
  });
});
