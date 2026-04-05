# Komet Product Knowledge Base (PKB) + Tool Recognition — Design Spec

**Data:** 2026-04-05  
**Autore:** Brainstorming sessione con Hatholdir  
**Stato:** Approvato — pronto per piano di implementazione  
**Migration:** `049-tool-recognition-pkb.sql` (dopo merge compliance 046-048)

---

## 1. Obiettivo

Costruire un **Product Knowledge Base (PKB)** completo per tutti gli strumenti Komet Dental, che alimenta:

1. **Fase 1 (questo spec):** Riconoscimento visivo di strumenti dentali sfusi tramite fotocamera nella PWA + schede prodotto arricchite
2. **Fase 2 (spec futuro):** Riconoscimento e matching strumenti competitor
3. **Fase 3 (spec futuro):** Embedding visivo (CLIP) per similarità geometrica multi-brand

### Caso d'uso primario

Un agente Komet è dal cliente e vede una fresa dentale sfusa (senza confezione). Apre la PWA, scatta una foto, e il sistema identifica l'articolo Komet corrispondente e naviga direttamente alla scheda prodotto per aggiungere all'ordine.

### Casi d'uso secondari

- Agente scatta foto di confezione competitor → Fase 2
- Foto riconosciuta dagli agenti arricchisce automaticamente la gallery del prodotto (flywheel)
- Schede prodotto con gallery multi-immagine, specifiche tecniche, performance, indicazioni cliniche

---

## 2. Contesto: Struttura del catalogo Komet Dental

Il catalogo Komet (758 pagine, 53MB PDF) copre due macro-aree:
- **Studio (Dental Surgery):** punte soniche, ultrasoniche, TC, diamantate, gommini, endodonzia, implantologia, ecc.
- **Laboratorio:** carburo di tungsteno, diamantate, dischi separatori, fresaggio, ecc.

### Codifica prodotto Komet (deterministica)

I codici articolo Komet codificano interamente le feature dello strumento:

```
{FamilyCode}.{ShankType}.{Size}
Esempi:
  H1.314.016   → TC round (H1), FG shank (314), Ø1.6mm
  8801.314.018 → Diamond round, grit fine/red (8xxx), FG, Ø1.8mm
  KP6801.314.016 → DIAO round, FG, Ø1.6mm
  H7S.314.012  → TC pear aggressive (H7S), FG, Ø1.2mm
  H2.204.010   → TC inverted cone, CA shank (204), Ø1.0mm
```

**Codici gambo:**
| Codice | Tipo | Diametro ISO |
|--------|------|-------------|
| 314 | FG (Friction Grip) | **Ø1.6mm esatti** |
| 313 | FGS (Friction Grip Short) | Ø1.6mm |
| 315 | FGL (Friction Grip Long) | Ø1.6mm |
| 316 | FGXL (Friction Grip Extra Long) | Ø1.6mm |
| 204 | CA (Contrangolo/Right-angle) | **Ø2.35mm esatti** |

**Il gambo FG (Ø1.6mm) è una scala di misura incorporata gratuita** — usata per calcolare il diametro della testa dalla foto.

**Codici grana per diamantate:**
| Prefisso | Grana | Ring ISO |
|----------|-------|----------|
| x01UF | Ultra Fine | Bianco |
| x01EF | Extra Fine | Giallo |
| 88xx | Fine | Rosso |
| xxx (standard) | Standard | Blu/assente |
| 68xx | Coarse | Verde |
| 58xx | Super Coarse | Nero |

**Feature visive discriminanti (ordine di affidabilità dalla foto):**

| Feature | Affidabilità | Note |
|---------|-------------|------|
| Forma testa | ⭐⭐⭐ Alta | Pallina/Pera/Cono rovescio/Cilindro/Clessidra/Torpedo |
| Materiale | ⭐⭐⭐ Alta | TC argenteo / Diamond ruvido / **DIAO oro-rosa (triviale)** |
| Ring grana (diamond) | ⭐⭐⭐ Alta | ISO color coding immediatamente visibile |
| Tipo gambo | ⭐⭐ Media | FG sottile vs CA spesso |
| Dimensione testa | ⭐ Bassa → ⭐⭐⭐ con scala gambo | Calcolata da rapporto pixel |

---

## 3. Architettura di sistema

```
PWA (React 19)
  └── /recognition          ← nuova pagina scanner
  └── /products/:id         ← scheda prodotto arricchita (estesa)

Backend (Express + TypeScript)
  └── POST /api/recognition/identify     ← pipeline riconoscimento
  └── GET  /api/recognition/budget       ← stato budget giornaliero
  └── GET  /api/products/:id/enrichment  ← dati PKB per scheda
  └── BullMQ: enrichment queue
        ├── job: komet-code-parser       ← una tantum + incrementale
        ├── job: komet-web-scraper       ← settimanale
        ├── job: komet-pdf-extractor     ← una tantum
        └── job: recognition-feedback   ← continuo

PostgreSQL
  └── shared.instrument_features        ← NEW: feature index per recognition
  └── shared.product_details            ← NEW: specifiche editoriali + procedure
  └── shared.product_gallery            ← NEW: galleria multi-immagine
  └── shared.competitor_equivalents     ← NEW: placeholder per Fase 2
  └── system.recognition_budget         ← NEW: pool condiviso giornaliero
  └── system.recognition_cache          ← NEW: hash immagine → risultato (30gg)
  └── system.recognition_log            ← NEW: analytics per utente

Claude Haiku 4.5 Vision API
  └── Feature extraction: ~$0.003/chiamata
  └── Budget stimato: $1-6/mese con 70 utenti e caching
```

---

## 4. Database Schema

### Migration: `049-tool-recognition-pkb.sql`

```sql
-- Feature index per recognition engine (derivato da codici prodotto)
CREATE TABLE IF NOT EXISTS shared.instrument_features (
  product_id         TEXT PRIMARY KEY REFERENCES shared.products(id) ON DELETE CASCADE,
  shape_family       TEXT NOT NULL,   -- round, pear, inverted_cone, cylinder, tapered,
                                      -- diabolo, torpedo, flame, wheel, egg, bud, etc.
  material           TEXT NOT NULL,   -- tungsten_carbide, diamond, diamond_diao,
                                      -- steel, ceramic, polymer, sonic_tip, ultrasonic
  grit_level         TEXT,            -- ultra_fine, extra_fine, fine, standard, coarse,
                                      -- super_coarse (NULL per non-diamond)
  grit_ring_color    TEXT,            -- white, yellow, red, blue, green, black, none
  shank_type         TEXT NOT NULL,   -- fg, fgs, fgl, fgxl, ca
  shank_diameter_mm  DOUBLE PRECISION NOT NULL DEFAULT 1.6,
  head_size_code     TEXT NOT NULL,   -- e.g. '016' (1/10 mm)
  head_size_mm       DOUBLE PRECISION NOT NULL,  -- 1.6
  working_length_mm  DOUBLE PRECISION,           -- lunghezza parte lavorante
  total_length_mm    DOUBLE PRECISION,
  family_code        TEXT NOT NULL,   -- H1, H7S, 801, KP6801, etc.
  parsed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source             TEXT NOT NULL DEFAULT 'code_parser'
);

CREATE INDEX IF NOT EXISTS idx_instrument_features_shape    ON shared.instrument_features(shape_family);
CREATE INDEX IF NOT EXISTS idx_instrument_features_material ON shared.instrument_features(material);
CREATE INDEX IF NOT EXISTS idx_instrument_features_shank    ON shared.instrument_features(shank_type);
CREATE INDEX IF NOT EXISTS idx_instrument_features_grit     ON shared.instrument_features(grit_level);
CREATE INDEX IF NOT EXISTS idx_instrument_features_size     ON shared.instrument_features(head_size_mm);
-- Indice composto per lookup recognition
CREATE INDEX IF NOT EXISTS idx_instrument_features_lookup   
  ON shared.instrument_features(shape_family, material, grit_ring_color, shank_type);

-- Gallery multi-immagine per prodotto
CREATE TABLE IF NOT EXISTS shared.product_gallery (
  id           SERIAL PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES shared.products(id) ON DELETE CASCADE,
  image_url    TEXT NOT NULL,
  local_path   TEXT,
  image_type   TEXT NOT NULL CHECK (image_type IN (
                 'instrument_white_bg',  -- sfondo bianco, singolo strumento
                 'marketing',            -- foto editoriale famiglia
                 'microscope',           -- dettaglio microscopio
                 'clinical',             -- uso in studio/clinica
                 'field_scan'            -- foto scattata da agente
               )),
  source       TEXT NOT NULL,            -- kometdental.com, komet.it, catalog_pdf, agent
  sort_order   INTEGER NOT NULL DEFAULT 0,
  width        INTEGER,
  height       INTEGER,
  file_size    INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_product  ON shared.product_gallery(product_id);
CREATE INDEX IF NOT EXISTS idx_gallery_type     ON shared.product_gallery(product_id, image_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_url ON shared.product_gallery(product_id, image_url);

-- Dati editoriali e specifiche tecniche (da kometdental.com + catalogo)
CREATE TABLE IF NOT EXISTS shared.product_details (
  product_id            TEXT PRIMARY KEY REFERENCES shared.products(id) ON DELETE CASCADE,
  clinical_description  TEXT,           -- descrizione per indicazioni cliniche
  procedures            TEXT,           -- procedura d'uso raccomandata
  performance_data      JSONB,          -- { durability_pct, sharpness_pct, control_stars, max_rpm, min_spray_ml }
  video_url             TEXT,
  pdf_url               TEXT,
  source_url            TEXT,           -- URL sorgente scraping
  scraped_at            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Placeholder per Fase 2: equivalenti competitor
CREATE TABLE IF NOT EXISTS shared.competitor_equivalents (
  id                SERIAL PRIMARY KEY,
  komet_product_id  TEXT NOT NULL REFERENCES shared.products(id) ON DELETE CASCADE,
  competitor_brand  TEXT NOT NULL,      -- brasseler, meisinger, dentsply, ss_white, kavo, etc.
  competitor_code   TEXT NOT NULL,
  competitor_name   TEXT,
  match_type        TEXT NOT NULL CHECK (match_type IN ('exact', 'equivalent', 'similar')),
  match_confidence  DOUBLE PRECISION,   -- 0.0 - 1.0
  source            TEXT NOT NULL,      -- crossref_pdf, manual, scraped
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_komet ON shared.competitor_equivalents(komet_product_id);
CREATE INDEX IF NOT EXISTS idx_competitor_brand ON shared.competitor_equivalents(competitor_brand);
CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_unique 
  ON shared.competitor_equivalents(komet_product_id, competitor_brand, competitor_code);

-- Budget pool giornaliero condiviso
CREATE TABLE IF NOT EXISTS system.recognition_budget (
  id             SERIAL PRIMARY KEY,
  daily_limit    INTEGER NOT NULL DEFAULT 500,  -- chiamate API max al giorno (tutti gli utenti)
  used_today     INTEGER NOT NULL DEFAULT 0,
  throttle_level TEXT NOT NULL DEFAULT 'normal'  -- normal, warning (>80%), limited (>95%)
                   CHECK (throttle_level IN ('normal', 'warning', 'limited')),
  reset_at       TIMESTAMPTZ NOT NULL,           -- mezzanotte UTC+1
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system.recognition_budget (daily_limit, reset_at)
VALUES (500, NOW()::DATE + INTERVAL '1 day' + INTERVAL '23 hours')
ON CONFLICT DO NOTHING;

-- Cache risultati riconoscimento (30 giorni, by image hash)
CREATE TABLE IF NOT EXISTS system.recognition_cache (
  image_hash     TEXT PRIMARY KEY,  -- SHA-256 della foto
  result_json    JSONB NOT NULL,    -- risultato completo (features + matches)
  product_id     TEXT,              -- NULL se non trovato
  confidence     DOUBLE PRECISION,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON system.recognition_cache(expires_at);

-- Log per analytics e rate-limit soft
CREATE TABLE IF NOT EXISTS system.recognition_log (
  id             SERIAL PRIMARY KEY,
  user_id        TEXT NOT NULL,
  image_hash     TEXT NOT NULL,
  cache_hit      BOOLEAN NOT NULL DEFAULT FALSE,
  product_id     TEXT,              -- trovato
  confidence     DOUBLE PRECISION,
  result_state   TEXT NOT NULL CHECK (result_state IN ('match', 'shortlist', 'filter_needed', 'not_found', 'error')),
  tokens_used    INTEGER,
  api_cost_usd   DOUBLE PRECISION,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reclog_user    ON system.recognition_log(user_id);
CREATE INDEX IF NOT EXISTS idx_reclog_date    ON system.recognition_log(created_at);
CREATE INDEX IF NOT EXISTS idx_reclog_product ON system.recognition_log(product_id);
```

---

## 5. Recognition Engine — Pipeline (Approach B)

### `POST /api/recognition/identify`

**Input:** `{ image: string (base64 JPEG/PNG), userId: string }`  
**Output:** `RecognitionResult`

```typescript
type RecognitionResult =
  | { state: 'match';         product: ProductMatch; confidence: number }
  | { state: 'shortlist';     candidates: ProductMatch[]; extractedFeatures: InstrumentFeatures }
  | { state: 'filter_needed'; extractedFeatures: InstrumentFeatures; question: FilterQuestion }
  | { state: 'not_found';     extractedFeatures: InstrumentFeatures | null }
  | { state: 'budget_exhausted'; throttleLevel: 'warning' | 'limited' }
  | { state: 'error';         message: string }

type InstrumentFeatures = {
  shape_family:    string | null
  material:        string | null
  grit_ring_color: string | null
  shank_type:      'fg' | 'ca' | 'unknown'
  head_px:         number | null   // pixel larghezza testa nel frame
  shank_px:        number | null   // pixel larghezza gambo nel frame
  confidence:      number          // 0-1, stima AI sulla qualità dell'estrazione
}
```

### Pipeline step-by-step

```
1. Auth check (utente autenticato)
   ↓
2. Hash immagine (SHA-256)
   ↓
3. Cache lookup (system.recognition_cache)
   → HIT: restituisci risultato cached, logga cache_hit=true, FINE
   ↓
4. Budget check (system.recognition_budget)
   → used_today >= daily_limit: restituisci budget_exhausted
   → used_today >= 95%: throttle_level='limited' (solo admin)
   → used_today >= 80%: throttle_level='warning' (continua)
   ↓
5. Claude Haiku 4.5 Vision API — Feature Extraction Prompt
   → Input: immagine base64 + prompt strutturato
   → Output: InstrumentFeatures JSON
   ↓
6. Calcolo dimensione testa (se head_px e shank_px disponibili)
   head_size_mm = (head_px / shank_px) × SHANK_DIAMETER_MM[shank_type]
   → arrotonda alla taglia ISO più vicina: [0.5,0.6,0.7,0.8,0.9,1.0,1.2,1.4,1.6,1.8,2.1,2.3,2.5,2.7,2.9,3.1,3.5]
   ↓
7. DB Lookup (shared.instrument_features)
   WHERE shape_family = ?
     AND material = ?
     AND (grit_ring_color = ? OR grit_ring_color IS NULL)
     AND shank_type = ?
     AND head_size_mm BETWEEN (calc_size - 0.15) AND (calc_size + 0.15)
   ↓
8. Decisione adattiva (UX states):
   → 1 match:           state='match', confidence>=90% → naviga diretto
   → 2-4 match:         state='shortlist'
   → >4 match o dim=?:  state='filter_needed' + domanda filtro
   → 0 match:           state='not_found' con features estratte
   ↓
9. Salva in cache (30 giorni)
   Incrementa budget.used_today
   Scrivi recognition_log
```

### Prompt Claude Vision (Feature Extraction)

```
You are a dental instrument identification system.
Analyze the photo and extract the following features as JSON.
Be precise. If you cannot determine a field with confidence, set it to null.

SHAPE FAMILIES (choose one):
round, pear, inverted_cone, cylinder, cylinder_round_end, tapered_round_end,
tapered_flat_end, flame, torpedo, diabolo, wheel, egg, bud, double_cone, other

MATERIALS:
tungsten_carbide (silver/grey metallic with visible flutes/cross-cut)
diamond (rough grey texture, abrasive surface)
diamond_diao (ROSE GOLD color - very distinctive)
steel (bright silver, smooth)
ceramic (white/ivory)
polymer (rubber-like, various colors)
sonic_tip (metal, specific wedge/triangle shapes)
ultrasonic (very fine tips)

GRIT RING COLORS (for diamond instruments only):
white (ultra_fine), yellow (extra_fine), red (fine), blue (standard),
green (coarse), black (super_coarse), none (no visible ring)

SHANK TYPES:
fg (thin shank, ~1.6mm diameter, goes into turbine/high-speed handpiece)
ca (thicker shank, ~2.35mm, goes into contra-angle handpiece)
unknown (shank not clearly visible)

PIXEL MEASUREMENTS:
head_px: width of the instrument HEAD in pixels (the working/cutting part)
shank_px: width of the SHANK (handle part) in pixels
Measure at the widest point. Set to null if not clearly visible.

Respond with ONLY this JSON, no other text:
{
  "shape_family": "...",
  "material": "...",
  "grit_ring_color": "...",
  "shank_type": "...",
  "head_px": null,
  "shank_px": null,
  "confidence": 0.0
}
```

### Calcolo misura testa (shank-as-scale)

```typescript
const SHANK_DIAMETERS_MM: Record<string, number> = {
  fg: 1.6, fgs: 1.6, fgl: 1.6, fgxl: 1.6,
  ca: 2.35,
}

const ISO_SIZES_MM = [0.5,0.6,0.7,0.8,0.9,1.0,1.2,1.4,1.6,1.8,2.1,2.3,2.5,2.7,2.9,3.1,3.5]

function calculateHeadSizeMm(
  headPx: number,
  shankPx: number,
  shankType: string
): number | null {
  const shankDiam = SHANK_DIAMETERS_MM[shankType]
  if (!shankDiam || shankPx === 0) return null
  const rawMm = (headPx / shankPx) * shankDiam
  // Snap to nearest ISO size
  return ISO_SIZES_MM.reduce((a, b) =>
    Math.abs(b - rawMm) < Math.abs(a - rawMm) ? b : a
  )
}
```

---

## 6. Product Knowledge Base — Pipeline di Arricchimento

### Fonti dati

| Fonte | Contenuto | Frequenza |
|-------|-----------|-----------|
| `shared.products` (ERP) | Codici attivi, prezzi, disponibilità | Real-time sync |
| Catalogo PDF (53MB, locale) | Codici completi, immagini vettoriali, specs | Una tantum + nuovi cataloghi |
| `kometdental.com` | Immagini singoli strumenti (pattern URL deterministico), descrizioni editoriali, performance data, video, foto cliniche, microscope shots | Settimanale |
| `komet.it` / `kometusa.com` | Schede singoli articoli, prezzi shop, disponibilità varianti | Settimanale |
| Agenti (recognition feedback) | Foto reali da campo | Continuo |

### Job 1: Komet Code Parser (`komet-code-parser`)

**Queue:** `enrichment` (già esistente)  
**Trigger:** una tantum all'attivazione + ogni nuovo prodotto in `shared.products`  
**Logica:** decodifica codice articolo → popola `shared.instrument_features`

```typescript
// Mapping famiglie → features
const FAMILY_MAP: Record<string, Partial<InstrumentFeatures>> = {
  // Tungsten Carbide
  'H1':   { shape_family: 'round',        material: 'tungsten_carbide' },
  'H1S':  { shape_family: 'round',        material: 'tungsten_carbide' },
  'H1SE': { shape_family: 'round',        material: 'tungsten_carbide' },
  'H7':   { shape_family: 'pear',         material: 'tungsten_carbide' },
  'H7S':  { shape_family: 'pear',         material: 'tungsten_carbide' },
  'H2':   { shape_family: 'inverted_cone', material: 'tungsten_carbide' },
  'H21R': { shape_family: 'cylinder',     material: 'tungsten_carbide' },
  'H23R': { shape_family: 'tapered_round_end', material: 'tungsten_carbide' },
  'H59':  { shape_family: 'cylinder',     material: 'tungsten_carbide' },
  // Diamond standard
  '801':  { shape_family: 'round',   material: 'diamond', grit_ring_color: 'blue'   },
  '8801': { shape_family: 'round',   material: 'diamond', grit_ring_color: 'red'    },
  '6801': { shape_family: 'round',   material: 'diamond', grit_ring_color: 'green'  },
  '5801': { shape_family: 'round',   material: 'diamond', grit_ring_color: 'black'  },
  '801UF':{ shape_family: 'round',   material: 'diamond', grit_ring_color: 'white'  },
  '801EF':{ shape_family: 'round',   material: 'diamond', grit_ring_color: 'yellow' },
  // Diamond DIAO (rose-gold)
  'KP6801': { shape_family: 'round',     material: 'diamond_diao', grit_ring_color: 'green' },
  'KP6837': { shape_family: 'cylinder',  material: 'diamond_diao', grit_ring_color: 'green' },
  'KP6881': { shape_family: 'cylinder',  material: 'diamond_diao', grit_ring_color: 'green' },
  // ... (mapping completo da catalogo)
}

// Mapping codice numerico gambo → tipo
const SHANK_TYPE_MAP: Record<string, string> = {
  '314': 'fg',   // FG standard
  '313': 'fgs',  // FG short
  '315': 'fgl',  // FG long
  '316': 'fgxl', // FG extra long
  '204': 'ca',   // Contrangolo
}

function parseKometCode(productId: string): Partial<InstrumentFeatures> | null {
  // Estrai: familyCode.shankCode.sizeCode
  const match = productId.match(/^(.+?)\.(\d{3})\.(\d{3})$/)
  if (!match) return null
  const [, familyCode, shankCode, sizeCode] = match
  const features = FAMILY_MAP[familyCode]
  if (!features) return null
  return {
    ...features,
    family_code:      familyCode,
    shank_type:       SHANK_TYPE_MAP[shankCode] ?? 'fg',
    shank_diameter_mm: shankCode === '204' ? 2.35 : 1.6,
    head_size_code:   sizeCode,
    head_size_mm:     parseInt(sizeCode, 10) / 10,
  }
}
```

### Job 2: Komet Web Scraper (`komet-web-scraper`)

**Queue:** `enrichment`  
**Schedule:** ogni lunedì alle 03:00 UTC+1  
**Logica:**

```
Per ogni prodotto in shared.products:
  1. Costruisci URL immagine: 
     https://www.kometdental.com/uploads/03di_{ID}_{SHANK}_{SIZE}_450.png
  2. Verifica che l'immagine esista (HEAD request)
  3. Se esiste: download → local_path → INSERT shared.product_gallery
     (image_type='instrument_white_bg', source='kometdental.com')
  4. Scrapa pagina famiglia su kometdental.com:
     - Descrizione clinica → shared.product_details.clinical_description
     - Dati performance → shared.product_details.performance_data (JSONB)
     - URL video → shared.product_details.video_url
     - Foto marketing/microscope/clinical → shared.product_gallery
```

**Rate limiting:** max 2 richieste/secondo verso kometdental.com (rispettoso).

### Job 3: PDF Image Extractor (`komet-pdf-extractor`)

**Queue:** `enrichment`  
**Trigger:** una tantum, poi manuale a ogni nuovo catalogo  
**Input:** `/app/assets/catalogo_komet_2025.pdf`  
**Logica:**
- Usa `pdf2pic` o `pdfjs-dist` per estrarre immagini per-pagina
- Abbina ogni immagine al codice articolo tramite testo OCR adiacente
- Carica in `shared.product_gallery` (image_type='instrument_white_bg', source='catalog_pdf')

### Job 4: Recognition Feedback (`recognition-feedback`)

**Trigger:** ogni conferma positiva di riconoscimento dall'agente  
**Logica:**
- Foto scattata dall'agente → ridimensiona a max 800px → comprimi → salva su VPS
- `INSERT shared.product_gallery` (image_type='field_scan', source='agent:{userId}')
- Questi diventano il training set naturale per Fase 3 (CLIP)

---

## 7. Budget System — Pool Condiviso

```typescript
type ThrottleLevel = 'normal' | 'warning' | 'limited'

interface BudgetState {
  dailyLimit:    number       // configurabile da admin (default 500)
  usedToday:     number
  throttleLevel: ThrottleLevel
  resetAt:       Date         // mezzanotte UTC+1
}

// Logica throttle
function getThrottleLevel(used: number, limit: number): ThrottleLevel {
  const pct = used / limit
  if (pct >= 0.95) return 'limited'   // solo admin può usare
  if (pct >= 0.80) return 'warning'   // mostra avviso + usa con parsimonia
  return 'normal'
}

// Il budget si azzera ogni giorno a mezzanotte ora italiana
// La tabella ha una sola riga; UPDATE atomico con SELECT FOR UPDATE
```

**Regole per throttle level:**
- `normal`: tutti gli utenti possono scansionare liberamente
- `warning`: mostra banner "Budget giornaliero quasi esaurito – usa con parsimonia"
- `limited`: solo utenti con `role='admin'` possono scansionare

**Evolutivo (v2):** sistema a crediti mensili con degradazione progressiva invece di limite fisso giornaliero.

---

## 8. PWA — Nuova Pagina `/recognition`

### Route

```
/recognition    → ToolRecognitionPage
```

Accessibile da:
- Menu principale (nuova voce "Identifica strumento 📷")
- Shortcut nella barra di ricerca articoli
- Quick action dalla scheda cliente ("Identifica fresa del cliente")

### 4 Stati UX (Adaptive, Approach C)

#### Stato 1: Idle (Viewfinder)
- Camera feed live con overlay corners verdi
- Hint: "Inquadra la fresa intera — includi il gambo"
- Budget residuo (es. "7 scan rimasti oggi")
- Pulsante flash toggle
- Pulsante scatto (cerchio bianco)

#### Stato 2: Analyzing
- Foto congelata in background (dimmed)
- Spinner + step pipeline visibili in tempo reale:
  `✓ Foto acquisita → → Estrazione features AI → ○ Ricerca catalogo → ○ Calcolo misura`

#### Stato 3A: Match (confidenza ≥ 90%)
- Card verde con mini-preview dello strumento
- Nome, codice, famiglia, badge features (forma, materiale, grana, gambo)
- CTA primaria: **"Apri scheda prodotto →"**
- Link secondario: "Non è questo — mostra altri"

#### Stato 3B: Shortlist (confidenza 60-89%)
- Header: "X candidati trovati — scegli il corretto"
- Lista ordinata per confidenza con codice + nome + indicatore misura
- Le icone fresa crescono proporzionalmente alla misura per aiutare la scelta visiva
- Tocco → naviga direttamente alla scheda

#### Stato 3C: Filter Needed (confidenza < 60%)
- "Ho riconosciuto: [famiglia]. Non riesco a distinguere la variante."
- 2-3 domande rapide con opzioni large-tap (es. "Che diametro vedi? Piccola/Media/Grande")
- Oppure: "📷 Rifai foto col gambo in vista" (abilita misura automatica)

### Architettura scroll

Rispetta la regola fondamentale del progetto: `.app-main` è l'unico container scrollabile. Il viewfinder camera occupa `100dvh` senza scroll. La card risultato usa `position: fixed` bottom sheet o si integra nel flusso `.app-main`.

---

## 9. Scheda Prodotto Arricchita

### Estensione della pagina prodotto esistente

La scheda prodotto attuale viene **estesa** (non sostituita) con nuove sezioni collassabili alimentate dal PKB.

### Layout Responsive

| Viewport | Layout | Specifiche |
|----------|--------|-----------|
| Mobile `<768px` | Stack verticale | Gallery top swipeable, tabs 4 voci, CTA sticky bottom, unico scroll `.app-main` |
| Tablet `768–1024px` | 2 colonne CSS Grid | Gallery + performance barre sx (fisse), info + specs + CTA dx (scrollabili) |
| Desktop `>1024px` | 3 colonne | Gallery + scan history sx | Specs + 5 tab center | Pannello ordine sticky dx |

### Gallery (4 tipologie)

| Tipo | Fonte | Sfondo |
|------|-------|--------|
| `instrument_white_bg` | `kometdental.com/uploads/03di_{ID}_{SHANK}_{SIZE}_450.png` | Bianco/trasparente |
| `marketing` | kometdental.com — foto editoriale famiglia | Scuro/atmosferico |
| `microscope` | kometdental.com — dettaglio superficie | Close-up |
| `clinical` | kometdental.com — uso in studio | Contesto reale |
| `field_scan` | Foto agenti (recognition flywheel) | Contesto reale da campo |

### Sezioni scheda

1. **Gallery interattiva** — swipeable, thumbnails laterali, tipo immagine visibile
2. **Badge features** — forma, materiale, grana (con ring color), gambo, rpm max
3. **Selettore misure** — chip interattivi, aggiornano codice + prezzo in real-time
4. **Performance** (se disponibile da PKB) — barre vs standard di mercato
5. **Indicazioni cliniche** (collassabile) — procedure, video, note d'uso
6. **Storico riconoscimenti** — date, agenti, confidenza (flywheel visibile)
7. **Tab Competitor** — presente ma locked/grigio (Fase 2)
8. **CTA ordine** — prezzo + "Aggiungi all'ordine"

### Tabs desktop (5 voci)

- **Panoramica** — gallery + badge + performance + CTA
- **Indicazioni cliniche** — procedure dettagliate, video
- **Scheda tecnica** — specs complete da catalogo (dimensioni, tolleranze, rpm)
- **Competitor** — equivalenti (locked, Fase 2)
- **Storico ordini** — quando è stato ordinato da questo agente/i clienti

---

## 10. API Endpoints

### `POST /api/recognition/identify`

```typescript
// Request
interface IdentifyRequest {
  image:  string   // base64, max 4MB, JPEG/PNG/WEBP
  userId: string
}

// Response
interface IdentifyResponse {
  result: RecognitionResult
  budgetState: { usedToday: number; dailyLimit: number; throttleLevel: ThrottleLevel }
  processingMs: number
}
```

**Rate limit:** 10 richieste/minuto per utente (anti-spam, indipendente dal budget).

### `GET /api/recognition/budget`

Restituisce stato corrente del budget (usato da indicatore in-app).

### `GET /api/products/:id/enrichment`

Restituisce dati PKB per la scheda prodotto arricchita:
```typescript
{
  features:    InstrumentFeatures | null
  details:     ProductDetails | null
  gallery:     ProductGalleryImage[]
  competitors: CompetitorEquivalent[]   // sempre vuoto in Fase 1
}
```

---

## 11. Testing

### Unit (`*.spec.ts`)

- `parseKometCode()` — parser codici prodotto: tutti i family codes, shank types, size codes
- `calculateHeadSizeMm()` — misura testa: vari rapporti pixel, casi edge (0 pixel, shank unknown)
- `getThrottleLevel()` — logica budget: soglie 80% e 95%
- `buildRecognitionResult()` — decisione adattiva: 1 match / 2-4 / >4 / 0

### Integration

- Pipeline completa `POST /api/recognition/identify` con immagine test e mock Vision API
- DB lookup: verifica che le features estratte trovino i candidati attesi
- Budget decrement: verifica atomicità con chiamate concorrenti
- Cache: hit dopo prima chiamata con stesso hash

### E2E (before deploy)

- Flusso completo: apertura camera → scatto foto di fresa test → risultato → navigazione scheda
- Verifica tutti i 4 stati UX con immagini di test predisposte
- Test responsive su iOS Safari standalone (niente `window.confirm`)

---

## 12. Fasi Escluse da questo Spec

### Fase 2 — Competitor Recognition (spec separato)

- Scan confezione competitor → identifica brand + codice → `shared.competitor_equivalents`
- Fonti: cross-reference PDF esistenti (Johnson-Promident, Brasseler), scraping shop competitor
- Nuovo job BullMQ: `competitor-crossref-importer`
- Tab Competitor sbloccato nella scheda prodotto

### Fase 3 — Feature Vector Similarity (spec separato)

- Embedding visivo CLIP per ogni prodotto (self-hosted su VPS upgraded CPX42+)
- Ricerca per similarità geometrica multi-brand
- Training set: foto campo accumulate dal flywheel (recognition feedback)
- Upgrade VPS: CPX42 (16 GB RAM) minimo per CLIP ONNX

---

## 13. Note Architetturali

- **Queue:** tutti i job enrichment usano la queue `enrichment` (già esistente, concurrency 3)
- **Migration numero:** `049` (dopo merge compliance 046-047-048 da `feat/compliance-nis2-gdpr`)
- **Immagini locali:** scaricate in `/app/assets/product-images/{product_id}/` sul VPS
- **Scroll mobile:** la pagina `/recognition` usa `position: fixed; inset: 0` per il viewfinder, evitando interferenze con `.app-main`
- **iOS Safari standalone:** niente `window.confirm` — tutti i dialoghi inline o bottom sheet
- **Privacy:** le foto scattate dagli agenti sono associate al `product_id`, mai al cliente — nessuna implicazione GDPR
- **DIAO rose-gold:** la riconoscibilità altissima del colore oro-rosa rende il DIAO il caso di test ideale per la validazione del sistema

---

## 14. Priorità di Implementazione

| Fase | Componente | Priorità |
|------|-----------|----------|
| 0 | Migration 049 + Code Parser | P0 — prerequisito tutto |
| 0 | Web Scraper immagini kometdental.com | P0 — prerequisito gallery |
| 1 | `POST /api/recognition/identify` (pipeline completa) | P0 |
| 1 | `/recognition` page — stati 1,2,3A | P0 |
| 1 | Gallery prodotto (instrument_white_bg) | P0 |
| 1 | Badge features + selettore misure | P1 |
| 1 | Stati 3B e 3C scanner | P1 |
| 1 | Budget system + throttle | P1 |
| 1 | Performance bars + indicazioni cliniche | P2 |
| 1 | Storico riconoscimenti in scheda | P2 |
| 1 | PDF Extractor (catalogo) | P2 |
| 1 | Recognition feedback → gallery | P2 |
| 1 | Layout tablet + desktop | P2 |
| 2 | Competitor equivalents | Fase 2 |
