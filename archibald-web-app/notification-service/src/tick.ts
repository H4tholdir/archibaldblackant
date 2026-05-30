import type { Pool } from 'pg';
import { getApplicableStep, dominantTone } from './escalation';
import type { EscalationStep } from './escalation';
import { buildEmailContent } from './templates/email';
import { buildWhatsappText } from './templates/whatsapp';
import { createAgendaNote } from './agenda';

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
  steps: EscalationStep[];
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
      COALESCE(ns.override_steps, np.steps, '[]'::jsonb) AS steps
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
    steps: r.steps as EscalationStep[],
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

// channel-aware: email e whatsapp sono tracked indipendentemente nel log
// (colonna channel nella UNIQUE key). Senza il filtro channel, un WA inviato
// blocca il retry di un'email fallita per lo stesso step_index.
async function getSentStepsForInvoice(pool: Pool, userId: string, invoiceNumber: string, channel: string): Promise<Set<number>> {
  const { rows } = await pool.query(
    `SELECT step_index FROM agents.invoice_notification_log
     WHERE user_id = $1 AND invoice_number = $2 AND event_type = 'overdue_step' AND channel = $3`,
    [userId, invoiceNumber, channel],
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
  const { config } = await import('./config');
  const { sendEmail } = await import('./mailer');

  console.log('[tick] avvio ciclo notifiche', new Date().toISOString());

  const customers = await getCustomersToNotify(pool);
  const userSyncCache = new Map<string, Date | null>();

  for (const cust of customers) {
    if (!userSyncCache.has(cust.userId)) {
      const syncAt = await getSyncFreshness(pool, cust.userId);
      userSyncCache.set(cust.userId, syncAt);
    }
    const syncAt = userSyncCache.get(cust.userId) ?? null;
    if (!shouldSendForCustomer(syncAt, config.tick.syncFreshnessMaxAgeMs)) {
      console.log(`[tick] skip ${cust.customerErpId}: sync non fresca`);
      continue;
    }

    if (!cust.agentEmail) continue;

    const openInvoices = await getOpenInvoicesForCustomer(pool, cust.userId, cust.customerErpId);
    if (openInvoices.length === 0) continue;

    type InvoiceWithStep = OpenInvoice & { applicableStep: NonNullable<ReturnType<typeof getApplicableStep>> };

    // Email e WA tracciati per-canale: sentSteps separati per evitare che
    // un canale riuscito blocchi il retry del canale fallito sullo stesso step.
    const emailInvoices: InvoiceWithStep[] = [];
    const waInvoices: InvoiceWithStep[] = [];

    for (const inv of openInvoices) {
      const emailSentSteps = await getSentStepsForInvoice(pool, cust.userId, inv.invoiceNumber, 'email');
      const emailStep = getApplicableStep(inv.daysPastDue, cust.steps, emailSentSteps);
      if (emailStep && emailStep.channels.includes('email')) {
        emailInvoices.push({ ...inv, applicableStep: emailStep });
      }

      const waSentSteps = await getSentStepsForInvoice(pool, cust.userId, inv.invoiceNumber, 'whatsapp');
      const waStep = getApplicableStep(inv.daysPastDue, cust.steps, waSentSteps);
      if (waStep && waStep.channels.includes('whatsapp')) {
        waInvoices.push({ ...inv, applicableStep: waStep });
      }
    }

    if (emailInvoices.length === 0 && waInvoices.length === 0) continue;

    const allApplicableSteps = [...emailInvoices, ...waInvoices].map(i => i.applicableStep.tone);
    const tone = dominantTone(allApplicableSteps) as 'cordiale' | 'formale' | 'urgente';

    // Email
    if (emailInvoices.length > 0 && cust.effectiveEmail) {
      const emailTotalAmount = emailInvoices.reduce((s, i) => s + Number(i.remainingAmount), 0);
      try {
        const emailCtx = {
          customerName: cust.customerName,
          agentName: cust.agentName,
          agentTitle: cust.agentTitle,
          agentEmail: cust.agentEmail,
          agentPhone: cust.agentPhone,
          tone,
          invoices: emailInvoices.map(i => ({
            invoiceNumber: i.invoiceNumber,
            remainingAmount: Number(i.remainingAmount),
            dueDate: i.dueDate,
            daysPastDue: i.daysPastDue,
          })),
          totalAmount: emailTotalAmount,
        };
        const { subject, html, replyTo } = buildEmailContent(emailCtx);
        await sendEmail({ to: cust.effectiveEmail, replyTo, fromName: cust.agentName, subject, html });

        for (const inv of emailInvoices) {
          await logNotificationEvent(pool, cust.userId, cust.customerErpId, inv.invoiceNumber, inv.applicableStep.index, tone, 'email', inv.daysPastDue);
        }

        await createAgendaNote(pool, cust.userId, cust.customerErpId, {
          title: `Email ${tone} inviata — ${emailInvoices.length} fatture`,
          body: `${emailInvoices.map(i => i.invoiceNumber).join(', ')} · Totale: ${emailTotalAmount.toFixed(2)} · Tono: ${tone}`,
        });

        console.log(`[tick] ✉ email inviata a ${cust.effectiveEmail} per ${cust.customerErpId}`);
      } catch (err) {
        console.error(`[tick] ✗ email fallita per ${cust.customerErpId}`, err);
      }
    }

    // WA pending — totale calcolato solo sulle fatture WA (non include email-only)
    if (waInvoices.length > 0 && cust.effectiveWhatsapp) {
      const waTotalAmount = waInvoices.reduce((s, i) => s + Number(i.remainingAmount), 0);
      const waText = buildWhatsappText({
        customerName: cust.customerName,
        agentName: cust.agentName,
        agentPhone: cust.agentPhone,
        tone,
        invoices: waInvoices.map(i => ({
          invoiceNumber: i.invoiceNumber,
          remainingAmount: Number(i.remainingAmount),
          daysPastDue: i.daysPastDue,
        })),
        totalAmount: waTotalAmount,
      });
      const stepIndex = Math.max(...waInvoices.map(i => i.applicableStep.index));
      await createPendingWa(pool, cust.userId, cust.customerErpId, cust.effectiveWhatsapp, waText, tone, stepIndex, waInvoices.map(i => i.invoiceNumber), waTotalAmount);

      for (const inv of waInvoices) {
        await logNotificationEvent(pool, cust.userId, cust.customerErpId, inv.invoiceNumber, inv.applicableStep.index, tone, 'whatsapp', inv.daysPastDue);
      }
      console.log(`[tick] 💬 WA pending creato per ${cust.customerErpId}`);
    }
  }

  console.log('[tick] ciclo completato');
}
