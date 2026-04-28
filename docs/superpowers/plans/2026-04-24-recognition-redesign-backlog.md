# Recognition Redesign — Sessioni Future (Backlog)

Questo documento raccoglie tutto ciò che è esplicitamente **out-of-scope** dal piano principale
`2026-04-24-recognition-redesign.md`. Ogni blocco è indipendente e può essere brainstormato/pianificato
separatamente nella sessione appropriata.

---

## Blocco A — Frontend Recognition UI Redesign

**Priorità:** Alta — bloccante per il rilascio in produzione del nuovo backend  
**Dipende da:** Piano principale completato (Task 1–11)  
**Spec da creare:** `docs/superpowers/specs/YYYY-MM-DD-recognition-ui-redesign.md`

### A1 — Migrazione discriminant `state` → `type`

Il backend usa ora `result.type` come discriminant (era `result.state`). Il frontend attuale
(`ToolRecognitionPage` e componenti collegati) usa ancora `result.state` → TypeScript emetterà
errori dopo che il backend è aggiornato.

**Cosa cambia:**
```typescript
// VECCHIO
if (result.state === 'match') { ... }
if (result.state === 'not_found') { ... }
if (result.state === 'budget_exhausted') { ... }

// NUOVO
if (result.type === 'match') { ... }
if (result.type === 'not_found') { ... }
if (result.type === 'budget_exhausted') { ... }
```

**Impatto:** cercare `result.state` in `archibald-web-app/frontend/src/` per trovare tutti i punti
di uso. Probabilmente `ToolRecognitionPage.tsx` e relativi componenti di risultato.

---

### A2 — Flusso ARUco: istruzioni + foto con carta

Il nuovo backend accetta opzionalmente `aruco_px_per_mm` nel body. Il frontend deve:

1. **Prima della foto** — mostrare istruzioni: "Posiziona lo strumento accanto alla carta ARUco"
   con immagine guida (mockup della carta bianca clinica con marker nero).
2. **Rilevazione ARUco** — dopo che l'utente scatta/carica la foto, eseguire js-aruco2 in un
   Web Worker per calcolare `px_per_mm` dai 4 angoli del marker 20mm.
3. **ARUco assente** — se il marker non viene rilevato:
   - Mostrare avviso: "Carta ARUco non rilevata nella foto"
   - Opzione 1: "Riprova con la carta" → back al passo foto
   - Opzione 2: "Procedi senza carta" → invia senza `aruco_px_per_mm` (il backend usa fallback gambo ISO)
4. **ARUco rilevato** — mostrare feedback visivo: "Calibrazione rilevata: X.X px/mm ✓" prima di inviare.

**Libreria da integrare:** `js-aruco2` (npm). Usare Web Worker per non bloccare UI thread.

**Specifica marker:** DICT_4X4_50 ID=42, lato fisico 20mm.

**Calcolo px/mm:**
```typescript
// I 4 angoli del marker in pixel → lato in pixel → dividi per 20mm
const corners = aruco.detect(imageData)[0]?.corners  // [{x,y}, {x,y}, {x,y}, {x,y}]
const sideTopPx = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y)
const pxPerMm = sideTopPx / 20.0
```

---

### A3 — UI risultato: shortlist ≤5 candidati

Quando `result.type === 'match'` ma `result.confidence < 0.85`, oppure quando il backend
restituisce una shortlist esplicita, il frontend deve mostrare:

- Lista 3–5 card prodotto candidate (foto campionario + family_code + nome + misura testa)
- Possibilità di selezionare manualmente il candidato corretto
- La selezione invia un evento `feedback` al backend (`POST /api/recognition/feedback`)

**Nota:** il backend attuale espone già `POST /api/recognition/feedback` con body
`{ imageHash, productId, confirmedByUser }`.

---

### A4 — UI risultato: not_found + MeasurementSummary

Quando `result.type === 'not_found'`, il backend restituisce `MeasurementSummary` con:
```typescript
{
  measurementSource:  'aruco' | 'shank_iso' | 'none'
  pxPerMm:            number | null
  headDiameterMm:     number | null
  headLengthMm:       number | null
  shapeClass:         ShapeClass
  shankGroup:         string
  gritIndicatorType:  string | null
  sqlFallbackStep:    number   // 0–5, quanti step di fallback tentati
}
```

Mostrare in UI un riepilogo diagnostico: "Misure rilevate: Ø testa 3.4mm, forma cono, gambo CA/HP —
nessun articolo trovato in catalogo (6 tentativi di ricerca)."

Utile per: debug agente in campo + futura segnalazione al supporto.

---

## Blocco B — Carta ARUco: PDF Stampabile

**Priorità:** Alta — necessaria per il flusso A2 (ARUco detection frontend)  
**Dipende da:** Blocco A completato (o in parallelo — la carta può essere stampata prima dell'UI)  
**Spec da creare:** `docs/superpowers/specs/YYYY-MM-DD-aruco-card-pdf.md`

### Specifiche carta (già definite nella spec brainstorming)

| Campo | Valore |
|---|---|
| Formato | 85.6 × 54 mm (ISO 7810 ID-1 — biglietto da visita) |
| Design | White Clinical |
| Header | `#0a3d8f` (blu Formicanera) |
| Logo | Formicanera circolare, bianco su blu |
| Marker | DICT_4X4_50 ID=42 |
| Lato fisico marker | 20 mm (CRITICO — il calcolo px/mm dipende da questo) |
| Colore marker | nero puro (#000000) |
| Testo card | "Carta di Calibrazione ARUco · Formicanera · 20mm" |

### Opzioni implementazione

**Opzione 1 — PDF generato da script Node.js** (consigliata per prototipazione rapida):
- Script `scripts/generate-aruco-card.mjs` che genera il PDF via `pdfkit` o `jspdf`
- Il marker ARUco 4x4_50 ID=42 può essere generato via libreria `js-aruco2` lato Node
  o hardcodato come SVG (il pattern è deterministico e non cambierà mai)
- Output: `docs/assets/aruco-card-calibrazione.pdf` pronto per la stampa

**Opzione 2 — HTML/CSS stampabile** (più semplice, nessuna dipendenza):
- Pagina HTML con CSS `@media print`, dimensioni fisiche in mm via `@page { size: 85.6mm 54mm }`
- Il marker ARUco è un SVG embedded (16×16 pixel, scala 1.25mm/cella)
- Aprire in browser → Cmd+P → "Nessun margine" → stampa

**Raccomandazione:** Opzione 2 per la prima versione. Il SVG del marker ID=42 (DICT_4X4_50)
è una griglia 6×6 (4×4 interno + bordo 1 cell):
```
Il pattern bit esatto del marker DICT_4X4_50 ID=42 deve essere verificato
da sorgente js-aruco2 o OpenCV — non hardcodare senza verifica.
```

---

## Blocco C — js-aruco2 Web Worker (Frontend)

**Priorità:** Media — necessario per il Blocco A ma complesso da integrare  
**Dipende da:** Blocco A iniziato  
**Spec da creare:** parte della spec Blocco A  

### Cosa serve

```bash
npm install js-aruco2 --prefix archibald-web-app/frontend
```

**Worker file:** `archibald-web-app/frontend/src/workers/aruco-detector.worker.ts`

```typescript
import { AR } from 'js-aruco2'

const detector = new AR.Detector()

self.onmessage = (event: MessageEvent<{ imageData: ImageData }>) => {
  const markers = detector.detect(event.data.imageData)
  const marker42 = markers.find(m => m.id === 42)

  if (!marker42 || marker42.corners.length !== 4) {
    self.postMessage({ detected: false, pxPerMm: null })
    return
  }

  const c = marker42.corners
  // Media dei 4 lati per robustezza
  const sides = [
    Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y),
    Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y),
    Math.hypot(c[3].x - c[2].x, c[3].y - c[2].y),
    Math.hypot(c[0].x - c[3].x, c[0].y - c[3].y),
  ]
  const avgSidePx = sides.reduce((a, b) => a + b, 0) / 4
  const pxPerMm = avgSidePx / 20.0

  self.postMessage({ detected: true, pxPerMm })
}
```

**Hook:** `useArucoDetector(imageBase64: string): { detected: boolean; pxPerMm: number | null }`  
Crea il worker via `new Worker(new URL('../workers/aruco-detector.worker.ts', import.meta.url))`,
disegna l'immagine su un OffscreenCanvas, estrae `ImageData`, invia al worker.

**Nota Vite:** assicurarsi che `vite.config.ts` supporti `?worker` o `new URL(..., import.meta.url)`
per i Web Worker (Vite 4+ supporta nativo, nessuna config extra richiesta).

---

## Blocco D — Catalog DB Rebuild

**Priorità:** Bassa-Media — migliora la qualità dei match ma non blocca il rilascio  
**Dipende da:** Piano principale completato  
**Spec da creare:** `docs/superpowers/specs/YYYY-MM-DD-catalog-db-rebuild.md`  
**Memoria:** `memory/project_catalog_db_rebuild.md`

### Problemi noti in `shared.catalog_entries` (1.639 righe)

| Campo | Problema |
|---|---|
| `ring_color` | Mancante per carburi (grit_indicator_type=blade_count): il colore fisico dell'anello esiste ma non è estratto |
| `working_length_mm` | Non come colonna strutturata — solo testo per 176/1.639 articoli |
| ISO shape code (6 cifre) | Non estratto — 0/1.639 articoli ce l'hanno |
| Foto varianti | Non tutte associate per size/grit specifico |
| Dati siti Komet internazionali | Non integrati (komet-dental.com, komet.de, komet.fr) |

### Fonti dati disponibili

1. **PDF catalogo Komet 2025** (782 pagine) — `/Users/hatholdir/Downloads/Catalogo_interattivo_2025 (1).pdf`
2. **Strip campionario** — già in `catalog_family_images` (`source_type='campionario'`) — ottime per VisualConfirmer
3. **Siti web Komet internazionali** — komet-dental.com, komet.de, komet.fr — dati strutturati (HTML) per ogni articolo
4. **Foto prodotto** — anche dal PDF per la testa attiva

### Schema futuro (da progettare)

```sql
-- Aggiunte al schema attuale
ALTER TABLE shared.catalog_entries
  ADD COLUMN ring_color TEXT,           -- colore fisico anello per TUTTI gli strumenti
  ADD COLUMN working_length_mm FLOAT,   -- lunghezza di lavoro strutturata
  ADD COLUMN iso_shape_code TEXT;       -- codice ISO 6 cifre
```

### Approccio consigliato

Pipeline di estrazione a 3 step:
1. **Scraper siti Komet** — estrai dati strutturati per ogni family_code da komet-dental.com
2. **PDF parser** — estrai misure e codici ISO dalle schede tecniche PDF (782 pagine)
3. **Merge + validation** — confronta le due fonti, risolvi conflitti, aggiorna DB

**Nota architetturale:** il layer `CatalogSearcher` è già isolato in `catalog-searcher.ts` con
`DbPool` iniettabile — quando il nuovo schema è pronto, basta aggiornare la query SQL senza
modificare il resto della pipeline.

---

## Riepilogo dipendenze

```
Piano principale (Task 1–11) — Backend
        │
        ├── Blocco B (Carta ARUco PDF)    ← indipendente, può partire subito
        │
        └── Blocco A (Frontend UI)        ← dipende da: piano principale
                  │
                  ├── A1 (state→type fix)    ← critico, primo da fare
                  ├── A2 (flusso ARUco)      ← dipende da: Blocco B + Blocco C
                  ├── A3 (shortlist UI)
                  └── A4 (not_found debug)
                            │
                            └── Blocco C (js-aruco2 Worker)  ← parte di A2

Blocco D (Catalog DB Rebuild) ← indipendente, bassa urgenza
```

---

## Ordine di esecuzione consigliato

1. **Oggi:** Piano principale (Task 1–11) — backend completo, test verdi
2. **Prossima sessione:** Blocco B (carta ARUco PDF) — rapido, nessuna dipendenza
3. **Poi:** Blocco A, partendo da A1 (type fix) → A3+A4 → A2 (ARUco UI con Blocco C)
4. **Quando serve qualità match:** Blocco D (Catalog DB Rebuild) — sessione separata, lunga
