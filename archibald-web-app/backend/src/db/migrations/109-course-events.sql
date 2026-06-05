-- Migration 109: Corsi/eventi formativi per suggerimenti giro visite
-- Usati per il caso "Massironi a Castellammare: se prendi X€ di frese, corso gratis"

BEGIN;

CREATE TABLE IF NOT EXISTS system.course_events (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  instructor    TEXT,
  city          TEXT NOT NULL,
  provincia     TEXT,
  event_date    DATE NOT NULL,
  cost_eur      NUMERIC(10,2),
  product_categories TEXT[] NOT NULL DEFAULT '{}',
  threshold_eur NUMERIC(10,2),
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_events_city_date
  ON system.course_events (city, event_date)
  WHERE is_active = TRUE;

COMMIT;
