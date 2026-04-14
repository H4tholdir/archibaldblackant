export type TriggerRule =
  | { type: 'exact'; value: string }
  | { type: 'contains'; value: string }

export type Promotion = {
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

export type CreatePromotionPayload = {
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

export type UpdatePromotionPayload = Partial<CreatePromotionPayload>

export function matchesTrigger(articleId: string, rules: TriggerRule[]): boolean {
  return rules.some(rule =>
    rule.type === 'exact'
      ? articleId === rule.value
      : articleId.includes(rule.value)
  )
}

export function calcSavings(promo: Promotion): { savings: number; savingsPct: number } | null {
  const p = promo.promo_price ? parseFloat(promo.promo_price) : null
  const l = promo.list_price ? parseFloat(promo.list_price) : null
  if (p === null || l === null || l === 0) return null
  const savings = l - p
  const savingsPct = Math.round((savings / l) * 100)
  return { savings, savingsPct }
}
