import type { DbPool } from '../../db/pool';
import type { SendInvoiceEmailFn } from './new-invoice-notification';
import { logger } from '../../logger';

export const PRE_DUE_STEP_INDEX = -2;

export type EscalationStep = {
  days_after_due: number;
  tone: 'cordiale' | 'formale' | 'urgente';
  channels: ('email' | 'whatsapp')[];
};

export type EconomicNotificationDeps = {
  sendEmail?: SendInvoiceEmailFn;
  generateStatementPdf?: (
    customerName: string,
    openInvoices: OpenInvoiceRow[],
    totalDue: number,
  ) => Promise<Buffer>;
};

export type OpenInvoiceRow = {
  invoice_number: string;
  invoice_amount: string;
  invoice_due_date: string;
  invoice_remaining_amount: string;
  days_past_due: number;
};

// ─── Message builders ────────────────────────────────────────────────────────

const TONE_GREETING: Record<string, string> = {
  cordiale: 'Gentile',
  formale: 'Egr.',
  urgente: 'URGENTE',
};

export function buildEscalationWaMessage(
  billingName: string | undefined,
  invoiceNumber: string,
  invoiceAmount: string | undefined,
  daysPastDue: number,
  tone: string,
): string {
  const greeting = TONE_GREETING[tone] ?? 'Gentile';
  const name = billingName ?? 'Cliente';
  const amountStr = invoiceAmount ? ` di €${invoiceAmount}` : '';
  if (tone === 'urgente') {
    return `${greeting} — ${name}: la fattura n. ${invoiceNumber}${amountStr} risulta insoluta da ${daysPastDue} giorni. Richiediamo pagamento immediato.`;
  }
  if (tone === 'formale') {
    return `${greeting} ${name},\n\nLa informiamo che la fattura n. ${invoiceNumber}${amountStr} risulta insoluta da ${daysPastDue} giorni. La preghiamo di provvedere al saldo.\n\nCordiali saluti`;
  }
  return `${greeting} ${name},\n\nDesideriamo ricordarLe che la fattura n. ${invoiceNumber}${amountStr} risulta scaduta da ${daysPastDue} giorni. La preghiamo di verificare il pagamento.\n\nCordiali saluti`;
}

export function buildEscalationEmailSubject(
  invoiceNumber: string,
  tone: string,
  daysPastDue: number,
): string {
  if (tone === 'urgente') return `URGENTE: fattura n. ${invoiceNumber} scaduta da ${daysPastDue} giorni`;
  if (tone === 'formale') return `Sollecito fattura n. ${invoiceNumber} — ${daysPastDue} giorni`;
  return `Promemoria fattura n. ${invoiceNumber} — ${daysPastDue} giorni`;
}

export function buildEscalationEmailBody(
  billingName: string | undefined,
  invoiceNumber: string,
  invoiceAmount: string | undefined,
  daysPastDue: number,
  tone: string,
): string {
  const greeting = billingName ? `Gentile ${billingName},` : 'Gentile Cliente,';
  const amountLine = invoiceAmount ? `\nImporto: €${invoiceAmount}` : '';
  if (tone === 'urgente') {
    return `${greeting}\n\nLa fattura n. ${invoiceNumber}${amountLine} risulta INSOLUTA da ${daysPastDue} giorni.\n\nRichiediamo il pagamento immediato per evitare ulteriori azioni.\n\nCordiali saluti`;
  }
  if (tone === 'formale') {
    return `${greeting}\n\nCon la presente Le trasmettiamo un sollecito per la fattura n. ${invoiceNumber}${amountLine}, che risulta non pagata da ${daysPastDue} giorni.\n\nLa preghiamo di provvedere al saldo con urgenza.\n\nCordiali saluti`;
  }
  return `${greeting}\n\nDesideriamo ricordarLe che la fattura n. ${invoiceNumber}${amountLine} risulta scaduta da ${daysPastDue} giorni.\n\nLa preghiamo di verificare il pagamento e, qualora lo avesse già effettuato, di ignorare questo messaggio.\n\nCordiali saluti`;
}

export function buildPreDueWaMessage(
  billingName: string | undefined,
  invoiceNumber: string,
  invoiceAmount: string | undefined,
  invoiceDueDate: string,
  preDueDays: number,
): string {
  const name = billingName ?? 'Cliente';
  const amountStr = invoiceAmount ? ` di €${invoiceAmount}` : '';
  return `Gentile ${name},\n\nLe ricordiamo che la fattura n. ${invoiceNumber}${amountStr} scadrà tra ${preDueDays} giorni (${invoiceDueDate}).\n\nCordiali saluti`;
}

export function buildPreDueEmailSubject(invoiceNumber: string, preDueDays: number): string {
  return `Promemoria scadenza — fattura n. ${invoiceNumber} tra ${preDueDays} giorni`;
}

export function buildPreDueEmailBody(
  billingName: string | undefined,
  invoiceNumber: string,
  invoiceAmount: string | undefined,
  invoiceDueDate: string,
  preDueDays: number,
): string {
  const greeting = billingName ? `Gentile ${billingName},` : 'Gentile Cliente,';
  const amountLine = invoiceAmount ? `\nImporto: €${invoiceAmount}` : '';
  return `${greeting}\n\nLe ricordiamo che la fattura n. ${invoiceNumber}${amountLine} scadrà tra ${preDueDays} giorni (${invoiceDueDate}).\n\nCordiali saluti`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSteps(raw: unknown): EscalationStep[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Step trigger date = invoice_due_date + step.days_after_due
// Gate anti-flood: step è valido solo se il suo trigger date > notifications_enabled_at
function isStepNewAfterActivation(
  invoiceDueDate: string,
  daysAfterDue: number,
  notificationsEnabledAt: string | null,
): boolean {
  if (!notificationsEnabledAt) return true;
  const triggerDate = new Date(invoiceDueDate);
  triggerDate.setDate(triggerDate.getDate() + daysAfterDue);
  const enabledAt = new Date(notificationsEnabledAt);
  return triggerDate > enabledAt;
}

async function insertLogEntry(
  pool: DbPool,
  userId: string,
  customerErpId: string,
  invoiceNumber: string,
  eventType: string,
  channel: string,
  stepIndex: number,
  tone: string,
  daysPastDue?: number,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO agents.invoice_notification_log
       (user_id, customer_erp_id, invoice_number, event_type, channel, step_index, tone, days_past_due)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, invoice_number, step_index, channel) DO NOTHING`,
    [userId, customerErpId, invoiceNumber, eventType, channel, stepIndex, tone, daysPastDue ?? null],
  );
  return (rowCount ?? 0) > 0;
}

async function insertPendingWa(
  pool: DbPool,
  userId: string,
  customerErpId: string,
  phoneTo: string,
  messageText: string,
  tone: string,
  stepIndex: number,
  invoiceNumbers: string[],
  totalAmount: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.invoice_notification_pending_wa
       (user_id, customer_erp_id, phone_to, message_text, tone, step_index, invoice_numbers, total_amount)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8
     WHERE NOT EXISTS (
       SELECT 1 FROM agents.invoice_notification_pending_wa
       WHERE user_id = $1 AND customer_erp_id = $2
         AND $7::text[] && invoice_numbers
         AND status IN ('pending','opened_by_agent')
     )`,
    [userId, customerErpId, phoneTo, messageText, tone, stepIndex, invoiceNumbers, totalAmount],
  );
}

// ─── checkEscalationNotifications ───────────────────────────────────────────

type EscalationRow = {
  invoice_number: string;
  invoice_amount: string | null;
  invoice_due_date: string;
  invoice_pdf_data: Buffer | null;
  invoice_billing_name: string | null;
  days_past_due: number;
  order_number: string;
  user_id: string;
  customer_erp_id: string;
  customer_name: string;
  effective_steps: unknown;
  effective_email: string | null;
  effective_whatsapp: string | null;
  notifications_enabled_at: string | null;
};

export async function checkEscalationNotifications(
  pool: DbPool,
  deps: EconomicNotificationDeps,
): Promise<void> {
  const { sendEmail } = deps;

  const { rows } = await pool.query<EscalationRow>(
    `SELECT
       oi.invoice_number,
       oi.invoice_amount,
       oi.invoice_due_date,
       oi.invoice_pdf_data,
       oi.invoice_billing_name,
       EXTRACT(DAY FROM (CURRENT_DATE - oi.invoice_due_date::date))::int AS days_past_due,
       o.order_number,
       o.user_id,
       c.erp_id AS customer_erp_id,
       c.name AS customer_name,
       COALESCE(ns.override_steps, p.steps) AS effective_steps,
       COALESCE(ns.email_override, c.email) AS effective_email,
       COALESCE(ns.whatsapp_override, c.mobile) AS effective_whatsapp,
       ns.notifications_enabled_at
     FROM agents.order_invoices oi
     JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
     JOIN agents.customers c ON c.user_id = o.user_id
       AND c.account_num = o.customer_account_num AND c.deleted_at IS NULL
     JOIN agents.invoice_notification_settings ns
       ON ns.user_id = o.user_id AND ns.customer_erp_id = c.erp_id
     LEFT JOIN agents.notification_profiles p ON p.id = ns.profile_id
     WHERE oi.invoice_due_date IS NOT NULL
       AND oi.invoice_due_date::date < CURRENT_DATE
       AND (oi.invoice_closed IS NULL OR oi.invoice_closed = false)
       AND oi.invoice_remaining_amount IS NOT NULL
       AND oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
       AND oi.invoice_remaining_amount::numeric > 0
       AND oi.invoice_amount IS NOT NULL
       AND oi.invoice_amount ~ '^-?[0-9.]+$'
       AND oi.invoice_amount::numeric > 0`,
  );

  for (const row of rows) {
    const steps = parseSteps(row.effective_steps);
    if (!steps.length) continue;

    for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
      const step = steps[stepIdx];
      if (row.days_past_due < step.days_after_due) continue;

      // Gate anti-flood: skip step se il suo trigger date precede notifications_enabled_at
      if (!isStepNewAfterActivation(row.invoice_due_date, step.days_after_due, row.notifications_enabled_at)) {
        continue;
      }

      for (const channel of step.channels) {
        const logged = await insertLogEntry(
          pool, row.user_id, row.customer_erp_id, row.invoice_number,
          'escalation', channel, stepIdx, step.tone, row.days_past_due,
        );
        if (!logged) continue;

        if (channel === 'whatsapp' && row.effective_whatsapp) {
          const msg = buildEscalationWaMessage(
            row.invoice_billing_name ?? undefined,
            row.invoice_number,
            row.invoice_amount ?? undefined,
            row.days_past_due,
            step.tone,
          );
          await insertPendingWa(
            pool, row.user_id, row.customer_erp_id,
            row.effective_whatsapp, msg, step.tone, stepIdx,
            [row.invoice_number], row.invoice_amount,
          );
          logger.info('[Escalation] WA queued', { userId: row.user_id, invoice: row.invoice_number, step: stepIdx });
        }

        if (channel === 'email' && row.effective_email && sendEmail) {
          if (!row.invoice_pdf_data) {
            logger.warn('[Escalation] PDF non in cache, email saltata', { invoice: row.invoice_number });
            continue;
          }
          const subject = buildEscalationEmailSubject(row.invoice_number, step.tone, row.days_past_due);
          const body = buildEscalationEmailBody(
            row.invoice_billing_name ?? undefined,
            row.invoice_number,
            row.invoice_amount ?? undefined,
            row.days_past_due,
            step.tone,
          );
          try {
            await sendEmail(
              row.effective_email, subject, body,
              row.invoice_pdf_data,
              `fattura_${row.invoice_number}.pdf`,
            );
            logger.info('[Escalation] email inviata', { userId: row.user_id, invoice: row.invoice_number, step: stepIdx });
          } catch (err) {
            logger.error('[Escalation] email error', { invoice: row.invoice_number, err });
          }
        }
      }
    }
  }
}

// ─── checkPreDueNotifications ────────────────────────────────────────────────

type PreDueRow = {
  invoice_number: string;
  invoice_amount: string | null;
  invoice_due_date: string;
  invoice_pdf_data: Buffer | null;
  invoice_billing_name: string | null;
  pre_due_days: number;
  user_id: string;
  customer_erp_id: string;
  customer_name: string;
  pre_due_channels: ('email' | 'whatsapp')[];
  effective_email: string | null;
  effective_whatsapp: string | null;
};

export async function checkPreDueNotifications(
  pool: DbPool,
  deps: EconomicNotificationDeps,
): Promise<void> {
  const { sendEmail } = deps;

  const { rows } = await pool.query<PreDueRow>(
    `SELECT
       oi.invoice_number,
       oi.invoice_amount,
       oi.invoice_due_date,
       oi.invoice_pdf_data,
       oi.invoice_billing_name,
       ns.pre_due_days,
       o.user_id,
       c.erp_id AS customer_erp_id,
       c.name AS customer_name,
       COALESCE(ns.pre_due_channels, ARRAY['email']::text[]) AS pre_due_channels,
       COALESCE(ns.email_override, c.email) AS effective_email,
       COALESCE(ns.whatsapp_override, c.mobile) AS effective_whatsapp
     FROM agents.order_invoices oi
     JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
     JOIN agents.customers c ON c.user_id = o.user_id
       AND c.account_num = o.customer_account_num AND c.deleted_at IS NULL
     JOIN agents.invoice_notification_settings ns
       ON ns.user_id = o.user_id AND ns.customer_erp_id = c.erp_id
     WHERE ns.notify_pre_due = true
       AND oi.invoice_due_date IS NOT NULL
       AND oi.invoice_due_date::date = CURRENT_DATE + (ns.pre_due_days || ' days')::interval
       AND (oi.invoice_closed IS NULL OR oi.invoice_closed = false)
       AND oi.invoice_remaining_amount IS NOT NULL
       AND oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
       AND oi.invoice_remaining_amount::numeric > 0`,
  );

  for (const row of rows) {
    const channels = row.pre_due_channels ?? ['email'];

    for (const channel of channels) {
      const logged = await insertLogEntry(
        pool, row.user_id, row.customer_erp_id, row.invoice_number,
        'pre_due', channel, PRE_DUE_STEP_INDEX, 'cordiale',
      );
      if (!logged) continue;

      if (channel === 'whatsapp' && row.effective_whatsapp) {
        const msg = buildPreDueWaMessage(
          row.invoice_billing_name ?? undefined,
          row.invoice_number,
          row.invoice_amount ?? undefined,
          row.invoice_due_date,
          row.pre_due_days,
        );
        await insertPendingWa(
          pool, row.user_id, row.customer_erp_id,
          row.effective_whatsapp, msg, 'cordiale', PRE_DUE_STEP_INDEX,
          [row.invoice_number], row.invoice_amount,
        );
        logger.info('[PreDue] WA queued', { userId: row.user_id, invoice: row.invoice_number });
      }

      if (channel === 'email' && row.effective_email && sendEmail) {
        if (!row.invoice_pdf_data) {
          logger.warn('[PreDue] PDF non in cache, email saltata', { invoice: row.invoice_number });
          continue;
        }
        const subject = buildPreDueEmailSubject(row.invoice_number, row.pre_due_days);
        const body = buildPreDueEmailBody(
          row.invoice_billing_name ?? undefined,
          row.invoice_number,
          row.invoice_amount ?? undefined,
          row.invoice_due_date,
          row.pre_due_days,
        );
        try {
          await sendEmail(
            row.effective_email, subject, body,
            row.invoice_pdf_data,
            `fattura_${row.invoice_number}.pdf`,
          );
          logger.info('[PreDue] email inviata', { userId: row.user_id, invoice: row.invoice_number });
        } catch (err) {
          logger.error('[PreDue] email error', { invoice: row.invoice_number, err });
        }
      }
    }
  }
}

// ─── checkPeriodicStatements ──────────────────────────────────────────────────

type PeriodicRow = {
  user_id: string;
  customer_erp_id: string;
  customer_name: string;
  invoice_billing_name: string | null;
  periodic_statement_days: number;
  periodic_statement_content: Record<string, boolean>;
  effective_email: string | null;
  effective_whatsapp: string | null;
};

export async function checkPeriodicStatements(
  pool: DbPool,
  deps: EconomicNotificationDeps,
): Promise<void> {
  const { sendEmail, generateStatementPdf } = deps;
  if (!sendEmail || !generateStatementPdf) return;

  const { rows: customers } = await pool.query<PeriodicRow>(
    `SELECT
       ns.user_id,
       ns.customer_erp_id,
       c.name AS customer_name,
       COALESCE(ns.email_override, c.email) AS effective_email,
       COALESCE(ns.whatsapp_override, c.mobile) AS effective_whatsapp,
       ns.periodic_statement_days,
       ns.periodic_statement_content,
       NULL AS invoice_billing_name
     FROM agents.invoice_notification_settings ns
     JOIN agents.customers c ON c.user_id = ns.user_id AND c.erp_id = ns.customer_erp_id AND c.deleted_at IS NULL
     WHERE ns.periodic_statement_enabled = true
       AND ns.effective_email IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM agents.notification_periodic_log npl
         WHERE npl.user_id = ns.user_id
           AND npl.customer_erp_id = ns.customer_erp_id
           AND npl.channel = 'email'
           AND npl.sent_at > NOW() - (ns.periodic_statement_days || ' days')::interval
       )`,
  );

  for (const row of customers) {
    if (!row.effective_email) continue;

    const { rows: openInvoices } = await pool.query<OpenInvoiceRow>(
      `SELECT
         oi.invoice_number,
         oi.invoice_amount,
         oi.invoice_due_date,
         oi.invoice_remaining_amount,
         GREATEST(0, EXTRACT(DAY FROM (CURRENT_DATE - oi.invoice_due_date::date))::int) AS days_past_due
       FROM agents.order_invoices oi
       JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
       JOIN agents.customers c ON c.user_id = o.user_id
         AND c.account_num = o.customer_account_num AND c.deleted_at IS NULL
       WHERE o.user_id = $1 AND c.erp_id = $2
         AND (oi.invoice_closed IS NULL OR oi.invoice_closed = false)
         AND oi.invoice_remaining_amount IS NOT NULL
         AND oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
         AND oi.invoice_remaining_amount::numeric > 0
       ORDER BY oi.invoice_due_date ASC`,
      [row.user_id, row.customer_erp_id],
    );

    if (!openInvoices.length) continue;

    const totalDue = openInvoices.reduce((sum, inv) => {
      const amount = parseFloat(inv.invoice_remaining_amount);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generateStatementPdf(row.customer_name, openInvoices, totalDue);
    } catch (err) {
      logger.error('[Periodic] generazione PDF fallita', { customer: row.customer_erp_id, err });
      continue;
    }

    const periodBucket = new Date();
    periodBucket.setHours(0, 0, 0, 0);

    const { rowCount: logInserted } = await pool.query(
      `INSERT INTO agents.notification_periodic_log
         (user_id, customer_erp_id, channel, period_bucket)
       VALUES ($1, $2, 'email', $3)
       ON CONFLICT (user_id, customer_erp_id, period_bucket, channel) DO NOTHING`,
      [row.user_id, row.customer_erp_id, periodBucket.toISOString().slice(0, 10)],
    );
    if ((logInserted ?? 0) === 0) continue;

    const subject = `Estratto conto — ${row.customer_name}`;
    const body = `Gentile Cliente,\n\nIn allegato trova l'estratto conto aggiornato con le fatture aperte.\n\nTotale aperto: €${totalDue.toFixed(2).replace('.', ',')}\n\nCordiali saluti`;

    try {
      await sendEmail(
        row.effective_email, subject, body,
        pdfBuffer,
        `estratto_conto_${row.customer_erp_id}_${periodBucket.toISOString().slice(0, 10)}.pdf`,
      );
      logger.info('[Periodic] estratto conto inviato', { userId: row.user_id, customer: row.customer_erp_id });
    } catch (err) {
      logger.error('[Periodic] email error', { customer: row.customer_erp_id, err });
    }
  }
}
