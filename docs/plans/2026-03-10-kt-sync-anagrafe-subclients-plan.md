# KT Sync + ANAGRAFE + Sottoclienti — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable syncing orders from /orders as KT documents to ArcaPro, with bidirectional ANAGRAFE sync and a subclients management tab.

**Architecture:** Extend existing `shared.sub_clients` table with ANAGRAFE fields + matching. New `generateArcaDataFromOrder()` maps orders to KT ArcaData. Extend `performArcaSync()` to include KT export. Add manual KT sync from /orders via File System Access API. Add "Sottoclienti" tab to /fresis-history.

**Tech Stack:** TypeScript, PostgreSQL, Express, React 19, Vitest, File System Access API, VFPOLEDB/EXECSCRIPT

**Design doc:** `docs/plans/2026-03-10-kt-sync-anagrafe-subclients-design.md`

---

## Task 1: Extend sub_clients table with ANAGRAFE fields + matching

**Files:**
- Create: `backend/src/db/migrations/020-extend-subclients-anagrafe.sql`
- Modify: `backend/src/db/repositories/subclients.ts`

**Step 1: Write migration 020**

```sql
-- Migration 020: Extend sub_clients with full ANAGRAFE fields + matching
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS agente TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS agente2 TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS settore TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS classe TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS pag TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS listino TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS banca TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS valuta TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS cod_nazione TEXT DEFAULT 'IT';
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS aliiva TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS contoscar TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS tipofatt TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS telefono2 TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS telefono3 TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS cb_nazione TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS cb_bic TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS cb_cin_ue TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS cb_cin_it TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS abicab TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS contocorr TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS matched_customer_profile_id TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS match_confidence TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS arca_synced_at TIMESTAMPTZ;

ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS arca_kt_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sub_clients_partita_iva ON shared.sub_clients(partita_iva);
CREATE INDEX IF NOT EXISTS idx_sub_clients_match ON shared.sub_clients(matched_customer_profile_id);
```

**Step 2: Update SubclientRow type and repository**

Extend `SubclientRow` and `Subclient` types in `subclients.ts` with the new columns. Update `COLUMNS`, `mapRowToSubclient`, and `upsertSubclients` to include all new fields. Add new functions:
- `getUnmatchedSubclients(pool)` — returns subclients where `matched_customer_profile_id IS NULL`
- `setSubclientMatch(pool, codice, customerProfileId, confidence)` — sets match
- `clearSubclientMatch(pool, codice)` — clears match
- `getSubclientByCustomerProfile(pool, profileId)` — reverse lookup

**Step 3: Run migration and tests**

```bash
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend
```

**Step 4: Commit**

```
feat(db): extend sub_clients with ANAGRAFE fields and matching columns
```

---

## Task 2: ANAGRAFE sync (Arca → PWA) in performArcaSync

**Files:**
- Modify: `backend/src/services/arca-sync-service.ts` (parseNativeArcaFiles area)
- Modify: `backend/src/db/repositories/subclients.ts` (upsert with new fields)
- Test: `backend/src/services/arca-sync-service.spec.ts`

**Step 1: Write failing test**

Add test to `arca-sync-service.spec.ts` in the `performArcaSync` describe:
```ts
test("syncs ANAGRAFE records to sub_clients table", async () => {
  // Provide doctes + docrig + anagrafe buffers
  // Mock pool to capture sub_clients upsert calls
  // Verify upsertSubclients is called with all ANAGRAFE fields
});
```

**Step 2: Implement ANAGRAFE parsing in performArcaSync**

In `parseNativeArcaFiles`, the `clientNameMap` already parses ANAGRAFE. Extend it to return full subclient records (all fields from ANAGRAFE.DBF schema). After the import phase in `performArcaSync`, call `upsertSubclients` with the full ANAGRAFE data.

Key ANAGRAFE fields to map:
- CODICE → codice
- DESCRIZION → ragione_sociale
- SUPRAGSOC → suppl_ragione_sociale
- PARTIVA → partita_iva
- CODFISCALE → cod_fiscale
- INDIRIZZO, CAP, LOCALITA, PROV → same
- TELEFONO, TELEFONO2, TELEFONO3, FAX, EMAIL → same
- ZONA, AGENTE, AGENTE2, SETTORE, CLASSE → same
- PAG, LISTINO, BANCA, VALUTA → same
- ALIIVA, CONTOSCAR, TIPOFATT → same
- CB_NAZIONE, CB_BIC, CB_CIN_UE, CB_CIN_IT, ABICAB, CONTOCORR → same
- COD_NAZIONE → cod_nazione
- PERSDACONT → pers_da_contattare

**Step 3: Run tests, commit**

```
feat(arca-sync): sync full ANAGRAFE fields to sub_clients during Arca sync
```

---

## Task 3: Auto-matching subclients ↔ Archibald customers

**Files:**
- Create: `backend/src/services/subclient-matcher.ts`
- Create: `backend/src/services/subclient-matcher.spec.ts`

**Step 1: Write failing tests**

```ts
describe("matchSubclients", () => {
  test("matches by VAT number with confidence=vat", ...);
  test("matches by multi-field (name+phone+address) with confidence=multi-field", ...);
  test("does not overwrite existing manual match", ...);
  test("skips already matched subclients", ...);
});
```

**Step 2: Implement matcher**

```ts
export async function matchSubclients(pool: DbPool): Promise<MatchResult> {
  // 1. Get unmatched subclients
  // 2. Get all Archibald customers
  // 3. For each unmatched subclient:
  //    a. Try VAT match (exact partita_iva)
  //    b. If no VAT match, try multi-field score:
  //       - Name similarity (normalized, Levenshtein or token overlap)
  //       - Phone match (normalized digits)
  //       - Address match (normalized)
  //       - Score ≥ threshold → match
  // 4. Save matches
  return { matched, unmatched };
}
```

**Step 3: Call matchSubclients at end of performArcaSync after ANAGRAFE upsert**

**Step 4: Run tests, commit**

```
feat(arca-sync): auto-match subclients to Archibald customers by VAT and multi-field
```

---

## Task 4: Rename getNextFtNumber → getNextDocNumber (shared counter)

**Files:**
- Modify: `backend/src/services/ft-counter.ts`
- Modify: `backend/src/operations/handlers/send-to-verona.ts:6,87`
- Modify: `backend/src/services/arca-sync-service.ts` (ft_counter update section)
- Modify: `backend/src/routes/fresis-history.ts` (next-ft-number endpoint)

**Step 1: Add getNextDocNumber as alias**

In `ft-counter.ts`, add:
```ts
export { getNextFtNumber, getNextFtNumber as getNextDocNumber };
```

**Step 2: Update arca-sync-service.ts to update counter for BOTH FT and KT**

Currently line ~917 only updates for `tipodoc === "FT"`. Change to include KT:
```ts
if (tipodoc !== "FT" && tipodoc !== "KT") continue;
```

**Step 3: Run tests, commit**

```
refactor(ft-counter): add getNextDocNumber alias and include KT in counter sync
```

---

## Task 5: generateArcaDataFromOrder function

**Files:**
- Create: `backend/src/services/generate-arca-data-from-order.ts`
- Create: `backend/src/services/generate-arca-data-from-order.spec.ts`

**Step 1: Write failing tests**

```ts
describe("generateArcaDataFromOrder", () => {
  test("generates KT ArcaData with TIPODOC=KT", ...);
  test("maps order_articles to docrig rows with correct fields", ...);
  test("uses subclient CODICECF, ZONA, PAG from sub_clients", ...);
  test("calculates TOTMERCE, TOTNETTO, TOTIVA, TOTDOC correctly", ...);
  test("sets all required Arca fields (CONTOSCARI, FATT, CODCAUMAG, etc.)", ...);
});
```

**Step 2: Implement**

Function signature:
```ts
type OrderForKt = {
  id: string;
  creationDate: string;
  customerName: string;
  discountPercent: number | null;
  notes: string | null;
};

type OrderArticleForKt = {
  articleCode: string;
  articleDescription: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  lineAmount: number;
  unit: string;
};

export function generateArcaDataFromOrder(
  order: OrderForKt,
  articles: OrderArticleForKt[],
  subclient: Subclient,
  docNumber: number,
  esercizio: string,
): ArcaData
```

Reuse `round2`, `formatArcaDate` from `generate-arca-data.ts`. Set `TIPODOC="KT"` and use subclient fields for CODICECF, ZONA, PAG, LISTINO. All other fields identical to FT generation (same CODCAUMAG, MAGPARTENZ, CONTOSCARI, FATT, etc.).

**Step 3: Run tests, commit**

```
feat(arca-sync): add generateArcaDataFromOrder for KT document generation
```

---

## Task 6: Extend performArcaSync to export KT documents

**Files:**
- Modify: `backend/src/services/arca-sync-service.ts`
- Modify: `backend/src/services/arca-sync-service.spec.ts`
- Modify: `backend/src/db/repositories/orders.ts` (new query for KT-eligible orders)

**Step 1: Add getKtEligibleOrders to orders repository**

```ts
export async function getKtEligibleOrders(pool: DbPool, userId: string): Promise<KtEligibleOrder[]> {
  // sent_to_verona_at >= '2026-03-09'
  // arca_kt_synced_at IS NULL
  // customer_name != 'Fresis Soc Cooperativa'
  // JOIN order_articles (must have articles)
}
```

**Step 2: Extend performArcaSync**

After the FT export section, add KT export:
1. Query KT-eligible orders
2. For each, lookup subclient by matching customer
3. Generate ArcaData with `generateArcaDataFromOrder`
4. Add to `exportRecords` with `TIPODOC="KT"`
5. Return list of orders needing manual match (no CODICECF found)

**Step 3: Update SyncResult type**

Add fields: `ktExported: number`, `ktNeedingMatch: Array<{orderId, customerName}>`, `ktMissingArticles: string[]`

**Step 4: Run tests, commit**

```
feat(arca-sync): include KT documents in Arca sync export
```

---

## Task 7: Trigger article sync for orders missing articles

**Files:**
- Modify: `backend/src/services/arca-sync-service.ts`

**Step 1: In performArcaSync KT section**

For orders where `articles_synced_at IS NULL`:
1. Enqueue `sync-order-articles` job for each
2. Return them in `ktMissingArticles` list so frontend can inform user
3. These orders will be picked up in the next sync after articles are available

**Step 2: Run tests, commit**

```
feat(arca-sync): trigger article sync for KT orders missing articles
```

---

## Task 8: KT sync endpoint for manual sync from /orders

**Files:**
- Create: `backend/src/routes/kt-sync.ts`
- Modify: `backend/src/routes/index.ts` (register new route)

**Step 1: Create POST /api/kt-sync endpoint**

```ts
// POST /api/kt-sync
// Body: { orderIds: string[], matchOverrides?: Record<string, string> }
// Returns: { vbsScript: VbsResult, synced: number, errors: string[] }
```

Flow:
1. Fetch order_records + order_articles for given IDs
2. For each order, resolve CODICECF from sub_clients (using matchOverrides if provided)
3. Generate ArcaData with TIPODOC="KT" using getNextDocNumber
4. Generate VBS script with generateVbsScript
5. Mark orders with arca_kt_synced_at = NOW()
6. Return VBS script to frontend

**Step 2: Run tests, commit**

```
feat(api): add POST /api/kt-sync endpoint for manual KT sync from /orders
```

---

## Task 9: ANAGRAFE export (PWA → Arca) for new/modified subclients

**Files:**
- Modify: `backend/src/services/arca-sync-service.ts` (add ANAGRAFE export to VBS)

**Step 1: In performArcaSync, after doctes/docrig export**

Query sub_clients where:
- `arca_synced_at IS NULL` (new, created in PWA)
- OR `updated_at > arca_synced_at` (modified in PWA)

For each, generate EXECSCRIPT to INSERT into ANAGRAFE.DBF using same pattern (USE AGAIN ALIAS, row buffering, TABLEUPDATE).

Generate new CODICECF for new clients: query MAX CODICE from uploaded ANAGRAFE, increment.

**Step 2: Run tests, commit**

```
feat(arca-sync): export new/modified subclients to ANAGRAFE.DBF
```

---

## Task 10: Match manual API endpoints

**Files:**
- Create: `backend/src/routes/subclients.ts`
- Modify: `backend/src/routes/index.ts`

**Step 1: Create subclient API routes**

```
GET    /api/subclients              — list all (with search query param)
GET    /api/subclients/:codice      — get single
POST   /api/subclients/:codice/match   — { customerProfileId } → set manual match
DELETE /api/subclients/:codice/match   — clear match
PUT    /api/subclients/:codice      — update subclient fields
POST   /api/subclients              — create new subclient
```

**Step 2: Run tests, commit**

```
feat(api): add subclient CRUD and manual match endpoints
```

---

## Task 11: Frontend — "Sync KT con Arca" in /orders long-press

**Files:**
- Modify: `frontend/src/pages/OrderHistory.tsx:785-840` (long-press + selection mode)
- Create: `frontend/src/components/KtSyncDialog.tsx`
- Create: `frontend/src/services/kt-sync-browser.ts`

**Step 1: Add "Sync KT con Arca" button to selection mode action bar**

In `OrderHistory.tsx`, in the selection mode footer (near "Crea pila" button), add a new button "Sync KT con Arca".

**Step 2: Create KtSyncDialog component**

Shows:
- List of selected orders with their customer names
- For unmatched customers: inline dropdown to select subclient
- Progress indicator during sync
- Results summary

**Step 3: Create kt-sync-browser.ts**

```ts
export async function performKtSync(
  orderIds: string[],
  matchOverrides: Record<string, string>,
  onProgress: (p: KtSyncProgress) => void,
): Promise<KtSyncResult>
```

Flow:
1. Call POST /api/kt-sync with orderIds + matchOverrides
2. Get VBS script in response
3. Open COOP16 directory (reuse getDirectoryHandle from arca-sync-browser.ts)
4. Write sync_arca.vbs to directory
5. Return result

**Step 4: Add KT badge on order cards**

In `OrderCardNew.tsx`, show a small "KT" badge if `order.arca_kt_synced_at` is set.

**Step 5: Run frontend type-check and tests, commit**

```
feat(frontend): add KT sync from /orders page via long-press selection
```

---

## Task 12: Frontend — Extend Arca Sync button to show KT count

**Files:**
- Modify: `frontend/src/components/ArcaSyncButton.tsx`
- Modify: `frontend/src/services/arca-sync-browser.ts`

**Step 1: Update ArcaSyncButton results display**

After sync, show: "Importati: X, Esportati: Y FT + Z KT". Show warning for orders needing match.

**Step 2: Add match dialog for unmatched KT orders**

If `syncResult.ktNeedingMatch.length > 0`, show dialog with match dropdowns before finalizing.

**Step 3: Run type-check, commit**

```
feat(frontend): show KT export count in Arca sync results and match dialog
```

---

## Task 13: Frontend — "Sottoclienti" tab in /fresis-history

**Files:**
- Modify: `frontend/src/pages/FresisHistoryPage.tsx`
- Create: `frontend/src/components/SubClientCard.tsx`
- Create: `frontend/src/components/SubClientDetail.tsx`
- Create: `frontend/src/components/SubClientMatchDialog.tsx`
- Create: `frontend/src/services/subclients.service.ts`

**Step 1: Add tab structure to FresisHistoryPage**

Add tab bar at top: "Documenti" (default) | "Sottoclienti". Tab style consistent with existing app patterns.

**Step 2: Create subclients.service.ts**

```ts
export async function getSubclients(search?: string): Promise<Subclient[]>
export async function setSubclientMatch(codice: string, profileId: string): Promise<void>
export async function clearSubclientMatch(codice: string): Promise<void>
export async function updateSubclient(codice: string, data: Partial<Subclient>): Promise<void>
export async function createSubclient(data: SubclientInput): Promise<Subclient>
```

**Step 3: Create SubClientCard component**

Style matching CustomerList.tsx (card layout, 12px border-radius, boxShadow).
Shows: nome, codice, P.IVA, indirizzo, zona, telefono.
Badge match: "P.IVA" (green), "Multi-campo" (yellow), "Manuale" (blue), "Non matchato" (red).
Link/unlink button.

**Step 4: Create SubClientDetail modal**

All ANAGRAFE fields displayed. Edit capability. Match management.

**Step 5: Create SubClientMatchDialog**

Dropdown search among Archibald customers. Used from both SubClientCard and KtSyncDialog.

**Step 6: Implement "Sottoclienti" tab content**

Search bar with debounce fulltext on ALL sub_clients fields. Card list. Detail modal on click.

**Step 7: Run type-check and tests, commit**

```
feat(frontend): add Sottoclienti tab to fresis-history with full CRUD and matching
```

---

## Task 14: Integration test — full KT sync round-trip

**Files:**
- Create: `backend/src/services/kt-sync.integration.spec.ts`

**Step 1: Write integration test**

Test the complete flow:
1. Create test order_records + order_articles in mock DB
2. Create test sub_clients with known CODICECF
3. Call the KT sync endpoint
4. Verify returned VBS contains EXECSCRIPT with TIPODOC="KT"
5. Verify all required fields present (CONTOSCARI, FATT, CODCAUMAG, etc.)
6. Verify SCADENZE record included
7. Verify arca_kt_synced_at is set

**Step 2: Run tests, commit**

```
test(arca-sync): add integration test for full KT sync round-trip
```

---

## Task 15: Final verification and cleanup

**Step 1: Run full backend test suite**

```bash
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend
```

**Step 2: Run full frontend type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

**Step 3: Verify on staging/production**

1. Sync Arca from /fresis-history → verify ANAGRAFE imported to sub_clients
2. Check matching results in Sottoclienti tab
3. Select orders in /orders → Sync KT → verify VBS generated
4. Execute VBS on Windows PC → verify KT appears in Arca Professional

**Step 4: Final commit**

```
chore: final cleanup for KT sync + ANAGRAFE + subclients feature
```
