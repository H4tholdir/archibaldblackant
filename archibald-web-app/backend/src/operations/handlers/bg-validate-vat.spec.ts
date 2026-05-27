import { describe, it, expect, vi } from 'vitest';
import { handleBgValidateVat } from './bg-validate-vat';
import type { DbPool } from '../../db/pool';

function makePool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as DbPool;
}
function makeBot(vatValidated: string | null) {
  return {
    openCustomerAndValidateVat: vi.fn().mockResolvedValue(
      vatValidated !== null
        ? { vatValidated, lastVatCheck: '', vatAddress: '', parsed: {}, pec: '', sdi: '' }
        : null,
    ),
    setProgressCallback: vi.fn(),
  };
}
const onProgress = vi.fn();

describe('handleBgValidateVat', () => {
  it('aggiorna vat_validated_at e chiama broadcast VAT_BG_VALIDATED quando ERP dice Sì', async () => {
    const pool = makePool();
    const bot = makeBot('Sì');
    const broadcast = vi.fn();
    const result = await handleBgValidateVat(pool, bot, { erpId: 'erp-1', vatNumber: 'IT123' }, 'user-1', onProgress, broadcast);
    expect(result.vatValidated).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SET vat_validated_at'), expect.any(Array));
    expect(broadcast).toHaveBeenCalledWith('user-1', expect.objectContaining({ type: 'VAT_BG_VALIDATED' }));
  });

  it('imposta vat_invalid e chiama broadcast VAT_BG_INVALID quando ERP risponde No', async () => {
    const pool = makePool();
    const bot = makeBot('No');
    const broadcast = vi.fn();
    await handleBgValidateVat(pool, bot, { erpId: 'erp-1', vatNumber: 'IT123' }, 'user-1', onProgress, broadcast);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SET vat_invalid = TRUE'), expect.any(Array));
    expect(broadcast).toHaveBeenCalledWith('user-1', expect.objectContaining({ type: 'VAT_BG_INVALID' }));
  });

  it('non imposta vat_invalid se bot restituisce null (timeout)', async () => {
    const pool = makePool();
    const bot = makeBot(null);
    const broadcast = vi.fn();
    await handleBgValidateVat(pool, bot, { erpId: 'erp-1', vatNumber: 'IT123' }, 'user-1', onProgress, broadcast);
    const invalidCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .find(([sql]: [string]) => sql.includes('vat_invalid = TRUE'));
    expect(invalidCall).toBeUndefined();
    expect(broadcast).not.toHaveBeenCalledWith('user-1', expect.objectContaining({ type: 'VAT_BG_INVALID' }));
  });

  it('non imposta vat_invalid se bot restituisce stringa vuota (campo non trovato)', async () => {
    const pool = makePool();
    const bot = makeBot('');
    const broadcast = vi.fn();
    await handleBgValidateVat(pool, bot, { erpId: 'erp-1', vatNumber: 'IT123' }, 'user-1', onProgress, broadcast);
    const invalidCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .find(([sql]: [string]) => sql.includes('vat_invalid = TRUE'));
    expect(invalidCall).toBeUndefined();
    expect(broadcast).not.toHaveBeenCalledWith('user-1', expect.objectContaining({ type: 'VAT_BG_INVALID' }));
  });

  it('normalizza "Si" (senza accento) come validato', async () => {
    const pool = makePool();
    const bot = makeBot('Si');
    const broadcast = vi.fn();
    const result = await handleBgValidateVat(pool, bot, { erpId: 'erp-1', vatNumber: 'IT123' }, 'user-1', onProgress, broadcast);
    expect(result.vatValidated).toBe(true);
    expect(broadcast).toHaveBeenCalledWith('user-1', expect.objectContaining({ type: 'VAT_BG_VALIDATED' }));
  });

  it('azzera vat_invalid quando la P.IVA viene validata', async () => {
    const pool = makePool();
    const bot = makeBot('Sì');
    const broadcast = vi.fn();
    await handleBgValidateVat(pool, bot, { erpId: 'erp-1', vatNumber: 'IT123' }, 'user-1', onProgress, broadcast);
    const validatedCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .find(([sql]: [string]) => sql.includes('SET vat_validated_at'));
    expect(validatedCall?.[0]).toContain('vat_invalid = FALSE');
  });
});
