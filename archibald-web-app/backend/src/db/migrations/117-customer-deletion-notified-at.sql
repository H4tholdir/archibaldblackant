-- Traccia quando è stata inviata la notifica "Cliente eliminato da ERP".
-- Prima assenza dall'ERP → solo soft-delete (deleted_at), nessuna notifica.
-- Seconda assenza consecutiva → notifica + deletion_notified_at = NOW().
-- Al ripristino, entrambi i campi vengono azzerati.

ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS deletion_notified_at TIMESTAMPTZ;
