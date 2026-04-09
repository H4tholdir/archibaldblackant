import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages/messages.js'
import type { DbPool } from '../db/pool'
import type { CatalogVisionService } from '../recognition/recognition-engine'
import type { IdentificationResult } from '../recognition/types'
import type { CatalogPdfService } from './catalog-pdf-service'
import { findRelevantStrips, stripFullPath } from '../recognition/campionario-strip-map'
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
    - Head shape — examine the BODY PROFILE first, tip second:
        • TORPEDO / CHAMFER: body is WIDEST at the base and stays nearly CYLINDRICAL for 50–70%
          of head length; only the final portion chamfers to a rounded dome. The apex is blunt.
          ⚠ HP torpedo (879) CAN look pointed in side-view photos — do NOT rule it out from tip alone.
          Reliable clue: nearly-constant body width from base up to 60% of head = torpedo.
          Search with: "torpedo chamfer rounded tip"
        • FLAME: body tapers CONTINUOUSLY from the base all the way to the tip — NO cylindrical
          section. The silhouette narrows from the very first mm above the neck junction.
          The very tip is a fine sharp point. Reliable clue: body narrowing begins immediately at base.
          Search with: "flame pointed tip"
        • INVERTED CONE (families 806/807): body is NARROWEST at the BASE (neck junction) and
          WIDENS continuously toward the working end — maximum diameter is AT THE TIP.
          The working end is FLAT or very slightly rounded — NOT pointed, NOT domed.
          Side profile: ◤ (narrow base → progressively wider → flat working end)
          ⚠ NOT torpedo: torpedo has a nearly-CONSTANT width from base to 60% then chamfer;
            inverted cone gets WIDER with every mm from base to tip. Check: is the head wider
            at the tip than at the base? YES → inverted cone (806/807). NO → torpedo (879).
          Search with: "inverted cone long"
        • Other shapes: round (sphere head), cylinder flat-end, pear (wider mid-body),
          diabolo (hourglass/biconcave)
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

MANDATORY SHORTLIST — torpedo/flame ambiguity, HP only:
Apply ONLY IF ALL four conditions are true:
  1. Shank = HP (long straight handpiece)
  2. Product type = rotary_diamond
  3. No clearly visible grit ring color
  4. Your primary visual identification suggests a FLAME or TORPEDO/CHAMFER head shape
     (your best catalog match is in family 863, 862, 860, or 879)
→ If all four apply: return shortlist, product_code = "", confidence 0.45,
  candidates = [your_flame_match, "879.104.014"]
→ Note: torpedo burs often appear pointed in side-view photos due to chamfer angle.

DO NOT apply this rule if your primary identification is a clearly DIFFERENT head shape:
  • Inverted cone (wider at working end, e.g. family 807) → submit match directly
  • Round/ball bur → submit match directly
  • Pear shape → submit match directly
  • Cylinder flat-end → submit match directly
  • Any non-flame/non-torpedo family → submit match directly`

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
          return await runDisambiguationLoop(client, deps.pool, deps.catalogPdf, imageBase64, disambiguationCandidates, controller.signal)
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
  catalogPdf:  CatalogPdfService,
  imageBase64: string,
  candidates:  string[],
  signal:      AbortSignal,
): Promise<IdentificationResult> {
  // Per-candidate lookup: prefer the catalog entry matching the specific shank code
  // (avoids picking FG pages when the candidate is HP, which are on different catalog pages)
  const familyDescMap = new Map<string, string>()
  const familyPageMap = new Map<string, number | null>()

  for (const code of candidates) {
    const parts      = code.split('.')
    const familyCode = parts[0] ?? code
    const shankCode  = parts[1] ?? null
    if (familyDescMap.has(familyCode)) continue

    try {
      type EntryRow = { shape_description: string; identification_clues: string | null; catalog_page: number | null }

      // Try shank-specific entry first (e.g. HP page for an HP candidate)
      let row: EntryRow | undefined
      if (shankCode) {
        const { rows: exact } = await pool.query<EntryRow>(
          `SELECT shape_description, identification_clues, catalog_page
           FROM shared.catalog_entries
           WHERE $1::text = ANY (family_codes)
             AND EXISTS (SELECT 1 FROM jsonb_array_elements(shank_options) s WHERE s->>'code' = $2::text)
           ORDER BY catalog_page ASC LIMIT 1`,
          [familyCode, shankCode],
        )
        row = exact[0]
      }
      // Fall back to any shank if no shank-specific entry found
      if (!row) {
        const { rows: fallback } = await pool.query<EntryRow>(
          `SELECT shape_description, identification_clues, catalog_page
           FROM shared.catalog_entries
           WHERE $1::text = ANY (family_codes)
           ORDER BY catalog_page ASC LIMIT 1`,
          [familyCode],
        )
        row = fallback[0]
      }
      if (row) {
        const desc = row.identification_clues
          ? `${row.shape_description}. ${row.identification_clues}`
          : row.shape_description
        familyDescMap.set(familyCode, desc)
        familyPageMap.set(familyCode, row.catalog_page ?? null)
        logger.info('[vision] disambiguation candidate lookup', { code, shankCode, catalogPage: row.catalog_page })
      }
    } catch (err) {
      logger.warn('[vision] disambiguation candidate lookup failed', { code, err })
    }
  }

  const candidateLines = candidates.map(code => {
    const fc   = code.split('.')[0] ?? code
    const desc = familyDescMap.get(fc) ?? fc
    return `  - ${code}: ${desc}`
  }).join('\n')

  // Fetch catalog page images: for each candidate, load:
  //   (1) the shank-specific page (correct proportions for the instrument type)
  //   (2) the lowest catalog page for the family (clearest shape illustration — usually FG/solo)
  // Both are needed because the shank-specific page may show many items at small scale,
  // while the lowest-numbered page typically shows the shape most clearly in full scale.
  const pagesToFetch: Array<{ page: number; label: string }> = []
  const seenPagesCollect = new Set<number>()

  for (const code of candidates) {
    const parts      = code.split('.')
    const familyCode = parts[0] ?? code

    // (1) Shank-specific page
    const primaryPage = familyPageMap.get(familyCode)
    if (primaryPage && !seenPagesCollect.has(primaryPage)) {
      seenPagesCollect.add(primaryPage)
      pagesToFetch.push({ page: primaryPage, label: `Catalog page ${primaryPage} (full instrument)` })
    }

    // (2) Lowest catalog page = clearest isolated shape illustration
    try {
      const { rows: minRows } = await pool.query<{ catalog_page: number }>(
        `SELECT MIN(catalog_page) AS catalog_page FROM shared.catalog_entries
         WHERE $1::text = ANY (family_codes)`,
        [familyCode],
      )
      const lowestPage = minRows[0]?.catalog_page
      if (lowestPage && !seenPagesCollect.has(lowestPage)) {
        seenPagesCollect.add(lowestPage)
        pagesToFetch.push({ page: lowestPage, label: `Shape reference page ${lowestPage} (${familyCode})` })
      }
    } catch {
      // skip secondary reference
    }
  }

  const catalogImages: Array<{ page: number; label: string; base64: string }> = []
  for (const { page, label } of pagesToFetch) {
    try {
      const raw     = await catalogPdf.getPageAsBase64(page)
      const cropped = await cropCatalogPageForDisambiguation(raw)
      catalogImages.push({ page, label, base64: cropped })
      logger.info('[vision] disambiguation catalog page loaded', { page, label })
    } catch (err) {
      logger.warn('[vision] disambiguation catalog page unavailable', { page, err })
    }
  }

  // Load campionario strip reference photos from VPS filesystem (graceful degradation if unavailable)
  const candidateFamilies = candidates.map(c => c.split('.')[0] ?? c)
  const relevantStrips    = findRelevantStrips(candidateFamilies)
  const campionarioImages: Array<{ label: string; base64: string }> = []
  {
    const { readFile } = await import('node:fs/promises')
    for (const strip of relevantStrips) {
      try {
        const buf    = await readFile(stripFullPath(strip.path))
        const base64 = await resizeCampionarioStrip(buf)
        campionarioImages.push({ label: strip.label, base64 })
        logger.info('[vision] campionario strip loaded', { path: strip.path })
      } catch (err) {
        logger.warn('[vision] campionario strip unavailable', { path: strip.path, err })
      }
    }
  }

  const catalogNote = [
    catalogImages.length > 0
      ? `\nCATALOG REFERENCE IMAGES INCLUDED BELOW:\n${catalogImages.map(img => `  • ${img.label}`).join('\n')}\nUse these illustrations to compare body profiles directly against the photographed instrument.`
      : '',
    campionarioImages.length > 0
      ? `\nCAMPIONARIO STRIP PHOTOS INCLUDED:\n${campionarioImages.map(img => `  • ${img.label}`).join('\n')}\nThese are official Komet sample-board photographs. Each strip shows multiple instruments with their family-code labels. Use the labeled body profiles to confirm or correct your body-shape assessment.`
      : '',
  ].filter(Boolean).join('\n')

  const prompt = `You are disambiguating a Komet dental instrument from ${candidates.length} candidates.

Candidates:
${candidateLines}
${catalogNote}

STEP 0 — VERIFY CANDIDATE MATCH:
Before anything else: does the photographed instrument actually belong to one of these candidates?
  • If the head shape is CLEARLY DIFFERENT from all candidates (e.g. it's an inverted cone,
    ball/round bur, pear, or any shape not in the candidate list) → submit product_code = "",
    candidates = [], confidence = 0 immediately. Do NOT force a wrong answer.

STEP 1 — BODY-SHAPE COMPARISON (if the instrument could be one of the candidates):

  TORPEDO / CHAMFER (family 879):
    • Head is WIDEST at the BASE (where it meets the neck/shank junction)
    • From the base, the body stays NEARLY CONSTANT in diameter for the first 50–70% of the head length
    • Only in the FINAL 30–50% does it taper — ending in a chamfered dome that is ROUNDED, not sharp
    • Side profile: ▬▬▬◥  (wide base → nearly-parallel body → short chamfer taper → blunt dome)

    ⚠ HP VISUAL TRAP: On HP burs (long straight shank, 44 mm+), the working head is proportionally
      tiny. In side-view photos, the chamfer tip of an 879 torpedo CAN appear pointed or even sharply
      tapered — especially if the photo is not perfectly perpendicular to the head axis.
      DO NOT use tip sharpness alone to rule out torpedo. Use the body-width profile instead.

  FLAME (families 863, 862, 860):
    • Head is also widest at the base, BUT the taper begins IMMEDIATELY and continues ALL the way up
    • NO cylindrical or nearly-parallel body section — the silhouette narrows from the very first mm
    • The tip is a sharp acute point, but this alone cannot distinguish it from 879 HP in photos
    • Side profile: △  (continuous taper from base to fine point — no flat cylinder section anywhere)

STEP 2 — DECIDE (use body profile, NOT tip sharpness):
  1. CAMPIONARIO STRIP COMPARISON (highest priority when strip images are included):
       → Locate the labeled 879 entry in the strip photo. Compare its body-width profile against the photo.
       → Locate the labeled 863 (or 862) entry. Which body silhouette matches the photographed specimen?
       → Strip comparison OVERRIDES your verbal tip-sharpness assessment.
  2. BODY BASE WIDTH test:
       → Measure the head width at the base vs at the midpoint of the head.
       → If midpoint is nearly as wide as the base → torpedo (879).
       → If midpoint is noticeably narrower than the base → flame (863/862/860).
  3. CLOSE-UP PHOTO bonus: if a close-up of the head tip is available, check whether the very apex is
       a true fine point (flame) or a small flat/dome that would stop a sharp pencil (torpedo chamfer).
  4. When in doubt on HP burs: prefer torpedo (879) — HP torpedoes are clinically more common than
       HP flames, and the visual confusion is asymmetric (torpedoes look like flames; flames rarely
       look like torpedoes in photos).

submit_identification rules:
  - Clearly identified: product_code = EXACTLY one of the listed candidate codes above, confidence > 0.75
  - Still uncertain between candidates: product_code = "", candidates = [remaining options], confidence 0.5
  - Instrument is not one of these candidates: product_code = "", candidates = [], confidence = 0

MANDATORY SHORTLIST — 879 torpedo vs 863/862 flame on HP shank:
  When the candidates include 879 (torpedo) AND 863 or 862 (flame) with HP shank code (104):
  → ALWAYS submit as shortlist (product_code = "", candidates = full list, confidence = 0.5).
  → NEVER submit a definitive match for either family in this pairing.
  Rationale: the 879 HP torpedo consistently appears as a continuous taper in side-view photos.
  The visual difference is unresolvable from photographs alone. The user must confirm manually.`

  const userContent = [
    { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: imageBase64 } },
    { type: 'text' as const, text: prompt },
    ...catalogImages.flatMap(({ label, base64 }) => [
      { type: 'text' as const, text: `${label}:` },
      { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: base64 } },
    ]),
    ...campionarioImages.flatMap(({ label, base64 }) => [
      { type: 'text' as const, text: `CAMPIONARIO — ${label}:` },
      { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: base64 } },
    ]),
  ]

  const messages: MessageParam[] = [{ role: 'user', content: userContent }]

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
  logger.info('[vision] disambiguation result', {
    stop_reason:         response.stop_reason,
    catalogImagesUsed:   catalogImages.map(i => ({ page: i.page, label: i.label })),
    campionarioStrips:   campionarioImages.map(i => i.label),
  })

  for (const block of response.content) {
    if (block.type === 'tool_use' && block.name === 'submit_identification') {
      const input = block.input as SubmitIdentificationInput
      logger.info('[vision] disambiguation submit_identification', { product_code: input.product_code, confidence: input.confidence, reasoning: input.reasoning })

      // Validate: if a product_code was returned, it must be one of the original candidates.
      // This catches hallucinations like "8863.104.016" when the candidate is "863.104.016".
      if (input.product_code && !candidates.includes(input.product_code)) {
        logger.warn('[vision] disambiguation: product_code not in candidates, falling back to shortlist', {
          returned: input.product_code,
          candidates,
        })
        return {
          productCode:  candidates[0]!,
          familyCode:   candidates[0]!.split('.')[0] ?? null,
          confidence:   0.4,
          resultState:  'shortlist',
          candidates,
          catalogPage:  null,
          reasoning:    `Disambiguation returned unknown code "${input.product_code}" (not in candidates). Keeping shortlist.`,
          usage,
        }
      }

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

/**
 * Resize a campionario strip photo for API use.
 * Strips are already focused on instrument content — just resize to max 1400px width.
 */
async function resizeCampionarioStrip(buf: Buffer): Promise<string> {
  const sharp = (await import('sharp')).default
  return sharp(buf)
    .resize({ width: 1400, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer()
    .then(b => b.toString('base64'))
}

/**
 * Crop catalog page for disambiguation at FULL width resolution.
 * No width resize — shape details (cylindrical vs tapering body) must remain legible.
 */
async function cropCatalogPageForDisambiguation(base64Png: string): Promise<string> {
  const sharp = (await import('sharp')).default
  const buf   = Buffer.from(base64Png, 'base64')
  const meta  = await sharp(buf).metadata()
  const w     = meta.width  ?? 800
  const h     = meta.height ?? 1100
  const cropH = Math.floor(h * 0.72)

  return sharp(buf)
    .extract({ left: 0, top: 0, width: w, height: cropH })
    .jpeg({ quality: 85 })
    .toBuffer()
    .then(b => b.toString('base64'))
}
