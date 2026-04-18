import { Router } from 'express'
import type { AuthRequest } from '../middleware/auth'
import type { DbPool } from '../db/pool'
import { getOverdueReport } from '../db/repositories/overdue-report'
import { logger } from '../logger'

type OverdueReportRouterDeps = {
  pool: DbPool
}

export function createOverdueReportRouter({ pool }: OverdueReportRouterDeps) {
  const router = Router()

  router.get('/overdue-report', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId
      const data = await getOverdueReport(pool, userId)
      res.json(data)
    } catch (err) {
      logger.error('Errore generazione overdue report', { err })
      res.status(500).json({ error: 'Errore interno del server' })
    }
  })

  return router
}
