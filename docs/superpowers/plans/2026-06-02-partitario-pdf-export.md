# Partitario PDF Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un bottone "Stampa PDF" nel tab Partitario che genera un "Estratto Conto" formale da consegnare al cliente, con KPI, fatture aperte, note di credito e storico saldato.

**Architecture:** Nuovo service `partitario-pdf.service.ts` (pattern identico a `overdue-pdf.service.ts`) che usa `jsPDF` + `jspdf-autotable`. `PartitarioTab` riceve una nuova prop opzionale `customer` con i dati anagrafici e aggiunge il bottone PDF. `CustomerProfilePage` passa i dati `customer` al tab.

**Tech Stack:** jsPDF (già installato), jspdf-autotable (già installato), React 19, TypeScript strict, Vitest.

---

## File map

| File | Azione |
|---|---|
| `archibald-web-app/frontend/src/services/partitario-pdf.service.ts` | Crea — logica generazione PDF |
| `archibald-web-app/frontend/src/services/partitario-pdf.service.spec.ts` | Crea — test unit |
| `archibald-web-app/frontend/src/components/PartitarioTab.tsx` | Modifica — prop `customer` + bottone PDF |
| `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx` | Modifica — passa `customer` a PartitarioTab |

---

## Task 1: Service `partitario-pdf.service.ts` — scheletro + test di fumo

**Files:**
- Create: `archibald-web-app/frontend/src/services/partitario-pdf.service.ts`
- Create: `archibald-web-app/frontend/src/services/partitario-pdf.service.spec.ts`

### Setup mock per jsPDF (deve stare in cima al test file)

- [ ] **Step 1: Crea il test file con i mock**

`archibald-web-app/frontend/src/services/partitario-pdf.service.spec.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';

// ─── Mock jsPDF ────────────────────────────────────────────────────────────────
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

vi.mock('jspdf', () => ({ default: vi.fn(() => mockDoc) }));
vi.mock('jspdf-autotable', () => ({
  default: vi.fn((_doc: unknown, opts: { startY?: number }) => {
    // Simulate autoTable setting lastAutoTable.finalY
    (mockDoc as typeof mockDoc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY =
      (opts.startY ?? 100) + 20;
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
  beforeEach(() => { vi.clearAllMocks(); });

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
```

- [ ] **Step 2: Verifica che i test falliscano (modulo non ancora esistente)**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose partitario-pdf
```

Atteso: errore `Cannot find module './partitario-pdf.service'`.

---

- [ ] **Step 3: Crea il service con l'implementazione completa**

`archibald-web-app/frontend/src/services/partitario-pdf.service.ts`:

```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { LedgerSummary, LedgerInvoice } from '../types/customer-ledger';

// Solo ASCII — jsPDF Helvetica non supporta Unicode fuori Latin-1
const PAGE_W = 210;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BLUE: [number, number, number] = [26, 58, 110];
const RED: [number, number, number] = [197, 48, 48];
const RED_BG: [number, number, number] = [255, 245, 245];
const GREEN: [number, number, number] = [39, 103, 73];
const ORANGE: [number, number, number] = [146, 64, 14];
const PURPLE: [number, number, number] = [107, 33, 168];
const SLATE: [number, number, number] = [113, 128, 150];

export type PartitarioCustomer = {
  erpId: string;
  name: string;
  vatNumber?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  phone?: string | null;
};

function fmtEur(amount: number): string {
  return (
    amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    ' EUR'
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function invoiceStatusLabel(inv: LedgerInvoice): string {
  if (inv.isNc) return 'Nota Cred.';
  const labels: Record<string, string> = {
    overdue: 'Scaduta',
    due_soon: 'In scad.',
    open: 'Aperta',
    paid: 'Saldato',
  };
  return labels[inv.status] ?? inv.status;
}

function addPageFooter(doc: jsPDF, dateStr: string, page: number, total: number): void {
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...SLATE);
  doc.text('Komet Italia S.r.l. - Formicanera', MARGIN, 289);
  doc.text(`Generato il: ${dateStr}`, PAGE_W / 2, 289, { align: 'center' });
  doc.text(`Pag. ${page} / ${total}`, PAGE_W - MARGIN, 289, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}

function drawSectionHeader(
  doc: jsPDF,
  y: number,
  title: string,
  totalStr: string,
  color: [number, number, number],
): void {
  doc.setFillColor(...color);
  doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(title, MARGIN + 3, y + 4.8);
  doc.text(totalStr, PAGE_W - MARGIN - 2, y + 4.8, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}

type DocWithLastTable = jsPDF & { lastAutoTable: { finalY: number } };

export function generatePartitarioPDF(
  customer: PartitarioCustomer,
  ledger: LedgerSummary,
  history: LedgerInvoice[],
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const now = new Date();
  const dateStr = fmtDate(now.toISOString());
  let curY = 14;

  // ─── HEADER ───────────────────────────────────────────────────────────
  doc.setFillColor(...BLUE);
  doc.rect(MARGIN, curY, 24, 8, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('KOMET', MARGIN + 3, curY + 5.5);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'bold');
  doc.text('Komet Italia S.r.l.', MARGIN, curY + 13);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text('Via G.B. Morgagni, 36 - 37135 Verona (VR)', MARGIN, curY + 17);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...BLUE);
  doc.text('Estratto Conto', PAGE_W - MARGIN, curY + 8, { align: 'right' });
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text(`Data: ${dateStr}`, PAGE_W - MARGIN, curY + 13, { align: 'right' });
  doc.text(`Rif.: ${customer.erpId}`, PAGE_W - MARGIN, curY + 17, { align: 'right' });

  curY += 22;
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, curY, PAGE_W - MARGIN, curY);
  curY += 5;

  // ─── CUSTOMER BOX ─────────────────────────────────────────────────────
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(200, 214, 232);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, curY, CONTENT_W, 20, 'FD');
  doc.setFillColor(...BLUE);
  doc.rect(MARGIN, curY, 5, 20, 'F');

  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  const nameLines = doc.splitTextToSize(customer.name, CONTENT_W - 10) as string[];
  doc.text(nameLines, MARGIN + 8, curY + 6);

  const infoY = curY + 6 + nameLines.length * 4.5;
  const infoParts: string[] = [];
  if (customer.vatNumber) infoParts.push(`P.IVA: ${customer.vatNumber}`);
  const addr = [customer.street, [customer.postalCode, customer.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' - ');
  if (addr) infoParts.push(addr);
  if (customer.phone) infoParts.push(`Tel: ${customer.phone}`);

  if (infoParts.length > 0) {
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 60);
    doc.text(infoParts.join('   |   '), MARGIN + 8, infoY);
  }

  curY += 24;

  // ─── ALERT BANNER ─────────────────────────────────────────────────────
  if (ledger.blockedStatus) {
    doc.setFillColor(...RED_BG);
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN, curY, CONTENT_W, 10, 'FD');
    doc.setFillColor(...RED);
    doc.rect(MARGIN, curY, 2, 10, 'F');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...RED);
    doc.text(
      `CLIENTE BLOCCATO - ${ledger.blockedStatus}`,
      MARGIN + 5,
      curY + 4.5,
    );
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      `Ordini sospesi - ${ledger.maxDaysPastDue} giorni di insoluto`,
      MARGIN + 5,
      curY + 8.5,
    );
    doc.setTextColor(0, 0, 0);
    curY += 13;
  }

  // ─── KPI GRID ─────────────────────────────────────────────────────────
  const kpiW = CONTENT_W / 2;
  const kpiH = 18;
  const kpis: Array<{
    label: string;
    value: string;
    detail: string;
    bg: [number, number, number];
    fg: [number, number, number];
  }> = [
    {
      label: 'SCADUTO',
      value: fmtEur(ledger.totalScaduto),
      detail: `max +${ledger.maxDaysPastDue} giorni`,
      bg: [255, 245, 245],
      fg: RED,
    },
    {
      label: 'DA SALDARE',
      value: fmtEur(ledger.totalDaSaldare),
      detail: `${ledger.openInvoices.length} fatture aperte`,
      bg: [255, 251, 235],
      fg: ORANGE,
    },
    {
      label: 'INCASSATO (SU APERTE)',
      value: fmtEur(ledger.totalIncassatoAperte),
      detail: 'pagamenti ricevuti',
      bg: [240, 255, 244],
      fg: GREEN,
    },
    {
      label: 'NOTE DI CREDITO',
      value: fmtEur(ledger.totalNcAperte),
      detail: `${ledger.ncInvoices.length} NC da applicare`,
      bg: [250, 245, 255],
      fg: PURPLE,
    },
  ];

  for (let i = 0; i < 4; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MARGIN + col * kpiW;
    const y = curY + row * (kpiH + 1);
    const kpi = kpis[i];

    doc.setFillColor(...kpi.bg);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.rect(x, y, kpiW, kpiH, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 4, y + 4.5);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...kpi.fg);
    doc.text(kpi.value, x + 4, y + 12);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE);
    doc.text(kpi.detail, x + 4, y + 16.5);
  }

  curY += kpiH * 2 + 3;

  const ensureSpace = (needed: number): void => {
    if (curY + needed > 278) {
      doc.addPage();
      curY = 14;
    }
  };

  // ─── FATTURE APERTE ───────────────────────────────────────────────────
  if (ledger.openInvoices.length > 0) {
    ensureSpace(24);
    const openTotal = ledger.openInvoices.reduce((s, inv) => s + inv.remainingAmount, 0);
    drawSectionHeader(
      doc,
      curY,
      `FATTURE APERTE (${ledger.openInvoices.length})`,
      `Totale: ${fmtEur(openTotal)}`,
      BLUE,
    );
    curY += 8;

    autoTable(doc, {
      startY: curY,
      margin: { left: MARGIN, right: MARGIN, top: 14, bottom: 16 },
      tableWidth: CONTENT_W,
      head: [['N. Fattura', 'Data Emiss.', 'Scadenza', 'Stato', 'Gg Rit.', 'Importo', 'Residuo']],
      body: ledger.openInvoices.map(inv => [
        inv.invoiceNumber,
        fmtDate(inv.invoiceDate),
        fmtDate(inv.dueDate),
        invoiceStatusLabel(inv),
        inv.daysPastDue > 0 ? `+${inv.daysPastDue}` : '-',
        fmtEur(inv.invoiceAmount),
        fmtEur(inv.remainingAmount),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [70, 90, 110],
        fontSize: 7,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 34, fontStyle: 'bold' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 16, halign: 'right' },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const inv = ledger.openInvoices[data.row.index];
          if (inv?.status === 'overdue') {
            data.cell.styles.textColor = RED;
          }
        }
      },
    });

    curY = (doc as DocWithLastTable).lastAutoTable.finalY + 4;
  }

  // ─── NOTE DI CREDITO ─────────────────────────────────────────────────
  if (ledger.ncInvoices.length > 0) {
    ensureSpace(24);
    const ncTotal = ledger.ncInvoices.reduce((s, inv) => s + Math.abs(inv.invoiceAmount), 0);
    drawSectionHeader(
      doc,
      curY,
      `NOTE DI CREDITO APERTE (${ledger.ncInvoices.length})`,
      `Totale: ${fmtEur(ncTotal)}`,
      PURPLE,
    );
    curY += 8;

    autoTable(doc, {
      startY: curY,
      margin: { left: MARGIN, right: MARGIN, top: 14, bottom: 16 },
      tableWidth: CONTENT_W,
      head: [['N. Nota Credito', 'Data Emiss.', 'Scadenza', 'Importo', 'Residuo']],
      body: ledger.ncInvoices.map(inv => [
        inv.invoiceNumber,
        fmtDate(inv.invoiceDate),
        fmtDate(inv.dueDate),
        fmtEur(Math.abs(inv.invoiceAmount)),
        fmtEur(Math.abs(inv.remainingAmount)),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [250, 245, 255], textColor: PURPLE, fontSize: 7, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 40, fontStyle: 'bold' },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 30, halign: 'center' },
        3: { cellWidth: 41, halign: 'right' },
        4: { cellWidth: 41, halign: 'right', fontStyle: 'bold' },
      },
    });

    curY = (doc as DocWithLastTable).lastAutoTable.finalY + 4;
  }

  // ─── STORICO SALDATO ─────────────────────────────────────────────────
  if (history.length > 0) {
    ensureSpace(24);
    const histTotal = history.reduce((s, inv) => s + inv.invoiceAmount, 0);
    drawSectionHeader(
      doc,
      curY,
      `STORICO SALDATO (${history.length})`,
      `Tot. incassato: ${fmtEur(histTotal)}`,
      GREEN,
    );
    curY += 8;

    autoTable(doc, {
      startY: curY,
      margin: { left: MARGIN, right: MARGIN, top: 14, bottom: 16 },
      tableWidth: CONTENT_W,
      head: [['N. Fattura', 'Data Emiss.', 'Scad. Orig.', 'Saldato il', 'Importo']],
      body: history.map(inv => [
        inv.invoiceNumber,
        fmtDate(inv.invoiceDate),
        fmtDate(inv.dueDate),
        fmtDate(inv.lastSettlementDate),
        fmtEur(inv.invoiceAmount),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2, textColor: SLATE },
      headStyles: { fillColor: [240, 255, 244], textColor: GREEN, fontSize: 7, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: 'bold', textColor: [70, 90, 110] as [number,number,number] },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 30, halign: 'center' },
        3: { cellWidth: 30, halign: 'center' },
        4: { cellWidth: 54, halign: 'right' },
      },
    });
  }

  // ─── FOOTER su tutte le pagine ────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    addPageFooter(doc, dateStr, p, pageCount);
  }

  const yyyymmdd = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
  doc.save(`partitario_${customer.erpId}_${yyyymmdd}.pdf`);
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose partitario-pdf
```

Atteso: 5 test PASS, 0 FAIL.

- [ ] **Step 5: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: 0 errori.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/services/partitario-pdf.service.ts \
        archibald-web-app/frontend/src/services/partitario-pdf.service.spec.ts
git commit -m "feat(partitario): aggiungi service generazione PDF estratto conto"
```

---

## Task 2: Modifica `PartitarioTab.tsx` — prop customer + bottone PDF

**Files:**
- Modify: `archibald-web-app/frontend/src/components/PartitarioTab.tsx`

- [ ] **Step 1: Aggiorna il file con prop `customer` e bottone PDF**

Sostituisci l'intero file con:

```tsx
import { useState, useEffect } from 'react';
import type { LedgerSummary, LedgerInvoice } from '../types/customer-ledger';
import { fetchCustomerLedger, fetchCustomerLedgerHistory } from '../api/customer-ledger';
import { LedgerSummary as LedgerSummaryComponent } from './LedgerSummary';
import { InvoiceCard } from './InvoiceCard';
import { generatePartitarioPDF, type PartitarioCustomer } from '../services/partitario-pdf.service';

function formatEur(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

type Props = {
  erpId: string;
  customer?: Pick<PartitarioCustomer, 'name' | 'vatNumber' | 'street' | 'postalCode' | 'city' | 'phone'>;
};

export function PartitarioTab({ erpId, customer }: Props) {
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [history, setHistory] = useState<LedgerInvoice[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchCustomerLedger(erpId)
      .then(setLedger)
      .catch(() => setError('Impossibile caricare il partitario'))
      .finally(() => setLoading(false));
  }, [erpId]);

  const handleShowHistory = async () => {
    if (!showHistory && history.length === 0) {
      const h = await fetchCustomerLedgerHistory(erpId).catch(() => []);
      setHistory(h);
    }
    setShowHistory(v => !v);
  };

  const handlePrintPDF = async () => {
    if (!ledger) return;
    setPdfLoading(true);
    try {
      let hist = history;
      if (hist.length === 0) {
        hist = await fetchCustomerLedgerHistory(erpId).catch(() => []);
        setHistory(hist);
      }
      generatePartitarioPDF(
        { erpId, name: customer?.name ?? erpId, ...customer },
        ledger,
        hist,
      );
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
        Caricamento partitario...
      </div>
    );
  }

  if (error || !ledger) {
    return (
      <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#dc2626', fontSize: '13px' }}>
        {error ?? 'Errore caricamento dati'}
      </div>
    );
  }

  const nettingAmount = ledger.totalDaSaldare - ledger.totalNcAperte;

  return (
    <div>
      {/* Bottone PDF */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button
          onClick={handlePrintPDF}
          disabled={pdfLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            background: pdfLoading ? '#94a3b8' : '#1a3a6e',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: pdfLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {pdfLoading ? '⏳ Generazione...' : '📄 Stampa PDF'}
        </button>
      </div>

      {/* Banner cliente bloccato */}
      {ledger.blockedStatus && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '10px',
          padding: '10px 14px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>🚫</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626' }}>
              Cliente bloccato dall&apos;ERP · {ledger.blockedStatus}
            </div>
            <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>
              Ordini sospesi · {ledger.maxDaysPastDue} giorni di insoluto
            </div>
          </div>
        </div>
      )}

      {/* KPI */}
      <LedgerSummaryComponent summary={ledger} />

      {/* Netting NC */}
      {ledger.totalNcAperte > 0 && (
        <div style={{
          background: '#f5f3ff',
          border: '1px solid #e9d5ff',
          borderRadius: '10px',
          padding: '10px 14px',
          marginBottom: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#7c3aed' }}>Esposizione netta indicativa</div>
            <div style={{ fontSize: '11px', color: '#9333ea', marginTop: '2px', fontStyle: 'italic' }}>
              Se le note di credito venissero applicate
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              {formatEur(ledger.totalDaSaldare)} − {formatEur(ledger.totalNcAperte)} NC
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#7c3aed' }}>
              {formatEur(nettingAmount)}
            </div>
          </div>
        </div>
      )}

      {/* Note di credito */}
      {ledger.ncInvoices.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64748b', marginBottom: '6px' }}>
            Note di credito aperte ({ledger.ncInvoices.length})
          </div>
          {ledger.ncInvoices.map(i => <InvoiceCard key={i.invoiceNumber} invoice={i} />)}
        </div>
      )}

      {/* Fatture aperte */}
      {ledger.openInvoices.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64748b', marginBottom: '6px' }}>
            Fatture aperte ({ledger.openInvoices.length})
          </div>
          {ledger.openInvoices.map(i => <InvoiceCard key={i.invoiceNumber} invoice={i} />)}
        </div>
      )}

      {ledger.openInvoices.length === 0 && ledger.ncInvoices.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '13px' }}>
          ✅ Nessuna fattura aperta
        </div>
      )}

      {/* Storico saldato */}
      <div style={{ marginTop: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64748b' }}>
            Storico saldato
          </div>
          <button
            onClick={handleShowHistory}
            style={{
              fontSize: '12px', fontWeight: 600, color: '#2563eb',
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
            }}
          >
            {showHistory ? 'Nascondi ▲' : `Mostra${history.length > 0 ? ` (${history.length})` : ''} ▼`}
          </button>
        </div>

        {showHistory && (
          <>
            {history.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#94a3b8', padding: '8px 0' }}>
                Nessuna fattura saldato disponibile
              </div>
            ) : (
              history.map(i => <InvoiceCard key={i.invoiceNumber} invoice={i} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Aggiorna il mock di PartitarioTab nello spec di CustomerProfilePage**

Il test esistente in `archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx` mocka `PartitarioTab`. Verifica che il mock accetti le nuove props senza rompersi. Trova la riga del mock:

```bash
grep -n "PartitarioTab" archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx
```

Se il mock è del tipo `vi.mock('../components/PartitarioTab', () => ({ PartitarioTab: () => null }))`, non serve modificarlo — il mock ignora le props. Se invece il mock verifica le props, aggiornalo.

- [ ] **Step 3: Esegui i test frontend**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose
```

Atteso: stesso numero di test pass di prima + i 5 nuovi del service. 0 regressioni.

- [ ] **Step 4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: 0 errori.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/PartitarioTab.tsx
git commit -m "feat(partitario): aggiungi bottone Stampa PDF nel tab partitario"
```

---

## Task 3: Passa `customer` da `CustomerProfilePage` a `PartitarioTab`

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx:1034`

- [ ] **Step 1: Aggiorna la riga che monta PartitarioTab**

Trova la riga (circa 1034):

```tsx
<PartitarioTab erpId={erpId} />
```

Sostituiscila con:

```tsx
<PartitarioTab erpId={erpId} customer={customer} />
```

La variabile `customer` è già disponibile nello scope (è usata sulle righe precedenti, es. `customer.name` alla riga 1026).

- [ ] **Step 2: Esegui test e type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend && npm test --prefix archibald-web-app/frontend -- --reporter=verbose
```

Atteso: type-check 0 errori, test pass invariati.

- [ ] **Step 3: Commit finale**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx
git commit -m "feat(partitario): passa dati cliente al PartitarioTab per PDF"
```

---

## Verifica end-to-end

- [ ] Avvia il dev server: `npm run dev --prefix archibald-web-app/frontend`
- [ ] Apri un profilo cliente in browser
- [ ] Scorri fino alla sezione "Partitario"
- [ ] Clicca "📄 Stampa PDF" — deve comparire il dialog di download del browser
- [ ] Apri il PDF scaricato e verifica:
  - [ ] Header con "KOMET" e "Estratto Conto"
  - [ ] Nome cliente corretto
  - [ ] 4 KPI (Scaduto, Da Saldare, Incassato, Note di Credito)
  - [ ] Tabella fatture aperte (se presenti)
  - [ ] Storico saldato (se presente)
  - [ ] Footer con data e numero pagina

---

## Self-review checklist

**Copertura spec:**
- ✅ PDF destinato al cliente — intestazione Komet, tono formale
- ✅ Storico saldato sempre incluso (fetch se non già caricato)
- ✅ Bottone nel tab Partitario
- ✅ KPI grid (Scaduto, Da Saldare, Incassato, NC)
- ✅ Banner bloccato condizionale
- ✅ Tabella fatture aperte con stato e giorni ritardo
- ✅ Tabella note di credito (condizionale)
- ✅ Tabella storico saldato
- ✅ Footer con data generazione e paginazione
- ✅ Test: 5 casi (smoke, filename, dati completi, banner bloccato incluso/escluso)

**Tipi consistenti:** `PartitarioCustomer` definito e esportato dal service, importato in PartitarioTab con `Pick<>` per evitare dipendenza diretta dal tipo `Customer` completo.

**Nessun placeholder:** tutto il codice è completo e funzionante.
