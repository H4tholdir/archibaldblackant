// archibald-web-app/frontend/src/pages/ToolRecognitionPage.spec.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ToolRecognitionPage } from './ToolRecognitionPage'
import * as recognitionApi from '../api/recognition'

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
