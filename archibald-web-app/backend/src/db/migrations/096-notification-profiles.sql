CREATE TABLE IF NOT EXISTS agents.notification_profiles (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT,
  name       TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  steps      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint su (user_id, name): NULL user_id = profilo globale
ALTER TABLE agents.notification_profiles
  ADD CONSTRAINT notification_profiles_user_name_uq
  UNIQUE NULLS NOT DISTINCT (user_id, name);

INSERT INTO agents.notification_profiles (user_id, name, is_default, steps)
VALUES
  (NULL, 'Gentile', true, '[
    {"days_after_due":15,"tone":"cordiale","channels":["email","whatsapp"]},
    {"days_after_due":45,"tone":"formale","channels":["email","whatsapp"]},
    {"days_after_due":90,"tone":"urgente","channels":["email"]}
  ]'),
  (NULL, 'Standard', false, '[
    {"days_after_due":1,"tone":"cordiale","channels":["email","whatsapp"]},
    {"days_after_due":7,"tone":"formale","channels":["email","whatsapp"]},
    {"days_after_due":20,"tone":"formale","channels":["email"]},
    {"days_after_due":30,"tone":"urgente","channels":["email"]}
  ]'),
  (NULL, 'Aggressivo', false, '[
    {"days_after_due":0,"tone":"cordiale","channels":["whatsapp"]},
    {"days_after_due":3,"tone":"formale","channels":["email","whatsapp"]},
    {"days_after_due":7,"tone":"urgente","channels":["email","whatsapp"]},
    {"days_after_due":15,"tone":"urgente","channels":["email"]}
  ]')
ON CONFLICT (user_id, name) DO NOTHING;
