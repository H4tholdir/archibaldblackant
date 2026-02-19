import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { Customer, CustomerFormInput } from '../db/repositories/customers';
import type { OperationType } from '../operations/operation-types';
import { logger } from '../logger';

type QueueLike = {
  enqueue: (type: OperationType, userId: string, data: Record<string, unknown>) => Promise<string>;
};

type CustomersRouterDeps = {
  queue: QueueLike;
  getCustomers: (userId: string, searchQuery?: string) => Promise<Customer[]>;
  getCustomerByProfile: (userId: string, customerProfile: string) => Promise<Customer | undefined>;
  getCustomerCount: (userId: string) => Promise<number>;
  getLastSyncTime: (userId: string) => Promise<number | null>;
  getCustomerPhoto: (userId: string, customerProfile: string) => Promise<string | undefined>;
  setCustomerPhoto: (userId: string, customerProfile: string, photo: string) => Promise<void>;
  deleteCustomerPhoto: (userId: string, customerProfile: string) => Promise<void>;
  upsertSingleCustomer: (userId: string, formData: CustomerFormInput, customerProfile: string, botStatus: string) => Promise<Customer>;
  updateCustomerBotStatus: (userId: string, customerProfile: string, status: string) => Promise<void>;
  updateArchibaldName: (userId: string, customerProfile: string, name: string) => Promise<void>;
};

const createCustomerSchema = z.object({
  name: z.string().min(1, 'Il nome del cliente è obbligatorio'),
  vatNumber: z.string().optional(),
  pec: z.string().optional(),
  sdi: z.string().optional(),
  street: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().optional(),
  url: z.string().optional(),
  deliveryMode: z.string().optional(),
});

function createCustomersRouter(deps: CustomersRouterDeps) {
  const {
    queue, getCustomers, getCustomerByProfile, getCustomerCount, getLastSyncTime,
    getCustomerPhoto, setCustomerPhoto, deleteCustomerPhoto,
    upsertSingleCustomer, updateCustomerBotStatus, updateArchibaldName,
  } = deps;
  const router = Router();

  router.post('/sync', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const jobId = await queue.enqueue('sync-customers', userId, {});
      res.json({ success: true, jobId });
    } catch (error) {
      logger.error('Error enqueuing customer sync', { error });
      res.status(500).json({ success: false, error: 'Errore avvio sincronizzazione clienti' });
    }
  });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const parsed = createCustomerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      }

      const formData: CustomerFormInput = parsed.data;
      const tempProfile = `TEMP-${Date.now()}`;

      const customer = await upsertSingleCustomer(userId, formData, tempProfile, 'pending');

      const jobId = await queue.enqueue('create-customer', userId, {
        customerProfile: tempProfile,
        ...formData,
      });

      res.json({
        success: true,
        data: { customer, jobId },
        message: 'Cliente creato. Sincronizzazione con Archibald in corso...',
      });
    } catch (error) {
      logger.error('Error creating customer', { error });
      res.status(500).json({ success: false, error: 'Errore durante la creazione del cliente' });
    }
  });

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

  router.put('/:customerProfile', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { customerProfile } = req.params;
      const parsed = createCustomerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      }

      const formData: CustomerFormInput = parsed.data;
      const existing = await getCustomerByProfile(userId, customerProfile);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Cliente non trovato' });
      }

      const originalName = existing.archibaldName || existing.name;

      await upsertSingleCustomer(userId, formData, customerProfile, 'pending');
      await updateArchibaldName(userId, customerProfile, originalName);

      const jobId = await queue.enqueue('update-customer', userId, {
        customerProfile,
        originalName,
        ...formData,
      });

      res.json({
        success: true,
        data: { jobId },
        message: `Cliente ${customerProfile} aggiornato. Sincronizzazione con Archibald in corso...`,
      });
    } catch (error) {
      logger.error('Error updating customer', { error });
      res.status(500).json({ success: false, error: 'Errore durante l\'aggiornamento del cliente' });
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

  router.get('/:customerProfile/status', async (req: AuthRequest, res) => {
    try {
      const customer = await getCustomerByProfile(req.user!.userId, req.params.customerProfile);
      if (!customer) {
        return res.status(404).json({ success: false, error: 'Cliente non trovato' });
      }
      res.json({ success: true, data: { botStatus: customer.botStatus || 'placed' } });
    } catch (error) {
      logger.error('Error fetching customer status', { error });
      res.status(500).json({ success: false, error: 'Errore durante il recupero dello stato' });
    }
  });

  router.post('/:customerProfile/retry', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { customerProfile } = req.params;
      const customer = await getCustomerByProfile(userId, customerProfile);

      if (!customer) {
        return res.status(404).json({ success: false, error: 'Cliente non trovato' });
      }

      await updateCustomerBotStatus(userId, customerProfile, 'pending');

      const isCreate = customerProfile.startsWith('TEMP-');
      const operationType = isCreate ? 'create-customer' : 'update-customer';
      const data: Record<string, unknown> = {
        customerProfile,
        name: customer.name,
        vatNumber: customer.vatNumber ?? undefined,
        pec: customer.pec ?? undefined,
        sdi: customer.sdi ?? undefined,
        street: customer.street ?? undefined,
        postalCode: customer.postalCode ?? undefined,
        phone: customer.phone ?? undefined,
        email: customer.email ?? undefined,
        deliveryMode: customer.deliveryTerms ?? undefined,
      };

      if (!isCreate) {
        data.originalName = customer.archibaldName || customer.name;
      }

      const jobId = await queue.enqueue(operationType, userId, data);

      res.json({
        success: true,
        data: { jobId },
        message: 'Retry avviato',
      });
    } catch (error) {
      logger.error('Error retrying customer operation', { error });
      res.status(500).json({ success: false, error: 'Errore durante il retry' });
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
