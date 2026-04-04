import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';

export function createCapLookupRouter(pool: DbPool) {
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    const cap = (req.query['cap'] as string)?.trim();
    if (!cap || cap.length !== 5 || !/^\d{5}$/.test(cap)) {
      res.json({ success: true, data: [] });
      return;
    }
    try {
      const result = await pool.query<{ city: string; county: string | null; state: string | null }>(
        `SELECT DISTINCT city, county, state
         FROM agents.customers
         WHERE user_id = $1
           AND postal_code = $2
           AND city IS NOT NULL AND city != ''
         LIMIT 10`,
        [req.user!.userId, cap],
      );
      res.json({ success: true, data: result.rows });
    } catch {
      res.json({ success: true, data: [] });
    }
  });

  return router;
}
