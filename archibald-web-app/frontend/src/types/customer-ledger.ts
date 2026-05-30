export type InvoiceStatus = 'overdue' | 'due_soon' | 'open' | 'paid';

export type LedgerInvoice = {
  invoiceNumber: string;
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
