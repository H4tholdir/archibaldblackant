# Import Listino Komet Unificato (IVA + Sconti Fresis) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unificare "Carica Listino Excel (Solo IVA)" e "Sconti Articolo Fresis" in un unico componente admin che, dato il file Excel Komet, aggiorna IVA e calcola/salva gli sconti Fresis in automatico.

**Architecture:** Nuovo service `komet-listino-importer.ts` che riusa la logica IVA esistente via dependency injection e aggiunge il calcolo sconti (`round((1 - KP/listino) * 100)`). Nuovo endpoint `POST /api/admin/import-komet-listino` in `admin.ts`. Frontend: nuovo componente `KometListinoImporter.tsx` che sostituisce i due componenti vecchi in `AdminPage.tsx`.

**Tech Stack:** TypeScript strict, Express, multer, xlsx, Vitest, React 19, inline styles

---

### Task 1: Service backend `komet-listino-importer.ts`

**Files:**
- Create: `archibald-web-app/backend/src/services/komet-listino-importer.ts`
- Create: `archibald-web-app/backend/src/services/komet-listino-importer.spec.ts`

**Struttura dati attesa dal file Excel Komet:**
```
Colonna 0: Nome Gruppi
Colonna 1: ID              → chiave match shared.products
Colonna 2: Codice Articolo
Colonna 3: Descrizione
Colonna 4: Conf.
Colonna 5: Prezzo di listino unit.
Colonna 6: Prezzo di listino conf.
Colonna 7: Prezzo KP unit.  (header con trailing space nel file reale)
Colonna 8: Prezzo KP conf.
Colonna 9: IVA
```

**Step 1: Scrivi il test per il calcolo dello sconto**

In `komet-listino-importer.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { calculateDiscountPercent } from './komet-listino-importer';

describe('calculateDiscountPercent', () => {
  test('calcola sconto 63% dal listino Komet reale', () => {
    expect(calculateDiscountPercent(1.957, 0.72409)).toBe(63);
  });

  test('calcola sconto 53% arrotondato a intero', () => {
    // (1 - 0.47/1.00) * 100 = 53
    expect(calculateDiscountPercent(1.0, 0.47)).toBe(53);
  });

  test('arrotonda correttamente al più vicino intero', () => {
    // (1 - 0.629/1.70) * 100 = 62.99... → 63
    expect(calculateDiscountPercent(1.70, 0.629)).toBe(63);
  });

  test('ritorna null se listino è zero', () => {
    expect(calculateDiscountPercent(0, 0.5)).toBeNull();
  });

  test('ritorna null se listino è negativo', () => {
    expect(calculateDiscountPercent(-1, 0.5)).toBeNull();
  });
});
```

**Step 2: Verifica che il test fallisca**

```bash
npm test --prefix archibald-web-app/backend -- komet-listino-importer.spec.ts
```
Atteso: FAIL — `calculateDiscountPercent is not a function`

**Step 3: Implementa `komet-listino-importer.ts`**

```typescript
import * as XLSX from 'xlsx';
import type { ImportVatDeps, ImportVatResult } from './excel-vat-importer';
import { importExcelVat } from './excel-vat-importer';

type UpsertDiscountFn = (
  id: string,
  articleCode: string,
  discountPercent: number,
  kpPriceUnit: number | null,
) => Promise<void>;

type KometListinoImporterDeps = ImportVatDeps & {
  upsertDiscount: UpsertDiscountFn;
};

type KometListinoResult = {
  totalRows: number;
  ivaUpdated: number;
  scontiUpdated: number;
  unmatched: number;
  unmatchedProducts: Array<{ excelId: string; excelCodiceArticolo: string; reason: string }>;
  errors: string[];
};

function calculateDiscountPercent(listino: number, kp: number): number | null {
  if (listino <= 0) return null;
  return Math.round((1 - kp / listino) * 100);
}

const KOMET_HEADERS = {
  productId: ['id', 'codice articolo'],
  vat: ['iva'],
  listinoUnit: ['prezzo di listino unit.'],
  kpUnit: ['prezzo kp unit.'],
};

function findColumnIndex(headers: string[], targets: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const normalized = (headers[i] ?? '').trim().toLowerCase();
    if (targets.includes(normalized)) return i;
  }
  return null;
}

async function importKometListino(
  buffer: Buffer,
  filename: string,
  userId: string,
  deps: KometListinoImporterDeps,
): Promise<KometListinoResult> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (err) {
    return {
      totalRows: 0, ivaUpdated: 0, scontiUpdated: 0, unmatched: 0,
      unmatchedProducts: [],
      errors: [`Errore lettura file Excel: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      totalRows: 0, ivaUpdated: 0, scontiUpdated: 0, unmatched: 0,
      unmatchedProducts: [], errors: ['File Excel senza fogli'],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  if (rawData.length < 2) {
    return {
      totalRows: 0, ivaUpdated: 0, scontiUpdated: 0, unmatched: 0,
      unmatchedProducts: [], errors: [],
    };
  }

  const headerRow = (rawData[0] as string[]);
  const idCol = findColumnIndex(headerRow, KOMET_HEADERS.productId);
  const vatCol = findColumnIndex(headerRow, KOMET_HEADERS.vat);
  const listinoCol = findColumnIndex(headerRow, KOMET_HEADERS.listinoUnit);
  const kpCol = findColumnIndex(headerRow, KOMET_HEADERS.kpUnit);
  const codiceCol = findColumnIndex(headerRow, ['codice articolo']);

  if (idCol === null || vatCol === null) {
    return {
      totalRows: 0, ivaUpdated: 0, scontiUpdated: 0, unmatched: 0,
      unmatchedProducts: [],
      errors: ['Colonne ID e IVA richieste non trovate nel file Excel'],
    };
  }

  // IVA update via existing service (reuse)
  const vatResult: ImportVatResult = await importExcelVat(buffer, filename, userId, {
    getProductById: deps.getProductById,
    findSiblingVariants: deps.findSiblingVariants,
    updateProductVat: deps.updateProductVat,
    updateProductPrice: deps.updateProductPrice,
    recordPriceChange: deps.recordPriceChange,
    recordImport: deps.recordImport,
  });

  // Discount update
  const dataRows = rawData.slice(1) as unknown[][];
  let scontiUpdated = 0;
  const unmatchedProducts: KometListinoResult['unmatchedProducts'] = [];

  if (listinoCol !== null && kpCol !== null) {
    for (const row of dataRows) {
      const rawId = row[idCol];
      const id = rawId != null ? String(rawId).trim() : '';
      if (!id) continue;

      const listino = typeof row[listinoCol] === 'number' ? row[listinoCol] as number : null;
      const kp = typeof row[kpCol] === 'number' ? row[kpCol] as number : null;

      if (listino === null || kp === null) continue;

      const discountPercent = calculateDiscountPercent(listino, kp);
      if (discountPercent === null) continue;

      const codiceArticolo = codiceCol !== null && row[codiceCol] != null
        ? String(row[codiceCol]).trim()
        : '';

      await deps.upsertDiscount(id, codiceArticolo, discountPercent, kp);
      scontiUpdated++;
    }
  }

  return {
    totalRows: vatResult.totalRows,
    ivaUpdated: vatResult.vatUpdated,
    scontiUpdated,
    unmatched: vatResult.unmatched,
    unmatchedProducts,
    errors: vatResult.errors,
  };
}

export { importKometListino, calculateDiscountPercent };
export type { KometListinoImporterDeps, KometListinoResult };
```

**Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- komet-listino-importer.spec.ts
```
Atteso: PASS (5 test)

**Step 5: Aggiungi test integrazione `importKometListino`**

Aggiungi in `komet-listino-importer.spec.ts`:

```typescript
import { importKometListino } from './komet-listino-importer';
import * as XLSX from 'xlsx';
import { vi } from 'vitest';

function buildExcelBuffer(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

const KOMET_HEADERS_ROW = [
  'Nome Gruppi', 'ID', 'Codice Articolo', 'Descrizione', 'Conf.',
  'Prezzo di listino unit.', 'Prezzo di listino conf.',
  'Prezzo KP unit. ', 'Prezzo KP conf.', 'IVA',
];

describe('importKometListino', () => {
  const mockProduct = {
    id: '001627K0', name: 'Fresa ACC', vat: 22, price: 1.957,
    articleCode: '1.204.005', category: null, unit: null,
  };

  function makeDeps() {
    return {
      getProductById: vi.fn().mockResolvedValue(mockProduct),
      findSiblingVariants: vi.fn().mockResolvedValue([]),
      updateProductVat: vi.fn().mockResolvedValue(true),
      updateProductPrice: vi.fn().mockResolvedValue(true),
      recordPriceChange: vi.fn().mockResolvedValue(undefined),
      recordImport: vi.fn().mockResolvedValue({ id: 1 }),
      upsertDiscount: vi.fn().mockResolvedValue(undefined),
    };
  }

  test('calcola sconto 63% e chiama upsertDiscount', async () => {
    const buffer = buildExcelBuffer([
      KOMET_HEADERS_ROW,
      ['Gruppo A', '001627K0', '1.204.005', 'Fresa', 10, 1.957, 19.57, 0.72409, 7.2409, 22],
    ]);
    const deps = makeDeps();

    const result = await importKometListino(buffer, 'test.xlsx', 'user1', deps);

    expect(result.scontiUpdated).toBe(1);
    expect(deps.upsertDiscount).toHaveBeenCalledWith('001627K0', '1.204.005', 63, 0.72409);
  });

  test('salta riga senza prezzi validi (solo IVA viene aggiornata)', async () => {
    const buffer = buildExcelBuffer([
      KOMET_HEADERS_ROW,
      ['Gruppo A', '001627K0', '1.204.005', 'Fresa', 10, null, null, null, null, 22],
    ]);
    const deps = makeDeps();

    const result = await importKometListino(buffer, 'test.xlsx', 'user1', deps);

    expect(result.scontiUpdated).toBe(0);
    expect(deps.upsertDiscount).not.toHaveBeenCalled();
  });

  test('salta sconto se listino è zero', async () => {
    const buffer = buildExcelBuffer([
      KOMET_HEADERS_ROW,
      ['Gruppo A', '001627K0', '1.204.005', 'Fresa', 10, 0, 0, 0, 0, 22],
    ]);
    const deps = makeDeps();

    await importKometListino(buffer, 'test.xlsx', 'user1', deps);

    expect(deps.upsertDiscount).not.toHaveBeenCalled();
  });

  test('restituisce errore se file non è Excel valido', async () => {
    const result = await importKometListino(
      Buffer.from('not excel'), 'bad.xlsx', 'user1', makeDeps(),
    );
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
```

**Step 6: Esegui tutti i test del service**

```bash
npm test --prefix archibald-web-app/backend -- komet-listino-importer.spec.ts
```
Atteso: PASS (9 test)

**Step 7: Commit**

```bash
git add archibald-web-app/backend/src/services/komet-listino-importer.ts \
        archibald-web-app/backend/src/services/komet-listino-importer.spec.ts
git commit -m "feat(backend): add komet-listino-importer service (IVA + Fresis discounts)"
```

---

### Task 2: Endpoint `POST /api/admin/import-komet-listino`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/admin.ts`
- Modify: `archibald-web-app/backend/src/server.ts`
- Modify: `archibald-web-app/backend/src/routes/admin.spec.ts`

**Step 1: Aggiungi test per il nuovo endpoint in `admin.spec.ts`**

Trova la sezione con i mock `deps` in `admin.spec.ts` e aggiungi `importKometListino` ai deps mockati:

```typescript
// Nel blocco dei deps mock, aggiungi:
importKometListino: vi.fn().mockResolvedValue({
  totalRows: 100,
  ivaUpdated: 95,
  scontiUpdated: 98,
  unmatched: 5,
  unmatchedProducts: [],
  errors: [],
}),
```

Poi aggiungi il test:

```typescript
describe('POST /import-komet-listino', () => {
  test('returns import result with ivaUpdated and scontiUpdated', async () => {
    const excelBuffer = Buffer.from('fake-excel-content');

    const response = await request(app)
      .post('/import-komet-listino')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', excelBuffer, { filename: 'listino.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.ivaUpdated).toBe(95);
    expect(response.body.data.scontiUpdated).toBe(98);
    expect(deps.importKometListino).toHaveBeenCalledWith(
      expect.any(Buffer),
      'listino.xlsx',
    );
  });

  test('returns 400 if no file provided', async () => {
    const response = await request(app)
      .post('/import-komet-listino')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
  });
});
```

**Step 2: Verifica che il test fallisca**

```bash
npm test --prefix archibald-web-app/backend -- admin.spec.ts
```
Atteso: FAIL — route non esistente

**Step 3: Aggiungi `importKometListino` a `AdminRouterDeps` e implementa la route in `admin.ts`**

Aggiungi al tipo `AdminRouterDeps` (dopo `importSubclients`):

```typescript
importKometListino: (buffer: Buffer, filename: string) => Promise<{
  totalRows: number;
  ivaUpdated: number;
  scontiUpdated: number;
  unmatched: number;
  unmatchedProducts: Array<{ excelId: string; excelCodiceArticolo: string; reason: string }>;
  errors: string[];
}>;
```

Aggiungi `importKometListino` nel destructuring dei deps nella factory function (vicino a `importSubclients`).

Aggiungi la route (dopo la route di `importSubclients`, prima della chiusura del router):

```typescript
router.post('/import-komet-listino', upload.single('file'), async (req: AuthRequest, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ success: false, error: 'File Excel richiesto' });
  }
  if (!ALLOWED_EXCEL_MIME_TYPES.includes(file.mimetype)) {
    return res.status(400).json({ success: false, error: 'Solo file Excel (.xlsx, .xls) sono accettati' });
  }
  try {
    const result = await importKometListino(file.buffer, file.originalname);
    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error importing Komet listino', { error });
    return res.status(500).json({ success: false, error: 'Errore durante importazione listino Komet' });
  }
});
```

Nota: `ALLOWED_EXCEL_MIME_TYPES` è già definita nel file (è usata dalla route `importSubclients`).

**Step 4: Wire il nuovo dep in `server.ts`**

Nel blocco `createAdminRouter({...})` in `server.ts`, aggiungi dopo `importSubclients`:

```typescript
importKometListino: (buffer, filename) => importKometListino(buffer, filename, /* userId */ '', {
  getProductById: (id) => productsRepo.getProductById(pool, id),
  findSiblingVariants: (productId) => productsRepo.findSiblingVariants(pool, productId),
  updateProductVat: (productId, vat, vatSource) => productsRepo.updateProductVat(pool, productId, vat, vatSource),
  updateProductPrice: (id, price, vat, priceSource, vatSource) => productsRepo.updateProductPrice(pool, id, price, vat, priceSource, vatSource),
  recordPriceChange: (data) => pricesHistoryRepo.recordPriceChange(pool, data).then(() => {}),
  recordImport: (data) => excelVatImportsRepo.recordImport(pool, data),
  upsertDiscount: (id, articleCode, discountPercent, kpPriceUnit) =>
    fresisHistoryRepo.upsertDiscount(pool, /* userId from request */ '', id, articleCode, discountPercent, kpPriceUnit),
}),
```

Nota: `userId` viene passato dalla route handler (è in `req.user!.userId`), non dal server.ts. Aggiorna la firma del dep per accettare `userId`:

```typescript
// AdminRouterDeps:
importKometListino: (buffer: Buffer, filename: string, userId: string) => Promise<{...}>;

// route handler:
const result = await importKometListino(file.buffer, file.originalname, req.user!.userId);

// server.ts:
importKometListino: (buffer, filename, userId) => importKometListino(buffer, filename, userId, { ... });
```

Aggiungi anche l'import in `server.ts`:
```typescript
import { importKometListino } from './services/komet-listino-importer';
```

**Step 5: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```
Atteso: build senza errori

**Step 6: Esegui test backend**

```bash
npm test --prefix archibald-web-app/backend -- admin.spec.ts
```
Atteso: PASS

**Step 7: Commit**

```bash
git add archibald-web-app/backend/src/routes/admin.ts \
        archibald-web-app/backend/src/routes/admin.spec.ts \
        archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): add POST /api/admin/import-komet-listino endpoint"
```

---

### Task 3: API client frontend `komet-listino.ts`

**Files:**
- Create: `archibald-web-app/frontend/src/api/komet-listino.ts`

**Step 1: Crea il file**

```typescript
type KometListinoResult = {
  totalRows: number;
  ivaUpdated: number;
  scontiUpdated: number;
  unmatched: number;
  unmatchedProducts: Array<{ excelId: string; excelCodiceArticolo: string; reason: string }>;
  errors: string[];
};

async function importKometListino(file: File): Promise<KometListinoResult> {
  const jwt = localStorage.getItem('archibald_jwt');
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/admin/import-komet-listino', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.data as KometListinoResult;
}

export { importKometListino };
export type { KometListinoResult };
```

**Step 2: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: nessun errore

**Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/api/komet-listino.ts
git commit -m "feat(frontend): add komet-listino API client"
```

---

### Task 4: Componente `KometListinoImporter.tsx`

**Files:**
- Create: `archibald-web-app/frontend/src/components/KometListinoImporter.tsx`

**Step 1: Implementa il componente**

```typescript
import { useState, useRef } from 'react';
import { importKometListino } from '../api/komet-listino';
import { toastService } from '../services/toast.service';
import type { KometListinoResult } from '../api/komet-listino';

export function KometListinoImporter() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KometListinoResult | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await importKometListino(file);
      setResult(res);
      toastService.success(
        `Listino importato: ${res.ivaUpdated} IVA aggiornate, ${res.scontiUpdated} sconti Fresis aggiornati`,
      );
    } catch (err) {
      toastService.error(`Errore importazione: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{ padding: '1.5rem', background: '#f9fafb', borderRadius: '8px', marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.25rem' }}>
        📊 Importa Listino Komet
      </h3>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.25rem' }}>
        Carica il file Excel aggiornato da Komet. Il sistema aggiorna automaticamente
        l'IVA dei prodotti e le percentuali di sconto Fresis.
      </p>

      {/* Box formato file */}
      <div style={{
        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px',
        padding: '1rem', marginBottom: '1.25rem', fontSize: '0.8125rem',
      }}>
        <div style={{ fontWeight: '600', color: '#1d4ed8', marginBottom: '0.5rem' }}>
          📋 Formato file atteso
        </div>
        <div style={{ color: '#374151', marginBottom: '0.5rem' }}>
          File: <code style={{ background: '#dbeafe', padding: '0 4px', borderRadius: '3px' }}>
            Listino 2026 vendita e acquisto.xlsx
          </code>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.75rem' }}>
          <thead>
            <tr style={{ background: '#dbeafe' }}>
              {['Colonna', 'Uso', 'Esempio'].map(h => (
                <th key={h} style={{ padding: '0.375rem 0.5rem', textAlign: 'left', fontWeight: '600' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['ID', 'Codice articolo (chiave)', '001627K0'],
              ['Codice Articolo', 'Riferimento', '1.204.005'],
              ['IVA', 'Aliquota IVA (%)', '22'],
              ['Prezzo di listino unit.', 'Prezzo vendita', '1.957'],
              ['Prezzo KP unit.', 'Prezzo acquisto Fresis', '0.724'],
            ].map(([col, uso, esempio]) => (
              <tr key={col} style={{ borderBottom: '1px solid #bfdbfe' }}>
                <td style={{ padding: '0.375rem 0.5rem', fontFamily: 'monospace', fontWeight: '500' }}>{col}</td>
                <td style={{ padding: '0.375rem 0.5rem', color: '#4b5563' }}>{uso}</td>
                <td style={{ padding: '0.375rem 0.5rem', color: '#6b7280' }}>{esempio}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ color: '#4b5563', lineHeight: '1.6' }}>
          <div>• Lo sconto Fresis viene calcolato automaticamente: <code style={{ background: '#dbeafe', padding: '0 4px', borderRadius: '3px' }}>round((1 − KP / listino) × 100)</code></div>
          <div>• IVA valori supportati: <strong>4%</strong> e <strong>22%</strong></div>
          <div>• Articoli non trovati nel DB vengono loggati ma non bloccano l'import</div>
          <div>• Il file deve essere in formato <strong>.xlsx</strong> o <strong>.xls</strong></div>
        </div>
      </div>

      {/* Upload area */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.5rem 1.25rem', background: loading ? '#9ca3af' : '#2563eb',
          color: 'white', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '0.875rem', fontWeight: '600',
        }}>
          {loading ? '⏳ Importazione in corso...' : '📂 Scegli file Excel'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={loading}
            style={{ display: 'none' }}
          />
        </label>
        {loading && (
          <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
            Aggiornamento IVA e sconti in corso...
          </span>
        )}
      </div>

      {/* Risultato import */}
      {result && (
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.75rem', color: '#111827' }}>
            ✅ Import completato — {result.totalRows} righe elaborate
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <StatBadge label="IVA aggiornate" value={result.ivaUpdated} color="#059669" />
            <StatBadge label="Sconti Fresis" value={result.scontiUpdated} color="#2563eb" />
            <StatBadge
              label="Non abbinati"
              value={result.unmatched}
              color={result.unmatched > 0 ? '#d97706' : '#9ca3af'}
            />
          </div>

          {result.errors.length > 0 && (
            <div style={{
              background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '6px',
              padding: '0.75rem', fontSize: '0.8125rem', color: '#92400e', marginBottom: '0.75rem',
            }}>
              <strong>Avvisi ({result.errors.length}):</strong>
              <ul style={{ margin: '0.25rem 0 0 1rem', paddingLeft: 0 }}>
                {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                {result.errors.length > 5 && <li>...e altri {result.errors.length - 5}</li>}
              </ul>
            </div>
          )}

          {result.unmatched > 0 && (
            <button
              onClick={() => setShowUnmatched(v => !v)}
              style={{
                fontSize: '0.8125rem', background: 'none', border: '1px solid #d1d5db',
                borderRadius: '4px', padding: '0.25rem 0.75rem', cursor: 'pointer', color: '#374151',
              }}
            >
              {showUnmatched ? '▲ Nascondi' : '▼ Mostra'} articoli non abbinati ({result.unmatched})
            </button>
          )}

          {showUnmatched && result.unmatchedProducts.length > 0 && (
            <div style={{ marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <th style={{ padding: '0.375rem 0.5rem', textAlign: 'left' }}>ID</th>
                    <th style={{ padding: '0.375rem 0.5rem', textAlign: 'left' }}>Codice Articolo</th>
                    <th style={{ padding: '0.375rem 0.5rem', textAlign: 'left' }}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.unmatchedProducts.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.375rem 0.5rem', fontFamily: 'monospace' }}>{p.excelId}</td>
                      <td style={{ padding: '0.375rem 0.5rem' }}>{p.excelCodiceArticolo}</td>
                      <td style={{ padding: '0.375rem 0.5rem', color: '#6b7280' }}>{p.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'white', border: `2px solid ${color}`, borderRadius: '8px',
      padding: '0.5rem 1rem', textAlign: 'center', minWidth: '120px',
    }}>
      <div style={{ fontSize: '1.25rem', fontWeight: '700', color }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</div>
    </div>
  );
}
```

**Step 2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: nessun errore

**Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/KometListinoImporter.tsx
git commit -m "feat(frontend): add KometListinoImporter component"
```

---

### Task 5: Integrazione in `AdminPage.tsx`

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/AdminPage.tsx`

**Step 1: Sostituisci `FresisDiscountManager` con `KometListinoImporter`**

Riga 7, sostituisci:
```typescript
import { FresisDiscountManager } from "../components/FresisDiscountManager";
```
con:
```typescript
import { KometListinoImporter } from "../components/KometListinoImporter";
```

Riga 682, sostituisci:
```typescript
<FresisDiscountManager />
```
con:
```typescript
<KometListinoImporter />
```

Cerca anche se `ExcelPriceManager` è importato/usato in `AdminPage.tsx`:
```bash
grep -n "ExcelPriceManager" archibald-web-app/frontend/src/pages/AdminPage.tsx
```
Se trovato, rimuovi l'import e sostituisci il componente con `<KometListinoImporter />` (o rimuovi il secondo blocco se già sostituito sopra).

**Step 2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

**Step 3: Esegui test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```
Atteso: PASS

**Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/pages/AdminPage.tsx
git commit -m "feat(frontend): replace ExcelPriceManager+FresisDiscountManager with KometListinoImporter"
```

---

### Task 6: Verifica finale

**Step 1: Build completo**

```bash
npm run build --prefix archibald-web-app/backend && \
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: nessun errore

**Step 2: Test completi**

```bash
npm test --prefix archibald-web-app/backend && \
npm test --prefix archibald-web-app/frontend
```
Atteso: tutti i test passano

**Step 3: Commit finale**

```bash
git add docs/plans/2026-03-09-komet-listino-import-unificato-design.md \
        docs/plans/2026-03-09-komet-listino-import-unificato.md
git commit -m "docs: add komet-listino import design and implementation plan"
```
