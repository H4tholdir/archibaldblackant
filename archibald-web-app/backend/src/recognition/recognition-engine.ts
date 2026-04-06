import { createHash } from 'crypto';
import type { DbPool } from '../db/pool';
import type { InstrumentFeatures, RecognitionResult, ProductMatch, FilterQuestion, BudgetState } from './types';
import { checkBudget, consumeBudget } from './budget-service';
import { getCached, setCached } from '../db/repositories/recognition-cache';
import { lookupByFeatures } from '../db/repositories/instrument-features';
import { appendRecognitionLog } from '../db/repositories/recognition-log';
import { calculateHeadSizeMm } from './komet-code-parser';
import type { VisionApiFn } from '../services/anthropic-vision-service';
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

  const calcSizeMm = (features.head_px && features.shank_px)
    ? calculateHeadSizeMm(features.head_px, features.shank_px, features.shank_type)
    : null;

  const candidates = await lookupByFeatures(deps.pool, {
    shape_family:    features.shape_family,
    material:        features.material,
    grit_ring_color: features.grit_ring_color,
    shank_type:      features.shank_type ?? 'fg',
    calc_size_mm:    calcSizeMm,
  });

  const broadRows = await lookupByFeatures(deps.pool, {
    shape_family:    features.shape_family,
    material:        features.material,
    grit_ring_color: features.grit_ring_color,
    shank_type:      features.shank_type ?? 'fg',
    calc_size_mm:    null,
  }, 10);
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

export { runRecognitionPipeline, buildRecognitionResult };
