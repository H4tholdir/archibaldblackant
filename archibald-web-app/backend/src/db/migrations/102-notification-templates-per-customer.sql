-- Aggiunge customer_erp_id (nullable) per template per-cliente.
-- NULL = template agente (si applica a tutti i clienti).
-- Usa indice funzionale con COALESCE per gestire NULL in modo deterministico.
ALTER TABLE agents.notification_message_templates
  ADD COLUMN IF NOT EXISTS customer_erp_id TEXT;

-- Rimuove il vincolo UNIQUE esistente (nome generato automaticamente, rimosso via DO)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'agents.notification_message_templates'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE agents.notification_message_templates DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_unique
  ON agents.notification_message_templates
  (user_id, COALESCE(customer_erp_id, ''), event_type, tone, channel);
