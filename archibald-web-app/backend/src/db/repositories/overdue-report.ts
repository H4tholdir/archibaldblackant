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
  orderTotalWithVat: string | null
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
  customer_account_num: string
  order_id: string
  order_number: string
  order_date: string
  invoice_number: string
  invoice_due_date: string
  order_total_with_vat: string | null
  article_code: string | null
  article_description: string | null
  quantity: number | null
  unit_price: number | null
  line_amount: number | null
}

export function groupOverdueRows(rows: OverdueRow[]): OverdueReportData {
  const customerMap = new Map<string, OverdueCustomer>()

  for (const row of rows) {
    if (!customerMap.has(row.customer_account_num)) {
      customerMap.set(row.customer_account_num, {
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        orders: [],
        subtotal: 0,
      })
    }
    const customer = customerMap.get(row.customer_account_num)!

    let order = customer.orders.find(o => o.orderId === row.order_id)
    if (!order) {
      order = {
        orderId: row.order_id,
        orderNumber: row.order_number,
        orderDate: row.order_date,
        invoiceNumber: row.invoice_number,
        invoiceDueDate: row.invoice_due_date,
        orderTotalWithVat: row.order_total_with_vat,
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

export async function getOverdueReport(pool: DbPool, userId: string): Promise<OverdueReportData> {
  // Query 1: tutti gli ordini scaduti con info cliente e fattura (DISTINCT ON per evitare duplicati con più fatture)
  const ordersResult = await pool.query<{
    customer_name: string
    customer_email: string | null
    customer_account_num: string
    order_id: string
    order_number: string
    order_date: string
    invoice_number: string
    invoice_due_date: string
    order_total_with_vat: string | null
  }>(
    `SELECT DISTINCT ON (o.id)
       c.name            AS customer_name,
       c.email           AS customer_email,
       o.customer_account_num,
       o.id              AS order_id,
       o.order_number,
       o.creation_date   AS order_date,
       o.total_with_vat  AS order_total_with_vat,
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
       AND (
         i.invoice_remaining_amount IS NULL
         OR i.invoice_remaining_amount = ''
         OR REGEXP_REPLACE(REPLACE(i.invoice_remaining_amount, '.', ''), ',', '.')::NUMERIC > 0
       )
     WHERE o.user_id = $1
       AND o.creation_date >= '2026-01-01'
       AND o.total_amount NOT LIKE '-%'
       AND o.customer_account_num NOT IN ('049421', '1002328')
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
        customer_account_num: order.customer_account_num,
        order_id: order.order_id,
        order_number: order.order_number,
        order_date: order.order_date,
        invoice_number: order.invoice_number,
        invoice_due_date: order.invoice_due_date,
        order_total_with_vat: order.order_total_with_vat,
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
          customer_account_num: order.customer_account_num,
          order_id: order.order_id,
          order_number: order.order_number,
          order_date: order.order_date,
          invoice_number: order.invoice_number,
          invoice_due_date: order.invoice_due_date,
          order_total_with_vat: order.order_total_with_vat,
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
