import { describe, expect, test, vi } from 'vitest';
import { createKometCodeParserHandler } from './komet-code-parser';
import type { DbPool } from '../../db/pool';

describe('createKometCodeParserHandler', () => {
  test('processes all products and skips unknown families', async () => {
    const mockProducts = [
      { id: 'H1.314.016', name: 'TC Round FG 1.6' },
      { id: 'ZZZ.314.016', name: 'Unknown Family' },
      { id: 'KP6801.314.018', name: 'DIAO Round FG 1.8' },
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
