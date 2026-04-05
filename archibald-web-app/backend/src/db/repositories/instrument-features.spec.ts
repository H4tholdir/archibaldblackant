import { describe, expect, test, vi } from 'vitest';
import { upsertInstrumentFeatures, lookupByFeatures } from './instrument-features';
import type { DbPool } from '../pool';

const FEATURE = {
  product_id:       'H1.314.016',
  shape_family:     'round',
  material:         'tungsten_carbide',
  grit_ring_color:  null,
  shank_type:       'fg',
  shank_diameter_mm: 1.6,
  head_size_code:   '016',
  head_size_mm:     1.6,
  family_code:      'H1',
};

describe('upsertInstrumentFeatures', () => {
  test('calls pool.query with upsert SQL and correct params', async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as DbPool;
    await upsertInstrumentFeatures(mockPool, FEATURE);
    expect(mockPool.query).toHaveBeenCalledOnce();
    const [sql, params] = (mockPool.query as any).mock.calls[0];
    expect(sql).toContain('INSERT INTO shared.instrument_features');
    expect(sql).toContain('ON CONFLICT (product_id)');
    expect(params).toContain('H1.314.016');
    expect(params).toContain('round');
  });
});

describe('lookupByFeatures', () => {
  test('returns rows from pool.query with size filter when calc_size provided', async () => {
    const mockRows = [{ product_id: 'H1.314.016', head_size_mm: 1.6, name: 'TC Round FG', image_url: null }];
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: mockRows }) } as unknown as DbPool;
    const result = await lookupByFeatures(mockPool, {
      shape_family: 'round',
      material: 'tungsten_carbide',
      grit_ring_color: null,
      shank_type: 'fg',
      calc_size_mm: 1.6,
    });
    expect(result).toEqual(mockRows);
    const [sql, params] = (mockPool.query as any).mock.calls[0];
    expect(sql).toContain('head_size_mm BETWEEN');
    expect(params).toContain('round');
  });

  test('omits head_size_mm filter when calc_size is null', async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as DbPool;
    await lookupByFeatures(mockPool, {
      shape_family: 'round',
      material: 'tungsten_carbide',
      grit_ring_color: null,
      shank_type: 'fg',
      calc_size_mm: null,
    });
    const [sql] = (mockPool.query as any).mock.calls[0];
    expect(sql).not.toContain('head_size_mm BETWEEN');
  });
});
