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
  images:          z.array(z.string().min(10)).min(1).max(5),
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
        const fireTime = Date.now()
        const ts = rateLimitMap.get(userId)
        if (ts && !ts.some(t => fireTime - t < RATE_LIMIT_WINDOW_MS)) {
          rateLimitMap.delete(userId)
        }
      }, RATE_LIMIT_WINDOW_MS)
    }
    return recent.length > RATE_LIMIT_MAX
  }

  router.post('/identify', async (req: AuthRequest, res) => {
    const parsed = identifySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'images (array of base64 strings, 1–5 elements) required' })
      return
    }

    const userId = req.user!.userId
    const role   = req.user!.role

    if (isRateLimited(userId)) {
      res.status(429).json({ error: 'Troppe richieste. Attendi un minuto.' })
      return
    }

    const { images, aruco_px_per_mm } = parsed.data
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
          images[0]!,
          userId,
          role,
          aruco_px_per_mm ?? null,
          abortController.signal,
          images.length > 1 ? images.slice(1) : undefined,
        )
      if (res.headersSent) return
      // Backward compat: frontend legge result.state, nuovo client usa result.type
      const resultWithAlias = { ...result, state: (result as any).type }
      res.json({ result: resultWithAlias, budgetState, processingMs, imageHash })
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
      try {
        await deps.queue.enqueue('recognition-feedback', userId, { imageHash, productId })
        res.json({ queued: true })
      } catch (error) {
        logger.error('[recognition] feedback enqueue failed', { error })
        res.status(500).json({ error: 'Internal server error' })
      }
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
