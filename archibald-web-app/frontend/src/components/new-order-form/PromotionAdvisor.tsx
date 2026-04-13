import { useState } from 'react'
import type { Promotion } from '../../types/promotion'
import { calcSavings } from '../../types/promotion'
import { getPromotionPdfUrl } from '../../api/promotions.api'

type Props = {
  promotions: Promotion[]
  isMobile: boolean
}

const COLORS = [
  { border: '#f59e0b', bg: 'linear-gradient(135deg,#fff7ed,#fef3c7)', text: '#92400e', btn: '#f59e0b', btnText: '#fff' },
  { border: '#38bdf8', bg: 'linear-gradient(135deg,#f0f9ff,#e0f2fe)', text: '#075985', btn: '#38bdf8', btnText: '#fff' },
  { border: '#a78bfa', bg: 'linear-gradient(135deg,#faf5ff,#ede9fe)', text: '#6b21a8', btn: '#a78bfa', btnText: '#fff' },
]

function PromoBanner({ promo, color, onDismiss }: {
  promo: Promotion
  color: typeof COLORS[number]
  onDismiss: () => void
}) {
  const savings = calcSavings(promo)
  const pdfUrl = promo.pdf_key ? getPromotionPdfUrl(promo.id) : null

  return (
    <div style={{
      background: color.bg,
      border: `1.5px solid ${color.border}`,
      borderRadius: 10,
      padding: '10px 12px',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>🏷️</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontWeight: 700, color: color.text, fontSize: 13 }}>{promo.name}</div>
            <button
              aria-label="Chiudi"
              onClick={onDismiss}
              style={{ background: 'none', border: 'none', color: color.text, cursor: 'pointer', fontSize: 14, padding: 0, marginLeft: 8, opacity: 0.7 }}
            >✕</button>
          </div>
          {promo.tagline && (
            <div style={{ color: color.text, fontSize: 11, marginTop: 2, fontStyle: 'italic', opacity: 0.8 }}>
              {promo.tagline}
            </div>
          )}
          {promo.selling_points.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {promo.selling_points.map((pt, i) => (
                <div key={i} style={{ color: color.text, fontSize: 11 }}>
                  <span aria-hidden="true">• </span>
                  <span>{pt}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {promo.promo_price && (
              <div style={{ background: color.btn, borderRadius: 6, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: color.btnText, fontWeight: 700, fontSize: 12 }}>
                  {parseFloat(promo.promo_price).toLocaleString('it-IT')}€
                </span>
                {promo.list_price && (
                  <span style={{ color: color.btnText, fontSize: 10, textDecoration: 'line-through', opacity: 0.75 }}>
                    {parseFloat(promo.list_price).toLocaleString('it-IT')}€
                  </span>
                )}
              </div>
            )}
            {savings && (
              <span style={{ color: color.text, fontSize: 11, fontWeight: 600 }}>
                risparmio {savings.savings.toLocaleString('it-IT')}€ ({savings.savingsPct}%)
              </span>
            )}
            {pdfUrl && (
              <button
                onClick={() => window.open(pdfUrl, '_blank')}
                style={{
                  background: 'transparent', border: `1px solid ${color.border}`,
                  color: color.text, borderRadius: 6, padding: '3px 10px',
                  fontSize: 11, cursor: 'pointer',
                }}
              >
                📄 Vedi PDF
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PromotionAdvisor({ promotions, isMobile }: Props) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const visible = promotions.filter(p => !dismissedIds.has(p.id))
  if (visible.length === 0) return null

  const dismiss = (id: string) =>
    setDismissedIds(prev => new Set([...prev, id]))

  if (isMobile) {
    return (
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        {visible.map((promo, i) => (
          <PromoBanner
            key={promo.id}
            promo={promo}
            color={COLORS[i % COLORS.length]}
            onDismiss={() => dismiss(promo.id)}
          />
        ))}
      </div>
    )
  }

  // Desktop: sidebar panel
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {visible.map((promo, i) => (
        <PromoBanner
          key={promo.id}
          promo={promo}
          color={COLORS[i % COLORS.length]}
          onDismiss={() => dismiss(promo.id)}
        />
      ))}
    </div>
  )
}
