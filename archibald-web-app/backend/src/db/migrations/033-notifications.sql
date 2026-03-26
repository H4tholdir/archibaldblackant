CREATE TABLE agents.notifications (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  severity   TEXT NOT NULL CHECK (severity IN ('info', 'success', 'warning', 'error')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  data       JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX notifications_user_unread
  ON agents.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
