import { describe, it, expect } from 'vitest';
import { buildEmailContent } from './email';

const baseCtx = {
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
    const { subject } = buildEmailContent(baseCtx);
    expect(subject).toContain('2');
  });

  it('include ⚠ nel subject urgente', () => {
    const { subject } = buildEmailContent(baseCtx);
    expect(subject).toContain('⚠');
  });

  it('include il totale nel body HTML', () => {
    const { html } = buildEmailContent(baseCtx);
    expect(html).toContain('3.277');
  });

  it('include CF1/26001415 nella tabella', () => {
    const { html } = buildEmailContent(baseCtx);
    expect(html).toContain('CF1/26001415');
  });

  it('include Reply-To agente', () => {
    const { replyTo } = buildEmailContent(baseCtx);
    expect(replyTo).toBe('f.formicola@komet.de');
  });
});

describe('buildEmailContent — subject singolare (n=1)', () => {
  const singleInvoice = {
    invoiceNumber: 'CF1/26001',
    remainingAmount: 500,
    dueDate: '2026-03-01',
    daysPastDue: 10,
  };
  const singleBase = { ...baseCtx, invoices: [singleInvoice], totalAmount: 500 };

  it('cordiale: usa "fattura" al singolare', () => {
    const { subject } = buildEmailContent({ ...singleBase, tone: 'cordiale' });
    expect(subject).toMatch(/1 fattura[^e]/);
    expect(subject).not.toContain('1 fatture');
  });

  it('formale: usa "fattura" al singolare', () => {
    const { subject } = buildEmailContent({ ...singleBase, tone: 'formale' });
    expect(subject).toMatch(/1 fattura[^e]/);
    expect(subject).not.toContain('1 fatture');
  });

  it('urgente: usa "fattura insoluta" al singolare', () => {
    const { subject } = buildEmailContent({ ...singleBase, tone: 'urgente' });
    expect(subject).toContain('1 fattura insoluta');
    expect(subject).not.toContain('1 fatture insolute');
  });
});

describe('buildEmailContent — badge stato fattura', () => {
  const cordiale = { ...baseCtx, tone: 'cordiale' as const };

  it('daysPastDue=0 → badge "scade oggi"', () => {
    const { html } = buildEmailContent({
      ...cordiale,
      invoices: [{ invoiceNumber: 'X', remainingAmount: 100, dueDate: '2026-06-05', daysPastDue: 0 }],
      totalAmount: 100,
    });
    expect(html).toContain('scade oggi');
  });

  it('daysPastDue=30 → badge "+30 gg"', () => {
    const { html } = buildEmailContent({
      ...cordiale,
      invoices: [{ invoiceNumber: 'X', remainingAmount: 100, dueDate: '2026-03-01', daysPastDue: 30 }],
      totalAmount: 100,
    });
    expect(html).toContain('+30 gg');
  });

  it('daysPastDue=-87 → badge "tra 87 gg"', () => {
    const { html } = buildEmailContent({
      ...cordiale,
      invoices: [{ invoiceNumber: 'X', remainingAmount: 100, dueDate: '2026-08-31', daysPastDue: -87 }],
      totalAmount: 100,
    });
    expect(html).toContain('tra 87 gg');
  });
});
