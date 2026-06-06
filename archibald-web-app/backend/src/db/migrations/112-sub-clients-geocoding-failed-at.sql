BEGIN;
ALTER TABLE shared.sub_clients
  ADD COLUMN IF NOT EXISTS geocoding_failed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_sub_clients_geocoding_failed_at
  ON shared.sub_clients(geocoding_failed_at)
  WHERE geocoding_failed_at IS NOT NULL;
COMMIT;
