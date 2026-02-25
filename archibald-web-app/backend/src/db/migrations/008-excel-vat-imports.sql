-- Migration 008: Excel VAT import history tracking

CREATE TABLE IF NOT EXISTS shared.excel_vat_imports (
  id            SERIAL PRIMARY KEY,
  filename      TEXT NOT NULL,
  uploaded_by   TEXT NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_rows    INTEGER NOT NULL DEFAULT 0,
  matched       INTEGER NOT NULL DEFAULT 0,
  unmatched     INTEGER NOT NULL DEFAULT 0,
  vat_updated   INTEGER NOT NULL DEFAULT 0,
  price_updated INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'completed'
);

CREATE INDEX IF NOT EXISTS idx_excel_vat_imports_uploaded_at
  ON shared.excel_vat_imports (uploaded_at DESC);
