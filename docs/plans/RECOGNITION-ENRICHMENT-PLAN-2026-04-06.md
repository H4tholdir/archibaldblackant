# Piano: Recognition & Enrichment — Architettura Nuova
*Data: 2026-04-06 — v3 post catalog-study (category-first + 9 categorie + root_post in scope)*

---

## Contesto — Perché ricominciamo da zero

Il sistema precedente derivava i dati di identificazione **parsando il codice ISO** degli strumenti
(`komet-code-parser`). Questa strategia ha prodotto errori sistematici:
- Grit ring assegnato come 'blue' di default alle famiglie senza prefisso (es. `879` → null reale)
- Shape maps incomplete per categorie intere (sonici, gommini, dischi non gestiti)
- Dipendenza da logica hardcoded invece che dal catalogo reale

**Nuova strategia**: il catalogo Komet è la bibbia. Claude lo legge direttamente.

---

## Architettura in tre pilastri

```
PILASTRO 1          PILASTRO 2               PILASTRO 3
─────────────       ────────────────────     ──────────────────────
Catalog             Product Enrichment       Identification
Ingestion           ──────────────────────   ──────────────────────
──────────          da catalogo (bulk        Foto + righello
Sonnet legge        + trigger automatico)    →
pag. 5–782          da web (on-demand)       Sonnet legge catalogo
→                   →                        →
catalog_entries     product_details          codice prodotto
catalog_reading_    product_gallery
guide               product_web_resources
```

---

## Step 0 — Cleanup

### 0a. Cancellazione file fisici

⚠️ **ATOMICITÀ OBBLIGATORIA**: delete e rewrite skeleton devono stare nello stesso commit.
`recognition-engine.ts` importa ancora `calculateHeadSizeMm` da `komet-code-parser` (riga 9) —
se si cancella il file sorgente prima di riscrivere il motore, il build si rompe immediatamente. [C-1]

```
DELETE:
  backend/src/recognition/komet-code-parser.ts
  backend/src/recognition/komet-code-parser.spec.ts
  backend/src/db/repositories/instrument-features.ts      ← [C-2: tabella droppata da 052]
  backend/src/db/repositories/instrument-features.spec.ts ← [C-2]
  backend/src/operations/handlers/komet-code-parser.ts
  backend/src/operations/handlers/komet-code-parser.spec.ts
  backend/src/operations/handlers/komet-web-scraper.ts
  backend/src/operations/handlers/komet-web-scraper.spec.ts
  backend/src/services/image-preprocessing-service.ts     ← [I-NEW-1: orfano dopo rewrite engine]
  backend/src/services/image-preprocessing-service.spec.ts ← [I-NEW-1]
  backend/test-recognition-e2e.mjs                        (può già essere assente — skip se non esiste) [I-4]
  docs/plans/ENRICHMENT-RECOGNITION-PLAN-2026-04-06.md

REWRITE ATOMICO (skeleton con TODO — nello stesso commit dei DELETE sopra):
  backend/src/recognition/recognition-engine.ts
    → Rimuovere: import komet-code-parser, calculateHeadSizeMm, lookupByFeatures,
                 progressiveLookup, measureHeadShankRatio, resolveShankType,
                 buildRecognitionResult, SHAPE_SYNONYMS, broadCandidates
    → Conservare: export runRecognitionPipeline (firma invariata), checkBudget/consumeBudget pattern
  backend/src/recognition/types.ts
    → Rimuovere: variant 'filter_needed' da RecognitionResult, tipo FilterQuestion [I-1]
    → Aggiungere: IdentificationResult (vedi Step 5a)
  backend/src/recognition/recognition-engine.spec.ts
    → Riscrivere: eliminare test buildRecognitionResult/resolveShankType/filter_needed
    → Conservare (come pattern): test budget_exhausted su Vision API error
    → appendRecognitionLog: non passare come dep — mockare a livello modulo con
      vi.mock('../db/repositories/recognition-log') oppure iniettare in EngineDeps [S-NEW-1]
  backend/src/services/anthropic-vision-service.ts
    → Riscrivere: tool use + catalog search (vedi Step 5)
```

MODIFICA (stesso commit Step 0a — cascata da deletion dei vecchi tipi):
```
backend/src/operations/operation-types.ts
  → Rimuovere da OPERATION_TYPES array: 'komet-code-parser', 'komet-web-scraper'
  → Rimuovere da SCHEDULED_SYNCS set: 'komet-code-parser', 'komet-web-scraper'  [C-NEW-1]
  → Rimuovere da OPERATION_PRIORITIES: entries 'komet-code-parser', 'komet-web-scraper'  [C-NEW-1]
  → Aggiungere a OPERATION_TYPES: 'catalog-ingestion', 'catalog-product-enrichment', 'web-product-enrichment'
  → Aggiungere a OPERATION_PRIORITIES: priorità per i 3 nuovi tipi
  → NON aggiungere i 3 nuovi tipi a SCHEDULED_SYNCS (catalog ingestion è manuale one-time) [C-NEW-1]

backend/src/operations/handlers/index.ts        [C-4]
  → Rimuovere righe 23–24: re-export createKometCodeParserHandler, createKometWebScraperHandler

backend/src/operations/queue-router.ts          [C-4]
  → Rimuovere entries 'komet-code-parser' e 'komet-web-scraper' da QUEUE_ROUTING
  → Aggiungere: 'catalog-ingestion' → 'enrichment', 'catalog-product-enrichment' → 'enrichment',
                'web-product-enrichment' → 'enrichment'

backend/src/operations/queue-router.spec.ts     [C-4]
  → Aggiornare expectedRouting: rimuovere vecchi tipi, aggiungere nuovi

backend/src/operations/operation-types.spec.ts  [C-4]
  → Riscrivere describe('recognition operation types'): sostituire 'komet-*' con nuovi tipi

backend/src/main.ts                             [C-4]
  → Righe 1101–1102: rimuovere registrazione createKometCodeParserHandler e createKometWebScraperHandler

backend/src/main.spec.ts                        [C-4]
  → Righe 385–386: rimuovere 'komet-code-parser' e 'komet-web-scraper' dall'array expected

backend/src/server.ts                           [C-2]
  → Rimuovere import InstrumentFeatureRow + query ~riga 587 che legge shared.instrument_features

backend/src/routes/products.ts                  [C-2]
  → Rimuovere import InstrumentFeatureRow/GalleryRow (righe 8–9)
  → Rimuovere getInstrumentFeatures/getProductGallery da router deps type (righe 112–113)

backend/src/operations/handlers/recognition-feedback.ts  [C-3]
  → image_url: imageUrl → url: imageUrl nella chiamata insertGalleryImage
  → image_type: 'field_scan' → 'product_photo' (enum vecchio non esiste nel nuovo CHECK)

backend/src/db/repositories/product-gallery.ts  [I-5]
  → Rinominare image_url → url in: GalleryRow type, firma insertGalleryImage,
    INSERT SQL, SELECT SQL, ON CONFLICT clause
  → Aggiornare GalleryImageType enum: rimuovere 'instrument_white_bg'|'marketing'|'field_scan'|...
    sostituire con: 'catalog_render'|'product_photo'|'application_photo'|'web'
```

### 0b. Pulizia memoria

```
DELETE:  memory/project_recognition_next_steps.md  ← già fatto
UPDATE:  memory/project_komet_pkb.md  → nuovo scope ← già fatto
UPDATE:  memory/MEMORY.md             → rimozione riferimenti vecchi ← già fatto
```

### 0c. Migration 052 — DROP old + CREATE new schema

⚠️ **Ordine deploy obbligatorio**: 050 → 051 → 052 in sequenza. [C-2]
Le migration 050 e 051 non sono ancora in prod (prod è a 049). Applicarle tutte e tre insieme.

```sql
BEGIN;

-- ─── DROP tabelle vecchie da migration 050 ───────────────────────────────────
-- ⚠️ product_gallery: DROP ricrea lo schema (vecchio ha image_url, nuovo ha url)
-- Dati old-system persi intenzionalmente — tabella mai popolata in prod [C-1]
DROP TABLE IF EXISTS shared.instrument_features CASCADE;
DROP TABLE IF EXISTS shared.competitor_equivalents CASCADE;
DROP TABLE IF EXISTS shared.product_details CASCADE;
DROP TABLE IF EXISTS shared.product_gallery CASCADE;

-- ─── Aggiorna recognition_log: rimuove result_state 'filter_needed' [C-5] ───
ALTER TABLE system.recognition_log
  DROP CONSTRAINT IF EXISTS recognition_log_result_state_check,
  ADD CONSTRAINT recognition_log_result_state_check
    CHECK (result_state IN ('match', 'shortlist', 'not_found', 'error'));

-- ─── KEEP (nessuna modifica): ─────────────────────────────────────────────────
--   system.recognition_budget
--   system.recognition_cache

-- ─── Nuove tabelle ────────────────────────────────────────────────────────────

-- Regole di lettura del catalogo (singleton per page_range) [m-1: UNIQUE aggiunto]
CREATE TABLE shared.catalog_reading_guide (
  id           SERIAL PRIMARY KEY,
  content      JSONB NOT NULL,
  page_range   TEXT NOT NULL DEFAULT '5-9',
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page_range)
);

-- Una riga per ogni famiglia di prodotti nel catalogo (es. 879, 8879, 6879)
CREATE TABLE shared.catalog_entries (
  id                    SERIAL PRIMARY KEY,
  family_codes          TEXT[]   NOT NULL,  -- ['879','8879','6879','879EF']
  catalog_page          INT      NOT NULL,
  product_type          TEXT     NOT NULL,
  -- 'rotary_diamond'   — diamantati clinici FG/CA/HP (ISO 6360 mat.8xx)
  -- 'rotary_carbide'   — carburo di tungsteno clinici FG/CA/HP (ISO 6360 mat.3xx)
  -- 'diao'             — KP prefix, gambo oro rosato, diamante abrasivo
  -- 'sonic'            — punte soniche, connessione filettata (nessun gambo ISO)
  -- 'polisher_composite' | 'polisher_ceramic' | 'polisher_amalgam'
  --                    — gommini/lucidatori; grit = colore testa (non anello)
  -- 'endodontic'       — lime NiTi/acciaio, reamers, Gates Glidden, endo speciali
  -- 'root_post'        — perni radicolari (CeraPost, Titanio, OptiPost, Vario)
  -- 'lab_carbide'      — carburo laboratorio (GSQ/FSQ/UK/ACR/E/SGFA/...)
  -- 'accessory'        — guttapercha, punte carta, puntine, kit
  -- 'other'
  shape_description     TEXT,
  material_description  TEXT,
  identification_clues  TEXT,
  grit_options          JSONB,
  -- Struttura dipende da product_type — grit è codificato in 3 modi diversi:
  --   rotary_diamond:  [{grit_indicator_type:'ring_color', visual_cue:'blue',
  --                      grit_level:'standard', label:'standard', micron:107, prefix_pattern:'8xxx'}]
  --   rotary_carbide:  [{grit_indicator_type:'blade_count', visual_cue:'12',
  --                      grit_level:'standard', label:'normal cross-cut'}]
  --   polisher_*:      [{grit_indicator_type:'head_color', visual_cue:'blue',
  --                      grit_level:'coarse', label:'coarse step 1'}]
  --   diao/sonic/root_post: [{grit_indicator_type:'none'}]
  shank_options         JSONB,   -- [{code:'314',type:'fg',length_mm:19},{code:'104',type:'hp',length_mm:44.5}]
  size_options          INT[],   -- [10,12,14,16,18,21,23]
  rpm_max               INT,
  clinical_indications  TEXT,
  usage_notes           TEXT,
  pictograms            JSONB,   -- [{symbol:'...',meaning:'...'}]
  packaging_info        JSONB,   -- {units_per_pack:5, sterile:false, single_use:false}
  notes                 TEXT,
  raw_extraction        JSONB    NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalog_entries_page   ON shared.catalog_entries(catalog_page);
CREATE INDEX idx_catalog_entries_type   ON shared.catalog_entries(product_type);
CREATE INDEX idx_catalog_entries_codes  ON shared.catalog_entries USING GIN(family_codes);
-- [I-2: FTS con 'simple' per compatibilità multilingue italiano/tedesco/inglese]
CREATE INDEX idx_catalog_entries_fts ON shared.catalog_entries
  USING GIN(to_tsvector('simple',
    COALESCE(shape_description,'') || ' ' ||
    COALESCE(material_description,'') || ' ' ||
    COALESCE(identification_clues,'')));

-- Dati arricchiti per ogni singolo prodotto (da catalogo + web)
CREATE TABLE shared.product_details (
  product_id            TEXT PRIMARY KEY REFERENCES shared.products(id) ON DELETE CASCADE,
  catalog_family_code   TEXT,
  catalog_page          INT,
  description_it        TEXT,
  description_en        TEXT,
  clinical_indications  TEXT,
  rpm_max               INT,
  head_length_mm        NUMERIC,
  usage_notes           TEXT,
  pictograms            JSONB,
  packaging_units       INT,
  sterile               BOOLEAN,
  single_use            BOOLEAN,
  notes                 TEXT,
  catalog_enriched_at   TIMESTAMPTZ,
  web_enriched_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Gallery immagini per prodotto (schema nuovo: url invece di image_url) [C-1]
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

-- Risorse web per prodotto (video, PDF, articoli, promozioni)
CREATE TABLE shared.product_web_resources (
  id            SERIAL PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES shared.products(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN (
                  'video', 'pdf', 'article', 'promotion', 'image'
                )),
  url           TEXT NOT NULL,
  title         TEXT,
  description   TEXT,
  source        TEXT,
  language      TEXT DEFAULT 'en',
  scraped_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, url)
);

CREATE INDEX idx_webres_product ON shared.product_web_resources(product_id);
CREATE INDEX idx_webres_type    ON shared.product_web_resources(product_id, resource_type);

COMMIT;
```

---

## Step 1 — PDF Catalogo su VPS + Page Renderer

### 1a. Upload PDF su VPS

```bash
# Crea directory sul VPS
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "mkdir -p /home/deploy/archibald-app/catalog"

# Upload PDF
scp -i /tmp/archibald_vps \
  "/Users/hatholdir/Downloads/Catalogo_interattivo_2025 (1).pdf" \
  deploy@91.98.136.198:/home/deploy/archibald-app/catalog/komet-catalog-2025.pdf
```

**Aggiornare `docker-compose.yml`**: aggiungere volume mount al service `backend` [m-3]:
```yaml
volumes:
  - ./catalog:/app/catalog:ro
```

**Aggiungere env var** (`.env` + `.env.example`):
```
CATALOG_PDF_PATH=/app/catalog/komet-catalog-2025.pdf
```

### 1b. Backend: `CatalogPdfService`

**File**: `backend/src/services/catalog-pdf-service.ts`

**Dipendenza**: `poppler-utils` sul VPS (NON pdfjs-dist — troppo fragile in Node.js senza
  `canvas` nativo). [C-4]

**Dockerfile** del backend: aggiungere [C-4]:
```dockerfile
RUN apt-get update && apt-get install -y poppler-utils && rm -rf /var/lib/apt/lists/*
```

Implementazione:
```typescript
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const execFileAsync = promisify(execFile)

export type CatalogPdfService = {
  getPageAsBase64(pageNumber: number): Promise<string>
  getTotalPages():                     Promise<number>
}

export function createCatalogPdfService(pdfPath: string): CatalogPdfService {
  return {
    async getPageAsBase64(pageNumber) {
      const outPrefix = join(tmpdir(), `komet-page-${pageNumber}-${Date.now()}`)
      await execFileAsync('pdftoppm', [
        '-png', '-r', '150',
        '-f', String(pageNumber), '-l', String(pageNumber),
        pdfPath, outPrefix,
      ])
      const outFile = `${outPrefix}-${String(pageNumber).padStart(4, '0')}.png`
      const buf = await readFile(outFile)
      await unlink(outFile).catch(() => {})
      return buf.toString('base64')
    },
    async getTotalPages() {
      const { stdout } = await execFileAsync('pdfinfo', [pdfPath])
      const m = stdout.match(/Pages:\s+(\d+)/)
      return m ? parseInt(m[1]) : 782
    },
  }
}
```

Risoluzione: **150 DPI** → ~800×1100px per pagina A4, sufficiente per Sonnet Vision.

---

## Step 2 — Catalog Ingestion Operation

**File**: `backend/src/operations/handlers/catalog-ingestion.ts`

### 2a. Estrazione reading guide (pagine 5–9)

Invia le pagine 5–9 insieme come immagini a Sonnet:

```
Sei un esperto di strumenti dentali Komet. Stai analizzando il catalogo Komet 2025.
Queste pagine (5-9) contengono le istruzioni di lettura del catalogo.

Estrai e struttura in JSON (usa terminologia INGLESE per tutti i campi testuali,
così il motore di ricerca FTS funziona correttamente):
- Come si legge una scheda prodotto (icone, simboli, layout)
- Tutti i tipi di gambo: codice, nome_en, tipo (fg|hp|ca|grip|unmounted),
  length_mm, diameter_mm  [m-4: tutti i gambi inclusi 313/315/316/103/105/106/204/205/206]
- Tutti i pittogrammi con significato in inglese
- Sistema granulometria PER CATEGORIA (tre sistemi distinti):
    diamond: anello alla base testa → ring_color → μm → grit_level
    carbide: numero lame sul corpo → blade_count → grit_level
    polisher: colore dell'intera testa → head_color → grit_level
- Sistema misura perni radicolari: collar color → diametro canale
    (yellow=050=0.5mm, orange=070=0.7mm, red=090=0.9mm, blue=110=1.1mm)
- Codice misura bur → diametro testa in mm (005=0.5mm ... 080=8.0mm)
- Regole confezione (sterile, monouso, pezzi/confezione)
```

→ `INSERT INTO shared.catalog_reading_guide (content, page_range) VALUES ($1, '5-9')
   ON CONFLICT (page_range) DO UPDATE SET content=$1, extracted_at=NOW()`

### 2b. Estrazione famiglie prodotto (pagine 10–782)

Per ogni pagina, invia a Sonnet con prompt:

```
Pagina {N} del catalogo Komet 2025.
Reading guide: {reading_guide_json}

Per ogni famiglia trovata in questa pagina estrai JSON:
{
  "family_codes": ["879", "8879", "6879", "879EF"],
  "product_type": "rotary_diamond|rotary_carbide|diao|sonic|polisher_composite|polisher_ceramic|polisher_amalgam|endodontic|root_post|lab_carbide|accessory|other",
  "shape_description": "visual shape description IN ENGLISH",
  "material_description": "material and surface description IN ENGLISH",
  "identification_clues": "what visually distinguishes this family IN ENGLISH",
  "grit_options": [
    {
      "grit_indicator_type": "ring_color|blade_count|head_color|none",
      "visual_cue": "blue|pink|gray|yellow|red|green|black|transparent|12|30",
      "grit_level": "ultrafine|extrafine|fine|standard|coarse|super_coarse",
      "label": "standard|fine|coarse|...",
      "prefix_pattern": "none|EF|8xxx|6xxx|5xxx|2xxx"
    }
  ],
  // ring_color → diamond: anello colorato alla BASE della testa
  // blade_count → carbide: visual_cue è il numero di lame (stringa)
  // head_color  → polisher: visual_cue è il colore dell'intera testa
  // none        → diao/sonic/root_post: nessun sistema grit
  "shank_options": [
    {"code": "314", "type": "fg", "length_mm": 19},
    {"code": "104", "type": "hp", "length_mm": 44.5}
  ],
  "size_options": [10, 12, 14, 16, 18],
  "rpm_max": 160000,
  "clinical_indications": "IN ENGLISH",
  "usage_notes": "IN ENGLISH",
  "pictograms": [{"symbol": "...", "meaning": "IN ENGLISH"}],
  "packaging_info": {"units_per_pack": 5, "sterile": false, "single_use": false},
  "notes": "IN ENGLISH"
}
IMPORTANT: list ALL available shank options for this family, not just the most common one.
Se la pagina non contiene prodotti restituisci [].
```

**Strategia batch e checkpoint** [I-3: usa catalog_entries come checkpoint]:
```typescript
// Resume point: legge ultima pagina già processata
const { rows } = await pool.query(
  'SELECT MAX(catalog_page) AS last_page FROM shared.catalog_entries'
)
const startPage = (rows[0].last_page ?? 9) + 1   // riparte dalla prossima pagina non processata

for (let page = startPage; page <= totalPages; page++) {
  // ... chiama Sonnet, inserisce in catalog_entries
  await delay(500)   // rate limit Sonnet: 50 req/min
}
```

**Retry**: 3× per errore Sonnet, poi skip con `console.error` e avanza.

**Costo realistico**: ~750 pagine × (~1200 img + ~1500 reading_guide + ~800 ctx) input +
  ~1000 output = ~3500 tok/pag × $3/M in + $15/M out ≈ **~$15–20 totale** [I-1]

### 2c. Scheduling

Operazione manuale una-tantum, triggherata da admin panel.
Non schedulata automaticamente (il catalogo cambia ~1 volta/anno).

---

## Step 3 — Product Enrichment da Catalogo

**File**: `backend/src/operations/handlers/catalog-product-enrichment.ts`

### 3a. Bulk enrichment (one-time)

Per ogni prodotto in `shared.products` senza `product_details.catalog_enriched_at`:

1. Estrai `family_code` da `products.name` (es. `"879.104.014"` → `"879"`)
2. `SELECT ... FROM shared.catalog_entries WHERE family_codes @> ARRAY[$1]`
3. Trovato → `INSERT INTO shared.product_details ... ON CONFLICT DO UPDATE`
4. Non trovato → log `catalog_not_found`, nessuna riga inserita

### 3b. Trigger automatico — nuovo prodotto [C-6]

**File da modificare**: `backend/src/operations/handlers/sync-products.ts`

Aggiungere parametro al factory `createSyncProductsHandler`:
```typescript
// Firma attuale (semplificata):
function createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot,
  softDeleteGhosts, trackProductCreated, onProductsChanged?, onProductsMissingVat?)

// Nuova firma — aggiungere parametro opzionale:
function createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot,
  softDeleteGhosts, trackProductCreated, onProductsChanged?, onProductsMissingVat?,
  onNewProduct?: (productId: string) => Promise<void>)   // ← nuovo
```

Dopo INSERT nuovo prodotto:
```typescript
if (onNewProduct) {
  await onNewProduct(productId)   // enqueue catalog + web enrichment
}
```

**File da modificare**: `backend/src/main.ts` [C-6: aggiunto]
→ Passare la funzione di enqueue al factory:
```typescript
const onNewProduct = async (productId: string) => {
  await enrichmentQueue.add('catalog-product-enrichment', { productId })
  await enrichmentQueue.add('web-product-enrichment', { productId }, { delay: 30_000 })
}
```

---

## Step 4 — Web Enrichment (on-demand + automatico)

**File**: `backend/src/operations/handlers/web-product-enrichment.ts`

### 4a. Fonti da scrapare per ogni prodotto

**Priorità 1 — Komet ufficiali**:
- `https://kometuk.com/products/{handle}` → descrizione, RPM, varianti, immagini
- `https://www.kometstore.de/de-de/products/products-kometdental/{family_code}.aspx`
  → dati tecnici completi in tedesco

**Priorità 2 — Web search**:
- `"{family_code} Komet" clinical OR technique OR indication` → articoli
- `"{family_code} Komet" video OR youtube` → tutorial
- `"{family_code} Komet" IFU OR instructions OR pdf` → PDF tecnici
- `"{description} Komet" promotion OR offer 2026` → promozioni

### 4b. Trigger

- **Automatico**: `delay: 30_000` dopo catalog-enrichment del nuovo prodotto (vedi Step 3b)
- **On-demand**: `POST /api/operations/enqueue { type: 'web-product-enrichment', data: { productId } }`

### 4c. Storage

- Immagini → `shared.product_gallery`
- Video, PDF, articoli, promozioni → `shared.product_web_resources`
- Descrizione + RPM → aggiorna `shared.product_details` se campi ancora NULL

---

## Step 5 — Nuova Identification Logic

### 5a. `CatalogVisionService`

**File**: `backend/src/services/anthropic-vision-service.ts` (riscrittura completa)

```typescript
export type IdentificationResult = {
  productCode: string | null
  familyCode:  string | null
  confidence:  number              // 0.0 – 1.0
  resultState: 'match' | 'shortlist' | 'not_found' | 'error'
  candidates:  string[]            // se shortlist
  catalogPage: number | null
  reasoning:   string
  usage:       { inputTokens: number; outputTokens: number }
}

export type CatalogVisionService = {
  identifyFromImage(imageBuffer: Buffer): Promise<IdentificationResult>
}
```

### 5b. Tool use — Sonnet naviga il catalogo

**Tool 1: `search_catalog`**

```typescript
const SEARCH_CATALOG_TOOL: Anthropic.Tool = {
  name: 'search_catalog',
  description: `Search the Komet catalog database for product families matching
    your visual description. Call this after Step 2 (visual analysis).
    Provide the most detailed description possible: instrument type, shape,
    material, shank length measured from ruler, colored ring or absence.
    Returns up to 10 matching catalog entries ordered by catalog page.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      shank_length_mm: {
        type: 'number',
        description: 'Shank length measured from ruler in mm (optional)',
      },
      product_type: {
        type: 'string',
        description: 'rotary_diamond|rotary_carbide|diao|sonic|polisher_composite|polisher_ceramic|polisher_amalgam|endodontic|root_post|lab_carbide|accessory|other',
      },
      description: {
        type: 'string',
        description: 'Full visual description of the instrument in English',
      },
    },
    required: ['description'],
  },
}
```

**Query SQL** per `search_catalog` [C-3: riscritta con parentesi corrette e NULL handling]:

```sql
SELECT id, family_codes, catalog_page, product_type,
       shape_description, material_description, identification_clues,
       grit_options, shank_options, size_options, rpm_max, clinical_indications
FROM shared.catalog_entries
WHERE
  (
    $1::numeric IS NULL
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(shank_options) s
      WHERE ABS((s->>'length_mm')::numeric - $1::numeric) < 5
    )
  )
  AND ($2::text IS NULL OR product_type = $2)
  AND (
    $3 = ''
    OR to_tsvector('simple',
         COALESCE(shape_description,'') || ' ' ||
         COALESCE(material_description,'') || ' ' ||
         COALESCE(identification_clues,''))
       @@ plainto_tsquery('simple', $3)
  )
ORDER BY catalog_page
LIMIT 10
```

Nota: `$1` può essere NULL (shank_length opzionale) — in TypeScript passare `null` come parametro
`pg`, che lo manda come SQL NULL, rendendo `$1::numeric IS NULL` → TRUE → skip filtro shank.

**Tool 2: `get_catalog_page`**

```typescript
const GET_CATALOG_PAGE_TOOL: Anthropic.Tool = {
  name: 'get_catalog_page',
  description: `Get a specific page from the Komet 2025 catalog as an image.
    Use this to visually compare the photographed instrument with catalog images
    and confirm the identification. The catalog page number is returned in
    search_catalog results.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      page_number: { type: 'integer', minimum: 1, maximum: 782 },
    },
    required: ['page_number'],
  },
}
```

### 5c. Prompt di identificazione [m-4: lunghezze gambo complete] [CS-1: category-first]

```
You are analyzing a photo of a Komet dental instrument.
The Komet catalog page 7 ruler (0–160 mm scale) is visible in the photo.

STEP 0 — IDENTIFY CATEGORY (this determines ALL subsequent steps):
Look at the overall impression of the object before anything else.

  Rose-gold / pink-gold shank or body color?      → diao
  Rubber/silicone: soft, matte, cup or disc?       → polisher_composite / polisher_ceramic / polisher_amalgam
  Very long tapered metal tip + colored stop ring? → endodontic (NiTi file)
  Small round/bullet head on long narrow shank?    → endodontic (Gates Glidden)
  Flat wedge/triangle tip, threaded base, no ISO shank? → sonic
  Tapered smooth or threaded metal pin (no rotary shank)? → root_post
  Large head, no clinical shank or very long lab shank?   → lab_carbide
  Silver/grey metal, visible helical CUTTING FLUTES on head? → rotary_carbide
  Grey/dark head, matte abrasive texture (no flutes) + ring? → rotary_diamond
  Default if unclear: → rotary_diamond

STEP 1 — MEASURE from the ruler (rotary_diamond / rotary_carbide / diao / lab_carbide only):
- Total instrument length
- Shank length (from base to head junction)
- Head length (from junction to tip)
→ Shank length identifies the shank code:
  FG (turbine):         313=18mm, 314=19mm, 315=21mm, 316=25mm
  CA (contra-angle):    204=22mm, 205=26mm, 206=34mm
  HP (straight hand.):  103=34mm, 104=44.5mm, 105=65mm, 106=70mm
→ Skip this step for: polisher, sonic, endodontic, root_post

STEP 2 — OBSERVE (category-specific):

  For rotary_diamond:
    - Head shape (torpedo, flame, round, cylinder, pear, inverted cone, diabolo...)
    - Colored ring at the BASE of the head where it meets the neck:
        transparent/none=ultrafine | yellow=extrafine | red=fine | blue=standard | green=coarse | black=super-coarse
    - Prefix hint if ring absent: could be ultrafine (8μm), note very faint transparent band

  For rotary_carbide:
    - Head shape
    - Count blade density (cutting flutes on head):
        ~30 blades = ultrafine | ~16-20 = fine | ~8-12 = standard | ~6 = coarse
    - Cross-cut pattern? (double-cut carbides, e.g. H33)
    - Note: carbide color ring is on the SHANK NECK (= series marker, not grit)

  For diao:
    - Head shape (already know: material = diao from rose-gold color)
    - Head size from ruler

  For polisher_*:
    - Head BODY COLOR = grit: blue=coarse | pink=medium | gray/white=fine | yellow=ultrafine
    - Head shape: pointed_cup | torpedo | truncated_cone | flat_disc | mushroom | ring/unmounted
    - Shank type: FG / CA / unmounted

  For endodontic (NiTi file):
    - Stop ring / handle color = ISO tip size:
        white=015 | yellow=020 | red=025 | blue=030 | green=035 | black=040 | white=045 | yellow=050
    - Visual taper (narrow vs wide convergence along the body)
    - Reciprocating single-file (Procodile) vs multi-file kit

  For root_post:
    - Body material: white ceramic (CeraPost) | grey titanium | gold-platinum alloy
    - Collar color = canal size: yellow=050 | orange=070 | red=090 | blue=110
    - Surface: smooth tapered | threaded straight | christmas-tree threaded
    - Has a coronal head? (for direct build-up variants)

  For sonic:
    - Tip geometry (flat blade, lance, triangle, beak)
    - Angulation
    - No ISO shank — identify by shape only

STEP 3 — SEARCH the catalog:
Call search_catalog with your category (product_type), description, and measured
shank length (if applicable).

STEP 4 — VISUAL CONFIRMATION:
Call get_catalog_page with the catalog_page number from the best candidate.
Compare the photo with the catalog image. Confirm or reject.
If rejected, try the next candidate or search again.

STEP 5 — IDENTIFY:
Return the product code as FAMILY.SHANK.SIZE (e.g. "879.104.014").
Explain your reasoning briefly.
If uncertain, return the 2-3 most likely candidates.
```

### 5d. Flusso agentico

```
Foto ricevuta
    │
    ▼
Sonnet: STEP 0 — Category detection (solo testo, no tool)
    │    rose-gold→diao | gomma→polisher | spirale NiTi→endo | perno→root_post
    │    flute→carbide | texture abrasiva+anello→diamond | ...
    │
    ▼
Sonnet: STEP 1+2 — Misure + osservazioni specifiche per categoria (no tool)
    │    rotary: misura gambo → shank_type | diamond: colore anello
    │    carbide: conta lame | polisher: colore testa | endo: colore stop
    │    root_post: colore collar + superficie | sonic: geometria punta
    │
    ▼
Sonnet: search_catalog(product_type, shank_length_mm?, description)
    │
    ▼  backend: query SQL su catalog_entries → ≤10 famiglie
    ▼
Sonnet: get_catalog_page(N) per il candidato principale
    │
    ▼  backend: pdftoppm → PNG → base64
    ▼
Sonnet: confronto visivo foto vs pagina catalogo
    │
    ├── Conferma → "879.104.014", confidence 0.9, result_state='match'
    │
    └── Dubbio → get_catalog_page(M) per alternativa
                 → ancora dubbio: result_state='shortlist', candidates=[...]
```

**Costo realistico per identificazione** [I-6]:
- Input: ~1200 (foto) + ~3600 (3 pag. catalogo) + ~1200 (testo) ≈ 6000 token × $3/M = $0.018
- Output: ~800 token × $15/M = $0.012
- **Totale: ~$0.03/identificazione** (non $0.01 come stimato prima)
- Budget 500 call/giorno → ~$15/giorno al massimo utilizzo

### 5e. `recognition-engine.ts` (riscrittura)

Pipeline semplificata:
```typescript
// hash → cache → budget → identifyFromImage → log → response
//
// RIMOSSO: lookupByFeatures, broadCandidates, measureHead, multi-pass lookup
// CONSERVATO: cache (30gg), budget singleton (CHECK id=1), recognition_log
```

**Aggiornare `AdminRouterDeps`** in `backend/src/routes/admin.ts` [I-5]:
```typescript
type AdminRouterDeps = {
  // ... deps esistenti ...
  getEnrichmentStats: () => Promise<EnrichmentStats>   // ← nuovo
}
```

**Aggiornare `main.ts`** [C-6, I-5]:
- Passare `onNewProduct` a `createSyncProductsHandler`
- Passare `getEnrichmentStats` a `createAdminRouter`

---

## Step 6 — Camera UX (Frontend)

**File principale**: `frontend/src/pages/ToolRecognitionPage.tsx` (nome reale del componente)

### 6a. Overlay righello

Il righello fisico è in pagina 7 del catalogo Komet. La UI mostra solo istruzioni:

```
┌─────────────────────────────────────────────┐
│                  VIEWFINDER                 │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  Apri il catalogo a pag. 7          │   │
│  │  Appoggia lo strumento sul righello │   │
│  │  Inquadra strumento + righello      │   │
│  └─────────────────────────────────────┘   │
│  [guide lines di allineamento]              │
│                                             │
└─────────────────────────────────────────────┘
```

Il frontend NON disegna un righello virtuale — il righello fisico è la reference.

### 6b. Rimozione vecchia logica [I-NEW-2]

**File da modificare** (3 file, non 1):

`frontend/src/pages/ToolRecognitionPage.tsx`
  → Rimuovere `PageState` variant `'filter_needed'` (riga ~20) e relativo branch UI (riga ~501)
  → Rimuovere `InstrumentFeatures` import e utilizzo (shortlist handler riga ~324)
  → Rimuovere hint pixel-based "strumento al centro" e `measurement_source` references
  → Rimuovere `head_shank_ratio` da qualsiasi costruzione di oggetti

`frontend/src/pages/ToolRecognitionPage.spec.tsx`
  → Aggiornare fixture: rimuovere `head_shank_ratio: null` (righe 214, 244)
  → Rimuovere test `state: 'filter_needed'` (riga ~240)

`frontend/src/api/recognition.ts`
  → Rimuovere tipo `InstrumentFeatures` (con `head_shank_ratio`)
  → Rimuovere tipo `FilterQuestion`
  → Rimuovere variant `filter_needed` da `RecognitionResult`
  → Aggiornare `ProductGalleryImage`: `imageUrl` → `url`, aggiornare enum `imageType`
    ai nuovi valori del backend (`catalog_render`|`product_photo`|`application_photo`|`web`)

---

## Step 7 — Admin Panel

**File**: `frontend/src/pages/AdminPage.tsx`

Sezione "Catalogo & Enrichment":

```
┌─────────────────────────────────────────────────────┐
│ Catalogo & Enrichment                               │
│ ─────────────────────────────────────────────────── │
│ Catalog ingestion:   ○ Non eseguita    [Avvia →]   │
│ Famiglie estratte:   0 / ~400 famiglie             │
│ Costo stimato:       ~$15–20 (Sonnet, una-tantum)  │
│ ─────────────────────────────────────────────────── │
│ Prodotti totali:     4.555                          │
│ Con dati catalogo:   0 (0%)         [Bulk enrich →]│
│ Con dati web:        0 (0%)                        │
│ ─────────────────────────────────────────────────── │
│ Recognition calls:   0 oggi                        │
│ Budget usato:        0 / 500  (~$0.03/call)        │
└─────────────────────────────────────────────────────┘
```

**API backend** (`GET /api/admin/enrichment-stats`):
```sql
SELECT
  (SELECT COUNT(*) FROM shared.catalog_entries)                           AS catalog_families,
  (SELECT COUNT(*) FROM shared.products)                                  AS total_products,
  (SELECT COUNT(*) FROM shared.product_details WHERE catalog_enriched_at IS NOT NULL) AS with_catalog_data,
  (SELECT COUNT(*) FROM shared.product_details WHERE web_enriched_at IS NOT NULL)     AS with_web_data,
  (SELECT used_today FROM system.recognition_budget WHERE id = 1)         AS recognition_used_today,
  (SELECT daily_limit FROM system.recognition_budget WHERE id = 1)        AS recognition_daily_limit
```

---

## File Critici (completo)

| File | Azione | Note |
|------|--------|------|
| `backend/src/db/migrations/052-catalog-enrichment.sql` | CREA | DROP old + CREATE new + fix CHECK |
| `backend/Dockerfile` | MODIFICA | + `apt-get install poppler-utils` |
| `docker-compose.yml` | MODIFICA | + volume `./catalog:/app/catalog:ro` |
| `backend/.env` + `.env.example` | MODIFICA | + `CATALOG_PDF_PATH` |
| `backend/src/services/catalog-pdf-service.ts` | CREA | poppler CLI wrapper |
| `backend/src/services/anthropic-vision-service.ts` | RISCRIVE | Tool use + catalog search |
| `backend/src/recognition/recognition-engine.ts` | RISCRIVE | Pipeline semplificata — atomico con DELETE |
| `backend/src/recognition/types.ts` | RISCRIVE | Drop `filter_needed`+`FilterQuestion`; add `IdentificationResult` [I-1] |
| `backend/src/recognition/recognition-engine.spec.ts` | RISCRIVE | Drop old tests; conservare pattern budget_exhausted |
| `backend/src/operations/handlers/catalog-ingestion.ts` | CREA | + spec |
| `backend/src/operations/handlers/catalog-product-enrichment.ts` | CREA | + spec |
| `backend/src/operations/handlers/web-product-enrichment.ts` | CREA | + spec |
| `backend/src/operations/operation-types.ts` | MODIFICA | +3 nuovi, -2 vecchi |
| `backend/src/operations/handlers/index.ts` | MODIFICA | rimuovere re-export handler cancellati [C-4] |
| `backend/src/operations/queue-router.ts` | MODIFICA | aggiornare QUEUE_ROUTING [C-4] |
| `backend/src/operations/queue-router.spec.ts` | MODIFICA | aggiornare expectedRouting [C-4] |
| `backend/src/operations/operation-types.spec.ts` | MODIFICA | riscrivere describe recognition [C-4] |
| `backend/src/operations/handlers/sync-products.ts` | MODIFICA | + `onNewProduct?` param |
| `backend/src/main.ts` | MODIFICA | wire `onNewProduct` + `getEnrichmentStats`; rimuovere handler komet [C-4] |
| `backend/src/main.spec.ts` | MODIFICA | rimuovere `komet-*` dall'array expected [C-4] |
| `backend/src/routes/admin.ts` | MODIFICA | + `getEnrichmentStats` in deps + route |
| `backend/src/server.ts` | MODIFICA | rimuovere InstrumentFeatureRow import + query [C-2] |
| `backend/src/routes/products.ts` | MODIFICA | rimuovere InstrumentFeatureRow/GalleryRow deps [C-2] |
| `backend/src/db/repositories/product-gallery.ts` | MODIFICA | `image_url`→`url`; enum image_type aggiornato [I-5] |
| `backend/src/operations/handlers/recognition-feedback.ts` | MODIFICA | `image_url`→`url`; `'field_scan'`→`'product_photo'` [C-3] |
| `frontend/src/pages/AdminPage.tsx` | MODIFICA | Sezione enrichment |
| `frontend/src/pages/ToolRecognitionPage.tsx` | MODIFICA | Overlay righello + rimuovere filter_needed/InstrumentFeatures [I-NEW-2] |
| `frontend/src/pages/ToolRecognitionPage.spec.tsx` | MODIFICA | Aggiornare fixture [I-NEW-2] |
| `frontend/src/api/recognition.ts` | MODIFICA | Rimuovere InstrumentFeatures/FilterQuestion/filter_needed; aggiornare ProductGalleryImage [I-NEW-2] |
| `backend/src/recognition/komet-code-parser.ts` | DELETE | |
| `backend/src/recognition/komet-code-parser.spec.ts` | DELETE | |
| `backend/src/db/repositories/instrument-features.ts` | DELETE | tabella droppata da 052 [C-2] |
| `backend/src/db/repositories/instrument-features.spec.ts` | DELETE | [C-2] |
| `backend/src/services/image-preprocessing-service.ts` | DELETE | orfano dopo rewrite engine [I-NEW-1] |
| `backend/src/services/image-preprocessing-service.spec.ts` | DELETE | [I-NEW-1] |
| `backend/src/operations/handlers/komet-code-parser.ts` | DELETE | |
| `backend/src/operations/handlers/komet-code-parser.spec.ts` | DELETE | |
| `backend/src/operations/handlers/komet-web-scraper.ts` | DELETE | |
| `backend/src/operations/handlers/komet-web-scraper.spec.ts` | DELETE | |
| `backend/test-recognition-e2e.mjs` | DELETE | può già essere assente [I-4] |

---

## Ordine di Esecuzione

```
⚠️  DEPLOY ORDER: migration 050 → 051 → 052 in sequenza (prod è a 049)

Agent Cleanup:
  Step 0a — COMMIT ATOMICO:
    1. Cancella file fisici (komet-*, instrument-features.*, test-recognition-e2e.mjs)
    2. Scrivi skeleton recognition-engine.ts (senza import komet-code-parser)
    3. Scrivi skeleton types.ts (senza filter_needed/FilterQuestion)
    4. Scrivi skeleton anthropic-vision-service.ts (senza Haiku prompt)
    5. Aggiorna tutti i file MODIFICA del passo 0a (operation-types, index, queue-router,
       server.ts, routes/products.ts, recognition-feedback.ts, product-gallery.ts,
       main.ts, main.spec.ts, operation-types.spec.ts, queue-router.spec.ts)
    ⚠️ NON committare prima che build + type-check passino (G-1)
  Step 0c — crea migration 052 + aggiorna Dockerfile + docker-compose.yml
  → Build + type-check pass (nessun riferimento ai file cancellati)

Agent Backend-PDF:
  Step 1a — upload PDF VPS + mkdir catalog
  Step 1b — CatalogPdfService (poppler)
  → Unit test: getPageAsBase64(7) restituisce PNG valido

Agent Backend-Ingestion:
  Step 2 — catalog-ingestion handler (con checkpoint su catalog_entries)
  Step 3 — catalog-product-enrichment handler + sync-products.ts + main.ts
  → Test smoke: ingestion pag. 5-9, poi sample 10 pagine random, verifica entries

Agent Backend-Web:
  Step 4 — web-product-enrichment handler
  → Test: enrich 879.104.014, verifica product_web_resources

Agent Backend-Recognition:
  Step 5 — riscrittura anthropic-vision-service + recognition-engine + types
  → Integration test: foto 879.104.014 con righello → result_state='match'

Agent Backend-Stats:
  Step 7 API — /api/admin/enrichment-stats + AdminRouterDeps + main.ts

Agent Frontend:
  Step 6 — camera overlay istruzioni
  Step 7 UI — admin panel sezione enrichment
  → Visual test su device reale
```

---

## Verification

```bash
# 1. Build
npm run build --prefix archibald-web-app/backend
npm run type-check --prefix archibald-web-app/frontend

# 2. Test suite
npm test --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/frontend

# 3. Migration order (locale → poi prod)
# psql: verifica che 050, 051, 052 siano applicate
SELECT id FROM system.migrations ORDER BY id;

# 4. Catalog ingestion smoke
SELECT COUNT(*) FROM shared.catalog_entries;
SELECT family_codes, product_type, rpm_max, catalog_page FROM shared.catalog_entries LIMIT 5;
-- Atteso: ~400 famiglie totali, varie product_type

# 5. Enrichment smoke
SELECT product_id, catalog_family_code, rpm_max FROM shared.product_details LIMIT 5;

# 6. Identification smoke (richiede ANTHROPIC_API_KEY + catalogo su VPS)
-- Foto 879.104.014 con righello → deve tornare "879.104.014"
SELECT product_id, confidence, result_state, tokens_used, api_cost_usd
FROM system.recognition_log ORDER BY created_at DESC LIMIT 3;

# 7. Web resources smoke
SELECT product_id, resource_type, title FROM shared.product_web_resources
WHERE product_id = (SELECT id FROM shared.products WHERE name='879.104.014' LIMIT 1);
```
