import type { DbPool } from '../db/pool';
import { buildCandidates } from './visit-generate-service';
import { createStop } from '../db/repositories/visit-planning-stops';
import { updateSession } from '../db/repositories/visit-planning-sessions';
import { toVrpStop, solomonI1Insertion, twoOptLocalSearch } from './visit-vrptw-solver';
import { getPreferences } from '../db/repositories/customer-visit-preferences';
import { estimateTravelMinutes } from './visit-planner';
import type { VisitPlanningSessionId, VisitPlanningStop, VisitMode } from '../db/repositories/visit-planning-types';
import { logger } from '../logger';

export type DetectedAppointment = {
  appointmentId: string;
  title:         string;
  customerErpId: string | null;
  startAt:       string;   // ISO
  endAt:         string;   // ISO
  location:      string | null;
};

export type FreeWindow = {
  startAt:     string;   // ISO
  endAt:       string;   // ISO
  durationMin: number;
};

export type IntentDetectionResult = {
  intent:       'appointment_anchored' | 'zone_based';
  appointments: DetectedAppointment[];
  freeWindows:  FreeWindow[];
};

const DAY_START_HOUR = 8;   // 08:00
const DAY_END_HOUR   = 18;  // 18:00
const MIN_WINDOW_MIN = 30;  // finestra minima utile

export async function detectIntent(
  pool:   DbPool,
  userId: string,
  date:   string,   // YYYY-MM-DD
): Promise<IntentDetectionResult> {
  const dayStart = new Date(`${date}T0${DAY_START_HOUR}:00:00+02:00`);
  const dayEnd   = new Date(`${date}T${DAY_END_HOUR}:00:00+02:00`);

  const { rows } = await pool.query(
    `SELECT id, title, customer_erp_id, start_at, end_at, location
     FROM agents.appointments
     WHERE user_id = $1
       AND DATE(start_at AT TIME ZONE 'Europe/Rome') = $2
       AND deleted_at IS NULL
     ORDER BY start_at`,
    [userId, date],
  );

  if (rows.length === 0) {
    return { intent: 'zone_based', appointments: [], freeWindows: [] };
  }

  const appointments: DetectedAppointment[] = rows.map(r => ({
    appointmentId: r.id as string,
    title:         r.title as string,
    customerErpId: r.customer_erp_id as string | null,
    startAt:       (r.start_at as Date).toISOString(),
    endAt:         (r.end_at   as Date).toISOString(),
    location:      r.location as string | null,
  }));

  // Calcola finestre libere tra gli appuntamenti
  const freeWindows: FreeWindow[] = [];
  let cursor = dayStart;

  for (const appt of appointments) {
    const apptStart = new Date(appt.startAt);
    const apptEnd   = new Date(appt.endAt);
    const gapMin = (apptStart.getTime() - cursor.getTime()) / 60000;
    if (gapMin >= MIN_WINDOW_MIN) {
      freeWindows.push({
        startAt:     cursor.toISOString(),
        endAt:       apptStart.toISOString(),
        durationMin: Math.round(gapMin),
      });
    }
    cursor = apptEnd > cursor ? apptEnd : cursor;
  }

  // Finestra dopo l'ultimo appuntamento
  const afterMin = (dayEnd.getTime() - cursor.getTime()) / 60000;
  if (afterMin >= MIN_WINDOW_MIN) {
    freeWindows.push({
      startAt:     cursor.toISOString(),
      endAt:       dayEnd.toISOString(),
      durationMin: Math.round(afterMin),
    });
  }

  return { intent: 'appointment_anchored', appointments, freeWindows };
}

// Genera giro Intent A: inserisce appuntamenti come tappe locked + riempie le finestre libere
export async function generateIntentA(
  pool:      DbPool,
  userId:    string,
  sessionId: VisitPlanningSessionId,
  mode:      VisitMode,
  detection: IntentDetectionResult,
  startLat:  number | null,
  startLng:  number | null,
): Promise<VisitPlanningStop[]> {
  const allStops: VisitPlanningStop[] = [];
  let seq = 1;

  // 1. Inserisci appuntamenti come tappe locked confirmed
  for (const appt of detection.appointments) {
    try {
      const stop = await createStop(pool, sessionId, userId, {
        sourceType:            'archibald',
        sourceId:              appt.customerErpId ?? appt.appointmentId,
        displayName:           appt.title,
        stopDate:              appt.startAt.slice(0, 10),
        status:                'confirmed',
        visitMinutes:          Math.round(
          (new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime()) / 60000,
        ),
        sequence:              seq++,
        locked:                true,
        recommendationReasons: ['Appuntamento confermato'],
      });
      // Aggiorna estimatedArrival con l'orario reale
      await pool.query(
        `UPDATE agents.visit_planning_stops
         SET estimated_arrival = $1, estimated_departure = $2, updated_at = NOW()
         WHERE id = $3`,
        [appt.startAt, appt.endAt, stop.id],
      );
      allStops.push(stop);
    } catch (err) {
      logger.warn('generateIntentA: skip appointment', { appt, err });
    }
  }

  // 2. Per ogni finestra libera, seleziona clienti dalla zona degli appuntamenti adiacenti
  for (const window of detection.freeWindows) {
    const windowMin    = window.durationMin;
    // ~45 min per slot incluso viaggio
    const slotsAvailable = Math.max(1, Math.floor((windowMin - 15) / 45));

    // Identifica zona dagli appuntamenti adiacenti (prima e dopo la finestra)
    const windowStart = new Date(window.startAt);
    const prevAppt    = detection.appointments.find(a => new Date(a.endAt) <= windowStart);
    const nextAppt    = detection.appointments.find(
      a => new Date(a.startAt) >= new Date(window.endAt),
    );

    // Determina zona dagli appuntamenti (lookup città del cliente)
    let zoneFilter: Array<{ zona: string; prov: string }> | undefined;
    for (const appt of [prevAppt, nextAppt].filter((a): a is DetectedAppointment => a != null)) {
      if (!appt.customerErpId) continue;
      const { rows: czRows } = await pool.query(
        `SELECT czm.zona, czm.prov FROM agents.customers c
         JOIN system.city_zone_map czm ON czm.city_normalized = REPLACE(UPPER(TRIM(c.city)), ' ', '')
         WHERE c.user_id = $1 AND c.erp_id = $2 LIMIT 1`,
        [userId, appt.customerErpId],
      );
      if (czRows[0]) {
        zoneFilter = [{ zona: czRows[0].zona as string, prov: czRows[0].prov as string }];
        break;
      }
    }

    // Esclude i clienti già in sessione
    const existingSourceIds = allStops.map(s => s.sourceId);

    const candidates = await buildCandidates(pool, userId, mode, {
      zoneFilter,
      excludeSourceIds: existingSourceIds,
    });

    const windowCandidates = candidates.slice(0, slotsAvailable * 3);
    const prefs = new Map<string, Awaited<ReturnType<typeof getPreferences>>>();
    for (const c of windowCandidates) {
      try {
        const p = await getPreferences(pool, userId, 'archibald', c.profile.sourceId);
        if (p) prefs.set(c.profile.sourceId, p);
      } catch { /* usa TW default */ }
    }

    const vrpStops = windowCandidates.map(c =>
      toVrpStop(c.profile, c.score, prefs.get(c.profile.sourceId) ?? null),
    );
    const depot    = { lat: startLat, lng: startLng };
    const startMin =
      new Date(window.startAt).getHours() * 60 + new Date(window.startAt).getMinutes();
    const route     = twoOptLocalSearch(solomonI1Insertion(vrpStops, depot, startMin), depot, startMin);
    const finalStops = route.stops.slice(0, slotsAvailable);

    const candidateMap = new Map(candidates.map(d => [d.profile.sourceId, d]));
    let prevLat = startLat;
    let prevLng = startLng;

    for (let i = 0; i < finalStops.length; i++) {
      const vs   = finalStops[i];
      const data = candidateMap.get(vs.sourceId);
      if (!data) continue;

      const reasons = [
        `Finestra ${window.startAt.slice(11, 16)}–${window.endAt.slice(11, 16)}`,
      ];
      if (data.daysSinceLastOrder != null) {
        reasons.push(`${data.daysSinceLastOrder}gg senza ordini`);
      }

      const stop = await createStop(pool, sessionId, userId, {
        sourceType:            data.profile.sourceType,
        sourceId:              vs.sourceId,
        displayName:           vs.displayName,
        stopDate:              window.startAt.slice(0, 10),
        status:                'to_call',
        visitMinutes:          vs.serviceDuration,
        sequence:              seq++,
        scoreTotal:            vs.score,
        scoreBreakdownJson:    data.breakdown as Record<string, number>,
        recommendationReasons: reasons,
      });

      const travelMins = estimateTravelMinutes(prevLat, prevLng, vs.lat, vs.lng);
      if (travelMins != null) {
        await pool.query(
          'UPDATE agents.visit_planning_stops SET travel_minutes_from_previous = $1 WHERE id = $2',
          [travelMins, stop.id],
        );
      }

      // ETA dalla finestra + offset
      const arrivalMin = startMin + i * 45;
      if (arrivalMin < DAY_END_HOUR * 60) {
        const base = new Date(window.startAt.slice(0, 10) + 'T00:00:00Z');
        const arr  = new Date(base.getTime() + arrivalMin * 60000);
        const dep  = new Date(arr.getTime() + vs.serviceDuration * 60000);
        await pool.query(
          'UPDATE agents.visit_planning_stops SET estimated_arrival = $1, estimated_departure = $2 WHERE id = $3',
          [arr.toISOString(), dep.toISOString(), stop.id],
        );
      }

      allStops.push(stop);
      prevLat = vs.lat;
      prevLng = vs.lng;
    }
  }

  await updateSession(pool, userId, sessionId, {
    status:      'planned',
    generatedAt: new Date().toISOString(),
  });
  return allStops;
}
