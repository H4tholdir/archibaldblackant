// archibald-web-app/frontend/src/pages/ProductDetailPage.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getProductEnrichment } from '../api/recognition'
import { getProductById } from '../api/products'
import type { ProductEnrichment, ProductGalleryImage, SizeVariant } from '../api/recognition'
import type { Product } from '../api/products'

type Tab = 'prodotto' | 'clinica' | 'misure' | 'competitor' | 'risorse'

function sizeCode(variant: SizeVariant): string {
  const parts = variant.name.split('.')
  return parts[parts.length - 1] ?? variant.id
}

function headDiameterMmFromId(productId: string): number | null {
  const parts = productId.split('.')
  const code = parts[parts.length - 1] ?? ''
  const n = parseInt(code, 10)
  return isNaN(n) ? null : n / 10
}

function gritBadgeStyle(gritLabel: string): { background: string; color: string } {
  if (gritLabel.includes('bianco')) return { background: '#374151', color: '#f9fafb' }
  if (gritLabel.includes('giallo')) return { background: '#713f12', color: '#fde68a' }
  if (gritLabel.includes('rosso'))  return { background: '#7f1d1d', color: '#fca5a5' }
  if (gritLabel.includes('verde'))  return { background: '#14532d', color: '#6ee7b7' }
  if (gritLabel.includes('nero'))   return { background: '#111827', color: '#9ca3af' }
  return { background: '#1e3a5f', color: '#93c5fd' } // blu (default/standard)
}

type FeaturePillProps = { label: string; background: string; color: string }
function FeaturePill({ label, background, color }: FeaturePillProps) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      background, borderRadius: 20, padding: '5px 12px',
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{label}</span>
    </div>
  )
}

// ── Gallery ──────────────────────────────────────────────────────────────────

function GalleryArea({
  gallery,
  fromScanner,
  onBack,
  isRetired,
}: {
  gallery: ProductGalleryImage[]
  fromScanner: boolean
  onBack: () => void
  isRetired: boolean
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
        {isRetired && (
          <div style={{
            background: 'rgba(239,68,68,0.15)', backdropFilter: 'blur(6px)',
            border: '1px solid rgba(239,68,68,0.6)', color: '#fca5a5',
            fontSize: 11, padding: '4px 10px', borderRadius: 20,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            Prodotto ritirato
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
        const [productRes, enrichmentRes] = await Promise.allSettled([
          getProductById(token!, decodedId),
          getProductEnrichment(token!, decodedId),
        ])

        if (productRes.status === 'fulfilled') {
          if (productRes.value.success) {
            setProduct(productRes.value.data)
          } else {
            setNotFound(true)
          }
        } else {
          console.error('getProductById failed:', productRes.reason)
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

  const priceFormatted = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR',
  }).format(product.price ?? 0)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'prodotto', label: 'Prodotto' },
    { id: 'clinica', label: 'Clinica' },
    { id: 'misure', label: 'Misure' },
    { id: 'risorse', label: 'Risorse' },
    { id: 'competitor', label: 'Competitor' },
  ]

  return (
    <div style={{ background: '#111', minHeight: '100vh', paddingBottom: 90 }}>
      <GalleryArea
        gallery={gallery}
        fromScanner={fromScanner}
        onBack={() => navigate(-1)}
        isRetired={product.isRetired ?? false}
      />

      <div style={{ padding: 16 }}>
        {/* Product name */}
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, lineHeight: 1.2, margin: '0 0 4px' }}>
          {product.name}
        </h1>

        {/* Product code */}
        <div style={{
          fontSize: 11, color: '#6b7280', fontFamily: "'SF Mono', Consolas, monospace",
          marginBottom: product.isRetired ? 10 : 14, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: product.isRetired ? '#ef4444' : '#22c55e',
            display: 'inline-block', flexShrink: 0,
          }} />
          {product.isRetired ? 'Non più disponibile' : product.id}
        </div>

        {product.isRetired && (
          <div style={{
            background: '#1f0d0d', border: '1px solid #7f1d1d', borderRadius: 10,
            padding: '12px 16px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 13, color: '#fca5a5', fontWeight: 600, marginBottom: 4 }}>
              Prodotto ritirato dal catalogo Komet
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
              Le informazioni tecniche sono conservate per consultazione storica.
            </div>
          </div>
        )}

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
          {/* Badge caratteristiche strumento */}
          {enrichment?.features && (
            <div style={{
              background: '#1a1a1a', borderRadius: 10, padding: '14px 16px', marginBottom: 10,
            }}>
              <div style={{
                fontSize: 10, color: '#6b7280', letterSpacing: '1px',
                textTransform: 'uppercase', marginBottom: 10,
              }}>
                Caratteristiche strumento
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <FeaturePill
                  label={enrichment.features.material}
                  background="#166534"
                  color="#86efac"
                />
                <FeaturePill
                  label={enrichment.features.shape}
                  background="#1e3a5f"
                  color="#93c5fd"
                />
                <FeaturePill
                  label={`Gambo ${enrichment.features.shankType} · Ø ${enrichment.features.shankDiameterMm.toLocaleString('it-IT')} mm`}
                  background="#451a03"
                  color="#fbbf24"
                />
                {enrichment.features.gritLabel && (
                  <FeaturePill
                    label={enrichment.features.gritLabel}
                    {...gritBadgeStyle(enrichment.features.gritLabel)}
                  />
                )}
              </div>
            </div>
          )}
          {details && (details.rpmMax || details.packagingUnits != null || details.notes) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {details.rpmMax && (
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1a2a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>⚡</div>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Velocità massima</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                      {details.rpmMax.toLocaleString('it-IT')} RPM
                    </div>
                  </div>
                </div>
              )}
              {details.packagingUnits != null && (
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1a1a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📦</div>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Confezione</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                      {details.packagingUnits} pz
                      {details.sterile && <span style={{ fontSize: 12, color: '#22c55e', marginLeft: 8 }}>Sterile</span>}
                      {details.singleUse && <span style={{ fontSize: 12, color: '#f59e0b', marginLeft: 8 }}>Monouso</span>}
                    </div>
                  </div>
                </div>
              )}
              {details.notes && (
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Note</div>
                  <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6 }}>{details.notes}</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#4b5563', fontSize: 14, padding: '20px 0' }}>
              Dati tecnici non ancora disponibili per questo prodotto.
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Chip varianti con diametro in mm */}
              <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                <div style={{
                  fontSize: 10, color: '#6b7280', letterSpacing: '1px',
                  textTransform: 'uppercase', marginBottom: 10,
                }}>
                  Misure disponibili
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {sizeVariants.map(v => {
                    const isActive = v.id === product.id
                    const code = sizeCode(v)
                    const diam = headDiameterMmFromId(v.id)
                    return (
                      <button
                        key={v.id}
                        onClick={() => !isActive && navigate(`/products/${encodeURIComponent(v.id)}`)}
                        style={{
                          background: isActive ? '#0d2b0d' : '#252525',
                          border: `1px solid ${isActive ? '#22c55e' : '#333'}`,
                          borderRadius: 7, padding: '6px 10px',
                          fontFamily: "'SF Mono', Consolas, monospace",
                          color: isActive ? '#6ee7b7' : '#9ca3af',
                          cursor: isActive ? 'default' : 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: isActive ? 600 : 400 }}>{code}</div>
                        {diam !== null && (
                          <div style={{ fontSize: 9, color: isActive ? '#6ee7b7' : '#6b7280', marginTop: 2 }}>
                            Ø {diam.toLocaleString('it-IT')} mm
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tabella dimensioni per la variante selezionata */}
              {enrichment?.features && (
                <div style={{ background: '#1a1a1a', borderRadius: 10, overflow: 'hidden' }}>
                  {[
                    { label: 'Diametro della testa',  value: `${enrichment.features.headDiameterMm.toLocaleString('it-IT')} mm` },
                    { label: 'Tipo di gambo',          value: enrichment.features.shankType },
                    { label: 'Diametro del gambo',     value: `${enrichment.features.shankDiameterMm.toLocaleString('it-IT')} mm` },
                  ].map(({ label, value }, i, arr) => (
                    <div
                      key={label}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 14px',
                        borderBottom: i < arr.length - 1 ? '1px solid #222' : 'none',
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
                      <div style={{
                        fontSize: 12, fontWeight: 600,
                        color: product.isRetired ? '#6b7280' : '#fff',
                        fontFamily: "'SF Mono', Consolas, monospace",
                      }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#4b5563', fontSize: 14, padding: '20px 0' }}>
              Nessuna variante di misura disponibile.
            </div>
          )}
        </div>

        {/* ── Tab: Risorse ── */}
        <div style={{ display: activeTab === 'risorse' ? 'block' : 'none' }}>
          {(details?.videoUrl || details?.pdfUrl || details?.sourceUrl) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {details.videoUrl && (
                <a
                  href={details.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: '#1a1a1a', borderRadius: 10, padding: '14px 16px',
                    color: '#fff', textDecoration: 'none',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: '#7f1d1d',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, flexShrink: 0,
                  }}>▶</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Video prodotto</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Guarda su YouTube</div>
                  </div>
                </a>
              )}
              {details.pdfUrl && (
                <a
                  href={details.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: '#1a1a1a', borderRadius: 10, padding: '14px 16px',
                    color: '#fff', textDecoration: 'none',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: '#1e3a5f',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, flexShrink: 0,
                  }}>PDF</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Scheda tecnica PDF</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Scarica documento</div>
                  </div>
                </a>
              )}
              {details.sourceUrl && (
                <div style={{ fontSize: 11, color: '#374151', textAlign: 'right', marginTop: 4 }}>
                  Fonte:{' '}
                  <a
                    href={details.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#4b5563' }}
                  >
                    {new URL(details.sourceUrl).hostname}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#4b5563', fontSize: 14, padding: '20px 0' }}>
              Nessuna risorsa disponibile per questo prodotto.
            </div>
          )}
        </div>

        {/* ── Tab: Competitor ── */}
        <div style={{ display: activeTab === 'competitor' ? 'block' : 'none' }}>
          <div style={{
            background: '#1a1a1a', border: '1px dashed #2a2a2a', borderRadius: 12,
            padding: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🏷</div>
            <div style={{ color: '#e5e7eb', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Equivalenti competitor
            </div>
            <div style={{ color: '#4b5563', fontSize: 13, lineHeight: 1.6 }}>
              Disponibile nella prossima versione.{'\n'}
              Confronteremo questo prodotto con gli equivalenti Brasseler, Dentsply e 3M.
            </div>
          </div>
        </div>
      </div>

      {/* CTA sticky */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#0a0a0a', borderTop: '1px solid #1f2937',
        padding: '12px 20px', zIndex: 50,
        opacity: product.isRetired ? 0.6 : 1,
      }}>
        <div>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>Prezzo listino</div>
          <div style={{
            fontSize: 24, fontWeight: 700,
            color: product.isRetired ? '#6b7280' : '#fff',
            lineHeight: 1,
            textDecoration: product.isRetired ? 'line-through' : 'none',
          }}>
            {priceFormatted}
          </div>
          {!product.isRetired && product.vat != null && product.price != null && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
              {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
                .format(product.price / (1 + product.vat / 100))} imponibile + IVA {product.vat}%
            </div>
          )}
          {!product.isRetired && product.minQty != null && product.minQty > 1 && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
              Quantità minima ordine: {product.minQty} pezzi
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
