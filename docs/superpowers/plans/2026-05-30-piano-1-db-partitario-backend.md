# Partitario — Piano 1: DB Migrations + Backend API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare le 9 migrazioni DB e l'endpoint REST `/api/ledger/:erpId` che restituisce la situazione finanziaria completa di un cliente (fatture aperte, scadute, NC, storico).

**Architecture:** Repository `customer-ledger` che aggrega `order_invoices` + `order_records` + `customers` via query SQL. Route Express con auth standard. Dati real-time dal DB (già sincronizzati dall'ERP). Nessun nuovo scraping.

**Tech Stack:** PostgreSQL (`pg` pool), TypeScript strict, Express, Vitest, Zod.

**Spec di riferimento:** `docs/superpowers/specs/2026-05-30-partitario-clienti-notifiche-design.md`

---

## File Map

**Nuovi:**
- `src/db/migrations/093-customers-blocked-status.sql`
- `src/db/migrations/094-customers-contact-write-pending.sql`
- `src/db/migrations/095-users-notification-profile.sql`
- `src/db/migrations/096-notification-profiles.sql`
- `src/db/migrations/097-invoice-notification-settings.sql`
- `src/db/migrations/098-invoice-notification-log.sql`
- `src/db/migrations/099-invoice-notification-pending-wa.sql`
- `src/db/migrations/100-notification-periodic-log.sql`
- `src/db/migrations/101-notification-message-templates.sql`
- `src/db/repositories/customer-ledger.repository.ts`
- `src/db/repositories/customer-ledger.repository.spec.ts`
- `src/routes/ledger.ts`

**Modificati:**
- `src/main.ts` (registrazione route `/api/ledger`)

---

## Task 1: Migrazioni DB (093–101)

**Files:**
- Create: `src/db/migrations/093-customers-blocked-status.sql`
- Create: `src/db/migrations/094-customers-contact-write-pending.sql`
- Create: `src/db/migrations/095-users-notification-profile.sql`
- Create: `src/db/migrations/096-notification-profiles.sql`
- Create: `src/db/migrations/097-invoice-notification-settings.sql`
- Create: `src/db/migrations/098-invoice-notification-log.sql`
- Create: `src/db/migrations/099-invoice-notification-pending-wa.sql`
- Create: `src/db/migrations/100-notification-periodic-log.sql`
- Create: `src/db/migrations/101-notification-message-templates.sql`

- [ ] **Step 1: Crea migration 093**

```sql
-- src/db/migrations/093-customers-blocked-status.sql
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS blocked_status TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_blocked
  ON agents.customers (user_id, blocked_status)
  WHERE blocked_status IS NOT NULL;
```

- [ ] **Step 2: Crea migration 094**

```sql
-- src/db/migrations/094-customers-contact-write-pending.sql
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS contact_write_pending_at TIMESTAMPTZ;
```

- [ ] **Step 3: Crea migration 095**

```sql
-- src/db/migrations/095-users-notification-profile.sql
ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS notification_display_name TEXT,
  ADD COLUMN IF NOT EXISTS notification_reply_to_email TEXT,
  ADD COLUMN IF NOT EXISTS notification_phone TEXT,
  ADD COLUMN IF NOT EXISTS notification_title TEXT;
```

- [ ] **Step 4: Crea migration 096**

```sql
-- src/db/migrations/096-notification-profiles.sql
CREATE TABLE IF NOT EXISTS agents.notification_profiles (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT,
  name       TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  steps      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO agents.notification_profiles (user_id, name, is_default, steps)
VALUES
  (NULL, 'Gentile', true, '[
    {"days_after_due":15,"tone":"cordiale","channels":["email","whatsapp"]},
    {"days_after_due":45,"tone":"formale","channels":["email","whatsapp"]},
    {"days_after_due":90,"tone":"urgente","channels":["email"]}
  ]'),
  (NULL, 'Standard', false, '[
    {"days_after_due":1,"tone":"cordiale","channels":["email","whatsapp"]},
    {"days_after_due":7,"tone":"formale","channels":["email","whatsapp"]},
    {"days_after_due":20,"tone":"formale","channels":["email"]},
    {"days_after_due":30,"tone":"urgente","channels":["email"]}
  ]'),
  (NULL, 'Aggressivo', false, '[
    {"days_after_due":0,"tone":"cordiale","channels":["whatsapp"]},
    {"days_after_due":3,"tone":"formale","channels":["email","whatsapp"]},
    {"days_after_due":7,"tone":"urgente","channels":["email","whatsapp"]},
    {"days_after_due":15,"tone":"urgente","channels":["email"]}
  ]')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 5: Crea migration 097**

```sql
-- src/db/migrations/097-invoice-notification-settings.sql
CREATE TABLE IF NOT EXISTS agents.invoice_notification_settings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     TEXT NOT NULL,
  customer_erp_id             TEXT NOT NULL,
  enabled                     BOOLEAN NOT NULL DEFAULT false,
  profile_id                  INTEGER REFERENCES agents.notification_profiles(id),
  override_steps              JSONB,
  email_override              TEXT,
  whatsapp_override           TEXT,
  notify_new_invoice          BOOLEAN NOT NULL DEFAULT true,
  notify_pre_due              BOOLEAN NOT NULL DEFAULT true,
  pre_due_days                INTEGER NOT NULL DEFAULT 7,
  periodic_statement_enabled  BOOLEAN NOT NULL DEFAULT false,
  periodic_statement_days     INTEGER NOT NULL DEFAULT 30,
  periodic_statement_content  JSONB DEFAULT '{"open_invoices":true,"total_due":true,"credit_notes":true,"history":false}',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, customer_erp_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_settings_user
  ON agents.invoice_notification_settings (user_id)
  WHERE enabled = true;
```

- [ ] **Step 6: Crea migration 098**

```sql
-- src/db/migrations/098-invoice-notification-log.sql
CREATE TABLE IF NOT EXISTS agents.invoice_notification_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  customer_erp_id TEXT NOT NULL,
  invoice_number  TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  channel         TEXT NOT NULL,
  step_index      INTEGER NOT NULL,
  tone            TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_past_due   INTEGER,
  message_preview TEXT,
  UNIQUE (user_id, invoice_number, step_index, channel)
);

CREATE INDEX IF NOT EXISTS idx_notif_log_customer
  ON agents.invoice_notification_log (user_id, customer_erp_id, sent_at DESC);
```

- [ ] **Step 7: Crea migration 099**

```sql
-- src/db/migrations/099-invoice-notification-pending-wa.sql
CREATE TABLE IF NOT EXISTS agents.invoice_notification_pending_wa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  customer_erp_id TEXT NOT NULL,
  phone_to        TEXT NOT NULL,
  message_text    TEXT NOT NULL,
  tone            TEXT NOT NULL,
  step_index      INTEGER,
  invoice_numbers TEXT[] NOT NULL,
  total_amount    NUMERIC,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  dismissed_at    TIMESTAMPTZ,
  CONSTRAINT chk_wa_status CHECK (
    status IN ('pending','opened_by_agent','confirmed_sent','dismissed')
  )
);

CREATE INDEX IF NOT EXISTS idx_pending_wa_user_status
  ON agents.invoice_notification_pending_wa (user_id, status)
  WHERE status IN ('pending','opened_by_agent');
```

- [ ] **Step 8: Crea migration 100**

```sql
-- src/db/migrations/100-notification-periodic-log.sql
CREATE TABLE IF NOT EXISTS agents.notification_periodic_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  customer_erp_id TEXT NOT NULL,
  channel         TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_bucket   DATE NOT NULL,
  message_preview TEXT,
  UNIQUE (user_id, customer_erp_id, period_bucket, channel)
);
```

- [ ] **Step 9: Crea migration 101**

```sql
-- src/db/migrations/101-notification-message-templates.sql
CREATE TABLE IF NOT EXISTS agents.notification_message_templates (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT,
  event_type   TEXT NOT NULL,
  tone         TEXT NOT NULL,
  channel      TEXT NOT NULL,
  subject_tmpl TEXT,
  body_tmpl    TEXT NOT NULL,
  UNIQUE (user_id, event_type, tone, channel)
);
```

- [ ] **Step 10: Applica le migrazioni in sviluppo**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: build passes senza errori TypeScript.

- [ ] **Step 11: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/09{3..9}-*.sql
git add archibald-web-app/backend/src/db/migrations/10{0,1}-*.sql
git commit -m "feat(db): 9 migrazioni per partitario e sistema notifiche (093-101)"
```

---

## Task 2: Repository `customer-ledger`

**Files:**
- Create: `src/db/repositories/customer-ledger.repository.ts`
- Create: `src/db/repositories/customer-ledger.repository.spec.ts`

- [ ] **Step 1: Scrivi il test (failing)**

```typescript
// src/db/repositories/customer-ledger.repository.spec.ts
import { describe, it, expect } from 'vitest';
import { buildLedgerQuery } from './customer-ledger.repository';

describe('buildLedgerQuery', () => {
  it('filtra per remaining_amount non zero e non vuoto', () => {
    const { text } = buildLedgerQuery();
    expect(text).toContain("remaining_amount NOT IN ('0', '')");
  });

  it('esclude NC dalla somma da saldare e le mette in nc_total', () => {
    const { text } = buildLedgerQuery();
    expect(text).toContain('invoice_amount_num > 0');
    expect(text).toContain('invoice_amount_num < 0');
  });

  it('usa COALESCE per effective_email e effective_whatsapp', () => {
    const { text } = buildLedgerQuery();
    expect(text).toContain('COALESCE');
  });
});
```

- [ ] **Step 2: Verifica che il test fallisce**

```bash
npm test --prefix archibald-web-app/backend -- customer-ledger
```

Expected: FAIL — "buildLedgerQuery is not a function"

- [ ] **Step 3: Implementa il repository**

```typescript
// src/db/repositories/customer-ledger.repository.ts
import type { DbPool } from '../pool';

export type InvoiceStatus = 'overdue' | 'due_soon' | 'open' | 'paid';
export type InvoiceTone = 'cordiale' | 'formale' | 'urgente' | null;

export type LedgerInvoice = {
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceAmount: number;
  remainingAmount: number;
  settledAmount: number;
  dueDate: string | null;
  daysPastDue: number;
  lastPaymentId: string | null;
  lastSettlementDate: string | null;
  status: InvoiceStatus;
  isNc: boolean;
};

export type LedgerSummary = {
  totalDaSaldare: number;
  totalScaduto: number;
  totalIncassatoAperte: number;
  totalNcAperte: number;
  maxDaysPastDue: number;
  openInvoices: LedgerInvoice[];
  ncInvoices: LedgerInvoice[];
  paidInvoices: LedgerInvoice[];
  blockedStatus: string | null;
  effectiveEmail: string | null;
  effectiveWhatsapp: string | null;
};

export function buildLedgerQuery(): { text: string } {
  const text = `
    WITH invoices AS (
      SELECT
        oi.invoice_number,
        oi.invoice_date,
        CASE WHEN oi.invoice_amount ~ '^-?[0-9.]+$'
          THEN oi.invoice_amount::numeric ELSE 0 END AS invoice_amount_num,
        CASE WHEN oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
          THEN oi.invoice_remaining_amount::numeric ELSE 0 END AS remaining_num,
        CASE WHEN oi.invoice_settled_amount ~ '^-?[0-9.]+$'
          THEN oi.invoice_settled_amount::numeric ELSE 0 END AS settled_num,
        oi.invoice_due_date,
        CASE WHEN oi.invoice_days_past_due ~ '^[0-9]+$'
          THEN oi.invoice_days_past_due::int ELSE 0 END AS days_past_due,
        oi.invoice_last_payment_id,
        oi.invoice_last_settlement_date
      FROM agents.order_invoices oi
      JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
      JOIN agents.customers c ON c.user_id = o.user_id
        AND c.account_num = o.customer_account_num
        AND c.deleted_at IS NULL
      WHERE o.user_id = $1
        AND c.erp_id = $2
        AND oi.invoice_remaining_amount NOT IN ('0', '')
        AND oi.invoice_remaining_amount IS NOT NULL
    ),
    customer_info AS (
      SELECT
        c.blocked_status,
        COALESCE(ns.email_override, c.email) AS effective_email,
        COALESCE(ns.whatsapp_override, c.mobile) AS effective_whatsapp
      FROM agents.customers c
      LEFT JOIN agents.invoice_notification_settings ns
        ON ns.user_id = $1 AND ns.customer_erp_id = $2
      WHERE c.user_id = $1 AND c.erp_id = $2 AND c.deleted_at IS NULL
      LIMIT 1
    )
    SELECT
      i.*,
      ci.blocked_status,
      ci.effective_email,
      ci.effective_whatsapp
    FROM invoices i, customer_info ci
    ORDER BY
      CASE WHEN i.invoice_amount_num < 0 THEN 1 ELSE 0 END,
      CASE WHEN i.days_past_due > 0 THEN 0 ELSE 1 END,
      i.days_past_due DESC,
      i.invoice_due_date ASC NULLS LAST
  `;
  return { text };
}

function classifyStatus(invoice: {
  remaining_num: number;
  invoice_amount_num: number;
  days_past_due: number;
  invoice_due_date: string | null;
}): InvoiceStatus {
  if (invoice.invoice_amount_num < 0) return 'open'; // NC handled separately
  if (invoice.days_past_due > 0) return 'overdue';
  if (invoice.invoice_due_date) {
    const daysUntil = Math.ceil(
      (new Date(invoice.invoice_due_date).getTime() - Date.now()) / 86400000,
    );
    if (daysUntil <= 7) return 'due_soon';
  }
  return 'open';
}

type LedgerRow = {
  invoice_number: string;
  invoice_date: string | null;
  invoice_amount_num: string;
  remaining_num: string;
  settled_num: string;
  invoice_due_date: string | null;
  days_past_due: string;
  invoice_last_payment_id: string | null;
  invoice_last_settlement_date: string | null;
  blocked_status: string | null;
  effective_email: string | null;
  effective_whatsapp: string | null;
};

function mapRow(row: LedgerRow): LedgerInvoice {
  const amount = parseFloat(row.invoice_amount_num);
  const remaining = parseFloat(row.remaining_num);
  const settled = parseFloat(row.settled_num);
  const days = parseInt(row.days_past_due, 10) || 0;
  return {
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    invoiceAmount: amount,
    remainingAmount: remaining,
    settledAmount: settled,
    dueDate: row.invoice_due_date,
    daysPastDue: days,
    lastPaymentId: row.invoice_last_payment_id,
    lastSettlementDate: row.invoice_last_settlement_date,
    isNc: amount < 0,
    status: classifyStatus({ remaining_num: remaining, invoice_amount_num: amount, days_past_due: days, invoice_due_date: row.invoice_due_date }),
  };
}

export async function getCustomerLedger(
  pool: DbPool,
  userId: string,
  customerErpId: string,
): Promise<LedgerSummary> {
  const { text } = buildLedgerQuery();
  const { rows } = await pool.query<LedgerRow>(text, [userId, customerErpId]);

  if (rows.length === 0) {
    const ciRows = await pool.query<{ blocked_status: string | null; effective_email: string | null; effective_whatsapp: string | null }>(
      `SELECT c.blocked_status,
         COALESCE(ns.email_override, c.email) AS effective_email,
         COALESCE(ns.whatsapp_override, c.mobile) AS effective_whatsapp
       FROM agents.customers c
       LEFT JOIN agents.invoice_notification_settings ns
         ON ns.user_id = $1 AND ns.customer_erp_id = $2
       WHERE c.user_id = $1 AND c.erp_id = $2 AND c.deleted_at IS NULL
       LIMIT 1`,
      [userId, customerErpId],
    );
    const ci = ciRows.rows[0] ?? { blocked_status: null, effective_email: null, effective_whatsapp: null };
    return {
      totalDaSaldare: 0, totalScaduto: 0, totalIncassatoAperte: 0,
      totalNcAperte: 0, maxDaysPastDue: 0,
      openInvoices: [], ncInvoices: [], paidInvoices: [],
      blockedStatus: ci.blocked_status,
      effectiveEmail: ci.effective_email,
      effectiveWhatsapp: ci.effective_whatsapp,
    };
  }

  const { blocked_status, effective_email, effective_whatsapp } = rows[0];
  const invoices = rows.map(mapRow);

  const openInvoices = invoices.filter(i => !i.isNc);
  const ncInvoices = invoices.filter(i => i.isNc);

  return {
    totalDaSaldare: openInvoices.reduce((s, i) => s + i.remainingAmount, 0),
    totalScaduto: openInvoices.filter(i => i.daysPastDue > 0).reduce((s, i) => s + i.remainingAmount, 0),
    totalIncassatoAperte: openInvoices.reduce((s, i) => s + i.settledAmount, 0),
    totalNcAperte: ncInvoices.reduce((s, i) => s + Math.abs(i.remainingAmount), 0),
    maxDaysPastDue: Math.max(0, ...openInvoices.map(i => i.daysPastDue)),
    openInvoices,
    ncInvoices,
    paidInvoices: [],
    blockedStatus: blocked_status,
    effectiveEmail: effective_email,
    effectiveWhatsapp: effective_whatsapp,
  };
}

export async function getCustomerLedgerHistory(
  pool: DbPool,
  userId: string,
  customerErpId: string,
): Promise<LedgerInvoice[]> {
  const { rows } = await pool.query<LedgerRow & { invoice_remaining_amount: string }>(
    `SELECT
       oi.invoice_number, oi.invoice_date,
       CASE WHEN oi.invoice_amount ~ '^-?[0-9.]+$' THEN oi.invoice_amount::numeric ELSE 0 END AS invoice_amount_num,
       0::numeric AS remaining_num,
       CASE WHEN oi.invoice_settled_amount ~ '^-?[0-9.]+$' THEN oi.invoice_settled_amount::numeric ELSE 0 END AS settled_num,
       oi.invoice_due_date,
       0 AS days_past_due,
       oi.invoice_last_payment_id,
       oi.invoice_last_settlement_date,
       NULL AS blocked_status, NULL AS effective_email, NULL AS effective_whatsapp
     FROM agents.order_invoices oi
     JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
     JOIN agents.customers c ON c.user_id = o.user_id AND c.account_num = o.customer_account_num AND c.deleted_at IS NULL
     WHERE o.user_id = $1 AND c.erp_id = $2
       AND (oi.invoice_remaining_amount IN ('0','') OR oi.invoice_remaining_amount IS NULL)
       AND oi.invoice_closed IS NULL
     ORDER BY oi.invoice_date DESC NULLS LAST
     LIMIT 50`,
    [userId, customerErpId],
  );
  return rows.map(r => ({ ...mapRow(r), status: 'paid' as InvoiceStatus }));
}
```

- [ ] **Step 4: Esegui il test — deve passare**

```bash
npm test --prefix archibald-web-app/backend -- customer-ledger
```

Expected: PASS (3 test)

- [ ] **Step 5: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/customer-ledger.repository.ts
git add archibald-web-app/backend/src/db/repositories/customer-ledger.repository.spec.ts
git commit -m "feat(ledger): repository getCustomerLedger con aggregazione KPI e storico"
```

---

## Task 3: Route `/api/ledger`

**Files:**
- Create: `src/routes/ledger.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Crea la route**

```typescript
// src/routes/ledger.ts
import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import { getCustomerLedger, getCustomerLedgerHistory } from '../db/repositories/customer-ledger.repository';
import { logger } from '../logger';

type LedgerRouterDeps = { pool: DbPool };

export function createLedgerRouter({ pool }: LedgerRouterDeps): Router {
  const router = Router();

  // GET /api/ledger/:erpId
  // Restituisce la situazione finanziaria del cliente (fatture aperte + KPI)
  router.get('/:erpId', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { erpId } = req.params as { erpId: string };

      if (!erpId || erpId.trim() === '') {
        res.status(400).json({ success: false, error: 'erpId richiesto' });
        return;
      }

      const ledger = await getCustomerLedger(pool, userId, erpId);
      res.json({ success: true, data: ledger });
    } catch (error) {
      logger.error('Errore getCustomerLedger', { error });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  // GET /api/ledger/:erpId/history
  // Restituisce le fatture già saldate (storico)
  router.get('/:erpId/history', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { erpId } = req.params as { erpId: string };

      const history = await getCustomerLedgerHistory(pool, userId, erpId);
      res.json({ success: true, data: history });
    } catch (error) {
      logger.error('Errore getCustomerLedgerHistory', { error });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  return router;
}
```

- [ ] **Step 2: Registra la route in main.ts**

Trova in `main.ts` la riga con `createAgentQueueRouter` e aggiungi SOPRA di essa:

```typescript
// Aggiungi import in cima con gli altri import:
import { createLedgerRouter } from './routes/ledger';

// Aggiungi nella funzione startServer(), vicino alle altre route:
app.use('/api/ledger', conductorAuthMiddleware, createLedgerRouter({ pool }));
```

- [ ] **Step 3: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori

- [ ] **Step 4: Test manuale via curl (con JWT reale del VPS)**

Sul VPS, prendi il JWT da una sessione attiva e chiama:

```bash
# Sostituisci JWT con un token valido
curl -s "https://formicanera.com/api/ledger/55.226" \
  -H "Authorization: Bearer <JWT>" | jq '.data | {totalDaSaldare, totalScaduto, maxDaysPastDue}'
```

Expected: `{"totalDaSaldare": 3277.57, "totalScaduto": 3277.57, "maxDaysPastDue": 90}` (dati Maco International)

- [ ] **Step 5: Test manuale Fresis (NC aperte)**

```bash
curl -s "https://formicanera.com/api/ledger/55.261" \
  -H "Authorization: Bearer <JWT>" | jq '.data | {totalDaSaldare, totalNcAperte, totalScaduto}'
```

Expected: `{"totalDaSaldare": ~33182, "totalNcAperte": 741, "totalScaduto": 0}`

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/routes/ledger.ts
git add archibald-web-app/backend/src/main.ts
git commit -m "feat(ledger): route GET /api/ledger/:erpId con aggregazione KPI e storico"
```

---

## Self-Review

**Spec coverage:**
- ✅ 9 migrazioni DB (093-101) con seed profili default
- ✅ Predicato `remaining_amount NOT IN ('0','')` (D6 locked)
- ✅ KPI: `totalDaSaldare`, `totalScaduto`, `totalIncassatoAperte`, `totalNcAperte` (semantica §4 spec)
- ✅ NC separate dagli open invoices
- ✅ COALESCE per effective_email/whatsapp (D7, D8 locked)
- ✅ `blockedStatus` incluso nella risposta (per il banner order card)
- ✅ `/history` endpoint per lo storico saldati

**Non in questo piano (nei piani successivi):**
- Frontend Partitario Tab → Piano 2
- Sync `blocked_status` da ERP → Piano 3
- Notification settings API → Piano 3
- Notification Service → Piano 4
