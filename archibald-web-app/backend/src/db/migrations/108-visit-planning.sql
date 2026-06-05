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
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- COALESCE necessario: UNIQUE inline non accetta espressioni in PG; NULL provincia
-- verrebbe trattato come distinto da un altro NULL, cambiando la semantica.
CREATE UNIQUE INDEX IF NOT EXISTS idx_municipal_holiday_overrides_unique
  ON agents.municipal_holiday_overrides (user_id, comune, COALESCE(provincia, ''));

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
