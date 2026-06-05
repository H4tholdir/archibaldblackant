# Giri Visite — Piano 1b: Backend Core (Fasi 1+2+3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schema DB completo, repository, servizi scoring + unified customer + planner euristico, API REST `/api/visit-planning` con autenticazione.

**Architecture:** Pattern esistente del progetto: `createXxxRouter({ pool }: Deps): Router` + repository con branded types + Vitest con mock pool. I repository accettano `DbPool` come primo parametro. I service sono funzioni pure testabili senza mock DB dove possibile. Il planner è un algoritmo deterministico con input/output tipizzati.

**Tech Stack:** Express, TypeScript strict, Zod, pg, Vitest, supertest

**Prerequisito:** Piano 1a completato (migrazione 108-pre applicata, `is_distributor` seed fatto).

**Gate finale:** `npm run build --prefix archibald-web-app/backend` e `npm test --prefix archibald-web-app/backend` passano entrambi.

---

## File da creare / modificare

| File | Operazione | Scopo |
|---|---|---|
| `backend/src/db/migrations/108-visit-planning.sql` | Crea | Schema completo: 6 nuove tabelle |
| `backend/src/db/repositories/visit-planning-sessions.ts` | Crea | CRUD sessioni giro |
| `backend/src/db/repositories/visit-planning-sessions.spec.ts` | Crea | Test repository sessioni |
| `backend/src/db/repositories/visit-planning-stops.ts` | Crea | CRUD tappe sessione |
| `backend/src/db/repositories/visit-planning-stops.spec.ts` | Crea | Test repository tappe |
| `backend/src/db/repositories/customer-geo-status.ts` | Crea | Lettura/scrittura geo qualità |
| `backend/src/db/repositories/customer-geo-status.spec.ts` | Crea | Test geo repository |
| `backend/src/db/repositories/municipal-holidays.ts` | Crea | Query feste + override |
| `backend/src/db/repositories/municipal-holidays.spec.ts` | Crea | Test holidays |
| `backend/src/services/visit-unified-customer.ts` | Crea | CustomerProfile da Archibald o Arca |
| `backend/src/services/visit-unified-customer.spec.ts` | Crea | Test unified customer |
| `backend/src/services/visit-scoring-service.ts` | Crea | Calcolo score con regole FT/KT |
| `backend/src/services/visit-scoring-service.spec.ts` | Crea | Test scoring (fixture FT/KT) |
| `backend/src/services/visit-planner.ts` | Crea | Algoritmo euristico pipeline |
| `backend/src/services/visit-planner.spec.ts` | Crea | Test planner |
| `backend/src/routes/visit-planning-router.ts` | Crea | API REST /api/visit-planning |
| `backend/src/routes/visit-planning-router.spec.ts` | Crea | Test API |
| `backend/src/server.ts` | Modifica | Registra /api/visit-planning |

---

## Task 1 — Migrazione 108: schema completo

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/108-visit-planning.sql`

- [ ] **Step 1.1: Crea la migrazione**

```sql
-- Migration 108: Modulo Giri Visite — tabelle nuove
-- Precondizione: 108-visit-planning-pre.sql già applicata
-- Tutte le tabelle sono nuove — nessuna ALTER su tabelle esistenti.

BEGIN;

-- ── Geo status clienti ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents.customer_geo_status (
  user_id     TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('archibald','arca')),
  source_id   TEXT NOT NULL,
  lat         NUMERIC(10,7),
  lng         NUMERIC(10,7),
  normalized_address TEXT,
  quality     TEXT NOT NULL DEFAULT 'unknown'
    CHECK (quality IN ('unknown','erp_unverified','geocoded','manually_confirmed','failed')),
  provider    TEXT,
  geocoded_at TIMESTAMPTZ,
  manually_confirmed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_geo_status_quality
  ON agents.customer_geo_status (user_id, quality)
  WHERE quality IN ('geocoded','manually_confirmed');

-- ── Preferenze visita per cliente ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents.customer_visit_preferences (
  user_id       TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  source_type   TEXT NOT NULL CHECK (source_type IN ('archibald','arca')),
  source_id     TEXT NOT NULL,
  typical_visit_minutes INTEGER NOT NULL DEFAULT 30,
  preferred_days   SMALLINT[] NOT NULL DEFAULT '{}',
  avoid_days       SMALLINT[] NOT NULL DEFAULT '{}',
  preferred_time_start TIME,
  preferred_time_end   TIME,
  requires_appointment BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source_type, source_id)
);

-- ── Feste patronali ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system.italian_municipal_holidays (
  id           SERIAL PRIMARY KEY,
  comune       TEXT NOT NULL,
  provincia    TEXT NOT NULL,
  regione      TEXT,
  date_month   SMALLINT NOT NULL CHECK (date_month BETWEEN 1 AND 12),
  date_day     SMALLINT NOT NULL CHECK (date_day   BETWEEN 1 AND 31),
  holiday_name TEXT NOT NULL,
  confidence   TEXT NOT NULL DEFAULT 'dataset'
    CHECK (confidence IN ('verified','dataset','manual')),
  source       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comune, provincia)
);

CREATE TABLE IF NOT EXISTS agents.municipal_holiday_overrides (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  comune       TEXT NOT NULL,
  provincia    TEXT,
  date_month   SMALLINT NOT NULL CHECK (date_month BETWEEN 1 AND 12),
  date_day     SMALLINT NOT NULL CHECK (date_day   BETWEEN 1 AND 31),
  holiday_name TEXT,
  is_closed    BOOLEAN NOT NULL DEFAULT TRUE,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, comune, COALESCE(provincia,''))
);

-- ── Sessioni giro ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents.visit_planning_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  horizon     TEXT NOT NULL CHECK (horizon IN ('day','week')),
  mode        TEXT NOT NULL CHECK (mode IN ('balanced','profitability','coverage','constrained','manual_assist')),
  status      TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','planned','in_progress','completed','cancelled')),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  start_location_label TEXT,
  start_lat   NUMERIC(10,7),
  start_lng   NUMERIC(10,7),
  end_location_label   TEXT,
  end_lat     NUMERIC(10,7),
  end_lng     NUMERIC(10,7),
  constraints_json     JSONB NOT NULL DEFAULT '{}',
  metrics_json         JSONB NOT NULL DEFAULT '{}',
  navigation_started_at TIMESTAMPTZ,
  active_stop_id       UUID,
  generated_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_visit_sessions_user_date
  ON agents.visit_planning_sessions (user_id, start_date)
  WHERE deleted_at IS NULL;

-- ── Tappe sessione ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents.visit_planning_stops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL
    REFERENCES agents.visit_planning_sessions(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('archibald','arca')),
  source_id   TEXT NOT NULL,
  display_name TEXT NOT NULL,
  appointment_id UUID REFERENCES agents.appointments(id) ON DELETE SET NULL,
  stop_date   DATE NOT NULL,
  sequence    INTEGER,
  status      TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested','to_call','confirmed','planned','backup','visited','skipped','removed')),
  locked      BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_arrival   TIMESTAMPTZ,
  estimated_departure TIMESTAMPTZ,
  visit_minutes       INTEGER NOT NULL DEFAULT 30,
  travel_minutes_from_previous INTEGER,
  distance_km_from_previous    NUMERIC(8,2),
  score_total          NUMERIC(8,3),
  score_breakdown_json JSONB NOT NULL DEFAULT '{}',
  recommendation_reasons TEXT[] NOT NULL DEFAULT '{}',
  alerts               TEXT[] NOT NULL DEFAULT '{}',
  manual_note  TEXT,
  skip_reason  TEXT,
  visited_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_stops_session
  ON agents.visit_planning_stops (session_id, stop_date, sequence);

-- Impedisce lo stesso cliente nella stessa sessione due volte
-- Esclude 'removed': un cliente rimosso può essere ri-aggiunto manualmente
CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_stops_no_duplicate
  ON agents.visit_planning_stops (session_id, source_type, source_id)
  WHERE status != 'removed';

-- ── Log visite ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents.customer_visit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('archibald','arca')),
  source_id   TEXT NOT NULL,
  session_id  UUID REFERENCES agents.visit_planning_sessions(id) ON DELETE SET NULL,
  stop_id     UUID REFERENCES agents.visit_planning_stops(id) ON DELETE SET NULL,
  visited_at  TIMESTAMPTZ NOT NULL,
  outcome     TEXT NOT NULL DEFAULT 'visited'
    CHECK (outcome IN ('visited','order_created','no_order','closed','not_available','phone_order','rescheduled')),
  order_number TEXT,
  notes        TEXT,
  next_action_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_logs_user_customer
  ON agents.customer_visit_logs (user_id, source_type, source_id, visited_at DESC);

COMMIT;
```

- [ ] **Step 1.2: Verifica syntassi locale**

```bash
# Solo syntax check — non applica ancora
cd archibald-web-app/backend
cat src/db/migrations/108-visit-planning.sql | \
  ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald"
```

Output atteso: `CREATE TABLE` × 6, `CREATE INDEX` × 5, nessun errore.

- [ ] **Step 1.3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/108-visit-planning.sql
git commit -m "feat(giri-visite): migrazione 108 schema completo (6 tabelle + indici)"
```

---

## Task 2 — Tipi TypeScript condivisi backend

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/visit-planning-types.ts`

Tutti i branded types e i tipi condivisi tra repository e service. Definiti qui una volta sola.

- [ ] **Step 2.1: Crea il file dei tipi**

```typescript
import type { DbPool } from '../pool';

// ── Branded IDs ──────────────────────────────────────────────────────────
type Brand<T, B> = T & { __brand: B };
export type VisitPlanningSessionId = Brand<string, 'VisitPlanningSessionId'>;
export type VisitPlanningStopId    = Brand<string, 'VisitPlanningStopId'>;
export type VisitLogId             = Brand<string, 'VisitLogId'>;

// ── Enums ────────────────────────────────────────────────────────────────
export type VisitHorizon  = 'day' | 'week';
export type VisitMode     = 'balanced' | 'profitability' | 'coverage' | 'constrained' | 'manual_assist';
export type VisitStatus   = 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
export type StopStatus    = 'suggested' | 'to_call' | 'confirmed' | 'planned' | 'backup' | 'visited' | 'skipped' | 'removed';
export type CustomerSourceType = 'archibald' | 'arca';
export type GeoQuality    = 'unknown' | 'erp_unverified' | 'geocoded' | 'manually_confirmed' | 'failed';
export type HolidayConfidence = 'verified' | 'dataset' | 'manual';
export type VisitOutcome  = 'visited' | 'order_created' | 'no_order' | 'closed' | 'not_available' | 'phone_order' | 'rescheduled';

// ── Domain types ─────────────────────────────────────────────────────────
export type VisitPlanningSession = {
  id:                  VisitPlanningSessionId;
  userId:              string;
  title:               string;
  horizon:             VisitHorizon;
  mode:                VisitMode;
  status:              VisitStatus;
  startDate:           string; // YYYY-MM-DD
  endDate:             string;
  startLocationLabel:  string | null;
  startLat:            number | null;
  startLng:            number | null;
  endLocationLabel:    string | null;
  endLat:              number | null;
  endLng:              number | null;
  constraintsJson:     Record<string, unknown>;
  metricsJson:         Record<string, unknown>;
  navigationStartedAt: string | null;
  activeStopId:        VisitPlanningStopId | null;
  generatedAt:         string | null;
  createdAt:           string;
  updatedAt:           string;
};

export type VisitPlanningStop = {
  id:                        VisitPlanningStopId;
  sessionId:                 VisitPlanningSessionId;
  userId:                    string;
  sourceType:                CustomerSourceType;
  sourceId:                  string;
  displayName:               string;
  appointmentId:             string | null;
  stopDate:                  string;
  sequence:                  number | null;
  status:                    StopStatus;
  locked:                    boolean;
  estimatedArrival:          string | null;
  estimatedDeparture:        string | null;
  visitMinutes:              number;
  travelMinutesFromPrevious: number | null;
  distanceKmFromPrevious:    number | null;
  scoreTotal:                number | null;
  scoreBreakdownJson:        Record<string, number>;
  recommendationReasons:     string[];
  alerts:                    string[];
  manualNote:                string | null;
  skipReason:                string | null;
  visitedAt:                 string | null;
  createdAt:                 string;
  updatedAt:                 string;
};

export type CustomerGeoStatus = {
  userId:               string;
  sourceType:           CustomerSourceType;
  sourceId:             string;
  lat:                  number | null;
  lng:                  number | null;
  normalizedAddress:    string | null;
  quality:              GeoQuality;
  provider:             string | null;
  geocodedAt:           string | null;
  manuallyConfirmedAt:  string | null;
  createdAt:            string;
  updatedAt:            string;
};

export type MunicipalHoliday = {
  id:           number;
  comune:       string;
  provincia:    string;
  regione:      string | null;
  dateMonth:    number;
  dateDay:      number;
  holidayName:  string;
  confidence:   HolidayConfidence;
  source:       string | null;
};

export type CustomerVisitPreference = {
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

// ── Score types ──────────────────────────────────────────────────────────
export type ScoreBreakdown = {
  valore:          number;
  riordino:        number;
  urgenza:         number;
  zona:            number;
  crossSell:       number;
  promozioni:      number;
  rischioClosure:  number;
  penalitaDati:    number;
  total:           number;
};

// ── Customer profile (unified view) ─────────────────────────────────────
export type CustomerProfile = {
  sourceType:   CustomerSourceType;
  sourceId:     string;
  displayName:  string;
  street:       string | null;
  postalCode:   string | null;
  city:         string | null;
  province:     string | null;
  phone:        string | null;
  email:        string | null;
  vatNumber:    string | null;
  lat:          number | null;
  lng:          number | null;
  geoQuality:   GeoQuality;
  isDistributor: boolean;
  matchedSources: Array<{ type: CustomerSourceType; id: string; name: string }>;
};

export type { DbPool };
```

- [ ] **Step 2.2: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/visit-planning-types.ts
git commit -m "feat(giri-visite): tipi TypeScript condivisi backend (branded IDs, enums, domain types)"
```

---

## Task 3 — Repository: visit-planning-sessions

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/visit-planning-sessions.ts`
- Create: `archibald-web-app/backend/src/db/repositories/visit-planning-sessions.spec.ts`

- [ ] **Step 3.1: Scrivi il test fallente**

```typescript
// visit-planning-sessions.spec.ts
import { describe, test, expect, vi } from 'vitest';
import {
  createSession,
  listSessions,
  getSession,
  updateSession,
  softDeleteSession,
} from './visit-planning-sessions';
import type { VisitPlanningSession, VisitPlanningSessionId } from './visit-planning-types';

const SESSION_ID = 'session-uuid-1' as VisitPlanningSessionId;
const USER_ID    = 'user-test-1';
const NOW        = new Date('2026-06-05T10:00:00Z');

function makeSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    title: 'Giro Napoli',
    horizon: 'day',
    mode: 'balanced',
    status: 'draft',
    start_date: '2026-06-06',
    end_date: '2026-06-06',
    start_location_label: null,
    start_lat: null,
    start_lng: null,
    end_location_label: null,
    end_lat: null,
    end_lng: null,
    constraints_json: {},
    metrics_json: {},
    navigation_started_at: null,
    active_stop_id: null,
    generated_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makePool(row = makeSessionRow()) {
  return {
    query: vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 }),
  } as any;
}

describe('createSession', () => {
  test('inserisce sessione e restituisce oggetto mappato', async () => {
    const pool = makePool();
    const result = await createSession(pool, USER_ID, {
      title: 'Giro Napoli',
      horizon: 'day',
      mode: 'balanced',
      startDate: '2026-06-06',
      endDate: '2026-06-06',
      startLocationLabel: null,
      startLat: null,
      startLng: null,
      endLocationLabel: null,
      endLat: null,
      endLng: null,
      constraintsJson: {},
    });

    expect(result).toMatchObject<Partial<VisitPlanningSession>>({
      id: SESSION_ID,
      userId: USER_ID,
      title: 'Giro Napoli',
      horizon: 'day',
      mode: 'balanced',
      status: 'draft',
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

describe('listSessions', () => {
  test('restituisce array di sessioni per utente e range date', async () => {
    const pool = makePool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [makeSessionRow(), makeSessionRow({ id: 'session-uuid-2' as VisitPlanningSessionId })],
      rowCount: 2,
    });

    const results = await listSessions(pool, USER_ID, {
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ userId: USER_ID });
  });
});

describe('getSession', () => {
  test('restituisce null se non trovata', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as any;
    const result = await getSession(pool, USER_ID, SESSION_ID);
    expect(result).toBeNull();
  });

  test('restituisce la sessione se trovata', async () => {
    const pool = makePool();
    const result = await getSession(pool, USER_ID, SESSION_ID);
    expect(result?.id).toBe(SESSION_ID);
  });
});

describe('updateSession', () => {
  test('lancia errore se nessun campo da aggiornare', async () => {
    const pool = makePool();
    await expect(updateSession(pool, USER_ID, SESSION_ID, {})).rejects.toThrow('No fields');
  });

  test('aggiorna status e restituisce sessione aggiornata', async () => {
    const pool = makePool(makeSessionRow({ status: 'planned' }));
    const result = await updateSession(pool, USER_ID, SESSION_ID, { status: 'planned' });
    expect(result.status).toBe('planned');
  });
});

describe('softDeleteSession', () => {
  test('lancia errore se sessione non trovata', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) } as any;
    await expect(softDeleteSession(pool, USER_ID, SESSION_ID)).rejects.toThrow('not found');
  });

  test('completa senza errore se trovata', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) } as any;
    await expect(softDeleteSession(pool, USER_ID, SESSION_ID)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3.2: Esegui — verifica fallisce**

```bash
cd archibald-web-app/backend
npm test -- --run src/db/repositories/visit-planning-sessions.spec.ts 2>&1 | tail -5
```

Output atteso: errore import (`Cannot find module './visit-planning-sessions'`).

- [ ] **Step 3.3: Implementa il repository**

```typescript
// visit-planning-sessions.ts
import type { DbPool } from '../pool';
import type {
  VisitPlanningSession, VisitPlanningSessionId, VisitHorizon,
  VisitMode, VisitStatus,
} from './visit-planning-types';

type SessionRow = {
  id: string; user_id: string; title: string;
  horizon: string; mode: string; status: string;
  start_date: string; end_date: string;
  start_location_label: string | null; start_lat: string | null; start_lng: string | null;
  end_location_label: string | null;   end_lat:   string | null; end_lng:   string | null;
  constraints_json: Record<string, unknown>; metrics_json: Record<string, unknown>;
  navigation_started_at: Date | null; active_stop_id: string | null;
  generated_at: Date | null; created_at: Date; updated_at: Date;
};

function toSession(r: SessionRow): VisitPlanningSession {
  return {
    id:                  r.id as VisitPlanningSessionId,
    userId:              r.user_id,
    title:               r.title,
    horizon:             r.horizon as VisitHorizon,
    mode:                r.mode as VisitMode,
    status:              r.status as VisitStatus,
    startDate:           typeof r.start_date === 'string' ? r.start_date : (r.start_date as unknown as Date).toISOString().slice(0, 10),
    endDate:             typeof r.end_date === 'string' ? r.end_date : (r.end_date as unknown as Date).toISOString().slice(0, 10),
    startLocationLabel:  r.start_location_label,
    startLat:            r.start_lat != null ? parseFloat(r.start_lat) : null,
    startLng:            r.start_lng != null ? parseFloat(r.start_lng) : null,
    endLocationLabel:    r.end_location_label,
    endLat:              r.end_lat != null ? parseFloat(r.end_lat) : null,
    endLng:              r.end_lng != null ? parseFloat(r.end_lng) : null,
    constraintsJson:     r.constraints_json ?? {},
    metricsJson:         r.metrics_json ?? {},
    navigationStartedAt: r.navigation_started_at?.toISOString() ?? null,
    activeStopId:        r.active_stop_id as VisitPlanningSessionId | null,
    generatedAt:         r.generated_at?.toISOString() ?? null,
    createdAt:           r.created_at.toISOString(),
    updatedAt:           r.updated_at.toISOString(),
  };
}

export type CreateSessionInput = {
  title: string; horizon: VisitHorizon; mode: VisitMode;
  startDate: string; endDate: string;
  startLocationLabel: string | null; startLat: number | null; startLng: number | null;
  endLocationLabel: string | null;   endLat:   number | null; endLng:   number | null;
  constraintsJson: Record<string, unknown>;
};

export async function createSession(
  pool: DbPool, userId: string, input: CreateSessionInput,
): Promise<VisitPlanningSession> {
  const { rows } = await pool.query<SessionRow>(
    `INSERT INTO agents.visit_planning_sessions
       (user_id,title,horizon,mode,start_date,end_date,
        start_location_label,start_lat,start_lng,
        end_location_label,end_lat,end_lng,constraints_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [userId, input.title, input.horizon, input.mode,
     input.startDate, input.endDate,
     input.startLocationLabel, input.startLat, input.startLng,
     input.endLocationLabel, input.endLat, input.endLng,
     JSON.stringify(input.constraintsJson)],
  );
  if (!rows[0]) throw new Error('Failed to create session');
  return toSession(rows[0]);
}

export type ListSessionsOpts = { from: string; to: string; status?: VisitStatus; horizon?: VisitHorizon };

export async function listSessions(
  pool: DbPool, userId: string, opts: ListSessionsOpts,
): Promise<VisitPlanningSession[]> {
  const params: unknown[] = [userId, opts.from, opts.to];
  const extra: string[] = [];
  if (opts.status)  { params.push(opts.status);  extra.push(`AND status = $${params.length}`); }
  if (opts.horizon) { params.push(opts.horizon); extra.push(`AND horizon = $${params.length}`); }

  const { rows } = await pool.query<SessionRow>(
    `SELECT * FROM agents.visit_planning_sessions
     WHERE user_id = $1
       AND start_date >= $2 AND start_date <= $3
       AND deleted_at IS NULL
       ${extra.join(' ')}
     ORDER BY start_date DESC`,
    params,
  );
  return rows.map(toSession);
}

export async function getSession(
  pool: DbPool, userId: string, id: VisitPlanningSessionId,
): Promise<VisitPlanningSession | null> {
  const { rows } = await pool.query<SessionRow>(
    `SELECT * FROM agents.visit_planning_sessions
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId],
  );
  return rows[0] ? toSession(rows[0]) : null;
}

export type UpdateSessionInput = Partial<{
  title: string; mode: VisitMode; status: VisitStatus;
  startLocationLabel: string | null; startLat: number | null; startLng: number | null;
  endLocationLabel: string | null;   endLat:   number | null; endLng:   number | null;
  constraintsJson: Record<string, unknown>; metricsJson: Record<string, unknown>;
  navigationStartedAt: string | null; activeStopId: string | null; generatedAt: string | null;
}>;

const SESSION_FIELD_MAP: Record<string, string> = {
  title: 'title', mode: 'mode', status: 'status',
  startLocationLabel: 'start_location_label', startLat: 'start_lat', startLng: 'start_lng',
  endLocationLabel: 'end_location_label', endLat: 'end_lat', endLng: 'end_lng',
  constraintsJson: 'constraints_json', metricsJson: 'metrics_json',
  navigationStartedAt: 'navigation_started_at', activeStopId: 'active_stop_id',
  generatedAt: 'generated_at',
};

export async function updateSession(
  pool: DbPool, userId: string, id: VisitPlanningSessionId, patch: UpdateSessionInput,
): Promise<VisitPlanningSession> {
  const sets = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let p = 1;

  for (const [key, col] of Object.entries(SESSION_FIELD_MAP)) {
    if ((patch as Record<string, unknown>)[key] !== undefined) {
      const val = (patch as Record<string, unknown>)[key];
      sets.push(`${col} = $${p++}`);
      params.push(typeof val === 'object' && val !== null && !Array.isArray(val) ? JSON.stringify(val) : val);
    }
  }

  if (sets.length === 1) throw new Error('No fields to update');
  params.push(id, userId);

  const { rows } = await pool.query<SessionRow>(
    `UPDATE agents.visit_planning_sessions
     SET ${sets.join(', ')}
     WHERE id = $${p} AND user_id = $${p + 1} AND deleted_at IS NULL
     RETURNING *`,
    params,
  );
  if (!rows[0]) throw new Error('Session not found');
  return toSession(rows[0]);
}

export async function softDeleteSession(
  pool: DbPool, userId: string, id: VisitPlanningSessionId,
): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE agents.visit_planning_sessions
     SET deleted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId],
  );
  if ((rowCount ?? 0) === 0) throw new Error('Session not found');
}
```

- [ ] **Step 3.4: Esegui — verifica passa**

```bash
cd archibald-web-app/backend
npm test -- --run src/db/repositories/visit-planning-sessions.spec.ts 2>&1 | tail -10
```

Output atteso: `✓ 8 tests passed`.

- [ ] **Step 3.5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/visit-planning-sessions.ts \
        archibald-web-app/backend/src/db/repositories/visit-planning-sessions.spec.ts
git commit -m "feat(giri-visite): repository visit-planning-sessions con CRUD e test"
```

---

## Task 4 — Repository: visit-planning-stops

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/visit-planning-stops.ts`
- Create: `archibald-web-app/backend/src/db/repositories/visit-planning-stops.spec.ts`

- [ ] **Step 4.1: Scrivi il test fallente**

```typescript
// visit-planning-stops.spec.ts
import { describe, test, expect, vi } from 'vitest';
import {
  createStop, listStops, updateStop, deleteStop,
  reorderStops, markVisited,
} from './visit-planning-stops';
import type { VisitPlanningStopId, VisitPlanningSessionId } from './visit-planning-types';

const SESSION_ID = 'sess-uuid-1' as VisitPlanningSessionId;
const STOP_ID    = 'stop-uuid-1' as VisitPlanningStopId;
const USER_ID    = 'user-test-1';
const NOW        = new Date('2026-06-06T08:00:00Z');

function makeStopRow(o: Record<string, unknown> = {}) {
  return {
    id: STOP_ID, session_id: SESSION_ID, user_id: USER_ID,
    source_type: 'archibald', source_id: '55.374',
    display_name: 'Dr. Rossi', appointment_id: null,
    stop_date: '2026-06-06', sequence: 1,
    status: 'suggested', locked: false,
    estimated_arrival: null, estimated_departure: null,
    visit_minutes: 30, travel_minutes_from_previous: null,
    distance_km_from_previous: null,
    score_total: null, score_breakdown_json: {},
    recommendation_reasons: [], alerts: [],
    manual_note: null, skip_reason: null, visited_at: null,
    created_at: NOW, updated_at: NOW,
    ...o,
  };
}

function makePool(row = makeStopRow()) {
  return { query: vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 }) } as any;
}

describe('createStop', () => {
  test('crea tappa e restituisce oggetto mappato', async () => {
    const pool = makePool();
    const result = await createStop(pool, SESSION_ID, USER_ID, {
      sourceType: 'archibald', sourceId: '55.374',
      displayName: 'Dr. Rossi', stopDate: '2026-06-06',
      status: 'suggested', visitMinutes: 30,
    });
    expect(result).toMatchObject({
      sessionId: SESSION_ID, userId: USER_ID,
      sourceType: 'archibald', sourceId: '55.374',
      status: 'suggested',
    });
  });
});

describe('listStops', () => {
  test('restituisce le tappe della sessione ordinate per sequence', async () => {
    const pool = makePool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [makeStopRow({ sequence: 1 }), makeStopRow({ id: 'stop-2' as VisitPlanningStopId, sequence: 2 })],
      rowCount: 2,
    });
    const stops = await listStops(pool, USER_ID, SESSION_ID);
    expect(stops).toHaveLength(2);
    expect(stops[0].sequence).toBe(1);
  });
});

describe('updateStop', () => {
  test('aggiorna status a confirmed', async () => {
    const pool = makePool(makeStopRow({ status: 'confirmed' }));
    const result = await updateStop(pool, USER_ID, STOP_ID, { status: 'confirmed' });
    expect(result.status).toBe('confirmed');
  });

  test('lancia errore se nessun campo', async () => {
    const pool = makePool();
    await expect(updateStop(pool, USER_ID, STOP_ID, {})).rejects.toThrow('No fields');
  });
});

describe('markVisited', () => {
  test('imposta status=visited e visited_at', async () => {
    const visitedAt = new Date();
    const pool = makePool(makeStopRow({ status: 'visited', visited_at: visitedAt }));
    const result = await markVisited(pool, USER_ID, STOP_ID);
    expect(result.status).toBe('visited');
    expect(result.visitedAt).not.toBeNull();
  });
});
```

- [ ] **Step 4.2: Esegui — verifica fallisce**

```bash
npm test -- --run src/db/repositories/visit-planning-stops.spec.ts 2>&1 | tail -3
```

Output atteso: errore import.

- [ ] **Step 4.3: Implementa il repository**

```typescript
// visit-planning-stops.ts
import type { DbPool } from '../pool';
import type {
  VisitPlanningStop, VisitPlanningStopId, VisitPlanningSessionId,
  StopStatus, CustomerSourceType,
} from './visit-planning-types';

type StopRow = {
  id: string; session_id: string; user_id: string;
  source_type: string; source_id: string; display_name: string;
  appointment_id: string | null; stop_date: string | Date; sequence: number | null;
  status: string; locked: boolean;
  estimated_arrival: Date | null; estimated_departure: Date | null;
  visit_minutes: number; travel_minutes_from_previous: number | null;
  distance_km_from_previous: string | null;
  score_total: string | null; score_breakdown_json: Record<string, number>;
  recommendation_reasons: string[]; alerts: string[];
  manual_note: string | null; skip_reason: string | null;
  visited_at: Date | null; created_at: Date; updated_at: Date;
};

function toStop(r: StopRow): VisitPlanningStop {
  return {
    id: r.id as VisitPlanningStopId,
    sessionId: r.session_id as VisitPlanningSessionId,
    userId: r.user_id,
    sourceType: r.source_type as CustomerSourceType,
    sourceId: r.source_id,
    displayName: r.display_name,
    appointmentId: r.appointment_id,
    stopDate: typeof r.stop_date === 'string' ? r.stop_date : (r.stop_date as Date).toISOString().slice(0, 10),
    sequence: r.sequence,
    status: r.status as StopStatus,
    locked: r.locked,
    estimatedArrival: r.estimated_arrival?.toISOString() ?? null,
    estimatedDeparture: r.estimated_departure?.toISOString() ?? null,
    visitMinutes: r.visit_minutes,
    travelMinutesFromPrevious: r.travel_minutes_from_previous,
    distanceKmFromPrevious: r.distance_km_from_previous != null ? parseFloat(r.distance_km_from_previous) : null,
    scoreTotal: r.score_total != null ? parseFloat(r.score_total) : null,
    scoreBreakdownJson: r.score_breakdown_json ?? {},
    recommendationReasons: r.recommendation_reasons ?? [],
    alerts: r.alerts ?? [],
    manualNote: r.manual_note,
    skipReason: r.skip_reason,
    visitedAt: r.visited_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export type CreateStopInput = {
  sourceType: CustomerSourceType; sourceId: string; displayName: string;
  stopDate: string; status: StopStatus; visitMinutes: number;
  sequence?: number; locked?: boolean;
  scoreTotal?: number; scoreBreakdownJson?: Record<string, number>;
  recommendationReasons?: string[]; alerts?: string[];
};

export async function createStop(
  pool: DbPool, sessionId: VisitPlanningSessionId, userId: string, input: CreateStopInput,
): Promise<VisitPlanningStop> {
  const { rows } = await pool.query<StopRow>(
    `INSERT INTO agents.visit_planning_stops
       (session_id,user_id,source_type,source_id,display_name,stop_date,
        status,visit_minutes,sequence,locked,
        score_total,score_breakdown_json,recommendation_reasons,alerts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [sessionId, userId, input.sourceType, input.sourceId, input.displayName,
     input.stopDate, input.status, input.visitMinutes,
     input.sequence ?? null, input.locked ?? false,
     input.scoreTotal ?? null,
     JSON.stringify(input.scoreBreakdownJson ?? {}),
     input.recommendationReasons ?? [],
     input.alerts ?? []],
  );
  if (!rows[0]) throw new Error('Failed to create stop');
  return toStop(rows[0]);
}

export async function listStops(
  pool: DbPool, userId: string, sessionId: VisitPlanningSessionId,
): Promise<VisitPlanningStop[]> {
  const { rows } = await pool.query<StopRow>(
    `SELECT * FROM agents.visit_planning_stops
     WHERE session_id = $1 AND user_id = $2
     ORDER BY COALESCE(sequence, 9999), created_at`,
    [sessionId, userId],
  );
  return rows.map(toStop);
}

export type UpdateStopInput = Partial<{
  status: StopStatus; locked: boolean; sequence: number;
  estimatedArrival: string | null; estimatedDeparture: string | null;
  visitMinutes: number; manualNote: string | null; skipReason: string | null;
  appointmentId: string | null;
  travelMinutesFromPrevious: number | null; distanceKmFromPrevious: number | null;
  scoreTotal: number | null; scoreBreakdownJson: Record<string, number>;
  recommendationReasons: string[]; alerts: string[];
}>;

const STOP_FIELD_MAP: Record<string, string> = {
  status: 'status', locked: 'locked', sequence: 'sequence',
  estimatedArrival: 'estimated_arrival', estimatedDeparture: 'estimated_departure',
  visitMinutes: 'visit_minutes', manualNote: 'manual_note', skipReason: 'skip_reason',
  appointmentId: 'appointment_id',
  travelMinutesFromPrevious: 'travel_minutes_from_previous',
  distanceKmFromPrevious: 'distance_km_from_previous',
  scoreTotal: 'score_total', scoreBreakdownJson: 'score_breakdown_json',
  recommendationReasons: 'recommendation_reasons', alerts: 'alerts',
};

export async function updateStop(
  pool: DbPool, userId: string, id: VisitPlanningStopId, patch: UpdateStopInput,
): Promise<VisitPlanningStop> {
  const sets = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let p = 1;

  for (const [key, col] of Object.entries(STOP_FIELD_MAP)) {
    if ((patch as Record<string, unknown>)[key] !== undefined) {
      const val = (patch as Record<string, unknown>)[key];
      sets.push(`${col} = $${p++}`);
      params.push(
        key === 'scoreBreakdownJson' ? JSON.stringify(val) :
        key === 'recommendationReasons' || key === 'alerts' ? val :
        val
      );
    }
  }

  if (sets.length === 1) throw new Error('No fields to update');
  params.push(id, userId);

  const { rows } = await pool.query<StopRow>(
    `UPDATE agents.visit_planning_stops
     SET ${sets.join(', ')}
     WHERE id = $${p} AND user_id = $${p + 1}
     RETURNING *`,
    params,
  );
  if (!rows[0]) throw new Error('Stop not found');
  return toStop(rows[0]);
}

export async function deleteStop(
  pool: DbPool, userId: string, id: VisitPlanningStopId,
): Promise<void> {
  // Soft delete: imposta status='removed', non cancella fisicamente
  await updateStop(pool, userId, id, { status: 'removed' });
}

export async function markVisited(
  pool: DbPool, userId: string, id: VisitPlanningStopId,
): Promise<VisitPlanningStop> {
  const { rows } = await pool.query<StopRow>(
    `UPDATE agents.visit_planning_stops
     SET status = 'visited', visited_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, userId],
  );
  if (!rows[0]) throw new Error('Stop not found');
  return toStop(rows[0]);
}

export async function reorderStops(
  pool: DbPool, userId: string, sessionId: VisitPlanningSessionId,
  order: Array<{ id: VisitPlanningStopId; sequence: number }>,
): Promise<void> {
  for (const { id, sequence } of order) {
    await pool.query(
      `UPDATE agents.visit_planning_stops
       SET sequence = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND session_id = $4`,
      [sequence, id, userId, sessionId],
    );
  }
}
```

- [ ] **Step 4.4: Esegui — verifica passa**

```bash
npm test -- --run src/db/repositories/visit-planning-stops.spec.ts 2>&1 | tail -5
```

Output atteso: `✓ 6 tests passed`.

- [ ] **Step 4.5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/visit-planning-stops.ts \
        archibald-web-app/backend/src/db/repositories/visit-planning-stops.spec.ts
git commit -m "feat(giri-visite): repository visit-planning-stops con CRUD, reorder, markVisited"
```

---

## Task 5 — Repository: customer-geo-status + municipal-holidays

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/customer-geo-status.ts`
- Create: `archibald-web-app/backend/src/db/repositories/customer-geo-status.spec.ts`
- Create: `archibald-web-app/backend/src/db/repositories/municipal-holidays.ts`
- Create: `archibald-web-app/backend/src/db/repositories/municipal-holidays.spec.ts`

- [ ] **Step 5.1: Scrivi test fallenti (entrambi)**

```typescript
// customer-geo-status.spec.ts
import { describe, test, expect, vi } from 'vitest';
import { upsertGeoStatus, getGeoStatus, listMissingGeo } from './customer-geo-status';

const USER_ID = 'user-1';

describe('upsertGeoStatus', () => {
  test('inserisce o aggiorna coordinate per un cliente archibald', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{}], rowCount: 1 }) } as any;
    await expect(upsertGeoStatus(pool, {
      userId: USER_ID, sourceType: 'archibald', sourceId: '55.374',
      lat: 40.85, lng: 14.27, quality: 'geocoded', provider: 'nominatim',
    })).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledTimes(1);
    const sql: string = pool.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT');
  });
});

describe('listMissingGeo', () => {
  test('restituisce clienti archibald senza coordinate geocodificate', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ source_type: 'archibald', source_id: '55.374', name: 'Dr. Rossi', street: 'Via Roma 1', postal_code: '80100', city: 'Napoli' }],
      }),
    } as any;
    const result = await listMissingGeo(pool, USER_ID, 10);
    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe('55.374');
  });
});
```

```typescript
// municipal-holidays.spec.ts
import { describe, test, expect, vi } from 'vitest';
import { isHolidayForCity, listHolidaysForDate } from './municipal-holidays';

const USER_ID = 'user-1';

describe('isHolidayForCity', () => {
  test('restituisce true se comune + data matchano una festa con confidence verified', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ comune: 'Napoli', holiday_name: 'San Gennaro', confidence: 'verified', is_override: false }],
      }),
    } as any;
    const result = await isHolidayForCity(pool, USER_ID, 'Napoli', 9, 19);
    expect(result).toMatchObject({ isHoliday: true, confidence: 'verified', name: 'San Gennaro' });
  });

  test('restituisce false se nessuna corrispondenza', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
    const result = await isHolidayForCity(pool, USER_ID, 'Milano', 6, 15);
    expect(result).toMatchObject({ isHoliday: false });
  });
});
```

- [ ] **Step 5.2: Esegui — verifica fallisce**

```bash
npm test -- --run src/db/repositories/customer-geo-status.spec.ts \
                 src/db/repositories/municipal-holidays.spec.ts 2>&1 | tail -3
```

- [ ] **Step 5.3: Implementa customer-geo-status.ts**

```typescript
import type { DbPool } from '../pool';
import type { CustomerGeoStatus, CustomerSourceType, GeoQuality } from './visit-planning-types';

export type UpsertGeoInput = {
  userId: string; sourceType: CustomerSourceType; sourceId: string;
  lat: number; lng: number; quality: GeoQuality;
  normalizedAddress?: string; provider?: string;
};

export async function upsertGeoStatus(pool: DbPool, input: UpsertGeoInput): Promise<void> {
  await pool.query(
    `INSERT INTO agents.customer_geo_status
       (user_id,source_type,source_id,lat,lng,normalized_address,quality,provider,geocoded_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
     ON CONFLICT (user_id,source_type,source_id) DO UPDATE SET
       lat=EXCLUDED.lat, lng=EXCLUDED.lng,
       normalized_address=EXCLUDED.normalized_address,
       quality=EXCLUDED.quality, provider=EXCLUDED.provider,
       geocoded_at=NOW(), updated_at=NOW()`,
    [input.userId, input.sourceType, input.sourceId, input.lat, input.lng,
     input.normalizedAddress ?? null, input.quality, input.provider ?? null],
  );
}

export async function getGeoStatus(
  pool: DbPool, userId: string, sourceType: CustomerSourceType, sourceId: string,
): Promise<CustomerGeoStatus | null> {
  const { rows } = await pool.query(
    `SELECT * FROM agents.customer_geo_status
     WHERE user_id=$1 AND source_type=$2 AND source_id=$3`,
    [userId, sourceType, sourceId],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    userId: r.user_id, sourceType: r.source_type, sourceId: r.source_id,
    lat: r.lat != null ? parseFloat(r.lat) : null,
    lng: r.lng != null ? parseFloat(r.lng) : null,
    normalizedAddress: r.normalized_address, quality: r.quality,
    provider: r.provider, geocodedAt: r.geocoded_at?.toISOString() ?? null,
    manuallyConfirmedAt: r.manually_confirmed_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export type MissingGeoCustomer = {
  sourceType: CustomerSourceType; sourceId: string;
  name: string; street: string | null; postalCode: string | null; city: string | null;
};

export async function listMissingGeo(
  pool: DbPool, userId: string, limit: number,
): Promise<MissingGeoCustomer[]> {
  const { rows } = await pool.query(
    `SELECT 'archibald' AS source_type, c.erp_id AS source_id,
            c.name, c.street, c.postal_code, c.city
     FROM agents.customers c
     WHERE c.user_id = $1
       AND c.is_distributor = FALSE
       AND c.city IS NOT NULL AND c.city != ''
       AND NOT EXISTS (
         SELECT 1 FROM agents.customer_geo_status g
         WHERE g.user_id = c.user_id
           AND g.source_type = 'archibald'
           AND g.source_id = c.erp_id
           AND g.quality IN ('geocoded','manually_confirmed')
       )
     ORDER BY c.name
     LIMIT $2`,
    [userId, limit],
  );
  return rows.map(r => ({
    sourceType: r.source_type as CustomerSourceType,
    sourceId: r.source_id,
    name: r.name,
    street: r.street,
    postalCode: r.postal_code,
    city: r.city,
  }));
}
```

- [ ] **Step 5.4: Implementa municipal-holidays.ts**

```typescript
import type { DbPool } from '../pool';

export type HolidayCheckResult = {
  isHoliday: boolean;
  confidence?: string;
  name?: string;
  isOverride?: boolean;
};

export async function isHolidayForCity(
  pool: DbPool, userId: string, city: string, month: number, day: number,
): Promise<HolidayCheckResult> {
  // Controlla prima override utente, poi tabella sistema
  const { rows } = await pool.query(
    `SELECT comune, holiday_name, confidence, TRUE AS is_override
     FROM agents.municipal_holiday_overrides
     WHERE user_id = $1
       AND UPPER(TRIM(comune)) = UPPER(TRIM($2))
       AND date_month = $3 AND date_day = $4
       AND is_closed = TRUE
     UNION ALL
     SELECT comune, holiday_name, confidence, FALSE AS is_override
     FROM system.italian_municipal_holidays
     WHERE UPPER(TRIM(comune)) = UPPER(TRIM($2))
       AND date_month = $3 AND date_day = $4
     ORDER BY is_override DESC
     LIMIT 1`,
    [userId, city, month, day],
  );

  if (!rows[0]) return { isHoliday: false };
  return {
    isHoliday: true,
    confidence: rows[0].confidence,
    name: rows[0].holiday_name,
    isOverride: rows[0].is_override,
  };
}

export async function listHolidaysForDate(
  pool: DbPool, userId: string, month: number, day: number,
): Promise<Array<{ comune: string; provincia: string | null; name: string; confidence: string }>> {
  const { rows } = await pool.query(
    `SELECT UPPER(TRIM(h.comune)) AS comune, h.provincia, h.holiday_name AS name, h.confidence
     FROM system.italian_municipal_holidays h
     WHERE h.date_month = $1 AND h.date_day = $2
     UNION ALL
     SELECT UPPER(TRIM(o.comune)) AS comune, o.provincia, o.holiday_name AS name, 'manual' AS confidence
     FROM agents.municipal_holiday_overrides o
     WHERE o.user_id = $3
       AND o.date_month = $1 AND o.date_day = $2
       AND o.is_closed = TRUE`,
    [month, day, userId],
  );
  return rows;
}
```

- [ ] **Step 5.5: Esegui — verifica passa**

```bash
npm test -- --run src/db/repositories/customer-geo-status.spec.ts \
                 src/db/repositories/municipal-holidays.spec.ts 2>&1 | tail -5
```

Output atteso: `✓ 4 tests passed`.

- [ ] **Step 5.6: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/customer-geo-status.ts \
        archibald-web-app/backend/src/db/repositories/customer-geo-status.spec.ts \
        archibald-web-app/backend/src/db/repositories/municipal-holidays.ts \
        archibald-web-app/backend/src/db/repositories/municipal-holidays.spec.ts
git commit -m "feat(giri-visite): repository geo-status e municipal-holidays"
```

---

## Task 6 — Service: visit-unified-customer

**Files:**
- Create: `archibald-web-app/backend/src/services/visit-unified-customer.ts`
- Create: `archibald-web-app/backend/src/services/visit-unified-customer.spec.ts`

Costruisce un `CustomerProfile` normalizzato da qualsiasi sorgente (Archibald o Arca).

- [ ] **Step 6.1: Scrivi il test fallente**

```typescript
// visit-unified-customer.spec.ts
import { describe, test, expect, vi } from 'vitest';
import { buildCustomerProfile, resolveCustomerIdentity } from './visit-unified-customer';

const USER_ID = 'user-1';

const archRow = {
  erp_id: '55.374', account_num: '1002328-no', name: 'Dr. Rossi Mario',
  street: 'Via Roma 1', postal_code: '80100', city: 'Napoli',
  phone: '081123456', email: null, vat_number: '07234911217',
  is_distributor: false, geo_latitude: null, geo_longitude: null,
  deleted_at: null,
};

const arcaRow = {
  codice: 'C00602', ragione_sociale: 'Lab. Odont. Rossi',
  indirizzo: 'Via Roma 2', cap: '80100', localita: 'Napoli', prov: 'NA',
  telefono: '081999999', email: null, partita_iva: '07234911217',
};

describe('buildCustomerProfile — sorgente archibald', () => {
  test('mappa correttamente i campi Archibald in CustomerProfile', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [archRow] })  // customers query
        .mockResolvedValueOnce({ rows: [] })          // geo status (nessuna)
        .mockResolvedValueOnce({ rows: [] }),          // match arca (nessuno)
    } as any;

    const result = await buildCustomerProfile(pool, USER_ID, 'archibald', '55.374');

    expect(result).toMatchObject({
      sourceType: 'archibald',
      sourceId: '55.374',
      displayName: 'Dr. Rossi Mario',
      city: 'Napoli',
      postalCode: '80100',
      isDistributor: false,
    });
  });

  test('restituisce null per cliente non trovato', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
    const result = await buildCustomerProfile(pool, USER_ID, 'archibald', '99.999');
    expect(result).toBeNull();
  });
});

describe('buildCustomerProfile — sorgente arca', () => {
  test('mappa correttamente i campi Arca in CustomerProfile', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [arcaRow] })  // sub_clients query
        .mockResolvedValueOnce({ rows: [] })          // geo status
        .mockResolvedValueOnce({ rows: [] }),          // match archibald
    } as any;

    const result = await buildCustomerProfile(pool, USER_ID, 'arca', 'C00602');

    expect(result).toMatchObject({
      sourceType: 'arca',
      sourceId: 'C00602',
      displayName: 'Lab. Odont. Rossi',
      city: 'Napoli',
      isDistributor: false,
    });
  });
});

describe('resolveCustomerIdentity', () => {
  test('risolve source type da prefisso arca:', () => {
    const result = resolveCustomerIdentity('arca:C00602');
    expect(result).toEqual({ sourceType: 'arca', sourceId: 'C00602' });
  });

  test('risolve source type archibald da ID numerico XX.YYY', () => {
    const result = resolveCustomerIdentity('55.374');
    expect(result).toEqual({ sourceType: 'archibald', sourceId: '55.374' });
  });

  test('lancia errore per ID non riconoscibile', () => {
    expect(() => resolveCustomerIdentity('invalid-id')).toThrow('Cannot resolve');
  });
});
```

- [ ] **Step 6.2: Esegui — verifica fallisce**

```bash
npm test -- --run src/services/visit-unified-customer.spec.ts 2>&1 | tail -3
```

- [ ] **Step 6.3: Implementa il service**

```typescript
// visit-unified-customer.ts
import type { DbPool } from '../db/pool';
import type { CustomerProfile, CustomerSourceType, GeoQuality } from '../db/repositories/visit-planning-types';

// Risolve source type e ID da una stringa composita
// 'arca:C00602' → { sourceType: 'arca', sourceId: 'C00602' }
// '55.374' → { sourceType: 'archibald', sourceId: '55.374' }
export function resolveCustomerIdentity(id: string): { sourceType: CustomerSourceType; sourceId: string } {
  if (id.startsWith('arca:')) return { sourceType: 'arca', sourceId: id.slice(5) };
  if (/^\d+\.\d{3}$/.test(id)) return { sourceType: 'archibald', sourceId: id };
  throw new Error(`Cannot resolve customer identity from: ${id}`);
}

export async function buildCustomerProfile(
  pool: DbPool,
  userId: string,
  sourceType: CustomerSourceType,
  sourceId: string,
): Promise<CustomerProfile | null> {
  if (sourceType === 'archibald') {
    const { rows } = await pool.query(
      `SELECT erp_id, name, street, postal_code, city, phone, email,
              vat_number, is_distributor
       FROM agents.customers
       WHERE user_id = $1 AND erp_id = $2 AND deleted_at IS NULL`,
      [userId, sourceId],
    );
    if (!rows[0]) return null;
    const c = rows[0];

    const geo = await _getGeo(pool, userId, 'archibald', sourceId);
    const matchedArcaSources = await _getArcaMatches(pool, sourceId);

    return {
      sourceType: 'archibald',
      sourceId: c.erp_id,
      displayName: c.name,
      street: c.street,
      postalCode: c.postal_code,
      city: c.city,
      province: null,
      phone: c.phone,
      email: c.email,
      vatNumber: c.vat_number,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      geoQuality: geo?.quality ?? 'unknown',
      isDistributor: c.is_distributor,
      matchedSources: [
        { type: 'archibald', id: c.erp_id, name: c.name },
        ...matchedArcaSources,
      ],
    };
  }

  // sourceType === 'arca'
  const { rows } = await pool.query(
    `SELECT codice, ragione_sociale, indirizzo, cap, localita, prov,
            telefono, email, partita_iva
     FROM shared.sub_clients
     WHERE codice = $1`,
    [sourceId],
  );
  if (!rows[0]) return null;
  const sc = rows[0];

  const geo = await _getGeo(pool, userId, 'arca', sourceId);
  const matchedArchSources = await _getArchibaldMatches(pool, userId, sourceId);

  return {
    sourceType: 'arca',
    sourceId: sc.codice,
    displayName: sc.ragione_sociale,
    street: sc.indirizzo,
    postalCode: sc.cap,
    city: sc.localita,
    province: sc.prov,
    phone: sc.telefono,
    email: sc.email,
    vatNumber: sc.partita_iva,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    geoQuality: geo?.quality ?? 'unknown',
    isDistributor: false,
    matchedSources: [
      { type: 'arca', id: sc.codice, name: sc.ragione_sociale },
      ...matchedArchSources,
    ],
  };
}

async function _getGeo(pool: DbPool, userId: string, sourceType: CustomerSourceType, sourceId: string) {
  const { rows } = await pool.query(
    `SELECT lat, lng, quality FROM agents.customer_geo_status
     WHERE user_id=$1 AND source_type=$2 AND source_id=$3`,
    [userId, sourceType, sourceId],
  );
  if (!rows[0]) return null;
  return {
    lat: rows[0].lat != null ? parseFloat(rows[0].lat) : null,
    lng: rows[0].lng != null ? parseFloat(rows[0].lng) : null,
    quality: rows[0].quality as GeoQuality,
  };
}

async function _getArcaMatches(pool: DbPool, erpId: string) {
  const { rows } = await pool.query(
    `SELECT m.sub_client_codice AS id, sc.ragione_sociale AS name
     FROM shared.sub_client_customer_matches m
     LEFT JOIN shared.sub_clients sc ON sc.codice = m.sub_client_codice
     WHERE m.customer_profile_id = $1`,
    [erpId],
  );
  return rows.map(r => ({ type: 'arca' as CustomerSourceType, id: r.id, name: r.name }));
}

async function _getArchibaldMatches(pool: DbPool, userId: string, arcaCodice: string) {
  const { rows } = await pool.query(
    `SELECT m.customer_profile_id AS id, c.name
     FROM shared.sub_client_customer_matches m
     LEFT JOIN agents.customers c ON c.erp_id = m.customer_profile_id AND c.user_id = $1
     WHERE m.sub_client_codice = $2`,
    [userId, arcaCodice],
  );
  return rows.map(r => ({ type: 'archibald' as CustomerSourceType, id: r.id, name: r.name }));
}
```

- [ ] **Step 6.4: Esegui — verifica passa**

```bash
npm test -- --run src/services/visit-unified-customer.spec.ts 2>&1 | tail -5
```

Output atteso: `✓ 5 tests passed`.

- [ ] **Step 6.5: Commit**

```bash
git add archibald-web-app/backend/src/services/visit-unified-customer.ts \
        archibald-web-app/backend/src/services/visit-unified-customer.spec.ts
git commit -m "feat(giri-visite): service visit-unified-customer con resolveCustomerIdentity e buildCustomerProfile"
```

---

## Task 7 — Service: visit-scoring-service

**Files:**
- Create: `archibald-web-app/backend/src/services/visit-scoring-service.ts`
- Create: `archibald-web-app/backend/src/services/visit-scoring-service.spec.ts`

Calcola lo score commerciale per un cliente con regole FT/KT deduplicate.

- [ ] **Step 7.1: Scrivi i test fallenti**

```typescript
// visit-scoring-service.spec.ts
import { describe, test, expect } from 'vitest';
import {
  normalizeId,
  calcValoreCliente,
  calcProbabilitaRiordino,
  calcScoreTotal,
  SCORE_WEIGHTS,
} from './visit-scoring-service';
import type { VisitMode } from '../db/repositories/visit-planning-types';

describe('normalizeId', () => {
  test('rimuove il punto da 52.424 → 52424', () => {
    expect(normalizeId('52.424')).toBe('52424');
  });
  test('lascia invariato 52452 (già senza punto)', () => {
    expect(normalizeId('52452')).toBe('52452');
  });
  test('gestisce null/undefined come stringa vuota', () => {
    expect(normalizeId(null)).toBe('');
    expect(normalizeId(undefined)).toBe('');
  });
});

describe('calcValoreCliente', () => {
  test('somma FT puri senza doppio conteggio', () => {
    const fresisRecords = [
      { archibaldOrderId: null, targetTotalWithVat: 122.0 },
      { archibaldOrderId: null, targetTotalWithVat: 244.0 },
    ];
    const archRecords: Array<{ orderId: string; totalAmount: string }> = [];
    const result = calcValoreCliente(fresisRecords, archRecords);
    // (122 + 244) / 1.22 ≈ 300
    expect(result).toBeCloseTo(300, 0);
  });

  test('evita doppio conteggio KT con archibald_order_id valorizzato', () => {
    const fresisRecords = [
      { archibaldOrderId: '52.424', targetTotalWithVat: 150.0 },
    ];
    const archRecords = [
      { orderId: '52424', totalAmount: '122.95' }, // stesso ordine, ID normalizzato
    ];
    // Si usa SOLO fresis (150/1.22 ≈ 122.95), NON sommato con archRecords
    const result = calcValoreCliente(fresisRecords, archRecords);
    expect(result).toBeCloseTo(122.95, 1);
  });

  test('include ordini Archibald diretti se non coperti da fresis', () => {
    const fresisRecords: Array<{ archibaldOrderId: string | null; targetTotalWithVat: number }> = [];
    const archRecords = [
      { orderId: '55997', totalAmount: '122.95' },
    ];
    const result = calcValoreCliente(fresisRecords, archRecords);
    expect(result).toBeCloseTo(122.95, 1);
  });

  test('scarta total_amount non numerici', () => {
    const fresisRecords: Array<{ archibaldOrderId: string | null; targetTotalWithVat: number }> = [];
    const archRecords = [
      { orderId: '55997', totalAmount: '' },
      { orderId: '55998', totalAmount: 'N/A' },
      { orderId: '55999', totalAmount: '200.00' },
    ];
    const result = calcValoreCliente(fresisRecords, archRecords);
    expect(result).toBeCloseTo(200, 1);
  });
});

describe('calcProbabilitaRiordino', () => {
  test('alta se giorni_da_ultimo ≈ ciclo_medio ± 20%', () => {
    const result = calcProbabilitaRiordino({ daysSinceLastOrder: 60, avgCycleDays: 60 });
    expect(result).toBeGreaterThanOrEqual(0.7);
  });

  test('bassa se cliente dormiente (giorni >> ciclo)', () => {
    const result = calcProbabilitaRiordino({ daysSinceLastOrder: 300, avgCycleDays: 60 });
    expect(result).toBeLessThanOrEqual(0.4);
  });

  test('media se nessun ciclo stimabile', () => {
    const result = calcProbabilitaRiordino({ daysSinceLastOrder: 90, avgCycleDays: null });
    expect(result).toBeCloseTo(0.5, 1);
  });
});

describe('calcScoreTotal', () => {
  test('somma i componenti pesati per modalità balanced', () => {
    const breakdown = {
      valore: 0.8, riordino: 0.6, urgenza: 0.5, zona: 0.7,
      crossSell: 0.4, promozioni: 0.3, rischioClosure: 0, penalitaDati: 0,
    };
    const total = calcScoreTotal(breakdown, 'balanced' as VisitMode);
    const expected =
      0.8 * SCORE_WEIGHTS.balanced.valore +
      0.6 * SCORE_WEIGHTS.balanced.riordino +
      0.5 * SCORE_WEIGHTS.balanced.urgenza +
      0.7 * SCORE_WEIGHTS.balanced.zona +
      0.4 * SCORE_WEIGHTS.balanced.crossSell +
      0.3 * SCORE_WEIGHTS.balanced.promozioni;
    expect(total).toBeCloseTo(expected, 3);
  });
});
```

- [ ] **Step 7.2: Esegui — verifica fallisce**

```bash
npm test -- --run src/services/visit-scoring-service.spec.ts 2>&1 | tail -3
```

- [ ] **Step 7.3: Implementa il service**

```typescript
// visit-scoring-service.ts
import type { VisitMode, ScoreBreakdown } from '../db/repositories/visit-planning-types';

// Normalizza ID ERP: '52.424' → '52424'
export function normalizeId(id: string | null | undefined): string {
  if (!id) return '';
  return id.replace(/\./g, '');
}

// Pesi per modalità — questi sono i valori canonici del design doc §6.1
export const SCORE_WEIGHTS: Record<VisitMode, {
  valore: number; riordino: number; urgenza: number; zona: number;
  crossSell: number; promozioni: number;
}> = {
  balanced:     { valore: 0.30, riordino: 0.25, urgenza: 0.15, zona: 0.15, crossSell: 0.10, promozioni: 0.05 },
  profitability:{ valore: 0.50, riordino: 0.30, urgenza: 0.05, zona: 0.05, crossSell: 0.07, promozioni: 0.03 },
  coverage:     { valore: 0.10, riordino: 0.15, urgenza: 0.40, zona: 0.25, crossSell: 0.07, promozioni: 0.03 },
  constrained:  { valore: 0.20, riordino: 0.20, urgenza: 0.15, zona: 0.30, crossSell: 0.10, promozioni: 0.05 },
  manual_assist:{ valore: 0.20, riordino: 0.20, urgenza: 0.20, zona: 0.20, crossSell: 0.10, promozioni: 0.10 },
};

type FresisRecord = { archibaldOrderId: string | null; targetTotalWithVat: number };
type ArchRecord   = { orderId: string; totalAmount: string };

// Calcola valore cliente imponibile aggregato FT+KT senza doppio conteggio.
// Regola: per ogni record fresis_history con archibald_order_id valorizzato,
// il join viene fatto su ID normalizzato — quell'ordine order_records viene escluso.
export function calcValoreCliente(
  fresisRecords: FresisRecord[],
  archRecords: ArchRecord[],
): number {
  // Set degli ordini ERP coperti da fresis (join normalizzato)
  const coveredNormIds = new Set(
    fresisRecords
      .filter(r => r.archibaldOrderId)
      .map(r => normalizeId(r.archibaldOrderId)),
  );

  // Contributo fresis: tutti i record / 1.22 (target_total_with_vat è IVA incl.)
  const fresisTotal = fresisRecords.reduce(
    (sum, r) => sum + (r.targetTotalWithVat > 0 ? r.targetTotalWithVat / 1.22 : 0), 0,
  );

  // Contributo Archibald diretto: solo ordini NON coperti da fresis e con importo valido
  const archTotal = archRecords
    .filter(r => !coveredNormIds.has(normalizeId(r.orderId)))
    .filter(r => r.totalAmount && /^-?\d/.test(r.totalAmount))
    .reduce((sum, r) => {
      const val = parseFloat(r.totalAmount);
      return sum + (Number.isFinite(val) && val > 0 ? val : 0);
    }, 0);

  return fresisTotal + archTotal;
}

export type ReorderInput = { daysSinceLastOrder: number | null; avgCycleDays: number | null };

export function calcProbabilitaRiordino(input: ReorderInput): number {
  if (input.daysSinceLastOrder == null) return 0.3;
  if (input.avgCycleDays == null) return 0.5;

  const ratio = input.daysSinceLastOrder / input.avgCycleDays;
  if (ratio >= 0.8 && ratio <= 1.2)  return 0.9;  // finestra ideale ±20%
  if (ratio > 1.2  && ratio <= 1.5)  return 0.7;
  if (ratio > 1.5  && ratio <= 2.0)  return 0.5;
  if (ratio > 2.0)                   return 0.3;  // dormiente
  return 0.4;  // troppo presto
}

export function calcScoreTotal(
  breakdown: Omit<ScoreBreakdown, 'total'>,
  mode: VisitMode,
): number {
  const w = SCORE_WEIGHTS[mode];
  return (
    breakdown.valore      * w.valore +
    breakdown.riordino    * w.riordino +
    breakdown.urgenza     * w.urgenza +
    breakdown.zona        * w.zona +
    breakdown.crossSell   * w.crossSell +
    breakdown.promozioni  * w.promozioni -
    breakdown.rischioClosure -
    breakdown.penalitaDati
  );
}

// Normalizza un valore su percentile 0–1 rispetto a un array di valori
// con cap a 95° percentile per proteggere da outlier
export function normalizePercentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;
  const sorted = [...allValues].sort((a, b) => a - b);
  const p95idx = Math.floor(sorted.length * 0.95);
  const cap = sorted[p95idx] ?? sorted[sorted.length - 1];
  const capped = Math.min(value, cap);
  return cap > 0 ? capped / cap : 0;
}
```

- [ ] **Step 7.4: Esegui — verifica passa**

```bash
npm test -- --run src/services/visit-scoring-service.spec.ts 2>&1 | tail -5
```

Output atteso: `✓ 9 tests passed`.

- [ ] **Step 7.5: Commit**

```bash
git add archibald-web-app/backend/src/services/visit-scoring-service.ts \
        archibald-web-app/backend/src/services/visit-scoring-service.spec.ts
git commit -m "feat(giri-visite): scoring service con deduplica FT/KT normalizeId e pesi per modalità"
```

---

## Task 8 — Service: visit-planner

**Files:**
- Create: `archibald-web-app/backend/src/services/visit-planner.ts`
- Create: `archibald-web-app/backend/src/services/visit-planner.spec.ts`

Algoritmo euristico: carica candidati, deduplica studio, ordina per score + nearest-neighbor.

- [ ] **Step 8.1: Scrivi i test fallenti**

```typescript
// visit-planner.spec.ts
import { describe, test, expect } from 'vitest';
import {
  deduplicateByStudio,
  nearestNeighborSort,
  estimateTravelMinutes,
} from './visit-planner';
import type { CustomerProfile } from '../db/repositories/visit-planning-types';

function makeProfile(id: string, lat: number | null, lng: number | null, extra = {}): CustomerProfile {
  return {
    sourceType: 'archibald', sourceId: id,
    displayName: `Cliente ${id}`,
    street: 'Via Test 1', postalCode: '80100', city: 'Napoli',
    province: 'NA', phone: null, email: null, vatNumber: null,
    lat, lng, geoQuality: lat ? 'geocoded' : 'unknown',
    isDistributor: false, matchedSources: [],
    ...extra,
  };
}

describe('deduplicateByStudio', () => {
  test('rimuove il duplicato Arca quando esiste già Archibald confermato', () => {
    const archibaldCustomer = makeProfile('55.374', 40.85, 14.27);
    const arcaCustomer: CustomerProfile = {
      ...makeProfile('C00602', 40.85, 14.27),
      sourceType: 'arca', sourceId: 'C00602',
      matchedSources: [
        { type: 'arca', id: 'C00602', name: 'Lab. Rossi' },
        { type: 'archibald', id: '55.374', name: 'Dr. Rossi' },
      ],
    };

    const candidates = [archibaldCustomer, arcaCustomer];
    const result = deduplicateByStudio(candidates);

    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe('55.374');
  });

  test('mantiene clienti Arca senza match Archibald', () => {
    const arcaOnly: CustomerProfile = {
      ...makeProfile('C00999', 40.85, 14.27),
      sourceType: 'arca', sourceId: 'C00999',
      matchedSources: [{ type: 'arca', id: 'C00999', name: 'Studio Senza Match' }],
    };
    const result = deduplicateByStudio([arcaOnly]);
    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe('C00999');
  });

  test('mantiene entrambi se nessun match confermato tra loro', () => {
    const a = makeProfile('55.374', 40.85, 14.27);
    const b: CustomerProfile = { ...makeProfile('C00001', 40.86, 14.28), sourceType: 'arca', sourceId: 'C00001', matchedSources: [] };
    const result = deduplicateByStudio([a, b]);
    expect(result).toHaveLength(2);
  });
});

describe('estimateTravelMinutes', () => {
  test('ritorna null se mancano coordinate', () => {
    expect(estimateTravelMinutes(null, null, 40.85, 14.27)).toBeNull();
  });

  test('stima tempo plausibile tra Napoli e Salerno (~50km → ~45-60 min)', () => {
    const mins = estimateTravelMinutes(40.85, 14.27, 40.67, 14.75);
    expect(mins).not.toBeNull();
    expect(mins!).toBeGreaterThan(30);
    expect(mins!).toBeLessThan(90);
  });
});

describe('nearestNeighborSort', () => {
  test('con tappe locked rimangono in posizione', () => {
    const profiles: Array<{ profile: CustomerProfile; score: number; locked: boolean }> = [
      { profile: makeProfile('A', 40.85, 14.27), score: 0.9, locked: true  },
      { profile: makeProfile('B', 40.70, 14.75), score: 0.5, locked: false },
      { profile: makeProfile('C', 40.80, 14.30), score: 0.7, locked: false },
    ];
    const sorted = nearestNeighborSort(profiles, { lat: 40.90, lng: 14.20 });
    // A è locked e deve restare primo
    expect(sorted[0].profile.sourceId).toBe('A');
  });
});
```

- [ ] **Step 8.2: Esegui — verifica fallisce**

```bash
npm test -- --run src/services/visit-planner.spec.ts 2>&1 | tail -3
```

- [ ] **Step 8.3: Implementa il service**

```typescript
// visit-planner.ts
import type { CustomerProfile } from '../db/repositories/visit-planning-types';

// Distanza euclidea in km (formula haversine semplificata)
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Stima minuti di viaggio: 50 km/h media urbana/extraurbana
export function estimateTravelMinutes(
  fromLat: number | null, fromLng: number | null,
  toLat: number | null, toLng: number | null,
): number | null {
  if (fromLat == null || fromLng == null || toLat == null || toLng == null) return null;
  const km = distanceKm(fromLat, fromLng, toLat, toLng);
  return Math.round((km / 50) * 60);
}

// Rimuove duplicati studio: se un cliente Arca ha un match Archibald confermato,
// mantieni solo l'Archibald. Costruisce una map studioKey → candidato scelto.
export function deduplicateByStudio(
  candidates: CustomerProfile[],
): CustomerProfile[] {
  // Raccoglie tutti gli ID Archibald presenti tra i candidati
  const archibaldIds = new Set(
    candidates
      .filter(c => c.sourceType === 'archibald')
      .map(c => c.sourceId),
  );

  return candidates.filter(c => {
    if (c.sourceType !== 'arca') return true;
    // Un cliente Arca viene escluso se uno dei suoi match Archibald è già nei candidati
    const hasArchMatch = c.matchedSources.some(
      s => s.type === 'archibald' && archibaldIds.has(s.id),
    );
    return !hasArchMatch;
  });
}

type ScoredCandidate = {
  profile: CustomerProfile;
  score: number;
  locked: boolean;
};

type StartPoint = { lat: number | null; lng: number | null };

// Nearest-neighbor pesato da score:
// 1. Estrae le tappe locked in posizione fissa
// 2. Per il resto, ordina per punteggio combinato: score * 0.6 + prossimità * 0.4
export function nearestNeighborSort(
  candidates: ScoredCandidate[],
  startPoint: StartPoint,
): ScoredCandidate[] {
  const locked = candidates.filter(c => c.locked);
  const free   = candidates.filter(c => !c.locked);

  const sorted: ScoredCandidate[] = [];
  let currentLat = startPoint.lat;
  let currentLng = startPoint.lng;

  const remaining = [...free];

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const proximityScore = (() => {
        if (currentLat == null || currentLng == null) return 0.5;
        if (c.profile.lat == null || c.profile.lng == null) return 0.3;
        const km = distanceKm(currentLat, currentLng, c.profile.lat, c.profile.lng);
        return Math.max(0, 1 - km / 100); // normalizza su 100km
      })();
      const combined = c.score * 0.6 + proximityScore * 0.4;
      if (combined > bestScore) { bestScore = combined; bestIdx = i; }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    sorted.push(chosen);
    currentLat = chosen.profile.lat;
    currentLng = chosen.profile.lng;
  }

  // Reintegra le locked nelle loro posizioni originali
  const result = [...sorted];
  for (const l of locked) {
    const origIdx = candidates.indexOf(l);
    result.splice(Math.min(origIdx, result.length), 0, l);
  }

  return result;
}
```

- [ ] **Step 8.4: Esegui — verifica passa**

```bash
npm test -- --run src/services/visit-planner.spec.ts 2>&1 | tail -5
```

Output atteso: `✓ 6 tests passed`.

- [ ] **Step 8.5: Commit**

```bash
git add archibald-web-app/backend/src/services/visit-planner.ts \
        archibald-web-app/backend/src/services/visit-planner.spec.ts
git commit -m "feat(giri-visite): planner service con deduplicateByStudio e nearestNeighborSort"
```

---

## Task 9 — Route: visit-planning-router

**Files:**
- Create: `archibald-web-app/backend/src/routes/visit-planning-router.ts`
- Create: `archibald-web-app/backend/src/routes/visit-planning-router.spec.ts`

- [ ] **Step 9.1: Scrivi il test fallente**

```typescript
// visit-planning-router.spec.ts
import { describe, test, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp, type AppDeps } from '../server';
import { generateJWT } from '../auth-utils';

vi.mock('../pdf-parser-service', () => ({ pdfParserService: { healthCheck: vi.fn() } }));
vi.mock('../pdf-parser-products-service', () => ({ PDFParserProductsService: { getInstance: vi.fn().mockReturnValue({ healthCheck: vi.fn() }) } }));
vi.mock('../pdf-parser-prices-service', () => ({ PDFParserPricesService: { getInstance: vi.fn().mockReturnValue({ healthCheck: vi.fn() }) } }));
vi.mock('../pdf-parser-orders-service', () => ({ PDFParserOrdersService: { getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }) } }));
vi.mock('../pdf-parser-ddt-service', () => ({ PDFParserDDTService: { getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }) } }));
vi.mock('../pdf-parser-invoices-service', () => ({ PDFParserInvoicesService: { getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }) } }));
vi.mock('../bot/archibald-bot', () => ({ ArchibaldBot: vi.fn().mockImplementation(() => ({ initializeDedicatedBrowser: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) })) }));

const USER_ID = 'test-vp-user-1';
const USERNAME = 'test-vp-agent';

const SESSION_ROW = {
  id: 'sess-uuid-1', user_id: USER_ID, title: 'Giro Napoli',
  horizon: 'day', mode: 'balanced', status: 'draft',
  start_date: '2026-06-06', end_date: '2026-06-06',
  start_location_label: null, start_lat: null, start_lng: null,
  end_location_label: null, end_lat: null, end_lng: null,
  constraints_json: {}, metrics_json: {},
  navigation_started_at: null, active_stop_id: null, generated_at: null,
  created_at: new Date(), updated_at: new Date(),
};

function makeDeps(mockRows: unknown[] = [SESSION_ROW]): AppDeps {
  return {
    pool: {
      query: vi.fn().mockResolvedValue({ rows: mockRows, rowCount: mockRows.length }),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
    } as any,
    queue: { enqueue: vi.fn(), getJobStatus: vi.fn().mockResolvedValue(null), getAgentJobs: vi.fn().mockResolvedValue([]), getStats: vi.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, prioritized: 0 }), close: vi.fn(), queue: { getJob: vi.fn().mockResolvedValue(null) } } as any,
    agentLock: { acquire: vi.fn().mockReturnValue({ acquired: true }), release: vi.fn(), setStopCallback: vi.fn(), getActive: vi.fn().mockReturnValue(undefined), getAllActive: vi.fn().mockReturnValue(new Map()) } as any,
    browserPool: { initialize: vi.fn().mockResolvedValue(undefined), acquireContext: vi.fn().mockResolvedValue({}), releaseContext: vi.fn().mockResolvedValue(undefined), getStats: vi.fn().mockReturnValue({ browsers: 0, activeContexts: 0, maxContexts: 0, cachedContexts: [] }), shutdown: vi.fn().mockResolvedValue(undefined) } as any,
    syncScheduler: { start: vi.fn(), stop: vi.fn(), isRunning: vi.fn().mockReturnValue(false), getIntervals: vi.fn().mockReturnValue({ agentSyncMs: 0, sharedSyncMs: 0 }) } as any,
    wsServer: { initialize: vi.fn(), broadcast: vi.fn(), broadcastToAll: vi.fn(), replayEvents: vi.fn(), registerConnection: vi.fn(), unregisterConnection: vi.fn(), getStats: vi.fn().mockReturnValue({ totalConnections: 0, activeUsers: 0, uptime: 0, reconnectionCount: 0, messagesSent: 0, messagesReceived: 0, averageLatency: 0, connectionsPerUser: {} }), shutdown: vi.fn().mockResolvedValue(undefined) } as any,
    passwordCache: { get: vi.fn().mockReturnValue(null), set: vi.fn(), clear: vi.fn() } as any,
    pdfStore: { save: vi.fn().mockReturnValue({ id: 'p1', url: '/share/pdf/p1' }), get: vi.fn().mockReturnValue(null), delete: vi.fn() } as any,
    generateJWT: vi.fn().mockResolvedValue('test-token'),
    verifyToken: vi.fn().mockResolvedValue(null),
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    uploadToDropbox: vi.fn().mockResolvedValue({ path: '/test' }),
  };
}

describe('POST /api/visit-planning/sessions', () => {
  test('richiede autenticazione', async () => {
    const app = createApp(makeDeps());
    const res = await request(app).post('/api/visit-planning/sessions').send({});
    expect(res.status).toBe(401);
  });

  test('restituisce 400 se body non valido', async () => {
    const app = createApp(makeDeps());
    const token = await generateJWT({ userId: USER_ID, username: USERNAME, role: 'agent', modules: [] });
    const res = await request(app)
      .post('/api/visit-planning/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '' });
    expect(res.status).toBe(400);
  });

  test('crea sessione e restituisce 201 con body corretto', async () => {
    const app = createApp(makeDeps());
    const token = await generateJWT({ userId: USER_ID, username: USERNAME, role: 'agent', modules: [] });
    const res = await request(app)
      .post('/api/visit-planning/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Giro Napoli', horizon: 'day', mode: 'balanced', startDate: '2026-06-06', endDate: '2026-06-06' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Giro Napoli', horizon: 'day', mode: 'balanced' });
  });
});

describe('GET /api/visit-planning/sessions', () => {
  test('richiede autenticazione', async () => {
    const app = createApp(makeDeps());
    const res = await request(app).get('/api/visit-planning/sessions?from=2026-06-01&to=2026-06-30');
    expect(res.status).toBe(401);
  });

  test('restituisce array sessioni', async () => {
    const app = createApp(makeDeps([SESSION_ROW]));
    const token = await generateJWT({ userId: USER_ID, username: USERNAME, role: 'agent', modules: [] });
    const res = await request(app)
      .get('/api/visit-planning/sessions?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
```

- [ ] **Step 9.2: Esegui — verifica fallisce**

```bash
npm test -- --run src/routes/visit-planning-router.spec.ts 2>&1 | tail -3
```

- [ ] **Step 9.3: Implementa la route**

```typescript
// visit-planning-router.ts
import { Router } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool';
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

const HORIZONS:  VisitHorizon[]  = ['day','week'];
const MODES:     VisitMode[]     = ['balanced','profitability','coverage','constrained','manual_assist'];
const STATUSES:  VisitStatus[]   = ['draft','planned','in_progress','completed','cancelled'];
const STOP_STATUSES: StopStatus[] = ['suggested','to_call','confirmed','planned','backup','visited','skipped','removed'];
const SOURCE_TYPES: CustomerSourceType[] = ['archibald','arca'];

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
  status: z.enum(STATUSES as [VisitStatus, ...VisitStatus[]]).optional(),
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
  status:       z.enum(STOP_STATUSES as [StopStatus, ...StopStatus[]]).optional(),
  locked:       z.boolean().optional(),
  sequence:     z.number().int().optional(),
  visitMinutes: z.number().int().min(5).max(480).optional(),
  manualNote:   z.string().nullable().optional(),
  skipReason:   z.string().nullable().optional(),
  estimatedArrival:   z.string().nullable().optional(),
  estimatedDeparture: z.string().nullable().optional(),
  appointmentId:      z.string().nullable().optional(),
});

const ReorderSchema = z.object({
  order: z.array(z.object({ id: z.string(), sequence: z.number().int() })),
});

const NavigationStartedSchema = z.object({ stopId: z.string() });

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
      await reorderStops(pool, userId, req.params.sessionId as VisitPlanningSessionId,
        parsed.data.order.map(o => ({
          id: o.id as VisitPlanningStopId, sequence: o.sequence,
        })),
      );
      res.status(204).end();
    } catch (err) {
      logger.error('reorderStops error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Tracciamento navigazione (D10) ────────────────────────────────────
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

  return router;
}
```

- [ ] **Step 9.4: Esegui — verifica passa**

```bash
npm test -- --run src/routes/visit-planning-router.spec.ts 2>&1 | tail -5
```

Output atteso: `✓ 5 tests passed`.

- [ ] **Step 9.5: Commit**

```bash
git add archibald-web-app/backend/src/routes/visit-planning-router.ts \
        archibald-web-app/backend/src/routes/visit-planning-router.spec.ts
git commit -m "feat(giri-visite): route /api/visit-planning con sessioni, tappe e navigation-started"
```

---

## Task 10 — Endpoint visit-brief (prerequisito Piano 1c)

Piano 1c chiama `GET /api/visit-planning/customers/:sourceType/:sourceId/visit-brief`.
Questo endpoint deve esistere nel backend prima di testare il frontend.

**Files:**
- Create: `archibald-web-app/backend/src/services/visit-brief-service.ts`
- Create: `archibald-web-app/backend/src/services/visit-brief-service.spec.ts`
- Modify: `archibald-web-app/backend/src/routes/visit-planning-router.ts`

- [ ] **Step 10.1: Scrivi il test fallente**

```typescript
// visit-brief-service.spec.ts
import { describe, test, expect, vi } from 'vitest';
import { buildVisitBrief } from './visit-brief-service';

const USER_ID  = 'user-1';
const SOURCE_ID = '55.374';

function makePool(overrides: { arch?: unknown[]; fresis?: unknown[]; promos?: unknown[]; reminders?: unknown[] } = {}) {
  const archRows = overrides.arch ?? [];
  const fresisRows = overrides.fresis ?? [
    {
      sub_client_codice: 'C00602', sub_client_name: 'Dr. Rossi',
      archibald_order_id: null, target_total_with_vat: 150,
      created_at: new Date('2026-06-02'),
      items: [{ articleCode: '94003SC', description: 'Gommino DIA', quantity: 1 }],
    },
  ];
  let call = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve({ rows: fresisRows });
      if (call === 2) return Promise.resolve({ rows: archRows });
      if (call === 3) return Promise.resolve({ rows: overrides.promos ?? [] });
      return Promise.resolve({ rows: overrides.reminders ?? [] });
    }),
  } as any;
}

describe('buildVisitBrief', () => {
  test('aggrega ordini fresis e calcola daysSinceLastOrder', async () => {
    const pool = makePool();
    const result = await buildVisitBrief(pool, USER_ID, 'archibald', SOURCE_ID);
    expect(result.lastOrders).toHaveLength(1);
    expect(result.lastOrders[0].source).toBe('fresis');
    expect(result.lastOrders[0].amountImponibile).toBeCloseTo(150 / 1.22, 1);
    expect(result.daysSinceLastOrder).toBeGreaterThanOrEqual(0);
  });

  test('deduplica KT con archibald_order_id valorizzato', async () => {
    const pool = makePool({
      fresis: [
        { sub_client_codice: 'C00602', sub_client_name: 'Dr. Rossi', archibald_order_id: '55997', target_total_with_vat: 150, created_at: new Date('2026-06-01'), items: [] },
      ],
      arch: [
        { id: '55997', order_number: 'ORD/26011246', creation_date: '2026-06-01', total_amount: '122.95' },
      ],
    });
    const result = await buildVisitBrief(pool, USER_ID, 'archibald', SOURCE_ID);
    // KT con overlap: non devono sommarsi
    expect(result.lastOrders).toHaveLength(1);
  });

  test('restituisce reorderProbability unknown se nessun ordine', async () => {
    const pool = makePool({ fresis: [], arch: [] });
    const result = await buildVisitBrief(pool, USER_ID, 'archibald', SOURCE_ID);
    expect(result.reorderProbability).toBe('unknown');
  });
});
```

- [ ] **Step 10.2: Esegui — verifica fallisce**

```bash
npm test -- --run src/services/visit-brief-service.spec.ts 2>&1 | tail -3
```

- [ ] **Step 10.3: Implementa il service**

```typescript
// visit-brief-service.ts
import type { DbPool } from '../db/pool';
import type { CustomerSourceType } from '../db/repositories/visit-planning-types';
import { normalizeId, calcProbabilitaRiordino } from './visit-scoring-service';

type OrderItem = { articleCode?: string; description?: string; quantity?: number; code?: string; qty?: number };

export type VisitBriefOrder = {
  docRef:           string;
  date:             string;
  amountImponibile: number;
  source:           'archibald' | 'fresis';
  items:            Array<{ code: string; description: string; qty: number }>;
};

export type VisitBriefResult = {
  lastOrders:          VisitBriefOrder[];
  reorderCycleDays:    number | null;
  daysSinceLastOrder:  number | null;
  reorderProbability:  'high' | 'medium' | 'low' | 'unknown';
  suggestedCategories: string[];
  activePromotions:    Array<{ id: string; name: string; tagline: string | null; validTo: string }>;
  openReminders:       Array<{ id: number; note: string | null; dueAt: string }>;
};

function daysSince(dateStr: string | Date): number {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function probLabel(p: number): 'high' | 'medium' | 'low' {
  if (p >= 0.7) return 'high';
  if (p >= 0.4) return 'medium';
  return 'low';
}

export async function buildVisitBrief(
  pool: DbPool,
  userId: string,
  sourceType: CustomerSourceType,
  sourceId: string,
): Promise<VisitBriefResult> {
  // 1. Ordini Fresis per questo cliente (source_id è erp_id per archibald, codice per arca)
  const fresisWhere = sourceType === 'archibald'
    ? `fh.customer_id = $2` // customer_id è erp_id
    : `fh.sub_client_codice = $2`;

  const { rows: fresisRows } = await pool.query(
    `SELECT fh.sub_client_codice, fh.sub_client_name, fh.archibald_order_id,
            fh.target_total_with_vat, fh.created_at, fh.items
     FROM agents.fresis_history fh
     WHERE fh.user_id = $1 AND ${fresisWhere}
       AND fh.target_total_with_vat > 0
     ORDER BY fh.created_at DESC LIMIT 20`,
    [userId, sourceId],
  );

  // 2. Ordini Archibald diretti (solo per clienti non-Fresis)
  const coveredIds = new Set(
    fresisRows
      .filter(r => r.archibald_order_id)
      .map(r => normalizeId(r.archibald_order_id)),
  );

  const { rows: archRows } = await pool.query(
    sourceType === 'archibald'
      ? `SELECT o.id, o.order_number, o.creation_date, o.total_amount
         FROM agents.order_records o
         JOIN agents.customers c ON c.account_num = o.customer_account_num AND c.user_id = o.user_id
         WHERE o.user_id = $1 AND c.erp_id = $2
           AND o.customer_account_num NOT IN ('1002328','049421')
         ORDER BY o.creation_date DESC LIMIT 10`
      : `SELECT NULL AS id, NULL AS order_number, NULL AS creation_date, NULL AS total_amount WHERE FALSE`,
    [userId, sourceId],
  );

  // 3. Costruisci lista ordini deduplicata
  const orders: VisitBriefOrder[] = [];

  for (const r of fresisRows) {
    orders.push({
      docRef: r.sub_client_name ? `FT ${r.sub_client_codice}` : `FT`,
      date: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
      amountImponibile: parseFloat(r.target_total_with_vat) / 1.22,
      source: 'fresis',
      items: Array.isArray(r.items)
        ? r.items.slice(0, 3).map((it: OrderItem) => ({
            code: it.articleCode ?? it.code ?? '',
            description: it.description ?? '',
            qty: it.quantity ?? it.qty ?? 1,
          }))
        : [],
    });
  }

  for (const r of archRows) {
    if (!r.id || coveredIds.has(normalizeId(r.id))) continue;
    if (!r.total_amount || !/^-?\d/.test(r.total_amount)) continue;
    const val = parseFloat(r.total_amount);
    if (!Number.isFinite(val) || val <= 0) continue;
    orders.push({
      docRef: r.order_number ?? r.id,
      date: typeof r.creation_date === 'string' ? r.creation_date : new Date(r.creation_date).toISOString(),
      amountImponibile: val,
      source: 'archibald',
      items: [],
    });
  }

  orders.sort((a, b) => b.date.localeCompare(a.date));

  // 4. Calcola metriche riordino
  const daysSinceLastOrder = orders.length > 0 ? daysSince(orders[0].date) : null;

  let reorderCycleDays: number | null = null;
  if (orders.length >= 2) {
    const gaps: number[] = [];
    for (let i = 0; i < Math.min(orders.length - 1, 6); i++) {
      gaps.push(Math.abs(daysSince(orders[i + 1].date) - daysSince(orders[i].date)));
    }
    reorderCycleDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  const reorderProbabilityScore = orders.length === 0
    ? 0
    : calcProbabilitaRiordino({ daysSinceLastOrder, avgCycleDays: reorderCycleDays });
  const reorderProbability = orders.length === 0
    ? 'unknown'
    : probLabel(reorderProbabilityScore);

  // 5. Promozioni attive
  const today = new Date().toISOString().slice(0, 10);
  const { rows: promoRows } = await pool.query(
    `SELECT id, name, tagline, valid_to FROM system.promotions
     WHERE is_active = TRUE AND valid_from <= $1 AND valid_to >= $1
     ORDER BY valid_to LIMIT 3`,
    [today],
  );
  const activePromotions = promoRows.map(r => ({
    id: r.id, name: r.name, tagline: r.tagline,
    validTo: typeof r.valid_to === 'string' ? r.valid_to : (r.valid_to as Date).toISOString().slice(0, 10),
  }));

  // 6. Reminder aperti (solo per clienti Archibald)
  const { rows: reminderRows } = sourceType === 'archibald'
    ? await pool.query(
        `SELECT id, note, due_at FROM agents.customer_reminders
         WHERE user_id = $1 AND customer_erp_id = $2
           AND status = 'active' ORDER BY due_at LIMIT 5`,
        [userId, sourceId],
      )
    : { rows: [] };
  const openReminders = reminderRows.map(r => ({
    id: r.id, note: r.note,
    dueAt: r.due_at instanceof Date ? r.due_at.toISOString() : r.due_at,
  }));

  return {
    lastOrders: orders.slice(0, 10),
    reorderCycleDays,
    daysSinceLastOrder,
    reorderProbability,
    suggestedCategories: [], // v1: vuoto — implementato in Fase 2 avanzata
    activePromotions,
    openReminders,
  };
}
```

- [ ] **Step 10.4: Aggiungi endpoint al router (visit-planning-router.ts)**

Aggiungi all'inizio del router, dopo gli import, il nuovo import:

```typescript
import { buildVisitBrief } from '../services/visit-brief-service';
```

Aggiungi alla fine della funzione `createVisitPlanningRouter`, prima di `return router`:

```typescript
// ── Visit brief ───────────────────────────────────────────────────────
router.get('/customers/:sourceType/:sourceId/visit-brief', async (req, res) => {
  const { sourceType, sourceId } = req.params;
  if (sourceType !== 'archibald' && sourceType !== 'arca') {
    return res.status(400).json({ error: 'sourceType deve essere archibald o arca' });
  }
  try {
    const userId = (req as AuthRequest).user!.userId;
    const brief = await buildVisitBrief(pool, userId, sourceType as CustomerSourceType, decodeURIComponent(sourceId));
    const profile = await (await import('../services/visit-unified-customer')).buildCustomerProfile(pool, userId, sourceType as CustomerSourceType, decodeURIComponent(sourceId));
    res.json({ ...profile, ...brief });
  } catch (err) {
    logger.error('visitBrief error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 10.5: Esegui test**

```bash
npm test -- --run src/services/visit-brief-service.spec.ts 2>&1 | tail -5
```

Output atteso: `✓ 3 tests passed`.

- [ ] **Step 10.6: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

- [ ] **Step 10.7: Commit**

```bash
git add archibald-web-app/backend/src/services/visit-brief-service.ts \
        archibald-web-app/backend/src/services/visit-brief-service.spec.ts \
        archibald-web-app/backend/src/routes/visit-planning-router.ts
git commit -m "feat(giri-visite): endpoint visit-brief con storico aggregato FT/KT, riordino, promozioni, reminder"
```

---

## Task 12 — Registra route in server.ts

**Files:**
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 10.1: Aggiungi import**

Aggiungi nella sezione degli import di `server.ts` (vicino agli altri router):

```typescript
import { createVisitPlanningRouter } from './routes/visit-planning-router';
```

- [ ] **Step 10.2: Registra route**

Nella sezione `app.use(...)` di `server.ts`, aggiungi dopo la route appointments:

```typescript
app.use('/api/visit-planning', authenticate, createVisitPlanningRouter({ pool }));
```

- [ ] **Step 10.3: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -10
```

Output atteso: `Build completed. No errors.`

- [ ] **Step 10.4: Esegui test completo**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -10
```

Output atteso: tutti i test passano.

- [ ] **Step 10.5: Commit**

```bash
git add archibald-web-app/backend/src/server.ts
git commit -m "feat(giri-visite): registra /api/visit-planning in server.ts"
```

---

## Checklist Gate Piano 1b completato

- [ ] Migrazione 108 applicata in produzione senza errori
- [ ] `npm run build --prefix archibald-web-app/backend` — 0 errori TypeScript
- [ ] `npm test --prefix archibald-web-app/backend` — tutti i test passano
- [ ] `GET /api/visit-planning/sessions?from=2026-06-01&to=2026-06-30` con token valido → 200
- [ ] `POST /api/visit-planning/sessions` con body valido → 201
- [ ] Scoring: `calcValoreCliente` con fixture KT+FT non raddoppia importi
- [ ] Planner: `deduplicateByStudio` rimuove duplicato Arca quando Archibald è presente
