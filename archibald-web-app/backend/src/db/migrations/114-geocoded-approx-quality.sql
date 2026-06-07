-- Aggiunge 'geocoded_approx' al CHECK constraint di customer_geo_status.quality
-- per supportare il geocoding progressivo a 3 livelli (completo → via senza civico → città)

ALTER TABLE agents.customer_geo_status
  DROP CONSTRAINT IF EXISTS customer_geo_status_quality_check;

ALTER TABLE agents.customer_geo_status
  ADD CONSTRAINT customer_geo_status_quality_check
  CHECK (quality IN ('unknown','erp_unverified','geocoded','geocoded_approx','manually_confirmed','failed'));

-- Aggiorna l'indice parziale per includere 'geocoded_approx' nelle ricerche rapide
DROP INDEX IF EXISTS agents.idx_customer_geo_status_quality;

CREATE INDEX IF NOT EXISTS idx_customer_geo_status_quality
  ON agents.customer_geo_status (user_id, quality)
  WHERE quality IN ('geocoded','geocoded_approx','manually_confirmed');
