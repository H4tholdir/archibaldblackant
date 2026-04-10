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
                       → shank_type = "fg" | ISO certified Ø 1.60 mm

  CA (contra-angle):   Medium length. Shank has a visible L-shaped right-angle coupling.
                       Shank is 2–4× longer than the head.
                       → shank_type = "ca" | ISO certified Ø 2.35 mm

  HP (straight hand.): Instrument looks CLEARLY LONG. Shank is smooth, straight, and
                       4–7× longer than the working head.
                       → shank_type = "hp" | ISO certified Ø 2.35 mm (standard) or 3.00 mm (thick HP)

  Unsure?              Omit shank_type from search_catalog — do not guess.
→ Skip this step for: polisher, sonic, endodontic, root_post
Note: the shank Ø identified here is your absolute scale ruler — use it in Q4 below.

STEP 2 — OBSERVE (category-specific):

  For rotary_diamond:
    - MANDATORY 3-QUESTION HEAD-SHAPE DECISION (answer all three before searching):

      Q1 — What is the working end (apex/tip)?

        ⚠ GEOMETRY CHECK FIRST — measure HEAD HEIGHT vs HEAD WIDTH before picking a branch:
          • Torpedo (879): head is TALLER than it is wide (height > width; bullet nose).
          • Wheel/disc (909): head is MUCH WIDER than it is tall (width >> height; flat disc).
          • Inverted cone (806/807): head is taller than wide; widens from base to tip.
          • Ball (801): head is equally tall and wide (perfect sphere — ALL surfaces curved).
          If the head is clearly WIDER than it is TALL → wheel/disc (909), NOT torpedo.

        ⚠ BALL vs DISC — if head appears roughly spherical:
          Look at the TOP of the head:
            • TOP is FLAT (like the face of a coin, a flat area at the apex) → wheel/disc (909).
              Even from a face-on or angled photo, the disc face appears as a FLAT CIRCLE, not a dome.
            • TOP is uniformly CURVED in all directions (no flat area anywhere) → ball bur (801/6801).
          Look at the NECK (transition head → shank):
            • MUSHROOM PROFILE: head is dramatically WIDER than the neck below it, creating a
              sudden step or flare → wheel/disc (909). The shank visually "disappears" under
              the disc overhang when viewed from the side.
            • SMOOTH TAPER: shank merges gradually into the bottom of the sphere → ball bur (801).
          Look at the SIDE PROFILE shape:
            • LENTICULAR / OVAL FLAT: clearly wider than tall, like a lens or UFO → wheel/disc (909).
            • CIRCULAR / ROUND: equally tall and wide, like a ball → ball bur (801).

        → FLAT like the end of a nail or eraser (diameter ≈ same as body): inverted cone (806/807)
        → ROUNDED DOME (convex curve, like a bullet nose — head TALLER than wide): torpedo (879)
        → SHARP POINT (tapers to a fine needle): flame (863/862/860)
        → SPHERE (entire head is a ball — equally tall and wide): round bur (801/802/811/6801/8801/5801)
        → FLAT but head is WIDER than shank, short: cylinder flat-end (837/835)
        → WIDE LOW-PROFILE DISC (head clearly WIDER than tall, flat top, rounded rim):
            wheel bur (909/6909/5909/2909)
            ⚠ FACE-ON PHOTO: disc photographed face-on looks like a wide dome — but compare
              head HEIGHT vs HEAD WIDTH. If width >> height → wheel disc, not torpedo.
            ⚠ RATIO clue: 909 head is MUCH wider than shank.
              909.104.040 on HP: ratio = 1.70 | 909.104.055: ratio = 2.34 | 909.104.065: ratio = 2.77
            Search with: "wheel disc rounded edge occlusal reduction"

      Q2 (if Q1 = flat or dome) — Compare BASE width vs TIP width of the head:
        → Tip is WIDER than base (body expands upward): inverted cone (806/807)
        → Tip same width as base (body is parallel/cylindrical): torpedo (879)
        ⚠ Even if the tip looks slightly rounded, check the width: if it's WIDER at tip → 807, not 879.

      Q3 (if still unsure between 807 and 879) — How does body width change from base upward?
        → Body progressively WIDENS from base to tip with no parallel section: inverted cone
        → Body stays nearly SAME WIDTH for 60%+ then chamfers: torpedo

      Q4 — Scale cross-check: use ABSOLUTE SCALE REFERENCE section below (after STEP 2).
        Estimate the head:shank width ratio in the photo using the certified shank Ø from STEP 1.
        If the observed ratio contradicts Q1-Q3 → revise shape assessment before searching.
        If it confirms Q1-Q3 → proceed with confidence.

    - After answering Q1-Q4, search the catalog with the determined shape:
        inverted cone   → Search with: "inverted cone long"
        torpedo/chamfer → Search with: "torpedo chamfer rounded tip"
        flame           → Search with: "flame pointed tip"
        wheel/disc      → Search with: "wheel disc rounded edge occlusal reduction"

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

ABSOLUTE SCALE REFERENCE — Punto di Repere (applies to ALL instrument categories):
  The shank is your physical ruler. Its Ø is ISO 6360 certified — fixed for every instrument of the same shank code.
  The last 3 digits of any Komet product code = max head Ø in 1/10 mm (014 → 1.4 mm, 023 → 2.3 mm).

  ── Complete shank reference (ISO 6360) ─────────────────────────────────────────────
  CODE  NAME (abbr.)              LENGTH    Ø        VISUAL PROFILE
  ─ FG group ──────────────────────────────────────────────────────────────────────────
  313   FG short (FGS)            18 mm    1.60 mm  shortest; small ring/knob at coupling
  314   FG (FG)                   19 mm    1.60 mm  friction-grip collar near coupling
  315   FG long (FGL)             21 mm    1.60 mm
  316   FG extra-long (FGXL)      25 mm    1.60 mm
  ─ HP group ──────────────────────────────────────────────────────────────────────────
  103   HP short (HPS)            34 mm    2.35 mm  short straight cylinder
  104   HP (HP)                   44.5 mm  2.35 mm  most common HP; mid-length
  105   HP long (HPL)             65 mm    2.35 mm  clearly long shank
  106   HP extra-long (HPXL)      70 mm    2.35 mm  longest straight cylinder
  ─ CA group ──────────────────────────────────────────────────────────────────────────
  204   Right-angle CA (RA)       22 mm    2.35 mm  L-shaped 90° coupling — unmistakable
  205   Right-angle long (RAL)    26 mm    2.35 mm
  206   Right-angle XL (RAXL)     34 mm    2.35 mm
  ─ HP thick ──────────────────────────────────────────────────────────────────────────
  123   HP thick short (HPST)     34 mm    3.00 mm  visibly thicker than 103/104
  124   HP thick (HPT)            44.5 mm  3.00 mm  same length as HP but wider
  ─ Handles (hand-held) ────────────────────────────────────────────────────────────────
  634   Handle short, plastic     —        3.00 mm  serrated plastic grip, short
  654   Handle, plastic           —        4.00 mm  larger serrated plastic grip
  644   Handle                    —        6.00 mm  largest ergonomic handle
  ─ Special ────────────────────────────────────────────────────────────────────────────
  471   FO/PCR                    —        1.60 mm  fiber-optic coupling at end
  900   Unmounted                 —        —        no shank; working part only

  ── Common ISO head sizes (code → mm) ────────────────────────────────────────────────
  005(0.5) 006(0.6) 007(0.7) 008(0.8) 009(0.9) 010(1.0) 012(1.2) 014(1.4)
  016(1.6) 018(1.8) 021(2.1) 023(2.3) 025(2.5) 027(2.7) 031(3.1) 035(3.5)
  040(4.0) 045(4.5) 047(4.7) 050(5.0) 055(5.5) 060(6.0) 070(7.0) 080(8.0)

  ── Head:shank ratio = head Ø / shank Ø ──────────────────────────────────────────────
  ≤ 0.50   head is half shank width or less — very slender tip
  ~ 0.60   head clearly NARROWER than shank — visible gap on both sides
  ~ 0.75   head moderately narrower — noticeably but not dramatically thinner
  ~ 0.90   head slightly narrower — close to the same width as shank
  ~ 1.00   head and shank appear the SAME WIDTH — near-continuous profile
  > 1.00   head WIDER than shank — working end widens beyond shank
  ≥ 1.40   head clearly extends well beyond shank on both sides

  ⚠ CRITICAL — always measure the MAXIMUM width of the head, not the base junction:
    • Inverted cone (806/807): head WIDENS from base to tip — maximum width is at the TIP (top).
      Do NOT measure where the head meets the shank neck — that point is the narrowest part.
      Measure the flat top disc: THAT is the Ø encoded in the product code.
    • Torpedo (879): widest at the base, tapers toward tip — measure at the base.
    • Flame (863/862): widest at the base — measure there.
    • Cylinder (836/837): uniform width — any point.
    • Ball/sphere (801/802/6801/8801/5801): maximum is at the EQUATOR (widest horizontal
      cross-section of the sphere). In side-view photos, perspective may make the sphere appear
      narrower than it is — estimate diameter as the widest visible circle of the ball, not
      the silhouette edge where the sphere meets the air.
    • Wheel/disc (909/6909/5909/2909): the disc Ø is the FULL edge-to-edge diameter of the disc,
      NOT the disc thickness. In face-on photos (disc face toward camera), the visible circle IS
      the disc Ø — use the full visible width of the circular head.
      Expected ratios on HP: 040→1.70, 055→2.34, 065→2.77. These are always >> 1.5.
      If your measured ratio is < 1.0 for a suspected wheel bur → re-examine: you may be
      measuring the disc THICKNESS rather than its DIAMETER.

  For each candidate: compute expected ratio (head Ø ÷ shank Ø). Observe in photo.
    Match → supports that candidate. Mismatch → contradicts it.

  ── Worked examples ───────────────────────────────────────────────────────────────────
  879.104.014 on HP104:  1.4 ÷ 2.35 = 0.60  → head clearly narrower than shank (measure at base)
  807.104.023 on HP104:  2.3 ÷ 2.35 = 0.98  → TIP disc ≈ same width as shank (NOT the base junction)
  806.314.023 on FG314:  2.3 ÷ 1.60 = 1.44  → head visibly WIDER than shank
  863.314.012 on FG314:  1.2 ÷ 1.60 = 0.75  → head moderately narrower
  879.314.014 on FG314:  1.4 ÷ 1.60 = 0.88  → head slightly narrower than shank
  879 vs 807 on HP: ratio gap = 0.60 vs 0.98 → 38 pp — visually unambiguous
                     in any photo where both head and shank are visible

  ── Notes ─────────────────────────────────────────────────────────────────────────────
  FG (Ø 1.60 mm): inverted-cone families (806/807 size 018+) produce a head WIDER
    than the shank. This is a definitive signal — no other family on FG has this effect.
  CA (Ø 2.35 mm): same Ø as HP → same ratios apply; distinguish by L-shaped coupling.
  HP thick (123/124, Ø 3.00 mm): ratios smaller than standard HP for same head size;
    distinguish by visibly wider shank cylinder.

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

MANDATORY SHORTLIST RULES — apply BEFORE submit_identification:

RULE A — flame vs torpedo, HP + no ring:
  Conditions: shank=HP, rotary_diamond, no visible ring color, head = flame OR torpedo/chamfer
  → shortlist: product_code="", candidates=[your_flame_match, "879.104.014"], confidence=0.45

RULE B — blunt-top HP + no ring (torpedo/inverted-cone/cylinder confusion):
  Conditions: shank=HP, rotary_diamond, no visible ring color, head tip = blunt/flat/rounded (NOT sharp)
  → MANDATORY shortlist: product_code="", candidates=["879.104.014", "807.104.023"], confidence=0.45
  THIS RULE IS ABSOLUTE. You MUST submit shortlist even if you are visually certain it is 879.
  DO NOT override this rule with "visual evidence" or catalog confirmation.
  Rationale: the 807 inverted cone long (HP, sizes up to 2.3mm) is systematically misidentified as
  the 879 torpedo (HP, 1.4mm) in photographs. Visual analysis cannot reliably distinguish them.

SKIP these rules only for clearly distinct shapes:
  • Ball/sphere head → match directly
  • Pear shape → match directly
  • Head is dramatically wider than shank (> 3mm estimated diameter) → match directly (large cylinder)
  • FG or CA shank → rules do not apply`

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
      productCode:   null,
      familyCode:    null,
      confidence,
      resultState:   'not_found',
      candidates:    [],
      catalogPage:   lastCatalogPage,
      reasoning:     text,
      photo_request: null,
      usage,
    }
  }

  if (unique.length === 1) {
    const code = unique[0]!
    return {
      productCode:   code,
      familyCode:    code.split('.')[0] ?? null,
      confidence,
      resultState:   'match',
      candidates:    [],
      catalogPage:   lastCatalogPage,
      reasoning:     text,
      photo_request: null,
      usage,
    }
  }

  return {
    productCode:   unique[0]!,
    familyCode:    unique[0]!.split('.')[0] ?? null,
    confidence,
    resultState:   'shortlist',
    candidates:    unique,
    catalogPage:   lastCatalogPage,
    reasoning:     text,
    photo_request: null,
    usage,
  }
}

function parseFromSubmitTool(
  input:          SubmitIdentificationInput,
  lastCatalogPage: number | null,
  usage:           { inputTokens: number; outputTokens: number },
): IdentificationResult {
  const base = { catalogPage: lastCatalogPage, reasoning: input.reasoning, photo_request: null, usage }

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
    async identifyFromImage(photos, candidates, signal) {
      const controller    = new AbortController()
      const timer         = setTimeout(() => controller.abort(), deps.timeoutMs)
      const onExternalAbort = () => controller.abort()
      signal?.addEventListener('abort', onExternalAbort)

      try {
        return await runAgenticLoop(client, deps, photos, controller.signal)
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onExternalAbort)
      }
    },
  }
}

async function runAgenticLoop(
  client:  Anthropic,
  deps:    CatalogVisionServiceDeps,
  images:  string[],
  signal:  AbortSignal,
): Promise<IdentificationResult> {
  const MAX_ITERATIONS  = 6
  const TOKEN_BUDGET    = 60_000
  let totalInputTokens  = 0
  let totalOutputTokens = 0
  let lastCatalogPage: number | null = null

  const multiPhotoPreamble = images.length > 1
    ? `You have been provided with ${images.length} photos of the same dental instrument taken from different angles:
- Photo 1 (first image): LATERAL VIEW — instrument held horizontally, shows the full side profile, shape, and proportions.
- Photo 2 (second image): TOP-DOWN VIEW — camera looking straight down at the working tip from above.

Use BOTH photos together for identification:
• Lateral photo reveals: overall shape (torpedo vs disc vs ball), height-vs-width ratio, shank length and type.
• Top-down photo reveals: whether the tip is flat (disc face → wheel/disc 909) vs uniformly domed (ball 801), and the true working end diameter.
If the two photos appear contradictory, trust geometric measurements over subjective descriptions.\n\n`
    : ''

  const imageBlocks = images.map((img) => ({
    type:   'image' as const,
    source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: img },
  }))

  const messages: MessageParam[] = [
    {
      role:    'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: multiPhotoPreamble + IDENTIFICATION_PROMPT,
        },
      ],
    },
  ]

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (totalInputTokens > TOKEN_BUDGET) {
      logger.warn('[vision] token budget exceeded — stopping loop', { totalInputTokens, iteration })
      return {
        productCode: null, familyCode: null, confidence: 0,
        resultState: 'not_found' as const, candidates: [], catalogPage: lastCatalogPage,
        reasoning:     `Token budget (${TOKEN_BUDGET}) exceeded after ${iteration} iterations`,
        photo_request: null,
        usage:         { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      }
    }

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
    productCode:   null,
    familyCode:    null,
    confidence:    0,
    resultState:   'not_found',
    candidates:    [],
    catalogPage:   lastCatalogPage,
    reasoning:     'Max iterations reached without a final answer',
    photo_request: null,
    usage:         { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
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

SCALE REFERENCE — Punto di Repere:
  Certified shank Ø (ISO 6360):
    HP (103/104/105/106) = 2.35 mm | FG (313/314/315/316) = 1.60 mm | CA (204/205/206) = 2.35 mm
    HP thick (123/124) = 3.00 mm   | FO/PCR (471) = 1.60 mm

  Last 3 digits of product code ÷ 10 = max head Ø in mm:
    Common sizes: 005(0.5) 006(0.6) 008(0.8) 010(1.0) 012(1.2) 014(1.4) 016(1.6)
                  018(1.8) 021(2.1) 023(2.3) 025(2.5) 027(2.7) 031(3.1) 035(3.5) 040(4.0)

  For each candidate above, compute: ratio = (last 3 digits ÷ 10) / shank Ø
  Then observe the photo — does the head:shank ratio match?

  Ratio     Visual impression
  ~ 0.60    head clearly NARROWER than shank — visible gap on both sides
  ~ 0.75    head moderately narrower — noticeably but not dramatically thinner
  ~ 0.90    head slightly narrower — close to the same width as shank
  ~ 1.00    head ≈ SAME WIDTH as shank — near-continuous profile
  > 1.00    head WIDER than shank (definitive on FG for inverted-cone size 018+)
  ≥ 1.40    head clearly extends well beyond shank on both sides

  Worked examples:
    879.104.014 on HP: 1.4 ÷ 2.35 = 0.60  → head clearly narrower than shank
    807.104.023 on HP: 2.3 ÷ 2.35 = 0.98  → TIP disc ≈ same width as shank
    806.314.023 on FG: 2.3 ÷ 1.60 = 1.44  → head visibly WIDER than shank
    863.314.012 on FG: 1.2 ÷ 1.60 = 0.75  → head moderately narrower
    879.314.014 on FG: 1.4 ÷ 1.60 = 0.88  → head slightly narrower than shank

  ⚠ Measure the MAXIMUM head width, not the base junction:
    Inverted cone (806/807): maximum width is at the TIP (flat top disc) — NOT where head meets neck.
    Torpedo/flame/cylinder: maximum width is at the base or uniform section.
    Ball/sphere (801/802/6801/8801/5801): maximum is at the EQUATOR. Perspective in side-view
      photos may make the sphere appear narrower — use the widest visible circle of the ball.

  A clear mismatch → contradicts that candidate. A match → supports it (use alongside body profile).

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
          productCode:   candidates[0]!,
          familyCode:    candidates[0]!.split('.')[0] ?? null,
          confidence:    0.4,
          resultState:   'shortlist',
          candidates,
          catalogPage:   null,
          reasoning:     `Disambiguation returned unknown code "${input.product_code}" (not in candidates). Keeping shortlist.`,
          photo_request: null,
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
    orQuery += ' OR torpedo OR chamfer OR rounded OR inverted OR cone'
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
