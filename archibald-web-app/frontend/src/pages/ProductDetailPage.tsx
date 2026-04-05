import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getProductEnrichment } from '../api/recognition'
import { getProducts } from '../api/products'
import type { ProductEnrichment } from '../api/recognition'
import type { Product } from '../api/products'

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()
  const navigate = useNavigate()

  const [product, setProduct] = useState<Product | null>(null)
  const [enrichment, setEnrichment] = useState<ProductEnrichment | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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
      }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ color: '#fff', margin: 0 }}>Prodotto non trovato</h2>
        <Link to="/products" style={{ color: '#60a5fa', textDecoration: 'none' }}>
          ← Torna al catalogo
        </Link>
      </div>
    )
  }

  const priceFormatted = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR',
  }).format(product.price ?? 0)

  return (
    <div style={{ padding: '0 0 120px 0', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 13 }}>
        <Link to="/products" style={{ color: '#60a5fa', textDecoration: 'none' }}>Articoli</Link>
        {' / '}{product.id}
      </div>

      <div style={{ padding: '0 20px 24px', borderBottom: '1px solid #1f2937' }}>
        <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 4 }}>{product.id}</div>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>
          {product.name}
        </h1>
        <div style={{ color: '#4ade80', fontSize: 24, fontWeight: 700 }}>
          {priceFormatted}
        </div>
        {product.vat && (
          <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
            IVA {product.vat}% inclusa
          </div>
        )}
      </div>

      <EnrichmentSection enrichment={enrichment} product={product} />

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#111', borderTop: '1px solid #1f2937',
        padding: '16px 20px', display: 'flex', justifyContent: 'flex-end',
        zIndex: 50,
      }}>
        <button
          onClick={() => navigate(`/order?productId=${encodeURIComponent(product.id)}`)}
          style={{
            background: '#2563eb', color: '#fff', border: 'none',
            borderRadius: 12, padding: '14px 24px',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Aggiungi all'ordine
        </button>
      </div>
    </div>
  )
}

const GRIT_LABELS: Record<string, string> = {
  white: 'UF Bianco', yellow: 'EF Giallo', red: 'Fine Rosso',
  blue: 'Std Blu', green: 'Grosso Verde', black: 'SC Nero', none: '—',
}

const SHAPE_LABELS: Record<string, string> = {
  round: 'Round', pear: 'Pear', inverted_cone: 'Inverted Cone',
  cylinder: 'Cylinder', tapered_round_end: 'Tapered Round', flame: 'Flame',
  torpedo: 'Torpedo', diabolo: 'Diabolo', wheel: 'Wheel', egg: 'Egg',
  bud: 'Bud', double_cone: 'Double Cone', other: 'Other',
}

const MATERIAL_LABELS: Record<string, string> = {
  tungsten_carbide: 'TC', diamond: 'Diamond', diamond_diao: 'DIAO',
  steel: 'Steel', ceramic: 'Ceramic', polymer: 'Polymer',
  sonic_tip: 'Sonic', ultrasonic: 'Ultrasonic',
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      background: '#1f2937', borderRadius: 8, padding: '8px 12px', gap: 4,
    }}>
      <div style={{ color: '#6b7280', fontSize: 11 }}>{label}</div>
      <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function GallerySection({ gallery }: { gallery: ProductEnrichment['gallery'] }) {
  const [activeIdx, setActiveIdx] = useState(0)
  if (gallery.length === 0) return null
  const active = gallery[activeIdx]

  return (
    <div style={{ padding: '20px 20px 0' }}>
      <div style={{
        background: '#111', borderRadius: 12, overflow: 'hidden',
        aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 12,
      }}>
        <img
          src={active.imageUrl}
          alt={`Strumento Komet — ${active.imageType}`}
          aria-label="gallery principale"
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>

      {gallery.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {gallery.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setActiveIdx(i)}
              style={{
                width: 56, height: 56, flexShrink: 0,
                border: `2px solid ${i === activeIdx ? '#60a5fa' : 'transparent'}`,
                borderRadius: 8, background: '#1f2937', cursor: 'pointer', padding: 0,
              }}
            >
              <img
                src={img.imageUrl}
                alt={img.imageType}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
              />
            </button>
          ))}
        </div>
      )}

      <div style={{ color: '#6b7280', fontSize: 11, textAlign: 'right', marginTop: 4 }}>
        {active.source} · {active.imageType.replace(/_/g, ' ')}
      </div>
    </div>
  )
}

function EnrichmentSection({ enrichment, product }: { enrichment: ProductEnrichment | null; product: Product }) {
  const navigate = useNavigate()

  if (!enrichment) return null

  const { features, gallery, sizeVariants, recognitionHistory } = enrichment

  return (
    <>
      <GallerySection gallery={gallery} />

      {features && (
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, letterSpacing: 1, marginBottom: 12 }}>
            CARATTERISTICHE
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {features.shape_family && (
              <Badge label="Forma" value={SHAPE_LABELS[features.shape_family] ?? features.shape_family} />
            )}
            {features.material && (
              <Badge label="Materiale" value={MATERIAL_LABELS[features.material] ?? features.material} />
            )}
            {features.grit_ring_color && features.grit_ring_color !== 'none' && (
              <Badge label="Grana" value={GRIT_LABELS[features.grit_ring_color] ?? features.grit_ring_color} />
            )}
            {features.shank_type && (
              <Badge label="Gambo" value={features.shank_type.toUpperCase()} />
            )}
          </div>
        </div>
      )}

      {sizeVariants.length > 1 && (
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, letterSpacing: 1, marginBottom: 12 }}>
            MISURE DISPONIBILI
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sizeVariants.map(v => {
              const isActive = v.productId === product.id
              return (
                <button
                  key={v.productId}
                  onClick={() => !isActive && navigate(`/products/${encodeURIComponent(v.productId)}`)}
                  style={{
                    padding: '8px 16px', borderRadius: 20, border: 'none',
                    background: isActive ? '#2563eb' : '#1f2937',
                    color: isActive ? '#fff' : '#9ca3af',
                    fontWeight: isActive ? 700 : 400,
                    fontSize: 14, cursor: isActive ? 'default' : 'pointer',
                  }}
                >
                  Ø{v.headSizeMm}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {recognitionHistory && recognitionHistory.length > 0 && (
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, letterSpacing: 1, marginBottom: 12 }}>
            STORICO SCANSIONI
          </div>
          {recognitionHistory.slice(0, 10).map((h, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid #1f2937',
            }}>
              <div>
                <div style={{ color: '#d1d5db', fontSize: 13 }}>
                  {new Date(h.scannedAt).toLocaleDateString('it-IT')}
                </div>
                <div style={{ color: '#6b7280', fontSize: 11 }}>
                  Agente {h.agentId.slice(0, 8)}{h.cacheHit ? ' · cache' : ''}
                </div>
              </div>
              <div style={{
                background: '#14532d', color: '#4ade80',
                borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 600,
              }}>
                {Math.round(h.confidence * 100)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {enrichment.details?.performanceData && (() => {
        const pd = enrichment.details!.performanceData!
        return (
          <div style={{ padding: '20px 20px 0' }}>
            <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, letterSpacing: 1, marginBottom: 12 }}>
              PERFORMANCE
            </div>
            {[
              { label: 'Durata', value: pd.durabilityPct },
              { label: 'Affilatura', value: pd.sharpnessPct },
            ].map(({ label, value }) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#d1d5db', fontSize: 13 }}>{label}</span>
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>{value}%</span>
                </div>
                <div style={{ background: '#1f2937', borderRadius: 4, height: 6 }}>
                  <div style={{
                    width: `${value}%`, height: '100%',
                    background: value >= 80 ? '#4ade80' : value >= 60 ? '#facc15' : '#f87171',
                    borderRadius: 4,
                  }} />
                </div>
              </div>
            ))}
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>
              Max {pd.maxRpm.toLocaleString('it-IT')} RPM · Irrigazione min {pd.minSprayMl} ml/min
            </div>
          </div>
        )
      })()}

      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, letterSpacing: 1, marginBottom: 12 }}>
          COMPETITOR
        </div>
        <div style={{
          background: '#111', border: '1px solid #1f2937', borderRadius: 12,
          padding: 20, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
          <div style={{ color: '#4b5563', fontSize: 14 }}>
            Equivalenti disponibili in Fase 2
          </div>
        </div>
      </div>

      {enrichment.details?.clinicalDescription && (
        <div style={{ padding: '20px 20px 0' }}>
          <details>
            <summary style={{
              color: '#9ca3af', fontSize: 12, fontWeight: 600,
              letterSpacing: 1, cursor: 'pointer', listStyle: 'none',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>INDICAZIONI CLINICHE</span>
              <span>▼</span>
            </summary>
            <div style={{ marginTop: 12, color: '#d1d5db', fontSize: 14, lineHeight: 1.6 }}>
              {enrichment.details.clinicalDescription}
            </div>
            {enrichment.details.procedures && (
              <div style={{ marginTop: 8, color: '#9ca3af', fontSize: 13 }}>
                {enrichment.details.procedures}
              </div>
            )}
          </details>
        </div>
      )}
    </>
  )
}
