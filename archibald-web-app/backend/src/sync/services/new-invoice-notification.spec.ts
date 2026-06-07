import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchNewInvoiceNotification, isRecentInvoice, buildWaMessage, buildEmailSubject, buildEmailBody } from './new-invoice-notification';
import type { DbPool } from '../../db/pool';

// ─── Pure function tests ─────────────────────────────────────────────────────

describe('isRecentInvoice', () => {
  it('returns true for invoice dated yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);
    expect(isRecentInvoice(dateStr)).toBe(true);
  });

  it('returns true for invoice dated exactly 30 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    expect(isRecentInvoice(d.toISOString().slice(0, 10))).toBe(true);
  });

  it('returns false for invoice dated 31 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 31);
    expect(isRecentInvoice(d.toISOString().slice(0, 10))).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRecentInvoice(undefined)).toBe(false);
  });

  it('returns false for invalid string', () => {
    expect(isRecentInvoice('not-a-date')).toBe(false);
  });
});

describe('buildWaMessage', () => {
  it('includes billing name when provided', () => {
    const msg = buildWaMessage('Mario Rossi', 'INV-001', '1.234,56', '30/06/2026');
    expect(msg).toContain('Mario Rossi');
    expect(msg).toContain('INV-001');
    expect(msg).toContain('1.234,56');
    expect(msg).toContain('30/06/2026');
  });

  it('falls back to generic greeting when no billing name', () => {
    const msg = buildWaMessage(undefined, 'INV-002', undefined, undefined);
    expect(msg).toContain('Gentile Cliente');
    expect(msg).toContain('INV-002');
  });
});

describe('buildEmailSubject', () => {
  it('includes invoice number', () => {
    expect(buildEmailSubject('INV-123')).toContain('INV-123');
  });
});

describe('buildEmailBody', () => {
  it('includes all provided fields', () => {
    const body = buildEmailBody('Luca Bianchi', 'INV-005', '500,00', '15/07/2026');
    expect(body).toContain('Luca Bianchi');
    expect(body).toContain('INV-005');
    expect(body).toContain('500,00');
    expect(body).toContain('15/07/2026');
  });

  it('omits amount and due-date lines when not provided', () => {
    const body = buildEmailBody(undefined, 'INV-006', undefined, undefined);
    expect(body).toContain('INV-006');
    expect(body).not.toContain('Importo');
    expect(body).not.toContain('Scadenza');
  });
});

// ─── dispatchNewInvoiceNotification ─────────────────────────────────────────

type QueryMock = ReturnType<typeof vi.fn>;

function makePool(queryResponses: Record<number, { rows: unknown[]; rowCount?: number }>): DbPool {
  let callIndex = 0;
  const query: QueryMock = vi.fn((_sql: unknown, _params?: unknown) => {
    const response = queryResponses[callIndex++] ?? { rows: [], rowCount: 0 };
    return Promise.resolve({ rows: response.rows, rowCount: response.rowCount ?? response.rows.length });
  });
  return { query } as unknown as DbPool;
}

const recentDate = new Date();
recentDate.setDate(recentDate.getDate() - 5);
const RECENT_DATE = recentDate.toISOString().slice(0, 10);

const oldDate = new Date();
oldDate.setDate(oldDate.getDate() - 40);
const OLD_DATE = oldDate.toISOString().slice(0, 10);

const BASE_INV = {
  invoiceNumber: 'INV-TEST-001',
  orderNumber: 'ORD-001',
  invoiceDate: RECENT_DATE,
  invoiceAmount: '1.000,00',
  invoiceDueDate: '31/07/2026',
  invoiceBillingName: 'Studio Rossi',
};

describe('dispatchNewInvoiceNotification', () => {
  it('skips when invoice is older than 30 days', async () => {
    const pool = makePool({});
    const sendEmail = vi.fn();
    await dispatchNewInvoiceNotification({ pool, sendEmail }, 'user1', { ...BASE_INV, invoiceDate: OLD_DATE });
    expect((pool.query as QueryMock)).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('skips when no order found', async () => {
    const pool = makePool({ 0: { rows: [] } }); // order query returns empty
    const sendEmail = vi.fn();
    await dispatchNewInvoiceNotification({ pool, sendEmail }, 'user1', BASE_INV);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('skips when notify_new_invoice is false', async () => {
    const pool = makePool({
      0: { rows: [{ customer_account_num: 'CUST-001' }] }, // order
      1: { rows: [{ customer_erp_id: 'ERP-001', notify_new_invoice: false, new_invoice_channels: ['email'], effective_email: 'test@test.com', effective_whatsapp: null }] },
    });
    const sendEmail = vi.fn();
    await dispatchNewInvoiceNotification({ pool, sendEmail }, 'user1', BASE_INV);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('inserts pending_wa when whatsapp channel configured and phone present', async () => {
    const pool = makePool({
      0: { rows: [{ customer_account_num: 'CUST-001' }] },
      1: { rows: [{ customer_erp_id: 'ERP-001', notify_new_invoice: true, new_invoice_channels: ['whatsapp'], effective_email: null, effective_whatsapp: '+391234567890' }] },
      2: { rows: [], rowCount: 1 }, // log insert succeeds
      3: { rows: [], rowCount: 1 }, // pending_wa insert
    });
    const sendEmail = vi.fn();
    await dispatchNewInvoiceNotification({ pool, sendEmail }, 'user1', BASE_INV);

    const queryMock = pool.query as QueryMock;
    const calls = queryMock.mock.calls.map(([sql]) => (sql as string).toLowerCase());
    expect(calls.some(s => s.includes('invoice_notification_log'))).toBe(true);
    expect(calls.some(s => s.includes('invoice_notification_pending_wa'))).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends email when email channel configured and address present', async () => {
    const pool = makePool({
      0: { rows: [{ customer_account_num: 'CUST-001' }] },
      1: { rows: [{ customer_erp_id: 'ERP-001', notify_new_invoice: true, new_invoice_channels: ['email'], effective_email: 'cliente@test.com', effective_whatsapp: null }] },
      2: { rows: [], rowCount: 1 }, // log insert succeeds
      3: { rows: [] },              // PDF cache query (no PDF)
    });
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    await dispatchNewInvoiceNotification({ pool, sendEmail }, 'user1', BASE_INV);
    expect(sendEmail).toHaveBeenCalledOnce();
    const [to, subject, _body, pdfBuffer] = sendEmail.mock.calls[0] as [string, string, string, Buffer | undefined];
    expect(to).toBe('cliente@test.com');
    expect(subject).toContain('INV-TEST-001');
    expect(pdfBuffer).toBeUndefined();
  });

  it('attaches PDF when cached in DB', async () => {
    const fakePdf = Buffer.from('fake-pdf');
    const pool = makePool({
      0: { rows: [{ customer_account_num: 'CUST-001' }] },
      1: { rows: [{ customer_erp_id: 'ERP-001', notify_new_invoice: true, new_invoice_channels: ['email'], effective_email: 'cliente@test.com', effective_whatsapp: null }] },
      2: { rows: [], rowCount: 1 },
      3: { rows: [{ invoice_pdf_data: fakePdf }] }, // PDF cached
    });
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    await dispatchNewInvoiceNotification({ pool, sendEmail }, 'user1', BASE_INV);
    const [, , , pdfBuffer] = sendEmail.mock.calls[0] as [string, string, string, Buffer | undefined];
    expect(pdfBuffer).toEqual(fakePdf);
  });

  it('skips email dispatch when log insert returns 0 (duplicate)', async () => {
    const pool = makePool({
      0: { rows: [{ customer_account_num: 'CUST-001' }] },
      1: { rows: [{ customer_erp_id: 'ERP-001', notify_new_invoice: true, new_invoice_channels: ['email'], effective_email: 'cliente@test.com', effective_whatsapp: null }] },
      2: { rows: [], rowCount: 0 }, // log insert: ON CONFLICT DO NOTHING → 0 rows
    });
    const sendEmail = vi.fn();
    await dispatchNewInvoiceNotification({ pool, sendEmail }, 'user1', BASE_INV);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not throw when email send fails', async () => {
    const pool = makePool({
      0: { rows: [{ customer_account_num: 'CUST-001' }] },
      1: { rows: [{ customer_erp_id: 'ERP-001', notify_new_invoice: true, new_invoice_channels: ['email'], effective_email: 'cliente@test.com', effective_whatsapp: null }] },
      2: { rows: [], rowCount: 1 },
      3: { rows: [] },
    });
    const sendEmail = vi.fn().mockRejectedValue(new Error('SMTP error'));
    await expect(dispatchNewInvoiceNotification({ pool, sendEmail }, 'user1', BASE_INV)).resolves.toBeUndefined();
  });
});
