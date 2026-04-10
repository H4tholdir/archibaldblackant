# Pictogram Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leggere i pittogrammi già estratti in `shared.catalog_entries.pictograms` e mostrarli nella `ProductDetailPage` come chip "Applicazioni consigliate" nella Tab Prodotto.

**Architecture:** La colonna `pictograms jsonb` contiene array `[{"symbol":"cavity_tooth","meaning":"Cavity preparation"}]`. I simboli sono inconsistenti (alias, case diverso), quindi si normalizzano lato backend con una mappa statica symbol→labelIt. La route `/products/:id/enrichment` espone il risultato come `pictograms: Array<{symbol, labelIt}>`. Il frontend mostra i chip solo se presenti.

**Tech Stack:** PostgreSQL JSONB, TypeScript strict, Express dep-injection pattern, React 19 inline styles, Vitest.

---

## Contesto codebase (leggere prima di iniziare)

### DB — schema già in prod (migration 057)
```sql
-- shared.catalog_entries ha già:
pictograms jsonb   -- [{"symbol": "cavity_tooth", "meaning": "Cavity preparation"}, ...]
```

Il join prodotto → catalog_entries usa:
```sql
EXISTS (
  SELECT 1 FROM unnest(ce.family_codes) fc
  WHERE split_part(fc, '.', 1) = pd.catalog_family_code
)
```
dove `pd.catalog_family_code` è in `shared.product_details`.

### File esistenti rilevanti
- `archibald-web-app/backend/src/utils/komet-code-parser.ts` — pattern utility pura, stesso stile per `pictogram-labels.ts`
- `archibald-web-app/backend/src/db/repositories/products.ts` — aggiungere `getPictograms` alla fine, prima della `export {}`
- `archibald-web-app/backend/src/routes/products.ts` — `ProductsRouterDeps` tipo, Promise.all nel GET `/:productId/enrichment`
- `archibald-web-app/backend/src/server.ts` — wiring deps `getProductGallery` ecc. (linea ~592)
- `archibald-web-app/frontend/src/api/recognition.ts` — `ProductEnrichment` type (linea 81)
- `archibald-web-app/frontend/src/pages/ProductDetailPage.tsx` — Tab Prodotto, linea ~349 card "Caratteristiche strumento"

### Comandi test
```bash
# Backend
cd archibald-web-app/backend && npm test -- --run
# Frontend
cd archibald-web-app/frontend && npx vitest run
# TypeScript backend
cd archibald-web-app/backend && npm run build
```

---

## File Structure

| Azione | Path |
|--------|------|
| **Create** | `archibald-web-app/backend/src/utils/pictogram-labels.ts` |
| **Create** | `archibald-web-app/backend/src/utils/pictogram-labels.spec.ts` |
| **Modify** | `archibald-web-app/backend/src/db/repositories/products.ts` |
| **Modify** | `archibald-web-app/backend/src/db/repositories/products.spec.ts` |
| **Modify** | `archibald-web-app/backend/src/routes/products.ts` |
| **Modify** | `archibald-web-app/backend/src/routes/products.spec.ts` |
| **Modify** | `archibald-web-app/backend/src/server.ts` |
| **Modify** | `archibald-web-app/frontend/src/api/recognition.ts` |
| **Modify** | `archibald-web-app/frontend/src/pages/ProductDetailPage.tsx` |

---

## Task 1: Utility `pictogram-labels.ts` — mappa normalizzazione + `normalizePictograms`

**Files:**
- Create: `archibald-web-app/backend/src/utils/pictogram-labels.ts`
- Create: `archibald-web-app/backend/src/utils/pictogram-labels.spec.ts`

- [ ] **Step 1: Scrivi i test failing**

```typescript
// archibald-web-app/backend/src/utils/pictogram-labels.spec.ts
import { describe, expect, test } from 'vitest';
import { normalizePictograms } from './pictogram-labels';

describe('normalizePictograms', () => {
  test('maps a known symbol to its Italian label', () => {
    expect(normalizePictograms(['cavity_tooth'])).toEqual([
      { symbol: 'cavity_tooth', labelIt: 'Preparazione cavità' },
    ]);
  });

  test('deduplicates aliases that resolve to the same Italian label', () => {
    // cavity_tooth, cavity_prep, cavity_preparation all → 'Preparazione cavità'
    expect(normalizePictograms(['cavity_tooth', 'cavity_prep', 'cavity_preparation'])).toEqual([
      { symbol: 'cavity_tooth', labelIt: 'Preparazione cavità' },
    ]);
  });

  test('omits symbols mapped to null (maximum_speed, packing_unit, REF)', () => {
    expect(normalizePictograms(['maximum_speed', 'cavity_tooth', 'packing_unit', 'REF'])).toEqual([
      { symbol: 'cavity_tooth', labelIt: 'Preparazione cavità' },
    ]);
  });

  test('omits unknown symbols not present in the map', () => {
    expect(normalizePictograms(['unknown_symbol_xyz'])).toEqual([]);
  });

  test('returns empty array for empty input', () => {
    expect(normalizePictograms([])).toEqual([]);
  });

  test('normalizes autoclave case variants to the same label', () => {
    // DB has autoclave_134, autoclave_134c, autoclave_134C — all same meaning
    const result = normalizePictograms(['autoclave_134', 'autoclave_134c', 'autoclave_134C']);
    expect(result).toEqual([{ symbol: 'autoclave_134', labelIt: 'Autoclave 134°C' }]);
  });

  test('normalizes further_info / further_information / info_i to same label', () => {
    const result = normalizePictograms(['further_info', 'further_information', 'info_i']);
    expect(result).toEqual([{ symbol: 'further_info', labelIt: 'Ulteriori informazioni disponibili' }]);
  });

  test('preserves order of first occurrence when deduplicating', () => {
    const result = normalizePictograms(['implant', 'implantology', 'orthodontics']);
    expect(result).toEqual([
      { symbol: 'implant',      labelIt: 'Implantologia' },
      { symbol: 'orthodontics', labelIt: 'Ortodonzia' },
    ]);
  });
});
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
cd archibald-web-app/backend && npx vitest run src/utils/pictogram-labels.spec.ts
```
Atteso: FAIL — `Cannot find module './pictogram-labels'`

- [ ] **Step 3: Implementa `pictogram-labels.ts`**

```typescript
// archibald-web-app/backend/src/utils/pictogram-labels.ts
export type PictogramLabel = {
  symbol:  string;
  labelIt: string;
};

// Maps raw symbols from catalog_entries.pictograms to Italian labels.
// null = skip (already shown elsewhere in the UI, e.g. rpm_max, packaging_units).
// undefined (key absent) = unknown symbol, also skipped.
const PICTOGRAM_MAP: Record<string, string | null> = {
  // ── Indicazioni cliniche ──
  cavity_tooth:               'Preparazione cavità',
  cavity_prep:                'Preparazione cavità',
  cavity_preparation:         'Preparazione cavità',
  crown_prep:                 'Preparazione corona',
  crown_preparation:          'Preparazione corona',
  crown_tooth:                'Preparazione corona',
  crown_and_bridge:           'Corona e bridge',
  crown_bridge:               'Corona e bridge',
  crown_bridge_technique:     'Corona e bridge',
  crown_cut:                  'Rimozione corona',
  crown_removal:              'Rimozione corona',
  root_canal:                 'Preparazione canalare',
  root_canal_prep:            'Preparazione canalare',
  root_canal_preparation:     'Preparazione canalare',
  root_planing:               'Levigatura radicolare',
  implant:                    'Implantologia',
  implantology:               'Implantologia',
  oral_surgery:               'Chirurgia orale',
  oral_surgery_tooth:         'Chirurgia orale',
  orthodontics:               'Ortodonzia',
  orthodontic_bracket:        'Ortodonzia',
  prophylaxis:                'Profilassi',
  prophylaxis_cup:            'Profilassi',
  post_systems:               'Sistemi per perni',
  working_on_fillings:        'Restauri compositi',
  filling_work:               'Restauri compositi',
  removal_old_fillings:       'Rimozione otturazioni',
  // ── Tecnica ──
  acrylic_technique:          'Tecnica acrilica',
  acrylic_teeth:              'Tecnica acrilica',
  milling_technique:          'Fresatura di precisione',
  model_casting:              'Scheletrati',
  model_casting_technique:    'Scheletrati',
  model_fabrication:          'Modelli in gesso',
  bevel_cut:                  'Taglio a smusso',
  bevel_cut_milling:          'Taglio a smusso',
  // ── Caratteristiche geometriche ──
  angle:                      'Angolazione',
  angle_symbol:               'Angolazione',
  cone_angle_45:              'Angolazione 45°',
  diamond_interspersed:       'Rivestimento diamantato',
  diamond_interspersed_edge:  'Bordo diamantato',
  double_sided:               'Doppia affilatura',
  two_grit_double_sided:      'Doppia grana su entrambi i lati',
  cutting_tip:                'Punta tagliente',
  cutting_tip_pointed:        'Punta tagliente acuminata',
  non_cutting_tip_1:          'Punta non tagliente',
  rounded_edges:              'Bordi arrotondati',
  rounded_tip:                'Punta arrotondata',
  end_cutting_only_1:         'Solo taglio frontale',
  end_cutting_only_with_radius: 'Solo taglio frontale con raggio',
  guide_pin_length:           'Segna-profondità',
  upper_side_coated:          'Rivestimento lato superiore',
  lower_side_coated:          'Rivestimento lato inferiore',
  safety_chamfer:             'Smusso di sicurezza',
  swirl_tooth:                'Taglio elicoidale',
  // ── Sterilizzazione / sicurezza ──
  autoclave_134:              'Autoclave 134°C',
  autoclave_134c:             'Autoclave 134°C',
  autoclave_134C:             'Autoclave 134°C',
  thermodisinfector:          'Termodisinfettore',
  ultrasonic_bath:            'Bagno a ultrasuoni',
  no_autoclave:               'Non autoclavabile',
  single_use:                 'Monouso',
  single_use_only:            'Monouso',
  STERILE_R:                  'Sterile',
  do_not_use_damaged:         'Non usare se imballaggio danneggiato',
  keep_away_from_sunlight:    'Proteggere dalla luce',
  // ── Info ──
  further_info:               'Ulteriori informazioni disponibili',
  further_information:        'Ulteriori informazioni disponibili',
  info_i:                     'Ulteriori informazioni disponibili',
  consult_instructions:       "Consultare le istruzioni d'uso",
  // ── Saltati — già mostrati altrove nell'UI ──
  maximum_speed:              null,   // → details.rpmMax
  max_speed:                  null,   // → details.rpmMax
  recommended_speed:          null,   // → details.rpmMax
  opt_speed:                  null,   // → details.rpmMax
  packing_unit:               null,   // → details.packagingUnits
  REF:                        null,   // numero d'ordine, non utile all'utente
};

export function normalizePictograms(symbols: string[]): PictogramLabel[] {
  const seenLabel = new Set<string>();
  const result: PictogramLabel[] = [];
  for (const symbol of symbols) {
    const labelIt = PICTOGRAM_MAP[symbol];
    if (labelIt == null) continue;        // null (skip) o undefined (sconosciuto)
    if (seenLabel.has(labelIt)) continue; // deduplica per label italiana
    seenLabel.add(labelIt);
    result.push({ symbol, labelIt });
  }
  return result;
}
```

- [ ] **Step 4: Verifica che i test passino**

```bash
cd archibald-web-app/backend && npx vitest run src/utils/pictogram-labels.spec.ts
```
Atteso: 8 test PASS

- [ ] **Step 5: Commit**

```bash
cd archibald-web-app/backend
git add src/utils/pictogram-labels.ts src/utils/pictogram-labels.spec.ts
git commit -m "feat(product): add pictogram normalization map and normalizePictograms utility"
```

---

## Task 2: `getPictograms` nel repository `products.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/products.ts`
- Modify: `archibald-web-app/backend/src/db/repositories/products.spec.ts`

- [ ] **Step 1: Scrivi i test failing**

Nel file `products.spec.ts`, aggiungi in cima all'import block:
```typescript
import { getPictograms } from './products';
```
e in fondo al file aggiungi:

```typescript
describe('getPictograms', () => {
  const productId = 'H1.314.009';

  test('returns normalized pictograms for a product', async () => {
    const pool = createMockPool(vi.fn(async () => ({
      rows: [{ symbol: 'cavity_tooth' }, { symbol: 'maximum_speed' }],
      rowCount: 2, command: 'SELECT', oid: 0, fields: [],
    })));

    const result = await getPictograms(pool, productId);

    // maximum_speed viene saltato (già mostrato come rpmMax)
    expect(result).toEqual([
      { symbol: 'cavity_tooth', labelIt: 'Preparazione cavità' },
    ]);
  });

  test('returns empty array when no pictograms found in catalog', async () => {
    const pool = createMockPool(vi.fn(async () => ({
      rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [],
    })));

    const result = await getPictograms(pool, productId);

    expect(result).toEqual([]);
  });

  test('passes productId as the only SQL parameter', async () => {
    const mockQuery = vi.fn(async () => ({
      rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [],
    }));

    await getPictograms(createMockPool(mockQuery as DbPool['query']), productId);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('pictograms'),
      [productId],
    );
  });
});
```

- [ ] **Step 2: Verifica che il test fallisca**

```bash
cd archibald-web-app/backend && npx vitest run src/db/repositories/products.spec.ts
```
Atteso: FAIL — `getPictograms is not exported from './products'`

- [ ] **Step 3: Implementa `getPictograms` in `products.ts`**

In cima al file, aggiungi l'import (dopo gli import esistenti):
```typescript
import { normalizePictograms, type PictogramLabel } from '../utils/pictogram-labels';
```

Poi aggiungi la funzione subito prima della `export {` block alla fine del file:

```typescript
async function getPictograms(pool: DbPool, productId: string): Promise<PictogramLabel[]> {
  const { rows } = await pool.query<{ symbol: string }>(
    `SELECT DISTINCT elem->>'symbol' AS symbol
     FROM shared.product_details pd,
          shared.catalog_entries ce,
          jsonb_array_elements(ce.pictograms) elem
     WHERE pd.product_id = $1
       AND EXISTS (SELECT 1 FROM unnest(ce.family_codes) fc WHERE split_part(fc, '.', 1) = pd.catalog_family_code)
       AND ce.pictograms IS NOT NULL
       AND ce.pictograms != '[]'::jsonb
     ORDER BY symbol`,
    [productId],
  );
  return normalizePictograms(rows.map(r => r.symbol));
}
```

Aggiungi `getPictograms` nella `export {}` block esistente:
```typescript
export {
  // ...tutti gli export esistenti...
  getShankLengthMm,
  getPictograms,
  type PictogramLabel,
  // ...tipi esistenti...
};
```

- [ ] **Step 4: Verifica che i test passino**

```bash
cd archibald-web-app/backend && npx vitest run src/db/repositories/products.spec.ts
```
Atteso: tutti i test PASS (include i 3 nuovi di getPictograms)

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/products.ts \
        archibald-web-app/backend/src/db/repositories/products.spec.ts
git commit -m "feat(product): add getPictograms repository function with catalog join"
```

---

## Task 3: Dep + Route — esporre `pictograms` nell'API enrichment

**Files:**
- Modify: `archibald-web-app/backend/src/routes/products.ts`
- Modify: `archibald-web-app/backend/src/routes/products.spec.ts`
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Scrivi i test failing**

In `products.spec.ts` (route), aggiungi all'interno del `describe('GET /api/products/:productId/enrichment')` già esistente:

```typescript
test('returns pictograms from dep', async () => {
  deps.getProductPictograms = vi.fn().mockResolvedValue([
    { symbol: 'cavity_tooth', labelIt: 'Preparazione cavità' },
  ]);
  deps.getProductGallery            = vi.fn().mockResolvedValue([]);
  deps.getRecognitionHistory        = vi.fn().mockResolvedValue([]);
  deps.getProductDetails            = vi.fn().mockResolvedValue(null);
  deps.getProductWebResources       = vi.fn().mockResolvedValue([]);
  deps.getProductVariantsForEnrichment = vi.fn().mockResolvedValue([]);
  deps.getShankLengthMm             = vi.fn().mockResolvedValue(null);
  app = createApp(deps);

  const res = await request(app).get('/api/products/H1.314.009/enrichment');

  expect(res.status).toBe(200);
  expect(res.body.pictograms).toEqual([
    { symbol: 'cavity_tooth', labelIt: 'Preparazione cavità' },
  ]);
  expect(deps.getProductPictograms).toHaveBeenCalledWith('H1.314.009');
});

test('returns empty pictograms when dep is not configured', async () => {
  deps.getProductPictograms = undefined;
  deps.getProductGallery            = vi.fn().mockResolvedValue([]);
  deps.getRecognitionHistory        = vi.fn().mockResolvedValue([]);
  deps.getProductDetails            = vi.fn().mockResolvedValue(null);
  deps.getProductWebResources       = vi.fn().mockResolvedValue([]);
  deps.getProductVariantsForEnrichment = vi.fn().mockResolvedValue([]);
  deps.getShankLengthMm             = vi.fn().mockResolvedValue(null);
  app = createApp(deps);

  const res = await request(app).get('/api/products/H1.314.009/enrichment');

  expect(res.status).toBe(200);
  expect(res.body.pictograms).toEqual([]);
});
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
cd archibald-web-app/backend && npx vitest run src/routes/products.spec.ts
```
Atteso: FAIL — `pictograms` non in response

- [ ] **Step 3: Aggiungi dep a `ProductsRouterDeps` in `products.ts`**

Nel tipo `ProductsRouterDeps` (dopo `getShankLengthMm`):
```typescript
  getProductPictograms?: (productId: string) => Promise<Array<{ symbol: string; labelIt: string }>>;
```

- [ ] **Step 4: Aggiungi `pictograms` al `Promise.all` nella route enrichment**

Trova il blocco `Promise.all` nella route `GET /:productId/enrichment` (attuale):
```typescript
const [gallery, history, details, webResources] = await Promise.all([
  deps.getProductGallery        ? deps.getProductGallery(productId)           : Promise.resolve([]),
  deps.getRecognitionHistory    ? deps.getRecognitionHistory(productId, 10)   : Promise.resolve([]),
  deps.getProductDetails        ? deps.getProductDetails(productId)           : Promise.resolve(null),
  deps.getProductWebResources   ? deps.getProductWebResources(productId)      : Promise.resolve([]),
]);
```

Sostituiscilo con:
```typescript
const [gallery, history, details, webResources, pictograms] = await Promise.all([
  deps.getProductGallery        ? deps.getProductGallery(productId)           : Promise.resolve([]),
  deps.getRecognitionHistory    ? deps.getRecognitionHistory(productId, 10)   : Promise.resolve([]),
  deps.getProductDetails        ? deps.getProductDetails(productId)           : Promise.resolve(null),
  deps.getProductWebResources   ? deps.getProductWebResources(productId)      : Promise.resolve([]),
  deps.getProductPictograms     ? deps.getProductPictograms(productId)        : Promise.resolve([]),
]);
```

- [ ] **Step 5: Aggiungi `pictograms` alla `res.json()`**

Trova il blocco `res.json({...})` nella stessa route e aggiungi `pictograms`:
```typescript
res.json({
  gallery: mappedGallery,
  details: mappedDetails,
  competitors: [],
  sizeVariants,
  shankLengthMm,
  pictograms,
  features: parseKometFeatures(productId),
  recognitionHistory: history.length > 0 ? history.map((h) => ({
    scannedAt:  h.scanned_at,
    agentId:    h.agent_id,
    confidence: h.confidence,
    cacheHit:   h.cache_hit,
  })) : null,
});
```

- [ ] **Step 6: Wiring in `server.ts`**

Trova il blocco `createProductsRouter({...})` in `server.ts` e aggiungi dopo `getShankLengthMm`:
```typescript
getProductPictograms: (productId) => productsRepo.getPictograms(pool, productId),
```

Nota: `productsRepo.getPictograms` è già esportata dal repository (Task 2).

- [ ] **Step 7: Verifica che i test passino**

```bash
cd archibald-web-app/backend && npx vitest run src/routes/products.spec.ts
```
Atteso: tutti i test PASS (inclusi i 2 nuovi)

- [ ] **Step 8: Build TypeScript**

```bash
cd archibald-web-app/backend && npm run build
```
Atteso: nessun errore

- [ ] **Step 9: Test suite completa backend**

```bash
cd archibald-web-app/backend && npm test -- --run
```
Atteso: tutti passano

- [ ] **Step 10: Commit**

```bash
git add archibald-web-app/backend/src/routes/products.ts \
        archibald-web-app/backend/src/routes/products.spec.ts \
        archibald-web-app/backend/src/server.ts
git commit -m "feat(product): expose pictograms in enrichment API route"
```

---

## Task 4: Frontend — tipo + UI chip "Applicazioni consigliate"

**Files:**
- Modify: `archibald-web-app/frontend/src/api/recognition.ts`
- Modify: `archibald-web-app/frontend/src/pages/ProductDetailPage.tsx`

- [ ] **Step 1: Aggiungi il tipo `Pictogram` e il campo in `ProductEnrichment`**

In `archibald-web-app/frontend/src/api/recognition.ts`, aggiungi sopra `ProductEnrichment`:

```typescript
type Pictogram = {
  symbol:  string
  labelIt: string
}
```

E aggiungi il campo in `ProductEnrichment` dopo `shankLengthMm?`:
```typescript
export type ProductEnrichment = {
  details:            ProductDetails | null
  gallery:            ProductGalleryImage[]
  competitors:        []
  sizeVariants:       SizeVariant[]
  shankLengthMm?:     number | null
  pictograms?:        Pictogram[]
  features?:          KometFeatures | null
  recognitionHistory: Array<{
    scannedAt:  string
    agentId:    string
    confidence: number
    cacheHit:   boolean
  }> | null
}
```

- [ ] **Step 2: Verifica il type-check frontend**

```bash
cd archibald-web-app/frontend && node_modules/.bin/tsc --noEmit
```
Atteso: nessun errore

- [ ] **Step 3: Aggiungi la card "Applicazioni consigliate" in `ProductDetailPage.tsx`**

Trova il blocco features in Tab Prodotto (linea ~349-383):
```tsx
          {/* Badge caratteristiche strumento */}
          {enrichment?.features && (
            <div style={{
              background: '#1a1a1a', borderRadius: 10, padding: '14px 16px', marginBottom: 10,
            }}>
              ...
            </div>
          )}
          {details && (details.rpmMax || ...
```

**Inserisci** tra la chiusura di `)}` della features card e `{details && ...`:

```tsx
          {/* Pittogrammi — Applicazioni consigliate */}
          {enrichment?.pictograms && enrichment.pictograms.length > 0 && (
            <div style={{
              background: '#1a1a1a', borderRadius: 10, padding: '14px 16px', marginBottom: 10,
            }}>
              <div style={{
                fontSize: 10, color: '#6b7280', letterSpacing: '1px',
                textTransform: 'uppercase', marginBottom: 10,
              }}>
                Applicazioni consigliate
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {enrichment.pictograms.map(p => (
                  <span
                    key={p.symbol}
                    style={{
                      background: '#262626', borderRadius: 6, padding: '4px 10px',
                      fontSize: 11, color: '#d1d5db', whiteSpace: 'nowrap',
                    }}
                  >
                    {p.labelIt}
                  </span>
                ))}
              </div>
            </div>
          )}
```

- [ ] **Step 4: Verifica il type-check**

```bash
cd archibald-web-app/frontend && node_modules/.bin/tsc --noEmit
```
Atteso: nessun errore

- [ ] **Step 5: Test suite frontend**

```bash
cd archibald-web-app/frontend && npx vitest run
```
Atteso: tutti i test PASS (nessun test esistente rotto)

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/api/recognition.ts \
        archibald-web-app/frontend/src/pages/ProductDetailPage.tsx
git commit -m "feat(product): show pictogram chips in ProductDetailPage Tab Prodotto"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Query diagnostica DB — fatta prima di scrivere il piano (75 simboli identificati, struttura JSONB confermata)
- ✅ Normalizzazione alias — PICTOGRAM_MAP copre tutti i 75 simboli con alias (autoclave_134/c/C, cavity_tooth/prep/preparation, ecc.)
- ✅ Simboli già mostrati altrove (maximum_speed, packing_unit) → null in PICTOGRAM_MAP
- ✅ API route espone `pictograms[]` con parallel fetch via Promise.all
- ✅ Frontend type + chip UI solo se pictograms.length > 0

**2. Placeholder scan:** Nessun placeholder — ogni step ha codice completo.

**3. Type consistency:**
- `PictogramLabel` definito in `pictogram-labels.ts`, re-esportato da `products.ts`
- Route usa `Array<{ symbol: string; labelIt: string }>` inline per evitare import extra nel route file
- Frontend usa `Pictogram` type locale (stessa shape)
- Tutti i nomi coerenti: `getPictograms`, `getProductPictograms`, `pictograms`, `normalizePictograms`
