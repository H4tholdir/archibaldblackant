import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import { getExceptionsByUser } from '../db/repositories/tracking-exceptions';
import { logger } from '../logger';

type TrackingRouterDeps = { pool: DbPool };

function createTrackingRouter(deps: TrackingRouterDeps): Router {
  const router = Router();

  router.get('/my-exceptions', async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { status = 'all', from, to } = req.query as Record<string, string>;
      const exceptions = await getExceptionsByUser(
        deps.pool,
        userId,
        { status: status as 'open' | 'closed' | 'all', from, to },
      );
      res.json(exceptions);
    } catch (error) {
      logger.error('Error fetching tracking exceptions', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export { createTrackingRouter };
