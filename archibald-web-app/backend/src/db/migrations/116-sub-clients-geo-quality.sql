-- Aggiunge geo_quality a sub_clients per tracciare la precisione del geocoding Arca
-- (street-level vs city-level fallback), allineato a customer_geo_status.quality per Archibald

ALTER TABLE shared.sub_clients
  ADD COLUMN IF NOT EXISTS geo_quality VARCHAR(20) DEFAULT NULL;
