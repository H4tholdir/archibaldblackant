import type { DbPool } from '../pool';

export type InvoiceStatus = 'overdue' | 'due_soon' | 'open' | 'paid';

const CUSTOMER_INFO_SQL = `
  SELECT
    c.blocked_status,
    COALESCE(ns.email_override, c.email) AS effective_email,
    COALESCE(ns.whatsapp_override, c.mobile) AS effective_whatsapp
  FROM agents.customers c
  LEFT JOIN agents.invoice_notification_settings ns
    ON ns.user_id = $1 AND ns.customer_erp_id = $2
  WHERE c.user_id = $1 AND c.erp_id = $2 AND c.deleted_at IS NULL
  LIMIT 1
`;

export type LedgerInvoice = {
  invoiceNumber: string;
  orderId: string | null;
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
        o.id AS order_id,
        oi.invoice_date,
        CASE WHEN oi.invoice_amount ~ '^-?[0-9.]+$'
          THEN oi.invoice_amount::numeric ELSE 0 END AS invoice_amount_num,
        CASE WHEN oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
          THEN oi.invoice_remaining_amount::numeric ELSE 0 END AS remaining_num,
        CASE WHEN oi.invoice_settled_amount ~ '^-?[0-9.]+$'
          THEN oi.invoice_settled_amount::numeric ELSE 0 END AS settled_num,
        oi.invoice_due_date,
        CASE WHEN oi.invoice_due_date IS NOT NULL
          THEN (CURRENT_DATE - oi.invoice_due_date::date)::int ELSE 0 END AS days_past_due,
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
    customer_info AS (${CUSTOMER_INFO_SQL})
    SELECT
      i.*,
      ci.blocked_status,
      ci.effective_email,
      ci.effective_whatsapp
    FROM invoices i, customer_info ci
    ORDER BY
      CASE WHEN i.invoice_amount_num < 0 THEN 1 WHEN i.invoice_amount_num > 0 THEN 0 ELSE 0 END,
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
  if (invoice.invoice_amount_num < 0) return 'open';
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
  order_id: string | null;
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
    orderId: row.order_id ?? null,
    invoiceDate: row.invoice_date,
    invoiceAmount: amount,
    remainingAmount: remaining,
    settledAmount: settled,
    dueDate: row.invoice_due_date,
    daysPastDue: days,
    lastPaymentId: row.invoice_last_payment_id,
    lastSettlementDate: row.invoice_last_settlement_date,
    isNc: amount < 0,
    status: classifyStatus({
      remaining_num: remaining,
      invoice_amount_num: amount,
      days_past_due: days,
      invoice_due_date: row.invoice_due_date,
    }),
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
    const ciRows = await pool.query<{
      blocked_status: string | null;
      effective_email: string | null;
      effective_whatsapp: string | null;
    }>(CUSTOMER_INFO_SQL, [userId, customerErpId]);
    const ci = ciRows.rows[0] ?? {
      blocked_status: null,
      effective_email: null,
      effective_whatsapp: null,
    };
    return {
      totalDaSaldare: 0,
      totalScaduto: 0,
      totalIncassatoAperte: 0,
      totalNcAperte: 0,
      maxDaysPastDue: 0,
      openInvoices: [],
      ncInvoices: [],
      paidInvoices: [],
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
    totalScaduto: openInvoices
      .filter(i => i.daysPastDue > 0)
      .reduce((s, i) => s + i.remainingAmount, 0),
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
  const { rows } = await pool.query<LedgerRow>(
    `SELECT
       oi.invoice_number, o.id AS order_id, oi.invoice_date,
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
     JOIN agents.customers c ON c.user_id = o.user_id
       AND c.account_num = o.customer_account_num
       AND c.deleted_at IS NULL
     WHERE o.user_id = $1 AND c.erp_id = $2
       AND (oi.invoice_remaining_amount IN ('0','') OR oi.invoice_remaining_amount IS NULL)
     ORDER BY oi.invoice_date DESC NULLS LAST
     LIMIT 50`,
    [userId, customerErpId],
  );
  return rows.map(r => ({ ...mapRow(r), status: 'paid' as InvoiceStatus }));
}
