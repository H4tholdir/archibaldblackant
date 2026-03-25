# Arca Import Customer & Poll Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the infinite article-polling loop when skipping unmatched KT customers, and add the ability to import a PWA customer directly into ArcaPro's ANAGRAFE during the matching flow.

**Architecture:** Two independent changes in the backend (`arca-sync-service.ts`, `arca-sync.ts`) plus a frontend addition (`ArcaSyncButton.tsx`). The backend changes follow TDD: tests first, then implementation. The VBS ordering fix (ANAGRAFE before FT/KT) is a prerequisite for the import feature to work correctly on the Windows side.

**Tech Stack:** TypeScript, Vitest, Supertest, Express, PostgreSQL (`pg`), React 19

---

## Files Modified

| File | Change |
|---|---|
| `archibald-web-app/backend/src/services/arca-sync-service.ts` | Fix `getKtSyncStatus` + fix `generateSyncVbs` ordering + add `importCustomerAsSubclient` + add `suggestNextCodice` |
| `archibald-web-app/backend/src/services/arca-sync-service.spec.ts` | Tests for the three service changes above |
| `archibald-web-app/backend/src/routes/arca-sync.ts` | Add 3 endpoints: `GET /suggest-codice`, `GET /check-codice`, `POST /import-customer` |
| `archibald-web-app/backend/src/routes/arca-sync.spec.ts` | New file — integration tests for the 3 new endpoints |
| `archibald-web-app/frontend/src/components/ArcaSyncButton.tsx` | Add "Importa in Arca" mode in `InlineMatcher` |

---

## Task 1 — Fix `getKtSyncStatus`: unmatched orders do not block polling

**Context:** `getKtSyncStatus` in `arca-sync-service.ts` (line 1535–1544). Currently it counts `articlesPending` for ALL KT orders regardless of whether they have a subclient match. Fix: count only orders where `hasMatch = true`.

**Files:**
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.spec.ts`
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.ts:1535-1544`

- [ ] **Step 1.1 — Write the failing test**

Add inside the existing `describe("generateVbsScript"` block or as a new top-level describe in `arca-sync-service.spec.ts`. The test mocks the DB pool:

```typescript
// arca-sync-service.spec.ts — add near top imports
import {
  // existing imports...
  getKtSyncStatus,
} from "./arca-sync-service";

// Add this describe block at the bottom of the file (before the COOP16 block)
describe("getKtSyncStatus", () => {
  test("unmatched orders do not contribute to articlesPending or articlesReady", async () => {
    const unmatchedProfileId = "C99999"; // no subclient with this profile
    const matchedProfileId = "C00001";   // has subclient

    const fakeOrders = [
      // matched, articles ready
      { id: "o1", customerProfileId: matchedProfileId, customerName: "Alfa", articlesSyncedAt: "2026-01-01", creationDate: "2026-01-01" },
      // matched, articles pending
      { id: "o2", customerProfileId: matchedProfileId, customerName: "Alfa", articlesSyncedAt: null, creationDate: "2026-01-01" },
      // unmatched, articles also null — must NOT count in pending
      { id: "o3", customerProfileId: unmatchedProfileId, customerName: "Beta", articlesSyncedAt: null, creationDate: "2026-01-01" },
    ];

    const fakeSubclients = [
      // only C00001 has a match
      { ...makeMinimalSubclient(), matchedCustomerProfileId: matchedProfileId },
    ];

    const fakePool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("agents.order_records")) return Promise.resolve({ rows: fakeOrders });
        if (sql.includes("shared.sub_clients")) return Promise.resolve({ rows: fakeSubclients });
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as DbPool;

    const status = await getKtSyncStatus(fakePool, "user-1");

    expect(status).toEqual({
      total: 3,
      articlesReady: 1,
      articlesPending: 1,    // only o2 (matched, no articles)
      matched: 2,
      readyToExport: 1,
      unmatched: [{ orderId: "o3", customerName: "Beta", customerProfileId: unmatchedProfileId }],
    });
  });
});

// helper — add at top of file alongside other helpers
function makeMinimalSubclient() {
  return {
    codice: "C00001", ragioneSociale: "Test", supplRagioneSociale: null,
    indirizzo: null, cap: null, localita: null, prov: null,
    telefono: null, telefono2: null, telefono3: null, fax: null, email: null,
    emailAmministraz: null, partitaIva: null, codFiscale: null, zona: null,
    agente: null, agente2: null, settore: null, classe: null, pag: null,
    listino: null, banca: null, valuta: null, codNazione: null, aliiva: null,
    contoscar: null, tipofatt: null, persDaContattare: null, url: null,
    cbNazione: null, cbBic: null, cbCinUe: null, cbCinIt: null,
    abicab: null, contocorr: null, matchedCustomerProfileId: null,
    matchConfidence: null, arcaSyncedAt: null,
    customerMatchCount: 0, subClientMatchCount: 0,
  };
}
```

> **Note:** `getKtSyncStatus` internally calls `getKtEligibleOrders` and `getAllSubclients`. These are imported from repositories — mock them via `vi.mock` or provide a mock pool that returns the right rows. Look at how `performArcaSync` tests mock the pool in this same spec file (around line 804) for the pattern.

- [ ] **Step 1.2 — Run the test to verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose --run arca-sync-service.spec.ts
```

Expected: FAIL — `articlesPending` is `2` (counts `o3`), not `1`.

- [ ] **Step 1.3 — Apply the fix**

In `arca-sync-service.ts`, replace lines 1535–1544:

```typescript
// BEFORE:
  for (const order of ktOrders) {
    if (order.articlesSyncedAt) { articlesReady++; } else { articlesPending++; }
    const hasMatch = order.customerProfileId ? subByProfile.has(order.customerProfileId) : false;
    if (hasMatch) {
      matched++;
      if (order.articlesSyncedAt) readyToExport++;
    } else {
      unmatched.push({ orderId: order.id, customerName: order.customerName, customerProfileId: order.customerProfileId });
    }
  }

// AFTER:
  for (const order of ktOrders) {
    const hasMatch = order.customerProfileId ? subByProfile.has(order.customerProfileId) : false;
    if (hasMatch) {
      matched++;
      if (order.articlesSyncedAt) { articlesReady++; readyToExport++; }
      else { articlesPending++; }
    } else {
      unmatched.push({ orderId: order.id, customerName: order.customerName, customerProfileId: order.customerProfileId });
    }
  }
```

- [ ] **Step 1.4 — Run the test to verify it passes**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose --run arca-sync-service.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 1.5 — Run full backend test suite to check for regressions**

```bash
npm test --prefix archibald-web-app/backend
```

Expected: all existing tests pass.

- [ ] **Step 1.6 — Commit**

```bash
git add archibald-web-app/backend/src/services/arca-sync-service.ts archibald-web-app/backend/src/services/arca-sync-service.spec.ts
git commit -m "fix(sync): exclude unmatched KT orders from articlesPending count"
```

---

## Task 2 — Fix `generateSyncVbs`: ANAGRAFE section before FT/KT records

**Context:** `generateSyncVbs` in `arca-sync-service.ts` (line 430). Currently: connection setup → FT/KT loop (line 488) → ANAGRAFE block (line 557). Must become: connection setup → ANAGRAFE block → FT/KT loop. This ensures new customers are written to ANAGRAFE.DBF before ArcaPro tries to look them up as `CODICECF`.

**Files:**
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.spec.ts`
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.ts:430-577`

- [ ] **Step 2.1 — Write the failing test**

Add in `describe("generateVbsScript"` in `arca-sync-service.spec.ts`:

```typescript
test("ANAGRAFE section appears before FT/KT document records in VBS output", () => {
  const arcaData = makeArcaData();
  const records: VbsExportRecord[] = [
    { invoiceNumber: "FT 1/2026", arcaData },
  ];
  const anagrafeRecord: AnagrafeExportRecord = {
    subclient: {
      ...makeMinimalSubclient(),
      codice: "C00042",
      ragioneSociale: "Nuovo Cliente Srl",
    },
  };

  const result = generateVbsScript(records, [anagrafeRecord]);

  const anagrafePos = result.vbs.indexOf("' --- ANAGRAFE Export ---");
  const ftPos = result.vbs.indexOf("' --- FT 1/2026 ---");

  expect(anagrafePos).toBeGreaterThan(-1);
  expect(ftPos).toBeGreaterThan(-1);
  expect(anagrafePos).toBeLessThan(ftPos);
});
```

- [ ] **Step 2.2 — Run the test to verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose --run arca-sync-service.spec.ts
```

Expected: FAIL — `anagrafePos > ftPos` because ANAGRAFE currently comes after.

- [ ] **Step 2.3 — Apply the fix**

In `generateSyncVbs` (`arca-sync-service.ts`), move the ANAGRAFE block (lines 557–577) to run **before** the FT/KT loop. The block reads:

```typescript
// Move this entire block from AFTER the loop to BEFORE `for (const record of records) {`
// ANAGRAFE export for new/modified subclients
if (anagrafeRecords && anagrafeRecords.length > 0) {
  lines.push("' --- ANAGRAFE Export ---");
  for (const { subclient } of anagrafeRecords) {
    lines.push(`' --- ANAGRAFE ${sanitizeVbsComment(subclient.codice)} ---`);
    lines.push("Err.Clear");
    for (const l of buildExecScriptAnagrafe(subclient)) {
      lines.push(l);
    }
    lines.push("If Err.Number <> 0 Then");
    lines.push(
      `  logFile.WriteLine "ERROR anagrafe ${sanitizeVbsComment(subclient.codice)}: " & Err.Description`,
    );
    lines.push("  errCount = errCount + 1");
    lines.push("  Err.Clear");
    lines.push("Else");
    lines.push("  okCount = okCount + 1");
    lines.push("End If");
    lines.push("");
  }
}
```

The structure after the edit (from line ~486 onward):

```
lines.push(""); // end of connection setup

// NEW POSITION: ANAGRAFE first
if (anagrafeRecords && anagrafeRecords.length > 0) { ... }

// then FT/KT
for (const record of records) { ... }

// closing
lines.push("conn.Close");
```

Delete the original ANAGRAFE block from its old position after the FT/KT loop.

- [ ] **Step 2.4 — Run the test to verify it passes**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose --run arca-sync-service.spec.ts
```

Expected: all tests PASS including the new one.

- [ ] **Step 2.5 — Commit**

```bash
git add archibald-web-app/backend/src/services/arca-sync-service.ts archibald-web-app/backend/src/services/arca-sync-service.spec.ts
git commit -m "fix(vbs): generate ANAGRAFE records before FT/KT documents in VBS output"
```

---

## Task 3 — New service functions: `importCustomerAsSubclient` and `suggestNextCodice`

**Context:** These are pure service functions with no side effects outside the DB. `importCustomerAsSubclient` fetches the customer from `agents.customers`, validates the codice, and inserts into `shared.sub_clients`. `suggestNextCodice` returns the next available C code.

**Files:**
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.spec.ts`
- Modify: `archibald-web-app/backend/src/services/arca-sync-service.ts` (add at end of file before last `}`)

- [ ] **Step 3.1 — Write failing tests for `suggestNextCodice`**

```typescript
// arca-sync-service.spec.ts — add new describe block
import { suggestNextCodice, importCustomerAsSubclient } from "./arca-sync-service";

describe("suggestNextCodice", () => {
  test("returns C00001 when no C codes exist", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ max_codice: null }] }),
    } as unknown as DbPool;

    const result = await suggestNextCodice(pool);

    expect(result).toBe("C00001");
  });

  test("increments the max code by 1", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ max_codice: "C00041" }] }),
    } as unknown as DbPool;

    const result = await suggestNextCodice(pool);

    expect(result).toBe("C00042");
  });

  test("throws when C99999 is the max (overflow)", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ max_codice: "C99999" }] }),
    } as unknown as DbPool;

    await expect(suggestNextCodice(pool)).rejects.toThrow("Codici C esauriti");
  });
});
```

- [ ] **Step 3.2 — Write failing tests for `importCustomerAsSubclient`**

```typescript
describe("importCustomerAsSubclient", () => {
  const baseCustomer = {
    customer_profile: "C01273",
    user_id: "user-1",
    name: "LAB. ODONTOIATRICO ROSSI SRL",
    vat_number: "12345678901",
    fiscal_code: null,
    phone: "0812345678",
    mobile: null,
    email: "rossi@lab.it",
    pec: null,
    url: null,
    street: "VIA ROMA, 15",
    postal_code: "80100",
    city: "NAPOLI",
    attention_to: null,
  };

  test("inserts subclient with correct field mapping and cod_nazione = 'I'", async () => {
    const insertedRows: unknown[] = [];
    const pool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        if (sql.includes("SELECT") && sql.includes("agents.customers")) {
          return Promise.resolve({ rows: [baseCustomer] });
        }
        if (sql.includes("INSERT INTO shared.sub_clients")) {
          insertedRows.push(params);
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as DbPool;

    await importCustomerAsSubclient(pool, "user-1", "C01273", "C00042");

    expect(insertedRows).toHaveLength(1);
    const params = insertedRows[0] as unknown[];
    // codice, ragione_sociale, partita_iva, telefono, email, indirizzo, cap, localita, cod_nazione, cb_nazione, matched_customer_profile_id
    expect(params).toContain("C00042");
    expect(params).toContain("LAB. ODONTOIATRICO ROSSI SRL");
    expect(params).toContain("12345678901");
    expect(params).toContain("C01273");
    // cod_nazione and cb_nazione must both be 'I'
    const iCount = (params as string[]).filter(p => p === "I").length;
    expect(iCount).toBe(2);
  });

  test("throws 'Codice già in uso' when INSERT hits conflict", async () => {
    const conflict = Object.assign(new Error("duplicate key value"), { code: "23505" });
    const pool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("agents.customers")) return Promise.resolve({ rows: [baseCustomer] });
        if (sql.includes("INSERT")) return Promise.reject(conflict);
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as DbPool;

    await expect(importCustomerAsSubclient(pool, "user-1", "C01273", "C00042"))
      .rejects.toThrow("Codice già in uso");
  });

  test("throws 'Cliente non trovato' when customer profile does not exist", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }), // empty = not found
    } as unknown as DbPool;

    await expect(importCustomerAsSubclient(pool, "user-1", "C01273", "C00042"))
      .rejects.toThrow("Cliente non trovato");
  });

  test("throws on invalid codice format", async () => {
    const pool = { query: vi.fn() } as unknown as DbPool;

    await expect(importCustomerAsSubclient(pool, "user-1", "C01273", "P00001"))
      .rejects.toThrow("Formato codice non valido");
    await expect(importCustomerAsSubclient(pool, "user-1", "C01273", "CTEST1"))
      .rejects.toThrow("Formato codice non valido");
    await expect(importCustomerAsSubclient(pool, "user-1", "C01273", "C1234"))
      .rejects.toThrow("Formato codice non valido");
  });

  test("truncates name to 40 characters for DESCRIZION", async () => {
    const longNameCustomer = { ...baseCustomer, name: "A".repeat(50) };
    const insertedParams: unknown[][] = [];
    const pool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        if (sql.includes("agents.customers")) return Promise.resolve({ rows: [longNameCustomer] });
        if (sql.includes("INSERT")) { insertedParams.push(params); return Promise.resolve({ rows: [] }); }
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as DbPool;

    await importCustomerAsSubclient(pool, "user-1", "C01273", "C00042");

    const name = (insertedParams[0] as string[]).find(p => typeof p === "string" && p.length === 40);
    expect(name).toBe("A".repeat(40));
  });
});
```

- [ ] **Step 3.3 — Run tests to verify they fail**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose --run arca-sync-service.spec.ts
```

Expected: FAIL — `suggestNextCodice` and `importCustomerAsSubclient` are not exported yet.

- [ ] **Step 3.4 — Implement `suggestNextCodice`**

Add at the end of `arca-sync-service.ts` (before the final closing of the module):

```typescript
export async function suggestNextCodice(pool: DbPool): Promise<string> {
  const { rows } = await pool.query<{ max_codice: string | null }>(
    `SELECT MAX(codice) AS max_codice FROM shared.sub_clients WHERE codice ~ '^C[0-9]{5}$'`,
  );
  const max = rows[0]?.max_codice;
  if (!max) return 'C00001';
  if (max === 'C99999') throw new Error('Codici C esauriti: tutti i codici C00001-C99999 sono in uso');
  const next = parseInt(max.slice(1), 10) + 1;
  return 'C' + String(next).padStart(5, '0');
}
```

- [ ] **Step 3.5 — Implement `importCustomerAsSubclient`**

```typescript
export async function importCustomerAsSubclient(
  pool: DbPool,
  userId: string,
  customerProfileId: string,
  codice: string,
): Promise<void> {
  if (!/^C[0-9]{5}$/.test(codice)) {
    throw new Error('Formato codice non valido: deve essere C seguito da 5 cifre');
  }

  const { rows } = await pool.query<{
    name: string; vat_number: string | null; fiscal_code: string | null;
    phone: string | null; mobile: string | null; email: string | null;
    pec: string | null; url: string | null; street: string | null;
    postal_code: string | null; city: string | null; attention_to: string | null;
  }>(
    `SELECT name, vat_number, fiscal_code, phone, mobile, email, pec, url,
            street, postal_code, city, attention_to
     FROM agents.customers
     WHERE customer_profile = $1 AND user_id = $2`,
    [customerProfileId, userId],
  );

  if (rows.length === 0) throw new Error('Cliente non trovato');
  const c = rows[0];

  try {
    await pool.query(
      `INSERT INTO shared.sub_clients
         (codice, ragione_sociale, partita_iva, cod_fiscale,
          telefono, telefono2, email, email_amministraz, url,
          indirizzo, cap, localita, pers_da_contattare,
          cod_nazione, cb_nazione,
          matched_customer_profile_id, arca_synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NULL)`,
      [
        codice,
        c.name.slice(0, 40),
        c.vat_number,
        c.fiscal_code,
        c.phone,
        c.mobile,
        c.email,
        c.pec,
        c.url,
        c.street,
        c.postal_code,
        c.city,
        c.attention_to,
        'I',  // cod_nazione — ArcaPro uses 'I', not 'IT'
        'I',  // cb_nazione
        customerProfileId,
      ],
    );
  } catch (err: any) {
    if (err?.code === '23505') throw new Error('Codice già in uso');
    throw err;
  }
}
```

- [ ] **Step 3.6 — Run tests to verify they pass**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose --run arca-sync-service.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 3.7 — Type-check**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: no TypeScript errors.

- [ ] **Step 3.8 — Commit**

```bash
git add archibald-web-app/backend/src/services/arca-sync-service.ts archibald-web-app/backend/src/services/arca-sync-service.spec.ts
git commit -m "feat(sync): add importCustomerAsSubclient and suggestNextCodice service functions"
```

---

## Task 4 — New backend endpoints: `suggest-codice`, `check-codice`, `import-customer`

**Context:** Three new GET/POST routes added to `createArcaSyncRouter` in `arca-sync.ts`. Tests go in a new file `arca-sync.spec.ts` following the same pattern as `delta-sync.spec.ts` (express app + supertest, mock pool).

**Files:**
- Create: `archibald-web-app/backend/src/routes/arca-sync.spec.ts`
- Modify: `archibald-web-app/backend/src/routes/arca-sync.ts`

- [ ] **Step 4.1 — Write failing route tests**

Create `archibald-web-app/backend/src/routes/arca-sync.spec.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createArcaSyncRouter, type ArcaSyncRouterDeps } from './arca-sync';

vi.mock('../services/arca-sync-service', () => ({
  performArcaSync: vi.fn(),
  getKtSyncStatus: vi.fn(),
  generateKtExportVbs: vi.fn(),
  suggestNextCodice: vi.fn(),
  importCustomerAsSubclient: vi.fn(),
}));

import {
  suggestNextCodice,
  importCustomerAsSubclient,
} from '../services/arca-sync-service';

const mockSuggestNextCodice = vi.mocked(suggestNextCodice);
const mockImportCustomerAsSubclient = vi.mocked(importCustomerAsSubclient);

function makeDeps(): ArcaSyncRouterDeps {
  return {
    pool: { query: vi.fn() } as unknown as ArcaSyncRouterDeps['pool'],
  };
}

function createApp(deps: ArcaSyncRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/arca-sync', createArcaSyncRouter(deps));
  return app;
}

describe('GET /api/arca-sync/suggest-codice', () => {
  let deps: ArcaSyncRouterDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeDeps();
  });

  test('returns suggested code from service', async () => {
    mockSuggestNextCodice.mockResolvedValue('C00042');

    const res = await request(createApp(deps)).get('/api/arca-sync/suggest-codice');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestedCode: 'C00042' });
  });

  test('returns 422 when service throws overflow error', async () => {
    mockSuggestNextCodice.mockRejectedValue(new Error('Codici C esauriti'));

    const res = await request(createApp(deps)).get('/api/arca-sync/suggest-codice');

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('Codici C esauriti');
  });
});

describe('GET /api/arca-sync/check-codice', () => {
  let deps: ArcaSyncRouterDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeDeps();
  });

  test('returns exists: false when codice is not in sub_clients', async () => {
    (deps.pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

    const res = await request(createApp(deps)).get('/api/arca-sync/check-codice?code=C00042');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false });
  });

  test('returns exists: true when codice is found in sub_clients', async () => {
    (deps.pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [{ codice: 'C00042' }] });

    const res = await request(createApp(deps)).get('/api/arca-sync/check-codice?code=C00042');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true });
  });

  test('returns 400 when code query param is missing', async () => {
    const res = await request(createApp(deps)).get('/api/arca-sync/check-codice');

    expect(res.status).toBe(400);
  });
});

describe('POST /api/arca-sync/import-customer', () => {
  let deps: ArcaSyncRouterDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeDeps();
  });

  test('returns 200 on success', async () => {
    mockImportCustomerAsSubclient.mockResolvedValue(undefined);

    const res = await request(createApp(deps))
      .post('/api/arca-sync/import-customer')
      .send({ customerProfileId: 'C01273', codice: 'C00042' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, codice: 'C00042' });
    expect(mockImportCustomerAsSubclient).toHaveBeenCalledWith(
      deps.pool, 'user-1', 'C01273', 'C00042',
    );
  });

  test('returns 409 when service throws "Codice già in uso"', async () => {
    mockImportCustomerAsSubclient.mockRejectedValue(new Error('Codice già in uso'));

    const res = await request(createApp(deps))
      .post('/api/arca-sync/import-customer')
      .send({ customerProfileId: 'C01273', codice: 'C00042' });

    expect(res.status).toBe(409);
  });

  test('returns 422 when service throws format validation error', async () => {
    mockImportCustomerAsSubclient.mockRejectedValue(new Error('Formato codice non valido'));

    const res = await request(createApp(deps))
      .post('/api/arca-sync/import-customer')
      .send({ customerProfileId: 'C01273', codice: 'P00001' });

    expect(res.status).toBe(422);
  });

  test('returns 400 when request body is missing required fields', async () => {
    const res = await request(createApp(deps))
      .post('/api/arca-sync/import-customer')
      .send({ codice: 'C00042' }); // missing customerProfileId

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4.2 — Run tests to verify they fail**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose --run arca-sync.spec.ts
```

Expected: FAIL — routes do not exist yet.

- [ ] **Step 4.3 — Add the 3 endpoints to `arca-sync.ts`**

Add these imports at the top of `arca-sync.ts`:

```typescript
import {
  performArcaSync, getKtSyncStatus, generateKtExportVbs,
  suggestNextCodice, importCustomerAsSubclient,   // ADD THESE
} from '../services/arca-sync-service';
```

Add the 3 routes **before** `return router;` in `createArcaSyncRouter`:

```typescript
  router.get('/suggest-codice', async (req: AuthRequest, res) => {
    try {
      const suggestedCode = await suggestNextCodice(deps.pool);
      res.json({ suggestedCode });
    } catch (err: any) {
      res.status(422).json({ error: err.message || 'Failed to suggest codice' });
    }
  });

  router.get('/check-codice', async (req: AuthRequest, res) => {
    const code = req.query.code as string | undefined;
    if (!code) return res.status(400).json({ error: 'Parametro code mancante' });
    try {
      const { rows } = await deps.pool.query(
        `SELECT codice FROM shared.sub_clients WHERE codice = $1 LIMIT 1`,
        [code],
      );
      res.json({ exists: rows.length > 0 });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to check codice' });
    }
  });

  router.post('/import-customer', async (req: AuthRequest, res) => {
    const { customerProfileId, codice } = req.body ?? {};
    if (!customerProfileId || !codice) {
      return res.status(400).json({ error: 'customerProfileId e codice sono obbligatori' });
    }
    try {
      await importCustomerAsSubclient(deps.pool, req.user!.userId, customerProfileId, codice);
      res.json({ success: true, codice });
    } catch (err: any) {
      if (err.message === 'Codice già in uso') return res.status(409).json({ error: err.message });
      if (err.message?.startsWith('Formato codice non valido')) return res.status(422).json({ error: err.message });
      res.status(500).json({ error: err.message || 'Failed to import customer' });
    }
  });
```

- [ ] **Step 4.4 — Run tests to verify they pass**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose --run arca-sync.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 4.5 — Type-check**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 4.6 — Run full backend test suite**

```bash
npm test --prefix archibald-web-app/backend
```

- [ ] **Step 4.7 — Commit**

```bash
git add archibald-web-app/backend/src/routes/arca-sync.ts archibald-web-app/backend/src/routes/arca-sync.spec.ts
git commit -m "feat(api): add suggest-codice, check-codice, import-customer endpoints"
```

---

## Task 5 — Frontend: "Importa in Arca" in `InlineMatcher`

**Context:** `InlineMatcher` is a component defined inside `ArcaSyncButton.tsx` (lines 38–181). It currently has two actions: select a subclient (search) or skip (Salta). Add a third mode: "Importa in Arca" which shows a CODICE mini-form.

**Files:**
- Modify: `archibald-web-app/frontend/src/components/ArcaSyncButton.tsx`

- [ ] **Step 5.1 — Add state and API calls inside `InlineMatcher`**

Inside `InlineMatcher`, add these state variables and helpers **after** the existing `const [matching, setMatching]` line:

```typescript
// Mode toggle
const [mode, setMode] = useState<'search' | 'import'>('search');

// Import form state
const [importCodice, setImportCodice] = useState('');
const [importChecking, setImportChecking] = useState(false);
const [importExists, setImportExists] = useState<boolean | null>(null);
const [importing, setImporting] = useState(false);
const [importError, setImportError] = useState<string | null>(null);
```

Add the effect to fetch the suggested code when switching to import mode and to validate in real time:

```typescript
// Fetch suggested code once when entering import mode
useEffect(() => {
  if (mode !== 'import') return;
  fetch('/api/arca-sync/suggest-codice', { headers: authHeaders() })
    .then(r => r.json())
    .then((d: { suggestedCode?: string }) => {
      if (d.suggestedCode) setImportCodice(d.suggestedCode);
    })
    .catch(() => {/* use empty field */});
}, [mode]);

// Real-time validation — debounced 300ms
useEffect(() => {
  if (mode !== 'import') return;
  if (!/^C[0-9]{5}$/.test(importCodice)) { setImportExists(null); return; }
  setImportChecking(true);
  const t = setTimeout(() => {
    fetch(`/api/arca-sync/check-codice?code=${importCodice}`, { headers: authHeaders() })
      .then(r => r.json())
      .then((d: { exists: boolean }) => { setImportExists(d.exists); setImportChecking(false); })
      .catch(() => setImportChecking(false));
  }, 300);
  return () => clearTimeout(t);
}, [importCodice, mode]);
```

Add a helper to get auth headers (add at the top of `ArcaSyncButton.tsx`, outside components):

```typescript
function authHeaders(): HeadersInit {
  const jwt = localStorage.getItem('archibald_jwt');
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}
```

Also reset mode and import state when moving to the next item:

```typescript
// Wrap existing moveNext
const moveNext = () => {
  setMode('search');
  setImportCodice('');
  setImportExists(null);
  setImportError(null);
  if (currentIdx + 1 >= items.length) {
    onMatchComplete();
  } else {
    setCurrentIdx((i) => i + 1);
  }
};
```

Add the import submit handler:

```typescript
const handleImportConfirm = async () => {
  if (!current.customerProfileId) { moveNext(); return; }
  setImporting(true);
  setImportError(null);
  try {
    const res = await fetch('/api/arca-sync/import-customer', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerProfileId: current.customerProfileId, codice: importCodice }),
    });
    if (res.status === 409) {
      setImportExists(true);
      setImportError('Codice già in uso — scegli un altro codice');
      setImporting(false);
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Errore sconosciuto' }));
      setImportError(err.error || `Errore ${res.status}`);
      setImporting(false);
      return;
    }
    moveNext();
  } catch {
    setImportError('Errore di rete — riprova');
    setImporting(false);
  }
};
```

- [ ] **Step 5.2 — Update the JSX**

In the JSX of `InlineMatcher`, replace the bottom section (from the action buttons area) with a conditional render for the two modes.

The current bottom (lines ~166–177) has only "Salta". Replace with:

```typescript
{/* Mode toggle */}
<div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
  <button
    onClick={() => setMode('search')}
    style={{
      flex: 1, padding: '5px 10px', borderRadius: '6px', fontSize: '12px',
      border: mode === 'search' ? '2px solid #6366f1' : '1px solid #ddd',
      background: mode === 'search' ? '#eef2ff' : '#fff',
      fontWeight: mode === 'search' ? 700 : 400, cursor: 'pointer',
    }}
  >
    🔗 Abbina
  </button>
  <button
    onClick={() => setMode('import')}
    style={{
      flex: 1, padding: '5px 10px', borderRadius: '6px', fontSize: '12px',
      border: mode === 'import' ? '2px solid #059669' : '1px solid #ddd',
      background: mode === 'import' ? '#ecfdf5' : '#fff',
      fontWeight: mode === 'import' ? 700 : 400, cursor: 'pointer',
    }}
  >
    ➕ Importa in Arca
  </button>
</div>

{mode === 'search' && (
  <>
    {/* existing search input and results */}
    <input autoComplete="off" ... />
    <div style={{ flex: 1, overflow: 'auto', minHeight: '150px' }}>
      {/* existing results list */}
    </div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
      <button onClick={moveNext} style={{ ... }}>Salta</button>
    </div>
  </>
)}

{mode === 'import' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <div style={{ fontSize: '12px', color: '#64748b' }}>
      Crea nuovo cliente in ArcaPro ANAGRAFE e abbina automaticamente.
    </div>
    {/* CODICE input — 'C' locked + 5 digits */}
    <div>
      <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
        Codice ANAGRAFE (C + 5 cifre)
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{
          padding: '8px 10px', background: '#f1f5f9', border: '1px solid #ddd',
          borderRadius: '8px 0 0 8px', fontSize: '14px', fontWeight: 700, color: '#1e293b',
        }}>C</span>
        <input autoComplete="off"
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder="00001"
          value={importCodice.slice(1)}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
            setImportCodice('C' + digits);
            setImportExists(null);
          }}
          style={{
            flex: 1, padding: '8px 10px', border: '1px solid #ddd', borderLeft: 'none',
            borderRadius: '0 8px 8px 0', fontSize: '14px', fontFamily: 'monospace',
          }}
        />
        {importCodice.length === 6 && (
          <span style={{ fontSize: '18px' }}>
            {importChecking ? '⏳' : importExists === true ? '🔴' : importExists === false ? '🟢' : ''}
          </span>
        )}
      </div>
      {importExists === true && (
        <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '3px' }}>
          Codice già in uso — scegli un altro
        </div>
      )}
      {importExists === false && (
        <div style={{ fontSize: '11px', color: '#059669', marginTop: '3px' }}>
          Codice disponibile
        </div>
      )}
    </div>
    {importError && (
      <div style={{ fontSize: '12px', color: '#dc2626', background: '#fef2f2', padding: '6px 10px', borderRadius: '6px' }}>
        {importError}
      </div>
    )}
    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
      <button
        onClick={moveNext}
        style={{
          flex: 1, padding: '7px 12px', borderRadius: '6px', border: '1px solid #ddd',
          background: '#fff', cursor: 'pointer', fontSize: '12px', color: '#666',
        }}
      >
        Salta
      </button>
      <button
        onClick={handleImportConfirm}
        disabled={importing || importExists !== false || importCodice.length !== 6}
        style={{
          flex: 2, padding: '7px 12px', borderRadius: '6px', border: 'none',
          background: importing || importExists !== false || importCodice.length !== 6 ? '#a7f3d0' : '#059669',
          color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '12px',
        }}
      >
        {importing ? 'Importazione...' : '✓ Importa e abbina'}
      </button>
    </div>
  </div>
)}
```

> **Note on restructuring:** The existing JSX inside `InlineMatcher` (search input + results list) must be wrapped in the `mode === 'search'` block. Move the existing `<input>`, results `<div>`, and "Salta" button inside that block. Do not delete or duplicate them.

- [ ] **Step 5.3 — Run frontend tests**

```bash
npm test --prefix archibald-web-app/frontend
```

Expected: existing tests pass. (No new unit tests for this component — the logic is simple fetch calls and state transitions; the spec does not require component-level tests here.)

- [ ] **Step 5.4 — Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: no TypeScript errors.

- [ ] **Step 5.5 — Commit**

```bash
git add archibald-web-app/frontend/src/components/ArcaSyncButton.tsx
git commit -m "feat(ui): add Importa in Arca mode to InlineMatcher during KT sync"
```

---

## Final Verification

- [ ] **Run all backend tests**

```bash
npm test --prefix archibald-web-app/backend
```

- [ ] **Run all frontend tests**

```bash
npm test --prefix archibald-web-app/frontend
```

- [ ] **Type-check both**

```bash
npm run build --prefix archibald-web-app/backend && npm run type-check --prefix archibald-web-app/frontend
```
