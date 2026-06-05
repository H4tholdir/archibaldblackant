import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldSendForCustomer, processNewInvoiceNotifications, processPreDueNotifications } from './tick';
import type { CustomerToNotify } from './tick';

vi.mock('./mailer', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./agenda', () => ({ createAgendaNote: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./template-loader', () => ({
  getCustomTemplate: vi.fn().mockResolvedValue(null),
  applyTemplateVariables: vi.fn((t: string) => t),
}));
vi.mock('./templates/email', () => ({
  buildEmailContent: vi.fn().mockReturnValue({ subject: 'Test', html: '<p/>', replyTo: 'x@x.it' }),
}));

describe('shouldSendForCustomer', () => {
  it('restituisce false se sync non è fresca', () => {
    const staleDate = new Date(Date.now() - 7 * 60 * 60 * 1000);
    expect(shouldSendForCustomer(staleDate, 6 * 60 * 60 * 1000)).toBe(false);
  });

  it('restituisce true se sync è recente', () => {
    const freshDate = new Date(Date.now() - 1 * 60 * 60 * 1000);
    expect(shouldSendForCustomer(freshDate, 6 * 60 * 60 * 1000)).toBe(true);
  });

  it('restituisce false se syncAt è null', () => {
    expect(shouldSendForCustomer(null, 6 * 60 * 60 * 1000)).toBe(false);
  });
});

const baseCustomer: CustomerToNotify = {
  userId: 'user1',
  customerErpId: 'erp1',
  customerName: 'Test Cliente',
  effectiveEmail: 'cliente@test.it',
  effectiveWhatsapp: '+39123456789',
  agentName: 'Agente Test',
  agentEmail: 'agente@test.it',
  agentTitle: 'Agente Komet',
  agentPhone: '',
  steps: [],
  notifyNewInvoice: true,
  newInvoiceChannels: ['email'],
  notifyPreDue: true,
  preDueChannels: ['email'],
  preDueDays: 7,
  periodicStatementEnabled: false,
  periodicStatementDays: 30,
};

const newInvoiceRow = {
  invoice_number: 'CF1/001',
  invoice_amount: '1000.00',
  invoice_date: new Date().toISOString().split('T')[0],
  invoice_due_date: '2026-08-31',
};

const preDueInvoiceRow = {
  invoice_number: 'CF1/002',
  remaining_amount: '800.00',
  due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
  days_past_due: -3,
};

function makePool(firstRows: unknown[]) {
  return { query: vi.fn().mockResolvedValueOnce({ rows: firstRows }).mockResolvedValue({ rows: [] }) };
}

describe('processNewInvoiceNotifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('NON invia email se il canale non include "email"', async () => {
    const { sendEmail } = await import('./mailer');
    const pool = makePool([newInvoiceRow]);
    const cust: CustomerToNotify = { ...baseCustomer, newInvoiceChannels: ['whatsapp'] };

    await processNewInvoiceNotifications(pool as never, [cust]);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('NON invia email se effectiveEmail è null', async () => {
    const { sendEmail } = await import('./mailer');
    const pool = makePool([newInvoiceRow]);
    const cust: CustomerToNotify = { ...baseCustomer, effectiveEmail: null, newInvoiceChannels: ['email'] };

    await processNewInvoiceNotifications(pool as never, [cust]);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('invia email se il canale include "email" e effectiveEmail è valorizzato', async () => {
    const { sendEmail } = await import('./mailer');
    const pool = makePool([newInvoiceRow]);

    await processNewInvoiceNotifications(pool as never, [baseCustomer]);

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'cliente@test.it' }));
  });
});

describe('processPreDueNotifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('NON invia email se il canale non include "email"', async () => {
    const { sendEmail } = await import('./mailer');
    const pool = makePool([preDueInvoiceRow]);
    const cust: CustomerToNotify = { ...baseCustomer, preDueChannels: ['whatsapp'] };

    await processPreDueNotifications(pool as never, [cust]);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('NON invia email se effectiveEmail è null', async () => {
    const { sendEmail } = await import('./mailer');
    const pool = makePool([preDueInvoiceRow]);
    const cust: CustomerToNotify = { ...baseCustomer, effectiveEmail: null, preDueChannels: ['email'] };

    await processPreDueNotifications(pool as never, [cust]);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('invia email se il canale include "email" e effectiveEmail è valorizzato', async () => {
    const { sendEmail } = await import('./mailer');
    const pool = makePool([preDueInvoiceRow]);

    await processPreDueNotifications(pool as never, [baseCustomer]);

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'cliente@test.it' }));
  });
});
