import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import { getChangesSince, getCurrentVersions, DEFAULT_CHANGE_LIMIT } from '../db/repositories/change-log';
import type { ChangeLogEntry } from '../db/repositories/change-log';
import { logger } from '../logger';

type DeltaSyncDeps = {
  pool: DbPool;
};

function createDeltaSyncRouter(deps: DeltaSyncDeps): Router {
  const { pool } = deps;
  const router = Router();

  router.get('/delta', async (req: AuthRequest, res) => {
    try {
      const sinceParam = req.query.since;

      if (sinceParam === undefined || sinceParam === '') {
        return res.status(400).json({
          success: false,
          error: 'Missing required query parameter: since',
        });
      }

      const sinceVersion = Number(sinceParam);
      if (!Number.isFinite(sinceVersion)) {
        return res.status(400).json({
          success: false,
          error: 'Parameter "since" must be a valid number',
        });
      }

      const changes = await getChangesSince(pool, sinceVersion, DEFAULT_CHANGE_LIMIT);
      const currentVersions = await getCurrentVersions(pool);
      const hasMore = changes.length === DEFAULT_CHANGE_LIMIT;

      res.json({
        success: true,
        changes,
        currentVersions,
        hasMore,
      });
    } catch (error) {
      logger.error('Error fetching delta changes', { error });
      res.status(500).json({ success: false, error: 'Failed to fetch delta changes' });
    }
  });

  router.get('/version', async (_req: AuthRequest, res) => {
    try {
      const versions = await getCurrentVersions(pool);

      res.json({
        success: true,
        versions,
      });
    } catch (error) {
      logger.error('Error fetching sync versions', { error });
      res.status(500).json({ success: false, error: 'Failed to fetch sync versions' });
    }
  });

  return router;
}

export { createDeltaSyncRouter, type DeltaSyncDeps };
