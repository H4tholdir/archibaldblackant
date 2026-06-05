import { describe, test, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp, type AppDeps } from '../server';
import { generateJWT } from '../auth-utils';

vi.mock('../pdf-parser-service', () => ({ pdfParserService: { healthCheck: vi.fn() } }));
vi.mock('../pdf-parser-products-service', () => ({ PDFParserProductsService: { getInstance: vi.fn().mockReturnValue({ healthCheck: vi.fn() }) } }));
vi.mock('../pdf-parser-prices-service', () => ({ PDFParserPricesService: { getInstance: vi.fn().mockReturnValue({ healthCheck: vi.fn() }) } }));
vi.mock('../pdf-parser-orders-service', () => ({ PDFParserOrdersService: { getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }) } }));
vi.mock('../pdf-parser-ddt-service', () => ({ PDFParserDDTService: { getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }) } }));
vi.mock('../pdf-parser-invoices-service', () => ({ PDFParserInvoicesService: { getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }) } }));
vi.mock('../bot/archibald-bot', () => ({ ArchibaldBot: vi.fn().mockImplementation(() => ({ initializeDedicatedBrowser: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) })) }));

const USER_ID  = 'test-vp-user-1';
const USERNAME = 'test-vp-agent';

const SESSION_ROW = {
  id: 'sess-uuid-1', user_id: USER_ID, title: 'Giro Napoli',
  horizon: 'day', mode: 'balanced', status: 'draft',
  start_date: '2026-06-06', end_date: '2026-06-06',
  start_location_label: null, start_lat: null, start_lng: null,
  end_location_label: null, end_lat: null, end_lng: null,
  constraints_json: {}, metrics_json: {},
  navigation_started_at: null, active_stop_id: null, generated_at: null,
  created_at: new Date(), updated_at: new Date(),
};

function makeDeps(mockRows: unknown[] = [SESSION_ROW]): AppDeps {
  return {
    pool: {
      query: vi.fn().mockResolvedValue({ rows: mockRows, rowCount: mockRows.length }),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
    } as any,
    queue: { enqueue: vi.fn(), getJobStatus: vi.fn().mockResolvedValue(null), getAgentJobs: vi.fn().mockResolvedValue([]), getStats: vi.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, prioritized: 0 }), close: vi.fn(), queue: { getJob: vi.fn().mockResolvedValue(null) } } as any,
    agentLock: { acquire: vi.fn().mockReturnValue({ acquired: true }), release: vi.fn(), setStopCallback: vi.fn(), getActive: vi.fn().mockReturnValue(undefined), getAllActive: vi.fn().mockReturnValue(new Map()) } as any,
    browserPool: { initialize: vi.fn().mockResolvedValue(undefined), acquireContext: vi.fn().mockResolvedValue({}), releaseContext: vi.fn().mockResolvedValue(undefined), getStats: vi.fn().mockReturnValue({ browsers: 0, activeContexts: 0, maxContexts: 0, cachedContexts: [] }), shutdown: vi.fn().mockResolvedValue(undefined) } as any,
    syncScheduler: { start: vi.fn(), stop: vi.fn(), isRunning: vi.fn().mockReturnValue(false), getIntervals: vi.fn().mockReturnValue({ agentSyncMs: 0, sharedSyncMs: 0 }) } as any,
    wsServer: { initialize: vi.fn(), broadcast: vi.fn(), broadcastToAll: vi.fn(), replayEvents: vi.fn(), registerConnection: vi.fn(), unregisterConnection: vi.fn(), getStats: vi.fn().mockReturnValue({ totalConnections: 0, activeUsers: 0, uptime: 0, reconnectionCount: 0, messagesSent: 0, messagesReceived: 0, averageLatency: 0, connectionsPerUser: {} }), shutdown: vi.fn().mockResolvedValue(undefined) } as any,
    passwordCache: { get: vi.fn().mockReturnValue(null), set: vi.fn(), clear: vi.fn() } as any,
    pdfStore: { save: vi.fn().mockReturnValue({ id: 'p1', url: '/share/pdf/p1' }), get: vi.fn().mockReturnValue(null), delete: vi.fn() } as any,
    generateJWT: vi.fn().mockResolvedValue('test-token'),
    verifyToken: vi.fn().mockResolvedValue(null),
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    uploadToDropbox: vi.fn().mockResolvedValue({ path: '/test' }),
  };
}

describe('POST /api/visit-planning/sessions', () => {
  test('richiede autenticazione', async () => {
    const app = createApp(makeDeps());
    const res = await request(app).post('/api/visit-planning/sessions').send({});
    expect(res.status).toBe(401);
  });

  test('restituisce 400 se body non valido', async () => {
    const app = createApp(makeDeps());
    const token = await generateJWT({ userId: USER_ID, username: USERNAME, role: 'agent', modules: [] });
    const res = await request(app)
      .post('/api/visit-planning/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '' });
    expect(res.status).toBe(400);
  });

  test('crea sessione e restituisce 201 con body corretto', async () => {
    const app = createApp(makeDeps());
    const token = await generateJWT({ userId: USER_ID, username: USERNAME, role: 'agent', modules: [] });
    const res = await request(app)
      .post('/api/visit-planning/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Giro Napoli', horizon: 'day', mode: 'balanced', startDate: '2026-06-06', endDate: '2026-06-06' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Giro Napoli', horizon: 'day', mode: 'balanced' });
  });
});

describe('GET /api/visit-planning/sessions', () => {
  test('richiede autenticazione', async () => {
    const app = createApp(makeDeps());
    const res = await request(app).get('/api/visit-planning/sessions?from=2026-06-01&to=2026-06-30');
    expect(res.status).toBe(401);
  });

  test('restituisce array sessioni', async () => {
    const app = createApp(makeDeps([SESSION_ROW]));
    const token = await generateJWT({ userId: USER_ID, username: USERNAME, role: 'agent', modules: [] });
    const res = await request(app)
      .get('/api/visit-planning/sessions?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/visit-planning/sessions/:sessionId/generate', () => {
  test('richiede autenticazione', async () => {
    const app = createApp(makeDeps());
    const res = await request(app)
      .post('/api/visit-planning/sessions/sess-uuid-1/generate')
      .send({});
    expect(res.status).toBe(401);
  });

  test('restituisce 404 se sessione non trovata', async () => {
    const app = createApp(makeDeps([]));
    const token = await generateJWT({ userId: USER_ID, username: USERNAME, role: 'agent', modules: [] });
    const res = await request(app)
      .post('/api/visit-planning/sessions/non-esiste/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(404);
  });

  test('restituisce 201 con generated e stops quando sessione trovata', async () => {
    // Il mock generico risponde SESSION_ROW a tutte le query:
    // - middleware (getUserModulesVersion, updateLastActivity)
    // - getSession → SESSION_ROW con user_id=USER_ID → sessione trovata
    // - home_lat/lng, buildCandidates (customers/fresis/orders) → SESSION_ROW non è un
    //   customer valido (valore=0, daysSinceLastOrder=null) → filtrato → candidates vuoti
    // - generateVisitRoute early-return [] → { generated: 0, stops: [] }
    const app = createApp(makeDeps([SESSION_ROW]));
    const token = await generateJWT({ userId: USER_ID, username: USERNAME, role: 'agent', modules: [] });
    const res = await request(app)
      .post('/api/visit-planning/sessions/sess-uuid-1/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('generated');
    expect(res.body).toHaveProperty('stops');
    expect(Array.isArray(res.body.stops)).toBe(true);
  });
});
