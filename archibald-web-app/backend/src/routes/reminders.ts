import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import {
  getTodayReminders,
  patchReminder,
  deleteReminder,
} from '../db/repositories/customer-reminders';
import type { ReminderId } from '../db/repositories/customer-reminders';
import { logger } from '../logger';

type RemindersRouterDeps = { pool: DbPool };

const PatchSchema = z.object({
  type: z.string().optional(),
  priority: z.enum(['urgent', 'normal', 'low']).optional(),
  due_at: z.string().datetime().optional(),
  recurrence_days: z.number().int().positive().nullable().optional(),
  note: z.string().optional(),
  notify_via: z.enum(['app', 'email']).optional(),
  status: z.enum(['active', 'snoozed', 'done', 'cancelled']).optional(),
  snoozed_until: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().optional(),
  completion_note: z.string().optional(),
});

function createRemindersRouter({ pool }: RemindersRouterDeps): Router {
  const router = Router();

  router.get('/today', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const result = await getTodayReminders(pool, userId);
      res.json(result);
    } catch (error) {
      logger.error('Error fetching today reminders', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero promemoria di oggi' });
    }
  });

  router.patch('/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid reminder id' });

      const parsed = PatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.format() });
      }

      const body = parsed.data;
      const updated = await patchReminder(pool, userId, id as ReminderId, {
        priority: body.priority as 'urgent' | 'normal' | undefined,
        dueAt: body.due_at !== undefined ? new Date(body.due_at) : undefined,
        recurrenceDays: body.recurrence_days,
        note: body.note,
        notifyVia: body.notify_via as 'app' | 'email' | undefined,
        status: body.status as 'active' | 'snoozed' | 'done' | undefined,
        snoozedUntil: body.snoozed_until !== undefined && body.snoozed_until !== null
          ? new Date(body.snoozed_until)
          : body.snoozed_until,
        completionNote: body.completion_note,
      });

      res.json(updated);
    } catch (error) {
      logger.error('Error patching reminder', { error });
      res.status(500).json({ success: false, error: 'Errore nella modifica del promemoria' });
    }
  });

  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid reminder id' });

      await deleteReminder(pool, userId, id as ReminderId);
      res.sendStatus(204);
    } catch (error) {
      logger.error('Error deleting reminder', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione del promemoria' });
    }
  });

  return router;
}

export { createRemindersRouter };
