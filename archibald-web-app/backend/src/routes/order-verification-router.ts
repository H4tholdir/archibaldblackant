import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import { getOrderVerificationSnapshot } from '../db/repositories/order-verification';
import { formatVerificationNotification } from '../verification/format-notification';
import type { VerificationStatus } from '../db/repositories/order-verification';
import type { ArticleMismatch } from '../verification/verify-order-articles';
import { logger } from '../logger';

type OrderVerificationRouterDeps = {
  pool: DbPool;
};

function createOrderVerificationRouter(deps: OrderVerificationRouterDeps) {
  const { pool } = deps;
  const router = Router();

  router.get('/:orderId/verification', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { orderId } = req.params;

      const snapshot = await getOrderVerificationSnapshot(pool, orderId, userId);

      if (!snapshot) {
        return res.json({ notification: null });
      }

      const status = snapshot.verificationStatus as VerificationStatus;

      if (status !== 'correction_failed' && status !== 'mismatch_detected') {
        return res.json({ notification: null });
      }

      let mismatches: ArticleMismatch[] = [];
      if (snapshot.verificationNotes) {
        const parsed = JSON.parse(snapshot.verificationNotes);
        mismatches = Array.isArray(parsed) ? parsed : [];
      }

      const notification = formatVerificationNotification(status, mismatches);

      res.json({ notification });
    } catch (error) {
      logger.error('Error fetching order verification', { error });
      res.status(500).json({ notification: null, error: 'Errore nel recupero verifica ordine' });
    }
  });

  return router;
}

export { createOrderVerificationRouter, type OrderVerificationRouterDeps };
