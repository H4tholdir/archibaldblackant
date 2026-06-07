-- Timestamp di quando le notifiche vengono abilitate per la prima volta per un cliente.
-- Gate anti-flood: l'escalation non manda recupero arretrato, solo soglie future.
ALTER TABLE agents.invoice_notification_settings
  ADD COLUMN IF NOT EXISTS notifications_enabled_at TIMESTAMPTZ;

-- Popola retroattivamente per i clienti già configurati: usa updated_at come proxy.
UPDATE agents.invoice_notification_settings
SET notifications_enabled_at = updated_at
WHERE notifications_enabled_at IS NULL;
