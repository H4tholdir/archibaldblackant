import type { DbPool } from '../pool';
import type { RecognitionResult } from '../../recognition/types';

type CacheRow = {
  image_hash:  string
  result_json: RecognitionResult
  product_id:  string | null
  confidence:  number | null
  image_data:  Buffer | null
  created_at:  Date
  expires_at:  Date
};

async function getCached(pool: DbPool, imageHash: string): Promise<CacheRow | null> {
  const { rows } = await pool.query<CacheRow>(
    `SELECT image_hash, result_json, product_id, confidence, image_data, created_at, expires_at
     FROM system.recognition_cache
     WHERE image_hash = $1 AND expires_at > NOW()`,
    [imageHash],
  );
  return rows[0] ?? null;
}

async function setCached(
  pool: DbPool,
  imageHash: string,
  result: RecognitionResult,
  imageBuffer: Buffer | null,
): Promise<void> {
  const productId = result.state === 'match' ? result.product.productId : null;
  const confidence = result.state === 'match' ? result.confidence : null;
  await pool.query(
    `INSERT INTO system.recognition_cache
       (image_hash, result_json, product_id, confidence, image_data)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (image_hash) DO UPDATE SET
       result_json = EXCLUDED.result_json,
       product_id  = EXCLUDED.product_id,
       confidence  = EXCLUDED.confidence,
       expires_at  = NOW() + INTERVAL '30 days'`,
    [imageHash, JSON.stringify(result), productId, confidence, imageBuffer],
  );
}

async function getImageDataFromCache(pool: DbPool, imageHash: string): Promise<Buffer | null> {
  const { rows } = await pool.query<{ image_data: Buffer | null }>(
    `SELECT image_data FROM system.recognition_cache WHERE image_hash = $1`,
    [imageHash],
  );
  return rows[0]?.image_data ?? null;
}

async function deleteExpiredCache(pool: DbPool): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM system.recognition_cache WHERE expires_at < NOW()`,
  );
  return rowCount ?? 0;
}

export { getCached, setCached, getImageDataFromCache, deleteExpiredCache };
