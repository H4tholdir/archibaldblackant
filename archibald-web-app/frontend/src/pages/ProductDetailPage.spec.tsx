import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProductDetailPage } from './ProductDetailPage'
import * as recognitionApi from '../api/recognition'
import * as productsApi from '../api/products'
import type { ProductEnrichment, KometFeatures } from '../api/recognition'
import type { Product } from '../api/products'

const TOKEN = 'test-jwt'

beforeEach(() => { localStorage.setItem('archibald_jwt', TOKEN) })
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

const MOCK_PRODUCT: Product = {
  id: 'H1.314.016',
  name: 'TC Round FG Ø1.6',
  price: 12.50,
  vat: 22,
  minQty: 5,
  isRetired: false,
}

const MOCK_PRODUCT_RESPONSE = { success: true, data: MOCK_PRODUCT }

const EMPTY_ENRICHMENT: ProductEnrichment = {
  details: null, gallery: [],
  competitors: [], sizeVariants: [], recognitionHistory: null,
  features: null,
}

const TC_FEATURES: KometFeatures = {
  material:        'Carburo di tungsteno',
  shape:           'Testa tonda',
  shankType:       'Turbina (FG)',
  shankDiameterMm: 1.6,
  headDiameterMm:  1.6,
}

const DIAMOND_FEATURES: KometFeatures = {
  material:        'Diamantata',
  shape:           'Testa tonda',
  shankType:       'Turbina (FG)',
  shankDiameterMm: 1.6,
  headDiameterMm:  1.6,
  gritLabel:       'Grana fine (anello rosso)',
}

const FULL_ENRICHMENT: ProductEnrichment = {
  details: {
    clinicalDescription: 'Per rifinitura smalto e dentina',
    procedures: 'Usare a 150.000 RPM con irrigazione',
    rpmMax: 160000,
    packagingUnits: 5,
    sterile: false,
    singleUse: false,
    notes: null,
    videoUrl: null, pdfUrl: null, sourceUrl: null,
  },
  gallery: [
    { id: 1, url: 'https://example.com/img1.png', altText: null, imageType: 'catalog_render', source: 'kometdental.com', sortOrder: 0 },
  ],
  competitors: [],
  sizeVariants: [
    { id: 'H1.314.012', name: 'H1.314.012', price: null },
    { id: 'H1.314.016', name: 'H1.314.016', price: null },
    { id: 'H1.314.018', name: 'H1.314.018', price: null },
  ],
  recognitionHistory: null,
  features: TC_FEATURES,
}

function renderPage(productId = 'H1.314.016') {
  return render(
    <MemoryRouter initialEntries={[`/products/${productId}`]}>
      <Routes>
        <Route path="/products/:productId" element={<ProductDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProductDetailPage — loading e dati base', () => {
  it('mostra spinner durante il fetch iniziale', () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockImplementation(() => new Promise(() => {}))
    vi.spyOn(productsApi, 'getProductById').mockImplementation(() => new Promise(() => {}))

    renderPage()
    expect(screen.getByText(/Caricamento/i)).toBeInTheDocument()
  })

  it('mostra nome prodotto quando il fetch va a buon fine', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('TC Round FG Ø1.6')).toBeInTheDocument()
    )
  })

  it('mostra prezzo prodotto formattato', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText(/12[.,]50\s*€|€\s*12[.,]50/i)).toBeInTheDocument()
    )
  })

  it('mostra messaggio errore quando productId non esiste', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockRejectedValue(new Error('HTTP 404'))
    vi.spyOn(productsApi, 'getProductById').mockRejectedValue(new Error('HTTP 404'))

    renderPage('NONEXISTENT')

    await waitFor(() =>
      expect(screen.getByText(/Prodotto non trovato|non trovato/i)).toBeInTheDocument()
    )
  })
})

describe('ProductDetailPage — badge caratteristiche strumento', () => {
  it('mostra card caratteristiche quando features è disponibile', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(FULL_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('Caratteristiche strumento')).toBeInTheDocument()
    )
    expect(screen.getByText('Carburo di tungsteno')).toBeInTheDocument()
    expect(screen.getByText('Testa tonda')).toBeInTheDocument()
  })

  it('non mostra card caratteristiche quando features è null', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.queryByText('Caratteristiche strumento')).not.toBeInTheDocument()
    )
  })

  it('mostra gritLabel per prodotti diamantati', async () => {
    const enrichmentWithDiamond: ProductEnrichment = { ...FULL_ENRICHMENT, features: DIAMOND_FEATURES }
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(enrichmentWithDiamond)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('Grana fine (anello rosso)')).toBeInTheDocument()
    )
  })

  it('NON mostra gritLabel per prodotti carburo', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(FULL_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('Carburo di tungsteno')).toBeInTheDocument()
    )
    expect(screen.queryByText(/Grana/i)).not.toBeInTheDocument()
  })
})

describe('ProductDetailPage — tab misure', () => {
  beforeEach(() => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(FULL_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)
  })

  it('mostra chip con codice misura', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('012')).toBeInTheDocument())
    expect(screen.getByText('016')).toBeInTheDocument()
    expect(screen.getByText('018')).toBeInTheDocument()
  })

  it('mostra diametro in mm sotto ogni chip', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/Ø 1,2 mm/i)).toBeInTheDocument())
    expect(screen.getAllByText(/Ø 1,6 mm/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Ø 1,8 mm/i)).toBeInTheDocument()
  })

  it('mostra tabella dimensioni per la variante selezionata', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Diametro della testa')).toBeInTheDocument()
    )
    expect(screen.getByText('Tipo di gambo')).toBeInTheDocument()
    expect(screen.getByText('Diametro del gambo')).toBeInTheDocument()
    expect(screen.getByText('Turbina (FG)')).toBeInTheDocument()
  })
})

describe('ProductDetailPage — CTA con IVA e qty minima', () => {
  it('mostra imponibile e IVA quando vat è disponibile', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    // price=12.50, vat=22% → imponibile = 12.50 / 1.22 ≈ 10.25
    await waitFor(() =>
      expect(screen.getByText(/10[.,]25|imponibile/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/IVA 22%/i)).toBeInTheDocument()
  })

  it('mostra quantità minima quando minQty > 1', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText(/Quantità minima ordine: 5 pezzi/i)).toBeInTheDocument()
    )
  })

  it('NON mostra quantità minima quando minQty è 1', async () => {
    const productQty1 = { ...MOCK_PRODUCT, minQty: 1 }
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue({ success: true, data: productQty1 })

    renderPage()

    await waitFor(() => expect(screen.getByText(/Prezzo listino/i)).toBeInTheDocument())
    expect(screen.queryByText(/Quantità minima ordine/i)).not.toBeInTheDocument()
  })
})

describe('ProductDetailPage — prodotto ritirato', () => {
  const retiredProduct: Product = { ...MOCK_PRODUCT, isRetired: true }
  const retiredResponse = { success: true, data: retiredProduct }

  beforeEach(() => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(retiredResponse)
  })

  it('mostra banner prodotto ritirato', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Prodotto ritirato dal catalogo Komet')).toBeInTheDocument()
    )
  })

  it('mostra pallino rosso e testo "Non più disponibile"', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Non più disponibile')).toBeInTheDocument()
    )
  })

  it('NON mostra IVA e qty minima in CTA per prodotti ritirati', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/Prezzo listino/i)).toBeInTheDocument())
    expect(screen.queryByText(/IVA \d+%/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Quantità minima ordine/i)).not.toBeInTheDocument()
  })
})

describe('ProductDetailPage — dati catalogo esistenti', () => {
  beforeEach(() => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(FULL_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)
  })

  it('mostra velocità massima RPM', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Velocità massima')).toBeInTheDocument()
    )
    expect(screen.getByText(/160[.,]?000\s*RPM/i)).toBeInTheDocument()
  })

  it('mostra tab competitor con placeholder', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Equivalenti competitor')).toBeInTheDocument()
    )
  })
})
