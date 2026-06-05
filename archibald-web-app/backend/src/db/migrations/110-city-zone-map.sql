-- Migration 110: Mappa città/provincia → zona commerciale Arca
-- Derivata da shared.sub_clients, usata per raggruppare clienti Archibald per zona

BEGIN;

CREATE TABLE IF NOT EXISTS system.city_zone_map (
  city_normalized  TEXT NOT NULL,
  prov             TEXT NOT NULL,
  zona             TEXT NOT NULL,
  n_clients        INTEGER,
  PRIMARY KEY (city_normalized, prov)
);

CREATE INDEX IF NOT EXISTS idx_city_zone_map_prov ON system.city_zone_map(prov);

-- Popola con la zona dominante per ogni (città, provincia)
-- Preferisce zone significative (non 0, non 100) e poi quella con più clienti
WITH counts AS (
  SELECT
    UPPER(TRIM(localita)) AS city_norm,
    prov,
    zona,
    COUNT(*) AS n
  FROM shared.sub_clients
  WHERE localita IS NOT NULL AND localita != ''
    AND prov IS NOT NULL AND prov != ''
    AND zona IS NOT NULL AND zona != ''
  GROUP BY UPPER(TRIM(localita)), prov, zona
),
ranked AS (
  SELECT
    city_norm, prov, zona, n,
    ROW_NUMBER() OVER (
      PARTITION BY city_norm, prov
      ORDER BY
        (CASE WHEN zona IN ('0', '100') THEN 1 ELSE 0 END),
        n DESC
    ) AS rn
  FROM counts
)
INSERT INTO system.city_zone_map (city_normalized, prov, zona, n_clients)
SELECT city_norm, prov, zona, n FROM ranked WHERE rn = 1
ON CONFLICT DO NOTHING;

COMMIT;
