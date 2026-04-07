import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages/messages.js'
import type { DbPool } from '../db/pool'
import type { CatalogVisionService } from '../recognition/recognition-engine'
import type { IdentificationResult } from '../recognition/types'
import type { CatalogPdfService } from './catalog-pdf-service'

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
    Call this after Step 2 (visual analysis).
    Provide the most detailed description possible: instrument type, shape, material, shank length measured from ruler, colored ring or absence.
    Returns up to 10 matching catalog entries ordered by catalog page.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      shank_length_mm: {
        type: 'number',
        description: 'Shank length measured from ruler in mm (optional)',
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

const IDENTIFICATION_PROMPT = `You are analyzing a photo of a Komet dental instrument.
The Komet catalog page 7 ruler (0–160 mm scale) is visible in the photo.

STEP 0 — IDENTIFY CATEGORY (this determines ALL subsequent steps):
Look at the overall impression of the object before anything else.

  Rose-gold / pink-gold shank or body color?      → diao
  Rubber/silicone: soft, matte, cup or disc?       → polisher_composite / polisher_ceramic / polisher_amalgam
  Very long tapered metal tip + colored stop ring? → endodontic (NiTi file)
  Small round/bullet head on long narrow shank?    → endodontic (Gates Glidden)
  Flat wedge/triangle tip, threaded base, no ISO shank? → sonic
  Tapered smooth or threaded metal pin (no rotary shank)? → root_post
  Large head, no clinical shank or very long lab shank?   → lab_carbide
  Silver/grey metal, visible helical CUTTING FLUTES on head? → rotary_carbide
  Grey/dark head, matte abrasive texture (no flutes) + ring? → rotary_diamond
  Default if unclear: → rotary_diamond

STEP 1 — MEASURE from the ruler (rotary_diamond / rotary_carbide / diao / lab_carbide only):
- Total instrument length
- Shank length (from base to head junction)
- Head length (from junction to tip)
→ Shank length identifies the shank code:
  FG (turbine):         313=18mm, 314=19mm, 315=21mm, 316=25mm
  CA (contra-angle):    204=22mm, 205=26mm, 206=34mm
  HP (straight hand.):  103=34mm, 104=44.5mm, 105=65mm, 106=70mm
→ Skip this step for: polisher, sonic, endodontic, root_post

STEP 2 — OBSERVE (category-specific):

  For rotary_diamond:
    - Head shape (torpedo, flame, round, cylinder, pear, inverted cone, diabolo...)
    - Colored ring at the BASE of the head where it meets the neck:
        transparent/none=ultrafine | yellow=extrafine | red=fine | blue=standard | green=coarse | black=super-coarse
    - Prefix hint if ring absent: could be ultrafine (8μm), note very faint transparent band

  For rotary_carbide:
    - Head shape
    - Count blade density (cutting flutes on head):
        ~30 blades = ultrafine | ~16-20 = fine | ~8-12 = standard | ~6 = coarse
    - Cross-cut pattern? (double-cut carbides, e.g. H33)
    - Note: carbide color ring is on the SHANK NECK (= series marker, not grit)

  For diao:
    - Head shape (already know: material = diao from rose-gold color)
    - Head size from ruler

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
Call search_catalog with your category (product_type), description, and measured shank length (if applicable).

STEP 4 — VISUAL CONFIRMATION:
Call get_catalog_page with the catalog_page number from the best candidate.
Compare the photo with the catalog image. Confirm or reject.
If rejected, try the next candidate or search again.

STEP 5 — IDENTIFY:
Return the product code as FAMILY.SHANK.SIZE (e.g. "879.104.014").
Explain your reasoning briefly.
If uncertain, return the 2-3 most likely candidates.`

const SEARCH_CATALOG_SQL = `
SELECT id, family_codes, catalog_page, product_type,
       shape_description, material_description, identification_clues,
       grit_options, shank_options, size_options, rpm_max, clinical_indications
FROM shared.catalog_entries
WHERE
  (
    $1::numeric IS NULL
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(shank_options) s
      WHERE ABS((s->>'length_mm')::numeric - $1::numeric) < 5
    )
  )
  AND ($2::text IS NULL OR product_type = $2)
  AND (
    $3 = ''
    OR to_tsvector('simple',
         COALESCE(shape_description,'') || ' ' ||
         COALESCE(material_description,'') || ' ' ||
         COALESCE(identification_clues,''))
       @@ plainto_tsquery('simple', $3)
  )
ORDER BY catalog_page
LIMIT 10
`

type SearchCatalogInput = {
  shank_length_mm?: number
  product_type?:    string
  description:      string
}

type GetCatalogPageInput = {
  page_number: number
}

export function parseIdentificationResult(
  text:            string,
  lastCatalogPage: number | null,
  usage:           { inputTokens: number; outputTokens: number },
): IdentificationResult {
  const productCodePattern = /\b\d+\.\d+\.\d+\b/g
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
        tools:      [SEARCH_CATALOG_TOOL, GET_CATALOG_PAGE_TOOL],
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

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        if (block.name === 'search_catalog') {
          const input = block.input as SearchCatalogInput
          const result = await runSearchCatalog(deps.pool, input)
          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content:     result,
          })
        } else if (block.name === 'get_catalog_page') {
          const input = block.input as GetCatalogPageInput
          lastCatalogPage = input.page_number
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
        }
      }

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
    resultState:  'error',
    candidates:   [],
    catalogPage:  lastCatalogPage,
    reasoning:    'Max iterations reached without a final answer',
    usage:        { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  }
}

async function runSearchCatalog(pool: DbPool, input: SearchCatalogInput): Promise<string> {
  const shankLengthMm = input.shank_length_mm ?? null
  const productType   = input.product_type ?? null
  const description   = input.description

  const { rows } = await pool.query(SEARCH_CATALOG_SQL, [shankLengthMm, productType, description])
  return JSON.stringify(rows)
}
