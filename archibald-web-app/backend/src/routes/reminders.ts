import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import {
  getTodayReminders,
  patchReminder,
  deleteReminder,
  getUpcomingReminders,
} from '../db/repositories/customer-reminders';
import type { ReminderId } from '../db/repositories/customer-reminders';
import {
  listReminderTypes,
  createReminderType,
  updateReminderType,
  deleteReminderType,
} from '../db/repositories/reminder-types';
import { logger } from '../logger';

type RemindersRouterDeps = { pool: DbPool };

const PatchSchema = z.object({
  type_id: z.number().int().positive().optional(),
  priority: z.enum(['urgent', 'normal', 'low']).optional(),
  due_at: z.string().datetime().optional(),
  recurrence_days: z.number().int().positive().nullable().optional(),
  note: z.string().nullable().optional(),
  notify_via: z.enum(['app', 'email']).optional(),
  status: z.enum(['active', 'snoozed', 'done', 'cancelled']).optional(),
  snoozed_until: z.string().datetime().nullable().optional(),
  completion_note: z.string().optional(),
});

const CreateTypeSchema = z.object({
  label: z.string().min(1).max(50),
  emoji: z.string().min(1).max(8),
  colorBg: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  colorText: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const UpdateTypeSchema = CreateTypeSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' },
);

function createRemindersRouter({ pool }: RemindersRouterDeps): Router {
  const router = Router();

  // ── Reminder types CRUD (registrate PRIMA di /:id) ──────────────────────

  router.get('/types', async (req: AuthRequest, res) => {
    try {
      const types = await listReminderTypes(pool, req.user!.userId);
      res.json(types);
    } catch (error) {
      logger.error('Error fetching reminder types', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero tipi promemoria' });
    }
  });

  router.post('/types', async (req: AuthRequest, res) => {
    try {
      const parsed = CreateTypeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.format() });
      const type = await createReminderType(pool, req.user!.userId, parsed.data);
      res.status(201).json(type);
    } catch (error) {
      logger.error('Error creating reminder type', { error });
      res.status(500).json({ success: false, error: 'Errore nella creazione tipo promemoria' });
    }
  });

  router.patch('/types/:id', async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid type id' });
      const parsed = UpdateTypeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.format() });
      const type = await updateReminderType(pool, id, req.user!.userId, parsed.data);
      res.json(type);
    } catch (error) {
      logger.error('Error updating reminder type', { error });
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ success: false, error: 'Tipo non trovato' });
      }
      res.status(500).json({ success: false, error: 'Errore nella modifica tipo promemoria' });
    }
  });

  router.delete('/types/:id', async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid type id' });
      const result = await deleteReminderType(pool, id, req.user!.userId);
      res.json(result);
    } catch (error) {
      logger.error('Error deleting reminder type', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione tipo promemoria' });
    }
  });

  // ── Today / Upcoming ────────────────────────────────────────────────────

  router.get('/today', async (req: AuthRequest, res) => {
    try {
      const result = await getTodayReminders(pool, req.user!.userId);
      res.json(result);
    } catch (error) {
      logger.error('Error fetching today reminders', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero promemoria di oggi' });
    }
  });

  router.get('/upcoming', async (req: AuthRequest, res) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
      const result = await getUpcomingReminders(pool, req.user!.userId, days);
      res.json(result);
    } catch (error) {
      logger.error('Error fetching upcoming reminders', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero promemoria futuri' });
    }
  });

  // ── Reminder PATCH / DELETE ──────────────────────────────────────────────

  router.patch('/:id', async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid reminder id' });
      const parsed = PatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.format() });
      const body = parsed.data;
      const updated = await patchReminder(pool, req.user!.userId, id as ReminderId, {
        typeId: body.type_id,
        priority: body.priority,
        dueAt: body.due_at !== undefined ? new Date(body.due_at) : undefined,
        ...(body.recurrence_days !== undefined && { recurrenceDays: body.recurrence_days }),
        ...(body.note !== undefined && { note: body.note }),
        notifyVia: body.notify_via,
        status: body.status,
        ...(body.snoozed_until !== undefined && {
          snoozedUntil: body.snoozed_until !== null ? new Date(body.snoozed_until) : null,
        }),
        completionNote: body.completion_note,
      });
      res.json(updated);
    } catch (error) {
      logger.error('Error patching reminder', { error });
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ success: false, error: 'Promemoria non trovato' });
      }
      res.status(500).json({ success: false, error: 'Errore nella modifica del promemoria' });
    }
  });

  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid reminder id' });
      await deleteReminder(pool, req.user!.userId, id as ReminderId);
      res.sendStatus(204);
    } catch (error) {
      logger.error('Error deleting reminder', { error });
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ success: false, error: 'Promemoria non trovato' });
      }
      res.status(500).json({ success: false, error: 'Errore nella cancellazione del promemoria' });
    }
  });

  return router;
}

export { createRemindersRouter };
