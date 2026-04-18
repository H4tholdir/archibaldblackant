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
