# Fresis FT Auto-Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically generate ArcaPro-compatible FT documents when orders are sent to Verona, populating `arcaData` in `fresis_history`.

**Architecture:** A pure function `generateArcaData()` maps `FresisHistoryRecord` fields to `ArcaData` JSON. It is called from `send-to-verona.ts` after successful bot invio. The FT number comes from the existing `getNextFtNumber` service.

**Tech Stack:** TypeScript, PostgreSQL (pg pool), Vitest, existing `ArcaData`/`ArcaTestata`/`ArcaRiga` types.

---

### Task 1: Pure function `generateArcaData`

**Files:**
- Create: `archibald-web-app/backend/src/services/generate-arca-data.ts`
- Test: `archibald-web-app/backend/src/services/generate-arca-data.spec.ts`

**Step 1: Write the failing test**

Create `generate-arca-data.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { generateArcaData } from './generate-arca-data';

const SAMPLE_RECORD = {
  id: 'rec-001',
  subClientCodice: 'C00966',
  subClientName: 'SALVATORE BOVE',
  subClientData: {
    cap: '80058',
    prov: 'NA',
    zona: '3',
    codice: 'C00966',
    localita: 'TORRE ANNUNZIATA',
    indirizzo: 'VIA TORRETTA DI SICA',
    ragioneSociale: 'SALVATORE BOVE',
  },
  items: [
    { articleCode: 'H379.104.014', description: 'Prodotto A', quantity: 10, price: 25.50, vat: 22, discount: 10 },
    { articleCode: '456.001.002', description: 'Prodotto B', quantity: 5, price: 100.00, vat: 22 },
  ],
  discountPercent: undefined,
  shippingCost: undefined,
  notes: 'Test note',
};

describe('generateArcaData', () => {
  test('generates testata with correct document fields', () => {
    const result = generateArcaData(SAMPLE_RECORD, 42, '2026');

    expect(result.testata.TIPODOC).toBe('FT');
    expect(result.testata.NUMERODOC).toBe('42');
    expect(result.testata.ESERCIZIO).toBe('2026');
    expect(result.testata.CODICECF).toBe('C00966');
    expect(result.testata.VALUTA).toBe('EUR');
    expect(result.testata.CAMBIO).toBe(1);
  });

  test('generates correct number of righe', () => {
    const result = generateArcaData(SAMPLE_RECORD, 1, '2026');

    expect(result.righe).toHaveLength(2);
    expect(result.righe[0].CODICEARTI).toBe('H379.104.014');
    expect(result.righe[0].QUANTITA).toBe(10);
    expect(result.righe[0].PREZZOUN).toBe(25.50);
    expect(result.righe[0].ALIIVA).toBe('22');
    expect(result.righe[0].NUMERORIGA).toBe(1);
    expect(result.righe[1].NUMERORIGA).toBe(2);
  });

  test('calculates PREZZOTOT per riga using Archibald formula', () => {
    const result = generateArcaData(SAMPLE_RECORD, 1, '2026');

    // riga 0: round2(10 * 25.50 * (1 - 10/100)) = round2(229.50) = 229.50
    expect(result.righe[0].PREZZOTOT).toBe(229.50);
    expect(result.righe[0].SCONTI).toBe('10');
    // riga 1: round2(5 * 100 * (1 - 0/100)) = 500.00
    expect(result.righe[1].PREZZOTOT).toBe(500.00);
    expect(result.righe[1].SCONTI).toBe('');
  });

  test('calculates testata totals from righe', () => {
    const result = generateArcaData(SAMPLE_RECORD, 1, '2026');

    // TOTMERCE = sum of (qty * price) = (10*25.50) + (5*100) = 255 + 500 = 755
    expect(result.testata.TOTMERCE).toBe(755);
    // TOTNETTO = sum of PREZZOTOT = 229.50 + 500 = 729.50
    expect(result.testata.TOTNETTO).toBe(729.50);
    // TOTIVA = round2(729.50 * 0.22) = 160.49
    expect(result.testata.TOTIVA).toBe(160.49);
    // TOTDOC = 729.50 + 160.49 = 889.99
    expect(result.testata.TOTDOC).toBe(889.99);
    // TOTSCONTO = 755 - 729.50 = 25.50
    expect(result.testata.TOTSCONTO).toBe(25.50);
  });

  test('sets DATADOC from provided date', () => {
    const result = generateArcaData(SAMPLE_RECORD, 1, '2026', '2026-03-08T14:30:00Z');

    expect(result.testata.DATADOC).toBe('20260308');
  });

  test('defaults DATADOC to today if not provided', () => {
    const result = generateArcaData(SAMPLE_RECORD, 1, '2026');
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    expect(result.testata.DATADOC).toBe(today);
  });

  test('populates destinazione_diversa from subClientData', () => {
    const result = generateArcaData(SAMPLE_RECORD, 1, '2026');

    expect(result.destinazione_diversa).not.toBeNull();
    expect(result.destinazione_diversa!.CODICECF).toBe('C00966');
    expect(result.destinazione_diversa!.RAGIONESOC).toBe('SALVATORE BOVE');
    expect(result.destinazione_diversa!.INDIRIZZO).toBe('VIA TORRETTA DI SICA');
    expect(result.destinazione_diversa!.CAP).toBe('80058');
    expect(result.destinazione_diversa!.LOCALITA).toBe('TORRE ANNUNZIATA');
    expect(result.destinazione_diversa!.PROVINCIA).toBe('NA');
  });

  test('riga inherits testata shared fields', () => {
    const result = generateArcaData(SAMPLE_RECORD, 7, '2026');

    for (const riga of result.righe) {
      expect(riga.ESERCIZIO).toBe('2026');
      expect(riga.TIPODOC).toBe('FT');
      expect(riga.NUMERODOC).toBe('7');
      expect(riga.CODICECF).toBe('C00966');
      expect(riga.VALUTA).toBe('EUR');
      expect(riga.CAMBIO).toBe(1);
    }
  });

  test('handles items without discount', () => {
    const record = {
      ...SAMPLE_RECORD,
      items: [{ articleCode: 'X', description: 'Y', quantity: 1, price: 100, vat: 22 }],
    };
    const result = generateArcaData(record, 1, '2026');

    expect(result.righe[0].SCONTI).toBe('');
    expect(result.righe[0].PREZZOTOT).toBe(100);
  });

  test('handles global discount on testata', () => {
    const record = { ...SAMPLE_RECORD, discountPercent: 5 };
    const result = generateArcaData(record, 1, '2026');

    expect(result.testata.SCONTI).toBe('5');
    expect(result.testata.SCONTIF).toBeCloseTo(0.95, 4);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run src/services/generate-arca-data.spec.ts`
Expected: FAIL — module not found

**Step 3: Implement `generateArcaData`**

Create `generate-arca-data.ts`:

```typescript
import type { ArcaData, ArcaTestata, ArcaRiga, ArcaDestinazione } from '../../frontend/src/types/arca-data';

type GenerateInput = {
  subClientCodice: string;
  subClientName: string;
  subClientData?: {
    ragioneSociale?: string;
    supplRagioneSociale?: string;
    indirizzo?: string;
    cap?: string;
    localita?: string;
    prov?: string;
    zona?: string;
    telefono?: string;
    fax?: string;
    persDaContattare?: string;
  } | null;
  items: Array<{
    articleCode: string;
    description?: string;
    productName?: string;
    quantity: number;
    price: number;
    vat: number;
    discount?: number;
    unit?: string;
  }>;
  discountPercent?: number;
  shippingCost?: number;
  notes?: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDateYYYYMMDD(isoOrNow?: string): string {
  const d = isoOrNow ? new Date(isoOrNow) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function generateArcaData(
  record: GenerateInput,
  ftNumber: number,
  esercizio: string,
  dateIso?: string,
): ArcaData {
  const datadoc = formatDateYYYYMMDD(dateIso);
  const numerodoc = String(ftNumber);
  const codicecf = record.subClientCodice;
  const zona = record.subClientData?.zona ?? '0';

  // Build righe
  const righe: ArcaRiga[] = record.items.map((item, i) => {
    const disc = item.discount ?? 0;
    const prezzotot = round2(item.quantity * item.price * (1 - disc / 100));

    return {
      ID: i + 1,
      ID_TESTA: 0,
      ESERCIZIO: esercizio,
      TIPODOC: 'FT',
      NUMERODOC: numerodoc,
      DATADOC: datadoc,
      CODICECF: codicecf,
      MAGPARTENZ: '',
      MAGARRIVO: '',
      AGENTE: '',
      AGENTE2: '',
      VALUTA: 'EUR',
      CAMBIO: 1,
      CODICEARTI: item.articleCode,
      NUMERORIGA: i + 1,
      ESPLDISTIN: '',
      UNMISURA: item.unit ?? 'PZ',
      QUANTITA: item.quantity,
      QUANTITARE: 0,
      SCONTI: disc > 0 ? String(disc) : '',
      PREZZOUN: item.price,
      PREZZOTOT: prezzotot,
      ALIIVA: String(item.vat),
      CONTOSCARI: '',
      OMIVA: false,
      OMMERCE: false,
      PROVV: '',
      PROVV2: '',
      DATACONSEG: null,
      DESCRIZION: item.description ?? item.productName ?? '',
      TIPORIGAD: '',
      RESTOSCORP: 0,
      RESTOSCUNI: 0,
      CODCAUMAG: '',
      ZONA: zona,
      SETTORE: '',
      GRUPPO: '',
      CLASSE: '',
      RIFFROMT: 0,
      RIFFROMR: 0,
      PREZZOTOTM: 0,
      NOTE: '',
      COMMESSA: '',
      TIMESTAMP: null,
      USERNAME: '',
      FATT: 0,
      LOTTO: '',
      MATRICOLA: '',
      EUROCAMBIO: 0,
      U_PESON: 0,
      U_PESOL: 0,
      U_COLLI: 0,
      U_GIA: 0,
      U_MAGP: '',
      U_MAGA: '',
    };
  });

  // Calculate totals
  const totmerce = round2(record.items.reduce((s, it) => s + it.quantity * it.price, 0));
  const totnetto = round2(righe.reduce((s, r) => s + r.PREZZOTOT, 0));
  const totsconto = round2(totmerce - totnetto);

  // Group by VAT rate and calculate TOTIVA
  const vatGroups = new Map<number, number>();
  for (const riga of righe) {
    const rate = Number(riga.ALIIVA) || 0;
    vatGroups.set(rate, (vatGroups.get(rate) ?? 0) + riga.PREZZOTOT);
  }
  const totiva = round2(
    Array.from(vatGroups.entries()).reduce((s, [rate, base]) => s + round2(base * rate / 100), 0),
  );

  const totdoc = round2(totnetto + totiva);

  // Global discount
  const globalDisc = record.discountPercent ?? 0;
  const sconti = globalDisc > 0 ? String(globalDisc) : '';
  const scontif = globalDisc > 0 ? round2((100 - globalDisc) / 100 * 10000) / 10000 : 1;

  // Testata
  const testata: ArcaTestata = {
    ID: 0,
    ESERCIZIO: esercizio,
    ESANNO: '',
    TIPODOC: 'FT',
    NUMERODOC: numerodoc,
    DATADOC: datadoc,
    CODICECF: codicecf,
    CODCNT: '',
    MAGPARTENZ: '',
    MAGARRIVO: '',
    NUMRIGHEPR: righe.length,
    AGENTE: '',
    AGENTE2: '',
    VALUTA: 'EUR',
    PAG: '',
    SCONTI: sconti,
    SCONTIF: scontif,
    SCONTOCASS: '',
    SCONTOCASF: 1,
    PROVV: '',
    PROVV2: '',
    CAMBIO: 1,
    DATADOCFOR: null,
    NUMERODOCF: '',
    TIPOMODULO: '',
    LISTINO: '',
    ZONA: zona,
    SETTORE: '',
    DESTDIV: '',
    DATACONSEG: null,
    TRDATA: null,
    TRORA: '',
    PESOLORDO: 0,
    PESONETTO: 0,
    VOLUME: 0,
    VETTORE1: '',
    V1DATA: null,
    V1ORA: '',
    VETTORE2: '',
    V2DATA: null,
    V2ORA: '',
    TRCAUSALE: '',
    COLLI: '',
    SPEDIZIONE: '',
    PORTO: '',
    NOTE: record.notes ?? '',
    SPESETR: 0,
    SPESETRIVA: '',
    SPESETRCP: '',
    SPESETRPER: '',
    SPESEIM: 0,
    SPESEIMIVA: '',
    SPESEIMCP: '',
    SPESEVA: 0,
    SPESEVAIVA: '',
    SPESEVACP: '',
    ACCONTO: 0,
    ABBUONO: 0,
    TOTIMP: totnetto,
    TOTDOC: totdoc,
    SPESE: '',
    SPESEBOLLI: 0,
    SPESEINCAS: 0,
    SPESEINEFF: 0,
    SPESEINDOC: 0,
    SPESEINIVA: '',
    SPESEINCP: '',
    SPESEESENZ: 0,
    CODCAUMAG: '',
    CODBANCA: '',
    PERCPROVV: 0,
    IMPPROVV: 0,
    TOTPROVV: 0,
    PERCPROVV2: 0,
    IMPPROVV2: 0,
    TOTPROVV2: 0,
    TOTIVA: totiva,
    ASPBENI: '',
    SCORPORO: false,
    TOTMERCE: totmerce,
    TOTSCONTO: totsconto,
    TOTNETTO: totnetto,
    TOTESEN: 0,
    IMPCOND: 0,
    RITCOND: 0,
    TIPOFATT: '',
    TRIANGOLAZ: false,
    NOMODIFICA: false,
    NOEVASIONE: false,
    COMMESSA: '',
    EUROCAMBIO: 0,
    EXPORT_I: false,
    CB_BIC: '',
    CB_NAZIONE: '',
    CB_CIN_UE: '',
    CB_CIN_IT: '',
    ABICAB: '',
    CONTOCORR: '',
    CARICATORE: '',
    COMMITTENT: '',
    PROPRMERCE: '',
    LUOGOCAR: '',
    LUOGOSCAR: '',
    SDTALTRO: '',
    TIMESTAMP: null,
    USERNAME: '',
  };

  // Destinazione diversa
  const sd = record.subClientData;
  const destinazione_diversa: ArcaDestinazione | null = sd ? {
    CODICECF: codicecf,
    CODICEDES: '001',
    RAGIONESOC: sd.ragioneSociale ?? record.subClientName,
    SUPPRAGSOC: sd.supplRagioneSociale ?? '',
    INDIRIZZO: sd.indirizzo ?? '',
    CAP: sd.cap ?? '',
    LOCALITA: sd.localita ?? '',
    PROVINCIA: sd.prov ?? '',
    CODNAZIONE: 'IT',
    AGENTE: '',
    AGENTE2: '',
    SETTORE: '',
    ZONA: sd.zona ?? '0',
    VETTORE: '',
    TELEFONO: sd.telefono ?? '',
    FAX: sd.fax ?? '',
    PERSONARIF: sd.persDaContattare ?? '',
    TIMESTAMP: null,
    USERNAME: '',
  } : null;

  return { testata, righe, destinazione_diversa };
}

export { generateArcaData, round2, formatDateYYYYMMDD };
export type { GenerateInput };
```

Note: The import path for types needs adjustment — since backend doesn't share frontend types directly, copy the relevant types or import from a shared location. Check how `arca-data-types.ts` is used in existing `arca-export-service.ts` and follow the same pattern.

**Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --run src/services/generate-arca-data.spec.ts`
Expected: PASS (all 9 tests)

**Step 5: Commit**

```bash
git add archibald-web-app/backend/src/services/generate-arca-data.ts archibald-web-app/backend/src/services/generate-arca-data.spec.ts
git commit -m "feat(backend): add generateArcaData pure function for FT creation"
```

---

### Task 2: Wire `generateArcaData` into `send-to-verona` handler

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/send-to-verona.ts`
- Test: `archibald-web-app/backend/src/operations/handlers/send-to-verona.spec.ts`

**Step 1: Write the failing integration test**

Add to `send-to-verona.spec.ts` a new test case:

```typescript
test('generates arcaData for linked fresis_history records after successful send', async () => {
  // Setup: insert a fresis_history record with arcaData = null
  // and archibald_order_id matching the order being sent
  await pool.query(`
    INSERT INTO agents.fresis_history (id, user_id, sub_client_codice, sub_client_name,
      sub_client_data, customer_id, customer_name, items, archibald_order_id,
      created_at, updated_at, source)
    VALUES ($1, $2, 'C00966', 'TEST CLIENT',
      '{"ragioneSociale":"TEST CLIENT","indirizzo":"VIA TEST","cap":"80058","localita":"NAPOLI","prov":"NA","zona":"3"}',
      '55.261', 'Fresis Soc Cooperativa',
      '[{"articleCode":"H379","description":"Test","quantity":2,"price":50,"vat":22}]',
      $3, NOW(), NOW(), 'app')
  `, [fresisRecordId, userId, orderId]);

  // Act: call handleSendToVerona
  const result = await handleSendToVerona(pool, mockBot, { orderId }, userId, mockProgress);

  // Assert: fresis_history now has arcaData
  const { rows } = await pool.query(
    'SELECT arca_data, invoice_number, current_state FROM agents.fresis_history WHERE id = $1',
    [fresisRecordId],
  );
  expect(rows[0].arca_data).not.toBeNull();
  expect(rows[0].arca_data.testata.TIPODOC).toBe('FT');
  expect(rows[0].arca_data.testata.CODICECF).toBe('C00966');
  expect(rows[0].arca_data.righe).toHaveLength(1);
  expect(rows[0].invoice_number).toMatch(/^FT \d+\/2026$/);
  expect(rows[0].current_state).toBe('inviato_milano');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run src/operations/handlers/send-to-verona.spec.ts`
Expected: FAIL — arcaData is null

**Step 3: Add FT generation to `send-to-verona.ts`**

After line 58 (the `sent_to_milano_at` update), add:

```typescript
  // Generate FT documents for linked fresis_history records
  onProgress(85, 'Generazione documenti FT');

  const { rows: fresisRecords } = await pool.query<{
    id: string;
    items: unknown;
    sub_client_codice: string;
    sub_client_name: string;
    sub_client_data: unknown;
    discount_percent: number | null;
    shipping_cost: number | null;
    notes: string | null;
  }>(
    `SELECT id, items, sub_client_codice, sub_client_name, sub_client_data,
            discount_percent, shipping_cost, notes
     FROM agents.fresis_history
     WHERE user_id = $1
       AND archibald_order_id = $2
       AND arca_data IS NULL
       AND source = 'app'`,
    [userId, data.orderId],
  );

  const esercizio = String(new Date().getFullYear());

  for (const rec of fresisRecords) {
    const ftNumber = await getNextFtNumber(pool, userId, esercizio);
    const arcaData = generateArcaData(
      {
        subClientCodice: rec.sub_client_codice,
        subClientName: rec.sub_client_name,
        subClientData: rec.sub_client_data as GenerateInput['subClientData'],
        items: rec.items as GenerateInput['items'],
        discountPercent: rec.discount_percent ?? undefined,
        shippingCost: rec.shipping_cost ?? undefined,
        notes: rec.notes ?? undefined,
      },
      ftNumber,
      esercizio,
      sentToMilanoAt,
    );

    await pool.query(
      `UPDATE agents.fresis_history
       SET arca_data = $1,
           invoice_number = $2,
           current_state = 'inviato_milano',
           state_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = $3 AND user_id = $4`,
      [JSON.stringify(arcaData), `FT ${ftNumber}/${esercizio}`, rec.id, userId],
    );
  }

  onProgress(95, 'Documenti FT generati');
```

Add imports at top:

```typescript
import { generateArcaData } from '../../services/generate-arca-data';
import type { GenerateInput } from '../../services/generate-arca-data';
import { getNextFtNumber } from '../../services/ft-counter';
```

**Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --run src/operations/handlers/send-to-verona.spec.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend -- --run`
Expected: All pass, no type errors

**Step 6: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/send-to-verona.ts archibald-web-app/backend/src/operations/handlers/send-to-verona.spec.ts
git commit -m "feat(backend): generate FT arcaData on send-to-verona"
```

---

### Task 3: Propagate state to sibling fresis records

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/send-to-verona.ts`

**Step 1: Write the failing test**

Add to `send-to-verona.spec.ts`:

```typescript
test('propagates inviato_milano state to merged sibling records', async () => {
  // Insert mother record + 2 merged child records
  const motherId = 'mother-001';
  await pool.query(`
    INSERT INTO agents.fresis_history (id, user_id, sub_client_codice, sub_client_name,
      customer_id, customer_name, items, archibald_order_id, merged_into_order_id,
      created_at, updated_at, source)
    VALUES
      ($1, $2, 'C001', 'Client A', '55.261', 'Fresis', '[]', $3, NULL, NOW(), NOW(), 'app'),
      ($4, $2, 'C002', 'Client B', '55.261', 'Fresis', '[]', NULL, $3, NOW(), NOW(), 'app')
  `, [motherId, userId, orderId, 'child-001']);

  await handleSendToVerona(pool, mockBot, { orderId }, userId, mockProgress);

  const { rows } = await pool.query(
    'SELECT id, current_state FROM agents.fresis_history WHERE user_id = $1 AND (archibald_order_id = $2 OR merged_into_order_id = $2)',
    [userId, orderId],
  );
  expect(rows.every(r => r.current_state === 'inviato_milano')).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Expected: child record still has old state

**Step 3: Add sibling state propagation**

After the FT generation loop in `send-to-verona.ts`, add:

```typescript
  // Propagate state to merged siblings (records linked via merged_into_order_id)
  await pool.query(
    `UPDATE agents.fresis_history
     SET current_state = 'inviato_milano', state_updated_at = NOW(), updated_at = NOW()
     WHERE user_id = $1
       AND merged_into_order_id = $2
       AND source = 'app'`,
    [userId, data.orderId],
  );
```

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git commit -am "feat(backend): propagate inviato_milano state to merged siblings"
```

---

### Task 4: Type-check and full integration

**Step 1: Backend type-check**

Run: `npm run build --prefix archibald-web-app/backend`
Expected: No errors

**Step 2: Backend full test suite**

Run: `npm test --prefix archibald-web-app/backend -- --run`
Expected: All pass

**Step 3: Frontend type-check** (no frontend changes, but verify nothing broke)

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: No errors

**Step 4: Commit and push**

```bash
git push origin master
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|----------------|
| 1 | Pure function `generateArcaData` + tests | 5 steps |
| 2 | Wire into `send-to-verona` handler + integration test | 6 steps |
| 3 | Sibling state propagation | 5 steps |
| 4 | Type-check and full integration | 4 steps |

**Total: 4 tasks, ~20 steps**

## Notes for implementer

- The `ArcaData` types are defined in `frontend/src/types/arca-data.ts`. Check how `arca-export-service.ts` imports them — follow the same pattern (likely a symlink or re-export in backend).
- `getNextFtNumber` is in `backend/src/services/ft-counter.ts` and uses PostgreSQL atomic upsert.
- The `round2` function must match the Archibald formula: `Math.round(n * 100) / 100`.
- Items come from `fresis_history.items` JSONB column — already deserialized by pg driver.
- `sub_client_data` is also JSONB — already an object, no need to parse.
