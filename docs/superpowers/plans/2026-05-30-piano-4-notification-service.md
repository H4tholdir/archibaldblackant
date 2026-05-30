# Partitario — Piano 4: Notification Service (Container Docker)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare il container Docker `notification-service` autonomo che esegue un tick orario per: inviare email automatiche consolidate per-cliente, creare record WA pending, registrare eventi in `invoice_notification_log`, creare note in `agents.appointments`, e bloccarsi automaticamente quando le fatture vengono pagate.

**Architecture:** Node 20 + TypeScript standalone. Nessuna dipendenza da Express/main backend. Legge da PostgreSQL (stesso DB), invia email via nodemailer (SMTP configurato). Tick orario via `setInterval`. Gate sync-freshness prima di ogni invio. Un messaggio per-cliente per tick (tono più severo vince).

**Tech Stack:** Node 20, TypeScript, `nodemailer`, `pg`, Docker. Variabili d'ambiente dal `.env` esistente.

**Dipende da:** Piano 1 (migrazioni DB 093-101), Piano 3 (tabelle notification_settings, notification_log, pending_wa popolate).

**Spec di riferimento:** `docs/superpowers/specs/2026-05-30-partitario-clienti-notifiche-design.md` §2, §6

---

## File Map

**Nuovo container** (`archibald-web-app/notification-service/`):

```
notification-service/
├── src/
│   ├── index.ts                    (entrypoint: avvia tick)
│   ├── db.ts                       (pool PostgreSQL)
│   ├── config.ts                   (env vars)
│   ├── mailer.ts                   (nodemailer transporter)
│   ├── tick.ts                     (logica principale del tick orario)
│   ├── tick.spec.ts                (test della logica tick)
│   ├── escalation.ts               (calcola quale step è dovuto per ogni fattura)
│   ├── escalation.spec.ts
│   ├── templates/
│   │   ├── email.ts                (genera HTML email per tono)
│   │   ├── email.spec.ts
│   │   └── whatsapp.ts             (genera testo WA per tono)
│   └── agenda.ts                   (crea nota in agents.appointments)
├── Dockerfile
├── package.json
└── tsconfig.json
```

**Modificati:**
- `docker-compose.yml` (aggiunta del nuovo service)
- `.github/workflows/cd.yml` (build + push GHCR per notification-service)

---

## Task 1: Scaffolding del container

**Files:**
- Create: `notification-service/package.json`
- Create: `notification-service/tsconfig.json`
- Create: `notification-service/Dockerfile`

- [ ] **Step 1: package.json**

```json
{
  "name": "archibald-notification-service",
  "version": "1.0.0",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc --noEmit false",
    "start": "node dist/index.js",
    "test": "vitest run",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "nodemailer": "^6.9.0",
    "pg": "^8.11.0"
  },
  "devDependencies": {
    "@types/nodemailer": "^6.4.0",
    "@types/pg": "^8.11.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "tsx": "^4.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
```

- [ ] **Step 4: Install deps**

```bash
npm install --prefix archibald-web-app/notification-service
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/notification-service/
git commit -m "chore(notif-service): scaffolding container Node 20 TypeScript"
```

---

## Task 2: Config, DB pool, Mailer

**Files:**
- Create: `notification-service/src/config.ts`
- Create: `notification-service/src/db.ts`
- Create: `notification-service/src/mailer.ts`

- [ ] **Step 1: config.ts**

```typescript
// notification-service/src/config.ts
function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export const config = {
  db: {
    host: required('DB_HOST'),
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'noreply@formicanera.com',
  },
  tick: {
    intervalMs: parseInt(process.env.NOTIFICATION_TICK_MS ?? '3600000', 10), // 1h default
    syncFreshnessMaxAgeMs: 6 * 60 * 60 * 1000, // 6h
  },
};
```

- [ ] **Step 2: db.ts**

```typescript
// notification-service/src/db.ts
import { Pool } from 'pg';
import { config } from './config';

export const pool = new Pool(config.db);

pool.on('error', (err) => {
  console.error('[db] pool error', err);
});
```

- [ ] **Step 3: mailer.ts**

```typescript
// notification-service/src/mailer.ts
import nodemailer from 'nodemailer';
import { config } from './config';

export const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
});

export async function sendEmail(opts: {
  to: string;
  replyTo: string;
  fromName: string;
  subject: string;
  html: string;
}): Promise<void> {
  await transporter.sendMail({
    from: `"${opts.fromName}" <${config.smtp.from}>`,
    replyTo: opts.replyTo,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
```

- [ ] **Step 4: Build e commit**

```bash
npm run build --prefix archibald-web-app/notification-service
git add archibald-web-app/notification-service/src/config.ts
git add archibald-web-app/notification-service/src/db.ts
git add archibald-web-app/notification-service/src/mailer.ts
git commit -m "feat(notif-service): config, pool PostgreSQL e mailer nodemailer"
```

---

## Task 3: Logica escalation

**Files:**
- Create: `notification-service/src/escalation.ts`
- Create: `notification-service/src/escalation.spec.ts`

- [ ] **Step 1: Scrivi i test**

```typescript
// notification-service/src/escalation.spec.ts
import { describe, it, expect } from 'vitest';
import { getApplicableStep, dominantTone } from './escalation';

const gentileSteps = [
  { days_after_due: 15, tone: 'cordiale', channels: ['email', 'whatsapp'] },
  { days_after_due: 45, tone: 'formale',  channels: ['email', 'whatsapp'] },
  { days_after_due: 90, tone: 'urgente',  channels: ['email'] },
];

describe('getApplicableStep', () => {
  it('restituisce step +15 se la fattura è scaduta da 20 giorni e lo step 0 non è stato inviato', () => {
    const result = getApplicableStep(20, gentileSteps, new Set());
    expect(result).toMatchObject({ index: 0, tone: 'cordiale' });
  });

  it('restituisce step +45 se lo step 0 è già stato inviato e la fattura è scaduta da 50 giorni', () => {
    const result = getApplicableStep(50, gentileSteps, new Set([0]));
    expect(result).toMatchObject({ index: 1, tone: 'formale' });
  });

  it('restituisce null se tutti gli step sono stati inviati', () => {
    const result = getApplicableStep(100, gentileSteps, new Set([0, 1, 2]));
    expect(result).toBeNull();
  });

  it('restituisce null se la fattura è scaduta da meno del primo threshold', () => {
    const result = getApplicableStep(10, gentileSteps, new Set());
    expect(result).toBeNull();
  });
});

describe('dominantTone', () => {
  it('restituisce il tono più severo tra più step', () => {
    expect(dominantTone(['cordiale', 'urgente', 'formale'])).toBe('urgente');
    expect(dominantTone(['cordiale', 'formale'])).toBe('formale');
    expect(dominantTone(['cordiale'])).toBe('cordiale');
  });
});
```

- [ ] **Step 2: Verifica che fallisce**

```bash
npm test --prefix archibald-web-app/notification-service
```

Expected: FAIL — "getApplicableStep is not a function"

- [ ] **Step 3: Implementa escalation.ts**

```typescript
// notification-service/src/escalation.ts
export type EscalationStep = {
  days_after_due: number;
  tone: string;
  channels: string[];
};

export type ApplicableStep = {
  index: number;
  tone: string;
  channels: string[];
  days_after_due: number;
};

const TONE_SEVERITY: Record<string, number> = { cordiale: 1, formale: 2, urgente: 3 };

export function getApplicableStep(
  daysPastDue: number,
  steps: EscalationStep[],
  alreadySentIndexes: Set<number>,
): ApplicableStep | null {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (daysPastDue >= step.days_after_due && !alreadySentIndexes.has(i)) {
      return { index: i, tone: step.tone, channels: step.channels, days_after_due: step.days_after_due };
    }
  }
  return null;
}

export function dominantTone(tones: string[]): string {
  return tones.reduce((max, t) =>
    (TONE_SEVERITY[t] ?? 0) > (TONE_SEVERITY[max] ?? 0) ? t : max
  , 'cordiale');
}
```

- [ ] **Step 4: Test passano**

```bash
npm test --prefix archibald-web-app/notification-service
```

Expected: PASS (4 test)

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/notification-service/src/escalation.ts
git add archibald-web-app/notification-service/src/escalation.spec.ts
git commit -m "feat(notif-service): logica escalation getApplicableStep e dominantTone"
```

---

## Task 4: Template email HTML e WA plain text

**Files:**
- Create: `notification-service/src/templates/email.ts`
- Create: `notification-service/src/templates/email.spec.ts`
- Create: `notification-service/src/templates/whatsapp.ts`

- [ ] **Step 1: Test template email**

```typescript
// notification-service/src/templates/email.spec.ts
import { describe, it, expect } from 'vitest';
import { buildEmailContent } from './email';

const ctx = {
  customerName: 'Maco International',
  agentName: 'Francesco Formicola',
  agentTitle: 'Agente Komet Dental Italy',
  agentEmail: 'f.formicola@komet.de',
  agentPhone: '+39 345 6789012',
  tone: 'urgente' as const,
  invoices: [
    { invoiceNumber: 'CF1/26001415', remainingAmount: 2185.06, dueDate: '2026-03-31', daysPastDue: 59 },
    { invoiceNumber: 'CF1/26000175', remainingAmount: 1092.51, dueDate: '2026-02-28', daysPastDue: 90 },
  ],
  totalAmount: 3277.57,
};

describe('buildEmailContent', () => {
  it('include il numero delle fatture nel subject', () => {
    const { subject } = buildEmailContent(ctx);
    expect(subject).toContain('2');
  });

  it('include ⚠ nel subject urgente', () => {
    const { subject } = buildEmailContent(ctx);
    expect(subject).toContain('⚠');
  });

  it('include il totale nel body HTML', () => {
    const { html } = buildEmailContent(ctx);
    expect(html).toContain('3.277');
  });

  it('include CF1/26001415 nella tabella', () => {
    const { html } = buildEmailContent(ctx);
    expect(html).toContain('CF1/26001415');
  });

  it('include Reply-To agente', () => {
    const { replyTo } = buildEmailContent(ctx);
    expect(replyTo).toBe('f.formicola@komet.de');
  });
});
```

- [ ] **Step 2: Implementa templates/email.ts**

```typescript
// notification-service/src/templates/email.ts
type InvoiceRow = {
  invoiceNumber: string;
  remainingAmount: number;
  dueDate: string | null;
  daysPastDue: number;
};

type EmailContext = {
  customerName: string;
  agentName: string;
  agentTitle: string;
  agentEmail: string;
  agentPhone: string;
  tone: 'cordiale' | 'formale' | 'urgente';
  invoices: InvoiceRow[];
  totalAmount: number;
};

function eur(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

const SUBJECT: Record<EmailContext['tone'], (n: number, total: number) => string> = {
  cordiale: (n, t) => `Promemoria pagamento — ${n} fatture · ${eur(t)}`,
  formale:  (n, t) => `Sollecito pagamento — ${n} fatture · ${eur(t)}`,
  urgente:  (n, t) => `⚠ Sollecito urgente — ${n} fatture insolute · ${eur(t)}`,
};

const INTRO: Record<EmailContext['tone'], string> = {
  cordiale: 'Le ricordiamo che le seguenti fatture risultano ancora in sospeso. La invitiamo a provvedere al pagamento al Suo più presto.',
  formale:  'La invitiamo a regolarizzare le seguenti posizioni entro i prossimi giorni. In assenza di riscontro saremo costretti ad adottare ulteriori provvedimenti.',
  urgente:  'Siamo costretti a segnalare che le seguenti fatture risultano ancora insolute e richiedono la Sua <strong>immediata attenzione</strong>. Malgrado i precedenti solleciti, la situazione non è ancora stata regolarizzata.',
};

const HEADER_BG: Record<EmailContext['tone'], string> = {
  cordiale: '#1e3a5f',
  formale:  '#78350f',
  urgente:  '#7f1d1d',
};

export function buildEmailContent(ctx: EmailContext): { subject: string; html: string; replyTo: string } {
  const subject = SUBJECT[ctx.tone](ctx.invoices.length, ctx.totalAmount);
  const headerBg = HEADER_BG[ctx.tone];

  const tableRows = ctx.invoices.map(inv => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #fee2e2;font-weight:700">${inv.invoiceNumber}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #fee2e2;text-align:right;font-weight:700">${eur(inv.remainingAmount)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #fee2e2;color:#991b1b">${inv.dueDate ?? '—'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #fee2e2;text-align:right">
        <span style="background:#7f1d1d;color:#fca5a5;font-size:9px;padding:1px 5px;border-radius:3px">+${inv.daysPastDue} gg</span>
      </td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,sans-serif">
<div style="max-width:560px;margin:20px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
  <div style="background:${headerBg};padding:14px 20px">
    <div style="font-size:14px;font-weight:700;color:#fef2f2">Komet Dental Italy</div>
    <div style="font-size:10px;color:rgba(255,255,255,0.7);margin-top:2px">Risposta automatica — rispondere a ${ctx.agentEmail}</div>
  </div>
  <div style="padding:20px">
    <p style="font-size:13px;margin-bottom:14px">Gentile <strong>${ctx.customerName}</strong>,</p>
    <p style="font-size:12px;line-height:1.6;margin-bottom:14px;color:#334155">${INTRO[ctx.tone]}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="text-align:left;padding:7px 10px;border-bottom:2px solid #e2e8f0;color:#64748b">Fattura</th>
          <th style="text-align:right;padding:7px 10px;border-bottom:2px solid #e2e8f0;color:#64748b">Importo</th>
          <th style="text-align:left;padding:7px 10px;border-bottom:2px solid #e2e8f0;color:#64748b">Scaduta il</th>
          <th style="text-align:right;padding:7px 10px;border-bottom:2px solid #e2e8f0;color:#64748b">Giorni</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
      <tfoot>
        <tr style="background:#fef3c7">
          <td colspan="2" style="padding:9px 10px;font-weight:800;font-size:13px;border-top:2px solid #f59e0b;color:#92400e">Totale insoluto</td>
          <td colspan="2" style="padding:9px 10px;text-align:right;font-weight:800;font-size:15px;color:#92400e;border-top:2px solid #f59e0b">${eur(ctx.totalAmount)}</td>
        </tr>
      </tfoot>
    </table>
    <div style="border-top:1px solid #e2e8f0;padding-top:12px;margin-top:4px">
      <div style="font-size:11px;font-weight:700;color:#1e293b">${ctx.agentName}</div>
      <div style="font-size:10px;color:#64748b">${ctx.agentTitle}</div>
      <div style="font-size:10px;color:#3b82f6">${ctx.agentEmail}${ctx.agentPhone ? ' · ' + ctx.agentPhone : ''}</div>
    </div>
    <div style="margin-top:14px;padding:8px;background:#f8fafc;border-radius:6px;font-size:9px;color:#94a3b8;text-align:center">
      Inviato automaticamente da Formicanera.com per conto di ${ctx.agentName}.
    </div>
  </div>
</div>
</body></html>`;

  return { subject, html, replyTo: ctx.agentEmail };
}
```

- [ ] **Step 3: templates/whatsapp.ts**

```typescript
// notification-service/src/templates/whatsapp.ts
type WaContext = {
  customerName: string;
  agentName: string;
  agentPhone: string;
  tone: 'cordiale' | 'formale' | 'urgente';
  invoices: Array<{ invoiceNumber: string; remainingAmount: number; daysPastDue: number }>;
  totalAmount: number;
};

const INTRO_WA: Record<WaContext['tone'], string> = {
  cordiale: 'le ricordiamo le seguenti fatture ancora aperte:',
  formale:  'la invitiamo a regolarizzare le seguenti posizioni:',
  urgente:  'siamo costretti a segnalare che le seguenti fatture risultano insolute:',
};

function eur(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

export function buildWhatsappText(ctx: WaContext): string {
  const invoiceLines = ctx.invoices
    .map(i => `📄 ${i.invoiceNumber} — ${eur(i.remainingAmount)} (+${i.daysPastDue}gg)`)
    .join('\n');

  return `Gentile ${ctx.customerName},\n\n${INTRO_WA[ctx.tone]}\n\n${invoiceLines}\n\n💰 Totale: *${eur(ctx.totalAmount)}*\n\nPer confermare il pagamento o per chiarimenti, risponda pure a questo messaggio.\n\n${ctx.agentName} | Komet Dental${ctx.agentPhone ? '\n' + ctx.agentPhone : ''}`;
}
```

- [ ] **Step 4: Test e commit**

```bash
npm test --prefix archibald-web-app/notification-service
git add archibald-web-app/notification-service/src/templates/
git commit -m "feat(notif-service): template email HTML e WA plain text per tutti i toni"
```

---

## Task 5: Agenda integration

**Files:**
- Create: `notification-service/src/agenda.ts`

- [ ] **Step 1: Implementa agenda.ts**

```typescript
// notification-service/src/agenda.ts
import type { Pool } from 'pg';

export async function createAgendaNote(
  pool: Pool,
  userId: string,
  customerErpId: string,
  opts: {
    title: string;
    body: string;
    source?: string;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.appointments
       (user_id, customer_erp_id, title, description, start_at, source, created_at)
     VALUES ($1, $2, $3, $4, NOW(), $5, NOW())`,
    [userId, customerErpId, opts.title, opts.body, opts.source ?? 'notification_service'],
  );
}
```

---

## Task 6: Tick principale

**Files:**
- Create: `notification-service/src/tick.ts`
- Create: `notification-service/src/tick.spec.ts`

- [ ] **Step 1: Scrivi test del tick**

```typescript
// notification-service/src/tick.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { shouldSendForCustomer } from './tick';

describe('shouldSendForCustomer', () => {
  it('restituisce false se sync non è fresca', () => {
    const staleDate = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7h fa
    expect(shouldSendForCustomer(staleDate, 6 * 60 * 60 * 1000)).toBe(false);
  });

  it('restituisce true se sync è recente', () => {
    const freshDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1h fa
    expect(shouldSendForCustomer(freshDate, 6 * 60 * 60 * 1000)).toBe(true);
  });

  it('restituisce false se syncAt è null', () => {
    expect(shouldSendForCustomer(null, 6 * 60 * 60 * 1000)).toBe(false);
  });
});
```

- [ ] **Step 2: Implementa tick.ts**

```typescript
// notification-service/src/tick.ts
import type { Pool } from 'pg';
import { getApplicableStep, dominantTone } from './escalation';
import { buildEmailContent } from './templates/email';
import { buildWhatsappText } from './templates/whatsapp';
import { sendEmail } from './mailer';
import { createAgendaNote } from './agenda';
import { config } from './config';

export function shouldSendForCustomer(syncAt: Date | null, maxAgeMs: number): boolean {
  if (!syncAt) return false;
  return Date.now() - syncAt.getTime() <= maxAgeMs;
}

type CustomerToNotify = {
  userId: string;
  customerErpId: string;
  customerName: string;
  effectiveEmail: string | null;
  effectiveWhatsapp: string | null;
  agentName: string;
  agentEmail: string | null;
  agentTitle: string;
  agentPhone: string;
  steps: Array<{ days_after_due: number; tone: string; channels: string[] }>;
  overrideSteps: typeof steps | null;
};

type OpenInvoice = {
  invoiceNumber: string;
  remainingAmount: number;
  dueDate: string | null;
  daysPastDue: number;
};

async function getSyncFreshness(pool: Pool, userId: string): Promise<Date | null> {
  const { rows } = await pool.query(
    `SELECT last_completed_at FROM agents.sync_freshness WHERE user_id = $1 AND sync_type = 'sync-invoices'`,
    [userId],
  );
  return rows[0]?.last_completed_at ?? null;
}

async function getCustomersToNotify(pool: Pool): Promise<CustomerToNotify[]> {
  const { rows } = await pool.query(`
    SELECT
      ns.user_id, ns.customer_erp_id,
      c.name AS customer_name,
      COALESCE(ns.email_override, c.email) AS effective_email,
      COALESCE(ns.whatsapp_override, c.mobile) AS effective_whatsapp,
      COALESCE(u.notification_display_name, u.username) AS agent_name,
      u.notification_reply_to_email AS agent_email,
      COALESCE(u.notification_title, 'Agente Komet Dental') AS agent_title,
      COALESCE(u.notification_phone, '') AS agent_phone,
      np.steps AS profile_steps,
      ns.override_steps
    FROM agents.invoice_notification_settings ns
    JOIN agents.customers c ON c.user_id = ns.user_id AND c.erp_id = ns.customer_erp_id AND c.deleted_at IS NULL
    JOIN agents.users u ON u.id = ns.user_id
    LEFT JOIN agents.notification_profiles np ON np.id = ns.profile_id
    WHERE ns.enabled = true
      AND u.notification_reply_to_email IS NOT NULL
  `);
  return rows.map(r => ({
    userId: r.user_id,
    customerErpId: r.customer_erp_id,
    customerName: r.customer_name,
    effectiveEmail: r.effective_email,
    effectiveWhatsapp: r.effective_whatsapp,
    agentName: r.agent_name,
    agentEmail: r.agent_email,
    agentTitle: r.agent_title,
    agentPhone: r.agent_phone,
    steps: r.override_steps ?? r.profile_steps ?? [],
    overrideSteps: r.override_steps,
  }));
}

async function getOpenInvoicesForCustomer(pool: Pool, userId: string, customerErpId: string): Promise<OpenInvoice[]> {
  const { rows } = await pool.query(`
    SELECT
      oi.invoice_number,
      oi.invoice_remaining_amount::numeric AS remaining_amount,
      oi.invoice_due_date AS due_date,
      COALESCE(oi.invoice_days_past_due::int, 0) AS days_past_due
    FROM agents.order_invoices oi
    JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
    JOIN agents.customers c ON c.user_id = o.user_id AND c.account_num = o.customer_account_num AND c.deleted_at IS NULL
    WHERE o.user_id = $1
      AND c.erp_id = $2
      AND oi.invoice_remaining_amount NOT IN ('0','')
      AND oi.invoice_remaining_amount IS NOT NULL
      AND oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
      AND oi.invoice_amount ~ '^-?[0-9.]+$'
      AND oi.invoice_amount::numeric > 0
    ORDER BY oi.invoice_days_past_due::int DESC NULLS LAST
  `, [userId, customerErpId]);
  return rows;
}

async function getSentStepsForInvoice(pool: Pool, userId: string, invoiceNumber: string): Promise<Set<number>> {
  const { rows } = await pool.query(
    `SELECT step_index FROM agents.invoice_notification_log
     WHERE user_id = $1 AND invoice_number = $2 AND event_type = 'overdue_step'`,
    [userId, invoiceNumber],
  );
  return new Set(rows.map((r: { step_index: number }) => r.step_index));
}

async function logNotificationEvent(
  pool: Pool,
  userId: string,
  customerErpId: string,
  invoiceNumber: string,
  stepIndex: number,
  tone: string,
  channel: string,
  daysPastDue: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.invoice_notification_log
       (user_id, customer_erp_id, invoice_number, event_type, channel, step_index, tone, days_past_due)
     VALUES ($1, $2, $3, 'overdue_step', $4, $5, $6, $7)
     ON CONFLICT (user_id, invoice_number, step_index, channel) DO NOTHING`,
    [userId, customerErpId, invoiceNumber, channel, stepIndex, tone, daysPastDue],
  );
}

async function createPendingWa(
  pool: Pool,
  userId: string,
  customerErpId: string,
  phoneTo: string,
  messageText: string,
  tone: string,
  stepIndex: number,
  invoiceNumbers: string[],
  totalAmount: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.invoice_notification_pending_wa
       (user_id, customer_erp_id, phone_to, message_text, tone, step_index, invoice_numbers, total_amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [userId, customerErpId, phoneTo, messageText, tone, stepIndex, invoiceNumbers, totalAmount],
  );
}

export async function runTick(pool: Pool): Promise<void> {
  console.log('[tick] avvio ciclo notifiche', new Date().toISOString());

  const customers = await getCustomersToNotify(pool);
  const userSyncCache = new Map<string, Date | null>();

  for (const cust of customers) {
    // Gate sync-freshness (per userId, cached)
    if (!userSyncCache.has(cust.userId)) {
      const syncAt = await getSyncFreshness(pool, cust.userId);
      userSyncCache.set(cust.userId, syncAt);
    }
    const syncAt = userSyncCache.get(cust.userId) ?? null;
    if (!shouldSendForCustomer(syncAt, config.tick.syncFreshnessMaxAgeMs)) {
      console.log(`[tick] skip ${cust.customerErpId}: sync non fresca`);
      continue;
    }

    if (!cust.agentEmail) continue; // guard profilo agente incompleto

    const openInvoices = await getOpenInvoicesForCustomer(pool, cust.userId, cust.customerErpId);
    if (openInvoices.length === 0) continue;

    // Per ogni fattura, calcola quale step è applicabile
    type InvoiceWithStep = OpenInvoice & { applicableStep: Awaited<ReturnType<typeof getApplicableStep>> };
    const invoicesWithSteps: InvoiceWithStep[] = [];

    for (const inv of openInvoices) {
      const sentSteps = await getSentStepsForInvoice(pool, cust.userId, inv.invoiceNumber);
      const step = getApplicableStep(inv.daysPastDue, cust.steps, sentSteps);
      if (step) invoicesWithSteps.push({ ...inv, applicableStep: step });
    }

    if (invoicesWithSteps.length === 0) continue;

    // Tono dominante (più severo tra tutti gli step applicabili)
    const tone = dominantTone(invoicesWithSteps.map(i => i.applicableStep!.tone)) as 'cordiale' | 'formale' | 'urgente';
    const totalAmount = invoicesWithSteps.reduce((s, i) => s + i.remainingAmount, 0);
    const invoiceNumbers = invoicesWithSteps.map(i => i.invoiceNumber);

    // Invia email se il canale email è incluso nel tono dominante
    const anyHasEmail = invoicesWithSteps.some(i => i.applicableStep!.channels.includes('email'));
    if (anyHasEmail && cust.effectiveEmail) {
      try {
        const emailCtx = {
          customerName: cust.customerName,
          agentName: cust.agentName,
          agentTitle: cust.agentTitle,
          agentEmail: cust.agentEmail,
          agentPhone: cust.agentPhone,
          tone,
          invoices: invoicesWithSteps.map(i => ({
            invoiceNumber: i.invoiceNumber,
            remainingAmount: i.remainingAmount,
            dueDate: i.dueDate,
            daysPastDue: i.daysPastDue,
          })),
          totalAmount,
        };
        const { subject, html, replyTo } = buildEmailContent(emailCtx);
        await sendEmail({ to: cust.effectiveEmail, replyTo, fromName: cust.agentName, subject, html });

        // Log per ogni fattura al suo step_index
        for (const inv of invoicesWithSteps) {
          await logNotificationEvent(pool, cust.userId, cust.customerErpId, inv.invoiceNumber, inv.applicableStep!.index, tone, 'email', inv.daysPastDue);
        }

        // Nota agenda
        await createAgendaNote(pool, cust.userId, cust.customerErpId, {
          title: `Email ${tone} inviata — ${invoicesWithSteps.length} fatture`,
          body: `${invoiceNumbers.join(', ')} · Totale: ${totalAmount.toFixed(2)} · Tono: ${tone}`,
        });

        console.log(`[tick] ✉ email inviata a ${cust.effectiveEmail} per ${cust.customerErpId}`);
      } catch (err) {
        console.error(`[tick] ✗ email fallita per ${cust.customerErpId}`, err);
      }
    }

    // Crea pending WA se il canale whatsapp è incluso
    const anyHasWa = invoicesWithSteps.some(i => i.applicableStep!.channels.includes('whatsapp'));
    if (anyHasWa && cust.effectiveWhatsapp) {
      const waText = buildWhatsappText({
        customerName: cust.customerName,
        agentName: cust.agentName,
        agentPhone: cust.agentPhone,
        tone,
        invoices: invoicesWithSteps.map(i => ({ invoiceNumber: i.invoiceNumber, remainingAmount: i.remainingAmount, daysPastDue: i.daysPastDue })),
        totalAmount,
      });
      const stepIndex = Math.max(...invoicesWithSteps.map(i => i.applicableStep!.index));
      await createPendingWa(pool, cust.userId, cust.customerErpId, cust.effectiveWhatsapp, waText, tone, stepIndex, invoiceNumbers, totalAmount);
      console.log(`[tick] 💬 WA pending creato per ${cust.customerErpId}`);
    }
  }

  console.log('[tick] ciclo completato');
}
```

- [ ] **Step 3: Test**

```bash
npm test --prefix archibald-web-app/notification-service
```

Expected: PASS (tick.spec.ts — 3 test)

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/notification-service/src/tick.ts
git add archibald-web-app/notification-service/src/tick.spec.ts
git add archibald-web-app/notification-service/src/agenda.ts
git commit -m "feat(notif-service): tick principale con gate freshness, email, WA pending, agenda"
```

---

## Task 7: Entrypoint e Docker Compose

**Files:**
- Create: `notification-service/src/index.ts`
- Modify: `docker-compose.yml`

- [ ] **Step 1: index.ts**

```typescript
// notification-service/src/index.ts
import { pool } from './db';
import { runTick } from './tick';
import { config } from './config';

async function main() {
  console.log('[notification-service] avvio');
  console.log(`[notification-service] tick ogni ${config.tick.intervalMs / 60000} minuti`);

  // Primo tick immediato
  await runTick(pool).catch(err => console.error('[notification-service] tick errore', err));

  // Tick ricorrente
  setInterval(async () => {
    await runTick(pool).catch(err => console.error('[notification-service] tick errore', err));
  }, config.tick.intervalMs);
}

main().catch(err => {
  console.error('[notification-service] fatal', err);
  process.exit(1);
});
```

- [ ] **Step 2: Aggiungi il servizio in docker-compose.yml**

Apri `docker-compose.yml` e aggiungi il nuovo service vicino a `backend`:

```yaml
  notification-service:
    image: ghcr.io/h4tholdir/archibald-notification-service:latest
    restart: unless-stopped
    depends_on:
      - postgres
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: archibald
      DB_USER: archibald
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_SECURE: ${SMTP_SECURE}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      SMTP_FROM: ${SMTP_FROM}
      NOTIFICATION_TICK_MS: 3600000
    networks:
      - app-network
```

- [ ] **Step 3: Build locale per verifica**

```bash
docker build -t archibald-notification-service:test archibald-web-app/notification-service/
```

Expected: build senza errori

- [ ] **Step 4: Aggiungi CI/CD**

Nel file `.github/workflows/cd.yml`, aggiungi la build del nuovo container vicino alle build di `backend` e `frontend`:

```yaml
- name: Build notification-service
  run: |
    docker build -t ghcr.io/h4tholdir/archibald-notification-service:latest \
      archibald-web-app/notification-service/
    docker push ghcr.io/h4tholdir/archibald-notification-service:latest
```

- [ ] **Step 5: Commit finale**

```bash
git add archibald-web-app/notification-service/src/index.ts
git add docker-compose.yml
git add .github/workflows/cd.yml
git commit -m "feat(notif-service): entrypoint, docker-compose integration e CI/CD"
```

---

## Self-Review

**Spec coverage:**
- ✅ Container Docker separato (D1)
- ✅ Gate sync-freshness 6h prima di ogni invio
- ✅ 1 messaggio consolidato per cliente per tick (D4)
- ✅ Tono più severo vince (D5)
- ✅ Auto-stop: tick legge `remaining_amount = '0'` — fatture pagate non appaiono nella query
- ✅ Email: FROM sistema + Reply-To agente (D2)
- ✅ WA: record pending_wa scritto, agente invia via wa.me (D3)
- ✅ Ogni fattura loggata al suo step_index (non al tono del messaggio) — §3 spec
- ✅ Guard: salta se `notification_reply_to_email` è null (D10)
- ✅ Nota agenda creata per ogni invio email confermato
- ✅ Template email e WA rispettano i mockup approvati (`section4-templates-pwa.html`)
- ✅ Profili Gentile/Standard/Aggressivo nel seed migration 096

**Non coperto (future iterazioni):**
- Invio `new_invoice` trigger (si aggiunge come nuovo event_type nel tick)
- `pre_due` trigger (stessa logica, diverso confronto data)
- Estratto conto periodico (usa `notification_periodic_log`)
- Push notifications PWA (fuori scope notification-service — restano nel backend)
