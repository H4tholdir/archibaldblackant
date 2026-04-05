import type { DbPool } from '../pool';

type LogEntry = {
  user_id:      string
  image_hash:   string
  cache_hit:    boolean
  product_id:   string | null
  confidence:   number | null
  result_state: 'match' | 'shortlist' | 'filter_needed' | 'not_found' | 'error'
  tokens_used:  number | null
  api_cost_usd: number | null
};

async function appendRecognitionLog(pool: DbPool, entry: LogEntry): Promise<void> {
  await pool.query(
    `INSERT INTO system.recognition_log
       (user_id, image_hash, cache_hit, product_id, confidence,
        result_state, tokens_used, api_cost_usd)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      entry.user_id,
      entry.image_hash,
      entry.cache_hit,
      entry.product_id,
      entry.confidence,
      entry.result_state,
      entry.tokens_used,
      entry.api_cost_usd,
    ],
  );
}

async function getRecognitionHistory(
  pool: DbPool,
  productId: string,
  limit = 10,
): Promise<Array<{ scanned_at: Date; agent_id: string; confidence: number | null; cache_hit: boolean }>> {
  const { rows } = await pool.query(
    `SELECT created_at AS scanned_at, user_id AS agent_id, confidence, cache_hit
     FROM system.recognition_log
     WHERE product_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [productId, limit],
  );
  return rows;
}

export { appendRecognitionLog, getRecognitionHistory };
