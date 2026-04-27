import { Router } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool';
import {
  listAppointmentTypes,
  createAppointmentType,
  updateAppointmentType,
  softDeleteAppointmentType,
} from '../db/repositories/appointment-types';
import type { AppointmentTypeId } from '../db/repositories/appointment-types';
import { logger } from '../logger';

type Deps = { pool: DbPool };

const CreateSchema = z.object({
  label:     z.string().min(1).max(64),
  emoji:     z.string().min(1).max(8),
  colorHex:  z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sortOrder: z.number().int().min(0).default(99),
});

const UpdateSchema = CreateSchema.partial();

export function createAppointmentTypesRouter({ pool }: Deps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const userId = (req as any).userId as string;
      const types = await listAppointmentTypes(pool, userId);
      res.json(types);
    } catch (err) {
      logger.error('listAppointmentTypes error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as any).userId as string;
      const type = await createAppointmentType(pool, userId, parsed.data);
      res.status(201).json(type);
    } catch (err) {
      logger.error('createAppointmentType error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/:id', async (req, res) => {
    const rawId = Number(req.params.id);
    if (!Number.isInteger(rawId) || rawId <= 0) {
      return res.status(400).json({ error: 'Invalid appointment type id' });
    }
    const id = rawId as AppointmentTypeId;
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as any).userId as string;
      const type = await updateAppointmentType(pool, userId, id, parsed.data);
      res.json(type);
    } catch (err) {
      if (err instanceof Error && err.message === 'Appointment type not found') {
        return res.status(404).json({ error: err.message });
      }
      logger.error('updateAppointmentType error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    const rawId = Number(req.params.id);
    if (!Number.isInteger(rawId) || rawId <= 0) {
      return res.status(400).json({ error: 'Invalid appointment type id' });
    }
    const id = rawId as AppointmentTypeId;
    try {
      const userId = (req as any).userId as string;
      await softDeleteAppointmentType(pool, userId, id);
      res.status(204).end();
    } catch (err) {
      if (err instanceof Error && err.message === 'Cannot delete system appointment type') {
        return res.status(403).json({ error: err.message });
      }
      logger.error('softDeleteAppointmentType error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
