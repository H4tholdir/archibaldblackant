-- archibald-web-app/backend/src/db/migrations/072-agenda-appointments.sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tabella tipi appuntamento
--    user_id = NULL  → tipo di sistema (condiviso tra tutti gli agenti)
--    user_id = TEXT  → tipo custom di quell'agente
CREATE TABLE agents.appointment_types (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT REFERENCES agents.users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '📋',
  color_hex   TEXT NOT NULL DEFAULT '#64748b',
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT system_types_have_null_user CHECK (
    (is_system = TRUE  AND user_id IS NULL) OR
    (is_system = FALSE AND user_id IS NOT NULL)
  )
);

CREATE INDEX idx_appointment_types_user
  ON agents.appointment_types (user_id)
  WHERE deleted_at IS NULL;

-- Seed tipi di sistema
INSERT INTO agents.appointment_types (user_id, label, emoji, color_hex, is_system, sort_order)
VALUES
  (NULL, 'Visita cliente', '🏢', '#2563eb', TRUE, 1),
  (NULL, 'Chiamata',       '📞', '#10b981', TRUE, 2),
  (NULL, 'Video call',     '🎥', '#8b5cf6', TRUE, 3),
  (NULL, 'Riunione',       '🤝', '#f59e0b', TRUE, 4),
  (NULL, 'Trasferta',      '✈️', '#ef4444', TRUE, 5),
  (NULL, 'Altro',          '📋', '#64748b', TRUE, 6);

-- 2. Tabella appuntamenti
CREATE TABLE agents.appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  start_at         TIMESTAMPTZ NOT NULL,
  end_at           TIMESTAMPTZ NOT NULL,
  all_day          BOOLEAN NOT NULL DEFAULT FALSE,
  customer_erp_id  TEXT,
  location         TEXT,
  type_id          INTEGER REFERENCES agents.appointment_types(id),
  notes            TEXT,
  ics_uid          TEXT UNIQUE,
  google_event_id  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT end_after_start CHECK (end_at > start_at)
);

CREATE INDEX idx_appointments_user_start
  ON agents.appointments (user_id, start_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_appointments_customer
  ON agents.appointments (customer_erp_id)
  WHERE customer_erp_id IS NOT NULL AND deleted_at IS NULL;

-- 3. Colonna source su customer_reminders
--    NULL = creato manualmente, 'auto' = generato da checkDormantCustomers
ALTER TABLE agents.customer_reminders
  ADD COLUMN source TEXT DEFAULT NULL;

-- 4. Token ICS per ogni utente (subscription URL)
ALTER TABLE agents.users
  ADD COLUMN ics_token TEXT UNIQUE NOT NULL
    DEFAULT encode(gen_random_bytes(32), 'hex');

COMMIT;
