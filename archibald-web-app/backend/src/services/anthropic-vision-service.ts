import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages/messages.js'
import type { DbPool } from '../db/pool'
import type { CatalogVisionService } from '../recognition/recognition-engine'
import type { IdentificationResult } from '../recognition/types'
import type { CatalogPdfService } from './catalog-pdf-service'
import { logger } from '../logger'

export type VisionApiFn = (imageBase64: string, signal?: AbortSignal) => Promise<IdentificationResult>

export type CatalogVisionServiceDeps = {
  apiKey:     string
  timeoutMs:  number
  pool:       DbPool
  catalogPdf: CatalogPdfService
}

const SEARCH_CATALOG_TOOL: Anthropic.Tool = {
  name: 'search_catalog',
  description: `Search the Komet catalog database for product families matching your visual description.
    Call this after Step 1 (shank type identification) and Step 2 (visual observation).
    Provide the most detailed description possible: instrument type, head shape, material, colored ring or absence.
    Returns up to 10 matching catalog entries ordered by relevance, PLUS a catalog page image of the top result for immediate visual comparison.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      shank_type: {
        type: 'string',
        description: 'Shank type identified visually: "fg" (turbine, short) | "ca" (contra-angle, medium) | "hp" (straight handpiece, long). Omit if unsure.',
      },
      product_type: {
        type: 'string',
        description: 'rotary_diamond|rotary_carbide|diao|sonic|polisher_composite|polisher_ceramic|polisher_amalgam|endodontic|root_post|lab_carbide|accessory|other',
      },
      description: {
        type: 'string',
        description: 'Full visual description in English. For rotary_diamond: always specify tip shape ("rounded/blunt tip" for torpedo vs "sharply pointed tip" for flame).',
      },
      grit_color: {
        type: 'string',
        description: 'Color of the ring band at the head-neck junction for rotary_diamond burs: "blue"|"red"|"yellow"|"green"|"black"|"white". Omit if not a diamond bur or ring not clearly visible.',
      },
    },
    required: ['description'],
  },
}

const GET_CATALOG_PAGE_TOOL: Anthropic.Tool = {
  name: 'get_catalog_page',
  description: `Get a specific page from the Komet 2025 catalog as an image.
    Use this to visually compare the photographed instrument with catalog images and confirm identification.
    The catalog page number is returned in search_catalog results.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      page_number: { type: 'integer', minimum: 1, maximum: 782 },
    },
    required: ['page_number'],
  },
}

const SUBMIT_IDENTIFICATION_TOOL: Anthropic.Tool = {
  name: 'submit_identification',
  description: `Submit your final identification after completing visual confirmation (Step 4).
    MUST be called after get_catalog_page. Do NOT call search_catalog or get_catalog_page after this.
    If identified: set product_code to "FAMILY.SHANK.SIZE".
    If 2-3 candidates: leave product_code empty, list all in candidates.
    If not found: leave product_code empty, empty candidates.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      product_code: {
        type: 'string',
        description: 'Product code in FAMILY.SHANK.SIZE format (e.g. "879.104.014"), or empty string if uncertain/not found',
      },
      candidates: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of 2-3 candidate product codes when uncertain (e.g. ["858.316.014","859.316.014"])',
      },
      confidence: {
        type: 'number',
        description: 'Confidence level 0.0–1.0',
      },
      reasoning: {
        type: 'string',
        description: 'Brief explanation of identification steps and conclusion',
      },
    },
    required: ['product_code', 'confidence', 'reasoning'],
  },
}

const IDENTIFICATION_PROMPT = `You are analyzing a photo of a Komet dental instrument.
The instrument is centered in the frame. No ruler is present — identify using visual shape, proportions, and catalog comparison.

STEP 0 — IDENTIFY CATEGORY (this determines ALL subsequent steps):
Look at the overall impression of the object before anything else.

  Rose-gold / pink-gold shank or body color?        → diao
  Rubber/silicone: soft, matte, cup or disc?         → polisher_composite / polisher_ceramic / polisher_amalgam
  Very long tapered metal tip + colored stop ring?   → endodontic (NiTi file)
  Small round/bullet head on long narrow shank?      → endodontic (Gates Glidden)
  Flat wedge/triangle tip, threaded base, no ISO shank? → sonic
  Tapered smooth or threaded metal pin (no rotary shank)? → root_post
  Large head, no clinical shank or very long lab shank?   → lab_carbide
  Silver/grey metal, visible helical CUTTING FLUTES on head? → rotary_carbide
  Grey/dark head, ROUGH matte gritty texture (no sharp flutes)? → rotary_diamond
  Default if unclear: → rotary_diamond

STEP 1 — IDENTIFY SHANK TYPE visually (rotary_diamond / rotary_carbide / diao / lab_carbide only):
Compare the shank length to the working head length — this ratio is independent of camera distance:

  FG (turbine):        Instrument looks VERY SHORT overall (≈ width of two fingers).
                       Shank is only 2–3× longer than the head. Shank has a flat or ball tip.
                       → shank_type = "fg"

  CA (contra-angle):   Medium length. Shank has a visible latch notch or textured band.
                       Shank is 2–4× longer than the head.
                       → shank_type = "ca"

  HP (straight hand.): Instrument looks CLEARLY LONG. Shank is smooth, straight, and
                       4–7× longer than the working head.
                       → shank_type = "hp"

  Unsure?              Omit shank_type from search_catalog — do not guess.
→ Skip this step for: polisher, sonic, endodontic, root_post

STEP 2 — OBSERVE (category-specific):

  For rotary_diamond:
    - Head shape — examine the TIP first (this is the key discriminator):
        • TORPEDO / CHAMFER: body is cylindrical or slightly tapered; tip ends BLUNT or ROUNDED
          (like a bullet or missile nose). The apex is dome-shaped — NO sharp point.
          Search with: "torpedo chamfer rounded tip"
        • FLAME: body tapers continuously to a SHARPLY POINTED apex (like a candle flame).
          The very tip comes to a fine acute point with no rounding whatsoever.
          Search with: "flame pointed tip"
        • Other shapes: round (sphere head), cylinder (flat end), pear (wider mid-body),
          inverted cone (truncated cone widening toward tip), diabolo (hourglass/biconcave)
    - Colored ring at the BASE of the head where it meets the neck:
        transparent/none=ultrafine | yellow=extrafine | red=fine | blue=standard | green=coarse | black=super-coarse
    - CRITICAL: if NO colored ring visible → the family does NOT have a ring (no-ring variants or 879)
      → Do NOT conclude "standard grit" or "blue ring" without seeing the blue ring
      → Standard grit (families 863, 862, 860 etc.) has a VISIBLE BLUE ring — if absent, do NOT pick standard
      → Omit grit_color from search_catalog when ring is absent or unclear

  For rotary_carbide:
    - Head shape
    - Count blade density (cutting flutes on head):
        ~30 blades = ultrafine | ~16-20 = fine | ~8-12 = standard | ~6 = coarse
    - Cross-cut pattern? (double-cut carbides, e.g. H33)
    - Note: carbide color ring is on the SHANK NECK (= series marker, not grit)

  For diao:
    - Head shape (material already identified from rose-gold color)
    - Overall head size relative to shank

  For polisher_*:
    - Head BODY COLOR = grit: blue=coarse | pink=medium | gray/white=fine | yellow=ultrafine
    - Head shape: pointed_cup | torpedo | truncated_cone | flat_disc | mushroom | ring/unmounted
    - Shank type: FG / CA / unmounted

  For endodontic (NiTi file):
    - Stop ring / handle color = ISO tip size:
        white=015 | yellow=020 | red=025 | blue=030 | green=035 | black=040 | white=045 | yellow=050
    - Visual taper (narrow vs wide convergence along the body)
    - Reciprocating single-file (Procodile) vs multi-file kit

  For root_post:
    - Body material: white ceramic (CeraPost) | grey titanium | gold-platinum alloy
    - Collar color = canal size: yellow=050 | orange=070 | red=090 | blue=110
    - Surface: smooth tapered | threaded straight | christmas-tree threaded
    - Has a coronal head? (for direct build-up variants)

  For sonic:
    - Tip geometry (flat blade, lance, triangle, beak)
    - Angulation
    - No ISO shank — identify by shape only

STEP 3 — SEARCH the catalog:
Call search_catalog with: product_type, shank_type (if identified), description,
and grit_color if it is a rotary_diamond with a clearly visible ring color.
→ search_catalog automatically returns a catalog page image of the TOP result for visual comparison.
If the first search returns 0 results, retry without shank_type and/or grit_color.

STEP 4 — VISUAL CONFIRMATION (compare PHOTO to CATALOG ILLUSTRATION directly):
A catalog page may show multiple similar bur shapes side by side (e.g., torpedo next to flame).
For EACH relevant bur illustrated on the catalog page:
  a) Look at its depicted TIP: ROUNDED/BLUNT (torpedo) vs SHARP/POINTED (flame)?
  b) Compare that illustration's tip directly with the TIP in the PHOTOGRAPH.
  c) Pick the entry whose illustration best matches the ACTUAL photographed instrument.
CRITICAL: your Step 2 text description may be wrong — visual illustration comparison OVERRIDES it.
  → If the rounded-tip illustration matches the photo better than the pointed-tip one: pick torpedo.
  → If the pointed-tip illustration matches the photo better: pick flame.
If neither matches, call get_catalog_page for a different catalog_page from the JSON results.
Maximum 1 additional get_catalog_page call per search round.

STEP 5 — SUBMIT (MANDATORY after Step 4):
Call submit_identification immediately. Do NOT call any other tools after this.
- Identified: product_code = "FAMILY.SHANK.SIZE", confidence > 0.7
- Uncertain (2-3 options): product_code = "", fill candidates array, confidence 0.4-0.7
- Not found: product_code = "", candidates = [], confidence = 0
Always call submit_identification even if uncertain.

MANDATORY SHORTLIST — HP rotary_diamond without visible grit ring:
If shank=HP + rotary_diamond + no clearly visible grit ring color:
  → Family 879 (torpedo/chamfer, size 014 ONLY, HP ONLY) is a strong candidate.
  → ALWAYS return candidates array including "879.104.014" alongside your top flame match.
  → Set confidence 0.45, product_code = "", candidates = ["863.104.016","879.104.014"]
  → Exception: exclude 879 only if you see a CLEARLY DIFFERENT tip (e.g., very long head >12mm
    or clearly spherical/round head — shapes that are NOT torpedo/chamfer/flame).
  → Note: torpedo burs often appear as if pointed in side-view photos due to chamfer angle.`

const SEARCH_CATALOG_SQL = `
SELECT id, family_codes, catalog_page, product_type,
       shape_description, material_description, identification_clues,
       grit_options, shank_options, size_options, rpm_max, clinical_indications,
       ts_rank(
         to_tsvector('simple',
           COALESCE(shape_description,'') || ' ' ||
           COALESCE(material_description,'') || ' ' ||
           COALESCE(identification_clues,'')),
         websearch_to_tsquery('simple', CASE WHEN $3 = '' THEN 'x' ELSE $3 END)
       ) AS _rank
FROM shared.catalog_entries
WHERE
  (
    $1::text IS NULL
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(shank_options) s
      WHERE s->>'type' = $1
    )
  )
  AND ($2::text IS NULL OR product_type = $2)
  AND (
    $3 = ''
    OR to_tsvector('simple',
         COALESCE(shape_description,'') || ' ' ||
         COALESCE(material_description,'') || ' ' ||
         COALESCE(identification_clues,''))
       @@ websearch_to_tsquery('simple', $3)
  )
  AND (
    $4::text IS NULL
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(grit_options) g
      WHERE g->>'grit_indicator_type' = 'ring_color'
        AND g->>'visual_cue' = $4
    )
  )
ORDER BY _rank DESC, catalog_page
LIMIT 10
`

type SearchCatalogInput = {
  shank_type?:   string
  product_type?: string
  description:   string
  grit_color?:   string
}

type GetCatalogPageInput = {
  page_number: number
}

type SubmitIdentificationInput = {
  product_code: string
  candidates?:  string[]
  confidence:   number
  reasoning:    string
}

export function parseIdentificationResult(
  text:            string,
  lastCatalogPage: number | null,
  usage:           { inputTokens: number; outputTokens: number },
): IdentificationResult {
  const productCodePattern = /\b[A-Za-z0-9]+\.\d{3}\.\d{3}\b/g
  const matches = [...text.matchAll(productCodePattern)].map(m => m[0]!)
  const unique   = [...new Set(matches)]

  const lowerText = text.toLowerCase()
  let confidence = 0.7
  if (lowerText.includes('uncertain') || lowerText.includes('unsure') || lowerText.includes('unclear') || lowerText.includes('cannot')) {
    confidence = 0.5
  } else if (lowerText.includes('likely') || lowerText.includes('probably')) {
    confidence = 0.75
  } else if (lowerText.includes('confident') || lowerText.includes('certainly') || lowerText.includes('clearly')) {
    confidence = 0.9
  }

  if (unique.length === 0) {
    return {
      productCode:  null,
      familyCode:   null,
      confidence,
      resultState:  'not_found',
      candidates:   [],
      catalogPage:  lastCatalogPage,
      reasoning:    text,
      usage,
    }
  }

  if (unique.length === 1) {
    const code = unique[0]!
    return {
      productCode:  code,
      familyCode:   code.split('.')[0] ?? null,
      confidence,
      resultState:  'match',
      candidates:   [],
      catalogPage:  lastCatalogPage,
      reasoning:    text,
      usage,
    }
  }

  return {
    productCode:  unique[0]!,
    familyCode:   unique[0]!.split('.')[0] ?? null,
    confidence,
    resultState:  'shortlist',
    candidates:   unique,
    catalogPage:  lastCatalogPage,
    reasoning:    text,
    usage,
  }
}

function parseFromSubmitTool(
  input:          SubmitIdentificationInput,
  lastCatalogPage: number | null,
  usage:           { inputTokens: number; outputTokens: number },
): IdentificationResult {
  const base = { catalogPage: lastCatalogPage, reasoning: input.reasoning, usage }

  // Komet product codes: FAMILY.SHANK.SIZE — family may contain letters (e.g. H79NEX, ZR6801)
  const PRODUCT_CODE_RE = /^[A-Za-z0-9]+\.\d{3}\.\d{3}$/

  if (input.product_code && PRODUCT_CODE_RE.test(input.product_code)) {
    return {
      ...base,
      productCode: input.product_code,
      familyCode:  input.product_code.split('.')[0] ?? null,
      confidence:  input.confidence,
      resultState: 'match',
      candidates:  [],
    }
  }

  const candidates = (input.candidates ?? []).filter(c => PRODUCT_CODE_RE.test(c))
  if (candidates.length >= 2) {
    return {
      ...base,
      productCode: candidates[0]!,
      familyCode:  candidates[0]!.split('.')[0] ?? null,
      confidence:  input.confidence,
      resultState: 'shortlist',
      candidates,
    }
  }

  return {
    ...base,
    productCode: null,
    familyCode:  null,
    confidence:  input.confidence,
    resultState: 'not_found',
    candidates:  [],
  }
}

export function createCatalogVisionService(deps: CatalogVisionServiceDeps): CatalogVisionService {
  const client = new Anthropic({ apiKey: deps.apiKey, maxRetries: 0 })

  return {
    async identifyFromImage(imageBase64, signal, disambiguationCandidates) {
      const controller    = new AbortController()
      const timer         = setTimeout(() => controller.abort(), deps.timeoutMs)
      const onExternalAbort = () => controller.abort()
      signal?.addEventListener('abort', onExternalAbort)

      try {
        if (disambiguationCandidates && disambiguationCandidates.length >= 2) {
          return await runDisambiguationLoop(client, deps.pool, imageBase64, disambiguationCandidates, controller.signal)
        }
        return await runAgenticLoop(client, deps, imageBase64, controller.signal)
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onExternalAbort)
      }
    },
  }
}

async function runAgenticLoop(
  client:      Anthropic,
  deps:        CatalogVisionServiceDeps,
  imageBase64: string,
  signal:      AbortSignal,
): Promise<IdentificationResult> {
  const MAX_ITERATIONS  = 10
  let totalInputTokens  = 0
  let totalOutputTokens = 0
  let lastCatalogPage: number | null = null

  const messages: MessageParam[] = [
    {
      role:    'user',
      content: [
        {
          type:   'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
        },
        {
          type: 'text',
          text: IDENTIFICATION_PROMPT,
        },
      ],
    },
  ]

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await client.messages.create(
      {
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        tools:      [SEARCH_CATALOG_TOOL, GET_CATALOG_PAGE_TOOL, SUBMIT_IDENTIFICATION_TOOL],
        messages,
      },
      { signal },
    )

    totalInputTokens  += response.usage.input_tokens
    totalOutputTokens += response.usage.output_tokens

    const usage = { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text')
      const text      = textBlock?.type === 'text' ? textBlock.text : ''
      return parseIdentificationResult(text, lastCatalogPage, usage)
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content })

      const toolResults: ToolResultBlockParam[] = []
      let submitResult: IdentificationResult | null = null

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        if (block.name === 'search_catalog') {
          const input = block.input as SearchCatalogInput
          logger.info('[vision] search_catalog', { description: input.description, product_type: input.product_type, shank_type: input.shank_type, grit_color: input.grit_color })
          const { jsonResult, topCatalogPage } = await runSearchCatalog(deps.pool, input)
          const parsed = JSON.parse(jsonResult) as unknown[]
          logger.info('[vision] search_catalog results', { count: parsed.length, topCatalogPage })

          const toolContent: ToolResultBlockParam['content'] = [{ type: 'text', text: jsonResult }]

          if (topCatalogPage !== null) {
            try {
              lastCatalogPage = topCatalogPage
              const rawBase64 = await deps.catalogPdf.getPageAsBase64(topCatalogPage)
              const croppedBase64 = await cropCatalogPageImage(rawBase64)
              toolContent.push({
                type:   'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: croppedBase64 },
              })
            } catch (err) {
              logger.warn('[vision] failed to fetch catalog page for search result', { page: topCatalogPage, err })
            }
          }

          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content:     toolContent,
          })
        } else if (block.name === 'get_catalog_page') {
          const input = block.input as GetCatalogPageInput
          lastCatalogPage = input.page_number
          logger.info('[vision] get_catalog_page', { page: input.page_number })
          const base64 = await deps.catalogPdf.getPageAsBase64(input.page_number)
          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content:     [
              {
                type:   'image',
                source: { type: 'base64', media_type: 'image/png', data: base64 },
              },
            ],
          })
        } else if (block.name === 'submit_identification') {
          const input = block.input as SubmitIdentificationInput
          logger.info('[vision] submit_identification', { product_code: input.product_code, candidates: input.candidates, confidence: input.confidence, reasoning: input.reasoning })
          submitResult = parseFromSubmitTool(input, lastCatalogPage, usage)
          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content:     'Identification submitted.',
          })
        }
      }

      // submit_identification called → exit immediately
      if (submitResult !== null) return submitResult

      messages.push({ role: 'user', content: toolResults })
      continue
    }

    const textBlock = response.content.find(b => b.type === 'text')
    const text      = textBlock?.type === 'text' ? textBlock.text : ''
    return parseIdentificationResult(text, lastCatalogPage, usage)
  }

  return {
    productCode:  null,
    familyCode:   null,
    confidence:   0,
    resultState:  'not_found',
    candidates:   [],
    catalogPage:  lastCatalogPage,
    reasoning:    'Max iterations reached without a final answer',
    usage:        { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  }
}

async function runDisambiguationLoop(
  client:      Anthropic,
  pool:        DbPool,
  imageBase64: string,
  candidates:  string[],
  signal:      AbortSignal,
): Promise<IdentificationResult> {
  // Fetch shape descriptions for each candidate family from DB
  const familyCodes = [...new Set(candidates.map(c => c.split('.')[0] ?? c))]
  const { rows } = await pool.query<{ family_codes: string[]; shape_description: string }>(
    `SELECT family_codes, shape_description FROM shared.catalog_entries
     WHERE family_codes && $1 ORDER BY catalog_page LIMIT 20`,
    [familyCodes],
  )

  const familyDescMap = new Map<string, string>()
  for (const row of rows) {
    for (const fc of row.family_codes) {
      if (!familyDescMap.has(fc)) familyDescMap.set(fc, row.shape_description)
    }
  }

  const candidateLines = candidates.map(code => {
    const fc   = code.split('.')[0] ?? code
    const desc = familyDescMap.get(fc) ?? fc
    return `  - ${code}: ${desc}`
  }).join('\n')

  const prompt = `You are confirming the identification of a Komet dental instrument.
A previous scan of the FULL instrument returned these candidates:
${candidateLines}

This photo shows the instrument head more closely.
Your ONLY task: examine the TIP SHAPE of the head and pick the correct candidate.

TIP SHAPE rules:
  - ROUNDED / BLUNT end (dome-shaped, like a bullet nose) → torpedo/chamfer family (879)
  - SHARPLY POINTED end (tapers continuously to fine apex) → flame family (863, 862, 860)

Look very carefully at the very apex. Then call submit_identification immediately.
- If clearly one candidate: product_code = that code, confidence > 0.75
- If still uncertain: product_code = "", candidates = remaining 2, confidence 0.5`

  const messages: MessageParam[] = [
    {
      role:    'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: prompt },
      ],
    },
  ]

  const response = await client.messages.create(
    {
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      tools:      [SUBMIT_IDENTIFICATION_TOOL],
      messages,
    },
    { signal },
  )

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
  logger.info('[vision] disambiguation result', { stop_reason: response.stop_reason, content_types: response.content.map(b => b.type) })

  for (const block of response.content) {
    if (block.type === 'tool_use' && block.name === 'submit_identification') {
      const input = block.input as SubmitIdentificationInput
      logger.info('[vision] disambiguation submit_identification', { product_code: input.product_code, confidence: input.confidence, reasoning: input.reasoning })
      return parseFromSubmitTool(input, null, usage)
    }
  }

  // Fallback: parse text if no tool call
  const textBlock = response.content.find(b => b.type === 'text')
  const text      = textBlock?.type === 'text' ? textBlock.text : ''
  return parseIdentificationResult(text, null, usage)
}

async function runSearchCatalog(
  pool:  DbPool,
  input: SearchCatalogInput,
): Promise<{ jsonResult: string; topCatalogPage: number | null }> {
  const shankType   = input.shank_type   ?? null
  const productType = input.product_type ?? null
  const gritColor   = input.grit_color   ?? null

  // Convert description to OR-based websearch query so single matching terms suffice
  let orQuery = input.description
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .join(' OR ')

  // For rotary_diamond: always include torpedo/chamfer terms alongside any flame description
  // so that both shape families appear in results (flame and torpedo look similar in photos)
  if (productType === 'rotary_diamond') {
    orQuery += ' OR torpedo OR chamfer OR rounded'
  }

  const { rows } = await pool.query(SEARCH_CATALOG_SQL, [shankType, productType, orQuery, gritColor])

  const topRow = rows[0] as { catalog_page?: number } | undefined
  const topCatalogPage = topRow?.catalog_page ?? null

  return { jsonResult: JSON.stringify(rows), topCatalogPage }
}

/** Crop catalog page to relevant product portion and resize for efficient API use. */
async function cropCatalogPageImage(base64Png: string): Promise<string> {
  const sharp = (await import('sharp')).default
  const buf   = Buffer.from(base64Png, 'base64')
  const meta  = await sharp(buf).metadata()
  const w     = meta.width  ?? 800
  const h     = meta.height ?? 1100

  // Keep top 72% of the page (product illustration + description, skip barcode/ordering section)
  const cropH = Math.floor(h * 0.72)

  return sharp(buf)
    .extract({ left: 0, top: 0, width: w, height: cropH })
    .resize({ width: Math.floor(w * 0.65) })
    .jpeg({ quality: 78 })
    .toBuffer()
    .then(b => b.toString('base64'))
}
