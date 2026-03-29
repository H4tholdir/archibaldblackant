import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCustomerFullHistoryRouter } from './customer-full-history';
import type { FullHistoryOrder } from '../types/full-history';

const MOCK_ORDERS: FullHistoryOrder[] = [
  {
    source: 'orders',
    orderId: 'ord-1',
    orderNumber: 'FT 247',
    orderDate: '2024-02-23T00:00:00.000Z',
    totalAmount: 44.47,
    orderDiscountPercent: 0,
    articles: [],
  },
];

function buildApp(getHistory = vi.fn().mockResolvedValue(MOCK_ORDERS)) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).user = { userId: 'user-1' };
    next();
  });
  app.use('/api/history', createCustomerFullHistoryRouter({ getCustomerFullHistory: getHistory }));
  return { app, getHistory };
}

describe('GET /api/history/customer-full-history', () => {
  it('returns 400 when no params provided', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/history/customer-full-history');
    expect(res.status).toBe(400);
  });

  it('returns orders for single customerErpIds[]', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get('/api/history/customer-full-history')
      .query({ 'customerErpIds[]': 'C10181' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ orders: MOCK_ORDERS });
  });

  it('passes customerErpIds array to handler', async () => {
    const { app, getHistory } = buildApp();
    await request(app)
      .get('/api/history/customer-full-history')
      .query({ 'customerErpIds[]': ['C10181', 'C10182'] });
    expect(getHistory).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ customerErpIds: ['C10181', 'C10182'] }),
    );
  });

  it('returns 400 when only empty arrays provided', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/history/customer-full-history');
    expect(res.status).toBe(400);
  });

  it('returns 500 on error', async () => {
    const { app } = buildApp(vi.fn().mockRejectedValue(new Error('DB error')));
    const res = await request(app)
      .get('/api/history/customer-full-history')
      .query({ 'customerErpIds[]': 'C10181' });
    expect(res.status).toBe(500);
  });
});
