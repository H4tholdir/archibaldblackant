// archibald-web-app/frontend/src/api/recognition.spec.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { identifyInstrument, getRecognitionBudget, submitRecognitionFeedback, getProductEnrichment } from './recognition'
import type { IdentifyResponse, BudgetState, ProductEnrichment } from './recognition'

vi.mock('../utils/fetch-with-retry', () => ({
  fetchWithRetry: vi.fn().mockImplementation((...args: [string, RequestInit?]) => fetch(...args)),
}))

const TOKEN = 'test-jwt-token'
const BASE64 = '/9j/4AAQSkZJRgABAQ=='

describe('identifyInstrument', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('posts image to /api/recognition/identify with Authorization header and correct body', async () => {
    const mockResponse: IdentifyResponse = {
      result: { state: 'not_found' },
      budgetState: { usedToday: 5, dailyLimit: 500, throttleLevel: 'normal' },
      processingMs: 123,
      imageHash: 'abc123hash',
    }
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    const result = await identifyInstrument(TOKEN, BASE64)

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/recognition/identify')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`)
    expect(headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ image: BASE64 }))
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(result).toEqual(mockResponse)
  })

  it('aborts request after 40 seconds', async () => {
    let capturedSignal: AbortSignal | null | undefined
    vi.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      capturedSignal = (init as RequestInit).signal
      return new Promise(() => {})
    })
    identifyInstrument(TOKEN, BASE64)
    vi.advanceTimersByTime(40_001)
    expect(capturedSignal?.aborted).toBe(true)
  })

  it('throws when response is not ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    await expect(identifyInstrument(TOKEN, BASE64)).rejects.toThrow('HTTP 500')
  })
})

describe('getRecognitionBudget', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls GET /api/recognition/budget with auth header and returns budget state', async () => {
    const usedToday = 42
    const dailyLimit = 500
    const mockBudget: BudgetState = { usedToday, dailyLimit, throttleLevel: 'warning' }
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve(mockBudget),
    } as unknown as Response)
    const result = await getRecognitionBudget(TOKEN)
    expect(result).toEqual(mockBudget)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/recognition/budget')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })
})

describe('submitRecognitionFeedback', () => {
  afterEach(() => vi.restoreAllMocks())

  it('posts feedback to /api/recognition/feedback', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ queued: true }),
    } as Response)

    const req = { imageHash: 'abc123', productId: 'H1.314.016', confirmedByUser: true }
    const result = await submitRecognitionFeedback(TOKEN, req)
    expect(result).toEqual({ queued: true })
  })
})

describe('getProductEnrichment', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls GET /api/products/:id/enrichment', async () => {
    const mockEnrichment: ProductEnrichment = {
      features: null, details: null, gallery: [], competitors: [], sizeVariants: [], recognitionHistory: null
    }
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockEnrichment),
    } as Response)

    const result = await getProductEnrichment(TOKEN, 'H1.314.016')
    expect(result).toEqual(mockEnrichment)
  })

  it('encodes special characters in productId', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ features: null, details: null, gallery: [], competitors: [], sizeVariants: [], recognitionHistory: null }),
    } as Response)

    await getProductEnrichment(TOKEN, 'H1/314 016')

    const fetchMock = vi.mocked(global.fetch)
    const [url] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string]
    expect(url).toBe('/api/products/H1%2F314%20016/enrichment')
  })
})
