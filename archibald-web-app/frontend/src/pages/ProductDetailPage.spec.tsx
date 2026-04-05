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
  features: null, details: null, gallery: [],
  competitors: [], sizeVariants: [], recognitionHistory: null,
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
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue({
      success: true,
      data: {
        products: [{
          id: 'H1.314.016', name: 'TC Round FG Ø1.6',
          price: 12.50, vat: 22,
          articleName: 'TC Round',
        }],
        totalCount: 1, returnedCount: 1, limited: false,
      },
    })

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('TC Round FG Ø1.6')).toBeInTheDocument()
    )
    expect(screen.getByText('H1.314.016')).toBeInTheDocument()
  })

  it('mostra prezzo prodotto formattato', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue({
      success: true,
      data: {
        products: [{ id: 'H1.314.016', name: 'TC Round FG Ø1.6', price: 12.50, vat: 22, articleName: 'TC Round' }],
        totalCount: 1, returnedCount: 1, limited: false,
      },
    })

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
