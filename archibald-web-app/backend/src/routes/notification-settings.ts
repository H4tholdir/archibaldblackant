import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import {
  getNotificationSettings, upsertNotificationSettings,
  listNotificationProfiles, getPendingWaForUser, updatePendingWaStatus,
} from '../db/repositories/notification-settings.repository';
import { updateCustomerContactAndQueueErp } from '../db/repositories/contact-writeback';
import { logger } from '../logger';

type Deps = { pool: DbPool };

const UpsertSchema = z.object({
  enabled: z.boolean().optional(),
  profileId: z.number().int().positive().nullable().optional(),
  overrideSteps: z.array(z.object({
    days_after_due: z.number().int().min(0),
    tone: z.enum(['cordiale','formale','urgente']),
    channels: z.array(z.enum(['email','whatsapp'])),
  })).nullable().optional(),
  emailOverride: z.string().email().nullable().optional(),
  whatsappOverride: z.string().nullable().optional(),
  notifyNewInvoice: z.boolean().optional(),
  notifyPreDue: z.boolean().optional(),
  preDueDays: z.number().int().min(1).max(30).optional(),
  periodicStatementEnabled: z.boolean().optional(),
  periodicStatementDays: z.number().int().min(7).max(365).optional(),
  periodicStatementContent: z.record(z.boolean()).optional(),
});

export function createNotificationSettingsRouter({ pool }: Deps): Router {
  const router = Router();

  router.get('/profiles', async (_req: AuthRequest, res) => {
    try {
      const profiles = await listNotificationProfiles(pool);
      res.json({ success: true, data: profiles });
    } catch (e) {
      logger.error('listNotificationProfiles error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  router.get('/pending-wa/all', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const pending = await getPendingWaForUser(pool, userId);
      res.json({ success: true, data: pending });
    } catch (e) {
      logger.error('getPendingWaForUser error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  router.patch('/pending-wa/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { id } = req.params as { id: string };
      const { status } = req.body as { status: string };
      if (!['opened_by_agent','confirmed_sent','dismissed'].includes(status)) {
        res.status(400).json({ success: false, error: 'Stato non valido' });
        return;
      }
      await updatePendingWaStatus(pool, userId, id, status as 'opened_by_agent' | 'confirmed_sent' | 'dismissed');
      res.json({ success: true });
    } catch (e) {
      logger.error('updatePendingWaStatus error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  router.get('/:erpId', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { erpId } = req.params as { erpId: string };
      const settings = await getNotificationSettings(pool, userId, erpId);
      res.json({ success: true, data: settings });
    } catch (e) {
      logger.error('getNotificationSettings error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  router.put('/:erpId', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { erpId } = req.params as { erpId: string };
      const parsed = UpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.message });
        return;
      }
      const body = parsed.data;

      if (body.emailOverride !== undefined || body.whatsappOverride !== undefined) {
        await updateCustomerContactAndQueueErp(pool, userId, erpId, {
          ...(body.emailOverride !== undefined ? { email: body.emailOverride } : {}),
          ...(body.whatsappOverride !== undefined ? { mobile: body.whatsappOverride } : {}),
        });
      }

      await upsertNotificationSettings(pool, userId, erpId, body);
      const updated = await getNotificationSettings(pool, userId, erpId);
      res.json({ success: true, data: updated });
    } catch (e) {
      logger.error('upsertNotificationSettings error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  return router;
}
