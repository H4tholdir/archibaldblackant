# Web Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere notifiche push native OS alla PWA Formicanera, così gli agenti ricevono notifiche anche quando l'app è chiusa o in background.

**Architecture:** Il backend usa la libreria `web-push` (standard Web Push Protocol, VAPID) per mandare push alle subscription registrate nel DB. Il frontend passa da `generateSW` (Workbox auto) a `injectManifest` (SW custom) per poter gestire gli eventi `push` e `notificationclick` nel service worker. Al login, il frontend chiede il permesso notifiche e registra la subscription sul backend. Ad ogni `createNotification`, oltre al broadcast WebSocket già esistente, il backend manda il push a tutte le subscription dell'utente.

**Tech Stack:**
- Backend: `web-push` npm library, VAPID keys (env vars), PostgreSQL `agents.push_subscriptions`
- Frontend: VitePWA `injectManifest` strategy, `workbox-*` packages, `Notification.requestPermission()`, `PushManager.subscribe()`

---

## Panoramica file

### Nuovi file backend
- `backend/src/db/migrations/035-push-subscriptions.sql` — tabella push_subscriptions
- `backend/src/db/repositories/push-subscriptions.ts` — CRUD per le subscription
- `backend/src/db/repositories/push-subscriptions.spec.ts` — unit test repository
- `backend/src/services/push-service.ts` — wrappa web-push, mappa tipo→URL
- `backend/src/services/push-service.spec.ts` — unit test per getNotificationPushUrl
- `backend/src/routes/push.ts` — POST/DELETE /api/push/subscribe
- `backend/src/routes/push.spec.ts` — test router

### File backend modificati
- `backend/.env.example` — aggiunge VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
- `backend/src/services/notification-service.ts` — aggiunge `sendPush?` a deps
- `backend/src/services/notification-service.spec.ts` — aggiorna mock
- `backend/src/main.ts` — configura push, wira router e sendPush in notificationDeps

### Nuovi file frontend
- `frontend/src/sw.ts` — service worker custom (Workbox + push handler + notificationclick)
- `frontend/src/services/push-subscription.service.ts` — subscribe/unsubscribe
- `frontend/src/hooks/usePushSubscription.ts` — hook che chiama subscribe al login

### File frontend modificati
- `frontend/vite.config.ts` — passa a `strategies: 'injectManifest'`
- `frontend/src/AppRouter.tsx` — chiama `usePushSubscription(auth.isAuthenticated)`

---

## Task 1: Installare web-push e creare push-service.ts

**Files:**
- Create: `backend/src/services/push-service.ts`
- Create: `backend/src/services/push-service.spec.ts`
- Modify: `backend/.env.example`

### Prerequisito: Generare le VAPID keys (una-tantum)

- [ ] **Step 1: Genera le VAPID keys**

```bash
cd archibald-web-app/backend
npx web-push generate-vapid-keys
```

Output atteso:
```
Public Key:
BExamplePublicKeyBase64Url...

Private Key:
ExamplePrivateKeyBase64Url...
```

Salva questi valori — serviranno nei passi seguenti.

- [ ] **Step 2: Installa la dipendenza**

```bash
npm install web-push --prefix archibald-web-app/backend
npm install --save-dev @types/web-push --prefix archibald-web-app/backend
```

- [ ] **Step 3: Aggiungi le variabili a `.env.example`**

```bash
# In backend/.env.example, aggiungi in fondo:
```

Apri `archibald-web-app/backend/.env.example` e aggiungi:
```
# Web Push (VAPID)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@formicanera.com
```

- [ ] **Step 4: Aggiungi le variabili al `.env` locale**

Apri `archibald-web-app/backend/.env` e aggiungi con le chiavi generate al Step 1:
```
VAPID_PUBLIC_KEY=BExamplePublicKeyBase64Url...
VAPID_PRIVATE_KEY=ExamplePrivateKeyBase64Url...
VAPID_SUBJECT=mailto:admin@formicanera.com
```

- [ ] **Step 5: Scrivi il test che verifica `getNotificationPushUrl`**

Crea `archibald-web-app/backend/src/services/push-service.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { getNotificationPushUrl } from './push-service';

describe('getNotificationPushUrl', () => {
  test.each([
    ['fedex_exception', '/orders'],
    ['fedex_delivered', '/orders'],
    ['erp_customer_deleted', '/customers'],
    ['erp_customer_restored', '/customers'],
    ['customer_inactive', '/customers'],
    ['price_change', '/prezzi-variazioni'],
    ['product_change', '/prodotti-variazioni'],
    ['product_missing_vat', '/admin'],
    ['sync_anomaly', '/admin'],
    ['order_expiring', '/pending-orders'],
    ['budget_milestone', '/revenue-report'],
  ])('type "%s" → "%s"', (type, expected) => {
    expect(getNotificationPushUrl(type)).toBe(expected);
  });

  test('unknown type returns /notifications', () => {
    expect(getNotificationPushUrl('unknown_type_xyz')).toBe('/notifications');
  });
});
```

- [ ] **Step 6: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose push-service
```

Expected: FAIL — `push-service` not found.

- [ ] **Step 7: Crea `push-service.ts`**

Crea `archibald-web-app/backend/src/services/push-service.ts`:

```ts
import webpush from 'web-push';
import type { PushSubscriptionRecord } from '../db/repositories/push-subscriptions';

type PushPayload = {
  title: string;
  body: string;
  type: string;
  url: string;
};

function configurePush(vapidPublicKey: string, vapidPrivateKey: string, vapidSubject: string): void {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

function getNotificationPushUrl(type: string): string {
  switch (type) {
    case 'fedex_exception':
    case 'fedex_delivered':
      return '/orders';
    case 'erp_customer_deleted':
    case 'erp_customer_restored':
    case 'customer_inactive':
      return '/customers';
    case 'price_change':
      return '/prezzi-variazioni';
    case 'product_change':
      return '/prodotti-variazioni';
    case 'product_missing_vat':
    case 'sync_anomaly':
      return '/admin';
    case 'order_expiring':
      return '/pending-orders';
    case 'budget_milestone':
      return '/revenue-report';
    default:
      return '/notifications';
  }
}

async function sendPushToSubscriptions(
  subscriptions: PushSubscriptionRecord[],
  payload: PushPayload,
): Promise<void> {
  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      ),
    ),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      // push è best-effort — logga ma non propagare
      console.error('[push] sendNotification failed:', (result as PromiseRejectedResult).reason);
    }
  }
}

export { configurePush, getNotificationPushUrl, sendPushToSubscriptions, type PushPayload };
```

- [ ] **Step 8: Esegui il test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose push-service
```

Expected: PASS — 13 tests passing.

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/backend/src/services/push-service.ts \
        archibald-web-app/backend/src/services/push-service.spec.ts \
        archibald-web-app/backend/.env.example
git commit -m "feat(push): add push-service with VAPID config and URL routing"
```

---

## Task 2: Migrazione DB e repository push_subscriptions

**Files:**
- Create: `backend/src/db/migrations/035-push-subscriptions.sql`
- Create: `backend/src/db/repositories/push-subscriptions.ts`
- Create: `backend/src/db/repositories/push-subscriptions.spec.ts`

- [ ] **Step 1: Scrivi il test per il repository**

Crea `archibald-web-app/backend/src/db/repositories/push-subscriptions.spec.ts`:

```ts
import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../pool';
import {
  savePushSubscription,
  deletePushSubscription,
  getPushSubscriptionsByUserId,
} from './push-subscriptions';

function createMockPool(rows: unknown[] = []): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

describe('savePushSubscription', () => {
  test('executes upsert with correct params', async () => {
    const pool = createMockPool();
    await savePushSubscription(pool, 'user-1', 'https://push.example.com/123', 'p256dh-key', 'auth-key');

    const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('INSERT INTO agents.push_subscriptions');
    expect(sql).toContain('ON CONFLICT');
    expect(params).toEqual(['user-1', 'https://push.example.com/123', 'p256dh-key', 'auth-key']);
  });
});

describe('deletePushSubscription', () => {
  test('deletes by user_id and endpoint', async () => {
    const pool = createMockPool();
    await deletePushSubscription(pool, 'user-1', 'https://push.example.com/123');

    const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('DELETE FROM agents.push_subscriptions');
    expect(params).toEqual(['user-1', 'https://push.example.com/123']);
  });
});

describe('getPushSubscriptionsByUserId', () => {
  test('returns mapped records', async () => {
    const dbRow = {
      id: 1,
      user_id: 'user-1',
      endpoint: 'https://push.example.com/123',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
      created_at: new Date('2026-01-01'),
    };
    const pool = createMockPool([dbRow]);

    const result = await getPushSubscriptionsByUserId(pool, 'user-1');

    expect(result).toEqual([{
      id: 1,
      userId: 'user-1',
      endpoint: 'https://push.example.com/123',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
      createdAt: new Date('2026-01-01'),
    }]);
  });

  test('returns empty array when no subscriptions', async () => {
    const pool = createMockPool([]);
    const result = await getPushSubscriptionsByUserId(pool, 'user-no-sub');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose push-subscriptions
```

Expected: FAIL — `push-subscriptions` not found.

- [ ] **Step 3: Crea la migrazione SQL**

Crea `archibald-web-app/backend/src/db/migrations/035-push-subscriptions.sql`:

```sql
CREATE TABLE agents.push_subscriptions (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);
```

- [ ] **Step 4: Crea il repository**

Crea `archibald-web-app/backend/src/db/repositories/push-subscriptions.ts`:

```ts
import type { DbPool } from '../pool';

type PushSubscriptionRecord = {
  id: number;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
};

type PushSubscriptionRow = {
  id: number;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: Date;
};

async function savePushSubscription(
  pool: DbPool,
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [userId, endpoint, p256dh, auth],
  );
}

async function deletePushSubscription(pool: DbPool, userId: string, endpoint: string): Promise<void> {
  await pool.query(
    `DELETE FROM agents.push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [userId, endpoint],
  );
}

async function getPushSubscriptionsByUserId(pool: DbPool, userId: string): Promise<PushSubscriptionRecord[]> {
  const { rows } = await pool.query<PushSubscriptionRow>(
    `SELECT id, user_id, endpoint, p256dh, auth, created_at
     FROM agents.push_subscriptions WHERE user_id = $1`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
    createdAt: r.created_at,
  }));
}

export {
  savePushSubscription,
  deletePushSubscription,
  getPushSubscriptionsByUserId,
  type PushSubscriptionRecord,
};
```

- [ ] **Step 5: Esegui il test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose push-subscriptions
```

Expected: PASS — 4 tests passing.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/035-push-subscriptions.sql \
        archibald-web-app/backend/src/db/repositories/push-subscriptions.ts \
        archibald-web-app/backend/src/db/repositories/push-subscriptions.spec.ts
git commit -m "feat(push): add push_subscriptions table and repository"
```

---

## Task 3: Backend API route subscribe/unsubscribe

**Files:**
- Create: `backend/src/routes/push.ts`
- Create: `backend/src/routes/push.spec.ts`

- [ ] **Step 1: Scrivi il test del router**

Crea `archibald-web-app/backend/src/routes/push.spec.ts`:

```ts
import { describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPushRouter } from './push';

function buildApp(deps = {}) {
  const app = express();
  app.use(express.json());
  // Mock auth middleware — inject user
  app.use((req: express.Request & { user?: { userId: string } }, _res, next) => {
    req.user = { userId: 'user-1' };
    next();
  });
  app.use('/api/push', createPushRouter({
    savePushSubscription: vi.fn().mockResolvedValue(undefined),
    deletePushSubscription: vi.fn().mockResolvedValue(undefined),
    ...deps,
  }));
  return app;
}

describe('POST /api/push/subscribe', () => {
  test('returns 201 when all fields provided', async () => {
    const savePushSubscription = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({ savePushSubscription });

    const res = await request(app)
      .post('/api/push/subscribe')
      .send({ endpoint: 'https://push.example.com/123', p256dh: 'p256dh-key', auth: 'auth-key' });

    expect(res.status).toBe(201);
    expect(savePushSubscription).toHaveBeenCalledWith('user-1', 'https://push.example.com/123', 'p256dh-key', 'auth-key');
  });

  test('returns 400 when endpoint is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/push/subscribe')
      .send({ p256dh: 'p256dh-key', auth: 'auth-key' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when p256dh is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/push/subscribe')
      .send({ endpoint: 'https://push.example.com/123', auth: 'auth-key' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/push/subscribe', () => {
  test('returns 204 when endpoint provided', async () => {
    const deletePushSubscription = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({ deletePushSubscription });

    const res = await request(app)
      .delete('/api/push/subscribe')
      .send({ endpoint: 'https://push.example.com/123' });

    expect(res.status).toBe(204);
    expect(deletePushSubscription).toHaveBeenCalledWith('user-1', 'https://push.example.com/123');
  });

  test('returns 400 when endpoint is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .delete('/api/push/subscribe')
      .send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose routes/push
```

Expected: FAIL — `./push` not found.

- [ ] **Step 3: Crea il router**

Crea `archibald-web-app/backend/src/routes/push.ts`:

```ts
import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { logger } from '../logger';

type PushRouterDeps = {
  savePushSubscription: (userId: string, endpoint: string, p256dh: string, auth: string) => Promise<void>;
  deletePushSubscription: (userId: string, endpoint: string) => Promise<void>;
};

function createPushRouter(deps: PushRouterDeps) {
  const { savePushSubscription, deletePushSubscription } = deps;
  const router = Router();

  router.post('/subscribe', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { endpoint, p256dh, auth } = req.body as { endpoint?: string; p256dh?: string; auth?: string };
      if (!endpoint || !p256dh || !auth) {
        res.status(400).json({ success: false, error: 'endpoint, p256dh e auth sono obbligatori' });
        return;
      }
      await savePushSubscription(userId, endpoint, p256dh, auth);
      res.sendStatus(201);
    } catch (error) {
      logger.error('Error saving push subscription', { error });
      res.status(500).json({ success: false, error: 'Errore nel salvataggio sottoscrizione push' });
    }
  });

  router.delete('/subscribe', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { endpoint } = req.body as { endpoint?: string };
      if (!endpoint) {
        res.status(400).json({ success: false, error: 'endpoint è obbligatorio' });
        return;
      }
      await deletePushSubscription(userId, endpoint);
      res.sendStatus(204);
    } catch (error) {
      logger.error('Error deleting push subscription', { error });
      res.status(500).json({ success: false, error: 'Errore nella rimozione sottoscrizione push' });
    }
  });

  return router;
}

export { createPushRouter, type PushRouterDeps };
```

- [ ] **Step 4: Esegui il test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose routes/push
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/push.ts \
        archibald-web-app/backend/src/routes/push.spec.ts
git commit -m "feat(push): add push subscribe/unsubscribe API endpoints"
```

---

## Task 4: Integrare push in notification-service e main.ts

**Files:**
- Modify: `backend/src/services/notification-service.ts`
- Modify: `backend/src/services/notification-service.spec.ts`
- Modify: `backend/src/main.ts`

### Parte A — notification-service.ts

- [ ] **Step 1: Leggi il test attuale**

```bash
cat archibald-web-app/backend/src/services/notification-service.spec.ts
```

Identifica i test che creano `deps` con `broadcast`. Ogni test di `createNotification` dovrà aggiungere `sendPush: vi.fn().mockResolvedValue(undefined)` ai deps.

- [ ] **Step 2: Scrivi il test per sendPush**

Nel file `archibald-web-app/backend/src/services/notification-service.spec.ts`, aggiungi nel describe `createNotification`:

```ts
test('calls sendPush after broadcast when sendPush is provided', async () => {
  const sendPush = vi.fn().mockResolvedValue(undefined);
  const deps = {
    pool: createMockPool(),
    getAllUsers: vi.fn().mockResolvedValue([]),
    insertNotification: vi.fn().mockResolvedValue({ id: 1, userId: 'user-1', type: 'fedex_delivered', title: 'T', body: 'B', severity: 'success', data: null, readAt: null, createdAt: new Date(), expiresAt: new Date() }),
    broadcast: vi.fn(),
    sendPush,
  };

  await createNotification(deps, { target: 'user', userId: 'user-1', type: 'fedex_delivered', severity: 'success', title: 'T', body: 'B' });

  expect(sendPush).toHaveBeenCalledOnce();
  expect(sendPush).toHaveBeenCalledWith('user-1', expect.objectContaining({ type: 'fedex_delivered' }));
});

test('does not throw if sendPush is not provided', async () => {
  const deps = {
    pool: createMockPool(),
    getAllUsers: vi.fn().mockResolvedValue([]),
    insertNotification: vi.fn().mockResolvedValue({ id: 1, userId: 'user-1', type: 'fedex_delivered', title: 'T', body: 'B', severity: 'success', data: null, readAt: null, createdAt: new Date(), expiresAt: new Date() }),
    broadcast: vi.fn(),
    // sendPush omesso intenzionalmente
  };

  await expect(
    createNotification(deps, { target: 'user', userId: 'user-1', type: 'fedex_delivered', severity: 'success', title: 'T', body: 'B' })
  ).resolves.toBeUndefined();
});
```

- [ ] **Step 3: Esegui i test per verificare che falliscono**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose notification-service
```

Expected: i 2 nuovi test FAIL perché `sendPush` non è ancora nel tipo.

- [ ] **Step 4: Aggiorna `notification-service.ts`**

In `archibald-web-app/backend/src/services/notification-service.ts`:

Modifica `NotificationServiceDeps` aggiungendo `sendPush?`:

```ts
type NotificationServiceDeps = {
  pool: DbPool;
  getAllUsers: (pool: DbPool) => Promise<User[]>;
  insertNotification: (pool: DbPool, params: InsertNotificationParams) => Promise<Notification>;
  broadcast: (userId: string, msg: BroadcastMsg) => void;
  sendPush?: (userId: string, notification: Notification) => Promise<void>;
};
```

Nel branch `target === 'user'`, dopo `broadcast(...)`:

```ts
if (deps.sendPush) await deps.sendPush(params.userId, notification).catch(() => {});
```

Nel `Promise.all` per admin/all, dopo `broadcast(user.id, ...)`:

```ts
if (deps.sendPush) await deps.sendPush(user.id, notification).catch(() => {});
```

- [ ] **Step 5: Esegui tutti i test del file**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose notification-service
```

Expected: PASS — tutti i test passano.

### Parte B — main.ts

- [ ] **Step 6: Aggiungi gli import in `main.ts`**

In `archibald-web-app/backend/src/main.ts`, aggiungi agli import:

```ts
import { configurePush, sendPushToSubscriptions, getNotificationPushUrl } from './services/push-service';
import { getPushSubscriptionsByUserId, savePushSubscription, deletePushSubscription } from './db/repositories/push-subscriptions';
import { createPushRouter } from './routes/push';
import type { Notification } from './db/repositories/notifications';
```

- [ ] **Step 7: Configura VAPID e crea `sendPush` in main.ts**

Nel blocco di avvio (dopo la creazione del pool, prima di `const notificationDeps`):

```ts
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? '';
const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:admin@formicanera.com';
if (vapidPublicKey && vapidPrivateKey) {
  configurePush(vapidPublicKey, vapidPrivateKey, vapidSubject);
} else {
  logger.warn('VAPID keys not configured — web push disabled');
}

const sendPush = async (userId: string, notification: Notification) => {
  if (!vapidPublicKey || !vapidPrivateKey) return;
  const subscriptions = await getPushSubscriptionsByUserId(pool, userId);
  if (subscriptions.length === 0) return;
  await sendPushToSubscriptions(subscriptions, {
    title: notification.title,
    body: notification.body,
    type: notification.type,
    url: getNotificationPushUrl(notification.type),
  });
};
```

- [ ] **Step 8: Aggiungi `sendPush` ai `notificationDeps`**

Trova la definizione di `notificationDeps` (cerca `broadcast`) e aggiungi `sendPush`:

```ts
const notificationDeps: NotificationServiceDeps = {
  pool,
  getAllUsers,
  insertNotification,
  broadcast,
  sendPush,
};
```

- [ ] **Step 9: Registra il push router**

Vicino agli altri `app.use('/api/...')`, aggiungi:

```ts
app.use('/api/push', authMiddleware, createPushRouter({
  savePushSubscription: (userId, endpoint, p256dh, auth) =>
    savePushSubscription(pool, userId, endpoint, p256dh, auth),
  deletePushSubscription: (userId, endpoint) =>
    deletePushSubscription(pool, userId, endpoint),
}));
```

- [ ] **Step 10: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: compilazione riuscita, 0 errori TypeScript.

- [ ] **Step 11: Commit**

```bash
git add archibald-web-app/backend/src/services/notification-service.ts \
        archibald-web-app/backend/src/services/notification-service.spec.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(push): wire push notifications into notification-service and main"
```

---

## Task 5: Frontend — Service Worker custom con handler push

**Files:**
- Create: `frontend/src/sw.ts`
- Modify: `frontend/vite.config.ts`

**Contesto:** VitePWA usa attualmente `generateSW` (default), che genera automaticamente il service worker con Workbox ma non permette codice custom. Passiamo a `injectManifest` dove scriviamo noi il SW e VitePWA inietta solo la lista di file da precachare (`self.__WB_MANIFEST`).

- [ ] **Step 1: Installa i pacchetti Workbox per il frontend**

```bash
npm install --save-dev \
  workbox-core \
  workbox-precaching \
  workbox-routing \
  workbox-strategies \
  workbox-expiration \
  workbox-cacheable-response \
  --prefix archibald-web-app/frontend
```

- [ ] **Step 2: Crea `frontend/src/sw.ts`**

Crea `archibald-web-app/frontend/src/sw.ts`:

```ts
/// <reference lib="webworker" />
import { clientsClaim, skipWaiting } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// VitePWA inietta qui la lista dei file da precachare
precacheAndRoute(self.__WB_MANIFEST);

// API calls → NetworkOnly (mai cachare le API)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkOnly(),
);

// HTML → NetworkOnly (sempre versione fresca)
registerRoute(
  ({ request }) => request.destination === 'document',
  new NetworkOnly(),
);

// JS/CSS → StaleWhileRevalidate con scadenza 7 giorni
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({
    cacheName: 'js-css-cache-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// Push notification ricevuta dal server
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const payload = event.data.json() as { title: string; body: string; type: string; url: string };
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload.type,
      renotify: false,
      data: { url: payload.url },
    }),
  );
});

// Utente tocca la notifica → apri/porta in primo piano l'app alla route giusta
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url: string = (event.notification.data as { url?: string } | null)?.url ?? '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('navigate' in client && 'focus' in client) {
            void (client as WindowClient).navigate(url);
            return (client as WindowClient).focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
```

- [ ] **Step 3: Aggiorna `vite.config.ts`**

In `archibald-web-app/frontend/vite.config.ts`, sostituisci il blocco `VitePWA({...})`:

```ts
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  registerType: 'autoUpdate',
  injectRegister: 'auto',
  includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
  manifest: {
    name: 'Formicanera - Archibald Rework',
    short_name: 'Formicanera',
    description: 'PWA mobile per inserimento ordini Archibald - by Francesco Formicola',
    theme_color: '#2c3e50',
    background_color: '#ffffff',
    display: 'standalone',
    scope: '/',
    start_url: '/',
    categories: ['business', 'productivity'],
    lang: 'it',
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  },
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  },
}),
```

Nota: la chiave `workbox` diventa `injectManifest` e le opzioni `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`, `navigationPreload`, `navigateFallbackDenylist` vengono rimosse dalla config perché gestite nel `sw.ts`.

- [ ] **Step 4: Esegui la build per verificare che compila**

```bash
npm run build --prefix archibald-web-app/frontend 2>&1 | tail -20
```

Expected: build completata senza errori, `dist/sw.js` presente.

- [ ] **Step 5: Verifica che il SW ha il push handler**

```bash
grep -n "addEventListener.*push\|addEventListener.*notificationclick" \
  archibald-web-app/frontend/dist/sw.js
```

Expected: almeno 2 righe trovate (push e notificationclick).

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/sw.ts \
        archibald-web-app/frontend/vite.config.ts \
        archibald-web-app/frontend/package.json \
        archibald-web-app/frontend/package-lock.json
git commit -m "feat(push): add custom service worker with push and notificationclick handlers"
```

---

## Task 6: Frontend — Push subscription service e hook

**Files:**
- Create: `frontend/src/services/push-subscription.service.ts`
- Create: `frontend/src/hooks/usePushSubscription.ts`
- Modify: `frontend/src/AppRouter.tsx`

**Contesto:** Non esistono test unitari per questo task (il codice usa `navigator.serviceWorker` e `Notification` API del browser, non testabili con Vitest). Il test è manuale (Task 7).

- [ ] **Step 1: Aggiungi `VITE_VAPID_PUBLIC_KEY` al `.env` del frontend**

Apri (o crea) `archibald-web-app/frontend/.env` e aggiungi:

```
VITE_VAPID_PUBLIC_KEY=<stessa chiave pubblica generata nel Task 1>
```

**Nota deployment:** questa variabile deve essere disponibile al momento del build Docker. Aggiungila come secret in GitHub Actions (`VITE_VAPID_PUBLIC_KEY`) e passala come build arg nel Dockerfile frontend. Nel `Dockerfile` del frontend, aggiungi:
```dockerfile
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
```
E nel workflow CI/CD (`.github/workflows/cd.yml`), aggiungi `--build-arg VITE_VAPID_PUBLIC_KEY=${{ secrets.VITE_VAPID_PUBLIC_KEY }}` al comando `docker build` del frontend.

- [ ] **Step 2: Crea `push-subscription.service.ts`**

Crea `archibald-web-app/frontend/src/services/push-subscription.service.ts`:

```ts
import { fetchWithRetry } from '../utils/fetch-with-retry';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...window.atob(base64)].map((c) => c.charCodeAt(0)));
}

async function subscribeToPush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) return; // push non configurato
  if (!('PushManager' in window)) return; // browser non supporta push
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    // già iscritto — rinvia al server per upsert (subscription potrebbe essere cambiata)
    const json = existing.toJSON();
    await sendToServer(json.endpoint!, json.keys?.p256dh!, json.keys?.auth!);
    return;
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  const json = subscription.toJSON();
  await sendToServer(json.endpoint!, json.keys?.p256dh!, json.keys?.auth!);
}

async function unsubscribeFromPush(): Promise<void> {
  if (!('PushManager' in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await fetchWithRetry('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}

async function sendToServer(endpoint: string, p256dh: string, auth: string): Promise<void> {
  await fetchWithRetry('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, p256dh, auth }),
  });
}

export { subscribeToPush, unsubscribeFromPush };
```

- [ ] **Step 3: Crea `usePushSubscription.ts`**

Crea `archibald-web-app/frontend/src/hooks/usePushSubscription.ts`:

```ts
import { useEffect } from 'react';
import { subscribeToPush } from '../services/push-subscription.service';

function usePushSubscription(isAuthenticated: boolean): void {
  useEffect(() => {
    if (!isAuthenticated) return;
    subscribeToPush().catch(console.error);
  }, [isAuthenticated]);
}

export { usePushSubscription };
```

- [ ] **Step 4: Chiama il hook in `AppRouter.tsx`**

In `archibald-web-app/frontend/src/AppRouter.tsx`, aggiungi l'import:

```ts
import { usePushSubscription } from './hooks/usePushSubscription';
```

All'interno della funzione `AppRouter()`, subito dopo `const auth = useAuth();`:

```ts
usePushSubscription(auth.isAuthenticated);
```

- [ ] **Step 5: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori TypeScript.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/services/push-subscription.service.ts \
        archibald-web-app/frontend/src/hooks/usePushSubscription.ts \
        archibald-web-app/frontend/src/AppRouter.tsx \
        archibald-web-app/frontend/.env
git commit -m "feat(push): subscribe to web push on login, wire into AppRouter"
```

---

## Task 7: Test manuale E2E

**Questo task non produce commit — serve per verificare il funzionamento end-to-end prima del deploy.**

- [ ] **Step 1: Avvia backend in locale**

```bash
npm run dev --prefix archibald-web-app/backend
```

Verifica nel log: `VAPID keys configured` (o equivalente).

- [ ] **Step 2: Avvia frontend in locale**

```bash
npm run dev --prefix archibald-web-app/frontend
```

- [ ] **Step 3: Apri la PWA su Chrome/Safari**

Vai su `http://localhost:5173`, fai login.

- [ ] **Step 4: Verifica richiesta permesso notifiche**

Dopo il login, Chrome deve mostrare il banner di sistema "Formicanera vuole inviarti notifiche". Accetta.

- [ ] **Step 5: Verifica subscription registrata nel DB**

```bash
npm run dev --prefix archibald-web-app/backend
```

Su un terminale separato, query nel DB locale:
```sql
SELECT user_id, endpoint, created_at FROM agents.push_subscriptions;
```

Expected: 1 riga con il tuo user_id.

- [ ] **Step 6: Simula una notifica push da Postman/curl**

Prima ottieni un JWT:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ikiA0930","password":"..."}' | jq '.token'
```

Poi triggera una notifica (es. forza un sync clienti dal pannello admin). Verifica che la notifica appare sia nella campanella che come notifica di sistema OS.

- [ ] **Step 7: Metti la PWA in background e attendi la notifica**

Riduci a icona il browser (o blocca il telefono se stai testando su mobile). Aspetta che arrivi la notifica di sistema.

- [ ] **Step 8: Tocca la notifica**

Verifica che:
- La PWA si apre/porta in primo piano
- Naviga alla route corretta (es. notifica `fedex_delivered` → `/orders`)

---

## Note di deployment

1. **GitHub Actions secret:** Aggiungere `VITE_VAPID_PUBLIC_KEY` come secret nel repository GitHub.
2. **VPS `.env`:** Aggiungere sul VPS (file `/home/deploy/archibald-app/.env`):
   ```
   VAPID_PUBLIC_KEY=<chiave pubblica>
   VAPID_PRIVATE_KEY=<chiave privata>
   VAPID_SUBJECT=mailto:admin@formicanera.com
   ```
3. **Migrazione DB:** La migrazione `035-push-subscriptions.sql` viene eseguita automaticamente dall'auto-migrator del backend al primo avvio dopo il deploy.
4. **HTTPS obbligatorio:** La Push API funziona solo su HTTPS. Il VPS formicanera.com già ha SSL via Let's Encrypt ✓.
5. **iOS/Safari:** Safari su iOS 16.4+ supporta Web Push solo per PWA installate dalla Home Screen. Utenti che usano il browser Safari direttamente non ricevono push.
