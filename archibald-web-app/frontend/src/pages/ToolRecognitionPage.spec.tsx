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
      expect(screen.getByText(/Analisi con AI/i)).toBeInTheDocument()
    )
  })

  it('mostra schermata budget esaurito quando result.state è budget_exhausted', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue({
      result: { state: 'budget_exhausted' },
      budgetState: { usedToday: 500, dailyLimit: 500, throttleLevel: 'limited' },
      processingMs: 50,
      imageHash: 'xyz',
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
  processingMs: 800, imageHash: 'abc123',
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
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Apri scheda prodotto/i })).toBeInTheDocument()
    )
    await userEvent.click(screen.getByRole('button', { name: /Apri scheda prodotto/i }))

    if (MATCH_RESPONSE.result.state !== 'match') throw new Error('Test setup error')
    expect(feedbackSpy).toHaveBeenCalledWith(TOKEN, {
      imageHash: MATCH_RESPONSE.imageHash,
      productId: MATCH_RESPONSE.result.product.productId,
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
      },
      budgetState: { usedToday: 11, dailyLimit: 500, throttleLevel: 'normal' },
      processingMs: 900, imageHash: 'def456',
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

