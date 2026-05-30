import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PartitarioTab } from './PartitarioTab';

const mockLedger = vi.hoisted(() => ({
  totalDaSaldare: 3277.57,
  totalScaduto: 3277.57,
  totalIncassatoAperte: 1092.51,
  totalNcAperte: 0,
  maxDaysPastDue: 90,
  openInvoices: [{
    invoiceNumber: 'CF1/26001415', invoiceDate: '2026-02-27',
    invoiceAmount: 2185.06, remainingAmount: 2185.06, settledAmount: 0,
    dueDate: '2026-03-31', daysPastDue: 59, lastPaymentId: null,
    lastSettlementDate: null, status: 'overdue' as const, isNc: false,
  }],
  ncInvoices: [], paidInvoices: [],
  blockedStatus: 'Completo',
  effectiveEmail: 'amministrazione@maco.it',
  effectiveWhatsapp: '+39 390 829 58044',
}));

vi.mock('../api/customer-ledger', () => ({
  fetchCustomerLedger: vi.fn().mockResolvedValue(mockLedger),
  fetchCustomerLedgerHistory: vi.fn().mockResolvedValue([]),
}));

describe('PartitarioTab', () => {
  it('mostra alert blocco quando blockedStatus è Completo', async () => {
    render(<PartitarioTab erpId="55.226" />);
    expect(await screen.findByText(/cliente bloccato/i)).toBeTruthy();
  });

  it('mostra il totale da saldare', async () => {
    render(<PartitarioTab erpId="55.226" />);
    // The LedgerSummary renders the value via Intl.NumberFormat it-IT.
    // JSDOM may omit the thousands separator; value appears in multiple KPI cards.
    const elements = await screen.findAllByText(/3[\.,]?277/);
    expect(elements.length).toBeGreaterThan(0);
  });
});
