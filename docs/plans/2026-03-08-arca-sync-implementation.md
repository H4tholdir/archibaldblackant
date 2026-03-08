# Arca Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sincronizzazione bidirezionale 1-click tra PWA (fresis_history) e ArcaPro (doctes.dbf/docrig.dbf) — Arca→PWA via parsing DBF nativi, PWA→Arca via script VBS con VFPOLEDB INSERT.

**Architecture:** Il frontend legge doctes.dbf + docrig.dbf + ANAGRAFE.DBF dalla cartella COOP16 via File System Access API, li invia al backend. Il backend fa delta sync (import nuovi, skip esistenti) e genera uno script VBS per i record da esportare verso Arca. Il frontend scrive il VBS nella cartella COOP16. L'utente esegue il VBS dal PC per completare l'export.

**Tech Stack:** `dbffile` (parsing VFP9 nativo — verificato), File System Access API (Chrome 109+), multer (upload), VFPOLEDB (INSERT via VBS).

**Dati reali verificati:**
- doctes.dbf: 15,153 record (106 campi), FT=14,992, KT=4
- docrig.dbf: 52,348 record (55 campi)
- ANAGRAFE.DBF: 1,899 clienti (CODICE + DESCRIZION)
- Formato: VFP9 (0x30), leggibile da `dbffile` v1.12.0

---

## Task 1: Backend — Export helper functions da arca-import-service

**Files:**
- Modify: `archibald-web-app/backend/src/arca-import-service.ts`

Le funzioni `buildArcaTestata`, `buildArcaRiga`, `numVal`, `boolVal`, `formatDate`, `calculateItemRevenue` sono private ma servono al nuovo sync service.

**Step 1: Aggiungere export alle funzioni necessarie**

In `arca-import-service.ts`, aggiungere `export` a:
- `buildArcaTestata` (riga ~152)
- `buildArcaRiga` (riga ~263)
- `numVal` (riga ~139)
- `boolVal` (riga ~146)
- `formatDate` (riga ~131)
- `calculateItemRevenue` (riga ~399)

```typescript
// Cambiare da:
function buildArcaTestata(row: Record<string, unknown>): ArcaTestata {
// A:
export function buildArcaTestata(row: Record<string, unknown>): ArcaTestata {
```

Ripetere per tutte le 6 funzioni.

**Step 2: Verificare che i test esistenti passino**

Run: `npm test --prefix archibald-web-app/backend -- --run arca-import`
Expected: PASS (aggiungere export non cambia il comportamento)

**Step 3: Verificare che il backend compili**

Run: `npm run build --prefix archibald-web-app/backend`
Expected: PASS

**Step 4: Commit**

```bash
git add archibald-web-app/backend/src/arca-import-service.ts
git commit -m "refactor(backend): export shared helpers from arca-import-service"
```

---

## Task 2: Backend — parseNativeArcaFiles (TDD)

**Files:**
- Create: `archibald-web-app/backend/src/services/arca-sync-service.ts`
- Create: `archibald-web-app/backend/src/services/arca-sync-service.spec.ts`

Questa funzione parsa i file DBF nativi di ArcaPro (doctes.dbf + docrig.dbf + ANAGRAFE.DBF) e produce FresisHistoryRow[]. Differenze da `parseArcaExport`:
- Input: file nativi (non EXPORT)
- Filtra FT + KT (non solo FT)
- Client lookup da ANAGRAFE.DBF (campo DESCRIZION, non RAGSOC)
- ID deterministico include TIPODOC per distinguere FT/KT
- Nessuna dipendenza SQLite

**Step 1: Scrivere i test per parseNativeArcaFiles**

```typescript
// archibald-web-app/backend/src/services/arca-sync-service.spec.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// We'll test with real COOP16 files from /Users/hatholdir/Downloads/ArcaPro
const COOP16_PATH = '/Users/hatholdir/Downloads/ArcaPro/Ditte/COOP16';

describe('parseNativeArcaFiles', () => {
  test('parses real doctes.dbf and docrig.dbf producing FresisHistoryRows', async () => {
    const { parseNativeArcaFiles } = await import('./arca-sync-service');

    const doctesBuf = fs.readFileSync(path.join(COOP16_PATH, 'doctes.dbf'));
    const docrigBuf = fs.readFileSync(path.join(COOP16_PATH, 'docrig.dbf'));
    const anagrafeBuf = fs.readFileSync(path.join(COOP16_PATH, 'ANAGRAFE.DBF'));

    const result = await parseNativeArcaFiles(
      doctesBuf, docrigBuf, anagrafeBuf, 'test-user',
      new Map(), new Map(),
    );

    expect(result.errors).toEqual([]);
    // 14992 FT + 4 KT = 14996
    expect(result.stats.totalDocuments).toBeGreaterThanOrEqual(14996);
    expect(result.stats.skippedOtherTypes).toBeGreaterThan(0);
    expect(result.records.length).toBe(result.stats.totalDocuments);

    // Verify first record structure
    const first = result.records[0];
    expect(first.source).toBe('arca_import');
    expect(first.customer_id).toBe('55.261');
    expect(first.customer_name).toBe('Fresis Soc Cooperativa');
    expect(first.arca_data).toBeTruthy();
    expect(JSON.parse(first.arca_data!).testata.TIPODOC).toBe('FT');
    expect(JSON.parse(first.arca_data!).righe.length).toBeGreaterThan(0);
  });

  test('includes KT documents with distinct IDs from FT', async () => {
    const { parseNativeArcaFiles } = await import('./arca-sync-service');

    const doctesBuf = fs.readFileSync(path.join(COOP16_PATH, 'doctes.dbf'));
    const docrigBuf = fs.readFileSync(path.join(COOP16_PATH, 'docrig.dbf'));

    const result = await parseNativeArcaFiles(
      doctesBuf, docrigBuf, null, 'test-user',
      new Map(), new Map(),
    );

    const ktRecords = result.records.filter(r =>
      r.invoice_number?.startsWith('KT ')
    );
    expect(ktRecords.length).toBe(4);

    // KT and FT with same NUMERODOC must have different IDs
    const ftIds = new Set(result.records.filter(r => r.invoice_number?.startsWith('FT ')).map(r => r.id));
    for (const kt of ktRecords) {
      expect(ftIds.has(kt.id)).toBe(false);
    }
  });

  test('resolves client names from ANAGRAFE when provided', async () => {
    const { parseNativeArcaFiles } = await import('./arca-sync-service');

    const doctesBuf = fs.readFileSync(path.join(COOP16_PATH, 'doctes.dbf'));
    const docrigBuf = fs.readFileSync(path.join(COOP16_PATH, 'docrig.dbf'));
    const anagrafeBuf = fs.readFileSync(path.join(COOP16_PATH, 'ANAGRAFE.DBF'));

    const result = await parseNativeArcaFiles(
      doctesBuf, docrigBuf, anagrafeBuf, 'test-user',
      new Map(), new Map(),
    );

    // C00001 = 'ST.  "KINESIOGRAPH" SICILIANO' from ANAGRAFE
    const c00001Records = result.records.filter(r => r.sub_client_codice === 'C00001');
    if (c00001Records.length > 0) {
      expect(c00001Records[0].sub_client_name).toContain('KINESIOGRAPH');
    }
  });

  test('tracks maxNumerodocByEsercizio for both FT and KT', async () => {
    const { parseNativeArcaFiles } = await import('./arca-sync-service');

    const doctesBuf = fs.readFileSync(path.join(COOP16_PATH, 'doctes.dbf'));
    const docrigBuf = fs.readFileSync(path.join(COOP16_PATH, 'docrig.dbf'));

    const result = await parseNativeArcaFiles(
      doctesBuf, docrigBuf, null, 'test-user',
      new Map(), new Map(),
    );

    // FT 2026 should have max around 14996
    const ftMax = result.maxNumerodocByKey.get('2026|FT');
    expect(ftMax).toBeGreaterThanOrEqual(14990);

    // KT 2026 should have max around 280
    const ktMax = result.maxNumerodocByKey.get('2026|KT');
    expect(ktMax).toBeGreaterThanOrEqual(278);
  });
});
```

**Step 2: Verificare che i test falliscano**

Run: `npm test --prefix archibald-web-app/backend -- --run arca-sync-service`
Expected: FAIL — modulo non esiste

**Step 3: Implementare parseNativeArcaFiles**

```typescript
// archibald-web-app/backend/src/services/arca-sync-service.ts
import { DBFFile } from 'dbffile';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ArcaData, ArcaRiga } from '../arca-data-types';
import {
  buildArcaTestata,
  buildArcaRiga,
  trimStr,
  numVal,
  deterministicId,
  normalizeSubClientCode,
  parseCascadeDiscount,
  calculateShippingTax,
  calculateItemRevenue,
  type FresisHistoryRow,
  type ParseResult,
} from '../arca-import-service';
import { logger } from '../logger';

const FRESIS_CUSTOMER_PROFILE = '55.261';
const FRESIS_CUSTOMER_NAME = 'Fresis Soc Cooperativa';
const FRESIS_DEFAULT_DISCOUNT = 63;
const ALLOWED_DOC_TYPES = new Set(['FT', 'KT']);

export interface NativeParseResult {
  records: FresisHistoryRow[];
  errors: string[];
  stats: {
    totalDocuments: number;
    totalRows: number;
    totalClients: number;
    skippedOtherTypes: number;
  };
  maxNumerodocByKey: Map<string, number>; // "ESERCIZIO|TIPODOC" -> max NUMERODOC
}

type ProductLookup = Map<string, { listPrice: number }>;
type DiscountLookup = Map<string, number>;

function createTempDir(): string {
  const tmpDir = path.join(os.tmpdir(), `archibald-arca-sync-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function cleanupTempDir(dirPath: string): void {
  try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch { /* ignore */ }
}

function formatDate(d: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  return null;
}

export async function parseNativeArcaFiles(
  doctesBuf: Buffer,
  docrigBuf: Buffer,
  anagrafeBuf: Buffer | null,
  userId: string,
  productLookup: ProductLookup,
  discountLookup: DiscountLookup,
): Promise<NativeParseResult> {
  const tmpDir = createTempDir();
  const errors: string[] = [];

  try {
    // Write buffers to temp files for dbffile
    const doctesPath = path.join(tmpDir, 'doctes.dbf');
    const docrigPath = path.join(tmpDir, 'docrig.dbf');
    fs.writeFileSync(doctesPath, doctesBuf);
    fs.writeFileSync(docrigPath, docrigBuf);

    // 1. Parse ANAGRAFE for client names
    const clientNameMap = new Map<string, string>();
    if (anagrafeBuf) {
      const anaPath = path.join(tmpDir, 'ANAGRAFE.DBF');
      fs.writeFileSync(anaPath, anagrafeBuf);
      const anaFile = await DBFFile.open(anaPath, { encoding: 'latin1' });
      const anaRows = await anaFile.readRecords();
      for (const row of anaRows) {
        const codice = normalizeSubClientCode(trimStr((row as any).CODICE));
        const name = trimStr((row as any).DESCRIZION);
        if (codice && name) clientNameMap.set(codice, name);
      }
    }

    // 2. Parse docrig -> group by ID_TESTA
    const drFile = await DBFFile.open(docrigPath, { encoding: 'latin1' });
    const drRows = await drFile.readRecords();
    const rowsByTesta = new Map<number, Array<Record<string, unknown>>>();
    for (const row of drRows) {
      const idTesta = numVal((row as any).ID_TESTA);
      if (!idTesta) continue;
      if (!rowsByTesta.has(idTesta)) rowsByTesta.set(idTesta, []);
      rowsByTesta.get(idTesta)!.push(row as Record<string, unknown>);
    }

    // 3. Parse doctes -> build FresisHistoryRow for each FT/KT
    const dtFile = await DBFFile.open(doctesPath, { encoding: 'latin1' });
    const dtRows = await dtFile.readRecords();

    const records: FresisHistoryRow[] = [];
    let skippedOtherTypes = 0;
    const maxNumerodocByKey = new Map<string, number>();
    const now = new Date().toISOString();

    for (const dtRow of dtRows) {
      const row = dtRow as Record<string, unknown>;
      const tipodoc = trimStr(row.TIPODOC);

      if (!ALLOWED_DOC_TYPES.has(tipodoc)) {
        skippedOtherTypes++;
        continue;
      }

      const dtId = numVal(row.ID);
      const esercizio = trimStr(row.ESERCIZIO);
      const codicecf = normalizeSubClientCode(trimStr(row.CODICECF));
      const numerodoc = trimStr(row.NUMERODOC);
      const spesetr = numVal(row.SPESETR);
      const speseim = numVal(row.SPESEIM);
      const speseva = numVal(row.SPESEVA);
      const spesetriva = trimStr(row.SPESETRIVA);
      const speseimiva = trimStr(row.SPESEIMIVA);
      const spesevaiva = trimStr(row.SPESEVAIVA);
      const totdoc = numVal(row.TOTDOC);
      const totmerce = numVal(row.TOTMERCE);
      const totsconto = numVal(row.TOTSCONTO);
      const scontif = numVal(row.SCONTIF);

      // Track max NUMERODOC per ESERCIZIO|TIPODOC
      const numDocInt = parseInt(numerodoc, 10);
      if (!isNaN(numDocInt)) {
        const key = `${esercizio}|${tipodoc}`;
        const currentMax = maxNumerodocByKey.get(key) ?? 0;
        if (numDocInt > currentMax) maxNumerodocByKey.set(key, numDocInt);
      }

      const docDiscountPercent = totmerce > 0
        ? Math.round((totsconto / totmerce) * 10000) / 100 : 0;
      const totalShipping = spesetr + speseim + speseva;
      const shippingTax = calculateShippingTax(
        spesetr, spesetriva, speseim, speseimiva, speseva, spesevaiva,
      );

      const clientName = clientNameMap.get(codicecf) || codicecf;
      const rawDrRows = rowsByTesta.get(dtId) || [];

      // Build ArcaRiga[] and items[]
      const arcaRighe: ArcaRiga[] = [];
      const items: Array<Record<string, unknown>> = [];
      const globalDiscountPct = scontif < 1
        ? Math.round((1 - scontif) * 10000) / 100 : 0;
      let totalRevenue = 0;

      for (const drRow of rawDrRows) {
        const arcaRiga = buildArcaRiga(drRow);
        arcaRighe.push(arcaRiga);

        const articleCode = arcaRiga.CODICEARTI;
        const rowDiscount = parseCascadeDiscount(arcaRiga.SCONTI);
        const vat = parseFloat(arcaRiga.ALIIVA) || 0;
        const product = productLookup.get(articleCode);
        const listPrice = product?.listPrice ?? arcaRiga.PREZZOUN;
        const fresisDiscount = discountLookup.get(articleCode) ?? FRESIS_DEFAULT_DISCOUNT;

        totalRevenue += calculateItemRevenue(
          arcaRiga.PREZZOUN, arcaRiga.QUANTITA, rowDiscount,
          globalDiscountPct, listPrice, fresisDiscount,
        );

        items.push({
          productId: articleCode,
          productName: arcaRiga.DESCRIZION || articleCode,
          articleCode,
          description: arcaRiga.DESCRIZION,
          quantity: arcaRiga.QUANTITA,
          price: arcaRiga.PREZZOUN,
          total: arcaRiga.PREZZOTOT,
          unit: arcaRiga.UNMISURA,
          rowNumber: arcaRiga.NUMERORIGA,
          discount: rowDiscount || undefined,
          vat,
        });
      }

      const arcaTestata = buildArcaTestata(row);
      const arcaData: ArcaData = {
        testata: arcaTestata,
        righe: arcaRighe,
        destinazione_diversa: null,
      };

      const invoiceDate = formatDate(row.DATADOC);
      const invoiceNumber = `${tipodoc} ${numerodoc}/${esercizio}`;

      records.push({
        // Include TIPODOC in ID to distinguish FT/KT with same NUMERODOC
        id: deterministicId(userId, esercizio, tipodoc, numerodoc, codicecf),
        user_id: userId,
        original_pending_order_id: null,
        sub_client_codice: codicecf,
        sub_client_name: clientName,
        sub_client_data: null,
        customer_id: FRESIS_CUSTOMER_PROFILE,
        customer_name: FRESIS_CUSTOMER_NAME,
        items: JSON.stringify(items),
        discount_percent: docDiscountPercent || null,
        target_total_with_vat: totdoc,
        shipping_cost: totalShipping || null,
        shipping_tax: shippingTax || null,
        revenue: Math.round(totalRevenue * 100) / 100 || null,
        merged_into_order_id: null,
        merged_at: null,
        created_at: invoiceDate || now,
        updated_at: now,
        notes: trimStr(row.NOTE) || null,
        archibald_order_id: null,
        archibald_order_number: invoiceNumber,
        current_state: 'importato_arca',
        state_updated_at: now,
        ddt_number: null,
        ddt_delivery_date: null,
        tracking_number: null,
        tracking_url: null,
        tracking_courier: null,
        delivery_completed_date: null,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        invoice_amount: totdoc.toFixed(2),
        arca_data: JSON.stringify(arcaData),
        source: 'arca_import',
      });
    }

    return {
      records,
      errors,
      stats: {
        totalDocuments: records.length,
        totalRows: drRows.length,
        totalClients: clientNameMap.size,
        skippedOtherTypes,
      },
      maxNumerodocByKey,
    };
  } finally {
    cleanupTempDir(tmpDir);
  }
}
```

**Step 4: Verificare che i test passino**

Run: `npm test --prefix archibald-web-app/backend -- --run arca-sync-service`
Expected: PASS (tutti e 4 i test)

**Step 5: Commit**

```bash
git add archibald-web-app/backend/src/services/arca-sync-service.ts archibald-web-app/backend/src/services/arca-sync-service.spec.ts
git commit -m "feat(backend): parseNativeArcaFiles for direct doctes/docrig parsing"
```

---

## Task 3: Backend — generateVbsScript per export PWA→Arca (TDD)

**Files:**
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.ts`
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.spec.ts`

Genera uno script VBS che usa VFPOLEDB per inserire nuovi record FT/KT in doctes.dbf + docrig.dbf. Lo script:
- Usa il path relativo alla propria posizione (salvato nella cartella COOP16)
- Esegue INSERT INTO doctes per ogni testata
- Recupera l'ID generato via SELECT MAX(ID)
- Esegue INSERT INTO docrig per ogni riga con ID_TESTA corretto
- Log in sync_log.txt + MsgBox finale
- IMPORTANTE: eseguire con 32-bit wscript (generare anche .bat wrapper)

**Step 1: Scrivere i test per generateVbsScript**

```typescript
// Aggiungere a arca-sync-service.spec.ts
describe('generateVbsScript', () => {
  test('produces valid VBS with INSERT statements for FT records', async () => {
    const { generateVbsScript } = await import('./arca-sync-service');

    const testArcaData = {
      testata: {
        ESERCIZIO: '2026', TIPODOC: 'FT', NUMERODOC: '15001',
        DATADOC: '2026-03-08T00:00:00.000Z', CODICECF: 'C00123',
        TOTDOC: 250.50, TOTMERCE: 230.00, TOTNETTO: 230.00,
        TOTIVA: 20.50, TOTSCONTO: 0, SCONTI: '', SCONTIF: 0,
        // ... other fields default to empty/zero
      },
      righe: [{
        CODICEARTI: '847.104.033', NUMERORIGA: 1, QUANTITA: 2,
        PREZZOUN: 115.00, PREZZOTOT: 230.00, ALIIVA: '22',
        UNMISURA: 'PZ', SCONTI: '', DESCRIZION: 'Test Article',
        // ... other fields default to empty/zero
      }],
      destinazione_diversa: null,
    };

    const result = generateVbsScript([{
      invoiceNumber: 'FT 15001/2026',
      arcaData: testArcaData,
    }]);

    // Script structure checks
    expect(result.vbs).toContain('ADODB.Connection');
    expect(result.vbs).toContain('vfpoledb.1');
    expect(result.vbs).toContain('INSERT INTO doctes');
    expect(result.vbs).toContain('INSERT INTO docrig');
    expect(result.vbs).toContain("'FT'");
    expect(result.vbs).toContain("'15001'");
    expect(result.vbs).toContain('847.104.033');
    expect(result.vbs).toContain('sync_log.txt');

    // BAT wrapper
    expect(result.bat).toContain('SysWOW64');
    expect(result.bat).toContain('wscript.exe');
  });

  test('escapes single quotes in string values', async () => {
    const { generateVbsScript } = await import('./arca-sync-service');

    const testArcaData = {
      testata: {
        ESERCIZIO: '2026', TIPODOC: 'FT', NUMERODOC: '15002',
        DATADOC: '2026-03-08T00:00:00.000Z', CODICECF: 'C00456',
        NOTE: "Cliente O'Brien - nota speciale",
        TOTDOC: 100, TOTMERCE: 100, TOTNETTO: 100, TOTIVA: 0,
        TOTSCONTO: 0, SCONTI: '', SCONTIF: 0,
      },
      righe: [],
      destinazione_diversa: null,
    };

    const result = generateVbsScript([{
      invoiceNumber: 'FT 15002/2026',
      arcaData: testArcaData,
    }]);

    expect(result.vbs).toContain("O''Brien");
    expect(result.vbs).not.toContain("O'Brien");
  });

  test('returns empty script when no records to export', async () => {
    const { generateVbsScript } = await import('./arca-sync-service');
    const result = generateVbsScript([]);
    expect(result.vbs).toBe('');
    expect(result.bat).toBe('');
  });
});
```

**Step 2: Verificare che i test falliscano**

Run: `npm test --prefix archibald-web-app/backend -- --run arca-sync-service`
Expected: FAIL — generateVbsScript non esiste

**Step 3: Implementare generateVbsScript**

```typescript
// Aggiungere a arca-sync-service.ts

export interface VbsExportRecord {
  invoiceNumber: string;
  arcaData: ArcaData;
}

export interface VbsResult {
  vbs: string;
  bat: string;
}

function escapeVbsStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/'/g, "''");
}

function vbsDateLiteral(isoDate: string | null): string {
  if (!isoDate) return 'NULL';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return 'NULL';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `{d '${yyyy}-${mm}-${dd}'}`;
}

function padNumerodoc(num: string | number, width: number = 6): string {
  return String(num).padStart(width, ' ');
}

// Key testata fields to INSERT (skip ID — auto-increment)
const TESTATA_INSERT_FIELDS = [
  'ESERCIZIO', 'ESANNO', 'TIPODOC', 'NUMERODOC', 'DATADOC', 'CODICECF',
  'CODCNT', 'MAGPARTENZ', 'MAGARRIVO', 'AGENTE', 'AGENTE2', 'VALUTA',
  'PAG', 'SCONTI', 'SCONTIF', 'LISTINO', 'ZONA', 'SETTORE', 'DESTDIV',
  'DATACONSEG', 'NOTE', 'SPESETR', 'SPESETRIVA', 'SPESEIM', 'SPESEIMIVA',
  'SPESEVA', 'SPESEVAIVA', 'TOTIMP', 'TOTDOC', 'TOTIVA', 'TOTMERCE',
  'TOTSCONTO', 'TOTNETTO', 'TIPOFATT', 'EUROCAMBIO',
] as const;

// Key riga fields to INSERT (skip ID — auto-increment, include ID_TESTA)
const RIGA_INSERT_FIELDS = [
  'ID_TESTA', 'ESERCIZIO', 'TIPODOC', 'NUMERODOC', 'DATADOC', 'CODICECF',
  'AGENTE', 'CODICEARTI', 'NUMERORIGA', 'UNMISURA', 'QUANTITA', 'SCONTI',
  'PREZZOUN', 'PREZZOTOT', 'ALIIVA', 'DESCRIZION', 'EUROCAMBIO',
] as const;

// Date fields in testata/riga
const DATE_FIELDS = new Set(['DATADOC', 'DATADOCFOR', 'DATACONSEG', 'TRDATA', 'V1DATA', 'V2DATA', 'TIMESTAMP']);

// Numeric fields in testata
const NUMERIC_FIELDS_TESTATA = new Set([
  'SCONTIF', 'SCONTOCASF', 'CAMBIO', 'PESOLORDO', 'PESONETTO', 'VOLUME',
  'SPESETR', 'SPESEIM', 'SPESEVA', 'ACCONTO', 'ABBUONO', 'TOTIMP', 'TOTDOC',
  'SPESEBOLLI', 'SPESEINCAS', 'SPESEINEFF', 'SPESEINDOC', 'SPESEESENZ',
  'PERCPROVV', 'IMPPROVV', 'TOTPROVV', 'PERCPROVV2', 'IMPPROVV2', 'TOTPROVV2',
  'TOTIVA', 'TOTMERCE', 'TOTSCONTO', 'TOTNETTO', 'TOTESEN', 'IMPCOND',
  'RITCOND', 'EUROCAMBIO', 'NUMRIGHEPR',
]);

const NUMERIC_FIELDS_RIGA = new Set([
  'NUMERORIGA', 'QUANTITA', 'QUANTITARE', 'PREZZOUN', 'PREZZOTOT',
  'RESTOSCORP', 'RESTOSCUNI', 'RIFFROMT', 'RIFFROMR', 'PREZZOTOTM',
  'FATT', 'EUROCAMBIO', 'CAMBIO', 'ID_TESTA',
  'U_PESON', 'U_PESOL', 'U_COLLI', 'U_GIA',
]);

function vbsFieldValue(
  fieldName: string,
  value: unknown,
  numericFields: Set<string>,
): string {
  if (DATE_FIELDS.has(fieldName)) {
    return vbsDateLiteral(value as string | null);
  }
  if (numericFields.has(fieldName)) {
    const n = typeof value === 'number' ? value : Number(value);
    return isNaN(n) ? '0' : String(n);
  }
  // String field
  return `'${escapeVbsStr(value)}'`;
}

export function generateVbsScript(records: VbsExportRecord[]): VbsResult {
  if (records.length === 0) return { vbs: '', bat: '' };

  const lines: string[] = [];
  lines.push("' === Arca Sync Script ===");
  lines.push(`' Generated: ${new Date().toISOString()}`);
  lines.push(`' Records: ${records.length}`);
  lines.push("' Run with: C:\\Windows\\SysWOW64\\wscript.exe <this-script>");
  lines.push('');
  lines.push('Option Explicit');
  lines.push('Dim conn, rs, newId, fso, logFile, scriptDir, errCount, okCount');
  lines.push('');
  lines.push('Set fso = CreateObject("Scripting.FileSystemObject")');
  lines.push('scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)');
  lines.push('Set logFile = fso.CreateTextFile(scriptDir & "\\sync_log.txt", True)');
  lines.push('logFile.WriteLine "Sync started: " & Now()');
  lines.push('errCount = 0');
  lines.push('okCount = 0');
  lines.push('');
  lines.push('Set conn = CreateObject("ADODB.Connection")');
  lines.push('conn.Open "Provider=vfpoledb.1;Data Source=" & scriptDir & "\\"');
  lines.push('');

  for (const record of records) {
    const t = record.arcaData.testata;
    const righe = record.arcaData.righe;

    lines.push(`' --- ${record.invoiceNumber} ---`);
    lines.push('On Error Resume Next');

    // BUILD INSERT INTO doctes
    const testaFields = TESTATA_INSERT_FIELDS.join(', ');
    const testaValues = TESTATA_INSERT_FIELDS.map(f => {
      const val = (t as any)[f];
      if (f === 'NUMERODOC') return `'${padNumerodoc(val)}'`;
      return vbsFieldValue(f, val, NUMERIC_FIELDS_TESTATA);
    }).join(', ');

    lines.push(`conn.Execute "INSERT INTO doctes (${testaFields}) VALUES (${testaValues})"`);
    lines.push('');
    lines.push('If Err.Number <> 0 Then');
    lines.push(`  logFile.WriteLine "ERRORE ${record.invoiceNumber}: " & Err.Description`);
    lines.push('  errCount = errCount + 1');
    lines.push('  Err.Clear');
    lines.push('Else');

    // GET GENERATED ID
    const eser = escapeVbsStr(t.ESERCIZIO);
    const tipo = escapeVbsStr(t.TIPODOC);
    const numdoc = padNumerodoc(trimStr(t.NUMERODOC));
    lines.push(`  Set rs = conn.Execute("SELECT MAX(ID) AS MAXID FROM doctes WHERE ESERCIZIO='${eser}' AND TIPODOC='${tipo}' AND NUMERODOC='${numdoc}'")`);
    lines.push('  newId = rs("MAXID")');
    lines.push('  rs.Close');
    lines.push('');

    // INSERT RIGHE
    for (const riga of righe) {
      const rigaWithId = { ...riga, ID_TESTA: 0 }; // placeholder
      const rigaFields = RIGA_INSERT_FIELDS.join(', ');
      const rigaValues = RIGA_INSERT_FIELDS.map(f => {
        if (f === 'ID_TESTA') return '" & newId & "';
        const val = (rigaWithId as any)[f];
        return vbsFieldValue(f, val, NUMERIC_FIELDS_RIGA);
      }).join(', ');

      lines.push(`  conn.Execute "INSERT INTO docrig (${rigaFields}) VALUES (${rigaValues})"`);
      lines.push('  If Err.Number <> 0 Then');
      lines.push(`    logFile.WriteLine "  ERRORE riga ${riga.NUMERORIGA}: " & Err.Description`);
      lines.push('    Err.Clear');
      lines.push('  End If');
    }

    lines.push('');
    lines.push(`  logFile.WriteLine "OK: ${record.invoiceNumber} (ID=" & newId & ", ${righe.length} righe)"`);
    lines.push('  okCount = okCount + 1');
    lines.push('End If');
    lines.push('');
  }

  lines.push('conn.Close');
  lines.push('logFile.WriteLine ""');
  lines.push('logFile.WriteLine "Completato: " & okCount & " OK, " & errCount & " errori"');
  lines.push('logFile.Close');
  lines.push('MsgBox "Sync completata!" & vbCrLf & okCount & " documenti inseriti" & vbCrLf & errCount & " errori" & vbCrLf & vbCrLf & "Vedi sync_log.txt per dettagli", vbInformation, "Arca Sync"');

  const bat = [
    '@echo off',
    'echo Esecuzione sync Arca...',
    'C:\\Windows\\SysWOW64\\wscript.exe "%~dp0sync_arca.vbs"',
  ].join('\r\n');

  return { vbs: lines.join('\r\n'), bat };
}
```

**Step 4: Verificare che i test passino**

Run: `npm test --prefix archibald-web-app/backend -- --run arca-sync-service`
Expected: PASS

**Step 5: Commit**

```bash
git add archibald-web-app/backend/src/services/arca-sync-service.ts archibald-web-app/backend/src/services/arca-sync-service.spec.ts
git commit -m "feat(backend): VBS script generation for PWA-to-Arca export via VFPOLEDB"
```

---

## Task 4: Backend — Delta sync orchestration (TDD)

**Files:**
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.ts`
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.spec.ts`

La funzione `performArcaSync` orchestra tutto il flusso:
1. Parsa i DBF nativi → record candidati
2. Carica i record esistenti da DB
3. Determina: nuovi da importare, esistenti da skippare
4. Identifica record PWA da esportare verso Arca
5. Genera VBS script se ci sono export
6. Aggiorna ft_counter con i max NUMERODOC

**Step 1: Scrivere i test per performArcaSync**

```typescript
// Aggiungere a arca-sync-service.spec.ts
import type { DbPool } from '../db/pool';

function createMockPool(existingIds: Set<string> = new Set()): DbPool {
  const mockQuery = vi.fn().mockImplementation(async (text: string, params?: any[]) => {
    // getAll query → return empty or existing records
    if (text.includes('SELECT') && text.includes('fresis_history') && !text.includes('ft_counter')) {
      return { rows: [...existingIds].map(id => ({ id })), rowCount: existingIds.size };
    }
    // upsertRecords → return inserted count
    if (text.includes('INSERT INTO agents.fresis_history')) {
      return { rows: [{ id: params?.[0] }], rowCount: 1 };
    }
    // ft_counter update
    if (text.includes('ft_counter')) {
      return { rows: [], rowCount: 1 };
    }
    // getArcaExport (PWA records to export)
    if (text.includes('source') && text.includes('app')) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });

  return { query: mockQuery } as unknown as DbPool;
}

describe('performArcaSync', () => {
  test('imports new records and returns sync report', async () => {
    const { performArcaSync } = await import('./arca-sync-service');

    const doctesBuf = fs.readFileSync(path.join(COOP16_PATH, 'doctes.dbf'));
    const docrigBuf = fs.readFileSync(path.join(COOP16_PATH, 'docrig.dbf'));
    const anagrafeBuf = fs.readFileSync(path.join(COOP16_PATH, 'ANAGRAFE.DBF'));

    const pool = createMockPool();

    const result = await performArcaSync(
      pool, 'test-user',
      doctesBuf, docrigBuf, anagrafeBuf,
    );

    expect(result.imported).toBeGreaterThanOrEqual(14996);
    expect(result.skipped).toBe(0);
    expect(result.exported).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  test('skips already-existing records', async () => {
    const { performArcaSync, parseNativeArcaFiles } = await import('./arca-sync-service');

    const doctesBuf = fs.readFileSync(path.join(COOP16_PATH, 'doctes.dbf'));
    const docrigBuf = fs.readFileSync(path.join(COOP16_PATH, 'docrig.dbf'));

    // First parse to get IDs
    const parsed = await parseNativeArcaFiles(
      doctesBuf, docrigBuf, null, 'test-user', new Map(), new Map(),
    );
    const allIds = new Set(parsed.records.map(r => r.id));

    const pool = createMockPool(allIds);

    const result = await performArcaSync(
      pool, 'test-user',
      doctesBuf, docrigBuf, null,
    );

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(parsed.records.length);
  });
});
```

**Step 2: Verificare che i test falliscano**

Run: `npm test --prefix archibald-web-app/backend -- --run arca-sync-service`
Expected: FAIL — performArcaSync non esiste

**Step 3: Implementare performArcaSync**

```typescript
// Aggiungere a arca-sync-service.ts
import type { DbPool } from '../db/pool';
import * as fresisHistoryRepo from '../db/repositories/fresis-history';

export interface SyncResult {
  imported: number;
  skipped: number;
  exported: number;
  errors: string[];
  vbsScript: VbsResult | null;
  parseStats: NativeParseResult['stats'];
}

export async function performArcaSync(
  pool: DbPool,
  userId: string,
  doctesBuf: Buffer,
  docrigBuf: Buffer,
  anagrafeBuf: Buffer | null,
): Promise<SyncResult> {
  // 1. Parse native DBF files
  const parsed = await parseNativeArcaFiles(
    doctesBuf, docrigBuf, anagrafeBuf, userId,
    new Map(), new Map(), // Product/discount lookups — optional enhancement
  );

  if (parsed.errors.length > 0) {
    logger.warn(`Arca sync parse warnings: ${parsed.errors.join('; ')}`);
  }

  // 2. Load existing record IDs from DB
  const existingResult = await pool.query(
    'SELECT id FROM agents.fresis_history WHERE user_id = $1',
    [userId],
  );
  const existingIds = new Set(existingResult.rows.map((r: any) => r.id));

  // 3. Determine new records to import
  const newRecords = parsed.records.filter(r => !existingIds.has(r.id));
  const skipped = parsed.records.length - newRecords.length;

  // 4. Upsert new records in batches
  if (newRecords.length > 0) {
    await fresisHistoryRepo.upsertRecords(pool, userId, newRecords as any);
  }

  // 5. Update ft_counter with max NUMERODOC per ESERCIZIO|TIPODOC
  for (const [key, maxNum] of parsed.maxNumerodocByKey) {
    const [esercizio] = key.split('|');
    // Only update FT counter (KT has separate numbering handled elsewhere)
    if (key.endsWith('|FT')) {
      await pool.query(
        `INSERT INTO agents.ft_counter (esercizio, user_id, last_number)
         VALUES ($1, $2, $3)
         ON CONFLICT (esercizio, user_id)
         DO UPDATE SET last_number = GREATEST(agents.ft_counter.last_number, $3)`,
        [esercizio, userId, maxNum],
      );
    }
  }

  // 6. Find PWA records to export to Arca
  const pwaRecordsResult = await pool.query(
    `SELECT id, arca_data, invoice_number
     FROM agents.fresis_history
     WHERE user_id = $1 AND source = 'app' AND arca_data IS NOT NULL`,
    [userId],
  );

  // Build set of existing Arca documents (ESERCIZIO|TIPODOC|NUMERODOC)
  const arcaDocKeys = new Set<string>();
  for (const record of parsed.records) {
    const data = JSON.parse(record.arca_data!);
    const t = data.testata;
    arcaDocKeys.add(`${trimStr(t.ESERCIZIO)}|${trimStr(t.TIPODOC)}|${trimStr(t.NUMERODOC)}`);
  }

  // Filter PWA records not yet in Arca
  const toExport: VbsExportRecord[] = [];
  for (const row of pwaRecordsResult.rows) {
    try {
      const arcaData = typeof row.arca_data === 'string'
        ? JSON.parse(row.arca_data) : row.arca_data;
      const t = arcaData.testata;
      const key = `${trimStr(t.ESERCIZIO)}|${trimStr(t.TIPODOC)}|${trimStr(t.NUMERODOC)}`;
      if (!arcaDocKeys.has(key)) {
        toExport.push({ invoiceNumber: row.invoice_number, arcaData });
      }
    } catch (e) {
      logger.warn(`Skipping malformed arca_data for ${row.id}`);
    }
  }

  // 7. Generate VBS script if records to export
  const vbsScript = toExport.length > 0 ? generateVbsScript(toExport) : null;

  return {
    imported: newRecords.length,
    skipped,
    exported: toExport.length,
    errors: parsed.errors,
    vbsScript,
    parseStats: parsed.stats,
  };
}
```

**Step 4: Verificare che i test passino**

Run: `npm test --prefix archibald-web-app/backend -- --run arca-sync-service`
Expected: PASS

**Step 5: Verificare che il backend compili**

Run: `npm run build --prefix archibald-web-app/backend`
Expected: PASS

**Step 6: Commit**

```bash
git add archibald-web-app/backend/src/services/arca-sync-service.ts archibald-web-app/backend/src/services/arca-sync-service.spec.ts
git commit -m "feat(backend): delta sync orchestration for Arca bidirectional sync"
```

---

## Task 5: Backend — API route POST /api/arca-sync

**Files:**
- Create: `archibald-web-app/backend/src/routes/arca-sync.ts`
- Modify: `archibald-web-app/backend/src/server.ts`

**Step 1: Creare la route**

```typescript
// archibald-web-app/backend/src/routes/arca-sync.ts
import { Router } from 'express';
import multer from 'multer';
import type { AuthRequest } from '../auth';
import type { DbPool } from '../db/pool';
import { performArcaSync } from '../services/arca-sync-service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB (doctes ~10MB + docrig ~20MB)
});

export function createArcaSyncRouter(deps: { pool: DbPool; broadcast?: (userId: string, event: any) => void }) {
  const router = Router();

  router.post(
    '/',
    upload.fields([
      { name: 'doctes', maxCount: 1 },
      { name: 'docrig', maxCount: 1 },
      { name: 'anagrafe', maxCount: 1 },
    ]),
    async (req: AuthRequest, res) => {
      try {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        if (!files?.doctes?.[0] || !files?.docrig?.[0]) {
          return res.status(400).json({ error: 'doctes.dbf e docrig.dbf sono obbligatori' });
        }

        const doctesBuf = files.doctes[0].buffer;
        const docrigBuf = files.docrig[0].buffer;
        const anagrafeBuf = files.anagrafe?.[0]?.buffer ?? null;

        const result = await performArcaSync(
          deps.pool,
          req.user!.userId,
          doctesBuf,
          docrigBuf,
          anagrafeBuf,
        );

        deps.broadcast?.(req.user!.userId, {
          type: 'ARCA_SYNC_COMPLETED',
          payload: {
            imported: result.imported,
            exported: result.exported,
            skipped: result.skipped,
          },
          timestamp: new Date().toISOString(),
        });

        res.json({
          success: true,
          sync: {
            imported: result.imported,
            skipped: result.skipped,
            exported: result.exported,
            errors: result.errors,
          },
          parseStats: result.parseStats,
          vbsScript: result.vbsScript,
        });
      } catch (err: any) {
        console.error('Arca sync error:', err);
        res.status(500).json({ error: err.message || 'Sync failed' });
      }
    },
  );

  return router;
}
```

**Step 2: Registrare la route in server.ts**

In `archibald-web-app/backend/src/server.ts`, aggiungere:

```typescript
// Import
import { createArcaSyncRouter } from './routes/arca-sync';

// Dopo le altre route (vicino a fresis-history)
app.use('/api/arca-sync', authenticateJWT, createArcaSyncRouter({
  pool,
  broadcast: (userId, event) => wsServer.broadcast(userId, event),
}));
```

**Step 3: Verificare che il backend compili**

Run: `npm run build --prefix archibald-web-app/backend`
Expected: PASS

**Step 4: Verificare che i test esistenti non siano rotti**

Run: `npm test --prefix archibald-web-app/backend -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/arca-sync.ts archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): POST /api/arca-sync route for bidirectional sync"
```

---

## Task 6: Frontend — File System Access API wrapper

**Files:**
- Create: `archibald-web-app/frontend/src/services/arca-sync-browser.ts`

Wrapper per la File System Access API che:
1. Chiede accesso alla cartella COOP16 (showDirectoryPicker)
2. Legge doctes.dbf, docrig.dbf, ANAGRAFE.DBF
3. Scrive sync_arca.vbs e sync_arca.bat nella stessa cartella
4. Crea backup dei DBF prima di scrivere (se necessario in futuro)
5. Persiste il directory handle in IndexedDB per riuso

Vincoli Chrome 109: no `structuredClone`, no `Array.at()`, no `Object.hasOwn()`.

**Step 1: Creare il service**

```typescript
// archibald-web-app/frontend/src/services/arca-sync-browser.ts
import { fetchWithRetry } from '../utils/fetch-with-retry';

const DIR_HANDLE_DB_NAME = 'arca-sync-handles';
const DIR_HANDLE_STORE = 'directory-handles';
const DIR_HANDLE_KEY = 'coop16';

interface ArcaSyncResponse {
  success: boolean;
  sync: {
    imported: number;
    skipped: number;
    exported: number;
    errors: string[];
  };
  parseStats: {
    totalDocuments: number;
    totalRows: number;
    totalClients: number;
    skippedOtherTypes: number;
  };
  vbsScript: {
    vbs: string;
    bat: string;
  } | null;
}

// IndexedDB helpers for persisting directory handle
function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DIR_HANDLE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DIR_HANDLE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DIR_HANDLE_STORE, 'readwrite');
    tx.objectStore(DIR_HANDLE_STORE).put(handle, DIR_HANDLE_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DIR_HANDLE_STORE, 'readonly');
      const req = tx.objectStore(DIR_HANDLE_STORE).get(DIR_HANDLE_KEY);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
  // Try to reuse saved handle
  const saved = await loadDirectoryHandle();
  if (saved) {
    try {
      // Verify permission (Chrome may revoke between sessions)
      const perm = await (saved as any).queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') return saved;

      const requested = await (saved as any).requestPermission({ mode: 'readwrite' });
      if (requested === 'granted') return saved;
    } catch {
      // Handle expired — ask user again
    }
  }

  // Ask user to select COOP16 directory
  const handle = await (window as any).showDirectoryPicker({
    id: 'arca-coop16',
    mode: 'readwrite',
    startIn: 'desktop',
  });

  await saveDirectoryHandle(handle);
  return handle;
}

async function readFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<ArrayBuffer | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return await file.arrayBuffer();
  } catch {
    return null; // File not found
  }
}

async function writeFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: string,
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await (fileHandle as any).createWritable();
  await writable.write(content);
  await writable.close();
}

export type SyncProgress =
  | { stage: 'requesting-access' }
  | { stage: 'reading-files' }
  | { stage: 'uploading'; filesSize: number }
  | { stage: 'syncing' }
  | { stage: 'writing-vbs' }
  | { stage: 'done'; result: ArcaSyncResponse };

export async function performBrowserArcaSync(
  onProgress: (progress: SyncProgress) => void,
): Promise<ArcaSyncResponse> {
  // 1. Get directory access
  onProgress({ stage: 'requesting-access' });
  const dirHandle = await getDirectoryHandle();

  // 2. Read DBF files
  onProgress({ stage: 'reading-files' });
  const doctesBuf = await readFile(dirHandle, 'doctes.dbf');
  if (!doctesBuf) throw new Error('doctes.dbf non trovato nella cartella selezionata');

  const docrigBuf = await readFile(dirHandle, 'docrig.dbf');
  if (!docrigBuf) throw new Error('docrig.dbf non trovato nella cartella selezionata');

  // ANAGRAFE is optional (case-insensitive search)
  let anagrafeBuf: ArrayBuffer | null = null;
  for (const name of ['ANAGRAFE.DBF', 'anagrafe.dbf', 'Anagrafe.DBF']) {
    anagrafeBuf = await readFile(dirHandle, name);
    if (anagrafeBuf) break;
  }

  const totalSize = doctesBuf.byteLength + docrigBuf.byteLength + (anagrafeBuf?.byteLength ?? 0);
  onProgress({ stage: 'uploading', filesSize: totalSize });

  // 3. Upload to backend
  const formData = new FormData();
  formData.append('doctes', new Blob([doctesBuf]), 'doctes.dbf');
  formData.append('docrig', new Blob([docrigBuf]), 'docrig.dbf');
  if (anagrafeBuf) {
    formData.append('anagrafe', new Blob([anagrafeBuf]), 'ANAGRAFE.DBF');
  }

  onProgress({ stage: 'syncing' });
  const token = localStorage.getItem('archibald_jwt');
  const resp = await fetch('/api/arca-sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }

  const result: ArcaSyncResponse = await resp.json();

  // 4. Write VBS script if export records exist
  if (result.vbsScript) {
    onProgress({ stage: 'writing-vbs' });
    await writeFile(dirHandle, 'sync_arca.vbs', result.vbsScript.vbs);
    await writeFile(dirHandle, 'sync_arca.bat', result.vbsScript.bat);
  }

  onProgress({ stage: 'done', result });
  return result;
}

export function isFileSystemAccessSupported(): boolean {
  return 'showDirectoryPicker' in window;
}
```

**Step 2: Verificare che il frontend compili**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: potrebbe servire aggiungere tipi per File System Access API. Se manca, aggiungere al `tsconfig.json`:

```json
// In compilerOptions.types o in un file .d.ts
```

Oppure creare `archibald-web-app/frontend/src/types/file-system-access.d.ts`:

```typescript
// Minimal File System Access API types for Chrome 109+
interface FileSystemDirectoryHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  queryPermission(descriptor: { mode: string }): Promise<string>;
  requestPermission(descriptor: { mode: string }): Promise<string>;
}

interface FileSystemFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: string | ArrayBuffer | Blob): Promise<void>;
  close(): Promise<void>;
}

interface Window {
  showDirectoryPicker(options?: {
    id?: string;
    mode?: string;
    startIn?: string;
  }): Promise<FileSystemDirectoryHandle>;
}
```

**Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/services/arca-sync-browser.ts archibald-web-app/frontend/src/types/file-system-access.d.ts
git commit -m "feat(frontend): File System Access API wrapper for Arca sync"
```

---

## Task 7: Frontend — ArcaSyncButton component + page integration

**Files:**
- Create: `archibald-web-app/frontend/src/components/ArcaSyncButton.tsx`
- Modify: `archibald-web-app/frontend/src/pages/FresisHistoryPage.tsx`

**Step 1: Creare il componente ArcaSyncButton**

```typescript
// archibald-web-app/frontend/src/components/ArcaSyncButton.tsx
import { useState, useCallback } from 'react';
import type { SyncProgress } from '../services/arca-sync-browser';
import { performBrowserArcaSync, isFileSystemAccessSupported } from '../services/arca-sync-browser';

interface ArcaSyncButtonProps {
  onSyncComplete?: () => void;
}

const STAGE_MESSAGES: Record<string, string> = {
  'requesting-access': 'Accesso alla cartella...',
  'reading-files': 'Lettura DBF...',
  'uploading': 'Upload file...',
  'syncing': 'Sincronizzazione in corso...',
  'writing-vbs': 'Scrittura script VBS...',
  'done': 'Completato!',
};

export function ArcaSyncButton({ onSyncComplete }: ArcaSyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    exported: number;
    errors: string[];
    hasVbs: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setResult(null);

    try {
      const syncResult = await performBrowserArcaSync(setProgress);
      setResult({
        imported: syncResult.sync.imported,
        skipped: syncResult.sync.skipped,
        exported: syncResult.sync.exported,
        errors: syncResult.sync.errors,
        hasVbs: syncResult.vbsScript !== null,
      });
      onSyncComplete?.();
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('Selezione cartella annullata');
      } else {
        setError(e.message || 'Errore durante la sincronizzazione');
      }
    } finally {
      setSyncing(false);
    }
  }, [onSyncComplete]);

  if (!isFileSystemAccessSupported()) {
    return null; // Non mostrare il bottone su browser non supportati
  }

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    border: 'none',
    borderRadius: 6,
    cursor: syncing ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    fontSize: 13,
    background: syncing ? '#94a3b8' : '#2563eb',
    color: '#fff',
    opacity: syncing ? 0.7 : 1,
  };

  const resultBoxStyle: React.CSSProperties = {
    marginTop: 8,
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 12,
    lineHeight: 1.5,
    background: error ? '#fef2f2' : '#f0fdf4',
    border: `1px solid ${error ? '#fecaca' : '#bbf7d0'}`,
    color: error ? '#991b1b' : '#166534',
  };

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        onClick={handleSync}
        disabled={syncing}
        style={buttonStyle}
        title="Sincronizza documenti FT/KT tra PWA e ArcaPro"
      >
        {syncing && (
          <span style={{
            display: 'inline-block', width: 14, height: 14,
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        )}
        {syncing
          ? (progress ? STAGE_MESSAGES[progress.stage] || 'Sincronizzazione...' : 'Sincronizzazione...')
          : 'Sincronizza con Arca'}
      </button>

      {(result || error) && (
        <div style={resultBoxStyle}>
          {error && <div>{error}</div>}
          {result && (
            <>
              <div>Importati: <strong>{result.imported}</strong> documenti da Arca</div>
              {result.skipped > 0 && <div>Esistenti: {result.skipped} (saltati)</div>}
              {result.exported > 0 && (
                <div>
                  Esportati: <strong>{result.exported}</strong> documenti verso Arca
                  {result.hasVbs && (
                    <div style={{ marginTop: 4, fontWeight: 600 }}>
                      Esegui <code>sync_arca.bat</code> nella cartella COOP16 per completare
                    </div>
                  )}
                </div>
              )}
              {result.errors.length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: 'pointer' }}>{result.errors.length} avvisi</summary>
                  <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
                    {result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Integrare in FresisHistoryPage.tsx**

In `FresisHistoryPage.tsx`, nella sezione header con i bottoni esistenti ("Importa da Arca", "Aggiorna Stati", "Esporta verso Arca"), aggiungere il bottone ArcaSyncButton.

Cercare il blocco con i bottoni nella toolbar (circa riga 400-450) e aggiungere:

```typescript
// Import in testa al file
import { ArcaSyncButton } from '../components/ArcaSyncButton';

// Nella toolbar, accanto ai bottoni esistenti:
<ArcaSyncButton onSyncComplete={loadOrders} />
```

Dove `loadOrders` è la funzione che ricarica la lista ordini (già presente nella pagina).

**Step 3: Aggiungere CSS animation per lo spinner**

In `archibald-web-app/frontend/index.html` o in un file CSS globale, verificare che esista:

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

Se non esiste, aggiungerlo. NOTA: probabilmente è già presente dato che la PWA ha già spinner altrove.

**Step 4: Verificare che il frontend compili**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/ArcaSyncButton.tsx archibald-web-app/frontend/src/pages/FresisHistoryPage.tsx
git commit -m "feat(frontend): ArcaSyncButton for 1-click Arca bidirectional sync"
```

---

## Task 8: Build verification + final commit

**Step 1: Backend build**

Run: `npm run build --prefix archibald-web-app/backend`
Expected: PASS

**Step 2: Backend tests**

Run: `npm test --prefix archibald-web-app/backend -- --run`
Expected: PASS (tutti i test, inclusi i nuovi)

**Step 3: Frontend type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 4: Frontend tests**

Run: `npm test --prefix archibald-web-app/frontend -- --run`
Expected: PASS

**Step 5: Final commit (se ci sono fix)**

Se i passaggi precedenti hanno richiesto fix, creare un commit finale:

```bash
git add -A
git commit -m "fix(arca-sync): resolve build and test issues"
```

---

## Riepilogo file coinvolti

### Backend
| File | Azione | Descrizione |
|------|--------|-------------|
| `src/arca-import-service.ts` | Modify | Export 6 helper functions |
| `src/services/arca-sync-service.ts` | **Create** | parseNativeArcaFiles + generateVbsScript + performArcaSync |
| `src/services/arca-sync-service.spec.ts` | **Create** | Test con file COOP16 reali |
| `src/routes/arca-sync.ts` | **Create** | POST /api/arca-sync con multer |
| `src/server.ts` | Modify | Registrare la nuova route |

### Frontend
| File | Azione | Descrizione |
|------|--------|-------------|
| `src/services/arca-sync-browser.ts` | **Create** | File System Access API + IndexedDB handle persistence |
| `src/types/file-system-access.d.ts` | **Create** | Type definitions per Chrome 109+ |
| `src/components/ArcaSyncButton.tsx` | **Create** | Bottone 1-click con progress + report |
| `src/pages/FresisHistoryPage.tsx` | Modify | Aggiungere ArcaSyncButton nella toolbar |

### Flusso completo end-to-end

```
Utente clicca "Sincronizza con Arca"
  ↓
Browser chiede accesso cartella COOP16 (prima volta)
  ↓
Browser legge doctes.dbf + docrig.dbf + ANAGRAFE.DBF
  ↓
Upload via POST /api/arca-sync (FormData multipart)
  ↓
Backend: parseNativeArcaFiles → 15K+ FresisHistoryRow[]
  ↓
Backend: delta sync (skip esistenti, upsert nuovi)
  ↓
Backend: trova record PWA source='app' non in Arca
  ↓
Backend: generateVbsScript → script INSERT VFPOLEDB
  ↓
Response JSON → frontend
  ↓
Browser scrive sync_arca.vbs + sync_arca.bat in COOP16
  ↓
Mostra report: "Importati X, Esportati Y"
  ↓
Se Y > 0: "Esegui sync_arca.bat nella cartella COOP16"
  ↓
Utente doppio-click su sync_arca.bat → VBS esegue INSERT → Arca aggiornato
```
