import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import type { WebSocketMessage } from '../realtime/websocket-server';
import { logger } from '../logger';
import {
  getDraftByUserId,
  createDraft,
  deleteDraftByUserId,
} from '../db/repositories/order-drafts.repo';

type DraftsRouterDeps = {
  pool: DbPool;
  broadcast: (userId: string, msg: WebSocketMessage) => void;
};

function createDraftsRouter({ pool, broadcast }: DraftsRouterDeps): Router {
  const router = Router();

  router.get('/active', async (req: AuthRequest, res) => {
    try {
      const draft = await getDraftByUserId(pool, req.user!.userId);
      res.json({ draft });
    } catch (error) {
      logger.error('Error getting active draft', { error });
      res.status(500).json({ error: 'Errore server' });
    }
  });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const draft = await createDraft(pool, req.user!.userId, req.body.payload ?? {});
      res.status(201).json({ draft });
    } catch (error) {
      logger.error('Error creating draft', { error });
      res.status(500).json({ error: 'Errore server' });
    }
  });

  router.delete('/active', async (req: AuthRequest, res) => {
    try {
      await deleteDraftByUserId(pool, req.user!.userId);
      if (req.query.submitted === 'true') {
        broadcast(req.user!.userId, {
          type: 'draft:submitted',
          payload: {},
          timestamp: new Date().toISOString(),
        });
      }
      res.sendStatus(204);
    } catch (error) {
      logger.error('Error deleting draft', { error });
      res.status(500).json({ error: 'Errore server' });
    }
  });

  return router;
}

export { createDraftsRouter, type DraftsRouterDeps };
