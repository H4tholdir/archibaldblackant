// archibald-web-app/frontend/src/pages/ToolRecognitionPage.spec.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ToolRecognitionPage } from './ToolRecognitionPage'
import * as recognitionApi from '../api/recognition'
import type { IdentifyResponse } from '../api/recognition'

let arucoResult: { detected: boolean; pxPerMm: number | null } = { detected: true, pxPerMm: 5.0 }

vi.mock('../hooks/useArucoDetector', () => ({
  useArucoDetector: () => vi.fn().mockImplementation(() => Promise.resolve(arucoResult)),
}))

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
    getTracks:      () => [track],
  } as unknown as MediaStream
}

function mockCapture() {
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth',  { get: () => 1, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 1, configurable: true })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,FAKEFRAME')
}

async function captureAndIdentify() {
  await waitFor(() => screen.getByRole('button', { name: /SCATTA FOTO 1/i }))
  await userEvent.click(screen.getByRole('button', { name: /SCATTA FOTO 1/i }))
  await waitFor(() => screen.getByRole('button', { name: /Procedi con 1 foto/i }))
  await userEvent.click(screen.getByRole('button', { name: /Procedi con 1 foto/i }))
  await waitFor(() => screen.getByRole('button', { name: /Identifica/i }))
  await userEvent.click(screen.getByRole('button', { name: /Identifica/i }))
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
      expect(screen.getByRole('button', { name: /SCATTA FOTO 1/i })).toBeInTheDocument()
    )
  })

  it('mostra step indicator "STEP 1 DI 2" nello stato idle_photo1', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() =>
      expect(screen.getByText(/STEP 1 DI 2/i)).toBeInTheDocument()
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
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockImplementation(
      () => new Promise(() => {})
    )

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Analisi con AI/i)).toBeInTheDocument()
    )
  })

  it('mostra schermata budget esaurito quando result.type è budget_exhausted', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue({
      result: { type: 'budget_exhausted' },
      budgetState: { usedToday: 500, dailyLimit: 500, throttleLevel: 'limited' },
      processingMs: 50,
      imageHash: 'xyz',
    })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Budget giornaliero esaurito/i)).toBeInTheDocument()
    )
  })
})

const MATCH_RESPONSE: IdentifyResponse = {
  result: {
    type: 'match',
    data: {
      familyCode:        'H1',
      productName:       'TC Round FG Ø1.6',
      shankType:         'fg',
      headDiameterMm:    1.6,
      headLengthMm:      null,
      shapeClass:        'sfera',
      confidence:        0.95,
      thumbnailUrl:      null,
      discontinued:      false,
      measurementSource: 'shank_iso',
    },
  },
  budgetState: { usedToday: 11, dailyLimit: 500, throttleLevel: 'normal' },
  processingMs: 800,
  imageHash: 'abc123',
}

describe('ToolRecognitionPage — Stato 3A (match)', () => {
  it('mostra card match con pulsante "Apri scheda prodotto"', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue(MATCH_RESPONSE)
    vi.spyOn(recognitionApi, 'submitRecognitionFeedback').mockResolvedValue({ queued: true })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Apri scheda prodotto/i })).toBeInTheDocument()
    )
    expect(screen.getByText('TC Round FG Ø1.6')).toBeInTheDocument()
    expect(screen.getByText('H1')).toBeInTheDocument()
  })

  it('chiama submitRecognitionFeedback con familyCode prima di navigare', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue(MATCH_RESPONSE)
    const feedbackSpy = vi.spyOn(recognitionApi, 'submitRecognitionFeedback').mockResolvedValue({ queued: true })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Apri scheda prodotto/i })).toBeInTheDocument()
    )
    await userEvent.click(screen.getByRole('button', { name: /Apri scheda prodotto/i }))

    if (MATCH_RESPONSE.result.type !== 'match') throw new Error('Test setup error')
    expect(feedbackSpy).toHaveBeenCalledWith(TOKEN, {
      imageHash:       MATCH_RESPONSE.imageHash,
      productId:       MATCH_RESPONSE.result.data.familyCode,
      confirmedByUser: true,
    })
  })
})

describe('ToolRecognitionPage — Stato 3B (shortlist)', () => {
  it('mostra lista candidati', async () => {
    const shortlistResponse: IdentifyResponse = {
      result: {
        type: 'shortlist_visual',
        data: {
          candidates: [
            { familyCode: 'H1',     shapeDescription: null, thumbnailUrl: null, referenceImages: [] },
            { familyCode: 'H79NEX', shapeDescription: null, thumbnailUrl: null, referenceImages: [] },
          ],
        },
      },
      budgetState: { usedToday: 11, dailyLimit: 500, throttleLevel: 'normal' },
      processingMs: 900,
      imageHash: 'def456',
    }

    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue(shortlistResponse)

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/2 candidati trovati/i)).toBeInTheDocument()
    )
    expect(screen.getByText('H1')).toBeInTheDocument()
    expect(screen.getByText('H79NEX')).toBeInTheDocument()
  })
})

describe('ToolRecognitionPage — Stato 3C (not_found)', () => {
  it('mostra schermata not_found con misure quando disponibili', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue({
      result: {
        type: 'not_found',
        data: {
          measurements: {
            shankGroup: 'CA_HP', headDiameterMm: 2.3,
            shapeClass: 'cono_tondo', measurementSource: 'shank_iso', sqlFallbackStep: 6,
          },
        },
      },
      budgetState: { usedToday: 5, dailyLimit: 500, throttleLevel: 'normal' },
      processingMs: 1200,
      imageHash: 'nf001',
    })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Strumento non trovato in catalogo/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/2\.3 mm/i)).toBeInTheDocument()
    expect(screen.getByText(/cono_tondo/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Riprova/i })).toBeInTheDocument()
  })

  it('mostra schermata not_found anche senza misure', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue({
      result: {
        type: 'not_found',
        data: {
          measurements: {
            shankGroup: null, headDiameterMm: null, shapeClass: null, measurementSource: 'none', sqlFallbackStep: 6,
          },
        },
      },
      budgetState: { usedToday: 5, dailyLimit: 500, throttleLevel: 'normal' },
      processingMs: 800,
      imageHash: 'nf002',
    })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Strumento non trovato in catalogo/i)).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: /Riprova/i })).toBeInTheDocument()
  })
})

describe('ToolRecognitionPage — aruco_absent screen', () => {
  beforeEach(() => { arucoResult = { detected: false, pxPerMm: null } })
  afterEach(() => { arucoResult = { detected: true, pxPerMm: 5.0 } })

  it('mostra schermata aruco_absent con le due opzioni quando marker non rilevato', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Carta ARUco non rilevata nella foto/i)).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: /Riprova con la carta/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Procedi senza carta/i })).toBeInTheDocument()
  })

  it('torna a idle_photo1 quando si clicca Riprova con la carta', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Carta ARUco non rilevata nella foto/i)).toBeInTheDocument()
    )
    await userEvent.click(screen.getByRole('button', { name: /Riprova con la carta/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /SCATTA FOTO 1/i })).toBeInTheDocument()
    )
  })

  it('chiama identifyInstrument senza arucoPxPerMm quando si clicca Procedi senza carta', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue(MATCH_RESPONSE)

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Carta ARUco non rilevata nella foto/i)).toBeInTheDocument()
    )
    await userEvent.click(screen.getByRole('button', { name: /Procedi senza carta/i }))

    await waitFor(() =>
      expect(recognitionApi.identifyInstrument).toHaveBeenCalledWith(
        TOKEN,
        expect.any(Array),
        undefined,
      )
    )
  })
})

describe('ToolRecognitionPage — Banner ARUco in idle_photo1', () => {
  it('mostra suggerimento carta ARUco nello stato idle_photo1', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() =>
      expect(screen.getByText(/carta ARUco/i)).toBeInTheDocument()
    )
  })
})
