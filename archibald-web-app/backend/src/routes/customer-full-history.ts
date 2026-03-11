import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { FullHistoryOrder } from '../types/full-history';
import { logger } from '../logger';

type CustomerFullHistoryRouterDeps = {
  getCustomerFullHistory: (
    userId: string,
    params: { customerProfileId?: string; customerName?: string; subClientCodice?: string },
  ) => Promise<FullHistoryOrder[]>;
};

function createCustomerFullHistoryRouter(deps: CustomerFullHistoryRouterDeps) {
  const router = Router();

  router.get('/customer-full-history', async (req: AuthRequest, res) => {
    const { customerProfileId, customerName, subClientCodice } = req.query as Record<string, string | undefined>;

    if (!customerProfileId && !customerName && !subClientCodice) {
      res.status(400).json({ error: 'Almeno uno tra customerProfileId, customerName e subClientCodice è richiesto' });
      return;
    }

    try {
      const userId = req.user!.userId;
      const orders = await deps.getCustomerFullHistory(userId, { customerProfileId, customerName, subClientCodice });
      res.json({ orders });
    } catch (err) {
      logger.error('Error fetching customer full history', { error: err instanceof Error ? err.message : err });
      res.status(500).json({ error: 'Errore nel recupero dello storico' });
    }
  });

  return router;
}

export { createCustomerFullHistoryRouter, type CustomerFullHistoryRouterDeps };
