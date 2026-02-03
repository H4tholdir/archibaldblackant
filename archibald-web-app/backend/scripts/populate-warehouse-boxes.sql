-- Script per popolare warehouse_boxes da warehouse_items esistenti
-- Utile per retrocompatibilità se warehouse_items ha dati ma warehouse_boxes è vuota

INSERT OR IGNORE INTO warehouse_boxes (user_id, name, created_at, updated_at)
SELECT DISTINCT
  user_id,
  box_name as name,
  MIN(uploaded_at) as created_at,
  MAX(uploaded_at) as updated_at
FROM warehouse_items
GROUP BY user_id, box_name;

-- Verifica risultati
SELECT 'Scatoli creati:' as info, COUNT(*) as count FROM warehouse_boxes;
SELECT 'Box names:' as info, name FROM warehouse_boxes;
