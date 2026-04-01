import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import type { AuthRequest } from '../middleware/auth';
import type { Customer, CustomerFormInput } from '../db/repositories/customers';
import type { CustomerAddress } from '../db/repositories/customer-addresses';
import type { OperationType } from '../operations/operation-types';
import { logger } from '../logger';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

type QueueLike = {
  enqueue: (type: OperationType, userId: string, data: Record<string, unknown>) => Promise<string>;
};

type CustomerSyncMetrics = {
  lastSyncTime: string | null;
  lastResult: {
    success: boolean;
    customersProcessed: number;
    duration: number;
    error: string | null;
  } | null;
  totalSyncs: number;
  consecutiveFailures: number;
  averageDuration: number;
  health: 'healthy' | 'degraded';
};

type CustomersRouterDeps = {
  queue: QueueLike;
  getCustomers: (userId: string, searchQuery?: string) => Promise<Customer[]>;
  getHiddenCustomers: (userId: string) => Promise<Customer[]>;
  setCustomerHidden: (userId: string, erpId: string, hidden: boolean) => Promise<boolean>;
  getCustomerByProfile: (userId: string, erpId: string) => Promise<Customer | undefined>;
  getCustomerCount: (userId: string) => Promise<number>;
  getLastSyncTime: (userId: string) => Promise<number | null>;
  getCustomerPhoto: (userId: string, erpId: string) => Promise<string | undefined>;
  setCustomerPhoto: (userId: string, erpId: string, photo: string) => Promise<void>;
  deleteCustomerPhoto: (userId: string, erpId: string) => Promise<void>;
  upsertSingleCustomer: (userId: string, formData: CustomerFormInput, erpId: string, botStatus: string) => Promise<Customer>;
  getCustomerAddresses: (userId: string, erpId: string) => Promise<CustomerAddress[]>;
  updateCustomerBotStatus: (userId: string, erpId: string, status: string) => Promise<void>;
  updateArchibaldName: (userId: string, erpId: string, name: string) => Promise<void>;
  smartCustomerSync: (userId: string) => Promise<void>;
  resumeOtherSyncs: () => void;
  getCustomerSyncMetrics?: () => Promise<CustomerSyncMetrics>;
  getIncompleteCustomersCount?: (userId: string) => Promise<number>;
  enqueueReadVatStatus?: (userId: string, erpId: string) => Promise<string>;
  updateAgentNotes?: (userId: string, erpId: string, notes: string | null) => Promise<void>;
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
  paymentTerms: z.string().optional(),
  lineDiscount: z.string().optional(),
  fiscalCode: z.string().optional(),
  sector: z.string().optional(),
  attentionTo: z.string().optional(),
  notes: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCodeCity: z.string().optional(),
  postalCodeCountry: z.string().optional(),
  addresses: z.array(z.object({
    tipo: z.string(),
    nome: z.string().optional(),
    via: z.string().optional(),
    cap: z.string().optional(),
    citta: z.string().optional(),
    contea: z.string().optional(),
    stato: z.string().optional(),
    idRegione: z.string().optional(),
    contra: z.string().optional(),
  })).optional().default([]),
});

function createCustomersRouter(deps: CustomersRouterDeps) {
  const {
    queue, getCustomers, getHiddenCustomers, setCustomerHidden,
    getCustomerByProfile, getCustomerCount, getLastSyncTime,
    getCustomerPhoto, setCustomerPhoto, deleteCustomerPhoto,
    upsertSingleCustomer, getCustomerAddresses, updateCustomerBotStatus, updateArchibaldName,
    smartCustomerSync, resumeOtherSyncs,
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
        erpId: tempProfile,
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
      res.json({ success: true, data: { customers, total: customers.length } });
    } catch (error) {
      logger.error('Error fetching customers', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero clienti' });
    }
  });

  router.get('/hidden', async (req: AuthRequest, res) => {
    try {
      const customers = await getHiddenCustomers(req.user!.userId);
      res.json({ success: true, data: { customers, total: customers.length } });
    } catch (error) {
      logger.error('Error fetching hidden customers', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero clienti nascosti' });
    }
  });

  router.patch('/:erpId/hidden', async (req: AuthRequest, res) => {
    try {
      const { erpId } = req.params;
      const hidden = Boolean(req.body?.hidden);
      const updated = await setCustomerHidden(req.user!.userId, erpId, hidden);
      if (!updated) return res.status(404).json({ success: false, error: 'Cliente non trovato' });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error setting customer hidden', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento cliente' });
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

  router.get('/stats', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const [total, incomplete] = await Promise.all([
        getCustomerCount(userId),
        deps.getIncompleteCustomersCount?.(userId) ?? Promise.resolve(0),
      ]);
      res.json({ success: true, total, incomplete });
    } catch (err) {
      logger.error('GET /customers/stats error', { error: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
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

  router.post('/smart-sync', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      logger.info('Smart Customer Sync triggered', { userId });
      await smartCustomerSync(userId);
      res.json({ success: true, message: 'Smart Customer Sync completato' });
    } catch (error) {
      logger.error('Smart Customer Sync failed', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Errore durante Smart Customer Sync',
      });
    }
  });

  router.post('/resume-syncs', async (req: AuthRequest, res) => {
    try {
      logger.info('Resume syncs requested', { userId: req.user!.userId });
      resumeOtherSyncs();
      res.json({ success: true, message: 'Syncs resumed' });
    } catch (error) {
      logger.error('Resume syncs failed', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Errore durante resume syncs',
      });
    }
  });

  router.get('/sync/metrics', async (_req: AuthRequest, res) => {
    if (!deps.getCustomerSyncMetrics) {
      return res.status(501).json({ success: false, error: 'Customer sync metrics non configurate' });
    }
    try {
      const metrics = await deps.getCustomerSyncMetrics();
      res.json({ success: true, ...metrics });
    } catch (error) {
      logger.error('Error fetching customer sync metrics', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero metriche sync clienti' });
    }
  });

  router.put('/:erpId', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { erpId } = req.params;
      const parsed = createCustomerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      }

      const formData: CustomerFormInput = parsed.data;
      const existing = await getCustomerByProfile(userId, erpId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Cliente non trovato' });
      }

      const originalName = existing.archibaldName || existing.name;

      await upsertSingleCustomer(userId, formData, erpId, 'pending');
      await updateArchibaldName(userId, erpId, originalName);

      const jobId = await queue.enqueue('update-customer', userId, {
        erpId,
        originalName,
        ...formData,
      });

      res.json({
        success: true,
        data: { jobId },
        message: `Cliente ${erpId} aggiornato. Sincronizzazione con Archibald in corso...`,
      });
    } catch (error) {
      logger.error('Error updating customer', { error });
      res.status(500).json({ success: false, error: 'Errore durante l\'aggiornamento del cliente' });
    }
  });

  router.post('/:erpId/vat-status', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { erpId } = req.params;
      if (!deps.enqueueReadVatStatus) {
        return res.status(503).json({ error: 'VAT status enrichment not available' });
      }
      const jobId = await deps.enqueueReadVatStatus(userId, erpId);
      res.json({ jobId, message: 'VAT status read queued' });
    } catch (err) {
      logger.error('POST /customers/:erpId/vat-status error', { error: String(err) });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/:erpId/agent-notes', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { erpId } = req.params;
      if (!deps.updateAgentNotes) {
        return res.status(503).json({ error: 'Agent notes not available' });
      }
      const body = req.body as { notes?: string | null };
      await deps.updateAgentNotes(userId, erpId, body.notes ?? null);
      res.json({ success: true });
    } catch (err) {
      logger.error('PATCH /customers/:erpId/agent-notes error', { error: String(err) });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/:erpId', async (req: AuthRequest, res) => {
    try {
      const customer = await getCustomerByProfile(req.user!.userId, req.params.erpId);
      if (!customer) {
        return res.status(404).json({ success: false, error: 'Cliente non trovato' });
      }
      res.json({ success: true, data: customer });
    } catch (error) {
      logger.error('Error fetching customer', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero cliente' });
    }
  });

  router.get('/:erpId/status', async (req: AuthRequest, res) => {
    try {
      const customer = await getCustomerByProfile(req.user!.userId, req.params.erpId);
      if (!customer) {
        return res.status(404).json({ success: false, error: 'Cliente non trovato' });
      }
      res.json({ success: true, data: { botStatus: customer.botStatus || 'placed' } });
    } catch (error) {
      logger.error('Error fetching customer status', { error });
      res.status(500).json({ success: false, error: 'Errore durante il recupero dello stato' });
    }
  });

  router.post('/:erpId/retry', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { erpId } = req.params;
      const customer = await getCustomerByProfile(userId, erpId);

      if (!customer) {
        return res.status(404).json({ success: false, error: 'Cliente non trovato' });
      }

      await updateCustomerBotStatus(userId, erpId, 'pending');

      const isCreate = erpId.startsWith('TEMP-');
      const operationType = isCreate ? 'create-customer' : 'update-customer';
      const addresses = await getCustomerAddresses(userId, erpId);
      const data: Record<string, unknown> = {
        erpId,
        name: customer.name,
        vatNumber: customer.vatNumber ?? undefined,
        pec: customer.pec ?? undefined,
        sdi: customer.sdi ?? undefined,
        street: customer.street ?? undefined,
        postalCode: customer.postalCode ?? undefined,
        phone: customer.phone ?? undefined,
        email: customer.email ?? undefined,
        deliveryMode: customer.deliveryTerms ?? undefined,
        addresses,
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

  router.get('/:erpId/photo', async (req: AuthRequest, res) => {
    try {
      const photo = await getCustomerPhoto(req.user!.userId, req.params.erpId);
      if (!photo) {
        return res.status(204).end();
      }
      const dataUriMatch = photo.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUriMatch) {
        const contentType = dataUriMatch[1];
        const base64Data = dataUriMatch[2];
        res.set('Content-Type', contentType);
        res.send(Buffer.from(base64Data, 'base64'));
      } else {
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from(photo, 'base64'));
      }
    } catch (error) {
      logger.error('Error fetching customer photo', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero foto' });
    }
  });

  router.post('/:erpId/photo', upload.single('photo'), async (req: AuthRequest, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'Foto richiesta' });
      }
      const base64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      await setCustomerPhoto(req.user!.userId, req.params.erpId, base64);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error saving customer photo', { error });
      res.status(500).json({ success: false, error: 'Errore nel salvataggio foto' });
    }
  });

  router.delete('/:erpId/photo', async (req: AuthRequest, res) => {
    try {
      await deleteCustomerPhoto(req.user!.userId, req.params.erpId);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting customer photo', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione foto' });
    }
  });

  router.post('/vat-check', async (req: AuthRequest, res) => {
    const { vatNumber } = req.body as { vatNumber?: string };

    if (!vatNumber || !/^\d{11}$/.test(vatNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Formato P.IVA non valido (11 cifre numeriche)',
      });
    }

    // Italian P.IVA checksum: odd positions summed directly, even positions doubled
    // (if doubled > 9 subtract 9), total including check digit must be divisible by 10.
    const digits = vatNumber.split('').map(Number);
    let checksumTotal = 0;
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) {
        checksumTotal += digits[i];
      } else {
        const v = digits[i] * 2;
        checksumTotal += v > 9 ? v - 9 : v;
      }
    }
    if ((checksumTotal + digits[10]) % 10 !== 0) {
      return res.json({
        success: true,
        data: { valid: false },
        meta: { source: 'checksum' },
      });
    }

    // Check if the P.IVA is already in this agent's customer DB
    const userId = req.user!.userId;
    const customers = await getCustomers(userId, vatNumber);
    const duplicate = customers.find(
      (c) => (c as unknown as { vatNumber?: string }).vatNumber === vatNumber,
    );
    if (duplicate) {
      return res.json({
        success: true,
        data: {
          valid: true,
          alreadyExists: true,
          existingName: duplicate.name,
          existingCode: (duplicate as unknown as { erpId?: string }).erpId ?? '',
        },
      });
    }

    return res.json({ success: true, data: { valid: true } });
  });

  return router;
}

export { createCustomersRouter, type CustomersRouterDeps, type CustomerSyncMetrics };
