import { Router } from 'express';
import type { DbPool } from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import { getActiveJobsByUserId } from '../db/repositories/active-jobs';

type ActiveJobsRouterDeps = {
  pool: DbPool;
};

function createActiveJobsRouter(deps: ActiveJobsRouterDeps) {
  const { pool } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const jobs = await getActiveJobsByUserId(pool, userId);
      res.json({ success: true, jobs });
    } catch {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  return router;
}

export { createActiveJobsRouter, type ActiveJobsRouterDeps };
