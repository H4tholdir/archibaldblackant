import { describe, expect, test, vi } from 'vitest';
import type { WarehouseItem } from '../types/warehouse';
import * as warehouseApi from '../api/warehouse';
import { findWarehouseMatchesBatch } from './warehouse-matching';

describe('findWarehouseMatchesBatch', () => {
  test('calls getWarehouseItems once for N articles', async () => {
    const mockItems: WarehouseItem[] = [
      { id: 1, articleCode: 'H129FSQ.104.023', description: 'Testa', boxName: 'Box A', quantity: 5, soldInOrder: undefined, reservedForOrder: undefined, uploadedAt: '2026-01-01T00:00:00Z' },
      { id: 2, articleCode: '801.314.020', description: 'Testa alt', boxName: 'Box B', quantity: 3, soldInOrder: undefined, reservedForOrder: undefined, uploadedAt: '2026-01-01T00:00:00Z' },
      { id: 3, articleCode: 'H129FSQ.104.023', description: 'Testa sold', boxName: 'Box C', quantity: 10, soldInOrder: 'ORDER-123', reservedForOrder: undefined, uploadedAt: new Date().toISOString() },
    ];
    const spy = vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue(mockItems);

    const inputs = [
      { code: 'H129FSQ.104.023', description: 'Testa' },
      { code: '801.314.020', description: 'Testa alt' },
      { code: 'BCR1.999.000', description: 'Altro' },
    ];
    const result = await findWarehouseMatchesBatch(inputs);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.get('H129FSQ.104.023')?.[0].level).toBe('exact');
    expect(result.get('H129FSQ.104.023')).toHaveLength(1);
    expect(result.get('801.314.020')?.[0].level).toBe('exact');
    expect(result.get('BCR1.999.000')).toEqual([]);
  });
});
