import { Router } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool';
import { buildVisitBrief } from '../services/visit-brief-service';
import { buildCustomerProfile } from '../services/visit-unified-customer';
import {
  createSession, listSessions, getSession, updateSession, softDeleteSession,
} from '../db/repositories/visit-planning-sessions';
import {
  createStop, listStops, updateStop, deleteStop, reorderStops, markVisited,
} from '../db/repositories/visit-planning-stops';
import type { AuthRequest } from '../middleware/auth';
import type {
  VisitPlanningSessionId, VisitPlanningStopId,
  VisitHorizon, VisitMode, VisitStatus, StopStatus, CustomerSourceType,
} from '../db/repositories/visit-planning-types';
import { logger } from '../logger';

type Deps = { pool: DbPool };

const HORIZONS:      VisitHorizon[]       = ['day', 'week'];
const MODES:         VisitMode[]          = ['balanced', 'profitability', 'coverage', 'constrained', 'manual_assist'];
const STATUSES:      VisitStatus[]        = ['draft', 'planned', 'in_progress', 'completed', 'cancelled'];
const STOP_STATUSES: StopStatus[]         = ['suggested', 'to_call', 'confirmed', 'planned', 'backup', 'visited', 'skipped', 'removed'];
const SOURCE_TYPES:  CustomerSourceType[] = ['archibald', 'arca'];

const CreateSessionSchema = z.object({
  title:               z.string().min(1).max(256),
  horizon:             z.enum(HORIZONS as [VisitHorizon, ...VisitHorizon[]]),
  mode:                z.enum(MODES as [VisitMode, ...VisitMode[]]),
  startDate:           z.string().date(),
  endDate:             z.string().date(),
  startLocationLabel:  z.string().nullable().default(null),
  startLat:            z.number().nullable().default(null),
  startLng:            z.number().nullable().default(null),
  endLocationLabel:    z.string().nullable().default(null),
  endLat:              z.number().nullable().default(null),
  endLng:              z.number().nullable().default(null),
  constraintsJson:     z.record(z.unknown()).default({}),
});

const UpdateSessionSchema = CreateSessionSchema.partial().extend({
  status:              z.enum(STATUSES as [VisitStatus, ...VisitStatus[]]).optional(),
  navigationStartedAt: z.string().nullable().optional(),
  activeStopId:        z.string().nullable().optional(),
  metricsJson:         z.record(z.unknown()).optional(),
});

const ListSessionsSchema = z.object({
  from:    z.string().date(),
  to:      z.string().date(),
  status:  z.enum(STATUSES as [VisitStatus, ...VisitStatus[]]).optional(),
  horizon: z.enum(HORIZONS as [VisitHorizon, ...VisitHorizon[]]).optional(),
});

const CreateStopSchema = z.object({
  sourceType:   z.enum(SOURCE_TYPES as [CustomerSourceType, ...CustomerSourceType[]]),
  sourceId:     z.string().min(1),
  displayName:  z.string().min(1).max(256),
  stopDate:     z.string().date(),
  status:       z.enum(STOP_STATUSES as [StopStatus, ...StopStatus[]]).default('planned'),
  visitMinutes: z.number().int().min(5).max(480).default(30),
  sequence:     z.number().int().optional(),
  locked:       z.boolean().default(false),
});

const UpdateStopSchema = z.object({
  status:             z.enum(STOP_STATUSES as [StopStatus, ...StopStatus[]]).optional(),
  locked:             z.boolean().optional(),
  sequence:           z.number().int().optional(),
  visitMinutes:       z.number().int().min(5).max(480).optional(),
  manualNote:         z.string().nullable().optional(),
  skipReason:         z.string().nullable().optional(),
  estimatedArrival:   z.string().nullable().optional(),
  estimatedDeparture: z.string().nullable().optional(),
  appointmentId:      z.string().nullable().optional(),
});

const ReorderSchema = z.object({
  order: z.array(z.object({ id: z.string(), sequence: z.number().int() })),
});

export function createVisitPlanningRouter({ pool }: Deps): Router {
  const router = Router();

  // ── Sessioni ──────────────────────────────────────────────────────────
  router.get('/sessions', async (req, res) => {
    const parsed = ListSessionsSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as AuthRequest).user!.userId;
      const sessions = await listSessions(pool, userId, parsed.data);
      res.json(sessions);
    } catch (err) {
      logger.error('listSessions error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/sessions', async (req, res) => {
    const parsed = CreateSessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as AuthRequest).user!.userId;
      const session = await createSession(pool, userId, parsed.data);
      res.status(201).json(session);
    } catch (err) {
      logger.error('createSession error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/sessions/:sessionId', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const session = await getSession(pool, userId, req.params.sessionId as VisitPlanningSessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json(session);
    } catch (err) {
      logger.error('getSession error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/sessions/:sessionId', async (req, res) => {
    const parsed = UpdateSessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as AuthRequest).user!.userId;
      const session = await updateSession(pool, userId, req.params.sessionId as VisitPlanningSessionId, parsed.data);
      res.json(session);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) return res.status(404).json({ error: err.message });
      logger.error('updateSession error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/sessions/:sessionId', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      await softDeleteSession(pool, userId, req.params.sessionId as VisitPlanningSessionId);
      res.status(204).end();
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) return res.status(404).json({ error: err.message });
      logger.error('softDeleteSession error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Tappe ─────────────────────────────────────────────────────────────
  router.get('/sessions/:sessionId/stops', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const stops = await listStops(pool, userId, req.params.sessionId as VisitPlanningSessionId);
      res.json(stops);
    } catch (err) {
      logger.error('listStops error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/sessions/:sessionId/stops', async (req, res) => {
    const parsed = CreateStopSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as AuthRequest).user!.userId;
      const stop = await createStop(pool, req.params.sessionId as VisitPlanningSessionId, userId, parsed.data);
      res.status(201).json(stop);
    } catch (err) {
      logger.error('createStop error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/sessions/:sessionId/stops/:stopId', async (req, res) => {
    const parsed = UpdateStopSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as AuthRequest).user!.userId;
      const stop = await updateStop(pool, userId, req.params.stopId as VisitPlanningStopId, parsed.data);
      res.json(stop);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) return res.status(404).json({ error: err.message });
      logger.error('updateStop error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/sessions/:sessionId/stops/:stopId', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      await deleteStop(pool, userId, req.params.stopId as VisitPlanningStopId);
      res.status(204).end();
    } catch (err) {
      logger.error('deleteStop error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/sessions/:sessionId/stops/:stopId/mark-visited', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const stop = await markVisited(pool, userId, req.params.stopId as VisitPlanningStopId);
      res.json(stop);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) return res.status(404).json({ error: err.message });
      logger.error('markVisited error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/sessions/:sessionId/stops/:stopId/skip', async (req, res) => {
    const reason = typeof req.body.reason === 'string' ? req.body.reason : null;
    try {
      const userId = (req as AuthRequest).user!.userId;
      const stop = await updateStop(pool, userId, req.params.stopId as VisitPlanningStopId, {
        status: 'skipped', skipReason: reason,
      });
      res.json(stop);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) return res.status(404).json({ error: err.message });
      logger.error('skipStop error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/sessions/:sessionId/stops/reorder', async (req, res) => {
    const parsed = ReorderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as AuthRequest).user!.userId;
      await reorderStops(
        pool, userId, req.params.sessionId as VisitPlanningSessionId,
        parsed.data.order.map(o => ({ id: o.id as VisitPlanningStopId, sequence: o.sequence })),
      );
      res.status(204).end();
    } catch (err) {
      logger.error('reorderStops error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Tracciamento navigazione ──────────────────────────────────────────
  router.post('/sessions/:sessionId/stops/:stopId/navigation-started', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      await updateSession(pool, userId, req.params.sessionId as VisitPlanningSessionId, {
        navigationStartedAt: new Date().toISOString(),
        activeStopId: req.params.stopId,
      });
      res.status(204).end();
    } catch (err) {
      logger.error('navigationStarted error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Visit brief ───────────────────────────────────────────────────────
  router.get('/customers/:sourceType/:sourceId/visit-brief', async (req, res) => {
    const { sourceType, sourceId } = req.params;
    if (sourceType !== 'archibald' && sourceType !== 'arca') {
      return res.status(400).json({ error: 'sourceType deve essere archibald o arca' });
    }
    try {
      const userId = (req as AuthRequest).user!.userId;
      const decodedId = decodeURIComponent(sourceId);
      const src = sourceType as CustomerSourceType;
      const [brief, profile] = await Promise.all([
        buildVisitBrief(pool, userId, src, decodedId),
        buildCustomerProfile(pool, userId, src, decodedId),
      ]);
      res.json({ ...profile, ...brief });
    } catch (err) {
      logger.error('visitBrief error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
