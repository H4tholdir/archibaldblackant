import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getProductEnrichment } from '../api/recognition'
import { getProducts } from '../api/products'
import type { ProductEnrichment } from '../api/recognition'
import type { Product } from '../api/products'

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()

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
    </div>
  )
}

function EnrichmentSection({ enrichment: _enrichment, product: _product }: { enrichment: ProductEnrichment | null; product: Product }) {
  return null
}
