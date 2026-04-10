import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProductDetailPage } from './ProductDetailPage'
import * as recognitionApi from '../api/recognition'
import * as productsApi from '../api/products'
import type { ProductEnrichment } from '../api/recognition'

const TOKEN = 'test-jwt'

beforeEach(() => { localStorage.setItem('archibald_jwt', TOKEN) })
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

const EMPTY_ENRICHMENT: ProductEnrichment = {
  details: null, gallery: [],
  competitors: [], sizeVariants: [], recognitionHistory: null,
}

const MOCK_PRODUCT = {
  id: 'H1.314.016',
  name: 'TC Round FG Ø1.6',
  price: 12.50,
  vat: 22,
  articleName: 'TC Round',
}

const MOCK_PRODUCTS_RESPONSE = {
  success: true,
  data: {
    products: [MOCK_PRODUCT],
    totalCount: 1,
    returnedCount: 1,
    limited: false,
  },
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
    vi.spyOn(productsApi, 'getProducts').mockImplementation(() => new Promise(() => {}))

    renderPage()
    expect(screen.getByText(/Caricamento/i)).toBeInTheDocument()
  })

  it('mostra nome prodotto quando il fetch va a buon fine', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue(MOCK_PRODUCTS_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('TC Round FG Ø1.6')).toBeInTheDocument()
    )
    expect(screen.getByText('H1.314.016')).toBeInTheDocument()
  })

  it('mostra prezzo prodotto formattato', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue(MOCK_PRODUCTS_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText(/12[.,]50\s*€|€\s*12[.,]50/i)).toBeInTheDocument()
    )
  })

  it('mostra messaggio errore quando productId non esiste', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockRejectedValue(new Error('HTTP 404'))
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue({
      success: true,
      data: { products: [], totalCount: 0, returnedCount: 0, limited: false },
    })

    renderPage('NONEXISTENT')

    await waitFor(() =>
      expect(screen.getByText(/Prodotto non trovato|non trovato/i)).toBeInTheDocument()
    )
  })
})

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
    { id: 2, url: 'https://example.com/img2.jpg', altText: null, imageType: 'product_photo', source: 'kometdental.com', sortOrder: 1 },
  ],
  competitors: [],
  sizeVariants: [
    { id: 'ERP-012', name: 'H1.314.012', price: null },
    { id: 'ERP-016', name: 'H1.314.016', price: null },
    { id: 'ERP-018', name: 'H1.314.018', price: null },
  ],
  recognitionHistory: [
    { scannedAt: '2026-04-04T14:30:00Z', agentId: 'agent-1', confidence: 0.95, cacheHit: false },
  ],
}

describe('ProductDetailPage — gallery', () => {
  beforeEach(() => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(FULL_ENRICHMENT)
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue(MOCK_PRODUCTS_RESPONSE)
  })

  it('mostra la prima immagine della gallery', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /strumento|prodotto|gallery/i })).toBeInTheDocument()
    )
  })
})

describe('ProductDetailPage — selettore misure', () => {
  beforeEach(() => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(FULL_ENRICHMENT)
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue(MOCK_PRODUCTS_RESPONSE)
  })

  it('mostra chip per ogni variante di misura nel formato "016"', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('012')).toBeInTheDocument())
    expect(screen.getByText('016')).toBeInTheDocument()
    expect(screen.getByText('018')).toBeInTheDocument()
  })
})

describe('ProductDetailPage — performance e CTA', () => {
  beforeEach(() => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(FULL_ENRICHMENT)
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue(MOCK_PRODUCTS_RESPONSE)
  })

  it('mostra velocità massima RPM e confezione dal catalogo', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Velocità massima')).toBeInTheDocument()
    )
    expect(screen.getByText(/160[.,]?000\s*RPM/i)).toBeInTheDocument()
    expect(screen.getByText('Confezione')).toBeInTheDocument()
    expect(screen.getByText(/5\s*pz/)).toBeInTheDocument()
  })

  it('mostra tab competitor con placeholder prossima versione', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getAllByText(/Competitor/i).length).toBeGreaterThanOrEqual(1)
    )
    expect(screen.getByText('Equivalenti competitor')).toBeInTheDocument()
  })

  it('mostra blocco prezzo nella CTA sticky', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Prezzo listino')).toBeInTheDocument()
    )
    expect(screen.getByText(/12[.,]50\s*€|€\s*12[.,]50/i)).toBeInTheDocument()
  })
})
