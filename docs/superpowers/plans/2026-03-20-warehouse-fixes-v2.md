# Warehouse Fixes v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 issues in the warehouse feature: (A) matching logic for `figura`/`description` levels + new `description` color, (B) missing warehouse fields in `onAddArticle`/`onAddOrder` handlers, (C) full immersive theme on every page element, (D) article code display improvements in CustomerHistoryModal.

**Architecture:** All changes are frontend-only. Task A touches pure logic + types (easy to TDD). Task B is a 2-line bug fix. Task C requires adding a `theme` computed object near the top of the render function in `OrderFormSimple.tsx` and applying it to each element. Task D is a style change in `CustomerHistoryModal.tsx`. Tasks are independent and can be executed sequentially without conflicts.

**Tech Stack:** React 19, TypeScript strict, Vitest, inline `style={{}}` (no CSS classes), Vite frontend.

**Key Files:**
- `archibald-web-app/frontend/src/services/warehouse-matching.ts` — matching logic (Task A)
- `archibald-web-app/frontend/src/services/warehouse-matching.spec.ts` — tests (Task A)
- `archibald-web-app/frontend/src/utils/warehouse-theme.ts` — color palette (Task A)
- `archibald-web-app/frontend/src/components/OrderFormSimple.tsx` — handlers + immersive theme (Tasks B, C)
- `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx` — article code style (Task D)

**Run tests with:** `npm test --prefix archibald-web-app/frontend`
**Run type-check with:** `npm run type-check --prefix archibald-web-app/frontend`

---

## Background: Matching Logic Semantics

The `parseArticleCode` function splits codes like `H129FSQ.104.023` → `{ figura: "H129FSQ", gambo: "104", misura: "023" }`.

**Current levels (to be changed):**
- `exact` (100%): same raw code — **unchanged**
- `figura-gambo` (80%): same figura + same gambo + different misura — **unchanged**
- `figura` (60%): same figura + ANY other difference — **WRONG: too broad**
- `description` (50%): pure fuzzy text similarity ≥ 70% — **WRONG: no code structure check**

**New levels:**
- `figura` (60%): same figura + **same misura** + **different gambo** (gambo must differ, misura must be equal, both non-null)
- `description` (50%): **same gambo** + **same misura** + **different figura** + text similarity ≥ 70% (gambo and misura both non-null)

**What this means:**
- Same figura + diff gambo + diff misura → **NO MATCH** (previously matched as `figura`)
- Same gambo + same misura + diff figura + desc ≥ 70% → `description` (new)
- Same gambo + same misura + diff figura + desc < 70% → **NO MATCH**

---

## Task A: Fix Matching Logic + Description Color

**Files:**
- Modify: `archibald-web-app/frontend/src/services/warehouse-matching.ts`
- Modify: `archibald-web-app/frontend/src/services/warehouse-matching.spec.ts`
- Modify: `archibald-web-app/frontend/src/utils/warehouse-theme.ts`

### Step A1: Write failing tests for new matching logic

Add these tests to `warehouse-matching.spec.ts`. The existing test covers `exact` and `findWarehouseMatchesBatch` — add a new `describe('matchItemAgainstCode via findWarehouseMatchesBatch')` block.

```typescript
describe('matching logic - figura level', () => {
  const baseItem: WarehouseItem = {
    id: 1,
    articleCode: 'H129FSQ.104.023',
    description: 'Testa originale',
    boxName: 'Box A',
    quantity: 5,
    soldInOrder: undefined,
    reservedForOrder: undefined,
    uploadedAt: '2026-01-01T00:00:00Z',
  };

  test('figura: same figura + same misura + different gambo → figura match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    // input: same figura (H129FSQ), different gambo (999 vs 104), same misura (023)
    const result = await findWarehouseMatchesBatch([{ code: 'H129FSQ.999.023' }]);
    expect(result.get('H129FSQ.999.023')?.[0].level).toBe('figura');
  });

  test('figura: same figura + different gambo + different misura → NO match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    // input: same figura, different gambo AND different misura
    const result = await findWarehouseMatchesBatch([{ code: 'H129FSQ.999.099' }]);
    expect(result.get('H129FSQ.999.099')).toEqual([]);
  });

  test('figura: same figura + same gambo + different misura → figura-gambo match (unchanged)', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    const result = await findWarehouseMatchesBatch([{ code: 'H129FSQ.104.099' }]);
    expect(result.get('H129FSQ.104.099')?.[0].level).toBe('figura-gambo');
  });
});

describe('matching logic - description level', () => {
  const baseItem: WarehouseItem = {
    id: 2,
    articleCode: 'XYZ.104.023',
    description: 'vite acciaio inox M6',
    boxName: 'Box B',
    quantity: 3,
    soldInOrder: undefined,
    reservedForOrder: undefined,
    uploadedAt: '2026-01-01T00:00:00Z',
  };

  test('description: same gambo + same misura + different figura + similar desc → description match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    // input: different figura (ABC vs XYZ), same gambo (104), same misura (023), similar description
    const result = await findWarehouseMatchesBatch([{ code: 'ABC.104.023', description: 'vite acciaio inox M6' }]);
    expect(result.get('ABC.104.023')?.[0].level).toBe('description');
  });

  test('description: same gambo + same misura + different figura + dissimilar desc → NO match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    const result = await findWarehouseMatchesBatch([{ code: 'ABC.104.023', description: 'bullone ottone M12' }]);
    expect(result.get('ABC.104.023')).toEqual([]);
  });

  test('description: different gambo + same misura + similar desc → NO match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    const result = await findWarehouseMatchesBatch([{ code: 'ABC.999.023', description: 'vite acciaio inox M6' }]);
    expect(result.get('ABC.999.023')).toEqual([]);
  });

  test('description: same gambo + different misura + similar desc → NO match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    const result = await findWarehouseMatchesBatch([{ code: 'ABC.104.999', description: 'vite acciaio inox M6' }]);
    expect(result.get('ABC.104.999')).toEqual([]);
  });

  test('description: no gambo (single-part code) → NO description match', async () => {
    vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue([baseItem]);
    // Single-part code has null gambo/misura — should never match as description
    const result = await findWarehouseMatchesBatch([{ code: 'ABC', description: 'vite acciaio inox M6' }]);
    expect(result.get('ABC')).toEqual([]);
  });
});
```

- [ ] **Step A1: Add failing tests to `warehouse-matching.spec.ts`**

Add the two `describe` blocks above. The existing `describe('findWarehouseMatchesBatch')` block should remain unchanged.

Run: `npm test --prefix archibald-web-app/frontend -- --reporter=verbose warehouse-matching`
Expected: **FAIL** — new tests fail because current logic is too broad.

- [ ] **Step A2: Update `matchItemAgainstCode` in `warehouse-matching.ts`**

Replace the current Level 3 and Level 4 conditions (lines 164–201) with:

```typescript
  // Level 3: Stessa figura + stessa misura, gambo diverso (60%)
  else if (
    inputParts.figura === itemParts.figura &&
    inputParts.misura !== null &&
    itemParts.misura !== null &&
    inputParts.misura === itemParts.misura &&
    inputParts.gambo !== null &&
    itemParts.gambo !== null &&
    inputParts.gambo !== itemParts.gambo
  ) {
    match = {
      item,
      level: 'figura',
      score: 60,
      availableQty,
      reason: `Stessa figura (${inputParts.figura}) e misura (${itemParts.misura}), gambo diverso: ${itemParts.gambo} vs ${inputParts.gambo}`,
    };
  }
  // Level 4: Stesso gambo + stessa misura, figura diversa, descrizione simile ≥70% (50%)
  else if (
    description &&
    item.description &&
    inputParts.gambo !== null &&
    itemParts.gambo !== null &&
    inputParts.misura !== null &&
    itemParts.misura !== null &&
    inputParts.gambo === itemParts.gambo &&
    inputParts.misura === itemParts.misura &&
    inputParts.figura !== itemParts.figura
  ) {
    const similarity = calculateSimilarity(description, item.description);
    if (similarity >= 0.7) {
      match = {
        item,
        level: 'description',
        score: Math.round(similarity * 50),
        availableQty,
        reason: `Stesso gambo (${itemParts.gambo}) e misura (${itemParts.misura}), figura diversa (${itemParts.figura}). Descrizione simile (${Math.round(similarity * 100)}%)`,
      };
    }
  }
```

- [ ] **Step A3: Run tests — verify new tests pass**

Run: `npm test --prefix archibald-web-app/frontend -- --reporter=verbose warehouse-matching`
Expected: **PASS** — all tests green.

- [ ] **Step A4: Update `description` color + level labels in `warehouse-theme.ts`**

Replace the `description` entry in `WAREHOUSE_LEVEL_COLORS`:
```typescript
// FROM:
description:  { backgroundLight: '#fff7ed', backgroundMid: '#ffedd5', borderColor: '#fb923c', accentColor: '#ea580c', buttonBackground: '#ea580c' },
// TO (dark orange/brown):
description:  { backgroundLight: '#fff7ed', backgroundMid: '#fed7aa', borderColor: '#c2410c', accentColor: '#7c2d12', buttonBackground: '#7c2d12' },
```

Also update `WAREHOUSE_LEVEL_LABELS`:
```typescript
// FROM:
figura: 'Stessa figura',
description: 'Descrizione simile',
// TO:
figura: 'Stessa figura + misura',
description: 'Stesso gambo + misura',
```

- [ ] **Step A5: Run type-check and all tests**

Run:
```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```
Expected: type-check passes, all tests green.

- [ ] **Step A6: Commit**

```bash
git add archibald-web-app/frontend/src/services/warehouse-matching.ts \
        archibald-web-app/frontend/src/services/warehouse-matching.spec.ts \
        archibald-web-app/frontend/src/utils/warehouse-theme.ts
git commit -m "fix(warehouse): narrow figura/description match logic; darken description color"
```

---

## Task B: Fix Missing Warehouse Fields in onAddArticle/onAddOrder

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx` (lines ~5345, ~5368)

**Background:** When the user adds articles from `CustomerHistoryModal`, the `PendingOrderItem` carries `warehouseSources` and `warehouseQuantity` fields. These are mapped to `OrderItem` in two handlers inside `OrderFormSimple.tsx` — but both handlers omit these fields, causing warehouse data to be silently dropped. The riepilogo already renders these fields correctly when present.

### Step B1: Confirm the bug

Read `OrderFormSimple.tsx` around lines 5345–5390 to confirm the `onAddArticle` and `onAddOrder` handlers. Verify:
1. `onAddArticle` builds `mapped: OrderItem` without `warehouseSources`/`warehouseQuantity`
2. `onAddOrder` builds `mapped: OrderItem[]` (via `.map`) without these fields

Also verify that `PendingOrderItem` in `archibald-web-app/frontend/src/types/pending-order.ts` has:
```typescript
warehouseQuantity?: number;
warehouseSources?: Array<{ warehouseItemId: number; boxName: string; quantity: number }>;
```

And that `OrderItem` in `OrderFormSimple.tsx` (around line 40) has matching optional fields.

- [ ] **Step B1: Verify the bug** (read files, no code change yet)

- [ ] **Step B2: Fix `onAddArticle` handler**

In the `mapped: OrderItem` object inside `onAddArticle` (around line 5347), add after `originalListPrice`:
```typescript
warehouseSources: newItem.warehouseSources,
warehouseQuantity: newItem.warehouseQuantity,
```

- [ ] **Step B3: Fix `onAddOrder` handler**

In the `onAddOrder` map callback (around line 5369), add after `originalListPrice`:
```typescript
warehouseSources: newItem.warehouseSources,
warehouseQuantity: newItem.warehouseQuantity,
```

- [ ] **Step B4: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: no errors.

- [ ] **Step B5: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "fix(warehouse): pass warehouseSources and warehouseQuantity through onAddArticle/onAddOrder handlers"
```

---

## Task C: Full Immersive Theme on Every Page Element

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

**Background:** `activeMatchLevel` and `WAREHOUSE_LEVEL_COLORS` are already imported and the state is set. Currently only 4 elements use them: accordion wrapper, 2 history buttons, CTA button. The goal: when there's ANY match, the ENTIRE page reflects the match color. When there's NO match (`none`), the entire page is gray/white/black — specifically, the history buttons must become gray (NOT violet/blue as they currently are for `none` state).

**Key principle:** Compute a `theme` and `isThemed` variable once at the top of the return, then use them everywhere. Use CSS transition `0.4s` on all color-bearing elements for smooth animation.

### Step C1: Add `theme` computed variable near the top of the render

At the top of the `return (...)` block, before the outer `<div>`, add:

```typescript
const theme = WAREHOUSE_LEVEL_COLORS[activeMatchLevel];
const isThemed = activeMatchLevel !== 'none';
```

These two variables will be used throughout the return block. `WAREHOUSE_LEVEL_COLORS` is already imported at the top of the file.

- [ ] **Step C1: Add `theme` / `isThemed` variables just before `return (`**

The current `return (` is around line 2858. Add these two lines immediately before it:
```typescript
const theme = WAREHOUSE_LEVEL_COLORS[activeMatchLevel];
const isThemed = activeMatchLevel !== 'none';
```

Note: Check if `theme` or `isThemed` are already defined elsewhere in the component — if so, use different names like `pageTheme` / `pageIsThemed`.

- [ ] **Step C2: Theme the outer page wrapper (page background)**

Find the outermost `<div style={{ maxWidth: ..., margin: '0 auto', padding: ... }}>` (around line 2859). Add `background` and `transition` to its style:

```typescript
style={{
  maxWidth: isMobile ? "100%" : "1000px",
  margin: "0 auto",
  padding: isMobile ? "1rem" : "2rem",
  ...keyboardPaddingStyle,
  fontFamily: "system-ui",
  background: isThemed
    ? `linear-gradient(135deg, ${theme.backgroundLight} 0%, white 50%, ${theme.backgroundLight} 100%)`
    : 'white',
  transition: 'background 0.4s',
}}
```

- [ ] **Step C3: Theme Section 1 card ("Seleziona Cliente")**

Find the `<div style={{ marginBottom: ..., padding: ..., background: "#f9fafb", borderRadius: "8px" }}>` for Section 1 (around line 2948). Change its style:

```typescript
style={{
  marginBottom: isMobile ? "1rem" : "2rem",
  padding: isMobile ? "1rem" : "1.5rem",
  background: isThemed ? theme.backgroundLight : "#f9fafb",
  borderRadius: "8px",
  border: isThemed ? `2px solid ${theme.borderColor}` : '2px solid transparent',
  transition: 'background 0.4s, border-color 0.4s',
}}
```

Also theme the `<h2>` heading inside it ("1. Seleziona Cliente", around line 2956):
```typescript
style={{
  fontSize: isMobile ? "1.125rem" : "1.25rem",
  marginBottom: "1rem",
  color: isThemed ? theme.accentColor : 'inherit',
  transition: 'color 0.4s',
}}
```

- [ ] **Step C4: Theme the "cliente selezionato" confirmation box**

Find the `<div style={{ background: "#d1fae5", padding: "1rem", ... }}>` (around line 3190). Change it:

```typescript
style={{
  background: isThemed ? theme.backgroundMid : "#d1fae5",
  padding: "1rem",
  borderRadius: "4px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  border: isThemed ? `1px solid ${theme.borderColor}` : 'none',
  transition: 'background 0.4s',
}}
```

Also change the strong inside it (currently `color: "#065f46"`):
```typescript
<strong style={{ color: isThemed ? theme.accentColor : "#065f46" }}>
  ✓ Cliente selezionato:
</strong>
```

And the "Cambia" button (currently `border: "1px solid #065f46"`, `color: "#065f46"`):
```typescript
style={{
  padding: isMobile ? "0.75rem 1rem" : "0.5rem 1rem",
  background: "white",
  border: `1px solid ${isThemed ? theme.accentColor : '#065f46'}`,
  borderRadius: "6px",
  cursor: "pointer",
  color: isThemed ? theme.accentColor : '#065f46',
  fontWeight: "500",
  minHeight: isMobile ? "44px" : "auto",
  transition: 'border-color 0.4s, color 0.4s',
}}
```

- [ ] **Step C5: Theme Section 2 card ("Aggiungi Articoli")**

Find the Section 2 `<div style={{ marginBottom: ..., padding: ..., background: "#f9fafb", borderRadius: "8px" }}>` (around line 3395). Apply same pattern as Section 1:

```typescript
style={{
  marginBottom: isMobile ? "1rem" : "2rem",
  padding: isMobile ? "1rem" : "1.5rem",
  background: isThemed ? theme.backgroundLight : "#f9fafb",
  borderRadius: "8px",
  border: isThemed ? `2px solid ${theme.borderColor}` : '2px solid transparent',
  transition: 'background 0.4s, border-color 0.4s',
}}
```

Theme the `<h2>` inside it ("2. Aggiungi Articoli", around line 3403):
```typescript
style={{
  fontSize: isMobile ? "1.125rem" : "1.25rem",
  marginBottom: "1rem",
  color: isThemed ? theme.accentColor : 'inherit',
  transition: 'color 0.4s',
}}
```

- [ ] **Step C6: Fix the two history buttons for BOTH default and themed states**

Find "I più venduti" button (around line 3353). Replace its `background`:
```typescript
// FROM:
background: activeMatchLevel !== 'none' ? WAREHOUSE_LEVEL_COLORS[activeMatchLevel].accentColor : "#7c3aed",
// TO (use buttonBackground for both states; none state = gray #64748b):
background: theme.buttonBackground,
```

Find "Cerca nello Storico" button (around line 3376). Replace its `background`:
```typescript
// FROM:
background: activeMatchLevel !== 'none' ? WAREHOUSE_LEVEL_COLORS[activeMatchLevel].accentColor : "#2563eb",
// TO:
background: theme.buttonBackground,
```

Both buttons should also get `transition: 'background 0.4s'` if not already present.

- [ ] **Step C7: Theme Section 3 card ("Riepilogo Articoli") and table headers**

Find the Section 3 `<div style={{ marginBottom: ..., padding: ..., background: "#f9fafb", borderRadius: "8px" }}>` (around line 4093). Apply same pattern:

```typescript
style={{
  marginBottom: isMobile ? "1rem" : "2rem",
  padding: isMobile ? "1rem" : "1.5rem",
  background: isThemed ? theme.backgroundLight : "#f9fafb",
  borderRadius: "8px",
  border: isThemed ? `2px solid ${theme.borderColor}` : '2px solid transparent',
  transition: 'background 0.4s, border-color 0.4s',
}}
```

Theme the `<h2>` inside it ("3. Riepilogo Articoli", around line 4101):
```typescript
style={{
  fontSize: isMobile ? "1.125rem" : "1.25rem",
  marginBottom: "1rem",
  color: isThemed ? theme.accentColor : 'inherit',
  transition: 'color 0.4s',
}}
```

Theme the `<thead><tr>` inside the riepilogo table (around line 4134):
```typescript
style={{
  background: isThemed ? theme.backgroundMid : "#f3f4f6",
  borderBottom: `2px solid ${isThemed ? theme.borderColor : '#e5e7eb'}`,
  transition: 'background 0.4s, border-color 0.4s',
}}
```

**Note:** There is also a mobile view in the riepilogo. If the mobile view has its own section-like headings or card backgrounds, apply the same pattern. Check around line 4200+ for any `background: "#f9fafb"` or `background: "#f3f4f6"` inside the Section 3 block.

- [ ] **Step C8: Run type-check and tests**

Run:
```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```
Expected: all passing.

- [ ] **Step C9: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(warehouse): apply full immersive 4-color theme to every page element in /order"
```

---

## Task D: Article Code Display Improvements in CustomerHistoryModal

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx`

**Background:** In `ArticleRow` (around line 776), the article code is shown in monospace, small (10px), indigo color. The user wants:
1. Code to be larger and bolder (easier to distinguish)
2. When the article has a substitute code (`substituteCode`) OR is unmatched (`isUnmatched`), the original code should show with strikethrough (`textDecoration: 'line-through'`)

The `substituteCode` prop indicates the article was replaced by another code. `isUnmatched` indicates the article is no longer in the catalog. In both cases, the original code is "old/obsolete" and should appear struck through.

- [ ] **Step D1: Update article code styling in `ArticleRow`**

Find line 776 in `CustomerHistoryModal.tsx`:
```typescript
<span style={{ fontFamily: 'monospace', fontSize: 10, color: '#6366f1', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
  {article.articleCode}
</span>
```

Replace with:
```typescript
<span style={{
  fontFamily: 'monospace',
  fontSize: 12,
  color: '#6366f1',
  fontWeight: 700,
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textDecoration: (substituteCode || isUnmatched) ? 'line-through' : 'none',
  opacity: (substituteCode || isUnmatched) ? 0.7 : 1,
}}>
  {article.articleCode}
</span>
```

**No other changes.** The `substituteCode` and `isUnmatched` props are already passed to `ArticleRow`. The `→ substituteCode` display below (line 779) stays as is.

- [ ] **Step D2: Run type-check and tests**

Run:
```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```
Expected: all passing.

- [ ] **Step D3: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx
git commit -m "feat(warehouse): make article code bolder; add strikethrough for discontinued/substituted codes"
```

---

## Final Verification

After all 4 tasks are committed:

- [ ] Run full test suite: `npm test --prefix archibald-web-app/frontend`
- [ ] Run type-check: `npm run type-check --prefix archibald-web-app/frontend`
- [ ] All passing → proceed to `superpowers:finishing-a-development-branch`
