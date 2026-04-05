// archibald-web-app/frontend/src/pages/ToolRecognitionPage.spec.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ToolRecognitionPage } from './ToolRecognitionPage'
import * as recognitionApi from '../api/recognition'
import type { IdentifyResponse } from '../api/recognition'

// Mock getUserMedia
function mockGetUserMedia(impl: () => Promise<MediaStream | never>) {
  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockImplementation(impl) },
    writable: true,
    configurable: true,
  })
}

function mockStream() {
  const track = {
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream
}

const TOKEN = 'test-jwt'

beforeEach(() => {
  localStorage.setItem('archibald_jwt', TOKEN)
  vi.spyOn(recognitionApi, 'getRecognitionBudget').mockResolvedValue({
    usedToday: 10, dailyLimit: 500, throttleLevel: 'normal',
  })
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('ToolRecognitionPage — Stato 0 (permission denied)', () => {
  it('mostra schermata di accesso negato quando getUserMedia lancia NotAllowedError', async () => {
    const err = new Error('Permission denied')
    err.name = 'NotAllowedError'
    mockGetUserMedia(() => Promise.reject(err))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() =>
      expect(screen.getByText(/Fotocamera non autorizzata/i)).toBeInTheDocument()
    )
    expect(screen.getByRole('link', { name: /Cerca manualmente/i })).toHaveAttribute('href', '/products')
  })

  it('mostra schermata di accesso negato anche per NotFoundError', async () => {
    const err = new Error('No camera')
    err.name = 'NotFoundError'
    mockGetUserMedia(() => Promise.reject(err))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() =>
      expect(screen.getByText(/Fotocamera non autorizzata/i)).toBeInTheDocument()
    )
  })
})

describe('ToolRecognitionPage — Stato 1 (idle viewfinder)', () => {
  it('mostra pulsante di scatto quando camera è disponibile', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /scatta|shutter/i })).toBeInTheDocument()
    )
  })

  it('mostra budget residuo (dailyLimit - usedToday)', async () => {
    const usedToday = 493
    const dailyLimit = 500
    vi.spyOn(recognitionApi, 'getRecognitionBudget').mockResolvedValue({
      usedToday, dailyLimit, throttleLevel: 'normal',
    })
    mockGetUserMedia(() => Promise.resolve(mockStream()))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    const remainingScans = dailyLimit - usedToday
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`${remainingScans} scan`, 'i'))).toBeInTheDocument()
    )
  })

  it('mostra banner warning quando throttle_level è warning', async () => {
    vi.spyOn(recognitionApi, 'getRecognitionBudget').mockResolvedValue({
      usedToday: 420, dailyLimit: 500, throttleLevel: 'warning',
    })
    mockGetUserMedia(() => Promise.resolve(mockStream()))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() =>
      expect(screen.getByText(/Budget quasi esaurito/i)).toBeInTheDocument()
    )
  })
})

describe('ToolRecognitionPage — Stato 2 (analyzing)', () => {
  it('mostra spinner di analisi dopo lo scatto', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    vi.spyOn(recognitionApi, 'identifyInstrument').mockImplementation(
      () => new Promise(() => {}) // non risolve — rimane in analisi
    )

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() => screen.getByRole('button', { name: /scatta|shutter/i }))
    await userEvent.click(screen.getByRole('button', { name: /scatta|shutter/i }))

    await waitFor(() =>
      expect(screen.getByText(/Estrazione features AI/i)).toBeInTheDocument()
    )
  })

  it('mostra schermata budget esaurito quando result.state è budget_exhausted', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue({
      result: { state: 'budget_exhausted' },
      budgetState: { usedToday: 500, dailyLimit: 500, throttleLevel: 'limited' },
      processingMs: 50,
      imageHash: 'xyz',
      broadCandidates: [],
    })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() => screen.getByRole('button', { name: /scatta|shutter/i }))
    await userEvent.click(screen.getByRole('button', { name: /scatta|shutter/i }))

    await waitFor(() =>
      expect(screen.getByText(/Budget giornaliero esaurito/i)).toBeInTheDocument()
    )
  })
})

const MATCH_RESPONSE: IdentifyResponse = {
  result: {
    state: 'match',
    product: {
      productId: 'H1.314.016', productName: 'TC Round FG Ø1.6', familyCode: 'H1',
      headSizeMm: 1.6, shankType: 'fg', thumbnailUrl: null, confidence: 0.95,
    },
    confidence: 0.95,
  },
  budgetState: { usedToday: 11, dailyLimit: 500, throttleLevel: 'normal' },
  processingMs: 800, imageHash: 'abc123', broadCandidates: [],
}

describe('ToolRecognitionPage — Stato 3A (match)', () => {
  it('mostra card match con pulsante "Apri scheda prodotto"', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue(MATCH_RESPONSE)
    vi.spyOn(recognitionApi, 'submitRecognitionFeedback').mockResolvedValue({ queued: true })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await waitFor(() => screen.getByRole('button', { name: /scatta|shutter/i }))
    await userEvent.click(screen.getByRole('button', { name: /scatta|shutter/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Apri scheda prodotto/i })).toBeInTheDocument()
    )
    expect(screen.getByText('TC Round FG Ø1.6')).toBeInTheDocument()
    expect(screen.getByText('H1.314.016')).toBeInTheDocument()
  })

  it('chiama submitRecognitionFeedback prima di navigare quando si clicca "Apri scheda"', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue(MATCH_RESPONSE)
    const feedbackSpy = vi.spyOn(recognitionApi, 'submitRecognitionFeedback').mockResolvedValue({ queued: true })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await waitFor(() => screen.getByRole('button', { name: /scatta|shutter/i }))
    await userEvent.click(screen.getByRole('button', { name: /scatta|shutter/i }))
    await waitFor(() => screen.getByRole('button', { name: /Apri scheda prodotto/i }))
    await userEvent.click(screen.getByRole('button', { name: /Apri scheda prodotto/i }))

    expect(feedbackSpy).toHaveBeenCalledWith(TOKEN, {
      imageHash: 'abc123',
      productId: 'H1.314.016',
      confirmedByUser: true,
    })
  })
})

describe('ToolRecognitionPage — Stato 3B (shortlist)', () => {
  it('mostra lista candidati con link a scheda prodotto', async () => {
    const shortlistResponse: IdentifyResponse = {
      result: {
        state: 'shortlist',
        candidates: [
          { productId: 'H1.314.014', productName: 'TC Round Ø1.4', familyCode: 'H1', headSizeMm: 1.4, shankType: 'fg', thumbnailUrl: null, confidence: 0.82 },
          { productId: 'H1.314.016', productName: 'TC Round Ø1.6', familyCode: 'H1', headSizeMm: 1.6, shankType: 'fg', thumbnailUrl: null, confidence: 0.75 },
        ],
        extractedFeatures: {
          shape_family: 'round', material: 'tungsten_carbide',
          grit_ring_color: null, shank_type: 'fg',
          head_px: null, shank_px: null, confidence: 0.78,
        },
      },
      budgetState: { usedToday: 11, dailyLimit: 500, throttleLevel: 'normal' },
      processingMs: 900, imageHash: 'def456', broadCandidates: [],
    }

    mockGetUserMedia(() => Promise.resolve(mockStream()))
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue(shortlistResponse)

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await waitFor(() => screen.getByRole('button', { name: /scatta|shutter/i }))
    await userEvent.click(screen.getByRole('button', { name: /scatta|shutter/i }))

    await waitFor(() =>
      expect(screen.getByText(/2 candidati trovati/i)).toBeInTheDocument()
    )
    expect(screen.getByText('TC Round Ø1.4')).toBeInTheDocument()
    expect(screen.getByText('TC Round Ø1.6')).toBeInTheDocument()
  })
})

describe('ToolRecognitionPage — Stato 3C (filter needed)', () => {
  it('mostra domanda con opzioni large-tap', async () => {
    const filterResponse: IdentifyResponse = {
      result: {
        state: 'filter_needed',
        extractedFeatures: {
          shape_family: 'round', material: 'diamond',
          grit_ring_color: null, shank_type: 'fg',
          head_px: null, shank_px: null, confidence: 0.45,
        },
        question: {
          field: 'grit_ring_color',
          prompt: 'Che colore ha il ring sulla fresa?',
          options: [
            { label: 'Rosso (fine)', value: 'red' },
            { label: 'Blu (standard)', value: 'blue' },
            { label: 'Verde (grossolano)', value: 'green' },
          ],
        },
      },
      budgetState: { usedToday: 11, dailyLimit: 500, throttleLevel: 'normal' },
      processingMs: 700, imageHash: 'ghi789', broadCandidates: [],
    }

    mockGetUserMedia(() => Promise.resolve(mockStream()))
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue(filterResponse)

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await waitFor(() => screen.getByRole('button', { name: /scatta|shutter/i }))
    await userEvent.click(screen.getByRole('button', { name: /scatta|shutter/i }))

    await waitFor(() =>
      expect(screen.getByText('Che colore ha il ring sulla fresa?')).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: 'Rosso (fine)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Blu (standard)' })).toBeInTheDocument()
  })
})
