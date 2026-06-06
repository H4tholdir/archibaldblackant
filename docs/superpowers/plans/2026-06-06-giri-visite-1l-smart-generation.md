# Giri Visite — Piano 1l: Smart Generation + Map Itinerary

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare la Smart Generation con intent detection (appuntamenti fissi vs zona), zone-aware regenerate, mappa con polyline + stats `≥km`, e Session Page aggiornata con contatori stato e navigazione completa Google Maps.

**Architecture:** (1) `buildCandidates` accetta `zoneFilter` opzionale. (2) `detectIntent()` controlla `agents.appointments` per la data. (3) Intent A: carica appuntamenti → calcola finestre libere → riempie con candidati zona. (4) Intent B: usa `zoneFilter` per restringere i candidati. (5) Regenerate zone-aware: legge zone delle tappe bloccate. (6) VisitMap aggiornato: polyline SVG, barra stats `≥km`. (7) SessionPage: contatori stato header, pulsante "Avvia navigazione". (8) Frontend: `IntentDetectionModal` per flusso Intent A.

**Tech Stack:** Express, TypeScript strict, pg, React 19, Vitest. Design: spec UI `2026-06-06-giri-visite-redesign-design.md` sezione "UI/UX Design Decisions — VINCOLANTI AL 100%".

**Prerequisiti:** Piani 1j + 1k completati.

---

## File da creare / modificare

| File | Op | Scopo |
|---|---|---|
| `backend/src/services/visit-generate-service.ts` | Modifica | buildCandidates con zoneFilter |
| `backend/src/services/visit-generate-intent.ts` | Crea | detectIntent, Intent A generation |
| `backend/src/services/visit-weekly-planner-service.ts` | Modifica | generateWeeklyDistribution con zoneFilter |
| `backend/src/routes/visit-planning-router.ts` | Modifica | /generate con detectIntent, /regenerate zone-aware |
| `frontend/src/components/visit-planning/VisitMap.tsx` | Modifica | Polyline SVG, stats bar ≥km |
| `frontend/src/components/visit-planning/IntentDetectionModal.tsx` | Crea | Modal Intent A pre-generazione |
| `frontend/src/pages/VisitPlanningSessionPage.tsx` | Modifica | Contatori stato, "Avvia navigazione" |
| `frontend/src/services/visit-planning.service.ts` | Modifica | detectIntent(), checkIntentForDate() |

---

## Task 1 — buildCandidates con zoneFilter

**Files:**
- Modify: `archibald-web-app/backend/src/services/visit-generate-service.ts`

- [ ] **Step 1.1: Aggiungi il tipo BuildCandidatesOptions**

In cima al file, aggiungi il tipo:

```typescript
export type BuildCandidatesOptions = {
  zoneFilter?: Array<{ zona: string; prov: string }>;
  excludeSourceIds?: string[];
};
```

- [ ] **Step 1.2: Aggiorna la firma di buildCandidates**

```typescript
export async function buildCandidates(
  pool: DbPool,
  userId: string,
  mode: VisitMode,
  options?: BuildCandidatesOptions,
): Promise<ScoredProfile[]>
```

- [ ] **Step 1.3: Applica il filtro zona alla query customers Archibald**

Dopo la riga `WHERE c.user_id = $1 AND c.is_distributor = FALSE AND c.deleted_at IS NULL`:

```typescript
  const zoneFilter = options?.zoneFilter;
  const excludeIds = options?.excludeSourceIds ?? [];

  // Se zoneFilter specificato, aggiungi JOIN e condizione zona
  let customersQuery = `
    SELECT c.erp_id, c.name, c.city, c.street, c.postal_code, c.county,
           c.last_order_date,
           COALESCE(g.lat, c.geo_latitude)  AS lat,
           COALESCE(g.lng, c.geo_longitude) AS lng,
           CASE
             WHEN g.lat IS NOT NULL THEN g.quality
             WHEN c.geo_latitude IS NOT NULL THEN 'geocoded'
             ELSE 'unknown'
           END AS geo_quality
    FROM agents.customers c
    LEFT JOIN agents.customer_geo_status g
      ON g.user_id = c.user_id AND g.source_type = 'archibald' AND g.source_id = c.erp_id
  `;

  if (zoneFilter && zoneFilter.length > 0) {
    customersQuery += `
    JOIN system.city_zone_map czm
      ON czm.city_normalized = UPPER(TRIM(c.city))
    `;
  }

  customersQuery += `
    WHERE c.user_id = $1
      AND c.is_distributor = FALSE
      AND c.deleted_at IS NULL
      AND c.hidden = FALSE
  `;

  if (zoneFilter && zoneFilter.length > 0) {
    const zoneConds = zoneFilter.map((_, i) =>
      `(czm.zona = $${i * 2 + 2} AND czm.prov = $${i * 2 + 3})`
    ).join(' OR ');
    customersQuery += ` AND (${zoneConds})`;
  }

  const zoneParams = zoneFilter ? zoneFilter.flatMap(z => [z.zona, z.prov]) : [];
  const { rows: customers } = await pool.query(customersQuery, [userId, ...zoneParams]);
```

- [ ] **Step 1.4: Applica il filtro zona alla query Arca sub_clients (query 4)**

Trova la query `SELECT sc.codice, sc.ragione_sociale, sc.localita...` e aggiungi condizione zona se specificata:

```typescript
  const arcaZoneCond = (zoneFilter && zoneFilter.length > 0)
    ? `AND (${zoneFilter.map((_, i) => `(sc.zona = $${i + 2} AND sc.prov = $${i + 2 + zoneFilter.length})`).join(' OR ')})`
    : '';
  const arcaZoneParams = zoneFilter ? [...zoneFilter.map(z => z.zona), ...zoneFilter.map(z => z.prov)] : [];
```

Aggiorna la query 4 per includere `arcaZoneCond` e passare `arcaZoneParams` come parametri aggiuntivi dopo `[userId]`.

- [ ] **Step 1.5: Filtra excludeSourceIds**

Dopo aver calcolato `allProfiled`, prima del return:

```typescript
  const excluded = new Set(excludeIds);
  return allProfiled
    .filter(p => !excluded.has(p.profile.sourceId))
    .filter(p => dedupedIds.has(p.profile.sourceId))
    .sort((a, b) => b.score - a.score);
```

- [ ] **Step 1.6: Aggiorna generateWeeklyDistribution per passare zoneFilter**

In `visit-weekly-planner-service.ts`, aggiorna la firma:

```typescript
export async function generateWeeklyDistribution(
  pool: DbPool, userId: string, sessionId: VisitPlanningSessionId,
  mode: VisitMode, startDate: string,
  startLat: number | null, startLng: number | null,
  options?: BuildCandidatesOptions,
): Promise<VisitPlanningStop[]>
```

E passa `options` a `buildCandidates`:
```typescript
  const allCandidates = await buildCandidates(pool, userId, mode, options);
```

- [ ] **Step 1.7: Build + test**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | grep -E "Tests|passed|failed" | tail -2
```

- [ ] **Step 1.8: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/services/visit-generate-service.ts \
        archibald-web-app/backend/src/services/visit-weekly-planner-service.ts
git commit -m "feat(giri-visite): buildCandidates accetta zoneFilter e excludeSourceIds"
```

---

## Task 2 — Intent detection + Intent A generation

**Files:**
- Create: `archibald-web-app/backend/src/services/visit-generate-intent.ts`

- [ ] **Step 2.1: Crea il file `visit-generate-intent.ts`**

```typescript
// archibald-web-app/backend/src/services/visit-generate-intent.ts
import type { DbPool } from '../db/pool';
import { buildCandidates } from './visit-generate-service';
import { createStop } from '../db/repositories/visit-planning-stops';
import { updateSession } from '../db/repositories/visit-planning-sessions';
import { isHolidayForCity } from '../db/repositories/municipal-holidays';
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
  startAt: string;   // ISO
  endAt:   string;   // ISO
  durationMin: number;
};

export type IntentDetectionResult = {
  intent:        'appointment_anchored' | 'zone_based';
  appointments:  DetectedAppointment[];
  freeWindows:   FreeWindow[];
};

const DAY_START_HOUR = 8;   // 08:00
const DAY_END_HOUR   = 18;  // 18:00
const MIN_WINDOW_MIN = 30;  // finestra minima utile

export async function detectIntent(
  pool: DbPool,
  userId: string,
  date: string,   // YYYY-MM-DD
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
        startAt: cursor.toISOString(),
        endAt:   apptStart.toISOString(),
        durationMin: Math.round(gapMin),
      });
    }
    cursor = apptEnd > cursor ? apptEnd : cursor;
  }

  // Finestra dopo l'ultimo appuntamento
  const afterMin = (dayEnd.getTime() - cursor.getTime()) / 60000;
  if (afterMin >= MIN_WINDOW_MIN) {
    freeWindows.push({
      startAt: cursor.toISOString(),
      endAt:   dayEnd.toISOString(),
      durationMin: Math.round(afterMin),
    });
  }

  return { intent: 'appointment_anchored', appointments, freeWindows };
}

// Genera giro Intent A: inserisce appuntamenti come tappe locked + riempie le finestre libere
export async function generateIntentA(
  pool:         DbPool,
  userId:       string,
  sessionId:    VisitPlanningSessionId,
  mode:         VisitMode,
  detection:    IntentDetectionResult,
  startLat:     number | null,
  startLng:     number | null,
): Promise<VisitPlanningStop[]> {
  const allStops: VisitPlanningStop[] = [];
  let seq = 1;

  // 1. Inserisci appuntamenti come tappe locked confirmed
  for (const appt of detection.appointments) {
    try {
      const stop = await createStop(pool, sessionId, userId, {
        sourceType:   'archibald',
        sourceId:     appt.customerErpId ?? appt.appointmentId,
        displayName:  appt.title,
        stopDate:     appt.startAt.slice(0, 10),
        status:       'confirmed',
        visitMinutes: Math.round((new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime()) / 60000),
        sequence:     seq++,
        locked:       true,
        recommendationReasons: ['📅 Appuntamento confermato'],
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
    const windowMin = window.durationMin;
    const slotsAvailable = Math.max(1, Math.floor((windowMin - 15) / 45)); // ~45 min per slot incl. viaggio

    // Identifica zona dagli appuntamenti adiacenti (prima e dopo la finestra)
    const windowStart = new Date(window.startAt);
    const prevAppt    = detection.appointments.find(a => new Date(a.endAt) <= windowStart);
    const nextAppt    = detection.appointments.find(a => new Date(a.startAt) >= new Date(window.endAt));

    // Determina zona dagli appuntamenti (lookup città del cliente)
    let zoneFilter: Array<{ zona: string; prov: string }> | undefined;
    for (const appt of [prevAppt, nextAppt].filter(Boolean)) {
      if (!appt?.customerErpId) continue;
      const { rows: czRows } = await pool.query(
        `SELECT czm.zona, czm.prov FROM agents.customers c
         JOIN system.city_zone_map czm ON czm.city_normalized = UPPER(TRIM(c.city))
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
      } catch { /* default TW */ }
    }

    const vrpStops = windowCandidates.map(c => toVrpStop(c.profile, c.score, prefs.get(c.profile.sourceId) ?? null));
    const depot    = { lat: startLat, lng: startLng };
    const startMin = (new Date(window.startAt).getHours() * 60) + new Date(window.startAt).getMinutes();
    const route    = twoOptLocalSearch(solomonI1Insertion(vrpStops, depot, startMin), depot, startMin);
    const finalStops = route.stops.slice(0, slotsAvailable);

    const candidateMap = new Map(candidates.map(d => [d.profile.sourceId, d]));
    let prevLat = startLat; let prevLng = startLng;

    for (let i = 0; i < finalStops.length; i++) {
      const vs   = finalStops[i];
      const data = candidateMap.get(vs.sourceId);
      if (!data) continue;

      const reasons = [`Finestra ${window.startAt.slice(11, 16)}–${window.endAt.slice(11, 16)}`];
      if (data.daysSinceLastOrder != null) reasons.push(`${data.daysSinceLastOrder}gg senza ordini`);

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
      prevLat = vs.lat; prevLng = vs.lng;
    }
  }

  await updateSession(pool, userId, sessionId, { status: 'planned', generatedAt: new Date().toISOString() });
  return allStops;
}
```

- [ ] **Step 2.2: Scrivi i test per detectIntent**

Crea `archibald-web-app/backend/src/services/visit-generate-intent.spec.ts`:

```typescript
import { describe, test, expect, vi } from 'vitest';
import { detectIntent } from './visit-generate-intent';

describe('detectIntent', () => {
  test('restituisce zone_based se nessun appuntamento', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
    const result = await detectIntent(pool, 'user-1', '2026-06-09');
    expect(result.intent).toBe('zone_based');
    expect(result.appointments).toHaveLength(0);
    expect(result.freeWindows).toHaveLength(0);
  });

  test('restituisce appointment_anchored con finestre calcolate', async () => {
    const appt = {
      id: 'appt-1', title: 'Dr. Rossi', customer_erp_id: '55.374',
      start_at: new Date('2026-06-09T08:00:00+02:00'),
      end_at:   new Date('2026-06-09T09:00:00+02:00'),
      location: 'Salerno',
    };
    const pool = { query: vi.fn().mockResolvedValue({ rows: [appt] }) } as any;
    const result = await detectIntent(pool, 'user-1', '2026-06-09');
    expect(result.intent).toBe('appointment_anchored');
    expect(result.appointments).toHaveLength(1);
    // Finestra dopo l'appuntamento: 09:00 → 18:00 = 540 min
    expect(result.freeWindows.length).toBeGreaterThan(0);
    expect(result.freeWindows[result.freeWindows.length - 1].durationMin).toBeGreaterThan(480);
  });
});
```

- [ ] **Step 2.3: Verifica test passano + build**

```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend
npx vitest run src/services/visit-generate-intent.spec.ts 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

- [ ] **Step 2.4: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/services/visit-generate-intent.ts \
        archibald-web-app/backend/src/services/visit-generate-intent.spec.ts
git commit -m "feat(giri-visite): detectIntent + generateIntentA — appuntamenti ancorati con finestre libere"
```

---

## Task 3 — Router: /generate con intent detection + /regenerate zone-aware

**Files:**
- Modify: `archibald-web-app/backend/src/routes/visit-planning-router.ts`

- [ ] **Step 3.1: Aggiungi import detectIntent e generateIntentA**

```typescript
import { detectIntent, generateIntentA } from '../services/visit-generate-intent';
import type { BuildCandidatesOptions } from '../services/visit-generate-service';
```

- [ ] **Step 3.2: Aggiorna endpoint POST /sessions/:sessionId/generate**

Trova l'handler `/generate` e aggiungi la logica di intent detection. Dopo aver risolto `startLat/startLng` e prima di chiamare `generateVisitRoute/generateWeeklyDistribution`:

```typescript
      // Leggi zoneFilter dal body (se presente — da Intent B zone-aware)
      const zoneFilter: BuildCandidatesOptions['zoneFilter'] = parsed.data.zones?.length
        ? parsed.data.zones.map((z: string) => {
            const parts = z.split('_');
            return { zona: parts.slice(0, -1).join('_'), prov: parts[parts.length - 1] };
          })
        : undefined;

      // Intent detection (solo per sessioni giornaliere)
      let detection = null;
      if (session.horizon === 'day') {
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
```

Aggiorna anche `generateVisitRoute` per accettare options (simile a `buildCandidates`):

In `visit-generate-service.ts`, aggiungi il quarto parametro opzionale a `generateVisitRoute`:
```typescript
export async function generateVisitRoute(
  pool: DbPool, userId: string, sessionId: VisitPlanningSessionId,
  mode: VisitMode, horizon: VisitHorizon,
  startLat: number | null, startLng: number | null, stopDate: string,
  options?: BuildCandidatesOptions,
): Promise<VisitPlanningStop[]> {
  const candidates = await buildCandidates(pool, userId, mode, options);
  // ... resto invariato
```

Aggiorna anche `GenerateSchema` nel router per accettare `zones` opzionale:
```typescript
  const GenerateSchema = z.object({
    stopDate: z.string().date().optional(),
    zones:    z.array(z.string()).optional(),
  });
```

- [ ] **Step 3.3: Aggiorna endpoint POST /sessions/:sessionId/regenerate (zone-aware)**

Trova l'handler `/regenerate` e aggiungi il lookup zone prima della generazione:

```typescript
      // Identifica zone dalle tappe bloccate per zoneFilter zone-aware
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

      const opts: BuildCandidatesOptions = { zoneFilter: zoneFilterRegen };

      const newStops = session.horizon === 'week'
        ? await generateWeeklyDistribution(pool, userId, sid, session.mode, stopDate, startLat, startLng, opts)
        : await generateVisitRoute(pool, userId, sid, session.mode, session.horizon, startLat, startLng, stopDate, opts);
```

- [ ] **Step 3.4: Build + test**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | grep -E "Tests|passed|failed" | tail -2
```

- [ ] **Step 3.5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/routes/visit-planning-router.ts \
        archibald-web-app/backend/src/services/visit-generate-service.ts
git commit -m "feat(giri-visite): /generate con intent detection + zoneFilter; /regenerate zone-aware da tappe bloccate"
```

---

## Task 4 — IntentDetectionModal (frontend)

**Files:**
- Create: `archibald-web-app/frontend/src/components/visit-planning/IntentDetectionModal.tsx`
- Modify: `archibald-web-app/frontend/src/services/visit-planning.service.ts`

- [ ] **Step 4.1: Aggiungi checkIntentForDate al service**

In `visit-planning.service.ts`:

```typescript
export type IntentDetection = {
  intent:       'appointment_anchored' | 'zone_based';
  appointments: Array<{
    appointmentId: string; title: string; customerErpId: string | null;
    startAt: string; endAt: string; location: string | null;
  }>;
  freeWindows: Array<{ startAt: string; endAt: string; durationMin: number }>;
};

export async function checkIntentForDate(
  sessionId: string,
  date: string,
): Promise<IntentDetection> {
  const res = await fetchWithRetry(
    `${BASE}/sessions/${sessionId}/detect-intent?date=${date}`,
  );
  if (!res.ok) return { intent: 'zone_based', appointments: [], freeWindows: [] };
  return res.json();
}
```

- [ ] **Step 4.2: Aggiungi endpoint GET /sessions/:id/detect-intent nel router**

```typescript
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
```

- [ ] **Step 4.3: Crea IntentDetectionModal.tsx**

```tsx
// archibald-web-app/frontend/src/components/visit-planning/IntentDetectionModal.tsx
import type { IntentDetection } from '../../services/visit-planning.service';

type Props = {
  date:      string;
  detection: IntentDetection;
  onConfirm: () => void;
  onIgnore:  () => void;
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
}

export function IntentDetectionModal({ date, detection, onConfirm, onIgnore }: Props) {
  const d = new Date(date + 'T00:00:00');
  const dateLabel = d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit' });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onIgnore}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'white', borderRadius: '16px 16px 0 0',
        padding: 20, width: '100%', maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
          <span style={{ fontSize: 28 }}>📅</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
              Appuntamenti trovati per {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              Il sistema ha rilevato {detection.appointments.length} {detection.appointments.length === 1 ? 'appuntamento confermato' : 'appuntamenti confermati'} in agenda
            </div>
          </div>
        </div>

        <div style={{ fontSize: 14, color: '#374151', marginBottom: 16, lineHeight: 1.5 }}>
          Costruisco il giro <strong>attorno a questi appuntamenti fissi</strong>, riempiendo le finestre libere con clienti vicini.
        </div>

        {detection.appointments.map(appt => (
          <div key={appt.appointmentId} style={{
            background: 'white', border: '1px solid #e5e7eb',
            borderLeft: '4px solid #2563eb', borderRadius: 10,
            padding: 12, marginBottom: 10, display: 'flex', gap: 12,
          }}>
            <div style={{
              background: '#eff6ff', borderRadius: 8, padding: '8px 12px',
              textAlign: 'center', minWidth: 56, flexShrink: 0,
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb', lineHeight: 1 }}>
                {fmtTime(appt.startAt).slice(0, 2)}
              </div>
              <div style={{ fontSize: 11, color: '#2563eb' }}>
                :{fmtTime(appt.startAt).slice(3, 5)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{appt.title}</div>
              {appt.location && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>📍 {appt.location}</div>}
              <div style={{ fontSize: 11, color: '#374151', marginTop: 4, background: '#f1f5f9', display: 'inline-block', padding: '2px 7px', borderRadius: 6 }}>
                ⏱ {Math.round((new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime()) / 60000)} min
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: 4, marginLeft: 6 }}>
                🔒 Fisso — non spostabile
              </span>
            </div>
          </div>
        ))}

        {detection.freeWindows.map((w, i) => (
          <div key={i} style={{
            background: '#f0fdf4', border: '1px dashed #86efac',
            borderRadius: 8, padding: '8px 12px', marginBottom: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 2 }}>
              ✅ Finestra libera: {fmtTime(w.startAt)} → {fmtTime(w.endAt)}
            </div>
            <div style={{ fontSize: 12, color: '#374151' }}>
              Circa {w.durationMin} min disponibili → posso inserire {Math.max(1, Math.floor((w.durationMin - 15) / 45))} clienti vicini
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={onConfirm}
            style={{ flex: 2, background: '#2563eb', color: 'white', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >▶ Genera giro con questi appuntamenti</button>
          <button
            onClick={onIgnore}
            style={{ flex: 1, background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, padding: 12, fontSize: 13, cursor: 'pointer' }}
          >Ignora</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.4: Integra IntentDetectionModal in VisitPlanningSessionPage**

In `VisitPlanningSessionPage.tsx`, aggiungi stato e logica nel handler `handleGenerate`:

```typescript
  const [intentDetection, setIntentDetection] = useState<import('../services/visit-planning.service').IntentDetection | null>(null);
  const [pendingGenerateDate, setPendingGenerateDate] = useState<string | null>(null);
```

Nel handler che chiama il generate (dentro `VisitGenerateButton` o nel page), prima di fare POST `/generate`, chiama `checkIntentForDate` e mostra il modal se intent = `appointment_anchored`.

Nota: `VisitGenerateButton` è un componente separato. Leggi il file per capire come intercettare il generate e mostrare il modal.

- [ ] **Step 4.5: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

- [ ] **Step 4.6: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/routes/visit-planning-router.ts \
        archibald-web-app/frontend/src/services/visit-planning.service.ts \
        archibald-web-app/frontend/src/components/visit-planning/IntentDetectionModal.tsx \
        archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx
git commit -m "feat(giri-visite): IntentDetectionModal — rileva appuntamenti prima di generare, mostra finestre libere"
```

---

## Task 5 — VisitMap: polyline SVG + stats bar ≥km

**Files:**
- Modify: `archibald-web-app/frontend/src/components/visit-planning/VisitMap.tsx`
- Modify: `archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx`

- [ ] **Step 5.1: Aggiorna VisitMap per polyline SVG e stats**

Leggi il file corrente. Le modifiche principali:

**A) Aggiungi calcolo distanza totale nell'effetto init:**

```typescript
  // Dopo aver costruito i points[], calcola distanza totale ≥km
  let totalKmGeocoded = 0;
  let geocodedCount   = 0;
  let totalStops      = visibleStops.length;

  for (let i = 0; i < points.length - 1; i++) {
    // Entrambi i punti geocodificati: aggiungi la distanza
    totalKmGeocoded += haversine(points[i][0], points[i][1], points[i+1][0], points[i+1][1]) * 1.25;
    geocodedCount++;
  }
  geocodedCount = points.length; // punti con coordinate reali
```

Funzione haversine locale:

```typescript
function haversineLocal(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

**B) Esponi i dati stats al componente padre via callback:**

Aggiungi prop `onStatsUpdate` opzionale:

```typescript
type Props = {
  stops:           VisitPlanningStop[];
  height?:         number | string;
  onStopClick?:    (stop: VisitPlanningStop) => void;
  onStatsUpdate?:  (stats: { totalKm: number; geocodedCount: number; totalStops: number }) => void;
};
```

Chiama `onStatsUpdate({ totalKm: totalKmGeocoded, geocodedCount, totalStops })` alla fine di `init()`.

**C) Polyline con due stili (completato/futuro):**

Sostituisci l'unico `L.polyline` con due polilinge:

```typescript
      // Separa punti completati da punti futuri
      const visitedIdxs = new Set(
        visibleStops
          .map((s, i) => s.status === 'visited' ? i : -1)
          .filter(i => i >= 0)
      );

      // Ultimo visitato
      const lastVisitedIdx = Math.max(-1, ...Array.from(visitedIdxs));

      if (points.length > 1 && lastVisitedIdx >= 1) {
        L.polyline(points.slice(0, lastVisitedIdx + 1), {
          color: '#16a34a', weight: 2.5, opacity: 0.9,
        }).addTo(map);
      }
      if (points.length > 1 && lastVisitedIdx < points.length - 1) {
        L.polyline(points.slice(Math.max(0, lastVisitedIdx), points.length), {
          color: '#2563eb', weight: 2, opacity: 0.7, dashArray: '5,8',
        }).addTo(map);
      }
```

**D) Legenda in basso a sinistra:**

```typescript
      const legend = L.control({ position: 'bottomleft' });
      legend.onAdd = () => {
        const div = L.DomUtil.create('div');
        div.style.cssText = 'background:rgba(255,255,255,0.92);border-radius:8px;padding:8px 10px;font-size:10px;color:#374151;line-height:1.6';
        div.innerHTML = `
          <div><span style="color:#16a34a">●</span> Visitato  <span style="color:#2563eb">●</span> Confermato  <span style="color:#f59e0b">●</span> Da chiamare  <span style="color:#9ca3af">●</span> Suggerito</div>
          <div style="color:#6b7280">— percorso completato &nbsp;╌ prossime tappe</div>
        `;
        return div;
      };
      legend.addTo(map);
```

- [ ] **Step 5.2: Aggiungi barra stats nella SessionPage**

In `VisitPlanningSessionPage.tsx`, aggiungi stato per le stats mappa:

```typescript
  const [mapStats, setMapStats] = useState<{ totalKm: number; geocodedCount: number; totalStops: number } | null>(null);
```

Crea la barra stats da mostrare sopra la `VisitMap`:

```tsx
          {mapStats && (
            <div style={{
              background: '#1e293b', color: 'white', padding: '10px 16px',
              display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {mapStats.geocodedCount < mapStats.totalStops ? '≥' : ''}
                  {(mapStats.totalKm).toLocaleString('it-IT', { maximumFractionDigits: 1 })} km
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>
                  percorso totale
                  {mapStats.geocodedCount < mapStats.totalStops
                    ? ` (${mapStats.geocodedCount}/${mapStats.totalStops} tappe localizzate)`
                    : ''}
                </div>
              </div>
              {/* Divisore */}
              <div style={{ width: 1, height: 28, background: '#334155' }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {Math.round(visibleStops.filter(s => s.travelMinutesFromPrevious).reduce((s, stop) => s + (stop.travelMinutesFromPrevious ?? 0), 0) / 60 * 10) / 10}h
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>di guida stimata</div>
              </div>
              {/* Divisore */}
              <div style={{ width: 1, height: 28, background: '#334155' }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                  {visibleStops.filter(s => s.status === 'visited').length} ✅
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>visite completate</div>
              </div>
            </div>
          )}
          <VisitMap
            stops={visibleStops}
            height={...}
            onStopClick={handleOpenBrief}
            onStatsUpdate={setMapStats}
          />
```

- [ ] **Step 5.3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

- [ ] **Step 5.4: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/components/visit-planning/VisitMap.tsx \
        archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx
git commit -m "feat(giri-visite): VisitMap polyline verde/blu + legenda + stats ≥km; SessionPage barra stats"
```

---

## Task 6 — Session Page: contatori stato + navigazione completa

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx`

- [ ] **Step 6.1: Aggiungi contatori stato nell'header**

Trova il div header della sessione (dove c'è il titolo e il sottotitolo). Aggiungi sotto il sottotitolo:

```tsx
        {/* Contatori stato — spec vincolante */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
          {[
            { status: 'visited',   label: 'visitati',      bg: '#dcfce7', color: '#166534',  icon: '✅' },
            { status: 'confirmed', label: 'confermati',    bg: '#dbeafe', color: '#1e40af',  icon: '📅' },
            { status: 'to_call',   label: 'da chiamare',   bg: '#fef3c7', color: '#92400e',  icon: '📞' },
            { status: 'suggested', label: 'suggeriti',     bg: '#f1f5f9', color: '#475569',  icon: '⚪' },
          ].map(({ status, label, bg, color, icon }) => {
            const n = visibleStops.filter(s => s.status === status).length;
            if (n === 0) return null;
            return (
              <span key={status} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: bg, color }}>
                {icon} {n} {label}
              </span>
            );
          })}
        </div>
```

- [ ] **Step 6.2: Aggiungi pulsante "Avvia navigazione" nell'header**

Accanto al pulsante 🔄 Rigenera già esistente, aggiungi:

```tsx
        <button
          onClick={handleAvviaNavi}
          title="Avvia navigazione completa in Google Maps"
          style={{
            background: '#16a34a', color: 'white', border: 'none',
            borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >▶ Avvia navigazione</button>
```

- [ ] **Step 6.3: Implementa handleAvviaNavi**

```typescript
  const handleAvviaNavi = () => {
    if (!session) return;
    const stopsOrdered = visibleStops
      .filter(s => s.status !== 'removed' && s.status !== 'skipped')
      .sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999));

    if (stopsOrdered.length === 0) return;

    // Costruisce URL Google Maps: home → stop1 → … → stop8 → stopN (se >9, prime 8 + ultima)
    const MAX_WAYPOINTS = 9;
    const finalStops = stopsOrdered.length > MAX_WAYPOINTS
      ? [...stopsOrdered.slice(0, MAX_WAYPOINTS - 1), stopsOrdered[stopsOrdered.length - 1]]
      : stopsOrdered;

    const homeCoord = session.startLat && session.startLng
      ? `${session.startLat},${session.startLng}`
      : null;

    const waypoints = finalStops.map(s =>
      (s.lat != null && s.lng != null) ? `${s.lat},${s.lng}` : encodeURIComponent(s.displayName)
    );

    const parts = homeCoord ? [homeCoord, ...waypoints] : waypoints;
    const url   = `https://www.google.com/maps/dir/${parts.join('/')}`;
    window.open(url, '_blank');
  };
```

- [ ] **Step 6.4: Aggiungi pulsante "Apri in Google Maps" sotto la mappa**

Nel layout dove appare la VisitMap, aggiungi dopo la mappa:

```tsx
          <div style={{ background: 'white', borderTop: '1px solid #e5e7eb', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              <strong style={{ color: '#374151' }}>Apri in Google Maps</strong><br />
              Tutte le tappe in sequenza{visibleStops.length > 9 ? ` (fermate 1–8 + destinazione finale)` : ''}
            </div>
            <button
              onClick={handleAvviaNavi}
              style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >🗺️ Apri in Google Maps</button>
          </div>
```

- [ ] **Step 6.5: Type-check + test completi**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | grep -E "Tests|passed|failed" | tail -2
npm test --prefix archibald-web-app/frontend 2>&1 | grep -E "Tests|passed|failed" | tail -2
```

- [ ] **Step 6.6: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx
git commit -m "feat(giri-visite): SessionPage — contatori stato, pulsante Avvia navigazione, Apri in Google Maps con overflow rule"
```

---

## Task 7 — Push finale + verifica

- [ ] **Step 7.1: Test suite completa**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | grep -E "Tests|passed|failed" | tail -2
npm test --prefix archibald-web-app/frontend 2>&1 | grep -E "Tests|passed|failed" | tail -2
```

- [ ] **Step 7.2: Push**

```bash
git push origin master
```

---

## Checklist Piano 1l completato

- [ ] `buildCandidates` accetta `zoneFilter` e `excludeSourceIds`
- [ ] `detectIntent()` rileva appuntamenti da `agents.appointments`
- [ ] `generateIntentA()` inserisce appuntamenti locked + riempie finestre libere
- [ ] Endpoint `/detect-intent` funzionante
- [ ] `IntentDetectionModal` mostra appuntamenti + finestre + CTA
- [ ] `/generate` usa intent detection per sessioni giornaliere
- [ ] `/regenerate` usa zone delle tappe bloccate per zoneFilter
- [ ] VisitMap: polyline verde (completato) + blu tratteggiato (futuro) + legenda
- [ ] VisitMap: chiama `onStatsUpdate` con totalKm, geocodedCount, totalStops
- [ ] Stats bar: `≥{km}` quando geocodedCount < totalStops
- [ ] SessionPage: contatori stato colore-coded nell'header
- [ ] SessionPage: pulsante "▶ Avvia navigazione" verde nell'header
- [ ] SessionPage: pulsante "🗺️ Apri in Google Maps" sotto la mappa
- [ ] Google Maps overflow: >9 tappe → prime 8 + ultima
- [ ] Build + test passano
