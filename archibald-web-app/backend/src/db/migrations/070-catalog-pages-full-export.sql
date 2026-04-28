BEGIN;

-- Migration 070: Introduce shared.catalog_pages per immagazzinare TUTTE le info
-- estratte dal catalogo Komet 2025 pagina per pagina (leggende, indici, sezioni,
-- pittogrammi, note revisore, ecc.) ed estende catalog_entries con i nuovi campi
-- organici scoperti dall'estrazione Layer 2 con Sonnet 4.6.

-- ─── 1. Tabella catalog_pages ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared.catalog_pages (
    page_number          INTEGER PRIMARY KEY,
    page_type            TEXT,          -- intro_toc | legend | product_single | product_multi | synthesis_table | section_header | other
    catalog_section      TEXT,          -- sezione catalogo leggibile (es. "Diamantate Studio")
    page_number_catalog  INTEGER,       -- numero di pagina stampato sul PDF (può differire dall'indice)
    page_level_info      JSONB,         -- tutto il contenuto non-prodotto: leggende, indice, icone, spiegazioni, pittogrammi
    reviewer_notes       TEXT,          -- note interne del revisore (non esportate verso la PWA)
    status               TEXT NOT NULL DEFAULT 'pending', -- approved | flagged | discarded | pending
    reviewed_at          TIMESTAMPTZ,
    extraction_model     TEXT           -- modello usato per l'estrazione (claude-sonnet-4-6, ecc.)
);

COMMENT ON TABLE shared.catalog_pages IS
  'Metadati e contenuto non-prodotto di ogni pagina del catalogo Komet 2025. '
  'Ogni pagina approvata nel review tool produce un record qui. '
  'Interrogabile per leggende, indici di sezione, spiegazioni pittogrammi, ecc.';

COMMENT ON COLUMN shared.catalog_pages.page_level_info IS
  'JSONB organico: grit_color_legend, pictogram_legend, section_overview, '
  'application_icons, table_structure, ordering_options, numbering_system, ecc. '
  'Il contenuto dipende dal page_type — non ha schema fisso.';

-- ─── 2. Nuove colonne su catalog_entries ─────────────────────────────────────

ALTER TABLE shared.catalog_entries
  ADD COLUMN IF NOT EXISTS page_number            INTEGER REFERENCES shared.catalog_pages(page_number),
  ADD COLUMN IF NOT EXISTS shank_body_color       TEXT,          -- colore corpo gambo (es. "gold" per 4COMP)
  ADD COLUMN IF NOT EXISTS drawing_2d_bbox        FLOAT[],       -- [left%, top%, width%, height%] disegno 2D 1:1
  ADD COLUMN IF NOT EXISTS photo_bbox             FLOAT[],       -- [left%, top%, width%, height%] foto reale prodotto
  ADD COLUMN IF NOT EXISTS operative_image_bbox   FLOAT[],       -- [left%, top%, width%, height%] foto clinica/operativa
  ADD COLUMN IF NOT EXISTS pictograms             JSONB,         -- [{symbol, meaning}] pittogrammi visibili
  ADD COLUMN IF NOT EXISTS application_indications TEXT[],       -- indicazioni applicative (es. "anterior preparation")
  ADD COLUMN IF NOT EXISTS material               TEXT,          -- materiale (diamond | carbide | ceramic | rubber | ecc.)
  ADD COLUMN IF NOT EXISTS coating                TEXT,          -- rivestimento se menzionato
  ADD COLUMN IF NOT EXISTS total_length_mm        FLOAT,         -- lunghezza totale strumento
  ADD COLUMN IF NOT EXISTS neck_length_mm         FLOAT,         -- lunghezza collo
  ADD COLUMN IF NOT EXISTS taper_angle_deg        FLOAT,         -- angolo conicità
  ADD COLUMN IF NOT EXISTS us_bur_equivalent      TEXT;          -- equivalente bur US (es. "330", "245")

COMMENT ON COLUMN shared.catalog_entries.shank_body_color IS
  'Colore del corpo del gambo separato dal ring_color. '
  'Es: 4COMP ha anello blu (ring_colors) + gambo dorato (shank_body_color=gold).';

COMMENT ON COLUMN shared.catalog_entries.drawing_2d_bbox IS
  'Posizione del disegno tecnico 2D scala 1:1 nella pagina PDF, '
  'espressa come [left%, top%, width%, height%] rispetto alla dimensione pagina.';

COMMENT ON COLUMN shared.catalog_entries.pictograms IS
  'Array JSONB di pittogrammi visibili vicino al prodotto: '
  '[{"symbol": "tooth outline", "meaning": "anterior teeth"}, ...]';

-- ─── 3. Indici ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_catalog_pages_type
  ON shared.catalog_pages (page_type)
  WHERE page_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_pages_section
  ON shared.catalog_pages (catalog_section)
  WHERE catalog_section IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_pages_status
  ON shared.catalog_pages (status);

CREATE INDEX IF NOT EXISTS idx_catalog_pages_level_info
  ON shared.catalog_pages USING GIN (page_level_info)
  WHERE page_level_info IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_entries_page_number
  ON shared.catalog_entries (page_number)
  WHERE page_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_entries_pictograms
  ON shared.catalog_entries USING GIN (pictograms)
  WHERE pictograms IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_entries_application_indications
  ON shared.catalog_entries USING GIN (application_indications)
  WHERE application_indications IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_entries_shank_body_color
  ON shared.catalog_entries (shank_body_color)
  WHERE shank_body_color IS NOT NULL;

COMMIT;
