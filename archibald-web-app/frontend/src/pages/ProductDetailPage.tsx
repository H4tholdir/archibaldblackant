// archibald-web-app/frontend/src/pages/ProductDetailPage.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getProductEnrichment } from '../api/recognition'
import { getProducts } from '../api/products'
import type { ProductEnrichment, ProductGalleryImage } from '../api/recognition'
import type { Product } from '../api/products'

type Tab = 'prodotto' | 'clinica' | 'misure' | 'competitor'

function sizeCode(variant: { productId: string; headSizeMm: number }): string {
  const parts = variant.productId.split('.')
  return parts[parts.length - 1] ?? String(Math.round(variant.headSizeMm * 10)).padStart(3, '0')
}

// ── Gallery ──────────────────────────────────────────────────────────────────

function GalleryArea({
  gallery,
  fromScanner,
  onBack,
}: {
  gallery: ProductGalleryImage[]
  fromScanner: boolean
  onBack: () => void
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const visible = gallery.slice(0, 4)
  const active = visible[activeIdx]

  return (
    <div style={{
      width: '100%', height: 300, background: '#f8f8f8',
      position: 'relative', overflow: 'hidden',
    }}>
      {active && (
        <img
          src={active.url}
          alt="gallery principale"
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 16 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}

      {/* Top overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, padding: 12,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), transparent)',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
            color: '#fff', fontSize: 12, padding: '5px 12px',
            borderRadius: 20, border: 'none', cursor: 'pointer',
          }}
        >
          ← Catalogo
        </button>
        {fromScanner && (
          <div style={{
            background: 'rgba(34,197,94,0.15)', backdropFilter: 'blur(6px)',
            border: '1px solid rgba(34,197,94,0.6)', color: '#22c55e',
            fontSize: 11, padding: '4px 10px', borderRadius: 20,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            📷 Riconosciuto
          </div>
        )}
      </div>

      {/* Vertical thumb strip */}
      {visible.length > 1 && (
        <div style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {visible.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setActiveIdx(i)}
              style={{
                width: 48, height: 48, borderRadius: 8, overflow: 'hidden',
                border: `2px solid ${i === activeIdx ? '#f9a825' : 'transparent'}`,
                background: '#fff', cursor: 'pointer', padding: 0,
              }}
            >
              <img
                src={img.url}
                alt={img.imageType}
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </button>
          ))}
        </div>
      )}

      {/* Dots */}
      {visible.length > 1 && (
        <div style={{
          position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 5,
        }}>
          {visible.map((_, i) => (
            <div
              key={i}
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: i === activeIdx ? '#f9a825' : 'rgba(0,0,0,0.25)',
              }}
            />
          ))}
        </div>
      )}

      {/* Image type label */}
      {active && (
        <div style={{
          position: 'absolute', bottom: 10,
          right: visible.length > 1 ? 68 : 10,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          color: '#9ca3af', fontSize: 10, padding: '3px 8px', borderRadius: 20,
        }}>
          {active.imageType.replace(/_/g, ' ')}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const fromScanner = (location.state as { fromScanner?: boolean } | null)?.fromScanner === true

  const [product, setProduct] = useState<Product | null>(null)
  const [enrichment, setEnrichment] = useState<ProductEnrichment | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('prodotto')

  useEffect(() => {
    const token = localStorage.getItem('archibald_jwt')
    if (!token || !productId) return

    const decodedId = decodeURIComponent(productId)

    async function fetchAll() {
      setLoading(true)
      setNotFound(false)
      try {
        const [productsRes, enrichmentRes] = await Promise.allSettled([
          getProducts(token!, decodedId, 10),
          getProductEnrichment(token!, decodedId),
        ])

        if (productsRes.status === 'fulfilled') {
          const found = productsRes.value.data.products.find(p => p.id === decodedId)
          setProduct(found ?? null)
          if (!found) setNotFound(true)
        } else {
          setNotFound(true)
        }

        if (enrichmentRes.status === 'fulfilled') {
          setEnrichment(enrichmentRes.value)
        }
      } finally {
        setLoading(false)
      }
    }

    void fetchAll()
  }, [productId])

  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', gap: 16, color: '#fff',
        background: '#111',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#60a5fa',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        Caricamento...
      </div>
    )
  }

  if (notFound || !product) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', gap: 16, padding: 24,
        background: '#111',
      }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ color: '#fff', margin: 0 }}>Prodotto non trovato</h2>
        <button
          onClick={() => navigate('/products')}
          style={{ color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
        >
          ← Torna al catalogo
        </button>
      </div>
    )
  }

  const details = enrichment?.details ?? null
  const gallery = enrichment?.gallery ?? []
  const sizeVariants = enrichment?.sizeVariants ?? []
  const pd = details?.performanceData ?? null

  const priceFormatted = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR',
  }).format(product.price ?? 0)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'prodotto', label: 'Prodotto' },
    { id: 'clinica', label: 'Clinica' },
    { id: 'misure', label: 'Misure' },
    { id: 'competitor', label: 'Competitor' },
  ]

  return (
    <div style={{ background: '#111', minHeight: '100vh', paddingBottom: 90 }}>
      <GalleryArea
        gallery={gallery}
        fromScanner={fromScanner}
        onBack={() => navigate(-1)}
      />

      <div style={{ padding: 16 }}>
        {/* Product name */}
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, lineHeight: 1.2, margin: '0 0 4px' }}>
          {product.name}
        </h1>

        {/* Product code */}
        <div style={{
          fontSize: 11, color: '#6b7280', fontFamily: "'SF Mono', Consolas, monospace",
          marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0 }} />
          {product.id}
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', background: '#1a1a1a', borderRadius: 10,
          padding: 4, gap: 3, marginBottom: 14,
        }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                flex: 1, textAlign: 'center', padding: '7px 4px',
                fontSize: 11, borderRadius: 8, border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: activeTab === t.id ? '#2a2a2a' : 'transparent',
                color: activeTab === t.id ? '#fff' : '#6b7280',
                fontWeight: activeTab === t.id ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Prodotto ── */}
        <div style={{ display: activeTab === 'prodotto' ? 'block' : 'none' }}>
          {pd && (
            <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#6b7280', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>
                Performance vs. standard di mercato
              </div>
              {[
                { label: 'Durata', value: pd.durabilityPct },
                { label: 'Affilatura', value: pd.sharpnessPct },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', width: 75, flexShrink: 0 }}>{label}</div>
                  <div style={{ flex: 1, height: 5, background: '#2a2a2a', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${value}%`, height: 5, borderRadius: 3,
                      background: 'linear-gradient(90deg, #b8860b, #ffd700)',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#f9a825', fontWeight: 600, width: 38, textAlign: 'right', flexShrink: 0 }}>
                    {value}%
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 11, color: '#9ca3af', width: 75, flexShrink: 0 }}>Controllo</div>
                <div style={{ flex: 1, height: 5, background: '#2a2a2a', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(pd.controlStars / 5) * 100}%`, height: 5, borderRadius: 3,
                    background: 'linear-gradient(90deg, #b8860b, #ffd700)',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: '#f9a825', fontWeight: 600, width: 38, textAlign: 'right', flexShrink: 0 }}>
                  {'★'.repeat(pd.controlStars)}{'☆'.repeat(5 - pd.controlStars)}
                </div>
              </div>
              <div style={{ color: '#4b5563', fontSize: 11, marginTop: 10 }}>
                Max {pd.maxRpm.toLocaleString('it-IT')} RPM · Irrigazione min {pd.minSprayMl} ml/min
              </div>
            </div>
          )}
        </div>

        {/* ── Tab: Clinica ── */}
        <div style={{ display: activeTab === 'clinica' ? 'block' : 'none' }}>
          {details?.clinicalDescription ? (
            <div>
              <div style={{ color: '#d1d5db', fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
                {details.clinicalDescription}
              </div>
              {details.procedures && (
                <div style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.6 }}>
                  {details.procedures}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#4b5563', fontSize: 14, padding: '20px 0' }}>
              Nessuna indicazione clinica disponibile.
            </div>
          )}
        </div>

        {/* ── Tab: Misure ── */}
        <div style={{ display: activeTab === 'misure' ? 'block' : 'none' }}>
          {sizeVariants.length > 0 ? (
            <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 10, color: '#6b7280', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>
                Misure disponibili
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {sizeVariants.map(v => {
                  const isActive = v.productId === product.id
                  return (
                    <button
                      key={v.productId}
                      onClick={() => !isActive && navigate(`/products/${encodeURIComponent(v.productId)}`)}
                      style={{
                        background: isActive ? '#0d2b0d' : '#252525',
                        border: `1px solid ${isActive ? '#22c55e' : '#333'}`,
                        borderRadius: 7, padding: '6px 10px',
                        fontSize: 11, fontFamily: "'SF Mono', Consolas, monospace",
                        color: isActive ? '#6ee7b7' : '#9ca3af',
                        fontWeight: isActive ? 600 : 400,
                        cursor: isActive ? 'default' : 'pointer',
                      }}
                    >
                      {sizeCode(v)}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ color: '#4b5563', fontSize: 14, padding: '20px 0' }}>
              Nessuna variante di misura disponibile.
            </div>
          )}
        </div>

        {/* ── Tab: Competitor ── */}
        <div style={{ display: activeTab === 'competitor' ? 'block' : 'none' }}>
          <div style={{
            background: '#1a1a1a', border: '1px solid #252525', borderRadius: 12,
            padding: 20, textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
            <div style={{ color: '#4b5563', fontSize: 14 }}>
              Equivalenti disponibili in Fase 2
            </div>
          </div>
        </div>
      </div>

      {/* CTA sticky */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#0a0a0a', borderTop: '1px solid #1f2937',
        padding: '12px 20px', zIndex: 50,
      }}>
        <div>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>Prezzo listino</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
            {priceFormatted}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            / pz{product.minQty ? ` · conf. ${product.minQty} pezzi` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
