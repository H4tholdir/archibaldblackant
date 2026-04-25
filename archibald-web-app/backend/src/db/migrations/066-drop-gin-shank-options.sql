-- L'indice GIN su shank_options con jsonb_path_ops non viene usato dalla query
-- che usa jsonb_array_elements + ->> (non @> containment). Nessun beneficio, solo overhead scrittura.
DROP INDEX IF EXISTS shared.idx_catalog_entries_shank_options_gin;
