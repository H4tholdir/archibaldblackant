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
import { requireAdmin } from '../middleware/auth';
import type {
  VisitPlanningSessionId, VisitPlanningStopId, VisitPlanningStop,
  VisitHorizon, VisitMode, VisitStatus, StopStatus, CustomerSourceType,
} from '../db/repositories/visit-planning-types';
import { logger } from '../logger';
import { generateVisitRoute } from '../services/visit-generate-service';
import { detectIntent, generateIntentA } from '../services/visit-generate-intent';
import type { BuildCandidatesOptions } from '../services/visit-generate-service';
import {
  createOverride, deleteOverride, listOverrides, listSystemHolidays,
} from '../db/repositories/municipal-holidays';
import { generateWeeklyDistribution } from '../services/visit-weekly-planner-service';
import { createAppointment } from '../db/repositories/appointments';
import { getPreferences, upsertPreferences } from '../db/repositories/customer-visit-preferences';
import {
  listAllCourseEvents, createCourseEvent, deleteCourseEvent,
} from '../db/repositories/course-events';

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

  // ── Generazione automatica giro ───────────────────────────────────────
  const GenerateSchema = z.object({
    stopDate:   z.string().date().optional(),
    zones:      z.array(z.string()).optional(),
    skipIntent: z.boolean().optional(),
  });

  router.post('/sessions/:sessionId/generate', async (req, res) => {
    const parsed = GenerateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const userId = (req as AuthRequest).user!.userId;
      const sid = req.params.sessionId as VisitPlanningSessionId;

      const session = await getSession(pool, userId, sid);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const stopDate = parsed.data.stopDate ?? session.startDate;

      // Punto di partenza: session.startLat/Lng oppure home dell'utente
      let startLat = session.startLat;
      let startLng = session.startLng;

      if (startLat == null || startLng == null) {
        const { rows: userRows } = await pool.query(
          'SELECT home_lat, home_lng FROM agents.users WHERE id = $1',
          [userId],
        );
        if (userRows[0]) {
          startLat = userRows[0].home_lat != null ? parseFloat(userRows[0].home_lat as string) : null;
          startLng = userRows[0].home_lng != null ? parseFloat(userRows[0].home_lng as string) : null;
        }
      }

      const zoneFilter: BuildCandidatesOptions['zoneFilter'] = parsed.data.zones?.length
        ? parsed.data.zones.map(zoneStr => {
            const parts = zoneStr.split('_');
            return { zona: parts.slice(0, -1).join('_'), prov: parts[parts.length - 1] };
          })
        : undefined;

      let detection = null;
      if (session.horizon === 'day' && !parsed.data.skipIntent) {
        detection = await detectIntent(pool, userId, stopDate);
      }

      let stops: VisitPlanningStop[];
      if (detection?.intent === 'appointment_anchored') {
        stops = await generateIntentA(pool, userId, sid, session.mode, detection, startLat, startLng);
      } else if (session.horizon === 'week') {
        stops = await generateWeeklyDistribution(pool, userId, sid, session.mode, stopDate, startLat, startLng, { zoneFilter });
      } else {
        stops = await generateVisitRoute(pool, userId, sid, session.mode, session.horizon, startLat, startLng, stopDate, { zoneFilter });
      }

      res.status(201).json({ generated: stops.length, stops });
    } catch (err) {
      logger.error('generateVisitRoute error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Conferma tappa + crea appuntamento agenda ─────────────────────────
  router.post('/sessions/:sessionId/stops/:stopId/confirm-with-appointment', async (req, res) => {
    try {
      const userId  = (req as AuthRequest).user!.userId;
      const stopId  = req.params.stopId   as VisitPlanningStopId;
      const sid     = req.params.sessionId as VisitPlanningSessionId;

      // Leggi tutte le tappe della sessione per trovare quella richiesta
      const stops = await listStops(pool, userId, sid);
      const stop  = stops.find(s => s.id === stopId);
      if (!stop) return res.status(404).json({ error: 'Stop not found' });

      // 1. Conferma la tappa
      const confirmedStop = await updateStop(pool, userId, stopId, { status: 'confirmed' });

      // 2. Crea appuntamento (fail-open: log se fallisce, non rollback)
      let appointment: { id: string; title: string } | null = null;
      try {
        const startAt = stop.estimatedArrival ?? `${stop.stopDate}T09:00:00.000Z`;
        const startDate = new Date(startAt);
        const endDate   = new Date(startDate.getTime() + stop.visitMinutes * 60000);

        const apt = await createAppointment(pool, userId, {
          title:         `Visita ${stop.displayName}`,
          startAt:       startDate.toISOString(),
          endAt:         endDate.toISOString(),
          allDay:        false,
          customerErpId: stop.sourceType === 'archibald' ? stop.sourceId : null,
          location:      null,
          typeId:        null,
          notes:         `Generato da giro visite (sessione ${sid})`,
        });
        appointment = { id: apt.id, title: apt.title };
      } catch (aptErr) {
        logger.error('createAppointment fail (non-blocking)', { aptErr });
      }

      res.status(201).json({ stop: confirmedStop, appointment });
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found'))
        return res.status(404).json({ error: err.message });
      logger.error('confirmWithAppointment error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Feste patronali ────────────────────────────────────────────────────
  const OverrideSchema = z.object({
    comune:      z.string().min(1).max(100),
    provincia:   z.string().max(5).nullable().default(null),
    dateMonth:   z.number().int().min(1).max(12),
    dateDay:     z.number().int().min(1).max(31),
    holidayName: z.string().max(200).nullable().default(null),
    isClosed:    z.boolean().default(true),
    note:        z.string().max(500).nullable().default(null),
  });

  router.get('/holidays/system', async (_req, res) => {
    try {
      const holidays = await listSystemHolidays(pool);
      res.json(holidays);
    } catch (err) {
      logger.error('listSystemHolidays error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/holidays/overrides', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const overrides = await listOverrides(pool, userId);
      res.json(overrides);
    } catch (err) {
      logger.error('listOverrides error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/holidays/overrides', async (req, res) => {
    const parsed = OverrideSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as AuthRequest).user!.userId;
      const override = await createOverride(pool, { userId, ...parsed.data });
      res.status(201).json(override);
    } catch (err) {
      logger.error('createOverride error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/holidays/overrides/:id', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      await deleteOverride(pool, userId, Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found'))
        return res.status(404).json({ error: err.message });
      logger.error('deleteOverride error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Preferenze visita per cliente ─────────────────────────────────────
  const PreferencesSchema = z.object({
    typicalVisitMinutes: z.number().int().min(5).max(240).default(30),
    preferredTimeStart:  z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
    preferredTimeEnd:    z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
    requiresAppointment: z.boolean().default(false),
    notes:               z.string().max(500).nullable().default(null),
  });

  router.get('/customers/:sourceType/:sourceId/preferences', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { sourceType, sourceId } = req.params;
      if (sourceType !== 'archibald' && sourceType !== 'arca')
        return res.status(400).json({ error: 'sourceType deve essere archibald o arca' });
      const prefs = await getPreferences(
        pool, userId, sourceType as CustomerSourceType, decodeURIComponent(sourceId),
      );
      res.json(prefs ?? {
        typicalVisitMinutes: 30, preferredTimeStart: null, preferredTimeEnd: null,
        requiresAppointment: false, notes: null,
      });
    } catch (err) {
      logger.error('getPreferences error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.put('/customers/:sourceType/:sourceId/preferences', async (req, res) => {
    const parsed = PreferencesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { sourceType, sourceId } = req.params;
      if (sourceType !== 'archibald' && sourceType !== 'arca')
        return res.status(400).json({ error: 'sourceType deve essere archibald o arca' });
      await upsertPreferences(pool, {
        userId,
        sourceType:           sourceType as CustomerSourceType,
        sourceId:             decodeURIComponent(sourceId),
        typicalVisitMinutes:  parsed.data.typicalVisitMinutes,
        preferredDays:        [],
        avoidDays:            [],
        preferredTimeStart:   parsed.data.preferredTimeStart,
        preferredTimeEnd:     parsed.data.preferredTimeEnd,
        requiresAppointment:  parsed.data.requiresAppointment,
        notes:                parsed.data.notes,
      });
      res.status(204).end();
    } catch (err) {
      logger.error('upsertPreferences error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Corsi/eventi formativi ─────────────────────────────────────────────
  const CourseEventSchema = z.object({
    title:             z.string().min(1).max(200),
    instructor:        z.string().max(100).nullable().default(null),
    city:              z.string().min(1).max(100),
    provincia:         z.string().max(5).nullable().default(null),
    eventDate:         z.string().date(),
    costEur:           z.number().positive().nullable().default(null),
    productCategories: z.array(z.string()).default([]),
    thresholdEur:      z.number().positive().nullable().default(null),
    notes:             z.string().max(500).nullable().default(null),
    isActive:          z.boolean().default(true),
  });

  router.get('/courses', async (_req, res) => {
    try {
      const courses = await listAllCourseEvents(pool);
      res.json(courses);
    } catch (err) {
      logger.error('listAllCourseEvents error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/courses', requireAdmin, async (req, res) => {
    const parsed = CourseEventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const course = await createCourseEvent(pool, parsed.data);
      res.status(201).json(course);
    } catch (err) {
      logger.error('createCourseEvent error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/courses/:id', requireAdmin, async (req, res) => {
    try {
      await deleteCourseEvent(pool, Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found'))
        return res.status(404).json({ error: err.message });
      logger.error('deleteCourseEvent error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Rigenera giro: capture → generate → delete per atomicità reale ────
  router.post('/sessions/:sessionId/regenerate', async (req, res) => {
    const userId = (req as AuthRequest).user!.userId;
    const sid    = req.params.sessionId as VisitPlanningSessionId;

    const session = await getSession(pool, userId, sid);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    try {
      // 1. Cattura in anticipo gli ID delle stop da rimuovere (non-locked, non terminali)
      const { rows: staleRows } = await pool.query(
        `SELECT id FROM agents.visit_planning_stops
         WHERE session_id = $1 AND user_id = $2
           AND locked = FALSE
           AND status NOT IN ('visited', 'confirmed', 'skipped', 'removed')`,
        [sid, userId],
      );
      const staleIds: string[] = staleRows.map(r => r.id as string);

      // 2. Leggi start point dalla sessione o dal profilo utente
      let startLat = session.startLat;
      let startLng = session.startLng;
      if (startLat == null || startLng == null) {
        const { rows: userRows } = await pool.query(
          'SELECT home_lat, home_lng FROM agents.users WHERE id = $1', [userId],
        );
        if (userRows[0]) {
          startLat = userRows[0].home_lat != null ? parseFloat(userRows[0].home_lat as string) : null;
          startLng = userRows[0].home_lng != null ? parseFloat(userRows[0].home_lng as string) : null;
        }
      }

      const stopDate = session.startDate;

      // 3. Genera le nuove stop PRIMA di eliminare quelle vecchie
      //    Se questa operazione fallisce, le stop vecchie rimangono intatte

      // Zone-aware: leggi zone dalle tappe bloccate per il regenerate
      const { rows: lockedZoneRows } = await pool.query(
        `SELECT DISTINCT czm.zona, czm.prov
         FROM agents.visit_planning_stops vps
         JOIN agents.customers c
           ON c.erp_id = vps.source_id AND c.user_id = vps.user_id
         JOIN system.city_zone_map czm
           ON czm.city_normalized = UPPER(TRIM(c.city))
         WHERE vps.session_id = $1 AND vps.user_id = $2 AND vps.locked = TRUE
           AND vps.source_type = 'archibald'`,
        [sid, userId],
      );
      const zoneFilterRegen: BuildCandidatesOptions['zoneFilter'] = lockedZoneRows.length > 0
        ? lockedZoneRows.map(r => ({ zona: r.zona as string, prov: r.prov as string }))
        : undefined;
      const regenOpts: BuildCandidatesOptions = { zoneFilter: zoneFilterRegen };

      const newStops = session.horizon === 'week'
        ? await generateWeeklyDistribution(pool, userId, sid, session.mode, stopDate, startLat, startLng, regenOpts)
        : await generateVisitRoute(pool, userId, sid, session.mode, session.horizon, startLat, startLng, stopDate, regenOpts);

      // 4. Generazione riuscita → soft-delete degli ID catturati al passo 1
      if (staleIds.length > 0) {
        await pool.query(
          `UPDATE agents.visit_planning_stops
           SET status = 'removed', updated_at = NOW()
           WHERE id = ANY($1)`,
          [staleIds],
        );
      }

      res.status(201).json({ regenerated: newStops.length, stops: newStops });
    } catch (err) {
      logger.error('regenerate error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Mappa zone → etichette geografiche (vincolante da spec UI)
  const ZONE_LABELS: Record<string, string> = {
    'SA_7': 'Salerno città',         'SA_8': 'Piana del Sele / Cilento',
    'SA_5': 'Agro Nocerino',         'SA_6': "Valle dell'Irno",
    'SA_4': 'Pagani / Angri',        'SA_9': 'Sala Consilina / Vallo',
    'SA_3': 'Scafati / Angri SA',    'SA_2': 'Cetara / Scafati',
    'NA_3': 'Stabia / Pompei / Gragnano', 'NA_2': 'Costa Vesuviana',
    'NA_-1': 'Napoli città / Corona Est',  'NA_1': 'Napoli Est / Vesuvio',
    'NA_4': "Sant'Antonio Abate / Ottaviano",
    'PZ_9': 'Potenza / Basilicata',
    'AV_6': 'Avellino / Montoro',    'AV_7': 'Grottaminarda / Lioni',
    'CE_-1': 'Caserta / Terra di Lavoro',
  };
  function zoneLabel(zona: string, prov: string): string {
    return ZONE_LABELS[`${prov}_${zona}`] ?? `Zona ${zona}`;
  }

  // ── Lista zone con statistiche ─────────────────────────────────────────
  router.get('/zones', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const year   = new Date().getFullYear();

      // Zone dai clienti Archibald
      const { rows: archRows } = await pool.query(
        `SELECT czm.zona, czm.prov,
                COUNT(DISTINCT c.erp_id)::int AS total_clients,
                COUNT(DISTINCT c.erp_id) FILTER (
                  WHERE EXISTS (
                    SELECT 1 FROM agents.order_records o
                    JOIN agents.customers cc
                      ON cc.account_num = o.customer_account_num AND cc.user_id = o.user_id
                    WHERE cc.erp_id = c.erp_id AND cc.user_id = c.user_id
                      AND EXTRACT(YEAR FROM o.creation_date::date) = $2
                  )
                )::int AS active_this_year,
                array_agg(DISTINCT UPPER(TRIM(c.city)) ORDER BY UPPER(TRIM(c.city))) FILTER (
                  WHERE c.city IS NOT NULL AND c.city != ''
                ) AS cities
         FROM agents.customers c
         JOIN system.city_zone_map czm
           ON czm.city_normalized = UPPER(TRIM(c.city))
          AND czm.prov = COALESCE(c.county, (
            SELECT prov FROM system.city_zone_map WHERE city_normalized = UPPER(TRIM(c.city)) LIMIT 1
          ))
         WHERE c.user_id = $1 AND c.deleted_at IS NULL
           AND c.hidden = FALSE AND c.is_distributor = FALSE
           AND czm.zona NOT IN ('0', '100')
         GROUP BY czm.zona, czm.prov`,
        [userId, year],
      );

      // Zone dai sub_clients Arca
      const { rows: arcaRows } = await pool.query(
        `SELECT sc.zona, sc.prov,
                COUNT(*)::int AS total_clients,
                COUNT(*) FILTER (
                  WHERE EXISTS (
                    SELECT 1 FROM agents.fresis_history fh
                    WHERE fh.sub_client_codice = sc.codice AND fh.user_id = $1
                      AND EXTRACT(YEAR FROM fh.created_at) = $2
                  )
                )::int AS active_this_year,
                array_agg(DISTINCT UPPER(TRIM(sc.localita)) ORDER BY UPPER(TRIM(sc.localita)))
                  FILTER (WHERE sc.localita IS NOT NULL) AS cities
         FROM shared.sub_clients sc
         WHERE NOT EXISTS (
           SELECT 1 FROM shared.sub_client_customer_matches m WHERE m.sub_client_codice = sc.codice
         )
         AND sc.hidden = FALSE
         AND sc.zona IS NOT NULL AND sc.zona NOT IN ('0', '100')
         AND sc.prov IS NOT NULL
         GROUP BY sc.zona, sc.prov`,
        [userId, year],
      );

      // Merge per (zona, prov)
      type ZoneKey = string;
      const zoneMap = new Map<ZoneKey, {
        zona: string; prov: string; totalClients: number;
        activeThisYear: number; topCities: string[];
      }>();

      for (const r of [...archRows, ...arcaRows]) {
        const key: ZoneKey = `${r.zona as string}|${r.prov as string}`;
        const existing = zoneMap.get(key);
        const cities = (r.cities as string[] | null) ?? [];
        if (existing) {
          existing.totalClients    += r.total_clients as number;
          existing.activeThisYear  += r.active_this_year as number;
          existing.topCities        = [...new Set([...existing.topCities, ...cities])].slice(0, 3);
        } else {
          zoneMap.set(key, {
            zona: r.zona as string, prov: r.prov as string,
            totalClients:   r.total_clients as number,
            activeThisYear: r.active_this_year as number,
            topCities:      cities.slice(0, 3),
          });
        }
      }

      const zones = [...zoneMap.values()]
        .filter(z => z.totalClients > 0)
        .sort((a, b) => b.totalClients - a.totalClients)
        .map(z => ({ ...z, label: zoneLabel(z.zona, z.prov) }));

      res.json(zones);
    } catch (err) {
      logger.error('listZones error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Clienti per zone selezionate ──────────────────────────────────────
  router.get('/zones/clients', async (req, res) => {
    try {
      const userId  = (req as AuthRequest).user!.userId;
      const year    = new Date().getFullYear();
      const sortBy  = (req.query.sortBy as string) ?? 'distance';
      const search  = (req.query.search as string | undefined)?.toLowerCase();

      // Parsing zone: z=7_SA&z=8_SA → [{ zona:'7', prov:'SA' }]
      const zParam = Array.isArray(req.query.z)
        ? (req.query.z as string[])
        : req.query.z ? [req.query.z as string] : [];
      if (zParam.length === 0) return res.status(400).json({ error: 'Almeno una zona richiesta' });
      const zones = zParam.map(s => { const [z, p] = s.split('_'); return { zona: z, prov: p }; });

      // Home position per calcolo distanza
      const { rows: userRows } = await pool.query(
        'SELECT home_lat, home_lng FROM agents.users WHERE id = $1', [userId],
      );
      const homeLat = userRows[0]?.home_lat != null ? parseFloat(userRows[0].home_lat as string) : null;
      const homeLng = userRows[0]?.home_lng != null ? parseFloat(userRows[0].home_lng as string) : null;

      // Clienti Archibald nelle zone
      const zonaConditionsArch = zones.map((_, i) =>
        `(czm.zona = $${i * 2 + 3} AND czm.prov = $${i * 2 + 4})`
      ).join(' OR ');
      const zonaParamsArch = zones.flatMap(z => [z.zona, z.prov]);

      const { rows: archClients } = await pool.query(
        `SELECT c.erp_id AS source_id, 'archibald' AS source_type,
                c.name AS display_name, c.city, c.street, c.phone,
                COALESCE(g.lat, c.geo_latitude) AS lat,
                COALESCE(g.lng, c.geo_longitude) AS lng,
                COALESCE(
                  SUM(NULLIF(o.total_amount,'')::numeric) FILTER (WHERE EXTRACT(YEAR FROM o.creation_date::timestamp) = $2),
                  0
                ) AS ytd_revenue,
                COALESCE(SUM(NULLIF(o.total_amount,'')::numeric), 0) AS lifetime_revenue,
                COALESCE(MAX(o.creation_date::timestamp::date), c.last_order_date) AS last_order_date
         FROM agents.customers c
         JOIN system.city_zone_map czm
           ON czm.city_normalized = UPPER(TRIM(c.city))
         LEFT JOIN agents.customer_geo_status g
           ON g.user_id = c.user_id AND g.source_type = 'archibald'
          AND g.source_id = c.erp_id AND g.quality IN ('geocoded', 'manually_confirmed')
         LEFT JOIN agents.order_records o
           ON o.customer_account_num = c.account_num AND o.user_id = c.user_id
           AND c.account_num != '' AND o.customer_account_num != ''
         WHERE c.user_id = $1
           AND c.deleted_at IS NULL AND c.hidden = FALSE AND c.is_distributor = FALSE
           AND (${zonaConditionsArch})
         GROUP BY c.erp_id, c.name, c.city, c.street, c.phone, g.lat, g.lng, c.geo_latitude, c.geo_longitude, c.last_order_date`,
        [userId, year, ...zonaParamsArch],
      );

      // Clienti Arca nelle zone
      const zonaConditionsArca = zones.map((_, i) =>
        `(sc.zona = $${i * 2 + 3} AND sc.prov = $${i * 2 + 4})`
      ).join(' OR ');
      const zonaParamsArca = zones.flatMap(z => [z.zona, z.prov]);

      const { rows: arcaClients } = await pool.query(
        `SELECT sc.codice AS source_id, 'arca' AS source_type,
                sc.ragione_sociale AS display_name, sc.localita AS city,
                sc.indirizzo AS street, sc.telefono AS phone,
                sc.lat, sc.lng,
                COALESCE(
                  SUM(fh.target_total_with_vat / 1.22) FILTER (
                    WHERE EXTRACT(YEAR FROM fh.created_at) = $2
                  ), 0
                ) AS ytd_revenue,
                COALESCE(SUM(fh.target_total_with_vat / 1.22), 0) AS lifetime_revenue,
                MAX(fh.created_at::date) AS last_order_date
         FROM shared.sub_clients sc
         LEFT JOIN agents.fresis_history fh
           ON fh.sub_client_codice = sc.codice AND fh.user_id = $1
         WHERE NOT EXISTS (
           SELECT 1 FROM shared.sub_client_customer_matches m WHERE m.sub_client_codice = sc.codice
         )
         AND sc.hidden = FALSE
         AND (${zonaConditionsArca})
         GROUP BY sc.codice, sc.ragione_sociale, sc.localita, sc.indirizzo, sc.telefono, sc.lat, sc.lng`,
        [userId, year, ...zonaParamsArca],
      );

      // Calcola distanza + days_since_order per ogni cliente
      type RawClient = {
        source_id: string; source_type: string; display_name: string;
        city: string | null; street: string | null; phone: string | null;
        lat: string | null; lng: string | null;
        ytd_revenue: string; lifetime_revenue: string; last_order_date: string | null;
      };

      const toClient = (r: RawClient) => {
        const lat  = r.lat  != null ? parseFloat(r.lat)  : null;
        const lng  = r.lng  != null ? parseFloat(r.lng)  : null;
        const distanceKm = (lat != null && lng != null && homeLat != null && homeLng != null)
          ? Math.round(haversineKm(homeLat, homeLng, lat, lng) * 10) / 10
          : null;
        const lastOrderDate  = r.last_order_date ?? null;
        const daysSinceOrder = lastOrderDate
          ? Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / 86400000)
          : null;
        return {
          sourceType:      r.source_type,
          sourceId:        r.source_id,
          displayName:     r.display_name,
          city:            r.city,
          address:         r.street,
          phone:           r.phone,
          lat, lng, distanceKm,
          ytdRevenue:      parseFloat(r.ytd_revenue),
          lifetimeRevenue: parseFloat(r.lifetime_revenue),
          lastOrderDate,
          daysSinceOrder,
          isHidden: false,
        };
      };

      let clients = [...archClients, ...arcaClients].map(r => toClient(r as RawClient));

      // Filtro ricerca
      if (search) {
        clients = clients.filter(c =>
          c.displayName.toLowerCase().includes(search) ||
          (c.city ?? '').toLowerCase().includes(search) ||
          (c.phone ?? '').includes(search)
        );
      }

      // Segmenta: attivi (ordine nell'anno o ≤365gg) vs inattivi
      const active   = clients.filter(c => c.ytdRevenue > 0 || (c.daysSinceOrder != null && c.daysSinceOrder <= 365));
      const inactive = clients.filter(c => c.ytdRevenue <= 0 && (c.daysSinceOrder == null || c.daysSinceOrder > 365));

      // Ordinamento attivi
      const sortFn = (a: typeof active[0], b: typeof active[0]) => {
        switch (sortBy) {
          case 'ytd':      return b.ytdRevenue - a.ytdRevenue;
          case 'lifetime': return b.lifetimeRevenue - a.lifetimeRevenue;
          case 'lastOrder':
            if (!a.lastOrderDate) return 1;
            if (!b.lastOrderDate) return -1;
            return new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime();
          default: { // distance
            if (a.distanceKm == null) return 1;
            if (b.distanceKm == null) return -1;
            return a.distanceKm - b.distanceKm;
          }
        }
      };
      active.sort(sortFn);
      inactive.sort((a, b) => (b.daysSinceOrder ?? 9999) - (a.daysSinceOrder ?? 9999));

      res.json({ active, inactive, total: clients.length });
    } catch (err) {
      logger.error('listZoneClients error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/sessions/:sessionId/detect-intent', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const date   = (req.query.date as string) ?? new Date().toISOString().slice(0, 10);
      const result = await detectIntent(pool, userId, date);
      res.json(result);
    } catch (err) {
      logger.error('detectIntent error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/arca-clients/:codice/hidden', async (_req, res) => {
    try {
      await pool.query(
        'UPDATE shared.sub_clients SET hidden = TRUE WHERE codice = $1',
        [_req.params.codice],
      );
      res.status(204).end();
    } catch (err) {
      logger.error('archiveArcaClient error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
