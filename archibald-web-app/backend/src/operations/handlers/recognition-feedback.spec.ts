import { describe, expect, test, vi } from 'vitest';
import { createRecognitionFeedbackHandler } from './recognition-feedback';
import type { DbPool } from '../../db/pool';

describe('createRecognitionFeedbackHandler', () => {
  test('returns queued=false when image not in cache', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValueOnce({ rows: [] }), // getImageDataFromCache → null
    } as unknown as DbPool;

    const handler = createRecognitionFeedbackHandler({ pool: mockPool });
    const result = await handler(null as any, { imageHash: 'abc', productId: 'H1.314.016', userId: 'user-1' }, 'user-1', vi.fn());

    expect(result).toEqual({ queued: false });
    expect(mockPool.query).toHaveBeenCalledOnce();
  });

  test('returns queued=true after saving resized image to gallery', async () => {
    const fakeBuffer = Buffer.from('fake-image-data');
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ image_data: fakeBuffer }] })  // getImageDataFromCache
        .mockResolvedValueOnce({ rows: [] }),                           // insertGalleryImage
    } as unknown as DbPool;

    const mockResize = vi.fn().mockResolvedValue(Buffer.from('resized-data'));

    // Use a temp dir to avoid writing to /app/assets in test
    const tmpDir = require('os').tmpdir();
    const handler = createRecognitionFeedbackHandler({
      pool: mockPool,
      assetsDir: tmpDir,
      sharpFn: mockResize,
    });

    const result = await handler(
      null as any,
      { imageHash: 'a'.repeat(64), productId: 'H1.314.016', userId: 'agent-xyz' },
      'agent-xyz',
      vi.fn(),
    );

    expect(result).toEqual({ queued: true });
    expect(mockResize).toHaveBeenCalledWith(fakeBuffer);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });
});
