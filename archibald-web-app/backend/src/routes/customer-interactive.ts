import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { InteractiveSessionManager, BotLike } from '../interactive-session-manager';
import type { Customer, CustomerFormInput } from '../db/repositories/customers';
import type { VatLookupResult, CustomerFormData } from '../types';
import { logger } from '../logger';
import type { AltAddress } from '../db/repositories/customer-addresses';

type CustomerBotLike = BotLike & {
  initialize: () => Promise<void>;
  navigateToNewCustomerForm: () => Promise<void>;
  navigateToEditCustomerForm: (name: string) => Promise<void>;
  readEditFormFieldValues: () => Promise<Record<string, string>>;
  readAltAddresses: () => Promise<AltAddress[]>;
  submitVatAndReadAutofill: (vatNumber: string) => Promise<VatLookupResult>;
  completeCustomerCreation: (formData: CustomerFormData) => Promise<string>;
  createCustomer: (formData: CustomerFormData) => Promise<string>;
  setProgressCallback: (cb: (category: string, metadata?: unknown) => Promise<void>) => void;
};

type BroadcastFn = (userId: string, msg: { type: string; payload: unknown; timestamp: string }) => void;

type ProgressMilestone = { progress: number; label: string } | null;

type CustomerInteractiveRouterDeps = {
  sessionManager: InteractiveSessionManager;
  createBot: (userId: string) => CustomerBotLike;
  broadcast: BroadcastFn;
  upsertSingleCustomer: (userId: string, formData: CustomerFormInput, customerProfile: string, botStatus: string) => Promise<Customer>;
  updateCustomerBotStatus: (userId: string, customerProfile: string, status: string) => Promise<void>;
  updateVatValidatedAt: (userId: string, customerProfile: string) => Promise<void>;
  getCustomerByProfile: (userId: string, customerProfile: string) => Promise<Customer | undefined>;
  pauseSyncs: () => Promise<void>;
  resumeSyncs: () => void;
  upsertAddressesForCustomer: (userId: string, customerProfile: string, addresses: AltAddress[]) => Promise<void>;
  setAddressesSyncedAt: (userId: string, customerProfile: string) => Promise<void>;
  smartCustomerSync?: () => Promise<void>;
  getCustomerProgressMilestone?: (category: string) => ProgressMilestone;
};

const vatSchema = z.object({
  vatNumber: z.string().min(1, 'Partita IVA obbligatoria'),
});

const saveSchema = z.object({
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

const startEditSchema = z.object({
  customerProfile: z.string().min(1, 'customerProfile obbligatorio'),
});

function now(): string {
  return new Date().toISOString();
}

function createCustomerInteractiveRouter(deps: CustomerInteractiveRouterDeps) {
  const {
    sessionManager, createBot, broadcast,
    upsertSingleCustomer, updateCustomerBotStatus,
    updateVatValidatedAt, getCustomerByProfile,
    pauseSyncs, resumeSyncs,
    upsertAddressesForCustomer, setAddressesSyncedAt,
    smartCustomerSync, getCustomerProgressMilestone,
  } = deps;
  const router = Router();

  router.post('/start', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;

      const existing = sessionManager.getActiveSessionForUser(userId);
      if (existing) {
        const hadSyncsPaused = sessionManager.isSyncsPaused(existing.sessionId);
        await sessionManager.removeBot(existing.sessionId);
        sessionManager.destroySession(existing.sessionId);
        if (hadSyncsPaused) {
          resumeSyncs();
        }
      }

      const sessionId = sessionManager.createSession(userId);

      res.json({
        success: true,
        data: { sessionId },
        message: 'Sessione interattiva avviata',
      });

      (async () => {
        let bot: CustomerBotLike | null = null;
        try {
          sessionManager.updateState(sessionId, 'starting');

          await pauseSyncs();
          sessionManager.markSyncsPaused(sessionId, true);

          broadcast(userId, {
            type: 'CUSTOMER_INTERACTIVE_PROGRESS',
            payload: { sessionId, progress: 10, label: 'Avvio sessione...' },
            timestamp: now(),
          });

          bot = createBot(userId);
          await bot.initialize();

          broadcast(userId, {
            type: 'CUSTOMER_INTERACTIVE_PROGRESS',
            payload: { sessionId, progress: 50, label: 'Navigazione al form...' },
            timestamp: now(),
          });

          await bot.navigateToNewCustomerForm();

          sessionManager.updateState(sessionId, 'ready');
          sessionManager.setBot(sessionId, bot);

          broadcast(userId, {
            type: 'CUSTOMER_INTERACTIVE_READY',
            payload: { sessionId },
            timestamp: now(),
          });
        } catch (error) {
          if (bot) {
            try { await bot.close(); } catch { /* ignore */ }
          }

          if (sessionManager.isSyncsPaused(sessionId)) {
            sessionManager.markSyncsPaused(sessionId, false);
            resumeSyncs();
          }

          sessionManager.setError(
            sessionId,
            error instanceof Error ? error.message : 'Errore avvio sessione',
          );

          broadcast(userId, {
            type: 'CUSTOMER_INTERACTIVE_FAILED',
            payload: {
              sessionId,
              error: error instanceof Error ? error.message : 'Errore sconosciuto',
            },
            timestamp: now(),
          });
        }
      })();
    } catch (error) {
      logger.error('Error starting interactive session', { error });
      res.status(500).json({
        success: false,
        error: 'Errore avvio sessione interattiva',
      });
    }
  });

  router.post('/start-edit', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const parsed = startEditSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      }

      const customer = await getCustomerByProfile(userId, parsed.data.customerProfile);
      if (!customer) {
        return res.status(404).json({ success: false, error: 'Cliente non trovato' });
      }

      const existing = sessionManager.getActiveSessionForUser(userId);
      if (existing) {
        const hadSyncsPaused = sessionManager.isSyncsPaused(existing.sessionId);
        await sessionManager.removeBot(existing.sessionId);
        sessionManager.destroySession(existing.sessionId);
        if (hadSyncsPaused) resumeSyncs();
      }

      const sessionId = sessionManager.createSession(userId);
      sessionManager.setCustomerProfile(sessionId, customer.customerProfile);

      res.json({
        success: true,
        data: { sessionId },
        message: 'Sessione modifica cliente avviata',
      });

      (async () => {
        let bot: CustomerBotLike | null = null;
        try {
          sessionManager.updateState(sessionId, 'starting');
          await pauseSyncs();
          sessionManager.markSyncsPaused(sessionId, true);

          bot = createBot(userId);
          await bot.initialize();
          sessionManager.setBot(sessionId, bot);

          await bot.navigateToEditCustomerForm(customer.name);
          const archibaldFields = await bot.readEditFormFieldValues();

          try {
            const altAddresses = await bot.readAltAddresses();
            await upsertAddressesForCustomer(userId, customer.customerProfile, altAddresses);
            await setAddressesSyncedAt(userId, customer.customerProfile);
          } catch (addressErr) {
            logger.warn('start-edit: address refresh failed (non-fatal)', { error: addressErr, userId });
          }

          sessionManager.updateState(sessionId, 'ready');
          broadcast(userId, {
            type: 'CUSTOMER_INTERACTIVE_READY',
            payload: { sessionId, archibaldFields },
            timestamp: now(),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Errore avvio sessione modifica';
          logger.error('start-edit session failed', { error: err, userId });
          sessionManager.updateState(sessionId, 'failed');
          broadcast(userId, {
            type: 'CUSTOMER_INTERACTIVE_FAILED',
            payload: { sessionId, error: message },
            timestamp: now(),
          });
          if (bot) await sessionManager.removeBot(sessionId);
          resumeSyncs();
        }
      })();
    } catch (error) {
      logger.error('Error starting edit session', { error });
      res.status(500).json({ success: false, error: 'Errore interno del server' });
    }
  });

  router.post('/:sessionId/vat', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { sessionId } = req.params;
      const parsed = vatSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      }

      const session = sessionManager.getSession(sessionId, userId);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Sessione non trovata' });
      }

      if (session.state !== 'ready') {
        return res.status(409).json({
          success: false,
          error: `Sessione non pronta (stato: ${session.state})`,
        });
      }

      sessionManager.updateState(sessionId, 'processing_vat');

      res.json({ success: true, message: 'Verifica P.IVA avviata' });

      (async () => {
        try {
          const bot = sessionManager.getBot(sessionId) as CustomerBotLike | undefined;
          if (!bot) {
            throw new Error('Bot non trovato per questa sessione');
          }

          broadcast(userId, {
            type: 'CUSTOMER_INTERACTIVE_PROGRESS',
            payload: { sessionId, progress: 60, label: 'Verifica P.IVA...' },
            timestamp: now(),
          });

          const vatResult = await bot.submitVatAndReadAutofill(parsed.data.vatNumber);
          sessionManager.setVatResult(sessionId, vatResult);

          const editSession = sessionManager.getSession(sessionId, userId);
          if (editSession?.customerProfile && vatResult.vatValidated) {
            const v = vatResult.vatValidated.toUpperCase();
            if (v.includes('SI') || v.includes('YES') || v === 'TRUE' || v === '1') {
              await updateVatValidatedAt(userId, editSession.customerProfile).catch((err) => {
                logger.warn('Failed to mark vat_validated_at after VAT check', { err });
              });
            }
          }

          broadcast(userId, {
            type: 'CUSTOMER_VAT_RESULT',
            payload: { sessionId, vatResult },
            timestamp: now(),
          });
        } catch (error) {
          sessionManager.setError(
            sessionId,
            error instanceof Error ? error.message : 'Errore verifica P.IVA',
          );

          broadcast(userId, {
            type: 'CUSTOMER_INTERACTIVE_FAILED',
            payload: {
              sessionId,
              error: error instanceof Error ? error.message : 'Errore sconosciuto',
            },
            timestamp: now(),
          });
        }
      })();
    } catch (error) {
      logger.error('Error processing VAT', { error });
      res.status(500).json({ success: false, error: 'Errore durante la verifica P.IVA' });
    }
  });

  router.post('/:sessionId/heartbeat', (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const { sessionId } = req.params;
    const touched = sessionManager.touchSession(sessionId, userId);

    if (!touched) {
      return res.status(404).json({ success: false, error: 'Sessione non trovata' });
    }

    res.json({ success: true, message: 'OK' });
  });

  router.post('/:sessionId/save', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { sessionId } = req.params;
      const parsed = saveSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      }

      const customerData = parsed.data as CustomerFormData;
      const session = sessionManager.getSession(sessionId, userId);
      const effectiveSession = session?.state === 'failed' ? null : session;
      const existingBot = effectiveSession ? sessionManager.getBot(sessionId) as CustomerBotLike | undefined : null;
      const useInteractiveBot = !!effectiveSession && !!existingBot;

      if (effectiveSession && effectiveSession.state !== 'vat_complete' && effectiveSession.state !== 'ready') {
        return res.status(409).json({
          success: false,
          error: `Sessione non pronta per il salvataggio (stato: ${effectiveSession.state})`,
        });
      }

      if (effectiveSession) {
        sessionManager.updateState(sessionId, 'saving');
      }

      const tempProfile = `TEMP-${Date.now()}`;
      const taskId = randomUUID();
      const formInput: CustomerFormInput = {
        name: customerData.name,
        vatNumber: customerData.vatNumber,
        pec: customerData.pec,
        sdi: customerData.sdi,
        street: customerData.street,
        postalCode: customerData.postalCode,
        phone: customerData.phone,
        mobile: customerData.mobile,
        email: customerData.email,
        url: customerData.url,
        deliveryMode: customerData.deliveryMode,
      };

      const customer = await upsertSingleCustomer(userId, formInput, tempProfile, 'pending');
      const sessionHadSyncsPaused = sessionManager.isSyncsPaused(sessionId);

      res.json({
        success: true,
        data: { customer: { ...customer, id: customer.customerProfile }, taskId },
        message: 'Salvataggio in corso...',
      });

      (async () => {
        if (!useInteractiveBot) {
          await pauseSyncs();
        }

        try {
          broadcast(userId, {
            type: 'JOB_STARTED',
            payload: { jobId: taskId },
            timestamp: now(),
          });

          const setupProgressCallback = (bot: CustomerBotLike) => {
            if (getCustomerProgressMilestone) {
              bot.setProgressCallback(async (category) => {
                const milestone = getCustomerProgressMilestone(category);
                if (milestone) {
                  broadcast(userId, {
                    type: 'JOB_PROGRESS',
                    payload: {
                      jobId: taskId,
                      progress: milestone.progress,
                      label: milestone.label,
                    },
                    timestamp: now(),
                  });
                }
              });
            }
          };

          let customerProfileId: string;

          if (useInteractiveBot) {
            setupProgressCallback(existingBot!);
            customerProfileId = await existingBot!.completeCustomerCreation(customerData);
            const altAddresses: AltAddress[] = (customerData.addresses ?? []).map(a => ({
              tipo: a.tipo,
              nome: a.nome ?? null,
              via: a.via ?? null,
              cap: a.cap ?? null,
              citta: a.citta ?? null,
              contea: a.contea ?? null,
              stato: a.stato ?? null,
              idRegione: a.idRegione ?? null,
              contra: a.contra ?? null,
            }));
            await upsertAddressesForCustomer(userId, customerProfileId, altAddresses);
            await setAddressesSyncedAt(userId, customerProfileId);
            await sessionManager.removeBot(sessionId);
            sessionManager.updateState(sessionId, 'completed');
          } else {
            logger.info('Interactive session expired, falling back to fresh bot', { sessionId });
            const freshBot = createBot(userId);
            await freshBot.initialize();
            setupProgressCallback(freshBot);
            await freshBot.createCustomer(customerData);
            await freshBot.close();
            customerProfileId = tempProfile;
            if (effectiveSession) {
              sessionManager.updateState(sessionId, 'completed');
            }
          }

          await updateCustomerBotStatus(userId, tempProfile, 'placed');
          await updateVatValidatedAt(userId, customerProfileId);

          if (smartCustomerSync) {
            smartCustomerSync().catch((err) =>
              logger.error('Smart customer sync after interactive create failed', { err }),
            );
          }

          broadcast(userId, {
            type: 'JOB_COMPLETED',
            payload: { jobId: taskId, result: { customerProfile: customerProfileId } },
            timestamp: now(),
          });
        } catch (error) {
          await updateCustomerBotStatus(userId, tempProfile, 'failed');
          if (effectiveSession) {
            sessionManager.setError(
              sessionId,
              error instanceof Error ? error.message : 'Errore salvataggio',
            );
          }

          await sessionManager.removeBot(sessionId);

          broadcast(userId, {
            type: 'JOB_FAILED',
            payload: {
              jobId: taskId,
              error: error instanceof Error ? error.message : 'Errore sconosciuto',
            },
            timestamp: now(),
          });
        } finally {
          if (sessionHadSyncsPaused) {
            sessionManager.markSyncsPaused(sessionId, false);
            resumeSyncs();
          } else if (!useInteractiveBot) {
            resumeSyncs();
          }
        }
      })();
    } catch (error) {
      logger.error('Error saving interactive customer', { error });
      res.status(500).json({
        success: false,
        error: 'Errore durante il salvataggio interattivo',
      });
    }
  });

  router.delete('/:sessionId', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { sessionId } = req.params;
      const session = sessionManager.getSession(sessionId, userId);

      if (!session) {
        return res.status(404).json({ success: false, error: 'Sessione non trovata' });
      }

      const hadSyncsPaused = sessionManager.isSyncsPaused(sessionId);
      await sessionManager.removeBot(sessionId);
      sessionManager.destroySession(sessionId);

      if (hadSyncsPaused) {
        resumeSyncs();
      }

      res.json({ success: true, message: 'Sessione annullata' });
    } catch (error) {
      logger.error('Error closing interactive session', { error });
      res.status(500).json({
        success: false,
        error: 'Errore durante la cancellazione della sessione',
      });
    }
  });

  return router;
}

export { createCustomerInteractiveRouter, type CustomerInteractiveRouterDeps, type CustomerBotLike };
