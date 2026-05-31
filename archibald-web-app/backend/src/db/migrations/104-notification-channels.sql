-- Canali di notifica per new_invoice e pre_due.
-- Permette all'agente di decidere se usare email, WA o entrambi per ogni evento.
ALTER TABLE agents.invoice_notification_settings
  ADD COLUMN IF NOT EXISTS new_invoice_channels TEXT[] NOT NULL DEFAULT ARRAY['email'],
  ADD COLUMN IF NOT EXISTS pre_due_channels      TEXT[] NOT NULL DEFAULT ARRAY['email'];
