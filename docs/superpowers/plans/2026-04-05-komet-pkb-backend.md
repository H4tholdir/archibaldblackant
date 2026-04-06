# Komet PKB + Tool Recognition — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend infrastructure for Komet Product Knowledge Base (PKB) and AI-powered dental instrument recognition: DB schema, repositories, BullMQ enrichment jobs, recognition pipeline (Claude Vision API), budget management, and REST endpoints.

**Architecture:** New `recognition/` service module isolates domain logic (code parsing, budget, engine) from transport (routes). BullMQ handlers for enrichment jobs (komet-code-parser, komet-web-scraper) follow the existing `createXxxHandler(deps): OperationHandler` pattern and run in the existing `enrichment` queue.

**Tech Stack:** Express + TypeScript strict, PostgreSQL (pg pool), BullMQ (enrichment queue), `@anthropic-ai/sdk` (Claude Haiku Vision), `sharp` (image resize for field scans), `pdfjs-dist` (PDF extractor — deferred to P2)

> ⚠️ **Migration number correction**: the spec says `049` but `049-mfa-trusted-devices.sql` already exists. All references to migration `049` in this plan use **`050`** instead.

---

## File Map

**Create (new files):**
- `backend/src/recognition/types.ts` — shared TS types (RecognitionResult, InstrumentFeatures, ProductMatch, FilterQuestion, ThrottleLevel)
- `backend/src/recognition/komet-code-parser.ts` — pure functions: parseKometCode, calculateHeadSizeMm, FAMILY_MAP
- `backend/src/recognition/komet-code-parser.spec.ts`
- `backend/src/recognition/budget-service.ts` — lazy-reset budget singleton (SELECT FOR UPDATE)
- `backend/src/recognition/budget-service.spec.ts`
- `backend/src/recognition/recognition-engine.ts` — 9-step pipeline (hash → cache → budget → Vision API → measure → lookup → decide → log)
- `backend/src/recognition/recognition-engine.spec.ts`
- `backend/src/services/anthropic-vision-service.ts` — Anthropic SDK wrapper (injectable)
- `backend/src/db/repositories/instrument-features.ts` — upsert + lookup queries
- `backend/src/db/repositories/instrument-features.spec.ts`
- `backend/src/db/repositories/product-gallery.ts` — insert + query gallery images
- `backend/src/db/repositories/product-details.ts` — get product details (text, videos, manual URL)
- `backend/src/db/repositories/recognition-budget.ts` — budget DB helpers (used by budget-service)
- `backend/src/db/repositories/recognition-cache.ts` — SHA-256 cache read/write
- `backend/src/db/repositories/recognition-log.ts` — append-only log
- `backend/src/operations/handlers/komet-code-parser.ts` — BullMQ handler wrapping komet-code-parser service
- `backend/src/operations/handlers/komet-code-parser.spec.ts`
- `backend/src/operations/handlers/komet-web-scraper.ts` — BullMQ handler for image downloads
- `backend/src/operations/handlers/komet-web-scraper.spec.ts`
- `backend/src/operations/handlers/recognition-feedback.ts` — BullMQ handler (saves field scan to gallery)
- `backend/src/routes/recognition.ts` — POST /identify, POST /feedback, GET /budget
- `backend/src/routes/recognition.spec.ts`
- `backend/src/db/migrations/050-tool-recognition-pkb.sql`

**Modify (existing files):**
- `backend/src/config.ts` — add `recognition` config key
- `backend/package.json` — add `@anthropic-ai/sdk`, `sharp`
- `archibald-web-app/docker-compose.yml` — add `product-images` volume
- `backend/src/operations/operation-types.ts` — add 3 new operation types (komet-pdf-extractor deferred P2)
- `backend/src/operations/queue-router.ts` — route 4 new ops to `enrichment`
- `backend/src/operations/handlers/index.ts` — export 3 new handlers
- `backend/src/server.ts` — add `AppDeps.callVisionApi`, mount recognition route, add enrichment to products route
- `backend/src/main.ts` — instantiate Anthropic vision service, wire handlers, pass to createApp
- `backend/src/routes/products.ts` — add `GET /:productId/enrichment`
- `backend/src/sync/sync-scheduler.ts` — add `deleteExpiredRecognitionCache` param for daily cleanup

---

### Task 1: npm dependencies + config.ts

**Files:**
- Modify: `archibald-web-app/backend/package.json`
- Modify: `archibald-web-app/backend/src/config.ts`

- [ ] **Step 1: Add npm dependencies**

```bash
cd archibald-web-app/backend && npm install @anthropic-ai/sdk sharp
```

Expected: packages added to `package.json` dependencies.

- [ ] **Step 2: Add `recognition` key to config.ts**

In `archibald-web-app/backend/src/config.ts`, add after the `dropbox` block (before the closing `} as const`):

```typescript
  recognition: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    dailyLimit:  parseInt(process.env.RECOGNITION_DAILY_LIMIT  ?? '500',   10),
    timeoutMs:   parseInt(process.env.RECOGNITION_TIMEOUT_MS   ?? '15000', 10),
  },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/package.json archibald-web-app/backend/package-lock.json archibald-web-app/backend/src/config.ts
git commit -m "chore(recognition): add @anthropic-ai/sdk, sharp deps + recognition config"
```

---

### Task 2: Docker volume for product images

**Files:**
- Modify: `archibald-web-app/docker-compose.yml`

- [ ] **Step 1: Add volume to backend service and volumes section**

In `archibald-web-app/docker-compose.yml`:

In the `backend` service `volumes` section, add the new volume:
```yaml
    volumes:
      - backend-cache:/app/.cache
      - backend-logs:/app/logs
      - product-images:/app/assets/product-images
```

At the bottom `volumes:` section, add:
```yaml
  product-images:
```

- [ ] **Step 2: Commit**

```bash
git add archibald-web-app/docker-compose.yml
git commit -m "chore(recognition): add persistent product-images Docker volume"
```

---

### Task 3: operation-types.ts + queue-router.ts

**Files:**
- Modify: `archibald-web-app/backend/src/operations/operation-types.ts`
- Modify: `archibald-web-app/backend/src/operations/queue-router.ts`
- Test: `archibald-web-app/backend/src/operations/operation-types.spec.ts`

- [ ] **Step 1: Write failing test**

Open `archibald-web-app/backend/src/operations/operation-types.spec.ts` and add at the end (or create if it doesn't exist):

```typescript
import { describe, expect, test } from 'vitest';
import { OPERATION_TYPES, OPERATION_PRIORITIES, SCHEDULED_SYNCS } from './operation-types';
import { QUEUE_ROUTING } from './queue-router';

describe('recognition operation types', () => {
  const recognitionOps = [
    'komet-code-parser',
    'komet-web-scraper',
    'recognition-feedback',
  ] as const;

  test('all 3 recognition ops are in OPERATION_TYPES', () => {
    for (const op of recognitionOps) {
      expect(OPERATION_TYPES).toContain(op);
    }
  });

  test('all 3 recognition ops have priorities', () => {
    for (const op of recognitionOps) {
      expect(OPERATION_PRIORITIES[op as keyof typeof OPERATION_PRIORITIES]).toBeGreaterThan(0);
    }
  });

  test('all 3 recognition ops route to enrichment queue', () => {
    for (const op of recognitionOps) {
      expect(QUEUE_ROUTING[op as keyof typeof QUEUE_ROUTING]).toBe('enrichment');
    }
  });

  test('komet-code-parser and komet-web-scraper are scheduled syncs', () => {
    expect(SCHEDULED_SYNCS.has('komet-code-parser' as any)).toBe(true);
    expect(SCHEDULED_SYNCS.has('komet-web-scraper' as any)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose operation-types.spec 2>&1 | tail -20
```

Expected: FAIL — "recognition operation types › all 3 recognition ops are in OPERATION_TYPES"

- [ ] **Step 3: Update operation-types.ts**

In `archibald-web-app/backend/src/operations/operation-types.ts`, modify:

```typescript
const OPERATION_TYPES = [
  'submit-order',
  'create-customer',
  'update-customer',
  'read-vat-status',
  'send-to-verona',
  'batch-send-to-verona',
  'edit-order',
  'delete-order',
  'batch-delete-orders',
  'download-ddt-pdf',
  'download-invoice-pdf',
  'sync-order-articles',
  'sync-order-states',
  'sync-customers',
  'sync-orders',
  'sync-ddt',
  'sync-invoices',
  'sync-products',
  'sync-prices',
  'sync-tracking',
  'sync-customer-addresses',
  // komet-pdf-extractor deferred to P2 (pdfjs-dist integration)
  'komet-code-parser',
  'komet-web-scraper',
  'recognition-feedback',
] as const;
```

Add to `OPERATION_PRIORITIES`:
```typescript
  'komet-code-parser':    20,
  'komet-web-scraper':    21,
  'recognition-feedback':  5,
```

Add to `SCHEDULED_SYNCS`:
```typescript
const SCHEDULED_SYNCS: ReadonlySet<OperationType> = new Set([
  // ...existing entries...
  'komet-code-parser',
  'komet-web-scraper',
]);
```

(`recognition-feedback` is NOT in SCHEDULED_SYNCS — it is triggered on-demand.)

- [ ] **Step 4: Update queue-router.ts**

In `archibald-web-app/backend/src/operations/queue-router.ts`, add to `QUEUE_ROUTING`:
```typescript
  'komet-code-parser':    'enrichment',
  'komet-web-scraper':    'enrichment',
  'recognition-feedback': 'enrichment',
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose operation-types.spec 2>&1 | tail -20
```

Expected: PASS all 4 tests.

- [ ] **Step 6: Full backend test suite**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -10
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/operations/operation-types.ts archibald-web-app/backend/src/operations/queue-router.ts archibald-web-app/backend/src/operations/operation-types.spec.ts
git commit -m "feat(recognition): add 3 enrichment operation types to queue routing (komet-pdf-extractor deferred P2)"
```

---

### Task 4: Migration 050

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/050-tool-recognition-pkb.sql`

- [ ] **Step 1: Create migration file**

Create `archibald-web-app/backend/src/db/migrations/050-tool-recognition-pkb.sql`:

```sql
-- Migration 050: Komet Product Knowledge Base + Tool Recognition

BEGIN;

-- Feature index for recognition engine (derived from product codes)
CREATE TABLE IF NOT EXISTS shared.instrument_features (
  product_id         TEXT PRIMARY KEY REFERENCES shared.products(id) ON DELETE CASCADE,
  shape_family       TEXT NOT NULL,
  material           TEXT NOT NULL,
  grit_ring_color    TEXT,
  shank_type         TEXT NOT NULL,
  shank_diameter_mm  DOUBLE PRECISION NOT NULL DEFAULT 1.6,
  head_size_code     TEXT NOT NULL,
  head_size_mm       DOUBLE PRECISION NOT NULL,
  working_length_mm  DOUBLE PRECISION,
  total_length_mm    DOUBLE PRECISION,
  family_code        TEXT NOT NULL,
  parsed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source             TEXT NOT NULL DEFAULT 'code_parser'
);

CREATE INDEX IF NOT EXISTS idx_instrument_features_shape
  ON shared.instrument_features(shape_family);
CREATE INDEX IF NOT EXISTS idx_instrument_features_material
  ON shared.instrument_features(material);
CREATE INDEX IF NOT EXISTS idx_instrument_features_shank
  ON shared.instrument_features(shank_type);
CREATE INDEX IF NOT EXISTS idx_instrument_features_grit
  ON shared.instrument_features(grit_ring_color);
CREATE INDEX IF NOT EXISTS idx_instrument_features_size
  ON shared.instrument_features(head_size_mm);
CREATE INDEX IF NOT EXISTS idx_instrument_features_lookup
  ON shared.instrument_features(shape_family, material, grit_ring_color, shank_type);

-- Multi-image gallery per product
CREATE TABLE IF NOT EXISTS shared.product_gallery (
  id           SERIAL PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES shared.products(id) ON DELETE CASCADE,
  image_url    TEXT NOT NULL,
  local_path   TEXT,
  image_type   TEXT NOT NULL CHECK (image_type IN (
                 'instrument_white_bg',
                 'marketing',
                 'microscope',
                 'clinical',
                 'field_scan'
               )),
  source       TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  width        INTEGER,
  height       INTEGER,
  file_size    INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_product ON shared.product_gallery(product_id);
CREATE INDEX IF NOT EXISTS idx_gallery_type    ON shared.product_gallery(product_id, image_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_url ON shared.product_gallery(product_id, image_url);

-- Editorial data and technical specs
CREATE TABLE IF NOT EXISTS shared.product_details (
  product_id            TEXT PRIMARY KEY REFERENCES shared.products(id) ON DELETE CASCADE,
  clinical_description  TEXT,
  procedures            TEXT,
  performance_data      JSONB,
  video_url             TEXT,
  pdf_url               TEXT,
  source_url            TEXT,
  scraped_at            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Placeholder for Phase 2: competitor equivalents
CREATE TABLE IF NOT EXISTS shared.competitor_equivalents (
  id                SERIAL PRIMARY KEY,
  komet_product_id  TEXT NOT NULL REFERENCES shared.products(id) ON DELETE CASCADE,
  competitor_brand  TEXT NOT NULL,
  competitor_code   TEXT NOT NULL,
  competitor_name   TEXT,
  match_type        TEXT NOT NULL CHECK (match_type IN ('exact', 'equivalent', 'similar')),
  match_confidence  DOUBLE PRECISION,
  source            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_komet ON shared.competitor_equivalents(komet_product_id);
CREATE INDEX IF NOT EXISTS idx_competitor_brand ON shared.competitor_equivalents(competitor_brand);
CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_unique
  ON shared.competitor_equivalents(komet_product_id, competitor_brand, competitor_code);

-- Daily budget pool (singleton row, id=1 enforced)
CREATE TABLE IF NOT EXISTS system.recognition_budget (
  id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  daily_limit    INTEGER NOT NULL DEFAULT 500,
  used_today     INTEGER NOT NULL DEFAULT 0,
  throttle_level TEXT NOT NULL DEFAULT 'normal'
                   CHECK (throttle_level IN ('normal', 'warning', 'limited')),
  reset_at       TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system.recognition_budget (id, daily_limit, reset_at)
VALUES (
  1,
  500,
  date_trunc('day', NOW() AT TIME ZONE 'Europe/Rome') + INTERVAL '1 day' AT TIME ZONE 'Europe/Rome'
)
ON CONFLICT (id) DO NOTHING;

-- Recognition result cache (30 days, keyed by SHA-256 of image buffer)
CREATE TABLE IF NOT EXISTS system.recognition_cache (
  image_hash     TEXT PRIMARY KEY,
  result_json    JSONB NOT NULL,
  product_id     TEXT,
  confidence     DOUBLE PRECISION,
  image_data     BYTEA,              -- non in spec originale, aggiunto per recognition-feedback (salva frame da cache)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON system.recognition_cache(expires_at);

-- Recognition analytics log
CREATE TABLE IF NOT EXISTS system.recognition_log (
  id             SERIAL PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  image_hash     TEXT NOT NULL,
  cache_hit      BOOLEAN NOT NULL DEFAULT FALSE,
  product_id     TEXT,
  confidence     DOUBLE PRECISION,
  result_state   TEXT NOT NULL CHECK (result_state IN (
                   'match', 'shortlist', 'filter_needed', 'not_found', 'error'
                 )),
  tokens_used    INTEGER,
  api_cost_usd   DOUBLE PRECISION,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reclog_user    ON system.recognition_log(user_id);
CREATE INDEX IF NOT EXISTS idx_reclog_date    ON system.recognition_log(created_at);
CREATE INDEX IF NOT EXISTS idx_reclog_product ON system.recognition_log(product_id);

COMMIT;
```

- [ ] **Step 2: Verify migration can be applied locally**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: build succeeds (migrations are SQL files, no TS needed here).

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/050-tool-recognition-pkb.sql
git commit -m "feat(recognition): migration 050 — instrument_features, product_gallery, recognition budget/cache/log"
```

---

### Task 5: recognition/types.ts

**Files:**
- Create: `archibald-web-app/backend/src/recognition/types.ts`

- [ ] **Step 1: Create the shared types module**

Create `archibald-web-app/backend/src/recognition/types.ts`:

```typescript
type ThrottleLevel = 'normal' | 'warning' | 'limited';

type InstrumentFeatures = {
  shape_family:    string | null
  material:        string | null
  grit_ring_color: string | null
  shank_type:      'fg' | 'ca' | 'unknown'
  head_px:         number | null
  shank_px:        number | null
  confidence:      number
};

type ProductMatch = {
  productId:    string
  productName:  string
  familyCode:   string
  headSizeMm:   number
  shankType:    string
  thumbnailUrl: string | null
  confidence:   number
};

type FilterQuestion = {
  field:   'head_size_mm' | 'grit_ring_color' | 'shank_type'
  prompt:  string
  options: Array<{ label: string; value: string }>
};

type RecognitionResult =
  | { state: 'match';           product: ProductMatch; confidence: number }
  | { state: 'shortlist';       candidates: ProductMatch[]; extractedFeatures: InstrumentFeatures }
  | { state: 'filter_needed';   extractedFeatures: InstrumentFeatures; question: FilterQuestion }
  | { state: 'not_found';       extractedFeatures: InstrumentFeatures | null }
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
  InstrumentFeatures,
  ProductMatch,
  FilterQuestion,
  RecognitionResult,
  BudgetState,
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/recognition/types.ts
git commit -m "feat(recognition): add shared TS types module"
```

---

### Task 6: recognition/komet-code-parser.ts

**Files:**
- Create: `archibald-web-app/backend/src/recognition/komet-code-parser.ts`
- Create: `archibald-web-app/backend/src/recognition/komet-code-parser.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `archibald-web-app/backend/src/recognition/komet-code-parser.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { parseKometCode, calculateHeadSizeMm } from './komet-code-parser';

describe('parseKometCode', () => {
  test('parses TC round FG (H1.314.016)', () => {
    const result = parseKometCode('H1.314.016');
    expect(result).toEqual({
      shape_family:    'round',
      material:        'tungsten_carbide',
      grit_ring_color: null,
      family_code:     'H1',
      shank_type:      'fg',
      shank_diameter_mm: 1.6,
      head_size_code:  '016',
      head_size_mm:    1.6,
    });
  });

  test('parses DIAO round FG (KP6801.314.016)', () => {
    const result = parseKometCode('KP6801.314.016');
    expect(result).not.toBeNull();
    expect(result!.material).toBe('diamond_diao');
    expect(result!.shank_type).toBe('fg');
    expect(result!.head_size_mm).toBe(1.6);
  });

  test('parses CA shank (H2.204.010)', () => {
    const result = parseKometCode('H2.204.010');
    expect(result).not.toBeNull();
    expect(result!.shank_type).toBe('ca');
    expect(result!.shank_diameter_mm).toBe(2.35);
    expect(result!.head_size_mm).toBe(1.0);
  });

  test('parses diamond fine red ring (8801.314.018)', () => {
    const result = parseKometCode('8801.314.018');
    expect(result).not.toBeNull();
    expect(result!.material).toBe('diamond');
    expect(result!.grit_ring_color).toBe('red');
    expect(result!.head_size_mm).toBe(1.8);
  });

  test('returns null for unknown family code (ZZZ.314.016)', () => {
    expect(parseKometCode('ZZZ.314.016')).toBeNull();
  });

  test('returns null for malformed code (no dots)', () => {
    expect(parseKometCode('H1314016')).toBeNull();
  });
});

describe('calculateHeadSizeMm', () => {
  test('calculates size from pixel ratio (FG shank)', () => {
    // shank = 1.6mm, head is twice the shank → 3.2mm → snaps to 3.1
    const result = calculateHeadSizeMm(200, 100, 'fg');
    expect(result).toBe(3.1);
  });

  test('snaps to nearest ISO size (FG, head ≈ 1.0 → exactly 1.0)', () => {
    // head 100px, shank 160px → rawMm = (100/160)*1.6 = 1.0
    const result = calculateHeadSizeMm(100, 160, 'fg');
    expect(result).toBe(1.0);
  });

  test('returns null when shankPx is 0', () => {
    expect(calculateHeadSizeMm(100, 0, 'fg')).toBeNull();
  });

  test('returns null for unknown shank type', () => {
    expect(calculateHeadSizeMm(100, 100, 'unknown')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose komet-code-parser.spec 2>&1 | tail -20
```

Expected: FAIL — "Cannot find module './komet-code-parser'"

- [ ] **Step 3: Implement komet-code-parser.ts**

Create `archibald-web-app/backend/src/recognition/komet-code-parser.ts`:

```typescript
import type { InstrumentFeatures } from './types';

type ParsedFeatures = Pick<
  InstrumentFeatures,
  'shape_family' | 'material' | 'grit_ring_color' | 'shank_type'
> & {
  family_code:      string
  shank_diameter_mm: number
  head_size_code:   string
  head_size_mm:     number
};

const SHANK_TYPE_MAP: Record<string, string> = {
  '314': 'fg',
  '313': 'fgs',
  '315': 'fgl',
  '316': 'fgxl',
  '204': 'ca',
};

const SHANK_DIAMETER_MAP: Record<string, number> = {
  '314': 1.6, '313': 1.6, '315': 1.6, '316': 1.6,
  '204': 2.35,
};

// Families with null grit_ring_color (non-diamond)
type FamilyFeatures = {
  shape_family:    string
  material:        string
  grit_ring_color: string | null
};

const FAMILY_MAP: Record<string, FamilyFeatures> = {
  // Tungsten Carbide
  'H1':    { shape_family: 'round',             material: 'tungsten_carbide', grit_ring_color: null },
  'H1S':   { shape_family: 'round',             material: 'tungsten_carbide', grit_ring_color: null },
  'H1SE':  { shape_family: 'round',             material: 'tungsten_carbide', grit_ring_color: null },
  'H7':    { shape_family: 'pear',              material: 'tungsten_carbide', grit_ring_color: null },
  'H7S':   { shape_family: 'pear',              material: 'tungsten_carbide', grit_ring_color: null },
  'H2':    { shape_family: 'inverted_cone',     material: 'tungsten_carbide', grit_ring_color: null },
  'H21R':  { shape_family: 'cylinder',          material: 'tungsten_carbide', grit_ring_color: null },
  'H23R':  { shape_family: 'tapered_round_end', material: 'tungsten_carbide', grit_ring_color: null },
  'H59':   { shape_family: 'cylinder',          material: 'tungsten_carbide', grit_ring_color: null },
  'H11':   { shape_family: 'flame',             material: 'tungsten_carbide', grit_ring_color: null },
  'H12':   { shape_family: 'torpedo',           material: 'tungsten_carbide', grit_ring_color: null },
  'H4':    { shape_family: 'wheel',             material: 'tungsten_carbide', grit_ring_color: null },
  'H6':    { shape_family: 'cylinder',          material: 'tungsten_carbide', grit_ring_color: null },
  'H64':   { shape_family: 'cylinder',          material: 'tungsten_carbide', grit_ring_color: null },
  // Diamond standard (grit inferred from numeric prefix)
  '801':   { shape_family: 'round',       material: 'diamond', grit_ring_color: 'blue'   },
  '8801':  { shape_family: 'round',       material: 'diamond', grit_ring_color: 'red'    },
  '6801':  { shape_family: 'round',       material: 'diamond', grit_ring_color: 'green'  },
  '5801':  { shape_family: 'round',       material: 'diamond', grit_ring_color: 'black'  },
  '801UF': { shape_family: 'round',       material: 'diamond', grit_ring_color: 'white'  },
  '801EF': { shape_family: 'round',       material: 'diamond', grit_ring_color: 'yellow' },
  '837':   { shape_family: 'cylinder',    material: 'diamond', grit_ring_color: 'blue'   },
  '8837':  { shape_family: 'cylinder',    material: 'diamond', grit_ring_color: 'red'    },
  '6837':  { shape_family: 'cylinder',    material: 'diamond', grit_ring_color: 'green'  },
  '847':   { shape_family: 'tapered_round_end', material: 'diamond', grit_ring_color: 'blue' },
  '8847':  { shape_family: 'tapered_round_end', material: 'diamond', grit_ring_color: 'red'  },
  '856':   { shape_family: 'pear',        material: 'diamond', grit_ring_color: 'blue'   },
  '8856':  { shape_family: 'pear',        material: 'diamond', grit_ring_color: 'red'    },
  '881':   { shape_family: 'cylinder',    material: 'diamond', grit_ring_color: 'blue'   },
  // Diamond DIAO (rose-gold)
  'KP6801': { shape_family: 'round',              material: 'diamond_diao', grit_ring_color: 'green' },
  'KP6837': { shape_family: 'cylinder',           material: 'diamond_diao', grit_ring_color: 'green' },
  'KP6881': { shape_family: 'cylinder',           material: 'diamond_diao', grit_ring_color: 'green' },
  'KP6847': { shape_family: 'tapered_round_end',  material: 'diamond_diao', grit_ring_color: 'green' },
  'KP6856': { shape_family: 'pear',               material: 'diamond_diao', grit_ring_color: 'green' },
  'KP8801': { shape_family: 'round',              material: 'diamond_diao', grit_ring_color: 'red'   },
};

// ISO standard head sizes in mm
const ISO_SIZES_MM = [
  0.5, 0.6, 0.7, 0.8, 0.9, 1.0,
  1.2, 1.4, 1.6, 1.8, 2.1, 2.3,
  2.5, 2.7, 2.9, 3.1, 3.5,
];

const SHANK_DIAMETERS_MM: Record<string, number> = {
  fg: 1.6, fgs: 1.6, fgl: 1.6, fgxl: 1.6,
  ca: 2.35,
};

function parseKometCode(productId: string): ParsedFeatures | null {
  const match = productId.match(/^(.+?)\.(\d{3})\.(\d{3})$/);
  if (!match) return null;
  const [, familyCode, shankCode, sizeCode] = match;
  const features = FAMILY_MAP[familyCode];
  if (!features) return null;

  return {
    ...features,
    family_code:       familyCode,
    shank_type:        SHANK_TYPE_MAP[shankCode] ?? 'fg',
    shank_diameter_mm: SHANK_DIAMETER_MAP[shankCode] ?? 1.6,
    head_size_code:    sizeCode,
    head_size_mm:      parseInt(sizeCode, 10) / 10,
  };
}

function calculateHeadSizeMm(
  headPx: number,
  shankPx: number,
  shankType: string,
): number | null {
  const shankDiam = SHANK_DIAMETERS_MM[shankType];
  if (!shankDiam || shankPx === 0) return null;
  const rawMm = (headPx / shankPx) * shankDiam;
  return ISO_SIZES_MM.reduce((a, b) =>
    Math.abs(b - rawMm) < Math.abs(a - rawMm) ? b : a,
  );
}

export { parseKometCode, calculateHeadSizeMm, FAMILY_MAP };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose komet-code-parser.spec 2>&1 | tail -20
```

Expected: PASS all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/recognition/komet-code-parser.ts archibald-web-app/backend/src/recognition/komet-code-parser.spec.ts
git commit -m "feat(recognition): komet code parser — parseKometCode, calculateHeadSizeMm, FAMILY_MAP"
```

---

### Task 7: DB Repositories

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/instrument-features.ts`
- Create: `archibald-web-app/backend/src/db/repositories/instrument-features.spec.ts`
- Create: `archibald-web-app/backend/src/db/repositories/product-gallery.ts`
- Create: `archibald-web-app/backend/src/db/repositories/recognition-budget.ts`
- Create: `archibald-web-app/backend/src/db/repositories/recognition-cache.ts`
- Create: `archibald-web-app/backend/src/db/repositories/recognition-log.ts`

- [ ] **Step 1: Write failing test for instrument-features repository**

Create `archibald-web-app/backend/src/db/repositories/instrument-features.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { upsertInstrumentFeatures, lookupByFeatures } from './instrument-features';
import type { DbPool } from '../pool';

const FEATURE = {
  product_id:       'H1.314.016',
  shape_family:     'round',
  material:         'tungsten_carbide',
  grit_ring_color:  null,
  shank_type:       'fg',
  shank_diameter_mm: 1.6,
  head_size_code:   '016',
  head_size_mm:     1.6,
  family_code:      'H1',
};

describe('upsertInstrumentFeatures', () => {
  test('calls pool.query with upsert SQL and correct params', async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as DbPool;
    await upsertInstrumentFeatures(mockPool, FEATURE);
    expect(mockPool.query).toHaveBeenCalledOnce();
    const [sql, params] = (mockPool.query as any).mock.calls[0];
    expect(sql).toContain('INSERT INTO shared.instrument_features');
    expect(sql).toContain('ON CONFLICT (product_id)');
    expect(params).toContain('H1.314.016');
    expect(params).toContain('round');
  });
});

describe('lookupByFeatures', () => {
  test('returns rows from pool.query with size filter when calc_size provided', async () => {
    const mockRows = [{ product_id: 'H1.314.016', head_size_mm: 1.6, name: 'TC Round FG', image_url: null }];
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: mockRows }) } as unknown as DbPool;
    const result = await lookupByFeatures(mockPool, {
      shape_family: 'round',
      material: 'tungsten_carbide',
      grit_ring_color: null,
      shank_type: 'fg',
      calc_size_mm: 1.6,
    });
    expect(result).toEqual(mockRows);
    const [sql, params] = (mockPool.query as any).mock.calls[0];
    expect(sql).toContain('head_size_mm BETWEEN');
    expect(params).toContain('round');
  });

  test('omits head_size_mm filter when calc_size is null', async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as DbPool;
    await lookupByFeatures(mockPool, {
      shape_family: 'round',
      material: 'tungsten_carbide',
      grit_ring_color: null,
      shank_type: 'fg',
      calc_size_mm: null,
    });
    const [sql] = (mockPool.query as any).mock.calls[0];
    expect(sql).not.toContain('head_size_mm BETWEEN');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose instrument-features.spec 2>&1 | tail -10
```

Expected: FAIL — "Cannot find module './instrument-features'"

- [ ] **Step 3: Implement instrument-features.ts**

Create `archibald-web-app/backend/src/db/repositories/instrument-features.ts`:

```typescript
import type { DbPool } from '../pool';

type InstrumentFeatureRow = {
  product_id:        string
  shape_family:      string
  material:          string
  grit_ring_color:   string | null
  shank_type:        string
  shank_diameter_mm: number
  head_size_code:    string
  head_size_mm:      number
  working_length_mm: number | null
  total_length_mm:   number | null
  family_code:       string
};

type LookupParams = {
  shape_family:    string | null
  material:        string | null
  grit_ring_color: string | null
  shank_type:      string
  calc_size_mm:    number | null
};

type LookupRow = {
  product_id:   string
  head_size_mm: number
  shank_type:   string
  name:         string
  image_url:    string | null
};

async function upsertInstrumentFeatures(
  pool: DbPool,
  f: Omit<InstrumentFeatureRow, 'working_length_mm' | 'total_length_mm'> & {
    working_length_mm?: number | null
    total_length_mm?:   number | null
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO shared.instrument_features
       (product_id, shape_family, material, grit_ring_color, shank_type,
        shank_diameter_mm, head_size_code, head_size_mm, family_code,
        working_length_mm, total_length_mm, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'code_parser')
     ON CONFLICT (product_id) DO UPDATE SET
       shape_family      = EXCLUDED.shape_family,
       material          = EXCLUDED.material,
       grit_ring_color   = EXCLUDED.grit_ring_color,
       shank_type        = EXCLUDED.shank_type,
       shank_diameter_mm = EXCLUDED.shank_diameter_mm,
       head_size_code    = EXCLUDED.head_size_code,
       head_size_mm      = EXCLUDED.head_size_mm,
       family_code       = EXCLUDED.family_code,
       parsed_at         = NOW()`,
    [
      f.product_id,
      f.shape_family,
      f.material,
      f.grit_ring_color ?? null,
      f.shank_type,
      f.shank_diameter_mm,
      f.head_size_code,
      f.head_size_mm,
      f.family_code,
      f.working_length_mm ?? null,
      f.total_length_mm   ?? null,
    ],
  );
}

async function lookupByFeatures(
  pool: DbPool,
  params: LookupParams,
  limit = 20,
): Promise<LookupRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.shape_family) {
    conditions.push(`f.shape_family = $${idx++}`);
    values.push(params.shape_family);
  }
  if (params.material) {
    conditions.push(`f.material = $${idx++}`);
    values.push(params.material);
  }
  conditions.push(`(f.grit_ring_color = $${idx++} OR f.grit_ring_color IS NULL)`);
  values.push(params.grit_ring_color);

  conditions.push(`f.shank_type = $${idx++}`);
  values.push(params.shank_type);

  if (params.calc_size_mm !== null) {
    conditions.push(`f.head_size_mm BETWEEN $${idx++} AND $${idx++}`);
    values.push(params.calc_size_mm - 0.15, params.calc_size_mm + 0.15);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit);
  const { rows } = await pool.query<LookupRow>(
    `SELECT f.product_id, f.head_size_mm, f.shank_type, p.name, p.image_url
     FROM shared.instrument_features f
     JOIN shared.products p ON p.id = f.product_id
     ${where}
     ORDER BY f.head_size_mm
     LIMIT $${idx}`,
    values,
  );
  return rows;
}

async function countUnmappedProducts(pool: DbPool): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM shared.products p
     WHERE NOT EXISTS (
       SELECT 1 FROM shared.instrument_features f WHERE f.product_id = p.id
     )`,
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

export { upsertInstrumentFeatures, lookupByFeatures, countUnmappedProducts };
export type { InstrumentFeatureRow, LookupRow };
```

- [ ] **Step 4: Implement product-gallery.ts**

Create `archibald-web-app/backend/src/db/repositories/product-gallery.ts`:

```typescript
import type { DbPool } from '../pool';

type GalleryImageType = 'instrument_white_bg' | 'marketing' | 'microscope' | 'clinical' | 'field_scan';

type GalleryRow = {
  id:         number
  product_id: string
  image_url:  string
  local_path: string | null
  image_type: GalleryImageType
  source:     string
  sort_order: number
  width:      number | null
  height:     number | null
  created_at: Date
};

async function insertGalleryImage(
  pool: DbPool,
  img: {
    product_id: string
    image_url:  string
    local_path?: string | null
    image_type: GalleryImageType
    source:     string
    sort_order?: number
    width?:      number | null
    height?:     number | null
    file_size?:  number | null
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO shared.product_gallery
       (product_id, image_url, local_path, image_type, source, sort_order, width, height, file_size)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (product_id, image_url) DO UPDATE SET
       local_path = EXCLUDED.local_path,
       sort_order = EXCLUDED.sort_order`,
    [
      img.product_id,
      img.image_url,
      img.local_path ?? null,
      img.image_type,
      img.source,
      img.sort_order ?? 0,
      img.width      ?? null,
      img.height     ?? null,
      img.file_size  ?? null,
    ],
  );
}

async function getGalleryByProduct(pool: DbPool, productId: string): Promise<GalleryRow[]> {
  const { rows } = await pool.query<GalleryRow>(
    `SELECT id, product_id, image_url, local_path, image_type, source, sort_order, width, height, created_at
     FROM shared.product_gallery
     WHERE product_id = $1
     ORDER BY sort_order, id`,
    [productId],
  );
  return rows;
}

export { insertGalleryImage, getGalleryByProduct };
export type { GalleryRow, GalleryImageType };
```

- [ ] **Step 5: Implement recognition-budget.ts**

Create `archibald-web-app/backend/src/db/repositories/recognition-budget.ts`:

```typescript
import type { DbPool } from '../pool';
import type { ThrottleLevel, BudgetState } from '../../recognition/types';

type BudgetRow = {
  id:             number
  daily_limit:    number
  used_today:     number
  throttle_level: ThrottleLevel
  reset_at:       Date
  updated_at:     Date
};

async function getBudgetRow(pool: DbPool): Promise<BudgetRow | null> {
  const { rows } = await pool.query<BudgetRow>(
    `SELECT id, daily_limit, used_today, throttle_level, reset_at, updated_at
     FROM system.recognition_budget WHERE id = 1`,
  );
  return rows[0] ?? null;
}

async function resetBudgetIfExpired(pool: DbPool): Promise<void> {
  await pool.query(
    `UPDATE system.recognition_budget SET
       used_today     = 0,
       throttle_level = 'normal',
       reset_at       = date_trunc('day', NOW() AT TIME ZONE 'Europe/Rome') + INTERVAL '1 day' AT TIME ZONE 'Europe/Rome',
       updated_at     = NOW()
     WHERE id = 1 AND NOW() > reset_at`,
  );
}

async function incrementUsedToday(pool: DbPool): Promise<{ newCount: number; throttleLevel: ThrottleLevel } | null> {
  // Atomic: only increments if used_today < daily_limit. Returns null if budget exhausted.
  const { rows } = await pool.query<{ used_today: number; daily_limit: number }>(
    `UPDATE system.recognition_budget SET
       used_today   = used_today + 1,
       updated_at   = NOW()
     WHERE id = 1 AND used_today < daily_limit
     RETURNING used_today, daily_limit`,
  );
  const row = rows[0];
  if (!row) return null; // Budget exhausted or singleton missing
  const pct = row.used_today / row.daily_limit;
  const throttleLevel: ThrottleLevel = pct >= 0.95 ? 'limited' : pct >= 0.80 ? 'warning' : 'normal';
  await pool.query(
    `UPDATE system.recognition_budget SET throttle_level = $1 WHERE id = 1`,
    [throttleLevel],
  );
  return { newCount: row.used_today, throttleLevel };
}

export { getBudgetRow, resetBudgetIfExpired, incrementUsedToday };
export type { BudgetRow };
```

- [ ] **Step 6: Implement recognition-cache.ts**

Create `archibald-web-app/backend/src/db/repositories/recognition-cache.ts`:

```typescript
import type { DbPool } from '../pool';
import type { RecognitionResult } from '../../recognition/types';

type CacheRow = {
  image_hash:  string
  result_json: RecognitionResult
  product_id:  string | null
  confidence:  number | null
  image_data:  Buffer | null
  created_at:  Date
  expires_at:  Date
};

async function getCached(pool: DbPool, imageHash: string): Promise<CacheRow | null> {
  const { rows } = await pool.query<CacheRow>(
    `SELECT image_hash, result_json, product_id, confidence, image_data, created_at, expires_at
     FROM system.recognition_cache
     WHERE image_hash = $1 AND expires_at > NOW()`,
    [imageHash],
  );
  return rows[0] ?? null;
}

async function setCached(
  pool: DbPool,
  imageHash: string,
  result: RecognitionResult,
  imageBuffer: Buffer | null,
): Promise<void> {
  const productId = result.state === 'match' ? result.product.productId : null;
  const confidence = result.state === 'match' ? result.confidence : null;
  await pool.query(
    `INSERT INTO system.recognition_cache
       (image_hash, result_json, product_id, confidence, image_data)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (image_hash) DO UPDATE SET
       result_json = EXCLUDED.result_json,
       product_id  = EXCLUDED.product_id,
       confidence  = EXCLUDED.confidence,
       expires_at  = NOW() + INTERVAL '30 days'`,
    [imageHash, JSON.stringify(result), productId, confidence, imageBuffer],
  );
}

async function getImageDataFromCache(pool: DbPool, imageHash: string): Promise<Buffer | null> {
  const { rows } = await pool.query<{ image_data: Buffer | null }>(
    `SELECT image_data FROM system.recognition_cache WHERE image_hash = $1`,
    [imageHash],
  );
  return rows[0]?.image_data ?? null;
}

async function deleteExpiredCache(pool: DbPool): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM system.recognition_cache WHERE expires_at < NOW()`,
  );
  return rowCount ?? 0;
}

export { getCached, setCached, getImageDataFromCache, deleteExpiredCache };
```

- [ ] **Step 7: Implement recognition-log.ts**

Create `archibald-web-app/backend/src/db/repositories/recognition-log.ts`:

```typescript
import type { DbPool } from '../pool';

type LogEntry = {
  user_id:      string
  image_hash:   string
  cache_hit:    boolean
  product_id:   string | null
  confidence:   number | null
  result_state: 'match' | 'shortlist' | 'filter_needed' | 'not_found' | 'error'
  tokens_used:  number | null
  api_cost_usd: number | null
};

async function appendRecognitionLog(pool: DbPool, entry: LogEntry): Promise<void> {
  await pool.query(
    `INSERT INTO system.recognition_log
       (user_id, image_hash, cache_hit, product_id, confidence,
        result_state, tokens_used, api_cost_usd)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      entry.user_id,
      entry.image_hash,
      entry.cache_hit,
      entry.product_id,
      entry.confidence,
      entry.result_state,
      entry.tokens_used,
      entry.api_cost_usd,
    ],
  );
}

async function getRecognitionHistory(
  pool: DbPool,
  productId: string,
  limit = 10,
): Promise<Array<{ scanned_at: Date; agent_id: string; confidence: number | null; cache_hit: boolean }>> {
  const { rows } = await pool.query(
    `SELECT created_at AS scanned_at, user_id AS agent_id, confidence, cache_hit
     FROM system.recognition_log
     WHERE product_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [productId, limit],
  );
  return rows;
}

export { appendRecognitionLog, getRecognitionHistory };
```

- [ ] **Step 8: Run instrument-features tests**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose instrument-features.spec 2>&1 | tail -15
```

Expected: PASS all 4 tests.

- [ ] **Step 9: Full test suite**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/instrument-features.ts archibald-web-app/backend/src/db/repositories/instrument-features.spec.ts archibald-web-app/backend/src/db/repositories/product-gallery.ts archibald-web-app/backend/src/db/repositories/recognition-budget.ts archibald-web-app/backend/src/db/repositories/recognition-cache.ts archibald-web-app/backend/src/db/repositories/recognition-log.ts
git commit -m "feat(recognition): DB repositories — instrument_features, product_gallery, budget, cache, log"
```

---

### Task 8: recognition/budget-service.ts

**Files:**
- Create: `archibald-web-app/backend/src/recognition/budget-service.ts`
- Create: `archibald-web-app/backend/src/recognition/budget-service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `archibald-web-app/backend/src/recognition/budget-service.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { checkBudget, getThrottleLevel } from './budget-service';
import type { DbPool } from '../db/pool';

describe('getThrottleLevel', () => {
  test('returns normal below 80%', () => {
    expect(getThrottleLevel(0, 500)).toBe('normal');
    expect(getThrottleLevel(399, 500)).toBe('normal');
  });
  test('returns warning at 80%', () => {
    expect(getThrottleLevel(400, 500)).toBe('warning');
    expect(getThrottleLevel(474, 500)).toBe('warning');
  });
  test('returns limited at 95%', () => {
    expect(getThrottleLevel(475, 500)).toBe('limited');
    expect(getThrottleLevel(500, 500)).toBe('limited');
  });
});

describe('checkBudget', () => {
  function makePool(budgetRow: object | null) {
    return {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })         // resetBudgetIfExpired
        .mockResolvedValueOnce({ rows: budgetRow ? [budgetRow] : [] }),  // getBudgetRow
    } as unknown as DbPool;
  }

  test('returns allowed=true when under daily_limit', async () => {
    const pool = makePool({ id: 1, daily_limit: 500, used_today: 100, throttle_level: 'normal', reset_at: new Date(), updated_at: new Date() });
    const result = await checkBudget(pool, 'user-1', 'agent');
    expect(result.allowed).toBe(true);
  });

  test('returns allowed=false when limited and role is not admin', async () => {
    const pool = makePool({ id: 1, daily_limit: 500, used_today: 480, throttle_level: 'limited', reset_at: new Date(), updated_at: new Date() });
    const result = await checkBudget(pool, 'user-1', 'agent');
    expect(result.allowed).toBe(false);
  });

  test('returns allowed=true when limited but role is admin', async () => {
    const pool = makePool({ id: 1, daily_limit: 500, used_today: 480, throttle_level: 'limited', reset_at: new Date(), updated_at: new Date() });
    const result = await checkBudget(pool, 'admin-1', 'admin');
    expect(result.allowed).toBe(true);
  });

  test('returns allowed=false when used_today >= daily_limit', async () => {
    const pool = makePool({ id: 1, daily_limit: 500, used_today: 500, throttle_level: 'limited', reset_at: new Date(), updated_at: new Date() });
    const result = await checkBudget(pool, 'user-1', 'agent');
    expect(result.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose budget-service.spec 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement budget-service.ts**

Create `archibald-web-app/backend/src/recognition/budget-service.ts`:

```typescript
import type { DbPool } from '../db/pool';
import type { ThrottleLevel, BudgetState } from './types';
import {
  getBudgetRow,
  resetBudgetIfExpired,
  incrementUsedToday,
} from '../db/repositories/recognition-budget';
import type { UserRole } from '../db/repositories/users';

function getThrottleLevel(usedToday: number, dailyLimit: number): ThrottleLevel {
  const pct = usedToday / dailyLimit;
  if (pct >= 0.95) return 'limited';
  if (pct >= 0.80) return 'warning';
  return 'normal';
}

type BudgetCheckResult = {
  allowed:      boolean
  budgetState:  BudgetState
};

async function checkBudget(
  pool: DbPool,
  userId: string,
  role: UserRole | string,
): Promise<BudgetCheckResult> {
  await resetBudgetIfExpired(pool);
  const row = await getBudgetRow(pool);

  if (!row) {
    return {
      allowed: false,
      budgetState: {
        dailyLimit: 500, usedToday: 0,
        throttleLevel: 'normal', resetAt: new Date(),
      },
    };
  }

  const budgetState: BudgetState = {
    dailyLimit:    row.daily_limit,
    usedToday:     row.used_today,
    throttleLevel: row.throttle_level,
    resetAt:       row.reset_at,
  };

  if (row.used_today >= row.daily_limit) {
    return { allowed: false, budgetState };
  }
  if (row.throttle_level === 'limited' && role !== 'admin') {
    return { allowed: false, budgetState };
  }
  return { allowed: true, budgetState };
}

async function consumeBudget(pool: DbPool): Promise<boolean> {
  // Returns true if budget slot was consumed, false if exhausted (rare race condition)
  const result = await incrementUsedToday(pool);
  return result !== null;
}

export { checkBudget, consumeBudget, getThrottleLevel };
```

- [ ] **Step 4: Run tests to pass**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose budget-service.spec 2>&1 | tail -15
```

Expected: PASS all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/recognition/budget-service.ts archibald-web-app/backend/src/recognition/budget-service.spec.ts
git commit -m "feat(recognition): budget service — checkBudget, getThrottleLevel, lazy reset"
```

---

### Task 9: services/anthropic-vision-service.ts

**Files:**
- Create: `archibald-web-app/backend/src/services/anthropic-vision-service.ts`

- [ ] **Step 1: Create the service**

Create `archibald-web-app/backend/src/services/anthropic-vision-service.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { InstrumentFeatures } from '../recognition/types';

const VISION_PROMPT = `You are a dental instrument identification system.
If multiple instruments are visible, analyze only the LARGEST or MOST CENTERED one.
If no dental instrument is visible, return all fields as null with confidence: 0.
Analyze the photo and extract the following features as JSON.
Be precise. If you cannot determine a field with confidence, set it to null.

SHAPE FAMILIES (choose one):
round, pear, inverted_cone, cylinder, cylinder_round_end, tapered_round_end,
tapered_flat_end, flame, torpedo, diabolo, wheel, egg, bud, double_cone, other

MATERIALS:
tungsten_carbide (silver/grey metallic with visible flutes/cross-cut)
diamond (rough grey texture, abrasive surface)
diamond_diao (ROSE GOLD color - very distinctive)
steel (bright silver, smooth)
ceramic (white/ivory)
polymer (rubber-like, various colors)
sonic_tip (metal, specific wedge/triangle shapes)
ultrasonic (very fine tips)

GRIT RING COLORS (for diamond instruments only):
white (ultra_fine), yellow (extra_fine), red (fine), blue (standard),
green (coarse), black (super_coarse), none (no visible ring)

SHANK TYPES:
fg (thin shank, ~1.6mm diameter, goes into turbine/high-speed handpiece)
ca (thicker shank, ~2.35mm, goes into contra-angle handpiece)
unknown (shank not clearly visible)

PIXEL MEASUREMENTS:
head_px: width of the instrument HEAD in pixels (the working/cutting part)
shank_px: width of the SHANK (handle part) in pixels
Measure at the widest point. Set to null if not clearly visible.

Respond with ONLY this JSON, no other text:
{
  "shape_family": "...",
  "material": "...",
  "grit_ring_color": "...",
  "shank_type": "...",
  "head_px": null,
  "shank_px": null,
  "confidence": 0.0
}`;

type VisionServiceDeps = {
  apiKey:    string
  timeoutMs: number
};

type VisionApiFn = (imageBase64: string, externalSignal?: AbortSignal) => Promise<InstrumentFeatures>;

function createVisionService(deps: VisionServiceDeps): VisionApiFn {
  const client = new Anthropic({ apiKey: deps.apiKey });

  return async function callVisionApi(imageBase64: string, externalSignal?: AbortSignal): Promise<InstrumentFeatures> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs);

    // Propaga abort esterno (client disconnect)
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await client.messages.create(
        {
          model:      'claude-haiku-4-5',
          max_tokens: 256,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type:   'image',
                  source: {
                    type:       'base64',
                    media_type: 'image/jpeg',
                    data:       imageBase64,
                  },
                },
                { type: 'text', text: VISION_PROMPT },
              ],
            },
          ],
        },
        { signal: controller.signal },
      );

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const parsed = JSON.parse(text) as InstrumentFeatures;
      return parsed;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  };
}

export { createVisionService };
export type { VisionApiFn };
```

- [ ] **Step 2: TypeScript check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/services/anthropic-vision-service.ts
git commit -m "feat(recognition): Anthropic Vision service wrapper with 15s AbortController"
```

---

### Task 10: recognition/recognition-engine.ts

**Files:**
- Create: `archibald-web-app/backend/src/recognition/recognition-engine.ts`
- Create: `archibald-web-app/backend/src/recognition/recognition-engine.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `archibald-web-app/backend/src/recognition/recognition-engine.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { buildRecognitionResult, runRecognitionPipeline } from './recognition-engine';
import type { LookupRow } from '../db/repositories/instrument-features';

const BASE_FEATURES = {
  shape_family: 'round', material: 'diamond_diao',
  grit_ring_color: 'green', shank_type: 'fg' as const,
  head_px: 100, shank_px: 160, confidence: 0.95,
};

function row(id: string, size: number): LookupRow {
  return { product_id: id, head_size_mm: size, name: `Product ${id}`, image_url: null };
}

describe('buildRecognitionResult', () => {
  test('returns match when exactly 1 candidate and confidence ≥ 0.9', () => {
    const result = buildRecognitionResult([row('KP6801.314.016', 1.6)], BASE_FEATURES, 1.6);
    expect(result.state).toBe('match');
    if (result.state === 'match') {
      expect(result.product.productId).toBe('KP6801.314.016');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  test('returns shortlist when 2-4 candidates', () => {
    const candidates = [row('A.314.014', 1.4), row('A.314.016', 1.6), row('A.314.018', 1.8)];
    const result = buildRecognitionResult(candidates, BASE_FEATURES, 1.6);
    expect(result.state).toBe('shortlist');
    if (result.state === 'shortlist') {
      expect(result.candidates).toHaveLength(3);
    }
  });

  test('returns filter_needed when >4 candidates', () => {
    const candidates = Array.from({ length: 5 }, (_, i) => row(`A.314.01${i}`, 1 + i * 0.2));
    const result = buildRecognitionResult(candidates, BASE_FEATURES, null);
    expect(result.state).toBe('filter_needed');
  });

  test('returns filter_needed when calc_size is null (shank not visible)', () => {
    const result = buildRecognitionResult([row('A.314.016', 1.6)], BASE_FEATURES, null);
    expect(result.state).toBe('filter_needed');
  });

  test('returns not_found when 0 candidates', () => {
    const result = buildRecognitionResult([], BASE_FEATURES, 1.6);
    expect(result.state).toBe('not_found');
  });
});

const BASE64  = 'AAAA'; // dummy base64 for pipeline tests
const USER_ID = 'user-test';

function makeDeps(overrides: Partial<{
  callVisionApi: ReturnType<typeof vi.fn>;
  appendRecognitionLog: ReturnType<typeof vi.fn>;
}>) {
  return {
    pool: {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // getCached miss
        .mockResolvedValueOnce({ rows: [] }) // resetBudgetIfExpired
        .mockResolvedValueOnce({ rows: [] }) // getBudgetRow → budget_exhausted
    } as unknown as import('../db/pool').DbPool,
    callVisionApi: overrides.callVisionApi ?? vi.fn(),
    appendRecognitionLog: overrides.appendRecognitionLog ?? vi.fn(),
  };
}

describe('runRecognitionPipeline', () => {
  test('non scrive recognition_log quando callVisionApi lancia', async () => {
    const error = new Error('Anthropic timeout');
    const deps = makeDeps({ callVisionApi: vi.fn().mockRejectedValue(error) });
    await runRecognitionPipeline(deps, BASE64, USER_ID, 'agent');
    expect(deps.appendRecognitionLog).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose recognition-engine.spec 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement recognition-engine.ts**

Create `archibald-web-app/backend/src/recognition/recognition-engine.ts`:

```typescript
import { createHash } from 'crypto';
import type { DbPool } from '../db/pool';
import type { InstrumentFeatures, RecognitionResult, ProductMatch, FilterQuestion, BudgetState } from './types';
import { checkBudget, consumeBudget } from './budget-service';
import { getCached, setCached } from '../db/repositories/recognition-cache';
import { lookupByFeatures } from '../db/repositories/instrument-features';
import { appendRecognitionLog } from '../db/repositories/recognition-log';
import { calculateHeadSizeMm } from './komet-code-parser';
import type { VisionApiFn } from '../services/anthropic-vision-service';
import type { UserRole } from '../db/repositories/users';
import { logger } from '../logger';

type EngineResult = {
  result:          RecognitionResult
  budgetState:     BudgetState
  processingMs:    number
  imageHash:       string
  broadCandidates: ProductMatch[]
};

type EngineDeps = {
  pool:          DbPool
  callVisionApi: VisionApiFn
};

function mapToProductMatch(row: { product_id: string; head_size_mm: number; name: string; image_url: string | null }, baseConfidence: number): ProductMatch {
  const parts = row.product_id.split('.');
  return {
    productId:    row.product_id,
    productName:  row.name,
    familyCode:   parts[0] ?? '',
    headSizeMm:   row.head_size_mm,
    shankType:    row.shank_type,
    thumbnailUrl: row.image_url,
    confidence:   baseConfidence,
  };
}

function buildRecognitionResult(
  candidates: Array<{ product_id: string; head_size_mm: number; name: string; image_url: string | null }>,
  features: InstrumentFeatures,
  calcSizeMm: number | null,
): RecognitionResult {
  if (candidates.length === 0) {
    return { state: 'not_found', extractedFeatures: features };
  }

  if (calcSizeMm === null || candidates.length > 4) {
    const question: FilterQuestion = {
      field:   'head_size_mm',
      prompt:  'Che diametro vedi?',
      options: [
        { label: 'Piccola ≤ Ø1.2mm', value: 'small' },
        { label: 'Media Ø1.4–1.8mm', value: 'medium' },
        { label: 'Grande ≥ Ø2.0mm',  value: 'large' },
        { label: 'Non so',            value: 'unknown' },
      ],
    };
    return { state: 'filter_needed', extractedFeatures: features, question };
  }

  if (candidates.length === 1 && features.confidence >= 0.9) {
    return {
      state:      'match',
      product:    mapToProductMatch(candidates[0]!, features.confidence),
      confidence: features.confidence,
    };
  }

  return {
    state:             'shortlist',
    candidates:        candidates.map((c, i) => mapToProductMatch(c, Math.max(0.3, features.confidence - i * 0.08))),
    extractedFeatures: features,
  };
}

async function runRecognitionPipeline(
  deps: EngineDeps,
  imageBase64: string,
  userId: string,
  role: UserRole | string,
  signal?: AbortSignal,
): Promise<EngineResult> {
  const startMs = Date.now();

  // Step 2: hash image
  const imageHash = createHash('sha256')
    .update(Buffer.from(imageBase64, 'base64'))
    .digest('hex');

  // Step 3: cache lookup
  const cached = await getCached(deps.pool, imageHash);
  if (cached) {
    const { allowed, budgetState } = await checkBudget(deps.pool, userId, role);
    await appendRecognitionLog(deps.pool, {
      user_id: userId, image_hash: imageHash, cache_hit: true,
      product_id: cached.product_id,
      confidence: cached.confidence,
      result_state: (cached.result_json as RecognitionResult).state === 'budget_exhausted' ? 'error' : (cached.result_json as RecognitionResult).state,
      tokens_used: null, api_cost_usd: null,
    }).catch(() => {});
    void allowed;
    return {
      result:          cached.result_json as RecognitionResult,
      budgetState,
      processingMs:    Date.now() - startMs,
      imageHash,
      broadCandidates: [],   // cache hit — no broad lookup needed
    };
  }

  // Step 4: budget check
  const { allowed, budgetState } = await checkBudget(deps.pool, userId, role);
  if (!allowed) {
    return {
      result:          { state: 'budget_exhausted' },
      budgetState,
      processingMs:    Date.now() - startMs,
      imageHash,
      broadCandidates: [],
    };
  }

  // Step 5: Vision API
  let features: InstrumentFeatures;
  try {
    features = await deps.callVisionApi(imageBase64, signal);
  } catch (err) {
    logger.warn('[recognition-engine] Vision API error', { error: err });
    return {
      result:          { state: 'error', message: 'Servizio di riconoscimento temporaneamente non disponibile' },
      budgetState,
      processingMs:    Date.now() - startMs,
      imageHash,
      broadCandidates: [],
    };
  }

  // Step 6: measure head size from pixel ratio
  const calcSizeMm = (features.head_px && features.shank_px)
    ? calculateHeadSizeMm(features.head_px, features.shank_px, features.shank_type)
    : null;

  // Step 7: DB lookup (with head_size_mm filter when measureable)
  const candidates = await lookupByFeatures(deps.pool, {
    shape_family:    features.shape_family,
    material:        features.material,
    grit_ring_color: features.grit_ring_color,
    shank_type:      features.shank_type ?? 'fg',
    calc_size_mm:    calcSizeMm,
  });

  // Step 7b: Broad lookup (no head_size_mm filter) — for "Non è questo →" in State 3A
  const broadRows = await lookupByFeatures(deps.pool, {
    shape_family:    features.shape_family,
    material:        features.material,
    grit_ring_color: features.grit_ring_color,
    shank_type:      features.shank_type ?? 'fg',
    calc_size_mm:    null,
  }, 10);
  const broadCandidates: ProductMatch[] = broadRows.map((row, i) =>
    mapToProductMatch(row, Math.max(0.3, features.confidence - i * 0.06))
  );

  // Step 8: adaptive decision
  const result = buildRecognitionResult(candidates, features, calcSizeMm);

  // Step 9: save cache + atomic budget increment + log
  await setCached(deps.pool, imageHash, result, Buffer.from(imageBase64, 'base64'));
  const budgetConsumed = await consumeBudget(deps.pool);
  if (!budgetConsumed) {
    // Rare race: budget exhausted between checkBudget and consumeBudget.
    // Vision API was already called. Log and return result anyway (API was paid for).
    logger.warn('[recognition-engine] Budget race condition: consumed after exhaustion', { userId });
  }
  await appendRecognitionLog(deps.pool, {
    user_id:      userId,
    image_hash:   imageHash,
    cache_hit:    false,
    product_id:   result.state === 'match' ? result.product.productId : null,
    confidence:   result.state === 'match' ? result.confidence : null,
    result_state: result.state === 'budget_exhausted' ? 'error' : result.state,
    tokens_used:  null,
    api_cost_usd: null,
  }).catch(() => {});

  return { result, budgetState, processingMs: Date.now() - startMs, imageHash, broadCandidates };
}

export { runRecognitionPipeline, buildRecognitionResult };
```

- [ ] **Step 4: Run tests**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose recognition-engine.spec 2>&1 | tail -15
```

Expected: PASS all 5 tests.

- [ ] **Step 5: Full test suite**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/recognition/recognition-engine.ts archibald-web-app/backend/src/recognition/recognition-engine.spec.ts
git commit -m "feat(recognition): recognition engine — 9-step pipeline, adaptive decision, cache+budget"
```

---

### Task 11: BullMQ handler — komet-code-parser

**Files:**
- Create: `archibald-web-app/backend/src/operations/handlers/komet-code-parser.ts`
- Create: `archibald-web-app/backend/src/operations/handlers/komet-code-parser.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `archibald-web-app/backend/src/operations/handlers/komet-code-parser.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { createKometCodeParserHandler } from './komet-code-parser';
import type { DbPool } from '../../db/pool';

describe('createKometCodeParserHandler', () => {
  test('processes all products and skips unknown families', async () => {
    const mockProducts = [
      { id: 'H1.314.016', name: 'TC Round FG 1.6' },
      { id: 'ZZZ.314.016', name: 'Unknown Family' },
      { id: 'KP6801.314.018', name: 'DIAO Round FG 1.8' },
    ];
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: mockProducts })   // getAllProducts
        .mockResolvedValue({ rows: [] }),                // upsertInstrumentFeatures (× 2)
    } as unknown as DbPool;

    const handler = createKometCodeParserHandler({ pool: mockPool });
    const result = await handler(null as any, {}, 'service-account', vi.fn());

    expect(result).toEqual({ processed: 2, skipped: 1, total: 3 });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose komet-code-parser.spec.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement handler**

Create `archibald-web-app/backend/src/operations/handlers/komet-code-parser.ts`:

```typescript
import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { parseKometCode } from '../../recognition/komet-code-parser';
import { upsertInstrumentFeatures, countUnmappedProducts } from '../../db/repositories/instrument-features';
import { logger } from '../../logger';

type KometCodeParserDeps = {
  pool: DbPool;
};

function createKometCodeParserHandler(deps: KometCodeParserDeps): OperationHandler {
  const { pool } = deps;

  return async (_context, _data, _userId, onProgress) => {
    onProgress(0, 'Caricamento prodotti...');

    const { rows: products } = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM shared.products WHERE id LIKE '%.%.%' ORDER BY id`,
    );

    let processed = 0;
    let skipped   = 0;
    const total   = products.length;

    for (let i = 0; i < products.length; i++) {
      const product = products[i]!;
      const features = parseKometCode(product.id);

      if (!features) {
        skipped++;
        continue;
      }

      await upsertInstrumentFeatures(pool, {
        product_id:        product.id,
        shape_family:      features.shape_family,
        material:          features.material,
        grit_ring_color:   features.grit_ring_color,
        shank_type:        features.shank_type,
        shank_diameter_mm: features.shank_diameter_mm,
        head_size_code:    features.head_size_code,
        head_size_mm:      features.head_size_mm,
        family_code:       features.family_code,
      });
      processed++;

      if (i % 50 === 0) {
        onProgress(Math.floor((i / total) * 100), `${i}/${total} prodotti processati`);
      }
    }

    const unmapped = await countUnmappedProducts(pool);
    logger.info('[komet-code-parser] Completed', { processed, skipped, total, unmapped });

    return { processed, skipped, total };
  };
}

export { createKometCodeParserHandler };
```

- [ ] **Step 4: Run tests**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose "handlers/komet-code-parser.spec" 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/komet-code-parser.ts archibald-web-app/backend/src/operations/handlers/komet-code-parser.spec.ts
git commit -m "feat(recognition): BullMQ handler komet-code-parser — parses all shared.products codes"
```

---

### Task 12: BullMQ handler — komet-web-scraper

**Files:**
- Create: `archibald-web-app/backend/src/operations/handlers/komet-web-scraper.ts`
- Create: `archibald-web-app/backend/src/operations/handlers/komet-web-scraper.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `archibald-web-app/backend/src/operations/handlers/komet-web-scraper.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { buildKometImageUrl } from './komet-web-scraper';

describe('buildKometImageUrl', () => {
  test('builds correct URL for H1.314.016', () => {
    const url = buildKometImageUrl('H1.314.016');
    expect(url).toBe('https://www.kometdental.com/uploads/03di_H1_314_016_450.png');
  });

  test('builds correct URL for KP6801.314.018', () => {
    const url = buildKometImageUrl('KP6801.314.018');
    expect(url).toBe('https://www.kometdental.com/uploads/03di_KP6801_314_018_450.png');
  });

  test('returns null for malformed product id', () => {
    expect(buildKometImageUrl('H1314016')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose "handlers/komet-web-scraper.spec" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement handler**

Create `archibald-web-app/backend/src/operations/handlers/komet-web-scraper.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { insertGalleryImage } from '../../db/repositories/product-gallery';
import { logger } from '../../logger';

type KometWebScraperDeps = {
  pool:           DbPool;
  assetsDir?:     string;  // default: /app/assets/product-images
  fetchFn?:       typeof fetch;   // injectable for tests
};

const KOMET_USER_AGENT = 'Mozilla/5.0 (compatible; ArchibaldBot/1.0)';
const RATE_LIMIT_MS    = 500; // 2 req/s max

function buildKometImageUrl(productId: string): string | null {
  const parts = productId.split('.');
  if (parts.length !== 3) return null;
  const [family, shank, size] = parts;
  return `https://www.kometdental.com/uploads/03di_${family}_${shank}_${size}_450.png`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createKometWebScraperHandler(deps: KometWebScraperDeps): OperationHandler {
  const { pool } = deps;
  const assetsDir = deps.assetsDir ?? '/app/assets/product-images';
  const fetchFn   = deps.fetchFn ?? fetch;

  return async (_context, _data, _userId, onProgress) => {
    onProgress(0, 'Caricamento lista prodotti...');

    const { rows: products } = await pool.query<{ id: string }>(
      `SELECT id FROM shared.products WHERE id LIKE '%.%.%' ORDER BY id`,
    );

    let downloaded = 0;
    let skipped    = 0;
    let errors     = 0;
    const total    = products.length;

    for (let i = 0; i < products.length; i++) {
      const productId = products[i]!.id;
      const imageUrl  = buildKometImageUrl(productId);
      if (!imageUrl) { skipped++; continue; }

      try {
        const headRes = await fetchFn(imageUrl, {
          method:  'HEAD',
          headers: { 'User-Agent': KOMET_USER_AGENT },
        });

        if (headRes.status === 404) { skipped++; await sleep(RATE_LIMIT_MS); continue; }
        if (headRes.status === 403 || headRes.status === 429) {
          logger.warn('[komet-web-scraper] Rate limited by kometdental.com, stopping', { status: headRes.status });
          break;
        }
        if (!headRes.ok) { skipped++; await sleep(RATE_LIMIT_MS); continue; }

        // Download image
        const imgRes = await fetchFn(imageUrl, {
          headers: { 'User-Agent': KOMET_USER_AGENT },
        });
        if (!imgRes.ok) { skipped++; await sleep(RATE_LIMIT_MS); continue; }

        const buffer   = Buffer.from(await imgRes.arrayBuffer());
        const localDir = path.join(assetsDir, productId.replace(/\./g, '/'));
        fs.mkdirSync(localDir, { recursive: true });
        const localPath = path.join(localDir, 'white_bg.png');
        fs.writeFileSync(localPath, buffer);

        await insertGalleryImage(pool, {
          product_id: productId,
          image_url:  imageUrl,
          local_path: localPath,
          image_type: 'instrument_white_bg',
          source:     'kometdental.com',
          file_size:  buffer.length,
        });

        downloaded++;
      } catch (err) {
        logger.warn('[komet-web-scraper] Error for product', { productId, error: err });
        errors++;
      }

      if (i % 20 === 0) {
        onProgress(Math.floor((i / total) * 100), `${i}/${total} prodotti elaborati`);
      }
      await sleep(RATE_LIMIT_MS);
    }

    return { downloaded, skipped, errors, total };
  };
}

export { createKometWebScraperHandler, buildKometImageUrl };
```

- [ ] **Step 4: Run tests**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose "handlers/komet-web-scraper.spec" 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/komet-web-scraper.ts archibald-web-app/backend/src/operations/handlers/komet-web-scraper.spec.ts
git commit -m "feat(recognition): BullMQ handler komet-web-scraper — downloads product images from kometdental.com"
```

---

### Task 13: BullMQ handler — recognition-feedback

**Files:**
- Create: `archibald-web-app/backend/src/operations/handlers/recognition-feedback.ts`

- [ ] **Step 1: Implement handler**

Create `archibald-web-app/backend/src/operations/handlers/recognition-feedback.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { getImageDataFromCache } from '../../db/repositories/recognition-cache';
import { insertGalleryImage } from '../../db/repositories/product-gallery';
import { logger } from '../../logger';

type RecognitionFeedbackData = {
  imageHash: string;
  productId: string;
  userId:    string;
};

type RecognitionFeedbackDeps = {
  pool:       DbPool;
  assetsDir?: string;
  sharpFn?:   (buf: Buffer) => Promise<Buffer>;  // injectable; default uses sharp
};

async function defaultResize(buf: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(buf).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
}

function createRecognitionFeedbackHandler(deps: RecognitionFeedbackDeps): OperationHandler {
  const { pool } = deps;
  const assetsDir = deps.assetsDir ?? '/app/assets/product-images';
  const resizeFn  = deps.sharpFn  ?? defaultResize;

  return async (_context, data, _userId, onProgress) => {
    const { imageHash, productId, userId } = data as unknown as RecognitionFeedbackData;

    onProgress(0, 'Recupero immagine dalla cache...');
    const imageBuffer = await getImageDataFromCache(pool, imageHash);
    if (!imageBuffer) {
      logger.warn('[recognition-feedback] Image not in cache, skipping', { imageHash });
      return { queued: false };
    }

    onProgress(30, 'Ridimensionamento immagine...');
    const resized = await resizeFn(imageBuffer);

    const localDir = path.join(assetsDir, productId.replace(/\./g, '/'), 'field');
    fs.mkdirSync(localDir, { recursive: true });
    const filename  = `${Date.now()}_${userId.slice(0, 8)}.jpg`;
    const localPath = path.join(localDir, filename);
    fs.writeFileSync(localPath, resized);

    onProgress(70, 'Salvataggio in gallery...');
    const imageUrl = `/assets/product-images/${productId.replace(/\./g, '/')}/field/${filename}`;
    await insertGalleryImage(pool, {
      product_id: productId,
      image_url:  imageUrl,
      local_path: localPath,
      image_type: 'field_scan',
      source:     `agent:${userId}`,
      file_size:  resized.length,
    });

    onProgress(100, 'Immagine salvata in gallery');
    return { queued: true };
  };
}

export { createRecognitionFeedbackHandler };
```

- [ ] **Step 2: TypeScript check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/recognition-feedback.ts
git commit -m "feat(recognition): BullMQ handler recognition-feedback — saves field scan to product gallery"
```

---

### Task 14: routes/recognition.ts

**Files:**
- Create: `archibald-web-app/backend/src/routes/recognition.ts`
- Create: `archibald-web-app/backend/src/routes/recognition.spec.ts`

- [ ] **Step 1: Write failing integration tests**

Create `archibald-web-app/backend/src/routes/recognition.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createRecognitionRouter } from './recognition';
import type { DbPool } from '../db/pool';

function makeApp(callVisionApi: any, pool: DbPool) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // Mock auth middleware
  app.use((req: any, _res, next) => {
    req.user = { userId: 'test-user', role: 'agent', username: 'test' };
    next();
  });
  app.use('/api/recognition', createRecognitionRouter({ pool, callVisionApi, dailyLimit: 500, timeoutMs: 15000 }));
  return app;
}

// 1x1 JPEG base64
const TINY_IMAGE = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH'
  + 'BwYIDAoMCwsKCwsNCxAQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAARC'
  + 'AABAAEDASIA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAA'
  + 'AAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9k=';

describe('POST /api/recognition/identify', () => {
  test('returns budget_exhausted when budget row is missing', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })   // resetBudgetIfExpired
        .mockResolvedValueOnce({ rows: [] })   // getCached (cache miss)
        .mockResolvedValueOnce({ rows: [] }),  // getBudgetRow (missing)
    } as unknown as DbPool;
    const app = makeApp(vi.fn(), pool);

    const res = await request(app)
      .post('/api/recognition/identify')
      .send({ image: TINY_IMAGE });

    expect(res.status).toBe(200);
    expect(res.body.result.state).toBe('budget_exhausted');
    expect(res.body.imageHash).toBeDefined();
    expect(res.body.broadCandidates).toEqual([]);
  });

  test('returns 429 when rate limit exceeded', async () => {
    const pool = { query: vi.fn() } as unknown as DbPool;
    const app = makeApp(vi.fn(), pool);
    // Make 11 requests (limit is 10/min)
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/recognition/identify').send({ image: TINY_IMAGE });
    }
    const res = await request(app).post('/api/recognition/identify').send({ image: TINY_IMAGE });
    expect(res.status).toBe(429);
  });
  // NOTA: ogni app creata con makeApp ha il proprio rateLimitMap (isolamento per-istanza).

  test('returns 400 when image is missing', async () => {
    const pool = { query: vi.fn() } as unknown as DbPool;
    const app = makeApp(vi.fn(), pool);
    const res = await request(app).post('/api/recognition/identify').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/recognition/budget', () => {
  test('returns budget state', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })  // resetBudgetIfExpired
        .mockResolvedValueOnce({ rows: [{ id: 1, daily_limit: 500, used_today: 50, throttle_level: 'normal', reset_at: new Date(), updated_at: new Date() }] }),
    } as unknown as DbPool;
    const app = makeApp(vi.fn(), pool);
    const res = await request(app).get('/api/recognition/budget');
    expect(res.status).toBe(200);
    expect(res.body.dailyLimit).toBe(500);
    expect(res.body.usedToday).toBe(50);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose recognition.spec 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement recognition route**

Create `archibald-web-app/backend/src/routes/recognition.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import type { VisionApiFn } from '../services/anthropic-vision-service';
import type { OperationType } from '../operations/operation-types';
import { runRecognitionPipeline } from '../recognition/recognition-engine';
import { getBudgetRow, resetBudgetIfExpired } from '../db/repositories/recognition-budget';
import { logger } from '../logger';

type RecognitionRouterDeps = {
  pool:          DbPool;
  callVisionApi: VisionApiFn;
  dailyLimit:    number;
  timeoutMs:     number;
  queue?: {
    enqueue: (type: OperationType, userId: string, data: Record<string, unknown>) => Promise<string>;
  };
};

const identifySchema = z.object({
  image: z.string().min(10),
});

const feedbackSchema = z.object({
  imageHash:       z.string().regex(/^[0-9a-f]{64}$/, 'imageHash must be a 64-character hex string'),
  productId:       z.string().min(1),
  confirmedByUser: z.boolean(),
});

function createRecognitionRouter(deps: RecognitionRouterDeps) {
  const router = Router();
  const { pool, callVisionApi } = deps;

  // Rate limiter per-istanza (garantisce isolamento nei test)
  const rateLimitMap = new Map<string, number[]>();
  const RATE_LIMIT_MAX       = 10;
  const RATE_LIMIT_WINDOW_MS = 60_000;

  function isRateLimited(userId: string): boolean {
    const now = Date.now();
    const timestamps = (rateLimitMap.get(userId) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    timestamps.push(now);
    rateLimitMap.set(userId, timestamps);
    return timestamps.length > RATE_LIMIT_MAX;
  }

  router.post('/identify', async (req: AuthRequest, res) => {
    const parsed = identifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'image field required (base64 string)' });
      return;
    }

    const userId = req.user!.userId;
    const role   = req.user!.role;

    // Rate limiting: 10 req/min per user
    if (isRateLimited(userId)) {
      res.status(429).json({ error: 'Troppe richieste. Attendi un minuto.' });
      return;
    }

    const { image } = parsed.data;

    // Abort if client disconnects before response
    const abortController = new AbortController();
    req.on('close', () => {
      if (!res.headersSent) abortController.abort();
    });

    try {
      const { result, budgetState, processingMs, imageHash, broadCandidates } =
        await runRecognitionPipeline(
          { pool, callVisionApi },
          image,
          userId,
          role,
          abortController.signal,
        );
      if (res.headersSent) return; // Client disconnected
      res.json({ result, budgetState, processingMs, imageHash, broadCandidates });
    } catch (error) {
      if (res.headersSent) return;
      logger.error('[recognition] identify failed', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/feedback', async (req: AuthRequest, res) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'imageHash (64 hex chars), productId, confirmedByUser required' });
      return;
    }

    const { imageHash, productId, confirmedByUser } = parsed.data;
    const userId = req.user!.userId;

    if (!confirmedByUser) {
      res.json({ queued: false });
      return;
    }

    if (deps.queue) {
      await deps.queue.enqueue('recognition-feedback', userId, { imageHash, productId, userId });
      res.json({ queued: true });
    } else {
      res.json({ queued: false });
    }
  });

  router.get('/budget', async (_req: AuthRequest, res) => {
    try {
      await resetBudgetIfExpired(pool);
      const row = await getBudgetRow(pool);
      if (!row) {
        res.json({ dailyLimit: deps.dailyLimit, usedToday: 0, throttleLevel: 'normal' });
        return;
      }
      res.json({
        dailyLimit:    row.daily_limit,
        usedToday:     row.used_today,
        throttleLevel: row.throttle_level,
        resetAt:       row.reset_at,
      });
    } catch (error) {
      logger.error('[recognition] get budget failed', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export { createRecognitionRouter };
export type { RecognitionRouterDeps };
```

- [ ] **Step 4: Run tests**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose recognition.spec 2>&1 | tail -15
```

Expected: PASS all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/recognition.ts archibald-web-app/backend/src/routes/recognition.spec.ts
git commit -m "feat(recognition): POST /identify, POST /feedback, GET /budget route"
```

---

### Task 15: Extend products route — GET /:productId/enrichment

**Files:**
- Modify: `archibald-web-app/backend/src/routes/products.ts`

- [ ] **Step 1: Add deps to ProductsRouterDeps and add route**

In `archibald-web-app/backend/src/routes/products.ts`, add to `ProductsRouterDeps` type:

```typescript
  getInstrumentFeatures?: (productId: string) => Promise<import('../db/repositories/instrument-features').InstrumentFeatureRow | null>;
  getProductGallery?: (productId: string) => Promise<import('../db/repositories/product-gallery').GalleryRow[]>;
  getRecognitionHistory?: (productId: string, limit: number) => Promise<Array<{ scanned_at: Date; agent_id: string; confidence: number | null; cache_hit: boolean }>>;
  getProductVariantsForEnrichment?: (articleName: string) => Promise<import('../db/repositories/products').ProductRow[]>;
  getProductDetails?: (productId: string) => Promise<import('../db/repositories/product-details').ProductDetailsRow | null>;
```

Add `import { getProductDetails } from '../db/repositories/product-details';` to the imports.

Add the following repository function to `archibald-web-app/backend/src/db/repositories/product-details.ts`:

```typescript
import type { DbPool } from '../pool';

type ProductDetailsRow = {
  product_id:       string
  description_html: string | null
  video_url:        string | null
  manual_url:       string | null
  updated_at:       Date
};

async function getProductDetails(pool: DbPool, productId: string): Promise<ProductDetailsRow | null> {
  const { rows } = await pool.query<ProductDetailsRow>(
    `SELECT product_id, description_html, video_url, manual_url, updated_at
       FROM shared.product_details
      WHERE product_id = $1`,
    [productId],
  );
  return rows[0] ?? null;
}

export { getProductDetails };
export type { ProductDetailsRow };
```

Add after the existing `router.get('/:productId/changes', ...)` block:

```typescript
  router.get('/:productId/enrichment', async (req: AuthRequest, res) => {
    const { productId } = req.params;
    try {
      const [features, gallery, history, details] = await Promise.all([
        deps.getInstrumentFeatures ? deps.getInstrumentFeatures(productId) : Promise.resolve(null),
        deps.getProductGallery     ? deps.getProductGallery(productId)     : Promise.resolve([]),
        deps.getRecognitionHistory ? deps.getRecognitionHistory(productId, 10) : Promise.resolve([]),
        deps.getProductDetails     ? deps.getProductDetails(productId)     : Promise.resolve(null),
      ]);

      let sizeVariants: ReturnType<typeof mapProductRow>[] = [];
      if (deps.getProductVariantsForEnrichment && deps.getProductById) {
        const product = await deps.getProductById(productId);
        if (product?.name) {
          const variants = await deps.getProductVariantsForEnrichment(product.name);
          sizeVariants = variants.map(mapProductRow);
        }
      }

      res.json({
        features,
        gallery,
        details,
        competitors: [],
        sizeVariants,
        recognitionHistory: history.length > 0 ? history.map((h) => ({
          scannedAt:  h.scanned_at,
          agentId:    h.agent_id,
          confidence: h.confidence,
          cacheHit:   h.cache_hit,
        })) : null,
      });
    } catch (error) {
      logger.error('Failed to fetch product enrichment', { productId, error });
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

- [ ] **Step 2: TypeScript check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Full test suite**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/routes/products.ts
git commit -m "feat(recognition): add GET /api/products/:productId/enrichment with PKB data"
```

---

### Task 16: Wire everything — handlers/index + server.ts + main.ts + sync-scheduler

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/index.ts`
- Modify: `archibald-web-app/backend/src/server.ts`
- Modify: `archibald-web-app/backend/src/main.ts`
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts`

- [ ] **Step 1: Export new handlers from handlers/index.ts**

Add to end of `archibald-web-app/backend/src/operations/handlers/index.ts`:

```typescript
export { createKometCodeParserHandler } from './komet-code-parser';
export { createKometWebScraperHandler } from './komet-web-scraper';
export { createRecognitionFeedbackHandler } from './recognition-feedback';
```

- [ ] **Step 2: Add callVisionApi to AppDeps in server.ts**

In `archibald-web-app/backend/src/server.ts`, import new dependencies and update `AppDeps`:

After the existing imports, add:
```typescript
import { createRecognitionRouter } from './routes/recognition';
import type { VisionApiFn } from './services/anthropic-vision-service';
import * as instrumentFeaturesRepo from './db/repositories/instrument-features';
import * as productGalleryRepo from './db/repositories/product-gallery';
import * as recognitionLogRepo from './db/repositories/recognition-log';
import { getProductDetails } from './db/repositories/product-details';
```

In `AppDeps` type, add:
```typescript
  callVisionApi?: VisionApiFn;
  recognitionDailyLimit?: number;
  recognitionTimeoutMs?:  number;
```

In `createApp`, where routes are mounted (near the other `app.use('/api/...')` calls), add:
```typescript
  if (deps.callVisionApi) {
    const recognitionRouter = createRecognitionRouter({
      pool,
      callVisionApi: deps.callVisionApi,
      dailyLimit:    deps.recognitionDailyLimit ?? 500,
      timeoutMs:     deps.recognitionTimeoutMs  ?? 15000,
      queue:         multiQueueFacade,
    });
    app.use('/api/recognition', requireAuth, recognitionRouter);
  }
```

In the `createProductsRouter` deps call (where the products router is instantiated), add the new optional deps:
```typescript
    getInstrumentFeatures:          (productId) => pool.query(`SELECT * FROM shared.instrument_features WHERE product_id = $1`, [productId]).then((r) => r.rows[0] ?? null),
    getProductGallery:              (productId) => productGalleryRepo.getGalleryByProduct(pool, productId),
    getRecognitionHistory:          (productId, limit) => recognitionLogRepo.getRecognitionHistory(pool, productId, limit),
    getProductVariantsForEnrichment: (name) => productsRepo.getProductVariants(pool, name),
    getProductDetails:              (productId) => getProductDetails(pool, productId),
```

- [ ] **Step 3: Wire handlers and vision service in main.ts**

In `archibald-web-app/backend/src/main.ts`, add imports:
```typescript
import { createVisionService } from './services/anthropic-vision-service';
import {
  createKometCodeParserHandler,
  createKometWebScraperHandler,
  createRecognitionFeedbackHandler,
} from './operations/handlers';
```

Add after the existing handler instantiations:
```typescript
  const kometCodeParserHandler    = createKometCodeParserHandler({ pool });
  const kometWebScraperHandler    = createKometWebScraperHandler({ pool });
  const recognitionFeedbackHandler = createRecognitionFeedbackHandler({ pool });
```

Add to the `handlers` record:
```typescript
  'komet-code-parser':    kometCodeParserHandler,
  'komet-web-scraper':    kometWebScraperHandler,
  'recognition-feedback': recognitionFeedbackHandler,
```

Create the vision service (add after pool/redis setup):
```typescript
  const callVisionApi = config.recognition.anthropicApiKey
    ? createVisionService({
        apiKey:    config.recognition.anthropicApiKey,
        timeoutMs: config.recognition.timeoutMs,
      })
    : undefined;
```

Add to `createApp` call:
```typescript
    callVisionApi,
    recognitionDailyLimit: config.recognition.dailyLimit,
    recognitionTimeoutMs:  config.recognition.timeoutMs,
```

- [ ] **Step 4: Add cache cleanup to sync-scheduler**

In `archibald-web-app/backend/src/sync/sync-scheduler.ts`:

Add new parameter type after `CheckRemindersFn`:
```typescript
type DeleteExpiredCacheFn = () => Promise<number>;
```

Add `deleteExpiredRecognitionCache?: DeleteExpiredCacheFn` as the 7th parameter to `createSyncScheduler`.

In the cleanup interval block (around line 150), add after the `deleteExpiredNotifications` block:
```typescript
    if (deleteExpiredRecognitionCache) {
      timers.push(
        setInterval(() => {
          deleteExpiredRecognitionCache().catch((error) => {
            logger.error('Failed to delete expired recognition cache', { error });
          });
        }, CLEANUP_INTERVAL_MS),
      );
    }
```

In `main.ts`, update the `createSyncScheduler` call to pass the 7th argument:
```typescript
    () => deleteExpiredNotifications(pool),
    async (userId: string) => { /* existing reminders logic */ },
    () => import('./db/repositories/recognition-cache').then((m) => m.deleteExpiredCache(pool)),
```

- [ ] **Step 5: TypeScript check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 6: Full test suite**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/index.ts archibald-web-app/backend/src/server.ts archibald-web-app/backend/src/main.ts archibald-web-app/backend/src/sync/sync-scheduler.ts
git commit -m "feat(recognition): wire all handlers, routes, vision service into main + cleanup in scheduler"
```

---

### Task 17: E2E — add ANTHROPIC_API_KEY to .env.production and trigger code parser

> This task is done once on the VPS after deploy. Not automated — manual step.

- [ ] **Step 1: Add env vars to .env.production on VPS**

```bash
# On VPS (via SSH):
echo "ANTHROPIC_API_KEY=your_key_here" >> /home/deploy/archibald-app/.env.production
echo "RECOGNITION_DAILY_LIMIT=500"    >> /home/deploy/archibald-app/.env.production
echo "RECOGNITION_TIMEOUT_MS=15000"   >> /home/deploy/archibald-app/.env.production
```

- [ ] **Step 2: Run migration 050 on production**

```bash
# Via SSH + docker:
docker compose -f /home/deploy/archibald-app/docker-compose.yml exec -T backend node -e "
  const { runMigrations, loadMigrationFiles } = require('./dist/db/migrate');
  const { createPool } = require('./dist/db/pool');
  const { config } = require('./dist/config');
  const pool = createPool(config.database);
  loadMigrationFiles('./dist/db/migrations').then(files => runMigrations(pool, files)).then(() => process.exit(0));
"
```

- [ ] **Step 3: Trigger komet-code-parser job manually**

```bash
# Queue the code parser job directly from the backend
docker compose exec -T backend node -e "
  const { Redis } = require('ioredis');
  const { Queue } = require('bullmq');
  const redis = new Redis({ host: 'redis', port: 6379 });
  const q = new Queue('enrichment', { connection: redis });
  q.add('komet-code-parser', { type: 'komet-code-parser', userId: 'service-account', data: {}, idempotencyKey: 'init', timestamp: Date.now() }, { priority: 5 }).then(() => { console.log('queued'); process.exit(0); });
"
```

- [ ] **Step 4: Verify instrument_features was populated**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml exec -T postgres psql -U archibald -d archibald -c \"SELECT COUNT(*) FROM shared.instrument_features;\""
```

Expected: COUNT > 0

---

## ✅ Backend Plan Complete

After all tasks, the backend exposes:
- `POST /api/recognition/identify` — full AI recognition pipeline
- `POST /api/recognition/feedback` — queue field scan for gallery
- `GET  /api/recognition/budget` — daily budget state
- `GET  /api/products/:id/enrichment` — PKB data, gallery, variants, recognition history

BullMQ enrichment jobs ready: `komet-code-parser`, `komet-web-scraper`, `recognition-feedback`.

**Proceed to Plan 2: Frontend** (`2026-04-05-komet-pkb-frontend.md`)
