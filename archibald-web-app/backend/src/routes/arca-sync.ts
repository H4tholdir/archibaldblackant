import { Router } from 'express';
import multer from 'multer';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import { performArcaSync } from '../services/arca-sync-service';
import { logger } from '../logger';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

type ArcaSyncRouterDeps = {
  pool: DbPool;
  broadcast?: (userId: string, event: any) => void;
  enqueueJob?: (type: 'sync-order-articles', userId: string, data: { orderId: string }) => Promise<string>;
};

export function createArcaSyncRouter(deps: ArcaSyncRouterDeps) {
  const router = Router();

  router.post(
    '/',
    upload.fields([
      { name: 'doctes', maxCount: 1 },
      { name: 'docrig', maxCount: 1 },
      { name: 'anagrafe', maxCount: 1 },
    ]),
    async (req: AuthRequest, res) => {
      try {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        if (!files?.doctes?.[0] || !files?.docrig?.[0]) {
          return res.status(400).json({ error: 'doctes.dbf e docrig.dbf sono obbligatori' });
        }

        const userId = req.user!.userId;

        const result = await performArcaSync(
          deps.pool,
          userId,
          files.doctes[0].buffer,
          files.docrig[0].buffer,
          files.anagrafe?.[0]?.buffer ?? null,
        );

        // Trigger article sync for KT orders missing articles
        if (deps.enqueueJob && result.ktMissingArticles.length > 0) {
          for (const orderId of result.ktMissingArticles) {
            try {
              await deps.enqueueJob('sync-order-articles', userId, { orderId });
            } catch (err) {
              logger.warn('Failed to enqueue article sync for KT order', { orderId, error: err });
            }
          }
          logger.info(`Arca sync: enqueued article sync for ${result.ktMissingArticles.length} KT orders`);
        }

        deps.broadcast?.(userId, {
          type: 'ARCA_SYNC_COMPLETED',
          payload: {
            imported: result.imported,
            exported: result.exported,
            ktExported: result.ktExported,
            skipped: result.skipped,
          },
          timestamp: new Date().toISOString(),
        });

        res.json({
          success: true,
          sync: {
            imported: result.imported,
            skipped: result.skipped,
            exported: result.exported,
            ktExported: result.ktExported,
            ktNeedingMatch: result.ktNeedingMatch,
            ktMissingArticles: result.ktMissingArticles,
            errors: result.errors,
          },
          parseStats: result.parseStats,
          vbsScript: result.vbsScript,
        });
      } catch (err: any) {
        console.error('Arca sync error:', err);
        res.status(500).json({ error: err.message || 'Sync failed' });
      }
    },
  );

  return router;
}
