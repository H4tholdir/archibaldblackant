import { describe, expect, test, vi } from 'vitest';
import { createKometCodeParserHandler } from './komet-code-parser';
import type { DbPool } from '../../db/pool';

describe('createKometCodeParserHandler', () => {
  test('processes all products and skips unknown families', async () => {
    const mockProducts = [
      { id: '001126K2', name: 'H1.314.016' },
      { id: '002345K1', name: 'ZZZ.314.016' },
      { id: '003456K2', name: 'KP6801.314.018' },
    ];
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: mockProducts })   // getAllProducts
        .mockResolvedValue({ rows: [] }),                // upsertInstrumentFeatures (× 2) + countUnmappedProducts
    } as unknown as DbPool;

    const handler = createKometCodeParserHandler({ pool: mockPool });
    const result = await handler(null as any, {}, 'service-account', vi.fn());

    expect(result).toEqual({ processed: 2, skipped: 1, total: 3 });
  });
});
