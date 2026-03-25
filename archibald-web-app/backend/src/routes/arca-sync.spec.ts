import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createArcaSyncRouter, type ArcaSyncRouterDeps } from './arca-sync';

vi.mock('../services/arca-sync-service', () => ({
  performArcaSync: vi.fn(),
  getKtSyncStatus: vi.fn(),
  generateKtExportVbs: vi.fn(),
  suggestNextCodice: vi.fn(),
  importCustomerAsSubclient: vi.fn(),
}));

import {
  suggestNextCodice,
  importCustomerAsSubclient,
} from '../services/arca-sync-service';

const mockSuggestNextCodice = vi.mocked(suggestNextCodice);
const mockImportCustomerAsSubclient = vi.mocked(importCustomerAsSubclient);

function makeDeps(): ArcaSyncRouterDeps {
  return {
    pool: { query: vi.fn() } as unknown as ArcaSyncRouterDeps['pool'],
  };
}

function createApp(deps: ArcaSyncRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/arca-sync', createArcaSyncRouter(deps));
  return app;
}

describe('GET /api/arca-sync/suggest-codice', () => {
  let deps: ArcaSyncRouterDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeDeps();
  });

  test('returns suggested code from service', async () => {
    mockSuggestNextCodice.mockResolvedValue('C00042');

    const res = await request(createApp(deps)).get('/api/arca-sync/suggest-codice');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestedCode: 'C00042' });
  });

  test('returns 422 when service throws overflow error', async () => {
    mockSuggestNextCodice.mockRejectedValue(new Error('Codici C esauriti'));

    const res = await request(createApp(deps)).get('/api/arca-sync/suggest-codice');

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('Codici C esauriti');
  });
});

describe('GET /api/arca-sync/check-codice', () => {
  let deps: ArcaSyncRouterDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeDeps();
  });

  test('returns exists: false when codice is not in sub_clients', async () => {
    (deps.pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

    const res = await request(createApp(deps)).get('/api/arca-sync/check-codice?code=C00042');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false });
  });

  test('returns exists: true when codice is found in sub_clients', async () => {
    (deps.pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [{ codice: 'C00042' }] });

    const res = await request(createApp(deps)).get('/api/arca-sync/check-codice?code=C00042');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true });
  });

  test('returns 400 when code query param is missing', async () => {
    const res = await request(createApp(deps)).get('/api/arca-sync/check-codice');

    expect(res.status).toBe(400);
  });
});

describe('POST /api/arca-sync/import-customer', () => {
  let deps: ArcaSyncRouterDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeDeps();
  });

  test('returns 200 on success', async () => {
    mockImportCustomerAsSubclient.mockResolvedValue(undefined);

    const res = await request(createApp(deps))
      .post('/api/arca-sync/import-customer')
      .send({ customerProfileId: 'C01273', codice: 'C00042' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, codice: 'C00042' });
    expect(mockImportCustomerAsSubclient).toHaveBeenCalledWith(
      deps.pool, 'user-1', 'C01273', 'C00042',
    );
  });

  test('returns 409 when service throws "Codice già in uso"', async () => {
    mockImportCustomerAsSubclient.mockRejectedValue(new Error('Codice già in uso'));

    const res = await request(createApp(deps))
      .post('/api/arca-sync/import-customer')
      .send({ customerProfileId: 'C01273', codice: 'C00042' });

    expect(res.status).toBe(409);
  });

  test('returns 422 when service throws format validation error', async () => {
    mockImportCustomerAsSubclient.mockRejectedValue(new Error('Formato codice non valido'));

    const res = await request(createApp(deps))
      .post('/api/arca-sync/import-customer')
      .send({ customerProfileId: 'C01273', codice: 'P00001' });

    expect(res.status).toBe(422);
  });

  test('returns 400 when request body is missing required fields', async () => {
    const res = await request(createApp(deps))
      .post('/api/arca-sync/import-customer')
      .send({ codice: 'C00042' });

    expect(res.status).toBe(400);
  });
});
