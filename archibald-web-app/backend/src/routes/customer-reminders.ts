import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import {
  listCustomerReminders,
  createReminder,
} from '../db/repositories/customer-reminders';
import type { ReminderFilter } from '../db/repositories/customer-reminders';
import { logger } from '../logger';

type CustomerRemindersRouterDeps = { pool: DbPool };

const VALID_FILTERS: ReminderFilter[] = ['active', 'done', 'all'];

const CreateSchema = z.object({
  type_id: z.number().int().positive(),
  priority: z.enum(['urgent', 'normal', 'low']),
  due_at: z.string().datetime(),
  recurrence_days: z.number().int().positive().nullable(),
  note: z.string().nullable(),
  notify_via: z.enum(['app', 'email']),
});

function createCustomerRemindersRouter({ pool }: CustomerRemindersRouterDeps): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const customerProfile = (req.params as { customerProfile: string }).customerProfile;
      const rawFilter = req.query.filter as string;
      const filter: ReminderFilter = VALID_FILTERS.includes(rawFilter as ReminderFilter)
        ? (rawFilter as ReminderFilter)
        : 'active';

      const reminders = await listCustomerReminders(pool, userId, customerProfile, filter);
      res.json(reminders);
    } catch (error) {
      logger.error('Error fetching customer reminders', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero promemoria cliente' });
    }
  });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const customerProfile = (req.params as { customerProfile: string }).customerProfile;

      const parsed = CreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.format() });
      }

      const body = parsed.data;
      const reminder = await createReminder(pool, userId, customerProfile, {
        typeId: body.type_id,
        priority: body.priority,
        dueAt: new Date(body.due_at),
        recurrenceDays: body.recurrence_days,
        note: body.note,
        notifyVia: body.notify_via,
      });

      res.status(201).json(reminder);
    } catch (error) {
      logger.error('Error creating customer reminder', { error });
      res.status(500).json({ success: false, error: 'Errore nella creazione del promemoria' });
    }
  });

  return router;
}

export { createCustomerRemindersRouter };
