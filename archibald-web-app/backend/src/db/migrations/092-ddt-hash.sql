-- Hash-based change detection per DDT.
-- Evita UPDATE inutili: ddt-sync calcola MD5 dei campi stabili e scrive
-- solo se il record è nuovo o l'hash è cambiato.
ALTER TABLE agents.order_ddts ADD COLUMN IF NOT EXISTS hash TEXT;
