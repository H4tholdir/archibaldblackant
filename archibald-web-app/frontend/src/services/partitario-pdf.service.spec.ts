import { describe, test, expect, vi, beforeEach } from 'vitest';

// ─── Mock jsPDF ────────────────────────────────────────────────────────────────
// vi.mock is hoisted before imports, so mockDoc must be declared with vi.hoisted
const { mockDoc } = vi.hoisted(() => {
  const mockDoc = {
    setFillColor: vi.fn(),
    setDrawColor: vi.fn(),
    setTextColor: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setLineWidth: vi.fn(),
    rect: vi.fn(),
    line: vi.fn(),
    text: vi.fn(),
    splitTextToSize: vi.fn((text: string) => [text]),
    addPage: vi.fn(),
    getNumberOfPages: vi.fn().mockReturnValue(1),
    setPage: vi.fn(),
    save: vi.fn(),
    lastAutoTable: { finalY: 100 },
  };
  return { mockDoc };
});

vi.mock('jspdf', () => ({
  // eslint-disable-next-line prefer-arrow-callback
  default: vi.fn(function () { return mockDoc; }),
}));
vi.mock('jspdf-autotable', () => ({
  default: vi.fn((_doc: unknown, opts: { startY?: number }) => {
    mockDoc.lastAutoTable.finalY = (opts.startY ?? 100) + 20;
  }),
}));

import { generatePartitarioPDF } from './partitario-pdf.service';
import type { LedgerSummary, LedgerInvoice } from '../types/customer-ledger';
// ──────────────────────────────────────────────────────────────────────────────

const CUSTOMER_MIN = { erpId: '55.235', name: 'Centro Odontoiatrico Test' };

const LEDGER_EMPTY: LedgerSummary = {
  totalDaSaldare: 0,
  totalScaduto: 0,
  totalIncassatoAperte: 0,
  totalNcAperte: 0,
  maxDaysPastDue: 0,
  openInvoices: [],
  ncInvoices: [],
  paidInvoices: [],
  blockedStatus: null,
  effectiveEmail: null,
  effectiveWhatsapp: null,
};

const OPEN_INVOICE: LedgerInvoice = {
  invoiceNumber: 'CF1/26000199',
  orderId: null,
  invoiceDate: '2026-01-16',
  invoiceAmount: 103.85,
  remainingAmount: 103.85,
  settledAmount: 0,
  dueDate: '2026-03-31',
  daysPastDue: 63,
  lastPaymentId: null,
  lastSettlementDate: null,
  status: 'overdue',
  isNc: false,
};

const PAID_INVOICE: LedgerInvoice = {
  invoiceNumber: 'CF1/25008811',
  orderId: null,
  invoiceDate: '2025-11-10',
  invoiceAmount: 412.5,
  remainingAmount: 0,
  settledAmount: 412.5,
  dueDate: '2025-12-31',
  daysPastDue: 0,
  lastPaymentId: 'PAY-001',
  lastSettlementDate: '2026-01-03',
  status: 'paid',
  isNc: false,
};

describe('generatePartitarioPDF', () => {
  beforeEach(() => { vi.clearAllMocks(); mockDoc.lastAutoTable.finalY = 100; });

  test('non lancia eccezioni con dati minimi (ledger vuoto, history vuota)', () => {
    expect(() => generatePartitarioPDF(CUSTOMER_MIN, LEDGER_EMPTY, [])).not.toThrow();
  });

  test('chiama doc.save() con nome file nel formato partitario_erpId_YYYYMMDD.pdf', () => {
    generatePartitarioPDF(CUSTOMER_MIN, LEDGER_EMPTY, []);
    expect(mockDoc.save).toHaveBeenCalledOnce();
    const filename: string = mockDoc.save.mock.calls[0][0];
    expect(filename).toMatch(/^partitario_55\.235_\d{8}\.pdf$/);
  });

  test('non lancia eccezioni con fatture aperte e storico saldato', () => {
    const ledger: LedgerSummary = {
      ...LEDGER_EMPTY,
      totalDaSaldare: 103.85,
      totalScaduto: 103.85,
      maxDaysPastDue: 63,
      openInvoices: [OPEN_INVOICE],
    };
    expect(() => generatePartitarioPDF(CUSTOMER_MIN, ledger, [PAID_INVOICE])).not.toThrow();
  });

  test('include testo "BLOCCATO" quando blockedStatus non e\' null', () => {
    const ledger: LedgerSummary = { ...LEDGER_EMPTY, blockedStatus: 'Completo', maxDaysPastDue: 63 };
    generatePartitarioPDF(CUSTOMER_MIN, ledger, []);
    const textCalls: string[] = mockDoc.text.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(textCalls.some(t => t.includes('BLOCCATO'))).toBe(true);
  });

  test('NON include testo "BLOCCATO" quando blockedStatus e\' null', () => {
    generatePartitarioPDF(CUSTOMER_MIN, LEDGER_EMPTY, []);
    const textCalls: string[] = mockDoc.text.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(textCalls.every(t => !t.includes('BLOCCATO'))).toBe(true);
  });
});
