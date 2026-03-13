import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import { logger } from '../logger';
import type { MatchResult } from '../db/repositories/sub-client-matches.repository';

type SubClientMatchesRouterDeps = {
  getMatchesForSubClient: (userId: string, codice: string) => Promise<MatchResult>;
  getMatchesForCustomer: (userId: string, profileId: string) => Promise<MatchResult>;
  addCustomerMatch: (codice: string, customerProfileId: string) => Promise<void>;
  removeCustomerMatch: (codice: string, customerProfileId: string) => Promise<void>;
  addSubClientMatch: (codiceA: string, codiceB: string) => Promise<void>;
  removeSubClientMatch: (codiceA: string, codiceB: string) => Promise<void>;
  upsertSkipModal: (userId: string, entityType: 'subclient' | 'customer', entityId: string, skip: boolean) => Promise<void>;
};

const customerMatchBody = z.object({
  codice: z.string().min(1),
  customerProfileId: z.string().min(1),
});

const subClientMatchBody = z.object({
  codiceA: z.string().min(1),
  codiceB: z.string().min(1),
});

const skipModalBody = z.object({
  entityType: z.enum(['subclient', 'customer']),
  entityId: z.string().min(1),
  skip: z.boolean(),
});

function createSubClientMatchesRouter(deps: SubClientMatchesRouterDeps) {
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    const { codice } = req.query as Record<string, string | undefined>;
    if (!codice) {
      res.status(400).json({ error: 'codice richiesto' });
      return;
    }
    try {
      const result = await deps.getMatchesForSubClient(req.user!.userId, codice);
      res.json(result);
    } catch (err) {
      logger.error('Error getting matches for subclient', { error: err });
      res.status(500).json({ error: 'Errore recupero match' });
    }
  });

  router.get('/by-customer', async (req: AuthRequest, res) => {
    const { profileId } = req.query as Record<string, string | undefined>;
    if (!profileId) {
      res.status(400).json({ error: 'profileId richiesto' });
      return;
    }
    try {
      const result = await deps.getMatchesForCustomer(req.user!.userId, profileId);
      res.json(result);
    } catch (err) {
      logger.error('Error getting matches for customer', { error: err });
      res.status(500).json({ error: 'Errore recupero match' });
    }
  });

  router.post('/customer', async (req: AuthRequest, res) => {
    const parsed = customerMatchBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    try {
      await deps.addCustomerMatch(parsed.data.codice, parsed.data.customerProfileId);
      res.json({ success: true });
    } catch (err) {
      logger.error('Error adding customer match', { error: err });
      res.status(500).json({ error: 'Errore aggiunta match' });
    }
  });

  router.delete('/customer', async (req: AuthRequest, res) => {
    const { codice, customerProfileId } = req.query as Record<string, string | undefined>;
    if (!codice || !customerProfileId) { res.status(400).json({ error: 'codice e customerProfileId richiesti' }); return; }
    try {
      await deps.removeCustomerMatch(codice, customerProfileId);
      res.json({ success: true });
    } catch (err) {
      logger.error('Error removing customer match', { error: err });
      res.status(500).json({ error: 'Errore rimozione match' });
    }
  });

  router.post('/subclient', async (req: AuthRequest, res) => {
    const parsed = subClientMatchBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    try {
      await deps.addSubClientMatch(parsed.data.codiceA, parsed.data.codiceB);
      res.json({ success: true });
    } catch (err) {
      logger.error('Error adding subclient match', { error: err });
      res.status(500).json({ error: 'Errore aggiunta match' });
    }
  });

  router.delete('/subclient', async (req: AuthRequest, res) => {
    const { codiceA, codiceB } = req.query as Record<string, string | undefined>;
    if (!codiceA || !codiceB) { res.status(400).json({ error: 'codiceA e codiceB richiesti' }); return; }
    try {
      await deps.removeSubClientMatch(codiceA, codiceB);
      res.json({ success: true });
    } catch (err) {
      logger.error('Error removing subclient match', { error: err });
      res.status(500).json({ error: 'Errore rimozione match' });
    }
  });

  router.patch('/skip-modal', async (req: AuthRequest, res) => {
    const parsed = skipModalBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    try {
      await deps.upsertSkipModal(req.user!.userId, parsed.data.entityType, parsed.data.entityId, parsed.data.skip);
      res.json({ success: true });
    } catch (err) {
      logger.error('Error upserting skip modal pref', { error: err });
      res.status(500).json({ error: 'Errore salvataggio preferenza' });
    }
  });

  return router;
}

export { createSubClientMatchesRouter, type SubClientMatchesRouterDeps };
