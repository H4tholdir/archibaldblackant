import { Router } from 'express';
import multer from 'multer';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import { performArcaSync } from '../services/arca-sync-service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

export function createArcaSyncRouter(deps: { pool: DbPool; broadcast?: (userId: string, event: any) => void }) {
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

        const result = await performArcaSync(
          deps.pool,
          req.user!.userId,
          files.doctes[0].buffer,
          files.docrig[0].buffer,
          files.anagrafe?.[0]?.buffer ?? null,
        );

        deps.broadcast?.(req.user!.userId, {
          type: 'ARCA_SYNC_COMPLETED',
          payload: {
            imported: result.imported,
            exported: result.exported,
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
