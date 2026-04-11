# Pictogram Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Correggere la qualità dei dati pittogrammi in `catalog_entries.pictograms` via ri-estrazione AI mirata. (2) Esporre i pittogrammi normalizzati nella route `/products/:id/enrichment`. (3) Mostrare chip "Applicazioni consigliate" nella `ProductDetailPage`.

**Problema dati**: L'AI durante l'ingestion originale ha estratto pittogrammi parziali. Analisi prod (2026-04-10):
- 364/1639 famiglie: 0 pittogrammi
- 446/1639 famiglie: solo 1 pittogramma (probabilmente incompleto — media `rotary_carbide` = 1.8)
- H1 (pag. 161): 1 pittogramma nel DB, 2 visibili nel catalogo
- H21R (pag. 161): 0 pittogrammi nel DB

**Architecture:** Task 0 crea un nuovo operation handler `re-extract-pictograms` che usa `CatalogPdfService` + Claude API per ri-leggere ogni pagina del catalogo e aggiornare solo la colonna `pictograms`. Tasks 1-4 implementano la normalizzazione + API + UI.

**Tech Stack:** PostgreSQL JSONB, Anthropic API (Sonnet), TypeScript strict, Express dep-injection, React 19 inline styles, Vitest.

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
| **Create** | `archibald-web-app/backend/src/operations/handlers/re-extract-pictograms.ts` |
| **Create** | `archibald-web-app/backend/src/operations/handlers/re-extract-pictograms.spec.ts` |
| **Modify** | `archibald-web-app/backend/src/server.ts` (registrare nuovo handler) |
| **Create** | `archibald-web-app/backend/src/utils/pictogram-labels.ts` |
| **Create** | `archibald-web-app/backend/src/utils/pictogram-labels.spec.ts` |
| **Modify** | `archibald-web-app/backend/src/db/repositories/products.ts` |
| **Modify** | `archibald-web-app/backend/src/db/repositories/products.spec.ts` |
| **Modify** | `archibald-web-app/backend/src/routes/products.ts` |
| **Modify** | `archibald-web-app/backend/src/routes/products.spec.ts` |
| **Modify** | `archibald-web-app/backend/src/server.ts` (wiring dep enrichment) |
| **Modify** | `archibald-web-app/frontend/src/api/recognition.ts` |
| **Modify** | `archibald-web-app/frontend/src/pages/ProductDetailPage.tsx` |

---

## Task 0: Operation handler `re-extract-pictograms` — correzione qualità dati DB

**Contesto:**
- Handler pattern: come `catalog-ingestion`, usa `CatalogPdfService` + `callSonnet` (Anthropic API)
- Registrazione in `archibald-web-app/backend/src/main.ts` nel blocco `handlers` (condizionale su `anthropicApiKey`)
- Export da `archibald-web-app/backend/src/operations/handlers/index.ts`
- `catalog_entries.catalog_page` contiene il numero di pagina PDF per ogni famiglia
- Costo stimato: ~$0.004/pagina × ~810 famiglie incomplete = ~$3.24

**Files:**
- Create: `archibald-web-app/backend/src/operations/handlers/re-extract-pictograms.ts`
- Create: `archibald-web-app/backend/src/operations/handlers/re-extract-pictograms.spec.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/index.ts`
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Scrivi i test failing**

```typescript
// archibald-web-app/backend/src/operations/handlers/re-extract-pictograms.spec.ts
import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import { createReExtractPictogramsHandler } from './re-extract-pictograms';

function makePool(rows: object[]): DbPool {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] })
      .mockResolvedValue({ rows: [], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] }),
    end: vi.fn(),
  } as unknown as DbPool;
}

const mockCatalogPdf = {
  getPageAsBase64: vi.fn().mockResolvedValue('base64imagepng'),
};

describe('createReExtractPictogramsHandler', () => {
  test('aggiorna i pittogrammi quando Claude restituisce un array valido', async () => {
    const callSonnet = vi.fn().mockResolvedValue(
      '[{"symbol":"cavity_tooth","meaning":"Cavity preparation"},{"symbol":"consult_instructions","meaning":"Consult IFU"}]',
    );
    const pool = makePool([{ id: 1, catalog_page: 161, family_codes: ['H1.314'] }]);
    const handler = createReExtractPictogramsHandler({ pool, catalogPdf: mockCatalogPdf, callSonnet });

    const result = await handler({} as any, {}, 'admin', vi.fn());

    expect(result.updated).toBe(1);
    expect(pool.query).toHaveBeenCalledTimes(2); // SELECT + UPDATE
  });

  test('salta le entry quando Claude restituisce [] (nessun pittogramma visibile)', async () => {
    const callSonnet = vi.fn().mockResolvedValue('[]');
    const pool = makePool([{ id: 2, catalog_page: 161, family_codes: ['H21R.314'] }]);
    const handler = createReExtractPictogramsHandler({ pool, catalogPdf: mockCatalogPdf, callSonnet });

    const result = await handler({} as any, {}, 'admin', vi.fn());

    // UPDATE non viene chiamato se l'array è vuoto (dati invariati)
    expect(result.updated).toBe(0);
  });

  test('salta le entry con catalog_page null o zero', async () => {
    const callSonnet = vi.fn();
    const pool = makePool([{ id: 3, catalog_page: null, family_codes: ['ACCESSORY'] }]);
    const handler = createReExtractPictogramsHandler({ pool, catalogPdf: mockCatalogPdf, callSonnet });

    const result = await handler({} as any, {}, 'admin', vi.fn());

    expect(callSonnet).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
  });

  test('continua elaborazione in caso di errore Sonnet su una singola entry', async () => {
    const callSonnet = vi.fn()
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce('[{"symbol":"crown_prep","meaning":"Crown preparation"}]');
    const rows = [
      { id: 10, catalog_page: 163, family_codes: ['H7'] },
      { id: 11, catalog_page: 204, family_codes: ['801', '8801'] },
    ];
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows, rowCount: 2, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValue({ rows: [], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] }),
      end: vi.fn(),
    } as unknown as DbPool;
    const handler = createReExtractPictogramsHandler({ pool, catalogPdf: mockCatalogPdf, callSonnet });

    const result = await handler({} as any, {}, 'admin', vi.fn());

    expect(result.updated).toBe(1); // solo la seconda entry
    expect(result.errors).toBe(1);
  });
});
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/re-extract-pictograms.spec.ts
```
Atteso: FAIL — `Cannot find module './re-extract-pictograms'`

- [ ] **Step 3: Implementa il handler**

```typescript
// archibald-web-app/backend/src/operations/handlers/re-extract-pictograms.ts
import type { DbPool } from '../../db/pool';
import type { CatalogPdfService } from '../../services/catalog-pdf-service';
import type { OperationHandler } from '../operation-processor';
import { logger } from '../../logger';

type SonnetFn = (
  images: Array<{ base64: string; mediaType: 'image/png' }>,
  prompt: string,
) => Promise<string>;

type ReExtractPictogramsDeps = {
  pool:        DbPool;
  catalogPdf:  CatalogPdfService;
  callSonnet:  SonnetFn;
};

type CatalogRow = {
  id:           number;
  catalog_page: number | null;
  family_codes: string[];
};

type Pictogram = { symbol: string; meaning: string };

const INTER_ENTRY_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePictograms(raw: string): Pictogram[] | null {
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? (parsed as Pictogram[]) : null;
  } catch {
    return null;
  }
}

function buildPrompt(familyCodes: string[]): string {
  const family = familyCodes[0] ?? 'unknown';
  return `This is a page from the Komet 2025 dental instrument catalog.
Find the product family "${family}" (family codes: ${familyCodes.join(', ')}) on this page.

Look CAREFULLY at the small pictogram/symbol icons printed near the product entry (usually in the top-left corner of the product block, before the product name and size table).

List ALL pictogram icons you can see for this product family. Common Komet pictograms include: tooth with cavity, crown, autoclave, single-use symbol, consult-IFU book, max speed, recommended speed, implant, orthodontics, etc.

Return ONLY a valid JSON array (no markdown, no extra text):
[{"symbol": "snake_case_symbol_name", "meaning": "English description of what the symbol represents"}]

If you cannot find any pictogram icons for this family, return exactly: []`;
}

function createReExtractPictogramsHandler(deps: ReExtractPictogramsDeps): OperationHandler {
  return async (_context, data, _userId, onProgress) => {
    const { pool, catalogPdf, callSonnet } = deps;
    const forceAll = data.forceAll === true;

    const whereClause = forceAll
      ? 'WHERE catalog_page IS NOT NULL AND catalog_page > 0'
      : 'WHERE catalog_page IS NOT NULL AND catalog_page > 0 AND (pictograms IS NULL OR jsonb_array_length(pictograms) < 2)';

    const { rows } = await pool.query<CatalogRow>(
      `SELECT id, catalog_page, family_codes FROM shared.catalog_entries ${whereClause} ORDER BY catalog_page`,
    );

    let updated = 0;
    let errors  = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.catalog_page) continue;

      try {
        const base64 = await catalogPdf.getPageAsBase64(row.catalog_page);
        const prompt = buildPrompt(row.family_codes);
        const raw    = await callSonnet([{ base64, mediaType: 'image/png' }], prompt);
        const pictos = parsePictograms(raw);

        if (pictos && pictos.length > 0) {
          await pool.query(
            `UPDATE shared.catalog_entries SET pictograms = $1::jsonb, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(pictos), row.id],
          );
          updated++;
        }
      } catch (err) {
        errors++;
        logger.warn('[re-extract-pictograms] Failed to process entry', {
          id: row.id, family_codes: row.family_codes, err,
        });
      }

      if (i % 20 === 0 && i > 0) {
        onProgress(Math.round((i / rows.length) * 100), `${i}/${rows.length} famiglie elaborate`);
      }
      await delay(INTER_ENTRY_DELAY_MS);
    }

    onProgress(100, 'Completato');
    return { total: rows.length, updated, errors };
  };
}

export { createReExtractPictogramsHandler, type ReExtractPictogramsDeps };
```

- [ ] **Step 4: Verifica che i test passino**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/re-extract-pictograms.spec.ts
```
Atteso: 4 test PASS

- [ ] **Step 5: Esporta da `index.ts`**

In `archibald-web-app/backend/src/operations/handlers/index.ts`, aggiungi:
```typescript
export { createReExtractPictogramsHandler } from './re-extract-pictograms';
```

- [ ] **Step 6: Registra in `main.ts`**

Trova il blocco `...(config.recognition.anthropicApiKey && anthropicCatalogClient ? {` in `main.ts` (linea ~1134) e aggiungi dopo `'web-product-enrichment': ...`:

```typescript
      're-extract-pictograms': createReExtractPictogramsHandler({
        pool,
        catalogPdf,
        callSonnet: async (images, prompt) => {
          const response = await anthropicCatalogClient.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            messages: [
              {
                role: 'user',
                content: [
                  ...images.map(img => ({
                    type: 'image' as const,
                    source: { type: 'base64' as const, media_type: img.mediaType, data: img.base64 },
                  })),
                  { type: 'text' as const, text: prompt },
                ],
              },
            ],
          });
          const content = response.content[0];
          return content?.type === 'text' ? content.text : '[]';
        },
      }),
```

Aggiungi anche l'import in cima a `main.ts`:
```typescript
import { createReExtractPictogramsHandler } from './operations/handlers/re-extract-pictograms';
```
(oppure aggiornare l'import esistente da `'./operations/handlers'` se già presente)

- [ ] **Step 7: Build TypeScript backend**

```bash
cd archibald-web-app/backend && npm run build
```
Atteso: nessun errore

- [ ] **Step 8: Test suite completa backend**

```bash
cd archibald-web-app/backend && npm test -- --run
```
Atteso: tutti passano

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/re-extract-pictograms.ts \
        archibald-web-app/backend/src/operations/handlers/re-extract-pictograms.spec.ts \
        archibald-web-app/backend/src/operations/handlers/index.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(catalog): add re-extract-pictograms operation handler for pictogram data quality fix"
```

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
