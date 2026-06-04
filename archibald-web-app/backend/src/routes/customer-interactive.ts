import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { InteractiveSessionManager, BotLike } from '../interactive-session-manager';
import { interactiveSessionLocks } from '../interactive-session-locks';
import type { Customer, CustomerFormInput } from '../db/repositories/customers';
import type { VatLookupResult, CustomerFormData } from '../types';
import { logger } from '../logger';
import type { AltAddress } from '../db/repositories/customer-addresses';

type CustomerBotLike = BotLike & {
  initialize: () => Promise<void>;
  navigateToNewCustomerForm: () => Promise<void>;
  navigateToEditCustomerForm: (name: string) => Promise<void>;
  readEditFormFieldValues: () => Promise<Record<string, string>>;
  readAltAddresses: () => Promise<{ addresses: AltAddress[]; reliable: boolean }>;
  submitVatAndReadAutofill: (vatNumber: string) => Promise<VatLookupResult>;
  completeCustomerCreation: (formData: CustomerFormData, isVatOnForm?: boolean) => Promise<string>;
  createCustomer: (formData: CustomerFormData) => Promise<string>;
  buildSnapshotWithDiff?: (erpId: string, formData: CustomerFormData) => Promise<{ snapshot: import('../types').CustomerSnapshot; divergences: unknown[] }>;
  setProgressCallback: (cb: (category: string, metadata?: unknown) => Promise<void>) => void;
};

type BroadcastFn = (userId: string, msg: { type: string; payload: unknown; timestamp: string }) => void;

type ProgressMilestone = { progress: number; label: string } | null;

type CustomerInteractiveRouterDeps = {
  sessionManager: InteractiveSessionManager;
  createBot: (userId: string) => CustomerBotLike;
  broadcast: BroadcastFn;
  upsertSingleCustomer: (userId: string, formData: CustomerFormInput, erpId: string, botStatus: string) => Promise<Customer>;
  updateCustomerBotStatus: (userId: string, erpId: string, status: string) => Promise<void>;
  updateCustomerErpId?: (userId: string, tempErpId: string, realErpId: string) => Promise<void>;
  updateVatValidatedAt: (userId: string, erpId: string) => Promise<void>;
  getCustomerByProfile: (userId: string, erpId: string) => Promise<Customer | undefined>;
  upsertAddressesForCustomer: (userId: string, erpId: string, addresses: AltAddress[]) => Promise<void>;
  setAddressesSyncedAt: (userId: string, erpId: string) => Promise<void>;
  getCustomerProgressMilestone?: (category: string) => ProgressMilestone;
  recordJobStarted?: (jobId: string, entityId: string, entityName: string, userId: string) => Promise<void>;
  recordJobFinished?: (jobId: string) => Promise<void>;
  creationTimeoutMs?: number;
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

const startEditSchema = z.object({
  erpId: z.string().min(1, 'erpId obbligatorio'),
});

function now(): string {
  return new Date().toISOString();
}

function createCustomerInteractiveRouter(deps: CustomerInteractiveRouterDeps) {
  const {
    sessionManager, createBot, broadcast,
    upsertSingleCustomer, updateCustomerBotStatus,
    updateCustomerErpId,
    updateVatValidatedAt, getCustomerByProfile,
    upsertAddressesForCustomer, setAddressesSyncedAt,
    getCustomerProgressMilestone,
    recordJobStarted, recordJobFinished,
  } = deps;

  const creationTimeoutMs = deps.creationTimeoutMs ?? 5 * 60 * 1000;

  function withCreationTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout after ${creationTimeoutMs}ms`)), creationTimeoutMs),
      ),
    ]);
  }
  const router = Router();

  router.post('/start', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const existing = sessionManager.getActiveSessionForUser(userId);
      if (existing) {
        await sessionManager.removeBot(existing.sessionId);
        sessionManager.destroySession(existing.sessionId);
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
      logger.warn('[/start-edit] Called by userId=' + userId + ' at ' + new Date().toISOString());
      const parsed = startEditSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      }

      const customer = await getCustomerByProfile(userId, parsed.data.erpId);
      if (!customer) {
        return res.status(404).json({ success: false, error: 'Cliente non trovato' });
      }

      const existing = sessionManager.getActiveSessionForUser(userId);
      if (existing) {
        // Non distruggere una sessione di CREAZIONE attiva (vat_complete/erp_validating/ready).
        // /start-edit chiamato in background mentre il wizard "Nuovo Cliente" è aperto
        // distruggerebbe il bot del wizard → "Browser page is null" al salvataggio.
        if (['erp_validating', 'vat_complete', 'ready', 'starting'].includes(existing.state)) {
          logger.warn('[/start-edit] Rejecting: active CREATE session in state=' + existing.state);
          return res.status(409).json({
            success: false,
            error: 'Sessione di creazione cliente in corso — riprova dopo aver completato il wizard',
          });
        }
        logger.warn('[/start-edit] Destroying existing session state=' + existing.state + ' id=' + existing.sessionId);
        await sessionManager.removeBot(existing.sessionId);
        sessionManager.destroySession(existing.sessionId);
      }

      const sessionId = sessionManager.createSession(userId);
      sessionManager.setCustomerProfile(sessionId, customer.erpId);

      res.json({
        success: true,
        data: { sessionId },
        message: 'Sessione modifica cliente avviata',
      });

      (async () => {
        let bot: CustomerBotLike | null = null;
        try {
          sessionManager.updateState(sessionId, 'starting');

          bot = createBot(userId);
          await bot.initialize();
          sessionManager.setBot(sessionId, bot);

          await bot.navigateToEditCustomerForm(customer.name);
          const archibaldFields = await bot.readEditFormFieldValues();

          try {
            const { addresses: altAddresses, reliable } = await bot.readAltAddresses();
            if (!reliable && altAddresses.length === 0) {
              logger.warn('start-edit: address grid timed out — skipping upsert to avoid silent delete', { userId });
            } else {
              await upsertAddressesForCustomer(userId, customer.erpId, altAddresses);
              await setAddressesSyncedAt(userId, customer.erpId);
            }
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
          if (editSession?.erpId && vatResult.vatValidated) {
            const v = vatResult.vatValidated.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
            if (v.includes('SI') || v.includes('YES') || v === 'TRUE' || v === '1') {
              await updateVatValidatedAt(userId, editSession.erpId).catch((err) => {
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

      const tempProfile = session?.erpId ?? `TEMP-${Date.now()}`;
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
        paymentTerms: customerData.paymentTerms,
        fiscalCode: customerData.fiscalCode,
        sector: customerData.sector,
        attentionTo: customerData.attentionTo,
        notes: customerData.notes,
        county: customerData.county,
        state: customerData.state,
        country: customerData.country,
        lineDiscount: customerData.lineDiscount,
      };

      const customer = await upsertSingleCustomer(userId, formInput, tempProfile, 'pending');

      res.json({
        success: true,
        data: { customer: { ...customer, id: customer.erpId }, taskId },
        message: 'Salvataggio in corso...',
      });

      (async () => {
        try {
          broadcast(userId, {
            type: 'JOB_STARTED',
            payload: { jobId: taskId },
            timestamp: now(),
          });
          await recordJobStarted?.(taskId, taskId, customerData.name, userId).catch(() => {});

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

          let newErpId: string;

          if (useInteractiveBot) {
            setupProgressCallback(existingBot!);
            const realErpId = await withCreationTimeout(
              existingBot!.completeCustomerCreation(formInput, true),
              'completeCustomerCreation',
            );
            newErpId = realErpId;

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
            await upsertAddressesForCustomer(userId, tempProfile, altAddresses);
            await setAddressesSyncedAt(userId, tempProfile);

            if (updateCustomerErpId) {
              await updateCustomerErpId(userId, tempProfile, realErpId);
            }

            if (existingBot!.buildSnapshotWithDiff) {
              try {
                const { snapshot } = await existingBot!.buildSnapshotWithDiff(realErpId, formInput);
                const snapshotFormInput: CustomerFormInput = {
                  name: snapshot?.name ?? formInput.name,
                  vatNumber: snapshot?.vatNumber ?? formInput.vatNumber,
                  pec: snapshot?.pec ?? formInput.pec,
                  sdi: snapshot?.sdi ?? formInput.sdi,
                  street: snapshot?.street ?? formInput.street,
                  postalCode: snapshot?.postalCode ?? formInput.postalCode,
                  phone: snapshot?.phone ?? formInput.phone,
                  mobile: snapshot?.mobile ?? formInput.mobile,
                  email: snapshot?.email ?? formInput.email,
                  url: snapshot?.url ?? formInput.url,
                  deliveryMode: snapshot?.deliveryMode ?? formInput.deliveryMode,
                  paymentTerms: snapshot?.paymentTerms ?? formInput.paymentTerms,
                  fiscalCode: snapshot?.fiscalCode ?? formInput.fiscalCode,
                  sector: snapshot?.sector ?? formInput.sector,
                  attentionTo: snapshot?.attentionTo ?? formInput.attentionTo,
                  notes: snapshot?.notes ?? formInput.notes,
                  county: snapshot?.county ?? formInput.county,
                  state: snapshot?.state ?? formInput.state,
                  country: snapshot?.country ?? formInput.country,
                };
                await upsertSingleCustomer(userId, snapshotFormInput, realErpId, 'snapshot');
              } catch (snapshotErr) {
                logger.warn('/save: buildSnapshotWithDiff failed (non-fatal)', { error: snapshotErr, userId });
              }
            }

            await updateCustomerBotStatus(userId, realErpId, 'placed');
            await sessionManager.removeBot(sessionId);
            sessionManager.updateState(sessionId, 'completed');
          } else {
            logger.info('Interactive session expired, falling back to fresh bot', { sessionId });
            const freshBot = createBot(userId);
            await freshBot.initialize();
            setupProgressCallback(freshBot);
            await withCreationTimeout(freshBot.createCustomer(customerData), 'createCustomer');
            await freshBot.close();
            newErpId = tempProfile;
            await updateCustomerBotStatus(userId, tempProfile, 'placed');
            if (effectiveSession) {
              sessionManager.updateState(sessionId, 'completed');
            }
          }

          await updateVatValidatedAt(userId, newErpId);

          broadcast(userId, {
            type: 'JOB_COMPLETED',
            payload: { jobId: taskId, result: { erpId: newErpId } },
            timestamp: now(),
          });
        } catch (error) {
          logger.error('/save: customer creation failed', {
            error: error instanceof Error ? error.message : String(error),
            userId,
            tempProfile,
            sessionId,
            useInteractiveBot,
          });
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
          interactiveSessionLocks.release(userId);
          await recordJobFinished?.(taskId).catch(() => {});
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

  router.post('/begin', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const parsed = vatSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'vatNumber obbligatorio' });
      }
      const { vatNumber } = parsed.data;

      const existing = sessionManager.getActiveSessionForUser(userId);
      if (existing) {
        await sessionManager.removeBot(existing.sessionId);
        sessionManager.destroySession(existing.sessionId);
      }

      const sessionId = sessionManager.createSession(userId);
      res.json({ success: true, data: { sessionId }, message: 'Sessione avviata' });

      (async () => {
        let bot: CustomerBotLike | null = null;
        try {
          sessionManager.updateState(sessionId, 'starting');
          interactiveSessionLocks.acquire(userId);

          bot = createBot(userId);
          await bot.initialize();
          await bot.navigateToNewCustomerForm();
          sessionManager.setBot(sessionId, bot);
          sessionManager.updateState(sessionId, 'erp_validating');

          const vatResult = await bot.submitVatAndReadAutofill(vatNumber);
          sessionManager.setVatResult(sessionId, vatResult);

          if (vatResult.erpDuplicateCustomerId) {
            // P.IVA già usata da un altro cliente nell'ERP: chiudi il bot e notifica il frontend
            try { await bot.close(); } catch { /* ignore */ }
            interactiveSessionLocks.release(userId);
            sessionManager.destroySession(sessionId);
            broadcast(userId, {
              type: 'CUSTOMER_VAT_DUPLICATE',
              payload: { sessionId, erpCustomerId: vatResult.erpDuplicateCustomerId },
              timestamp: now(),
            });
          } else {
            broadcast(userId, {
              type: 'CUSTOMER_VAT_RESULT',
              payload: { sessionId, vatResult },
              timestamp: now(),
            });
          }
        } catch (error) {
          if (bot) {
            try { await bot.close(); } catch { /* ignore */ }
          }
          interactiveSessionLocks.release(userId);
          sessionManager.setError(
            sessionId,
            error instanceof Error ? error.message : 'Errore begin',
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
      logger.error('Error in /begin', { error });
      res.status(500).json({ success: false, error: 'Errore interno' });
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

      // Il frontend chiama DELETE quando il modal si chiude (onClose dopo /save).
      // Se il lock è attivo, il bot sta eseguendo completeCustomerCreation in background —
      // distruggere il bot ora causa "Browser page is null". Restituisce 200 senza distruggere:
      // la sessione verrà eliminata nel finally del /save IIFE quando il bot termina.
      if (interactiveSessionLocks.isActive(userId)) {
        logger.info('[DELETE session] Bot attivo (lock held) — skip destroy, sessione auto-cleaned dal /save');
        return res.json({ success: true, message: 'Sessione auto-cleaned dopo completamento bot' });
      }

      await sessionManager.removeBot(sessionId);
      sessionManager.destroySession(sessionId);

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
