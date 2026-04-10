# Product Detail Page — Enrichment Completo
**Data**: 2026-04-10  
**Stato**: Approvato dall'utente  
**Autore**: Brainstorming session

---

## Contesto e motivazione

La `ProductDetailPage` attuale mostra solo i dati base dell'ERP (nome, codice, prezzo) e i campi già popolati dal catalogo PDF (RPM, confezione, indicazioni cliniche). Mancano:

1. **Badge caratteristiche strumento** (materiale, forma testa, tipo gambo, grana) — dati derivabili deterministicamente dal codice Komet
2. **Tab Misure arricchito** — chip con diametro in mm + tabella dimensioni tecniche + lunghezze dal catalogo
3. **Dati ERP in UI** — IVA esplicitata nella CTA, quantità minima d'ordine, stato "Prodotto ritirato"
4. **Immagini variante-specifiche** — kometuk.com ha 21+ immagini per prodotto H1 (una per misura), molto più ricche del singolo render da komet.fr

### Cosa è stato eliminato dal perimetro

- **CTA "Aggiungi all'ordine"** — rimossa, fuori scope
- **Performance bar** (durabilità %, affilatura %, controllo stelle) — eliminate: la ricerca ha confermato che questi dati non esistono come dati strutturati su nessun sito Komet per prodotti standard (H1, 8801, 879, H7). Esistono solo come testo narrativo per 4 flagship su kometdental.com.
- **Storico riconoscimenti** — non mostrato in UI, resta solo nel DB per analytics admin
- **Layout tablet/desktop** — fuori scope, mobile-first mantenuto

---

## Architettura: 3 fasi indipendenti

```
Fase 1 — UI + estensioni API (dati già nel DB, nessuna migration)
  ├── Badge features → parseKometFeatures() utility
  ├── Tab Misure → dimensioni deterministiche
  └── Dati ERP in UI → IVA, qty minima, banner ritirato

Fase 2 — kometuk.com scraper (job background, nessuna UI nuova)
  └── Estensione web-product-enrichment.ts con fonte secondaria immagini

Fase 3 — Lunghezze dal catalogo (estensione API + frontend)
  └── catalog_entries.sizes JSONB → tab Misure
```

Nessuna migration necessaria per nessuna delle 3 fasi — il nuovo schema è già interamente in produzione.

---

## Fase 1 — Badge features + Tab Misure + Dati ERP

### 1.1 — `parseKometFeatures` (backend utility)

**File**: `archibald-web-app/backend/src/utils/komet-code-parser.ts`  
**Tipo di logica**: funzione pura, zero DB, zero I/O, completamente testabile

```typescript
export type KometFeatures = {
  material:        string          // es. "Carburo di tungsteno"
  shape:           string          // es. "Testa tonda"
  shankType:       string          // es. "Turbina (FG)"
  shankDiameterMm: number          // 1.6 | 2.35
  headDiameterMm:  number          // es. 1.6 (da size code 016)
  gritLabel?:      string          // solo diamantate: es. "Grana fine (anello rosso)"
}

export function parseKometFeatures(productId: string): KometFeatures | null
```

**Parsing del codice Komet**: `{familyCode}.{shankCode}.{sizeCode}`

**Mapping materiale + forma** (da `familyCode`):

| Prefisso family | Materiale | Forma |
|---|---|---|
| H1, H1S, H1SE | Carburo di tungsteno | Testa tonda |
| H7, H7S | Carburo di tungsteno | Testa a pera |
| H2 | Carburo di tungsteno | Cono rovesciato |
| H21R | Carburo di tungsteno | Cilindro |
| H23R, H23L | Carburo di tungsteno | Cilindro con estremità tonda |
| H48L | Carburo di tungsteno | Torpedine |
| H59, H59L | Carburo di tungsteno | Cilindro |
| 801, 801EF, 801UF | Diamantata | Testa tonda |
| 8801 | Diamantata | Testa tonda |
| 6801 | Diamantata | Testa tonda |
| 5801 | Diamantata | Testa tonda |
| 879 | Diamantata | Torpedine |
| 856 | Diamantata | Torpedine |
| 862 | Diamantata | Fiamma |
| 863 | Diamantata | Fiamma |
| 837 | Diamantata | Cilindro |
| 811 | Diamantata | Testa a pera |
| KP6801, KP6837 | Diamantata DIAO (oro-rosa) | Testa tonda |
| KP6881 | Diamantata DIAO (oro-rosa) | Cilindro |
| (sconosciuto) | → `null` (skip silenzioso) | |

**Mapping gambo** (da `shankCode`):

| Codice | Tipo gambo | Diametro |
|---|---|---|
| 314 | Turbina (FG) | 1,6 mm |
| 313 | Turbina corta (FGS) | 1,6 mm |
| 315 | Turbina lunga (FGL) | 1,6 mm |
| 316 | Turbina extra-lunga (FGXL) | 1,6 mm |
| 204 | Contrangolo (CA) | 2,35 mm |

**Mapping grana** (da `familyCode`, solo per diamantate):

| Prefisso | Grana | Anello ISO |
|---|---|---|
| 801UF | Ultra fine | Bianco |
| 801EF | Extra fine | Giallo |
| 88xx | Fine | Rosso |
| 8xx (standard) | Standard | Blu |
| 68xx | Grossolana | Verde |
| 58xx | Molto grossolana | Nero |
| KP68xx (DIAO) | Grossolana | Verde |

**Diametro testa**: `parseInt(sizeCode, 10) / 10` → es. `016` → `1.6`

**Family code sconosciuto**: `parseKometFeatures` ritorna `null` — skip silenzioso. La scheda prodotto mostra il tab "Prodotto" senza la card caratteristiche.

**Test**: `komet-code-parser.spec.ts` — unitari esaustivi su parsing, edge cases (codici malformati, famiglie sconosciute, DIAO, CA shank).

---

### 1.2 — Estensione API `/enrichment`

**File**: `archibald-web-app/backend/src/routes/products.ts`

**Campo aggiunto al response**:
```typescript
features: KometFeatures | null   // NUOVO
```

`parseKometFeatures(productId)` viene chiamato nella route, zero query DB aggiuntive.

**Tipo frontend aggiornato** in `archibald-web-app/frontend/src/api/recognition.ts`:
```typescript
export type KometFeatures = {
  material:        string
  shape:           string
  shankType:       string
  shankDiameterMm: number
  headDiameterMm:  number
  gritLabel?:      string
}

// In ProductEnrichment:
features: KometFeatures | null   // NUOVO
```

---

### 1.3 — Tab "Prodotto" — card caratteristiche

**Posizione**: prima card del tab "Prodotto", sopra RPM/confezione/note.

**UI** (se `features !== null`):
```
┌─────────────────────────────────────────────┐
│ Caratteristiche strumento                   │
│                                             │
│ [pill verde]   Carburo di tungsteno         │
│ [pill blu]     Testa tonda                  │
│ [pill giallo]  Gambo turbina · Ø 1,6 mm     │
│ [pill rosso]   Grana fine (anello rosso)    │  ← solo diamantate
└─────────────────────────────────────────────┘
```

Pills colorate: materiale → verde, forma → blu, gambo → giallo/ambra, grana → colore anello ISO (rosso per fine, verde per grossolana, ecc.).

Se `features === null`: card non mostrata, il tab inizia direttamente da RPM/confezione.

---

### 1.4 — Tab "Misure" arricchito

**Chip**: ogni chip mostra codice size + diametro in mm:
```
[ 012        ]  [ 014        ]  [ 016        ]  [ 018        ]
[ Ø 1,2 mm  ]  [ Ø 1,4 mm  ]  [ Ø 1,6 mm  ]  [ Ø 1,8 mm  ]
  (chip)          (chip)        (chip attivo)    (chip)
```

**Tabella dimensioni** (aggiornata al cambio variante selezionata), derivata deterministicamente:

| Campo | Valore | Fonte |
|---|---|---|
| Diametro della testa | X,X mm | size code |
| Tipo di gambo | Turbina (FG) / Contrangolo (CA) | shank code |
| Diametro del gambo | 1,6 mm / 2,35 mm | shank code |
| Lunghezza parte lavorante | X,X mm | Fase 3 — catalog_entries.sizes |
| Lunghezza totale | XX,X mm | Fase 3 — catalog_entries.sizes |

Le ultime due righe appaiono solo in Fase 3. In Fase 1: tabella con le prime 3 righe.

**Nessuna API change** per Fase 1 — tutto derivato dai `sizeVariants` già presenti nel frontend.

---

### 1.5 — Dati ERP in UI

#### CTA sticky — IVA e quantità minima

`product.vat` e `product.minQty` sono già nel tipo `Product` lato frontend.

**UI aggiunta sotto il prezzo**:
```
Prezzo di listino
€ 12,50
€ 10,25 imponibile + IVA 22%
Quantità minima ordine: 5 pezzi       ← solo se minQty > 1
```

Formula imponibile: `price / (1 + vat / 100)` arrotondata a 2 decimali.

#### Prodotti ritirati (`deleted_at IS NOT NULL`)

**Problema attuale**: `getProducts` filtra `deleted_at IS NULL`, quindi un prodotto ritirato ritorna array vuoto → la pagina mostra "Prodotto non trovato".

**Fix**: modificare la route `GET /api/products` in modo che, quando `productId` è specificato, includa anche prodotti con `deleted_at IS NOT NULL`. Il campo `isRetired: boolean` viene aggiunto al tipo `Product` (non a `ProductEnrichment` — è una proprietà ERP, non di enrichment).

**Tipo frontend aggiornato** in `api/products.ts`:
```typescript
// In Product:
isRetired: boolean   // NUOVO — true se deleted_at IS NOT NULL
```

**UI prodotto ritirato**:
- Gallery: badge rosso "Prodotto ritirato" in alto a destra (overlay glassmorphism)
- Pallino stato: diventa rosso, testo "Non più disponibile" invece del codice
- Banner rosso sotto il nome: "Questo prodotto è stato ritirato dal catalogo Komet. Le informazioni tecniche sono conservate per consultazione storica."
- Tab content: rimane visibile ma testo dimmed (colore #6b7280 invece di #fff)
- CTA: prezzo barrato, nessuna interazione

---

## Fase 2 — kometuk.com scraper

### 2.1 — Architettura

**File modificato**: `archibald-web-app/backend/src/operations/handlers/web-product-enrichment.ts`

**Funzione aggiunta**: `scrapeKometUk(fetchUrl, familyCode): Promise<GalleryImage[]>`

Chiamata da `enrichSingleProduct()` dopo `scrapeKometFr()`, con lo stesso meccanismo di skip silenzioso su errore.

### 2.2 — Logica scraper

```typescript
async function scrapeKometUk(
  fetchUrl: FetchUrl,
  familyCode: string,
): Promise<GalleryImage[]>
```

**Flusso**:
1. `GET https://kometuk.com/products/${familyCode.toLowerCase()}.json`
2. Se 404 → `[]` (prodotto non presente nel catalogo UK)
3. Se 429 → throw (il chiamante logga warning, il job continua al prossimo prodotto)
4. Parse `product.images[]` dal JSON Shopify:
   ```json
   { "src": "https://cdn.shopify.com/.../01tc_h1_314_016_450_UUID.png", "alt": "H1 FG 016" }
   ```
5. Per ogni immagine: estrai variante dal filename tramite regex `/_(\d{3})_(\d{3})_(\d{3})_/` (shank + size)
6. Ritorna array `GalleryImage[]` con `source: 'kometuk.com'`, `imageType: 'catalog_render'`

**Deduplicazione**: `product_gallery` ha `UNIQUE(product_id, url)` → `INSERT ... ON CONFLICT DO NOTHING`

**Rate limiting**: 500ms delay già presente nel loop bulk. Nessun delay aggiuntivo necessario.

### 2.3 — Matching immagini → varianti

Le immagini Shopify kometuk.com hanno filename tipo:
```
01tc_h1_314_016_450_a1b2c3d4.png   → H1.314.016
03di_8801_314_016_450_e5f6g7h8.png → 8801.314.016
```

**Matching per sottostringa**: per ogni immagine, si verifica se il basename dell'URL contiene `_${shankCode}_${sizeCode}_` (es. `_314_016_`). Il `shankCode` e `sizeCode` si estraggono dal `productId` già disponibile. Questo è più preciso di una regex generica e non richiede conoscenza del prefisso `01tc_`/`03di_`.

Le immagini che non matchano nessuna variante specifica (es. immagini di famiglia generiche senza codice misura nel nome) vengono **scartate** — non salvate. Solo le immagini variante-specifiche vengono inserite in `product_gallery`.

### 2.4 — Test

`web-product-enrichment.spec.ts`:
- Mock HTTP per `kometuk.com/products/h1.json` con fixture JSON Shopify reale
- Verifica matching regex per H1.314.016, H1.314.012, 8801.314.016
- Verifica skip silenzioso su 404
- Verifica array vuoto se nessuna immagine matcha

---

## Fase 3 — Lunghezze dal catalogo

### 3.1 — Estensione API `/enrichment`

**Campo aggiunto**:
```typescript
catalogSizes: {
  workingLengthMm: number | null
  totalLengthMm:   number | null
} | null
```

**Query DB**: join su `catalog_entries` via `family_code` estratto da `productId`. La colonna `sizes` JSONB contiene i dati scritti dall'ingestion Sonnet.

**Prerequisito implementativo**: prima di scrivere il parser JSONB, eseguire in produzione:
```sql
SELECT family_code, sizes FROM shared.catalog_entries
WHERE sizes IS NOT NULL LIMIT 10;
```
per verificare il formato effettivo delle chiavi (es. `working_length_mm` vs `working_length` vs altro). Il parser deve adattarsi alle chiavi reali, non a quelle ipotizzate.

**Parsing JSONB**: estrarre `working_length_mm` e `total_length_mm` (chiavi da confermare con la query sopra). Se chiave assente o null → campo null.

### 3.2 — Frontend

Tab Misure: le due righe aggiuntive appaiono in fondo alla tabella dimensioni solo se `catalogSizes !== null` e il campo specifico non è null. Nessun placeholder se non disponibili.

### 3.3 — Test

Test di integrazione sulla route `/enrichment` con prodotto noto che ha `catalog_entries.sizes` popolato.

---

## Riepilogo file modificati

### Fase 1

**Backend (nuovo)**:
- `src/utils/komet-code-parser.ts` — `parseKometFeatures()`
- `src/utils/komet-code-parser.spec.ts` — unit tests esaustivi

**Backend (modificato)**:
- `src/routes/products.ts` — aggiunge `features`, `isRetired` al response `/enrichment`; modifica query per includere prodotti ritirati

**Frontend (modificato)**:
- `src/api/recognition.ts` — aggiunge `KometFeatures`, `features`, `isRetired` ai tipi
- `src/pages/ProductDetailPage.tsx` — badge card, chip con mm, tabella dimensioni, CTA con IVA, banner ritirato
- `src/pages/ProductDetailPage.spec.tsx` — test per badge, tabella misure, banner ritirato, IVA in CTA

### Fase 2

**Backend (modificato)**:
- `src/operations/handlers/web-product-enrichment.ts` — aggiunge `scrapeKometUk()`
- `src/operations/handlers/web-product-enrichment.spec.ts` — test kometuk.com

### Fase 3

**Backend (modificato)**:
- `src/routes/products.ts` — aggiunge `catalogSizes` al response `/enrichment`

**Frontend (modificato)**:
- `src/api/recognition.ts` — aggiunge `catalogSizes` al tipo `ProductEnrichment`
- `src/pages/ProductDetailPage.tsx` — tabella misure aggiunge righe lunghezze

---

## Nessuna migration necessaria

Tutto il nuovo schema è già in produzione (migration 052-057). L'unica modifica DB è a livello di query: includere `deleted_at IS NOT NULL` per prodotti ritirati nella lookup per ID specifico.

---

## Costi stimati

| Voce | Impatto |
|---|---|
| parseKometFeatures | Zero costo, zero latenza |
| kometuk.com API | Zero costo (Shopify public JSON endpoint, no auth) |
| Dimensioni deterministiche | Zero costo |
| DB `catalog_entries.sizes` | 1 query JOIN già presente nel loop enrichment |

Il bulk run di web-product-enrichment con kometuk.com aggiunto aumenterà il tempo di esecuzione di ~50% (una chiamata HTTP in più per prodotto), ma rimane un job asincrono in background.
