import { describe, expect, test, vi } from 'vitest';
import { handleReadVatStatus } from './read-vat-status';
import type { ReadVatStatusBot, ReadVatStatusData } from './read-vat-status';

const makePool = () => ({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) });

const makeBot = (result: { vatValidated: string; lastChecked: string } | null): ReadVatStatusBot => ({
  readCustomerVatStatus: vi.fn().mockResolvedValue(result),
  setProgressCallback: vi.fn(),
});

const data: ReadVatStatusData = { customerProfile: '55.261' };

describe('handleReadVatStatus', () => {
  test('returns vatValidated from bot result', async () => {
    const pool = makePool();
    const bot = makeBot({ vatValidated: 'Sì', lastChecked: '01/01/2026' });
    const result = await handleReadVatStatus(pool as never, bot, data, 'u1', vi.fn());
    expect(result).toEqual({ vatValidated: 'Sì' });
  });

  test('calls updateVatValidatedAt when vatValidated is Sì', async () => {
    const pool = makePool();
    const bot = makeBot({ vatValidated: 'Sì', lastChecked: '01/01/2026' });
    await handleReadVatStatus(pool as never, bot, data, 'u1', vi.fn());
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string, unknown[]]>;
    const vatCall = calls.find(([sql]) => sql.includes('vat_validated_at'));
    expect(vatCall).toBeDefined();
  });

  test('calls updateVatValidatedAt when vatValidated is Si (no accent)', async () => {
    const pool = makePool();
    const bot = makeBot({ vatValidated: 'Si', lastChecked: '01/01/2026' });
    await handleReadVatStatus(pool as never, bot, data, 'u1', vi.fn());
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string, unknown[]]>;
    const vatCall = calls.find(([sql]) => sql.includes('vat_validated_at'));
    expect(vatCall).toBeDefined();
  });

  test('does NOT call updateVatValidatedAt when vatValidated is No', async () => {
    const pool = makePool();
    const bot = makeBot({ vatValidated: 'No', lastChecked: '01/01/2026' });
    await handleReadVatStatus(pool as never, bot, data, 'u1', vi.fn());
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('returns null vatValidated when bot returns null', async () => {
    const pool = makePool();
    const bot = makeBot(null);
    const result = await handleReadVatStatus(pool as never, bot, data, 'u1', vi.fn());
    expect(result).toEqual({ vatValidated: null });
  });

  test('handles bot error gracefully without throwing', async () => {
    const pool = makePool();
    const bot = makeBot(null);
    (bot.readCustomerVatStatus as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bot error'));
    await expect(handleReadVatStatus(pool as never, bot, data, 'u1', vi.fn())).resolves.toEqual({ vatValidated: null });
  });

  test('calls onProgress at 10 and 100', async () => {
    const pool = makePool();
    const bot = makeBot({ vatValidated: 'No', lastChecked: '' });
    const onProgress = vi.fn();
    await handleReadVatStatus(pool as never, bot, data, 'u1', onProgress);
    expect(onProgress).toHaveBeenCalledWith(10, 'Lettura stato IVA da Archibald');
    expect(onProgress).toHaveBeenCalledWith(100, 'Stato IVA aggiornato');
  });
});
