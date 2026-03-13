import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { FullHistoryOrder } from '../types/full-history';
import { logger } from '../logger';

type CustomerFullHistoryRouterDeps = {
  getCustomerFullHistory: (
    userId: string,
    params: {
      customerProfileIds?: string[];
      customerName?: string;
      subClientCodices?: string[];
    },
  ) => Promise<FullHistoryOrder[]>;
};

function createCustomerFullHistoryRouter(deps: CustomerFullHistoryRouterDeps) {
  const router = Router();

  router.get('/customer-full-history', async (req: AuthRequest, res) => {
    const query = req.query as Record<string, string | string[] | undefined>;

    // Express parses repeated params as arrays: ?customerProfileIds[]=X&customerProfileIds[]=Y
    const customerProfileIds = normalizeArray(query['customerProfileIds[]'] ?? query['customerProfileIds']);
    const subClientCodices = normalizeArray(query['subClientCodices[]'] ?? query['subClientCodices']);
    const customerName = typeof query['customerName'] === 'string' ? query['customerName'] : undefined;

    if (customerProfileIds.length === 0 && !customerName && subClientCodices.length === 0) {
      res.status(400).json({ error: 'Almeno uno tra customerProfileIds, customerName e subClientCodices è richiesto' });
      return;
    }

    try {
      const userId = req.user!.userId;
      const orders = await deps.getCustomerFullHistory(userId, { customerProfileIds, customerName, subClientCodices });
      res.json({ orders });
    } catch (err) {
      logger.error('Error fetching customer full history', { error: err instanceof Error ? err.message : err });
      res.status(500).json({ error: 'Errore nel recupero dello storico' });
    }
  });

  return router;
}

function normalizeArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val.filter(Boolean) : [val];
}

export { createCustomerFullHistoryRouter, type CustomerFullHistoryRouterDeps };
