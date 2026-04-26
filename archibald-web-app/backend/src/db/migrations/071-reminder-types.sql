-- 071-reminder-types.sql
BEGIN;

CREATE TABLE agents.reminder_types (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '📋',
  color_bg   TEXT NOT NULL DEFAULT '#f1f5f9',
  color_text TEXT NOT NULL DEFAULT '#64748b',
  sort_order INT  NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_reminder_types_user
  ON agents.reminder_types(user_id)
  WHERE deleted_at IS NULL;

-- Seed 6 tipi default per ogni utente esistente
INSERT INTO agents.reminder_types (user_id, label, emoji, color_bg, color_text, sort_order)
SELECT u.id, t.label, t.emoji, t.color_bg, t.color_text, t.sort_order
FROM agents.users u
CROSS JOIN (VALUES
  ('Ricontatto commerciale', '📞', '#fee2e2', '#dc2626', 1),
  ('Follow-up offerta',      '🔥', '#fef9c3', '#92400e', 2),
  ('Pagamento',              '💰', '#f0fdf4', '#15803d', 3),
  ('Rinnovo contratto',      '🔄', '#eff6ff', '#1d4ed8', 4),
  ('Ricorrenza',             '🎂', '#fdf4ff', '#7e22ce', 5),
  ('Personalizzato',         '📋', '#f1f5f9', '#64748b', 6)
) AS t(label, emoji, color_bg, color_text, sort_order);

-- Aggiunge FK type_id
ALTER TABLE agents.customer_reminders
  ADD COLUMN type_id INT REFERENCES agents.reminder_types(id);

-- Backfill: mappa i valori stringa ai nuovi ID
UPDATE agents.customer_reminders cr
SET type_id = rt.id
FROM agents.reminder_types rt
WHERE rt.user_id = cr.user_id
  AND rt.deleted_at IS NULL
  AND (
    (cr.type = 'commercial_contact' AND rt.emoji = '📞') OR
    (cr.type = 'offer_followup'     AND rt.emoji = '🔥') OR
    (cr.type = 'payment'            AND rt.emoji = '💰') OR
    (cr.type = 'contract_renewal'   AND rt.emoji = '🔄') OR
    (cr.type = 'anniversary'        AND rt.emoji = '🎂') OR
    (cr.type = 'custom'             AND rt.emoji = '📋')
  );

-- Rendi NOT NULL dopo backfill
ALTER TABLE agents.customer_reminders
  ALTER COLUMN type_id SET NOT NULL;

-- Rimuovi vecchia colonna type (con CHECK constraint)
ALTER TABLE agents.customer_reminders DROP COLUMN type;

COMMIT;
