# Order Documents Missing Notification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily `order_documents_missing` warning notification for agents when orders in post-shipment/post-invoice states have no linked DDT or invoice.

**Architecture:** New `checkMissingOrderDocuments` function added to `notification-scheduler.ts` alongside the existing daily checks. A single SQL query returns per-order boolean flags (`missing_ddt`, `missing_invoice`). Frontend: new `documents` tab in `NotificationsPage` and a route mapping in `notifications.service.ts`.

**Tech Stack:** TypeScript, PostgreSQL (`pg`), Vitest, React 19

**Spec:** `docs/superpowers/specs/2026-03-30-order-documents-missing-notification-design.md`

**⚠️ Prerequisite:** Migration `042-order-documents-tables.sql` must be applied in prod before this feature is deployed.

---

## File Map

| File | Change |
|---|---|
| `archibald-web-app/backend/src/sync/notification-scheduler.ts` | Add `checkMissingOrderDocuments`, register in `setInterval`, export |
| `archibald-web-app/backend/src/sync/notification-scheduler.spec.ts` | Add `describe('checkMissingOrderDocuments', ...)` |
| `archibald-web-app/frontend/src/services/notifications.service.ts` | Add `order_documents_missing` case in `getNotificationRoute` |
| `archibald-web-app/frontend/src/services/notifications.service.spec.ts` | Add 2 tests for `order_documents_missing` |
| `archibald-web-app/frontend/src/pages/NotificationsPage.tsx` | Add `'documents'` tab, `getCategory` case, `getTableMeta` case |

---

## Task 1: Test backend `checkMissingOrderDocuments`

**Files:**
- Modify: `archibald-web-app/backend/src/sync/notification-scheduler.spec.ts`

- [ ] **Step 1: Aggiungi il describe al fondo del file spec**

```ts
describe('checkMissingOrderDocuments', () => {
  test('creates a "Spedizione senza DDT" warning when only DDT is missing', async () => {
    const row = {
      id: 'ORD001', user_id: 'U1', order_number: 'ORD/26004189',
      customer_name: 'An.Di. S.A.S.', current_state: 'spedito',
      missing_ddt: true, missing_invoice: false,
    };
    const pool = makePool([row]);
    const deps = makeDeps(pool);

    const count = await checkMissingOrderDocuments(pool, deps);

    expect(count).toBe(1);
    expect(deps.insertNotification).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        userId: 'U1',
        type: 'order_documents_missing',
        severity: 'warning',
        title: 'Spedizione senza DDT',
        data: expect.objectContaining({ orderId: 'ORD001', orderNumber: 'ORD/26004189', missing: ['ddt'] }),
      }),
    );
    expect(deps.broadcast).toHaveBeenCalledWith('U1', expect.objectContaining({ type: 'NOTIFICATION_NEW' }));
  });

  test('creates a "Fattura mancante" warning when only invoice is missing', async () => {
    const row = {
      id: 'ORD002', user_id: 'U1', order_number: 'ORD/26000412',
      customer_name: 'Gino Ambrosio', current_state: 'fatturato',
      missing_ddt: false, missing_invoice: true,
    };
    const pool = makePool([row]);
    const deps = makeDeps(pool);

    const count = await checkMissingOrderDocuments(pool, deps);

    expect(count).toBe(1);
    expect(deps.insertNotification).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        userId: 'U1',
        type: 'order_documents_missing',
        severity: 'warning',
        title: 'Fattura mancante',
        data: expect.objectContaining({ orderId: 'ORD002', missing: ['invoice'] }),
      }),
    );
  });

  test('creates a "DDT e fattura mancanti" warning when both are missing', async () => {
    const row = {
      id: 'ORD003', user_id: 'U2', order_number: 'ORD/26003001',
      customer_name: 'Studio Medico', current_state: 'fatturato',
      missing_ddt: true, missing_invoice: true,
    };
    const pool = makePool([row]);
    const deps = makeDeps(pool);

    const count = await checkMissingOrderDocuments(pool, deps);

    expect(count).toBe(1);
    expect(deps.insertNotification).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        title: 'DDT e fattura mancanti',
        data: expect.objectContaining({ missing: ['ddt', 'invoice'] }),
      }),
    );
  });

  test('creates one notification per anomalous order', async () => {
    const rows = [
      { id: 'ORD001', user_id: 'U1', order_number: 'ORD/26001001', customer_name: 'Cliente A', current_state: 'spedito', missing_ddt: true, missing_invoice: false },
      { id: 'ORD002', user_id: 'U1', order_number: 'ORD/26001002', customer_name: 'Cliente B', current_state: 'fatturato', missing_ddt: false, missing_invoice: true },
    ];
    const pool = makePool(rows);
    const deps = makeDeps(pool);

    const count = await checkMissingOrderDocuments(pool, deps);

    expect(count).toBe(2);
    expect(deps.insertNotification).toHaveBeenCalledTimes(2);
  });

  test('returns 0 and sends no notifications when no anomalous orders are found', async () => {
    const pool = makePool([]);
    const deps = makeDeps(pool);

    const count = await checkMissingOrderDocuments(pool, deps);

    expect(count).toBe(0);
    expect(deps.insertNotification).not.toHaveBeenCalled();
  });
});
```

Aggiorna anche l'import in cima al file:
```ts
import { checkCustomerInactivity, checkOverduePayments, checkBudgetMilestones, checkMissingOrderDocuments } from './notification-scheduler';
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose notification-scheduler.spec
```

Atteso: FAIL — `checkMissingOrderDocuments is not exported`

---

## Task 2: Implementa `checkMissingOrderDocuments`

**Files:**
- Modify: `archibald-web-app/backend/src/sync/notification-scheduler.ts`

- [ ] **Step 1: Aggiungi il tipo e la funzione prima di `createNotificationScheduler`**

```ts
type MissingDocumentsRow = {
  id: string;
  user_id: string;
  order_number: string;
  customer_name: string;
  current_state: string;
  missing_ddt: boolean;
  missing_invoice: boolean;
};

async function checkMissingOrderDocuments(pool: DbPool, deps: NotificationServiceDeps): Promise<number> {
  const { rows } = await pool.query<MissingDocumentsRow>(
    `SELECT
       o.id, o.user_id, o.order_number, o.customer_name, o.current_state,
       NOT EXISTS (
         SELECT 1 FROM agents.order_ddts d
         WHERE d.order_id = o.id AND d.user_id = o.user_id
       ) AS missing_ddt,
       NOT EXISTS (
         SELECT 1 FROM agents.order_invoices i
         WHERE i.order_id = o.id AND i.user_id = o.user_id
       ) AS missing_invoice
     FROM agents.order_records o
     WHERE o.creation_date::date >= '2026-01-01'
       AND o.order_number NOT LIKE 'NC/%'
       AND (o.total_amount IS NULL OR o.total_amount NOT LIKE '-%')
       AND (
         (o.current_state IN ('spedito','consegnato','parzialmente_consegnato','fatturato','pagamento_scaduto','pagato')
          AND NOT EXISTS (SELECT 1 FROM agents.order_ddts d WHERE d.order_id = o.id AND d.user_id = o.user_id))
         OR
         (o.current_state IN ('fatturato','pagamento_scaduto','pagato')
          AND NOT EXISTS (SELECT 1 FROM agents.order_invoices i WHERE i.order_id = o.id AND i.user_id = o.user_id))
       )
       AND NOT EXISTS (
         SELECT 1 FROM agents.notifications n
         WHERE n.user_id = o.user_id
           AND n.type = 'order_documents_missing'
           AND (n.data->>'orderId') = o.id
           AND n.created_at > NOW() - INTERVAL '14 days'
       )`,
  );

  for (const row of rows) {
    const missing: ('ddt' | 'invoice')[] = [];
    if (row.missing_ddt) missing.push('ddt');
    if (row.missing_invoice) missing.push('invoice');

    const title = missing.length === 2
      ? 'DDT e fattura mancanti'
      : missing[0] === 'ddt'
        ? 'Spedizione senza DDT'
        : 'Fattura mancante';

    const body = missing.length === 2
      ? `Ordine ${row.order_number} di ${row.customer_name} è in stato ${row.current_state} senza DDT né fattura collegati. Verifica con Verona.`
      : missing[0] === 'ddt'
        ? `Ordine ${row.order_number} di ${row.customer_name} è in stato ${row.current_state} ma non risulta nessun DDT collegato. Verifica con Verona se la spedizione è avvenuta.`
        : `Ordine ${row.order_number} di ${row.customer_name} è in stato ${row.current_state} ma non risulta nessuna fattura collegata. Segnala a Verona.`;

    await createNotification(deps, {
      target: 'user',
      userId: row.user_id,
      type: 'order_documents_missing',
      severity: 'warning',
      title,
      body,
      data: {
        orderId: row.id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        currentState: row.current_state,
        missing,
      },
    });
  }

  return rows.length;
}
```

- [ ] **Step 2: Aggiungi al blocco `setInterval` in `createNotificationScheduler`**

Individua il blocco `setInterval` e aggiungi la chiamata:
```ts
checkMissingOrderDocuments(pool, deps).catch((error) => {
  logger.error('Failed to check missing order documents', { error });
});
```

Il blocco completo diventa:
```ts
timers.push(
  setInterval(() => {
    checkCustomerInactivity(pool, deps).catch((error) => {
      logger.error('Failed to check customer inactivity', { error });
    });
    checkOverduePayments(pool, deps).catch((error) => {
      logger.error('Failed to check overdue payments', { error });
    });
    checkBudgetMilestones(pool, deps, markAchievedCondition as MarkAchievedFn).catch((error) => {
      logger.error('Failed to check budget milestones', { error });
    });
    checkMissingOrderDocuments(pool, deps).catch((error) => {
      logger.error('Failed to check missing order documents', { error });
    });
  }, DAILY_CHECK_MS),
);
```

- [ ] **Step 3: Aggiungi all'export in fondo al file**

```ts
export {
  createNotificationScheduler,
  checkCustomerInactivity,
  checkOverduePayments,
  checkBudgetMilestones,
  checkMissingOrderDocuments,
  DAILY_CHECK_MS,
};
```

- [ ] **Step 4: Verifica che i test passino**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose notification-scheduler.spec
```

Atteso: tutti i test PASS, inclusi i 5 nuovi `checkMissingOrderDocuments`.

- [ ] **Step 5: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: 0 errori TypeScript.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/sync/notification-scheduler.ts \
        archibald-web-app/backend/src/sync/notification-scheduler.spec.ts
git commit -m "feat(notifications): add order_documents_missing daily check"
```

---

## Task 3: Frontend — test e route `order_documents_missing`

**Files:**
- Modify: `archibald-web-app/frontend/src/services/notifications.service.spec.ts`
- Modify: `archibald-web-app/frontend/src/services/notifications.service.ts`

- [ ] **Step 1: Aggiungi 2 test in `notifications.service.spec.ts`**

Inserisci alla fine del `describe('getNotificationRoute', ...)` i due test:
```ts
  test('order_documents_missing con orderNumber → /orders?highlight=ORD/26004189', () => {
    expect(getNotificationRoute(makeNotif('order_documents_missing', { orderNumber: 'ORD/26004189' })))
      .toBe('/orders?highlight=ORD/26004189');
  });

  test('order_documents_missing senza orderNumber → /orders', () => {
    expect(getNotificationRoute(makeNotif('order_documents_missing'))).toBe('/orders');
  });
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose notifications.service.spec
```

Atteso: FAIL — i 2 nuovi test cadono sul `default` che torna `/notifications`.

- [ ] **Step 3: Aggiungi il case in `getNotificationRoute`**

In `archibald-web-app/frontend/src/services/notifications.service.ts`, aggiungi prima del `case 'budget_milestone'`:
```ts
    case 'order_documents_missing':
      return notification.data?.orderNumber
        ? `/orders?highlight=${String(notification.data.orderNumber)}`
        : '/orders';
```

- [ ] **Step 4: Verifica che i test passino**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose notifications.service.spec
```

Atteso: tutti i test PASS.

---

## Task 4: Frontend — tab `Documenti` in `NotificationsPage`

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/NotificationsPage.tsx`

- [ ] **Step 1: Aggiorna `CategoryTab` e `getCategory`**

Sostituisci:
```ts
type CategoryTab = 'all' | 'fedex' | 'sync' | 'delivered' | 'clients' | 'payments';

function getCategory(type: string): 'fedex' | 'sync' | 'delivered' | 'clients' | 'payments' | 'other' {
  if (type === 'fedex_exception') return 'fedex';
  if (type === 'fedex_delivered') return 'delivered';
  if (type === 'sync_anomaly' || type === 'product_missing_vat') return 'sync';
  if (type === 'customer_inactive') return 'clients';
  if (type === 'order_expiring') return 'payments';
  return 'other';
}
```

Con:
```ts
type CategoryTab = 'all' | 'fedex' | 'sync' | 'delivered' | 'clients' | 'payments' | 'documents';

function getCategory(type: string): 'fedex' | 'sync' | 'delivered' | 'clients' | 'payments' | 'documents' | 'other' {
  if (type === 'fedex_exception') return 'fedex';
  if (type === 'fedex_delivered') return 'delivered';
  if (type === 'sync_anomaly' || type === 'product_missing_vat') return 'sync';
  if (type === 'customer_inactive') return 'clients';
  if (type === 'order_expiring') return 'payments';
  if (type === 'order_documents_missing') return 'documents';
  return 'other';
}
```

- [ ] **Step 2: Aggiungi il case in `getTableMeta`**

Aggiungi prima del `default:`:
```ts
    case 'order_documents_missing': {
      const missing = data.missing as string[] | undefined;
      const tag = missing?.includes('ddt') && missing?.includes('invoice')
        ? '⚠️ DDT + Fattura'
        : missing?.includes('ddt')
          ? '📄 DDT mancante'
          : '🧾 Fattura mancante';
      return {
        tag, tagColor: '#f59e0b', tagBg: 'rgba(245,158,11,0.15)',
        ordine: orderNumber ?? '—',
        cliente: customerName ?? '—',
        dettaglio: n.body,
        codice: (data.currentState as string | undefined) ?? '',
      };
    }
```

- [ ] **Step 3: Aggiungi contatore unread e tab**

Dopo la riga `const paymentsUnread = ...` aggiungi:
```ts
  const documentsUnread = notifications.filter(n => getCategory(n.type) === 'documents' && !n.readAt).length;
```

Aggiungi alla fine dell'array `tabsConfig`:
```ts
    { key: 'documents', label: '📄 Documenti', count: documentsUnread, color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
```

- [ ] **Step 4: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: 0 errori.

- [ ] **Step 5: Commit finale**

```bash
git add archibald-web-app/frontend/src/services/notifications.service.ts \
        archibald-web-app/frontend/src/services/notifications.service.spec.ts \
        archibald-web-app/frontend/src/pages/NotificationsPage.tsx
git commit -m "feat(notifications): frontend tab Documenti per order_documents_missing"
```

---

## Task 5: Verifica finale

- [ ] **Step 1: Tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: tutti i test PASS (suite esistenti + 5 nuovi).

- [ ] **Step 2: Tutti i test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

Atteso: tutti i test PASS (suite esistenti + 2 nuovi).
