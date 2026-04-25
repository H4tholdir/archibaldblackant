import type { DbPool } from '../pool'

export type FamilyImageInsert = {
  family_code: string
  source_type: 'campionario' | 'catalog_pdf' | 'website'
  source_url:  string | null
  local_path:  string
  priority:    number
  metadata:    Record<string, unknown> | null
}

export type FamilyImageRow = {
  family_code: string
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

export async function getBestRowsByFamilyCodes(
  pool:        DbPool,
  familyCodes: string[],
): Promise<FamilyImageRow[]> {
  if (familyCodes.length === 0) return []
  const { rows } = await pool.query<FamilyImageRow>(
    `SELECT DISTINCT ON (family_code) family_code, local_path, source_type, metadata
     FROM shared.catalog_family_images
     WHERE family_code = ANY($1)
     ORDER BY family_code, priority DESC`,
    [familyCodes],
  )
  return rows
}

export async function getFallbackFamilies(pool: DbPool, limit: number): Promise<string[]> {
  const { rows } = await pool.query<{ family_code: string }>(
    `SELECT DISTINCT family_code FROM shared.catalog_family_images ORDER BY family_code LIMIT $1`,
    [limit],
  )
  return rows.map(r => r.family_code)
}
