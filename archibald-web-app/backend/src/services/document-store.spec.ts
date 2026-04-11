import { describe, expect, test, vi } from 'vitest';
import type { RedisBinaryClient } from './document-store';

const DOC_TTL_SECONDS = 5 * 60;
const KEY_PREFIX = 'doc:download:';

function createMockRedis(): RedisBinaryClient {
  return {
    setex: vi.fn(async () => 'OK'),
    getBuffer: vi.fn(async () => null),
  };
}

describe('createDocumentStore', () => {
  describe('save', () => {
    test('calls setex with prefixed key, TTL 300, and buffer — returns UUID key', async () => {
      const redis = createMockRedis();
      const { createDocumentStore } = await import('./document-store');
      const store = createDocumentStore(redis);
      const pdf = Buffer.from('pdf-content');

      const key = await store.save(pdf, 'my-doc.pdf');

      expect(vi.mocked(redis.setex)).toHaveBeenCalledWith(
        `${KEY_PREFIX}${key}`,
        DOC_TTL_SECONDS,
        pdf,
      );
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('get', () => {
    test('calls getBuffer with prefixed key and returns the buffer', async () => {
      const redis = createMockRedis();
      const pdfBuffer = Buffer.from('stored-pdf');
      vi.mocked(redis.getBuffer).mockResolvedValueOnce(pdfBuffer);
      const { createDocumentStore } = await import('./document-store');
      const store = createDocumentStore(redis);
      const key = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

      const result = await store.get(key);

      expect(vi.mocked(redis.getBuffer)).toHaveBeenCalledWith(`${KEY_PREFIX}${key}`);
      expect(result).toBe(pdfBuffer);
    });

    test('returns null when key does not exist', async () => {
      const redis = createMockRedis();
      vi.mocked(redis.getBuffer).mockResolvedValueOnce(null);
      const { createDocumentStore } = await import('./document-store');
      const store = createDocumentStore(redis);
      const key = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

      const result = await store.get(key);

      expect(result).toBeNull();
    });
  });
});
