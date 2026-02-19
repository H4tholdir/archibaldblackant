import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSubclientsRouter, type SubclientsRouterDeps } from './subclients';

const mockSubclients = [
  { codice: 'SC001', nome: 'Subclient One', indirizzo: 'Via Roma 1', cap: '20100', citta: 'Milano', provincia: 'MI' },
  { codice: 'SC002', nome: 'Subclient Two', indirizzo: 'Via Verdi 5', cap: '10100', citta: 'Torino', provincia: 'TO' },
];

function createMockDeps(): SubclientsRouterDeps {
  return {
    getAllSubclients: vi.fn().mockResolvedValue(mockSubclients),
    searchSubclients: vi.fn().mockResolvedValue([mockSubclients[0]]),
    getSubclientByCodice: vi.fn().mockResolvedValue(mockSubclients[0]),
    deleteSubclient: vi.fn().mockResolvedValue(true),
  };
}

function createApp(deps: SubclientsRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/subclients', createSubclientsRouter(deps));
  return app;
}

describe('createSubclientsRouter', () => {
  let deps: SubclientsRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('GET /api/subclients', () => {
    test('returns all subclients when no search query', async () => {
      const res = await request(app).get('/api/subclients');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: mockSubclients });
      expect(deps.getAllSubclients).toHaveBeenCalled();
    });

    test('searches subclients when search query provided', async () => {
      const res = await request(app).get('/api/subclients?search=One');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [mockSubclients[0]] });
      expect(deps.searchSubclients).toHaveBeenCalledWith('One');
    });

    test('returns 500 on error', async () => {
      (deps.getAllSubclients as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
      const res = await request(app).get('/api/subclients');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/subclients/:codice', () => {
    test('returns subclient by codice', async () => {
      const res = await request(app).get('/api/subclients/SC001');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: mockSubclients[0] });
      expect(deps.getSubclientByCodice).toHaveBeenCalledWith('SC001');
    });

    test('returns 404 when subclient not found', async () => {
      (deps.getSubclientByCodice as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const res = await request(app).get('/api/subclients/UNKNOWN');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: 'Sottocliente non trovato' });
    });
  });

  describe('DELETE /api/subclients/:codice', () => {
    test('deletes subclient', async () => {
      const res = await request(app).delete('/api/subclients/SC001');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(deps.deleteSubclient).toHaveBeenCalledWith('SC001');
    });

    test('returns 404 when subclient not found', async () => {
      (deps.deleteSubclient as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const res = await request(app).delete('/api/subclients/UNKNOWN');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: 'Sottocliente non trovato' });
    });
  });
});
