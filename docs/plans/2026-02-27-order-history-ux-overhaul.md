# Order History UX Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Revamp the /orders page with 8 UX improvements: default Articoli tab, search filtering, swipe indicators, visual stacking, fullscreen stack modal, manual stacking via DB, and order notes via DB.

**Architecture:** Frontend-first approach for tasks 1-6 (pure UI changes), then backend+frontend for tasks 7-8 (new DB tables, API endpoints, frontend integration). Each task is independently deployable.

**Tech Stack:** React 19, TypeScript strict, Express, PostgreSQL (`pg` pool), Zod validation, Vitest

---

## Task 1: Default Tab "Articoli"

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx:3333`

**Step 1: Change default tab**

In `OrderCardNew.tsx` line 3333, change:
```ts
// FROM:
>("panoramica");
// TO:
>("articoli");
```

**Step 2: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(orders): default to Articoli tab when expanding order cards"
```

---

## Task 2: Search — Hide Non-Matching Orders

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/OrderHistory.tsx:1773-1856`

Currently, when `debouncedSearch` is active, ALL cards render with `expanded={true}`. We need to:
1. The `filteredOrders` already filters via `matchesGlobalSearch` (line 688-689) — so non-matching orders are already excluded from the list
2. The issue is with **stacks**: if a stack contains a mix of matching and non-matching orders, we still show the whole stack. That behavior is correct — if at least one order in a stack matches, show the stack.
3. Remove the force-expand behavior: when searching, cards should stay collapsed (user can expand manually), but the `HighlightText` highlighting should still work on collapsed cards.

**Step 1: Remove force-expand on search**

In `OrderHistory.tsx`, change the rendering logic around line 1817:

```ts
// FROM:
const isExpanded = debouncedSearch
  ? true
  : expandedOrderId === order.id;

// TO:
const isExpanded = expandedOrderId === order.id;
```

**Step 2: Remove auto-expand from OrderCardStack**

In `OrderCardStack.tsx`, remove the `useEffect` that auto-expands on search (lines 72-74):

```ts
// REMOVE:
useEffect(() => {
  if (isSearchActive) setExpanded(true);
}, [isSearchActive]);
```

**Step 3: Verify search still works**

The `matchesGlobalSearch` at line 688-689 already removes non-matching orders from `filteredOrders`. The `HighlightText` component in collapsed card headers already highlights matches. The `useSearchMatches` navigation bar still works because it scans for `[data-search-match]` in the DOM.

**Step 4: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/OrderHistory.tsx archibald-web-app/frontend/src/components/OrderCardStack.tsx
git commit -m "feat(search): hide non-matching order cards instead of force-expanding all"
```

---

## Task 3: Swipe Indicators (Dots + Arrows)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardStack.tsx`

**Step 1: Add dot indicators below the stacked cards**

After the stacked cards map (after line 378, before the closing `</div>`), add pagination dots:

```tsx
{/* Pagination dots */}
{orders.length > 1 && (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      gap: "6px",
      marginTop: `${containerHeight + 8}px`,
      position: "absolute",
      left: 0,
      right: 0,
    }}
  >
    {orderedCards.map((order, i) => (
      <div
        key={order.id}
        style={{
          width: i === 0 ? "10px" : "6px",
          height: i === 0 ? "10px" : "6px",
          borderRadius: "50%",
          backgroundColor: i === 0 ? (source === "auto-nc" ? "#e65100" : "#1565c0") : "#ccc",
          transition: "all 0.3s ease",
        }}
      />
    ))}
  </div>
)}
```

**Step 2: Add arrow indicators on left/right sides**

Before the stacked cards map, add arrow overlays:

```tsx
{/* Swipe arrows */}
{orders.length > 1 && !expanded && (
  <>
    <div
      onClick={(e) => { e.stopPropagation(); shufflePrev(); }}
      style={{
        position: "absolute",
        left: "-4px",
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 201,
        background: "rgba(255,255,255,0.85)",
        borderRadius: "50%",
        width: "28px",
        height: "28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        cursor: "pointer",
        fontSize: "14px",
        color: "#666",
        pointerEvents: "auto",
      }}
    >
      ‹
    </div>
    <div
      onClick={(e) => { e.stopPropagation(); shuffleNext(); }}
      style={{
        position: "absolute",
        right: "-4px",
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 201,
        background: "rgba(255,255,255,0.85)",
        borderRadius: "50%",
        width: "28px",
        height: "28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        cursor: "pointer",
        fontSize: "14px",
        color: "#666",
        pointerEvents: "auto",
      }}
    >
      ›
    </div>
  </>
)}
```

**Step 3: Increase container height to account for dots**

Update the container height to include space for dots. In the container div `style`, change `height`:

```ts
// FROM:
height: `${containerHeight}px`,
// TO:
height: `${containerHeight + (orders.length > 1 ? 24 : 0)}px`,
```

**Step 4: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardStack.tsx
git commit -m "feat(stacks): add pagination dots and swipe arrow indicators"
```

---

## Task 4: Fix Stack Clipping on Scroll

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardStack.tsx`

**Step 1: Add overflow hidden and proper z-index**

On the collapsed stack container (the `div` with `ref={containerRef}` around line 318), add `overflow: "hidden"` and reduce the card z-indexes:

```ts
// Add to container style:
overflow: "visible",  // keep visible for arrows, but clip cards
zIndex: 1,
```

Actually, the issue is that stacked cards use `zIndex: 100 - i`. During scroll these overlap the sticky header. The fix is simpler — ensure the stacked cards have `position: relative` on their container so z-indexes are scoped:

```ts
// On the container div style, ensure:
position: "relative",
zIndex: 0,   // create stacking context that doesn't compete with the header
isolation: "isolate",  // CSS isolation to scope z-indexes
```

**Step 2: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardStack.tsx
git commit -m "fix(stacks): prevent stacked cards from clipping over sticky header"
```

---

## Task 5: Visually Enhanced Stacks

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardStack.tsx`

**Step 1: Update constants**

```ts
// FROM:
const STACK_OFFSET = 12;
// TO:
const STACK_OFFSET = 16;
```

**Step 2: Add colored left border to stack container**

On the collapsed stack container style, add:

```ts
borderLeft: `4px solid ${source === "auto-nc" ? "#e65100" : "#1565c0"}`,
borderRadius: "4px",
paddingLeft: "4px",
```

**Step 3: Add depth shadow to underlying cards**

In the stacked cards map, add progressive shadow:

```ts
// Add to each card's style:
boxShadow: i === 0
  ? "0 2px 8px rgba(0,0,0,0.1)"
  : `0 ${2 + i * 2}px ${8 + i * 4}px rgba(0,0,0,${0.06 + i * 0.03})`,
opacity: i === 0 ? 1 : Math.max(0.6, 1 - i * 0.15),
```

**Step 4: Enhance badge styling**

Update the badge div (line 331-347):

```tsx
<div
  style={{
    position: "absolute",
    top: "-10px",
    right: "-6px",
    backgroundColor: source === "auto-nc" ? "#e65100" : "#1565c0",
    color: "#fff",
    borderRadius: "14px",
    padding: "4px 12px",
    fontSize: "12px",
    fontWeight: 700,
    zIndex: 202,
    pointerEvents: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
    letterSpacing: "0.3px",
  }}
>
  {orders.length} {source === "auto-nc" ? "NC" : "ordini"}
</div>
```

**Step 5: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardStack.tsx
git commit -m "feat(stacks): enhanced visual styling with depth, borders and prominent badge"
```

---

## Task 6: Fullscreen Modal for Expanded Stacks

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardStack.tsx:164-314`

Replace the entire expanded branch (the `if (expanded)` block, lines 164-314) with a fullscreen overlay.

**Step 1: Add body scroll lock**

Add a `useEffect` for body scroll lock when expanded:

```tsx
useEffect(() => {
  if (expanded) {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }
}, [expanded]);
```

**Step 2: Add slide-in animation state**

```tsx
const [animateIn, setAnimateIn] = useState(false);

useEffect(() => {
  if (expanded) {
    requestAnimationFrame(() => setAnimateIn(true));
  } else {
    setAnimateIn(false);
  }
}, [expanded]);
```

**Step 3: Replace expanded rendering**

Replace the `if (expanded)` block (lines 164-314) with:

```tsx
if (expanded) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#f5f5f5",
        display: "flex",
        flexDirection: "column",
        transform: animateIn ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.35s cubic-bezier(0.2, 0.9, 0.2, 1)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          background: "#fff",
          borderBottom: "1px solid #e0e0e0",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              background: source === "auto-nc" ? "#fff3e0" : "#e3f2fd",
              color: source === "auto-nc" ? "#e65100" : "#1565c0",
              padding: "4px 12px",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "13px",
            }}
          >
            {source === "auto-nc" ? "NC" : "Pila"}
          </span>
          <span style={{ fontSize: "15px", fontWeight: 600, color: "#333" }}>
            {orders.length} ordini
          </span>
        </div>
        <button
          onClick={close}
          style={{
            background: "none",
            border: "none",
            fontSize: "24px",
            cursor: "pointer",
            color: "#666",
            padding: "4px 8px",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {orderedCards.map((order) => (
          <div key={order.id} style={{ position: "relative" }}>
            <OrderCardNew
              order={order}
              expanded={expandedOrderId === order.id}
              onToggle={() => onToggleOrder(order.id)}
              onSendToVerona={onSendToVerona}
              onEdit={onEdit}
              onDeleteDone={onDeleteDone}
              token={token}
              searchQuery={searchQuery}
              editing={editingOrderId === order.id}
              onEditDone={onEditDone}
              justSentToVerona={sentToVeronaIds?.has(order.id) ?? false}
            />
            {onUnstack && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnstack(stackId, order.id);
                }}
                style={{
                  position: "absolute",
                  top: "8px",
                  right: "8px",
                  background: "rgba(255,255,255,0.9)",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  padding: "2px 8px",
                  fontSize: "10px",
                  cursor: "pointer",
                  color: "#888",
                  zIndex: 10,
                }}
                title="Rimuovi da pila"
              >
                Scollega
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      {onDissolve && (
        <div
          style={{
            padding: "12px 20px",
            background: "#fff",
            borderTop: "1px solid #e0e0e0",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => onDissolve(stackId)}
            style={{
              width: "100%",
              padding: "10px",
              background: "none",
              border: "1px solid #e57373",
              borderRadius: "8px",
              color: "#c62828",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Scollega pila
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardStack.tsx
git commit -m "feat(stacks): fullscreen overlay modal for expanded stack view"
```

---

## Task 7: Manual Stacking — Backend (DB + API)

### Step 7a: DB Migration

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/011-order-stacks.sql`

```sql
-- Migration 011: Order stacks (manual grouping)
-- Migrates manual order stacking from localStorage to PostgreSQL

CREATE TABLE IF NOT EXISTS agents.order_stacks (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  stack_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  UNIQUE(user_id, stack_id)
);

CREATE TABLE IF NOT EXISTS agents.order_stack_members (
  id SERIAL PRIMARY KEY,
  stack_id INTEGER NOT NULL REFERENCES agents.order_stacks(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_order_stacks_user ON agents.order_stacks(user_id);
CREATE INDEX IF NOT EXISTS idx_order_stack_members_stack ON agents.order_stack_members(stack_id);
CREATE INDEX IF NOT EXISTS idx_order_stack_members_order ON agents.order_stack_members(order_id);
```

### Step 7b: Repository

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/order-stacks.ts`

```ts
import type { DbPool } from '../pool';

type OrderStackRow = {
  id: number;
  user_id: string;
  stack_id: string;
  reason: string;
  created_at: number;
};

type OrderStackMemberRow = {
  id: number;
  stack_id: number;
  order_id: string;
  position: number;
};

type OrderStack = {
  id: number;
  stackId: string;
  reason: string;
  orderIds: string[];
  createdAt: number;
};

async function getStacks(pool: DbPool, userId: string): Promise<OrderStack[]> {
  const { rows } = await pool.query<OrderStackRow & { order_ids: string[] }>(
    `SELECT s.id, s.stack_id, s.reason, s.created_at,
            COALESCE(
              array_agg(m.order_id ORDER BY m.position) FILTER (WHERE m.order_id IS NOT NULL),
              '{}'
            ) AS order_ids
     FROM agents.order_stacks s
     LEFT JOIN agents.order_stack_members m ON m.stack_id = s.id
     WHERE s.user_id = $1
     GROUP BY s.id
     ORDER BY s.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    stackId: r.stack_id,
    reason: r.reason,
    orderIds: r.order_ids,
    createdAt: r.created_at,
  }));
}

async function createStack(
  pool: DbPool,
  userId: string,
  stackId: string,
  orderIds: string[],
  reason: string,
): Promise<OrderStack> {
  return pool.withTransaction(async (tx) => {
    const { rows } = await tx.query<OrderStackRow>(
      `INSERT INTO agents.order_stacks (user_id, stack_id, reason)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, stackId, reason],
    );
    const stack = rows[0];
    for (let i = 0; i < orderIds.length; i++) {
      await tx.query(
        `INSERT INTO agents.order_stack_members (stack_id, order_id, position)
         VALUES ($1, $2, $3)`,
        [stack.id, orderIds[i], i],
      );
    }
    return {
      id: stack.id,
      stackId: stack.stack_id,
      reason: stack.reason,
      orderIds,
      createdAt: stack.created_at,
    };
  });
}

async function dissolveStack(pool: DbPool, userId: string, stackId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM agents.order_stacks WHERE user_id = $1 AND stack_id = $2`,
    [userId, stackId],
  );
  return (rowCount ?? 0) > 0;
}

async function removeMember(
  pool: DbPool,
  userId: string,
  stackId: string,
  orderId: string,
): Promise<boolean> {
  return pool.withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id: number }>(
      `SELECT s.id FROM agents.order_stacks s WHERE s.user_id = $1 AND s.stack_id = $2`,
      [userId, stackId],
    );
    if (rows.length === 0) return false;
    const dbStackId = rows[0].id;

    await tx.query(
      `DELETE FROM agents.order_stack_members WHERE stack_id = $1 AND order_id = $2`,
      [dbStackId, orderId],
    );

    const { rows: remaining } = await tx.query<{ cnt: string }>(
      `SELECT count(*) as cnt FROM agents.order_stack_members WHERE stack_id = $1`,
      [dbStackId],
    );
    if (parseInt(remaining[0].cnt) < 2) {
      await tx.query(`DELETE FROM agents.order_stacks WHERE id = $1`, [dbStackId]);
    }
    return true;
  });
}

export {
  getStacks,
  createStack,
  dissolveStack,
  removeMember,
  type OrderStack,
  type OrderStackRow,
  type OrderStackMemberRow,
};
```

### Step 7c: Route

**Files:**
- Create: `archibald-web-app/backend/src/routes/order-stacks.ts`

```ts
import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { OrderStack } from '../db/repositories/order-stacks';
import { logger } from '../logger';

type OrderStacksRouterDeps = {
  getStacks: (userId: string) => Promise<OrderStack[]>;
  createStack: (userId: string, stackId: string, orderIds: string[], reason: string) => Promise<OrderStack>;
  dissolveStack: (userId: string, stackId: string) => Promise<boolean>;
  removeMember: (userId: string, stackId: string, orderId: string) => Promise<boolean>;
};

const createStackSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(2),
  reason: z.string().default(''),
});

function createOrderStacksRouter(deps: OrderStacksRouterDeps) {
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const stacks = await deps.getStacks(req.user!.userId);
      res.json({ success: true, stacks });
    } catch (err) {
      logger.error('Failed to get order stacks', err);
      res.status(500).json({ success: false, error: 'Failed to get stacks' });
    }
  });

  router.post('/', async (req: AuthRequest, res) => {
    const parsed = createStackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues });
    }
    try {
      const stackId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const stack = await deps.createStack(req.user!.userId, stackId, parsed.data.orderIds, parsed.data.reason);
      res.json({ success: true, stack });
    } catch (err) {
      logger.error('Failed to create order stack', err);
      res.status(500).json({ success: false, error: 'Failed to create stack' });
    }
  });

  router.delete('/:stackId', async (req: AuthRequest, res) => {
    try {
      const ok = await deps.dissolveStack(req.user!.userId, req.params.stackId);
      res.json({ success: true, dissolved: ok });
    } catch (err) {
      logger.error('Failed to dissolve order stack', err);
      res.status(500).json({ success: false, error: 'Failed to dissolve stack' });
    }
  });

  router.delete('/:stackId/members/:orderId', async (req: AuthRequest, res) => {
    try {
      const ok = await deps.removeMember(req.user!.userId, req.params.stackId, req.params.orderId);
      res.json({ success: true, removed: ok });
    } catch (err) {
      logger.error('Failed to remove from order stack', err);
      res.status(500).json({ success: false, error: 'Failed to remove member' });
    }
  });

  return router;
}

export { createOrderStacksRouter, type OrderStacksRouterDeps };
```

### Step 7d: Register route in server.ts

**Files:**
- Modify: `archibald-web-app/backend/src/server.ts`

Add import:
```ts
import { createOrderStacksRouter } from './routes/order-stacks';
import * as orderStacksRepo from './db/repositories/order-stacks';
```

Add route registration (alongside the other `app.use` calls):
```ts
app.use('/api/order-stacks', authenticateJWT, createOrderStacksRouter({
  getStacks: (userId) => orderStacksRepo.getStacks(pool, userId),
  createStack: (userId, stackId, orderIds, reason) => orderStacksRepo.createStack(pool, userId, stackId, orderIds, reason),
  dissolveStack: (userId, stackId) => orderStacksRepo.dissolveStack(pool, userId, stackId),
  removeMember: (userId, stackId, orderId) => orderStacksRepo.removeMember(pool, userId, stackId, orderId),
}));
```

### Step 7e: Backend tests

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/order-stacks.spec.ts`

Write integration tests against a test DB (follow existing patterns):

```ts
import { describe, test, expect } from 'vitest';
// Test getStacks, createStack, dissolveStack, removeMember
// Use the actual test DB pool pattern from existing tests
```

### Step 7f: Run backend build + tests

Run: `npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend`
Expected: PASS

### Step 7g: Frontend API module

**Files:**
- Create: `archibald-web-app/frontend/src/api/order-stacks.ts`

```ts
import { fetchWithRetry } from '../utils/fetch-with-retry';

type OrderStackResponse = {
  id: number;
  stackId: string;
  reason: string;
  orderIds: string[];
  createdAt: number;
};

async function getOrderStacks(): Promise<OrderStackResponse[]> {
  const res = await fetchWithRetry('/api/order-stacks');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.stacks;
}

async function createOrderStack(orderIds: string[], reason: string): Promise<OrderStackResponse> {
  const res = await fetchWithRetry('/api/order-stacks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds, reason }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.stack;
}

async function dissolveOrderStack(stackId: string): Promise<void> {
  const res = await fetchWithRetry(`/api/order-stacks/${stackId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function removeFromOrderStack(stackId: string, orderId: string): Promise<void> {
  const res = await fetchWithRetry(`/api/order-stacks/${stackId}/members/${orderId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export { getOrderStacks, createOrderStack, dissolveOrderStack, removeFromOrderStack, type OrderStackResponse };
```

### Step 7h: Refactor useOrderStacks to use API

**Files:**
- Modify: `archibald-web-app/frontend/src/hooks/useOrderStacks.ts`
- Modify: `archibald-web-app/frontend/src/utils/orderStacking.ts`

Refactor `useOrderStacks` to:
1. On mount, fetch stacks from API via `getOrderStacks()`
2. On create/dissolve/remove, call the API then refresh
3. On first load, check localStorage for legacy stacks — if found, migrate them via API and then clear localStorage
4. The `buildStackMap` function signature changes: it now accepts `ManualStackEntry[]` where each entry also has an optional `reason` field
5. Update `OrderStack` type to include `reason?: string`

### Step 7i: Add long-press selection mode to OrderHistory

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/OrderHistory.tsx`

Add state:
```ts
const [selectionMode, setSelectionMode] = useState(false);
const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
const [stackReasonDialog, setStackReasonDialog] = useState(false);
```

Add long-press handler (500ms timeout):
```ts
const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

function handleLongPressStart(orderId: string) {
  longPressTimer.current = setTimeout(() => {
    setSelectionMode(true);
    setSelectedOrderIds(new Set([orderId]));
  }, 500);
}

function handleLongPressEnd() {
  if (longPressTimer.current) clearTimeout(longPressTimer.current);
}
```

When `selectionMode` is true:
- Show checkboxes on each card
- Tapping a card toggles selection (not expand)
- Bottom toolbar shows: count + "Impila" button
- Clicking "Impila" opens a dialog with text input for reason
- On confirm, call `createManualStack(Array.from(selectedOrderIds), reason)`
- Exit selection mode

### Step 7j: Commit

```bash
git add -A
git commit -m "feat(stacks): migrate manual stacking from localStorage to PostgreSQL with long-press selection UI"
```

---

## Task 8: Order Notes — Backend (DB + API) + Frontend

### Step 8a: DB Migration

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/012-order-notes.sql`

```sql
-- Migration 012: Order notes (per-order todo-style notes)

CREATE TABLE IF NOT EXISTS agents.order_notes (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  text TEXT NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_order_notes_user_order ON agents.order_notes(user_id, order_id);
```

### Step 8b: Repository

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/order-notes.ts`

```ts
import type { DbPool } from '../pool';

type OrderNoteRow = {
  id: number;
  user_id: string;
  order_id: string;
  text: string;
  checked: boolean;
  position: number;
  created_at: number;
  updated_at: number;
};

type OrderNote = {
  id: number;
  orderId: string;
  text: string;
  checked: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
};

function mapRow(row: OrderNoteRow): OrderNote {
  return {
    id: row.id,
    orderId: row.order_id,
    text: row.text,
    checked: row.checked,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getNotes(pool: DbPool, userId: string, orderId: string): Promise<OrderNote[]> {
  const { rows } = await pool.query<OrderNoteRow>(
    `SELECT * FROM agents.order_notes WHERE user_id = $1 AND order_id = $2 ORDER BY checked ASC, position ASC`,
    [userId, orderId],
  );
  return rows.map(mapRow);
}

async function getNotesSummary(
  pool: DbPool,
  userId: string,
  orderIds: string[],
): Promise<Map<string, { total: number; checked: number }>> {
  if (orderIds.length === 0) return new Map();
  const { rows } = await pool.query<{ order_id: string; total: string; checked: string }>(
    `SELECT order_id,
            count(*) as total,
            count(*) FILTER (WHERE checked) as checked
     FROM agents.order_notes
     WHERE user_id = $1 AND order_id = ANY($2)
     GROUP BY order_id`,
    [userId, orderIds],
  );
  const map = new Map<string, { total: number; checked: number }>();
  for (const r of rows) {
    map.set(r.order_id, { total: parseInt(r.total), checked: parseInt(r.checked) });
  }
  return map;
}

async function createNote(pool: DbPool, userId: string, orderId: string, text: string): Promise<OrderNote> {
  const { rows: posRows } = await pool.query<{ max_pos: number | null }>(
    `SELECT max(position) as max_pos FROM agents.order_notes WHERE user_id = $1 AND order_id = $2`,
    [userId, orderId],
  );
  const nextPos = (posRows[0].max_pos ?? -1) + 1;

  const { rows } = await pool.query<OrderNoteRow>(
    `INSERT INTO agents.order_notes (user_id, order_id, text, position)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, orderId, text, nextPos],
  );
  return mapRow(rows[0]);
}

async function updateNote(
  pool: DbPool,
  userId: string,
  noteId: number,
  updates: { text?: string; checked?: boolean },
): Promise<OrderNote | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.text !== undefined) {
    sets.push(`text = $${idx++}`);
    params.push(updates.text);
  }
  if (updates.checked !== undefined) {
    sets.push(`checked = $${idx++}`);
    params.push(updates.checked);
  }
  sets.push(`updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`);

  params.push(userId, noteId);
  const { rows } = await pool.query<OrderNoteRow>(
    `UPDATE agents.order_notes SET ${sets.join(', ')} WHERE user_id = $${idx++} AND id = $${idx} RETURNING *`,
    params,
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

async function deleteNote(pool: DbPool, userId: string, noteId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM agents.order_notes WHERE user_id = $1 AND id = $2`,
    [userId, noteId],
  );
  return (rowCount ?? 0) > 0;
}

export {
  getNotes,
  getNotesSummary,
  createNote,
  updateNote,
  deleteNote,
  type OrderNote,
  type OrderNoteRow,
};
```

### Step 8c: Route

**Files:**
- Create: `archibald-web-app/backend/src/routes/order-notes.ts`

```ts
import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { OrderNote } from '../db/repositories/order-notes';
import { logger } from '../logger';

type OrderNotesRouterDeps = {
  getNotes: (userId: string, orderId: string) => Promise<OrderNote[]>;
  getNotesSummary: (userId: string, orderIds: string[]) => Promise<Map<string, { total: number; checked: number }>>;
  createNote: (userId: string, orderId: string, text: string) => Promise<OrderNote>;
  updateNote: (userId: string, noteId: number, updates: { text?: string; checked?: boolean }) => Promise<OrderNote | null>;
  deleteNote: (userId: string, noteId: number) => Promise<boolean>;
};

const createNoteSchema = z.object({ text: z.string().min(1) });
const updateNoteSchema = z.object({
  text: z.string().min(1).optional(),
  checked: z.boolean().optional(),
});
const summarySchema = z.object({ orderIds: z.array(z.string().min(1)).min(1) });

function createOrderNotesRouter(deps: OrderNotesRouterDeps) {
  const router = Router();

  router.get('/:orderId/notes', async (req: AuthRequest, res) => {
    try {
      const notes = await deps.getNotes(req.user!.userId, req.params.orderId);
      res.json({ success: true, notes });
    } catch (err) {
      logger.error('Failed to get order notes', err);
      res.status(500).json({ success: false, error: 'Failed to get notes' });
    }
  });

  router.post('/notes-summary', async (req: AuthRequest, res) => {
    const parsed = summarySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues });
    try {
      const summary = await deps.getNotesSummary(req.user!.userId, parsed.data.orderIds);
      const obj = Object.fromEntries(summary);
      res.json({ success: true, summary: obj });
    } catch (err) {
      logger.error('Failed to get notes summary', err);
      res.status(500).json({ success: false, error: 'Failed to get summary' });
    }
  });

  router.post('/:orderId/notes', async (req: AuthRequest, res) => {
    const parsed = createNoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues });
    try {
      const note = await deps.createNote(req.user!.userId, req.params.orderId, parsed.data.text);
      res.json({ success: true, note });
    } catch (err) {
      logger.error('Failed to create order note', err);
      res.status(500).json({ success: false, error: 'Failed to create note' });
    }
  });

  router.patch('/:orderId/notes/:noteId', async (req: AuthRequest, res) => {
    const parsed = updateNoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues });
    try {
      const note = await deps.updateNote(req.user!.userId, parseInt(req.params.noteId), parsed.data);
      if (!note) return res.status(404).json({ success: false, error: 'Note not found' });
      res.json({ success: true, note });
    } catch (err) {
      logger.error('Failed to update order note', err);
      res.status(500).json({ success: false, error: 'Failed to update note' });
    }
  });

  router.delete('/:orderId/notes/:noteId', async (req: AuthRequest, res) => {
    try {
      const ok = await deps.deleteNote(req.user!.userId, parseInt(req.params.noteId));
      res.json({ success: true, deleted: ok });
    } catch (err) {
      logger.error('Failed to delete order note', err);
      res.status(500).json({ success: false, error: 'Failed to delete note' });
    }
  });

  return router;
}

export { createOrderNotesRouter, type OrderNotesRouterDeps };
```

### Step 8d: Register route in server.ts

Add import and registration:
```ts
import { createOrderNotesRouter } from './routes/order-notes';
import * as orderNotesRepo from './db/repositories/order-notes';

app.use('/api/orders', authenticateJWT, createOrderNotesRouter({
  getNotes: (userId, orderId) => orderNotesRepo.getNotes(pool, userId, orderId),
  getNotesSummary: (userId, orderIds) => orderNotesRepo.getNotesSummary(pool, userId, orderIds),
  createNote: (userId, orderId, text) => orderNotesRepo.createNote(pool, userId, orderId, text),
  updateNote: (userId, noteId, updates) => orderNotesRepo.updateNote(pool, userId, noteId, updates),
  deleteNote: (userId, noteId) => orderNotesRepo.deleteNote(pool, userId, noteId),
}));
```

### Step 8e: Backend tests + build

Write integration tests, then run:
Run: `npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend`

### Step 8f: Frontend API module

**Files:**
- Create: `archibald-web-app/frontend/src/api/order-notes.ts`

```ts
import { fetchWithRetry } from '../utils/fetch-with-retry';

type OrderNote = {
  id: number;
  orderId: string;
  text: string;
  checked: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
};

type NoteSummary = Record<string, { total: number; checked: number }>;

async function getOrderNotes(orderId: string): Promise<OrderNote[]> {
  const res = await fetchWithRetry(`/api/orders/${orderId}/notes`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).notes;
}

async function getNotesSummary(orderIds: string[]): Promise<NoteSummary> {
  const res = await fetchWithRetry('/api/orders/notes-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).summary;
}

async function createOrderNote(orderId: string, text: string): Promise<OrderNote> {
  const res = await fetchWithRetry(`/api/orders/${orderId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).note;
}

async function updateOrderNote(orderId: string, noteId: number, updates: { text?: string; checked?: boolean }): Promise<OrderNote> {
  const res = await fetchWithRetry(`/api/orders/${orderId}/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).note;
}

async function deleteOrderNote(orderId: string, noteId: number): Promise<void> {
  const res = await fetchWithRetry(`/api/orders/${orderId}/notes/${noteId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export { getOrderNotes, getNotesSummary, createOrderNote, updateOrderNote, deleteOrderNote, type OrderNote, type NoteSummary };
```

### Step 8g: Frontend — useOrderNotes hook

**Files:**
- Create: `archibald-web-app/frontend/src/hooks/useOrderNotes.ts`

```ts
import { useState, useCallback } from 'react';
import { getOrderNotes, createOrderNote, updateOrderNote, deleteOrderNote, type OrderNote } from '../api/order-notes';

function useOrderNotes(orderId: string) {
  const [notes, setNotes] = useState<OrderNote[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getOrderNotes(orderId);
      setNotes(result);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const addNote = useCallback(async (text: string) => {
    const note = await createOrderNote(orderId, text);
    setNotes((prev) => [...prev, note]);
  }, [orderId]);

  const toggleNote = useCallback(async (noteId: number, checked: boolean) => {
    const updated = await updateOrderNote(orderId, noteId, { checked });
    setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
  }, [orderId]);

  const removeNote = useCallback(async (noteId: number) => {
    await deleteOrderNote(orderId, noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [orderId]);

  return { notes, loading, fetchNotes, addNote, toggleNote, removeNote };
}

export { useOrderNotes };
```

### Step 8h: Frontend — OrderNotes component

**Files:**
- Create: `archibald-web-app/frontend/src/components/OrderNotes.tsx`

A component that renders inline in OrderCardNew between header and tabs:
- Shows checklist of notes with checkboxes
- Input field to add new note
- X button to delete
- Completed notes sorted to bottom, strikethrough, grey text

### Step 8i: Frontend — Note summary badge in collapsed card

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/OrderHistory.tsx`

On page load (after fetching orders), call `getNotesSummary(orderIds)` to get per-order note counts. Pass summary data as prop to `OrderCardNew`.

In `OrderCardNew`, show a small badge in the collapsed header:
- If notes exist: clipboard icon + "3/5" (checked/total)
- Green if all checked, orange if some pending

### Step 8j: Run full checks

Run: `npm run type-check --prefix archibald-web-app/frontend && npm test --prefix archibald-web-app/frontend`
Run: `npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend`

### Step 8k: Commit

```bash
git add -A
git commit -m "feat(orders): add per-order notes with checkbox todos stored in PostgreSQL"
```
