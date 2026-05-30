CREATE TABLE IF NOT EXISTS agents.notification_message_templates (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT,
  event_type   TEXT NOT NULL,
  tone         TEXT NOT NULL,
  channel      TEXT NOT NULL,
  subject_tmpl TEXT,
  body_tmpl    TEXT NOT NULL,
  UNIQUE (user_id, event_type, tone, channel)
);
