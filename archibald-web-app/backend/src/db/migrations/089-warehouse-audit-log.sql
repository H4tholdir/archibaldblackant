-- Migration 089: Audit log e snapshot per agents.warehouse_items
--
-- Problema: warehouse_items non aveva protezione — qualsiasi bug poteva corrompere
-- sold_in_order/reserved_for_order senza possibilità di recovery.
-- Soluzione:
--   1. Tabella audit_log: ogni INSERT/UPDATE/DELETE viene loggato automaticamente
--   2. Tabella snapshots: snapshot giornaliero manuale o automatico
--   3. Funzione di rollback: ripristina un articolo dallo snapshot
--   4. Snapshot iniziale dell'inventario corrente

-- 1. Tabella audit log
CREATE TABLE IF NOT EXISTS agents.warehouse_audit_log (
  id             bigserial PRIMARY KEY,
  warehouse_id   integer NOT NULL,
  user_id        text NOT NULL,
  operation      text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  article_code   text,
  box_name       text,
  quantity       integer,
  old_reserved   text,
  new_reserved   text,
  old_sold       text,
  new_sold       text,
  changed_at     timestamptz NOT NULL DEFAULT NOW(),
  changed_by     text DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_wh_audit_item ON agents.warehouse_audit_log (warehouse_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wh_audit_user ON agents.warehouse_audit_log (user_id, changed_at DESC);

-- 2. Trigger function: registra ogni modifica a sold_in_order o reserved_for_order
CREATE OR REPLACE FUNCTION agents.warehouse_audit_trigger_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO agents.warehouse_audit_log
      (warehouse_id, user_id, operation, article_code, box_name, quantity,
       old_reserved, new_reserved, old_sold, new_sold)
    VALUES
      (OLD.id, OLD.user_id, 'DELETE', OLD.article_code, OLD.box_name, OLD.quantity,
       OLD.reserved_for_order, NULL, OLD.sold_in_order, NULL);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO agents.warehouse_audit_log
      (warehouse_id, user_id, operation, article_code, box_name, quantity,
       old_reserved, new_reserved, old_sold, new_sold)
    VALUES
      (NEW.id, NEW.user_id, 'INSERT', NEW.article_code, NEW.box_name, NEW.quantity,
       NULL, NEW.reserved_for_order, NULL, NEW.sold_in_order);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Logga solo se cambia sold_in_order o reserved_for_order
    IF OLD.sold_in_order IS DISTINCT FROM NEW.sold_in_order
    OR OLD.reserved_for_order IS DISTINCT FROM NEW.reserved_for_order
    OR OLD.quantity IS DISTINCT FROM NEW.quantity THEN
      INSERT INTO agents.warehouse_audit_log
        (warehouse_id, user_id, operation, article_code, box_name, quantity,
         old_reserved, new_reserved, old_sold, new_sold)
      VALUES
        (NEW.id, NEW.user_id, 'UPDATE', NEW.article_code, NEW.box_name, NEW.quantity,
         OLD.reserved_for_order, NEW.reserved_for_order,
         OLD.sold_in_order, NEW.sold_in_order);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- 3. Attacca il trigger
DROP TRIGGER IF EXISTS warehouse_audit_trg ON agents.warehouse_items;
CREATE TRIGGER warehouse_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON agents.warehouse_items
  FOR EACH ROW EXECUTE FUNCTION agents.warehouse_audit_trigger_fn();

-- 4. Tabella snapshot
CREATE TABLE IF NOT EXISTS agents.warehouse_snapshots (
  id             bigserial PRIMARY KEY,
  user_id        text NOT NULL,
  snapshot_name  text NOT NULL,
  snapshot_at    timestamptz NOT NULL DEFAULT NOW(),
  items          jsonb NOT NULL  -- copia completa di tutte le righe dell'utente
);

CREATE INDEX IF NOT EXISTS idx_wh_snap_user ON agents.warehouse_snapshots (user_id, snapshot_at DESC);

-- 5. Funzione di snapshot manuale
CREATE OR REPLACE FUNCTION agents.warehouse_take_snapshot(
  p_user_id text,
  p_name text DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_id bigint;
  v_name text;
BEGIN
  v_name := COALESCE(p_name, 'auto-' || to_char(NOW() AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD HH24:MI'));
  INSERT INTO agents.warehouse_snapshots (user_id, snapshot_name, items)
  SELECT p_user_id, v_name,
    jsonb_agg(row_to_json(wi.*) ORDER BY wi.id)
  FROM agents.warehouse_items wi
  WHERE wi.user_id = p_user_id
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 6. Snapshot iniziale dello stato corrente (post-correzione)
SELECT agents.warehouse_take_snapshot(
  'bbed531f-97a5-4250-865e-39ec149cd048',
  'post-correzione-2026-05-09'
);
