import { describe, expect, test, vi, afterEach } from 'vitest';
import type { WarehouseItem } from '../types/warehouse';
import * as warehouseApi from '../api/warehouse';
import { findWarehouseMatchesBatch } from './warehouse-matching';

describe('findWarehouseMatchesBatch', () => {
  afterEach(() => { vi.restoreAllMocks(); });

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

describe('figura match level', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const baseItem: WarehouseItem = {
    id: 1,
    articleCode: 'H129FSQ.104.023',
    description: 'Testa originale',
    boxName: 'Box A',
    quantity: 5,
    soldInOrder: undefined,
    reservedForOrder: undefined,
    uploadedAt: '2026-01-01T00:00:00Z',
  };

  test('same figura + same misura + different gambo → figura match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    const result = await findWarehouseMatchesBatch([{ code: 'H129FSQ.999.023' }]);
    expect(result.get('H129FSQ.999.023')?.[0].level).toBe('figura');
  });

  test('same figura + different gambo + different misura → no match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    const result = await findWarehouseMatchesBatch([{ code: 'H129FSQ.999.099' }]);
    expect(result.get('H129FSQ.999.099')).toEqual([]);
  });

  test('same figura + same gambo + different misura → figura-gambo match (unchanged)', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    const result = await findWarehouseMatchesBatch([{ code: 'H129FSQ.104.099' }]);
    expect(result.get('H129FSQ.104.099')?.[0].level).toBe('figura-gambo');
  });
});

describe('description match level', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const baseItem: WarehouseItem = {
    id: 2,
    articleCode: 'XYZ.104.023',
    description: 'vite acciaio inox M6',
    boxName: 'Box B',
    quantity: 3,
    soldInOrder: undefined,
    reservedForOrder: undefined,
    uploadedAt: '2026-01-01T00:00:00Z',
  };

  test('same gambo + same misura + different figura + similar desc → description match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    const result = await findWarehouseMatchesBatch([{ code: 'ABC.104.023', description: 'vite acciaio inox M6' }]);
    expect(result.get('ABC.104.023')?.[0].level).toBe('description');
  });

  test('same gambo + same misura + different figura + dissimilar desc → no match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    const result = await findWarehouseMatchesBatch([{ code: 'ABC.104.023', description: 'bullone ottone M12' }]);
    expect(result.get('ABC.104.023')).toEqual([]);
  });

  test('different gambo + same misura + similar desc → no match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    const result = await findWarehouseMatchesBatch([{ code: 'ABC.999.023', description: 'vite acciaio inox M6' }]);
    expect(result.get('ABC.999.023')).toEqual([]);
  });

  test('same gambo + different misura + similar desc → no match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    const result = await findWarehouseMatchesBatch([{ code: 'ABC.104.999', description: 'vite acciaio inox M6' }]);
    expect(result.get('ABC.104.999')).toEqual([]);
  });

  test('single-part code (no gambo/misura) → no description match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    const result = await findWarehouseMatchesBatch([{ code: 'ABC', description: 'vite acciaio inox M6' }]);
    expect(result.get('ABC')).toEqual([]);
  });
});
