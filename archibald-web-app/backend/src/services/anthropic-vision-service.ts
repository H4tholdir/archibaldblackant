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
    Returns up to 10 matching catalog entries ordered by relevance.`,
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
        description: 'Full visual description of the instrument in English',
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
    - Head shape (torpedo/chamfer, flame, round, cylinder, pear, inverted cone, diabolo...)
    - Colored ring at the BASE of the head where it meets the neck:
        transparent/none=ultrafine | yellow=extrafine | red=fine | blue=standard | green=coarse | black=super-coarse
    - If no ring: could be ultrafine (8μm), note very faint transparent band

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
Call search_catalog with your category (product_type), shank_type (if identified in Step 1), and description.
If the first search returns 0 results, retry without shank_type — the visual classification may be uncertain.

STEP 4 — VISUAL CONFIRMATION:
Call get_catalog_page with the catalog_page number from the best candidate.
Compare the photo with the instrument image in the catalog. Focus on head shape and proportions.
Maximum 2 catalog page lookups per search round.

STEP 5 — SUBMIT (MANDATORY after Step 4):
Call submit_identification immediately. Do NOT call any other tools after this.
- Identified: product_code = "FAMILY.SHANK.SIZE", confidence > 0.7
- Uncertain (2-3 options): product_code = "", fill candidates array, confidence 0.4-0.7
- Not found: product_code = "", candidates = [], confidence = 0
Always call submit_identification even if uncertain.`

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
    $1 IS NULL
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
ORDER BY _rank DESC, catalog_page
LIMIT 10
`

type SearchCatalogInput = {
  shank_type?:   string
  product_type?: string
  description:   string
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
    async identifyFromImage(imageBase64, signal) {
      const controller    = new AbortController()
      const timer         = setTimeout(() => controller.abort(), deps.timeoutMs)
      const onExternalAbort = () => controller.abort()
      signal?.addEventListener('abort', onExternalAbort)

      try {
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
          logger.info('[vision] search_catalog', { description: input.description, product_type: input.product_type, shank_type: input.shank_type })
          const result = await runSearchCatalog(deps.pool, input)
          const parsed = JSON.parse(result) as unknown[]
          logger.info('[vision] search_catalog results', { count: parsed.length })
          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content:     result,
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

async function runSearchCatalog(pool: DbPool, input: SearchCatalogInput): Promise<string> {
  const shankType   = input.shank_type   ?? null
  const productType = input.product_type ?? null

  // Convert description to OR-based websearch query so single matching terms suffice
  const orQuery = input.description
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .join(' OR ')

  const { rows } = await pool.query(SEARCH_CATALOG_SQL, [shankType, productType, orQuery])
  return JSON.stringify(rows)
}
