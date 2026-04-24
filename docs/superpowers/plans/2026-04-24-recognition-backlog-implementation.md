# Recognition System — Frontend Completion & Deploy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completare il frontend del nuovo sistema di riconoscimento (ARUco + Haiku + SQL + Opus), deployarlo in produzione con migration 064+065, e arricchire `catalog_entries` con dati mancanti (ring_color carburi, working_length_mm, iso_shape_code) via scraper + PDF parser (Blocco D).

**Architecture:** 12 task in sequenza: install js-aruco2 + estrai pattern marker → carta ARUco HTML/CSS stampabile → migrazione tipi frontend (state→type, nuovi payload) → Web Worker ARUco + hook → refactor ToolRecognitionPage (rimuovi photo2_request, aggiungi aruco_absent + not_found, aggiorna match/shortlist) → banner ARUco + calibration toast → migration prod + merge + deploy → Blocco D: migration 066 → scraper komet-dental.com → PDF parser catalogo 782pp → merge + backfill → update CatalogSearcher SQL + deploy finale.

**Tech Stack:** React 19 + TypeScript strict + Vite + Vitest + Testing Library, js-aruco2, inline styles, PostgreSQL (SSH + Docker exec), node-fetch, pdf-parse.

**Spec:** `docs/superpowers/plans/2026-04-24-recognition-redesign-backlog.md`

---

## File Structure

### Nuovi file
| File | Responsabilità |
|---|---|
| `docs/assets/aruco-card-calibrazione.html` | Carta di calibrazione stampabile 85.6×54mm |
| `archibald-web-app/frontend/src/utils/aruco-compute.ts` | `computePxPerMm(corners)` — pura, testabile |
| `archibald-web-app/frontend/src/utils/aruco-compute.spec.ts` | Unit test computePxPerMm |
| `archibald-web-app/frontend/src/workers/aruco-detector.worker.ts` | Web Worker: rileva marker ID=42, ritorna pxPerMm |
| `archibald-web-app/frontend/src/hooks/useArucoDetector.ts` | Hook React: crea Worker, esegue detection da base64 |

### File modificati — Frontend
| File | Modifica |
|---|---|
| `archibald-web-app/frontend/src/api/recognition.ts` | Nuovi tipi (type vs state, ProductMatch, MeasurementSummary), arucoPxPerMm in identifyInstrument |
| `archibald-web-app/frontend/src/api/recognition.spec.ts` | Aggiorna mock IdentifyResponse (state → type) |
| `archibald-web-app/frontend/src/pages/ToolRecognitionPage.tsx` | Rimuovi photo2_request, aggiungi aruco_absent + not_found, aggiorna match+shortlist, ARUco banner+calibration |
| `archibald-web-app/frontend/src/pages/ToolRecognitionPage.spec.tsx` | Aggiorna tutti i mock, rimuovi test photo2_request, aggiungi test aruco_absent + not_found + banner |

### Blocco D — nuovi file
| File | Responsabilità |
|---|---|
| `archibald-web-app/backend/src/db/migrations/066-catalog-enriched-fields.sql` | ADD COLUMN ring_color, working_length_mm, iso_shape_code a catalog_entries |
| `archibald-web-app/backend/scripts/enrich-catalog-komet.mjs` | Scraper komet-dental.com → JSON per-family_code con ring_color/working_length/iso_code |
| `archibald-web-app/backend/scripts/parse-catalog-pdf.mjs` | Parser PDF catalogo 782pp → JSON per-family_code con working_length/iso_code |
| `archibald-web-app/backend/scripts/merge-catalog-enrichment.mjs` | Merge + validate le due fonti → SQL UPDATE catalog_entries in prod |

### Blocco D — file modificati
| File | Modifica |
|---|---|
| `archibald-web-app/backend/src/recognition/catalog-searcher.ts` | Aggiunge filtro ring_color per strumenti blade_count quando il campo è disponibile |

---

## Task 1: Install js-aruco2 + verifica pattern DICT_4X4_50 ID=42

**Files:**
- Modify: `archibald-web-app/frontend/package.json`

- [ ] **Step 0: Checkout sul branch corretto**

Tutto il lavoro dei Task 1–6 avviene su `feature/recognition-redesign` (il backend è già completo lì).
Task 7 fa il merge di quel branch su master. Task 8–12 seguono dopo il merge su master.

```bash
git checkout feature/recognition-redesign
```

Verifica:

```bash
git log --oneline -3
```

Atteso: gli ultimi commit del backend recognition redesign (es. `fix(recognition): priority DESC thumbnail...`).

- [ ] **Step 1: Installa js-aruco2**

```bash
npm install js-aruco2 --prefix archibald-web-app/frontend
```

Verifica che `js-aruco2` appaia in `archibald-web-app/frontend/package.json` sotto `dependencies`.

- [ ] **Step 2: Verifica la struttura del modulo**

```bash
node -e "
const AR = require('archibald-web-app/frontend/node_modules/js-aruco2');
console.log('Top-level keys:', Object.keys(AR));
const inner = AR.AR || AR.default || AR;
console.log('Inner keys:', Object.keys(inner));
const D = inner.Detector || inner.AR_Detector;
console.log('Detector class type:', typeof D);
"
```

Prendi nota dell'output. Determina il percorso corretto per istanziare il Detector: `new AR.Detector()`, `new AR.AR_Detector()`, o `new ARLib.AR.Detector()`. Useremo questo nel Task 4.

- [ ] **Step 3: Estrai il pattern del marker ID=42**

```bash
node -e "
const fs = require('fs');
const base = 'archibald-web-app/frontend/node_modules/js-aruco2';
const srcFiles = [];
function walk(dir) {
  try {
    fs.readdirSync(dir).forEach(f => {
      const p = dir + '/' + f;
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.js')) srcFiles.push(p);
    });
  } catch {}
}
walk(base + '/src');
walk(base + '/dist');
walk(base + '/lib');
console.log('JS files:', srcFiles);
"
```

Poi cerca il dizionario ARUCO_4X4_50 in uno dei file trovati:

```bash
# Sostituisci PATH con il file principale trovato (es. src/aruco.js o dist/aruco.js)
grep -n "4x4\|ARUCO\|dictionary\|markers\[42\]" \
  archibald-web-app/frontend/node_modules/js-aruco2/src/aruco.js 2>/dev/null | head -30 || \
grep -rn "4x4\|dictionary" \
  archibald-web-app/frontend/node_modules/js-aruco2/ --include="*.js" | head -20
```

Il pattern per ID=42 che useremo come punto di partenza nel Task 2 (da verificare con l'output):
```
Inner row 0: 1 0 1 1   (1=bianco, 0=nero, MSB=sinistra)
Inner row 1: 0 0 1 0
Inner row 2: 1 1 0 0
Inner row 3: 0 1 0 1
```

Se il dizionario codifica i valori come uint16 (16 bit = 4×4 inner), ID=42 corrisponde all'entry all'indice 42 dell'array. I bit vanno letti MSB-first, riga per riga, da sinistra a destra e dall'alto verso il basso.

---

## Task 2: Blocco B — Carta ARUco HTML/CSS Stampabile

**Files:**
- Create: `docs/assets/aruco-card-calibrazione.html`

- [ ] **Step 1: Crea il file HTML**

Crea `docs/assets/aruco-card-calibrazione.html`. Il marker SVG usa il pattern verificato nel Task 1 Step 3. Le celle `<rect>` nere nell'area inner sono quelle con bit=0; l'area inner ha sfondo bianco (bit=1).

```html
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>Carta di Calibrazione ARUco — Formicanera</title>
<style>
  @page { size: 85.6mm 54mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 85.6mm; height: 54mm; font-family: -apple-system, sans-serif; overflow: hidden; }
  .card { width: 85.6mm; height: 54mm; display: flex; flex-direction: column; background: #fff; }
  .header {
    background: #0a3d8f; color: #fff;
    padding: 2mm 4mm;
    display: flex; align-items: center; gap: 2mm; flex-shrink: 0;
  }
  .logo-circle { width: 8mm; height: 8mm; flex-shrink: 0; }
  .header-text { font-size: 5pt; font-weight: 700; letter-spacing: 0.3mm; line-height: 1.4; }
  .header-sub  { font-size: 4pt; opacity: 0.8; font-weight: 400; }
  .body {
    flex: 1; display: flex; align-items: center;
    justify-content: center; gap: 5mm; padding: 2mm 4mm;
  }
  .marker-wrap { display: flex; flex-direction: column; align-items: center; gap: 1.5mm; }
  .marker-label { font-size: 4pt; color: #555; text-align: center; line-height: 1.3; }
  .instructions { font-size: 4pt; color: #333; line-height: 1.6; max-width: 45mm; }
  .instructions strong { color: #0a3d8f; font-size: 4.5pt; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <svg class="logo-circle" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="15" fill="none" stroke="white" stroke-width="1.5"/>
      <text x="16" y="13" text-anchor="middle" fill="white"
            font-size="5" font-weight="700" font-family="sans-serif">FORMI</text>
      <text x="16" y="20" text-anchor="middle" fill="white"
            font-size="5" font-weight="700" font-family="sans-serif">CANERA</text>
    </svg>
    <div>
      <div class="header-text">FORMICANERA</div>
      <div class="header-sub">Carta di Calibrazione</div>
    </div>
  </div>

  <div class="body">
    <div class="marker-wrap">
      <!--
        Marker DICT_4X4_50 ID=42.
        6×6 cells totali (4×4 inner + 1-cell border su tutti i lati).
        Dimensione fisica: 20mm → ogni cella = 20/6 ≈ 3.333mm.
        SVG viewBox 0 0 6 6, ogni unità = 1 cella.
        0=nero (black), 1=bianco (white).
        Border: sempre nero (riga 0, riga 5, col 0, col 5).
        Pattern inner (verificato in Task 1 Step 3):
          row 0: 1 0 1 1
          row 1: 0 0 1 0
          row 2: 1 1 0 0
          row 3: 0 1 0 1
        Tecnica SVG: sfondo nero totale + rettangoli bianchi per celle=1.
      -->
      <svg width="20mm" height="20mm" viewBox="0 0 6 6" shape-rendering="crispEdges">
        <!-- Sfondo totale nero (border + celle=0) -->
        <rect x="0" y="0" width="6" height="6" fill="black"/>
        <!-- Sfondo bianco per area inner 4×4 -->
        <rect x="1" y="1" width="4" height="4" fill="white"/>
        <!-- Sovrascrivi con nero le celle inner=0 -->
        <!-- Inner row 0 (y=1): 1 0 1 1 → col 2 è nera -->
        <rect x="2" y="1" width="1" height="1" fill="black"/>
        <!-- Inner row 1 (y=2): 0 0 1 0 → col 1,2,4 nere -->
        <rect x="1" y="2" width="1" height="1" fill="black"/>
        <rect x="2" y="2" width="1" height="1" fill="black"/>
        <rect x="4" y="2" width="1" height="1" fill="black"/>
        <!-- Inner row 2 (y=3): 1 1 0 0 → col 3,4 nere -->
        <rect x="3" y="3" width="1" height="1" fill="black"/>
        <rect x="4" y="3" width="1" height="1" fill="black"/>
        <!-- Inner row 3 (y=4): 0 1 0 1 → col 1,3 nere -->
        <rect x="1" y="4" width="1" height="1" fill="black"/>
        <rect x="3" y="4" width="1" height="1" fill="black"/>
      </svg>
      <div class="marker-label">
        ID 42 &middot; DICT_4X4_50<br>
        <strong style="color:#0a3d8f;font-size:5pt">&#9664; 20 mm &#9654;</strong>
      </div>
    </div>

    <div class="instructions">
      <strong>Come usare:</strong><br>
      1. Stampa su carta rigida (glossy)<br>
      2. Ritaglia alle dimensioni<br>
      3. Posiziona accanto allo strumento<br>
      4. Scatta la foto — Formicanera<br>
      &nbsp;&nbsp;&nbsp;misura la scala automaticamente
    </div>
  </div>
</div>
</body>
</html>
```

**⚠ IMPORTANTE**: I `<rect>` nell'SVG riflettono il pattern `1 0 1 1 / 0 0 1 0 / 1 1 0 0 / 0 1 0 1`. Se il Task 1 Step 3 ha rivelato un pattern diverso, aggiorna i `<rect>` di conseguenza prima di committare.

- [ ] **Step 2: Verifica visiva nel browser**

```bash
open docs/assets/aruco-card-calibrazione.html
```

Controlla:
- Marker ARUco visibile: quadrato nero 6×6 con pattern interno
- Header blu `#0a3d8f` con logo Formicanera
- Layout proporzionale a una business card (più largo che alto)

Per stampare: Chrome → Cmd+P → Più impostazioni → Dimensioni: Personalizzato 85.6×54mm → Nessun margine → Stampa.

- [ ] **Step 3: Commit**

```bash
git add docs/assets/aruco-card-calibrazione.html
git commit -m "feat(recognition): carta di calibrazione ARUco DICT_4X4_50 ID=42 stampabile"
```

---

## Task 3: Blocco A1 — Migrazione tipi in recognition.ts

**Files:**
- Modify: `archibald-web-app/frontend/src/api/recognition.ts`
- Modify: `archibald-web-app/frontend/src/api/recognition.spec.ts`

- [ ] **Step 1: Aggiorna i tipi in recognition.ts**

Sostituisci le righe 3–43 (da `export type ThrottleLevel` fino a `imageHash: string        // SHA-256...`) con:

```typescript
export type ThrottleLevel = 'normal' | 'warning' | 'limited'

export type MeasurementSummary = {
  shankGroup:        string | null
  headDiameterMm:    number | null
  shapeClass:        string | null
  measurementSource: 'aruco' | 'shank_iso' | 'none'
}

export type ProductMatch = {
  familyCode:        string
  productName:       string
  shankType:         string
  headDiameterMm:    number | null
  headLengthMm:      number | null
  shapeClass:        string | null
  confidence:        number
  thumbnailUrl:      string | null
  discontinued:      boolean
  measurementSource: 'aruco' | 'shank_iso' | 'none'
}

export type CandidateMatch = {
  familyCode:      string
  thumbnailUrl:    string | null
  referenceImages: string[]
}

export type RecognitionResult =
  | { type: 'match';            data: ProductMatch }
  | { type: 'shortlist_visual'; data: { candidates: CandidateMatch[] } }
  | { type: 'not_found';        data: { measurements: MeasurementSummary } }
  | { type: 'budget_exhausted' }
  | { type: 'error';            data: { message: string } }

export type BudgetState = {
  usedToday:     number
  dailyLimit:    number
  throttleLevel: ThrottleLevel
  resetAt?:      string
}

export type IdentifyResponse = {
  result:       RecognitionResult
  budgetState:  BudgetState
  processingMs: number
  imageHash:    string
}
```

- [ ] **Step 2: Aggiorna la firma di identifyInstrument**

Sostituisci la funzione `identifyInstrument` (righe 108–129) con:

```typescript
export async function identifyInstrument(
  token:        string,
  images:       string[],
  arucoPxPerMm?: number,
): Promise<IdentifyResponse> {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), 90_000)
  try {
    const res = await fetch('/api/recognition/identify', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        images,
        ...(arucoPxPerMm != null && { aruco_px_per_mm: arucoPxPerMm }),
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json() as Promise<IdentifyResponse>
  } finally {
    clearTimeout(timeoutId)
  }
}
```

- [ ] **Step 3: Aggiorna recognition.spec.ts**

In `archibald-web-app/frontend/src/api/recognition.spec.ts`, sostituisci il `mockResponse` alle righe 18–23:

```typescript
const mockResponse: IdentifyResponse = {
  result: {
    type: 'not_found',
    data: {
      measurements: {
        shankGroup: null, headDiameterMm: null, shapeClass: null, measurementSource: 'none',
      },
    },
  },
  budgetState: { usedToday: 5, dailyLimit: 500, throttleLevel: 'normal' },
  processingMs: 123,
  imageHash: 'abc123hash',
}
```

La riga 37 (`expect(init.body).toBe(JSON.stringify({ images: [BASE64] }))`) rimane corretta: quando `arucoPxPerMm` è `undefined`, lo spread `...(undefined != null && {...})` è `...false` e non aggiunge nulla al body.

- [ ] **Step 4: Esegui i test di recognition.spec.ts**

```bash
npm test --prefix archibald-web-app/frontend -- recognition.spec
```

Atteso: tutti e 4 i describe (`identifyInstrument`, `getRecognitionBudget`, `submitRecognitionFeedback`, `getProductEnrichment`) passano.

- [ ] **Step 5: Commit**

```bash
git add \
  archibald-web-app/frontend/src/api/recognition.ts \
  archibald-web-app/frontend/src/api/recognition.spec.ts
git commit -m "feat(recognition): migrazione tipi frontend state→type, ProductMatch rinnovato, arucoPxPerMm"
```

---

## Task 4: Blocco C — computePxPerMm + Web Worker + useArucoDetector

**Files:**
- Create: `archibald-web-app/frontend/src/utils/aruco-compute.ts`
- Create: `archibald-web-app/frontend/src/utils/aruco-compute.spec.ts`
- Create: `archibald-web-app/frontend/src/workers/aruco-detector.worker.ts`
- Create: `archibald-web-app/frontend/src/hooks/useArucoDetector.ts`

- [ ] **Step 1: Crea la directory workers**

```bash
mkdir -p archibald-web-app/frontend/src/workers
```

- [ ] **Step 2: Scrivi il test per computePxPerMm**

Crea `archibald-web-app/frontend/src/utils/aruco-compute.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computePxPerMm } from './aruco-compute'

describe('computePxPerMm', () => {
  it('calcola 5.0 px/mm da quadrato perfetto 100px su marker 20mm', () => {
    const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    expect(computePxPerMm(corners)).toBeCloseTo(5.0, 2)
  })

  it('calcola correttamente da quadrato ruotato (lato = diagonale/sqrt2)', () => {
    const d = 100
    const corners = [{ x: d, y: 0 }, { x: 2 * d, y: d }, { x: d, y: 2 * d }, { x: 0, y: d }]
    expect(computePxPerMm(corners)).toBeCloseTo((d * Math.SQRT2) / 20, 2)
  })

  it('media i 4 lati per robustezza al rumore di rilevazione', () => {
    const corners = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 101, y: 99  },
      { x: 1,   y: 100 },
    ]
    const sides = [
      Math.hypot(100, 0),
      Math.hypot(1, 99),
      Math.hypot(100, 1),
      Math.hypot(1, 100),
    ]
    const expected = sides.reduce((a, b) => a + b, 0) / 4 / 20.0
    expect(computePxPerMm(corners)).toBeCloseTo(expected, 5)
  })
})
```

- [ ] **Step 3: Esegui il test — atteso FAIL**

```bash
npm test --prefix archibald-web-app/frontend -- aruco-compute.spec
```

Atteso: FAIL "Cannot find module './aruco-compute'".

- [ ] **Step 4: Crea aruco-compute.ts**

Crea `archibald-web-app/frontend/src/utils/aruco-compute.ts`:

```typescript
type Corner = { x: number; y: number }

export function computePxPerMm(corners: Corner[]): number {
  const sides = [
    Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y),
    Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y),
    Math.hypot(corners[3].x - corners[2].x, corners[3].y - corners[2].y),
    Math.hypot(corners[0].x - corners[3].x, corners[0].y - corners[3].y),
  ]
  return sides.reduce((a, b) => a + b, 0) / 4 / 20.0
}
```

- [ ] **Step 5: Esegui il test — atteso PASS**

```bash
npm test --prefix archibald-web-app/frontend -- aruco-compute.spec
```

Atteso: 3 test passano.

- [ ] **Step 6: Crea aruco-detector.worker.ts**

Crea `archibald-web-app/frontend/src/workers/aruco-detector.worker.ts`.

**Prima di scrivere**: adatta l'import di js-aruco2 in base all'output del Task 1 Step 2:
- Se `AR.Detector` esiste → usa `ARLib.AR.Detector`
- Se `AR.AR_Detector` esiste → usa `ARLib.AR.AR_Detector`

```typescript
import { computePxPerMm } from '../utils/aruco-compute'

type WorkerInput  = { imageData: ImageData }
type WorkerOutput = { detected: boolean; pxPerMm: number | null }

// js-aruco2 è CJS — require necessario nel contesto worker/Vite
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ARLib = require('js-aruco2') as Record<string, Record<string, new () => {
  detect(imageData: ImageData): Array<{ id: number; corners: Array<{ x: number; y: number }> }>
}>>

const DetectorClass =
  ARLib.AR?.Detector ??
  ARLib.AR?.AR_Detector ??
  (ARLib as Record<string, new () => { detect(d: ImageData): unknown[] }>).Detector ??
  (ARLib as Record<string, new () => { detect(d: ImageData): unknown[] }>).AR_Detector

const detector = new DetectorClass()

self.onmessage = (event: MessageEvent<WorkerInput>) => {
  try {
    const markers = detector.detect(event.data.imageData)
    const marker42 = markers.find(m => m.id === 42)

    if (!marker42 || marker42.corners.length !== 4) {
      self.postMessage({ detected: false, pxPerMm: null } satisfies WorkerOutput)
      return
    }

    const pxPerMm = computePxPerMm(marker42.corners)
    self.postMessage({ detected: true, pxPerMm } satisfies WorkerOutput)
  } catch {
    self.postMessage({ detected: false, pxPerMm: null } satisfies WorkerOutput)
  }
}
```

- [ ] **Step 7: Crea useArucoDetector.ts**

Crea `archibald-web-app/frontend/src/hooks/useArucoDetector.ts`:

```typescript
import { useCallback } from 'react'

type ArucoResult = { detected: boolean; pxPerMm: number | null }

export function useArucoDetector(): (imageBase64: string) => Promise<ArucoResult> {
  return useCallback(async (imageBase64: string): Promise<ArucoResult> => {
    return new Promise((resolve) => {
      let worker: Worker | null = null
      try {
        worker = new Worker(
          new URL('../workers/aruco-detector.worker.ts', import.meta.url),
          { type: 'module' },
        )
      } catch {
        resolve({ detected: false, pxPerMm: null })
        return
      }

      const cleanup = () => { try { worker?.terminate() } catch { /* no-op */ } }

      worker.onerror = () => { cleanup(); resolve({ detected: false, pxPerMm: null }) }

      worker.onmessage = (e: MessageEvent<ArucoResult>) => {
        cleanup()
        resolve(e.data)
      }

      const img = new Image()
      img.onload = () => {
        try {
          const maxDim  = 1280
          const scale   = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1))
          const canvas  = document.createElement('canvas')
          canvas.width  = Math.round(img.width * scale)
          canvas.height = Math.round(img.height * scale)
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) { cleanup(); resolve({ detected: false, pxPerMm: null }); return }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          worker!.postMessage({ imageData }, [imageData.data.buffer])
        } catch {
          cleanup()
          resolve({ detected: false, pxPerMm: null })
        }
      }
      img.onerror = () => { cleanup(); resolve({ detected: false, pxPerMm: null }) }
      img.src = `data:image/jpeg;base64,${imageBase64}`
    })
  }, [])
}
```

- [ ] **Step 8: Verifica type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep -v "ToolRecognitionPage" | head -20
```

Atteso: nessun errore nei file aruco (errori residui su ToolRecognitionPage saranno fixati nel Task 5).

- [ ] **Step 9: Esegui tutti i test**

```bash
npm test --prefix archibald-web-app/frontend -- aruco-compute.spec
```

Atteso: 3 test passano.

- [ ] **Step 10: Commit**

```bash
git add \
  archibald-web-app/frontend/src/utils/aruco-compute.ts \
  archibald-web-app/frontend/src/utils/aruco-compute.spec.ts \
  archibald-web-app/frontend/src/workers/aruco-detector.worker.ts \
  archibald-web-app/frontend/src/hooks/useArucoDetector.ts \
  archibald-web-app/frontend/package.json \
  archibald-web-app/frontend/package-lock.json
git commit -m "feat(recognition): js-aruco2 Web Worker + computePxPerMm + useArucoDetector hook"
```

---

## Task 5: Blocco A1+A3+A4 — Refactor ToolRecognitionPage

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/ToolRecognitionPage.tsx`
- Modify: `archibald-web-app/frontend/src/pages/ToolRecognitionPage.spec.tsx`

Questo task fa tutte le modifiche core alla pagina: rimozione di `photo2_request`, aggiornamento di `match` e `shortlist_visual` ai nuovi tipi, aggiunta di `aruco_absent` (schermata interstitial quando il marker non è rilevato) e `not_found`. Il flusso ARUco visivo (banner + toast) è nel Task 6.

- [ ] **Step 1: Riscrivi ToolRecognitionPage.spec.tsx**

Sostituisci integralmente `archibald-web-app/frontend/src/pages/ToolRecognitionPage.spec.tsx` con:

```typescript
// archibald-web-app/frontend/src/pages/ToolRecognitionPage.spec.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ToolRecognitionPage } from './ToolRecognitionPage'
import * as recognitionApi from '../api/recognition'
import type { IdentifyResponse } from '../api/recognition'

let arucoResult: { detected: boolean; pxPerMm: number | null } = { detected: true, pxPerMm: 5.0 }

vi.mock('../hooks/useArucoDetector', () => ({
  useArucoDetector: () => vi.fn().mockImplementation(() => Promise.resolve(arucoResult)),
}))

function mockGetUserMedia(impl: () => Promise<MediaStream | never>) {
  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockImplementation(impl) },
    writable: true,
    configurable: true,
  })
}

function mockStream() {
  const track = {
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack
  return {
    getVideoTracks: () => [track],
    getTracks:      () => [track],
  } as unknown as MediaStream
}

function mockCapture() {
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth',  { get: () => 1, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 1, configurable: true })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,FAKEFRAME')
}

async function captureAndIdentify() {
  await waitFor(() => screen.getByRole('button', { name: /SCATTA FOTO 1/i }))
  await userEvent.click(screen.getByRole('button', { name: /SCATTA FOTO 1/i }))
  await waitFor(() => screen.getByRole('button', { name: /Procedi con 1 foto/i }))
  await userEvent.click(screen.getByRole('button', { name: /Procedi con 1 foto/i }))
  await waitFor(() => screen.getByRole('button', { name: /Identifica/i }))
  await userEvent.click(screen.getByRole('button', { name: /Identifica/i }))
}

const TOKEN = 'test-jwt'

beforeEach(() => {
  localStorage.setItem('archibald_jwt', TOKEN)
  vi.spyOn(recognitionApi, 'getRecognitionBudget').mockResolvedValue({
    usedToday: 10, dailyLimit: 500, throttleLevel: 'normal',
  })
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('ToolRecognitionPage — Stato 0 (permission denied)', () => {
  it('mostra schermata di accesso negato quando getUserMedia lancia NotAllowedError', async () => {
    const err = new Error('Permission denied')
    err.name = 'NotAllowedError'
    mockGetUserMedia(() => Promise.reject(err))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() =>
      expect(screen.getByText(/Fotocamera non autorizzata/i)).toBeInTheDocument()
    )
    expect(screen.getByRole('link', { name: /Cerca manualmente/i })).toHaveAttribute('href', '/products')
  })

  it('mostra schermata di accesso negato anche per NotFoundError', async () => {
    const err = new Error('No camera')
    err.name = 'NotFoundError'
    mockGetUserMedia(() => Promise.reject(err))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() =>
      expect(screen.getByText(/Fotocamera non autorizzata/i)).toBeInTheDocument()
    )
  })
})

describe('ToolRecognitionPage — Stato 1 (idle viewfinder)', () => {
  it('mostra pulsante di scatto quando camera è disponibile', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /SCATTA FOTO 1/i })).toBeInTheDocument()
    )
  })

  it('mostra step indicator "STEP 1 DI 2" nello stato idle_photo1', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() =>
      expect(screen.getByText(/STEP 1 DI 2/i)).toBeInTheDocument()
    )
  })

  it('mostra banner warning quando throttle_level è warning', async () => {
    vi.spyOn(recognitionApi, 'getRecognitionBudget').mockResolvedValue({
      usedToday: 420, dailyLimit: 500, throttleLevel: 'warning',
    })
    mockGetUserMedia(() => Promise.resolve(mockStream()))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() =>
      expect(screen.getByText(/Budget quasi esaurito/i)).toBeInTheDocument()
    )
  })
})

describe('ToolRecognitionPage — Stato 2 (analyzing)', () => {
  it('mostra spinner di analisi dopo lo scatto', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockImplementation(
      () => new Promise(() => {})
    )

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Analisi con AI/i)).toBeInTheDocument()
    )
  })

  it('mostra schermata budget esaurito quando result.type è budget_exhausted', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue({
      result: { type: 'budget_exhausted' },
      budgetState: { usedToday: 500, dailyLimit: 500, throttleLevel: 'limited' },
      processingMs: 50,
      imageHash: 'xyz',
    })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Budget giornaliero esaurito/i)).toBeInTheDocument()
    )
  })
})

const MATCH_RESPONSE: IdentifyResponse = {
  result: {
    type: 'match',
    data: {
      familyCode:        'H1',
      productName:       'TC Round FG Ø1.6',
      shankType:         'fg',
      headDiameterMm:    1.6,
      headLengthMm:      null,
      shapeClass:        'sfera',
      confidence:        0.95,
      thumbnailUrl:      null,
      discontinued:      false,
      measurementSource: 'shank_iso',
    },
  },
  budgetState: { usedToday: 11, dailyLimit: 500, throttleLevel: 'normal' },
  processingMs: 800,
  imageHash: 'abc123',
}

describe('ToolRecognitionPage — Stato 3A (match)', () => {
  it('mostra card match con pulsante "Apri scheda prodotto"', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue(MATCH_RESPONSE)
    vi.spyOn(recognitionApi, 'submitRecognitionFeedback').mockResolvedValue({ queued: true })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Apri scheda prodotto/i })).toBeInTheDocument()
    )
    expect(screen.getByText('TC Round FG Ø1.6')).toBeInTheDocument()
    expect(screen.getByText('H1')).toBeInTheDocument()
  })

  it('chiama submitRecognitionFeedback con familyCode prima di navigare', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue(MATCH_RESPONSE)
    const feedbackSpy = vi.spyOn(recognitionApi, 'submitRecognitionFeedback').mockResolvedValue({ queued: true })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Apri scheda prodotto/i })).toBeInTheDocument()
    )
    await userEvent.click(screen.getByRole('button', { name: /Apri scheda prodotto/i }))

    if (MATCH_RESPONSE.result.type !== 'match') throw new Error('Test setup error')
    expect(feedbackSpy).toHaveBeenCalledWith(TOKEN, {
      imageHash:       MATCH_RESPONSE.imageHash,
      productId:       MATCH_RESPONSE.result.data.familyCode,
      confirmedByUser: true,
    })
  })
})

describe('ToolRecognitionPage — Stato 3B (shortlist)', () => {
  it('mostra lista candidati', async () => {
    const shortlistResponse: IdentifyResponse = {
      result: {
        type: 'shortlist_visual',
        data: {
          candidates: [
            { familyCode: 'H1',     thumbnailUrl: null, referenceImages: [] },
            { familyCode: 'H79NEX', thumbnailUrl: null, referenceImages: [] },
          ],
        },
      },
      budgetState: { usedToday: 11, dailyLimit: 500, throttleLevel: 'normal' },
      processingMs: 900,
      imageHash: 'def456',
    }

    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue(shortlistResponse)

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/2 candidati trovati/i)).toBeInTheDocument()
    )
    expect(screen.getByText('H1')).toBeInTheDocument()
    expect(screen.getByText('H79NEX')).toBeInTheDocument()
  })
})

describe('ToolRecognitionPage — Stato 3C (not_found)', () => {
  it('mostra schermata not_found con misure quando disponibili', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue({
      result: {
        type: 'not_found',
        data: {
          measurements: {
            shankGroup: 'CA_HP', headDiameterMm: 2.3,
            shapeClass: 'cono_tondo', measurementSource: 'shank_iso',
          },
        },
      },
      budgetState: { usedToday: 5, dailyLimit: 500, throttleLevel: 'normal' },
      processingMs: 1200,
      imageHash: 'nf001',
    })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Strumento non trovato in catalogo/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/2\.3 mm/i)).toBeInTheDocument()
    expect(screen.getByText(/cono_tondo/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Riprova/i })).toBeInTheDocument()
  })

  it('mostra schermata not_found anche senza misure', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue({
      result: {
        type: 'not_found',
        data: {
          measurements: {
            shankGroup: null, headDiameterMm: null, shapeClass: null, measurementSource: 'none',
          },
        },
      },
      budgetState: { usedToday: 5, dailyLimit: 500, throttleLevel: 'normal' },
      processingMs: 800,
      imageHash: 'nf002',
    })

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Strumento non trovato in catalogo/i)).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: /Riprova/i })).toBeInTheDocument()
  })
})

describe('ToolRecognitionPage — aruco_absent screen', () => {
  beforeEach(() => { arucoResult = { detected: false, pxPerMm: null } })
  afterEach(() => { arucoResult = { detected: true, pxPerMm: 5.0 } })

  it('mostra schermata aruco_absent con le due opzioni quando marker non rilevato', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Carta ARUco non rilevata nella foto/i)).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: /Riprova con la carta/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Procedi senza carta/i })).toBeInTheDocument()
  })

  it('torna a idle_photo1 quando si clicca Riprova con la carta', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Carta ARUco non rilevata nella foto/i)).toBeInTheDocument()
    )
    await userEvent.click(screen.getByRole('button', { name: /Riprova con la carta/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /SCATTA FOTO 1/i })).toBeInTheDocument()
    )
  })

  it('chiama identifyInstrument senza arucoPxPerMm quando si clicca Procedi senza carta', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))
    mockCapture()
    vi.spyOn(recognitionApi, 'identifyInstrument').mockResolvedValue(MATCH_RESPONSE)

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)
    await captureAndIdentify()

    await waitFor(() =>
      expect(screen.getByText(/Carta ARUco non rilevata nella foto/i)).toBeInTheDocument()
    )
    await userEvent.click(screen.getByRole('button', { name: /Procedi senza carta/i }))

    await waitFor(() =>
      expect(recognitionApi.identifyInstrument).toHaveBeenCalledWith(
        TOKEN,
        expect.any(Array),
        undefined,
      )
    )
  })
})
```

- [ ] **Step 2: Esegui i test — atteso FAIL**

```bash
npm test --prefix archibald-web-app/frontend -- ToolRecognitionPage.spec
```

Atteso: FAIL — `useArucoDetector` non trovato, `result.state` non esiste, `aruco_absent` e `not_found` screen mancanti.

- [ ] **Step 3: Aggiorna ToolRecognitionPage.tsx — import + PageState**

Aggiungi l'import del hook dopo gli altri import in testa al file:

```typescript
import { useArucoDetector } from '../hooks/useArucoDetector'
```

Sostituisci la definizione di `PageState` (righe 14–25):

```typescript
type PageState =
  | 'loading'
  | 'permission_denied'
  | 'idle_photo1'
  | 'idle_photo2'
  | 'preview'
  | 'analyzing'
  | 'analyzing2'
  | 'aruco_absent'
  | 'match'
  | 'shortlist_visual'
  | 'not_found'
  | 'budget_exhausted'
```

- [ ] **Step 4: Aggiungi stato ARUco, hook e ref nel corpo del componente**

Nel corpo del componente, subito dopo gli altri `useState`, aggiungi:

```typescript
const [arucoCalibrationPxPerMm, setArucoCalibrationPxPerMm] = useState<number | null>(null)
const detectAruco = useArucoDetector()
const pendingImagesRef = useRef<string[]>([])
```

Assicurati che `useRef` sia importato da React (`import { useRef, ... } from 'react'`).

- [ ] **Step 5: Aggiungi callIdentifyApi, riscrivi runIdentification, aggiungi handleProceedWithoutAruco**

`callIdentifyApi` è estratto perché è riutilizzato da sia `runIdentification` che `handleProceedWithoutAruco` — giustificato da C-9.

Sostituisci l'intero callback `runIdentification` (righe 224–263) con i tre callback seguenti:

```typescript
const callIdentifyApi = useCallback(async (images: string[], arucoPxPerMm?: number) => {
  const token = localStorage.getItem('archibald_jwt')
  if (!token) return
  try {
    setAnalyzeStep(1)
    const response = await identifyInstrument(token, images, arucoPxPerMm)
    setAnalyzeStep(2)
    setIdentifyResult(response)
    const { type } = response.result
    if (type === 'budget_exhausted') {
      setPageState('budget_exhausted')
    } else if (type === 'match') {
      setAnalyzeStep(3)
      vibrate([200, 50, 100])
      playSuccessBeep()
      setPageState('match')
    } else if (type === 'shortlist_visual') {
      vibrate([80, 30, 80])
      setPageState('shortlist_visual')
    } else if (type === 'not_found') {
      setPageState('not_found')
    } else {
      setPageState('idle_photo1')
      setErrorMessage('Errore di analisi. Riprova.')
    }
  } catch {
    setPageState('idle_photo1')
    setErrorMessage('Errore di connessione. Riprova.')
  }
}, [vibrate, playSuccessBeep])

const runIdentification = useCallback(async (images: string[]) => {
  const token = localStorage.getItem('archibald_jwt')
  if (!token) return
  setPageState(images.length === 2 ? 'analyzing2' : 'analyzing')
  setAnalyzeStep(0)
  setUsedPhotoCount(images.length)
  setArucoCalibrationPxPerMm(null)
  pendingImagesRef.current = images

  if (images[0]) {
    const detection = await detectAruco(images[0])
    if (!detection.detected) {
      setPageState('aruco_absent')
      return
    }
    if (detection.pxPerMm != null) {
      setArucoCalibrationPxPerMm(detection.pxPerMm)
      await callIdentifyApi(images, detection.pxPerMm)
      return
    }
  }
  await callIdentifyApi(images)
}, [detectAruco, callIdentifyApi])

const handleProceedWithoutAruco = useCallback(() => {
  const images = pendingImagesRef.current
  setPageState(images.length === 2 ? 'analyzing2' : 'analyzing')
  setAnalyzeStep(0)
  void callIdentifyApi(images)
}, [callIdentifyApi])
```

- [ ] **Step 6: Rimuovi handlePhoto2Shutter**

Rimuovi l'intero callback `handlePhoto2Shutter` (righe 287–295) — non più usato.

- [ ] **Step 7: Aggiorna il render block match**

Riga ~405: sostituisci l'apertura del blocco:
```typescript
// DA:
if (pageState === 'match' && identifyResult?.result.state === 'match') {
  const { product, confidence } = identifyResult.result
// A:
if (pageState === 'match' && identifyResult?.result.type === 'match') {
  const { data: product } = identifyResult.result
  const confidence = product.confidence
```

Aggiorna `handleOpenProduct` (righe ~410–418):
```typescript
const handleOpenProduct = async () => {
  if (isDiscontinued) return
  const token = localStorage.getItem('archibald_jwt')
  if (!token) return
  try {
    await submitRecognitionFeedback(token, { imageHash, productId: product.familyCode, confirmedByUser: true })
  } catch {
  }
  try {
    const variantsData = await getProductVariants(token, product.familyCode)
    const firstVariantId = variantsData.data?.variants?.[0]?.productId
    if (firstVariantId) {
      navigate(`/products/${encodeURIComponent(firstVariantId)}`, { state: { fromScanner: true } })
      return
    }
  } catch {
  }
  navigate(`/products/${encodeURIComponent(product.familyCode)}`, { state: { fromScanner: true } })
}
```

Riga ~486: aggiorna la riga che mostra `familyCode` e `shankType` (invariata — già usa `product.familyCode`).

Riga ~502: sostituisci l'occorrenza di `product.productId` in display monospace con `product.familyCode`.

Riga ~515: sostituisci il check `product.headSizeMm`:
```typescript
// DA:
{product.headSizeMm > 0 && (
  ...Ø {product.headSizeMm} mm...
// A:
{product.headDiameterMm != null && product.headDiameterMm > 0 && (
  ...Ø {product.headDiameterMm} mm...
```

- [ ] **Step 8: Aggiorna il render block shortlist_visual**

Riga ~581: sostituisci l'apertura del blocco:
```typescript
// DA:
if (pageState === 'shortlist_visual' && identifyResult?.result.state === 'shortlist_visual') {
  const { candidates } = identifyResult.result
// A:
if (pageState === 'shortlist_visual' && identifyResult?.result.type === 'shortlist_visual') {
  const { candidates } = identifyResult.result.data
```

- [ ] **Step 9: Rimuovi il render block photo2_request**

Elimina l'intero blocco `if (pageState === 'photo2_request')` (righe ~715–757) compreso il return interno.

- [ ] **Step 10: Aggiungi i render block aruco_absent e not_found**

Inserisci ENTRAMBI i blocchi DOPO il blocco `shortlist_visual` (dopo la `}` di chiusura) e PRIMA del blocco `if (pageState === 'preview')`.

**Prima: aruco_absent**

```typescript
if (pageState === 'aruco_absent') {
  const storedImages = pendingImagesRef.current
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, background: '#0f0f0f',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32,
    }}>
      <div style={{ fontSize: 56 }}>📋</div>
      <h2 style={{ color: '#fff', textAlign: 'center', margin: 0, fontSize: 20 }}>
        Carta ARUco non rilevata nella foto
      </h2>
      <p style={{ color: '#9ca3af', textAlign: 'center', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
        Il marker di calibrazione non è stato trovato.<br/>
        Scegli come procedere:
      </p>
      <button
        onClick={() => setPageState(storedImages.length === 2 ? 'idle_photo2' : 'idle_photo1')}
        style={{
          background: 'transparent', color: '#93c5fd',
          border: '1px solid #1e40af', borderRadius: 8, padding: '12px 24px',
          fontSize: 16, cursor: 'pointer', width: '100%', maxWidth: 280,
        }}
      >
        ← Riprova con la carta
      </button>
      <button
        onClick={handleProceedWithoutAruco}
        style={{
          background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: 8, padding: '12px 24px',
          fontSize: 16, cursor: 'pointer', width: '100%', maxWidth: 280,
        }}
      >
        Procedi senza carta →
      </button>
    </div>
  )
}
```

**Poi: not_found**

```typescript
if (pageState === 'not_found' && identifyResult?.result.type === 'not_found') {
  const { measurements } = identifyResult.result.data
  const sourceLabel =
    measurements.measurementSource === 'aruco'    ? 'carta ARUco' :
    measurements.measurementSource === 'shank_iso' ? 'gambo ISO'   : 'stima'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, background: '#0f0f0f',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32,
    }}>
      <div style={{ fontSize: 56 }}>🔍</div>
      <h2 style={{ color: '#fff', textAlign: 'center', margin: 0, fontSize: 20 }}>
        Strumento non trovato in catalogo
      </h2>

      {(measurements.headDiameterMm != null || measurements.shapeClass || measurements.shankGroup) && (
        <div style={{
          background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12,
          padding: '16px 20px', width: '100%', maxWidth: 340,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {measurements.headDiameterMm != null && (
            <div style={{ color: '#9ca3af', fontSize: 14 }}>
              <span style={{ color: '#6b7280' }}>Ø testa: </span>
              <span style={{ color: '#e5e7eb', fontWeight: 600 }}>
                {measurements.headDiameterMm.toFixed(1)} mm
              </span>
            </div>
          )}
          {measurements.shapeClass && (
            <div style={{ color: '#9ca3af', fontSize: 14 }}>
              <span style={{ color: '#6b7280' }}>Forma: </span>
              <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{measurements.shapeClass}</span>
            </div>
          )}
          {measurements.shankGroup && (
            <div style={{ color: '#9ca3af', fontSize: 14 }}>
              <span style={{ color: '#6b7280' }}>Gambo: </span>
              <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{measurements.shankGroup}</span>
            </div>
          )}
          <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
            Misurazione via: {sourceLabel}
          </div>
        </div>
      )}

      <button
        onClick={() => { setCapturedImages([]); setPageState('idle_photo1') }}
        style={{
          marginTop: 8, background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: 8, padding: '12px 24px',
          fontSize: 16, cursor: 'pointer',
        }}
      >
        Riprova
      </button>
    </div>
  )
}
```

- [ ] **Step 11: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- ToolRecognitionPage.spec
```

Atteso: tutti i test passano. Se ci sono errori TypeScript su `product.productId` o `product.headSizeMm`, cerca le occorrenze rimanenti con `grep -n "productId\|headSizeMm" archibald-web-app/frontend/src/pages/ToolRecognitionPage.tsx` e aggiornale.

- [ ] **Step 12: Esegui tutti i test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

Atteso: tutti i test passano.

- [ ] **Step 13: Commit**

```bash
git add \
  archibald-web-app/frontend/src/pages/ToolRecognitionPage.tsx \
  archibald-web-app/frontend/src/pages/ToolRecognitionPage.spec.tsx
git commit -m "feat(recognition): rimuovi photo2_request, aggiungi aruco_absent+not_found+MeasurementSummary, aggiorna match/shortlist"
```

---

## Task 6: Blocco A2 — Banner ARUco nel viewfinder + toast calibrazione

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/ToolRecognitionPage.tsx`
- Modify: `archibald-web-app/frontend/src/pages/ToolRecognitionPage.spec.tsx`

Il Task 5 ha già integrato `detectAruco` e `arucoCalibrationPxPerMm` nel flusso. Questo task aggiunge solo i due elementi visivi.

- [ ] **Step 1: Scrivi il test per il banner**

Aggiungi questo `describe` in fondo a `ToolRecognitionPage.spec.tsx`:

```typescript
describe('ToolRecognitionPage — Banner ARUco in idle_photo1', () => {
  it('mostra suggerimento carta ARUco nello stato idle_photo1', async () => {
    mockGetUserMedia(() => Promise.resolve(mockStream()))

    render(<MemoryRouter><ToolRecognitionPage /></MemoryRouter>)

    await waitFor(() =>
      expect(screen.getByText(/carta ARUco/i)).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 2: Esegui il test — atteso FAIL**

```bash
npm test --prefix archibald-web-app/frontend -- ToolRecognitionPage.spec
```

Atteso: FAIL "Unable to find an element with text: /carta ARUco/i".

- [ ] **Step 3: Aggiungi il banner ARUco nell'idle viewfinder**

In `ToolRecognitionPage.tsx`, nel render block `idle_photo1 / idle_photo2` (righe ~942–958), DOPO il blocco `{!isPhoto2 && (...)}` che contiene il tip card "💡 CONSIGLIO", aggiungi:

```typescript
{!isPhoto2 && (
  <div style={{ padding: '8px 20px 0' }}>
    <div style={{
      background: 'rgba(10,61,143,0.12)',
      border: '1px solid rgba(10,61,143,0.25)',
      borderRadius: 10,
      padding: '10px 14px',
      display: 'flex', gap: 8, alignItems: 'center',
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>📐</span>
      <div style={{ color: '#93c5fd', fontSize: 12, lineHeight: 1.4 }}>
        Per maggiore precisione, posiziona lo strumento accanto alla{' '}
        <strong style={{ fontWeight: 600 }}>carta ARUco</strong>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Aggiungi il toast calibrazione nell'analyzing screen**

Nel render block `analyzing` (righe ~354–374), DOPO il `</div>` di chiusura del flex colonna degli STEP_LABELS, aggiungi:

```typescript
{arucoCalibrationPxPerMm != null && (
  <div style={{
    marginTop: 8, color: '#22c55e', fontSize: 13, fontWeight: 600,
    display: 'flex', alignItems: 'center', gap: 6,
  }}>
    <span>✓</span>
    <span>ARUco {arucoCalibrationPxPerMm.toFixed(1)} px/mm</span>
  </div>
)}
```

- [ ] **Step 5: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- ToolRecognitionPage.spec
```

Atteso: tutti i test passano incluso il nuovo test banner.

- [ ] **Step 6: Type-check e test completi**

```bash
npm run type-check --prefix archibald-web-app/frontend && \
npm test --prefix archibald-web-app/frontend
```

Atteso: 0 errori TypeScript, tutti i test passano.

- [ ] **Step 7: Commit**

```bash
git add \
  archibald-web-app/frontend/src/pages/ToolRecognitionPage.tsx \
  archibald-web-app/frontend/src/pages/ToolRecognitionPage.spec.tsx
git commit -m "feat(recognition): banner ARUco nel viewfinder, toast calibrazione nell'analyzing screen"
```

---

## Task 7: Migration 064+065 in produzione + merge + deploy

**Prerequisiti:** tutti i test frontend e backend passano.

- [ ] **Step 1: Esegui tutti i test backend e frontend**

```bash
npm test --prefix archibald-web-app/backend && \
npm test --prefix archibald-web-app/frontend
```

Atteso: tutti i test passano in entrambi i progetti.

- [ ] **Step 2: Leggi le credenziali VPS e salva la chiave**

Leggi `/Users/hatholdir/Downloads/Archibald/VPS-ACCESS-CREDENTIALS.md`, estrai la chiave SSH e salvala:

```bash
# Salva la chiave (ricavata dal file credenziali) in /tmp/archibald_vps
chmod 600 /tmp/archibald_vps
```

- [ ] **Step 3: Verifica stato migration 064**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT column_name FROM information_schema.columns \
     WHERE table_schema='shared' AND table_name='catalog_entries' \
     AND column_name='shape_class';\""
```

Se la colonna non esiste (0 righe), procedi con Step 4. Se esiste già, salta al Step 5.

- [ ] **Step 4: Applica migration 064**

```bash
cat archibald-web-app/backend/src/db/migrations/064-recognition-shape-class.sql | \
  ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald"
```

Verifica il risultato:
```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT COUNT(*) as mapped FROM shared.catalog_entries WHERE shape_class IS NOT NULL;\""
```

Atteso: un numero > 0 (le entry con shape_description mappabile).

- [ ] **Step 5: Verifica stato migration 065**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT column_name FROM information_schema.columns \
     WHERE table_schema='shared' AND table_name='catalog_family_images' \
     AND column_name='visual_embedding';\""
```

Se la colonna esiste ancora, procedi con Step 6. Se è già stata rimossa, salta al Step 7.

- [ ] **Step 6: Applica migration 065**

```bash
cat archibald-web-app/backend/src/db/migrations/065-drop-visual-embedding.sql | \
  ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald"
```

Verifica che la colonna sia rimossa (atteso: 0 righe):
```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT column_name FROM information_schema.columns \
     WHERE table_schema='shared' AND table_name='catalog_family_images' \
     AND column_name='visual_embedding';\""
```

- [ ] **Step 7: Merge branch → master**

```bash
git checkout master
git merge feature/recognition-redesign --no-ff \
  -m "feat(recognition): redesign pipeline misure-first — ARUco+Haiku+SQL+Opus, drop Jina ANN"
```

- [ ] **Step 8: Push → trigger CI/CD**

```bash
git push origin master
```

Il push triggera GitHub Actions: build immagini Docker → push su GHCR → deploy VPS via SSH.

- [ ] **Step 9: Verifica deploy**

Attendi ~3 minuti, poi controlla i log backend:

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   logs --tail 40 backend"
```

Atteso: backend avviato senza errori. Cerca `recognition` nei log per confermare che il nuovo engine sia registrato. Nessun riferimento a `jinaApiKey` o `visual_embedding`.

---

## Task 8: Blocco D — Migration 066 (ring_color, working_length_mm, iso_shape_code)

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/066-catalog-enriched-fields.sql`

- [ ] **Step 1: Crea il file SQL**

Crea `archibald-web-app/backend/src/db/migrations/066-catalog-enriched-fields.sql`:

```sql
ALTER TABLE shared.catalog_entries
  ADD COLUMN IF NOT EXISTS ring_color        TEXT,
  ADD COLUMN IF NOT EXISTS working_length_mm FLOAT,
  ADD COLUMN IF NOT EXISTS iso_shape_code    TEXT;

CREATE INDEX IF NOT EXISTS idx_catalog_entries_ring_color
  ON shared.catalog_entries (ring_color)
  WHERE ring_color IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_entries_iso_shape_code
  ON shared.catalog_entries (iso_shape_code)
  WHERE iso_shape_code IS NOT NULL;
```

- [ ] **Step 2: Applica in produzione**

```bash
cat archibald-web-app/backend/src/db/migrations/066-catalog-enriched-fields.sql | \
  ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald"
```

Verifica (atteso: 3 righe):

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT column_name FROM information_schema.columns \
     WHERE table_schema='shared' AND table_name='catalog_entries' \
     AND column_name IN ('ring_color','working_length_mm','iso_shape_code') \
     ORDER BY column_name;\""
```

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/066-catalog-enriched-fields.sql
git commit -m "feat(catalog): migration 066 — aggiunge ring_color, working_length_mm, iso_shape_code"
```

---

## Task 9: Blocco D — Scraper komet-dental.com

**Files:**
- Create: `archibald-web-app/backend/scripts/enrich-catalog-komet.mjs`

Scarica dati strutturati da komet-dental.com per ogni `family_code` in `catalog_entries`.
Output: `docs/diagnostics/komet-enrichment-data.json` (usato da Task 11).

- [ ] **Step 1: Verifica pattern URL komet-dental.com**

```bash
curl -s -o /dev/null -w "%{http_code}" "https://www.komet-dental.com/en/products/H1.314.016/" && echo " → URL /en/products/{code}/ OK" || \
curl -s -o /dev/null -w "%{http_code}" "https://www.komet-dental.com/en/product/H1.314.016/"  && echo " → URL /en/product/{code}/ OK"
```

Prendi nota del pattern che risponde 200. Se nessuno dei due funziona, usa la ricerca:
```bash
curl -s "https://www.komet-dental.com/en/search/?q=H1.314.016" | grep -o '"url":"[^"]*"' | head -5
```

Aggiorna la funzione `buildProductUrl` nello script al Step 2 in base a quanto trovato.

- [ ] **Step 2: Crea lo scraper**

Crea `archibald-web-app/backend/scripts/enrich-catalog-komet.mjs`:

```javascript
#!/usr/bin/env node
import pg from 'pg'
import { writeFileSync } from 'fs'
import { setTimeout as sleep } from 'timers/promises'

const { Pool } = pg
const pool = new Pool({
  host:     process.env.PG_HOST     || 'localhost',
  port:     Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'archibald',
  user:     process.env.PG_USER     || 'archibald',
  password: process.env.PG_PASSWORD || '',
})

function buildProductUrl(familyCode) {
  // Adatta in base al risultato del Step 1
  return `https://www.komet-dental.com/en/products/${encodeURIComponent(familyCode)}/`
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; catalog-enricher/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok ? res.text() : null
  } catch {
    return null
  }
}

function extractField(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return m[1]
  }
  return null
}

function parseProductData(html) {
  const ringColor = extractField(html, [
    /ring[- ]?color[^:]*:\s*([a-zA-Z]+)/i,
    /Ringfarbe[^:]*:\s*([a-zA-Z]+)/i,
    /data-ring-color="([^"]+)"/i,
  ])
  const workingLengthStr = extractField(html, [
    /working[- ]?length[^:]*:\s*([\d.]+)\s*mm/i,
    /Arbeitsl[aä]nge[^:]*:\s*([\d.]+)\s*mm/i,
    /data-working-length="([\d.]+)"/i,
  ])
  const isoCode = extractField(html, [
    /ISO[^:]*:\s*(\d{6})\b/i,
    /data-iso-code="(\d{6})"/i,
    /\bshape[^:]*:\s*(\d{6})\b/i,
  ])
  return {
    ring_color:        ringColor ? ringColor.toLowerCase().trim() : null,
    working_length_mm: workingLengthStr ? parseFloat(workingLengthStr) : null,
    iso_shape_code:    isoCode ?? null,
  }
}

async function main() {
  const { rows } = await pool.query(
    `SELECT DISTINCT family_code FROM shared.catalog_entries
     WHERE family_code IS NOT NULL ORDER BY family_code`
  )
  console.log(`${rows.length} family_codes da processare`)

  const results = {}
  let found = 0

  for (let i = 0; i < rows.length; i++) {
    const { family_code } = rows[i]
    const html = await fetchHtml(buildProductUrl(family_code))
    if (html) {
      const data = parseProductData(html)
      if (data.ring_color || data.working_length_mm || data.iso_shape_code) {
        results[family_code] = data
        found++
        console.log(`[${i + 1}/${rows.length}] ${family_code}:`, JSON.stringify(data))
      }
    }
    if ((i + 1) % 50 === 0) console.log(`Progresso: ${i + 1}/${rows.length}, trovati: ${found}`)
    await sleep(300)
  }

  writeFileSync('docs/diagnostics/komet-enrichment-data.json', JSON.stringify(results, null, 2))
  console.log(`\nCompletato: ${found}/${rows.length} con dati → docs/diagnostics/komet-enrichment-data.json`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Esegui lo scraper**

```bash
PG_HOST=localhost PG_DATABASE=archibald PG_USER=archibald \
  node archibald-web-app/backend/scripts/enrich-catalog-komet.mjs 2>&1 | tail -20
```

Se il DB locale non è disponibile, apri prima un tunnel SSH:
```bash
ssh -i /tmp/archibald_vps -L 5433:localhost:5432 -N deploy@91.98.136.198 &
PG_HOST=localhost PG_PORT=5433 PG_DATABASE=archibald PG_USER=archibald PG_PASSWORD=<pwd> \
  node archibald-web-app/backend/scripts/enrich-catalog-komet.mjs
```

Atteso: `docs/diagnostics/komet-enrichment-data.json` non vuoto. Se ring_color=0 per tutti, riesaminare il pattern HTML in Step 1.

- [ ] **Step 4: Commit**

```bash
git add \
  archibald-web-app/backend/scripts/enrich-catalog-komet.mjs \
  docs/diagnostics/komet-enrichment-data.json
git commit -m "feat(catalog): scraper komet-dental.com per dati strutturati mancanti"
```

---

## Task 10: Blocco D — PDF Parser catalogo 782 pagine

**Files:**
- Create: `archibald-web-app/backend/scripts/parse-catalog-pdf.mjs`

Input: `/Users/hatholdir/Downloads/Catalogo_interattivo_2025 (1).pdf`
Output: `docs/diagnostics/catalog-pdf-extract.json`

- [ ] **Step 1: Installa pdf-parse e analizza la struttura**

```bash
node -e "require('pdf-parse')" 2>/dev/null && echo "OK" || npm install pdf-parse --save-dev --prefix archibald-web-app/backend
```

Poi campiona le prime 3 pagine per capire il formato:

```bash
node -e "
const parse = require('archibald-web-app/backend/node_modules/pdf-parse')
const fs    = require('fs')
parse(fs.readFileSync('/Users/hatholdir/Downloads/Catalogo_interattivo_2025 (1).pdf'), { max: 3 })
  .then(d => { console.log('pagine:', d.numpages); console.log(d.text.substring(0, 3000)) })
" 2>&1
```

Identifica:
- Formato del family_code (es. `H1.314.016` o `H1 314 016`)
- Formato ISO code (es. `ISO 021220` o codice 6 cifre standalone)
- Formato lunghezza di lavoro (es. `WL: 19 mm` o `19 mm`)

Aggiorna i regex in Step 2 se necessario.

- [ ] **Step 2: Crea il parser**

Crea `archibald-web-app/backend/scripts/parse-catalog-pdf.mjs`:

```javascript
#!/usr/bin/env node
import { createRequire } from 'module'
import { readFileSync, writeFileSync } from 'fs'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const PDF_PATH = '/Users/hatholdir/Downloads/Catalogo_interattivo_2025 (1).pdf'

// Adatta questi regex in base all'output di Step 1
const FAMILY_CODE_RE  = /\b([A-Z]\d[\w.]{3,12})\b/g
const ISO_CODE_RE     = /\bISO[.\s]*(\d{6})\b/i
const WORKING_LEN_RE  = /(?:WL|working length|lunghezza di lavoro)[^:\d]*:?\s*([\d.]+)\s*mm/i

function parsePage(text) {
  const entries = {}
  for (const match of text.matchAll(FAMILY_CODE_RE)) {
    const code = match[1]
    const idx  = text.indexOf(code)
    if (idx === -1) continue
    const ctx = text.slice(Math.max(0, idx - 100), idx + 500)
    const iso = ctx.match(ISO_CODE_RE)
    const wl  = ctx.match(WORKING_LEN_RE)
    if (iso || wl) {
      entries[code] = {
        iso_shape_code:   iso ? iso[1] : null,
        working_length_mm: wl  ? parseFloat(wl[1]) : null,
      }
    }
  }
  return entries
}

async function main() {
  console.log('Caricamento PDF...')
  const buf  = readFileSync(PDF_PATH)
  const data = await pdfParse(buf)
  console.log(`Pagine totali: ${data.numpages}`)

  const results = parsePage(data.text)
  const found   = Object.keys(results).length
  const outPath = 'docs/diagnostics/catalog-pdf-extract.json'
  writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`Completato: ${found} entry → ${outPath}`)
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Esegui il parser**

```bash
node archibald-web-app/backend/scripts/parse-catalog-pdf.mjs 2>&1 | tail -10
```

Atteso: `catalog-pdf-extract.json` con entry > 0. Se il risultato è 0, rileggere Step 1 e affinare i regex.

- [ ] **Step 4: Commit**

```bash
git add \
  archibald-web-app/backend/scripts/parse-catalog-pdf.mjs \
  docs/diagnostics/catalog-pdf-extract.json
git commit -m "feat(catalog): PDF parser catalogo Komet 2025 — iso_shape_code + working_length_mm"
```

---

## Task 11: Blocco D — Merge + Validate + Backfill DB

**Files:**
- Create: `archibald-web-app/backend/scripts/merge-catalog-enrichment.mjs`

Combina komet scraper (Task 9) + PDF parser (Task 10), applica UPDATE a `catalog_entries` in produzione.

- [ ] **Step 1: Verifica che entrambi i file input esistano**

```bash
ls -la docs/diagnostics/komet-enrichment-data.json docs/diagnostics/catalog-pdf-extract.json
```

Atteso: entrambi presenti e non vuoti.

- [ ] **Step 2: Crea lo script di merge**

Crea `archibald-web-app/backend/scripts/merge-catalog-enrichment.mjs`:

```javascript
#!/usr/bin/env node
import pg from 'pg'
import { readFileSync } from 'fs'

const { Pool } = pg
const pool = new Pool({
  host:     process.env.PG_HOST     || 'localhost',
  port:     Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'archibald',
  user:     process.env.PG_USER     || 'archibald',
  password: process.env.PG_PASSWORD || '',
})

function loadJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch { console.warn(`⚠ ${path} non trovato`); return {} }
}

async function main() {
  const kometData = loadJson('docs/diagnostics/komet-enrichment-data.json')
  const pdfData   = loadJson('docs/diagnostics/catalog-pdf-extract.json')

  const allCodes = new Set([...Object.keys(kometData), ...Object.keys(pdfData)])
  console.log(`Codici da aggiornare: ${allCodes.size}`)

  const { rows: before } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE ring_color IS NOT NULL)        AS ring,
      COUNT(*) FILTER (WHERE working_length_mm IS NOT NULL) AS wl,
      COUNT(*) FILTER (WHERE iso_shape_code IS NOT NULL)    AS iso
    FROM shared.catalog_entries
  `)
  console.log('Prima:', before[0])

  let updated = 0
  for (const code of allCodes) {
    const k = kometData[code] ?? {}
    const p = pdfData[code]   ?? {}
    // Priorità: PDF > komet per iso (più preciso nel testo); komet > PDF per wl
    const ring = k.ring_color        ?? null
    const wl   = k.working_length_mm ?? p.working_length_mm ?? null
    const iso  = p.iso_shape_code    ?? k.iso_shape_code    ?? null
    if (!ring && !wl && !iso) continue

    const res = await pool.query(`
      UPDATE shared.catalog_entries
      SET
        ring_color        = COALESCE($1, ring_color),
        working_length_mm = COALESCE($2, working_length_mm),
        iso_shape_code    = COALESCE($3, iso_shape_code)
      WHERE family_code = $4
    `, [ring, wl, iso, code])
    updated += res.rowCount ?? 0
  }

  const { rows: after } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE ring_color IS NOT NULL)        AS ring,
      COUNT(*) FILTER (WHERE working_length_mm IS NOT NULL) AS wl,
      COUNT(*) FILTER (WHERE iso_shape_code IS NOT NULL)    AS iso
    FROM shared.catalog_entries
  `)
  console.log('Dopo:', after[0])
  console.log(`Aggiornate ${updated} righe`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Dry-run (solo conteggi, senza modifiche al DB)**

```bash
node -e "
const komet = JSON.parse(require('fs').readFileSync('docs/diagnostics/komet-enrichment-data.json', 'utf8'))
const pdf   = JSON.parse(require('fs').readFileSync('docs/diagnostics/catalog-pdf-extract.json',   'utf8'))
const codes = new Set([...Object.keys(komet), ...Object.keys(pdf)])
let ring = 0, wl = 0, iso = 0
for (const c of codes) {
  const k = komet[c] || {}
  const p = pdf[c]   || {}
  if (k.ring_color) ring++
  if (k.working_length_mm || p.working_length_mm) wl++
  if (p.iso_shape_code || k.iso_shape_code) iso++
}
console.log('ring_color:', ring, '| working_length_mm:', wl, '| iso_shape_code:', iso, '| totale codici:', codes.size)
"
```

Atteso: numeri > 0. Se ring=0, il scraper non ha trovato ring colors → rivedere Task 9.

- [ ] **Step 4: Applica in produzione via SSH tunnel**

```bash
ssh -i /tmp/archibald_vps -L 5433:localhost:5432 -N deploy@91.98.136.198 &
TUNNEL_PID=$!
sleep 2
PG_HOST=localhost PG_PORT=5433 PG_DATABASE=archibald PG_USER=archibald \
  PG_PASSWORD=$(grep ^PG_PASSWORD archibald-web-app/backend/.env | cut -d= -f2) \
  node archibald-web-app/backend/scripts/merge-catalog-enrichment.mjs
kill $TUNNEL_PID
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/scripts/merge-catalog-enrichment.mjs
git commit -m "feat(catalog): script merge + backfill ring_color/working_length_mm/iso_shape_code"
```

---

## Task 12: Blocco D — Update CatalogSearcher + Deploy Finale

**Files:**
- Modify: `archibald-web-app/backend/src/recognition/catalog-searcher.ts`

Aggiunge `ring_color` come filtro opzionale per strumenti `blade_count` allo Step 1 della pipeline SQL (rimosso nei fallback progressivi).

- [ ] **Step 1: Leggi CatalogSearcher per capire la struttura**

```bash
cat archibald-web-app/backend/src/recognition/catalog-searcher.ts | head -120
```

Identifica:
- I parametri del descriptor in input (specialmente `gritIndicatorType`, `gritIndicatorColor`)
- Come è strutturata la clausola `WHERE grit_options ...` per `blade_count`
- Come vengono costruiti `params` e i placeholder `$N`

- [ ] **Step 2: Scrivi il test per il nuovo filtro ring_color**

In `archibald-web-app/backend/src/recognition/catalog-searcher.spec.ts`, aggiungi un nuovo `describe`:

```typescript
describe('CatalogSearcher — ring_color filter per blade_count', () => {
  it('include ring_color nella SQL quando gritType=blade_count e gritColor fornito', () => {
    const sql = searcher.buildSearchSql({
      shankGroup:         'CA_HP',
      headDiameterMm:     1.4,
      shapeClass:         'cono_tondo',
      gritIndicatorType:  'blade_count',
      gritIndicatorColor: 'red',
    })
    expect(sql).toContain('ring_color')
  })

  it('non include ring_color nella SQL quando gritColor è null', () => {
    const sql = searcher.buildSearchSql({
      shankGroup:         'CA_HP',
      headDiameterMm:     1.4,
      shapeClass:         'cono_tondo',
      gritIndicatorType:  'blade_count',
      gritIndicatorColor: null,
    })
    expect(sql).not.toContain('ring_color')
  })
})
```

**Nota**: se `buildSearchSql` non è esposto come metodo pubblico, estrai la logica in una funzione pura `buildSearchParams(descriptor)` testabile senza DB (regola C-9: è la sola via per testare questa logica senza integration test DB).

- [ ] **Step 3: Esegui il test — atteso FAIL**

```bash
npm test --prefix archibald-web-app/backend -- catalog-searcher.spec
```

- [ ] **Step 4: Aggiorna CatalogSearcher**

Nel metodo/funzione di ricerca Step 1 (massima restrittività), dopo la clausola che aggiunge `grit_options @> '[{"grit_indicator_type": "blade_count"}]'::jsonb`:

```typescript
// Aggiungi solo se il descriptor ha sia blade_count che un colore anello
if (descriptor.gritIndicatorType === 'blade_count' && descriptor.gritIndicatorColor) {
  conditions.push(`ring_color = $${params.length + 1}`)
  params.push(descriptor.gritIndicatorColor)
}
```

Il filtro `ring_color` viene rimosso automaticamente nei fallback Step 2-5 (insieme agli altri filtri progressivi) senza modifiche aggiuntive.

- [ ] **Step 5: Esegui i test backend**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: tutti i test passano.

- [ ] **Step 6: Build**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: 0 errori TypeScript.

- [ ] **Step 7: Commit e push → deploy**

```bash
git add archibald-web-app/backend/src/recognition/catalog-searcher.ts
git commit -m "feat(recognition): CatalogSearcher filtra per ring_color su strumenti blade_count"
git push origin master
```

Attendi ~3 minuti. Verifica i log:

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   logs --tail 30 backend" | grep -i "recognition\|catalog\|error"
```

- [ ] **Step 8: Verifica finale DB**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT
       COUNT(*) FILTER (WHERE ring_color IS NOT NULL)        AS ring_color_filled,
       COUNT(*) FILTER (WHERE working_length_mm IS NOT NULL) AS wl_filled,
       COUNT(*) FILTER (WHERE iso_shape_code IS NOT NULL)    AS iso_filled,
       COUNT(*)                                               AS total
     FROM shared.catalog_entries;\""
```

Atteso: tutti e tre i campi > 0. Il sistema è completamente in produzione.
