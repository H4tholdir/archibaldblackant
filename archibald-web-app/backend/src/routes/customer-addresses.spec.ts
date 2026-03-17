import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { DbPool } from '../db/pool';
import { createCustomerAddressesRouter } from './customer-addresses';

const userId = 'user-1';
const customerProfile = 'CUST-001';

const mockAddress = {
  id: 1,
  userId,
  customerProfile,
  tipo: 'Consegna',
  nome: null,
  via: 'Via Roma 1',
  cap: '80100',
  citta: 'Napoli',
  contea: null,
  stato: null,
  idRegione: null,
  contra: null,
};

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn().mockImplementation(async (fn) => fn({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) })),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
}

function createApp(pool: DbPool) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId, username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/customers/:customerProfile/addresses', createCustomerAddressesRouter(pool));
  return app;
}

describe('createCustomerAddressesRouter', () => {
  let pool: DbPool;

  beforeEach(() => {
    pool = createMockPool();
  });

  describe('GET /', () => {
    it('returns 200 with addresses array', async () => {
      const row = {
        id: 1, user_id: userId, customer_profile: customerProfile,
        tipo: 'Consegna', nome: null, via: 'Via Roma 1', cap: '80100',
        citta: 'Napoli', contea: null, stato: null, id_regione: null, contra: null,
      };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const res = await request(createApp(pool))
        .get(`/api/customers/${customerProfile}/addresses`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([mockAddress]);
    });
  });

  describe('POST /', () => {
    it('returns 201 with created address when tipo is provided', async () => {
      const row = {
        id: 1, user_id: userId, customer_profile: customerProfile,
        tipo: 'Ufficio', nome: null, via: 'Via X', cap: '10100',
        citta: 'Torino', contea: null, stato: null, id_regione: null, contra: null,
      };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const res = await request(createApp(pool))
        .post(`/api/customers/${customerProfile}/addresses`)
        .send({ tipo: 'Ufficio', via: 'Via X', cap: '10100', citta: 'Torino' });

      expect(res.status).toBe(201);
      expect(res.body.tipo).toBe('Ufficio');
    });

    it('returns 400 when tipo is missing', async () => {
      const res = await request(createApp(pool))
        .post(`/api/customers/${customerProfile}/addresses`)
        .send({ via: 'Via X' });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /:id', () => {
    it('returns 200 with updated address', async () => {
      const row = {
        id: 1, user_id: userId, customer_profile: customerProfile,
        tipo: 'Fattura', nome: null, via: 'Via Y', cap: '00100',
        citta: 'Roma', contea: null, stato: null, id_regione: null, contra: null,
      };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const res = await request(createApp(pool))
        .put(`/api/customers/${customerProfile}/addresses/1`)
        .send({ tipo: 'Fattura', via: 'Via Y', cap: '00100', citta: 'Roma' });

      expect(res.status).toBe(200);
      expect(res.body.tipo).toBe('Fattura');
    });

    it('returns 404 when address id not found for this user', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(createApp(pool))
        .put(`/api/customers/${customerProfile}/addresses/999`)
        .send({ tipo: 'Ufficio' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('returns 204 when address deleted successfully', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(createApp(pool))
        .delete(`/api/customers/${customerProfile}/addresses/1`);

      expect(res.status).toBe(204);
    });

    it('returns 404 when address not found for this user', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(createApp(pool))
        .delete(`/api/customers/${customerProfile}/addresses/999`);

      expect(res.status).toBe(404);
    });
  });
});
