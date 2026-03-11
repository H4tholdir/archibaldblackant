import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { FullHistoryOrder } from '../types/full-history';

type CustomerFullHistoryRouterDeps = {
  getCustomerFullHistory: (
    userId: string,
    params: { customerProfileId?: string; subClientCodice?: string },
  ) => Promise<FullHistoryOrder[]>;
};

function createCustomerFullHistoryRouter(deps: CustomerFullHistoryRouterDeps) {
  const router = Router();

  router.get('/customer-full-history', async (req: AuthRequest, res) => {
    const { customerProfileId, subClientCodice } = req.query as Record<string, string | undefined>;

    if (!customerProfileId && !subClientCodice) {
      res.status(400).json({ error: 'Almeno uno tra customerProfileId e subClientCodice è richiesto' });
      return;
    }

    try {
      const userId = req.user!.userId;
      const orders = await deps.getCustomerFullHistory(userId, { customerProfileId, subClientCodice });
      res.json({ orders });
    } catch {
      res.status(500).json({ error: 'Errore nel recupero dello storico' });
    }
  });

  return router;
}

export { createCustomerFullHistoryRouter, type CustomerFullHistoryRouterDeps };
