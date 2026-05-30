ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS notification_display_name TEXT,
  ADD COLUMN IF NOT EXISTS notification_reply_to_email TEXT,
  ADD COLUMN IF NOT EXISTS notification_phone TEXT,
  ADD COLUMN IF NOT EXISTS notification_title TEXT;
