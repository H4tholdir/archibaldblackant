import { Router } from 'express';
import multer from 'multer';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import { performArcaSync, getKtSyncStatus, generateKtExportVbs, suggestNextCodice, importCustomerAsSubclient } from '../services/arca-sync-service';
import type { VbsExportRecord } from '../services/arca-sync-service';
import { logger } from '../logger';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

export type ArcaSyncRouterDeps = {
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
            updated: result.updated,
            softDeleted: result.softDeleted,
            renumbered: result.renumbered,
            ktRecovered: result.ktRecovered,
            deletionWarnings: result.deletionWarnings,
            ktNeedingMatch: result.ktNeedingMatch,
            ktMissingArticles: result.ktMissingArticles,
            errors: result.errors,
          },
          parseStats: result.parseStats,
          ftExportRecords: result.ftExportRecords,
        });
      } catch (err: any) {
        console.error('Arca sync error:', err);
        res.status(500).json({ error: err.message || 'Sync failed' });
      }
    },
  );

  router.get('/kt-status', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const status = await getKtSyncStatus(deps.pool, userId);
      res.json({ success: true, data: status });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to get KT status' });
    }
  });

  router.post('/finalize-kt', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const ftExportRecords: VbsExportRecord[] = req.body?.ftExportRecords ?? [];
      const result = await generateKtExportVbs(deps.pool, userId, ftExportRecords);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to finalize KT' });
    }
  });

  router.get('/suggest-codice', async (req: AuthRequest, res) => {
    try {
      const suggestedCode = await suggestNextCodice(deps.pool);
      res.json({ suggestedCode });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to suggest codice';
      const isOverflow = message.includes('Codici C esauriti');
      res.status(isOverflow ? 422 : 500).json({ error: message });
    }
  });

  router.get('/check-codice', async (req: AuthRequest, res) => {
    const code = req.query.code as string | undefined;
    if (!code) return void res.status(400).json({ error: 'Parametro code mancante' });
    try {
      const { rows } = await deps.pool.query(
        `SELECT codice FROM shared.sub_clients WHERE codice = $1 LIMIT 1`,
        [code],
      );
      res.json({ exists: rows.length > 0 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to check codice';
      res.status(500).json({ error: message });
    }
  });

  router.post('/import-customer', async (req: AuthRequest, res) => {
    const { customerProfileId, codice } = req.body ?? {};
    if (!customerProfileId || !codice) {
      return void res.status(400).json({ error: 'customerProfileId e codice sono obbligatori' });
    }
    try {
      await importCustomerAsSubclient(deps.pool, req.user!.userId, customerProfileId, codice);
      res.json({ success: true, codice });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to import customer';
      if (message === 'Codice già in uso') return void res.status(409).json({ error: message });
      if (message.startsWith('Formato codice non valido')) return void res.status(422).json({ error: message });
      res.status(500).json({ error: message });
    }
  });

  return router;
}
