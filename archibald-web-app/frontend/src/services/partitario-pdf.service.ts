import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { LedgerSummary, LedgerInvoice } from '../types/customer-ledger';
import { KOMET_LOGO_BASE64 } from '../assets/komet-logo-base64';

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
  const [year, month, day] = iso.split('T')[0].split('-').map(Number);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
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
  try {
    doc.addImage(KOMET_LOGO_BASE64, 'PNG', MARGIN, curY, 18, 18);
  } catch { /* ignore */ }

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'bold');
  doc.text('Komet Italia S.r.l.', MARGIN + 20, curY + 5);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text('Via G.B. Morgagni, 36 - 37135 Verona (VR)', MARGIN + 20, curY + 10);

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
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  const nameLines = doc.splitTextToSize(customer.name, CONTENT_W - 10) as string[];
  const boxH = Math.max(20, 6 + nameLines.length * 4.5 + 8);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(200, 214, 232);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, curY, CONTENT_W, boxH, 'FD');
  doc.setFillColor(...BLUE);
  doc.rect(MARGIN, curY, 5, boxH, 'F');

  doc.setTextColor(0, 0, 0);
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

  curY += boxH + 4;

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
        0: { cellWidth: 38, fontStyle: 'bold', textColor: [70, 90, 110] as [number, number, number] },
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
