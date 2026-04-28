import { describe, test, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp, type AppDeps } from '../server';
import { generateJWT } from '../auth-utils';

// Mocks required by createApp (same pattern as server.spec.ts)
vi.mock('../pdf-parser-service', () => ({
  pdfParserService: { healthCheck: vi.fn() },
}));
vi.mock('../pdf-parser-products-service', () => ({
  PDFParserProductsService: { getInstance: vi.fn().mockReturnValue({ healthCheck: vi.fn() }) },
}));
vi.mock('../pdf-parser-prices-service', () => ({
  PDFParserPricesService: { getInstance: vi.fn().mockReturnValue({ healthCheck: vi.fn() }) },
}));
vi.mock('../pdf-parser-orders-service', () => ({
  PDFParserOrdersService: { getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }) },
}));
vi.mock('../pdf-parser-ddt-service', () => ({
  PDFParserDDTService: { getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }) },
}));
vi.mock('../pdf-parser-invoices-service', () => ({
  PDFParserInvoicesService: { getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }) },
}));
vi.mock('../bot/archibald-bot', () => ({
  ArchibaldBot: vi.fn().mockImplementation(() => ({
    initializeDedicatedBrowser: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));


const TEST_USER_ID = 'test-appt-user-1';
const TEST_USERNAME = 'test-appt-agent';

const START_AT = '2026-06-01T09:00:00.000Z';
const END_AT = '2026-06-01T10:00:00.000Z';
const FROM_DATE = '2026-05-01';
const TO_DATE = '2026-07-01';

type MockAppointmentRow = {
  id: string;
  user_id: string;
  title: string;
  start_at: Date;
  end_at: Date;
  all_day: boolean;
  customer_erp_id: string | null;
  customer_name: string | null;
  location: string | null;
  type_id: number | null;
  type_label: string | null;
  type_emoji: string | null;
  type_color_hex: string | null;
  notes: string | null;
  ics_uid: string;
  google_event_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function makeApptRow(overrides: Partial<MockAppointmentRow> = {}): MockAppointmentRow {
  const now = new Date();
  return {
    id: 'appt-id-1',
    user_id: TEST_USER_ID,
    title: 'Riunione cliente',
    start_at: new Date(START_AT),
    end_at: new Date(END_AT),
    all_day: false,
    customer_erp_id: null,
    customer_name: null,
    location: null,
    type_id: null,
    type_label: null,
    type_emoji: null,
    type_color_hex: null,
    notes: null,
    ics_uid: 'test-uid-abc123@formicanera',
    google_event_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function createMockDeps(queryResponses: { post?: object; get?: object[]; ics?: object[] } = {}): AppDeps {
  const postRow = makeApptRow();
  const getRows = queryResponses.get ?? [postRow];
  const icsRows = queryResponses.ics ?? [postRow];

  let callCount = 0;

  const mockPool = {
    query: vi.fn().mockImplementation((sql: string) => {
      // ICS token lookup (getUserIdByIcsToken)
      if (typeof sql === 'string' && sql.includes('ics_token')) {
        return Promise.resolve({ rows: [{ id: TEST_USER_ID }] });
      }
      // ics_token select from users (GET /api/agenda/ics-token)
      if (typeof sql === 'string' && sql.includes('SELECT ics_token')) {
        return Promise.resolve({ rows: [{ ics_token: 'valid-ics-token' }] });
      }
      // appointments INSERT → returns single row
      if (typeof sql === 'string' && sql.includes('INSERT INTO agents.appointments')) {
        return Promise.resolve({ rows: [queryResponses.post ?? postRow] });
      }
      // appointments SELECT (list / feed ICS)
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({ rows: icsRows });
      }
      return Promise.resolve({ rows: getRows });
    }),
    end: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({ totalCount: 5, idleCount: 3, waitingCount: 0 }),
  };

  const mockQueue = {
    enqueue: vi.fn().mockResolvedValue('job-1'),
    getJobStatus: vi.fn().mockResolvedValue(null),
    getAgentJobs: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, prioritized: 0 }),
    close: vi.fn().mockResolvedValue(undefined),
    queue: { getJob: vi.fn().mockResolvedValue(null) },
  };

  return {
    pool: mockPool as any,
    queue: mockQueue as any,
    agentLock: {
      acquire: vi.fn().mockReturnValue({ acquired: true }),
      release: vi.fn(),
      setStopCallback: vi.fn(),
      getActive: vi.fn().mockReturnValue(undefined),
      getAllActive: vi.fn().mockReturnValue(new Map()),
    } as any,
    browserPool: {
      initialize: vi.fn().mockResolvedValue(undefined),
      acquireContext: vi.fn().mockResolvedValue({}),
      releaseContext: vi.fn().mockResolvedValue(undefined),
      getStats: vi.fn().mockReturnValue({ browsers: 0, activeContexts: 0, maxContexts: 0, cachedContexts: [] }),
      shutdown: vi.fn().mockResolvedValue(undefined),
    } as any,
    syncScheduler: {
      start: vi.fn(),
      stop: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
      getIntervals: vi.fn().mockReturnValue({ agentSyncMs: 0, sharedSyncMs: 0 }),
    } as any,
    wsServer: {
      initialize: vi.fn(),
      broadcast: vi.fn(),
      broadcastToAll: vi.fn(),
      replayEvents: vi.fn(),
      registerConnection: vi.fn(),
      unregisterConnection: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalConnections: 0, activeUsers: 0, uptime: 0, reconnectionCount: 0, messagesSent: 0, messagesReceived: 0, averageLatency: 0, connectionsPerUser: {} }),
      shutdown: vi.fn().mockResolvedValue(undefined),
    } as any,
    passwordCache: {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      clear: vi.fn(),
    } as any,
    pdfStore: {
      save: vi.fn().mockReturnValue({ id: 'pdf-1', url: '/share/pdf/pdf-1' }),
      get: vi.fn().mockReturnValue(null),
      delete: vi.fn(),
    } as any,
    generateJWT: vi.fn().mockResolvedValue('test-token'),
    verifyToken: vi.fn().mockResolvedValue(null),
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    uploadToDropbox: vi.fn().mockResolvedValue({ path: '/test' }),
  };
}

describe('POST /api/appointments + GET /api/appointments', () => {
  test('POST restituisce 400 se body non valido', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);
    const token = await generateJWT({ userId: TEST_USER_ID, username: TEST_USERNAME, role: 'agent', modules: [] });

    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '' });

    expect(res.status).toBe(400);
  });

  test('POST richiede autenticazione', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const res = await request(app)
      .post('/api/appointments')
      .send({ title: 'Test', startAt: START_AT, endAt: END_AT });

    expect(res.status).toBe(401);
  });

  test('GET richiede autenticazione', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const res = await request(app)
      .get(`/api/appointments?from=${FROM_DATE}&to=${TO_DATE}`);

    expect(res.status).toBe(401);
  });

  test('GET restituisce 400 senza parametri from/to', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);
    const token = await generateJWT({ userId: TEST_USER_ID, username: TEST_USERNAME, role: 'agent', modules: [] });

    const res = await request(app)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  test('round trip — POST crea appuntamento e GET lo restituisce con id corrispondente', async () => {
    const apptRow = makeApptRow({ id: 'appt-round-trip-1', title: 'Visita showroom' });
    const deps = createMockDeps({ post: apptRow, get: [apptRow] });
    const app = createApp(deps);
    const token = await generateJWT({ userId: TEST_USER_ID, username: TEST_USERNAME, role: 'agent', modules: [] });

    const postRes = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Visita showroom',
        startAt: START_AT,
        endAt: END_AT,
        allDay: false,
      });

    expect(postRes.status).toBe(201);
    expect(postRes.body).toMatchObject({
      id: 'appt-round-trip-1',
      title: 'Visita showroom',
      userId: TEST_USER_ID,
    });

    const createdId: string = postRes.body.id;

    const getRes = await request(app)
      .get(`/api/appointments?from=${FROM_DATE}&to=${TO_DATE}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body)).toBe(true);
    const found = (getRes.body as { id: string }[]).find(a => a.id === createdId);
    expect(found).toBeDefined();
    expect(found).toMatchObject({ id: createdId, title: 'Visita showroom' });
  });

});


describe('GET /api/agenda/feed.ics', () => {
  test('risponde 401 senza token', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const res = await request(app).get('/api/agenda/feed.ics');

    expect(res.status).toBe(401);
  });

  test('risponde 401 con token non valido', async () => {
    const deps = createMockDeps();
    // Override pool: ics_token lookup restituisce riga vuota
    (deps.pool as any).query = vi.fn().mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('ics_token')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    const app = createApp(deps);

    const res = await request(app).get('/api/agenda/feed.ics?token=token-inesistente');

    expect(res.status).toBe(401);
  });

  test('Content-Type text/calendar e UID presente nel body con token valido', async () => {
    const apptRow = makeApptRow({ ics_uid: 'uid-test-42@formicanera' });
    const deps = createMockDeps({ ics: [apptRow] });
    const app = createApp(deps);

    const res = await request(app).get('/api/agenda/feed.ics?token=valid-ics-token');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/calendar/);
    expect(res.text).toContain('BEGIN:VCALENDAR');
    expect(res.text).toContain('UID:');
  });

  test('body ICS contiene lo UID specifico dell\'appuntamento', async () => {
    const specificUid = 'uid-specifica-verifica@formicanera';
    const apptRow = makeApptRow({ ics_uid: specificUid });
    const deps = createMockDeps({ ics: [apptRow] });
    const app = createApp(deps);

    const res = await request(app).get('/api/agenda/feed.ics?token=valid-ics-token');

    expect(res.status).toBe(200);
    expect(res.text).toContain(`UID:${specificUid}`);
  });

  test('body ICS contiene VCALENDAR, VEVENT e SUMMARY', async () => {
    const apptRow = makeApptRow({ title: 'Appuntamento Komet' });
    const deps = createMockDeps({ ics: [apptRow] });
    const app = createApp(deps);

    const res = await request(app).get('/api/agenda/feed.ics?token=valid-ics-token');

    expect(res.status).toBe(200);
    expect(res.text).toContain('BEGIN:VCALENDAR');
    expect(res.text).toContain('BEGIN:VEVENT');
    expect(res.text).toContain('SUMMARY:Appuntamento Komet');
    expect(res.text).toContain('END:VEVENT');
    expect(res.text).toContain('END:VCALENDAR');
  });
});
