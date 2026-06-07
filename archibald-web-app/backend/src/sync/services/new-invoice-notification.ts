import type { DbPool } from '../../db/pool';
import { logger } from '../../logger';

export const NEW_INVOICE_STEP_INDEX = -1;
const RECENCY_DAYS = 30;

export type NewlyInsertedInvoice = {
  invoiceNumber: string;
  orderNumber: string;
  invoiceDate?: string;
  invoiceAmount?: string;
  invoiceDueDate?: string;
  invoiceBillingName?: string;
};

export type SendInvoiceEmailFn = (
  to: string,
  subject: string,
  body: string,
  pdfBuffer?: Buffer,
  fileName?: string,
) => Promise<void>;

export type DispatchDeps = {
  pool: DbPool;
  sendEmail?: SendInvoiceEmailFn;
};

export function isRecentInvoice(invoiceDate: string | undefined): boolean {
  if (!invoiceDate) return false;
  const date = new Date(invoiceDate);
  if (isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const daysDiff = (today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= RECENCY_DAYS;
}

export function buildWaMessage(
  billingName: string | undefined,
  invoiceNumber: string,
  invoiceAmount: string | undefined,
  invoiceDueDate: string | undefined,
): string {
  const greeting = billingName ? `Gentile ${billingName}` : 'Gentile Cliente';
  const amountStr = invoiceAmount ? ` di €${invoiceAmount}` : '';
  const dueDateStr = invoiceDueDate ? ` con scadenza il ${invoiceDueDate}` : '';
  return `${greeting},\n\nLe comunichiamo che è disponibile la fattura n. ${invoiceNumber}${amountStr}${dueDateStr}.\n\nCordiali saluti`;
}

export function buildEmailSubject(invoiceNumber: string): string {
  return `Nuova fattura disponibile — n. ${invoiceNumber}`;
}

export function buildEmailBody(
  billingName: string | undefined,
  invoiceNumber: string,
  invoiceAmount: string | undefined,
  invoiceDueDate: string | undefined,
): string {
  const greeting = billingName ? `Gentile ${billingName},` : 'Gentile Cliente,';
  const amountLine = invoiceAmount ? `\nImporto: €${invoiceAmount}` : '';
  const dueLine = invoiceDueDate ? `\nScadenza: ${invoiceDueDate}` : '';
  return `${greeting}\n\nÈ disponibile la fattura n. ${invoiceNumber}${amountLine}${dueLine}.\n\nCordiali saluti`;
}

export async function dispatchNewInvoiceNotification(
  deps: DispatchDeps,
  userId: string,
  inv: NewlyInsertedInvoice,
): Promise<void> {
  const { pool, sendEmail } = deps;

  if (!isRecentInvoice(inv.invoiceDate)) return;

  const { rows: orderRows } = await pool.query<{ customer_account_num: string }>(
    `SELECT customer_account_num FROM agents.order_records WHERE order_number = $1 AND user_id = $2`,
    [inv.orderNumber, userId],
  );
  if (!orderRows[0]) return;

  const { customer_account_num } = orderRows[0];

  const { rows: settingsRows } = await pool.query<{
    customer_erp_id: string;
    notify_new_invoice: boolean;
    new_invoice_channels: ('email' | 'whatsapp')[];
    effective_email: string | null;
    effective_whatsapp: string | null;
  }>(
    `SELECT
       c.erp_id AS customer_erp_id,
       COALESCE(ns.notify_new_invoice, false) AS notify_new_invoice,
       COALESCE(ns.new_invoice_channels, ARRAY['email']::text[]) AS new_invoice_channels,
       COALESCE(ns.email_override, c.email) AS effective_email,
       COALESCE(ns.whatsapp_override, c.mobile) AS effective_whatsapp
     FROM agents.customers c
     LEFT JOIN agents.invoice_notification_settings ns
       ON ns.user_id = c.user_id AND ns.customer_erp_id = c.erp_id
     WHERE c.user_id = $1 AND c.account_num = $2 AND c.deleted_at IS NULL`,
    [userId, customer_account_num],
  );
  if (!settingsRows[0]) return;

  const s = settingsRows[0];
  if (!s.notify_new_invoice) return;

  const channels = s.new_invoice_channels ?? ['email'];

  if (channels.includes('whatsapp') && s.effective_whatsapp) {
    const messageText = buildWaMessage(inv.invoiceBillingName, inv.invoiceNumber, inv.invoiceAmount, inv.invoiceDueDate);

    const { rowCount: logInserted } = await pool.query(
      `INSERT INTO agents.invoice_notification_log
         (user_id, customer_erp_id, invoice_number, event_type, channel, step_index, tone)
       VALUES ($1, $2, $3, 'new_invoice', 'whatsapp', $4, 'gentile')
       ON CONFLICT (user_id, invoice_number, step_index, channel) DO NOTHING`,
      [userId, s.customer_erp_id, inv.invoiceNumber, NEW_INVOICE_STEP_INDEX],
    );

    if ((logInserted ?? 0) > 0) {
      await pool.query(
        `INSERT INTO agents.invoice_notification_pending_wa
           (user_id, customer_erp_id, phone_to, message_text, tone, step_index, invoice_numbers, total_amount)
         SELECT $1, $2, $3, $4, 'gentile', $5, $6, $7
         WHERE NOT EXISTS (
           SELECT 1 FROM agents.invoice_notification_pending_wa
           WHERE user_id = $1 AND customer_erp_id = $2
             AND $6::text[] && invoice_numbers
             AND status IN ('pending','opened_by_agent')
         )`,
        [
          userId, s.customer_erp_id, s.effective_whatsapp, messageText,
          NEW_INVOICE_STEP_INDEX, [inv.invoiceNumber],
          inv.invoiceAmount ?? null,
        ],
      );
      logger.info('[NewInvoiceNotif] WA queued', { userId, invoiceNumber: inv.invoiceNumber });
    }
  }

  if (channels.includes('email') && s.effective_email && sendEmail) {
    const { rowCount: logInserted } = await pool.query(
      `INSERT INTO agents.invoice_notification_log
         (user_id, customer_erp_id, invoice_number, event_type, channel, step_index, tone)
       VALUES ($1, $2, $3, 'new_invoice', 'email', $4, 'gentile')
       ON CONFLICT (user_id, invoice_number, step_index, channel) DO NOTHING`,
      [userId, s.customer_erp_id, inv.invoiceNumber, NEW_INVOICE_STEP_INDEX],
    );

    if ((logInserted ?? 0) > 0) {
      const { rows: pdfRows } = await pool.query<{ invoice_pdf_data: Buffer | null }>(
        `SELECT invoice_pdf_data FROM agents.order_invoices
         WHERE user_id = $1 AND invoice_number = $2 AND invoice_pdf_data IS NOT NULL
         LIMIT 1`,
        [userId, inv.invoiceNumber],
      );
      const pdfBuffer = pdfRows[0]?.invoice_pdf_data ?? undefined;

      const subject = buildEmailSubject(inv.invoiceNumber);
      const body = buildEmailBody(inv.invoiceBillingName, inv.invoiceNumber, inv.invoiceAmount, inv.invoiceDueDate);

      try {
        await sendEmail(s.effective_email, subject, body, pdfBuffer, `fattura_${inv.invoiceNumber}.pdf`);
        logger.info('[NewInvoiceNotif] email inviata', { userId, invoiceNumber: inv.invoiceNumber, to: s.effective_email });
      } catch (err) {
        logger.error('[NewInvoiceNotif] email error', { userId, invoiceNumber: inv.invoiceNumber, err });
      }
    }
  }
}
