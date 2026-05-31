-- Cache PDF fatture scaricati dall'ERP per allegato nelle email di notifica.
-- invoice_pdf_data: contenuto binario del PDF (null = non ancora scaricato)
-- invoice_pdf_synced_at: quando è stato scaricato
ALTER TABLE agents.order_invoices
  ADD COLUMN IF NOT EXISTS invoice_pdf_data BYTEA,
  ADD COLUMN IF NOT EXISTS invoice_pdf_synced_at TIMESTAMPTZ;
