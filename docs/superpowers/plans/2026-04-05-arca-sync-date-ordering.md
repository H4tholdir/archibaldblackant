# Arca Sync — Date Progressive + KT Sync Bidirezionale

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantire `date(N) ≤ date(N+1)` per ogni coppia di documenti consecutivi e includere le KT pendenti nella sync bidirezionale con date corrette.

**Architecture:** Aggiunge colonna `last_date DATE` a `agents.ft_counter`; estende `getNextDocNumber` con un parametro `docDate`; `parseNativeArcaFiles` traccia `maxDateByKey` e `performArcaSync` aggiorna `last_date` dopo import; `generateKtExportVbs` calcola `effectiveLastDate` per esercizio e assegna date monotone crescenti alle KT; route `/kt-sync` individuale applica la stessa logica.

**Tech Stack:** PostgreSQL `pg`, TypeScript strict, Vitest.

---

### Task 1: Migration 051 — ADD COLUMN last_date

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/051-ft-counter-last-date.sql`

- [ ] **Step 1: Crea il file di migration**

```sql
-- Migration 051: Add last_date to agents.ft_counter for chronological date ordering

ALTER TABLE agents.ft_counter
  ADD COLUMN IF NOT EXISTS last_date DATE;
```

- [ ] **Step 2: Verifica che il backend compili**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: `Build succeeded` senza errori TypeScript.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/051-ft-counter-last-date.sql
git commit -m "feat(ft-counter): migration 051 — add last_date column"
```

---

### Task 2: `getNextDocNumber` — aggiunta parametro `docDate`

**Files:**
- Modify: `archibald-web-app/backend/src/services/ft-counter.ts`
- Modify: `archibald-web-app/backend/src/services/ft-counter.spec.ts`

- [ ] **Step 1: Scrivi i test fallenti**

In `ft-counter.spec.ts`, aggiungi sotto i test esistenti (prima della chiusura del `describe`):

```typescript
const TEST_DOC_DATE = '2026-03-15';

test('SQL include last_date e GREATEST', async () => {
  const pool = createMockPool();
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ last_number: 1 }], rowCount: 1 } as any);
  const { getNextDocNumber } = await import('./ft-counter');
  await getNextDocNumber(pool, TEST_USER_ID, TEST_ESERCIZIO, 'FT', TEST_DOC_DATE);
  const [text] = vi.mocked(pool.query).mock.calls[0];
  expect(text).toContain('last_date');
  expect(text).toContain('GREATEST');
});

test('passa docDate come 4° param SQL', async () => {
  const pool = createMockPool();
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ last_number: 5 }], rowCount: 1 } as any);
  const { getNextDocNumber } = await import('./ft-counter');
  await getNextDocNumber(pool, TEST_USER_ID, TEST_ESERCIZIO, 'KT', TEST_DOC_DATE);
  const [, params] = vi.mocked(pool.query).mock.calls[0];
  expect(params).toEqual([TEST_ESERCIZIO, TEST_USER_ID, 'KT', TEST_DOC_DATE]);
});

test('usa oggi come docDate quando il parametro è omesso', async () => {
  const pool = createMockPool();
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ last_number: 1 }], rowCount: 1 } as any);
  const { getNextDocNumber } = await import('./ft-counter');
  await getNextDocNumber(pool, TEST_USER_ID, TEST_ESERCIZIO, 'FT');
  const [, params] = vi.mocked(pool.query).mock.calls[0];
  expect((params as unknown[])[3]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
```

- [ ] **Step 2: Verifica che i nuovi test falliscano**

```bash
npm test --prefix archibald-web-app/backend -- ft-counter
```
Expected: FAIL — `SQL include last_date e GREATEST` e `passa docDate come 4° param SQL` falliscono.

- [ ] **Step 3: Aggiorna il test esistente che controlla i params**

Il test `passes esercizio, userId, tipodoc as params` (che fa `expect(params).toEqual([TEST_ESERCIZIO, TEST_USER_ID, 'KT'])`) deve essere aggiornato per includere il docDate. Trovalo in `ft-counter.spec.ts` e modificalo così:

```typescript
test('passes esercizio, userId, tipodoc as params', async () => {
  const pool = createMockPool();
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ last_number: 5 }], rowCount: 1 } as any);
  const { getNextDocNumber } = await import('./ft-counter');
  await getNextDocNumber(pool, TEST_USER_ID, TEST_ESERCIZIO, 'KT', TEST_DOC_DATE);
  const [, params] = vi.mocked(pool.query).mock.calls[0];
  expect(params).toEqual([TEST_ESERCIZIO, TEST_USER_ID, 'KT', TEST_DOC_DATE]);
});
```

- [ ] **Step 4: Implementa `docDate` in `ft-counter.ts`**

Sostituisci l'intero contenuto di `ft-counter.ts` con:

```typescript
import type { DbPool } from '../db/pool';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getNextDocNumber(
  pool: DbPool,
  userId: string,
  esercizio: string,
  tipodoc: 'FT' | 'KT',
  docDate?: string,           // YYYY-MM-DD; default: oggi
): Promise<number> {
  const date = docDate ?? todayIso();
  const result = await pool.query<{ last_number: number }>(
    `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number, last_date)
     VALUES ($1, $2, $3, 1, $4)
     ON CONFLICT (esercizio, user_id, tipodoc)
     DO UPDATE SET
       last_number = agents.ft_counter.last_number + 1,
       last_date   = GREATEST(agents.ft_counter.last_date, $4)
     RETURNING last_number`,
    [esercizio, userId, tipodoc, date],
  );
  return result.rows[0].last_number;
}

export { getNextDocNumber, getNextDocNumber as getNextFtNumber };
```

Nota: `GREATEST(NULL, $4)` in PostgreSQL restituisce `$4` (i NULL vengono ignorati), quindi il comportamento è corretto per record esistenti con `last_date IS NULL`.

- [ ] **Step 5: Verifica che tutti i test passino**

```bash
npm test --prefix archibald-web-app/backend -- ft-counter
```
Expected: PASS — tutti e 8 i test nel describe `getNextDocNumber`.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/services/ft-counter.ts \
        archibald-web-app/backend/src/services/ft-counter.spec.ts
git commit -m "feat(ft-counter): aggiunge docDate a getNextDocNumber, aggiorna last_date con GREATEST"
```

---

### Task 3: `parseNativeArcaFiles` + `performArcaSync` step 6 — traccia `last_date`

**Files:**
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.ts`
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.spec.ts`

#### Sotto-task 3a: Aggiungi `maxDateByKey` a `NativeParseResult` e al loop di parsing

- [ ] **Step 1: Aggiungi `maxDateByKey` al tipo `NativeParseResult`**

In `arca-sync-service.ts`, trova il tipo `NativeParseResult` (intorno alla riga 683):

```typescript
export type NativeParseResult = {
  records: FresisHistoryRow[];
  subclients: Subclient[];
  errors: string[];
  stats: {
    totalDocuments: number;
    totalRows: number;
    totalClients: number;
    skippedOtherTypes: number;
  };
  maxNumerodocByKey: Map<string, number>;
  arcaDocMap: Map<string, FresisHistoryRow>;
  arcaDocKeys: Set<string>;
  arcaClientMap: Map<string, string>;
};
```

Aggiungi `maxDateByKey` dopo `maxNumerodocByKey`:

```typescript
export type NativeParseResult = {
  records: FresisHistoryRow[];
  subclients: Subclient[];
  errors: string[];
  stats: {
    totalDocuments: number;
    totalRows: number;
    totalClients: number;
    skippedOtherTypes: number;
  };
  maxNumerodocByKey: Map<string, number>;
  maxDateByKey: Map<string, string>;        // "esercizio|tipodoc" → max DATADOC (YYYY-MM-DD)
  arcaDocMap: Map<string, FresisHistoryRow>;
  arcaDocKeys: Set<string>;
  arcaClientMap: Map<string, string>;
};
```

- [ ] **Step 2: Inizializza `maxDateByKey` nel loop di parsing**

Trova la riga ~821 dove viene dichiarato `maxNumerodocByKey`:
```typescript
const maxNumerodocByKey = new Map<string, number>();
```

Aggiungi subito dopo:
```typescript
const maxDateByKey = new Map<string, string>();
```

- [ ] **Step 3: Popola `maxDateByKey` nel loop di parsing**

Trova il blocco di tracking `maxNumerodocByKey` (righe ~852-860):
```typescript
      // Track max NUMERODOC per ESERCIZIO|TIPODOC
      const numDocInt = parseInt(numerodoc, 10);
      const trackingKey = `${esercizio}|${tipodoc}`;
      if (!isNaN(numDocInt)) {
        const currentMax = maxNumerodocByKey.get(trackingKey) ?? 0;
        if (numDocInt > currentMax) {
          maxNumerodocByKey.set(trackingKey, numDocInt);
        }
      }
```

Aggiungi subito dopo il blocco `if (!isNaN(numDocInt)) { ... }`:
```typescript
      const datadocIso = formatDate(datadoc)?.slice(0, 10) ?? '';
      if (datadocIso) {
        const currentMaxDate = maxDateByKey.get(trackingKey) ?? '';
        if (datadocIso > currentMaxDate) {
          maxDateByKey.set(trackingKey, datadocIso);
        }
      }
```

- [ ] **Step 4: Includi `maxDateByKey` nel valore di ritorno di `parseNativeArcaFiles`**

Cerca il return finale di `parseNativeArcaFiles`. Troverai un oggetto con `maxNumerodocByKey`. Aggiungi `maxDateByKey` accanto:

```typescript
    return {
      records,
      subclients: subclients.filter(Boolean),
      errors,
      stats: {
        totalDocuments: records.length,
        totalRows: rawDrRowsAll.length,
        totalClients: clientNameMap.size,
        skippedOtherTypes,
      },
      maxNumerodocByKey,
      maxDateByKey,           // ← aggiungi questa riga
      arcaDocMap,
      arcaDocKeys,
      arcaClientMap,
    };
```

#### Sotto-task 3b: Aggiorna `performArcaSync` step 6 per `last_date`

- [ ] **Step 5: Estendi il loop step 6 per aggiornare `last_date`**

Trova il commento `// 6. Update ft_counter with max NUMERODOC per ESERCIZIO+TIPODOC` (intorno alla riga 1246). Il loop attuale è:

```typescript
  for (const [key, maxNum] of parsed.maxNumerodocByKey) {
    const [esercizio, tipodoc] = key.split("|");
    if (tipodoc !== "FT" && tipodoc !== "KT") continue;
    await pool.query(
      `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (esercizio, user_id, tipodoc)
       DO UPDATE SET last_number = GREATEST(agents.ft_counter.last_number, $4)`,
      [esercizio, userId, tipodoc, maxNum],
    );
  }
```

Sostituiscilo con:

```typescript
  for (const [key, maxNum] of parsed.maxNumerodocByKey) {
    const [esercizio, tipodoc] = key.split("|");
    if (tipodoc !== "FT" && tipodoc !== "KT") continue;
    const maxDate = parsed.maxDateByKey.get(key) ?? null;
    await pool.query(
      `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number, last_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (esercizio, user_id, tipodoc)
       DO UPDATE SET
         last_number = GREATEST(agents.ft_counter.last_number, $4),
         last_date   = GREATEST(agents.ft_counter.last_date, $5)`,
      [esercizio, userId, tipodoc, maxNum, maxDate],
    );
  }
```

- [ ] **Step 6: Estendi il global-max loop per allineare anche `last_date`**

Il global-max loop (subito dopo) è:

```typescript
  const globalMaxByEsercizio = new Map<string, number>();
  for (const [key, maxNum] of parsed.maxNumerodocByKey) {
    const [esercizio, tipodoc] = key.split("|");
    if (tipodoc !== "FT" && tipodoc !== "KT") continue;
    const cur = globalMaxByEsercizio.get(esercizio) ?? 0;
    if (maxNum > cur) globalMaxByEsercizio.set(esercizio, maxNum);
  }
  for (const [esercizio, globalMax] of globalMaxByEsercizio) {
    for (const tipodoc of ["FT", "KT"] as const) {
      await pool.query(
        `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (esercizio, user_id, tipodoc)
         DO UPDATE SET last_number = GREATEST(agents.ft_counter.last_number, $4)`,
        [esercizio, userId, tipodoc, globalMax],
      );
    }
  }
```

Sostituiscilo con:

```typescript
  const globalMaxByEsercizio = new Map<string, number>();
  const globalMaxDateByEsercizio = new Map<string, string>();
  for (const [key, maxNum] of parsed.maxNumerodocByKey) {
    const [esercizio, tipodoc] = key.split("|");
    if (tipodoc !== "FT" && tipodoc !== "KT") continue;
    const cur = globalMaxByEsercizio.get(esercizio) ?? 0;
    if (maxNum > cur) globalMaxByEsercizio.set(esercizio, maxNum);
  }
  for (const [key, maxDate] of parsed.maxDateByKey) {
    const [esercizio, tipodoc] = key.split("|");
    if (tipodoc !== "FT" && tipodoc !== "KT") continue;
    const cur = globalMaxDateByEsercizio.get(esercizio) ?? '';
    if (maxDate > cur) globalMaxDateByEsercizio.set(esercizio, maxDate);
  }
  for (const [esercizio, globalMax] of globalMaxByEsercizio) {
    const globalMaxDate = globalMaxDateByEsercizio.get(esercizio) ?? null;
    for (const tipodoc of ["FT", "KT"] as const) {
      await pool.query(
        `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number, last_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (esercizio, user_id, tipodoc)
         DO UPDATE SET
           last_number = GREATEST(agents.ft_counter.last_number, $4),
           last_date   = GREATEST(agents.ft_counter.last_date, $5)`,
        [esercizio, userId, tipodoc, globalMax, globalMaxDate],
      );
    }
  }
```

#### Sotto-task 3c: Aggiorna i callsite di renumber in `performArcaSync`

- [ ] **Step 7: Passa `DATADOC` al callsite step 8 (NUMERO_P conflict)**

Trova la riga ~1329 in `performArcaSync` (dentro il loop pwaRows):
```typescript
      const newNum = await getNextDocNumber(pool, userId, esercizio, tipodocForCounter);
```

Sostituiscila con:
```typescript
      const newNum = await getNextDocNumber(pool, userId, esercizio, tipodocForCounter, arcaData.testata.DATADOC as string);
```

- [ ] **Step 8: Passa `DATADOC` al callsite FASE 5 (renumber conflitti con Arca)**

Trova la riga ~1473 (dentro il loop pwaSourceRows, FASE 5):
```typescript
    const newNum = await getNextDocNumber(pool, userId, esercizio, tipodoc);
```

Sostituiscila con:
```typescript
    const newNum = await getNextDocNumber(pool, userId, esercizio, tipodoc, arcaData.testata.DATADOC as string);
```

#### Sotto-task 3d: Test di regressione

- [ ] **Step 9: Scrivi test di regressione in `arca-sync-service.spec.ts`**

Nel blocco `(COOP16_EXISTS ? describe : describe.skip)("performArcaSync", () => {`, aggiungi dopo il test esistente di import:

```typescript
  test(
    "parseNativeArcaFiles popola maxDateByKey con date YYYY-MM-DD valide",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");
      const anagrafeBuf = readCoop16File("ANAGRAFE.DBF");
      const pool = createMockPool();

      const result = await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, anagrafeBuf);

      // maxDateByKey è esposta indirettamente tramite il comportamento del sync.
      // Verifica che ft_counter abbia ricevuto almeno un update con last_date.
      const queryCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const lastDateUpdates = queryCalls.filter(
        ([sql]: [string]) =>
          typeof sql === 'string' &&
          sql.includes('ft_counter') &&
          sql.includes('last_date'),
      );
      expect(lastDateUpdates.length).toBeGreaterThan(0);

      // Verifica che il param last_date sia in formato YYYY-MM-DD o null
      for (const [, params] of lastDateUpdates) {
        const dateParam = (params as unknown[])[4];
        if (dateParam !== null) {
          expect(dateParam as string).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    },
    120000,
  );
```

- [ ] **Step 10: Verifica che il build passi e i test passino**

```bash
npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend -- arca-sync-service
```
Expected: Build OK. I test nuovi passano. I test esistenti non regrediscono.

- [ ] **Step 11: Commit**

```bash
git add archibald-web-app/backend/src/services/arca-sync-service.ts \
        archibald-web-app/backend/src/services/arca-sync-service.spec.ts
git commit -m "feat(arca-sync): traccia maxDateByKey in parseNativeArcaFiles, aggiorna last_date in ft_counter"
```

---

### Task 4: `generateKtExportVbs` — `effectiveLastDate` + ordinamento

**Files:**
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.ts`
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.spec.ts`

#### Sotto-task 4a: Scrivi i test di integrazione

- [ ] **Step 1: Aggiorna `createMockPool` per supportare `lastDateByEsercizio`**

In `arca-sync-service.spec.ts`, trova la funzione `createMockPool` e aggiungi il nuovo override nel tipo:

```typescript
function createMockPool(overrides?: {
  // ... campi esistenti ...
  lastDateByEsercizio?: Map<string, string>;   // ← aggiungi questa riga
}): DbPool {
```

Poi, all'inizio della funzione, estrai il nuovo override:
```typescript
  const lastDateByEsercizio = overrides?.lastDateByEsercizio;
```

Infine, nel mock `query`, trova il branch che gestisce `FROM agents.ft_counter` AND `tipodoc IN`:
```typescript
      if (text.includes("FROM agents.ft_counter") && text.includes("tipodoc IN")) {
        // Counter alignment SELECT: return 0 so no-op in unit tests
        return { rows: [{ max_last: 0 }], rowCount: 1 };
      }
```

E sostituiscilo con:
```typescript
      if (text.includes("FROM agents.ft_counter") && text.includes("tipodoc IN")) {
        if (text.includes("max_date")) {
          // effectiveLastDate SELECT: return last_date per esercizio
          const esercizio = params?.[1] as string | undefined;
          const maxDate = (esercizio && lastDateByEsercizio?.get(esercizio)) ?? '';
          return { rows: [{ max_date: maxDate }], rowCount: 1 };
        }
        // Counter alignment SELECT: return 0 so no-op in unit tests
        return { rows: [{ max_last: 0 }], rowCount: 1 };
      }
```

- [ ] **Step 2: Scrivi il test "KT con data antecedente a last_date riceve DATADOC = last_date"**

Nel blocco `describe("generateKtExportVbs", () => {`, aggiungi dopo i test Gap esistenti:

```typescript
  const DATE_ORDER_USER = "test-user-dates";
  const DATE_ORDER_ESERCIZIO = "2026";
  const LAST_DATE = "2026-04-01";
  const OLD_CREATION_DATE = "2026-03-10T00:00:00Z";  // < LAST_DATE

  test(
    "KT con creation_date < last_date riceve DATADOC = last_date",
    async () => {
      const ktOrder = {
        id: "order-old-date",
        order_number: "ORD-OLD",
        customer_name: "Cliente Old",
        customer_account_num: "profile-old-date",
        creation_date: OLD_CREATION_DATE,
        discount_percent: null,
        order_description: null,
        articles_synced_at: "2026-03-10T10:00:00Z",
      };

      const subclientRow = {
        codice: "C00OLD",
        ragione_sociale: "Subclient Old",
        suppl_ragione_sociale: null,
        matched_customer_profile_id: "profile-old-date",
        match_confidence: null,
        arca_synced_at: null,
        indirizzo: null, cap: null, localita: null, prov: null,
        telefono: null, fax: null, email: null, partita_iva: null,
        cod_fiscale: null, zona: null, pers_da_contattare: null,
        cod_nazione: "IT", cb_nazione: "IT", agente: null, agente2: null,
        settore: null, classe: null, pag: "RB60", listino: "01",
        banca: null, valuta: "EUR", aliiva: null, contoscar: null,
        tipofatt: null, telefono2: null, telefono3: null, url: null,
        cb_bic: null, cb_cin_ue: null, cb_cin_it: null, abicab: null,
        contocorr: null, customer_match_count: 1, sub_client_match_count: 1,
      };

      const articleRow = {
        id: 1, order_id: "order-old-date", user_id: DATE_ORDER_USER,
        article_code: "ART-001", article_description: "Test Article",
        quantity: 2, unit_price: 100, discount_percent: 0,
        line_amount: 200, vat_percent: 22, vat_amount: 44,
        line_total_with_vat: 244, warehouse_quantity: null,
        warehouse_sources_json: null, created_at: "2026-03-10T00:00:00Z",
      };

      const pool = createMockPool({
        ktEligibleOrders: [ktOrder],
        subclientRows: [subclientRow],
        orderArticlesRows: [articleRow],
        lastDateByEsercizio: new Map([[DATE_ORDER_ESERCIZIO, LAST_DATE]]),
      });

      const result = await generateKtExportVbs(pool, DATE_ORDER_USER, []);

      expect(result.ktExported).toBe(1);
      // Il VBS deve contenere DATADOC = LAST_DATE nella scrittura doctes (non OLD_CREATION_DATE)
      expect(result.vbsScript?.vbs).toContain(`REPLACE DATADOC WITH {^${LAST_DATE}}`);
      expect(result.vbsScript?.vbs).not.toContain(`REPLACE DATADOC WITH {^${OLD_CREATION_DATE.slice(0, 10)}}`);
    },
    60000,
  );
```

- [ ] **Step 3: Verifica che il nuovo test fallisca**

```bash
npm test --prefix archibald-web-app/backend -- arca-sync-service --reporter=verbose 2>&1 | grep -A5 "KT con creation_date"
```
Expected: FAIL — il VBS contiene `REPLACE DATADOC WITH {^2026-03-10}` invece di `{^2026-04-01}`.

#### Sotto-task 4b: Implementa le modifiche a `generateKtExportVbs`

- [ ] **Step 4: Aggiungi sort KT e load `effectiveLastDateByEsercizio`**

In `generateKtExportVbs`, dopo il blocco di counter alignment (il loop `for (const esercizio of uniqueEsercizi)` che allinea `last_number`) e prima del loop sugli ordini, inserisci:

```typescript
  // Sort KT per data ASC prima dell'assegnazione numeri
  ktOrders.sort((a, b) => (a.creationDate ?? '').localeCompare(b.creationDate ?? ''));

  // Carica effectiveLastDate per esercizio: max(last_date) da FT e KT counter
  const effectiveLastDateByEsercizio = new Map<string, string>();
  for (const esercizio of uniqueEsercizi) {
    const { rows } = await pool.query<{ max_date: string }>(
      `SELECT COALESCE(MAX(last_date)::text, '') AS max_date
       FROM agents.ft_counter
       WHERE user_id = $1 AND esercizio = $2 AND tipodoc IN ('FT', 'KT')`,
      [userId, esercizio],
    );
    effectiveLastDateByEsercizio.set(esercizio, rows[0]?.max_date ?? '');
  }
  // Estende effectiveLastDate con le date degli FT nel batch corrente
  for (const ft of ftExportRecords) {
    const ftDate = (ft.arcaData.testata.DATADOC as string | undefined) ?? '';
    const esercizio = String(ft.arcaData.testata.ESERCIZIO || '').trim() || currentYear;
    const cur = effectiveLastDateByEsercizio.get(esercizio) ?? '';
    if (ftDate > cur) effectiveLastDateByEsercizio.set(esercizio, ftDate);
  }
```

- [ ] **Step 5: Modifica il loop sugli ordini per usare `docDate`**

Dentro `for (const order of ktOrders)`, dopo le righe che calcolano `esercizio`:

```typescript
    const esercizio = order.creationDate?.slice(0, 4) || currentYear;
```

Aggiungi subito dopo:
```typescript
    const effectiveLastDate = effectiveLastDateByEsercizio.get(esercizio) ?? '';
    const rawDate = order.creationDate?.slice(0, 10) ?? todayIso();
    const docDate = rawDate > effectiveLastDate ? rawDate : effectiveLastDate;
    effectiveLastDateByEsercizio.set(esercizio, docDate);
```

Poi modifica `orderParam` per usare `docDate` come `creationDate`:

```typescript
    const orderParam = {
      id: order.id,
      creationDate: docDate,          // usa docDate, non order.creationDate
      customerName: order.customerName,
      discountPercent: order.discountPercent,
      notes: order.notes,
    };
```

- [ ] **Step 6: Passa `docDate` alle chiamate `getNextDocNumber` inside il loop**

Trova le due chiamate `getNextDocNumber` dentro il loop sugli ordini:

```typescript
      const docNumber = await getNextDocNumber(pool, userId, esercizio, 'KT');
```
e
```typescript
      const ftNum = await getNextDocNumber(pool, userId, esercizio, 'FT');
```

Sostituiscile con:
```typescript
      const docNumber = await getNextDocNumber(pool, userId, esercizio, 'KT', docDate);
```
e
```typescript
      const ftNum = await getNextDocNumber(pool, userId, esercizio, 'FT', docDate);
```

- [ ] **Step 7: Aggiungi sort finale `exportRecords` per DATADOC ASC**

Subito prima della riga `let vbsScript: VbsResult | null = null;` (alla fine di `generateKtExportVbs`), aggiungi:

```typescript
  exportRecords.sort((a, b) =>
    ((a.arcaData.testata.DATADOC as string | undefined) ?? '').localeCompare(
      (b.arcaData.testata.DATADOC as string | undefined) ?? '',
    ),
  );
```

Aggiungi anche la helper function `todayIso()` all'inizio del file (se non già presente vicino alle altre utility):

```typescript
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 8: Verifica build + test**

```bash
npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend -- arca-sync-service
```
Expected: Build OK. Il nuovo test `KT con creation_date < last_date` passa. I test esistenti non regrediscono.

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/backend/src/services/arca-sync-service.ts \
        archibald-web-app/backend/src/services/arca-sync-service.spec.ts
git commit -m "feat(arca-sync): generateKtExportVbs con effectiveLastDate, sort per data, docDate progressiva"
```

---

### Task 5: Route `/kt-sync` individuale — sort + `effectiveLastDate`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/kt-sync.ts`
- Modify: `archibald-web-app/backend/src/services/ft-counter.ts` (rendi `docDate` obbligatorio)

- [ ] **Step 1: Scrivi il test fallente per la route `/kt-sync`**

Crea `archibald-web-app/backend/src/routes/kt-sync.integration.spec.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../db/pool';

function createKtSyncMockPool(overrides?: {
  orders?: Array<{
    id: string; order_number: string; customer_name: string;
    customer_account_num: string | null; creation_date: string;
    discount_percent: string | null; order_description: string | null;
  }>;
  lastDateByEsercizio?: Map<string, string>;
}): DbPool {
  const orders = overrides?.orders ?? [];
  const lastDateByEsercizio = overrides?.lastDateByEsercizio;
  const ftCounterParams: unknown[][] = [];

  return {
    query: vi.fn().mockImplementation((text: string, params?: unknown[]) => {
      if (text.includes("FROM agents.order_records") && text.includes("ANY($2")) {
        return { rows: orders, rowCount: orders.length };
      }
      if (text.includes("FROM shared.sub_clients")) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes("FROM agents.customers") && text.includes("account_num")) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes("FROM agents.order_articles")) {
        return {
          rows: [{
            id: 1, order_id: orders[0]?.id ?? 'x', user_id: 'u',
            article_code: "ART-001", article_description: "Test",
            quantity: 1, unit_price: 100, discount_percent: 0,
            line_amount: 100, vat_percent: 22, vat_amount: 22,
            line_total_with_vat: 122, warehouse_quantity: null,
            warehouse_sources_json: null, created_at: "2026-01-01",
          }],
          rowCount: 1,
        };
      }
      if (text.includes("ft_counter") && text.includes("max_date")) {
        const esercizio = params?.[1] as string | undefined;
        const maxDate = (esercizio && lastDateByEsercizio?.get(esercizio)) ?? '';
        return { rows: [{ max_date: maxDate }], rowCount: 1 };
      }
      if (text.includes("INSERT INTO agents.ft_counter") && text.includes("RETURNING")) {
        ftCounterParams.push(params ?? []);
        return { rows: [{ last_number: 1 }], rowCount: 1 };
      }
      if (text.includes("UPDATE agents.order_records") && text.includes("arca_kt_synced_at")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    _ftCounterParams: ftCounterParams,
  } as unknown as DbPool;
}

const ESERCIZIO = '2026';
const LAST_DATE = '2026-04-01';
const OLD_DATE = '2026-03-05T00:00:00Z';   // < LAST_DATE

describe('createKtSyncRouter — date adjustment', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('passa docDate = last_date quando creation_date è antecedente', async () => {
    const { createKtSyncRouter } = await import('./kt-sync');
    const pool = createKtSyncMockPool({
      orders: [{
        id: 'ord-001', order_number: 'ORD-001',
        customer_name: 'Cliente Test',
        customer_account_num: 'profile-001',
        creation_date: OLD_DATE,
        discount_percent: null, order_description: null,
      }],
      lastDateByEsercizio: new Map([[ESERCIZIO, LAST_DATE]]),
    });

    const router = createKtSyncRouter({ pool });

    // Simula chiamata POST / con orderIds = ['ord-001']
    const req = {
      user: { userId: 'user-test' },
      body: { orderIds: ['ord-001'] },
    } as any;
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json } as any;

    // Invoca il handler della prima route (POST /)
    const handler = (router as any).stack[0].route.stack[0].handle;
    await handler(req, res);

    // Cerca la chiamata getNextDocNumber (INSERT INTO ft_counter con RETURNING)
    const ftCall = (pool as any)._ftCounterParams[0] as unknown[];
    // ftCall = [esercizio, userId, tipodoc, docDate]
    expect(ftCall[3]).toBe(LAST_DATE);
  });
});
```

- [ ] **Step 2: Verifica che il test fallisca**

```bash
npm test --prefix archibald-web-app/backend -- kt-sync.integration
```
Expected: FAIL — `docDate` è la data originale dell'ordine, non `LAST_DATE`.

- [ ] **Step 3: Implementa le modifiche in `kt-sync.ts`**

Aggiungi la helper `todayIso` in cima al file (dopo gli import, prima di `ktSyncSchema`):

```typescript
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
```

Poi sostituisci il corpo del handler `router.post('/', ...)` con questa versione aggiornata. Modifiche chiave rispetto al codice originale:
- sort `orders` per `creation_date ASC`
- `effectiveLastDateByEsercizio`: query `MAX(last_date)` per ogni esercizio distinto
- per ogni ordine: computa `docDate = max(creation_date, effectiveLastDate)` usando `todayIso()` come fallback
- aggiorna `effectiveLastDateByEsercizio` dopo ogni ordine
- passa `docDate` a `getNextDocNumber` e usa `docDate` come `creationDate` in `generateArcaDataFromOrder`

```typescript
  router.post('/', async (req: AuthRequest, res) => {
    try {
      const parsed = ktSyncSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }

      const userId = req.user!.userId;
      const { orderIds, matchOverrides } = parsed.data;

      const { rows: orders } = await pool.query<{
        id: string;
        order_number: string;
        customer_name: string;
        customer_account_num: string | null;
        creation_date: string;
        discount_percent: string | null;
        order_description: string | null;
      }>(
        `SELECT id, order_number, customer_name, customer_account_num,
                creation_date, discount_percent, order_description
         FROM agents.order_records
         WHERE user_id = $1 AND id = ANY($2::text[])`,
        [userId, orderIds],
      );

      if (orders.length === 0) {
        return res.status(404).json({ success: false, error: 'Nessun ordine trovato' });
      }

      // Ordina per data ASC: garantisce NUMERO_P monotono
      orders.sort((a, b) => (a.creation_date ?? '').localeCompare(b.creation_date ?? ''));

      // Build subclient lookup
      const allSubclients = await getAllSubclients(pool);
      const subByProfile = new Map<string, typeof allSubclients[number]>();
      const subByCodice = new Map<string, typeof allSubclients[number]>();
      for (const sc of allSubclients) {
        if (sc.matchedCustomerProfileId) {
          subByProfile.set(sc.matchedCustomerProfileId, sc);
        }
        subByCodice.set(sc.codice, sc);
      }

      const { rows: customerRows } = await pool.query<{ account_num: string; erp_id: string }>(
        `SELECT account_num, erp_id FROM agents.customers
         WHERE user_id = $1 AND account_num IS NOT NULL AND account_num != '' AND erp_id IS NOT NULL AND erp_id != ''`,
        [userId],
      );
      const accountNumToErpId = new Map<string, string>();
      for (const c of customerRows) {
        accountNumToErpId.set(c.account_num, c.erp_id);
      }

      // Pre-carica effectiveLastDate per ogni esercizio distinto
      const currentYear = new Date().getFullYear().toString();
      const uniqueEsercizi = new Set(orders.map((o) => o.creation_date?.slice(0, 4) ?? currentYear));
      const effectiveLastDateByEsercizio = new Map<string, string>();
      for (const esercizio of uniqueEsercizi) {
        const { rows: counterRows } = await pool.query<{ max_date: string }>(
          `SELECT COALESCE(MAX(last_date)::text, '') AS max_date
           FROM agents.ft_counter
           WHERE user_id = $1 AND esercizio = $2 AND tipodoc IN ('FT', 'KT')`,
          [userId, esercizio],
        );
        effectiveLastDateByEsercizio.set(esercizio, counterRows[0]?.max_date ?? '');
      }

      const errors: string[] = [];
      let synced = 0;
      const exportRecords: Array<{ invoiceNumber: string; arcaData: any }> = [];

      for (const order of orders) {
        const overrideCodice = matchOverrides?.[order.id];
        let subclient: typeof allSubclients[number] | undefined;
        if (overrideCodice) {
          subclient = subByCodice.get(overrideCodice);
        } else if (order.customer_account_num) {
          const erpId = subByProfile.has(order.customer_account_num)
            ? order.customer_account_num
            : accountNumToErpId.get(order.customer_account_num);
          subclient = erpId ? subByProfile.get(erpId) : undefined;
        }

        if (!subclient) {
          errors.push(`Ordine ${order.order_number}: nessun sottocliente trovato per ${order.customer_name}`);
          continue;
        }

        const articles = await getOrderArticles(pool, order.id, userId);
        if (articles.length === 0) {
          errors.push(`Ordine ${order.order_number}: nessun articolo sincronizzato`);
          continue;
        }

        const esercizio = order.creation_date?.slice(0, 4) ?? currentYear;
        const effectiveLastDate = effectiveLastDateByEsercizio.get(esercizio) ?? '';
        const rawDate = order.creation_date?.slice(0, 10) ?? todayIso();
        const docDate = rawDate > effectiveLastDate ? rawDate : effectiveLastDate;
        effectiveLastDateByEsercizio.set(esercizio, docDate);

        const docNumber = await getNextDocNumber(pool, userId, esercizio, 'KT', docDate);

        const arcaData = generateArcaDataFromOrder(
          {
            id: order.id,
            creationDate: docDate,
            customerName: order.customer_name,
            discountPercent: order.discount_percent != null ? parseFloat(order.discount_percent) : null,
            notes: order.order_description,
          },
          articles.map((a) => ({
            articleCode: a.articleCode,
            articleDescription: a.articleDescription ?? '',
            quantity: a.quantity,
            unitPrice: a.unitPrice ?? 0,
            discountPercent: a.discountPercent ?? 0,
            vatPercent: a.vatPercent ?? 22,
            lineAmount: a.lineAmount ?? 0,
            unit: 'PZ',
          })),
          subclient,
          docNumber,
          esercizio,
        );

        exportRecords.push({
          invoiceNumber: `KT ${docNumber}/${esercizio}`,
          arcaData,
        });

        await pool.query(
          `UPDATE agents.order_records SET arca_kt_synced_at = NOW() WHERE id = $1 AND user_id = $2`,
          [order.id, userId],
        );
        synced++;
      }

      const vbsScript = exportRecords.length > 0
        ? generateVbsScript(exportRecords)
        : null;

      logger.info(`KT sync: ${synced} orders synced for user ${userId}`);

      res.json({
        success: true,
        synced,
        errors,
        vbsScript,
      });
    } catch (err: any) {
      logger.error('KT sync error', { error: err });
      res.status(500).json({ success: false, error: err.message || 'KT sync failed' });
    }
  });
```

- [ ] **Step 4: Rendi `docDate` obbligatorio in `ft-counter.ts`**

In `ft-counter.ts`, rimuovi il `?` da `docDate`:

```typescript
async function getNextDocNumber(
  pool: DbPool,
  userId: string,
  esercizio: string,
  tipodoc: 'FT' | 'KT',
  docDate: string,             // YYYY-MM-DD — ora obbligatorio
): Promise<number> {
  const result = await pool.query<{ last_number: number }>(
    `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number, last_date)
     VALUES ($1, $2, $3, 1, $4)
     ON CONFLICT (esercizio, user_id, tipodoc)
     DO UPDATE SET
       last_number = agents.ft_counter.last_number + 1,
       last_date   = GREATEST(agents.ft_counter.last_date, $4)
     RETURNING last_number`,
    [esercizio, userId, tipodoc, docDate],
  );
  return result.rows[0].last_number;
}
```

Rimuovi anche la funzione `todayIso()` da `ft-counter.ts` (non è più necessaria lì — è definita in `arca-sync-service.ts` e `kt-sync.ts` localmente se serve, ma in realtà non serve più).

- [ ] **Step 5: Sostituisci il test `usa oggi come docDate quando il parametro è omesso`**

Ora che `docDate` è obbligatorio, quel test non ha più senso. Eliminalo da `ft-counter.spec.ts`. Sostituiscilo con un test che verifica il comportamento corretto di GREATEST con due docDate distinte (invariante del dominio: il contatore avanza solo in avanti):

```typescript
test('docDate più recente avanza last_date rispetto a una chiamata precedente', async () => {
  const pool = createMockPool();
  // Prima chiamata: last_date = DATE_1
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ last_number: 1 }], rowCount: 1 } as any);
  const { getNextDocNumber } = await import('./ft-counter');
  await getNextDocNumber(pool, TEST_USER_ID, TEST_ESERCIZIO, 'KT', '2026-03-01');
  const [, params1] = vi.mocked(pool.query).mock.calls[0];
  expect((params1 as unknown[])[3]).toBe('2026-03-01');

  // Seconda chiamata: docDate > prima, deve aggiornare last_date
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ last_number: 2 }], rowCount: 1 } as any);
  await getNextDocNumber(pool, TEST_USER_ID, TEST_ESERCIZIO, 'KT', '2026-04-01');
  const [, params2] = vi.mocked(pool.query).mock.calls[1];
  expect((params2 as unknown[])[3]).toBe('2026-04-01');
});
```

- [ ] **Step 6: Verifica build + tutti i test**

```bash
npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend
```
Expected: Build OK. Tutti i test passano (inclusi ft-counter, arca-sync-service, kt-sync.integration).

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/routes/kt-sync.ts \
        archibald-web-app/backend/src/routes/kt-sync.integration.spec.ts \
        archibald-web-app/backend/src/services/ft-counter.ts \
        archibald-web-app/backend/src/services/ft-counter.spec.ts
git commit -m "feat(kt-sync): sort per data, effectiveLastDate, docDate obbligatorio in getNextDocNumber"
```

---

## Self-Review Checklist

**Spec coverage:**

| Requisito spec | Task |
|---|---|
| Migration 051 `ADD COLUMN last_date DATE` | Task 1 |
| `getNextDocNumber` accetta `docDate`, GREATEST su `last_date` | Task 2 |
| `parseNativeArcaFiles` popola `maxDateByKey` | Task 3 |
| `performArcaSync` step 6 aggiorna `last_date` in ft_counter | Task 3 |
| `performArcaSync` step 8 + FASE 5 passano `DATADOC` a `getNextDocNumber` | Task 3 |
| `generateKtExportVbs` calcola `effectiveLastDate` per esercizio | Task 4 |
| KT ordinate per `creationDate ASC` prima dell'assegnazione | Task 4 |
| `docDate = max(creation_date, effectiveLastDate)` | Task 4 |
| VBS finale ordinato per DATADOC ASC | Task 4 |
| Route `/kt-sync` individuale: sort + effectiveLastDate | Task 5 |
| `docDate` obbligatorio (tutti i callsite aggiornati) | Task 5 |

**Callsite check (tutti e 5 devono passare docDate):**
- `arca-sync-service.ts` ~1329 (step 8, NUMERO_P renumber) → Task 3
- `arca-sync-service.ts` ~1473 (FASE 5 renumber) → Task 3
- `arca-sync-service.ts` ~1672 (generateKtExportVbs KT) → Task 4
- `arca-sync-service.ts` ~1690 (generateKtExportVbs FT companion) → Task 4
- `kt-sync.ts` ~107 (route individuale) → Task 5

**Type consistency:** `NativeParseResult.maxDateByKey: Map<string, string>` definito in Task 3 Step 1 e popolato in Task 3 Steps 2-4. Nessuna discrepanza.
