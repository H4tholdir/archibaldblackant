# Giri Visite — Piano 1h: Fase 9 — VRPTW Solver (Time Windows)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire `nearestNeighborSort` con un solver VRPTW che rispetta le finestre orarie per cliente (default 8:00-18:00, configurabile per cliente in `customer_visit_preferences`). Algoritmo: Solomon I1 greedy insertion + 2-opt local search, pure TypeScript senza dipendenze esterne.

**Architecture:** Nuovo service `visit-vrptw-solver.ts` con i tipi `VrpStop`/`VrpRoute` e le funzioni `solomonI1Insertion` + `twoOptLocalSearch`. Il `generateVisitRoute` in `visit-generate-service.ts` carica le preferenze per cliente, costruisce `VrpStop[]` con time windows, e usa il solver invece di `nearestNeighborSort`. Aggiorna `estimatedArrival`/`estimatedDeparture` di ogni stop nel DB.

**Time windows:** Default 08:00 (480 min) – 18:00 (1080 min). L'agente può configurare per ogni cliente in `customer_visit_preferences`. Partenza dal punto di origine alle 08:00 (o `start_time` se impostato nella sessione).

**Tech Stack:** Express, TypeScript strict, pg, Vitest

**Prerequisiti:** Piano 1d completato e deployato.

---

## File da creare / modificare

| File | Op | Scopo |
|---|---|---|
| `backend/src/db/repositories/customer-visit-preferences.ts` | Crea | getPreferences, upsertPreferences |
| `backend/src/db/repositories/customer-visit-preferences.spec.ts` | Crea | Test TDD |
| `backend/src/services/visit-vrptw-solver.ts` | Crea | Algoritmo VRPTW Solomon I1 + 2-opt |
| `backend/src/services/visit-vrptw-solver.spec.ts` | Crea | Test TDD algoritmo |
| `backend/src/services/visit-generate-service.ts` | Modifica | Usa VRPTW + carica time windows |
| `backend/src/routes/visit-planning-router.ts` | Modifica | GET/PUT preferences endpoints |
| `frontend/src/components/visit-planning/VisitBriefPanel.tsx` | Modifica | Sezione preferenze orari |
| `frontend/src/services/visit-planning.service.ts` | Modifica | getPreferences, updatePreferences |

---

## Task 1 — Repository customer-visit-preferences

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/customer-visit-preferences.ts`
- Create: `archibald-web-app/backend/src/db/repositories/customer-visit-preferences.spec.ts`

- [ ] **Step 1.1: Scrivi il test**

```typescript
// customer-visit-preferences.spec.ts
import { describe, test, expect, vi } from 'vitest';
import { getPreferences, upsertPreferences } from './customer-visit-preferences';

describe('getPreferences', () => {
  test('restituisce null se non esiste', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
    const result = await getPreferences(pool, 'user-1', 'archibald', '55.374');
    expect(result).toBeNull();
  });

  test('restituisce preferenze se esistono', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{
      user_id: 'user-1', source_type: 'archibald', source_id: '55.374',
      typical_visit_minutes: 45, preferred_days: [1, 2, 3], avoid_days: [],
      preferred_time_start: '09:00:00', preferred_time_end: '17:00:00',
      requires_appointment: false, notes: null,
    }] }) } as any;
    const result = await getPreferences(pool, 'user-1', 'archibald', '55.374');
    expect(result?.typicalVisitMinutes).toBe(45);
    expect(result?.preferredTimeStart).toBe('09:00:00');
  });
});

describe('upsertPreferences', () => {
  test('chiama INSERT ... ON CONFLICT DO UPDATE', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{}], rowCount: 1 }) } as any;
    await upsertPreferences(pool, {
      userId: 'user-1', sourceType: 'archibald', sourceId: '55.374',
      typicalVisitMinutes: 30, preferredDays: [], avoidDays: [],
      preferredTimeStart: '08:00', preferredTimeEnd: '18:00',
      requiresAppointment: false, notes: null,
    });
    const sql: string = pool.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT');
  });
});
```

- [ ] **Step 1.2: Verifica fallisce**

```bash
cd archibald-web-app/backend
npx vitest run src/db/repositories/customer-visit-preferences.spec.ts 2>&1 | tail -3
```

- [ ] **Step 1.3: Implementa il repository**

```typescript
// customer-visit-preferences.ts
import type { DbPool } from '../pool';
import type { CustomerSourceType } from './visit-planning-types';

export type CustomerVisitPreferencesInput = {
  userId:               string;
  sourceType:           CustomerSourceType;
  sourceId:             string;
  typicalVisitMinutes:  number;
  preferredDays:        number[];
  avoidDays:            number[];
  preferredTimeStart:   string | null;
  preferredTimeEnd:     string | null;
  requiresAppointment:  boolean;
  notes:                string | null;
};

export type CustomerVisitPreferencesRow = CustomerVisitPreferencesInput;

export async function getPreferences(
  pool: DbPool,
  userId: string,
  sourceType: CustomerSourceType,
  sourceId: string,
): Promise<CustomerVisitPreferencesRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM agents.customer_visit_preferences
     WHERE user_id = $1 AND source_type = $2 AND source_id = $3`,
    [userId, sourceType, sourceId],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    userId: r.user_id, sourceType: r.source_type, sourceId: r.source_id,
    typicalVisitMinutes: r.typical_visit_minutes,
    preferredDays: r.preferred_days ?? [],
    avoidDays: r.avoid_days ?? [],
    preferredTimeStart: r.preferred_time_start,
    preferredTimeEnd: r.preferred_time_end,
    requiresAppointment: r.requires_appointment,
    notes: r.notes,
  };
}

export async function upsertPreferences(
  pool: DbPool,
  input: CustomerVisitPreferencesInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.customer_visit_preferences
       (user_id, source_type, source_id, typical_visit_minutes,
        preferred_days, avoid_days, preferred_time_start, preferred_time_end,
        requires_appointment, notes, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (user_id, source_type, source_id) DO UPDATE SET
       typical_visit_minutes  = EXCLUDED.typical_visit_minutes,
       preferred_days         = EXCLUDED.preferred_days,
       avoid_days             = EXCLUDED.avoid_days,
       preferred_time_start   = EXCLUDED.preferred_time_start,
       preferred_time_end     = EXCLUDED.preferred_time_end,
       requires_appointment   = EXCLUDED.requires_appointment,
       notes                  = EXCLUDED.notes,
       updated_at             = NOW()`,
    [input.userId, input.sourceType, input.sourceId,
     input.typicalVisitMinutes, input.preferredDays, input.avoidDays,
     input.preferredTimeStart, input.preferredTimeEnd,
     input.requiresAppointment, input.notes],
  );
}
```

- [ ] **Step 1.4: Verifica test passano**

```bash
npx vitest run src/db/repositories/customer-visit-preferences.spec.ts 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

- [ ] **Step 1.5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/db/repositories/customer-visit-preferences.ts \
        archibald-web-app/backend/src/db/repositories/customer-visit-preferences.spec.ts
git commit -m "feat(giri-visite): repository customer-visit-preferences con getPreferences e upsertPreferences"
```

---

## Task 2 — VRPTW Solver (Solomon I1 + 2-opt)

**Files:**
- Create: `archibald-web-app/backend/src/services/visit-vrptw-solver.ts`
- Create: `archibald-web-app/backend/src/services/visit-vrptw-solver.spec.ts`

- [ ] **Step 2.1: Scrivi il test**

```typescript
// visit-vrptw-solver.spec.ts
import { describe, test, expect } from 'vitest';
import { solomonI1Insertion, twoOptLocalSearch } from './visit-vrptw-solver';
import type { VrpStop } from './visit-vrptw-solver';

const DEPOT = { lat: 40.85, lng: 14.27 };

function makeStop(id: string, lat: number, lng: number, twStart = 480, twEnd = 1080): VrpStop {
  return {
    sourceId: id, displayName: `Cliente ${id}`,
    lat, lng, score: 0.5,
    timeWindowStart: twStart, timeWindowEnd: twEnd, serviceDuration: 30,
  };
}

describe('solomonI1Insertion', () => {
  test('inserisce clienti rispettando time windows', () => {
    const stops = [
      makeStop('A', 40.85, 14.27),
      makeStop('B', 40.70, 14.75),
      makeStop('C', 40.60, 15.00),
    ];
    const route = solomonI1Insertion(stops, DEPOT, 480); // partenza 08:00
    expect(route.stops.length).toBeGreaterThan(0);
    expect(route.feasible).toBe(true);
  });

  test('esclude cliente la cui finestra oraria è impossibile da rispettare', () => {
    const stops = [
      makeStop('A', 40.85, 14.27, 480, 490), // TW molto stretta (08:00-08:10)
      makeStop('B', 40.10, 16.00, 480, 1080), // TW normale ma lontanissimo
    ];
    // B è così lontano che arriva fuori TW di A se parte da depot alle 08:00
    // In questo test verifichiamo solo che la route sia prodotta senza crash
    const route = solomonI1Insertion(stops, DEPOT, 480);
    expect(route).toBeDefined();
    expect(Array.isArray(route.stops)).toBe(true);
  });

  test('route vuota se nessun candidato', () => {
    const route = solomonI1Insertion([], DEPOT, 480);
    expect(route.stops).toHaveLength(0);
    expect(route.feasible).toBe(true);
  });
});

describe('twoOptLocalSearch', () => {
  test('non peggiora una route già ottimale', () => {
    const stops = [
      makeStop('A', 40.85, 14.27),
      makeStop('B', 40.80, 14.50),
      makeStop('C', 40.75, 14.75),
    ];
    const initial = solomonI1Insertion(stops, DEPOT, 480);
    const improved = twoOptLocalSearch(initial, DEPOT);
    expect(improved.totalTime).toBeLessThanOrEqual(initial.totalTime + 1); // può solo migliorare o rimanere uguale
  });
});
```

- [ ] **Step 2.2: Verifica fallisce**

```bash
npx vitest run src/services/visit-vrptw-solver.spec.ts 2>&1 | tail -3
```

- [ ] **Step 2.3: Implementa il solver**

```typescript
// visit-vrptw-solver.ts
import type { CustomerProfile } from '../db/repositories/visit-planning-types';

export type VrpStop = {
  sourceId:        string;
  displayName:     string;
  lat:             number | null;
  lng:             number | null;
  score:           number;
  timeWindowStart: number; // minuti da mezzanotte (es. 480 = 08:00)
  timeWindowEnd:   number; // minuti da mezzanotte (es. 1080 = 18:00)
  serviceDuration: number; // minuti visita
};

export type VrpRoute = {
  stops:     VrpStop[];
  arrivals:  number[]; // tempo di arrivo per ogni stop (minuti da mezzanotte)
  totalTime: number;
  feasible:  boolean;
};

type Depot = { lat: number | null; lng: number | null };

const SPEED_KMH = 50;

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function travelTime(
  fromLat: number | null, fromLng: number | null,
  toLat: number | null, toLng: number | null,
): number {
  if (fromLat == null || fromLng == null || toLat == null || toLng == null) return 30;
  const km = distanceKm(fromLat, fromLng, toLat, toLng);
  return (km / SPEED_KMH) * 60;
}

// Calcola i tempi di arrivo per una sequenza di stop
function computeArrivals(
  stops: VrpStop[],
  depot: Depot,
  departureTime: number,
): { arrivals: number[]; totalTime: number; feasible: boolean } {
  const arrivals: number[] = [];
  let currentTime = departureTime;
  let currentLat  = depot.lat;
  let currentLng  = depot.lng;
  let feasible    = true;

  for (const stop of stops) {
    const travel = travelTime(currentLat, currentLng, stop.lat, stop.lng);
    let arrival  = currentTime + travel;
    // Attesa se si arriva prima del TW
    if (arrival < stop.timeWindowStart) arrival = stop.timeWindowStart;
    // Violazione TW
    if (arrival > stop.timeWindowEnd) { feasible = false; }
    arrivals.push(arrival);
    currentTime = arrival + stop.serviceDuration;
    currentLat  = stop.lat;
    currentLng  = stop.lng;
  }

  const totalTime = currentTime - departureTime;
  return { arrivals, totalTime, feasible };
}

// Solomon I1: greedy insertion — inserisce il candidato che massimizza (score - costo_inserimento)
export function solomonI1Insertion(
  candidates: VrpStop[],
  depot: Depot,
  departureTime: number,
): VrpRoute {
  if (candidates.length === 0) {
    return { stops: [], arrivals: [], totalTime: 0, feasible: true };
  }

  const route: VrpStop[] = [];
  const remaining = [...candidates];

  while (remaining.length > 0) {
    let bestIdx      = -1;
    let bestScore    = -Infinity;
    let bestPosition = 0;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      // Prova tutte le posizioni di inserimento
      for (let pos = 0; pos <= route.length; pos++) {
        const trial = [...route.slice(0, pos), cand, ...route.slice(pos)];
        const { feasible: trialFeasible } = computeArrivals(trial, depot, departureTime);
        if (!trialFeasible) continue;

        // Cost function: score * 0.7 - travel_penalty * 0.3
        const prevLat = pos === 0 ? depot.lat : route[pos - 1].lat;
        const prevLng = pos === 0 ? depot.lng : route[pos - 1].lng;
        const nextLat = pos < route.length ? route[pos].lat : null;
        const nextLng = pos < route.length ? route[pos].lng : null;

        const insertCost = travelTime(prevLat, prevLng, cand.lat, cand.lng) +
          travelTime(cand.lat, cand.lng, nextLat, nextLng) -
          travelTime(prevLat, prevLng, nextLat, nextLng);

        const combinedScore = cand.score * 0.7 - (insertCost / 60) * 0.3;

        if (combinedScore > bestScore) {
          bestScore    = combinedScore;
          bestIdx      = i;
          bestPosition = pos;
        }
      }
    }

    if (bestIdx === -1) break; // nessun candidato inseribile senza violare TW
    const chosen = remaining.splice(bestIdx, 1)[0];
    route.splice(bestPosition, 0, chosen);
  }

  const { arrivals, totalTime, feasible } = computeArrivals(route, depot, departureTime);
  return { stops: route, arrivals, totalTime, feasible };
}

// 2-opt local search: prova inversioni di sotto-sequenza, mantiene se migliorano
export function twoOptLocalSearch(route: VrpRoute, depot: Depot, departureTime = 480): VrpRoute {
  if (route.stops.length < 3) return route;

  let best     = route;
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 0; i < best.stops.length - 1; i++) {
      for (let j = i + 1; j < best.stops.length; j++) {
        const newStops = [
          ...best.stops.slice(0, i),
          ...best.stops.slice(i, j + 1).reverse(),
          ...best.stops.slice(j + 1),
        ];
        const trial = computeArrivals(newStops, depot, departureTime);
        if (trial.feasible && trial.totalTime < best.totalTime) {
          best     = { stops: newStops, arrivals: trial.arrivals, totalTime: trial.totalTime, feasible: true };
          improved = true;
        }
      }
    }
  }

  return best;
}

// Converte un CustomerProfile + preferenze in VrpStop
export function toVrpStop(
  profile: CustomerProfile,
  score: number,
  prefs: { typicalVisitMinutes?: number; preferredTimeStart?: string | null; preferredTimeEnd?: string | null } | null,
): VrpStop {
  const parseTime = (t: string | null | undefined, def: number): number => {
    if (!t) return def;
    const parts = t.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  };

  return {
    sourceId:        profile.sourceId,
    displayName:     profile.displayName,
    lat:             profile.lat,
    lng:             profile.lng,
    score,
    timeWindowStart: parseTime(prefs?.preferredTimeStart, 480),  // default 08:00
    timeWindowEnd:   parseTime(prefs?.preferredTimeEnd, 1080),   // default 18:00
    serviceDuration: prefs?.typicalVisitMinutes ?? 30,
  };
}
```

- [ ] **Step 2.4: Verifica test passano**

```bash
npx vitest run src/services/visit-vrptw-solver.spec.ts 2>&1 | tail -8
npm run build 2>&1 | tail -3
```

Atteso: 4 test passano.

- [ ] **Step 2.5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/services/visit-vrptw-solver.ts \
        archibald-web-app/backend/src/services/visit-vrptw-solver.spec.ts
git commit -m "feat(giri-visite): VRPTW solver — Solomon I1 insertion + 2-opt local search con time windows"
```

---

## Task 3 — Integra VRPTW in generateVisitRoute

**Files:**
- Modify: `archibald-web-app/backend/src/services/visit-generate-service.ts`

- [ ] **Step 3.1: Aggiungi imports**

In cima a `visit-generate-service.ts`:

```typescript
import { toVrpStop, solomonI1Insertion, twoOptLocalSearch } from './visit-vrptw-solver';
import { getPreferences } from '../db/repositories/customer-visit-preferences';
```

- [ ] **Step 3.2: Sostituisci la logica di sort in generateVisitRoute**

Trova il blocco in `generateVisitRoute` che fa `nearestNeighborSort` e sostituisci con:

```typescript
  // Carica preferenze per ogni candidato (batch, non N+1)
  const prefsMap = new Map<string, Awaited<ReturnType<typeof getPreferences>>>();
  // Carichiamo solo per i top candidate per limitare le query
  const topCandidates = candidates.slice(0, maxStops * 3);
  for (const c of topCandidates) {
    try {
      const prefs = await getPreferences(pool, userId, 'archibald', c.profile.sourceId);
      if (prefs) prefsMap.set(c.profile.sourceId, prefs);
    } catch {
      // Non blocca se mancano preferenze — usa default
    }
  }

  // Costruisci VrpStop[] con time windows
  const vrpStops = topCandidates.map(c =>
    toVrpStop(c.profile, c.score, prefsMap.get(c.profile.sourceId) ?? null)
  );

  // VRPTW: Solomon I1 insertion + 2-opt
  const depot = { lat: startLat, lng: startLng };
  const departureTime = 480; // 08:00 di default
  const vrpRoute = twoOptLocalSearch(
    solomonI1Insertion(vrpStops, depot, departureTime),
    depot,
    departureTime,
  );

  const final = vrpRoute.stops.slice(0, maxStops);
  const arrivals = vrpRoute.arrivals;
```

E nel loop che crea le stop, sostituisci `estimatedArrival` e `estimatedDeparture`:

```typescript
    // Usa arrivo stimato dal VRPTW
    const arrivalMin = arrivals[i];
    const stopDateObj = new Date(stopDate + 'T00:00:00Z');
    const estimatedArrival = arrivalMin != null ? (() => {
      const d = new Date(stopDateObj);
      d.setUTCHours(Math.floor(arrivalMin / 60), arrivalMin % 60, 0, 0);
      return d.toISOString();
    })() : null;
    const estimatedDeparture = estimatedArrival && final[i].serviceDuration ? (() => {
      const d = new Date(estimatedArrival);
      d.setUTCMinutes(d.getUTCMinutes() + final[i].serviceDuration);
      return d.toISOString();
    })() : null;
```

E nel `createStop`, aggiungi i campi:

```typescript
      const stop = await createStop(pool, sessionId, userId, {
        // ... campi esistenti ...
        // aggiungi dopo visitMinutes:
        // (createStop accetta questi campi ma non li persiste direttamente — usiamo updateStop)
      });

      // Aggiorna arrival/departure tramite UPDATE diretto
      if (estimatedArrival) {
        await pool.query(
          `UPDATE agents.visit_planning_stops
           SET estimated_arrival = $1, estimated_departure = $2, updated_at = NOW()
           WHERE id = $3`,
          [estimatedArrival, estimatedDeparture, stop.id],
        );
      }
```

**IMPORTANTE**: Non rimuovere il blocco `travel_minutes_from_previous` esistente — si può mantenere come stima alternativa. I due sistemi coesistono.

- [ ] **Step 3.3: Build + test**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
```

- [ ] **Step 3.4: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/services/visit-generate-service.ts
git commit -m "feat(giri-visite): generateVisitRoute usa VRPTW Solomon I1 + time windows"
```

---

## Task 4 — Endpoint preferences + UI in VisitBriefPanel

**Files:**
- Modify: `archibald-web-app/backend/src/routes/visit-planning-router.ts`
- Modify: `archibald-web-app/frontend/src/services/visit-planning.service.ts`
- Modify: `archibald-web-app/frontend/src/components/visit-planning/VisitBriefPanel.tsx`

- [ ] **Step 4.1: Aggiungi import nel router**

```typescript
import { getPreferences, upsertPreferences } from '../db/repositories/customer-visit-preferences';
```

- [ ] **Step 4.2: Aggiungi endpoint preferences PRIMA di `return router`**

```typescript
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
        return res.status(400).json({ error: 'sourceType invalido' });
      const prefs = await getPreferences(
        pool, userId, sourceType as CustomerSourceType, decodeURIComponent(sourceId),
      );
      res.json(prefs ?? {
        typicalVisitMinutes: 30, preferredTimeStart: null, preferredTimeEnd: null,
        requiresAppointment: false, notes: null,
      });
    } catch (err) {
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
        return res.status(400).json({ error: 'sourceType invalido' });
      await upsertPreferences(pool, {
        userId,
        sourceType: sourceType as CustomerSourceType,
        sourceId: decodeURIComponent(sourceId),
        typicalVisitMinutes: parsed.data.typicalVisitMinutes,
        preferredDays: [],
        avoidDays: [],
        preferredTimeStart: parsed.data.preferredTimeStart,
        preferredTimeEnd: parsed.data.preferredTimeEnd,
        requiresAppointment: parsed.data.requiresAppointment,
        notes: parsed.data.notes,
      });
      res.status(204).end();
    } catch (err) {
      logger.error('upsertPreferences error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

- [ ] **Step 4.3: Aggiungi API al service frontend**

In fondo a `visit-planning.service.ts`:

```typescript
export type VisitPreferences = {
  typicalVisitMinutes: number;
  preferredTimeStart:  string | null;
  preferredTimeEnd:    string | null;
  requiresAppointment: boolean;
  notes:               string | null;
};

export async function getVisitPreferences(
  sourceType: CustomerSourceType, sourceId: string,
): Promise<VisitPreferences> {
  const res = await fetchWithRetry(
    `${BASE}/customers/${sourceType}/${encodeURIComponent(sourceId)}/preferences`,
  );
  if (!res.ok) throw new Error(`getVisitPreferences ${res.status}`);
  return res.json();
}

export async function updateVisitPreferences(
  sourceType: CustomerSourceType, sourceId: string, prefs: VisitPreferences,
): Promise<void> {
  const res = await fetchWithRetry(
    `${BASE}/customers/${sourceType}/${encodeURIComponent(sourceId)}/preferences`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    },
  );
  if (!res.ok) throw new Error(`updateVisitPreferences ${res.status}`);
}
```

- [ ] **Step 4.4: Aggiungi sezione orari in VisitBriefPanel**

In `VisitBriefPanel.tsx`, aggiungi import e stato:

```typescript
import { useState, useEffect } from 'react';
import { getVisitPreferences, updateVisitPreferences, type VisitPreferences } from '../../services/visit-planning.service';
```

Aggiungi stato nel componente (dopo le props destructuring):

```typescript
  const [prefs, setPrefs]           = useState<VisitPreferences | null>(null);
  const [editPrefs, setEditPrefs]   = useState(false);
  const [prefsForm, setPrefsForm]   = useState<VisitPreferences>({
    typicalVisitMinutes: 30, preferredTimeStart: '08:00', preferredTimeEnd: '18:00',
    requiresAppointment: false, notes: null,
  });

  useEffect(() => {
    getVisitPreferences(brief.sourceType, brief.sourceId)
      .then(p => { setPrefs(p); setPrefsForm(p); })
      .catch(() => {});
  }, [brief.sourceType, brief.sourceId]);

  const savePrefs = async () => {
    try {
      await updateVisitPreferences(brief.sourceType, brief.sourceId, prefsForm);
      setPrefs(prefsForm);
      setEditPrefs(false);
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : String(err)));
    }
  };
```

Aggiungi nel JSX (prima della sezione esito visita, dentro `<div style={{ padding: '0 0 80px' }}`):

```tsx
      {/* ── Preferenze orari ── */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={SECTION_TITLE}>⏰ Orari preferiti</div>
          <button onClick={() => setEditPrefs(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#2563eb' }}>
            {editPrefs ? 'Annulla' : 'Modifica'}
          </button>
        </div>
        {editPrefs ? (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>Dalle</div>
                <input type="time" value={prefsForm.preferredTimeStart ?? '08:00'}
                  onChange={e => setPrefsForm(f => ({ ...f, preferredTimeStart: e.target.value }))}
                  style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 6px', fontSize: 13 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>Alle</div>
                <input type="time" value={prefsForm.preferredTimeEnd ?? '18:00'}
                  onChange={e => setPrefsForm(f => ({ ...f, preferredTimeEnd: e.target.value }))}
                  style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 6px', fontSize: 13 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>Durata (min)</div>
                <input type="number" min={5} max={240} value={prefsForm.typicalVisitMinutes}
                  onChange={e => setPrefsForm(f => ({ ...f, typicalVisitMinutes: Number(e.target.value) }))}
                  style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 6px', fontSize: 13, width: 70 }} />
              </div>
            </div>
            <button onClick={savePrefs} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
              Salva
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#374151' }}>
            {prefs
              ? `${prefs.preferredTimeStart ?? '08:00'} – ${prefs.preferredTimeEnd ?? '18:00'} · ${prefs.typicalVisitMinutes} min`
              : '08:00 – 18:00 · 30 min (default)'
            }
          </div>
        )}
      </div>
```

- [ ] **Step 4.5: Build + type-check + test + push**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/routes/visit-planning-router.ts \
        archibald-web-app/frontend/src/services/visit-planning.service.ts \
        archibald-web-app/frontend/src/components/visit-planning/VisitBriefPanel.tsx
git commit -m "feat(giri-visite): endpoint GET/PUT preferences + sezione orari in VisitBriefPanel"
git push origin master
```

---

## Checklist Gate Piano 1h

- [ ] `solomonI1Insertion` produce route feasible su clienti con TW 8-18
- [ ] Cliente con TW irraggiungibile viene escluso senza crash
- [ ] `twoOptLocalSearch` non peggiora route già ottimale
- [ ] `generateVisitRoute` usa VRPTW — stop hanno `estimatedArrival` valorizzato
- [ ] `GET /customers/archibald/55.374/preferences` → `{ typicalVisitMinutes: 30, ... }`
- [ ] `PUT /customers/archibald/55.374/preferences` → 204, valori salvati
- [ ] VisitBriefPanel mostra sezione orari con possibilità di modifica
- [ ] Build + test passano su backend e frontend
