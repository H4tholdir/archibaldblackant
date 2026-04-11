import { randomUUID } from 'crypto';

const DOC_TTL_SECONDS = 5 * 60;
const KEY_PREFIX = 'doc:download:';

type RedisBinaryClient = {
  setex: (key: string, seconds: number, value: Buffer) => Promise<unknown>;
  getBuffer: (key: string) => Promise<Buffer | null>;
};

type DocumentStoreLike = {
  save: (pdf: Buffer, docName: string) => Promise<string>;
  get: (key: string) => Promise<Buffer | null>;
};

function createDocumentStore(redis: RedisBinaryClient): DocumentStoreLike {
  return {
    async save(pdf) {
      const key = randomUUID();
      await redis.setex(`${KEY_PREFIX}${key}`, DOC_TTL_SECONDS, pdf);
      return key;
    },
    async get(key) {
      return redis.getBuffer(`${KEY_PREFIX}${key}`);
    },
  };
}

export { createDocumentStore, type DocumentStoreLike, type RedisBinaryClient };
