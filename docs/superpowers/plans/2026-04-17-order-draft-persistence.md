# Order Draft Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistere l'ordine in creazione su PostgreSQL e sincronizzarlo in real-time tra sessioni dello stesso agente via WebSocket, sopravvivendo a refresh, deploy e navigazione.

**Architecture:** Nuova tabella `agents.order_drafts` (UNIQUE per user_id). Le modifiche viaggiano come delta atomici via WebSocket (`draft:delta`); il server applica il delta al JSONB in SQL e fa broadcast a tutte le sessioni dell'agente. Il frontend mantiene una delta queue in-memory per gestire la riconnessione. Il form si auto-popola silenziosamente al mount se esiste un draft.

**Tech Stack:** PostgreSQL JSONB atomic operations, `ws` WebSocket server (esistente), React hooks, `fetchWithRetry` (esistente), `useWebSocketContext` (esistente).

**Spec:** `docs/superpowers/specs/2026-04-17-order-draft-persistence-design.md`

---

## File Map

### Nuovi — Backend
- `src/db/migrations/063-order-drafts.sql` — DDL tabella
- `src/db/repositories/order-drafts.repo.ts` — 5 funzioni CRUD + delta JSONB
- `src/db/repositories/order-drafts.repo.spec.ts` — integration tests
- `src/routes/drafts.router.ts` — 3 route REST (GET/POST/DELETE)
- `src/routes/drafts.router.spec.ts` — unit tests route
- `src/realtime/draft-realtime.ts` — handler WS `draft:delta`

### Modificati — Backend
- `src/realtime/websocket-server.ts:29-32,206-212` — aggiunge `onClientMessage` a deps + message handler
- `src/server.ts` — import + registrazione `/api/drafts`
- `src/main.ts:354-357` — wiring `onClientMessage` + `createDraftMessageHandler`

### Nuovi — Frontend
- `src/types/order-draft.ts` — tipi condivisi `OrderItem`, `DraftPayload`, `SubClient` (estrazione)
- `src/api/drafts.ts` — modulo API (3 funzioni con `fetchWithRetry`)
- `src/hooks/useOrderDraft.ts` — hook principale
- `src/hooks/useOrderDraft.spec.ts` — unit tests hook

### Modificati — Frontend
- `src/components/OrderFormSimple.tsx` — integra hook, aggiunge banner, sostituisce setState

---

## Task 1: Migration 063 + Repository

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/063-order-drafts.sql`
- Create: `archibald-web-app/backend/src/db/repositories/order-drafts.repo.ts`
- Create: `archibald-web-app/backend/src/db/repositories/order-drafts.repo.spec.ts`

- [ ] **Step 1: Scrivi la migration SQL**

```sql
-- archibald-web-app/backend/src/db/migrations/063-order-drafts.sql
-- One active draft per agent. Survives refresh/deploy/navigation.
-- All updates go through atomic JSONB operations to avoid race conditions.

CREATE TABLE IF NOT EXISTS agents.order_drafts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  payload     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_order_drafts_user_id ON agents.order_drafts(user_id);
```

- [ ] **Step 2: Scrivi i test di integrazione (failing)**

```typescript
// archibald-web-app/backend/src/db/repositories/order-drafts.repo.spec.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  getDraftByUserId,
  createDraft,
  applyItemDelta,
  applyScalarUpdate,
  deleteDraftByUserId,
} from './order-drafts.repo';

const TEST_USER_ID = 'test-user-draft-001';
const DRAFT_PAYLOAD_EMPTY = { customer: null, subClient: null, items: [], globalDiscountPercent: '0', notes: '', deliveryAddressId: null, noShipping: false };

describe('order-drafts.repo', () => {
  beforeAll(() => {
    if (process.env.CI === 'true') return;
  });

  afterEach(async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    await pool.query('DELETE FROM agents.order_drafts WHERE user_id = $1', [TEST_USER_ID]);
  });

  it('getDraftByUserId returns null when no draft exists', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const result = await getDraftByUserId(pool, TEST_USER_ID);
    expect(result).toBeNull();
  });

  it('createDraft creates a draft and getDraftByUserId returns it', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const draft = await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
    expect(draft.userId).toBe(TEST_USER_ID);
    expect(draft.payload.items).toEqual([]);

    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(draft.id);
  });

  it('createDraft is idempotent (upsert on conflict)', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const first = await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
    const updatedPayload = { ...DRAFT_PAYLOAD_EMPTY, notes: 'aggiornato' };
    const second = await createDraft(pool, TEST_USER_ID, updatedPayload);
    expect(second.id).toBe(first.id);
    expect(second.payload.notes).toBe('aggiornato');
  });

  it('applyItemDelta item:add appends item to items array', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const draft = await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
    const item = { id: 'item-1', article: 'ROSE001', productName: 'Rosa', quantity: 10, unitPrice: 5, vatRate: 22, discount: 0, subtotal: 50, vat: 11, total: 61 };
    await applyItemDelta(pool, draft.id, TEST_USER_ID, 'item:add', item);
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched!.payload.items).toHaveLength(1);
    expect(fetched!.payload.items[0].id).toBe('item-1');
  });

  it('applyItemDelta item:remove removes item by id', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const itemA = { id: 'item-a', article: 'ROSE001', productName: 'Rosa', quantity: 5, unitPrice: 5, vatRate: 22, discount: 0, subtotal: 25, vat: 5.5, total: 30.5 };
    const itemB = { id: 'item-b', article: 'GIRA002', productName: 'Girasole', quantity: 3, unitPrice: 3, vatRate: 22, discount: 0, subtotal: 9, vat: 1.98, total: 10.98 };
    const draft = await createDraft(pool, TEST_USER_ID, { ...DRAFT_PAYLOAD_EMPTY, items: [itemA, itemB] });
    await applyItemDelta(pool, draft.id, TEST_USER_ID, 'item:remove', { itemId: 'item-a' });
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched!.payload.items).toHaveLength(1);
    expect(fetched!.payload.items[0].id).toBe('item-b');
  });

  it('applyItemDelta item:remove on non-existent id is a no-op', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const item = { id: 'item-x', article: 'ROSE001', productName: 'Rosa', quantity: 5, unitPrice: 5, vatRate: 22, discount: 0, subtotal: 25, vat: 5.5, total: 30.5 };
    const draft = await createDraft(pool, TEST_USER_ID, { ...DRAFT_PAYLOAD_EMPTY, items: [item] });
    await applyItemDelta(pool, draft.id, TEST_USER_ID, 'item:remove', { itemId: 'non-existent' });
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched!.payload.items).toHaveLength(1);
  });

  it('applyItemDelta item:edit merges changes into existing item', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const item = { id: 'item-e', article: 'ROSE001', productName: 'Rosa', quantity: 5, unitPrice: 5, vatRate: 22, discount: 0, subtotal: 25, vat: 5.5, total: 30.5 };
    const draft = await createDraft(pool, TEST_USER_ID, { ...DRAFT_PAYLOAD_EMPTY, items: [item] });
    await applyItemDelta(pool, draft.id, TEST_USER_ID, 'item:edit', { itemId: 'item-e', changes: { quantity: 10, subtotal: 50 } });
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched!.payload.items[0].quantity).toBe(10);
    expect(fetched!.payload.items[0].subtotal).toBe(50);
    expect(fetched!.payload.items[0].article).toBe('ROSE001');
  });

  it('applyScalarUpdate merges field into payload', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const draft = await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
    await applyScalarUpdate(pool, draft.id, TEST_USER_ID, 'notes', 'consegna urgente');
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched!.payload.notes).toBe('consegna urgente');
    expect(fetched!.payload.items).toEqual([]);
  });

  it('deleteDraftByUserId removes the draft', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
    await deleteDraftByUserId(pool, TEST_USER_ID);
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched).toBeNull();
  });
});

async function getTestPool() {
  const { createPool } = await import('../pool');
  return createPool({
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || 'archibald',
    user: process.env.PG_USER || 'archibald',
    password: process.env.PG_PASSWORD || '',
    maxConnections: 2,
  });
}
```

- [ ] **Step 3: Esegui i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- order-drafts.repo
```
Atteso: errori di import (funzioni non esistono).

- [ ] **Step 4: Implementa il repository**

```typescript
// archibald-web-app/backend/src/db/repositories/order-drafts.repo.ts
import type { DbPool } from '../pool';

type DraftPayload = Record<string, unknown>;

type OrderDraft = {
  id: string;
  userId: string;
  payload: DraftPayload;
  createdAt: string;
  updatedAt: string;
};

async function getDraftByUserId(pool: DbPool, userId: string): Promise<OrderDraft | null> {
  const result = await pool.query<{
    id: string;
    user_id: string;
    payload: DraftPayload;
    created_at: Date;
    updated_at: Date;
  }>(
    'SELECT id, user_id, payload, created_at, updated_at FROM agents.order_drafts WHERE user_id = $1',
    [userId],
  );
  if (result.rows.length === 0) return null;
  return rowToDraft(result.rows[0]);
}

async function createDraft(pool: DbPool, userId: string, payload: DraftPayload): Promise<OrderDraft> {
  const result = await pool.query<{
    id: string;
    user_id: string;
    payload: DraftPayload;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO agents.order_drafts (user_id, payload)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE
       SET payload = EXCLUDED.payload, updated_at = NOW()
     RETURNING id, user_id, payload, created_at, updated_at`,
    [userId, JSON.stringify(payload)],
  );
  return rowToDraft(result.rows[0]);
}

async function applyItemDelta(
  pool: DbPool,
  draftId: string,
  userId: string,
  op: 'item:add' | 'item:remove' | 'item:edit',
  payload: unknown,
): Promise<void> {
  if (op === 'item:add') {
    await pool.query(
      `UPDATE agents.order_drafts
       SET payload = jsonb_set(
         payload,
         '{items}',
         COALESCE(payload->'items', '[]'::jsonb) || $1::jsonb
       ),
       updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(payload), draftId, userId],
    );
  } else if (op === 'item:remove') {
    const { itemId } = payload as { itemId: string };
    await pool.query(
      `UPDATE agents.order_drafts
       SET payload = jsonb_set(
         payload,
         '{items}',
         COALESCE(
           (SELECT jsonb_agg(item)
            FROM jsonb_array_elements(COALESCE(payload->'items', '[]'::jsonb)) item
            WHERE item->>'id' != $1),
           '[]'::jsonb
         )
       ),
       updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [itemId, draftId, userId],
    );
  } else if (op === 'item:edit') {
    const { itemId, changes } = payload as { itemId: string; changes: Record<string, unknown> };
    await pool.query(
      `UPDATE agents.order_drafts
       SET payload = jsonb_set(
         payload,
         '{items}',
         (SELECT jsonb_agg(
           CASE WHEN item->>'id' = $1
                THEN item || $2::jsonb
                ELSE item
           END)
          FROM jsonb_array_elements(COALESCE(payload->'items', '[]'::jsonb)) item)
       ),
       updated_at = NOW()
       WHERE id = $3 AND user_id = $4`,
      [itemId, JSON.stringify(changes), draftId, userId],
    );
  }
}

async function applyScalarUpdate(
  pool: DbPool,
  draftId: string,
  userId: string,
  field: string,
  value: unknown,
): Promise<void> {
  await pool.query(
    `UPDATE agents.order_drafts
     SET payload = payload || jsonb_build_object($1::text, $2::jsonb),
         updated_at = NOW()
     WHERE id = $3 AND user_id = $4`,
    [field, JSON.stringify(value), draftId, userId],
  );
}

async function deleteDraftByUserId(pool: DbPool, userId: string): Promise<void> {
  await pool.query('DELETE FROM agents.order_drafts WHERE user_id = $1', [userId]);
}

function rowToDraft(row: {
  id: string;
  user_id: string;
  payload: DraftPayload;
  created_at: Date;
  updated_at: Date;
}): OrderDraft {
  return {
    id: row.id,
    userId: row.user_id,
    payload: row.payload,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export {
  getDraftByUserId,
  createDraft,
  applyItemDelta,
  applyScalarUpdate,
  deleteDraftByUserId,
  type OrderDraft,
  type DraftPayload,
};
```

- [ ] **Step 5: Esegui i test (saltati in CI, eseguiti in locale con DB)**

```bash
npm test --prefix archibald-web-app/backend -- order-drafts.repo
```
Atteso in CI: tutti i test skippati. In locale con DB: PASS.

- [ ] **Step 6: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```
Atteso: nessun errore TypeScript.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/063-order-drafts.sql \
        archibald-web-app/backend/src/db/repositories/order-drafts.repo.ts \
        archibald-web-app/backend/src/db/repositories/order-drafts.repo.spec.ts
git commit -m "feat(drafts): migration 063 + repository JSONB atomico"
```

---

## Task 2: Backend REST Routes

**Files:**
- Create: `archibald-web-app/backend/src/routes/drafts.router.ts`
- Create: `archibald-web-app/backend/src/routes/drafts.router.spec.ts`
- Modify: `archibald-web-app/backend/src/server.ts` (import + registrazione)

- [ ] **Step 1: Scrivi i test delle route (failing)**

```typescript
// archibald-web-app/backend/src/routes/drafts.router.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDraftsRouter } from './drafts.router';

const mockGetDraftByUserId = vi.fn();
const mockCreateDraft = vi.fn();
const mockDeleteDraftByUserId = vi.fn();
const mockBroadcast = vi.fn();

vi.mock('../db/repositories/order-drafts.repo', () => ({
  getDraftByUserId: (...args: unknown[]) => mockGetDraftByUserId(...args),
  createDraft: (...args: unknown[]) => mockCreateDraft(...args),
  deleteDraftByUserId: (...args: unknown[]) => mockDeleteDraftByUserId(...args),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: 'user-test-123' };
    next();
  });
  app.use('/api/drafts', createDraftsRouter({ pool: {} as any, broadcast: mockBroadcast }));
  return app;
}

describe('GET /api/drafts/active', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns null draft when none exists', async () => {
    mockGetDraftByUserId.mockResolvedValue(null);
    const res = await request(buildApp()).get('/api/drafts/active');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ draft: null });
    expect(mockGetDraftByUserId).toHaveBeenCalledWith(expect.anything(), 'user-test-123');
  });

  it('returns existing draft', async () => {
    const fakeDraft = { id: 'draft-1', userId: 'user-test-123', payload: { items: [] }, createdAt: '2026-04-17T00:00:00Z', updatedAt: '2026-04-17T00:00:00Z' };
    mockGetDraftByUserId.mockResolvedValue(fakeDraft);
    const res = await request(buildApp()).get('/api/drafts/active');
    expect(res.status).toBe(200);
    expect(res.body.draft.id).toBe('draft-1');
  });
});

describe('POST /api/drafts', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates a draft with provided payload', async () => {
    const newDraft = { id: 'draft-new', userId: 'user-test-123', payload: { items: [], notes: '' }, createdAt: '2026-04-17T00:00:00Z', updatedAt: '2026-04-17T00:00:00Z' };
    mockCreateDraft.mockResolvedValue(newDraft);
    const res = await request(buildApp())
      .post('/api/drafts')
      .send({ payload: { items: [], notes: '' } });
    expect(res.status).toBe(201);
    expect(res.body.draft.id).toBe('draft-new');
    expect(mockCreateDraft).toHaveBeenCalledWith(expect.anything(), 'user-test-123', { items: [], notes: '' });
  });

  it('creates draft with empty payload if none provided', async () => {
    const newDraft = { id: 'draft-empty', userId: 'user-test-123', payload: {}, createdAt: '2026-04-17T00:00:00Z', updatedAt: '2026-04-17T00:00:00Z' };
    mockCreateDraft.mockResolvedValue(newDraft);
    const res = await request(buildApp()).post('/api/drafts').send({});
    expect(res.status).toBe(201);
    expect(mockCreateDraft).toHaveBeenCalledWith(expect.anything(), 'user-test-123', {});
  });
});

describe('DELETE /api/drafts/active', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('deletes draft and returns 204', async () => {
    mockDeleteDraftByUserId.mockResolvedValue(undefined);
    const res = await request(buildApp()).delete('/api/drafts/active');
    expect(res.status).toBe(204);
    expect(mockDeleteDraftByUserId).toHaveBeenCalledWith(expect.anything(), 'user-test-123');
  });

  it('broadcasts draft:submitted when ?submitted=true', async () => {
    mockDeleteDraftByUserId.mockResolvedValue(undefined);
    const res = await request(buildApp()).delete('/api/drafts/active?submitted=true');
    expect(res.status).toBe(204);
    expect(mockBroadcast).toHaveBeenCalledWith('user-test-123', expect.objectContaining({ type: 'draft:submitted' }));
  });

  it('does NOT broadcast when ?submitted is absent', async () => {
    mockDeleteDraftByUserId.mockResolvedValue(undefined);
    await request(buildApp()).delete('/api/drafts/active');
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- drafts.router
```
Atteso: errore "Cannot find module './drafts.router'".

- [ ] **Step 3: Implementa il router**

```typescript
// archibald-web-app/backend/src/routes/drafts.router.ts
import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import type { WebSocketMessage } from '../realtime/websocket-server';
import { logger } from '../logger';
import {
  getDraftByUserId,
  createDraft,
  deleteDraftByUserId,
} from '../db/repositories/order-drafts.repo';

type DraftsRouterDeps = {
  pool: DbPool;
  broadcast: (userId: string, msg: WebSocketMessage) => void;
};

function createDraftsRouter({ pool, broadcast }: DraftsRouterDeps): Router {
  const router = Router();

  router.get('/active', async (req: AuthRequest, res) => {
    try {
      const draft = await getDraftByUserId(pool, req.user!.userId);
      res.json({ draft });
    } catch (error) {
      logger.error('Error getting active draft', { error });
      res.status(500).json({ error: 'Errore server' });
    }
  });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const draft = await createDraft(pool, req.user!.userId, req.body.payload ?? {});
      res.status(201).json({ draft });
    } catch (error) {
      logger.error('Error creating draft', { error });
      res.status(500).json({ error: 'Errore server' });
    }
  });

  router.delete('/active', async (req: AuthRequest, res) => {
    try {
      await deleteDraftByUserId(pool, req.user!.userId);
      if (req.query.submitted === 'true') {
        broadcast(req.user!.userId, {
          type: 'draft:submitted',
          payload: {},
          timestamp: new Date().toISOString(),
        });
      }
      res.sendStatus(204);
    } catch (error) {
      logger.error('Error deleting draft', { error });
      res.status(500).json({ error: 'Errore server' });
    }
  });

  return router;
}

export { createDraftsRouter, type DraftsRouterDeps };
```

- [ ] **Step 4: Registra il router in server.ts**

In `archibald-web-app/backend/src/server.ts`, aggiungi l'import in cima insieme agli altri:

```typescript
import { createDraftsRouter } from './routes/drafts.router';
```

Poi, dopo la riga `app.use('/api/active-jobs', authenticate, createActiveJobsRouter({ pool }));` (circa riga 1119), aggiungi:

```typescript
  app.use('/api/drafts', authenticate, createDraftsRouter({
    pool,
    broadcast: (userId, msg) => wsServer.broadcast(userId, msg),
  }));
```

- [ ] **Step 5: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- drafts.router
```
Atteso: tutti PASS.

- [ ] **Step 6: Type-check**

```bash
npm run build --prefix archibald-web-app/backend
```
Atteso: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/routes/drafts.router.ts \
        archibald-web-app/backend/src/routes/drafts.router.spec.ts \
        archibald-web-app/backend/src/server.ts
git commit -m "feat(drafts): route REST GET/POST/DELETE /api/drafts"
```

---

## Task 3: Backend WebSocket Handler

**Files:**
- Modify: `archibald-web-app/backend/src/realtime/websocket-server.ts`
- Create: `archibald-web-app/backend/src/realtime/draft-realtime.ts`
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Estendi `WebSocketServerDeps` in websocket-server.ts**

Modifica il tipo `WebSocketServerDeps` (riga 29-32):

```typescript
type WebSocketServerDeps = {
  createWss: (httpServer: HTTPServer) => WebSocketServer;
  verifyToken: VerifyTokenFn;
  onClientMessage?: (userId: string, message: WebSocketMessage) => void;
};
```

- [ ] **Step 2: Estendi il message handler in websocket-server.ts**

Sostituisci il blocco `ws.on('message', ...)` (righe 206-212):

```typescript
        ws.on('message', (data: Buffer | string) => {
          metrics.messagesReceived++;
          const msg = typeof data === 'string' ? data : data.toString();
          if (msg === 'ping' && ws.readyState === ws.OPEN) {
            ws.send('pong');
            return;
          }
          if (deps.onClientMessage) {
            try {
              const parsed = JSON.parse(msg) as WebSocketMessage;
              deps.onClientMessage(userId, parsed);
            } catch {
              // ignora messaggi malformati
            }
          }
        });
```

- [ ] **Step 3: Scrivi i test del handler WS draft (failing)**

```typescript
// archibald-web-app/backend/src/realtime/draft-realtime.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDraftMessageHandler } from './draft-realtime';

const mockApplyItemDelta = vi.fn();
const mockApplyScalarUpdate = vi.fn();

vi.mock('../db/repositories/order-drafts.repo', () => ({
  applyItemDelta: (...args: unknown[]) => mockApplyItemDelta(...args),
  applyScalarUpdate: (...args: unknown[]) => mockApplyScalarUpdate(...args),
}));

const mockBroadcast = vi.fn();
const DRAFT_ID = 'draft-uuid-123';
const USER_ID = 'user-abc';

function makeHandler() {
  return createDraftMessageHandler({ pool: {} as any, broadcast: mockBroadcast });
}

describe('createDraftMessageHandler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ignores messages that are not draft:delta', () => {
    const handler = makeHandler();
    handler(USER_ID, { type: 'other:event', payload: {}, timestamp: '2026-04-17T00:00:00Z' });
    expect(mockApplyItemDelta).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('calls applyItemDelta for item:add and broadcasts draft:delta:applied', async () => {
    mockApplyItemDelta.mockResolvedValue(undefined);
    const handler = makeHandler();
    const item = { id: 'item-1', article: 'ROSE001' };
    handler(USER_ID, {
      type: 'draft:delta',
      payload: { draftId: DRAFT_ID, op: 'item:add', payload: item, seq: 1 },
      timestamp: '2026-04-17T00:00:00Z',
    });
    await vi.waitFor(() => expect(mockBroadcast).toHaveBeenCalled());
    expect(mockApplyItemDelta).toHaveBeenCalledWith(expect.anything(), DRAFT_ID, USER_ID, 'item:add', item);
    expect(mockBroadcast).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      type: 'draft:delta:applied',
      payload: expect.objectContaining({ op: 'item:add', seq: 1 }),
    }));
  });

  it('calls applyItemDelta for item:remove', async () => {
    mockApplyItemDelta.mockResolvedValue(undefined);
    const handler = makeHandler();
    handler(USER_ID, {
      type: 'draft:delta',
      payload: { draftId: DRAFT_ID, op: 'item:remove', payload: { itemId: 'item-1' }, seq: 2 },
      timestamp: '2026-04-17T00:00:00Z',
    });
    await vi.waitFor(() => expect(mockApplyItemDelta).toHaveBeenCalled());
    expect(mockApplyItemDelta).toHaveBeenCalledWith(expect.anything(), DRAFT_ID, USER_ID, 'item:remove', { itemId: 'item-1' });
  });

  it('calls applyScalarUpdate for scalar:update', async () => {
    mockApplyScalarUpdate.mockResolvedValue(undefined);
    const handler = makeHandler();
    handler(USER_ID, {
      type: 'draft:delta',
      payload: { draftId: DRAFT_ID, op: 'scalar:update', payload: { field: 'notes', value: 'ciao' }, seq: 3 },
      timestamp: '2026-04-17T00:00:00Z',
    });
    await vi.waitFor(() => expect(mockApplyScalarUpdate).toHaveBeenCalled());
    expect(mockApplyScalarUpdate).toHaveBeenCalledWith(expect.anything(), DRAFT_ID, USER_ID, 'notes', 'ciao');
  });

  it('silently ignores unknown op types', async () => {
    const handler = makeHandler();
    handler(USER_ID, {
      type: 'draft:delta',
      payload: { draftId: DRAFT_ID, op: 'unknown:op', payload: {}, seq: 4 },
      timestamp: '2026-04-17T00:00:00Z',
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Esegui i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- draft-realtime
```
Atteso: "Cannot find module './draft-realtime'".

- [ ] **Step 5: Implementa draft-realtime.ts**

```typescript
// archibald-web-app/backend/src/realtime/draft-realtime.ts
import type { DbPool } from '../db/pool';
import type { WebSocketMessage } from './websocket-server';
import { applyItemDelta, applyScalarUpdate } from '../db/repositories/order-drafts.repo';
import { logger } from '../logger';

type DraftMessageHandlerDeps = {
  pool: DbPool;
  broadcast: (userId: string, message: WebSocketMessage) => void;
};

function createDraftMessageHandler({ pool, broadcast }: DraftMessageHandlerDeps) {
  async function handleAsync(userId: string, message: WebSocketMessage): Promise<void> {
    if (message.type !== 'draft:delta') return;

    const { draftId, op, payload, seq } = message.payload as {
      draftId: string;
      op: string;
      payload: unknown;
      seq: number;
    };

    if (op === 'item:add' || op === 'item:remove' || op === 'item:edit') {
      await applyItemDelta(pool, draftId, userId, op, payload);
    } else if (op === 'scalar:update') {
      const { field, value } = payload as { field: string; value: unknown };
      await applyScalarUpdate(pool, draftId, userId, field, value);
    } else {
      return;
    }

    broadcast(userId, {
      type: 'draft:delta:applied',
      payload: { op, payload, seq },
      timestamp: new Date().toISOString(),
    });
  }

  return function handleDraftMessage(userId: string, message: WebSocketMessage): void {
    handleAsync(userId, message).catch((error) => {
      logger.error('Error handling draft delta', { error, userId });
    });
  };
}

export { createDraftMessageHandler };
```

- [ ] **Step 6: Wira in main.ts**

In `archibald-web-app/backend/src/main.ts`, aggiungi l'import dopo gli altri import da realtime:

```typescript
import { createDraftMessageHandler } from './realtime/draft-realtime';
```

Poi, **prima** di `const wsServer = createWebSocketServer(...)` (riga 354), aggiungi:

```typescript
  let handleDraftClientMessage: (userId: string, msg: import('./realtime/websocket-server').WebSocketMessage) => void = () => {};
```

Poi modifica la chiamata `createWebSocketServer` (righe 354-357) aggiungendo `onClientMessage`:

```typescript
  const wsServer = createWebSocketServer({
    createWss: (server) => new WebSocketServer({ server }),
    verifyToken: verifyJWT,
    onClientMessage: (userId, msg) => handleDraftClientMessage(userId, msg),
  });
```

Poi, **dopo** la creazione di `wsServer` (dopo riga 357), aggiungi:

```typescript
  const draftHandler = createDraftMessageHandler({ pool, broadcast: wsServer.broadcast });
  handleDraftClientMessage = draftHandler;
```

- [ ] **Step 7: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- draft-realtime
```
Atteso: tutti PASS.

- [ ] **Step 8: Type-check**

```bash
npm run build --prefix archibald-web-app/backend
```
Atteso: nessun errore.

- [ ] **Step 9: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend
```
Atteso: tutti PASS (o skipped in CI per integration tests).

- [ ] **Step 10: Commit**

```bash
git add archibald-web-app/backend/src/realtime/websocket-server.ts \
        archibald-web-app/backend/src/realtime/draft-realtime.ts \
        archibald-web-app/backend/src/realtime/draft-realtime.spec.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(drafts): WebSocket handler delta + onClientMessage"
```

---

## Task 4: Frontend Types + API + Hook

**Files:**
- Create: `archibald-web-app/frontend/src/types/order-draft.ts`
- Create: `archibald-web-app/frontend/src/api/drafts.ts`
- Create: `archibald-web-app/frontend/src/hooks/useOrderDraft.ts`
- Create: `archibald-web-app/frontend/src/hooks/useOrderDraft.spec.ts`

- [ ] **Step 1: Crea il file dei tipi condivisi**

```typescript
// archibald-web-app/frontend/src/types/order-draft.ts
import type { Customer } from './local-customer';

type OrderItem = {
  id: string;
  productId: string;
  article: string;
  productName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discount: number;
  subtotal: number;
  vat: number;
  total: number;
  originalListPrice?: number;
  warehouseQuantity?: number;
  warehouseSources?: Array<{
    warehouseItemId: number;
    boxName: string;
    quantity: number;
  }>;
  productGroupKey?: string;
  isGhostArticle?: boolean;
  ghostArticleSource?: 'history' | 'manual';
};

type SubClient = {
  codice: string;
  ragioneSociale: string;
  [key: string]: unknown;
};

type DraftPayload = {
  customer: Customer | null;
  subClient: SubClient | null;
  items: OrderItem[];
  globalDiscountPercent: string;
  notes: string;
  deliveryAddressId: number | null;
  noShipping: boolean;
};

type DraftScalarFields = Omit<DraftPayload, 'items'>;

const EMPTY_DRAFT_PAYLOAD: DraftPayload = {
  customer: null,
  subClient: null,
  items: [],
  globalDiscountPercent: '0',
  notes: '',
  deliveryAddressId: null,
  noShipping: false,
};

export {
  type OrderItem,
  type SubClient,
  type DraftPayload,
  type DraftScalarFields,
  EMPTY_DRAFT_PAYLOAD,
};
```

- [ ] **Step 2: Crea il modulo API**

```typescript
// archibald-web-app/frontend/src/api/drafts.ts
import { fetchWithRetry } from '../utils/fetch-with-retry';
import type { DraftPayload } from '../types/order-draft';

type ServerDraft = {
  id: string;
  userId: string;
  payload: DraftPayload;
  createdAt: string;
  updatedAt: string;
};

async function getActiveDraft(): Promise<ServerDraft | null> {
  const res = await fetchWithRetry('/api/drafts/active');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.draft;
}

async function createDraft(payload: DraftPayload): Promise<ServerDraft> {
  const res = await fetchWithRetry('/api/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.draft;
}

async function deleteActiveDraft(submitted = false): Promise<void> {
  const url = submitted ? '/api/drafts/active?submitted=true' : '/api/drafts/active';
  const res = await fetchWithRetry(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
}

export { getActiveDraft, createDraft, deleteActiveDraft, type ServerDraft };
```

- [ ] **Step 3: Scrivi i test del hook (failing)**

```typescript
// archibald-web-app/frontend/src/hooks/useOrderDraft.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOrderDraft } from './useOrderDraft';
import type { OrderItem } from '../types/order-draft';

const mockGetActiveDraft = vi.fn();
const mockCreateDraft = vi.fn();
const mockDeleteActiveDraft = vi.fn();
const mockWsSend = vi.fn();
const mockWsSubscribe = vi.fn();

vi.mock('../api/drafts', () => ({
  getActiveDraft: (...args: unknown[]) => mockGetActiveDraft(...args),
  createDraft: (...args: unknown[]) => mockCreateDraft(...args),
  deleteActiveDraft: (...args: unknown[]) => mockDeleteActiveDraft(...args),
}));

vi.mock('../contexts/WebSocketContext', () => ({
  useWebSocketContext: () => ({
    state: 'connected',
    send: mockWsSend,
    subscribe: mockWsSubscribe.mockReturnValue(() => {}),
    unsubscribe: vi.fn(),
  }),
}));

const ITEM_A: OrderItem = {
  id: 'item-a',
  productId: 'p1',
  article: 'ROSE001',
  productName: 'Rosa',
  quantity: 5,
  unitPrice: 5,
  vatRate: 22,
  discount: 0,
  subtotal: 25,
  vat: 5.5,
  total: 30.5,
};

describe('useOrderDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads null draft on mount and hasDraft is false', async () => {
    mockGetActiveDraft.mockResolvedValue(null);
    const { result } = renderHook(() => useOrderDraft({ disabled: false }));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasDraft).toBe(false);
    expect(result.current.draftState.items).toEqual([]);
  });

  it('loads existing draft and hasDraft is true', async () => {
    const serverDraft = {
      id: 'draft-1',
      userId: 'u1',
      payload: { customer: null, subClient: null, items: [ITEM_A], globalDiscountPercent: '5', notes: 'test', deliveryAddressId: null, noShipping: false },
      createdAt: '2026-04-17T00:00:00Z',
      updatedAt: '2026-04-17T00:00:00Z',
    };
    mockGetActiveDraft.mockResolvedValue(serverDraft);
    const { result } = renderHook(() => useOrderDraft({ disabled: false }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasDraft).toBe(true);
    expect(result.current.draftState.items).toHaveLength(1);
    expect(result.current.draftState.globalDiscountPercent).toBe('5');
  });

  it('addItem updates local state optimistically and sends WS delta', async () => {
    const serverDraft = { id: 'draft-1', userId: 'u1', payload: { customer: null, subClient: null, items: [], globalDiscountPercent: '0', notes: '', deliveryAddressId: null, noShipping: false }, createdAt: '', updatedAt: '' };
    mockGetActiveDraft.mockResolvedValue(serverDraft);
    const { result } = renderHook(() => useOrderDraft({ disabled: false }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.addItem(ITEM_A); });

    expect(result.current.draftState.items).toHaveLength(1);
    expect(result.current.draftState.items[0].id).toBe('item-a');
    expect(mockWsSend).toHaveBeenCalledWith('draft:delta', expect.objectContaining({ op: 'item:add', payload: ITEM_A }));
  });

  it('removeItem updates local state and sends WS delta', async () => {
    const serverDraft = { id: 'draft-1', userId: 'u1', payload: { customer: null, subClient: null, items: [ITEM_A], globalDiscountPercent: '0', notes: '', deliveryAddressId: null, noShipping: false }, createdAt: '', updatedAt: '' };
    mockGetActiveDraft.mockResolvedValue(serverDraft);
    const { result } = renderHook(() => useOrderDraft({ disabled: false }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.removeItem('item-a'); });

    expect(result.current.draftState.items).toHaveLength(0);
    expect(mockWsSend).toHaveBeenCalledWith('draft:delta', expect.objectContaining({ op: 'item:remove', payload: { itemId: 'item-a' } }));
  });

  it('updateScalar applies immediately and debounces WS send by 800ms', async () => {
    const serverDraft = { id: 'draft-1', userId: 'u1', payload: { customer: null, subClient: null, items: [], globalDiscountPercent: '0', notes: '', deliveryAddressId: null, noShipping: false }, createdAt: '', updatedAt: '' };
    mockGetActiveDraft.mockResolvedValue(serverDraft);
    const { result } = renderHook(() => useOrderDraft({ disabled: false }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.updateScalar('notes', 'prima'); });
    act(() => { result.current.updateScalar('notes', 'seconda'); });

    expect(result.current.draftState.notes).toBe('seconda');
    expect(mockWsSend).not.toHaveBeenCalled(); // ancora nel debounce

    act(() => { vi.advanceTimersByTime(800); });

    expect(mockWsSend).toHaveBeenCalledTimes(1);
    expect(mockWsSend).toHaveBeenCalledWith('draft:delta', expect.objectContaining({ op: 'scalar:update', payload: { field: 'notes', value: 'seconda' } }));
  });

  it('is disabled when disabled:true (no API calls, no WS)', async () => {
    const { result } = renderHook(() => useOrderDraft({ disabled: true }));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGetActiveDraft).not.toHaveBeenCalled();
    expect(result.current.hasDraft).toBe(false);
  });

  it('discardDraft calls deleteActiveDraft and resets state', async () => {
    const serverDraft = { id: 'draft-1', userId: 'u1', payload: { customer: null, subClient: null, items: [ITEM_A], globalDiscountPercent: '0', notes: '', deliveryAddressId: null, noShipping: false }, createdAt: '', updatedAt: '' };
    mockGetActiveDraft.mockResolvedValue(serverDraft);
    mockDeleteActiveDraft.mockResolvedValue(undefined);
    const { result } = renderHook(() => useOrderDraft({ disabled: false }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.discardDraft(); });

    expect(mockDeleteActiveDraft).toHaveBeenCalledWith(false);
    expect(result.current.draftState.items).toHaveLength(0);
    expect(result.current.hasDraft).toBe(false);
  });
});
```

- [ ] **Step 4: Esegui i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- useOrderDraft
```
Atteso: "Cannot find module './useOrderDraft'".

- [ ] **Step 5: Implementa il hook**

```typescript
// archibald-web-app/frontend/src/hooks/useOrderDraft.ts
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { toastService } from '../services/toast.service';
import { getActiveDraft, createDraft, deleteActiveDraft } from '../api/drafts';
import {
  type OrderItem,
  type DraftPayload,
  type DraftScalarFields,
  type SubClient,
  EMPTY_DRAFT_PAYLOAD,
} from '../types/order-draft';

type PendingDelta = { seq: number; op: string; payload: unknown };

type UseOrderDraftOptions = { disabled: boolean };

type UseOrderDraftReturn = {
  draftState: DraftPayload;
  draftId: string | null;
  draftUpdatedAt: string | null;
  isLoading: boolean;
  hasDraft: boolean;
  remoteUpdateFlash: boolean;
  addItem: (item: OrderItem) => void;
  removeItem: (itemId: string) => void;
  editItem: (itemId: string, changes: Partial<OrderItem>) => void;
  updateScalar: <K extends keyof DraftScalarFields>(field: K, value: DraftScalarFields[K]) => void;
  ensureDraftCreated: (initialPayload: DraftPayload) => Promise<void>;
  discardDraft: () => Promise<void>;
  deleteDraft: () => Promise<void>;
};

function useOrderDraft({ disabled }: UseOrderDraftOptions): UseOrderDraftReturn {
  const navigate = useNavigate();
  const { send, subscribe } = useWebSocketContext();

  const [draftState, setDraftState] = useState<DraftPayload>(EMPTY_DRAFT_PAYLOAD);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!disabled);
  const [hasDraft, setHasDraft] = useState(false);
  const [remoteUpdateFlash, setRemoteUpdateFlash] = useState(false);

  const draftIdRef = useRef<string | null>(null);
  const pendingDeltas = useRef<PendingDelta[]>([]);
  const seqCounter = useRef(0);
  const scalarDebounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const remoteFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mantieni ref in sync con state per i closure
  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  // Carica draft al mount
  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    setIsLoading(true);
    getActiveDraft()
      .then((draft) => {
        if (cancelled) return;
        if (draft) {
          setDraftState(draft.payload);
          setDraftId(draft.id);
          setDraftUpdatedAt(draft.updatedAt);
          setHasDraft(true);
        }
      })
      .catch(() => {}) // errori di rete: si parte con draft vuoto
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [disabled]);

  const sendDelta = useCallback(
    (op: string, payload: unknown) => {
      if (!draftIdRef.current) return;
      const seq = ++seqCounter.current;
      pendingDeltas.current.push({ seq, op, payload });
      send('draft:delta', { draftId: draftIdRef.current, op, payload, seq });
    },
    [send],
  );

  const applyDeltaToState = useCallback((op: string, payload: unknown) => {
    if (op === 'item:add') {
      const item = payload as OrderItem;
      setDraftState((prev) => ({ ...prev, items: [...prev.items, item] }));
    } else if (op === 'item:remove') {
      const { itemId } = payload as { itemId: string };
      setDraftState((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== itemId) }));
    } else if (op === 'item:edit') {
      const { itemId, changes } = payload as { itemId: string; changes: Partial<OrderItem> };
      setDraftState((prev) => ({
        ...prev,
        items: prev.items.map((i) => (i.id === itemId ? { ...i, ...changes } : i)),
      }));
    } else if (op === 'scalar:update') {
      const { field, value } = payload as { field: string; value: unknown };
      setDraftState((prev) => ({ ...prev, [field]: value }));
    }
  }, []);

  // Abbonamento messaggi WS
  useEffect(() => {
    if (disabled) return;

    const unsubApplied = subscribe('draft:delta:applied', (raw) => {
      const { op, payload, seq } = raw as { op: string; payload: unknown; seq: number };
      const ownIndex = pendingDeltas.current.findIndex((d) => d.seq === seq);
      if (ownIndex !== -1) {
        // ACK del proprio delta — rimuovi dalla coda, non applicare di nuovo
        pendingDeltas.current = pendingDeltas.current.filter((d) => d.seq !== seq);
        return;
      }
      // Delta da altra sessione — applica
      applyDeltaToState(op, payload);
      setDraftUpdatedAt(new Date().toISOString());
      if (remoteFlashTimer.current) clearTimeout(remoteFlashTimer.current);
      setRemoteUpdateFlash(true);
      remoteFlashTimer.current = setTimeout(() => setRemoteUpdateFlash(false), 3000);
    });

    const unsubSubmitted = subscribe('draft:submitted', () => {
      toastService.info('Ordine confermato da un altro dispositivo');
      navigate('/pending-orders');
    });

    const unsubReconnected = subscribe('WS_RECONNECTED', async () => {
      if (!draftIdRef.current) return;
      try {
        const fresh = await getActiveDraft();
        if (fresh) {
          setDraftState(fresh.payload);
          setDraftUpdatedAt(fresh.updatedAt);
          for (const delta of pendingDeltas.current) {
            send('draft:delta', { draftId: fresh.id, op: delta.op, payload: delta.payload, seq: delta.seq });
          }
        }
      } catch {
        // silenzioso — il draft sarà allineato alla prossima interazione
      }
    });

    return () => {
      unsubApplied();
      unsubSubmitted();
      unsubReconnected();
    };
  }, [disabled, subscribe, navigate, send, applyDeltaToState]);

  const isCreatingDraftRef = useRef(false);

  const ensureDraftCreated = useCallback(
    async (initialPayload: DraftPayload): Promise<void> => {
      if (draftIdRef.current || isCreatingDraftRef.current) return;
      isCreatingDraftRef.current = true;
      try {
        const draft = await createDraft(initialPayload);
        setDraftId(draft.id);
        setDraftUpdatedAt(draft.updatedAt);
        setHasDraft(true);
      } finally {
        isCreatingDraftRef.current = false;
      }
    },
    [],
  );

  const addItem = useCallback(
    (item: OrderItem) => {
      setDraftState((prev) => ({ ...prev, items: [...prev.items, item] }));
      setDraftUpdatedAt(new Date().toISOString());
      sendDelta('item:add', item);
    },
    [sendDelta],
  );

  const removeItem = useCallback(
    (itemId: string) => {
      setDraftState((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== itemId) }));
      setDraftUpdatedAt(new Date().toISOString());
      sendDelta('item:remove', { itemId });
    },
    [sendDelta],
  );

  const editItem = useCallback(
    (itemId: string, changes: Partial<OrderItem>) => {
      setDraftState((prev) => ({
        ...prev,
        items: prev.items.map((i) => (i.id === itemId ? { ...i, ...changes } : i)),
      }));
      setDraftUpdatedAt(new Date().toISOString());
      sendDelta('item:edit', { itemId, changes });
    },
    [sendDelta],
  );

  const updateScalar = useCallback(
    <K extends keyof DraftScalarFields>(field: K, value: DraftScalarFields[K]) => {
      setDraftState((prev) => ({ ...prev, [field]: value }));
      setDraftUpdatedAt(new Date().toISOString());

      const existing = scalarDebounceTimers.current.get(field as string);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        scalarDebounceTimers.current.delete(field as string);
        sendDelta('scalar:update', { field, value });
      }, 800);
      scalarDebounceTimers.current.set(field as string, timer);
    },
    [sendDelta],
  );

  const discardDraft = useCallback(async () => {
    await deleteActiveDraft(false);
    setDraftState(EMPTY_DRAFT_PAYLOAD);
    setDraftId(null);
    setDraftUpdatedAt(null);
    setHasDraft(false);
    pendingDeltas.current = [];
    seqCounter.current = 0;
  }, []);

  const deleteDraft = useCallback(async () => {
    await deleteActiveDraft(true);
  }, []);

  return {
    draftState,
    draftId,
    draftUpdatedAt,
    isLoading,
    hasDraft,
    remoteUpdateFlash,
    addItem,
    removeItem,
    editItem,
    updateScalar,
    ensureDraftCreated,
    discardDraft,
    deleteDraft,
  };
}

export { useOrderDraft, type UseOrderDraftReturn };
```

- [ ] **Step 6: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- useOrderDraft
```
Atteso: tutti PASS.

- [ ] **Step 7: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: nessun errore.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/frontend/src/types/order-draft.ts \
        archibald-web-app/frontend/src/api/drafts.ts \
        archibald-web-app/frontend/src/hooks/useOrderDraft.ts \
        archibald-web-app/frontend/src/hooks/useOrderDraft.spec.ts
git commit -m "feat(drafts): tipo DraftPayload, API module, hook useOrderDraft"
```

---

## Task 5: Integrazione OrderFormSimple

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

Questo task sostituisce gli useState persistibili con il hook `useOrderDraft` e aggiunge il resume banner.

### 5a — Migrazione tipi e rimozione useState duplicati

- [ ] **Step 1: Sostituisci la definizione locale `OrderItem` in OrderFormSimple.tsx con l'import**

Trova l'interfaccia `OrderItem` (righe 55-80 circa) e sostituiscila con:

```typescript
import type { OrderItem, DraftPayload, SubClient } from '../types/order-draft';
```

Rimuovi la definizione locale di `interface OrderItem { ... }`.

- [ ] **Step 2: Aggiungi `useOrderDraft` e rimuovi gli useState che gestisce il hook**

Nella sezione degli `import`, aggiungi:

```typescript
import { useOrderDraft } from '../hooks/useOrderDraft';
import { EMPTY_DRAFT_PAYLOAD } from '../types/order-draft';
```

All'inizio del componente `OrderFormSimple`, prima degli altri useState, aggiungi:

```typescript
  const editingOrderId = searchParams.get('editOrderId');

  const draft = useOrderDraft({ disabled: !!editingOrderId });
  const {
    draftState,
    draftId,
    draftUpdatedAt,
    isLoading: draftLoading,
    hasDraft,
    remoteUpdateFlash,
    addItem: draftAddItem,
    removeItem: draftRemoveItem,
    editItem: draftEditItem,
    updateScalar,
    ensureDraftCreated,
    discardDraft,
    deleteDraft,
  } = draft;
```

Poi **rimuovi** questi useState (ora gestiti dal hook):
- `const [items, setItems] = useState<OrderItem[]>([])`
- `const [globalDiscountPercent, setGlobalDiscountPercent] = useState('0')`
- `const [orderNotes, setOrderNotes] = useState('')`
- `const [noShipping, setNoShipping] = useState(false)`
- `const [selectedDeliveryAddressId, setSelectedDeliveryAddressId] = useState<number | null>(null)`

E sostituisci le letture con quelle dal hook:
- `items` → `draftState.items`
- `globalDiscountPercent` → `draftState.globalDiscountPercent`
- `orderNotes` → `draftState.notes`
- `noShipping` → `draftState.noShipping`
- `selectedDeliveryAddressId` → `draftState.deliveryAddressId`

Aggiungi anche lo stato per il banner discard:
```typescript
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
```

### 5b — Sostituisci i writer di stato con il hook

- [ ] **Step 3: Sostituisci le chiamate item nel form**

Cerca tutte le occorrenze di `setItems(` e sostituiscile:

```typescript
// Aggiunta item: cerca "setItems(prev => [...prev, newItem])" e simili
// Sostituisci con:
draftAddItem(newItem);

// Rimozione item: cerca "setItems(prev => prev.filter(i => i.id !== itemId))" e simili  
// Sostituisci con:
draftRemoveItem(itemId);

// Edit item: cerca "setItems(prev => prev.map(i => i.id === itemId ? ...)"
// Sostituisci con:
draftEditItem(itemId, changes);
```

- [ ] **Step 4: Sostituisci i setter scalari**

Trova e sostituisci:

```typescript
// setGlobalDiscountPercent(v) → updateScalar('globalDiscountPercent', v)
// setOrderNotes(v)            → updateScalar('notes', v)
// setNoShipping(v)            → updateScalar('noShipping', v)
// setSelectedDeliveryAddressId(v) → updateScalar('deliveryAddressId', v)
```

- [ ] **Step 5: Trigger creazione draft alla selezione cliente**

Trova la funzione `handleCustomerSelect` (o equivalente dove `selectedCustomer` viene impostato). Dopo la logica esistente, aggiungi:

```typescript
  // Crea il draft al primo utilizzo (se non in edit mode)
  if (!editingOrderId) {
    ensureDraftCreated({
      ...EMPTY_DRAFT_PAYLOAD,
      customer: customer,
    }).catch(() => {});
  }
```

E sostituisci qualsiasi `setSelectedCustomer(customer)` con `updateScalar('customer', customer)`.

Per `selectedSubClient`, sostituisci `setSelectedSubClient(sub)` con `updateScalar('subClient', sub)`.

- [ ] **Step 6: Sostituisci `selectedSubClient` con `draftState.subClient`**

Rimuovi `const [selectedSubClient, setSelectedSubClient] = useState<SubClient | null>(null)`.

Sostituisci ogni lettura `selectedSubClient` con `draftState.subClient`.

In `handleSubmit`, dove il codice estrae `subClientCodice` da `selectedSubClient`, sostituisci con:

```typescript
const subClientCodice = draftState.subClient?.codice ?? null;
```

- [ ] **Step 7: Aggiungi `deleteDraft()` alla fine di handleSubmit**

Trova `handleSubmit` e alla fine del blocco di successo (dopo `navigate('/pending-orders')`) aggiungi:

```typescript
      await deleteDraft(); // marca il draft come completato + broadcast draft:submitted
```

In realtà `deleteDraft()` va chiamata PRIMA del navigate, perché il navigate smonta il componente:

```typescript
      await deleteDraft();
      navigate('/pending-orders');
```

### 5c — Banner resume + discard

- [ ] **Step 8: Aggiungi il resume banner nel JSX**

Nel JSX del componente, trova il tag di apertura del contenuto principale (solitamente un `<div>` con padding) e aggiungi subito dopo, **prima** di tutto il resto del form:

```tsx
      {hasDraft && !editingOrderId && (
        <div style={{
          background: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          fontSize: 13,
          color: '#1E40AF',
        }}>
          <span>
            Bozza ripristinata
            {draftState.customer ? ` · ${draftState.customer.name}` : ''}
            {draftState.items.length > 0 ? ` · ${draftState.items.length} articoli` : ''}
            {draftUpdatedAt ? ` · ${formatDraftAge(draftUpdatedAt)}` : ''}
            {remoteUpdateFlash && <span style={{ marginLeft: 8, color: '#059669', fontSize: 12 }}>· Aggiornato da un altro dispositivo</span>}
          </span>
          {!showDiscardConfirm ? (
            <button
              onClick={() => setShowDiscardConfirm(true)}
              style={{ background: 'none', border: '1px solid #93C5FD', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: '#1D4ED8', fontSize: 12 }}
            >
              Scarta e ricomincia
            </button>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12 }}>Sicuro?</span>
              <button
                onClick={async () => { await discardDraft(); setShowDiscardConfirm(false); }}
                style={{ background: '#EF4444', border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: '#fff', fontSize: 12 }}
              >
                Sì, scarta
              </button>
              <button
                onClick={() => setShowDiscardConfirm(false)}
                style={{ background: 'none', border: '1px solid #93C5FD', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: '#1D4ED8', fontSize: 12 }}
              >
                Annulla
              </button>
            </span>
          )}
        </div>
      )}
```

- [ ] **Step 9: Aggiungi la funzione helper `formatDraftAge` nello stesso file**

Prima del `return` del componente (o fuori dal componente come funzione pura):

```typescript
function formatDraftAge(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'appena ora';
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h fa`;
  return `${Math.floor(diffH / 24)}g fa`;
}
```

- [ ] **Step 10: Esegui i test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```
Atteso: tutti PASS.

- [ ] **Step 11: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: nessun errore.

- [ ] **Step 12: Esegui tutti i test backend (nessuna regressione)**

```bash
npm test --prefix archibald-web-app/backend
```
Atteso: tutti PASS.

- [ ] **Step 13: Commit finale**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx \
        archibald-web-app/frontend/src/types/order-draft.ts
git commit -m "feat(drafts): integra useOrderDraft in OrderFormSimple + banner resume"
```

---

## Checklist finale (da eseguire dopo tutti i task)

- [ ] Applica migration 063 in produzione:
  ```bash
  ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
    "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
     exec -T postgres psql -U archibald -d archibald \
     -f /dev/stdin" < archibald-web-app/backend/src/db/migrations/063-order-drafts.sql
  ```
- [ ] Verifica in prod: apri `/order`, seleziona un cliente, aggiungi un articolo, fai refresh → il draft deve essere ripristinato.
- [ ] Verifica multi-device: apri `/order` su due dispositivi con le stesse credenziali, aggiungi articoli da entrambi → entrambi devono vedere gli articoli dell'altro in real-time.
