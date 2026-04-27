import { Router } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool';
import {
  createAppointment,
  listAppointments,
  updateAppointment,
  softDeleteAppointment,
  type AppointmentId,
} from '../db/repositories/appointments';
import { logger } from '../logger';

type Deps = { pool: DbPool };

const AppointmentSchema = z.object({
  title:         z.string().min(1).max(256),
  startAt:       z.string().datetime(),
  endAt:         z.string().datetime(),
  allDay:        z.boolean().default(false),
  customerErpId: z.string().nullable().default(null),
  location:      z.string().max(512).nullable().default(null),
  typeId:        z.number().int().positive().nullable().default(null),
  notes:         z.string().max(4096).nullable().default(null),
});

const UpdateSchema = AppointmentSchema.partial();

const ListQuerySchema = z.object({
  from:       z.string().date(),
  to:         z.string().date(),
  customerId: z.string().optional(),
});

export function createAppointmentsRouter({ pool }: Deps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as any).userId as string;
      const appts = await listAppointments(pool, userId, parsed.data);
      res.json(appts);
    } catch (err) {
      logger.error('listAppointments error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    const parsed = AppointmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as any).userId as string;
      const appt = await createAppointment(pool, userId, parsed.data);
      res.status(201).json(appt);
    } catch (err) {
      logger.error('createAppointment error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/:id', async (req, res) => {
    const id = req.params.id as AppointmentId;
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as any).userId as string;
      const appt = await updateAppointment(pool, userId, id, parsed.data);
      res.json(appt);
    } catch (err) {
      logger.error('updateAppointment error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    const id = req.params.id as AppointmentId;
    try {
      const userId = (req as any).userId as string;
      await softDeleteAppointment(pool, userId, id);
      res.status(204).end();
    } catch (err) {
      logger.error('softDeleteAppointment error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
