import { Router } from 'express';
import type { DbPool } from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import type { Customer } from '../db/repositories/customers';
import { logger } from '../logger';

type CustomersRouterDeps = {
  pool: DbPool;
  getCustomers: (userId: string, searchQuery?: string) => Promise<Customer[]>;
  getCustomerByProfile: (userId: string, customerProfile: string) => Promise<Customer | undefined>;
  getCustomerCount: (userId: string) => Promise<number>;
  getLastSyncTime: (userId: string) => Promise<number | null>;
  getCustomerPhoto: (userId: string, customerProfile: string) => Promise<string | undefined>;
  setCustomerPhoto: (userId: string, customerProfile: string, photo: string) => Promise<void>;
  deleteCustomerPhoto: (userId: string, customerProfile: string) => Promise<void>;
};

function createCustomersRouter(deps: CustomersRouterDeps) {
  const { getCustomers, getCustomerByProfile, getCustomerCount, getLastSyncTime, getCustomerPhoto, setCustomerPhoto, deleteCustomerPhoto } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const search = req.query.search as string | undefined;
      const customers = await getCustomers(userId, search);
      res.json({ success: true, data: customers });
    } catch (error) {
      logger.error('Error fetching customers', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero clienti' });
    }
  });

  router.get('/count', async (req: AuthRequest, res) => {
    try {
      const count = await getCustomerCount(req.user!.userId);
      res.json({ success: true, count });
    } catch (error) {
      logger.error('Error counting customers', { error });
      res.status(500).json({ success: false, error: 'Errore nel conteggio clienti' });
    }
  });

  router.get('/sync-status', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const [count, lastSync] = await Promise.all([
        getCustomerCount(userId),
        getLastSyncTime(userId),
      ]);
      res.json({ success: true, count, lastSync });
    } catch (error) {
      logger.error('Error fetching sync status', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero stato sync' });
    }
  });

  router.get('/:customerProfile', async (req: AuthRequest, res) => {
    try {
      const customer = await getCustomerByProfile(req.user!.userId, req.params.customerProfile);
      if (!customer) {
        return res.status(404).json({ success: false, error: 'Cliente non trovato' });
      }
      res.json({ success: true, data: customer });
    } catch (error) {
      logger.error('Error fetching customer', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero cliente' });
    }
  });

  router.get('/:customerProfile/photo', async (req: AuthRequest, res) => {
    try {
      const photo = await getCustomerPhoto(req.user!.userId, req.params.customerProfile);
      if (!photo) {
        return res.status(404).json({ success: false, error: 'Foto non trovata' });
      }
      res.json({ success: true, photo });
    } catch (error) {
      logger.error('Error fetching customer photo', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero foto' });
    }
  });

  router.put('/:customerProfile/photo', async (req: AuthRequest, res) => {
    try {
      const { photo } = req.body;
      if (!photo || typeof photo !== 'string') {
        return res.status(400).json({ success: false, error: 'Foto richiesta' });
      }
      await setCustomerPhoto(req.user!.userId, req.params.customerProfile, photo);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error saving customer photo', { error });
      res.status(500).json({ success: false, error: 'Errore nel salvataggio foto' });
    }
  });

  router.delete('/:customerProfile/photo', async (req: AuthRequest, res) => {
    try {
      await deleteCustomerPhoto(req.user!.userId, req.params.customerProfile);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting customer photo', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione foto' });
    }
  });

  return router;
}

export { createCustomersRouter, type CustomersRouterDeps };
