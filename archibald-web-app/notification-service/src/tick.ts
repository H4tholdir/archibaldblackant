import type { Pool } from 'pg';
import { getApplicableStep, dominantTone } from './escalation';
import type { EscalationStep } from './escalation';
import { buildEmailContent } from './templates/email';
import { buildWhatsappText } from './templates/whatsapp';
import { createAgendaNote } from './agenda';
import type { EmailAttachment } from './mailer';

// Legge i PDF delle fatture già cachati in DB e li prepara come allegati email.
// Fail-graceful: se nulla in cache, restituisce [].
async function fetchPdfAttachments(pool: Pool, userId: string, invoiceNumbers: string[]): Promise<EmailAttachment[]> {
  if (invoiceNumbers.length === 0) return [];
  try {
    const { rows } = await pool.query<{ invoice_number: string; invoice_pdf_data: Buffer }>(
      `SELECT DISTINCT oi.invoice_number, oi.invoice_pdf_data
       FROM agents.order_invoices oi
       JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = $1
       WHERE oi.invoice_number = ANY($2)
         AND oi.invoice_pdf_data IS NOT NULL`,
      [userId, invoiceNumbers],
    );
    return rows.map(r => ({
      filename: `${r.invoice_number.replace(/\//g, '_')}.pdf`,
      content: r.invoice_pdf_data,
      contentType: 'application/pdf',
    }));
  } catch {
    return [];
  }
}

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
  notifyNewInvoice: boolean;
  notifyPreDue: boolean;
  preDueDays: number;
  periodicStatementEnabled: boolean;
  periodicStatementDays: number;
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
      COALESCE(ns.override_steps, np.steps, '[]'::jsonb) AS steps,
      ns.notify_new_invoice,
      ns.notify_pre_due,
      ns.pre_due_days,
      ns.periodic_statement_enabled,
      ns.periodic_statement_days
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
    notifyNewInvoice: r.notify_new_invoice ?? true,
    notifyPreDue: r.notify_pre_due ?? true,
    preDueDays: r.pre_due_days ?? 7,
    periodicStatementEnabled: r.periodic_statement_enabled ?? false,
    periodicStatementDays: r.periodic_statement_days ?? 30,
  }));
}

async function getOpenInvoicesForCustomer(pool: Pool, userId: string, customerErpId: string): Promise<OpenInvoice[]> {
  // NOTA: invoice_days_past_due dall'ERP (OVERDUEDAYS) è il termine di credito in giorni,
  // NON i giorni di ritardo dal due date. Il ritardo reale si calcola come CURRENT_DATE - due_date.
  // Includiamo solo fatture con due_date nel PASSATO (scadute davvero).
  const { rows } = await pool.query(`
    SELECT
      oi.invoice_number,
      oi.invoice_remaining_amount::numeric AS remaining_amount,
      oi.invoice_due_date AS due_date,
      (CURRENT_DATE - oi.invoice_due_date::date)::int AS days_past_due
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
      AND oi.invoice_due_date IS NOT NULL
      AND oi.invoice_due_date::date < CURRENT_DATE
    ORDER BY (CURRENT_DATE - oi.invoice_due_date::date) DESC
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

async function cancelPaidWaPending(pool: Pool): Promise<number> {
  const result = await pool.query(`
    UPDATE agents.invoice_notification_pending_wa pwa
    SET status = 'dismissed', dismissed_at = NOW()
    WHERE pwa.status IN ('pending', 'opened_by_agent')
      AND NOT EXISTS (
        SELECT 1
        FROM agents.order_invoices oi
        JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
        WHERE o.user_id = pwa.user_id
          AND oi.invoice_number = ANY(pwa.invoice_numbers)
          AND oi.invoice_remaining_amount NOT IN ('0', '')
          AND oi.invoice_remaining_amount IS NOT NULL
      )
  `);
  return result.rowCount ?? 0;
}

async function processNewInvoiceNotifications(pool: Pool, customers: CustomerToNotify[]): Promise<void> {
  const eligible = customers.filter(c => c.notifyNewInvoice && c.agentEmail && c.effectiveEmail);
  if (eligible.length === 0) return;

  for (const cust of eligible) {
    try {
      // Trova fatture nelle ultime 48h non ancora notificate
      const { rows } = await pool.query(`
        SELECT DISTINCT oi.invoice_number,
               oi.invoice_amount, oi.invoice_date, oi.invoice_due_date
        FROM agents.order_invoices oi
        JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
        JOIN agents.customers c ON c.user_id = o.user_id
          AND c.account_num = o.customer_account_num AND c.deleted_at IS NULL
        WHERE o.user_id = $1 AND c.erp_id = $2
          AND oi.invoice_amount ~ '^-?[0-9.]+$'
          AND oi.invoice_amount::numeric > 0
          AND oi.invoice_date IS NOT NULL
          AND (NOW() - (oi.invoice_date || ' 00:00:00')::timestamp) < INTERVAL '48 hours'
          AND NOT EXISTS (
            SELECT 1 FROM agents.invoice_notification_log log
            WHERE log.user_id = $1 AND log.invoice_number = oi.invoice_number
              AND log.event_type = 'new_invoice'
          )
      `, [cust.userId, cust.customerErpId]);

      if (rows.length === 0) continue;

      const { sendEmail } = await import('./mailer');
      const { buildEmailContent } = await import('./templates/email');

      const totalAmount = rows.reduce((s, r) => s + parseFloat(r.invoice_amount), 0);

      // Cerca template personalizzato per new_invoice
      const { getCustomTemplate, applyTemplateVariables } = await import('./template-loader');
      const customTmpl = await getCustomTemplate(pool, cust.userId, 'new_invoice', 'cordiale', 'email', cust.customerErpId);

      const subjectToUse = customTmpl?.subject_tmpl
        ? applyTemplateVariables(customTmpl.subject_tmpl, {
            n_fatture: String(rows.length),
            cliente_nome: cust.customerName,
            agente_nome: cust.agentName,
            totale: new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(totalAmount),
          })
        : `Nuova fattura emessa — ${rows.length} ${rows.length === 1 ? 'fattura' : 'fatture'} · ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(totalAmount)}`;

      let emailCtx: Parameters<typeof buildEmailContent>[0] = {
        customerName: cust.customerName,
        agentName: cust.agentName,
        agentTitle: cust.agentTitle,
        agentEmail: cust.agentEmail!,
        agentPhone: cust.agentPhone,
        tone: 'cordiale' as const,
        invoices: rows.map(r => ({
          invoiceNumber: r.invoice_number,
          remainingAmount: parseFloat(r.invoice_amount),
          dueDate: r.invoice_due_date,
          daysPastDue: 0,
        })),
        totalAmount,
      };
      if (customTmpl?.body_tmpl) {
        emailCtx = {
          ...emailCtx,
          customIntro: applyTemplateVariables(customTmpl.body_tmpl, {
            cliente_nome: cust.customerName,
            agente_nome: cust.agentName,
            n_fatture: String(rows.length),
            totale: new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(totalAmount),
          }),
        };
      }
      const { html, replyTo } = buildEmailContent(emailCtx);
      const newInvoiceAttachments = await fetchPdfAttachments(pool, cust.userId, rows.map(r => r.invoice_number));

      await sendEmail({ to: cust.effectiveEmail!, replyTo, fromName: cust.agentName, subject: subjectToUse, html, attachments: newInvoiceAttachments.length > 0 ? newInvoiceAttachments : undefined });

      for (const inv of rows) {
        await pool.query(
          `INSERT INTO agents.invoice_notification_log
             (user_id, customer_erp_id, invoice_number, event_type, channel, step_index, tone, days_past_due)
           VALUES ($1, $2, $3, 'new_invoice', 'email', 0, 'cordiale', 0)
           ON CONFLICT (user_id, invoice_number, step_index, channel) DO NOTHING`,
          [cust.userId, cust.customerErpId, inv.invoice_number],
        );
      }

      await pool.query(
        `INSERT INTO agents.notifications (user_id, type, severity, title, body, data, expires_at)
         VALUES ($1, 'new_invoice', 'info', $2, $3, $4, NOW() + INTERVAL '3 days')`,
        [cust.userId, `Nuova fattura: ${cust.customerName}`, `${rows.length} nuov${rows.length === 1 ? 'a fattura' : 'e fatture'} emesse`,
         JSON.stringify({ customerErpId: cust.customerErpId, count: rows.length })],
      ).catch(() => null);
      await createAgendaNote(pool, cust.userId, cust.customerErpId, {
        title: `Nuova fattura notificata: ${rows.length} fattur${rows.length === 1 ? 'a' : 'e'}`,
        body: `Email inviata a ${cust.effectiveEmail} · ${rows.map((r: { invoice_number: string }) => r.invoice_number).join(', ')}`,
      });
      console.log(`[tick] 📄 new_invoice email inviata a ${cust.effectiveEmail} per ${cust.customerErpId}`);
    } catch (err) {
      console.error(`[tick] ✗ new_invoice fallita per ${cust.customerErpId}`, err);
    }
  }
}

async function processPreDueNotifications(pool: Pool, customers: CustomerToNotify[]): Promise<void> {
  const eligible = customers.filter(c => c.notifyPreDue && c.agentEmail && c.effectiveEmail);
  if (eligible.length === 0) return;

  for (const cust of eligible) {
    try {
      const { rows } = await pool.query(`
        SELECT DISTINCT oi.invoice_number,
               oi.invoice_remaining_amount::numeric AS remaining_amount,
               oi.invoice_due_date AS due_date, 0 AS days_past_due
        FROM agents.order_invoices oi
        JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
        JOIN agents.customers c ON c.user_id = o.user_id
          AND c.account_num = o.customer_account_num AND c.deleted_at IS NULL
        WHERE o.user_id = $1 AND c.erp_id = $2
          AND oi.invoice_remaining_amount NOT IN ('0', '')
          AND oi.invoice_remaining_amount IS NOT NULL
          AND oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
          AND oi.invoice_amount ~ '^-?[0-9.]+$'
          AND oi.invoice_amount::numeric > 0
          AND oi.invoice_due_date IS NOT NULL
          AND oi.invoice_due_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($3 || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM agents.invoice_notification_log log
            WHERE log.user_id = $1 AND log.invoice_number = oi.invoice_number
              AND log.event_type = 'pre_due' AND log.channel = 'email'
          )
      `, [cust.userId, cust.customerErpId, cust.preDueDays]);

      if (rows.length === 0) continue;

      const { sendEmail } = await import('./mailer');
      const { buildEmailContent } = await import('./templates/email');

      const totalAmount = rows.reduce((s, r) => s + Number(r.remaining_amount), 0);

      const { getCustomTemplate: getPreDueTmpl, applyTemplateVariables: applyPreDueVars } = await import('./template-loader');
      const customPreDueTmpl = await getPreDueTmpl(pool, cust.userId, 'pre_due', 'cordiale', 'email', cust.customerErpId);
      const subjectToUse = customPreDueTmpl?.subject_tmpl
        ? applyPreDueVars(customPreDueTmpl.subject_tmpl, {
            n_fatture: String(rows.length),
            cliente_nome: cust.customerName,
            agente_nome: cust.agentName,
            giorni: String(cust.preDueDays),
          })
        : `Promemoria scadenza — ${rows.length} ${rows.length === 1 ? 'fattura' : 'fatture'} in scadenza entro ${cust.preDueDays} giorni`;

      let preDueEmailCtx: Parameters<typeof buildEmailContent>[0] = {
        customerName: cust.customerName,
        agentName: cust.agentName,
        agentTitle: cust.agentTitle,
        agentEmail: cust.agentEmail!,
        agentPhone: cust.agentPhone,
        tone: 'cordiale' as const,
        invoices: rows.map(r => ({
          invoiceNumber: r.invoice_number,
          remainingAmount: Number(r.remaining_amount),
          dueDate: r.due_date,
          daysPastDue: 0,
        })),
        totalAmount,
      };
      if (customPreDueTmpl?.body_tmpl) {
        preDueEmailCtx = {
          ...preDueEmailCtx,
          customIntro: applyPreDueVars(customPreDueTmpl.body_tmpl, {
            cliente_nome: cust.customerName,
            agente_nome: cust.agentName,
            n_fatture: String(rows.length),
            giorni: String(cust.preDueDays),
            totale: new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(totalAmount),
          }),
        };
      }
      const { html, replyTo } = buildEmailContent(preDueEmailCtx);
      const preDueAttachments = await fetchPdfAttachments(pool, cust.userId, rows.map(r => r.invoice_number));

      await sendEmail({ to: cust.effectiveEmail!, replyTo, fromName: cust.agentName, subject: subjectToUse, html, attachments: preDueAttachments.length > 0 ? preDueAttachments : undefined });

      for (const inv of rows) {
        await pool.query(
          `INSERT INTO agents.invoice_notification_log
             (user_id, customer_erp_id, invoice_number, event_type, channel, step_index, tone, days_past_due)
           VALUES ($1, $2, $3, 'pre_due', 'email', -1, 'cordiale', 0)
           ON CONFLICT DO NOTHING`,
          [cust.userId, cust.customerErpId, inv.invoice_number],
        );
      }

      await pool.query(
        `INSERT INTO agents.notifications (user_id, type, severity, title, body, data, expires_at)
         VALUES ($1, 'pre_due', 'warning', $2, $3, $4, NOW() + INTERVAL '7 days')`,
        [cust.userId, `⏰ Pre-scadenza: ${cust.customerName}`, `${rows.length} fattur${rows.length === 1 ? 'a in scadenza' : 'e in scadenza'} entro ${cust.preDueDays} giorni`,
         JSON.stringify({ customerErpId: cust.customerErpId, count: rows.length, preDueDays: cust.preDueDays })],
      ).catch(() => null);
      await createAgendaNote(pool, cust.userId, cust.customerErpId, {
        title: `Pre-scadenza notificata: ${rows.length} fattur${rows.length === 1 ? 'a' : 'e'}`,
        body: `Email inviata a ${cust.effectiveEmail} · ${rows.map((r: { invoice_number: string }) => r.invoice_number).join(', ')} · scadenza entro ${cust.preDueDays}gg`,
      });
      console.log(`[tick] ⏰ pre_due email inviata a ${cust.effectiveEmail} per ${cust.customerErpId}`);
    } catch (err) {
      console.error(`[tick] ✗ pre_due fallita per ${cust.customerErpId}`, err);
    }
  }
}

async function processPeriodicStatements(pool: Pool, customers: CustomerToNotify[]): Promise<void> {
  const eligible = customers.filter(c => c.periodicStatementEnabled && c.agentEmail && c.effectiveEmail);
  if (eligible.length === 0) return;

  for (const cust of eligible) {
    try {
      // Controlla l'ultimo invio per questo cliente/canale
      const { rows: logRows } = await pool.query(
        `SELECT sent_at FROM agents.notification_periodic_log
         WHERE user_id = $1 AND customer_erp_id = $2 AND channel = 'email'
         ORDER BY sent_at DESC LIMIT 1`,
        [cust.userId, cust.customerErpId],
      );

      const lastSentAt = logRows[0]?.sent_at ?? null;
      const daysSinceLast = lastSentAt
        ? Math.floor((Date.now() - new Date(lastSentAt).getTime()) / 86400000)
        : Infinity;

      if (daysSinceLast < cust.periodicStatementDays) continue;

      // Recupera situazione economica attuale
      const { rows: invoices } = await pool.query(`
        SELECT
          oi.invoice_number,
          oi.invoice_amount::numeric AS invoice_amount,
          oi.invoice_remaining_amount::numeric AS remaining_amount,
          oi.invoice_due_date AS due_date,
          (CURRENT_DATE - oi.invoice_due_date::date)::int AS days_past_due
        FROM agents.order_invoices oi
        JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
        JOIN agents.customers c ON c.user_id = o.user_id AND c.account_num = o.customer_account_num AND c.deleted_at IS NULL
        WHERE o.user_id = $1 AND c.erp_id = $2
          AND oi.invoice_remaining_amount NOT IN ('0','')
          AND oi.invoice_remaining_amount IS NOT NULL
          AND oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
          AND oi.invoice_amount ~ '^-?[0-9.]+$'
          AND oi.invoice_amount::numeric > 0
        ORDER BY days_past_due DESC, due_date ASC NULLS LAST
      `, [cust.userId, cust.customerErpId]);

      if (invoices.length === 0) continue; // Niente da segnalare — tutto saldato

      const { sendEmail } = await import('./mailer');
      const { buildEmailContent } = await import('./templates/email');

      const totalAmount = invoices.reduce((s: number, r: { remaining_amount: string }) => s + parseFloat(r.remaining_amount), 0);
      const emailCtx = {
        customerName: cust.customerName,
        agentName: cust.agentName,
        agentTitle: cust.agentTitle,
        agentEmail: cust.agentEmail!,
        agentPhone: cust.agentPhone,
        tone: 'cordiale' as const,
        invoices: invoices.map((r: { invoice_number: string; remaining_amount: string; due_date: string | null; days_past_due: number }) => ({
          invoiceNumber: r.invoice_number,
          remainingAmount: parseFloat(r.remaining_amount),
          dueDate: r.due_date,
          daysPastDue: r.days_past_due,
        })),
        totalAmount,
      };
      const { html, replyTo } = buildEmailContent(emailCtx);
      const subject = `Estratto conto — ${invoices.length} fatture aperte · ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(totalAmount)}`;

      await sendEmail({ to: cust.effectiveEmail!, replyTo, fromName: cust.agentName, subject, html });

      const periodBucket = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Log dedup
      await pool.query(
        `INSERT INTO agents.notification_periodic_log (user_id, customer_erp_id, channel, period_bucket)
         VALUES ($1, $2, 'email', $3)
         ON CONFLICT (user_id, customer_erp_id, period_bucket, channel) DO NOTHING`,
        [cust.userId, cust.customerErpId, periodBucket],
      );

      // Nota agenda
      await createAgendaNote(pool, cust.userId, cust.customerErpId, {
        title: `Estratto conto inviato`,
        body: `${invoices.length} fatture aperte · Totale: ${totalAmount.toFixed(2)}€`,
      });

      // Notifica PWA — scrivi in agents.notifications → backend SSE lo pushia automaticamente
      await pool.query(
        `INSERT INTO agents.notifications (user_id, type, severity, title, body, data, expires_at)
         VALUES ($1, 'periodic_statement', 'info', $2, $3, $4, NOW() + INTERVAL '7 days')`,
        [
          cust.userId,
          `Estratto conto inviato: ${cust.customerName}`,
          `${invoices.length} fatture aperte · ${totalAmount.toFixed(2)}€`,
          JSON.stringify({ customerErpId: cust.customerErpId, invoiceCount: invoices.length, totalAmount }),
        ],
      );

      console.log(`[tick] 📊 estratto conto inviato a ${cust.effectiveEmail} per ${cust.customerErpId}`);
    } catch (err) {
      console.error(`[tick] ✗ estratto conto fallito per ${cust.customerErpId}`, err);
    }
  }
}

async function detectAndNotifyPayments(pool: Pool): Promise<void> {
  // Trova fatture che avevano notifiche inviate e sono ora saldate (remaining = '0')
  const { rows: paidInvoices } = await pool.query(`
    SELECT DISTINCT
      log.user_id,
      log.customer_erp_id,
      log.invoice_number,
      MIN(log.sent_at) AS first_notified_at,
      MAX(log.days_past_due) AS max_days_past_due
    FROM agents.invoice_notification_log log
    WHERE log.event_type IN ('overdue_step', 'pre_due')
      AND NOT EXISTS (
        SELECT 1 FROM agents.invoice_notification_log paid
        WHERE paid.user_id = log.user_id
          AND paid.invoice_number = log.invoice_number
          AND paid.event_type = 'payment_received'
      )
      AND EXISTS (
        SELECT 1 FROM agents.order_invoices oi
        JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
        WHERE o.user_id = log.user_id
          AND oi.invoice_number = log.invoice_number
          AND (oi.invoice_remaining_amount IN ('0', '') OR oi.invoice_remaining_amount IS NULL)
      )
    GROUP BY log.user_id, log.customer_erp_id, log.invoice_number
  `);

  for (const inv of paidInvoices) {
    try {
      const daysToPayment = inv.first_notified_at
        ? Math.floor((Date.now() - new Date(inv.first_notified_at).getTime()) / 86400000)
        : null;

      // Log pagamento rilevato (evita dedup su rilevamenti successivi)
      await pool.query(
        `INSERT INTO agents.invoice_notification_log
           (user_id, customer_erp_id, invoice_number, event_type, channel, step_index, tone, days_past_due)
         VALUES ($1, $2, $3, 'payment_received', 'system', 0, null, 0)
         ON CONFLICT DO NOTHING`,
        [inv.user_id, inv.customer_erp_id, inv.invoice_number],
      );

      // Nota agenda con timer
      await createAgendaNote(pool, inv.user_id, inv.customer_erp_id, {
        title: `✅ Fattura saldata: ${inv.invoice_number}`,
        body: daysToPayment !== null
          ? `Pagamento ricevuto ${daysToPayment} giorni dopo il primo sollecito`
          : 'Pagamento ricevuto',
      });

      // Notifica PWA agente
      await pool.query(
        `INSERT INTO agents.notifications (user_id, type, severity, title, body, data, expires_at)
         VALUES ($1, 'payment_received', 'success', $2, $3, $4, NOW() + INTERVAL '14 days')`,
        [
          inv.user_id,
          `✅ Fattura saldata: ${inv.invoice_number}`,
          daysToPayment !== null
            ? `Incassata ${daysToPayment} giorni dopo il sollecito`
            : 'Pagamento ricevuto',
          JSON.stringify({
            customerErpId: inv.customer_erp_id,
            invoiceNumber: inv.invoice_number,
            daysToPayment,
            maxDaysPastDue: inv.max_days_past_due,
          }),
        ],
      );

      console.log(`[tick] ✅ pagamento rilevato: ${inv.invoice_number} (${daysToPayment ?? '?'} giorni dal sollecito)`);
    } catch (err) {
      console.error(`[tick] ✗ detectPayment fallito per ${inv.invoice_number}`, err);
    }
  }
}

export async function runTick(pool: Pool): Promise<void> {
  const { config } = await import('./config');
  const { sendEmail } = await import('./mailer');

  console.log('[tick] avvio ciclo notifiche', new Date().toISOString());

  const customers = await getCustomersToNotify(pool);

  const cancelled = await cancelPaidWaPending(pool);
  if (cancelled > 0) {
    console.log(`[tick] auto-cancelled ${cancelled} WA pending per fatture saldate`);
  }

  await detectAndNotifyPayments(pool);

  await processNewInvoiceNotifications(pool, customers);
  await processPreDueNotifications(pool, customers);

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
      const emailStep = getApplicableStep(inv.daysPastDue, cust.steps, emailSentSteps, 'email');
      if (emailStep) {
        emailInvoices.push({ ...inv, applicableStep: emailStep });
      }

      const waSentSteps = await getSentStepsForInvoice(pool, cust.userId, inv.invoiceNumber, 'whatsapp');
      const waStep = getApplicableStep(inv.daysPastDue, cust.steps, waSentSteps, 'whatsapp');
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
        const { getCustomTemplate: getOverdueTmpl, applyTemplateVariables: applyOverdueVars } = await import('./template-loader');
        const customOverdueTmpl = await getOverdueTmpl(pool, cust.userId, 'overdue_step', tone, 'email', cust.customerErpId);

        let emailCtx: Parameters<typeof buildEmailContent>[0] = {
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
        if (customOverdueTmpl?.body_tmpl) {
          emailCtx = {
            ...emailCtx,
            customIntro: applyOverdueVars(customOverdueTmpl.body_tmpl, {
              cliente_nome: cust.customerName,
              agente_nome: cust.agentName,
              n_fatture: String(emailInvoices.length),
              tono: tone,
              totale: new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(emailTotalAmount),
            }),
          };
        }
        const { subject, html, replyTo } = buildEmailContent(emailCtx);

        const finalSubject = customOverdueTmpl?.subject_tmpl
          ? applyOverdueVars(customOverdueTmpl.subject_tmpl, {
              n_fatture: String(emailInvoices.length),
              cliente_nome: cust.customerName,
              agente_nome: cust.agentName,
              tono: tone,
              totale: new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(emailTotalAmount),
            })
          : subject;

        const escalationAttachments = await fetchPdfAttachments(pool, cust.userId, emailInvoices.map(i => i.invoiceNumber));
        await sendEmail({ to: cust.effectiveEmail, replyTo, fromName: cust.agentName, subject: finalSubject, html, attachments: escalationAttachments.length > 0 ? escalationAttachments : undefined });

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
      const { getCustomTemplate: getWaTmpl, applyTemplateVariables: applyWaVars } = await import('./template-loader');
      const customWaTmpl = await getWaTmpl(pool, cust.userId, 'overdue_step', tone, 'whatsapp', cust.customerErpId);
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
        customIntro: customWaTmpl?.body_tmpl
          ? applyWaVars(customWaTmpl.body_tmpl, {
              cliente_nome: cust.customerName,
              agente_nome: cust.agentName,
              n_fatture: String(waInvoices.length),
              tono: tone,
              totale: new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(waTotalAmount),
            })
          : undefined,
      });
      const stepIndex = Math.max(...waInvoices.map(i => i.applicableStep.index));
      // Se email inviata allo stesso cliente, aggiunge nota PDF nel testo WA
      const waTextFinal = (emailInvoices.length > 0 && cust.effectiveEmail)
        ? waText + `\n\n📎 Il PDF è allegato all'email inviata a ${cust.effectiveEmail}.`
        : waText;
      await createPendingWa(pool, cust.userId, cust.customerErpId, cust.effectiveWhatsapp, waTextFinal, tone, stepIndex, waInvoices.map(i => i.invoiceNumber), waTotalAmount);

      for (const inv of waInvoices) {
        await logNotificationEvent(pool, cust.userId, cust.customerErpId, inv.invoiceNumber, inv.applicableStep.index, tone, 'whatsapp', inv.daysPastDue);
      }
      console.log(`[tick] 💬 WA pending creato per ${cust.customerErpId}`);
    }
  }

  await processPeriodicStatements(pool, customers);

  console.log('[tick] ciclo completato');
}
