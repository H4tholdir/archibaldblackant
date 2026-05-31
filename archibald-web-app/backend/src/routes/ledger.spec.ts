import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLedgerRouter } from './ledger';

function createMockPool() {
  return { query: vi.fn() };
}

function createApp(pool: ReturnType<typeof createMockPool>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'u1' };
    next();
  });
  app.use('/api/ledger', createLedgerRouter({ pool: pool as any }));
  return app;
}

describe('GET /api/ledger/dashboard-summary', () => {
  it('restituisce 200 con struttura totalScaduto e blockedCount', async () => {
    const pool = createMockPool();
    pool.query
      .mockResolvedValueOnce({
        rows: [{ name: 'Maco', erp_id: '55.226', blocked_status: 'Completo', scaduto: '3277.57', aperto: '3277.57' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ cnt: '1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ cnt: '0' }], rowCount: 1 });

    const res = await request(createApp(pool)).get('/api/ledger/dashboard-summary');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      totalScaduto: expect.any(Number),
      blockedCount: 1,
      pendingWaCount: 0,
    });
  });

  it('restituisce totalScaduto 0 quando non ci sono debitori', async () => {
    const pool = createMockPool();
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ cnt: '0' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ cnt: '0' }], rowCount: 1 });

    const res = await request(createApp(pool)).get('/api/ledger/dashboard-summary');

    expect(res.status).toBe(200);
    expect(res.body.data.totalScaduto).toBe(0);
    expect(res.body.data.topDebtors).toEqual([]);
  });
});

describe('GET /api/ledger/customers-exposure', () => {
  it('restituisce clienti con esposizione e bloccati', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce({
      rows: [
        { name: 'Maco Srl', erp_id: '55.226', blocked_status: 'Completo', scaduto: '3000.00', aperto: '3500.00' },
        { name: 'Fresis Coop', erp_id: '55.261', blocked_status: null, scaduto: '1200.50', aperto: '1200.50' },
      ],
      rowCount: 2,
    });

    const res = await request(createApp(pool)).get('/api/ledger/customers-exposure');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([
      { erpId: '55.226', name: 'Maco Srl', scaduto: 3000, aperto: 3500, isBlocked: true, blockedStatus: 'Completo' },
      { erpId: '55.261', name: 'Fresis Coop', scaduto: 1200.5, aperto: 1200.5, isBlocked: false, blockedStatus: null },
    ]);
  });

  it('restituisce array vuoto quando non ci sono clienti con esposizione', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(createApp(pool)).get('/api/ledger/customers-exposure');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /api/ledger/:erpId', () => {
  it('restituisce 200 con summary zero quando il pool non restituisce fatture', async () => {
    const pool = createMockPool();
    // Prima chiamata: query principale fatture aperte → vuota
    // Seconda chiamata: CUSTOMER_INFO_SQL → 1 riga con contatti
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ blocked_status: null, effective_email: 'a@b.it', effective_whatsapp: null }],
        rowCount: 1,
      });

    const res = await request(createApp(pool)).get('/api/ledger/55.226');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      totalDaSaldare: 0,
      totalScaduto: 0,
      openInvoices: [],
    });
  });

  it('restituisce 200 con fatture mappate quando il pool restituisce dati', async () => {
    const pool = createMockPool();
    const fakeRow = {
      invoice_number: 'FAT-001',
      order_id: 'ord-1',
      invoice_date: '2026-01-10',
      invoice_amount_num: '1000.00',
      remaining_num: '500.00',
      settled_num: '500.00',
      invoice_due_date: '2026-01-31',
      days_past_due: '30',
      invoice_last_payment_id: null,
      invoice_last_settlement_date: null,
      blocked_status: null,
      effective_email: 'c@test.it',
      effective_whatsapp: null,
    };
    pool.query.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 });

    const res = await request(createApp(pool)).get('/api/ledger/55.226');

    expect(res.status).toBe(200);
    expect(res.body.data.openInvoices).toHaveLength(1);
    expect(res.body.data.openInvoices[0].invoiceNumber).toBe('FAT-001');
  });
});
