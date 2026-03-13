import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSubClientMatchesRouter } from './sub-client-matches';
import type { SubClientMatchesRouterDeps } from './sub-client-matches';

const MOCK_RESULT = { customerProfileIds: ['P001'], subClientCodices: [], skipModal: false };

function buildApp(overrides: Partial<SubClientMatchesRouterDeps> = {}) {
  const deps: SubClientMatchesRouterDeps = {
    getMatchesForSubClient: vi.fn().mockResolvedValue(MOCK_RESULT),
    getMatchesForCustomer: vi.fn().mockResolvedValue(MOCK_RESULT),
    addCustomerMatch: vi.fn().mockResolvedValue(undefined),
    removeCustomerMatch: vi.fn().mockResolvedValue(undefined),
    addSubClientMatch: vi.fn().mockResolvedValue(undefined),
    removeSubClientMatch: vi.fn().mockResolvedValue(undefined),
    upsertSkipModal: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).user = { userId: 'user-1' };
    next();
  });
  app.use('/api/sub-client-matches', createSubClientMatchesRouter(deps));
  return { app, deps };
}

describe('GET /api/sub-client-matches', () => {
  it('returns 400 without codice param', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/sub-client-matches');
    expect(res.status).toBe(400);
  });

  it('returns match result for subclient', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/sub-client-matches').query({ codice: 'C00001' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(MOCK_RESULT);
  });
});

describe('POST /api/sub-client-matches/customer', () => {
  it('calls addCustomerMatch and returns 200', async () => {
    const { app, deps } = buildApp();
    const res = await request(app)
      .post('/api/sub-client-matches/customer')
      .send({ codice: 'C00001', customerProfileId: 'P001' });
    expect(res.status).toBe(200);
    expect(deps.addCustomerMatch).toHaveBeenCalledWith('C00001', 'P001');
  });
});

describe('DELETE /api/sub-client-matches/subclient', () => {
  it('calls removeSubClientMatch with params as-received (canonical ordering is repo responsibility)', async () => {
    const { app, deps } = buildApp();
    const res = await request(app)
      .delete('/api/sub-client-matches/subclient')
      .query({ codiceA: 'C00002', codiceB: 'C00001' });
    expect(res.status).toBe(200);
    expect(deps.removeSubClientMatch).toHaveBeenCalledWith('C00002', 'C00001');
  });

  it('returns 400 without both codice params', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .delete('/api/sub-client-matches/subclient')
      .query({ codiceA: 'C00001' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/sub-client-matches/skip-modal', () => {
  it('calls upsertSkipModal with userId from session', async () => {
    const { app, deps } = buildApp();
    const res = await request(app)
      .patch('/api/sub-client-matches/skip-modal')
      .send({ entityType: 'subclient', entityId: 'C00001', skip: true });
    expect(res.status).toBe(200);
    expect(deps.upsertSkipModal).toHaveBeenCalledWith('user-1', 'subclient', 'C00001', true);
  });
});
