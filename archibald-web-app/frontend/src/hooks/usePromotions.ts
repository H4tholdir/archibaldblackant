import { useState, useEffect, useCallback } from 'react'
import { fetchActivePromotions } from '../api/promotions.api'
import { matchesTrigger } from '../types/promotion'
import type { Promotion } from '../types/promotion'

// Cache in memoria per la sessione: non rifetcha se già caricato
let cache: Promotion[] | null = null

export function usePromotions() {
  const [activePromotions, setActivePromotions] = useState<Promotion[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    if (cache !== null) return
    fetchActivePromotions()
      .then(data => {
        cache = data
        setActivePromotions(data)
      })
      .catch(() => { /* silenzioso: le promo non sono bloccanti */ })
      .finally(() => setLoading(false))
  }, [])

  const triggeredFor = useCallback(
    (articleIds: string[]): Promotion[] =>
      activePromotions.filter(promo =>
        articleIds.some(id => matchesTrigger(id, promo.trigger_rules))
      ),
    [activePromotions]
  )

  return { activePromotions, loading, triggeredFor }
}

/** Invalida la cache (usato da PromotionsAdminSection dopo modifiche) */
export function invalidatePromotionsCache(): void {
  cache = null
}
