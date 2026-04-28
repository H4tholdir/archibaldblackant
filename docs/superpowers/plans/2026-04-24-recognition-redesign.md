# Recognition System Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il sistema ANN Jina+pgvector con pipeline measure-first: InstrumentDescriptor (Haiku) → SQL strutturato con fallback progressivo → VisualConfirmer (Opus 4.7).

**Architecture:** Una singola call Claude Haiku 4.5 (`InstrumentDescriptor`) estrae 8 dimensioni morfologiche dall'immagine; `CatalogSearcher` le trasforma in una query SQL su `shared.catalog_entries` con 6-step fallback progressivo (±0.3mm → ±0.6mm, rimozione progressiva di filtri); Claude Opus 4.7 (`VisualConfirmer`) conferma visivamente su shortlist ≤5 candidati.

**Tech Stack:** TypeScript strict, pg (DbPool), @anthropic-ai/sdk, PostgreSQL (JSONB GIN index), Vitest.

**Spec:** `docs/superpowers/specs/2026-04-24-recognition-redesign-design.md`

---

## File Structure

### Nuovi file
| File | Responsabilità |
|---|---|
| `src/db/migrations/064-recognition-shape-class.sql` | ADD shape_class, fix codici 123/124 type→hpt, GIN index |
| `src/db/migrations/065-drop-visual-embedding.sql` | DROP visual_embedding, indexed_at, fix catalog_reading_guide |
| `src/recognition/instrument-descriptor.ts` | describeInstrument(), parseDescriptorJson(), computePxPerMm() |
| `src/recognition/instrument-descriptor.spec.ts` | Unit test funzioni pure |
| `src/recognition/catalog-searcher.ts` | searchCatalog() 6-step fallback, buildSearchParams(), mapping tables |
| `src/recognition/catalog-searcher.spec.ts` | Unit test logica mapping + params |
| `src/recognition/visual-confirmer.ts` | confirmWithOpus(), parseConfirmationJson() |
| `src/recognition/visual-confirmer.spec.ts` | Unit test parsing JSON risposta |
| `src/recognition/recognition-pipeline.integration.spec.ts` | Integration test pipeline E2E |

### File modificati
| File | Modifica |
|---|---|
| `src/recognition/types.ts` | Aggiunge InstrumentDescriptor, ShapeClass, SurfaceTexture, nuova RecognitionResult |
| `src/recognition/recognition-engine.ts` | Riscrittura completa — nuova orchestrazione |
| `src/recognition/recognition-engine.spec.ts` | Riscrittura test |
| `src/routes/recognition.ts` | Aggiunge aruco_px_per_mm, rimuove embeddingSvc/minSimilarity |
| `src/routes/recognition.spec.ts` | Aggiorna per nuovi deps |
| `src/db/repositories/catalog-family-images.ts` | Rimuove 8 funzioni ANN, fix getBestRowsByFamilyCodes |
| `src/operations/operation-types.ts` | Rimuove 3 tipi operazione Jina |
| `src/config.ts` | Rimuove jinaApiKey, minSimilarity |
| `src/main.ts` | Rimuove Jina setup, 3 handler, aggiorna recognition router deps |

### File eliminati
| File |
|---|
| `src/recognition/visual-embedding-service.ts` |
| `src/recognition/visual-embedding-service.spec.ts` |
| `src/operations/handlers/build-visual-index-handler.ts` |
| `src/operations/handlers/build-visual-index-handler.spec.ts` |
| `src/operations/handlers/index-catalog-pages-handler.ts` |
| `src/operations/handlers/index-catalog-pages-handler.spec.ts` |
| `src/operations/handlers/index-web-image-handler.ts` |

---

## Task 1: Migration 064 — shape_class + fix 123/124 + GIN index

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/064-recognition-shape-class.sql`

- [ ] **Step 1: Scrivi la migration**

Crea il file `archibald-web-app/backend/src/db/migrations/064-recognition-shape-class.sql`:

```sql
-- 1. Aggiungi colonna shape_class
ALTER TABLE shared.catalog_entries
  ADD COLUMN IF NOT EXISTS shape_class TEXT;

-- 2. Mapping deterministico da shape_description (keyword matching IT + EN)
UPDATE shared.catalog_entries SET shape_class = CASE
  WHEN shape_description ILIKE '%sfera%' OR shape_description ILIKE '%ball%'
    OR shape_description ILIKE '%round%'
    THEN 'sfera'
  WHEN shape_description ILIKE '%ovale%' OR shape_description ILIKE '%oval%'
    THEN 'ovale'
  WHEN shape_description ILIKE '%pera%' OR shape_description ILIKE '%pear%'
    THEN 'pera'
  WHEN shape_description ILIKE '%fiamma%' OR shape_description ILIKE '%flame%'
    THEN 'fiamma'
  WHEN shape_description ILIKE '%ago%' OR shape_description ILIKE '%needle%'
    THEN 'ago'
  WHEN shape_description ILIKE '%cilindro%'
    AND (shape_description ILIKE '%piatto%' OR shape_description ILIKE '%flat%')
    THEN 'cilindro_piatto'
  WHEN shape_description ILIKE '%cilindro%' OR shape_description ILIKE '%cylinder%'
    THEN 'cilindro_tondo'
  WHEN shape_description ILIKE '%cono%'
    AND (shape_description ILIKE '%inverti%' OR shape_description ILIKE '%invert%')
    THEN 'cono_invertito'
  WHEN shape_description ILIKE '%cono%'
    AND (shape_description ILIKE '%piatto%' OR shape_description ILIKE '%flat%')
    THEN 'cono_piatto'
  WHEN shape_description ILIKE '%cono%' OR shape_description ILIKE '%taper%'
    OR shape_description ILIKE '%cone%'
    THEN 'cono_tondo'
  WHEN shape_description ILIKE '%disco%' OR shape_description ILIKE '%disc%'
    OR shape_description ILIKE '%wheel%'
    THEN 'disco'
  WHEN shape_description ILIKE '%diabolo%' OR shape_description ILIKE '%hourglass%'
    THEN 'diabolo'
  ELSE 'altro'
END;

-- 3. Fix data: codici 123 e 124 (Ø3.00mm) taggati erroneamente "hp" → corregge a "hpt"
UPDATE shared.catalog_entries
SET shank_options = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'code' IN ('123', '124')
        THEN jsonb_set(elem, '{type}', '"hpt"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(shank_options) elem
)
WHERE shank_options @> '[{"code":"123"}]'::jsonb
   OR shank_options @> '[{"code":"124"}]'::jsonb;

-- 4. Indice GIN su shank_options per ricerca JSONB efficiente
CREATE INDEX IF NOT EXISTS idx_catalog_entries_shank_options_gin
  ON shared.catalog_entries USING GIN (shank_options jsonb_path_ops);

-- 5. Indice su shape_class per filtro SQL
CREATE INDEX IF NOT EXISTS idx_catalog_entries_shape_class
  ON shared.catalog_entries (shape_class);
```

- [ ] **Step 2: Applica migration su DB locale**

```bash
PG_HOST=localhost PG_DATABASE=archibald PG_USER=archibald npm run migrate --prefix archibald-web-app/backend
```

Atteso: `Migration 064-recognition-shape-class.sql applied.`

- [ ] **Step 3: Diagnostica — verifica coverage shape_class**

```bash
psql -h localhost -U archibald -d archibald -c "
  SELECT shape_class, COUNT(*) AS n
  FROM shared.catalog_entries
  GROUP BY shape_class
  ORDER BY n DESC;
"
```

Atteso: `'altro'` ≤ 15% del totale (≤ ~246 righe su 1639). Se > 15%, raffinare le keywords nella migration prima del deploy in produzione.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/064-recognition-shape-class.sql
git commit -m "feat(db): migration 064 — shape_class, fix shank 123/124 tipo hpt, GIN index"
```

---

## Task 2: Aggiorna types.ts con i nuovi tipi

**Files:**
- Modify: `archibald-web-app/backend/src/recognition/types.ts`

- [ ] **Step 1: Riscrivi l'intero file types.ts**

```typescript
type ShapeClass =
  | 'sfera' | 'ovale' | 'pera' | 'fiamma' | 'ago'
  | 'cilindro_piatto' | 'cilindro_tondo'
  | 'cono_piatto' | 'cono_tondo' | 'cono_invertito'
  | 'disco' | 'diabolo' | 'altro'

type SurfaceTexture =
  | 'diamond_grit'
  | 'carbide_blades'
  | 'ceramic'
  | 'rubber_polisher'
  | 'abrasive_wheel'
  | 'disc_slotted'
  | 'disc_perforated'
  | 'steel_smooth'
  | 'sonic_tip'
  | 'other'

type ShankGroup   = 'FG' | 'CA_HP' | 'HPT' | 'Handle_S' | 'Handle_L' | 'none' | 'unknown'
type GritColor    = 'white' | 'yellow' | 'red' | 'none' | 'green' | 'black' | 'blue' | 'other' | null
type BladeDensity = 'few_coarse' | 'medium' | 'many_fine' | null

type InstrumentDescriptor = {
  shank: {
    diameter_group: ShankGroup
    diameter_px:    number
    length_px:      number
  }
  head: {
    diameter_px: number
    length_px:   number
  }
  shape_class:    ShapeClass
  grit_indicator: {
    type:          'ring_color' | 'blade_count' | 'head_color' | 'none' | 'unknown'
    color:         GritColor
    blade_density: BladeDensity
  }
  surface_texture: SurfaceTexture
  confidence:      number
}

type CatalogCandidate = {
  familyCode:       string
  shapeDescription: string | null
  shapeClass:       string | null
  sizeOptions:      number[]
  productType:      string | null
  thumbnailPath:    string | null
}

type VisualConfirmation = {
  matched_family_code: string | null
  confidence:          number
  reasoning:           string
  runner_up:           string | null
}

type MeasurementSummary = {
  shankGroup:        string | null
  headDiameterMm:    number | null
  shapeClass:        ShapeClass | null
  measurementSource: 'aruco' | 'shank_iso' | 'none'
}

type ProductMatch = {
  familyCode:        string
  productName:       string
  shankType:         string
  headDiameterMm:    number | null
  headLengthMm:      number | null
  shapeClass:        ShapeClass | null
  confidence:        number
  thumbnailUrl:      string | null
  discontinued:      boolean
  measurementSource: 'aruco' | 'shank_iso' | 'none'
}

type CandidateMatch = {
  familyCode:      string
  thumbnailUrl:    string | null
  referenceImages: string[]
}

type ThrottleLevel = 'normal' | 'warning' | 'limited'

type BudgetState = {
  dailyLimit:    number
  usedToday:     number
  throttleLevel: ThrottleLevel
  resetAt:       Date
}

type RecognitionResult =
  | { type: 'match';            data: ProductMatch }
  | { type: 'shortlist_visual'; data: { candidates: CandidateMatch[] } }
  | { type: 'not_found';        data: { measurements: MeasurementSummary } }
  | { type: 'budget_exhausted' }
  | { type: 'error';            data: { message: string } }

export type {
  ShapeClass,
  SurfaceTexture,
  ShankGroup,
  GritColor,
  BladeDensity,
  InstrumentDescriptor,
  CatalogCandidate,
  VisualConfirmation,
  MeasurementSummary,
  ProductMatch,
  CandidateMatch,
  ThrottleLevel,
  BudgetState,
  RecognitionResult,
}
```

- [ ] **Step 2: Esegui type-check backend**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -20
```

Ci saranno errori su `recognition-engine.ts` e `routes/recognition.ts` (ancora usano vecchi tipi) — attesi, verranno risolti nelle task successive.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/recognition/types.ts
git commit -m "feat(recognition): aggiorna types.ts con InstrumentDescriptor, ShapeClass, RecognitionResult rinominata"
```

---

## Task 3: instrument-descriptor.ts

**Files:**
- Create: `archibald-web-app/backend/src/recognition/instrument-descriptor.ts`
- Create: `archibald-web-app/backend/src/recognition/instrument-descriptor.spec.ts`

- [ ] **Step 1: Scrivi il test (failing)**

Crea `archibald-web-app/backend/src/recognition/instrument-descriptor.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { parseDescriptorJson, computePxPerMm, INSTRUMENT_DESCRIPTOR_MODEL } from './instrument-descriptor'
import type { InstrumentDescriptor } from './types'

const VALID_DESCRIPTOR: InstrumentDescriptor = {
  shank:           { diameter_group: 'CA_HP', diameter_px: 28, length_px: 140 },
  head:            { diameter_px: 40, length_px: 80 },
  shape_class:     'cono_tondo',
  grit_indicator:  { type: 'ring_color', color: 'red', blade_density: null },
  surface_texture: 'diamond_grit',
  confidence:      0.88,
}

describe('parseDescriptorJson', () => {
  test('valid JSON string → parsed InstrumentDescriptor', () => {
    expect(parseDescriptorJson(JSON.stringify(VALID_DESCRIPTOR))).toEqual(VALID_DESCRIPTOR)
  })

  test('JSON embedded in prose → estrae oggetto correttamente', () => {
    const raw = `Ecco la risposta:\n${JSON.stringify(VALID_DESCRIPTOR)}\nFine.`
    expect(parseDescriptorJson(raw)).toEqual(VALID_DESCRIPTOR)
  })

  test('JSON non valido → descriptor fallback con confidence=0 e group=unknown', () => {
    const result = parseDescriptorJson('not valid json')
    expect(result.confidence).toBe(0)
    expect(result.shank.diameter_group).toBe('unknown')
    expect(result.shape_class).toBe('altro')
    expect(result.surface_texture).toBe('other')
  })

  test('stringa vuota → descriptor fallback', () => {
    const result = parseDescriptorJson('')
    expect(result.confidence).toBe(0)
  })
})

describe('computePxPerMm', () => {
  test('arucoMm presente → restituisce il valore ARUco (ignora shank)', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'FG', diameter_px: 10, length_px: 0 },
    }
    expect(computePxPerMm(desc, 7.5)).toBe(7.5)
  })

  test('arucoMm=null + FG (1.60mm) → px/mm dal gambo', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'FG', diameter_px: 16, length_px: 0 },
    }
    expect(computePxPerMm(desc, null)).toBeCloseTo(10.0) // 16 / 1.60
  })

  test('arucoMm=null + CA_HP (2.35mm) → px/mm dal gambo', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'CA_HP', diameter_px: 28, length_px: 0 },
    }
    expect(computePxPerMm(desc, null)).toBeCloseTo(11.91) // 28 / 2.35
  })

  test('arucoMm=null + HPT (3.00mm) → px/mm dal gambo', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'HPT', diameter_px: 30, length_px: 0 },
    }
    expect(computePxPerMm(desc, null)).toBeCloseTo(10.0) // 30 / 3.00
  })

  test('arucoMm=null + unknown → null', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'unknown', diameter_px: 20, length_px: 0 },
    }
    expect(computePxPerMm(desc, null)).toBeNull()
  })

  test('arucoMm=null + none → null (strumento non montato)', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'none', diameter_px: 0, length_px: 0 },
    }
    expect(computePxPerMm(desc, null)).toBeNull()
  })

  test('arucoMm=null + diameter_px=0 → null', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'FG', diameter_px: 0, length_px: 0 },
    }
    expect(computePxPerMm(desc, null)).toBeNull()
  })
})

describe('INSTRUMENT_DESCRIPTOR_MODEL', () => {
  test('è una stringa non vuota', () => {
    expect(typeof INSTRUMENT_DESCRIPTOR_MODEL).toBe('string')
    expect(INSTRUMENT_DESCRIPTOR_MODEL.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Esegui test — devono fallire**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose instrument-descriptor.spec 2>&1 | tail -15
```

Atteso: FAIL — `Cannot find module './instrument-descriptor'`

- [ ] **Step 3: Implementa instrument-descriptor.ts**

Crea `archibald-web-app/backend/src/recognition/instrument-descriptor.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { InstrumentDescriptor, ShankGroup } from './types'

export const INSTRUMENT_DESCRIPTOR_MODEL =
  process.env.INSTRUMENT_DESCRIPTOR_MODEL ?? 'claude-haiku-4-5-20251001'

const SHANK_DIAMETER_MM: Partial<Record<ShankGroup, number>> = {
  FG:       1.60,
  CA_HP:    2.35,
  HPT:      3.00,
  Handle_S: 4.00,
  Handle_L: 6.00,
}

const PROMPT = `You are a dental instrument classifier. Analyze the dental bur/instrument in the image and return ONLY a JSON object with exactly these fields:

{
  "shank": {
    "diameter_group": <"FG"|"CA_HP"|"HPT"|"Handle_S"|"Handle_L"|"none"|"unknown">,
    "diameter_px": <integer: width of shank shaft in pixels>,
    "length_px": <integer: visible shank length in pixels>
  },
  "head": {
    "diameter_px": <integer: maximum width of working head in pixels>,
    "length_px": <integer: length of working head in pixels>
  },
  "shape_class": <"sfera"|"ovale"|"pera"|"fiamma"|"ago"|"cilindro_piatto"|"cilindro_tondo"|"cono_piatto"|"cono_tondo"|"cono_invertito"|"disco"|"diabolo"|"altro">,
  "grit_indicator": {
    "type": <"ring_color"|"blade_count"|"head_color"|"none"|"unknown">,
    "color": <"white"|"yellow"|"red"|"none"|"green"|"black"|"blue"|"other"|null>,
    "blade_density": <"few_coarse"|"medium"|"many_fine"|null>
  },
  "surface_texture": <"diamond_grit"|"carbide_blades"|"ceramic"|"rubber_polisher"|"abrasive_wheel"|"disc_slotted"|"disc_perforated"|"steel_smooth"|"sonic_tip"|"other">,
  "confidence": <float 0.0-1.0>
}

SHANK GROUPS (ISO physical diameters):
- FG (1.60mm): thin shaft for air-turbine handpieces
- CA_HP (2.35mm): standard shaft for contra-angle and straight handpieces
- HPT (3.00mm): thick shaft for thick handpieces
- Handle_S (4.00mm): short grip/handle instrument
- Handle_L (6.00mm): large grip/handle instrument
- none: non-mounted bur (no shank)
- unknown: cannot determine

SHAPE CLASSES: sfera=ball, ovale=oval, pera=pear, fiamma=flame/torpedo, ago=needle, cilindro_piatto=flat-end cylinder, cilindro_tondo=round-end cylinder, cono_piatto=flat-end cone, cono_tondo=round-end cone, cono_invertito=inverted cone (wider at tip), disco=disc/wheel, diabolo=hourglass, altro=other

GRIT INDICATOR (physical colored ring/marking on instrument):
- ring_color: colored band on shaft neck; color = white(ultrafine) / yellow(extrafine) / red(fine) / none(medium, NO ring) / green(coarse) / black(super-coarse)
- blade_count: visible cutting flutes/blades; color=null, set blade_density
- head_color: color of rubber/polisher body; color=null
- none: no grit indicator

Return ONLY the JSON, no explanation.`

export async function describeInstrument(
  client:      Anthropic,
  imageBase64: string,
  pxPerMm:     number | null,
): Promise<InstrumentDescriptor> {
  const promptText = pxPerMm != null
    ? `${PROMPT}\n\nCALIBRATION: px_per_mm=${pxPerMm.toFixed(3)} (ARUco marker detected).`
    : PROMPT

  const message = await client.messages.create({
    model:      INSTRUMENT_DESCRIPTOR_MODEL,
    max_tokens: 512,
    messages: [{
      role:    'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text',  text: promptText },
      ],
    }],
  })

  const text = message.content.find(b => b.type === 'text')?.text ?? ''
  return parseDescriptorJson(text)
}

export function parseDescriptorJson(raw: string): InstrumentDescriptor {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return fallbackDescriptor()
  try {
    return JSON.parse(match[0]) as InstrumentDescriptor
  } catch {
    return fallbackDescriptor()
  }
}

function fallbackDescriptor(): InstrumentDescriptor {
  return {
    shank:           { diameter_group: 'unknown', diameter_px: 0, length_px: 0 },
    head:            { diameter_px: 0, length_px: 0 },
    shape_class:     'altro',
    grit_indicator:  { type: 'unknown', color: null, blade_density: null },
    surface_texture: 'other',
    confidence:      0,
  }
}

export function computePxPerMm(
  descriptor: InstrumentDescriptor,
  arucoMm:   number | null,
): number | null {
  if (arucoMm != null) return arucoMm
  const diamMm = SHANK_DIAMETER_MM[descriptor.shank.diameter_group]
  if (diamMm == null || descriptor.shank.diameter_px <= 0) return null
  return descriptor.shank.diameter_px / diamMm
}
```

- [ ] **Step 4: Esegui test — devono passare**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose instrument-descriptor.spec 2>&1 | tail -20
```

Atteso: PASS — tutti i test verdi

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/recognition/instrument-descriptor.ts \
        archibald-web-app/backend/src/recognition/instrument-descriptor.spec.ts
git commit -m "feat(recognition): instrument-descriptor — describeInstrument, parseDescriptorJson, computePxPerMm"
```

---

## Task 4: catalog-searcher.ts

**Files:**
- Create: `archibald-web-app/backend/src/recognition/catalog-searcher.ts`
- Create: `archibald-web-app/backend/src/recognition/catalog-searcher.spec.ts`

- [ ] **Step 1: Scrivi il test (failing)**

Crea `archibald-web-app/backend/src/recognition/catalog-searcher.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import {
  buildSearchParams,
  SURFACE_TEXTURE_TO_PRODUCT_TYPES,
  SHANK_GROUP_TO_DB_TYPES,
} from './catalog-searcher'
import type { InstrumentDescriptor } from './types'

const BASE_DESCRIPTOR: InstrumentDescriptor = {
  shank:           { diameter_group: 'CA_HP', diameter_px: 28, length_px: 140 },
  head:            { diameter_px: 40, length_px: 80 },
  shape_class:     'cono_tondo',
  grit_indicator:  { type: 'ring_color', color: 'red', blade_density: null },
  surface_texture: 'diamond_grit',
  confidence:      0.90,
}

describe('buildSearchParams', () => {
  test('confidence >= 0.7 → shapeClass incluso', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.shapeClass).toBe('cono_tondo')
  })

  test('confidence < 0.7 → shapeClass null', () => {
    const desc: InstrumentDescriptor = { ...BASE_DESCRIPTOR, confidence: 0.65 }
    const params = buildSearchParams(desc, 11.91)
    expect(params.shapeClass).toBeNull()
  })

  test('CA_HP + pxPerMm=11.91 + head.diameter_px=40 → headMm ~3.36', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.headMm).toBeCloseTo(3.36) // 40 / 11.91
  })

  test('pxPerMm null → headMm null', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, null)
    expect(params.headMm).toBeNull()
  })

  test('CA_HP → shankTypes ["ca","hp"]', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.shankTypes).toEqual(['ca', 'hp'])
  })

  test('FG → shankTypes ["fg"]', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'FG', diameter_px: 16, length_px: 100 },
    }
    const params = buildSearchParams(desc, 10.0)
    expect(params.shankTypes).toEqual(['fg'])
  })

  test('HPT → shankTypes ["hpt"]', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'HPT', diameter_px: 30, length_px: 100 },
    }
    const params = buildSearchParams(desc, 10.0)
    expect(params.shankTypes).toEqual(['hpt'])
  })

  test('Handle_S → shankTypes ["grip"]', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'Handle_S', diameter_px: 48, length_px: 0 },
    }
    const params = buildSearchParams(desc, 12.0)
    expect(params.shankTypes).toEqual(['grip'])
  })

  test('unknown shank → shankTypes null', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'unknown', diameter_px: 0, length_px: 0 },
    }
    const params = buildSearchParams(desc, null)
    expect(params.shankTypes).toBeNull()
  })

  test('diamond_grit → productTypes ["rotary_diamond"]', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.productTypes).toEqual(['rotary_diamond'])
  })

  test('carbide_blades → productTypes ["rotary_carbide","lab_carbide"]', () => {
    const desc: InstrumentDescriptor = { ...BASE_DESCRIPTOR, surface_texture: 'carbide_blades' }
    const params = buildSearchParams(desc, 11.91)
    expect(params.productTypes).toEqual(['rotary_carbide', 'lab_carbide'])
  })

  test('ring_color + red → gritColor "red", gritIndicatorType "ring_color"', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.gritIndicatorType).toBe('ring_color')
    expect(params.gritColor).toBe('red')
  })

  test('blade_count → gritColor null (dato non nel DB per carburi)', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      surface_texture: 'carbide_blades',
      grit_indicator:  { type: 'blade_count', color: null, blade_density: 'many_fine' },
    }
    const params = buildSearchParams(desc, 11.91)
    expect(params.gritColor).toBeNull()
    expect(params.gritIndicatorType).toBe('blade_count')
  })

  test('grit_indicator.type unknown → gritIndicatorType null', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      grit_indicator: { type: 'unknown', color: null, blade_density: null },
    }
    const params = buildSearchParams(desc, 11.91)
    expect(params.gritIndicatorType).toBeNull()
  })
})

describe('SURFACE_TEXTURE_TO_PRODUCT_TYPES', () => {
  const ALL_TEXTURES = [
    'diamond_grit', 'carbide_blades', 'ceramic', 'rubber_polisher',
    'abrasive_wheel', 'disc_slotted', 'disc_perforated', 'steel_smooth', 'sonic_tip', 'other',
  ] as const

  test('ogni SurfaceTexture ha una entry nella mappa', () => {
    for (const texture of ALL_TEXTURES) {
      expect(texture in SURFACE_TEXTURE_TO_PRODUCT_TYPES).toBe(true)
    }
  })
})

describe('SHANK_GROUP_TO_DB_TYPES', () => {
  test('FG → ["fg"]', () => { expect(SHANK_GROUP_TO_DB_TYPES.FG).toEqual(['fg']) })
  test('CA_HP → ["ca","hp"]', () => { expect(SHANK_GROUP_TO_DB_TYPES.CA_HP).toEqual(['ca', 'hp']) })
  test('HPT → ["hpt"]', () => { expect(SHANK_GROUP_TO_DB_TYPES.HPT).toEqual(['hpt']) })
  test('Handle_S e Handle_L → ["grip"]', () => {
    expect(SHANK_GROUP_TO_DB_TYPES.Handle_S).toEqual(['grip'])
    expect(SHANK_GROUP_TO_DB_TYPES.Handle_L).toEqual(['grip'])
  })
})
```

- [ ] **Step 2: Esegui test — devono fallire**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose catalog-searcher.spec 2>&1 | tail -15
```

Atteso: FAIL — `Cannot find module './catalog-searcher'`

- [ ] **Step 3: Implementa catalog-searcher.ts**

Crea `archibald-web-app/backend/src/recognition/catalog-searcher.ts`:

```typescript
import type { DbPool } from '../db/pool'
import type { InstrumentDescriptor, ShankGroup, SurfaceTexture, CatalogCandidate } from './types'

export const SHANK_GROUP_TO_DB_TYPES: Partial<Record<ShankGroup, string[]>> = {
  FG:       ['fg'],
  CA_HP:    ['ca', 'hp'],
  HPT:      ['hpt'],
  Handle_S: ['grip'],
  Handle_L: ['grip'],
}

export const SURFACE_TEXTURE_TO_PRODUCT_TYPES: Record<SurfaceTexture, string[] | null> = {
  diamond_grit:    ['rotary_diamond'],
  carbide_blades:  ['rotary_carbide', 'lab_carbide'],
  ceramic:         ['polisher_ceramic'],
  rubber_polisher: ['polisher_composite', 'polisher_amalgam'],
  abrasive_wheel:  ['accessory', 'other'],
  disc_slotted:    ['accessory', 'other'],
  disc_perforated: ['accessory', 'other'],
  steel_smooth:    ['endodontic', 'root_post'],
  sonic_tip:       ['sonic'],
  other:           null,
}

export type SearchParams = {
  productTypes:      string[] | null
  shankTypes:        string[] | null
  headMm:            number | null
  shapeClass:        string | null
  gritIndicatorType: string | null
  gritColor:         string | null
}

export function buildSearchParams(
  descriptor: InstrumentDescriptor,
  pxPerMm:    number | null,
): SearchParams {
  const headMm = (pxPerMm != null && descriptor.head.diameter_px > 0)
    ? descriptor.head.diameter_px / pxPerMm
    : null

  const shankTypes = SHANK_GROUP_TO_DB_TYPES[descriptor.shank.diameter_group] ?? null

  const productTypes = SURFACE_TEXTURE_TO_PRODUCT_TYPES[descriptor.surface_texture] ?? null

  const shapeClass = descriptor.confidence >= 0.7 ? descriptor.shape_class : null

  const gritIndicatorType = descriptor.grit_indicator.type === 'unknown'
    ? null
    : descriptor.grit_indicator.type

  // gritColor applicabile solo a ring_color — per blade_count/head_color il colore non è nel DB
  const gritColor = descriptor.grit_indicator.type === 'ring_color'
    ? descriptor.grit_indicator.color
    : null

  return { productTypes, shankTypes, headMm, shapeClass, gritIndicatorType, gritColor }
}

type FallbackStep = {
  tolerance:      number
  useGrit:        boolean
  useShapeClass:  boolean
  useProductType: boolean
}

const FALLBACK_STEPS: FallbackStep[] = [
  { tolerance: 0.3, useGrit: true,  useShapeClass: true,  useProductType: true  },
  { tolerance: 0.3, useGrit: false, useShapeClass: true,  useProductType: true  },
  { tolerance: 0.4, useGrit: false, useShapeClass: true,  useProductType: true  },
  { tolerance: 0.5, useGrit: false, useShapeClass: true,  useProductType: true  },
  { tolerance: 0.6, useGrit: false, useShapeClass: false, useProductType: true  },
  { tolerance: 0.6, useGrit: false, useShapeClass: false, useProductType: false },
]

const CATALOG_SQL = `
SELECT
  ce.family_codes[1]   AS "familyCode",
  ce.shape_description AS "shapeDescription",
  ce.shape_class       AS "shapeClass",
  ce.size_options      AS "sizeOptions",
  ce.product_type      AS "productType",
  cfi.local_path       AS "thumbnailPath"
FROM shared.catalog_entries ce
LEFT JOIN LATERAL (
  SELECT local_path
  FROM shared.catalog_family_images
  WHERE family_code = ce.family_codes[1]
  ORDER BY priority ASC
  LIMIT 1
) cfi ON true
WHERE
  ($1::text[]   IS NULL OR ce.product_type = ANY($1))
  AND ($2::text[] IS NULL OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(ce.shank_options) elem
    WHERE elem->>'type' = ANY($2)
  ))
  AND ($3::float8 IS NULL OR EXISTS (
    SELECT 1 FROM unnest(ce.size_options) s
    WHERE s / 10.0 BETWEEN $3 - $4 AND $3 + $4
  ))
  AND ($5::text IS NULL OR ce.shape_class = $5)
  AND ($6::text IS NULL OR ce.grit_options->0->>'grit_indicator_type' = $6)
  AND ($7::text IS NULL OR ce.grit_options->0->>'visual_cue' ILIKE '%' || $7 || '%')
ORDER BY
  COALESCE((
    SELECT MIN(ABS(s / 10.0 - $3))
    FROM unnest(ce.size_options) s
  ), 999)
LIMIT 5
`

export async function searchCatalog(
  pool:   DbPool,
  params: SearchParams,
): Promise<CatalogCandidate[]> {
  for (const step of FALLBACK_STEPS) {
    const { rows } = await pool.query<CatalogCandidate>(CATALOG_SQL, [
      step.useProductType ? params.productTypes      : null,
      params.shankTypes,
      params.headMm,
      step.tolerance,
      step.useShapeClass  ? params.shapeClass        : null,
      step.useGrit        ? params.gritIndicatorType : null,
      step.useGrit        ? params.gritColor         : null,
    ])
    if (rows.length > 0) return rows
  }
  return []
}
```

- [ ] **Step 4: Esegui test — devono passare**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose catalog-searcher.spec 2>&1 | tail -20
```

Atteso: PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/recognition/catalog-searcher.ts \
        archibald-web-app/backend/src/recognition/catalog-searcher.spec.ts
git commit -m "feat(recognition): catalog-searcher — SQL 6-step fallback progressivo, mappings shank/texture"
```

---

## Task 5: visual-confirmer.ts

**Files:**
- Create: `archibald-web-app/backend/src/recognition/visual-confirmer.ts`
- Create: `archibald-web-app/backend/src/recognition/visual-confirmer.spec.ts`

- [ ] **Step 1: Scrivi il test (failing)**

Crea `archibald-web-app/backend/src/recognition/visual-confirmer.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { parseConfirmationJson } from './visual-confirmer'

describe('parseConfirmationJson', () => {
  test('valid JSON → confirmation parsata correttamente', () => {
    const input = JSON.stringify({
      matched_family_code: 'H251',
      confidence: 0.93,
      reasoning: 'Cono tondo, anello rosso visibile sul gambo HP',
      runner_up: 'H253',
    })
    expect(parseConfirmationJson(input)).toEqual({
      matched_family_code: 'H251',
      confidence: 0.93,
      reasoning: 'Cono tondo, anello rosso visibile sul gambo HP',
      runner_up: 'H253',
    })
  })

  test('JSON in mezzo al testo → estrazione corretta', () => {
    const payload = {
      matched_family_code: 'H297',
      confidence: 0.88,
      reasoning: 'Fiamma con anello rosso',
      runner_up: null,
    }
    const raw = `Analisi completata.\n${JSON.stringify(payload)}\nFine.`
    const result = parseConfirmationJson(raw)
    expect(result.matched_family_code).toBe('H297')
    expect(result.confidence).toBe(0.88)
  })

  test('nessun match → matched_family_code null', () => {
    const input = JSON.stringify({
      matched_family_code: null,
      confidence: 0.25,
      reasoning: 'Nessuno dei candidati corrisponde',
      runner_up: null,
    })
    const result = parseConfirmationJson(input)
    expect(result.matched_family_code).toBeNull()
    expect(result.confidence).toBe(0.25)
  })

  test('JSON non valido → fallback con confidence=0 e matched=null', () => {
    const result = parseConfirmationJson('non è JSON')
    expect(result.confidence).toBe(0)
    expect(result.matched_family_code).toBeNull()
    expect(result.reasoning).toBe('parse error')
  })
})
```

- [ ] **Step 2: Esegui test — devono fallire**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose visual-confirmer.spec 2>&1 | tail -15
```

Atteso: FAIL — `Cannot find module './visual-confirmer'`

- [ ] **Step 3: Implementa visual-confirmer.ts**

Crea `archibald-web-app/backend/src/recognition/visual-confirmer.ts`:

```typescript
import { readFile } from 'node:fs/promises'
import Anthropic from '@anthropic-ai/sdk'
import type { CatalogCandidate, VisualConfirmation } from './types'
import { logger } from '../logger'

const CONFIRMER_MODEL = 'claude-opus-4-7'

const CONFIRM_PROMPT = `You are a dental bur identification expert. A photo of an instrument is shown, followed by numbered reference images from a product catalog.

Identify which reference matches the instrument. Compare:
- Head shape (ball, cone, cylinder, flame, etc.) and proportions
- Shank type visible
- Grit indicator: colored ring on shaft, blade pattern, or head/body color
- Surface texture (diamond grit, cutting blades, rubber, etc.)

Return ONLY this JSON:
{
  "matched_family_code": <string family code or null>,
  "confidence": <float 0.0-1.0>,
  "reasoning": <one concise sentence>,
  "runner_up": <string or null>
}

If confidence < 0.85, set matched_family_code to null.`

export async function confirmWithOpus(
  client:      Anthropic,
  photoBase64: string,
  candidates:  CatalogCandidate[],
): Promise<VisualConfirmation> {
  const images = await loadImages(candidates)

  const content: Anthropic.MessageParam['content'] = [
    { type: 'text',  text: 'Photo of the instrument to identify:' },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photoBase64 } },
  ]

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!
    content.push({ type: 'text', text: `Reference ${i + 1}: ${candidate.familyCode}` })
    const img = images[i]
    if (img) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } })
    }
  }

  content.push({ type: 'text', text: CONFIRM_PROMPT })

  const message = await client.messages.create({
    model:      CONFIRMER_MODEL,
    max_tokens: 256,
    messages:   [{ role: 'user', content }],
  })

  const text = message.content.find(b => b.type === 'text')?.text ?? ''
  return parseConfirmationJson(text)
}

export function parseConfirmationJson(raw: string): VisualConfirmation {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return fallbackConfirmation()
  try {
    return JSON.parse(match[0]) as VisualConfirmation
  } catch {
    return fallbackConfirmation()
  }
}

function fallbackConfirmation(): VisualConfirmation {
  return { matched_family_code: null, confidence: 0, reasoning: 'parse error', runner_up: null }
}

async function loadImages(candidates: CatalogCandidate[]): Promise<(string | null)[]> {
  return Promise.all(
    candidates.map(async candidate => {
      if (!candidate.thumbnailPath) return null
      try {
        const buf = await readFile(candidate.thumbnailPath)
        return buf.toString('base64')
      } catch {
        logger.warn('[visual-confirmer] immagine candidato non trovata', {
          familyCode: candidate.familyCode,
          path:       candidate.thumbnailPath,
        })
        return null
      }
    }),
  )
}
```

- [ ] **Step 4: Esegui test — devono passare**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose visual-confirmer.spec 2>&1 | tail -20
```

Atteso: PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/recognition/visual-confirmer.ts \
        archibald-web-app/backend/src/recognition/visual-confirmer.spec.ts
git commit -m "feat(recognition): visual-confirmer — confirmWithOpus, parseConfirmationJson"
```

---

## Task 6: Riscrittura recognition-engine.ts

**Files:**
- Modify: `archibald-web-app/backend/src/recognition/recognition-engine.ts`
- Modify: `archibald-web-app/backend/src/recognition/recognition-engine.spec.ts`

- [ ] **Step 1: Scrivi i test (failing)**

Riscrivi `archibald-web-app/backend/src/recognition/recognition-engine.spec.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { runRecognitionPipeline } from './recognition-engine'
import type { DbPool } from '../db/pool'
import type { CatalogCandidate, InstrumentDescriptor, VisualConfirmation } from './types'

// Pool mock: restituisce budget row per query recognition_budget, rows vuoti per il resto
const makeMockPool = (): DbPool => ({
  query: vi.fn().mockImplementation((sql: string) => {
    if (typeof sql === 'string' && sql.includes('recognition_budget')) {
      return Promise.resolve({
        rows: [{ daily_limit: 500, used_today: 0, throttle_level: 'normal', reset_at: new Date() }],
      })
    }
    return Promise.resolve({ rows: [] })
  }),
} as unknown as DbPool)

const MOCK_ANTHROPIC = {} as Anthropic

const BASE_DESCRIPTOR: InstrumentDescriptor = {
  shank:           { diameter_group: 'CA_HP', diameter_px: 28, length_px: 140 },
  head:            { diameter_px: 40, length_px: 80 },
  shape_class:     'cono_tondo',
  grit_indicator:  { type: 'ring_color', color: 'red', blade_density: null },
  surface_texture: 'diamond_grit',
  confidence:      0.92,
}

const MOCK_CANDIDATE: CatalogCandidate = {
  familyCode: 'H251', shapeDescription: 'Cono tondo', shapeClass: 'cono_tondo',
  sizeOptions: [60, 70, 80], productType: 'rotary_diamond', thumbnailPath: null,
}

const HIGH_CONFIDENCE: VisualConfirmation = {
  matched_family_code: 'H251', confidence: 0.95, reasoning: 'Exact match', runner_up: null,
}

const LOW_CONFIDENCE: VisualConfirmation = {
  matched_family_code: null, confidence: 0.72, reasoning: 'Uncertain', runner_up: 'H253',
}

function makeDeps(
  desc:    InstrumentDescriptor   = BASE_DESCRIPTOR,
  cands:   CatalogCandidate[]     = [MOCK_CANDIDATE],
  confirm: VisualConfirmation     = HIGH_CONFIDENCE,
  pool:    DbPool                 = makeMockPool(),
) {
  return {
    pool,
    anthropic:          MOCK_ANTHROPIC,
    dailyLimit:         500,
    timeoutMs:          90000,
    describeInstrument: vi.fn().mockResolvedValue(desc),
    searchCatalog:      vi.fn().mockResolvedValue(cands),
    confirmWithOpus:    vi.fn().mockResolvedValue(confirm),
  }
}

describe('runRecognitionPipeline', () => {
  test('confidence ≥ 0.85 + match → type="match" con familyCode e confidence', async () => {
    const { result } = await runRecognitionPipeline(
      makeDeps(), 'fake-b64', 'u1', 'agent', null,
    )
    expect(result.type).toBe('match')
    if (result.type === 'match') {
      expect(result.data.familyCode).toBe('H251')
      expect(result.data.confidence).toBe(0.95)
    }
  })

  test('SQL ritorna 0 candidati → type="not_found"', async () => {
    const { result } = await runRecognitionPipeline(
      makeDeps(BASE_DESCRIPTOR, [], HIGH_CONFIDENCE), 'fake-b64', 'u1', 'agent', null,
    )
    expect(result.type).toBe('not_found')
  })

  test('confidence < 0.85 → type="shortlist_visual" con candidati', async () => {
    const { result } = await runRecognitionPipeline(
      makeDeps(BASE_DESCRIPTOR, [MOCK_CANDIDATE], LOW_CONFIDENCE), 'fake-b64', 'u1', 'agent', null,
    )
    expect(result.type).toBe('shortlist_visual')
    if (result.type === 'shortlist_visual') {
      expect(result.data.candidates).toHaveLength(1)
      expect(result.data.candidates[0]!.familyCode).toBe('H251')
    }
  })

  test('arucoMm fornito → measurementSource="aruco"', async () => {
    const { result } = await runRecognitionPipeline(
      makeDeps(), 'fake-b64', 'u1', 'agent', 6.2,
    )
    expect(result.type).toBe('match')
    if (result.type === 'match') {
      expect(result.data.measurementSource).toBe('aruco')
    }
  })

  test('arucoMm null + CA_HP shank → measurementSource="shank_iso"', async () => {
    const { result } = await runRecognitionPipeline(
      makeDeps(), 'fake-b64', 'u1', 'agent', null,
    )
    expect(result.type).toBe('match')
    if (result.type === 'match') {
      expect(result.data.measurementSource).toBe('shank_iso')
    }
  })

  test('arucoMm null + unknown shank + 0 candidati → measurementSource="none" in not_found', async () => {
    const unknownDesc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'unknown', diameter_px: 0, length_px: 0 },
    }
    const { result } = await runRecognitionPipeline(
      makeDeps(unknownDesc, [], HIGH_CONFIDENCE), 'fake-b64', 'u1', 'agent', null,
    )
    expect(result.type).toBe('not_found')
    if (result.type === 'not_found') {
      expect(result.data.measurements.measurementSource).toBe('none')
    }
  })
})
```

- [ ] **Step 2: Esegui test — devono fallire**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose recognition-engine.spec 2>&1 | tail -30
```

Atteso: FAIL — il vecchio `recognition-engine.ts` non ha `describeInstrument` come dep iniettabile

- [ ] **Step 3: Riscrivi recognition-engine.ts**

Sostituisci l'intero contenuto di `archibald-web-app/backend/src/recognition/recognition-engine.ts`:

```typescript
import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { DbPool } from '../db/pool'
import type {
  RecognitionResult, BudgetState, CatalogCandidate,
  InstrumentDescriptor, MeasurementSummary, VisualConfirmation,
} from './types'
import { describeInstrument as defaultDescribe, computePxPerMm } from './instrument-descriptor'
import { buildSearchParams, searchCatalog as defaultSearch } from './catalog-searcher'
import { confirmWithOpus as defaultConfirm } from './visual-confirmer'
import { checkBudget, consumeBudget } from './budget-service'
import { getCached, setCached } from '../db/repositories/recognition-cache'
import { appendRecognitionLog } from '../db/repositories/recognition-log'
import { logger } from '../logger'

export type RecognitionEngineDeps = {
  pool:       DbPool
  anthropic:  Anthropic
  dailyLimit: number
  timeoutMs:  number
  // Injectable per i test
  describeInstrument?: (client: Anthropic, img: string, pxMm: number | null) => Promise<InstrumentDescriptor>
  searchCatalog?:      (pool: DbPool, params: ReturnType<typeof buildSearchParams>) => Promise<CatalogCandidate[]>
  confirmWithOpus?:    (client: Anthropic, img: string, candidates: CatalogCandidate[]) => Promise<VisualConfirmation>
}

type EngineResult = {
  result:       RecognitionResult
  budgetState:  BudgetState
  processingMs: number
  imageHash:    string
}

export async function runRecognitionPipeline(
  deps:        RecognitionEngineDeps,
  imageBase64: string,
  userId:      string,
  role:        string,
  arucoMm:     number | null,
  signal?:     AbortSignal,
): Promise<EngineResult> {
  const startMs   = Date.now()
  const imageHash = createHash('sha256').update(Buffer.from(imageBase64, 'base64')).digest('hex')

  const cached = await getCached(deps.pool, imageHash)
  if (cached) {
    const { budgetState } = await checkBudget(deps.pool, userId, role)
    return {
      result:       cached.result_json as RecognitionResult,
      budgetState,
      processingMs: Date.now() - startMs,
      imageHash,
    }
  }

  const { allowed, budgetState } = await checkBudget(deps.pool, userId, role)
  if (!allowed) {
    return { result: { type: 'budget_exhausted' }, budgetState, processingMs: Date.now() - startMs, imageHash }
  }

  const describe = deps.describeInstrument ?? defaultDescribe
  const search   = deps.searchCatalog      ?? defaultSearch
  const confirm  = deps.confirmWithOpus    ?? defaultConfirm

  let descriptor: InstrumentDescriptor
  try {
    descriptor = await describe(deps.anthropic, imageBase64, arucoMm)
  } catch (err) {
    logger.warn('[recognition-engine] InstrumentDescriptor failed', { err })
    return {
      result:       { type: 'error', data: { message: 'Servizio di riconoscimento temporaneamente non disponibile' } },
      budgetState,
      processingMs: Date.now() - startMs,
      imageHash,
    }
  }

  if (signal?.aborted) {
    return {
      result:       { type: 'error', data: { message: 'Richiesta annullata' } },
      budgetState,
      processingMs: Date.now() - startMs,
      imageHash,
    }
  }

  const pxPerMm          = computePxPerMm(descriptor, arucoMm)
  const measurementSource = arucoMm != null ? 'aruco' : (pxPerMm != null ? 'shank_iso' : 'none') as const
  const searchParams      = buildSearchParams(descriptor, pxPerMm)

  const candidates = await search(deps.pool, searchParams)

  if (candidates.length === 0) {
    const headMm = pxPerMm != null && descriptor.head.diameter_px > 0
      ? descriptor.head.diameter_px / pxPerMm
      : null
    const measurements: MeasurementSummary = {
      shankGroup:        descriptor.shank.diameter_group,
      headDiameterMm:    headMm,
      shapeClass:        descriptor.shape_class,
      measurementSource,
    }
    const result: RecognitionResult = { type: 'not_found', data: { measurements } }
    await setCached(deps.pool, imageHash, result, Buffer.from(imageBase64, 'base64'))
    await logResult(deps.pool, userId, imageHash, 'not_found', null, null)
    return { result, budgetState, processingMs: Date.now() - startMs, imageHash }
  }

  if (signal?.aborted) {
    return {
      result:       { type: 'error', data: { message: 'Richiesta annullata' } },
      budgetState,
      processingMs: Date.now() - startMs,
      imageHash,
    }
  }

  let confirmation: VisualConfirmation
  try {
    confirmation = await confirm(deps.anthropic, imageBase64, candidates)
  } catch (err) {
    logger.warn('[recognition-engine] VisualConfirmer failed', { err })
    return {
      result:       { type: 'error', data: { message: 'Servizio di riconoscimento temporaneamente non disponibile' } },
      budgetState,
      processingMs: Date.now() - startMs,
      imageHash,
    }
  }

  await consumeBudget(deps.pool)

  const headMm = pxPerMm != null && descriptor.head.diameter_px > 0
    ? descriptor.head.diameter_px / pxPerMm
    : null
  const headLengthMm = pxPerMm != null && descriptor.head.length_px > 0
    ? descriptor.head.length_px / pxPerMm
    : null

  let result: RecognitionResult
  if (confirmation.confidence >= 0.85 && confirmation.matched_family_code) {
    const match = candidates.find(c => c.familyCode === confirmation.matched_family_code)
    result = {
      type: 'match',
      data: {
        familyCode:        confirmation.matched_family_code,
        productName:       confirmation.matched_family_code,
        shankType:         descriptor.shank.diameter_group,
        headDiameterMm:    headMm,
        headLengthMm,
        shapeClass:        descriptor.shape_class,
        confidence:        confirmation.confidence,
        thumbnailUrl:      match?.thumbnailPath ?? null,
        discontinued:      false,
        measurementSource,
      },
    }
  } else {
    result = {
      type: 'shortlist_visual',
      data: {
        candidates: candidates.map(c => ({
          familyCode:      c.familyCode,
          thumbnailUrl:    c.thumbnailPath,
          referenceImages: [],
        })),
      },
    }
  }

  await setCached(deps.pool, imageHash, result, Buffer.from(imageBase64, 'base64'))
  await logResult(
    deps.pool, userId, imageHash,
    result.type === 'match' ? 'match' : 'shortlist',
    result.type === 'match' ? result.data.familyCode : null,
    result.type === 'match' ? result.data.confidence : null,
  )

  return { result, budgetState, processingMs: Date.now() - startMs, imageHash }
}

async function logResult(
  pool:       DbPool,
  userId:     string,
  imageHash:  string,
  state:      'match' | 'shortlist' | 'not_found' | 'error',
  productId:  string | null,
  confidence: number | null,
): Promise<void> {
  await appendRecognitionLog(pool, {
    user_id:      userId,
    image_hash:   imageHash,
    cache_hit:    false,
    product_id:   productId,
    confidence,
    result_state: state,
    tokens_used:  0,
    api_cost_usd: null,
  }).catch(() => {})
}
```

- [ ] **Step 4: Esegui test — devono passare**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose recognition-engine.spec 2>&1 | tail -30
```

Atteso: PASS

- [ ] **Step 5: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/recognition/recognition-engine.ts \
        archibald-web-app/backend/src/recognition/recognition-engine.spec.ts
git commit -m "feat(recognition): riscrittura recognition-engine — orchestrazione InstrumentDescriptor→SQL→VisualConfirmer"
```

---

## Task 7: Aggiorna routes/recognition.ts

**Files:**
- Modify: `archibald-web-app/backend/src/routes/recognition.ts`
- Modify: `archibald-web-app/backend/src/routes/recognition.spec.ts`

- [ ] **Step 1: Riscrivi routes/recognition.ts**

Sostituisci l'intero contenuto di `archibald-web-app/backend/src/routes/recognition.ts`:

```typescript
import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AuthRequest } from '../middleware/auth'
import type { DbPool } from '../db/pool'
import type { OperationType } from '../operations/operation-types'
import { runRecognitionPipeline, type RecognitionEngineDeps } from '../recognition/recognition-engine'
import { getBudgetRow, resetBudgetIfExpired } from '../db/repositories/recognition-budget'
import { logger } from '../logger'

type RecognitionRouterDeps = {
  pool:       DbPool
  anthropic:  Anthropic
  dailyLimit: number
  timeoutMs:  number
  queue?: {
    enqueue: (type: OperationType, userId: string, data: Record<string, unknown>) => Promise<string>
  }
}

const identifySchema = z.object({
  image:           z.string().min(10),
  aruco_px_per_mm: z.number().positive().optional(),
})

const feedbackSchema = z.object({
  imageHash:       z.string().regex(/^[0-9a-f]{64}$/),
  productId:       z.string().min(1),
  confirmedByUser: z.boolean(),
})

function createRecognitionRouter(deps: RecognitionRouterDeps) {
  const router = Router()

  const rateLimitMap = new Map<string, number[]>()
  const RATE_LIMIT_MAX       = 10
  const RATE_LIMIT_WINDOW_MS = 60_000

  function isRateLimited(userId: string): boolean {
    const now    = Date.now()
    const recent = (rateLimitMap.get(userId) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS)
    recent.push(now)
    rateLimitMap.set(userId, recent)
    if (recent.length === 1) {
      setTimeout(() => {
        const ts = rateLimitMap.get(userId)
        if (ts && !ts.some(t => t > now)) rateLimitMap.delete(userId)
      }, RATE_LIMIT_WINDOW_MS)
    }
    return recent.length > RATE_LIMIT_MAX
  }

  router.post('/identify', async (req: AuthRequest, res) => {
    const parsed = identifySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'image (base64 string) required' })
      return
    }

    const userId = req.user!.userId
    const role   = req.user!.role

    if (isRateLimited(userId)) {
      res.status(429).json({ error: 'Troppe richieste. Attendi un minuto.' })
      return
    }

    const { image, aruco_px_per_mm } = parsed.data
    const abortController = new AbortController()
    req.on('close', () => { if (!res.headersSent) abortController.abort() })

    const engineDeps: RecognitionEngineDeps = {
      pool:       deps.pool,
      anthropic:  deps.anthropic,
      dailyLimit: deps.dailyLimit,
      timeoutMs:  deps.timeoutMs,
    }

    try {
      const { result, budgetState, processingMs, imageHash } =
        await runRecognitionPipeline(
          engineDeps,
          image,
          userId,
          role,
          aruco_px_per_mm ?? null,
          abortController.signal,
        )
      if (res.headersSent) return
      res.json({ result, budgetState, processingMs, imageHash })
    } catch (error) {
      if (res.headersSent) return
      logger.error('[recognition] identify failed', { error })
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.post('/feedback', async (req: AuthRequest, res) => {
    const parsed = feedbackSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'imageHash, productId, confirmedByUser required' })
      return
    }
    const { imageHash, productId, confirmedByUser } = parsed.data
    const userId = req.user!.userId
    if (!confirmedByUser) { res.json({ queued: false }); return }
    if (deps.queue) {
      await deps.queue.enqueue('recognition-feedback', userId, { imageHash, productId, userId })
      res.json({ queued: true })
    } else {
      res.json({ queued: false })
    }
  })

  router.get('/budget', async (_req: AuthRequest, res) => {
    try {
      await resetBudgetIfExpired(deps.pool)
      const row = await getBudgetRow(deps.pool)
      if (!row) {
        res.json({ dailyLimit: deps.dailyLimit, usedToday: 0, throttleLevel: 'normal' })
        return
      }
      res.json({
        dailyLimit:    row.daily_limit,
        usedToday:     row.used_today,
        throttleLevel: row.throttle_level,
        resetAt:       row.reset_at,
      })
    } catch (error) {
      logger.error('[recognition] get budget failed', { error })
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}

export { createRecognitionRouter }
export type { RecognitionRouterDeps }
```

- [ ] **Step 2: Riscrivi routes/recognition.spec.ts**

Sostituisci l'intero contenuto di `archibald-web-app/backend/src/routes/recognition.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { createRecognitionRouter } from './recognition'
import type { DbPool } from '../db/pool'

vi.mock('../recognition/recognition-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../recognition/recognition-engine')>()
  return {
    ...actual,
    runRecognitionPipeline: vi.fn().mockResolvedValue({
      result:       { type: 'budget_exhausted' },
      budgetState:  { dailyLimit: 500, usedToday: 0, throttleLevel: 'normal', resetAt: new Date() },
      processingMs: 10,
      imageHash:    'a'.repeat(64),
    }),
  }
})

const TINY_IMAGE = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH'
  + 'BwYIDAoMCwsKCwsNCxAQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAARC'
  + 'AABAAEDASIA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAA'
  + 'AAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9k='

function makeApp(pool: DbPool) {
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use((req: any, _res, next) => {
    req.user = { userId: 'test-user', role: 'agent', username: 'test' }
    next()
  })
  app.use('/api/recognition', createRecognitionRouter({
    pool,
    anthropic:  new Anthropic({ apiKey: 'test-key' }),
    dailyLimit: 500,
    timeoutMs:  15000,
  }))
  return app
}

const EMPTY_POOL: DbPool = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
} as unknown as DbPool

describe('POST /api/recognition/identify', () => {
  test('returns 400 when image field missing', async () => {
    const app = makeApp(EMPTY_POOL)
    const res = await request(app)
      .post('/api/recognition/identify')
      .send({})
    expect(res.status).toBe(400)
  })

  test('returns result with imageHash when image provided', async () => {
    const app = makeApp(EMPTY_POOL)
    const res = await request(app)
      .post('/api/recognition/identify')
      .send({ image: TINY_IMAGE })
    expect(res.status).toBe(200)
    expect(res.body.imageHash).toBe('a'.repeat(64))
    expect(res.body.result.type).toBe('budget_exhausted')
  })

  test('accetta aruco_px_per_mm opzionale', async () => {
    const { runRecognitionPipeline } =
      await import('../recognition/recognition-engine') as any
    const app = makeApp(EMPTY_POOL)
    await request(app)
      .post('/api/recognition/identify')
      .send({ image: TINY_IMAGE, aruco_px_per_mm: 6.2 })
    expect(runRecognitionPipeline).toHaveBeenCalledWith(
      expect.anything(),
      TINY_IMAGE,
      'test-user',
      'agent',
      6.2,
      expect.anything(),
    )
  })

  test('ritorna 429 dopo 10 richieste rapide', async () => {
    const app = makeApp(EMPTY_POOL)
    const send = () => request(app).post('/api/recognition/identify').send({ image: TINY_IMAGE })
    for (let i = 0; i < 10; i++) await send()
    const res = await send()
    expect(res.status).toBe(429)
  })
})

describe('GET /api/recognition/budget', () => {
  test('restituisce dailyLimit quando non c\'è budget row', async () => {
    const app = makeApp(EMPTY_POOL)
    const res = await request(app).get('/api/recognition/budget')
    expect(res.status).toBe(200)
    expect(res.body.dailyLimit).toBe(500)
  })
})
```

- [ ] **Step 3: Esegui test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose recognition.spec 2>&1 | tail -30
```

Atteso: PASS

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/routes/recognition.ts \
        archibald-web-app/backend/src/routes/recognition.spec.ts
git commit -m "feat(recognition): route — aruco_px_per_mm, rimozione embeddingSvc/minSimilarity"
```

---

## Task 8: Pulisci catalog-family-images.ts — rimuovi funzioni ANN

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/catalog-family-images.ts`

- [ ] **Step 1: Verifica che nessun file usa ancora le funzioni ANN**

```bash
grep -rn "queryTopK\|updateEmbedding\|countIndexed\|getFallbackFamilies\|getIndexedFamilyCodes\|getIndexedFamilyStripKeys\|getIndexedCatalogFamilyKeys\|AnnCandidate" \
  archibald-web-app/backend/src/ 2>/dev/null
```

Atteso: nessun output (dopo i task precedenti nessun file le importa più). Se ci sono ancora riferimenti, rimuoverli prima di continuare.

- [ ] **Step 2: Riscrivi catalog-family-images.ts rimuovendo le funzioni ANN**

Sostituisci l'intero file con:

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

export type FamilyImageRow = {
  family_code: string
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
      row.family_code, row.source_type, row.source_url, row.local_path,
      row.priority,
      row.metadata ? JSON.stringify(row.metadata) : null,
    ],
  )
  return rows[0]!.id
}

export async function getBestRowsByFamilyCodes(
  pool:        DbPool,
  familyCodes: string[],
): Promise<FamilyImageRow[]> {
  if (familyCodes.length === 0) return []
  const { rows } = await pool.query<FamilyImageRow>(
    `SELECT DISTINCT ON (family_code) family_code, local_path, source_type, metadata
     FROM shared.catalog_family_images
     WHERE family_code = ANY($1)
     ORDER BY family_code, priority ASC`,
    [familyCodes],
  )
  return rows
}

export async function getFallbackFamilies(pool: DbPool, limit: number): Promise<string[]> {
  const { rows } = await pool.query<{ family_code: string }>(
    `SELECT DISTINCT family_code FROM shared.catalog_family_images ORDER BY family_code LIMIT $1`,
    [limit],
  )
  return rows.map(r => r.family_code)
}
```

Nota: `getFallbackFamilies` è mantenuto (usato da campionario-strip-cropper o script futuri) ma aggiornato per non filtrare su `visual_embedding` che non esiste più.

- [ ] **Step 3: Esegui build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -20
```

Atteso: nessun errore TypeScript

- [ ] **Step 4: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -10
```

Atteso: PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/catalog-family-images.ts
git commit -m "refactor(recognition): rimuovi funzioni ANN da catalog-family-images, fix getBestRowsByFamilyCodes senza visual_embedding"
```

---

## Task 9: Rimuovi componenti Jina — handlers, config, main.ts

**Files:**
- Delete: 7 file Jina (vedi sopra)
- Modify: `src/operations/operation-types.ts`, `src/config.ts`, `src/main.ts`

- [ ] **Step 1: Elimina i file Jina**

```bash
cd archibald-web-app/backend
git rm src/recognition/visual-embedding-service.ts \
       src/recognition/visual-embedding-service.spec.ts \
       src/operations/handlers/build-visual-index-handler.ts \
       src/operations/handlers/build-visual-index-handler.spec.ts \
       src/operations/handlers/index-catalog-pages-handler.ts \
       src/operations/handlers/index-catalog-pages-handler.spec.ts \
       src/operations/handlers/index-web-image-handler.ts
```

- [ ] **Step 2: Rimuovi i 3 tipi Jina da operation-types.ts**

In `archibald-web-app/backend/src/operations/operation-types.ts`, rimuovi le 3 righe con:
- `'build-visual-index'`
- `'index-catalog-pages'`
- `'index-web-image'`

sia dall'array/union `OperationType` che dalla mappa di concurrency.

- [ ] **Step 3: Rimuovi jinaApiKey e minSimilarity da config.ts**

In `archibald-web-app/backend/src/config.ts`, sezione `recognition: { ... }`, rimuovi:
```
jinaApiKey:    process.env.JINA_API_KEY || '',
minSimilarity: parseFloat(process.env.RECOGNITION_MIN_SIMILARITY || '0.20'),
```

- [ ] **Step 4: Aggiorna main.ts**

In `archibald-web-app/backend/src/main.ts`:

a. Rimuovi l'import:
```typescript
import { createVisualEmbeddingService } from './recognition/visual-embedding-service';
```

b. Rimuovi il blocco:
```typescript
const embeddingSvc = config.recognition.jinaApiKey
  ? createVisualEmbeddingService(config.recognition.jinaApiKey)
  : null
```

c. Rimuovi gli import dei 3 handler (cerca `createBuildVisualIndexHandler`, `createIndexCatalogPagesHandler`, `createIndexWebImageHandler`).

d. Nella creazione del recognition router, cambia i deps da:
```typescript
{
  pool, catalogVisionService, embeddingSvc,
  recognitionDailyLimit: config.recognition.dailyLimit,
  recognitionTimeoutMs:  config.recognition.timeoutMs,
  recognitionMinSimilarity: config.recognition.minSimilarity,
}
```
a:
```typescript
{
  pool,
  anthropic:  anthropicCatalogClient,
  dailyLimit: config.recognition.dailyLimit,
  timeoutMs:  config.recognition.timeoutMs,
}
```

e. Rimuovi il blocco condizionale con i 3 handler Jina dall'operationType map (cerca `'build-visual-index'`, `'index-catalog-pages'`, `'index-web-image'` nella map).

- [ ] **Step 5: Esegui build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -20
```

Atteso: nessun errore TypeScript

- [ ] **Step 6: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -10
```

Atteso: PASS

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/operations/operation-types.ts \
        archibald-web-app/backend/src/config.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "refactor(recognition): rimuovi Jina visual embedding — service, handlers, config, main.ts"
```

---

## Task 10: Migration 065 + fix catalog_reading_guide

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/065-drop-visual-embedding.sql`

- [ ] **Step 1: Crea la migration**

Crea il file `archibald-web-app/backend/src/db/migrations/065-drop-visual-embedding.sql`:

```sql
-- Drop HNSW index su visual_embedding (se esiste)
DROP INDEX IF EXISTS shared.catalog_family_images_visual_embedding_idx;

-- Drop colonne embedding (non più usate dopo recognition redesign)
ALTER TABLE shared.catalog_family_images
  DROP COLUMN IF EXISTS visual_embedding,
  DROP COLUMN IF EXISTS indexed_at;

-- Fix data quality: grana medium (107μm) = assenza dell'anello, non colore blu.
-- Correzione del valore errato "blue" in visual_cue.
UPDATE shared.catalog_reading_guide
SET content = jsonb_set(
  content,
  '{grit_systems,diamond,5,visual_cue}',
  '"none"'
)
WHERE content->'grit_systems'->'diamond'->5->>'micron' = '107';
```

- [ ] **Step 2: Applica migration su DB locale**

```bash
PG_HOST=localhost PG_DATABASE=archibald PG_USER=archibald npm run migrate --prefix archibald-web-app/backend
```

Atteso: `Migration 065-drop-visual-embedding.sql applied.`

- [ ] **Step 3: Verifica rimozione colonne**

```bash
psql -h localhost -U archibald -d archibald -c "
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'shared' AND table_name = 'catalog_family_images'
  ORDER BY ordinal_position;
"
```

Atteso: colonne `visual_embedding` e `indexed_at` NON presenti.

- [ ] **Step 4: Verifica fix grit medium**

```bash
psql -h localhost -U archibald -d archibald -c "
  SELECT content->'grit_systems'->'diamond'->5 AS medium_entry
  FROM shared.catalog_reading_guide;
"
```

Atteso: `visual_cue` = `"none"` (non `"blue"`).

- [ ] **Step 5: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/065-drop-visual-embedding.sql
git commit -m "feat(db): migration 065 — drop visual_embedding/indexed_at, fix grit medium visual_cue"
```

---

## Task 11: Test di integrazione pipeline E2E

**Files:**
- Create: `archibald-web-app/backend/src/recognition/recognition-pipeline.integration.spec.ts`

- [ ] **Step 1: Scrivi il test di integrazione**

Crea `archibald-web-app/backend/src/recognition/recognition-pipeline.integration.spec.ts`:

```typescript
import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { buildSearchParams, searchCatalog } from './catalog-searcher'
import { parseDescriptorJson, computePxPerMm } from './instrument-descriptor'
import type { InstrumentDescriptor } from './types'
import type { DbPool } from '../db/pool'

const CI      = process.env.CI === 'true'
const PG_HOST = process.env.PG_HOST

// Descriptor che simula H251 ACR: gambo CA_HP (Ø2.35mm), testa cono ~3.4mm, diamond, anello rosso
const H251_DESCRIPTOR: InstrumentDescriptor = {
  shank:           { diameter_group: 'CA_HP', diameter_px: 28, length_px: 140 },
  head:            { diameter_px: 40, length_px: 80 },   // 40 / 11.91 px/mm ≈ 3.36mm
  shape_class:     'cono_tondo',
  grit_indicator:  { type: 'ring_color', color: 'red', blade_density: null },
  surface_texture: 'diamond_grit',
  confidence:      0.92,
}

describe.skipIf(CI || !PG_HOST)('searchCatalog integration', () => {
  let pool: Pool

  beforeAll(() => {
    pool = new Pool({
      host:     process.env.PG_HOST,
      port:     parseInt(process.env.PG_PORT ?? '5432'),
      database: process.env.PG_DATABASE ?? 'archibald',
      user:     process.env.PG_USER ?? 'archibald',
      password: process.env.PG_PASSWORD,
    })
  })

  afterAll(() => pool.end())

  test('descriptor CA_HP + cono_tondo + diamond + red → almeno 1 candidato rotary_diamond', async () => {
    const pxPerMm  = computePxPerMm(H251_DESCRIPTOR, null)!   // 28/2.35 = 11.91
    const params   = buildSearchParams(H251_DESCRIPTOR, pxPerMm)
    const results  = await searchCatalog(pool as unknown as DbPool, params)

    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(5)
    expect(results.some(c => c.productType === 'rotary_diamond')).toBe(true)
  })

  test('head_px leggermente fuori tolleranza → ancora trova candidati (fallback ±0.4mm)', async () => {
    const descriptorOff: InstrumentDescriptor = {
      ...H251_DESCRIPTOR,
      head: { diameter_px: 50, length_px: 80 },   // 50/11.91 ≈ 4.2mm → fuori da ±0.3mm ma dentro ±0.4mm
    }
    const pxPerMm = computePxPerMm(descriptorOff, null)!
    const params  = buildSearchParams(descriptorOff, pxPerMm)
    const results = await searchCatalog(pool as unknown as DbPool, params)

    expect(results.length).toBeGreaterThan(0)
  })

  test('descriptor senza filtri (unknown/other) → max 5 risultati senza crash', async () => {
    const unknownDesc: InstrumentDescriptor = {
      shank:           { diameter_group: 'unknown', diameter_px: 0, length_px: 0 },
      head:            { diameter_px: 0, length_px: 0 },
      shape_class:     'altro',
      grit_indicator:  { type: 'unknown', color: null, blade_density: null },
      surface_texture: 'other',
      confidence:      0,
    }
    const params  = buildSearchParams(unknownDesc, null)
    const results = await searchCatalog(pool as unknown as DbPool, params)

    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeLessThanOrEqual(5)
  })
})

// Test unit (no DB) — sempre eseguiti
describe('parseDescriptorJson → computePxPerMm pipeline', () => {
  test('JSON valido → px_per_mm calcolato correttamente per CA_HP', () => {
    const parsed  = parseDescriptorJson(JSON.stringify(H251_DESCRIPTOR))
    const pxPerMm = computePxPerMm(parsed, null)
    expect(pxPerMm).toBeCloseTo(11.91)  // 28 / 2.35
  })

  test('JSON invalido → fallback → pxPerMm null (group=unknown)', () => {
    const parsed  = parseDescriptorJson('questa non è JSON')
    const pxPerMm = computePxPerMm(parsed, null)
    expect(pxPerMm).toBeNull()
  })

  test('ARUco 6.2 sovrascrive il calcolo dal gambo', () => {
    const parsed  = parseDescriptorJson(JSON.stringify(H251_DESCRIPTOR))
    const pxPerMm = computePxPerMm(parsed, 6.2)
    expect(pxPerMm).toBe(6.2)
  })
})
```

- [ ] **Step 2: Esegui i test unitari (no DB)**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose recognition-pipeline.integration.spec 2>&1 | tail -20
```

Atteso: i 3 test `describe('parseDescriptorJson → computePxPerMm pipeline')` PASS; i test `describe.skipIf(...)` skippati.

- [ ] **Step 3: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -10
```

Atteso: tutti i test passano

- [ ] **Step 4: Esegui type-check frontend (nessuna regressione)**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep "error TS" | head -10
```

Nota: il frontend usa ancora `result.state` — eventuali errori TS qui indicano che il frontend deve essere aggiornato nella spec UI separata (out-of-scope per questo piano).

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/recognition/recognition-pipeline.integration.spec.ts
git commit -m "test(recognition): integration test pipeline H251 descriptor→SQL→fallback"
```

---

## Self-Review

### Spec Coverage

| Requisito spec | Task che lo implementa |
|---|---|
| Migration 064: shape_class + keyword mapping + fix 123/124 + GIN index | Task 1 |
| Migration 065: drop visual_embedding + indexed_at | Task 10 |
| Fix catalog_reading_guide grit medium "blue"→"none" | Task 10 |
| InstrumentDescriptor — Haiku 4.5, JSON output strutturato, 8 campi | Task 3 |
| INSTRUMENT_DESCRIPTOR_MODEL configurabile via env | Task 3 |
| computePxPerMm — ARUco priority, fallback shank ISO | Task 3 |
| CatalogSearcher SQL 5 filtri + 6-step fallback progressivo (±0.3→±0.6mm) | Task 4 |
| SURFACE_TEXTURE_TO_PRODUCT_TYPES mapping completo | Task 4 |
| SHANK_GROUP_TO_DB_TYPES mapping con fix HPT | Task 4 |
| gritColor null per blade_count (dato non nel DB) | Task 4 |
| VisualConfirmer Opus 4.7, loadImages da thumbnailPath | Task 5 |
| RecognitionEngine orchestrazione con pipeline iniettabile | Task 6 |
| measurementSource = aruco / shank_iso / none | Task 6 |
| not_found → espone MeasurementSummary per debug | Task 6 |
| Route: aruco_px_per_mm nel request body | Task 7 |
| Route: nuova RecognitionResult shape (discriminant = type) | Task 7 |
| Rimozione funzioni ANN da catalog-family-images.ts | Task 8 |
| Fix getBestRowsByFamilyCodes senza visual_embedding filter | Task 8 |
| Rimozione visual-embedding-service.ts | Task 9 |
| Rimozione 3 operation handlers Jina | Task 9 |
| Rimozione config jinaApiKey + minSimilarity | Task 9 |
| Integration test pipeline H251 E2E | Task 11 |

### Consistenza dei tipi

- `ShapeClass` definita in `types.ts` → usata in `InstrumentDescriptor.shape_class`, `SearchParams.shapeClass`, `ProductMatch.shapeClass`, `MeasurementSummary.shapeClass`
- `CatalogCandidate` definita in `types.ts` → output di `catalog-searcher.ts`, input di `visual-confirmer.ts` e `recognition-engine.ts`
- `RecognitionResult` usa discriminant `type` (non `state`)

### Nota per il frontend

La `RecognitionResult` usa `type` invece di `state` come discriminant. Il codice frontend (`ToolRecognitionPage`, ecc.) usa ancora `result.state` e richiederà aggiornamento — questo è out-of-scope per questo piano e verrà gestito nella spec UI separata (da creare).
