import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import type { CatalogVisionService } from '../recognition/recognition-engine';
import type { VisualEmbeddingService } from '../recognition/visual-embedding-service';
import type { OperationType } from '../operations/operation-types';
import { runRecognitionPipeline } from '../recognition/recognition-engine';
import { getBudgetRow, resetBudgetIfExpired } from '../db/repositories/recognition-budget';
import { logger } from '../logger';

type RecognitionRouterDeps = {
  pool:                 DbPool;
  catalogVisionService: CatalogVisionService;
  embeddingSvc:         VisualEmbeddingService;
  minSimilarity:        number;
  dailyLimit:           number;
  timeoutMs:            number;
  queue?: {
    enqueue: (type: OperationType, userId: string, data: Record<string, unknown>) => Promise<string>;
  };
};

const identifySchema = z.object({
  image:  z.string().min(10).optional(),
  images: z.array(z.string().min(10)).min(1).max(2).optional(),
}).refine(
  data => data.image != null || (data.images != null && data.images.length > 0),
  { message: 'image or images required' },
);

const feedbackSchema = z.object({
  imageHash:       z.string().regex(/^[0-9a-f]{64}$/, 'imageHash must be a 64-character hex string'),
  productId:       z.string().min(1),
  confirmedByUser: z.boolean(),
});

function createRecognitionRouter(deps: RecognitionRouterDeps) {
  const router = Router();
  const { pool, catalogVisionService } = deps;

  // Rate limiter per-istanza (isolamento nei test)
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

    if (isRateLimited(userId)) {
      res.status(429).json({ error: 'Troppe richieste. Attendi un minuto.' });
      return;
    }

    const { image, images: imagesArr } = parsed.data;
    const images = imagesArr ?? [image!];

    const abortController = new AbortController();
    req.on('close', () => {
      if (!res.headersSent) abortController.abort();
    });

    try {
      const { result, budgetState, processingMs, imageHash } =
        await runRecognitionPipeline(
          { pool, catalogVisionService, embeddingSvc: deps.embeddingSvc, minSimilarity: deps.minSimilarity },
          images,
          userId,
          role,
          abortController.signal,
        );
      if (res.headersSent) return;
      res.json({ result, budgetState, processingMs, imageHash });
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
