import { createHash } from 'crypto';
import type { DbPool } from '../db/pool';
import type { InstrumentFeatures, RecognitionResult, ProductMatch, FilterQuestion, BudgetState } from './types';
import { checkBudget, consumeBudget } from './budget-service';
import { getCached, setCached } from '../db/repositories/recognition-cache';
import { lookupByFeatures } from '../db/repositories/instrument-features';
import type { LookupRow } from '../db/repositories/instrument-features';
import { appendRecognitionLog } from '../db/repositories/recognition-log';
import { calculateHeadSizeMm } from './komet-code-parser';
import type { VisionApiFn } from '../services/anthropic-vision-service';
import { measureHeadShankRatio } from '../services/image-preprocessing-service';
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

// Visually similar shapes that Haiku may confuse — used as fallback in progressive lookup
const SHAPE_SYNONYMS: Record<string, string> = {
  torpedo:            'tapered_round_end',
  tapered_round_end:  'torpedo',
  cylinder_round_end: 'cylinder',
  cylinder:           'cylinder_round_end',
  flame:              'tapered_round_end',
  pear:               'torpedo',
};

// If vision says FG but the shank is visually long → it is HP (same smooth look, very different length)
function resolveShankType(
  shankType: InstrumentFeatures['shank_type'],
  lengthCategory: InstrumentFeatures['shank_length_category'],
): string {
  if (shankType === 'fg' && (lengthCategory === 'long' || lengthCategory === 'extra_long')) {
    return 'hp';
  }
  return shankType;
}

// Progressive lookup: 5 passes, each relaxing one constraint at a time.
// Returns at the first pass that finds ≥1 result.
async function progressiveLookup(
  pool: DbPool,
  shape: string | null,
  material: string | null,
  grit: string | null,
  shank: string,
  sizeMm: number | null,
  limit: number,
): Promise<LookupRow[]> {
  // Pass 1 — strict: all filters active
  let rows = await lookupByFeatures(pool, {
    shape_family: shape, material, grit_ring_color: grit,
    shank_type: shank, calc_size_mm: sizeMm,
  }, limit);
  if (rows.length) return rows;

  // Pass 2 — relax grit (ring not visible or ultrafine)
  if (grit !== null) {
    rows = await lookupByFeatures(pool, {
      shape_family: shape, material, grit_ring_color: null,
      shank_type: shank, calc_size_mm: sizeMm,
    }, limit);
    if (rows.length) return rows;
  }

  // Pass 3 — relax grit + widen size tolerance to ±0.3mm
  if (sizeMm !== null) {
    rows = await lookupByFeatures(pool, {
      shape_family: shape, material, grit_ring_color: null,
      shank_type: shank, calc_size_mm: sizeMm, size_tolerance: 0.3,
    }, limit);
    if (rows.length) return rows;
  }

  // Pass 4 — shape synonym (torpedo ↔ tapered_round_end, cylinder ↔ cylinder_round_end, etc.)
  const synShape = SHAPE_SYNONYMS[shape ?? ''];
  if (synShape) {
    rows = await lookupByFeatures(pool, {
      shape_family: synShape, material, grit_ring_color: null,
      shank_type: shank, calc_size_mm: sizeMm, size_tolerance: 0.3,
    }, limit);
    if (rows.length) return rows;
  }

  // Pass 5 — broad: shape (+ synonym) + material only, skip shank and size
  const broadShape = synShape ?? shape;
  rows = await lookupByFeatures(pool, {
    shape_family: broadShape, material, grit_ring_color: null,
    shank_type: 'unknown', calc_size_mm: null,
  }, limit);
  return rows;
}

function mapToProductMatch(
  row: { product_id: string; head_size_mm: number; shank_type: string; name: string; image_url: string | null },
  baseConfidence: number,
): ProductMatch {
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
  candidates: Array<{ product_id: string; head_size_mm: number; shank_type: string; name: string; image_url: string | null }>,
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
  role: string,
  signal?: AbortSignal,
): Promise<EngineResult> {
  const startMs = Date.now();

  const imageHash = createHash('sha256')
    .update(Buffer.from(imageBase64, 'base64'))
    .digest('hex');

  const cached = await getCached(deps.pool, imageHash);
  if (cached) {
    const { budgetState } = await checkBudget(deps.pool, userId, role);
    return {
      result:          cached.result_json as RecognitionResult,
      budgetState,
      processingMs:    Date.now() - startMs,
      imageHash,
      broadCandidates: [],
    };
  }

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

  let features: InstrumentFeatures;
  try {
    features = await deps.callVisionApi(imageBase64, signal);
  } catch (err) {
    logger.warn('[recognition-engine] Vision API error', { error: err instanceof Error ? err.message : String(err) });
    return {
      result:          { state: 'error', message: 'Servizio di riconoscimento temporaneamente non disponibile' },
      budgetState,
      processingMs:    Date.now() - startMs,
      imageHash,
      broadCandidates: [],
    };
  }

  // Layer E: override vision ratio with pixel-accurate measurement when available
  const measuredRatio = await measureHeadShankRatio(imageBase64);
  if (measuredRatio !== null) {
    logger.info('[recognition-engine] Head/shank ratio from pixel analysis', {
      vision: features.head_shank_ratio,
      measured: measuredRatio,
    });
    features = { ...features, head_shank_ratio: measuredRatio };
  }

  // Layer B: correct shank type using length category (FG vs HP resolution)
  const correctedShank = resolveShankType(features.shank_type, features.shank_length_category);
  if (correctedShank !== features.shank_type) {
    logger.info('[recognition-engine] Shank type corrected via length', {
      from: features.shank_type, to: correctedShank,
      shank_length_category: features.shank_length_category,
    });
  }

  // Use corrected shank diameter for size calculation
  const calcSizeMm = features.head_shank_ratio
    ? calculateHeadSizeMm(features.head_shank_ratio, correctedShank)
    : null;

  // 'none' or null grit from vision → skip grit filter (ring not visible or ultrafine)
  const gritFilter = (features.grit_ring_color === 'none' || features.grit_ring_color === null)
    ? null
    : features.grit_ring_color;

  // Layer C+D: progressive lookup with shape synonyms fallback
  const candidates = await progressiveLookup(
    deps.pool,
    features.shape_family,
    features.material,
    gritFilter,
    correctedShank,
    calcSizeMm,
    20,
  );

  const broadRows = await progressiveLookup(
    deps.pool,
    features.shape_family,
    features.material,
    null,
    correctedShank,
    null,
    10,
  );
  const broadCandidates: ProductMatch[] = broadRows.map((r, i) =>
    mapToProductMatch(r, Math.max(0.3, features.confidence - i * 0.06)),
  );

  const result = buildRecognitionResult(candidates, features, calcSizeMm);

  await setCached(deps.pool, imageHash, result, Buffer.from(imageBase64, 'base64'));
  const budgetConsumed = await consumeBudget(deps.pool);
  if (!budgetConsumed) {
    logger.warn('[recognition-engine] Budget race condition', { userId });
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

export { runRecognitionPipeline, buildRecognitionResult, resolveShankType, SHAPE_SYNONYMS };
