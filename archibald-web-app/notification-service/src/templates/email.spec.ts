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
