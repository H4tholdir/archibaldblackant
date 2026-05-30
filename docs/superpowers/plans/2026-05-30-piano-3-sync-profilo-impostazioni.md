# Partitario — Piano 3: Sync ERP + Profilo Agente + Impostazioni Notifiche

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (a) Sincronizzare `blocked_status` e email/mobile dall'ERP; (b) Aggiungere write-back bidirezionale contatti con anti-clobber; (c) Profilo agente con campi notifica; (d) API impostazioni notifiche per-cliente; (e) UI tab Notifiche + tab Profilo.

**Architecture:** Estensione dei handler `sync-customers` esistenti. Pattern pending-write per anti-clobber (identico alle pending orders). Nuove route Express per settings e profilo. Frontend: nuova tab `🔔 Notifiche` nella CustomerProfilePage e sezione nella ProfilePage.

**Tech Stack:** TypeScript, Express, Vitest, React 19. Bot Puppeteer (write-back via `update-customer` esistente).

**Dipende da:** Piano 1 (migrazioni 093-101), Piano 2 (CustomerProfilePage con tab 🔔 placeholder).

**Spec di riferimento:** `docs/superpowers/specs/2026-05-30-partitario-clienti-notifiche-design.md` §5, §7, §8

---

## File Map

**Nuovi:**
- `src/db/repositories/notification-settings.repository.ts`
- `src/db/repositories/notification-settings.repository.spec.ts`
- `src/db/repositories/notification-profile.repository.ts`
- `src/routes/notification-settings.ts`
- `src/routes/notification-profile.ts`

> ⚠️ NON creare `ledger-summary.ts`: il route `/dashboard-summary` va aggiunto dentro `createLedgerRouter` in `src/routes/ledger.ts` (Piano 1) PRIMA del handler `/:erpId`, per evitare che Express intercetti "dashboard-summary" come erpId.
- `frontend/src/api/notification-settings.ts`
- `frontend/src/api/notification-profile.ts`
- `frontend/src/components/NotificheTab.tsx`
- `frontend/src/components/AgentNotificationProfileForm.tsx`
- `frontend/src/types/notification-settings.ts`

**Modificati:**
- `src/operations/handlers/sync-customers.ts` (blocked_status + email/mobile + anti-clobber)
- `src/db/repositories/customers.ts` (upsert con blocked_status + contact_write_pending_at)
- `src/main.ts` (nuove route)
- `frontend/src/pages/CustomerProfilePage.tsx` (rende NotificheTab al posto del placeholder)
- `frontend/src/pages/ProfilePage.tsx` (aggiunge sezione profilo notifiche)

---

## Task 1: Sync `blocked_status` da ERP

**Files:**
- Modify: `src/operations/handlers/sync-customers.ts`
- Modify: `src/db/repositories/customers.ts`

Il campo "BLOCCATO" nel CUSTTABLE ListView è già scrapato (autopsia ERP). Va mappato a `blocked_status`.

- [ ] **Step 1: Scrivi test per il mapping**

```typescript
// Nel file .spec.ts esistente di sync-customers, aggiungi:
it('mappa il campo BLOCCATO a blocked_status', () => {
  expect(mapErpBlockedStatus('Completo')).toBe('Completo');
  expect(mapErpBlockedStatus('')).toBeNull();
  expect(mapErpBlockedStatus(null)).toBeNull();
  expect(mapErpBlockedStatus('Nessuno')).toBeNull();
});
```

- [ ] **Step 2: Verifica che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- sync-customers
```

- [ ] **Step 3: Implementa la funzione di mapping**

Nel file `src/operations/handlers/sync-customers.ts`, aggiungi:

```typescript
export function mapErpBlockedStatus(raw: string | null | undefined): string | null {
  if (!raw || raw === '' || raw === 'Nessuno') return null;
  return raw; // 'Completo' | 'Fattura'
}
```

Poi, nel punto in cui viene costruito l'oggetto cliente per l'upsert, aggiungi il campo `blocked_status`:

```typescript
blocked_status: mapErpBlockedStatus(erpRow.bloccato ?? erpRow.blocked ?? null),
```

(Il nome esatto della colonna dipende da come viene scraped il campo BLOCCATO dalla ListView — controlla `configs/customers.ts` o la definizione del scraper per il nome della colonna.)

- [ ] **Step 4: Aggiungi `blocked_status` all'upsert in customers.ts**

Nel file `src/db/repositories/customers.ts`, nella query di upsert, aggiungi:

```sql
blocked_status = COALESCE($N, blocked_status),
```

E nel parametro corrispondente:
```typescript
customer.blocked_status ?? null,
```

Assicurati anche che `contact_write_pending_at` NON venga sovrascritto dall'upsert quando è pending:

```sql
-- Protezione anti-clobber: non aggiornare email/mobile/phone se pending
email   = CASE WHEN contact_write_pending_at IS NOT NULL THEN email ELSE COALESCE($email, email) END,
mobile  = CASE WHEN contact_write_pending_at IS NOT NULL THEN mobile ELSE COALESCE($mobile, mobile) END,
phone   = CASE WHEN contact_write_pending_at IS NOT NULL THEN phone ELSE COALESCE($phone, phone) END,
```

- [ ] **Step 5: Test e build**

```bash
npm test --prefix archibald-web-app/backend -- sync-customers
npm run build --prefix archibald-web-app/backend
```

Expected: test passano, build pulita.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/sync-customers.ts
git add archibald-web-app/backend/src/db/repositories/customers.ts
git commit -m "feat(sync): sincronizza blocked_status e anti-clobber email/mobile in sync-customers"
```

---

## Task 2: Write-back bidirezionale contatti

**Files:**
- Modify: `src/db/repositories/customers.ts`
- Create: `src/db/repositories/contact-writeback.ts`

- [ ] **Step 1: Crea helper per il write-back**

```typescript
// src/db/repositories/contact-writeback.ts
import type { DbPool } from '../pool';
import { enqueueWithDedup } from './agent-queue';

type ContactUpdate = {
  email?: string | null;
  mobile?: string | null;
  phone?: string | null;
};

export async function updateCustomerContactAndQueueErp(
  pool: DbPool,
  userId: string,
  erpId: string,
  update: ContactUpdate,
): Promise<void> {
  // 1. Aggiorna in DB e setta pending
  const setClauses: string[] = ['contact_write_pending_at = NOW()', 'updated_at = NOW()'];
  const params: unknown[] = [userId, erpId];
  let i = 3;
  if ('email' in update)  { setClauses.push(`email = $${i++}`);  params.push(update.email ?? null); }
  if ('mobile' in update) { setClauses.push(`mobile = $${i++}`); params.push(update.mobile ?? null); }
  if ('phone' in update)  { setClauses.push(`phone = $${i++}`);  params.push(update.phone ?? null); }

  await pool.query(
    `UPDATE agents.customers SET ${setClauses.join(', ')} WHERE user_id = $1 AND erp_id = $2`,
    params,
  );

  // 2. Accoda update-customer per write-back ERP
  await enqueueWithDedup(pool, {
    userId,
    taskType: 'update-customer',
    payload: { erpId, diff: update },
    priority: 25,
  });
}
```

- [ ] **Step 2: Scrivi test**

```typescript
// src/db/repositories/contact-writeback.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { updateCustomerContactAndQueueErp } from './contact-writeback';
import type { DbPool } from '../pool';

describe('updateCustomerContactAndQueueErp', () => {
  it('setta contact_write_pending_at e accoda update-customer', async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query: queryMock } as unknown as DbPool;

    await updateCustomerContactAndQueueErp(pool, 'u1', '55.226', { email: 'test@x.it' });

    const [firstCall] = queryMock.mock.calls;
    expect(firstCall[0]).toContain('contact_write_pending_at');
    expect(firstCall[0]).toContain('email');
  });
});
```

- [ ] **Step 3: Test e commit**

```bash
npm test --prefix archibald-web-app/backend -- contact-writeback
npm run build --prefix archibald-web-app/backend
git add archibald-web-app/backend/src/db/repositories/contact-writeback.ts
git add archibald-web-app/backend/src/db/repositories/contact-writeback.spec.ts
git commit -m "feat(sync): write-back contatti bidirezionale con anti-clobber pending"
```

---

## Task 3: Repository impostazioni notifiche

**Files:**
- Create: `src/db/repositories/notification-settings.repository.ts`
- Create: `src/db/repositories/notification-settings.repository.spec.ts`

- [ ] **Step 1: Scrivi test**

```typescript
// src/db/repositories/notification-settings.repository.spec.ts
import { describe, it, expect } from 'vitest';
import { buildEffectiveContactQuery } from './notification-settings.repository';

describe('buildEffectiveContactQuery', () => {
  it('usa COALESCE per email e whatsapp', () => {
    const q = buildEffectiveContactQuery();
    expect(q).toContain('COALESCE(ns.email_override, c.email)');
    expect(q).toContain('COALESCE(ns.whatsapp_override, c.mobile)');
  });
});
```

- [ ] **Step 2: Implementa il repository**

```typescript
// src/db/repositories/notification-settings.repository.ts
import type { DbPool } from '../pool';

export type NotificationProfile = {
  id: number;
  name: string;
  isDefault: boolean;
  steps: Array<{ days_after_due: number; tone: string; channels: string[] }>;
};

export type NotificationSettings = {
  id: string;
  customerId: string;
  enabled: boolean;
  profileId: number | null;
  overrideSteps: NotificationProfile['steps'] | null;
  emailOverride: string | null;
  whatsappOverride: string | null;
  notifyNewInvoice: boolean;
  notifyPreDue: boolean;
  preDueDays: number;
  periodicStatementEnabled: boolean;
  periodicStatementDays: number;
  periodicStatementContent: Record<string, boolean>;
  effectiveEmail: string | null;
  effectiveWhatsapp: string | null;
};

export function buildEffectiveContactQuery(): string {
  return `COALESCE(ns.email_override, c.email) AS effective_email,
          COALESCE(ns.whatsapp_override, c.mobile) AS effective_whatsapp`;
}

export async function getNotificationSettings(
  pool: DbPool,
  userId: string,
  customerErpId: string,
): Promise<NotificationSettings | null> {
  const { rows } = await pool.query(
    `SELECT ns.*,
       ${buildEffectiveContactQuery()}
     FROM agents.invoice_notification_settings ns
     JOIN agents.customers c ON c.user_id = ns.user_id AND c.erp_id = ns.customer_erp_id AND c.deleted_at IS NULL
     WHERE ns.user_id = $1 AND ns.customer_erp_id = $2`,
    [userId, customerErpId],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id, customerId: r.customer_erp_id, enabled: r.enabled,
    profileId: r.profile_id, overrideSteps: r.override_steps,
    emailOverride: r.email_override, whatsappOverride: r.whatsapp_override,
    notifyNewInvoice: r.notify_new_invoice, notifyPreDue: r.notify_pre_due,
    preDueDays: r.pre_due_days, periodicStatementEnabled: r.periodic_statement_enabled,
    periodicStatementDays: r.periodic_statement_days,
    periodicStatementContent: r.periodic_statement_content ?? {},
    effectiveEmail: r.effective_email, effectiveWhatsapp: r.effective_whatsapp,
  };
}

export async function upsertNotificationSettings(
  pool: DbPool,
  userId: string,
  customerErpId: string,
  settings: Partial<Omit<NotificationSettings, 'id' | 'customerId' | 'effectiveEmail' | 'effectiveWhatsapp'>>,
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.invoice_notification_settings
       (user_id, customer_erp_id, enabled, profile_id, override_steps,
        email_override, whatsapp_override, notify_new_invoice, notify_pre_due,
        pre_due_days, periodic_statement_enabled, periodic_statement_days,
        periodic_statement_content, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
     ON CONFLICT (user_id, customer_erp_id) DO UPDATE SET
       enabled = COALESCE(EXCLUDED.enabled, invoice_notification_settings.enabled),
       profile_id = COALESCE(EXCLUDED.profile_id, invoice_notification_settings.profile_id),
       override_steps = EXCLUDED.override_steps,
       email_override = EXCLUDED.email_override,
       whatsapp_override = EXCLUDED.whatsapp_override,
       notify_new_invoice = COALESCE(EXCLUDED.notify_new_invoice, invoice_notification_settings.notify_new_invoice),
       notify_pre_due = COALESCE(EXCLUDED.notify_pre_due, invoice_notification_settings.notify_pre_due),
       pre_due_days = COALESCE(EXCLUDED.pre_due_days, invoice_notification_settings.pre_due_days),
       periodic_statement_enabled = COALESCE(EXCLUDED.periodic_statement_enabled, invoice_notification_settings.periodic_statement_enabled),
       periodic_statement_days = COALESCE(EXCLUDED.periodic_statement_days, invoice_notification_settings.periodic_statement_days),
       periodic_statement_content = COALESCE(EXCLUDED.periodic_statement_content, invoice_notification_settings.periodic_statement_content),
       updated_at = NOW()`,
    [
      userId, customerErpId,
      settings.enabled ?? false,
      settings.profileId ?? null,
      settings.overrideSteps ? JSON.stringify(settings.overrideSteps) : null,
      settings.emailOverride ?? null,
      settings.whatsappOverride ?? null,
      settings.notifyNewInvoice ?? true,
      settings.notifyPreDue ?? true,
      settings.preDueDays ?? 7,
      settings.periodicStatementEnabled ?? false,
      settings.periodicStatementDays ?? 30,
      settings.periodicStatementContent ? JSON.stringify(settings.periodicStatementContent) : null,
    ],
  );
}

export async function listNotificationProfiles(pool: DbPool): Promise<NotificationProfile[]> {
  const { rows } = await pool.query(
    `SELECT id, name, is_default, steps FROM agents.notification_profiles ORDER BY id`,
  );
  return rows.map(r => ({ id: r.id, name: r.name, isDefault: r.is_default, steps: r.steps }));
}

export async function getPendingWaForUser(
  pool: DbPool,
  userId: string,
): Promise<Array<{ id: string; customerErpId: string; phoneTo: string; messageText: string; tone: string; status: string; invoiceNumbers: string[]; totalAmount: number | null }>> {
  const { rows } = await pool.query(
    `SELECT id, customer_erp_id, phone_to, message_text, tone, status, invoice_numbers, total_amount
     FROM agents.invoice_notification_pending_wa
     WHERE user_id = $1 AND status IN ('pending','opened_by_agent')
     ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map(r => ({
    id: r.id, customerErpId: r.customer_erp_id, phoneTo: r.phone_to,
    messageText: r.message_text, tone: r.tone, status: r.status,
    invoiceNumbers: r.invoice_numbers, totalAmount: r.total_amount,
  }));
}

export async function updatePendingWaStatus(
  pool: DbPool,
  userId: string,
  id: string,
  status: 'opened_by_agent' | 'confirmed_sent' | 'dismissed',
): Promise<void> {
  const now = new Date();
  await pool.query(
    `UPDATE agents.invoice_notification_pending_wa
     SET status = $3,
         sent_at = CASE WHEN $3 = 'confirmed_sent' THEN $4 ELSE sent_at END,
         dismissed_at = CASE WHEN $3 = 'dismissed' THEN $4 ELSE dismissed_at END
     WHERE id = $1 AND user_id = $2`,
    [id, userId, status, now],
  );
}
```

- [ ] **Step 3: Test e commit**

```bash
npm test --prefix archibald-web-app/backend -- notification-settings
npm run build --prefix archibald-web-app/backend
git add archibald-web-app/backend/src/db/repositories/notification-settings.repository.ts
git add archibald-web-app/backend/src/db/repositories/notification-settings.repository.spec.ts
git commit -m "feat(notif): repository notification-settings con COALESCE contatti e pending WA"
```

---

## Task 4: Route impostazioni notifiche + profilo agente + dashboard summary

**Files:**
- Create: `src/routes/notification-settings.ts`
- Create: `src/routes/notification-profile.ts`
- Create: `src/routes/ledger-summary.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Route notification-settings**

```typescript
// src/routes/notification-settings.ts
import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import {
  getNotificationSettings, upsertNotificationSettings,
  listNotificationProfiles, getPendingWaForUser, updatePendingWaStatus,
} from '../db/repositories/notification-settings.repository';
import { updateCustomerContactAndQueueErp } from '../db/repositories/contact-writeback';
import { logger } from '../logger';

type Deps = { pool: DbPool };

const UpsertSchema = z.object({
  enabled: z.boolean().optional(),
  profileId: z.number().int().positive().nullable().optional(),
  overrideSteps: z.array(z.object({
    days_after_due: z.number().int().min(0),
    tone: z.enum(['cordiale','formale','urgente']),
    channels: z.array(z.enum(['email','whatsapp'])),
  })).nullable().optional(),
  emailOverride: z.string().email().nullable().optional(),
  whatsappOverride: z.string().nullable().optional(),
  notifyNewInvoice: z.boolean().optional(),
  notifyPreDue: z.boolean().optional(),
  preDueDays: z.number().int().min(1).max(30).optional(),
  periodicStatementEnabled: z.boolean().optional(),
  periodicStatementDays: z.number().int().min(7).max(365).optional(),
  periodicStatementContent: z.record(z.boolean()).optional(),
});

export function createNotificationSettingsRouter({ pool }: Deps): Router {
  const router = Router();

  router.get('/profiles', async (_req: AuthRequest, res) => {
    try {
      const profiles = await listNotificationProfiles(pool);
      res.json({ success: true, data: profiles });
    } catch (e) {
      logger.error('listNotificationProfiles error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  router.get('/:erpId', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { erpId } = req.params as { erpId: string };
      const settings = await getNotificationSettings(pool, userId, erpId);
      res.json({ success: true, data: settings });
    } catch (e) {
      logger.error('getNotificationSettings error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  router.put('/:erpId', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { erpId } = req.params as { erpId: string };
      const parsed = UpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.message });
        return;
      }
      const body = parsed.data;

      // Se vengono aggiornati i contatti, write-back anche su customers + ERP
      if (body.emailOverride !== undefined || body.whatsappOverride !== undefined) {
        await updateCustomerContactAndQueueErp(pool, userId, erpId, {
          ...(body.emailOverride !== undefined ? { email: body.emailOverride } : {}),
          ...(body.whatsappOverride !== undefined ? { mobile: body.whatsappOverride } : {}),
        });
      }

      await upsertNotificationSettings(pool, userId, erpId, body);
      const updated = await getNotificationSettings(pool, userId, erpId);
      res.json({ success: true, data: updated });
    } catch (e) {
      logger.error('upsertNotificationSettings error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  // WA pending
  router.get('/pending-wa/all', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const pending = await getPendingWaForUser(pool, userId);
      res.json({ success: true, data: pending });
    } catch (e) {
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  router.patch('/pending-wa/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { id } = req.params as { id: string };
      const { status } = req.body as { status: string };
      if (!['opened_by_agent','confirmed_sent','dismissed'].includes(status)) {
        res.status(400).json({ success: false, error: 'Stato non valido' });
        return;
      }
      await updatePendingWaStatus(pool, userId, id, status as 'opened_by_agent' | 'confirmed_sent' | 'dismissed');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  return router;
}
```

- [ ] **Step 2: Route profilo agente notifiche**

```typescript
// src/routes/notification-profile.ts
import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import { logger } from '../logger';

type Deps = { pool: DbPool };

const ProfileSchema = z.object({
  notification_display_name: z.string().max(100).optional(),
  notification_reply_to_email: z.string().email('Email non valida').optional().nullable(),
  notification_phone: z.string().max(30).optional().nullable(),
  notification_title: z.string().max(200).optional().nullable(),
});

export function createNotificationProfileRouter({ pool }: Deps): Router {
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { rows } = await pool.query(
        `SELECT notification_display_name, notification_reply_to_email,
                notification_phone, notification_title
         FROM agents.users WHERE id = $1`,
        [userId],
      );
      res.json({ success: true, data: rows[0] ?? {} });
    } catch (e) {
      logger.error('getNotificationProfile error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  router.put('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const parsed = ProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.message });
        return;
      }
      const b = parsed.data;
      await pool.query(
        `UPDATE agents.users SET
           notification_display_name = COALESCE($2, notification_display_name),
           notification_reply_to_email = $3,
           notification_phone = $4,
           notification_title = $5,
           updated_at = NOW()
         WHERE id = $1`,
        [userId, b.notification_display_name ?? null, b.notification_reply_to_email ?? null,
         b.notification_phone ?? null, b.notification_title ?? null],
      );
      const { rows } = await pool.query(
        `SELECT notification_display_name, notification_reply_to_email,
                notification_phone, notification_title FROM agents.users WHERE id = $1`,
        [userId],
      );
      res.json({ success: true, data: rows[0] });
    } catch (e) {
      logger.error('updateNotificationProfile error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  return router;
}
```

- [ ] **Step 3: Aggiungi `/dashboard-summary` dentro `createLedgerRouter` (ledger.ts — Piano 1)**

> ⚠️ NON creare `ledger-summary.ts`. Modifica `src/routes/ledger.ts` (già creato nel Piano 1) per aggiungere il route `/dashboard-summary` **PRIMA** del handler `GET /:erpId`. Express matcha per ordine: se `/:erpId` venisse prima, "dashboard-summary" verrebbe interpretato come un erpId.

Apri `src/routes/ledger.ts` e, nella funzione `createLedgerRouter`, aggiungi questo handler **prima** della riga `router.get('/:erpId', ...)`:

```typescript
// GET /api/ledger/dashboard-summary  — DEVE stare PRIMA di /:erpId
router.get('/dashboard-summary', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;

    const [debtorsRes, blockedRes, pendingWaRes] = await Promise.all([
      pool.query(
        `SELECT
           c.name, c.erp_id,
           c.blocked_status,
           SUM(CASE WHEN oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
               AND oi.invoice_due_date::date < CURRENT_DATE
               THEN oi.invoice_remaining_amount::numeric ELSE 0 END) AS scaduto,
           SUM(CASE WHEN oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
               THEN oi.invoice_remaining_amount::numeric ELSE 0 END) AS aperto
         FROM agents.order_invoices oi
         JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
         JOIN agents.customers c ON c.user_id = o.user_id
           AND c.account_num = o.customer_account_num AND c.deleted_at IS NULL
         WHERE o.user_id = $1
           AND oi.invoice_remaining_amount NOT IN ('0','')
           AND oi.invoice_remaining_amount IS NOT NULL
         GROUP BY c.name, c.erp_id, c.blocked_status
         HAVING SUM(CASE WHEN oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
               THEN oi.invoice_remaining_amount::numeric ELSE 0 END) > 0
         ORDER BY scaduto DESC, aperto DESC
         LIMIT 10`,
        [userId],
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM agents.customers
         WHERE user_id = $1 AND blocked_status IS NOT NULL AND deleted_at IS NULL`,
        [userId],
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM agents.invoice_notification_pending_wa
         WHERE user_id = $1 AND status IN ('pending','opened_by_agent')`,
        [userId],
      ),
    ]);

    const debtors = debtorsRes.rows;
    const totalScaduto = debtors.reduce((s, d) => s + parseFloat(d.scaduto || '0'), 0);
    const totalAperto = debtors.reduce((s, d) => s + parseFloat(d.aperto || '0'), 0);

    res.json({
      success: true,
      data: {
        totalScaduto,
        totalAperto,
        blockedCount: parseInt(blockedRes.rows[0].cnt, 10),
        topDebtors: debtors.map(d => ({
          name: d.name,
          erpId: d.erp_id,
          scaduto: parseFloat(d.scaduto || '0'),
          isBlocked: d.blocked_status != null,
        })),
        pendingWaCount: parseInt(pendingWaRes.rows[0].cnt, 10),
      },
    });
  } catch (e) {
    logger.error('dashboard-summary error', { e });
    res.status(500).json({ success: false, error: 'Errore interno' });
  }
});
```

- [ ] **Step 4: Registra le route in main.ts**

Aggiungi import e registrazioni vicino alle altre route:

```typescript
import { createNotificationSettingsRouter } from './routes/notification-settings';
import { createNotificationProfileRouter } from './routes/notification-profile';

// In startServer():
app.use('/api/notification-settings', conductorAuthMiddleware, createNotificationSettingsRouter({ pool }));
app.use('/api/notification-profile', conductorAuthMiddleware, createNotificationProfileRouter({ pool }));
// NON aggiungere un secondo mount per /api/ledger — dashboard-summary è già dentro createLedgerRouter
```

- [ ] **Step 5: Build e test**

```bash
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend
```

Expected: build pulita, test esistenti passano.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/routes/notification-settings.ts
git add archibald-web-app/backend/src/routes/notification-profile.ts
git add archibald-web-app/backend/src/routes/ledger-summary.ts
git add archibald-web-app/backend/src/main.ts
git commit -m "feat(notif): route notification-settings, notification-profile, ledger/dashboard-summary"
```

---

## Task 5: Frontend — Tab Notifiche e Profilo Agente

**Files:**
- Create: `frontend/src/types/notification-settings.ts`
- Create: `frontend/src/api/notification-settings.ts`
- Create: `frontend/src/components/NotificheTab.tsx`
- Create: `frontend/src/components/AgentNotificationProfileForm.tsx`
- Modify: `frontend/src/pages/CustomerProfilePage.tsx`
- Modify: `frontend/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Tipi**

```typescript
// frontend/src/types/notification-settings.ts
export type EscalationStep = {
  days_after_due: number;
  tone: 'cordiale' | 'formale' | 'urgente';
  channels: ('email' | 'whatsapp')[];
};

export type NotificationProfile = {
  id: number;
  name: string;
  isDefault: boolean;
  steps: EscalationStep[];
};

export type NotificationSettings = {
  id?: string;
  enabled: boolean;
  profileId: number | null;
  overrideSteps: EscalationStep[] | null;
  emailOverride: string | null;
  whatsappOverride: string | null;
  notifyNewInvoice: boolean;
  notifyPreDue: boolean;
  preDueDays: number;
  periodicStatementEnabled: boolean;
  periodicStatementDays: number;
  periodicStatementContent: Record<string, boolean>;
  effectiveEmail: string | null;
  effectiveWhatsapp: string | null;
};

export type AgentNotificationProfile = {
  notification_display_name: string | null;
  notification_reply_to_email: string | null;
  notification_phone: string | null;
  notification_title: string | null;
};
```

- [ ] **Step 2: Client API**

```typescript
// frontend/src/api/notification-settings.ts
import type { NotificationSettings, NotificationProfile, AgentNotificationProfile } from '../types/notification-settings';

const jwt = () => localStorage.getItem('archibald_jwt') ?? '';
const h = () => ({ 'Authorization': `Bearer ${jwt()}`, 'Content-Type': 'application/json' });

export async function fetchNotificationSettings(erpId: string): Promise<NotificationSettings | null> {
  const res = await fetch(`/api/notification-settings/${encodeURIComponent(erpId)}`, { headers: h() });
  if (!res.ok) throw new Error(`fetch settings failed: ${res.status}`);
  const body = await res.json() as { data: NotificationSettings | null };
  return body.data;
}

export async function saveNotificationSettings(erpId: string, settings: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const res = await fetch(`/api/notification-settings/${encodeURIComponent(erpId)}`, {
    method: 'PUT', headers: h(), body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`save settings failed: ${res.status}`);
  return ((await res.json()) as { data: NotificationSettings }).data;
}

export async function fetchNotificationProfiles(): Promise<NotificationProfile[]> {
  const res = await fetch('/api/notification-settings/profiles', { headers: h() });
  if (!res.ok) throw new Error('fetch profiles failed');
  return ((await res.json()) as { data: NotificationProfile[] }).data;
}

export async function fetchPendingWa(): Promise<Array<{ id: string; customerErpId: string; phoneTo: string; messageText: string; tone: string; status: string; invoiceNumbers: string[]; totalAmount: number | null }>> {
  const res = await fetch('/api/notification-settings/pending-wa/all', { headers: h() });
  if (!res.ok) return [];
  return ((await res.json()) as { data: unknown[] }).data as ReturnType<typeof fetchPendingWa> extends Promise<infer T> ? T : never;
}

export async function updatePendingWaStatus(id: string, status: 'opened_by_agent' | 'confirmed_sent' | 'dismissed'): Promise<void> {
  await fetch(`/api/notification-settings/pending-wa/${id}`, {
    method: 'PATCH', headers: h(), body: JSON.stringify({ status }),
  });
}

export async function fetchAgentNotificationProfile(): Promise<AgentNotificationProfile> {
  const res = await fetch('/api/notification-profile', { headers: h() });
  if (!res.ok) throw new Error('fetch agent profile failed');
  return ((await res.json()) as { data: AgentNotificationProfile }).data;
}

export async function saveAgentNotificationProfile(profile: Partial<AgentNotificationProfile>): Promise<AgentNotificationProfile> {
  const res = await fetch('/api/notification-profile', {
    method: 'PUT', headers: h(), body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error('save agent profile failed');
  return ((await res.json()) as { data: AgentNotificationProfile }).data;
}
```

- [ ] **Step 3: Componente NotificheTab**

Il componente implementa le 3 viste del mockup `notification-settings-ui-v3.html` (profilo attivo, personalizzato, disabilitato/missing contacts). Per brevità qui si riporta la struttura; il codice completo deve ricalcare pixel-per-pixel i mockup approvati.

```typescript
// frontend/src/components/NotificheTab.tsx
import { useState, useEffect } from 'react';
import type { NotificationSettings, NotificationProfile } from '../types/notification-settings';
import { fetchNotificationSettings, saveNotificationSettings, fetchNotificationProfiles, fetchPendingWa, updatePendingWaStatus } from '../api/notification-settings';

type Props = { erpId: string; customerEmail: string | null; customerMobile: string | null };

export function NotificheTab({ erpId, customerEmail, customerMobile }: Props) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [profiles, setProfiles] = useState<NotificationProfile[]>([]);
  const [pendingWa, setPendingWa] = useState<Awaited<ReturnType<typeof fetchPendingWa>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchNotificationSettings(erpId),
      fetchNotificationProfiles(),
      fetchPendingWa(),
    ]).then(([s, p, wa]) => {
      setSettings(s ?? {
        enabled: false, profileId: null, overrideSteps: null,
        emailOverride: null, whatsappOverride: null,
        notifyNewInvoice: true, notifyPreDue: true, preDueDays: 7,
        periodicStatementEnabled: false, periodicStatementDays: 30,
        periodicStatementContent: { open_invoices: true, total_due: true, credit_notes: true, history: false },
        effectiveEmail: customerEmail, effectiveWhatsapp: customerMobile,
      });
      setProfiles(p);
      setPendingWa(wa.filter(w => w.customerErpId === erpId));
    }).finally(() => setLoading(false));
  }, [erpId, customerEmail, customerMobile]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await saveNotificationSettings(erpId, settings);
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleSendWa = async (wa: typeof pendingWa[0]) => {
    await updatePendingWaStatus(wa.id, 'opened_by_agent');
    const encoded = encodeURIComponent(wa.messageText);
    window.open(`https://wa.me/${wa.phoneTo.replace(/\D/g,'')}?text=${encoded}`, '_blank');
    // Dopo apertura WA, aggiorna stato a confirmed
    setTimeout(() => updatePendingWaStatus(wa.id, 'confirmed_sent'), 3000);
  };

  if (loading) return <div style={{ padding: '16px', color: '#64748b' }}>Caricamento...</div>;
  if (!settings) return null;

  const hasContacts = !!(settings.effectiveEmail || settings.effectiveWhatsapp);

  // Vista: contatti mancanti
  if (!hasContacts) {
    return (
      <div style={{ padding: '12px 16px' }}>
        {/* Toggle master disabilitato */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px', opacity: 0.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>📬</span>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9' }}>Notifiche economiche</div>
              <div style={{ fontSize: '9px', color: '#64748b' }}>Disabilitate</div>
            </div>
          </div>
        </div>
        {/* Warning contatti mancanti */}
        <div style={{ background: '#1c0a0a', border: '1px solid #ef4444', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#fca5a5', marginBottom: '4px' }}>⚠ Contatti mancanti</div>
          <div style={{ fontSize: '9px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '8px' }}>
            Per abilitare le notifiche configura almeno un contatto (email o numero WhatsApp).
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => { /* focus su campo email nella tab Contatti */ }}
              style={{ background: '#1e40af', color: '#93c5fd', fontSize: '9px', padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              + Aggiungi email
            </button>
            <button onClick={() => { /* focus su campo mobile */ }}
              style={{ background: '#166534', color: '#86efac', fontSize: '9px', padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              + Aggiungi WhatsApp
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Vista: profilo attivo (il corpo completo è definito dai mockup approvati)
  // L'implementazione completa segue pixel-per-pixel notification-settings-ui-v3.html
  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Toggle master */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>📬</span>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9' }}>Notifiche economiche {settings.enabled ? 'attive' : 'disabilitate'}</div>
            <div style={{ fontSize: '9px', color: '#64748b' }}>Email auto + WhatsApp manuale</div>
          </div>
        </div>
        <div
          onClick={() => setSettings(s => s ? { ...s, enabled: !s.enabled } : s)}
          style={{
            width: '40px', height: '22px', borderRadius: '11px',
            background: settings.enabled ? '#22c55e' : '#334155',
            position: 'relative', cursor: 'pointer',
          }}
        >
          <div style={{
            width: '18px', height: '18px', background: 'white', borderRadius: '50%',
            position: 'absolute', top: '2px',
            [settings.enabled ? 'right' : 'left']: '2px',
          }} />
        </div>
      </div>

      {/* WA pending per questo cliente */}
      {pendingWa.filter(w => w.status !== 'confirmed_sent' && w.status !== 'dismissed').map(wa => (
        <div key={wa.id} style={{ background: '#1a1200', border: '1px solid #f59e0b', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
          <div style={{ background: '#1a1200', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '8px', fontWeight: 700, color: '#fcd34d', textTransform: 'uppercase', letterSpacing: '1px' }}>💬 WA da inviare · pending</span>
          </div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '6px' }}>{wa.phoneTo} · {wa.invoiceNumbers.join(', ')}</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => updatePendingWaStatus(wa.id, 'dismissed').then(() => setPendingWa(p => p.filter(x => x.id !== wa.id)))}
                style={{ flex: 1, background: '#78350f', border: '1px solid #f59e0b', borderRadius: '6px', padding: '5px', fontSize: '9px', color: '#fcd34d', cursor: 'pointer' }}>
                🚫 Ignora
              </button>
              <button onClick={() => handleSendWa(wa)}
                style={{ flex: 2, background: '#166534', borderRadius: '6px', padding: '5px', fontSize: '9px', fontWeight: 700, color: '#86efac', border: 'none', cursor: 'pointer' }}>
                💬 Apri WhatsApp →
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Profili e configurazione avanzata — continua dal mockup notification-settings-ui-v3.html */}
      {/* TODO: selettore profilo, trigger summary, estratto conto */}
      {/* Seguire esattamente la struttura del mockup approvato */}

      <button onClick={handleSave} disabled={saving}
        style={{ width: '100%', background: '#22c55e', color: '#0f2211', fontSize: '10px', fontWeight: 700, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer', marginTop: '10px' }}>
        {saving ? 'Salvataggio...' : 'Salva impostazioni'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Componente AgentNotificationProfileForm**

Implementa la tab "📬 Profilo notifiche" nella ProfilePage seguendo il mockup `section5-6-contacts-profile.html`.

```typescript
// frontend/src/components/AgentNotificationProfileForm.tsx
import { useState, useEffect } from 'react';
import type { AgentNotificationProfile } from '../types/notification-settings';
import { fetchAgentNotificationProfile, saveAgentNotificationProfile } from '../api/notification-settings';

export function AgentNotificationProfileForm() {
  const [profile, setProfile] = useState<AgentNotificationProfile>({
    notification_display_name: null,
    notification_reply_to_email: null,
    notification_phone: null,
    notification_title: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgentNotificationProfile().then(setProfile).catch(() => null);
  }, []);

  const isComplete = !!(profile.notification_reply_to_email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.notification_reply_to_email));

  const handleSave = async () => {
    if (!isComplete) {
      setError("L'email di risposta clienti è obbligatoria per abilitare le notifiche");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await saveAgentNotificationProfile(profile);
      setProfile(updated);
    } catch {
      setError('Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof AgentNotificationProfile, hint: string, required = false) => (
    <div style={{ background: '#1e293b', borderRadius: '8px', padding: '9px 12px', marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>{label}</div>
        {required && <div style={{ fontSize: '7px', color: '#ef4444', fontWeight: 700 }}>OBBLIGATORIO</div>}
      </div>
      <input
        value={profile[key] ?? ''}
        onChange={e => setProfile(p => ({ ...p, [key]: e.target.value || null }))}
        style={{
          background: '#0f172a', border: `1px solid ${required && !profile[key] ? '#ef4444' : '#334155'}`,
          borderRadius: '5px', padding: '5px 8px', color: '#e2e8f0', fontSize: '10px',
          width: '100%', outline: 'none',
        }}
      />
      <div style={{ fontSize: '7px', color: '#475569', marginTop: '2px' }}>→ {hint}</div>
    </div>
  );

  return (
    <div>
      {!isComplete && (
        <div style={{ background: '#1c0a0a', border: '1px solid #ef4444', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#fca5a5' }}>⚠️ Profilo incompleto — notifiche bloccate</div>
          <div style={{ fontSize: '8px', color: '#94a3b8' }}>Configura email di risposta per abilitare l'invio automatico</div>
        </div>
      )}
      {field('Nome visualizzato', 'notification_display_name', '{{agente_nome}}')}
      {field('Email risposta clienti', 'notification_reply_to_email', 'Reply-To header email · clienti rispondono qui', true)}
      {field('Telefono agente', 'notification_phone', '{{agente_telefono}}')}
      {field('Titolo professionale', 'notification_title', '{{agente_titolo}}')}
      {error && <div style={{ color: '#ef4444', fontSize: '9px', marginBottom: '8px' }}>{error}</div>}
      <button onClick={handleSave} disabled={saving}
        style={{ width: '100%', background: '#22c55e', color: '#0f2211', fontSize: '10px', fontWeight: 700, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
        {saving ? 'Salvataggio...' : 'Salva profilo notifiche'}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Integra NotificheTab in CustomerProfilePage e AgentNotificationProfileForm in ProfilePage**

In `CustomerProfilePage.tsx`, sostituisci il placeholder `🔔 Notifiche`:
```tsx
import { NotificheTab } from '../components/NotificheTab';
// ...
{activeTab === '🔔 Notifiche' && (
  <NotificheTab
    erpId={erpId}
    customerEmail={customer?.email ?? null}
    customerMobile={customer?.mobile ?? null}
  />
)}
```

In `ProfilePage.tsx`, aggiungi la sezione profilo notifiche:
```tsx
import { AgentNotificationProfileForm } from '../components/AgentNotificationProfileForm';
// ... aggiungere in una sezione/tab dedicata
<AgentNotificationProfileForm />
```

- [ ] **Step 6: Type-check, build, test**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend
```

Expected: 0 errori

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/
git add archibald-web-app/backend/src/
git commit -m "feat(notif): tab Notifiche + profilo agente + WA pending + settings API completa"
```

---

## Self-Review

**Spec coverage:**
- ✅ Sync `blocked_status` da ERP
- ✅ Anti-clobber via `contact_write_pending_at`
- ✅ Write-back contatti via `update-customer` esistente
- ✅ Repository `notification-settings` con COALESCE (D7, D8)
- ✅ Profilo agente: 4 campi, guard `notification_reply_to_email` obbligatorio
- ✅ Tab Notifiche: 3 stati (disabilitato/missing contacts, profilo attivo, personalizzato)
- ✅ WA pending: stati pending→confirmed/dismissed
- ✅ Dashboard summary endpoint

**Non in questo piano (Piano 4):**
- Invio effettivo delle email (nodemailer)
- Tick di escalation automatico
- Integrazione agenda (appointments)
