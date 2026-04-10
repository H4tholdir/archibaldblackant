BEGIN;

-- Migration 052 non ha ricreato correttamente product_gallery in prod:
-- la tabella ha ancora 'image_url' invece di 'url' e manca 'alt_text'.
-- La tabella è vuota (0 righe), quindi drop + recreate è sicuro.

DROP TABLE IF EXISTS shared.product_gallery CASCADE;

CREATE TABLE shared.product_gallery (
  id           SERIAL PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES shared.products(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  image_type   TEXT NOT NULL CHECK (image_type IN (
                 'catalog_render',
                 'product_photo',
                 'application_photo',
                 'web'
               )),
  source       TEXT NOT NULL,
  alt_text     TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, url)
);

CREATE INDEX idx_gallery_product ON shared.product_gallery(product_id);

COMMIT;
