import { describe, expect, test, vi } from 'vitest';
import * as warehouseApi from '../api/warehouse';
import { findWarehouseMatchesBatch } from './warehouse-matching';

describe('findWarehouseMatchesBatch', () => {
  test('calls getWarehouseItems once for N articles', async () => {
    const mockItems = [
      { id: 1, articleCode: 'H129FSQ.104.023', description: 'Testa', boxName: 'Box A', quantity: 5, uploadedAt: '2026-01-01T00:00:00Z' },
      { id: 2, articleCode: 'H129FSQ.104.020', description: 'Testa alt', boxName: 'Box B', quantity: 3, uploadedAt: '2026-01-01T00:00:00Z' },
    ];
    const spy = vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue(mockItems);

    const inputs = [
      { code: 'H129FSQ.104.023', description: 'Testa' },
      { code: 'H129FSQ.104.020', description: 'Testa alt' },
      { code: '801.314.014', description: 'Altro' },
    ];
    const result = await findWarehouseMatchesBatch(inputs);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.get('H129FSQ.104.023')?.[0].level).toBe('exact');
    expect(result.get('H129FSQ.104.020')?.[0].level).toBe('exact');
    expect(result.get('801.314.014')).toEqual([]);
  });
});
