# Recognition System Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current agentic-loop recognition engine with a two-stage retrieval system (Jina v4 vector embedding → pgvector ANN → Claude reasoning on pre-filtered top-10 candidates) to maximise match rate and cut token usage 10–40×.

**Architecture:** Offline index building embeds campionario strip crops + catalog PDF pages per family into pgvector HNSW. Online query embeds the agent photo, retrieves top-50 image rows, deduplicates to top-10 families, then runs a single Claude call with those 10 reference images. Confidence-based routing decides `match`, `photo2_request`, or `shortlist_visual` without further agentic loops.

**Tech Stack:** Node 20 + TypeScript strict, sharp ^0.34.5 (already installed), Jina Embeddings v4 REST API, pgvector with HNSW index, Anthropic SDK, Vitest.

---

## File Map

**New files:**
- `backend/src/db/migrations/056-visual-embedding-index.sql`
- `backend/src/recognition/campionario-strip-cropper.ts`
- `backend/src/recognition/campionario-strip-cropper.spec.ts`
- `backend/src/recognition/visual-embedding-service.ts`
- `backend/src/recognition/visual-embedding-service.spec.ts`
- `backend/src/db/repositories/catalog-family-images.ts`
- `backend/src/db/repositories/catalog-family-images.spec.ts`
- `backend/src/scripts/build-visual-index.ts`
- `backend/src/operations/handlers/build-visual-index-handler.ts`
- `backend/src/operations/handlers/build-visual-index-handler.spec.ts`

**Modified files:**
- `backend/src/config.ts` — add `jinaApiKey`, `minSimilarity`
- `backend/src/recognition/types.ts` — add `photo2_request` state, rename `shortlist`→`shortlist_visual`, add `CandidateWithImages`, add `photo_request?` to `IdentificationResult`
- `backend/src/recognition/recognition-engine.ts` — ANN query + confidence routing, remove disambiguation loop
- `backend/src/recognition/recognition-engine.spec.ts` — update tests for new flow
- `backend/src/services/anthropic-vision-service.ts` — new prompt, simplified tools, `photo_request` parsing
- `backend/src/operations/handlers/index.ts` — export build-visual-index-handler
- `frontend/src/api/recognition.ts` — update `RecognitionResult` type
- `frontend/src/pages/ToolRecognitionPage.tsx` — new states: `photo2_request`, `analyzing2`, `shortlist_visual`
- `frontend/src/pages/ToolRecognitionPage.spec.tsx` — update tests

---

## Task 0: Manual Prerequisites (Phase 0a + 0b) — no code

**Files:** none

- [ ] **Step 1: Phase 0a — Campionario max-res audit**

  SSH to VPS and check resolution of campionario strips:
  ```bash
  ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
    "python3 -c \"
  from PIL import Image
  import glob, os
  paths = glob.glob('/app/komet-campionari/**/*.jpg', recursive=True)[:5]
  for p in paths:
    im = Image.open(p)
    print(p.replace('/app/komet-campionari/',''), im.size)
  \""
  ```

  For each section check if komet.it has higher-res versions. Compare width: strips should be ≥ 2000px wide. Re-download max-res where local < 2000px wide.

- [ ] **Step 2: Phase 0b — Website discovery**

  For each of komet.it, kometdental.com, kometusa.com, komet.fr:
  - Check product page URL pattern (e.g. `komet.it/en/product/879`)
  - Check if product image is behind JS rendering or static
  - Note image dimensions and whether CDN URL is predictable from product code

  Document findings in `docs/KOMET-WEBSITE-DISCOVERY-2026-04-10.md` before writing the scraper.

  **Decision needed**: which 1–2 sites to scrape in Task 7.

---

## Task 1: Migration 056 — pgvector + catalog_family_images

**Files:**
- Create: `backend/src/db/migrations/056-visual-embedding-index.sql`

- [ ] **Step 1: Write migration**

  ```sql
  -- 056-visual-embedding-index.sql
  -- Enables pgvector and creates the visual embedding index table.

  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE TABLE shared.catalog_family_images (
    id              bigserial PRIMARY KEY,
    family_code     text NOT NULL,
    source_type     text NOT NULL CHECK (source_type IN ('campionario', 'catalog_pdf', 'website')),
    source_url      text,
    local_path      text NOT NULL,
    priority        int  NOT NULL DEFAULT 0,
    metadata        jsonb,
    visual_embedding vector(2048),
    indexed_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (family_code, source_type, local_path)
  );

  -- HNSW index on indexed rows only
  CREATE INDEX catalog_family_images_hnsw_idx
    ON shared.catalog_family_images
    USING hnsw (visual_embedding vector_cosine_ops)
    WHERE visual_embedding IS NOT NULL;

  -- Lookup index for per-family queries
  CREATE INDEX catalog_family_images_family_idx
    ON shared.catalog_family_images (family_code, priority DESC);

  -- Track when each catalog family was last indexed
  ALTER TABLE shared.catalog_entries
    ADD COLUMN IF NOT EXISTS last_indexed_at timestamptz;
  ```

- [ ] **Step 2: Apply migration locally**

  ```bash
  docker compose -f archibald-web-app/docker-compose.yml \
    exec -T postgres psql -U archibald -d archibald \
    -f /dev/stdin < archibald-web-app/backend/src/db/migrations/056-visual-embedding-index.sql
  ```

  Expected: `CREATE EXTENSION`, `CREATE TABLE`, `CREATE INDEX`, `CREATE INDEX`, `ALTER TABLE`

- [ ] **Step 3: Verify table exists**

  ```bash
  docker compose -f archibald-web-app/docker-compose.yml \
    exec -T postgres psql -U archibald -d archibald \
    -c "\d shared.catalog_family_images"
  ```

  Expected: table with columns including `visual_embedding vector(2048)`.

- [ ] **Step 4: Commit**

  ```bash
  git add archibald-web-app/backend/src/db/migrations/056-visual-embedding-index.sql
  git commit -m "feat(recognition): migration 056 — pgvector catalog_family_images"
  ```

---

## Task 2: Config — add Jina API key and min similarity

**Files:**
- Modify: `backend/src/config.ts`

- [ ] **Step 1: Add config fields**

  In `backend/src/config.ts`, update the `recognition` block:

  ```typescript
  recognition: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    jinaApiKey:      process.env.JINA_API_KEY || '',
    minSimilarity:   parseFloat(process.env.RECOGNITION_MIN_SIMILARITY || '0.20'),
    dailyLimit:      parseInt(process.env.RECOGNITION_DAILY_LIMIT || '500', 10),
    timeoutMs:       parseInt(process.env.RECOGNITION_TIMEOUT_MS || '90000', 10),
    catalogPdfPath:  process.env.CATALOG_PDF_PATH || '/app/catalog/komet-catalog-2025.pdf',
  },
  ```

- [ ] **Step 2: Run type check**

  ```bash
  npm run build --prefix archibald-web-app/backend
  ```

  Expected: 0 errors.

- [ ] **Step 3: Commit**

  ```bash
  git add archibald-web-app/backend/src/config.ts
  git commit -m "feat(recognition): add jinaApiKey and minSimilarity to config"
  ```

---

## Task 3: Types update — backend + frontend

**Files:**
- Modify: `backend/src/recognition/types.ts`
- Modify: `frontend/src/api/recognition.ts`

- [ ] **Step 1: Update `backend/src/recognition/types.ts`**

  Replace entire file:

  ```typescript
  type ThrottleLevel = 'normal' | 'warning' | 'limited';

  type ProductMatch = {
    productId:    string
    productName:  string
    familyCode:   string
    headSizeMm:   number
    shankType:    string
    thumbnailUrl: string | null
    confidence:   number
    catalogPage?: number | null
  };

  /** A candidate with reference images passed to the vision service. */
  type CandidateWithImages = {
    familyCode:      string
    description:     string
    referenceImages: string[]  // base64 JPEG buffers
  };

  type IdentificationResult = {
    productCode:   string | null
    familyCode:    string | null
    confidence:    number
    resultState:   'match' | 'shortlist' | 'not_found' | 'error'
    candidates:    string[]
    catalogPage:   number | null
    reasoning:     string
    photo_request: string | null   // Claude's Italian instruction for second photo
    usage:         { inputTokens: number; outputTokens: number }
  };

  type RecognitionResult =
    | { state: 'match';           product: ProductMatch; confidence: number }
    | { state: 'shortlist_visual'; candidates: ProductMatch[] }
    | { state: 'photo2_request';  candidates: string[]; instruction: string }
    | { state: 'not_found' }
    | { state: 'budget_exhausted' }
    | { state: 'error';           message: string };

  type BudgetState = {
    dailyLimit:    number
    usedToday:     number
    throttleLevel: ThrottleLevel
    resetAt:       Date
  };

  export type {
    ThrottleLevel,
    ProductMatch,
    CandidateWithImages,
    IdentificationResult,
    RecognitionResult,
    BudgetState,
  };
  ```

- [ ] **Step 2: Update `frontend/src/api/recognition.ts`**

  Replace the `RecognitionResult` type (lines 17–22) and add `CandidateMatch`:

  ```typescript
  export type CandidateMatch = {
    productId:       string
    productName:     string
    familyCode:      string
    thumbnailUrl:    string | null
    referenceImages: string[]       // base64 JPEGs from catalog_family_images
    confidence:      number
  }

  export type RecognitionResult =
    | { state: 'match';           product: ProductMatch; confidence: number }
    | { state: 'shortlist_visual'; candidates: CandidateMatch[] }
    | { state: 'photo2_request';  candidates: string[]; instruction: string }
    | { state: 'not_found' }
    | { state: 'budget_exhausted' }
    | { state: 'error';           message: string }
  ```

  Also remove the `candidates?` parameter from `identifyInstrument` (no longer used — second photo is detected by `images.length`):

  ```typescript
  export async function identifyInstrument(
    token:  string,
    images: string[],
  ): Promise<IdentifyResponse> {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 90_000)
    try {
      const res = await fetch('/api/recognition/identify', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body:   JSON.stringify({ images }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<IdentifyResponse>
    } finally {
      clearTimeout(timeoutId)
    }
  }
  ```

- [ ] **Step 3: Run type checks**

  ```bash
  npm run build --prefix archibald-web-app/backend
  npm run type-check --prefix archibald-web-app/frontend
  ```

  Expected: 0 errors. Fix any cascade errors (e.g. callers of the old `shortlist` state).

- [ ] **Step 4: Commit**

  ```bash
  git add archibald-web-app/backend/src/recognition/types.ts \
          archibald-web-app/frontend/src/api/recognition.ts
  git commit -m "feat(recognition): update RecognitionResult — photo2_request + shortlist_visual"
  ```

---

## Task 4: Campionario strip cropper

**Files:**
- Create: `backend/src/recognition/campionario-strip-cropper.ts`
- Create: `backend/src/recognition/campionario-strip-cropper.spec.ts`

- [ ] **Step 1: Write failing test**

  Create `backend/src/recognition/campionario-strip-cropper.spec.ts`:

  ```typescript
  import { describe, test, expect, vi, beforeEach } from 'vitest'

  // Must be declared before vi.mock so hoisting captures it
  const mockChain = vi.hoisted(() => {
    const chain: Record<string, unknown> = {
      extract:  undefined,
      jpeg:     undefined,
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('FAKE_JPEG')),
      metadata: vi.fn().mockResolvedValue({ width: 900, height: 200 }),
    }
    chain.extract = vi.fn().mockReturnValue(chain)
    chain.jpeg    = vi.fn().mockReturnValue(chain)
    return chain
  })

  vi.mock('sharp', () => ({ default: vi.fn().mockReturnValue(mockChain) }))
  vi.mock('node:fs/promises', () => ({ readFile: vi.fn().mockResolvedValue(Buffer.from('STRIP')) }))

  import { cropStripForFamilies, cropSingleFamily } from './campionario-strip-cropper'
  import type { StripEntry } from './campionario-strip-map'

  const STRIP_3_FAMILIES: StripEntry = {
    path:     'test-section/test-strip-01.jpg',
    kometUrl: '',
    families: ['860', '863', '879'],
    label:    'test strip',
  }

  describe('cropStripForFamilies', () => {
    test('returns one crop per family', async () => {
      const crops = await cropStripForFamilies(STRIP_3_FAMILIES)
      expect(crops).toHaveLength(3)
    })

    test('family codes match strip families in order', async () => {
      const crops = await cropStripForFamilies(STRIP_3_FAMILIES)
      expect(crops.map(c => c.familyCode)).toEqual(['860', '863', '879'])
    })

    test('crops have correct family index and count metadata', async () => {
      const crops = await cropStripForFamilies(STRIP_3_FAMILIES)
      expect(crops.map(c => [c.familyIndex, c.familyCount])).toEqual([
        [0, 3],
        [1, 3],
        [2, 3],
      ])
    })

    test('extract called with correct left offsets for equal-width slicing', async () => {
      const sharp = await import('sharp')
      vi.clearAllMocks()
      ;(mockChain.metadata as ReturnType<typeof vi.fn>).mockResolvedValue({ width: 900, height: 200 })

      await cropStripForFamilies(STRIP_3_FAMILIES)

      const extractCalls = (mockChain.extract as ReturnType<typeof vi.fn>).mock.calls
      // 3 families, width 900 → cropWidth 300
      expect(extractCalls[0]![0]).toEqual({ left: 0,   top: 0, width: 300, height: 200 })
      expect(extractCalls[1]![0]).toEqual({ left: 300, top: 0, width: 300, height: 200 })
      // Last crop takes remaining pixels: 900 - 600 = 300
      expect(extractCalls[2]![0]).toEqual({ left: 600, top: 0, width: 300, height: 200 })
    })

    test('last crop absorbs rounding remainder', async () => {
      ;(mockChain.metadata as ReturnType<typeof vi.fn>).mockResolvedValue({ width: 901, height: 200 })
      await cropStripForFamilies(STRIP_3_FAMILIES)
      const extractCalls = (mockChain.extract as ReturnType<typeof vi.fn>).mock.calls
      // Math.floor(901/3) = 300; last crop = 901 - 600 = 301
      expect(extractCalls[2]![0]).toMatchObject({ left: 600, width: 301 })
    })
  })

  describe('cropSingleFamily', () => {
    test('re-crops a specific family from a strip by index', async () => {
      ;(mockChain.metadata as ReturnType<typeof vi.fn>).mockResolvedValue({ width: 900, height: 200 })
      await cropSingleFamily('test-section/test-strip-01.jpg', 1, 3)
      const extractCalls = (mockChain.extract as ReturnType<typeof vi.fn>).mock.calls
      expect(extractCalls[0]![0]).toEqual({ left: 300, top: 0, width: 300, height: 200 })
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test --prefix archibald-web-app/backend -- campionario-strip-cropper
  ```

  Expected: FAIL — `campionario-strip-cropper` module not found.

- [ ] **Step 3: Implement the cropper**

  Create `backend/src/recognition/campionario-strip-cropper.ts`:

  ```typescript
  import sharp from 'sharp'
  import { readFile } from 'node:fs/promises'
  import { CAMPIONARIO_BASE_DIR } from './campionario-strip-map'
  import type { StripEntry } from './campionario-strip-map'

  export type StripCrop = {
    familyCode:  string
    imageBuffer: Buffer
    stripPath:   string
    familyIndex: number
    familyCount: number
  }

  /**
   * Slices a campionario strip into per-family JPEG buffers using equal-width vertical crops.
   * Strip has N families → N crops of width floor(W/N), last crop absorbs rounding remainder.
   */
  export async function cropStripForFamilies(entry: StripEntry): Promise<StripCrop[]> {
    const absolutePath = `${CAMPIONARIO_BASE_DIR}/${entry.path}`
    const fileBuffer   = await readFile(absolutePath)
    const { width: imgWidth, height: imgHeight } = await sharp(fileBuffer).metadata()

    if (!imgWidth || !imgHeight) {
      throw new Error(`Cannot read image metadata for ${entry.path}`)
    }

    const n         = entry.families.length
    const cropWidth = Math.floor(imgWidth / n)

    return Promise.all(
      entry.families.map(async (familyCode, i) => {
        const left = i * cropWidth
        const w    = i === n - 1 ? imgWidth - left : cropWidth
        const imageBuffer = await sharp(fileBuffer)
          .extract({ left, top: 0, width: w, height: imgHeight })
          .jpeg({ quality: 90 })
          .toBuffer()
        return { familyCode, imageBuffer, stripPath: entry.path, familyIndex: i, familyCount: n }
      }),
    )
  }

  /**
   * Re-crops a single family from a strip by index. Used at query time to get reference images
   * for Claude without re-embedding.
   */
  export async function cropSingleFamily(
    stripPath:   string,
    familyIndex: number,
    familyCount: number,
  ): Promise<Buffer> {
    const absolutePath = `${CAMPIONARIO_BASE_DIR}/${stripPath}`
    const fileBuffer   = await readFile(absolutePath)
    const { width: imgWidth, height: imgHeight } = await sharp(fileBuffer).metadata()

    if (!imgWidth || !imgHeight) {
      throw new Error(`Cannot read image metadata for ${stripPath}`)
    }

    const cropWidth = Math.floor(imgWidth / familyCount)
    const left      = familyIndex * cropWidth
    const w         = familyIndex === familyCount - 1 ? imgWidth - left : cropWidth

    return sharp(fileBuffer)
      .extract({ left, top: 0, width: w, height: imgHeight })
      .jpeg({ quality: 90 })
      .toBuffer()
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npm test --prefix archibald-web-app/backend -- campionario-strip-cropper
  ```

  Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

  ```bash
  git add archibald-web-app/backend/src/recognition/campionario-strip-cropper.ts \
          archibald-web-app/backend/src/recognition/campionario-strip-cropper.spec.ts
  git commit -m "feat(recognition): campionario strip cropper — equal-width vertical slicing"
  ```

---

## Task 5: Visual embedding service (Jina v4)

**Files:**
- Create: `backend/src/recognition/visual-embedding-service.ts`
- Create: `backend/src/recognition/visual-embedding-service.spec.ts`

- [ ] **Step 1: Write failing tests**

  Create `backend/src/recognition/visual-embedding-service.spec.ts`:

  ```typescript
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

  describe('createVisualEmbeddingService', () => {
    describe('embedImage', () => {
      test('returns 2048-dimension embedding on success', async () => {
        vi.stubGlobal('fetch', mockFetch(200, { data: [{ embedding: FAKE_EMBEDDING }] }))
        const svc = createVisualEmbeddingService(FAKE_API_KEY)
        const result = await svc.embedImage(FAKE_B64, 'retrieval.query')
        expect(result).toHaveLength(2048)
        expect(result[0]).toBe(FAKE_EMBEDDING[0])
      })

      test('sends correct Authorization header', async () => {
        const fetchMock = mockFetch(200, { data: [{ embedding: FAKE_EMBEDDING }] })
        vi.stubGlobal('fetch', fetchMock)
        const svc = createVisualEmbeddingService(FAKE_API_KEY)
        await svc.embedImage(FAKE_B64, 'retrieval.passage')
        const [, init] = fetchMock.mock.calls[0]!
        expect((init as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${FAKE_API_KEY}` })
      })

      test('sends data URI in request body', async () => {
        const fetchMock = mockFetch(200, { data: [{ embedding: FAKE_EMBEDDING }] })
        vi.stubGlobal('fetch', fetchMock)
        const svc = createVisualEmbeddingService(FAKE_API_KEY)
        await svc.embedImage(FAKE_B64, 'retrieval.query')
        const [, init] = fetchMock.mock.calls[0]!
        const body = JSON.parse((init as RequestInit).body as string)
        expect(body.input[0].image).toBe(`data:image/jpeg;base64,${FAKE_B64}`)
        expect(body.task).toBe('retrieval.query')
      })

      test('throws on non-2xx response', async () => {
        vi.stubGlobal('fetch', mockFetch(503, {}))
        const svc = createVisualEmbeddingService(FAKE_API_KEY)
        await expect(svc.embedImage(FAKE_B64, 'retrieval.query')).rejects.toThrow('503')
      })

      test('throws when embedding array is absent', async () => {
        vi.stubGlobal('fetch', mockFetch(200, { data: [] }))
        const svc = createVisualEmbeddingService(FAKE_API_KEY)
        await expect(svc.embedImage(FAKE_B64, 'retrieval.query')).rejects.toThrow()
      })
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test --prefix archibald-web-app/backend -- visual-embedding-service
  ```

  Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

  Create `backend/src/recognition/visual-embedding-service.ts`:

  ```typescript
  const JINA_API_URL = 'https://api.jina.ai/v1/embeddings'
  const JINA_MODEL   = 'jina-embeddings-v4'

  export type EmbeddingTask = 'retrieval.passage' | 'retrieval.query'

  export type VisualEmbeddingService = {
    embedImage(imageBase64: string, task: EmbeddingTask): Promise<number[]>
  }

  export function createVisualEmbeddingService(apiKey: string): VisualEmbeddingService {
    return {
      embedImage: (imageBase64, task) => embedImage(apiKey, imageBase64, task),
    }
  }

  async function embedImage(
    apiKey:      string,
    imageBase64: string,
    task:        EmbeddingTask,
  ): Promise<number[]> {
    const response = await fetch(JINA_API_URL, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: JINA_MODEL,
        task,
        input: [{ image: `data:image/jpeg;base64,${imageBase64}` }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Jina API error: ${response.status}`)
    }

    const data      = await response.json() as { data: Array<{ embedding: number[] }> }
    const embedding = data.data[0]?.embedding
    if (!embedding?.length) throw new Error('Jina API returned empty embedding')
    return embedding
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npm test --prefix archibald-web-app/backend -- visual-embedding-service
  ```

  Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

  ```bash
  git add archibald-web-app/backend/src/recognition/visual-embedding-service.ts \
          archibald-web-app/backend/src/recognition/visual-embedding-service.spec.ts
  git commit -m "feat(recognition): Jina v4 visual embedding service"
  ```

---

## Task 6: Catalog family images repository

**Files:**
- Create: `backend/src/db/repositories/catalog-family-images.ts`
- Create: `backend/src/db/repositories/catalog-family-images.spec.ts`

- [ ] **Step 1: Write failing tests**

  Create `backend/src/db/repositories/catalog-family-images.spec.ts`:

  ```typescript
  import { describe, test, expect, vi } from 'vitest'
  import {
    upsertFamilyImage,
    updateEmbedding,
    queryTopK,
    countIndexed,
  } from './catalog-family-images'

  const FAKE_EMBEDDING = Array.from({ length: 2048 }, () => 0.5)

  function makePool(rows: unknown[] = []) {
    return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as import('../pool').DbPool
  }

  describe('upsertFamilyImage', () => {
    test('returns id from insert result', async () => {
      const pool = makePool([{ id: 42 }])
      const id   = await upsertFamilyImage(pool, {
        family_code: '879',
        source_type: 'campionario',
        source_url:  null,
        local_path:  '/app/komet-campionari/mtb457-particular-06.jpg',
        priority:    3,
        metadata:    { strip_family_index: 2, strip_family_count: 11 },
      })
      expect(id).toBe(42)
    })

    test('inserts metadata as JSON string when provided', async () => {
      const pool = makePool([{ id: 1 }])
      await upsertFamilyImage(pool, {
        family_code: '879',
        source_type: 'campionario',
        source_url:  null,
        local_path:  '/app/komet-campionari/strip.jpg',
        priority:    3,
        metadata:    { strip_family_index: 0, strip_family_count: 5 },
      })
      const [, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(typeof params[5]).toBe('string')
      expect(JSON.parse(params[5])).toMatchObject({ strip_family_index: 0 })
    })
  })

  describe('updateEmbedding', () => {
    test('calls UPDATE with vector literal and id', async () => {
      const pool = makePool()
      await updateEmbedding(pool, 7, FAKE_EMBEDDING)
      const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(sql).toContain('UPDATE shared.catalog_family_images')
      expect(params[0]).toMatch(/^\[[\d.,]+\]$/) // vector literal
      expect(params[1]).toBe(7)
    })
  })

  describe('queryTopK', () => {
    test('returns AnnCandidate rows ordered by similarity', async () => {
      const fakeRows = [
        { id: 1, family_code: '879', similarity: 0.92, local_path: '/p1.jpg', source_type: 'campionario', metadata: null },
        { id: 2, family_code: '863', similarity: 0.88, local_path: '/p2.jpg', source_type: 'campionario', metadata: null },
      ]
      const pool   = makePool(fakeRows)
      const result = await queryTopK(pool, FAKE_EMBEDDING, 50)
      expect(result).toHaveLength(2)
      expect(result[0]!.family_code).toBe('879')
      expect(result[0]!.similarity).toBe(0.92)
    })

    test('passes vector literal as first query parameter', async () => {
      const pool = makePool([])
      await queryTopK(pool, [0.1, 0.2], 10)
      const [, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(params[0]).toBe('[0.1,0.2]')
    })
  })

  describe('countIndexed', () => {
    test('returns integer count of indexed rows', async () => {
      const pool = makePool([{ count: '137' }])
      expect(await countIndexed(pool)).toBe(137)
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test --prefix archibald-web-app/backend -- catalog-family-images
  ```

  Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repository**

  Create `backend/src/db/repositories/catalog-family-images.ts`:

  ```typescript
  import type { DbPool } from '../pool'

  export type FamilyImageInsert = {
    family_code: string
    source_type: 'campionario' | 'catalog_pdf' | 'website'
    source_url:  string | null
    local_path:  string
    priority:    number
    metadata:    Record<string, unknown> | null
  }

  export type AnnCandidate = {
    id:          number
    family_code: string
    similarity:  number
    local_path:  string
    source_type: string
    metadata:    Record<string, unknown> | null
  }

  export async function upsertFamilyImage(
    pool: DbPool,
    row:  FamilyImageInsert,
  ): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO shared.catalog_family_images
         (family_code, source_type, source_url, local_path, priority, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (family_code, source_type, local_path) DO UPDATE
         SET source_url = EXCLUDED.source_url,
             priority   = EXCLUDED.priority,
             metadata   = EXCLUDED.metadata
       RETURNING id`,
      [
        row.family_code,
        row.source_type,
        row.source_url,
        row.local_path,
        row.priority,
        row.metadata ? JSON.stringify(row.metadata) : null,
      ],
    )
    return rows[0]!.id
  }

  export async function updateEmbedding(
    pool:      DbPool,
    id:        number,
    embedding: number[],
  ): Promise<void> {
    const vectorLiteral = `[${embedding.join(',')}]`
    await pool.query(
      `UPDATE shared.catalog_family_images
       SET visual_embedding = $1::vector, indexed_at = now()
       WHERE id = $2`,
      [vectorLiteral, id],
    )
  }

  export async function queryTopK(
    pool:           DbPool,
    queryEmbedding: number[],
    limit:          number = 50,
  ): Promise<AnnCandidate[]> {
    const vectorLiteral = `[${queryEmbedding.join(',')}]`
    const { rows } = await pool.query<AnnCandidate>(
      `SELECT id, family_code,
         1 - (visual_embedding <=> $1::vector) AS similarity,
         local_path, source_type, metadata
       FROM shared.catalog_family_images
       WHERE visual_embedding IS NOT NULL
       ORDER BY visual_embedding <=> $1::vector
       LIMIT $2`,
      [vectorLiteral, limit],
    )
    return rows
  }

  export async function countIndexed(pool: DbPool): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM shared.catalog_family_images
       WHERE visual_embedding IS NOT NULL`,
    )
    return parseInt(rows[0]!.count, 10)
  }

  /** Fallback for Jina-down scenario: returns distinct family codes that have indexed images. */
  export async function getFallbackFamilies(
    pool:  DbPool,
    limit: number,
  ): Promise<string[]> {
    const { rows } = await pool.query<{ family_code: string }>(
      `SELECT DISTINCT family_code
       FROM shared.catalog_family_images
       WHERE visual_embedding IS NOT NULL
       ORDER BY family_code
       LIMIT $1`,
      [limit],
    )
    return rows.map(r => r.family_code)
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npm test --prefix archibald-web-app/backend -- catalog-family-images
  ```

  Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

  ```bash
  git add archibald-web-app/backend/src/db/repositories/catalog-family-images.ts \
          archibald-web-app/backend/src/db/repositories/catalog-family-images.spec.ts
  git commit -m "feat(recognition): catalog_family_images repository — upsert, embed, queryTopK"
  ```

---

## Task 7: Build visual index script (campionario strips)

**Files:**
- Create: `backend/src/scripts/build-visual-index.ts`

This script iterates `CAMPIONARIO_STRIPS`, crops each family, embeds with Jina v4, and upserts into `catalog_family_images`. Run manually on the VPS after the migration is applied.

- [ ] **Step 1: Write the script**

  Create `backend/src/scripts/build-visual-index.ts`:

  ```typescript
  /**
   * build-visual-index.ts
   *
   * Builds the visual embedding index from campionario strips.
   * Run: npx tsx src/scripts/build-visual-index.ts
   *
   * Env required: JINA_API_KEY, PG_HOST, PG_DATABASE, PG_USER, PG_PASSWORD
   */
  import { Pool } from 'pg'
  import { config } from '../config'
  import { CAMPIONARIO_STRIPS } from '../recognition/campionario-strip-map'
  import { cropStripForFamilies } from '../recognition/campionario-strip-cropper'
  import { createVisualEmbeddingService } from '../recognition/visual-embedding-service'
  import { upsertFamilyImage, updateEmbedding } from '../db/repositories/catalog-family-images'
  import { logger } from '../logger'

  const DELAY_MS         = 200   // pause between Jina calls to avoid rate limiting
  const FAMILIES_INDEXED = new Set<string>()

  async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async function main() {
    const pool = new Pool({
      host:     config.database.host,
      port:     config.database.port,
      database: config.database.database,
      user:     config.database.user,
      password: config.database.password,
    })
    const embeddingSvc = createVisualEmbeddingService(config.recognition.jinaApiKey)

    let totalCrops   = 0
    let totalIndexed = 0
    let totalSkipped = 0
    let totalErrors  = 0

    for (const strip of CAMPIONARIO_STRIPS) {
      logger.info(`[build-visual-index] Processing strip: ${strip.path}`)
      let crops: Awaited<ReturnType<typeof cropStripForFamilies>>
      try {
        crops = await cropStripForFamilies(strip)
      } catch (err) {
        logger.error(`[build-visual-index] Failed to crop strip: ${strip.path}`, { err })
        totalErrors++
        continue
      }

      for (const crop of crops) {
        totalCrops++
        if (FAMILIES_INDEXED.has(crop.familyCode)) {
          // Already indexed from a different strip — skip (first strip = highest priority)
          totalSkipped++
          continue
        }

        try {
          const id = await upsertFamilyImage(pool, {
            family_code: crop.familyCode,
            source_type: 'campionario',
            source_url:  null,
            local_path:  crop.stripPath,
            priority:    3,
            metadata: {
              strip_family_index: crop.familyIndex,
              strip_family_count: crop.familyCount,
            },
          })

          await sleep(DELAY_MS)

          const base64    = crop.imageBuffer.toString('base64')
          const embedding = await embeddingSvc.embedImage(base64, 'retrieval.passage')
          await updateEmbedding(pool, id, embedding)

          FAMILIES_INDEXED.add(crop.familyCode)
          totalIndexed++
          logger.info(`[build-visual-index] Indexed family ${crop.familyCode} (id=${id})`)
        } catch (err) {
          logger.error(`[build-visual-index] Failed to index family ${crop.familyCode}`, { err })
          totalErrors++
        }
      }
    }

    logger.info('[build-visual-index] Done', { totalCrops, totalIndexed, totalSkipped, totalErrors })
    await pool.end()
  }

  main().catch(err => {
    logger.error('[build-visual-index] Fatal error', { err })
    process.exit(1)
  })
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npm run build --prefix archibald-web-app/backend
  ```

  Expected: 0 errors.

- [ ] **Step 3: Commit**

  ```bash
  git add archibald-web-app/backend/src/scripts/build-visual-index.ts
  git commit -m "feat(recognition): build-visual-index script — campionario crop + Jina embed"
  ```

---

## Task 8: Build visual index operation handler

This wraps the index-building logic in a BullMQ-compatible operation handler so it can be triggered from the admin UI.

**Files:**
- Create: `backend/src/operations/handlers/build-visual-index-handler.ts`
- Create: `backend/src/operations/handlers/build-visual-index-handler.spec.ts`
- Modify: `backend/src/operations/handlers/index.ts`

- [ ] **Step 1: Write failing test**

  Create `backend/src/operations/handlers/build-visual-index-handler.spec.ts`:

  ```typescript
  import { describe, test, expect, vi } from 'vitest'
  import { createBuildVisualIndexHandler } from './build-visual-index-handler'

  vi.mock('../../recognition/campionario-strip-map', () => ({
    CAMPIONARIO_STRIPS: [
      { path: 'section/strip-01.jpg', kometUrl: '', families: ['860', '879'], label: 'test' },
    ],
  }))

  vi.mock('../../recognition/campionario-strip-cropper', () => ({
    cropStripForFamilies: vi.fn().mockResolvedValue([
      { familyCode: '860', imageBuffer: Buffer.from('IMG1'), stripPath: 'section/strip-01.jpg', familyIndex: 0, familyCount: 2 },
      { familyCode: '879', imageBuffer: Buffer.from('IMG2'), stripPath: 'section/strip-01.jpg', familyIndex: 1, familyCount: 2 },
    ]),
  }))

  vi.mock('../../db/repositories/catalog-family-images', () => ({
    upsertFamilyImage: vi.fn().mockResolvedValue(1),
    updateEmbedding:   vi.fn().mockResolvedValue(undefined),
    countIndexed:      vi.fn().mockResolvedValue(2),
  }))

  describe('createBuildVisualIndexHandler', () => {
    test('calls upsertFamilyImage and updateEmbedding for each crop', async () => {
      const { upsertFamilyImage, updateEmbedding } = await import('../../db/repositories/catalog-family-images')
      const mockPool = {} as import('../../db/pool').DbPool
      const mockEmbeddingSvc = { embedImage: vi.fn().mockResolvedValue(Array(2048).fill(0.1)) }

      const handler = createBuildVisualIndexHandler({ pool: mockPool, embeddingSvc: mockEmbeddingSvc })
      await handler({} as import('bullmq').Job)

      expect(upsertFamilyImage).toHaveBeenCalledTimes(2)
      expect(updateEmbedding).toHaveBeenCalledTimes(2)
      expect(mockEmbeddingSvc.embedImage).toHaveBeenCalledTimes(2)
    })

    test('returns indexed count on completion', async () => {
      const mockPool = {} as import('../../db/pool').DbPool
      const mockEmbeddingSvc = { embedImage: vi.fn().mockResolvedValue(Array(2048).fill(0.1)) }
      const handler = createBuildVisualIndexHandler({ pool: mockPool, embeddingSvc: mockEmbeddingSvc })
      const result  = await handler({} as import('bullmq').Job)
      expect(result).toMatchObject({ indexed: expect.any(Number) })
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test --prefix archibald-web-app/backend -- build-visual-index-handler
  ```

  Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

  Create `backend/src/operations/handlers/build-visual-index-handler.ts`:

  ```typescript
  import type { Job } from 'bullmq'
  import type { DbPool } from '../../db/pool'
  import type { VisualEmbeddingService } from '../../recognition/visual-embedding-service'
  import { CAMPIONARIO_STRIPS } from '../../recognition/campionario-strip-map'
  import { cropStripForFamilies } from '../../recognition/campionario-strip-cropper'
  import { upsertFamilyImage, updateEmbedding, countIndexed } from '../../db/repositories/catalog-family-images'
  import { logger } from '../../logger'

  type Deps = {
    pool:         DbPool
    embeddingSvc: VisualEmbeddingService
  }

  const DELAY_MS = 200

  async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  export function createBuildVisualIndexHandler(deps: Deps) {
    return async function buildVisualIndexHandler(_job: Job): Promise<{ indexed: number }> {
      const { pool, embeddingSvc } = deps
      const seenFamilies = new Set<string>()
      let indexed = 0

      for (const strip of CAMPIONARIO_STRIPS) {
        let crops: Awaited<ReturnType<typeof cropStripForFamilies>>
        try {
          crops = await cropStripForFamilies(strip)
        } catch (err) {
          logger.warn('[build-visual-index] Skipping strip — crop failed', { path: strip.path, err })
          continue
        }

        for (const crop of crops) {
          if (seenFamilies.has(crop.familyCode)) continue

          try {
            const id = await upsertFamilyImage(pool, {
              family_code: crop.familyCode,
              source_type: 'campionario',
              source_url:  null,
              local_path:  crop.stripPath,
              priority:    3,
              metadata: {
                strip_family_index: crop.familyIndex,
                strip_family_count: crop.familyCount,
              },
            })

            await sleep(DELAY_MS)

            const base64    = crop.imageBuffer.toString('base64')
            const embedding = await embeddingSvc.embedImage(base64, 'retrieval.passage')
            await updateEmbedding(pool, id, embedding)

            seenFamilies.add(crop.familyCode)
            indexed++
          } catch (err) {
            logger.warn('[build-visual-index] Failed to index family', { familyCode: crop.familyCode, err })
          }
        }
      }

      const total = await countIndexed(pool)
      logger.info('[build-visual-index] Complete', { newlyIndexed: indexed, totalIndexed: total })
      return { indexed: total }
    }
  }
  ```

- [ ] **Step 4: Export from index**

  Add to `backend/src/operations/handlers/index.ts`:

  ```typescript
  export { createBuildVisualIndexHandler } from './build-visual-index-handler';
  ```

- [ ] **Step 5: Run tests to verify they pass**

  ```bash
  npm test --prefix archibald-web-app/backend -- build-visual-index-handler
  ```

  Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

  ```bash
  git add archibald-web-app/backend/src/operations/handlers/build-visual-index-handler.ts \
          archibald-web-app/backend/src/operations/handlers/build-visual-index-handler.spec.ts \
          archibald-web-app/backend/src/operations/handlers/index.ts
  git commit -m "feat(recognition): build-visual-index operation handler"
  ```

---

## Task 9: Recognition engine refactor

The engine gains ANN retrieval and confidence-based routing. The `disambiguationCandidates` param is removed — second-photo detection is now `images.length === 2`.

**Files:**
- Modify: `backend/src/recognition/recognition-engine.ts`
- Modify: `backend/src/recognition/recognition-engine.spec.ts`

- [ ] **Step 1: Write new failing tests**

  Replace `backend/src/recognition/recognition-engine.spec.ts`:

  ```typescript
  import { describe, expect, test, vi, beforeEach } from 'vitest'
  import { runRecognitionPipeline } from './recognition-engine'
  import type { CatalogVisionService } from './recognition-engine'
  import type { IdentificationResult } from './types'

  vi.mock('../db/repositories/recognition-log', () => ({
    appendRecognitionLog: vi.fn().mockResolvedValue(undefined),
  }))

  vi.mock('../db/repositories/catalog-family-images', () => ({
    queryTopK:           vi.fn().mockResolvedValue([]),
    getFallbackFamilies: vi.fn().mockResolvedValue([]),
  }))

  const BASE64   = 'AAAA'
  const USER_ID  = 'user-test'
  const FAKE_EMB = Array(2048).fill(0.5)

  function makePool(overrides: {
    budgetAllowed?: boolean
    cacheHit?:      boolean
    familyExists?:  boolean
  } = {}) {
    const { budgetAllowed = true, cacheHit = false, familyExists = true } = overrides
    return {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: cacheHit ? [{ result_json: { state: 'not_found' } }] : [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: budgetAllowed
            ? [{ id: 1, used_today: 0, daily_limit: 500, throttle_level: 'normal', reset_at: new Date() }]
            : [{ id: 1, used_today: 500, daily_limit: 500, throttle_level: 'limited', reset_at: new Date() }],
        })
        .mockResolvedValueOnce({ rows: familyExists ? [{ exists: 1 }] : [] })
        .mockResolvedValue({ rows: [{ id: 1 }] }),
    } as unknown as import('../db/pool').DbPool
  }

  function makeEmbeddingSvc(embedding = FAKE_EMB) {
    return { embedImage: vi.fn().mockResolvedValue(embedding) }
  }

  function makeVision(result: Partial<IdentificationResult> = {}): CatalogVisionService {
    return {
      identifyFromImage: vi.fn().mockResolvedValue({
        productCode:   '879.104.014',
        familyCode:    '879',
        confidence:    0.92,
        resultState:   'match',
        candidates:    [],
        catalogPage:   120,
        reasoning:     'Torpedo shape matched',
        photo_request: null,
        usage:         { inputTokens: 3000, outputTokens: 400 },
        ...result,
      } satisfies IdentificationResult),
    }
  }

  describe('runRecognitionPipeline', () => {
    test('ritorna budget_exhausted quando budget esaurito', async () => {
      const pool = makePool({ budgetAllowed: false })
      const { result } = await runRecognitionPipeline(
        { pool, catalogVisionService: makeVision(), embeddingSvc: makeEmbeddingSvc() },
        [BASE64], USER_ID, 'agent',
      )
      expect(result.state).toBe('budget_exhausted')
    })

    test('ritorna match quando confidence ≥ 0.85', async () => {
      const pool = makePool()
      const { result } = await runRecognitionPipeline(
        { pool, catalogVisionService: makeVision({ confidence: 0.92 }), embeddingSvc: makeEmbeddingSvc() },
        [BASE64], USER_ID, 'agent',
      )
      expect(result.state).toBe('match')
      if (result.state === 'match') expect(result.product.familyCode).toBe('879')
    })

    test('ritorna photo2_request quando confidence < 0.85 e prima foto', async () => {
      const pool   = makePool()
      const vision = makeVision({
        confidence:    0.70,
        resultState:   'shortlist',
        candidates:    ['879.104.014', '863.104.014'],
        photo_request: 'Fotografa la punta dall'alto',
      })
      const { result } = await runRecognitionPipeline(
        { pool, catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc() },
        [BASE64], USER_ID, 'agent',
      )
      expect(result.state).toBe('photo2_request')
      if (result.state === 'photo2_request') {
        expect(result.instruction).toBe('Fotografa la punta dall'alto')
        expect(result.candidates).toContain('879.104.014')
      }
    })

    test('usa fallback generico per instruction quando photo_request è null', async () => {
      const pool   = makePool()
      const vision = makeVision({
        confidence:    0.60,
        resultState:   'shortlist',
        candidates:    ['879.104.014', '863.104.014'],
        photo_request: null,
      })
      const { result } = await runRecognitionPipeline(
        { pool, catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc() },
        [BASE64], USER_ID, 'agent',
      )
      expect(result.state).toBe('photo2_request')
      if (result.state === 'photo2_request') {
        expect(result.instruction).toBeTruthy()
        expect(typeof result.instruction).toBe('string')
      }
    })

    test('ritorna shortlist_visual quando confidence < 0.85 e seconda foto (images.length===2)', async () => {
      const pool   = makePool()
      const vision = makeVision({
        confidence:  0.65,
        resultState: 'shortlist',
        candidates:  ['879.104.014', '863.104.014'],
      })
      const { result } = await runRecognitionPipeline(
        { pool, catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc() },
        [BASE64, BASE64], USER_ID, 'agent',
      )
      expect(result.state).toBe('shortlist_visual')
    })

    test('downgrade a not_found quando il family code non esiste nel catalogo', async () => {
      const pool   = makePool({ familyExists: false })
      const vision = makeVision({ confidence: 0.90, familyCode: '8863', productCode: '8863.104.016' })
      const { result } = await runRecognitionPipeline(
        { pool, catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc() },
        [BASE64], USER_ID, 'agent',
      )
      expect(result.state).toBe('not_found')
    })

    test('non chiama vision API quando cache hit', async () => {
      const pool   = makePool({ cacheHit: true })
      const vision = makeVision()
      await runRecognitionPipeline(
        { pool, catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc() },
        [BASE64], USER_ID, 'agent',
      )
      expect(vision.identifyFromImage).not.toHaveBeenCalled()
    })

    test('non chiama vision API quando budget esaurito', async () => {
      const pool   = makePool({ budgetAllowed: false })
      const vision = makeVision()
      await runRecognitionPipeline(
        { pool, catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc() },
        [BASE64], USER_ID, 'agent',
      )
      expect(vision.identifyFromImage).not.toHaveBeenCalled()
    })

    test('ritorna error quando vision API lancia eccezione', async () => {
      const pool   = makePool()
      const vision: CatalogVisionService = {
        identifyFromImage: vi.fn().mockRejectedValue(new Error('Anthropic timeout')),
      }
      const { result } = await runRecognitionPipeline(
        { pool, catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc() },
        [BASE64], USER_ID, 'agent',
      )
      expect(result.state).toBe('error')
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  npm test --prefix archibald-web-app/backend -- recognition-engine
  ```

  Expected: FAIL — old signatures, missing photo2_request routing.

- [ ] **Step 3: Rewrite `recognition-engine.ts`**

  Replace `backend/src/recognition/recognition-engine.ts`:

  ```typescript
  import { createHash } from 'crypto'
  import type { DbPool } from '../db/pool'
  import type { RecognitionResult, BudgetState, CandidateWithImages } from './types'
  import type { VisualEmbeddingService } from './visual-embedding-service'
  import { checkBudget, consumeBudget } from './budget-service'
  import { getCached, setCached } from '../db/repositories/recognition-cache'
  import { appendRecognitionLog } from '../db/repositories/recognition-log'
  import { queryTopK, getFallbackFamilies } from '../db/repositories/catalog-family-images'
  import { cropSingleFamily } from './campionario-strip-cropper'
  import { readFile } from 'node:fs/promises'
  import { logger } from '../logger'

  export type CatalogVisionService = {
    identifyFromImage(
      photos:     string[],
      candidates: CandidateWithImages[],
      signal?:    AbortSignal,
    ): Promise<import('./types').IdentificationResult>
  }

  type EngineResult = {
    result:       RecognitionResult
    budgetState:  BudgetState
    processingMs: number
    imageHash:    string
  }

  type EngineDeps = {
    pool:                 DbPool
    catalogVisionService: CatalogVisionService
    embeddingSvc:         VisualEmbeddingService
  }

  const FALLBACK_INSTRUCTION = "Scatta un'altra angolazione dello strumento, preferibilmente dall'alto o di profilo"

  export async function runRecognitionPipeline(
    deps:   EngineDeps,
    images: string[],
    userId: string,
    role:   string,
    signal?: AbortSignal,
  ): Promise<EngineResult> {
    const startMs     = Date.now()
    const isSecondPhoto = images.length === 2

    const imageHash = createHash('sha256')
      .update(Buffer.concat(images.map(img => Buffer.from(img, 'base64'))))
      .digest('hex')

    const cached = await getCached(deps.pool, imageHash)
    if (cached) {
      const { budgetState } = await checkBudget(deps.pool, userId, role)
      return { result: cached.result_json as RecognitionResult, budgetState, processingMs: Date.now() - startMs, imageHash }
    }

    const { allowed, budgetState } = await checkBudget(deps.pool, userId, role)
    if (!allowed) {
      return { result: { state: 'budget_exhausted' }, budgetState, processingMs: Date.now() - startMs, imageHash }
    }

    // Stage 1: ANN retrieval
    const top10 = await retrieveTop10Candidates(deps, images[0]!)

    let identification: import('./types').IdentificationResult
    try {
      identification = await deps.catalogVisionService.identifyFromImage(images, top10, signal)
    } catch (err) {
      logger.warn('[recognition-engine] Vision API error', { error: err instanceof Error ? err.message : String(err) })
      return { result: { state: 'error', message: 'Servizio di riconoscimento temporaneamente non disponibile' }, budgetState, processingMs: Date.now() - startMs, imageHash }
    }

    // Stage 2: confidence-based routing
    let result: RecognitionResult

    if (identification.resultState === 'match' && identification.confidence >= 0.85) {
      const familyCode = identification.familyCode ?? ''
      const valid      = familyCode.length > 0 && await validateFamilyExists(deps.pool, familyCode)
      if (!valid) {
        logger.warn('[recognition-engine] Family code not in catalog — downgrading to not_found', { familyCode })
        result = { state: 'not_found' }
      } else {
        result = {
          state:      'match',
          product: {
            productId:    identification.productCode ?? '',
            productName:  identification.productCode ?? '',
            familyCode,
            headSizeMm:   0,
            shankType:    '',
            thumbnailUrl: null,
            confidence:   identification.confidence,
          },
          confidence: identification.confidence,
        }
      }
    } else if (!isSecondPhoto) {
      result = {
        state:       'photo2_request',
        candidates:  identification.candidates,
        instruction: identification.photo_request ?? FALLBACK_INSTRUCTION,
      }
    } else {
      result = {
        state:      'shortlist_visual',
        candidates: identification.candidates.map(c => ({
          productId:    c,
          productName:  c,
          familyCode:   c.split('.')[0] ?? '',
          headSizeMm:   0,
          shankType:    '',
          thumbnailUrl: null,
          confidence:   0,
        })),
      }
    }

    await setCached(deps.pool, imageHash, result, Buffer.from(images[0]!, 'base64'))
    await consumeBudget(deps.pool)
    await appendRecognitionLog(deps.pool, {
      user_id:      userId,
      image_hash:   imageHash,
      cache_hit:    false,
      product_id:   result.state === 'match' ? result.product.productId : null,
      confidence:   result.state === 'match' ? result.confidence : null,
      result_state: result.state,
      tokens_used:  identification.usage.inputTokens + identification.usage.outputTokens,
      api_cost_usd: null,
    }).catch(() => {})

    return { result, budgetState, processingMs: Date.now() - startMs, imageHash }
  }

  /** ANN retrieval: embed query photo → top-50 rows → dedup to top-10 families. */
  async function retrieveTop10Candidates(
    deps:       EngineDeps,
    firstPhoto: string,
  ): Promise<CandidateWithImages[]> {
    let top50rows: Awaited<ReturnType<typeof queryTopK>>

    try {
      const queryEmbedding = await deps.embeddingSvc.embedImage(firstPhoto, 'retrieval.query')
      top50rows = await queryTopK(deps.pool, queryEmbedding, 50)
    } catch (err) {
      logger.warn('[recognition-engine] ANN query failed — using fallback families', { err })
      const familyCodes = await getFallbackFamilies(deps.pool, 10)
      return familyCodes.map(fc => ({ familyCode: fc, description: fc, referenceImages: [] }))
    }

    // Dedup: best similarity per family → top-10 families
    const bestByFamily = new Map<string, (typeof top50rows)[0]>()
    for (const row of top50rows) {
      const existing = bestByFamily.get(row.family_code)
      if (!existing || row.similarity > existing.similarity) {
        bestByFamily.set(row.family_code, row)
      }
    }

    const top10 = [...bestByFamily.entries()]
      .sort((a, b) => b[1].similarity - a[1].similarity)
      .slice(0, 10)

    return Promise.all(
      top10.map(async ([familyCode, row]) => {
        const referenceImages: string[] = []
        try {
          let imgBuffer: Buffer
          if (row.source_type === 'campionario' && row.metadata) {
            const meta = row.metadata as { strip_family_index: number; strip_family_count: number }
            imgBuffer = await cropSingleFamily(row.local_path, meta.strip_family_index, meta.strip_family_count)
          } else {
            imgBuffer = await readFile(row.local_path)
          }
          referenceImages.push(imgBuffer.toString('base64'))
        } catch {
          // Missing file — pass candidate without image
        }
        return { familyCode, description: familyCode, referenceImages }
      }),
    )
  }

  async function validateFamilyExists(pool: DbPool, familyCode: string): Promise<boolean> {
    try {
      const { rows } = await pool.query<{ exists: number }>(
        `SELECT 1 AS exists FROM shared.catalog_entries WHERE $1::text = ANY(family_codes) LIMIT 1`,
        [familyCode],
      )
      return rows.length > 0
    } catch {
      return true
    }
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npm test --prefix archibald-web-app/backend -- recognition-engine
  ```

  Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

  ```bash
  git add archibald-web-app/backend/src/recognition/recognition-engine.ts \
          archibald-web-app/backend/src/recognition/recognition-engine.spec.ts
  git commit -m "feat(recognition): engine refactor — ANN retrieval + confidence routing"
  ```

---

## Task 10: Vision service redesign

Replace the 250-line agentic loop with a single-turn Claude call: pre-filtered candidates + reference images arrive in the initial message, Claude calls `submit_identification` once with optional `photo_request`.

**Files:**
- Modify: `backend/src/services/anthropic-vision-service.ts`

- [ ] **Step 1: Read the current file to understand all helpers**

  Read `backend/src/services/anthropic-vision-service.ts` fully (lines 1–end) to inventory what to keep (Anthropic client setup, submit parsing) and what to discard (search_catalog, get_catalog_page, RULE A, RULE B, loop logic).

- [ ] **Step 2: Write the new vision service**

  Replace `backend/src/services/anthropic-vision-service.ts` entirely:

  ```typescript
  import Anthropic from '@anthropic-ai/sdk'
  import type { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages.js'
  import type { CatalogVisionService } from '../recognition/recognition-engine'
  import type { IdentificationResult, CandidateWithImages } from '../recognition/types'
  import { logger } from '../logger'

  export type CatalogVisionServiceDeps = {
    apiKey:    string
    timeoutMs: number
  }

  const SYSTEM_PROMPT = `You are identifying a Komet dental instrument from a photo taken by a dental sales agent.

The vector search system has pre-selected the top-10 most visually similar families from our catalog.
Each candidate includes a family code and one or more reference images.

STEP 1 — Eliminate candidates whose overall shape is clearly different from the query photo.
STEP 2 — Among remaining candidates, identify the closest match by comparing:
  • Shape, proportions, and body profile
  • Tip geometry and apex
  • Shank characteristics (length, presence of collar/notch)
  Trust visual comparison over text classification.
STEP 3 — Submit with honest confidence using submit_identification.

Confidence guide:
  ≥ 0.85 : shape clearly matches one candidate → product_code = "FAMILY.SHANK.SIZE", empty candidates[]
  0.65–0.84 : probable match, some uncertainty → product_code = "", list 2–3 in candidates[]
  < 0.65 : genuinely uncertain → product_code = "", list 2–3 in candidates[]

Rules:
  • You must NOT force a definitive match when uncertain.
  • You must NOT add candidates not present in the provided list.
  • When uncertain after one photo, include photo_request with a specific Italian instruction
    for the best additional photo that would resolve your uncertainty.`

  const SUBMIT_IDENTIFICATION_TOOL: Anthropic.Tool = {
    name:        'submit_identification',
    description: 'Submit your identification result. Call exactly once after completing visual comparison.',
    input_schema: {
      type:     'object' as const,
      required: ['product_code', 'confidence', 'reasoning'],
      properties: {
        product_code: {
          type:        'string',
          description: 'Product code in FAMILY.SHANK.SIZE format (e.g. "879.104.014"), or empty string if uncertain',
        },
        candidates: {
          type:        'array',
          items:       { type: 'string' },
          description: '2–3 candidate product codes when uncertain (family code prefix + best guess shank/size)',
        },
        confidence: {
          type:        'number',
          description: 'Confidence score 0.0–1.0',
        },
        reasoning: {
          type:        'string',
          description: 'Brief reasoning in English',
        },
        photo_request: {
          type:        'string',
          description: 'Optional: write in Italian the specific photo that would resolve uncertainty (e.g. "Fotografa la testa dall\'alto"). Omit if confident.',
        },
      },
    },
  }

  export function createCatalogVisionService(deps: CatalogVisionServiceDeps): CatalogVisionService {
    const client = new Anthropic({ apiKey: deps.apiKey })
    return {
      identifyFromImage: (photos, candidates, signal) =>
        identifyFromImage(client, deps.timeoutMs, photos, candidates, signal),
    }
  }

  async function identifyFromImage(
    client:     Anthropic,
    timeoutMs:  number,
    photos:     string[],
    candidates: CandidateWithImages[],
    signal?:    AbortSignal,
  ): Promise<IdentificationResult> {
    const userContent: Anthropic.MessageParam['content'] = buildUserMessage(photos, candidates)

    const messages: MessageParam[] = [{ role: 'user', content: userContent }]

    let inputTokensTotal  = 0
    let outputTokensTotal = 0

    for (let iter = 0; iter < 2; iter++) {
      const response = await client.messages.create(
        {
          model:      'claude-sonnet-4-5',
          max_tokens: 1024,
          system:     SYSTEM_PROMPT,
          tools:      [SUBMIT_IDENTIFICATION_TOOL],
          messages,
        },
        { signal },
      )

      inputTokensTotal  += response.usage.input_tokens
      outputTokensTotal += response.usage.output_tokens

      const toolUse = response.content.find(b => b.type === 'tool_use')
      if (toolUse && toolUse.type === 'tool_use') {
        return parseSubmitResult(toolUse.input, { inputTokens: inputTokensTotal, outputTokens: outputTokensTotal })
      }

      if (response.stop_reason === 'end_turn') break

      // Tool call expected but not found — push assistant message and continue
      messages.push({ role: 'assistant', content: response.content })
      messages.push({
        role:    'user',
        content: 'Please call submit_identification now with your best assessment.',
      })
    }

    logger.warn('[vision-service] No submit_identification tool call received')
    return {
      productCode:   null,
      familyCode:    null,
      confidence:    0,
      resultState:   'not_found',
      candidates:    [],
      catalogPage:   null,
      reasoning:     'No tool call received',
      photo_request: null,
      usage:         { inputTokens: inputTokensTotal, outputTokens: outputTokensTotal },
    }
  }

  function buildUserMessage(
    photos:     string[],
    candidates: CandidateWithImages[],
  ): Anthropic.MessageParam['content'] {
    const content: Anthropic.MessageParam['content'] = []

    // Agent photos
    for (const [i, photo] of photos.entries()) {
      content.push({ type: 'text', text: i === 0 ? 'Query photo (primary):' : 'Query photo (secondary angulation):' })
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photo } })
    }

    // Candidate reference images
    content.push({ type: 'text', text: `\nTop-${candidates.length} candidate families from visual similarity search:\n` })

    for (const candidate of candidates) {
      content.push({ type: 'text', text: `\nCandidate: ${candidate.familyCode} — ${candidate.description}` })
      for (const img of candidate.referenceImages) {
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } })
      }
    }

    content.push({ type: 'text', text: '\nCall submit_identification with your result.' })
    return content
  }

  function parseSubmitResult(
    input: unknown,
    usage: { inputTokens: number; outputTokens: number },
  ): IdentificationResult {
    const raw = input as {
      product_code:  string
      candidates?:   string[]
      confidence:    number
      reasoning:     string
      photo_request?: string
    }

    const productCode = raw.product_code?.trim() || null
    const familyCode  = productCode ? productCode.split('.')[0] ?? null : null
    const candidates  = raw.candidates ?? []
    const hasMatch    = !!productCode && raw.confidence >= 0.85

    return {
      productCode,
      familyCode,
      confidence:    raw.confidence,
      resultState:   hasMatch ? 'match' : (candidates.length > 0 ? 'shortlist' : 'not_found'),
      candidates,
      catalogPage:   null,
      reasoning:     raw.reasoning,
      photo_request: raw.photo_request ?? null,
      usage,
    }
  }
  ```

- [ ] **Step 3: Fix any import errors in callers**

  The `createCatalogVisionService` might be called from `main.ts` or a route. Find callers:

  ```bash
  grep -r "createCatalogVisionService\|CatalogVisionServiceDeps\|anthropic-vision-service" \
    archibald-web-app/backend/src --include="*.ts" -l
  ```

  Update each caller to pass the new `deps` shape: remove `pool` and `catalogPdf` deps (no longer needed). The new `deps` only needs `apiKey` and `timeoutMs`.

- [ ] **Step 4: Run type check + tests**

  ```bash
  npm run build --prefix archibald-web-app/backend
  npm test --prefix archibald-web-app/backend -- recognition
  ```

  Expected: 0 build errors, all recognition tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add archibald-web-app/backend/src/services/anthropic-vision-service.ts
  git commit -m "feat(recognition): vision service redesign — single-turn, photo_request, no RULE A/B"
  ```

---

## Task 11: Frontend UX — new recognition states

Replace `disambiguation_camera`/`disambiguation_analyzing`/`shortlist` with `photo2_request`/`analyzing2`/`shortlist_visual`.

**Files:**
- Modify: `frontend/src/pages/ToolRecognitionPage.tsx`
- Modify: `frontend/src/pages/ToolRecognitionPage.spec.tsx`

- [ ] **Step 1: Write failing tests for new states**

  Read `frontend/src/pages/ToolRecognitionPage.spec.tsx` fully, then add/update tests for:

  ```typescript
  // New tests to add after reading existing spec file:

  describe('photo2_request state', () => {
    test('shows Claude instruction text when result is photo2_request', async () => {
      // Mock identifyInstrument to return photo2_request
      vi.mocked(identifyInstrument).mockResolvedValueOnce({
        result: {
          state: 'photo2_request',
          candidates: ['879.104.014', '863.104.014'],
          instruction: 'Fotografa la punta dall\'alto per vedere se è piatta o arrotondata',
        },
        budgetState:  { usedToday: 1, dailyLimit: 500, throttleLevel: 'normal' },
        processingMs: 3000,
        imageHash:    'abc',
      })

      // Capture photo 1, proceed to identification
      await mockCapture()
      await userEvent.click(screen.getByText(/procedi con 1 foto/i))
      await userEvent.click(screen.getByText(/identifica/i))

      await waitFor(() => {
        expect(screen.getByText(/ho bisogno di un'altra foto/i)).toBeInTheDocument()
        expect(screen.getByText(/fotografa la punta dall'alto/i)).toBeInTheDocument()
        expect(screen.getByText(/scatta ora/i)).toBeInTheDocument()
      })
    })
  })

  describe('shortlist_visual state', () => {
    test('shows candidates list when result is shortlist_visual', async () => {
      vi.mocked(identifyInstrument).mockResolvedValueOnce({
        result: {
          state: 'shortlist_visual',
          candidates: [
            { productId: '879.104.014', productName: '879', familyCode: '879', thumbnailUrl: null, referenceImages: [], confidence: 0.7 },
            { productId: '863.104.014', productName: '863', familyCode: '863', thumbnailUrl: null, referenceImages: [], confidence: 0.6 },
          ],
        },
        budgetState:  { usedToday: 1, dailyLimit: 500, throttleLevel: 'normal' },
        processingMs: 5000,
        imageHash:    'xyz',
      })

      await mockCapture()
      await userEvent.click(screen.getByText(/procedi con 1 foto/i))
      await userEvent.click(screen.getByText(/identifica/i))

      await waitFor(() => {
        expect(screen.getByText('879')).toBeInTheDocument()
        expect(screen.getByText('863')).toBeInTheDocument()
      })
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  npm test --prefix archibald-web-app/frontend -- ToolRecognitionPage
  ```

  Expected: FAIL — states not implemented.

- [ ] **Step 3: Update `PageState` type in ToolRecognitionPage.tsx**

  Replace the `PageState` type:

  ```typescript
  type PageState =
    | 'loading'
    | 'permission_denied'
    | 'idle_photo1'
    | 'idle_photo2'
    | 'preview'
    | 'analyzing'
    | 'analyzing2'
    | 'match'
    | 'shortlist_visual'
    | 'photo2_request'
    | 'budget_exhausted'
  ```

- [ ] **Step 4: Update `runIdentification` callback**

  Replace the existing `runIdentification` with:

  ```typescript
  const runIdentification = useCallback(async (images: string[]) => {
    const token = localStorage.getItem('archibald_jwt')
    if (!token) return
    setPageState(images.length === 2 ? 'analyzing2' : 'analyzing')
    setAnalyzeStep(0)
    setUsedPhotoCount(images.length)

    try {
      setAnalyzeStep(1)
      const response = await identifyInstrument(token, images)
      setAnalyzeStep(2)
      setIdentifyResult(response)

      const { state } = response.result
      if (state === 'budget_exhausted') {
        setPageState('budget_exhausted')
      } else if (state === 'match') {
        setAnalyzeStep(3)
        vibrate([200, 50, 100])
        playSuccessBeep()
        setPageState('match')
      } else if (state === 'photo2_request') {
        vibrate([80, 30, 80])
        setPageState('photo2_request')
      } else if (state === 'shortlist_visual') {
        vibrate([80, 30, 80])
        setPageState('shortlist_visual')
      } else {
        setPageState('idle_photo1')
        if (state === 'not_found') {
          setErrorMessage('Strumento non riconosciuto. Centra bene la fresa nella guida e riprova.')
        } else if (state === 'error') {
          setErrorMessage('Errore di analisi. Riprova.')
        }
      }
    } catch {
      setPageState('idle_photo1')
      setErrorMessage('Errore di connessione. Riprova.')
    }
  }, [vibrate, playSuccessBeep])
  ```

- [ ] **Step 5: Add `handlePhoto2Shutter` callback**

  Replace the old `handleDisambiguationShutter` with:

  ```typescript
  const handlePhoto2Shutter = useCallback(async () => {
    if (pageState !== 'photo2_request') return
    vibrate(30)
    const base64 = captureFrame()
    if (!base64) return
    const allImages = [capturedImages[0] ?? base64, base64]
    setCapturedImages(allImages)
    await runIdentification(allImages)
  }, [captureFrame, capturedImages, pageState, runIdentification, vibrate])
  ```

- [ ] **Step 6: Add `photo2_request` render block**

  In the render section, add (before the `return` of the main camera view):

  ```typescript
  if (pageState === 'photo2_request') {
    const instruction = identifyResult?.result.state === 'photo2_request'
      ? identifyResult.result.instruction
      : null

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: '#0f0f0f', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32,
      }}>
        <div style={{ fontSize: 52 }}>📷</div>
        <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 18 }}>
          Ho bisogno di un'altra foto
        </div>
        {instruction && (
          <div style={{
            color: '#e5e7eb', fontSize: 15, textAlign: 'center',
            maxWidth: 320, lineHeight: 1.6,
            fontStyle: 'italic',
          }}>
            «{instruction}»
          </div>
        )}
        <button
          onClick={handlePhoto2Shutter}
          style={{
            marginTop: 8,
            background: 'rgba(245,158,11,0.25)',
            border: '1px solid rgba(245,158,11,0.5)',
            color: '#fbbf24', borderRadius: 10,
            padding: '14px 32px', fontSize: 16,
            fontWeight: 700, cursor: 'pointer',
          }}
        >
          Scatta ora
        </button>
        <button
          onClick={() => setPageState('idle_photo1')}
          style={{ color: '#6b7280', background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', marginTop: 4 }}
        >
          Annulla
        </button>
      </div>
    )
  }
  ```

- [ ] **Step 7: Update `shortlist` → `shortlist_visual` in render**

  Find all `pageState === 'shortlist'` and `result.state === 'shortlist'` in the render and replace with `shortlist_visual`. Update the candidates access: `result.candidates` is now `CandidateMatch[]` instead of `ProductMatch[]`.

  The shortlist_visual render should show candidates with their reference images if available. Minimal implementation (keeps existing structure, adapts types):

  ```typescript
  if (pageState === 'shortlist_visual' && identifyResult?.result.state === 'shortlist_visual') {
    const candidates = identifyResult.result.candidates
    return (
      // ... existing shortlist render adapted to shortlist_visual state name + CandidateMatch type
    )
  }
  ```

- [ ] **Step 8: Remove old disambiguation states from render**

  Delete any `pageState === 'disambiguation_camera'` and `pageState === 'disambiguation_analyzing'` render blocks. Delete `handleDisambiguationShutter`.

- [ ] **Step 9: Run tests**

  ```bash
  npm test --prefix archibald-web-app/frontend -- ToolRecognitionPage
  npm run type-check --prefix archibald-web-app/frontend
  ```

  Expected: PASS, 0 type errors.

- [ ] **Step 10: Commit**

  ```bash
  git add archibald-web-app/frontend/src/pages/ToolRecognitionPage.tsx \
          archibald-web-app/frontend/src/pages/ToolRecognitionPage.spec.tsx
  git commit -m "feat(recognition): frontend — photo2_request + shortlist_visual states"
  ```

---

## Task 12: Final integration check + gate

- [ ] **Step 1: Run full test suite**

  ```bash
  npm test --prefix archibald-web-app/backend
  npm test --prefix archibald-web-app/frontend
  ```

  Expected: all tests pass.

- [ ] **Step 2: Run type checks**

  ```bash
  npm run build --prefix archibald-web-app/backend
  npm run type-check --prefix archibald-web-app/frontend
  ```

  Expected: 0 errors.

- [ ] **Step 3: VPS pre-deploy checklist**

  Before deploying:
  - [ ] `JINA_API_KEY` added to VPS `.env`
  - [ ] Migration 056 staged for apply (CI/CD applies automatically or apply manually first)
  - [ ] `build-visual-index` operation registered in the operations processor (check `main.ts`)
  - [ ] `RECOGNITION_MIN_SIMILARITY=0.20` set in `.env` (conservative first run — calibrate after 100–200 real scans)

- [ ] **Step 4: Post-deploy validation**

  After deploy + index build:
  ```bash
  # Check index coverage
  ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
    "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
     exec -T postgres psql -U archibald -d archibald \
     -c 'SELECT source_type, COUNT(*) FROM shared.catalog_family_images WHERE visual_embedding IS NOT NULL GROUP BY source_type;'"
  ```

  Expected: campionario rows present.

  - [ ] Test 5 real scans; confirm `recognition_log.result_state` distribution (should show more `match`, fewer `not_found`)
  - [ ] Check token usage in logs (`tokens_used` < 10k per scan vs 60–160k before)

- [ ] **Step 5: Calibrate `RECOGNITION_MIN_SIMILARITY`**

  After ≥ 100 real scans:
  ```sql
  SELECT MIN(similarity), AVG(similarity), MAX(similarity)
  FROM recognition_log rl
  JOIN lateral (
    SELECT 1 - (visual_embedding <=> ...) AS similarity ...
  ) ...
  ```
  Set `RECOGNITION_MIN_SIMILARITY` to ~P10 of the similarity distribution for genuine matches.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Migration 056 (catalog_family_images + HNSW + last_indexed_at) | Task 1 |
| Jina v4 REST embedding service | Task 5 |
| Campionario strip crop per family (equal-width) | Task 4 |
| ANN query top-50 → dedup top-10 | Task 9 |
| Re-crop at query time via metadata | Task 9 (retrieveTop10Candidates) |
| Confidence routing ≥0.85→match, <0.85 first→photo2_request, <0.85 second→shortlist_visual | Task 9 |
| RECOGNITION_MIN_SIMILARITY early exit fallback | Task 2 (config), Task 9 (engine) |
| Jina-down fallback (getFallbackFamilies) | Task 6 + Task 9 |
| photo_request field from Claude | Task 10 (vision service) + Task 9 (engine uses it) |
| Remove search_catalog, get_catalog_page, RULE A, RULE B | Task 10 |
| New prompt (free-form visual comparison, no enumerative lists) | Task 10 |
| Frontend: photo2_request state with Claude instruction | Task 11 |
| Frontend: shortlist_visual state | Task 11 |
| Remove disambiguation_camera + disambiguation_analyzing | Task 11 |
| Index builder script + operation handler | Tasks 7 + 8 |
| Config: jinaApiKey, minSimilarity | Task 2 |
| Types: RecognitionResult new discriminated union (backend + frontend) | Task 3 |

**No gaps found.**

**Type consistency check:**
- `CandidateWithImages` defined in Task 3 (types.ts), used in Task 9 (engine), Task 10 (vision service) ✓
- `photo_request: string | null` in `IdentificationResult` — added in Task 3, read in Task 9 ✓
- `shortlist_visual` in `RecognitionResult` (backend Task 3) → matched in `recognition-engine.ts` Task 9 ✓
- `CandidateMatch` in frontend Task 3 → used in `shortlist_visual` rendering Task 11 ✓
- `identifyInstrument` signature (no `candidates?` param) in Task 3 — `handlePhoto2Shutter` in Task 11 calls `identifyInstrument(token, allImages)` ✓
