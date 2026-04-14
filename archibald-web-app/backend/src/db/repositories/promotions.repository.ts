import type { DbPool } from '../pool'

export type TriggerRule =
  | { type: 'exact'; value: string }
  | { type: 'contains'; value: string }

export type PromotionRow = {
  id: string
  name: string
  tagline: string | null
  valid_from: string
  valid_to: string
  pdf_key: string | null
  trigger_rules: TriggerRule[]
  selling_points: string[]
  promo_price: string | null
  list_price: string | null
  price_includes_vat: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

const SELECT_COLS = `
  id, name, tagline,
  valid_from::text, valid_to::text,
  pdf_key, trigger_rules, selling_points,
  promo_price::text, list_price::text,
  price_includes_vat,
  is_active, created_at::text, updated_at::text
`

export async function getAllPromotions(pool: DbPool): Promise<PromotionRow[]> {
  const res = await pool.query<PromotionRow>(
    `SELECT ${SELECT_COLS} FROM system.promotions ORDER BY created_at DESC`
  )
  return res.rows
}

export async function getActivePromotions(pool: DbPool): Promise<PromotionRow[]> {
  const res = await pool.query<PromotionRow>(
    `SELECT ${SELECT_COLS} FROM system.promotions
     WHERE is_active = true
       AND valid_from <= CURRENT_DATE
       AND valid_to   >= CURRENT_DATE
     ORDER BY created_at DESC`
  )
  return res.rows
}

export async function getPromotionById(pool: DbPool, id: string): Promise<PromotionRow | null> {
  const res = await pool.query<PromotionRow>(
    `SELECT ${SELECT_COLS} FROM system.promotions WHERE id = $1`,
    [id]
  )
  return res.rows[0] ?? null
}

export type CreatePromotionInput = {
  name: string
  tagline?: string | null
  validFrom: string
  validTo: string
  triggerRules: TriggerRule[]
  sellingPoints: string[]
  promoPrice?: number | null
  listPrice?: number | null
  priceIncludesVat?: boolean
  isActive?: boolean
}

export async function createPromotion(
  pool: DbPool,
  input: CreatePromotionInput
): Promise<PromotionRow> {
  const res = await pool.query<PromotionRow>(
    `INSERT INTO system.promotions
       (name, tagline, valid_from, valid_to, trigger_rules, selling_points,
        promo_price, list_price, price_includes_vat, is_active)
     VALUES ($1, $2, $3::date, $4::date, $5::jsonb, $6::text[], $7, $8, $9, $10)
     RETURNING ${SELECT_COLS}`,
    [
      input.name,
      input.tagline ?? null,
      input.validFrom,
      input.validTo,
      JSON.stringify(input.triggerRules),
      input.sellingPoints,
      input.promoPrice ?? null,
      input.listPrice ?? null,
      input.priceIncludesVat ?? false,
      input.isActive ?? true,
    ]
  )
  return res.rows[0]
}

export type UpdatePromotionInput = {
  name?: string
  tagline?: string | null
  validFrom?: string
  validTo?: string
  triggerRules?: TriggerRule[]
  sellingPoints?: string[]
  promoPrice?: number | null
  listPrice?: number | null
  priceIncludesVat?: boolean
  isActive?: boolean
  pdfKey?: string | null
}

export async function updatePromotion(
  pool: DbPool,
  id: string,
  input: UpdatePromotionInput
): Promise<PromotionRow | null> {
  const sets: string[] = []
  const values: unknown[] = []
  let i = 1

  if (input.name         !== undefined) { sets.push(`name = $${i++}`);                   values.push(input.name) }
  if (input.tagline      !== undefined) { sets.push(`tagline = $${i++}`);                 values.push(input.tagline ?? null) }
  if (input.validFrom    !== undefined) { sets.push(`valid_from = $${i++}::date`);        values.push(input.validFrom) }
  if (input.validTo      !== undefined) { sets.push(`valid_to = $${i++}::date`);          values.push(input.validTo) }
  if (input.triggerRules !== undefined) { sets.push(`trigger_rules = $${i++}::jsonb`);    values.push(JSON.stringify(input.triggerRules)) }
  if (input.sellingPoints !== undefined){ sets.push(`selling_points = $${i++}::text[]`);  values.push(input.sellingPoints) }
  if (input.promoPrice       !== undefined) { sets.push(`promo_price = $${i++}`);           values.push(input.promoPrice ?? null) }
  if (input.listPrice        !== undefined) { sets.push(`list_price = $${i++}`);            values.push(input.listPrice ?? null) }
  if (input.priceIncludesVat !== undefined) { sets.push(`price_includes_vat = $${i++}`);   values.push(input.priceIncludesVat) }
  if (input.isActive         !== undefined) { sets.push(`is_active = $${i++}`);             values.push(input.isActive) }
  if (input.pdfKey           !== undefined) { sets.push(`pdf_key = $${i++}`);               values.push(input.pdfKey ?? null) }

  if (sets.length === 0) return getPromotionById(pool, id)

  sets.push(`updated_at = now()`)
  values.push(id)

  const res = await pool.query<PromotionRow>(
    `UPDATE system.promotions SET ${sets.join(', ')}
     WHERE id = $${i}
     RETURNING ${SELECT_COLS}`,
    values
  )
  return res.rows[0] ?? null
}

export async function deletePromotion(
  pool: DbPool,
  id: string
): Promise<{ pdfKey: string | null } | null> {
  const res = await pool.query<{ pdf_key: string | null }>(
    `DELETE FROM system.promotions WHERE id = $1 RETURNING pdf_key`,
    [id]
  )
  if (res.rows.length === 0) return null
  return { pdfKey: res.rows[0].pdf_key ?? null }
}
