import { describe, it, expect, vi } from 'vitest';
import { updateVatLastBgCheckAt, setVatInvalid, getCustomersNeedingVatValidation } from './customers';
import type { DbPool } from '../pool';

function mockPool(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as DbPool;
}

describe('updateVatLastBgCheckAt', () => {
  it('esegue UPDATE con erpId e userId corretti', async () => {
    const pool = mockPool();
    await updateVatLastBgCheckAt(pool, 'user-1', 'erp-42');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SET vat_last_bg_check_at = NOW()'),
      ['erp-42', 'user-1'],
    );
  });
});

describe('setVatInvalid', () => {
  it('imposta vat_invalid = true per erpId/userId', async () => {
    const pool = mockPool();
    await setVatInvalid(pool, 'user-1', 'erp-42');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SET vat_invalid = TRUE'),
      ['erp-42', 'user-1'],
    );
  });
});

describe('getCustomersNeedingVatValidation', () => {
  it('restituisce erpId e vatNumber per clienti non validati', async () => {
    const pool = mockPool([{ erp_id: 'erp-1', vat_number: 'IT12345678901' }]);
    const result = await getCustomersNeedingVatValidation(pool, 'user-1');
    expect(result).toEqual([{ erpId: 'erp-1', vatNumber: 'IT12345678901' }]);
  });

  it('restituisce array vuoto se nessun cliente candidato', async () => {
    const pool = mockPool([]);
    const result = await getCustomersNeedingVatValidation(pool, 'user-1');
    expect(result).toEqual([]);
  });
});
