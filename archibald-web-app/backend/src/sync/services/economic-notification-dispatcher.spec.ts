import { describe, it, expect, vi } from 'vitest';
import {
  buildEscalationWaMessage,
  buildEscalationEmailSubject,
  buildEscalationEmailBody,
  buildPreDueWaMessage,
  buildPreDueEmailSubject,
  buildPreDueEmailBody,
  checkEscalationNotifications,
  checkPreDueNotifications,
  checkPeriodicStatements,
  PRE_DUE_STEP_INDEX,
} from './economic-notification-dispatcher';
import type { DbPool } from '../../db/pool';

// ─── Pure functions ──────────────────────────────────────────────────────────

describe('buildEscalationWaMessage', () => {
  it('tono cordiale include nome e giorni scaduto', () => {
    const msg = buildEscalationWaMessage('Studio Bianchi', 'INV-001', '1.200,00', 15, 'cordiale');
    expect(msg).toContain('Studio Bianchi');
    expect(msg).toContain('INV-001');
    expect(msg).toContain('1.200,00');
    expect(msg).toContain('15');
  });

  it('tono urgente ha registro differente', () => {
    const cordiale = buildEscalationWaMessage('X', 'I', '0', 90, 'cordiale');
    const urgente = buildEscalationWaMessage('X', 'I', '0', 90, 'urgente');
    expect(urgente).not.toBe(cordiale);
  });

  it('funziona senza billing name', () => {
    const msg = buildEscalationWaMessage(undefined, 'INV-002', '500,00', 10, 'formale');
    expect(msg).toContain('INV-002');
  });
});

describe('buildPreDueWaMessage', () => {
  it('include numero fattura e giorni mancanti', () => {
    const msg = buildPreDueWaMessage('Dr. Rossi', 'INV-010', '800,00', '15/07/2026', 7);
    expect(msg).toContain('INV-010');
    expect(msg).toContain('800,00');
    expect(msg).toContain('7');
  });
});

describe('buildEscalationEmailSubject', () => {
  it('include numero fattura e tono', () => {
    const sub = buildEscalationEmailSubject('INV-X', 'urgente', 45);
    expect(sub).toContain('INV-X');
  });
});

describe('buildPreDueEmailSubject', () => {
  it('include numero fattura', () => {
    const sub = buildPreDueEmailSubject('INV-Y', 7);
    expect(sub).toContain('INV-Y');
    expect(sub).toContain('7');
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

type QueryMock = ReturnType<typeof vi.fn>;

function makePool(
  queryResponses: Record<number, { rows: unknown[]; rowCount?: number }> = {},
): DbPool {
  let callIndex = 0;
  const query: QueryMock = vi.fn((_sql: unknown, _params?: unknown) => {
    const response = queryResponses[callIndex++] ?? { rows: [], rowCount: 0 };
    return Promise.resolve({ rows: response.rows, rowCount: response.rowCount ?? response.rows.length });
  });
  return { query } as unknown as DbPool;
}

// Fattura scaduta 20gg fa, notifiche abilitate 25gg fa → step 0 (15d trigger = 5gg fa) deve scattare
const DUE_20_DAYS_AGO = new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10);
const ENABLED_25_DAYS_AGO = new Date(Date.now() - 25 * 86_400_000).toISOString();

const BASE_ESCALATION_ROW = {
  invoice_number: 'INV-ESC-001',
  invoice_amount: '2.000,00',
  invoice_due_date: DUE_20_DAYS_AGO,
  invoice_pdf_data: Buffer.from('pdf'),
  invoice_billing_name: 'Studio Rossi',
  days_past_due: 20,
  order_number: 'ORD-001',
  user_id: 'user1',
  customer_erp_id: 'ERP-001',
  customer_name: 'Studio Rossi',
  effective_steps: JSON.stringify([
    { days_after_due: 15, tone: 'cordiale', channels: ['email', 'whatsapp'] },
    { days_after_due: 45, tone: 'formale', channels: ['email'] },
  ]),
  effective_email: 'rossi@test.com',
  effective_whatsapp: '+39123',
  notifications_enabled_at: ENABLED_25_DAYS_AGO,
  invoice_remaining_amount: '2000',
};

// ─── checkEscalationNotifications ───────────────────────────────────────────

describe('checkEscalationNotifications', () => {
  it('nessuna azione se nessuna fattura scaduta', async () => {
    const pool = makePool({ 0: { rows: [] } });
    const sendEmail = vi.fn();
    await checkEscalationNotifications(pool, { sendEmail });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('dispatcha step applicabile con PDF', async () => {
    // La fattura è scaduta da 30gg → step 0 (15d) applicabile, step 1 (45d) NO
    const pool = makePool({
      0: { rows: [BASE_ESCALATION_ROW] },  // invoice query
      1: { rows: [], rowCount: 1 },         // log insert email → success
      2: { rows: [], rowCount: 1 },         // log insert whatsapp → success
      3: { rows: [], rowCount: 1 },         // pending_wa insert
    });
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    await checkEscalationNotifications(pool, { sendEmail });
    expect(sendEmail).toHaveBeenCalledOnce();
    const [to, , , pdfBuffer] = sendEmail.mock.calls[0] as [string, string, string, Buffer];
    expect(to).toBe('rossi@test.com');
    expect(pdfBuffer).toBeDefined();
  });

  it('non dispatcha step non ancora raggiunto (days_past_due < step.days_after_due)', async () => {
    const row = { ...BASE_ESCALATION_ROW, days_past_due: 10 }; // 10d < 15d
    const pool = makePool({ 0: { rows: [row] } });
    const sendEmail = vi.fn();
    await checkEscalationNotifications(pool, { sendEmail });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('non dispatcha step con soglia < notifications_enabled_at (anti-flood)', async () => {
    // Fattura scaduta 30gg fa, notifiche abilitate SOLO 5gg fa
    // Step 0 (15d): trigger date = 30gg fa + 15d = 15gg fa → PRIMA di enabled_at (5gg fa) → SKIP
    const enabledOnlyFiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const dueDateOld = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const row = {
      ...BASE_ESCALATION_ROW,
      invoice_due_date: dueDateOld,
      days_past_due: 30,
      notifications_enabled_at: enabledOnlyFiveDaysAgo,
    };
    const pool = makePool({ 0: { rows: [row] } });
    const sendEmail = vi.fn();
    await checkEscalationNotifications(pool, { sendEmail });
    // step 0 trigger = dueDateOld + 15d = 15 giorni fa, ma enabled solo 5gg fa → skip
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('salta se log insert restituisce 0 (già inviato)', async () => {
    const pool = makePool({
      0: { rows: [BASE_ESCALATION_ROW] },
      1: { rows: [], rowCount: 0 }, // ON CONFLICT → già loggato
    });
    const sendEmail = vi.fn();
    await checkEscalationNotifications(pool, { sendEmail });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('salta email se PDF non in cache (invoice_pdf_data = null)', async () => {
    const row = { ...BASE_ESCALATION_ROW, invoice_pdf_data: null };
    const pool = makePool({
      0: { rows: [row] },
      1: { rows: [], rowCount: 1 }, // log whatsapp → inserito
      2: { rows: [], rowCount: 1 }, // pending_wa
    });
    const sendEmail = vi.fn();
    await checkEscalationNotifications(pool, { sendEmail });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ─── checkPreDueNotifications ────────────────────────────────────────────────

const BASE_PRE_DUE_ROW = {
  invoice_number: 'INV-PRE-001',
  invoice_amount: '500,00',
  invoice_due_date: '2026-07-15',
  invoice_pdf_data: Buffer.from('pdf'),
  invoice_billing_name: 'Lab X',
  pre_due_days: 7,
  user_id: 'user1',
  customer_erp_id: 'ERP-002',
  customer_name: 'Lab X',
  pre_due_channels: ['email', 'whatsapp'],
  effective_email: 'labx@test.com',
  effective_whatsapp: '+39456',
};

describe('checkPreDueNotifications', () => {
  it('nessuna azione se nessuna fattura pre-scadenza', async () => {
    const pool = makePool({ 0: { rows: [] } });
    const sendEmail = vi.fn();
    await checkPreDueNotifications(pool, { sendEmail });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('dispatcha email con PDF e WA per fattura pre-scadenza', async () => {
    const pool = makePool({
      0: { rows: [BASE_PRE_DUE_ROW] },
      1: { rows: [], rowCount: 1 }, // log email
      2: { rows: [], rowCount: 1 }, // log whatsapp
      3: { rows: [], rowCount: 1 }, // pending_wa
    });
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    await checkPreDueNotifications(pool, { sendEmail });
    expect(sendEmail).toHaveBeenCalledOnce();
    const [to, , , pdfBuffer] = sendEmail.mock.calls[0] as [string, string, string, Buffer];
    expect(to).toBe('labx@test.com');
    expect(pdfBuffer).toBeDefined();
  });

  it('salta email se log già esiste', async () => {
    const pool = makePool({
      0: { rows: [BASE_PRE_DUE_ROW] },
      1: { rows: [], rowCount: 0 }, // ON CONFLICT
    });
    const sendEmail = vi.fn();
    await checkPreDueNotifications(pool, { sendEmail });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ─── checkPeriodicStatements ──────────────────────────────────────────────────

const BASE_PERIODIC_ROW = {
  user_id: 'user1',
  customer_erp_id: 'ERP-003',
  customer_name: 'Cliente Periodico',
  invoice_billing_name: 'Studio Periodico',
  periodic_statement_days: 30,
  periodic_statement_content: { open_invoices: true, total_due: true, credit_notes: true, history: false },
  effective_email: 'periodico@test.com',
  effective_whatsapp: null,
};

const BASE_OPEN_INVOICE = {
  invoice_number: 'INV-P-001',
  invoice_amount: '1.000,00',
  invoice_due_date: '2026-06-01',
  invoice_remaining_amount: '1000',
  days_past_due: 5,
};

describe('checkPeriodicStatements', () => {
  it('nessuna azione se nessun cliente con estratto periodico', async () => {
    const pool = makePool({ 0: { rows: [] } });
    const generateStatementPdf = vi.fn();
    await checkPeriodicStatements(pool, { sendEmail: vi.fn(), generateStatementPdf });
    expect(generateStatementPdf).not.toHaveBeenCalled();
  });

  it('genera PDF e invia email per cliente con estratto abilitato', async () => {
    const fakePdf = Buffer.from('statement-pdf');
    const pool = makePool({
      0: { rows: [BASE_PERIODIC_ROW] },          // clienti con estratto
      1: { rows: [BASE_OPEN_INVOICE] },           // fatture aperte
      2: { rows: [], rowCount: 1 },               // log insert
    });
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const generateStatementPdf = vi.fn().mockResolvedValue(fakePdf);
    await checkPeriodicStatements(pool, { sendEmail, generateStatementPdf });
    expect(generateStatementPdf).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
    const [to, , , pdfBuffer] = sendEmail.mock.calls[0] as [string, string, string, Buffer];
    expect(to).toBe('periodico@test.com');
    expect(pdfBuffer).toEqual(fakePdf);
  });

  it('salta se log già esiste (period_bucket dedup)', async () => {
    const pool = makePool({
      0: { rows: [BASE_PERIODIC_ROW] },
      1: { rows: [BASE_OPEN_INVOICE] },
      2: { rows: [], rowCount: 0 }, // ON CONFLICT
    });
    const sendEmail = vi.fn();
    await checkPeriodicStatements(pool, { sendEmail, generateStatementPdf: vi.fn() });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
