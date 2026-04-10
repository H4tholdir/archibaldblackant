import type { DbPool } from '../pool'

export type FamilyImageInsert = {
  family_code: string
  source_type: 'campionario' | 'catalog_pdf' | 'website'
  source_url:  string | null
  local_path:  string
  priority:    number
  metadata:    Record<string, unknown> | null
}

export type AnnCandidate = {
  id:          number
  family_code: string
  similarity:  number
  local_path:  string
  source_type: string
  metadata:    Record<string, unknown> | null
}

export async function upsertFamilyImage(
  pool: DbPool,
  row:  FamilyImageInsert,
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO shared.catalog_family_images
       (family_code, source_type, source_url, local_path, priority, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (family_code, source_type, local_path) DO UPDATE
       SET source_url = EXCLUDED.source_url,
           priority   = EXCLUDED.priority,
           metadata   = EXCLUDED.metadata
     RETURNING id`,
    [
      row.family_code, row.source_type, row.source_url, row.local_path,
      row.priority,
      row.metadata ? JSON.stringify(row.metadata) : null,
    ],
  )
  return rows[0]!.id
}

export async function updateEmbedding(
  pool:      DbPool,
  id:        number,
  embedding: number[],
): Promise<void> {
  await pool.query(
    `UPDATE shared.catalog_family_images
     SET visual_embedding = $1::halfvec, indexed_at = now()
     WHERE id = $2`,
    [`[${embedding.join(',')}]`, id],
  )
}

export async function queryTopK(
  pool:           DbPool,
  queryEmbedding: number[],
  limit:          number = 50,
): Promise<AnnCandidate[]> {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`
  const { rows } = await pool.query<AnnCandidate>(
    `SELECT id, family_code,
       1 - (visual_embedding <=> $1::halfvec) AS similarity,
       local_path, source_type, metadata
     FROM shared.catalog_family_images
     WHERE visual_embedding IS NOT NULL
     ORDER BY visual_embedding <=> $1::halfvec
     LIMIT $2`,
    [vectorLiteral, limit],
  )
  return rows
}

export async function countIndexed(pool: DbPool): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM shared.catalog_family_images WHERE visual_embedding IS NOT NULL`,
  )
  return parseInt(rows[0]!.count, 10)
}

/** Fallback when Jina is down: returns distinct indexed family codes. */
export async function getFallbackFamilies(pool: DbPool, limit: number): Promise<string[]> {
  const { rows } = await pool.query<{ family_code: string }>(
    `SELECT DISTINCT family_code
     FROM shared.catalog_family_images
     WHERE visual_embedding IS NOT NULL
     ORDER BY family_code
     LIMIT $1`,
    [limit],
  )
  return rows.map(r => r.family_code)
}

/** Returns the set of family codes that already have a visual embedding — used to skip re-indexing. */
export async function getIndexedFamilyCodes(pool: DbPool): Promise<Set<string>> {
  const { rows } = await pool.query<{ family_code: string }>(
    `SELECT DISTINCT family_code FROM shared.catalog_family_images WHERE visual_embedding IS NOT NULL`,
  )
  return new Set(rows.map(r => r.family_code))
}
