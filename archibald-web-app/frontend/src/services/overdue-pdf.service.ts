import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { OverdueReportData, OverdueOrder } from '../api/overdue-report'

// Solo ASCII nei testi — jsPDF/Helvetica non supporta Unicode fuori Latin-1
const PAGE_W = 210
const MARGIN = 14
const CONTENT_W = PAGE_W - MARGIN * 2
const RED: [number, number, number] = [192, 57, 43]
const RED_BG: [number, number, number] = [253, 242, 242]
const GRAY: [number, number, number] = [150, 150, 150]

function fmtEur(amount: number): string {
  return (
    amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    ' EUR'
  )
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const dd = d.getDate().toString().padStart(2, '0')
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function daysLate(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

function addPageHeader(doc: jsPDF, dateStr: string, agentName: string, summary: string): void {
  doc.setFillColor(...RED)
  doc.rect(MARGIN, 10, CONTENT_W, 13, 'F')
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text('ORDINI SCADUTI', MARGIN + 3, 18.5)
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(`${dateStr} | Agente: ${agentName} | ${summary}`, MARGIN + 55, 18.5)
  doc.setTextColor(0, 0, 0)
}

function addPageFooter(doc: jsPDF, page: number, total: number): void {
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...GRAY)
  doc.text('Formicanera - Uso interno', MARGIN, 289)
  doc.text(`Pagina ${page} / ${total}`, PAGE_W - MARGIN, 289, { align: 'right' })
  doc.setTextColor(0, 0, 0)
}

export function generateOverduePDF(data: OverdueReportData, agentName: string): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const now = new Date()
  const dateStr = fmtDate(now.toISOString())
  const orderCount = data.customers.reduce((n, c) => n + c.orders.length, 0)
  const summary = `${orderCount} ordini | ${data.customers.length} clienti | Tot: ${fmtEur(data.grandTotal)}`

  addPageHeader(doc, dateStr, agentName, summary)
  let curY = 28

  const ensureSpace = (needed: number): void => {
    if (curY + needed > 278) {
      doc.addPage()
      addPageHeader(doc, dateStr, agentName, summary)
      curY = 28
    }
  }

  for (const customer of data.customers) {
    ensureSpace(16)

    // Intestazione cliente
    doc.setFillColor(...RED_BG)
    doc.rect(MARGIN, curY, CONTENT_W, 11, 'F')
    doc.setLineWidth(0.6)
    doc.setDrawColor(...RED)
    doc.line(MARGIN, curY, MARGIN, curY + 11)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...RED)
    doc.text(customer.customerName, MARGIN + 3, curY + 4.5)
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(100, 100, 100)
    const emailTxt = customer.customerEmail ? `Email: ${customer.customerEmail}` : 'Email: n/d'
    doc.text(emailTxt, MARGIN + 3, curY + 9)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...RED)
    doc.text(`Subtotale: ${fmtEur(customer.subtotal)}`, PAGE_W - MARGIN - 2, curY + 6.5, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    curY += 13

    for (const order of customer.orders) {
      ensureSpace(20)
      curY = renderOrder(doc, order, curY, dateStr, agentName, summary)
      curY += 3
    }

    curY += 4
  }

  // Totale generale
  ensureSpace(10)
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...RED)
  doc.text(`TOTALE SCADUTO: ${fmtEur(data.grandTotal)}`, PAGE_W - MARGIN, curY + 5, { align: 'right' })

  // Footer su tutte le pagine
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    addPageFooter(doc, p, pageCount)
  }

  const yyyymmdd = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`
  doc.save(`ordini-scaduti-${yyyymmdd}.pdf`)
}

function renderOrder(
  doc: jsPDF,
  order: OverdueOrder,
  startY: number,
  dateStr: string,
  agentName: string,
  summary: string,
): number {
  const late = daysLate(order.invoiceDueDate)
  const vatPart = order.orderTotalWithVat != null
    ? `  |  Tot. IVA incl.: ${fmtEur(parseFloat(order.orderTotalWithVat))}`
    : ''
  const infoLine = `${order.orderNumber}  |  Fattura: ${order.invoiceNumber}  |  Scad: ${fmtDate(order.invoiceDueDate)} (${late} gg fa)${vatPart}`

  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(50, 50, 50)
  doc.text(infoLine, MARGIN + 4, startY + 3)
  let y = startY + 6

  if (order.articles.length === 0) {
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.text('Nessun articolo disponibile', MARGIN + 4, y + 2)
    doc.setTextColor(0, 0, 0)
    return y + 6
  }

  autoTable(doc, {
    startY: y,
    margin: { top: 28, left: MARGIN + 4, right: MARGIN },
    tableWidth: CONTENT_W - 4,
    head: [['Codice', 'Descrizione', 'Q.ta', 'Prezzo', 'Totale']],
    body: order.articles.map(a => [
      a.articleCode,
      a.articleDescription ?? '',
      String(a.quantity),
      a.unitPrice != null ? fmtEur(a.unitPrice) : 'n/d',
      a.lineAmount != null ? fmtEur(a.lineAmount) : 'n/d',
    ]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: [80, 80, 80],
      fontSize: 7,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 78 },
      2: { cellWidth: 13, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
    },
    didDrawPage: () => {
      addPageHeader(doc, dateStr, agentName, summary)
    },
  })

  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3
}
