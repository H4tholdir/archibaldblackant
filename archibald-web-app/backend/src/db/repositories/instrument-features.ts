import type { DbPool } from '../pool';

type InstrumentFeatureRow = {
  product_id:        string
  shape_family:      string
  material:          string
  grit_ring_color:   string | null
  shank_type:        string
  shank_diameter_mm: number
  head_size_code:    string
  head_size_mm:      number
  working_length_mm: number | null
  total_length_mm:   number | null
  family_code:       string
};

type LookupParams = {
  shape_family:    string | null
  material:        string | null
  grit_ring_color: string | null
  shank_type:      string
  calc_size_mm:    number | null
  size_tolerance?: number   // default 0.15mm
};

type LookupRow = {
  product_id:   string
  head_size_mm: number
  shank_type:   string
  name:         string
  image_url:    string | null
};

async function upsertInstrumentFeatures(
  pool: DbPool,
  f: Omit<InstrumentFeatureRow, 'working_length_mm' | 'total_length_mm'> & {
    working_length_mm?: number | null
    total_length_mm?:   number | null
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO shared.instrument_features
       (product_id, shape_family, material, grit_ring_color, shank_type,
        shank_diameter_mm, head_size_code, head_size_mm, family_code,
        working_length_mm, total_length_mm, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'code_parser')
     ON CONFLICT (product_id) DO UPDATE SET
       shape_family      = EXCLUDED.shape_family,
       material          = EXCLUDED.material,
       grit_ring_color   = EXCLUDED.grit_ring_color,
       shank_type        = EXCLUDED.shank_type,
       shank_diameter_mm = EXCLUDED.shank_diameter_mm,
       head_size_code    = EXCLUDED.head_size_code,
       head_size_mm      = EXCLUDED.head_size_mm,
       family_code       = EXCLUDED.family_code,
       parsed_at         = NOW()`,
    [
      f.product_id,
      f.shape_family,
      f.material,
      f.grit_ring_color ?? null,
      f.shank_type,
      f.shank_diameter_mm,
      f.head_size_code,
      f.head_size_mm,
      f.family_code,
      f.working_length_mm ?? null,
      f.total_length_mm   ?? null,
    ],
  );
}

async function lookupByFeatures(
  pool: DbPool,
  params: LookupParams,
  limit = 20,
): Promise<LookupRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.shape_family) {
    conditions.push(`f.shape_family = $${idx++}`);
    values.push(params.shape_family);
  }
  if (params.material) {
    conditions.push(`f.material = $${idx++}`);
    values.push(params.material);
  }
  if (params.grit_ring_color !== null) {
    conditions.push(`f.grit_ring_color = $${idx++}`);
    values.push(params.grit_ring_color);
  } else {
    conditions.push(`f.grit_ring_color IS NULL`);
  }

  // 'unknown' → skip shank filter; 'ca'/'hp' → match either (both Ø 2.35 mm, visually similar)
  if (params.shank_type === 'ca' || params.shank_type === 'hp') {
    conditions.push(`f.shank_type IN ('ca', 'hp')`);
  } else if (params.shank_type !== 'unknown') {
    conditions.push(`f.shank_type = $${idx++}`);
    values.push(params.shank_type);
  }

  if (params.calc_size_mm !== null) {
    const tol = params.size_tolerance ?? 0.15;
    conditions.push(`f.head_size_mm BETWEEN $${idx++} AND $${idx++}`);
    values.push(params.calc_size_mm - tol, params.calc_size_mm + tol);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit);
  const { rows } = await pool.query<LookupRow>(
    `SELECT f.product_id, f.head_size_mm, f.shank_type, p.name, p.image_url
     FROM shared.instrument_features f
     JOIN shared.products p ON p.id = f.product_id
     ${where}
     ORDER BY f.head_size_mm
     LIMIT $${idx}`,
    values,
  );
  return rows;
}

async function countUnmappedProducts(pool: DbPool): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM shared.products p
     WHERE NOT EXISTS (
       SELECT 1 FROM shared.instrument_features f WHERE f.product_id = p.id
     )`,
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

export { upsertInstrumentFeatures, lookupByFeatures, countUnmappedProducts };
export type { InstrumentFeatureRow, LookupRow };
