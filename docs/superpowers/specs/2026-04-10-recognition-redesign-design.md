# Recognition System Redesign — Design Spec
**Data**: 2026-04-10  
**Stato**: Approvato dall'utente  
**Autore**: Brainstorming session

---

## Contesto e motivazione

Il sistema di riconoscimento attuale usa Claude Sonnet come motore di retrieval in un loop agentico fino a 6 iterazioni. Questo approccio ha fallimenti strutturali:

- **VLM usato come retrieval engine**: Claude cerca tra 1.600 famiglie via SQL fulltext — un task per cui non è ottimizzato. Il retrieval per similarità visiva deve avvenire nello spazio dei vettori, non nel ragionamento linguistico.
- **Token explosion**: 100–160k token osservati in produzione, ora cappati a 60k con exit prematuro.
- **RULE B (ABSOLUTE)**: forza shortlist su qualsiasi strumento HP senza anello colorato — causa la maggioranza degli shortlist, indipendentemente dalla chiarezza della foto.
- **Family code allucinati**: Claude genera codici non esistenti nel DB (es. `8863`, `5`, `6801`) → downgrade forzato a `not_found`.
- **Latenza 30–60s**: inaccettabile per uso in campo.

**Criterio di successo primario**: massimo tasso di match definitivo (priorità A).

---

## Architettura — Two-Stage Retrieval

Il sistema si divide nettamente in due momenti:

### Offline — Index Building (una tantum + aggiornamenti incrementali)

Per ogni famiglia del catalogo, si raccolgono 2–4 immagini di riferimento da fonti in ordine di priorità, le si embeddano con Jina v4 API e si salvano in pgvector.

```
Sorgenti immagini → Jina Embeddings v4 → vector(2048) → pgvector HNSW
```

**Sorgenti per l'embedding index (ordine di priorità)**:

1. **Pagine catalogo PDF** (priority=3 per embedding): ogni famiglia ha un campo `catalog_page` in `catalog_entries`. La pagina PDF mostra l'illustrazione del prodotto — una famiglia per pagina. Già renderizzabili come PNG da `/home/deploy/archibald-app/catalog/komet-2025.pdf`. Fonte principale per l'embedding: immagine singola, chiarezza geometrica, nessun preprocessing.
2. **Siti Komet** (priority=2 per embedding): immagini singole per prodotto, fondo bianco, massima qualità. **Prerequisito**: sessione di discovery su komet.it, kometdental.com, kometusa.com, komet.fr (Fase 0b) per scegliere 1–2 fonti e documentare struttura URL prima di costruire lo scraper.
3. **Campionario strips — solo per Claude reasoning** (priority=1, NON per embedding HNSW): le strip mostrano 4–9 strumenti affiancati in una sola immagine. Embeddare la strip intera produce un vettore che rappresenta un collage semanticamente inutile per ANN search. Le strip restano disponibili per il secondo stadio (Claude reasoning) come già avviene oggi — vengono passate come immagini aggiuntive nel prompt di disambiguazione, non indicizzate in pgvector.

> **Nota Fase 0a** — Campionario max-res: verificare se le strip sul VPS sono alla massima risoluzione disponibile su komet.it (gerarchia: sezione → strip thumbnail → JPG → JPG max-res). Ri-scaricare se necessario. Le strip aggiornate migliorano la qualità del reasoning di Claude ma non l'ANN search.
>
> **Crop per-famiglia (futuro)**: se in futuro si vuole usare i campionario per l'embedding, occorre annotare le bounding box per famiglia in `StripEntry` (lavoro manuale su ~150 strip) o sviluppare un metodo di crop automatico. Questo è fuori scope per questa iterazione.

### Online — Query Pipeline (per ogni scan, ~5–12s totali)

```
Foto agente
  → Jina v4 API (query embedding, input_type: "query")   ~100ms
  → pgvector HNSW ANN search (top-50 immagini)           ~5ms
  → deduplication per family_code in Node.js             ~1ms
  → top-10 famiglie uniche con immagini riferimento
  → Claude Sonnet (foto + 10 reference images, max 2 iter)  ~4–8s
  → routing basato su confidence score
```

---

## Data Model — Migration 056

### Nuova tabella: `shared.catalog_family_images`

```sql
-- Abilita estensione pgvector (idempotente)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE shared.catalog_family_images (
  id              bigserial PRIMARY KEY,
  family_code     text NOT NULL,
  source_type     text NOT NULL CHECK (source_type IN ('campionario', 'catalog_pdf', 'website')),
  source_url      text,           -- URL originale (komet.it, ecc.)
  local_path      text NOT NULL,  -- path VPS assoluto
  priority        int NOT NULL DEFAULT 0,  -- 3=campionario, 2=catalog_pdf, 1=website
  width           int,
  height          int,
  visual_embedding vector(2048),  -- NULL finché non indicizzato
  indexed_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indice HNSW solo su righe indicizzate
CREATE INDEX ON shared.catalog_family_images
  USING hnsw (visual_embedding vector_cosine_ops)
  WHERE visual_embedding IS NOT NULL;

-- Indice per lookup per famiglia (ordinato per priority DESC)
CREATE INDEX ON shared.catalog_family_images (family_code, priority DESC);
```

**Stima**: ~5.000 righe (1.600 famiglie × media 3 immagini). Storage vettori: ~40MB.

### Modifica: `shared.catalog_entries`

```sql
ALTER TABLE shared.catalog_entries
  ADD COLUMN last_indexed_at timestamptz;
```

Unica aggiunta — nessun breaking change alla struttura esistente.

### Query ANN a runtime (2 passi)

```sql
-- Passo 1: HNSW search (usa indice, ~5ms, top-50 immagini)
SELECT id, family_code,
  1 - (visual_embedding <=> $1::vector) AS similarity,
  local_path, source_type
FROM shared.catalog_family_images
WHERE visual_embedding IS NOT NULL
ORDER BY visual_embedding <=> $1::vector
LIMIT 50;
```

```typescript
// Passo 2: deduplication in Node.js (~1ms)
// → best similarity per family_code → top-10 famiglie uniche ordinate per similarity
const top10 = deduplicateByFamily(rows).slice(0, 10);
```

---

## Engine Redesign

### Cosa viene rimosso

| Componente | Motivo rimozione |
|---|---|
| `search_catalog` tool | Retrieval ora fatto da pgvector |
| `get_catalog_page` tool | Immagini passate upfront nel messaggio |
| Loop agentico 6 iterazioni | Max 2 iterazioni sufficienti |
| RULE A (flame vs torpedo mandatory shortlist) | Superflua con retrieval visivo |
| RULE B ABSOLUTE (HP no-ring mandatory shortlist) | Causa principale degli shortlist evitabili |
| Token budget 60k | Non più necessario con prompt semplificato |
| Stato `disambiguation_camera` | Sostituito da `photo2_request` automatico |

### Nuovo prompt Claude (struttura)

Il prompt non enumera sottoinsiemi di forme o shank — Claude descrive liberamente quello che vede e confronta visivamente con le immagini di riferimento precaricate. Se si vuole fornire vocabolario senza creare bias, si include la **tassonomia completa** dal DB (`product_type` e `shank_type` certificati) come dizionario consultabile, non come lista chiusa.

```
You are identifying a Komet dental instrument from a photo.

The vector search system has pre-selected the top-10 most visually similar families
from our catalog. Each candidate includes: family code, description, and reference images.

STEP 1 — Eliminate candidates whose shape is clearly different from the photo.
STEP 2 — Among remaining candidates, identify the closest match by comparing:
  • Shape, proportions, and body profile
  • Tip geometry and apex
  • Shank characteristics
  Trust visual comparison over text classification.
STEP 3 — Submit with honest confidence.

Confidence guide:
  ≥ 0.85 : shape clearly matches one candidate → submit as match
  0.65–0.84 : probable match, some uncertainty → submit with candidates[] fallback
  < 0.65 : genuinely uncertain between 2–3 → list as candidates[], do NOT force a match

You must NOT force a definitive match when uncertain.
You must NOT add candidates not present in the top-10 list provided.
```

### Tool set semplificato

**Unico tool**: `submit_identification` — invariato nella struttura base, con un campo opzionale aggiunto:

```typescript
{
  product_code: string,       // "FAMILY.SHANK.SIZE" o ""
  candidates?: string[],      // 2–3 alternative quando incerto
  confidence: number,         // 0.0–1.0
  reasoning: string,          // spiegazione breve
  photo_request?: string      // NUOVO: istruzione Claude → agente, in italiano
}
```

**`photo_request`**: Claude scrive in italiano l'istruzione specifica per l'agente quando ha bisogno di un'altra angolazione. Il testo è contestuale e non hardcoded:
- *"Scatta la testa dello strumento direttamente dall'alto — ho bisogno di vedere se la punta è piatta o arrotondata"*
- *"Fotografa la giunzione tra lo shank e la testa — devo vedere se c'è un collarino o una tacca"*
- *"Avvicina la fotocamera alla punta — devo vedere se termina a punto acuto o con una piccola zona piatta"*

### Routing basato su confidence (engine, non Claude)

La decisione di richiedere una seconda foto è dell'engine, non di Claude. Claude contribuisce solo il testo dell'istruzione (`photo_request`); se non lo include, l'engine usa un fallback generico.

```typescript
// recognition-engine.ts
const result = await claudeReasoning(photo, top10candidates);

if (result.confidence >= 0.85) {
  return { state: 'match', product: result.product };
}

if (!isSecondPhoto) {
  return {
    state: 'photo2_request',
    candidates: result.candidates,
    // testo Claude se presente, altrimenti fallback generico
    instruction: result.photo_request ?? 'Scatta un\'altra angolazione dello strumento'
  };
}

// seconda foto → sempre shortlist_visual (hard cap: max 2 foto automatiche)
return { state: 'shortlist_visual', candidates: result.candidates };
```

---

## Tipo `RecognitionResult` — aggiornamento

Il discriminated union `RecognitionResult` in `backend/src/recognition/types.ts` (e il tipo speculare in `frontend/src/api/recognition.ts`) deve aggiungere il nuovo membro `photo2_request` e rinominare `shortlist` in `shortlist_visual` (oppure aggiungere `shortlist_visual` come alias distinto):

```typescript
type RecognitionResult =
  | { state: 'match';           product: ProductMatch; confidence: number }
  | { state: 'shortlist_visual'; candidates: CandidateMatch[] }   // era 'shortlist'
  | { state: 'photo2_request';  candidates: string[]; instruction: string }  // NUOVO
  | { state: 'not_found' }
  | { state: 'budget_exhausted' }
  | { state: 'error'; message: string }
```

**Flusso della seconda foto** — stesso endpoint `POST /api/recognition/identify`:
- Prima foto: body `{ images: [base64_photo1] }` → può tornare `photo2_request`
- Seconda foto: body `{ images: [base64_photo1, base64_photo2] }` — l'engine rileva `images.length === 2` come flag "è la seconda foto" → routing va sempre a `match` o `shortlist_visual`, mai di nuovo a `photo2_request`
- La cache usa SHA256 del combined buffer di entrambe le immagini (comportamento già esistente per multi-foto)
- I risultati della seconda foto **sono cacheable** (stessa coppia di foto → stesso risultato): cache scritta normalmente

**Migrazione stati frontend**:
- `disambiguation_camera` → rimosso, sostituito da `photo2_request`
- `disambiguation_analyzing` → rimosso, sostituito da `analyzing2`
- `shortlist` → diventa `shortlist_visual` (o viene esteso con dati immagini di riferimento)

---

## Nuovi stati UX

| Stato | Trigger | Descrizione |
|---|---|---|
| `idle` | start | Camera aperta, un solo schermo |
| `analyzing` | foto scattata | Spinner ~5–10s |
| `match` | confidence ≥ 0.85 | Risultato definitivo |
| `photo2_request` | confidence < 0.85, prima foto | Sistema mostra istruzione Claude, camera si apre al tap |
| `analyzing2` | seconda foto scattata | Spinner |
| `shortlist_visual` | ancora incerto dopo foto 2 | Candidati affiancati con immagini riferimento, agente clicca |
| `not_found` | similarity < 0.45 (early exit) o nessun match | Strumento non in catalogo |

**Schermata `photo2_request`**:
```
[icona camera]
Ho bisogno di un'altra foto
«[testo generato da Claude in italiano, contestuale]»
[pulsante: Scatta ora]
```

---

## Error Handling

| Scenario | Comportamento |
|---|---|
| **Jina v4 API down** | Degradazione graceful: SQL fulltext per top-10 → Claude ugualmente. Match rate più basso ma sistema operativo. |
| **Top similarity < soglia** | Early exit: `not_found` senza chiamare Claude. La soglia è configurabile via variabile d'ambiente `RECOGNITION_MIN_SIMILARITY` (default conservativo: `0.20` per il primo run in produzione). **Non hardcodare** — deve essere calibrata empiricamente osservando la distribuzione dei similarity score nei primi 100–200 scan reali loggati in `recognition_log`. |
| **Claude timeout / errore** | Invariato: `state: 'error'`, agente può riprovare. |
| **Budget giornaliero esaurito** | Invariato: `state: 'budget_exhausted'`. |
| **Loop photo_request** | Hard cap: dopo la seconda foto → sempre `shortlist_visual`, mai terza richiesta automatica. |
| **Indice vuoto / parziale** | Se `catalog_family_images` ha 0 righe indicizzate → fallback automatico al vecchio engine. |

---

## Componenti: nuovo vs invariato

### Nuovo / modificato
- `build-visual-index` — nuova operation per costruire l'indice
- `visual-embedding-service.ts` — client Jina v4 (REST API)
- `komet-scraper.ts` — scraper per siti Komet (dopo discovery)
- `recognition-engine.ts` — rimozione loop, aggiunta ANN query + routing confidence
- `anthropic-vision-service.ts` — nuovo prompt, tool set ridotto, parsing `photo_request`
- Migration 056 — `catalog_family_images` + `last_indexed_at`
- Frontend: stato `photo2_request` + schermata `shortlist_visual` affiancata

### Invariato
- Route `POST /api/recognition/identify`
- Cache SHA256
- Budget giornaliero e rate limiting (10 req/60s)
- Log riconoscimento (`recognition_log`)
- Campionario strips sul VPS (stesso volume mount)
- Catalogo PDF sul VPS

---

## Testing Strategy

### Unit tests
- `visual-embedding-service`: mock Jina API, errori rete, retry
- `recognition-engine`: routing per confidence (0.85/0.65/bassa), early exit similarity < 0.45, fallback SQL
- Parsing `photo_request` dal tool `submit_identification`

### Integration tests
- Pipeline completo: Jina mock + pgvector su DB test + Claude mock → verifica stati corretti
- `photo2_request` end-to-end: foto 1 → stato photo2_request → foto 2 → shortlist_visual
- Cache SHA256 invariata

### Validazione indice (manuale, post-build)
- Sample 20 famiglie → verificare che top-10 ANN siano visivamente sensati
- Caso critico: 879 (torpedo) deve essere vicino a 863 (flame) e 807 (inverted cone)
- Confronto match rate: nuovo vs vecchio engine su log produzione

---

## Piano di rollout (fasi)

| Fase | Contenuto |
|---|---|
| **0a** | Audit risoluzione campionario VPS → ri-scarica versioni max-res dove necessario |
| **0b** | Discovery komet.it / kometdental.com / kometusa.com / komet.fr → scegli 1–2 fonti, documenta struttura URL |
| **1** | Scraping fonti selezionate + download immagini + migration 056 + build indice Jina v4 |
| **2** | Backend: engine redesign + nuovi test + validazione indice su staging |
| **3** | Frontend: stato `photo2_request` + shortlist visiva affiancata |
| **4** | Deploy + monitoring match rate + confronto log + iterazione |

---

## Costi stimati

| Voce | Stima |
|---|---|
| Index building (una tantum) | ~5.000 immagini × Jina v4 free tier = $0 |
| Per scan (embedding query) | ~$0.000001 (Jina free tier) |
| Per scan (Claude Sonnet su 10 candidati) | ~$0.003 |
| **Totale per scan** | **~$0.003–0.004** (vs $0.01+ attuale) |
| Token per scan | ~3–8k (vs 60–160k attuale) |
