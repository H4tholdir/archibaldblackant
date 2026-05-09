-- Migration 090: Normalizza order_articles.order_id + imposta tracking_courier FEDEX
--
-- 1. order_articles.order_id era rimasto no-dot dopo migration 088
--    (non aveva FK su order_records, quindi non era incluso nella 088)
-- 2. tracking_courier era NULL per DDT con tracking_number 'fedex XXXXX'
--    causando il mancato avvio del sync tracking FedEx

-- 1. Normalizza order_articles.order_id da no-dot a dot (solo ID >= 4 cifre)
UPDATE agents.order_articles
SET order_id = substring(order_id FROM 1 FOR length(order_id) - 3) || '.' || right(order_id, 3)
WHERE order_id ~ '^\d{4,}$';

-- 2. Imposta tracking_courier = 'FEDEX' per DDT con tracking_number 'fedex XXXXXXXX'
UPDATE agents.order_ddts
SET tracking_courier = 'FEDEX'
WHERE tracking_number ILIKE 'fedex %'
  AND tracking_courier IS NULL;
