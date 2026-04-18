# PDF Export Ordini Scaduti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un endpoint `GET /api/orders/overdue-report` e un servizio PDF frontend che esporti tutti gli ordini scaduti dell'agente in un PDF A4 raggruppati per cliente con articoli, attivabile tramite bottone "PDF Scaduti" affianco a "Leggi gli stati" in OrderHistory.tsx.

**Architecture:** Due query PostgreSQL (ordini scaduti con JOIN clienti + articoli per quegli ordini). La funzione di raggruppamento `groupOverdueRows` è pura e testabile. Il frontend fetcha i dati tramite un modulo API dedicato e genera il PDF con jsPDF + autoTable. Nessuna modifica ai tipi `Order` esistenti.

**Tech Stack:** PostgreSQL (`pg`), Express, TypeScript, jsPDF, jspdf-autotable, React 19, Vitest

---

## File da creare/modificare

| Azione | File |
|--------|------|
| Crea | `backend/src/db/repositories/overdue-report.ts` |
| Crea | `backend/src/db/repositories/overdue-report.spec.ts` |
| Crea | `backend/src/routes/overdue-report.ts` |
| Modifica | `backend/src/server.ts` (aggiungi route) |
| Crea | `frontend/src/api/overdue-report.ts` |
| Crea | `frontend/src/services/overdue-pdf.service.ts` |
| Modifica | `frontend/src/pages/OrderHistory.tsx` (aggiungi bottone) |

---

### Task 1: Backend — tipi + funzione pura `groupOverdueRows` (TDD)

**Files:**
- Create: `backend/src/db/repositories/overdue-report.ts`
- Create: `backend/src/db/repositories/overdue-report.spec.ts`

- [ ] **Step 1: Scrivi il test failing**

Crea `backend/src/db/repositories/overdue-report.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { groupOverdueRows } from './overdue-report'
import type { OverdueRow } from './overdue-report'

describe('groupOverdueRows', () => {
  test('raggruppa righe flat per cliente e ordine', () => {
    const rows: OverdueRow[] = [
      {
        customer_name: 'Rossi Mario',
        customer_email: 'rossi@test.it',
        order_id: 'ord-1',
        order_number: 'ORD/001',
        order_date: '2026-01-10T00:00:00Z',
        invoice_number: 'CF1/001',
        invoice_due_date: '2026-02-28T00:00:00Z',
        article_code: 'KOM-001',
        article_description: 'Fresa HSS',
        quantity: 2,
        unit_price: 10.0,
        line_amount: 20.0,
      },
      {
        customer_name: 'Rossi Mario',
        customer_email: 'rossi@test.it',
        order_id: 'ord-1',
        order_number: 'ORD/001',
        order_date: '2026-01-10T00:00:00Z',
        invoice_number: 'CF1/001',
        invoice_due_date: '2026-02-28T00:00:00Z',
        article_code: 'KOM-002',
        article_description: 'Punta HSS',
        quantity: 5,
        unit_price: 3.0,
        line_amount: 15.0,
      },
      {
        customer_name: 'Bianchi SRL',
        customer_email: null,
        order_id: 'ord-2',
        order_number: 'ORD/002',
        order_date: '2026-01-15T00:00:00Z',
        invoice_number: 'CF1/002',
        invoice_due_date: '2026-03-15T00:00:00Z',
        article_code: 'KOM-003',
        article_description: null,
        quantity: 1,
        unit_price: 100.0,
        line_amount: 100.0,
      },
    ]

    const result = groupOverdueRows(rows)

    expect(result).toEqual({
      customers: [
        {
          customerName: 'Rossi Mario',
          customerEmail: 'rossi@test.it',
          subtotal: 35.0,
          orders: [
            {
              orderId: 'ord-1',
              orderNumber: 'ORD/001',
              orderDate: '2026-01-10T00:00:00Z',
              invoiceNumber: 'CF1/001',
              invoiceDueDate: '2026-02-28T00:00:00Z',
              articles: [
                { articleCode: 'KOM-001', articleDescription: 'Fresa HSS', quantity: 2, unitPrice: 10.0, lineAmount: 20.0 },
                { articleCode: 'KOM-002', articleDescription: 'Punta HSS', quantity: 5, unitPrice: 3.0, lineAmount: 15.0 },
              ],
            },
          ],
        },
        {
          customerName: 'Bianchi SRL',
          customerEmail: null,
          subtotal: 100.0,
          orders: [
            {
              orderId: 'ord-2',
              orderNumber: 'ORD/002',
              orderDate: '2026-01-15T00:00:00Z',
              invoiceNumber: 'CF1/002',
              invoiceDueDate: '2026-03-15T00:00:00Z',
              articles: [
                { articleCode: 'KOM-003', articleDescription: null, quantity: 1, unitPrice: 100.0, lineAmount: 100.0 },
              ],
            },
          ],
        },
      ],
      grandTotal: 135.0,
    })
  })

  test('ordine senza articoli (LEFT JOIN null) viene incluso con articles vuoto', () => {
    const rows: OverdueRow[] = [
      {
        customer_name: 'Verdi Luigi',
        customer_email: 'verdi@test.it',
        order_id: 'ord-3',
        order_number: 'ORD/003',
        order_date: '2026-01-20T00:00:00Z',
        invoice_number: 'CF1/003',
        invoice_due_date: '2026-03-20T00:00:00Z',
        article_code: null,
        article_description: null,
        quantity: null,
        unit_price: null,
        line_amount: null,
      },
    ]

    const result = groupOverdueRows(rows)

    expect(result).toEqual({
      customers: [
        {
          customerName: 'Verdi Luigi',
          customerEmail: 'verdi@test.it',
          subtotal: 0,
          orders: [
            {
              orderId: 'ord-3',
              orderNumber: 'ORD/003',
              orderDate: '2026-01-20T00:00:00Z',
              invoiceNumber: 'CF1/003',
              invoiceDueDate: '2026-03-20T00:00:00Z',
              articles: [],
            },
          ],
        },
      ],
      grandTotal: 0,
    })
  })

  test('array vuoto restituisce struttura vuota', () => {
    expect(groupOverdueRows([])).toEqual({ customers: [], grandTotal: 0 })
  })
})
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- overdue-report.spec
```

Atteso: FAIL con `Cannot find module './overdue-report'`

- [ ] **Step 3: Implementa i tipi e `groupOverdueRows`**

Crea `backend/src/db/repositories/overdue-report.ts`:

```typescript
import type { DbPool } from '../pool'

export type OverdueArticle = {
  articleCode: string
  articleDescription: string | null
  quantity: number
  unitPrice: number | null
  lineAmount: number | null
}

export type OverdueOrder = {
  orderId: string
  orderNumber: string
  orderDate: string
  invoiceNumber: string
  invoiceDueDate: string
  articles: OverdueArticle[]
}

export type OverdueCustomer = {
  customerName: string
  customerEmail: string | null
  orders: OverdueOrder[]
  subtotal: number
}

export type OverdueReportData = {
  customers: OverdueCustomer[]
  grandTotal: number
}

export type OverdueRow = {
  customer_name: string
  customer_email: string | null
  order_id: string
  order_number: string
  order_date: string
  invoice_number: string
  invoice_due_date: string
  article_code: string | null
  article_description: string | null
  quantity: number | null
  unit_price: number | null
  line_amount: number | null
}

export function groupOverdueRows(rows: OverdueRow[]): OverdueReportData {
  const customerMap = new Map<string, OverdueCustomer>()

  for (const row of rows) {
    if (!customerMap.has(row.customer_name)) {
      customerMap.set(row.customer_name, {
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        orders: [],
        subtotal: 0,
      })
    }
    const customer = customerMap.get(row.customer_name)!

    let order = customer.orders.find(o => o.orderId === row.order_id)
    if (!order) {
      order = {
        orderId: row.order_id,
        orderNumber: row.order_number,
        orderDate: row.order_date,
        invoiceNumber: row.invoice_number,
        invoiceDueDate: row.invoice_due_date,
        articles: [],
      }
      customer.orders.push(order)
    }

    if (row.article_code !== null) {
      const lineAmount = row.line_amount
      order.articles.push({
        articleCode: row.article_code,
        articleDescription: row.article_description,
        quantity: row.quantity ?? 0,
        unitPrice: row.unit_price,
        lineAmount,
      })
      customer.subtotal += lineAmount ?? 0
    }
  }

  const customers = Array.from(customerMap.values())
  return {
    customers,
    grandTotal: customers.reduce((sum, c) => sum + c.subtotal, 0),
  }
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

```bash
npm test --prefix archibald-web-app/backend -- overdue-report.spec
```

Atteso: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/overdue-report.ts archibald-web-app/backend/src/db/repositories/overdue-report.spec.ts
git commit -m "feat(backend): tipi e groupOverdueRows per report ordini scaduti"
```

---

### Task 2: Backend — funzione `getOverdueReport` (query PostgreSQL)

**Files:**
- Modify: `backend/src/db/repositories/overdue-report.ts`

- [ ] **Step 1: Aggiungi la funzione `getOverdueReport` al repository**

Aggiungi in fondo a `backend/src/db/repositories/overdue-report.ts`:

```typescript
export async function getOverdueReport(pool: DbPool, userId: string): Promise<OverdueReportData> {
  // Query 1: tutti gli ordini scaduti con info cliente e fattura (DISTINCT ON per evitare duplicati con più fatture)
  const ordersResult = await pool.query<{
    customer_name: string
    customer_email: string | null
    order_id: string
    order_number: string
    order_date: string
    invoice_number: string
    invoice_due_date: string
  }>(
    `SELECT DISTINCT ON (o.id)
       c.name            AS customer_name,
       c.email           AS customer_email,
       o.id              AS order_id,
       o.order_number,
       o.created_at      AS order_date,
       i.invoice_number,
       i.invoice_due_date
     FROM agents.order_records o
     JOIN agents.customers c
       ON  c.account_num = o.customer_account_num
       AND c.user_id     = o.user_id
       AND c.deleted_at  IS NULL
     JOIN agents.order_invoices i
       ON  i.order_id = o.id
       AND i.invoice_due_date::date < CURRENT_DATE
       AND i.invoice_closed IS NOT TRUE
     WHERE o.user_id = $1
     ORDER BY o.id, i.invoice_due_date ASC`,
    [userId]
  )

  if (ordersResult.rows.length === 0) {
    return { customers: [], grandTotal: 0 }
  }

  const orderIds = ordersResult.rows.map(r => r.order_id)

  // Query 2: articoli per quegli ordini
  const articlesResult = await pool.query<{
    order_id: string
    article_code: string
    article_description: string | null
    quantity: number
    unit_price: number | null
    line_amount: number | null
  }>(
    `SELECT
       order_id,
       article_code,
       article_description,
       quantity,
       unit_price,
       line_amount
     FROM agents.order_articles
     WHERE order_id = ANY($1)
     ORDER BY order_id, id`,
    [orderIds]
  )

  // Unisci in righe flat per groupOverdueRows
  const articlesByOrderId = new Map<string, typeof articlesResult.rows>()
  for (const a of articlesResult.rows) {
    if (!articlesByOrderId.has(a.order_id)) articlesByOrderId.set(a.order_id, [])
    articlesByOrderId.get(a.order_id)!.push(a)
  }

  const flatRows: OverdueRow[] = []
  for (const order of ordersResult.rows) {
    const articles = articlesByOrderId.get(order.order_id) ?? []
    if (articles.length === 0) {
      flatRows.push({
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        order_id: order.order_id,
        order_number: order.order_number,
        order_date: order.order_date,
        invoice_number: order.invoice_number,
        invoice_due_date: order.invoice_due_date,
        article_code: null,
        article_description: null,
        quantity: null,
        unit_price: null,
        line_amount: null,
      })
    } else {
      for (const a of articles) {
        flatRows.push({
          customer_name: order.customer_name,
          customer_email: order.customer_email,
          order_id: order.order_id,
          order_number: order.order_number,
          order_date: order.order_date,
          invoice_number: order.invoice_number,
          invoice_due_date: order.invoice_due_date,
          article_code: a.article_code,
          article_description: a.article_description,
          quantity: a.quantity,
          unit_price: a.unit_price,
          line_amount: a.line_amount,
        })
      }
    }
  }

  return groupOverdueRows(flatRows)
}
```

- [ ] **Step 2: Verifica che i test esistenti passino ancora (nessuna modifica ai test)**

```bash
npm test --prefix archibald-web-app/backend -- overdue-report.spec
```

Atteso: PASS (3 test)

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/overdue-report.ts
git commit -m "feat(backend): getOverdueReport con due query PostgreSQL"
```

---

### Task 3: Backend — router + registrazione in server.ts + build check

**Files:**
- Create: `backend/src/routes/overdue-report.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Crea il router**

Crea `backend/src/routes/overdue-report.ts`:

```typescript
import { Router } from 'express'
import type { AuthRequest } from '../middleware/auth'
import type { DbPool } from '../db/pool'
import { getOverdueReport } from '../db/repositories/overdue-report'
import { logger } from '../logger'

type OverdueReportRouterDeps = {
  pool: DbPool
}

export function createOverdueReportRouter({ pool }: OverdueReportRouterDeps) {
  const router = Router()

  router.get('/overdue-report', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id
      const data = await getOverdueReport(pool, userId)
      res.json(data)
    } catch (err) {
      logger.error({ err }, 'Errore generazione overdue report')
      res.status(500).json({ error: 'Errore interno del server' })
    }
  })

  return router
}
```

- [ ] **Step 2: Registra il router in `server.ts`**

Apri `backend/src/server.ts`. Cerca il blocco dove sono registrate le route degli ordini (cerca `createOrdersRouter`). Subito dopo l'ultima riga `app.use('/api/orders', ...)` aggiungi:

```typescript
// aggiungere anche questo import in cima al file, con gli altri import dei router:
import { createOverdueReportRouter } from './routes/overdue-report'

// e questa riga nel blocco delle route (dopo le route ordini):
app.use('/api/orders', authenticate, createOverdueReportRouter({ pool }))
```

- [ ] **Step 3: Verifica build TypeScript backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: build completata senza errori. Se ci sono errori di tipo, correggi prima di procedere.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/routes/overdue-report.ts archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): router GET /api/orders/overdue-report"
```

---

### Task 4: Frontend — modulo API `overdue-report.ts`

**Files:**
- Create: `frontend/src/api/overdue-report.ts`

- [ ] **Step 1: Crea il modulo API**

Apri un file esistente in `frontend/src/api/` (es. `orders.ts`) per vedere il pattern esatto di `fetchWithRetry`. Poi crea `frontend/src/api/overdue-report.ts`:

```typescript
import { fetchWithRetry } from './fetch-utils' // adatta il path al pattern del progetto

export type OverdueArticle = {
  articleCode: string
  articleDescription: string | null
  quantity: number
  unitPrice: number | null
  lineAmount: number | null
}

export type OverdueOrder = {
  orderId: string
  orderNumber: string
  orderDate: string
  invoiceNumber: string
  invoiceDueDate: string
  articles: OverdueArticle[]
}

export type OverdueCustomer = {
  customerName: string
  customerEmail: string | null
  orders: OverdueOrder[]
  subtotal: number
}

export type OverdueReportData = {
  customers: OverdueCustomer[]
  grandTotal: number
}

export async function fetchOverdueReport(): Promise<OverdueReportData> {
  const res = await fetchWithRetry('/api/orders/overdue-report')
  if (!res.ok) throw new Error(`Errore caricamento dati scaduti: ${res.status}`)
  return res.json() as Promise<OverdueReportData>
}
```

**Nota:** Se `fetchWithRetry` ha una firma diversa (es. accetta options o usa un wrapper), adattala guardando gli altri moduli in `src/api/`. Il pattern è uniforme in tutto il progetto.

- [ ] **Step 2: Type check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/api/overdue-report.ts
git commit -m "feat(frontend): modulo API fetchOverdueReport"
```

---

### Task 5: Frontend — servizio PDF `overdue-pdf.service.ts`

**Files:**
- Create: `frontend/src/services/overdue-pdf.service.ts`

- [ ] **Step 1: Crea il servizio PDF**

Crea `frontend/src/services/overdue-pdf.service.ts`:

```typescript
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
  const infoLine = `${order.orderNumber}  |  Fattura: ${order.invoiceNumber}  |  Scad: ${fmtDate(order.invoiceDueDate)} (${late} gg fa)`

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
    margin: { left: MARGIN + 4, right: MARGIN },
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
```

- [ ] **Step 2: Type check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: nessun errore di tipo.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/services/overdue-pdf.service.ts
git commit -m "feat(frontend): servizio generazione PDF ordini scaduti con jsPDF"
```

---

### Task 6: Frontend — bottone "PDF Scaduti" in OrderHistory.tsx

**Files:**
- Modify: `frontend/src/pages/OrderHistory.tsx`

- [ ] **Step 1: Aggiungi import e state**

Apri `frontend/src/pages/OrderHistory.tsx`. In cima al file, aggiungi gli import:

```typescript
import { fetchOverdueReport } from '../api/overdue-report'
import { generateOverduePDF } from '../services/overdue-pdf.service'
```

All'interno del componente, dopo gli altri `useState`, aggiungi:

```typescript
const [exportingPDF, setExportingPDF] = useState(false)
```

- [ ] **Step 2: Aggiungi il handler**

Sempre nel componente, aggiungi:

```typescript
const handleExportOverduePDF = async () => {
  setExportingPDF(true)
  try {
    const data = await fetchOverdueReport()
    // agentName: usa il nome dell'utente loggato. Guarda come altri componenti
    // accedono all'utente (es. useAuth hook). Se non disponibile usa stringa vuota.
    const agentName = user?.name ?? user?.username ?? ''
    generateOverduePDF(data, agentName)
  } catch (err) {
    console.error('Errore export PDF scaduti:', err)
  } finally {
    setExportingPDF(false)
  }
}
```

**Nota:** `user` viene dall'hook di autenticazione già usato in questo componente (cerca `useAuth` o `user` nelle prime 100 righe del file per trovare il pattern esatto). Adatta `user?.name` al campo corretto disponibile.

- [ ] **Step 3: Aggiungi il bottone affianco a "Leggi gli stati"**

Cerca il bottone "Leggi gli stati" nel file (cerca `setLegendOpen`). È attorno alla riga 1258. Il contenitore attorno ad esso è un `div` con style `display: flex` o simile. Aggiungi il nuovo bottone **prima** del bottone "Leggi gli stati" esistente:

```tsx
<button
  onClick={handleExportOverduePDF}
  disabled={exportingPDF}
  style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: exportingPDF ? '#f5f5f5' : '#fff',
    color: exportingPDF ? '#aaa' : '#c0392b',
    border: '2px solid',
    borderColor: exportingPDF ? '#ddd' : '#c0392b',
    borderRadius: '8px',
    cursor: exportingPDF ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s',
  }}
  onMouseEnter={(e) => {
    if (!exportingPDF) {
      e.currentTarget.style.backgroundColor = '#c0392b'
      e.currentTarget.style.color = '#fff'
    }
  }}
  onMouseLeave={(e) => {
    if (!exportingPDF) {
      e.currentTarget.style.backgroundColor = '#fff'
      e.currentTarget.style.color = '#c0392b'
    }
  }}
>
  {exportingPDF ? 'Generando...' : 'PDF Scaduti'}
</button>
```

- [ ] **Step 4: Type check e test frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```

Atteso: nessun errore di tipo, tutti i test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/OrderHistory.tsx
git commit -m "feat(frontend): bottone PDF Scaduti in OrderHistory affianco a Leggi gli stati"
```

---

### Task 7: Build backend + test manuali + commit finale

**Files:** nessun nuovo file

- [ ] **Step 1: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: tutti i test passano (inclusi i 3 nuovi in `overdue-report.spec.ts`).

- [ ] **Step 2: Build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: build senza errori.

- [ ] **Step 3: Test manuale**

Avvia il backend locale e apri la PWA su `localhost`. Vai in `/orders` e:
1. Verifica che il bottone "PDF Scaduti" appaia affianco a "Leggi gli stati"
2. Clicca il bottone — deve mostrare "Generando..." durante il fetch
3. Verifica che il PDF si scarichi con nome `ordini-scaduti-YYYYMMDD.pdf`
4. Apri il PDF e verifica:
   - Header con data, agente, conteggio ordini, totale scaduto
   - Clienti raggruppati con nome, email (o "n/d"), subtotale
   - Per ogni ordine: numero, fattura, data scadenza, giorni di ritardo
   - Tabella articoli con codice, descrizione, quantità, prezzo, totale riga
   - Footer con numero pagina su ogni pagina
   - Totale generale nell'ultima pagina
5. Confronta il conteggio ordini nel PDF con il badge "Scaduti (41)" nella UI

- [ ] **Step 4: Verifica che il bottone non blocchi l'UI durante la generazione**

Clicca "PDF Scaduti" e durante "Generando..." verifica che il resto della pagina (filtri, lista ordini) sia ancora interagibile.
