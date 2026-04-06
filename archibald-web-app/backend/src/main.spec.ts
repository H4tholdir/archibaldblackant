import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';

vi.mock('./config', () => ({
  config: {
    database: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: '', maxConnections: 5 },
    server: { port: 3000, nodeEnv: 'test' },
    puppeteer: { headless: true, slowMo: 0, timeout: 60000, protocolTimeout: 300000, args: ['--no-sandbox'] },
    archibald: { url: 'https://example.com/Archibald', username: '', password: '' },
    logging: { level: 'info' },
    queue: { workerConcurrency: 10 },
    queues: {
      writes: { concurrency: 5, lockDuration: 420000, stalledInterval: 30000, removeOnComplete: { count: 500 } },
      'agent-sync': { concurrency: 3, lockDuration: 300000, stalledInterval: 30000, removeOnComplete: true },
      enrichment: { concurrency: 3, lockDuration: 900000, stalledInterval: 30000, removeOnComplete: true },
      'shared-sync': { concurrency: 1, lockDuration: 900000, stalledInterval: 60000, removeOnComplete: true },
      'bot-queue': { concurrency: 1, lockDuration: 900000, stalledInterval: 30000, removeOnComplete: { count: 100 } },
    },
    browserPool: { maxBrowsers: 3, maxContextsPerBrowser: 8, contextExpiryMs: 1800000, serviceAccountContextExpiryMs: 900000 },
    recognition: { anthropicApiKey: '', dailyLimit: 500, timeoutMs: 15000 },
  },
}));

vi.mock('./db/pool', () => ({
  createPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    withTransaction: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn(() => ({ totalCount: 0, idleCount: 0, waitingCount: 0 })),
  })),
}));

vi.mock('./db/migrate', () => ({
  runMigrations: vi.fn().mockResolvedValue({ applied: [], skipped: [] }),
  loadMigrationFiles: vi.fn(() => []),
}));

vi.mock('./db/repositories/users', () => ({
  getWhitelistedUsers: vi.fn().mockResolvedValue([
    { id: 'agent-1', username: 'agent1' },
    { id: 'agent-2', username: 'agent2' },
  ]),
  getUserById: vi.fn().mockResolvedValue({ id: 'agent-1', username: 'agent1' }),
  getAgentIdsByStatus: vi.fn().mockImplementation((_pool: unknown, status: string) => {
    if (status === 'active') return Promise.resolve(['agent-1', 'agent-2']);
    if (status === 'idle') return Promise.resolve(['agent-3']);
    return Promise.resolve([]);
  }),
}));

vi.mock('./operations/operation-queue', () => {
  const mockQueue = {
    enqueue: vi.fn().mockResolvedValue('job-1'),
    getJobStatus: vi.fn(),
    getAgentJobs: vi.fn(),
    getStats: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    queue: {},
  };
  return {
    createOperationQueue: vi.fn(() => mockQueue),
    createMultiQueueFacade: vi.fn(() => mockQueue),
  };
});

vi.mock('./operations/agent-lock', () => ({
  createAgentLock: vi.fn(() => ({
    acquire: vi.fn(),
    release: vi.fn(),
    setStopCallback: vi.fn(),
    getActive: vi.fn(),
    getAllActive: vi.fn(),
  })),
}));

vi.mock('./bot/browser-pool', () => ({
  createBrowserPool: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    acquireContext: vi.fn(),
    releaseContext: vi.fn(),
    getStats: vi.fn(() => ({ browsers: 0, activeContexts: 0, maxContexts: 0, cachedContexts: [] })),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('./bot/archibald-bot', () => ({
  ArchibaldBot: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    createOrder: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    deleteOrderFromArchibald: vi.fn(),
    editOrderInArchibald: vi.fn(),
    sendOrderToVerona: vi.fn(),
    downloadSingleDDTPDF: vi.fn(),
    downloadSingleInvoicePDF: vi.fn(),
    downloadOrderArticlesPDF: vi.fn(),
    downloadPricesPDF: vi.fn(),
    downloadCustomersPDF: vi.fn(),
    downloadOrdersPDF: vi.fn(),
    downloadDDTPDF: vi.fn(),
    downloadInvoicesPDF: vi.fn(),
    downloadProductsPDF: vi.fn(),
    setProgressCallback: vi.fn(),
  })),
}));

vi.mock('./sync/sync-scheduler', () => ({
  createSyncScheduler: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn(() => false),
    getIntervals: vi.fn(() => ({ agentSyncMs: 0, sharedSyncMs: 0 })),
    smartCustomerSync: vi.fn(),
    resumeOtherSyncs: vi.fn(),
    getSessionCount: vi.fn(() => 0),
  })),
}));

vi.mock('./sync/circuit-breaker', () => ({
  createCircuitBreaker: vi.fn(() => ({
    isPaused: vi.fn().mockResolvedValue(false),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    resetForUser: vi.fn().mockResolvedValue(undefined),
    resetDailyCounts: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock('./realtime/websocket-server', () => ({
  createWebSocketServer: vi.fn(() => ({
    initialize: vi.fn(),
    broadcast: vi.fn(),
    broadcastToAll: vi.fn(),
    replayEvents: vi.fn(),
    registerConnection: vi.fn(),
    unregisterConnection: vi.fn(),
    getStats: vi.fn(() => ({
      totalConnections: 0, activeUsers: 0, uptime: 0, reconnectionCount: 0,
      messagesSent: 0, messagesReceived: 0, averageLatency: 0, connectionsPerUser: {},
    })),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('./auth-utils', () => ({
  generateJWT: vi.fn().mockResolvedValue('mock-token'),
  verifyJWT: vi.fn().mockResolvedValue({ userId: 'test-user' }),
}));

vi.mock('./password-cache', () => ({
  PasswordCache: {
    getInstance: vi.fn(() => ({
      get: vi.fn(() => null),
      set: vi.fn(),
      clear: vi.fn(),
    })),
  },
}));

vi.mock('./pdf-parser-service', () => ({
  pdfParserService: { parsePDF: vi.fn() },
}));

vi.mock('./pdf-parser-prices-service', () => ({
  PDFParserPricesService: { getInstance: vi.fn(() => ({ parsePDF: vi.fn() })) },
}));

vi.mock('./pdf-parser-products-service', () => ({
  PDFParserProductsService: { getInstance: vi.fn(() => ({ parsePDF: vi.fn() })) },
}));

vi.mock('./pdf-parser-orders-service', () => ({
  PDFParserOrdersService: { getInstance: vi.fn(() => ({ parseOrdersPDF: vi.fn() })) },
}));

vi.mock('./pdf-parser-ddt-service', () => ({
  PDFParserDDTService: { getInstance: vi.fn(() => ({ parseDDTPDF: vi.fn() })) },
}));

vi.mock('./pdf-parser-invoices-service', () => ({
  PDFParserInvoicesService: { getInstance: vi.fn(() => ({ parseInvoicesPDF: vi.fn() })) },
}));

vi.mock('./pdf-parser-saleslines-service', () => ({
  PDFParserSaleslinesService: { getInstance: vi.fn(() => ({ parseSaleslinesPDF: vi.fn() })) },
}));

vi.mock('./parser-adapters', () => ({
  adaptCustomer: vi.fn((x: unknown) => x),
  adaptOrder: vi.fn((x: unknown) => x),
  adaptDdt: vi.fn((x: unknown) => x),
  adaptInvoice: vi.fn((x: unknown) => x),
  adaptProduct: vi.fn((x: unknown) => x),
  adaptPrice: vi.fn((x: unknown) => x),
}));

vi.mock('./server', () => ({
  createApp: vi.fn((_deps: unknown) => ((_req: unknown, _res: unknown) => {})),
}));

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./operations/operation-processor', () => ({
  createOperationProcessor: vi.fn(() => ({
    processJob: vi.fn().mockResolvedValue({ success: true, data: {}, duration: 0 }),
  })),
}));

vi.mock('./operations/handlers', () => ({
  createSubmitOrderHandler: vi.fn(() => vi.fn()),
  createCreateCustomerHandler: vi.fn(() => vi.fn()),
  createUpdateCustomerHandler: vi.fn(() => vi.fn()),
  createReadVatStatusHandler: vi.fn(() => vi.fn()),
  createDeleteOrderHandler: vi.fn(() => vi.fn()),
  createBatchDeleteOrdersHandler: vi.fn(() => vi.fn()),
  createEditOrderHandler: vi.fn(() => vi.fn()),
  createSendToVeronaHandler: vi.fn(() => vi.fn()),
  createBatchSendToVeronaHandler: vi.fn(() => vi.fn()),
  createDownloadDdtPdfHandler: vi.fn(() => vi.fn()),
  createDownloadInvoicePdfHandler: vi.fn(() => vi.fn()),
  createSyncOrderArticlesHandler: vi.fn(() => vi.fn()),
  createSyncPricesHandler: vi.fn(() => vi.fn()),
  createSyncCustomersHandler: vi.fn(() => vi.fn()),
  createSyncOrdersHandler: vi.fn(() => vi.fn()),
  createSyncDdtHandler: vi.fn(() => vi.fn()),
  createSyncInvoicesHandler: vi.fn(() => vi.fn()),
  createSyncProductsHandler: vi.fn(() => vi.fn()),
  createSyncOrderStatesHandler: vi.fn(() => vi.fn()),
  createSyncTrackingHandler: vi.fn(() => vi.fn()),
  createSyncCustomerAddressesHandler: vi.fn(() => vi.fn()),
  createRecognitionFeedbackHandler: vi.fn(() => vi.fn()),
}));

vi.mock('./services/anthropic-vision-service', () => ({
  createCatalogVisionService: vi.fn(() => ({ identifyFromImage: vi.fn() })),
}));

vi.mock('bullmq', () => {
  const WorkerMock = vi.fn(function (this: Record<string, unknown>) {
    this.close = vi.fn().mockResolvedValue(undefined);
    this.on = vi.fn();
  });
  const QueueMock = vi.fn(function (this: Record<string, unknown>) {
    this.add = vi.fn().mockResolvedValue({ id: 'job-1' });
    this.getJob = vi.fn();
    this.getJobs = vi.fn().mockResolvedValue([]);
    this.getJobCounts = vi.fn().mockResolvedValue({});
    this.close = vi.fn().mockResolvedValue(undefined);
    this.clean = vi.fn().mockResolvedValue([]);
  });
  return { Worker: WorkerMock, Queue: QueueMock };
});

vi.mock('ioredis', () => {
  const RedisMock = vi.fn(function (this: Record<string, unknown>) {
    this.disconnect = vi.fn();
    this.on = vi.fn();
  });
  return { Redis: RedisMock };
});

vi.mock('puppeteer', () => ({
  default: { launch: vi.fn() },
}));

vi.mock('ws', () => ({
  WebSocketServer: vi.fn(),
}));

describe('bootstrap', () => {
  let processOnSpy: ReturnType<typeof vi.spyOn>;
  let httpCreateServerSpy: ReturnType<typeof vi.spyOn>;
  const mockServer = {
    listen: vi.fn((_port: number, cb?: () => void) => { if (cb) cb(); return mockServer; }),
    on: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    httpCreateServerSpy = vi.spyOn(http, 'createServer').mockReturnValue(mockServer as unknown as http.Server);
  });

  afterEach(() => {
    processOnSpy.mockRestore();
    httpCreateServerSpy.mockRestore();
  });

  test('is exported as a function', async () => {
    const { bootstrap } = await import('./main');
    expect(typeof bootstrap).toBe('function');
  });

  test('initializes all dependencies and starts server', async () => {
    const { bootstrap } = await import('./main');
    const { createPool } = await import('./db/pool');
    const { runMigrations } = await import('./db/migrate');
    const { createOperationQueue } = await import('./operations/operation-queue');
    const { createAgentLock } = await import('./operations/agent-lock');
    const { createBrowserPool } = await import('./bot/browser-pool');
    const { createSyncScheduler } = await import('./sync/sync-scheduler');
    const { createWebSocketServer } = await import('./realtime/websocket-server');
    const { createApp } = await import('./server');

    await bootstrap();

    expect(createPool).toHaveBeenCalledTimes(1);
    expect(runMigrations).toHaveBeenCalledTimes(1);
    expect(createOperationQueue).toHaveBeenCalledTimes(5);
    expect(createAgentLock).toHaveBeenCalledTimes(1);
    expect(createBrowserPool).toHaveBeenCalledTimes(1);
    expect(createSyncScheduler).toHaveBeenCalledTimes(1);
    expect(createWebSocketServer).toHaveBeenCalledTimes(1);
    expect(createApp).toHaveBeenCalledTimes(1);
    expect(mockServer.listen).toHaveBeenCalledWith(3000, expect.any(Function));
  });

  test('registers graceful shutdown handlers for SIGTERM and SIGINT', async () => {
    const { bootstrap } = await import('./main');
    await bootstrap();

    const signalCalls = processOnSpy.mock.calls
      .filter(([event]) => event === 'SIGTERM' || event === 'SIGINT')
      .map(([event]) => event);

    expect(signalCalls).toContain('SIGTERM');
    expect(signalCalls).toContain('SIGINT');
  });

  test('starts sync scheduler with production intervals', async () => {
    const { bootstrap } = await import('./main');
    const { createSyncScheduler } = await import('./sync/sync-scheduler');

    await bootstrap();

    const scheduler = (createSyncScheduler as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(scheduler.start).toHaveBeenCalledWith({
      agentSyncMs: 10 * 60 * 1000,
      sharedSyncMs: 30 * 60 * 1000,
    });
  });

  test('registers all 22 operation handlers', async () => {
    const { bootstrap } = await import('./main');
    const { createOperationProcessor } = await import('./operations/operation-processor');

    await bootstrap();

    const deps = (createOperationProcessor as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const handlerKeys = Object.keys(deps.handlers);

    expect(handlerKeys).toEqual(expect.arrayContaining([
      'submit-order',
      'create-customer',
      'update-customer',
      'read-vat-status',
      'delete-order',
      'batch-delete-orders',
      'edit-order',
      'send-to-verona',
      'batch-send-to-verona',
      'download-ddt-pdf',
      'download-invoice-pdf',
      'sync-order-articles',
      'sync-prices',
      'sync-customers',
      'sync-orders',
      'sync-ddt',
      'sync-invoices',
      'sync-products',
      'sync-order-states',
      'sync-tracking',
      'sync-customer-addresses',
      'recognition-feedback',
    ]));
    expect(handlerKeys).toHaveLength(22);
  });

  test('getAgentsByActivity returns active and idle agent IDs from activity cache', async () => {
    const { bootstrap } = await import('./main');
    const { createSyncScheduler } = await import('./sync/sync-scheduler');

    await bootstrap();

    const getAgentsByActivity = (createSyncScheduler as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(getAgentsByActivity()).toEqual({ active: ['agent-1', 'agent-2'], idle: ['agent-3'] });
  });

  test('creates 5 BullMQ workers — one per queue tier', async () => {
    const { bootstrap } = await import('./main');
    const { Worker } = await import('bullmq');

    await bootstrap();

    expect(Worker).toHaveBeenCalledTimes(5);
    const workerNames = (Worker as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(workerNames).toEqual(
      expect.arrayContaining(['writes', 'agent-sync', 'enrichment', 'shared-sync', 'bot-queue']),
    );
  });

  test('logs startup complete with enabled services', async () => {
    const { bootstrap } = await import('./main');
    const { logger } = await import('./logger');

    await bootstrap();

    expect(logger.info).toHaveBeenCalledWith('Startup complete', {
      port: 3000,
      services: {
        syncScheduler: true,
        operationProcessor: true,
        webSocket: true,
        sessionCleanup: true,
      },
    });
  });
});
