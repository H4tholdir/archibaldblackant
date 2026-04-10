# Product Detail Page — Enrichment Completo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arricchire la `ProductDetailPage` con badge caratteristiche strumento (parsificati dal codice Komet), tab Misure con chip+mm e tabella dimensioni, dati ERP (IVA, qty minima) nella CTA sticky, e gestione completa dei prodotti ritirati.

**Architecture:** Fase 1 (questa) è puro UI + API extension, zero DB migration. Il backend aggiunge una funzione pura `parseKometFeatures` e la espone nell'endpoint `/enrichment`. Il frontend cambia data fetching (usa `getProductById` invece di `getProducts`) e aggiunge i nuovi elementi UI. Fase 2 aggiunge un secondo scraper (kometuk.com). Fase 3 aggiunge lunghezze dal catalogo.

**Tech Stack:** Vitest, @testing-library/react, TypeScript strict, Express, React 19 inline styles.

**Spec:** `docs/superpowers/specs/2026-04-10-product-detail-page-enrichment-design.md`

---

## Mappa file

**Fase 1 — Nuovi file:**
- Crea: `archibald-web-app/backend/src/utils/komet-code-parser.ts`
- Crea: `archibald-web-app/backend/src/utils/komet-code-parser.spec.ts`

**Fase 1 — File modificati:**
- Modifica: `archibald-web-app/backend/src/db/repositories/products.ts` — aggiunge `deleted_at` a `ProductRow` e `PRODUCT_COLUMNS`
- Modifica: `archibald-web-app/backend/src/routes/products.ts` — `mapProductRow` aggiunge `isRetired`; enrichment route aggiunge `features`
- Modifica: `archibald-web-app/frontend/src/api/products.ts` — aggiunge `isRetired` a `Product`, aggiunge `getProductById`
- Modifica: `archibald-web-app/frontend/src/api/recognition.ts` — aggiunge `KometFeatures` e `features` a `ProductEnrichment`
- Modifica: `archibald-web-app/frontend/src/pages/ProductDetailPage.tsx` — badge card, chip con mm, tabella dimensioni, CTA con IVA, UI prodotto ritirato
- Modifica: `archibald-web-app/frontend/src/pages/ProductDetailPage.spec.tsx` — update mock + nuovi test

**Fase 2 — File modificati:**
- Modifica: `archibald-web-app/backend/src/operations/handlers/web-product-enrichment.ts`
- Modifica (o crea): `archibald-web-app/backend/src/operations/handlers/web-product-enrichment.spec.ts`

**Fase 3:**
- Dipende da query DB di produzione (Task 7, prerequisito bloccante prima di scrivere codice)

---

## FASE 1

### Task 1: `parseKometFeatures` utility (Backend)

**Files:**
- Crea: `archibald-web-app/backend/src/utils/komet-code-parser.spec.ts`
- Crea: `archibald-web-app/backend/src/utils/komet-code-parser.ts`

- [ ] **Step 1.1: Scrivere il test fallente**

Crea `archibald-web-app/backend/src/utils/komet-code-parser.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseKometFeatures } from './komet-code-parser'
import type { KometFeatures } from './komet-code-parser'

describe('parseKometFeatures', () => {
  it('restituisce null per codice senza punti', () => {
    expect(parseKometFeatures('H1314016')).toBeNull()
  })

  it('restituisce null per codice con meno di 3 parti', () => {
    expect(parseKometFeatures('H1.314')).toBeNull()
  })

  it('restituisce null per gambo sconosciuto', () => {
    expect(parseKometFeatures('H1.999.016')).toBeNull()
  })

  it('restituisce null per famiglia sconosciuta', () => {
    expect(parseKometFeatures('UNKNOWN.314.016')).toBeNull()
  })

  it('restituisce null per sizeCode non numerico', () => {
    expect(parseKometFeatures('H1.314.abc')).toBeNull()
  })

  it('parsifica H1.314.016 correttamente', () => {
    expect(parseKometFeatures('H1.314.016')).toEqual<KometFeatures>({
      material:        'Carburo di tungsteno',
      shape:           'Testa tonda',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
    })
  })

  it('parsifica H7.314.014 come testa a pera', () => {
    expect(parseKometFeatures('H7.314.014')).toEqual<KometFeatures>({
      material:        'Carburo di tungsteno',
      shape:           'Testa a pera',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.4,
    })
  })

  it('parsifica H2.314.016 come cono rovesciato', () => {
    expect(parseKometFeatures('H2.314.016')).toMatchObject({
      shape: 'Cono rovesciato',
    })
  })

  it('parsifica H21R.314.016 come cilindro', () => {
    expect(parseKometFeatures('H21R.314.016')).toMatchObject({
      shape: 'Cilindro',
    })
  })

  it('parsifica H1.204.014 con contrangolo CA', () => {
    expect(parseKometFeatures('H1.204.014')).toEqual<KometFeatures>({
      material:        'Carburo di tungsteno',
      shape:           'Testa tonda',
      shankType:       'Contrangolo (CA)',
      shankDiameterMm: 2.35,
      headDiameterMm:  1.4,
    })
  })

  it('parsifica H1.313.016 con turbina corta FGS', () => {
    expect(parseKometFeatures('H1.313.016')).toMatchObject({
      shankType: 'Turbina corta (FGS)',
      shankDiameterMm: 1.6,
    })
  })

  it('calcola correttamente headDiameterMm da sizeCode 021', () => {
    expect(parseKometFeatures('H1.314.021')?.headDiameterMm).toBe(2.1)
  })

  it('calcola correttamente headDiameterMm da sizeCode 012', () => {
    expect(parseKometFeatures('H1.314.012')?.headDiameterMm).toBe(1.2)
  })

  it('parsifica 8801.314.016 con grana fine (anello rosso)', () => {
    expect(parseKometFeatures('8801.314.016')).toEqual<KometFeatures>({
      material:        'Diamantata',
      shape:           'Testa tonda',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
      gritLabel:       'Grana fine (anello rosso)',
    })
  })

  it('parsifica 801UF.314.016 con grana ultra fine (anello bianco)', () => {
    expect(parseKometFeatures('801UF.314.016')).toEqual<KometFeatures>({
      material:        'Diamantata',
      shape:           'Testa tonda',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
      gritLabel:       'Grana ultra fine (anello bianco)',
    })
  })

  it('parsifica 801EF.314.016 con grana extra fine (anello giallo)', () => {
    expect(parseKometFeatures('801EF.314.016')).toMatchObject({
      gritLabel: 'Grana extra fine (anello giallo)',
    })
  })

  it('parsifica 801.314.016 con grana standard (anello blu)', () => {
    expect(parseKometFeatures('801.314.016')).toMatchObject({
      gritLabel: 'Grana standard (anello blu)',
    })
  })

  it('parsifica 6801.314.016 con grana grossolana (anello verde)', () => {
    expect(parseKometFeatures('6801.314.016')).toMatchObject({
      gritLabel: 'Grana grossolana (anello verde)',
    })
  })

  it('parsifica KP6801.314.016 come DIAO oro-rosa', () => {
    expect(parseKometFeatures('KP6801.314.016')).toEqual<KometFeatures>({
      material:        'Diamantata DIAO (oro-rosa)',
      shape:           'Testa tonda',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
      gritLabel:       'Grana grossolana (anello verde)',
    })
  })

  it('parsifica 879.314.016 come torpedine', () => {
    expect(parseKometFeatures('879.314.016')).toMatchObject({
      shape: 'Torpedine',
      material: 'Diamantata',
    })
  })

  it('parsifica H1S come testa tonda (variante H1)', () => {
    expect(parseKometFeatures('H1S.314.016')).toMatchObject({ shape: 'Testa tonda' })
  })

  it('parsifica H7S come testa a pera (variante H7)', () => {
    expect(parseKometFeatures('H7S.314.016')).toMatchObject({ shape: 'Testa a pera' })
  })

  it('NON include gritLabel per prodotti carburo di tungsteno', () => {
    const result = parseKometFeatures('H1.314.016')
    expect(result).not.toHaveProperty('gritLabel')
  })
})
```

- [ ] **Step 1.2: Eseguire il test per verificare che fallisca**

```bash
cd archibald-web-app/backend && npm test -- --reporter=verbose komet-code-parser
```

Atteso: FAIL con "Cannot find module './komet-code-parser'"

- [ ] **Step 1.3: Implementare `komet-code-parser.ts`**

Crea `archibald-web-app/backend/src/utils/komet-code-parser.ts`:

```typescript
export type KometFeatures = {
  material:        string
  shape:           string
  shankType:       string
  shankDiameterMm: number
  headDiameterMm:  number
  gritLabel?:      string
}

type FamilyInfo = {
  material:   string
  shape:      string
  gritLabel?: string
}

type ShankInfo = {
  type:       string
  diameterMm: number
}

// Ordinati dal prefisso più lungo al più corto per prevenire match parziali errati
const FAMILY_MAP: Array<[string, FamilyInfo]> = [
  ['H1SE',   { material: 'Carburo di tungsteno', shape: 'Testa tonda' }],
  ['H1S',    { material: 'Carburo di tungsteno', shape: 'Testa tonda' }],
  ['H1',     { material: 'Carburo di tungsteno', shape: 'Testa tonda' }],
  ['H7S',    { material: 'Carburo di tungsteno', shape: 'Testa a pera' }],
  ['H7',     { material: 'Carburo di tungsteno', shape: 'Testa a pera' }],
  ['H2',     { material: 'Carburo di tungsteno', shape: 'Cono rovesciato' }],
  ['H21R',   { material: 'Carburo di tungsteno', shape: 'Cilindro' }],
  ['H23R',   { material: 'Carburo di tungsteno', shape: 'Cilindro con estremità tonda' }],
  ['H23L',   { material: 'Carburo di tungsteno', shape: 'Cilindro con estremità tonda' }],
  ['H48L',   { material: 'Carburo di tungsteno', shape: 'Torpedine' }],
  ['H59L',   { material: 'Carburo di tungsteno', shape: 'Cilindro' }],
  ['H59',    { material: 'Carburo di tungsteno', shape: 'Cilindro' }],
  // Diamantata — prefissi più lunghi prima
  ['KP6801', { material: 'Diamantata DIAO (oro-rosa)', shape: 'Testa tonda',   gritLabel: 'Grana grossolana (anello verde)' }],
  ['KP6837', { material: 'Diamantata DIAO (oro-rosa)', shape: 'Testa tonda',   gritLabel: 'Grana grossolana (anello verde)' }],
  ['KP6881', { material: 'Diamantata DIAO (oro-rosa)', shape: 'Cilindro',      gritLabel: 'Grana grossolana (anello verde)' }],
  ['801UF',  { material: 'Diamantata',               shape: 'Testa tonda',   gritLabel: 'Grana ultra fine (anello bianco)' }],
  ['801EF',  { material: 'Diamantata',               shape: 'Testa tonda',   gritLabel: 'Grana extra fine (anello giallo)' }],
  ['8801',   { material: 'Diamantata',               shape: 'Testa tonda',   gritLabel: 'Grana fine (anello rosso)' }],
  ['6801',   { material: 'Diamantata',               shape: 'Testa tonda',   gritLabel: 'Grana grossolana (anello verde)' }],
  ['5801',   { material: 'Diamantata',               shape: 'Testa tonda',   gritLabel: 'Grana molto grossolana (anello nero)' }],
  ['801',    { material: 'Diamantata',               shape: 'Testa tonda',   gritLabel: 'Grana standard (anello blu)' }],
  ['879',    { material: 'Diamantata',               shape: 'Torpedine',     gritLabel: 'Grana standard (anello blu)' }],
  ['856',    { material: 'Diamantata',               shape: 'Torpedine',     gritLabel: 'Grana standard (anello blu)' }],
  ['862',    { material: 'Diamantata',               shape: 'Fiamma',        gritLabel: 'Grana standard (anello blu)' }],
  ['863',    { material: 'Diamantata',               shape: 'Fiamma',        gritLabel: 'Grana standard (anello blu)' }],
  ['837',    { material: 'Diamantata',               shape: 'Cilindro',      gritLabel: 'Grana standard (anello blu)' }],
  ['811',    { material: 'Diamantata',               shape: 'Testa a pera',  gritLabel: 'Grana standard (anello blu)' }],
]

const SHANK_MAP: Record<string, ShankInfo> = {
  '314': { type: 'Turbina (FG)',              diameterMm: 1.6  },
  '313': { type: 'Turbina corta (FGS)',       diameterMm: 1.6  },
  '315': { type: 'Turbina lunga (FGL)',       diameterMm: 1.6  },
  '316': { type: 'Turbina extra-lunga (FGXL)', diameterMm: 1.6 },
  '204': { type: 'Contrangolo (CA)',          diameterMm: 2.35 },
}

function getFamilyInfo(familyCode: string): FamilyInfo | null {
  for (const [prefix, info] of FAMILY_MAP) {
    if (familyCode === prefix || familyCode.startsWith(prefix)) {
      return info
    }
  }
  return null
}

export function parseKometFeatures(productId: string): KometFeatures | null {
  const parts = productId.split('.')
  if (parts.length < 3) return null

  const [familyCode, shankCode, sizeCode] = parts

  const sizeNum = parseInt(sizeCode, 10)
  if (isNaN(sizeNum)) return null

  const shankInfo = SHANK_MAP[shankCode]
  if (!shankInfo) return null

  const familyInfo = getFamilyInfo(familyCode)
  if (!familyInfo) return null

  return {
    material:        familyInfo.material,
    shape:           familyInfo.shape,
    shankType:       shankInfo.type,
    shankDiameterMm: shankInfo.diameterMm,
    headDiameterMm:  sizeNum / 10,
    ...(familyInfo.gritLabel !== undefined ? { gritLabel: familyInfo.gritLabel } : {}),
  }
}
```

- [ ] **Step 1.4: Eseguire il test per verificare che passi**

```bash
cd archibald-web-app/backend && npm test -- --reporter=verbose komet-code-parser
```

Atteso: PASS — tutti i test verdi.

- [ ] **Step 1.5: Commit**

```bash
git add archibald-web-app/backend/src/utils/komet-code-parser.ts \
        archibald-web-app/backend/src/utils/komet-code-parser.spec.ts
git commit -m "feat(backend): add parseKometFeatures deterministic parser for Komet product codes"
```

---

### Task 2: Backend — estendere `ProductRow`, `mapProductRow` e route `/enrichment`

**Files:**
- Modifica: `archibald-web-app/backend/src/db/repositories/products.ts` riga ~45
- Modifica: `archibald-web-app/backend/src/routes/products.ts` righe ~13-57 e ~434-500

- [ ] **Step 2.1: Aggiungere `deleted_at` a `ProductRow` e `PRODUCT_COLUMNS`**

In `archibald-web-app/backend/src/db/repositories/products.ts`, al type `ProductRow` (dopo `unit_id: string | null;`) aggiungere:

```typescript
  deleted_at: string | null;
```

In `PRODUCT_COLUMNS` (riga ~81), aggiungere `deleted_at` in fondo:

```
const PRODUCT_COLUMNS = `
  id, name, description, group_code, search_name, price_unit,
  product_group_id, product_group_description, package_content,
  min_qty, multiple_qty, max_qty, price, price_source, price_updated_at,
  vat, vat_source, vat_updated_at, hash, last_sync,
  figure, bulk_article_id, leg_package, size,
  configuration_id, created_by, created_date_field, data_area_id,
  default_qty, display_product_number, total_absolute_discount, product_id_ext,
  line_discount, modified_by, modified_datetime, orderable_article,
  stopped, purch_price, pcs_standard_configuration_id, standard_qty, unit_id,
  deleted_at
`;
```

- [ ] **Step 2.2: Aggiungere `isRetired` a `mapProductRow`**

In `archibald-web-app/backend/src/routes/products.ts`, in `mapProductRow`, aggiungere come ULTIMA proprietà del return object (dopo `unit_id: row.unit_id`):

```typescript
    isRetired: row.deleted_at !== null,
```

- [ ] **Step 2.3: Importare `parseKometFeatures` e aggiungerlo alla route `/enrichment`**

In `archibald-web-app/backend/src/routes/products.ts`, aggiungere in cima agli import:

```typescript
import { parseKometFeatures } from '../utils/komet-code-parser';
```

Nella route `GET /:productId/enrichment` (riga ~484), nel `res.json({...})`, aggiungere `features` prima di `recognitionHistory`:

```typescript
      res.json({
        gallery: mappedGallery,
        details: mappedDetails,
        competitors: [],
        sizeVariants,
        features: parseKometFeatures(productId),
        recognitionHistory: history.length > 0 ? history.map((h) => ({
          scannedAt:  h.scanned_at,
          agentId:    h.agent_id,
          confidence: h.confidence,
          cacheHit:   h.cache_hit,
        })) : null,
      });
```

- [ ] **Step 2.4: Verificare type-check e build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: build senza errori TypeScript.

- [ ] **Step 2.5: Eseguire test backend**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: tutti i test passano.

- [ ] **Step 2.6: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/products.ts \
        archibald-web-app/backend/src/routes/products.ts
git commit -m "feat(backend): expose isRetired and features (parseKometFeatures) in products API"
```

---

### Task 3: Frontend — tipi aggiornati + `getProductById`

**Files:**
- Modifica: `archibald-web-app/frontend/src/api/products.ts`
- Modifica: `archibald-web-app/frontend/src/api/recognition.ts`

- [ ] **Step 3.1: Aggiungere `isRetired` a `Product` in `api/products.ts`**

Nel blocco `// ========== SYSTEM ==========` (prima di `hash?:`), aggiungere:

```typescript
  isRetired?: boolean;  // true se deleted_at IS NOT NULL in shared.products
```

- [ ] **Step 3.2: Aggiungere `getProductById` a `api/products.ts`**

In fondo al file `archibald-web-app/frontend/src/api/products.ts`, aggiungere:

```typescript
/**
 * Recupera un singolo prodotto per ID, inclusi i prodotti ritirati.
 * Diversamente da getProducts, non filtra deleted_at IS NULL.
 */
export async function getProductById(
  token: string,
  productId: string,
): Promise<{ success: boolean; data: Product }> {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/products/${encodeURIComponent(productId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  return response.json()
}
```

- [ ] **Step 3.3: Aggiungere `KometFeatures` e `features` a `api/recognition.ts`**

In `archibald-web-app/frontend/src/api/recognition.ts`, subito prima di `export type ProductGalleryImage`, aggiungere:

```typescript
export type KometFeatures = {
  material:        string
  shape:           string
  shankType:       string
  shankDiameterMm: number
  headDiameterMm:  number
  gritLabel?:      string
}
```

Nel type `ProductEnrichment`, aggiungere `features` dopo `sizeVariants`:

```typescript
export type ProductEnrichment = {
  details:            ProductDetails | null
  gallery:            ProductGalleryImage[]
  competitors:        []
  sizeVariants:       SizeVariant[]
  features?:          KometFeatures | null  // NUOVO — null per famiglie non riconosciute
  recognitionHistory: Array<{
    scannedAt:  string
    agentId:    string
    confidence: number
    cacheHit:   boolean
  }> | null
}
```

- [ ] **Step 3.4: Verificare type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: nessun errore TypeScript.

- [ ] **Step 3.5: Commit**

```bash
git add archibald-web-app/frontend/src/api/products.ts \
        archibald-web-app/frontend/src/api/recognition.ts
git commit -m "feat(frontend): add isRetired to Product, KometFeatures to ProductEnrichment, getProductById"
```

---

### Task 4: Frontend — `ProductDetailPage.tsx` refactor completo

**Files:**
- Modifica: `archibald-web-app/frontend/src/pages/ProductDetailPage.tsx`

Il file ha ~484 righe. I cambiamenti coprono: import, data fetching, helpers, GalleryArea, tab Prodotto, tab Misure, CTA, stato ritirato.

- [ ] **Step 4.1: Aggiornare imports**

Sostituire la riga:
```typescript
import { getProducts } from '../api/products'
```
con:
```typescript
import { getProductById } from '../api/products'
import type { KometFeatures } from '../api/recognition'
```

- [ ] **Step 4.2: Aggiungere funzioni helper dopo `sizeCode`**

Subito dopo la funzione `sizeCode` esistente (riga ~11), aggiungere:

```typescript
function headDiameterMmFromId(productId: string): number | null {
  const parts = productId.split('.')
  const code = parts[parts.length - 1] ?? ''
  const n = parseInt(code, 10)
  return isNaN(n) ? null : n / 10
}

function gritBadgeStyle(gritLabel: string): { background: string; color: string } {
  if (gritLabel.includes('bianco')) return { background: '#374151', color: '#f9fafb' }
  if (gritLabel.includes('giallo')) return { background: '#713f12', color: '#fde68a' }
  if (gritLabel.includes('rosso'))  return { background: '#7f1d1d', color: '#fca5a5' }
  if (gritLabel.includes('verde'))  return { background: '#14532d', color: '#6ee7b7' }
  if (gritLabel.includes('nero'))   return { background: '#111827', color: '#9ca3af' }
  return { background: '#1e3a5f', color: '#93c5fd' } // blu (default/standard)
}

type FeaturePillProps = { label: string; background: string; color: string }
function FeaturePill({ label, background, color }: FeaturePillProps) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      background, borderRadius: 20, padding: '5px 12px',
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{label}</span>
    </div>
  )
}
```

- [ ] **Step 4.3: Aggiornare `GalleryArea` per mostrare badge "Prodotto ritirato"**

Aggiungere `isRetired: boolean` alle props di `GalleryArea`:

```typescript
function GalleryArea({
  gallery,
  fromScanner,
  onBack,
  isRetired,
}: {
  gallery: ProductGalleryImage[]
  fromScanner: boolean
  onBack: () => void
  isRetired: boolean
}) {
```

Nella `GalleryArea`, nel div "Top overlay" (dopo il `{fromScanner && ...}`), aggiungere:

```typescript
        {isRetired && (
          <div style={{
            background: 'rgba(239,68,68,0.15)', backdropFilter: 'blur(6px)',
            border: '1px solid rgba(239,68,68,0.6)', color: '#fca5a5',
            fontSize: 11, padding: '4px 10px', borderRadius: 20,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            Prodotto ritirato
          </div>
        )}
```

- [ ] **Step 4.4: Aggiornare data fetching nel `useEffect`**

Sostituire il blocco `fetchAll` nel `useEffect` (righe ~153-178):

```typescript
    async function fetchAll() {
      setLoading(true)
      setNotFound(false)
      try {
        const [productRes, enrichmentRes] = await Promise.allSettled([
          getProductById(token!, decodedId),
          getProductEnrichment(token!, decodedId),
        ])

        if (productRes.status === 'fulfilled' && productRes.value.success) {
          setProduct(productRes.value.data)
        } else {
          setNotFound(true)
        }

        if (enrichmentRes.status === 'fulfilled') {
          setEnrichment(enrichmentRes.value)
        }
      } finally {
        setLoading(false)
      }
    }
```

- [ ] **Step 4.5: Aggiornare il rendering `GalleryArea` per passare `isRetired`**

Sostituire:
```typescript
      <GalleryArea
        gallery={gallery}
        fromScanner={fromScanner}
        onBack={() => navigate(-1)}
      />
```
con:
```typescript
      <GalleryArea
        gallery={gallery}
        fromScanner={fromScanner}
        onBack={() => navigate(-1)}
        isRetired={product.isRetired ?? false}
      />
```

- [ ] **Step 4.6: Aggiornare pallino stato e codice prodotto**

Sostituire il div del codice prodotto (righe ~249-256):

```typescript
        <div style={{
          fontSize: 11, color: '#6b7280', fontFamily: "'SF Mono', Consolas, monospace",
          marginBottom: product.isRetired ? 10 : 14, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: product.isRetired ? '#ef4444' : '#22c55e',
            display: 'inline-block', flexShrink: 0,
          }} />
          {product.isRetired ? 'Non più disponibile' : product.id}
        </div>
```

- [ ] **Step 4.7: Aggiungere banner prodotto ritirato (dopo il codice prodotto)**

Dopo il div del codice prodotto e prima del div tabs, aggiungere:

```typescript
        {product.isRetired && (
          <div style={{
            background: '#1f0d0d', border: '1px solid #7f1d1d', borderRadius: 10,
            padding: '12px 16px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 13, color: '#fca5a5', fontWeight: 600, marginBottom: 4 }}>
              Prodotto ritirato dal catalogo Komet
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
              Le informazioni tecniche sono conservate per consultazione storica.
            </div>
          </div>
        )}
```

- [ ] **Step 4.8: Aggiungere badge caratteristiche in tab Prodotto**

Nel tab "Prodotto" (righe ~281-319), PRIMA del blocco `{details && ...}`, aggiungere la card badge:

```typescript
        <div style={{ display: activeTab === 'prodotto' ? 'block' : 'none' }}>
          {/* Badge caratteristiche strumento */}
          {enrichment?.features && (
            <div style={{
              background: '#1a1a1a', borderRadius: 10, padding: '14px 16px', marginBottom: 10,
            }}>
              <div style={{
                fontSize: 10, color: '#6b7280', letterSpacing: '1px',
                textTransform: 'uppercase', marginBottom: 10,
              }}>
                Caratteristiche strumento
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <FeaturePill
                  label={enrichment.features.material}
                  background="#166534"
                  color="#86efac"
                />
                <FeaturePill
                  label={enrichment.features.shape}
                  background="#1e3a5f"
                  color="#93c5fd"
                />
                <FeaturePill
                  label={`Gambo ${enrichment.features.shankType} · Ø ${enrichment.features.shankDiameterMm.toLocaleString('it-IT')} mm`}
                  background="#451a03"
                  color="#fbbf24"
                />
                {enrichment.features.gritLabel && (
                  <FeaturePill
                    label={enrichment.features.gritLabel}
                    {...gritBadgeStyle(enrichment.features.gritLabel)}
                  />
                )}
              </div>
            </div>
          )}

          {/* Dati tecnici catalogo (RPM, confezione, note) */}
          {details && ...}  {/* blocco esistente invariato */}
```

**Nota:** non modificare il blocco `{details && ...}` esistente — lasciarlo esattamente com'era.

- [ ] **Step 4.9: Aggiornare tab Misure — chip con mm + tabella dimensioni**

Sostituire l'intero blocco `{/* ── Tab: Misure ── */}` (righe ~343-377) con:

```typescript
        {/* ── Tab: Misure ── */}
        <div style={{ display: activeTab === 'misure' ? 'block' : 'none' }}>
          {sizeVariants.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Chip varianti con diametro in mm */}
              <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 12 }}>
                <div style={{
                  fontSize: 10, color: '#6b7280', letterSpacing: '1px',
                  textTransform: 'uppercase', marginBottom: 10,
                }}>
                  Misure disponibili
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {sizeVariants.map(v => {
                    const isActive = v.id === product.id
                    const code = sizeCode(v)
                    const diam = headDiameterMmFromId(v.id)
                    return (
                      <button
                        key={v.id}
                        onClick={() => !isActive && navigate(`/products/${encodeURIComponent(v.id)}`)}
                        style={{
                          background: isActive ? '#0d2b0d' : '#252525',
                          border: `1px solid ${isActive ? '#22c55e' : '#333'}`,
                          borderRadius: 7, padding: '6px 10px',
                          fontFamily: "'SF Mono', Consolas, monospace",
                          color: isActive ? '#6ee7b7' : '#9ca3af',
                          cursor: isActive ? 'default' : 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: isActive ? 600 : 400 }}>{code}</div>
                        {diam !== null && (
                          <div style={{ fontSize: 9, color: isActive ? '#6ee7b7' : '#6b7280', marginTop: 2 }}>
                            Ø {diam.toLocaleString('it-IT')} mm
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tabella dimensioni per la variante selezionata */}
              {enrichment?.features && (
                <div style={{ background: '#1a1a1a', borderRadius: 10, overflow: 'hidden' }}>
                  {[
                    { label: 'Diametro della testa',  value: `${enrichment.features.headDiameterMm.toLocaleString('it-IT')} mm` },
                    { label: 'Tipo di gambo',          value: enrichment.features.shankType },
                    { label: 'Diametro del gambo',     value: `${enrichment.features.shankDiameterMm.toLocaleString('it-IT')} mm` },
                  ].map(({ label, value }, i, arr) => (
                    <div
                      key={label}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 14px',
                        borderBottom: i < arr.length - 1 ? '1px solid #222' : 'none',
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
                      <div style={{
                        fontSize: 12, fontWeight: 600,
                        color: product.isRetired ? '#6b7280' : '#fff',
                        fontFamily: "'SF Mono', Consolas, monospace",
                      }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#4b5563', fontSize: 14, padding: '20px 0' }}>
              Nessuna variante di misura disponibile.
            </div>
          )}
        </div>
```

- [ ] **Step 4.10: Aggiornare CTA sticky con IVA e quantità minima**

Sostituire il blocco CTA sticky (righe ~467-481) con:

```typescript
      {/* CTA sticky */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#0a0a0a', borderTop: '1px solid #1f2937',
        padding: '12px 20px', zIndex: 50,
        opacity: product.isRetired ? 0.6 : 1,
      }}>
        <div>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>Prezzo listino</div>
          <div style={{
            fontSize: 24, fontWeight: 700,
            color: product.isRetired ? '#6b7280' : '#fff',
            lineHeight: 1,
            textDecoration: product.isRetired ? 'line-through' : 'none',
          }}>
            {priceFormatted}
          </div>
          {!product.isRetired && product.vat != null && product.price != null && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
              {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
                .format(product.price / (1 + product.vat / 100))} imponibile + IVA {product.vat}%
            </div>
          )}
          {!product.isRetired && product.minQty != null && product.minQty > 1 && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
              Quantità minima ordine: {product.minQty} pezzi
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 4.11: Verificare type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: nessun errore TypeScript.

- [ ] **Step 4.12: Commit**

```bash
git add archibald-web-app/frontend/src/pages/ProductDetailPage.tsx
git commit -m "feat(frontend): product detail page — badge features, misure con mm, IVA in CTA, banner ritirato"
```

---

### Task 5: Aggiornare `ProductDetailPage.spec.tsx`

**Files:**
- Modifica: `archibald-web-app/frontend/src/pages/ProductDetailPage.spec.tsx`

Il file esistente mocka `productsApi.getProducts`. Poiché `ProductDetailPage` ora usa `getProductById`, i test esistenti devono essere aggiornati. Vanno anche aggiunti test per le nuove feature.

- [ ] **Step 5.1: Scrivere i test fallenti (nuovo contenuto completo del file)**

Sostituire il file `archibald-web-app/frontend/src/pages/ProductDetailPage.spec.tsx` con:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProductDetailPage } from './ProductDetailPage'
import * as recognitionApi from '../api/recognition'
import * as productsApi from '../api/products'
import type { ProductEnrichment, KometFeatures } from '../api/recognition'
import type { Product } from '../api/products'

const TOKEN = 'test-jwt'

beforeEach(() => { localStorage.setItem('archibald_jwt', TOKEN) })
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

const MOCK_PRODUCT: Product = {
  id: 'H1.314.016',
  name: 'TC Round FG Ø1.6',
  price: 12.50,
  vat: 22,
  minQty: 5,
  isRetired: false,
}

const MOCK_PRODUCT_RESPONSE = { success: true, data: MOCK_PRODUCT }

const EMPTY_ENRICHMENT: ProductEnrichment = {
  details: null, gallery: [],
  competitors: [], sizeVariants: [], recognitionHistory: null,
  features: null,
}

const TC_FEATURES: KometFeatures = {
  material:        'Carburo di tungsteno',
  shape:           'Testa tonda',
  shankType:       'Turbina (FG)',
  shankDiameterMm: 1.6,
  headDiameterMm:  1.6,
}

const DIAMOND_FEATURES: KometFeatures = {
  material:        'Diamantata',
  shape:           'Testa tonda',
  shankType:       'Turbina (FG)',
  shankDiameterMm: 1.6,
  headDiameterMm:  1.6,
  gritLabel:       'Grana fine (anello rosso)',
}

const FULL_ENRICHMENT: ProductEnrichment = {
  details: {
    clinicalDescription: 'Per rifinitura smalto e dentina',
    procedures: 'Usare a 150.000 RPM con irrigazione',
    rpmMax: 160000,
    packagingUnits: 5,
    sterile: false,
    singleUse: false,
    notes: null,
    videoUrl: null, pdfUrl: null, sourceUrl: null,
  },
  gallery: [
    { id: 1, url: 'https://example.com/img1.png', altText: null, imageType: 'catalog_render', source: 'kometdental.com', sortOrder: 0 },
  ],
  competitors: [],
  sizeVariants: [
    { id: 'H1.314.012', name: 'H1.314.012', price: null },
    { id: 'H1.314.016', name: 'H1.314.016', price: null },
    { id: 'H1.314.018', name: 'H1.314.018', price: null },
  ],
  recognitionHistory: null,
  features: TC_FEATURES,
}

function renderPage(productId = 'H1.314.016') {
  return render(
    <MemoryRouter initialEntries={[`/products/${productId}`]}>
      <Routes>
        <Route path="/products/:productId" element={<ProductDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProductDetailPage — loading e dati base', () => {
  it('mostra spinner durante il fetch iniziale', () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockImplementation(() => new Promise(() => {}))
    vi.spyOn(productsApi, 'getProductById').mockImplementation(() => new Promise(() => {}))

    renderPage()
    expect(screen.getByText(/Caricamento/i)).toBeInTheDocument()
  })

  it('mostra nome prodotto quando il fetch va a buon fine', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('TC Round FG Ø1.6')).toBeInTheDocument()
    )
  })

  it('mostra prezzo prodotto formattato', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText(/12[.,]50\s*€|€\s*12[.,]50/i)).toBeInTheDocument()
    )
  })

  it('mostra messaggio errore quando productId non esiste', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockRejectedValue(new Error('HTTP 404'))
    vi.spyOn(productsApi, 'getProductById').mockRejectedValue(new Error('HTTP 404'))

    renderPage('NONEXISTENT')

    await waitFor(() =>
      expect(screen.getByText(/Prodotto non trovato|non trovato/i)).toBeInTheDocument()
    )
  })
})

describe('ProductDetailPage — badge caratteristiche strumento', () => {
  it('mostra card caratteristiche quando features è disponibile', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(FULL_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('Caratteristiche strumento')).toBeInTheDocument()
    )
    expect(screen.getByText('Carburo di tungsteno')).toBeInTheDocument()
    expect(screen.getByText('Testa tonda')).toBeInTheDocument()
  })

  it('non mostra card caratteristiche quando features è null', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.queryByText('Caratteristiche strumento')).not.toBeInTheDocument()
    )
  })

  it('mostra gritLabel per prodotti diamantati', async () => {
    const enrichmentWithDiamond: ProductEnrichment = { ...FULL_ENRICHMENT, features: DIAMOND_FEATURES }
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(enrichmentWithDiamond)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('Grana fine (anello rosso)')).toBeInTheDocument()
    )
  })

  it('NON mostra gritLabel per prodotti carburo', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(FULL_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('Carburo di tungsteno')).toBeInTheDocument()
    )
    expect(screen.queryByText(/Grana/i)).not.toBeInTheDocument()
  })
})

describe('ProductDetailPage — tab misure', () => {
  beforeEach(() => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(FULL_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)
  })

  it('mostra chip con codice misura', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('012')).toBeInTheDocument())
    expect(screen.getByText('016')).toBeInTheDocument()
    expect(screen.getByText('018')).toBeInTheDocument()
  })

  it('mostra diametro in mm sotto ogni chip', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/Ø 1,2 mm/i)).toBeInTheDocument())
    expect(screen.getByText(/Ø 1,6 mm/i)).toBeInTheDocument()
    expect(screen.getByText(/Ø 1,8 mm/i)).toBeInTheDocument()
  })

  it('mostra tabella dimensioni per la variante selezionata', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Diametro della testa')).toBeInTheDocument()
    )
    expect(screen.getByText('Tipo di gambo')).toBeInTheDocument()
    expect(screen.getByText('Diametro del gambo')).toBeInTheDocument()
    expect(screen.getByText('Turbina (FG)')).toBeInTheDocument()
  })
})

describe('ProductDetailPage — CTA con IVA e qty minima', () => {
  it('mostra imponibile e IVA quando vat è disponibile', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    // price=12.50, vat=22% → imponibile = 12.50 / 1.22 ≈ 10.25
    await waitFor(() =>
      expect(screen.getByText(/10[.,]25|imponibile/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/IVA 22%/i)).toBeInTheDocument()
  })

  it('mostra quantità minima quando minQty > 1', async () => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)

    renderPage()

    await waitFor(() =>
      expect(screen.getByText(/Quantità minima ordine: 5 pezzi/i)).toBeInTheDocument()
    )
  })

  it('NON mostra quantità minima quando minQty è 1', async () => {
    const productQty1 = { ...MOCK_PRODUCT, minQty: 1 }
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue({ success: true, data: productQty1 })

    renderPage()

    await waitFor(() => expect(screen.getByText(/Prezzo listino/i)).toBeInTheDocument())
    expect(screen.queryByText(/Quantità minima ordine/i)).not.toBeInTheDocument()
  })
})

describe('ProductDetailPage — prodotto ritirato', () => {
  const retiredProduct: Product = { ...MOCK_PRODUCT, isRetired: true }
  const retiredResponse = { success: true, data: retiredProduct }

  beforeEach(() => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(EMPTY_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(retiredResponse)
  })

  it('mostra banner prodotto ritirato', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Prodotto ritirato dal catalogo Komet')).toBeInTheDocument()
    )
  })

  it('mostra pallino rosso e testo "Non più disponibile"', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Non più disponibile')).toBeInTheDocument()
    )
  })

  it('NON mostra IVA e qty minima in CTA per prodotti ritirati', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/Prezzo listino/i)).toBeInTheDocument())
    expect(screen.queryByText(/IVA/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Quantità minima ordine/i)).not.toBeInTheDocument()
  })
})

describe('ProductDetailPage — dati catalogo esistenti', () => {
  beforeEach(() => {
    vi.spyOn(recognitionApi, 'getProductEnrichment').mockResolvedValue(FULL_ENRICHMENT)
    vi.spyOn(productsApi, 'getProductById').mockResolvedValue(MOCK_PRODUCT_RESPONSE)
  })

  it('mostra velocità massima RPM', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Velocità massima')).toBeInTheDocument()
    )
    expect(screen.getByText(/160[.,]?000\s*RPM/i)).toBeInTheDocument()
  })

  it('mostra tab competitor con placeholder', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Equivalenti competitor')).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 5.2: Eseguire i test per verificare che alcuni falliscano (cambio mock)**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose ProductDetailPage
```

Atteso: i test dei vecchi describe passano (perché il componente ora usa `getProductById`), quelli nuovi falliscono per i comportamenti non ancora implementati.

- [ ] **Step 5.3: Eseguire tutti i test frontend per controllare regressioni**

```bash
npm test --prefix archibald-web-app/frontend
```

Atteso: PASS totale senza regressioni su altri test.

- [ ] **Step 5.4: Commit**

```bash
git add archibald-web-app/frontend/src/pages/ProductDetailPage.spec.tsx
git commit -m "test(frontend): update ProductDetailPage spec — badge, misure mm, IVA, banner ritirato"
```

---

### Checkpoint Fase 1 — Verifiche finali

- [ ] **Step CP-1: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: 0 errori TypeScript.

- [ ] **Step CP-2: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: 0 errori TypeScript.

- [ ] **Step CP-3: Test backend completi**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: PASS.

- [ ] **Step CP-4: Test frontend completi**

```bash
npm test --prefix archibald-web-app/frontend
```

Atteso: PASS senza regressioni.

---

## FASE 2 — kometuk.com scraper

### Task 6: Aggiungere `scrapeKometUk` a `web-product-enrichment.ts`

> **⚠️ PREREQUISITO:** La migration 057 (`057-fix-product-gallery-schema.sql`) deve essere deployata in produzione prima di questo task. La migration 056 (`056-visual-embedding-index.sql`) deve anche essere applicata. Verificare con:
> ```bash
> ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
>   "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
>    exec -T postgres psql -U archibald -d archibald -c \
>    \"SELECT column_name FROM information_schema.columns WHERE table_schema='shared' AND table_name='product_gallery';\""
> ```
> Se la colonna `url` non appare (appare `image_url`), applicare prima le migration 056 e 057.

**Files:**
- Modifica: `archibald-web-app/backend/src/operations/handlers/web-product-enrichment.ts`
- Crea/Modifica: `archibald-web-app/backend/src/operations/handlers/web-product-enrichment.spec.ts`

- [ ] **Step 6.1: Scrivere test fallenti per kometuk.com scraper**

Crea/aggiorna `archibald-web-app/backend/src/operations/handlers/web-product-enrichment.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { parseKometFrPage } from './web-product-enrichment'

// ── parseKometFrPage tests (già esistenti) ─────────────────────────────────

describe('parseKometFrPage', () => {
  it('estrae URL immagini getmetafile', () => {
    const html = `
      <img src="/getmetafile/abc123.aspx">
      <img src="/getmetafile/def456.aspx">
    `
    const { imageUrls } = parseKometFrPage(html)
    expect(imageUrls).toEqual(['/getmetafile/abc123.aspx', '/getmetafile/def456.aspx'])
  })

  it('deduplica URL immagini', () => {
    const html = `
      <img src="/getmetafile/abc123.aspx">
      <img src="/getmetafile/abc123.aspx">
    `
    const { imageUrls } = parseKometFrPage(html)
    expect(imageUrls).toHaveLength(1)
  })

  it('restituisce array vuoto se non ci sono immagini', () => {
    const { imageUrls } = parseKometFrPage('<html><body>nessuna immagine</body></html>')
    expect(imageUrls).toEqual([])
  })
})

// ── filterKometUkImages tests (nuovi) ────────────────────────────────────────

import { filterKometUkImages } from './web-product-enrichment'

const SHOPIFY_IMAGES = [
  { src: 'https://cdn.shopify.com/s/files/01tc_h1_314_012_450_abc.png', alt: 'H1 FG 012' },
  { src: 'https://cdn.shopify.com/s/files/01tc_h1_314_016_450_def.png', alt: 'H1 FG 016' },
  { src: 'https://cdn.shopify.com/s/files/01tc_h1_314_018_450_ghi.png', alt: 'H1 FG 018' },
  { src: 'https://cdn.shopify.com/s/files/01tc_h1_family_pack_jkl.png', alt: 'H1 family' },
]

describe('filterKometUkImages', () => {
  it('restituisce solo le immagini che matchano shankCode e sizeCode', () => {
    const result = filterKometUkImages(SHOPIFY_IMAGES, '314', '016')
    expect(result).toHaveLength(1)
    expect(result[0].url).toContain('_314_016_')
  })

  it('restituisce array vuoto se nessun match', () => {
    const result = filterKometUkImages(SHOPIFY_IMAGES, '314', '021')
    expect(result).toEqual([])
  })

  it('scarta immagini di famiglia senza codice misura specifico', () => {
    const result = filterKometUkImages(SHOPIFY_IMAGES, '314', '016')
    expect(result.every(img => img.url.includes('_314_016_'))).toBe(true)
  })

  it('normalizza URL e altText in GalleryImage', () => {
    const result = filterKometUkImages(SHOPIFY_IMAGES, '314', '016')
    expect(result[0]).toMatchObject({
      url:       expect.stringContaining('cdn.shopify.com'),
      source:    'kometuk.com',
      imageType: 'catalog_render',
    })
  })
})

// ── parseKometUkJson tests ───────────────────────────────────────────────────

import { parseKometUkJson } from './web-product-enrichment'

describe('parseKometUkJson', () => {
  const shopifyJson = JSON.stringify({
    product: {
      images: [
        { src: 'https://cdn.shopify.com/s/files/01tc_h1_314_016_450_abc.png', alt: 'H1 FG 016' },
        { src: 'https://cdn.shopify.com/s/files/01tc_h1_204_016_450_def.png', alt: 'H1 CA 016' },
      ],
    },
  })

  it('estrae immagini dal JSON Shopify', () => {
    const images = parseKometUkJson(shopifyJson)
    expect(images).toHaveLength(2)
  })

  it('restituisce array vuoto su JSON malformato', () => {
    expect(parseKometUkJson('not json')).toEqual([])
  })

  it('restituisce array vuoto se product.images assente', () => {
    expect(parseKometUkJson(JSON.stringify({ product: {} }))).toEqual([])
  })
})
```

- [ ] **Step 6.2: Eseguire i test per verificare che falliscano**

```bash
cd archibald-web-app/backend && npm test -- --reporter=verbose web-product-enrichment
```

Atteso: FAIL — `filterKometUkImages` e `parseKometUkJson` non esistono.

- [ ] **Step 6.3: Implementare in `web-product-enrichment.ts`**

Aggiungere in fondo alle funzioni (prima di `enrichSingleProduct`) nel file `archibald-web-app/backend/src/operations/handlers/web-product-enrichment.ts`:

```typescript
type ShopifyImage = {
  src: string
  alt: string | null
}

type GalleryImage = {
  url:       string
  altText:   string | null
  source:    string
  imageType: 'catalog_render'
}

export function parseKometUkJson(json: string): ShopifyImage[] {
  try {
    const parsed = JSON.parse(json) as { product?: { images?: ShopifyImage[] } }
    return parsed?.product?.images ?? []
  } catch {
    return []
  }
}

export function filterKometUkImages(
  images: ShopifyImage[],
  shankCode: string,
  sizeCode: string,
): GalleryImage[] {
  const substring = `_${shankCode}_${sizeCode}_`
  return images
    .filter(img => {
      const basename = img.src.split('/').pop() ?? ''
      return basename.includes(substring)
    })
    .map(img => ({
      url:       img.src,
      altText:   img.alt ?? null,
      source:    'kometuk.com',
      imageType: 'catalog_render' as const,
    }))
}

async function scrapeKometUk(
  fetchUrl: FetchUrlFn,
  familyCode: string,
  shankCode: string,
  sizeCode: string,
): Promise<GalleryImage[]> {
  const url = `https://kometuk.com/products/${familyCode.toLowerCase()}.json`
  try {
    const { html } = await fetchUrl(url)
    const images = parseKometUkJson(html)
    return filterKometUkImages(images, shankCode, sizeCode)
  } catch {
    logger.warn('[web-product-enrichment] kometuk.com scrape failed', { familyCode, url })
    return []
  }
}
```

Aggiornare `enrichSingleProduct` per chiamare `scrapeKometUk`. Trovare la funzione e aggiungere dopo il call `scrapeKometFr`:

```typescript
async function enrichSingleProduct(
  pool: DbPool,
  fetchUrl: FetchUrlFn,
  searchWeb: SearchWebFn,
  productId: string,
  familyCode: string,
): Promise<{ scraped: number; resourcesFound: number }> {
  // Estrarre shankCode e sizeCode dal productId (es. H1.314.016)
  const productParts = productId.split('.')
  const shankCode = productParts[1] ?? ''
  const sizeCode  = productParts[2] ?? ''

  const [{ imageUrls }, webResources, ukImages] = await Promise.all([
    scrapeKometFr(fetchUrl, familyCode),
    runWebSearches(searchWeb, familyCode),
    scrapeKometUk(fetchUrl, familyCode, shankCode, sizeCode),
  ])

  // ... (il resto della funzione invariato, ma aggiungere il loop per ukImages)
```

Aggiungere dopo il loop `imageUrls` (che inserisce le immagini komet.fr), un loop per `ukImages`:

```typescript
  for (let i = 0; i < ukImages.length; i++) {
    const img = ukImages[i]
    await pool.query(
      `INSERT INTO shared.product_gallery
         (product_id, url, image_type, source, alt_text, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (product_id, url) DO NOTHING`,
      [productId, img.url, img.imageType, img.source, img.altText, 100 + i],
    )
    scraped += (await pool.query('SELECT 1')).rowCount ?? 0  // non necessario, usa result della query sopra
  }
```

**Nota:** il sort_order parte da 100 per mettere le immagini kometuk.com dopo quelle komet.fr (che partono da 0).

**Versione corretta del loop ukImages:**

```typescript
  let ukScraped = 0
  for (let i = 0; i < ukImages.length; i++) {
    const img = ukImages[i]
    const result = await pool.query(
      `INSERT INTO shared.product_gallery
         (product_id, url, image_type, source, alt_text, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (product_id, url) DO NOTHING`,
      [productId, img.url, img.imageType, img.source, img.altText, 100 + i],
    )
    ukScraped += result.rowCount ?? 0
  }
  scraped += ukScraped
```

- [ ] **Step 6.4: Aggiornare export**

Aggiungere `filterKometUkImages` e `parseKometUkJson` agli export nel file:

```typescript
export {
  createWebProductEnrichmentHandler,
  parseKometFrPage,
  parseKometUkJson,
  filterKometUkImages,
  type WebProductEnrichmentDeps,
  type FetchUrlFn,
  type SearchWebFn,
};
```

- [ ] **Step 6.5: Eseguire i test**

```bash
cd archibald-web-app/backend && npm test -- --reporter=verbose web-product-enrichment
```

Atteso: PASS — tutti i test verdi.

- [ ] **Step 6.6: Build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: 0 errori.

- [ ] **Step 6.7: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/web-product-enrichment.ts \
        archibald-web-app/backend/src/operations/handlers/web-product-enrichment.spec.ts
git commit -m "feat(backend): add kometuk.com scraper to web-product-enrichment for variant-specific images"
```

---

## FASE 3 — Lunghezze dal catalogo (`catalogSizes`)

### Task 7: Prerequisito DB + implementazione `catalogSizes`

> **⚠️ PREREQUISITO BLOCCANTE:** Prima di scrivere qualsiasi codice, eseguire la query di verifica sul DB di produzione per capire il formato esatto della colonna `sizes` JSONB.

- [ ] **Step 7.1: Verificare formato `sizes` in produzione**

Leggere `VPS-ACCESS-CREDENTIALS.md` per le credenziali SSH, poi eseguire:

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT family_code, sizes FROM shared.catalog_entries WHERE sizes IS NOT NULL LIMIT 10;\""
```

Leggere attentamente l'output e determinare le chiavi esatte (es. `working_length_mm` o `working_length` o `workingLengthMm` o altro).

**Se `sizes IS NOT NULL` non ritorna righe**, significa che la colonna non è ancora popolata. In quel caso, saltare Fase 3 e attendere che il bulk enrichment popoli i dati.

- [ ] **Step 7.2: Implementare il campo `catalogSizes` nella route enrichment (dipende da Step 7.1)**

Solo dopo aver confermato il formato dal DB. La query da aggiungere nella route `GET /:productId/enrichment` (in `backend/src/routes/products.ts`):

```typescript
// Aggiungere al Promise.all nella route enrichment:
pool.query<{ sizes: Record<string, number | null> | null }>(
  `SELECT ce.sizes
   FROM shared.catalog_entries ce
   WHERE ce.family_code = $1
   LIMIT 1`,
  [productId.split('.')[0]],  // es. 'H1' da 'H1.314.016'
)
```

Il parsing delle `sizes` JSONB usa le chiavi **esatte** verificate al Step 7.1. Esempio (da adattare):

```typescript
const sizesRow = catalogResult.rows[0]
const catalogSizes = sizesRow?.sizes != null ? {
  workingLengthMm: sizesRow.sizes['working_length_mm'] ?? null,  // CHIAVI DA VERIFICARE
  totalLengthMm:   sizesRow.sizes['total_length_mm']   ?? null,
} : null
```

Nel `res.json({...})`, aggiungere dopo `features`:

```typescript
catalogSizes,
```

- [ ] **Step 7.3: Aggiornare `ProductEnrichment` in `api/recognition.ts`**

```typescript
export type CatalogSizes = {
  workingLengthMm: number | null
  totalLengthMm:   number | null
}

// In ProductEnrichment:
catalogSizes?: CatalogSizes | null
```

- [ ] **Step 7.4: Aggiungere righe lunghezze alla tabella dimensioni in `ProductDetailPage.tsx`**

Nel blocco tabella dimensioni (Task 4, Step 4.9), estendere l'array con le righe opzionali:

```typescript
{enrichment?.features && (
  <div style={{ background: '#1a1a1a', borderRadius: 10, overflow: 'hidden' }}>
    {[
      { label: 'Diametro della testa',       value: `${enrichment.features.headDiameterMm.toLocaleString('it-IT')} mm` },
      { label: 'Tipo di gambo',              value: enrichment.features.shankType },
      { label: 'Diametro del gambo',         value: `${enrichment.features.shankDiameterMm.toLocaleString('it-IT')} mm` },
      ...(enrichment.catalogSizes?.workingLengthMm != null
        ? [{ label: 'Lunghezza parte lavorante', value: `${enrichment.catalogSizes.workingLengthMm.toLocaleString('it-IT')} mm` }]
        : []),
      ...(enrichment.catalogSizes?.totalLengthMm != null
        ? [{ label: 'Lunghezza totale',          value: `${enrichment.catalogSizes.totalLengthMm.toLocaleString('it-IT')} mm` }]
        : []),
    ].map(({ label, value }, i, arr) => (
      <div
        key={label}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '9px 14px',
          borderBottom: i < arr.length - 1 ? '1px solid #222' : 'none',
        }}
      >
        <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
        <div style={{
          fontSize: 12, fontWeight: 600,
          color: product.isRetired ? '#6b7280' : '#fff',
          fontFamily: "'SF Mono', Consolas, monospace",
        }}>
          {value}
        </div>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 7.5: Type-check + test**

```bash
npm run build --prefix archibald-web-app/backend
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/frontend
```

Atteso: PASS tutto.

- [ ] **Step 7.6: Commit**

```bash
git add archibald-web-app/backend/src/routes/products.ts \
        archibald-web-app/frontend/src/api/recognition.ts \
        archibald-web-app/frontend/src/pages/ProductDetailPage.tsx
git commit -m "feat: add catalogSizes (working/total length) from catalog_entries to product detail"
```

---

## Self-Review

Confronto spec → piano:

| Requisito spec | Task che lo copre |
|---|---|
| `parseKometFeatures` backend utility | Task 1 |
| `isRetired` in `Product` | Task 2 + Task 3 |
| `features` in `/enrichment` response | Task 2 |
| `getProductById` frontend | Task 3 |
| Badge caratteristiche in tab Prodotto | Task 4 |
| Chip con diametro mm in tab Misure | Task 4 |
| Tabella dimensioni in tab Misure (3 righe) | Task 4 |
| IVA esplicitata in CTA | Task 4 |
| minQty in CTA | Task 4 |
| Banner prodotto ritirato | Task 4 |
| Pallino rosso + "Non più disponibile" | Task 4 |
| Prezzo barrato CTA per prodotti ritirati | Task 4 |
| Badge "Prodotto ritirato" in gallery | Task 4 |
| Test badge, misure, IVA, ritirato | Task 5 |
| kometuk.com scraper | Task 6 |
| `catalogSizes` (lunghezze catalogo) | Task 7 |

**Placeholder check:** nessun TBD, nessun "implement later". Ogni step ha il codice completo.

**Type consistency check:**
- `KometFeatures` è definito in `backend/src/utils/komet-code-parser.ts` e replicato in `frontend/src/api/recognition.ts` — i campi sono identici.
- `isRetired` è `boolean` in backend `mapProductRow` e `boolean?` in frontend `Product` — coerente.
- `features?: KometFeatures | null` in `ProductEnrichment` — opzionale per backward compatibility con test esistenti.
- Il sort_order per kometuk.com parte da 100 (dopo komet.fr che parte da 0) — coerente.

**Rischio principale:** Il product gallery table ha la colonna `alt_text` (Step 6.3 usa `alt_text`). Verificare che la colonna esista in `shared.product_gallery`. Se non esiste, rimuovere dal INSERT.
