# Recognition System Redesign — Spec
**Data:** 2026-04-24  
**Stato:** Approvato per implementazione  
**Scope:** Backend pipeline + DB migrations + API contract. Frontend UI → spec separata.

---

## 1. Problema e Motivazione

Il sistema attuale (Jina Embeddings v4 + pgvector HNSW ANN + Claude Sonnet) fallisce per domain gap: le immagini di training del modello non corrispondono alle foto reali scattate dagli agenti (illuminazione studio, riflessi metallici, sfondo disomogeneo). Il risultato è una precisione insufficiente per l'uso produttivo.

**Root cause:** la similarità vettoriale tra embedding immagine e embedding catalogo non è un proxy affidabile per l'identità morfologica dello strumento. Due frese con la stessa forma ma grana diversa producono embedding simili; due frese con forme diverse ma stesso materiale possono produrre embedding vicini.

---

## 2. Soluzione — Approccio A: Measure-first + SQL + Visual confirm

Il nuovo sistema abbandona completamente la ricerca per similarità. L'identificazione avviene in 4 fasi sequenziali:

1. **Calibrazione scala** (ARUco o gambo ISO)
2. **Misurazione metrica** (diametro testa, lunghezza testa, classificazione forma)
3. **Ricerca SQL strutturata** (filtro su misure + shape_class → ≤5 candidati)
4. **Conferma visiva** (Claude Opus 4.7 su shortlist ≤5)

---

## 3. Calibrazione della Scala

### 3.1 ARUco (primario)

Un marker **ARUco DICT_4X4_50 ID=42** viene stampato su una carta di calibrazione fisica (formato business card 85.6×54mm, design White Clinical). Il marker ha lato fisico **20mm**.

Il frontend (`js-aruco2` in Web Worker) rileva i 4 angoli del marker e calcola:
```
px_per_mm = pixel_distance(corner_A, corner_B) / 20.0
```

La carta è opzionale ma preferita. Se il marker non è rilevabile dopo lo scatto, il sistema **non va direttamente in fallback**: mostra un avviso con istruzioni correttive e chiede di ripetere la foto. Solo dopo scelta esplicita "Procedi senza carta" (o secondo tentativo fallito) il sistema passa al fallback gambo ISO.

**Sequenza ARUco:**
1. Foto scattata → ARUco detection in Web Worker
2. Se rilevato → calibrazione diretta, nessun avviso
3. Se non rilevato → avviso: *"Carta non rilevata. Assicurati che sia piatta, completamente visibile e ben illuminata."*
4. Utente può: **Riprova** (nuovo scatto) oppure **Procedi senza carta**
5. Al secondo tentativo fallito o a scelta esplicita → fallback gambo ISO

### 3.2 Gambo ISO (fallback)

Quando ARUco non è disponibile, il backend usa Claude Haiku 4.5 per classificare visivamente il diametro del gambo. Una volta classificato, il diametro ISO fisso fornisce la stessa calibrazione:
	
```
px_per_mm = shank_diameter_px / shank_diameter_mm_iso
```

### 3.3 Tabella completa codici gambo (ground truth catalogo Komet)

| Codice | Nome EN   | Nome IT             | Lunghezza (mm) | Diametro (mm) | Gruppo Ø |
|--------|-----------|---------------------|----------------|---------------|----------|
| 313    | FGS       | FG corto            | 16             | 1.60          | FG       |
| 314    | FG        | FG standard         | 19             | 1.60          | FG       |
| 315    | FGL       | FG lungo            | 21             | 1.60          | FG       |
| 316    | FGXL      | FG extra lungo      | 25             | 1.60          | FG       |
| 471    | FO/PCR    | FO/PCR              | —              | 1.60          | FG       |
| 204    | CA / RA   | Contrangolo         | 22             | 2.35          | CA/HP    |
| 205    | RAL       | CA lungo            | 26             | 2.35          | CA/HP    |
| 206    | RAXL      | CA extra lungo      | 34             | 2.35          | CA/HP    |
| 103    | HPS       | Manipolo corto      | 34             | 2.35          | CA/HP    |
| 104    | HP        | Manipolo diritto    | 44.5           | 2.35          | CA/HP    |
| 105    | HPL       | Manipolo lungo      | 65             | 2.35          | CA/HP    |
| 106    | HPXL      | Manipolo extra lungo| 70             | 2.35          | CA/HP    |
| 123    | HPST      | Manipolo spesso corto| 34            | 3.00          | HPT      |
| 124    | HPT       | Manipolo spesso     | 44.5           | 3.00          | HPT      |
| 634    | Handle short | Impugnatura corta | —             | 3.00          | HPT      |
| 654    | Handle    | Impugnatura         | —              | 4.00          | Handle   |
| 644    | Handle    | Impugnatura grande  | —              | 6.00          | Handle   |
| 900    | not mounted | Non montato       | —              | —             | None     |

Il `ShankClassifier` classifica il **gruppo Ø** (FG=1.60 / CA-HP=2.35 / HPT=3.00 / Handle-S=4.00 / Handle-L=6.00 / None). Il codice esatto (es. FGS vs FG vs FGL) viene disambiguato successivamente dalla lunghezza visibile del gambo nella foto se necessario.

---

## 4. Componenti Backend

### 4.1 InstrumentDescriptor (unica call Haiku 4.5)

ShankClassifier, HeadMeasurer e ShapeClassifier sono **consolidati in un'unica call Claude Haiku 4.5** con output JSON strutturato. Questo è più robusto su background arbitrari (lo studio del medico) rispetto a edge detection deterministica, e riduce la latenza a un solo round-trip AI.

**Input:** immagine base64 + `px_per_mm: number | null` (da ARUco se disponibile)  
**Modello:** Claude Haiku 4.5  
**Output:**
```typescript
type InstrumentDescriptor = {
  shank: {
    diameter_group: 'FG' | 'CA_HP' | 'HPT' | 'Handle_S' | 'Handle_L' | 'none' | 'unknown'
    diameter_mm:    1.60 | 2.35 | 3.00 | 4.00 | 6.00 | null
    diameter_px:    number    // larghezza gambo in pixel → usata per ricavare px_per_mm se ARUco assente
    length_px:      number    // lunghezza gambo visibile → disambigua FGS/FG/FGL/FGXL
  }
  head: {
    diameter_px: number       // larghezza massima testa in pixel
    length_px:   number       // lunghezza parte attiva in pixel
  }
  shape_class:    ShapeClass  // forma morfologica (13 categorie)
  grit_indicator: {
    type:        'ring_color' | 'blade_count' | 'head_color' | 'none' | 'unknown'
    // ring_color: anello colorato sull'albero (diamond burs)
    // blade_count: numero/tipo di lame visibili (carbide burs)
    // head_color: colore della testa (gomme, lucidatori)
    color:       'white' | 'yellow' | 'red' | 'none' | 'green' | 'black' | 'blue' | 'other' | null
    // color = null per blade_count e head_color (non si mappano a colori semplici)
    // color = 'none' (ring_color type, no ring visible) → medium grit per diamond
    blade_density: 'few_coarse' | 'medium' | 'many_fine' | null
    // blade_density valorizzato solo per blade_count
  }
  surface_texture: SurfaceTexture
  confidence:      number     // 0-1 confidence globale
}

type ShapeClass =
  | 'sfera' | 'ovale' | 'pera' | 'fiamma' | 'ago'
  | 'cilindro_piatto' | 'cilindro_tondo'
  | 'cono_piatto' | 'cono_tondo' | 'cono_invertito'
  | 'disco' | 'diabolo' | 'altro'

type SurfaceTexture =
  | 'diamond_grit'       // grana diamantata
  | 'carbide_blades'     // taglienti carburo (spirale o diritta)
  | 'ceramic'            // punta in ceramica/zirconia
  | 'rubber_polisher'    // gomma abrasiva (tazze, coppette, coni)
  | 'abrasive_wheel'     // disco/ruota con grana
  | 'disc_slotted'       // disco separatore con lamelle
  | 'disc_perforated'    // disco separatore con fori
  | 'steel_smooth'       // acciaio liscio (endodontico, moncone)
  | 'sonic_tip'          // punta sonica con forma caratteristica
  | 'other'
```

Il prompt fornisce al modello: tavola diametri ISO, 13 sagome forma, scala colori grana (● colore fisico sull'albero), esempi texture. Se `px_per_mm` è già noto (ARUco), il prompt lo include e chiede direttamente le misure in mm. Altrimenti il modello restituisce i valori in pixel e il backend esegue la conversione.

**Modello configurabile:** `INSTRUMENT_DESCRIPTOR_MODEL` è una costante di configurazione. Default: `claude-haiku-4-5-20251001`. Se in produzione troppi campi risultano `null` o l'accuracy è insufficiente, si switcha a `claude-sonnet-4-6` o `claude-opus-4-7` senza modifiche al codice. Il VisualConfirmer (Opus 4.7) rimane il safety net finale indipendentemente dal modello scelto per il descriptor.

**Nota DB — grit ring color per carburi:** Il pallino ● di colore nel catalogo Komet è l'indicatore fisico di granulometria/tipo taglio per TUTTI gli strumenti (non solo diamond). Il DB codifica correttamente `ring_color` per strumenti diamond, ma per carburi usa `blade_count` omettendo il colore dell'anello fisico — questo è un limite del dato estratto. L'InstrumentDescriptor rileva comunque il colore dell'anello dalla foto; per carburi questo dato viene passato a Claude Opus come context ma non è filtrabile in SQL.

**Conversione pixel → mm** (eseguita dal backend dopo la call Haiku):
```
head_diameter_mm = head.diameter_px / px_per_mm
head_length_mm   = head.length_px   / px_per_mm
shank_length_mm  = shank.length_px  / px_per_mm  // per disambiguare FGS/FG/FGL/FGXL
```
Se `px_per_mm = null` (ARUco assente + gambo non classificato), le misure restano in pixel e non vengono usate per il filtro SQL dimensionale.

**Sistema grit nel DB (`grit_options[0].grit_indicator_type`):**
| Tipo | N. articoli | Descrizione | Come rilevato dalla foto |
|---|---|---|---|
| `ring_color` | 368 | Anello colorato sull'albero (diamond burs principalmente) | Colore anello visibile |
| `blade_count` | 379 | N. lame visibili (carburi) | Densità/pattern dei taglienti |
| `head_color` | 61 | Colore testa/corpo strumento (gomme, lucidatori) | Colore predominante testa |
| `none` | 405 | Nessun indicatore (accessori, sonic, unmounted) | N/A |

**Mapping `ring_color` → granulometria (diamond burs):**
| `grit_indicator.color` | Granulometria | μm |
|---|---|---|
| white | Ultrafine | 8 |
| yellow | Extrafine | 25 |
| red | Fine | 46 |
| none (assenza anello) | **Medium** | 107 |
| green | Coarse | 151 |
| black | Super-coarse | 181 |

**Nota `head_length_mm`:** La lunghezza della parte lavorante (L = es. 8.0mm) è misurata dalla foto e inclusa nel risultato finale, ma **non è usata come filtro SQL** — solo 176/1.639 articoli nel DB hanno questo dato strutturato.

**Mapping `surface_texture` → `product_type` DB:**
| surface_texture | product_type(s) DB |
|---|---|
| diamond_grit | rotary_diamond |
| carbide_blades | rotary_carbide, lab_carbide |
| ceramic | polisher_ceramic |
| rubber_polisher | polisher_composite, polisher_amalgam |
| sonic_tip | sonic |
| steel_smooth | endodontic, root_post |
| disc_slotted / disc_perforated / abrasive_wheel | accessory, other |

### 4.4 CatalogSearcher

**Input:** `InstrumentDescriptor` (con misure mm calcolate)  
**Implementazione:** query SQL su `shared.catalog_entries`  
**Output:** array di max 5 `CatalogCandidate`

> **Schema reale del DB:**  
> - Tipo gambo → `shank_options JSONB[]`, campo `type` (es. `[{"code":"104","type":"hp","length_mm":44.5}]`)  
> - Diametro testa → `size_options INT[]` dove `mm = code / 10.0` (es. `{23}` = 2.3mm)  
> - Grana → `grit_options JSONB`  
> - Tipo prodotto → `product_type TEXT`  
> - Mapping diametro → tipi DB: Ø1.60→`["fg"]`, Ø2.35→`["ca","hp"]`, Ø3.00→`["hpt","grip"]`, Ø4.00→`["grip"]` (cod.654), Ø6.00→`["grip"]` (cod.644)

```sql
SELECT
  ce.family_codes[1]  AS family_code,
  ce.shape_description,
  ce.shape_class,
  ce.size_options,
  ce.product_type,
  cfi.local_path       AS thumbnail_path
FROM shared.catalog_entries ce
LEFT JOIN LATERAL (
  SELECT local_path FROM shared.catalog_family_images
  WHERE family_code = ce.family_codes[1]
  ORDER BY priority ASC LIMIT 1
) cfi ON true
WHERE
  -- [1] filtro tipo prodotto da surface_texture (se mappato)
  ($product_types IS NULL OR ce.product_type = ANY($product_types))
  -- [2] filtro gambo: almeno uno shank_option del tipo rilevato
  AND ($shank_types IS NULL OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(ce.shank_options) elem
    WHERE elem->>'type' = ANY($shank_types)
  ))
  -- [3] filtro diametro testa: almeno un size_option nella tolleranza ±0.3mm
  AND ($head_mm IS NULL OR EXISTS (
    SELECT 1 FROM unnest(ce.size_options) s
    WHERE s / 10.0 BETWEEN $head_mm - 0.3 AND $head_mm + 0.3
  ))
  -- [4] filtro forma (se confidence ≥ 0.7)
  AND ($shape_class IS NULL OR ce.shape_class = $shape_class)
  -- [5] filtro grana: tipo indicatore + colore/descrizione (ILIKE per varianti testo)
  AND ($grit_indicator_type IS NULL OR
       ce.grit_options->0->>'grit_indicator_type' = $grit_indicator_type)
  AND ($grit_color IS NULL OR
       ce.grit_options->0->>'visual_cue' ILIKE '%' || $grit_color || '%')
ORDER BY
  COALESCE((
    SELECT MIN(ABS(s / 10.0 - $head_mm))
    FROM unnest(ce.size_options) s
  ), 999)
LIMIT 5
```

**Strategia di fallback progressivo** se la query ritorna 0 risultati:
1. Rimuovi filtro `[5]` (grana) — tolleranza colore anello
2. Allarga `[3]` tolleranza +0.1mm per step (max 3 step → ±0.6mm totale)
3. Rimuovi filtro `[4]` (shape_class)
4. Rimuovi filtro `[1]` (product_type)
5. Se ancora 0 → `not_found`

### 4.5 VisualConfirmer

**Input:** immagine originale + array di max 5 `CatalogCandidate` con thumbnail  
**Modello:** Claude Opus 4.7  
**Output:**
```typescript
type VisualConfirmation = {
  matched_family_code: string | null
  confidence: number      // 0-1
  reasoning: string       // breve spiegazione
  runner_up: string | null
}
```

Il prompt mostra l'immagine del cliente + le immagini di riferimento dei candidati e chiede di identificare la corrispondenza. Se `confidence < 0.85`, il sistema restituisce una shortlist anziché un match singolo.

---

## 5. Flusso Completo

```
foto utente
  │
  ├─ [frontend] js-aruco2 Web Worker
  │    ├─ ARUco detected → px_per_mm = marker_px / 20.0 → inviato al backend
  │    └─ ARUco absent  → avviso utente → retry o "Procedi senza carta"
  │                        → px_per_mm = null
  │
  └─ [backend] POST /api/recognition/identify
       │
       ├─ InstrumentDescriptor (Haiku 4.5) — unica call:
       │    → shank.diameter_group, shank.diameter_px, shank.length_px
       │    → head.diameter_px, head.length_px
       │    → shape_class
       │    → grit_ring { present, color }
       │    → surface_texture
       │
       ├─ Calcolo px_per_mm (se non da ARUco):
       │    px_per_mm = shank.diameter_px / diameter_mm_iso
       │
       ├─ Conversione pixel → mm:
       │    head_diameter_mm, head_length_mm, shank_length_mm
       │
       ├─ CatalogSearcher (SQL, fino a 5 step fallback) → ≤5 candidati
       │
       └─ VisualConfirmer (Opus 4.7) → match / shortlist / not_found
```

---

## 6. Modifiche Database

### Migration 064 — `shape_class` + fix shank 123/124

```sql
-- 1. Aggiungi colonna shape_class
ALTER TABLE shared.catalog_entries
  ADD COLUMN shape_class TEXT;

-- 2. Mapping deterministico da shape_description (keyword matching)
UPDATE shared.catalog_entries SET shape_class = CASE
  WHEN shape_description ILIKE '%sfera%' OR shape_description ILIKE '%ball%' OR shape_description ILIKE '%round%'
    THEN 'sfera'
  WHEN shape_description ILIKE '%ovale%' OR shape_description ILIKE '%oval%'
    THEN 'ovale'
  WHEN shape_description ILIKE '%pera%' OR shape_description ILIKE '%pear%'
    THEN 'pera'
  WHEN shape_description ILIKE '%fiamma%' OR shape_description ILIKE '%flame%'
    THEN 'fiamma'
  WHEN shape_description ILIKE '%ago%' OR shape_description ILIKE '%needle%'
    THEN 'ago'
  WHEN shape_description ILIKE '%cilindro%' AND (
         shape_description ILIKE '%piatto%' OR shape_description ILIKE '%flat%')
    THEN 'cilindro_piatto'
  WHEN shape_description ILIKE '%cilindro%' OR shape_description ILIKE '%cylinder%'
    THEN 'cilindro_tondo'
  WHEN shape_description ILIKE '%cono%' AND (
         shape_description ILIKE '%inverti%' OR shape_description ILIKE '%invert%')
    THEN 'cono_invertito'
  WHEN shape_description ILIKE '%cono%' AND (
         shape_description ILIKE '%piatto%' OR shape_description ILIKE '%flat%')
    THEN 'cono_piatto'
  WHEN shape_description ILIKE '%cono%' OR shape_description ILIKE '%taper%' OR shape_description ILIKE '%cone%'
    THEN 'cono_tondo'
  WHEN shape_description ILIKE '%disco%' OR shape_description ILIKE '%disc%' OR shape_description ILIKE '%wheel%'
    THEN 'disco'
  WHEN shape_description ILIKE '%diabolo%' OR shape_description ILIKE '%hourglass%'
    THEN 'diabolo'
  ELSE 'altro'
END;

-- 3. Fix data: codici 123 e 124 (Ø3.00mm) sono erroneamente taggati "hp" nel DB
--    Aggiorna shank_options per le righe che contengono code "123" o "124"
UPDATE shared.catalog_entries
SET shank_options = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'code' IN ('123','124')
        THEN jsonb_set(elem, '{type}', '"hpt"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(shank_options) elem
)
WHERE shank_options @> '[{"code":"123"}]'
   OR shank_options @> '[{"code":"124"}]';

-- 4. Indice GIN per ricerca JSONB su shank_options
CREATE INDEX idx_catalog_entries_shank_options_gin
  ON shared.catalog_entries USING GIN (shank_options jsonb_path_ops);

-- 5. Indice su shape_class
CREATE INDEX idx_catalog_entries_shape_class
  ON shared.catalog_entries (shape_class);
```

**Diagnostica pre-deploy:** verificare che `shape_class = 'altro'` sia ≤15% delle righe con `shape_description NOT NULL`. Se >15%, raffinare le keywords.

### Migration 065 — Rimozione embedding visivi

```sql
-- Drop HNSW index
DROP INDEX IF EXISTS shared.catalog_family_images_visual_embedding_idx;

-- Drop colonna halfvec
ALTER TABLE shared.catalog_family_images
  DROP COLUMN IF EXISTS visual_embedding,
  DROP COLUMN IF EXISTS indexed_at;
```

### Fix `catalog_reading_guide` — grit medium

```sql
UPDATE shared.catalog_reading_guide
SET content = jsonb_set(
  content,
  '{grit_systems,diamond,5,visual_cue}',
  '"none"'
)
WHERE content->'grit_systems'->'diamond'->5->>'micron' = '107';
```
*(Il medium (107μm) è identificato dall'assenza di anello colorato, non dal blu.)*

---

## 7. API Contract

### POST `/api/recognition/identify`

**Request** (invariato rispetto all'attuale):
```typescript
{
  image: string       // base64 JPEG/PNG
  aruco_px_per_mm?: number   // se frontend ha rilevato ARUco
}
```

**Response** (esteso con misure):
```typescript
type RecognitionResult =
  | { type: 'match';           data: ProductMatch }
  | { type: 'shortlist_visual'; data: { candidates: CandidateMatch[] } }
  | { type: 'not_found';       data: { measurements: MeasurementSummary } }
  | { type: 'error';           data: { message: string } }

type ProductMatch = {
  familyCode:       string
  productName:      string
  shankType:        string        // es. "HP (Ø2.35mm)"
  headDiameterMm:   number
  headLengthMm:     number
  shapeClass:       ShapeClass
  confidence:       number
  thumbnailUrl:     string
  discontinued:     boolean
  measurementSource: 'aruco' | 'shank_iso' | 'none'
}

type MeasurementSummary = {
  shankGroup:       string | null
  headDiameterMm:   number | null
  shapeClass:       ShapeClass | null
  measurementSource: string
}
```

---

## 8. Componenti da Rimuovere

| Componente | File | Motivo |
|---|---|---|
| Jina embedding client | `src/recognition/jina-client.ts` | sostituito da misure |
| ANN retrieval | `src/recognition/recognition-engine.ts` | sostituito da SQL |
| Build visual index script | `scripts/build-visual-index.mjs` | non più necessario |
| Index catalog pages script | `scripts/index-catalog-pages.mjs` | non più necessario |
| `visual_embedding` column | `shared.catalog_family_images` | migration 065 |
| `indexed_at` column | `shared.catalog_family_images` | migration 065 |
| Repository functions | `catalog-family-images.ts` | rimuovere: `updateEmbedding`, `queryTopK`, `countIndexed`, `getIndexedFamilyCodes`, `getIndexedFamilyStripKeys`, `getIndexedCatalogFamilyKeys` |

---

## 9. Carta ARUco — Specifiche per Stampa

- **Formato:** 85.6 × 54 mm (ISO/IEC 7810 ID-1, biglietto da visita standard)
- **Design:** White Clinical (header blu cobalto #0a3d8f, corpo bianco, logo Formicanera)
- **Marker:** ARUco DICT_4X4_50, ID=42, lato fisico **20mm**, colore stampa: nero puro (#000000)
- **Materiale consigliato:** cartoncino 350g + plastificazione opaca
- **Precisione stampa:** il lato del marker deve essere 20.0mm ±0.3mm — usare la stampa a scala 100% (non "adatta alla pagina")
- **File da produrre:** PDF vettoriale con marker generato da `js-aruco2` → canvas → export

---

## 10. Strategia di Test

### Unit test
- `ShapeClass` keyword mapping: ogni keyword → shape_class attesa
- `HeadMeasurer`: dato px_per_mm noto + shank_px mockato → head_mm atteso
- `CatalogSearcher`: query con tolleranza → candidati attesi (integration test su DB reale)

### Integration test
- Pipeline end-to-end con immagine di test nota: foto H251 ACR (HP, cono_tondo, ~6mm testa) → deve ritornare `match` con family `H251`
- Fallback ARUco assente: stessa foto senza marker → deve classificare HP correttamente
- Tolleranza escalation: misura off-by-0.4mm → non trovato nel primo step, trovato allargando tolleranza

### Out of scope per questo spec
- Test frontend (UI state machine, ARUco detection browser) → spec UI separata
- Load test del pipeline → `archibald-web-app/load-tests`

---

## 11. Out of Scope (sessione separata)

- Frontend ToolRecognitionPage: stato machine, guida ARUco, progress bar, schermata risultato con thumbnail, navigazione verso scheda articolo
- Redesign schede articolo
- PDF stampabile carta ARUco (generazione automatica)

---

## 12. Progetto Dipendente — Catalog DB Rebuild

Il DB `shared.catalog_entries` attuale è un'estrazione parziale e imprecisa del catalogo Komet 2025. Problemi confermati:
- `ring_color` assente per carburi (il ● colore nel catalogo non è estratto per `grit_indicator_type='blade_count'`)
- `working_length_mm` (campo L) non strutturato — solo in testo `identification_clues` per 176/1.639 articoli
- Codice ISO shape (6 cifre) non estratto
- Dati siti web Komet internazionali non integrati
- Foto varianti (size/grit specifici) non completamente associate

**Fonti dati disponibili per la ricostruzione:**
1. PDF catalogo interattivo 2025 (782 pagine) — già presente localmente
2. Strip campionario ad alta risoluzione — già in `catalog_family_images` (source_type='campionario')
3. Siti web Komet internazionali (komet-dental.com, komet.de, ecc.)
4. Foto prodotto alta definizione per ogni articolo

**Piano:** progetto `catalog-db-rebuild` separato con propria spec. La pipeline di riconoscimento è **progettata per adattarsi alla nuova schema** — il layer CatalogSearcher è isolato, e la query SQL verrà aggiornata quando il nuovo schema è disponibile. Fino ad allora il sistema opera con schema attuale + tolleranze progressive come safety net.

---

## 13. Dipendenze e Rischi

**Immagini di riferimento per VisualConfirmer:** Le strip campionario (`source_type='campionario'`) sono foto reali su fondo nero — ring color visibile, proporzioni precise, qualità ottima per Opus 4.7. Le pagine catalogo PDF (`source_type='catalog_pdf'`) forniscono render 2D + dettaglio testa attiva. La combinazione è più che sufficiente per la conferma visiva.

| Rischio | Probabilità | Mitigazione |
|---|---|---|
| InstrumentDescriptor (Haiku) troppi `null` → SQL senza filtri → top-5 candidati non pertinenti | Media | `INSTRUMENT_DESCRIPTOR_MODEL` configurabile: switch a Sonnet 4.6 o Opus 4.7 senza modifiche codice |
| Haiku misura `head.diameter_px` con errore >10% su foto senza ARUco → SQL manca il match | Media | Tolleranza progressiva SQL (5 step da ±0.3 a ±0.6mm); ARUco elimina il problema alla radice |
| `shape_class` keyword mapping incompleto → `'altro'` per >15% → filtro SQL inutile | Bassa | Script diagnostico pre-migration 064; keyword mapping su inglese + italiano + tedesco |
| Grit ring color non nel DB per carburi → `grit_color` filter SQL non funziona per blade_count | Alta | Filtro grit_color applicato solo a `ring_color` type; per carburi → solo `product_type` + `shape_class` |
| Carta ARUco non distribuita → sistema sempre in fallback gambo ISO | Media | Fallback funzionale; carta da distribuire progressivamente; guida "retry ARUco" prima del fallback |
| VisualConfirmer (Opus) sbaglia su shortlist ≤5 sbagliata (SQL ha escluso il match corretto) | Bassa | Fallback progressivo SQL a 5 step; se ancora 0 candidati → `not_found` con misure esposte per debug |
| ISO shape code (6 cifre) non nel DB → impossibile filtro strutturato per forma precisa | Confermato | Si usa `shape_class` + visual confirmation Opus; sufficiente per MVP |
