import { Router } from 'express';
import type { DbPool } from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import { preflightPending } from '../conductor/preflight-service';

export function createPreflightRouter(deps: { pool: DbPool }) {
  const router = Router();

  router.get('/:pendingId/preflight', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { pendingId } = req.params;
      const result = await preflightPending(deps.pool, userId, pendingId);
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
