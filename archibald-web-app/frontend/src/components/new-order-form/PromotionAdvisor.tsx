import { useState } from 'react'
import type { Promotion } from '../../types/promotion'
import { calcSavings } from '../../types/promotion'
import { downloadPromotionPdf } from '../../api/promotions.api'

type Props = {
  promotions: Promotion[]
  isMobile: boolean
}

const SCHEMES = [
  { accent: '#d97706', light: '#fffbeb', border: '#fde68a', text: '#78350f', tag: '#d97706' },
  { accent: '#0284c7', light: '#f0f9ff', border: '#bae6fd', text: '#0c4a6e', tag: '#0284c7' },
  { accent: '#7c3aed', light: '#faf5ff', border: '#ddd6fe', text: '#4c1d95', tag: '#7c3aed' },
]

function PromoBanner({ promo, scheme, onDismiss }: {
  promo: Promotion
  scheme: typeof SCHEMES[number]
  onDismiss: () => void
}) {
  const savings = calcSavings(promo)
  const vatLabel = promo.price_includes_vat ? 'IVA incl.' : '+ IVA'

  return (
    <div style={{
      background: scheme.light,
      border: `2px solid ${scheme.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 10,
    }}>
      {/* Header colorato */}
      <div style={{
        background: scheme.accent,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>🏷️</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: '0.01em' }}>
            {promo.name}
          </span>
        </div>
        <button
          aria-label="Chiudi"
          onClick={onDismiss}
          style={{
            background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff',
            cursor: 'pointer', fontSize: 13, padding: '2px 7px', borderRadius: 6,
            lineHeight: 1, fontWeight: 700,
          }}
        >✕</button>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px' }}>
        {promo.tagline && (
          <div style={{ color: scheme.text, fontSize: 12, fontStyle: 'italic', marginBottom: 8, opacity: 0.9 }}>
            {promo.tagline}
          </div>
        )}

        {/* Prezzi */}
        {promo.promo_price && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 22, color: scheme.accent, lineHeight: 1 }}>
              {parseFloat(promo.promo_price).toLocaleString('it-IT', { minimumFractionDigits: 2 })}€
            </span>
            <span style={{
              background: scheme.accent, color: '#fff',
              fontSize: 10, fontWeight: 700, borderRadius: 4,
              padding: '2px 6px', letterSpacing: '0.03em', lineHeight: 1.4,
            }}>
              {vatLabel}
            </span>
            {promo.list_price && (
              <span style={{ fontSize: 13, color: '#9ca3af', textDecoration: 'line-through' }}>
                {parseFloat(promo.list_price).toLocaleString('it-IT', { minimumFractionDigits: 2 })}€
              </span>
            )}
            {savings && (
              <span style={{
                background: '#dcfce7', color: '#15803d',
                fontSize: 11, fontWeight: 700, borderRadius: 4,
                padding: '2px 8px', lineHeight: 1.4,
              }}>
                −{savings.savingsPct}%
              </span>
            )}
          </div>
        )}

        {/* Selling points */}
        {promo.selling_points.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            {promo.selling_points.map((pt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ color: scheme.accent, fontWeight: 700, fontSize: 13, flexShrink: 0, lineHeight: 1.4 }}>✓</span>
                <span style={{ color: scheme.text, fontSize: 13, lineHeight: 1.4 }}>{pt}</span>
              </div>
            ))}
          </div>
        )}

        {/* PDF */}
        {promo.pdf_key && (
          <button
            onClick={() => void downloadPromotionPdf(promo.id)}
            style={{
              background: scheme.accent, color: '#fff',
              border: 'none', borderRadius: 7, padding: '6px 14px',
              fontSize: 12, cursor: 'pointer', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            📄 Vedi offerta PDF
          </button>
        )}
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

  return (
    <div style={{ marginTop: isMobile ? 8 : 0 }}>
      {visible.map((promo, i) => (
        <PromoBanner
          key={promo.id}
          promo={promo}
          scheme={SCHEMES[i % SCHEMES.length]}
          onDismiss={() => dismiss(promo.id)}
        />
      ))}
    </div>
  )
}
