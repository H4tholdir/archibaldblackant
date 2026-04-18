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
