import { describe, expect, test, vi } from 'vitest';
import { handleUpdateCustomer } from './update-customer';
import type { UpdateCustomerBot, UpdateCustomerData } from './update-customer';
import type { CustomerSnapshot } from '../../types';
import { updateVatValidatedAt } from '../../db/repositories/customers';

vi.mock('../../db/repositories/customer-addresses', () => ({
  upsertAddressesForCustomer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../db/repositories/customers', () => ({
  updateVatValidatedAt: vi.fn().mockResolvedValue(undefined),
}));

const makePool = (nameRow = { name: 'Mario Rossi S.r.l.', archibald_name: 'Mario Rossi S.r.l.' }) => ({
  query: vi.fn().mockResolvedValue({ rows: [nameRow], rowCount: 1 }),
});

const snapshot: CustomerSnapshot = {
  internalId: '123', name: 'Mario Rossi S.r.l.', nameAlias: null,
  vatNumber: 'IT08246131216', vatValidated: 'Sì', fiscalCode: null,
  pec: 'mario@pec.it', sdi: null, notes: null,
  street: 'Via Roma 12', postalCode: '80100', city: 'Napoli',
  county: 'NA', state: null, country: 'Italy',
  phone: '081 1234567', mobile: null, email: 'info@rossi.it', url: null,
  attentionTo: null, deliveryMode: 'Standard', paymentTerms: '30gg DFFM',
  sector: 'Florovivaismo', priceGroup: 'DETTAGLIO (consigliato)', lineDiscount: 'N/A',
};

const makeBot = (snap: CustomerSnapshot = snapshot): UpdateCustomerBot => ({
  updateCustomer: vi.fn().mockResolvedValue(undefined),
  buildCustomerSnapshot: vi.fn().mockResolvedValue(snap),
  setProgressCallback: vi.fn(),
});

const baseData: UpdateCustomerData = {
  customerProfile: '55.261',
  name: 'Mario Rossi S.r.l.',
  vatNumber: 'IT08246131216',
  pec: 'mario@pec.it',
  sector: 'Florovivaismo',
  fiscalCode: null,
  attentionTo: null,
  notes: null,
};

describe('handleUpdateCustomer', () => {
  test('calls bot.updateCustomer with correct customerProfile and data', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleUpdateCustomer(pool as never, bot, baseData, 'user1', vi.fn());
    expect(bot.updateCustomer).toHaveBeenCalledWith('55.261', baseData, 'Mario Rossi S.r.l.');
  });

  test('calls buildCustomerSnapshot after bot update', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleUpdateCustomer(pool as never, bot, baseData, 'user1', vi.fn());
    expect(bot.buildCustomerSnapshot).toHaveBeenCalledWith('55.261');
  });

  test('sets bot_status to snapshot in final DB update', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleUpdateCustomer(pool as never, bot, baseData, 'user1', vi.fn());
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string, unknown[]]>;
    const snapshotCall = calls.find(([sql]) => sql.includes("bot_status = 'snapshot'"));
    expect(snapshotCall).toBeDefined();
  });

  test('persists snapshot sector field to DB', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleUpdateCustomer(pool as never, bot, baseData, 'user1', vi.fn());
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string, unknown[]]>;
    const sectorCall = calls.find(([sql]) => sql.includes('sector'));
    expect(sectorCall).toBeDefined();
  });

  test('proceeds and returns success even when buildCustomerSnapshot throws', async () => {
    const pool = makePool();
    const bot = makeBot();
    (bot.buildCustomerSnapshot as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ERP unreachable'));
    await expect(
      handleUpdateCustomer(pool as never, bot, baseData, 'user1', vi.fn()),
    ).resolves.toEqual({ success: true });
  });

  test('calls updateVatValidatedAt when vatWasValidated is true', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleUpdateCustomer(
      pool as never, bot, { ...baseData, vatWasValidated: true }, 'user1', vi.fn(),
    );
    expect(updateVatValidatedAt).toHaveBeenCalledWith(pool, 'user1', '55.261');
  });
});
