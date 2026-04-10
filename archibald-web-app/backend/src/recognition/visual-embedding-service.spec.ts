import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createVisualEmbeddingService } from './visual-embedding-service'

const FAKE_EMBEDDING = Array.from({ length: 2048 }, (_, i) => i * 0.001)
const FAKE_API_KEY   = 'jina-test-key'
const FAKE_B64       = Buffer.from('FAKE_IMAGE').toString('base64')

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok:   status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

beforeEach(() => { vi.unstubAllGlobals() })

describe('createVisualEmbeddingService / embedImage', () => {
  test('returns 2048-dimension embedding on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [{ embedding: FAKE_EMBEDDING }] }))
    const svc    = createVisualEmbeddingService(FAKE_API_KEY)
    const result = await svc.embedImage(FAKE_B64, 'retrieval.query')
    expect(result).toHaveLength(2048)
    expect(result[0]).toBe(FAKE_EMBEDDING[0])
  })

  test('sends correct Authorization header', async () => {
    const fetchMock = mockFetch(200, { data: [{ embedding: FAKE_EMBEDDING }] })
    vi.stubGlobal('fetch', fetchMock)
    await createVisualEmbeddingService(FAKE_API_KEY).embedImage(FAKE_B64, 'retrieval.passage')
    const [, init] = fetchMock.mock.calls[0]!
    expect((init as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${FAKE_API_KEY}` })
  })

  test('sends data URI and task in request body', async () => {
    const fetchMock = mockFetch(200, { data: [{ embedding: FAKE_EMBEDDING }] })
    vi.stubGlobal('fetch', fetchMock)
    await createVisualEmbeddingService(FAKE_API_KEY).embedImage(FAKE_B64, 'retrieval.query')
    const [, init] = fetchMock.mock.calls[0]!
    const body     = JSON.parse((init as RequestInit).body as string)
    expect(body.input[0].image).toBe(`data:image/jpeg;base64,${FAKE_B64}`)
    expect(body.task).toBe('retrieval.query')
  })

  test('throws on non-2xx response', async () => {
    vi.stubGlobal('fetch', mockFetch(503, {}))
    await expect(
      createVisualEmbeddingService(FAKE_API_KEY).embedImage(FAKE_B64, 'retrieval.query'),
    ).rejects.toThrow('503')
  })

  test('throws when embedding array is absent', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [] }))
    await expect(
      createVisualEmbeddingService(FAKE_API_KEY).embedImage(FAKE_B64, 'retrieval.query'),
    ).rejects.toThrow()
  })
})
