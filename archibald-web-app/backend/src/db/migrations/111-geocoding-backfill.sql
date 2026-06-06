-- Migration 111: Geocoding backfill — coordinate clienti Arca + campo hidden per archiviazione stale

BEGIN;

ALTER TABLE shared.sub_clients
  ADD COLUMN IF NOT EXISTS lat    NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS lng    NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sub_clients_hidden ON shared.sub_clients(hidden);
CREATE INDEX IF NOT EXISTS idx_sub_clients_lat_lng ON shared.sub_clients(lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

COMMIT;
