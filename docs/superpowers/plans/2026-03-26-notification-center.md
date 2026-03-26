# Notification Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare un sistema di notifiche in-app con persistenza DB, push WebSocket real-time, e UI campanella + pagina dedicata.

**Architecture:** Store PostgreSQL `agents.notifications` + push WS `NOTIFICATION_NEW` al momento della scrittura. Fan-out per `target='admin'/'all'` al momento dell'insert. Il service `createNotification` è l'unico punto di ingresso; tutte le fasi successive (ERP, FedEx, sync) si limitano a chiamarlo.

**Tech Stack:** Backend: Express + PostgreSQL (`pg` pool) + WebSocket (`broadcast`). Frontend: React 19 + `useWebSocketContext` + `fetchWithRetry`. Test: Vitest + supertest.

---

## File Map

**Crea:**
- `archibald-web-app/backend/src/db/migrations/033-notifications.sql`
- `archibald-web-app/backend/src/db/repositories/notifications.ts`
- `archibald-web-app/backend/src/db/repositories/notifications.spec.ts`
- `archibald-web-app/backend/src/services/notification-service.ts`
- `archibald-web-app/backend/src/services/notification-service.spec.ts`
- `archibald-web-app/backend/src/routes/notifications.ts`
- `archibald-web-app/backend/src/routes/notifications.spec.ts`
- `archibald-web-app/frontend/src/services/notifications.service.ts`
- `archibald-web-app/frontend/src/hooks/useNotifications.ts`
- `archibald-web-app/frontend/src/components/NotificationItem.tsx`
- `archibald-web-app/frontend/src/components/NotificationBell.tsx`
- `archibald-web-app/frontend/src/pages/NotificationsPage.tsx`

**Modifica:**
- `archibald-web-app/backend/src/server.ts` — import repo + route, registra `/api/notifications`
- `archibald-web-app/backend/src/main.ts` — crea `notificationDeps`, passa callback ai handler
- `archibald-web-app/backend/src/sync/services/customer-sync.ts` — aggiunge `onDeletedCustomers` a `CustomerSyncDeps`
- `archibald-web-app/backend/src/sync/services/customer-sync.spec.ts` — test callback
- `archibald-web-app/backend/src/operations/handlers/sync-customers.ts` — passa `onDeletedCustomers`
- `archibald-web-app/backend/src/operations/handlers/sync-customers.spec.ts` — aggiorna test
- `archibald-web-app/backend/src/sync/services/tracking-sync.ts` — aggiunge `onTrackingEvent` callback
- `archibald-web-app/backend/src/sync/services/tracking-sync.spec.ts` — test callback
- `archibald-web-app/backend/src/operations/handlers/sync-tracking.ts` — passa `onTrackingEvent`
- `archibald-web-app/frontend/src/AppRouter.tsx` — aggiunge route `/notifications`
- `archibald-web-app/frontend/src/components/DashboardNav.tsx` — aggiunge campanella

---

## Fase 1 — Infrastruttura Core

### Task 1: DB Migration

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/033-notifications.sql`

- [ ] **Step 1: Crea il file di migrazione**

```sql
CREATE TABLE agents.notifications (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  severity   TEXT NOT NULL CHECK (severity IN ('info', 'success', 'warning', 'error')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  data       JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX notifications_user_unread
  ON agents.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
```

- [ ] **Step 2: Verifica che la naming convention sia corretta**

Controlla che `032-customers-addresses-synced-index.sql` esista e che il tuo file sia `033-notifications.sql`. Il runner `src/db/migrate.ts` carica i file in ordine alfabetico/numerico.

```bash
ls archibald-web-app/backend/src/db/migrations/ | sort
```

Output atteso: `033-notifications.sql` compare dopo `032-customers-addresses-synced-index.sql`.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/033-notifications.sql
git commit -m "feat(notifications): add notifications table migration"
```

---

### Task 2: Notifications Repository

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/notifications.ts`
- Create: `archibald-web-app/backend/src/db/repositories/notifications.spec.ts`

- [ ] **Step 1: Scrivi il test per `getUnreadCount` (failing)**

File: `archibald-web-app/backend/src/db/repositories/notifications.spec.ts`

```ts
import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import {
  getUnreadCount,
  getNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  deleteExpired,
  insertNotification,
  type NotificationId,
} from './notifications';

const TEST_USER_ID = 'user-abc-123';

function createMockPool(rows: unknown[] = [], rowCount = 0): DbPool & { queryCalls: Array<{ text: string; params?: unknown[] }> } {
  const queryCalls: Array<{ text: string; params?: unknown[] }> = [];
  return {
    queryCalls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params });
      return { rows, rowCount } as any;
    }),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

const sampleRow = {
  id: 1,
  user_id: TEST_USER_ID,
  type: 'erp_customer_deleted',
  severity: 'error',
  title: 'Cliente eliminato',
  body: 'Il cliente Rossi è stato eliminato da ERP',
  data: { deletedProfiles: [] },
  read_at: null,
  created_at: '2026-03-26T10:00:00Z',
  expires_at: '2026-04-02T10:00:00Z',
};

describe('getUnreadCount', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('returns count from DB', async () => {
    const pool = createMockPool([{ count: 3 }]);
    const count = await getUnreadCount(pool, TEST_USER_ID);
    expect(count).toEqual(3);
  });

  test('returns 0 when no rows', async () => {
    const pool = createMockPool([{ count: 0 }]);
    const count = await getUnreadCount(pool, TEST_USER_ID);
    expect(count).toEqual(0);
  });
});

describe('getNotifications', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('queries with filter=unread adds read_at IS NULL', async () => {
    const pool = createMockPool([sampleRow]);
    await getNotifications(pool, TEST_USER_ID, 'unread', 20, 0);
    expect(pool.queryCalls[0].text).toContain('read_at IS NULL');
  });

  test('queries with filter=read adds read_at IS NOT NULL', async () => {
    const pool = createMockPool([sampleRow]);
    await getNotifications(pool, TEST_USER_ID, 'read', 20, 0);
    expect(pool.queryCalls[0].text).toContain('read_at IS NOT NULL');
  });

  test('maps row to Notification type', async () => {
    const pool = createMockPool([sampleRow]);
    const results = await getNotifications(pool, TEST_USER_ID, 'all', 20, 0);
    expect(results).toEqual([{
      id: 1,
      userId: TEST_USER_ID,
      type: 'erp_customer_deleted',
      severity: 'error',
      title: 'Cliente eliminato',
      body: 'Il cliente Rossi è stato eliminato da ERP',
      data: { deletedProfiles: [] },
      readAt: null,
      createdAt: '2026-03-26T10:00:00Z',
      expiresAt: '2026-04-02T10:00:00Z',
    }]);
  });
});

describe('markRead', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('updates read_at for correct user and id', async () => {
    const pool = createMockPool();
    await markRead(pool, TEST_USER_ID, 1 as NotificationId);
    expect(pool.queryCalls[0].params).toEqual([1, TEST_USER_ID]);
  });
});

describe('markAllRead', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('updates all unread for user', async () => {
    const pool = createMockPool();
    await markAllRead(pool, TEST_USER_ID);
    expect(pool.queryCalls[0].params).toEqual([TEST_USER_ID]);
  });
});

describe('deleteNotification', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('deletes for correct user and id', async () => {
    const pool = createMockPool();
    await deleteNotification(pool, TEST_USER_ID, 1 as NotificationId);
    expect(pool.queryCalls[0].params).toEqual([1, TEST_USER_ID]);
  });
});

describe('deleteExpired', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('returns count of deleted rows', async () => {
    const pool = createMockPool([], 5);
    const deleted = await deleteExpired(pool);
    expect(deleted).toEqual(5);
  });
});

describe('insertNotification', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('inserts and returns mapped notification', async () => {
    const pool = createMockPool([sampleRow]);
    const result = await insertNotification(pool, {
      userId: TEST_USER_ID,
      type: 'erp_customer_deleted',
      severity: 'error',
      title: 'Cliente eliminato',
      body: 'Il cliente Rossi è stato eliminato da ERP',
      data: { deletedProfiles: [] },
    });
    expect(result).toEqual({
      id: 1,
      userId: TEST_USER_ID,
      type: 'erp_customer_deleted',
      severity: 'error',
      title: 'Cliente eliminato',
      body: 'Il cliente Rossi è stato eliminato da ERP',
      data: { deletedProfiles: [] },
      readAt: null,
      createdAt: '2026-03-26T10:00:00Z',
      expiresAt: '2026-04-02T10:00:00Z',
    });
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/backend -- notifications.spec
```

Output atteso: `Cannot find module './notifications'`

- [ ] **Step 3: Implementa il repository**

File: `archibald-web-app/backend/src/db/repositories/notifications.ts`

```ts
import type { DbPool } from '../pool';

type Brand<T, B> = T & { __brand: B };
type NotificationId = Brand<number, 'NotificationId'>;
type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';
type NotificationFilter = 'all' | 'unread' | 'read';

type Notification = {
  id: NotificationId;
  userId: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  expiresAt: string;
};

type InsertNotificationParams = {
  userId: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type NotificationRow = {
  id: number;
  user_id: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  expires_at: string;
};

function mapRow(row: NotificationRow): Notification {
  return {
    id: row.id as NotificationId,
    userId: row.user_id,
    type: row.type,
    severity: row.severity as NotificationSeverity,
    title: row.title,
    body: row.body,
    data: row.data,
    readAt: row.read_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function insertNotification(pool: DbPool, params: InsertNotificationParams): Promise<Notification> {
  const { rows } = await pool.query<NotificationRow>(
    `INSERT INTO agents.notifications (user_id, type, severity, title, body, data, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '7 days')
     RETURNING *`,
    [params.userId, params.type, params.severity, params.title, params.body, params.data ?? null],
  );
  return mapRow(rows[0]);
}

async function getNotifications(
  pool: DbPool,
  userId: string,
  filter: NotificationFilter,
  limit: number,
  offset: number,
): Promise<Notification[]> {
  const filterClause =
    filter === 'unread' ? 'AND read_at IS NULL' :
    filter === 'read'   ? 'AND read_at IS NOT NULL' : '';

  const { rows } = await pool.query<NotificationRow>(
    `SELECT * FROM agents.notifications
     WHERE user_id = $1 AND expires_at > NOW() ${filterClause}
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return rows.map(mapRow);
}

async function getUnreadCount(pool: DbPool, userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM agents.notifications
     WHERE user_id = $1 AND read_at IS NULL AND expires_at > NOW()`,
    [userId],
  );
  return rows[0].count;
}

async function markRead(pool: DbPool, userId: string, id: NotificationId): Promise<void> {
  await pool.query(
    `UPDATE agents.notifications SET read_at = NOW()
     WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
    [id, userId],
  );
}

async function markAllRead(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE agents.notifications SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
}

async function deleteNotification(pool: DbPool, userId: string, id: NotificationId): Promise<void> {
  await pool.query(
    `DELETE FROM agents.notifications WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
}

async function deleteExpired(pool: DbPool): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM agents.notifications WHERE expires_at < NOW()`,
  );
  return rowCount ?? 0;
}

export {
  insertNotification,
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
  deleteExpired,
  type Notification,
  type NotificationId,
  type NotificationSeverity,
  type NotificationFilter,
  type InsertNotificationParams,
};
```

- [ ] **Step 4: Esegui il test — deve passare**

```bash
npm test --prefix archibald-web-app/backend -- notifications.spec
```

Output atteso: tutti i test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/notifications.ts \
        archibald-web-app/backend/src/db/repositories/notifications.spec.ts
git commit -m "feat(notifications): add notifications repository with unit tests"
```

---

### Task 3: Notification Service

**Files:**
- Create: `archibald-web-app/backend/src/services/notification-service.ts`
- Create: `archibald-web-app/backend/src/services/notification-service.spec.ts`

- [ ] **Step 1: Scrivi il test per `createNotification` (failing)**

File: `archibald-web-app/backend/src/services/notification-service.spec.ts`

```ts
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createNotification, type NotificationServiceDeps } from './notification-service';

const ADMIN_USER = { id: 'admin-1', role: 'admin' as const };
const AGENT_USER = { id: 'agent-1', role: 'agent' as const };
const ALL_USERS = [ADMIN_USER, AGENT_USER];

function makeDeps(overrides?: Partial<NotificationServiceDeps>): NotificationServiceDeps {
  return {
    pool: {} as any,
    getAllUsers: vi.fn().mockResolvedValue(ALL_USERS),
    insertNotification: vi.fn().mockImplementation(async (_pool, params) => ({
      id: 1,
      userId: params.userId,
      type: params.type,
      severity: params.severity,
      title: params.title,
      body: params.body,
      data: params.data ?? null,
      readAt: null,
      createdAt: '2026-03-26T10:00:00Z',
      expiresAt: '2026-04-02T10:00:00Z',
    })),
    broadcast: vi.fn(),
    ...overrides,
  };
}

const BASE_PARAMS = {
  type: 'erp_customer_deleted' as const,
  severity: 'error' as const,
  title: 'Cliente eliminato',
  body: 'Corpo',
};

describe('createNotification', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('target=user: inserts one row and broadcasts to that user', async () => {
    const deps = makeDeps();
    await createNotification(deps, { ...BASE_PARAMS, target: 'user', userId: AGENT_USER.id });

    expect(deps.insertNotification).toHaveBeenCalledOnce();
    expect(deps.insertNotification).toHaveBeenCalledWith(deps.pool, expect.objectContaining({ userId: AGENT_USER.id }));
    expect(deps.broadcast).toHaveBeenCalledOnce();
    expect(deps.broadcast).toHaveBeenCalledWith(AGENT_USER.id, expect.objectContaining({ type: 'NOTIFICATION_NEW' }));
  });

  test('target=admin: inserts and broadcasts only to admin users', async () => {
    const deps = makeDeps();
    await createNotification(deps, { ...BASE_PARAMS, target: 'admin' });

    expect(deps.insertNotification).toHaveBeenCalledOnce();
    expect(deps.insertNotification).toHaveBeenCalledWith(deps.pool, expect.objectContaining({ userId: ADMIN_USER.id }));
    expect(deps.broadcast).toHaveBeenCalledOnce();
    expect(deps.broadcast).toHaveBeenCalledWith(ADMIN_USER.id, expect.anything());
    expect(deps.getAllUsers).toHaveBeenCalledOnce();
  });

  test('target=all: inserts and broadcasts to every user', async () => {
    const deps = makeDeps();
    await createNotification(deps, { ...BASE_PARAMS, target: 'all' });

    expect(deps.insertNotification).toHaveBeenCalledTimes(ALL_USERS.length);
    expect(deps.broadcast).toHaveBeenCalledTimes(ALL_USERS.length);
  });

  test('target=user without userId throws', async () => {
    const deps = makeDeps();
    await expect(
      createNotification(deps, { ...BASE_PARAMS, target: 'user' })
    ).rejects.toThrow('userId required');
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/backend -- notification-service.spec
```

Output atteso: `Cannot find module './notification-service'`

- [ ] **Step 3: Implementa il service**

File: `archibald-web-app/backend/src/services/notification-service.ts`

```ts
import type { DbPool } from '../db/pool';
import type { User } from '../db/repositories/users';
import type { Notification, InsertNotificationParams } from '../db/repositories/notifications';
import type { NotificationSeverity } from '../db/repositories/notifications';

type NotificationTarget = 'user' | 'admin' | 'all';

type BroadcastMsg = { type: string; payload: unknown; timestamp: string };

type NotificationServiceDeps = {
  pool: DbPool;
  getAllUsers: (pool: DbPool) => Promise<User[]>;
  insertNotification: (pool: DbPool, params: InsertNotificationParams) => Promise<Notification>;
  broadcast: (userId: string, msg: BroadcastMsg) => void;
};

type CreateNotificationParams = {
  target: NotificationTarget;
  userId?: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

async function createNotification(
  deps: NotificationServiceDeps,
  params: CreateNotificationParams,
): Promise<void> {
  const { pool, getAllUsers, insertNotification, broadcast } = deps;
  const { target, type, severity, title, body, data } = params;

  const insertAndBroadcast = async (userId: string) => {
    const notification = await insertNotification(pool, { userId, type, severity, title, body, data });
    broadcast(userId, {
      type: 'NOTIFICATION_NEW',
      payload: notification,
      timestamp: new Date().toISOString(),
    });
  };

  if (target === 'user') {
    if (!params.userId) throw new Error('userId required when target=user');
    await insertAndBroadcast(params.userId);
    return;
  }

  const users = await getAllUsers(pool);
  const targets = target === 'admin' ? users.filter((u) => u.role === 'admin') : users;
  for (const user of targets) {
    await insertAndBroadcast(user.id);
  }
}

export { createNotification, type NotificationServiceDeps, type CreateNotificationParams, type NotificationTarget };
```

- [ ] **Step 4: Esegui il test — deve passare**

```bash
npm test --prefix archibald-web-app/backend -- notification-service.spec
```

Output atteso: tutti i test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/services/notification-service.ts \
        archibald-web-app/backend/src/services/notification-service.spec.ts
git commit -m "feat(notifications): add notification service with fan-out logic"
```

---

### Task 4: REST API Route

**Files:**
- Create: `archibald-web-app/backend/src/routes/notifications.ts`
- Create: `archibald-web-app/backend/src/routes/notifications.spec.ts`

- [ ] **Step 1: Scrivi i test di integrazione (failing)**

File: `archibald-web-app/backend/src/routes/notifications.spec.ts`

```ts
import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createNotificationsRouter, type NotificationsRouterDeps } from './notifications';
import type { Notification, NotificationId } from '../db/repositories/notifications';

const TEST_USER_ID = 'user-abc-123';

const sampleNotification: Notification = {
  id: 1 as NotificationId,
  userId: TEST_USER_ID,
  type: 'erp_customer_deleted',
  severity: 'error',
  title: 'Cliente eliminato',
  body: 'Il cliente Rossi è stato eliminato da ERP',
  data: null,
  readAt: null,
  createdAt: '2026-03-26T10:00:00Z',
  expiresAt: '2026-04-02T10:00:00Z',
};

function createMockDeps(): NotificationsRouterDeps {
  return {
    getNotifications: vi.fn().mockResolvedValue([sampleNotification]),
    getUnreadCount: vi.fn().mockResolvedValue(1),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
    broadcast: vi.fn(),
  };
}

function createApp(deps: NotificationsRouterDeps, role = 'agent') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: TEST_USER_ID, username: 'agent1', role };
    next();
  });
  app.use('/api/notifications', createNotificationsRouter(deps));
  return app;
}

describe('createNotificationsRouter', () => {
  let deps: NotificationsRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('GET /api/notifications', () => {
    test('returns notifications for authenticated user', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([sampleNotification]);
      expect(deps.getNotifications).toHaveBeenCalledWith(TEST_USER_ID, 'all', 20, 0);
    });

    test('passes filter, limit, offset query params', async () => {
      await request(app).get('/api/notifications?filter=unread&limit=10&offset=5');
      expect(deps.getNotifications).toHaveBeenCalledWith(TEST_USER_ID, 'unread', 10, 5);
    });
  });

  describe('GET /api/notifications/count', () => {
    test('returns unread count', async () => {
      const res = await request(app).get('/api/notifications/count');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ count: 1 });
      expect(deps.getUnreadCount).toHaveBeenCalledWith(TEST_USER_ID);
    });
  });

  describe('PATCH /api/notifications/:id/read', () => {
    test('marks notification as read and broadcasts', async () => {
      const res = await request(app).patch('/api/notifications/1/read');
      expect(res.status).toBe(204);
      expect(deps.markRead).toHaveBeenCalledWith(TEST_USER_ID, 1);
      expect(deps.broadcast).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ type: 'NOTIFICATION_READ', payload: { id: 1 } }),
      );
    });
  });

  describe('PATCH /api/notifications/read-all', () => {
    test('marks all as read and broadcasts', async () => {
      const res = await request(app).patch('/api/notifications/read-all');
      expect(res.status).toBe(204);
      expect(deps.markAllRead).toHaveBeenCalledWith(TEST_USER_ID);
      expect(deps.broadcast).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ type: 'NOTIFICATION_READ_ALL' }),
      );
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    test('deletes notification for user', async () => {
      const res = await request(app).delete('/api/notifications/1');
      expect(res.status).toBe(204);
      expect(deps.deleteNotification).toHaveBeenCalledWith(TEST_USER_ID, 1);
    });
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/backend -- routes/notifications.spec
```

Output atteso: `Cannot find module './notifications'`

- [ ] **Step 3: Implementa il router**

File: `archibald-web-app/backend/src/routes/notifications.ts`

```ts
import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { Notification, NotificationId, NotificationFilter } from '../db/repositories/notifications';

type BroadcastMsg = { type: string; payload: unknown; timestamp: string };

type NotificationsRouterDeps = {
  getNotifications: (userId: string, filter: NotificationFilter, limit: number, offset: number) => Promise<Notification[]>;
  getUnreadCount: (userId: string) => Promise<number>;
  markRead: (userId: string, id: NotificationId) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
  deleteNotification: (userId: string, id: NotificationId) => Promise<void>;
  broadcast: (userId: string, msg: BroadcastMsg) => void;
};

function createNotificationsRouter(deps: NotificationsRouterDeps) {
  const { getNotifications, getUnreadCount, markRead, markAllRead, deleteNotification, broadcast } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const filter = (req.query.filter as NotificationFilter) ?? 'all';
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const offset = Number(req.query.offset ?? 0);
    const notifications = await getNotifications(userId, filter, limit, offset);
    res.json(notifications);
  });

  router.get('/count', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const count = await getUnreadCount(userId);
    res.json({ count });
  });

  router.patch('/read-all', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    await markAllRead(userId);
    broadcast(userId, { type: 'NOTIFICATION_READ_ALL', payload: null, timestamp: new Date().toISOString() });
    res.sendStatus(204);
  });

  router.patch('/:id/read', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const id = Number(req.params.id) as NotificationId;
    await markRead(userId, id);
    broadcast(userId, { type: 'NOTIFICATION_READ', payload: { id }, timestamp: new Date().toISOString() });
    res.sendStatus(204);
  });

  router.delete('/:id', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const id = Number(req.params.id) as NotificationId;
    await deleteNotification(userId, id);
    res.sendStatus(204);
  });

  return router;
}

export { createNotificationsRouter, type NotificationsRouterDeps };
```

- [ ] **Step 4: Esegui il test — deve passare**

```bash
npm test --prefix archibald-web-app/backend -- routes/notifications.spec
```

Output atteso: tutti i test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/notifications.ts \
        archibald-web-app/backend/src/routes/notifications.spec.ts
git commit -m "feat(notifications): add REST API router for notifications"
```

---

### Task 5: Wire Backend (server.ts + main.ts)

**Files:**
- Modify: `archibald-web-app/backend/src/server.ts`
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Registra la route in `server.ts`**

In `server.ts`, aggiungi in cima gli import (dopo gli altri import di route e repo):

```ts
import { createNotificationsRouter } from './routes/notifications';
import * as notificationsRepo from './db/repositories/notifications';
```

Poi, nella funzione `createApp`, aggiungi dopo la riga `app.use('/api/cache', ...)` (o in fondo alle altre route):

```ts
const broadcastFn = deps.broadcast ?? (() => {});
app.use('/api/notifications', authenticateJWT, createNotificationsRouter({
  getNotifications: (userId, filter, limit, offset) =>
    notificationsRepo.getNotifications(pool, userId, filter, limit, offset),
  getUnreadCount: (userId) => notificationsRepo.getUnreadCount(pool, userId),
  markRead: (userId, id) => notificationsRepo.markRead(pool, userId, id),
  markAllRead: (userId) => notificationsRepo.markAllRead(pool, userId),
  deleteNotification: (userId, id) => notificationsRepo.deleteNotification(pool, userId, id),
  broadcast: broadcastFn,
}));
```

> **Nota:** `broadcastFn` è già definito a riga 407 di `server.ts` come `deps.broadcast ?? (() => {})`. Riusa quella variabile se disponibile nello scope, altrimenti definiscila qui con lo stesso pattern.

- [ ] **Step 2: Crea `notificationDeps` in `main.ts`**

In `main.ts`, aggiungi i seguenti import dopo gli import esistenti del repo:

```ts
import { createNotification } from './services/notification-service';
import { insertNotification as insertNotificationRepo } from './db/repositories/notifications';
```

Poi, prima della definizione degli handler (prima di `const handlers = { ... }`), aggiungi:

```ts
const notificationDeps = {
  pool,
  getAllUsers: (p: typeof pool) => usersRepo.getAllUsers(p),
  insertNotification: insertNotificationRepo,
  broadcast: (userId: string, msg: { type: string; payload: unknown; timestamp: string }) =>
    wsServer.broadcast(userId, msg),
};
```

- [ ] **Step 3: Verifica che il build TypeScript passi**

```bash
npm run build --prefix archibald-web-app/backend
```

Output atteso: nessun errore TypeScript.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/server.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(notifications): wire notifications route and service deps"
```

---

### Task 6: Frontend Service

**Files:**
- Create: `archibald-web-app/frontend/src/services/notifications.service.ts`

- [ ] **Step 1: Crea il service**

File: `archibald-web-app/frontend/src/services/notifications.service.ts`

```ts
import { fetchWithRetry } from '../utils/fetch-with-retry';

type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

type Notification = {
  id: number;
  userId: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  expiresAt: string;
};

type NotificationFilter = 'all' | 'unread' | 'read';

async function fetchNotifications(
  filter: NotificationFilter = 'all',
  limit = 20,
  offset = 0,
): Promise<Notification[]> {
  const params = new URLSearchParams({ filter, limit: String(limit), offset: String(offset) });
  const res = await fetchWithRetry(`/api/notifications?${params}`);
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

async function fetchUnreadCount(): Promise<number> {
  const res = await fetchWithRetry('/api/notifications/count');
  if (!res.ok) throw new Error('Failed to fetch unread count');
  const data: { count: number } = await res.json();
  return data.count;
}

async function markNotificationRead(id: number): Promise<void> {
  const res = await fetchWithRetry(`/api/notifications/${id}/read`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to mark notification as read');
}

async function markAllNotificationsRead(): Promise<void> {
  const res = await fetchWithRetry('/api/notifications/read-all', { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to mark all notifications as read');
}

async function deleteNotificationById(id: number): Promise<void> {
  const res = await fetchWithRetry(`/api/notifications/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete notification');
}

export {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotificationById,
  type Notification,
  type NotificationFilter,
  type NotificationSeverity,
};
```

- [ ] **Step 2: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Output atteso: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/services/notifications.service.ts
git commit -m "feat(notifications): add frontend notifications service"
```

---

### Task 7: Frontend Hook `useNotifications`

**Files:**
- Create: `archibald-web-app/frontend/src/hooks/useNotifications.ts`

- [ ] **Step 1: Crea il hook**

File: `archibald-web-app/frontend/src/hooks/useNotifications.ts`

```ts
import { useState, useEffect, useCallback } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotificationById,
  type Notification,
  type NotificationFilter,
} from '../services/notifications.service';

type UseNotificationsResult = {
  notifications: Notification[];
  unreadCount: number;
  filter: NotificationFilter;
  setFilter: (f: NotificationFilter) => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
  deleteNotification: (id: number) => void;
  loadMore: () => void;
  hasMore: boolean;
};

const PAGE_SIZE = 20;

function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilterState] = useState<NotificationFilter>('all');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const { subscribe } = useWebSocketContext();

  const load = useCallback(async (currentFilter: NotificationFilter, currentOffset: number) => {
    const [items, count] = await Promise.all([
      fetchNotifications(currentFilter, PAGE_SIZE, currentOffset),
      fetchUnreadCount(),
    ]);
    setNotifications((prev) => currentOffset === 0 ? items : [...prev, ...items]);
    setUnreadCount(count);
    setHasMore(items.length === PAGE_SIZE);
  }, []);

  useEffect(() => {
    setOffset(0);
    load(filter, 0);
  }, [filter, load]);

  useEffect(() => {
    const unsub1 = subscribe('NOTIFICATION_NEW', (payload: unknown) => {
      const notification = payload as Notification;
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((c) => c + 1);
    });

    const unsub2 = subscribe('NOTIFICATION_READ', (payload: unknown) => {
      const { id } = payload as { id: number };
      setNotifications((prev) =>
        prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    });

    const unsub3 = subscribe('NOTIFICATION_READ_ALL', () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      setUnreadCount(0);
    });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [subscribe]);

  const setFilter = useCallback((f: NotificationFilter) => {
    setFilterState(f);
    setOffset(0);
  }, []);

  const markRead = useCallback((id: number) => {
    markNotificationRead(id).then(() => {
      setNotifications((prev) =>
        prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    });
  }, []);

  const markAllRead = useCallback(() => {
    markAllNotificationsRead().then(() => {
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      setUnreadCount(0);
    });
  }, []);

  const deleteNotification = useCallback((id: number) => {
    deleteNotificationById(id).then(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    });
  }, []);

  const loadMore = useCallback(() => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    load(filter, newOffset);
  }, [offset, filter, load]);

  return { notifications, unreadCount, filter, setFilter, markRead, markAllRead, deleteNotification, loadMore, hasMore };
}

export { useNotifications };
```

- [ ] **Step 2: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Output atteso: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/hooks/useNotifications.ts
git commit -m "feat(notifications): add useNotifications hook with WebSocket integration"
```

---

### Task 8: Frontend Components

**Files:**
- Create: `archibald-web-app/frontend/src/components/NotificationItem.tsx`
- Create: `archibald-web-app/frontend/src/components/NotificationBell.tsx`

- [ ] **Step 1: Crea `NotificationItem`**

File: `archibald-web-app/frontend/src/components/NotificationItem.tsx`

```tsx
import type { Notification } from '../services/notifications.service';

const SEVERITY_COLORS: Record<string, string> = {
  info: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Ora';
  if (minutes < 60) return `${minutes}m fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}g fa`;
}

type NotificationItemProps = {
  notification: Notification;
  onDelete: (id: number) => void;
};

function NotificationItem({ notification, onDelete }: NotificationItemProps) {
  const color = SEVERITY_COLORS[notification.severity] ?? '#6b7280';
  const isUnread = notification.readAt === null;

  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px 16px',
        borderLeft: `4px solid ${color}`,
        background: isUnread ? 'rgba(255,255,255,0.05)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontWeight: isUnread ? 600 : 400, fontSize: '14px', color: '#fff' }}>
            {notification.title}
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
          {notification.body}
        </p>
      </div>
      <button
        onClick={() => onDelete(notification.id)}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.4)',
          cursor: 'pointer',
          fontSize: '16px',
          padding: '2px 4px',
          flexShrink: 0,
          lineHeight: 1,
        }}
        title="Elimina"
      >
        ×
      </button>
    </div>
  );
}

export { NotificationItem };
```

- [ ] **Step 2: Crea `NotificationBell`**

File: `archibald-web-app/frontend/src/components/NotificationBell.tsx`

```tsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationItem } from './NotificationItem';

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead, deleteNotification } = useNotifications();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const preview = notifications.slice(0, 5);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          color: '#fff',
          fontSize: '20px',
          cursor: 'pointer',
          padding: '6px 10px',
          position: 'relative',
          lineHeight: 1,
        }}
        title="Notifiche"
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '4px',
              background: '#ef4444',
              color: '#fff',
              borderRadius: '9999px',
              fontSize: '10px',
              fontWeight: 700,
              minWidth: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            width: '340px',
            maxHeight: '480px',
            background: '#1e293b',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>Notifiche</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer' }}
              >
                Segna tutte come lette
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {preview.length === 0 ? (
              <p style={{ padding: '24px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                Nessuna notifica
              </p>
            ) : (
              preview.map((n) => (
                <div
                  key={n.id}
                  onClick={() => { markRead(n.id); setOpen(false); navigate('/notifications'); }}
                  style={{ cursor: 'pointer' }}
                >
                  <NotificationItem notification={n} onDelete={(id) => { deleteNotification(id); }} />
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '10px 16px', textAlign: 'center' }}>
            <button
              onClick={() => { setOpen(false); navigate('/notifications'); }}
              style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '13px', cursor: 'pointer' }}
            >
              Vedi tutte →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { NotificationBell };
```

- [ ] **Step 3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Output atteso: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/components/NotificationItem.tsx \
        archibald-web-app/frontend/src/components/NotificationBell.tsx
git commit -m "feat(notifications): add NotificationItem and NotificationBell components"
```

---

### Task 9: Frontend Page + Routing

**Files:**
- Create: `archibald-web-app/frontend/src/pages/NotificationsPage.tsx`
- Modify: `archibald-web-app/frontend/src/AppRouter.tsx`
- Modify: `archibald-web-app/frontend/src/components/DashboardNav.tsx`

- [ ] **Step 1: Crea `NotificationsPage`**

File: `archibald-web-app/frontend/src/pages/NotificationsPage.tsx`

```tsx
import { useNotifications } from '../hooks/useNotifications';
import { NotificationItem } from '../components/NotificationItem';
import type { NotificationFilter } from '../services/notifications.service';

const FILTER_LABELS: Record<NotificationFilter, string> = {
  all: 'Tutte',
  unread: 'Non lette',
  read: 'Lette',
};

function groupByDate(items: { createdAt: string }[]): Record<string, typeof items> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const groups: Record<string, typeof items> = {};
  for (const item of items) {
    const d = new Date(item.createdAt);
    d.setHours(0, 0, 0, 0);
    const key = d >= today ? 'Oggi' : d >= yesterday ? 'Ieri' : d >= weekAgo ? 'Questa settimana' : 'Precedenti';
    groups[key] = [...(groups[key] ?? []), item];
  }
  return groups;
}

const GROUP_ORDER = ['Oggi', 'Ieri', 'Questa settimana', 'Precedenti'];

function NotificationsPage() {
  const {
    notifications, unreadCount, filter, setFilter,
    markRead, markAllRead, deleteNotification, loadMore, hasMore,
  } = useNotifications();

  const grouped = groupByDate(notifications);

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#fff' }}>Notifiche</h1>
          {unreadCount > 0 && (
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>{unreadCount} non lette</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            style={{
              background: '#3b82f6', border: 'none', borderRadius: '6px',
              color: '#fff', fontSize: '13px', padding: '8px 14px', cursor: 'pointer',
            }}
          >
            Segna tutte come lette
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
        {(['all', 'unread', 'read'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '7px 16px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              background: filter === f ? '#3b82f6' : 'rgba(255,255,255,0.1)',
              color: filter === f ? '#fff' : 'rgba(255,255,255,0.7)',
              fontWeight: filter === f ? 600 : 400,
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Grouped list */}
      {notifications.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: '40px 0' }}>
          Nessuna notifica
        </p>
      ) : (
        <>
          {GROUP_ORDER.filter((g) => grouped[g]?.length).map((group) => (
            <div key={group} style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                {group}
              </h3>
              <div style={{ borderRadius: '8px', overflow: 'hidden', background: '#1e293b' }}>
                {grouped[group].map((n) => (
                  <div key={n.id} onClick={() => markRead(n.id)} style={{ cursor: n.readAt ? 'default' : 'pointer' }}>
                    <NotificationItem notification={n} onDelete={deleteNotification} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {hasMore && (
            <div style={{ textAlign: 'center', paddingTop: '16px' }}>
              <button
                onClick={loadMore}
                style={{
                  background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px',
                  color: '#fff', padding: '10px 24px', cursor: 'pointer', fontSize: '14px',
                }}
              >
                Carica altre
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { NotificationsPage };
```

- [ ] **Step 2: Aggiungi la route in `AppRouter.tsx`**

In `AppRouter.tsx`, aggiungi l'import:

```ts
import { NotificationsPage } from './pages/NotificationsPage';
```

Poi, nella sezione `<Routes>`, aggiungi dopo la route `/profile` (o in fondo alle altre route standard):

```tsx
{/* Notifications route */}
<Route
  path="/notifications"
  element={
    <div className="app">
      <main className="app-main" style={{ padding: "0" }}>
        <NotificationsPage />
      </main>
      <footer className="app-footer">
        <p>v1.0.0 • Formicanera by Francesco Formicola</p>
      </footer>
    </div>
  }
/>
```

- [ ] **Step 3: Aggiungi la campanella in `DashboardNav.tsx`**

In `DashboardNav.tsx`, aggiungi l'import:

```ts
import { NotificationBell } from './NotificationBell';
```

Nel componente `DesktopNav`, aggiungi `<NotificationBell />` **tra il loop dei link e il bottone logout**:

```tsx
{links.map((link) => { /* ... esistente ... */ })}

{/* Campanella notifiche */}
<NotificationBell />

{/* Logout button */}
<button onClick={handleLogout} style={{ ... }}>🚪 Logout</button>
```

- [ ] **Step 4: Type-check e test frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```

Output atteso: nessun errore di tipo, tutti i test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/NotificationsPage.tsx \
        archibald-web-app/frontend/src/AppRouter.tsx \
        archibald-web-app/frontend/src/components/DashboardNav.tsx
git commit -m "feat(notifications): add NotificationsPage, routing and bell icon in navbar"
```

---

### Task 10: Verifica finale Fase 1

- [ ] **Step 1: Build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Output atteso: nessun errore.

- [ ] **Step 2: Test backend completi**

```bash
npm test --prefix archibald-web-app/backend
```

Output atteso: tutti i test passano (inclusi i nuovi notifications.spec, notification-service.spec, routes/notifications.spec).

- [ ] **Step 3: Type-check + test frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```

Output atteso: nessun errore, tutti i test passano.

---

## Fase 2 — Generatore: ERP Customer Deleted

### Task 11: Extend `customer-sync.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/sync/services/customer-sync.ts`
- Modify: `archibald-web-app/backend/src/sync/services/customer-sync.spec.ts`

- [ ] **Step 1: Scrivi il test per il callback (failing)**

In `customer-sync.spec.ts`, aggiorna l'import per includere `DeletedProfileInfo` e aggiungi questi test dopo il describe esistente:

```ts
// Aggiorna l'import in cima al file:
import { syncCustomers, type CustomerSyncDeps, type CustomerSyncResult, type DeletedProfileInfo } from './customer-sync';
```

```ts
// Aggiungi in fondo al file, dopo i test esistenti:

describe('syncCustomers - onDeletedCustomers', () => {
  // Il mock pool in questi test usa mockResolvedValueOnce in sequenza.
  // Con 2 clienti parsati (CUST-001, CUST-002), le query avvengono in quest'ordine:
  // 0: SELECT hash CUST-001  → [] (nuovo)
  // 1: INSERT CUST-001
  // 2: SELECT hash CUST-002  → [] (nuovo)
  // 3: INSERT CUST-002
  // 4: SELECT customer_profile,internal_id,name NOT IN (CUST-001,CUST-002)
  // 5: SELECT DISTINCT user_id FROM order_records  (solo se onDeletedCustomers e internalIds.length > 0)
  // 6: DELETE

  function createPool() {
    return {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    } as unknown as import('../../db/pool').DbPool;
  }

  const TWO_PARSED = [
    { customerProfile: 'CUST-001', name: 'Acme Corp' },
    { customerProfile: 'CUST-002', name: 'Beta Ltd' },
  ];

  test('chiama onDeletedCustomers con i profili che hanno ordini', async () => {
    const pool = createPool();
    const q = pool.query as ReturnType<typeof vi.fn>;
    q.mockResolvedValueOnce({ rows: [], rowCount: 0 })  // SELECT hash CUST-001
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // INSERT CUST-001
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // SELECT hash CUST-002
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // INSERT CUST-002
      .mockResolvedValueOnce({ rows: [{ customer_profile: 'CUST-OLD', internal_id: 'INT-OLD', name: 'Old Corp' }], rowCount: 1 })  // SELECT toDelete
      .mockResolvedValueOnce({ rows: [{ user_id: 'agent-1', customer_profile_id: 'INT-OLD' }], rowCount: 1 })  // SELECT DISTINCT order users
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // DELETE

    const onDeletedCustomers = vi.fn().mockResolvedValue(undefined);
    const deps: CustomerSyncDeps = {
      pool,
      downloadPdf: vi.fn().mockResolvedValue('/tmp/customers.pdf'),
      parsePdf: vi.fn().mockResolvedValue(TWO_PARSED),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
      onDeletedCustomers,
    };

    await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    expect(onDeletedCustomers).toHaveBeenCalledOnce();
    expect(onDeletedCustomers).toHaveBeenCalledWith([
      { profile: 'CUST-OLD', internalId: 'INT-OLD', name: 'Old Corp' },
    ]);
  });

  test('non chiama onDeletedCustomers quando i clienti eliminati non hanno ordini', async () => {
    const pool = createPool();
    const q = pool.query as ReturnType<typeof vi.fn>;
    q.mockResolvedValueOnce({ rows: [], rowCount: 0 })  // SELECT hash CUST-001
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // INSERT CUST-001
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // SELECT hash CUST-002
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // INSERT CUST-002
      .mockResolvedValueOnce({ rows: [{ customer_profile: 'CUST-OLD', internal_id: 'INT-OLD', name: 'Old Corp' }], rowCount: 1 })  // SELECT toDelete
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // SELECT DISTINCT order users → nessuno
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // DELETE

    const onDeletedCustomers = vi.fn().mockResolvedValue(undefined);
    const deps: CustomerSyncDeps = {
      pool,
      downloadPdf: vi.fn().mockResolvedValue('/tmp/customers.pdf'),
      parsePdf: vi.fn().mockResolvedValue(TWO_PARSED),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
      onDeletedCustomers,
    };

    await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    expect(onDeletedCustomers).not.toHaveBeenCalled();
  });

  test('non chiama onDeletedCustomers quando non è definito nei deps', async () => {
    const pool = createPool();
    const q = pool.query as ReturnType<typeof vi.fn>;
    q.mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ customer_profile: 'CUST-OLD', internal_id: 'INT-OLD', name: 'Old Corp' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const deps: CustomerSyncDeps = {
      pool,
      downloadPdf: vi.fn().mockResolvedValue('/tmp/customers.pdf'),
      parsePdf: vi.fn().mockResolvedValue(TWO_PARSED),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
      // onDeletedCustomers non definito
    };

    await expect(syncCustomers(deps, 'user-1', vi.fn(), () => false)).resolves.toMatchObject({ success: true });
    // La SELECT DISTINCT non deve essere chiamata
    const orderQuery = q.mock.calls.find((c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('order_records')
    );
    expect(orderQuery).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implementa il callback in `customer-sync.ts`**

In `customer-sync.ts`, aggiungi:

1. Nuovo tipo esportato:

```ts
type DeletedProfileInfo = {
  profile: string;
  internalId: string;
  name: string;
};
```

2. Aggiungi `onDeletedCustomers` a `CustomerSyncDeps`:

```ts
type CustomerSyncDeps = {
  pool: DbPool;
  downloadPdf: (userId: string) => Promise<string>;
  parsePdf: (pdfPath: string) => Promise<ParsedCustomer[]>;
  cleanupFile: (filePath: string) => Promise<void>;
  onDeletedCustomers?: (infos: DeletedProfileInfo[]) => Promise<void>;
};
```

3. Nel blocco di delete (dopo la riga `const { rows: toDelete } = await pool.query...` che recupera `customer_profile`), modifica la query per recuperare anche `internal_id` e `name`:

```ts
// Sostituisci:
// const { rows: toDelete } = await pool.query<{ customer_profile: string }>(...)

// Con:
const { rows: toDelete } = await pool.query<{ customer_profile: string; internal_id: string | null; name: string }>(
  `SELECT customer_profile, internal_id, name FROM agents.customers WHERE user_id = $1 AND customer_profile NOT IN (${placeholders})`,
  [userId, ...parsedIds],
);
```

4. Prima del DELETE, aggiungi la logica di notifica. Inserisci dopo il blocco TEMP-profiles migration e prima del DELETE SQL:

```ts
// Notifica se ci sono clienti con ordini attivi
if (deps.onDeletedCustomers) {
  const internalIds = toDelete
    .map((r) => r.internal_id)
    .filter((id): id is string => id !== null);

  if (internalIds.length > 0) {
    const placeholderIds = internalIds.map((_, i) => `$${i + 1}`).join(', ');
    const { rows: orderUsers } = await pool.query<{ user_id: string; customer_profile_id: string }>(
      `SELECT DISTINCT o.user_id, o.customer_profile_id
       FROM agents.order_records o
       WHERE o.customer_profile_id = ANY(ARRAY[${placeholderIds}])`,
      internalIds,
    );

    if (orderUsers.length > 0) {
      const profilesWithOrders = toDelete.filter((r) =>
        r.internal_id !== null && orderUsers.some((ou) => ou.customer_profile_id === r.internal_id),
      );
      if (profilesWithOrders.length > 0) {
        await deps.onDeletedCustomers(
          profilesWithOrders.map((r) => ({
            profile: r.customer_profile,
            internalId: r.internal_id!,
            name: r.name,
          })),
        );
      }
    }
  }
}
```

- [ ] **Step 3: Esporta `DeletedProfileInfo` da `customer-sync.ts`**

Aggiungi `DeletedProfileInfo` alla lista degli export:

```ts
export { syncCustomers, SyncStoppedError, type CustomerSyncDeps, type CustomerSyncResult, type ParsedCustomer, type DeletedProfileInfo };
```

- [ ] **Step 4: Verifica build**

```bash
npm run build --prefix archibald-web-app/backend
```

Output atteso: nessun errore TypeScript.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/sync/services/customer-sync.ts \
        archibald-web-app/backend/src/sync/services/customer-sync.spec.ts
git commit -m "feat(notifications): add onDeletedCustomers callback to syncCustomers"
```

---

### Task 12: Wire Handler + main.ts per erp_customer_deleted

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-customers.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-customers.spec.ts`
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Aggiungi `onDeletedCustomers` dep al handler**

In `sync-customers.ts`, aggiungi il parametro opzionale al handler:

```ts
import type { DeletedProfileInfo } from '../../sync/services/customer-sync';

function createSyncCustomersHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedCustomer[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncCustomersBot,
  onDeletedCustomers?: (infos: DeletedProfileInfo[]) => Promise<void>,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: CustomerSyncResult = await syncCustomers(
      { pool, downloadPdf: () => bot.downloadCustomersPdf(), parsePdf, cleanupFile, onDeletedCustomers },
      userId,
      onProgress,
      () => false,
    );
    return result as unknown as Record<string, unknown>;
  };
}
```

- [ ] **Step 2: Aggiorna il test del handler**

In `sync-customers.spec.ts`, aggiungi un test che verifica che `onDeletedCustomers` venga passato ai deps di `syncCustomers`:

```ts
test('passes onDeletedCustomers to syncCustomers deps when provided', async () => {
  const onDeletedCustomers = vi.fn().mockResolvedValue(undefined);
  const handler = createSyncCustomersHandler(pool, parsePdf, cleanupFile, createBot, onDeletedCustomers);
  syncCustomersMock.mockResolvedValue(sampleResult);

  await handler({} as any, {}, 'user-1', vi.fn());

  expect(syncCustomersMock).toHaveBeenCalledWith(
    expect.objectContaining({ onDeletedCustomers }),
    'user-1',
    expect.any(Function),
    expect.any(Function),
  );
});
```

- [ ] **Step 3: Passa il callback in `main.ts`**

In `main.ts`, nel blocco `'sync-customers': createSyncCustomersHandler(...)`, aggiungi il 5° argomento:

```ts
'sync-customers': createSyncCustomersHandler(
  pool,
  async (pdfPath) => {
    const result = await pdfParserService.parsePDF(pdfPath);
    return result.customers.map(adaptCustomer);
  },
  cleanupFile,
  (userId) => ({ /* ... esistente ... */ }),
  async (deletedInfos) => {
    // Notifica ogni agente distinto che ha ordini con i clienti eliminati
    const agentUserIds = [...new Set(deletedInfos.map((d) => d.internalId))];
    // Recupera user_id degli agenti con quegli ordini
    const { rows: agentRows } = await pool.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM agents.order_records WHERE customer_profile_id = ANY($1)`,
      [deletedInfos.map((d) => d.internalId)],
    );
    const uniqueAgentIds = [...new Set(agentRows.map((r) => r.user_id))];

    const profileText = deletedInfos.map((d) => d.name).join(', ');

    for (const agentId of uniqueAgentIds) {
      await createNotification(notificationDeps, {
        target: 'user',
        userId: agentId,
        type: 'erp_customer_deleted',
        severity: 'error',
        title: 'Clienti eliminati da ERP',
        body: `I seguenti clienti sono stati rimossi da Archibald: ${profileText}`,
        data: { deletedProfiles: deletedInfos },
      });
    }

    await createNotification(notificationDeps, {
      target: 'admin',
      type: 'erp_customer_deleted',
      severity: 'error',
      title: 'Clienti eliminati da ERP',
      body: `${deletedInfos.length} cliente/i eliminati da Archibald ERP: ${profileText}`,
      data: { deletedProfiles: deletedInfos },
    });
  },
),
```

- [ ] **Step 4: Build + test**

```bash
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend
```

Output atteso: build senza errori, tutti i test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/sync-customers.ts \
        archibald-web-app/backend/src/operations/handlers/sync-customers.spec.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(notifications): generate erp_customer_deleted notification on sync"
```

---

## Fase 3 — Generatori FedEx Tracking

### Task 13: Extend `tracking-sync.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/sync/services/tracking-sync.ts`
- Modify: `archibald-web-app/backend/src/sync/services/tracking-sync.spec.ts`

- [ ] **Step 1: Scrivi i test per `onTrackingEvent` (failing)**

Il file `tracking-sync.spec.ts` usa già `vi.mock('./fedex-api-tracker')` e `makeMockPool`. Aggiungi questi test in fondo al describe `syncTracking` esistente:

```ts
// Aggiungi in fondo al describe('syncTracking', ...) esistente:

test('chiama onTrackingEvent con "delivered" quando status è DL', async () => {
  const mockOrders = [{ order_number: 'ORD/001', tracking_number: 'TRK111' }];
  mockTrackViaFedExApi.mockResolvedValue([
    makeResult('TRK111', { statusBarCD: 'DL', keyStatusCD: 'DL', actualDelivery: '2026-03-26 12:00:00' }),
  ]);
  const { pool } = makeMockPool(mockOrders);
  const onTrackingEvent = vi.fn().mockResolvedValue(undefined);

  await syncTracking(pool, 'user-1', vi.fn(), () => false, onTrackingEvent);

  expect(onTrackingEvent).toHaveBeenCalledOnce();
  expect(onTrackingEvent).toHaveBeenCalledWith('delivered', 'ORD/001');
});

test('chiama onTrackingEvent con "exception" quando status è DE', async () => {
  const mockOrders = [{ order_number: 'ORD/002', tracking_number: 'TRK222' }];
  mockTrackViaFedExApi.mockResolvedValue([
    makeResult('TRK222', { statusBarCD: 'DE', keyStatusCD: 'DE' }),
  ]);
  const { pool } = makeMockPool(mockOrders);
  const onTrackingEvent = vi.fn().mockResolvedValue(undefined);

  await syncTracking(pool, 'user-1', vi.fn(), () => false, onTrackingEvent);

  expect(onTrackingEvent).toHaveBeenCalledOnce();
  expect(onTrackingEvent).toHaveBeenCalledWith('exception', 'ORD/002');
});

test('non chiama onTrackingEvent per status in_transit', async () => {
  const mockOrders = [{ order_number: 'ORD/003', tracking_number: 'TRK333' }];
  mockTrackViaFedExApi.mockResolvedValue([
    makeResult('TRK333', { statusBarCD: 'OW', keyStatusCD: 'IT' }),
  ]);
  const { pool } = makeMockPool(mockOrders);
  const onTrackingEvent = vi.fn().mockResolvedValue(undefined);

  await syncTracking(pool, 'user-1', vi.fn(), () => false, onTrackingEvent);

  expect(onTrackingEvent).not.toHaveBeenCalled();
});

test('non chiama onTrackingEvent quando non è definito', async () => {
  const mockOrders = [{ order_number: 'ORD/004', tracking_number: 'TRK444' }];
  mockTrackViaFedExApi.mockResolvedValue([
    makeResult('TRK444', { statusBarCD: 'DL', keyStatusCD: 'DL' }),
  ]);
  const { pool } = makeMockPool(mockOrders);

  // Nessun quinto parametro — non deve lanciare errori
  await expect(
    syncTracking(pool, 'user-1', vi.fn(), () => false)
  ).resolves.toMatchObject({ success: true, newDeliveries: 1 });
});
```

- [ ] **Step 2: Aggiungi `onTrackingEvent` a `syncTracking`**

In `tracking-sync.ts`, modifica la firma di `syncTracking`:

```ts
type TrackingEventType = 'delivered' | 'exception';

async function syncTracking(
  pool: DbPool,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  shouldStop: () => boolean,
  onTrackingEvent?: (type: TrackingEventType, orderNumber: string) => Promise<void>,
): Promise<TrackingSyncResult>
```

Nel loop dei result, dopo `if (status === 'delivered') newDeliveries++;`, aggiungi:

```ts
if (onTrackingEvent && (status === 'delivered' || status === 'exception')) {
  await onTrackingEvent(status as TrackingEventType, orderNumber);
}
```

Esporta il tipo:

```ts
export { mapTrackingStatus, syncTracking, type TrackingSyncResult, type TrackingEventType };
```

- [ ] **Step 3: Build**

```bash
npm run build --prefix archibald-web-app/backend
```

Output atteso: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/sync/services/tracking-sync.ts \
        archibald-web-app/backend/src/sync/services/tracking-sync.spec.ts
git commit -m "feat(notifications): add onTrackingEvent callback to syncTracking"
```

---

### Task 14: Wire Handler per FedEx

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-tracking.ts`
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Aggiungi `onTrackingEvent` al handler**

In `sync-tracking.ts`:

```ts
import type { DbPool } from '../../db/pool';
import type { TrackingSyncResult, TrackingEventType } from '../../sync/services/tracking-sync';
import { syncTracking } from '../../sync/services/tracking-sync';
import type { OperationHandler } from '../operation-processor';

function createSyncTrackingHandler(
  pool: DbPool,
  onTrackingEvent?: (type: TrackingEventType, orderNumber: string) => Promise<void>,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const result: TrackingSyncResult = await syncTracking(
      pool,
      userId,
      onProgress,
      () => false,
      onTrackingEvent,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncTrackingHandler };
```

- [ ] **Step 2: Passa il callback in `main.ts`**

Sostituisci `'sync-tracking': createSyncTrackingHandler(pool)` con:

```ts
'sync-tracking': createSyncTrackingHandler(
  pool,
  async (type, orderNumber) => {
    // Recupera userId e nome cliente dall'ordine
    const { rows } = await pool.query<{ user_id: string; customer_name: string }>(
      `SELECT user_id, customer_name FROM agents.order_records WHERE order_number = $1 LIMIT 1`,
      [orderNumber],
    );
    if (rows.length === 0) return;
    const { user_id: agentId, customer_name: customerName } = rows[0];

    if (type === 'delivered') {
      await createNotification(notificationDeps, {
        target: 'user',
        userId: agentId,
        type: 'fedex_delivered',
        severity: 'success',
        title: 'Ordine consegnato',
        body: `L'ordine ${orderNumber} (${customerName}) è stato consegnato.`,
        data: { orderNumber, customerName },
      });
    } else {
      await createNotification(notificationDeps, {
        target: 'user',
        userId: agentId,
        type: 'fedex_exception',
        severity: 'warning',
        title: 'Eccezione tracking FedEx',
        body: `L'ordine ${orderNumber} (${customerName}) ha un problema di consegna.`,
        data: { orderNumber, customerName },
      });
    }
  },
),
```

- [ ] **Step 3: Build + test**

```bash
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend
```

Output atteso: build senza errori, tutti i test passano.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/sync-tracking.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(notifications): generate fedex_delivered and fedex_exception notifications"
```

---

## Note sulle Fasi 4 e 5

Le fasi 4 e 5 seguono lo stesso pattern delle fasi 2 e 3:
- **Fase 4** (sync anomalie, prezzi, prodotti): aggiungere callback a `price-sync.ts` e `product-sync.ts`, chiamare `createNotification(notificationDeps, ...)` con i tipi `sync_anomaly`, `price_change`, `product_change`, `product_missing_vat`.
- **Fase 5** (job schedulati): aggiungere un nuovo `setInterval` in `sync-scheduler.ts` per il cleanup giornaliero che chiama `notificationsRepo.deleteExpired(pool)`. I job mensile/settimanale per `customer_inactive`, `order_expiring`, `budget_milestone` seguono lo stesso pattern.

Ogni fase richiede:
1. Leggere il file sync corrispondente per capire i punti di trigger
2. Aggiungere callback alla firma della funzione sync
3. Passare il callback dall'handler con la logica `createNotification`

Il template del piano per queste fasi è identico ai Task 11–14, da applicare ai rispettivi file.
