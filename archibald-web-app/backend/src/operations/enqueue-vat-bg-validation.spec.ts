import { describe, it, expect, vi } from 'vitest';
import { enqueueVatBgValidationIfNeeded } from './enqueue-vat-bg-validation';
import type { DbPool } from '../db/pool';

function makePool(customer: Record<string, unknown> | null) {
  return {
    query: vi.fn().mockResolvedValue({
      rows: customer ? [customer] : [],
    }),
  } as unknown as DbPool;
}

describe('enqueueVatBgValidationIfNeeded', () => {
  it('enqueue read-vat-status se cliente ha vat_number non validato', async () => {
    const pool = makePool({
      vat_number: 'IT12345678901',
      vat_validated_at: null,
      vat_invalid: false,
      vat_last_bg_check_at: null,
    });
    const enqueue = vi.fn().mockResolvedValue(null);
    const result = await enqueueVatBgValidationIfNeeded(pool, 'user-1', 'erp-42', enqueue, 25);
    expect(result).toBe(true);
    expect(enqueue).toHaveBeenCalledWith(pool, expect.objectContaining({
      taskType: 'read-vat-status',
      userId: 'user-1',
      payload: expect.objectContaining({ erpId: 'erp-42', vatNumber: 'IT12345678901' }),
      priority: 25,
    }));
  });

  it('non enqueue se vat_validated_at è già valorizzato', async () => {
    const pool = makePool({
      vat_number: 'IT12345678901',
      vat_validated_at: '2026-01-01',
      vat_invalid: false,
      vat_last_bg_check_at: null,
    });
    const enqueue = vi.fn();
    const result = await enqueueVatBgValidationIfNeeded(pool, 'user-1', 'erp-42', enqueue, 25);
    expect(result).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('non enqueue se vat_invalid = true', async () => {
    const pool = makePool({
      vat_number: 'IT12345678901',
      vat_validated_at: null,
      vat_invalid: true,
      vat_last_bg_check_at: null,
    });
    const enqueue = vi.fn();
    const result = await enqueueVatBgValidationIfNeeded(pool, 'user-1', 'erp-42', enqueue, 25);
    expect(result).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('non enqueue se controllato meno di 30 min fa', async () => {
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const pool = makePool({
      vat_number: 'IT12345678901',
      vat_validated_at: null,
      vat_invalid: false,
      vat_last_bg_check_at: recent,
    });
    const enqueue = vi.fn();
    const result = await enqueueVatBgValidationIfNeeded(pool, 'user-1', 'erp-42', enqueue, 25);
    expect(result).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
