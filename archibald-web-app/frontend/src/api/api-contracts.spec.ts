import { describe, expect, test, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const STORED_JWT = 'test-jwt-token';

function mockOkJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    clone: () => ({ json: () => Promise.resolve(body) }),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

function mockErrorJson(status: number, body: unknown) {
  return {
    ok: false,
    status,
    statusText: `Error ${status}`,
    json: () => Promise.resolve(body),
    clone: () => ({ json: () => Promise.resolve(body) }),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(STORED_JWT),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
});

describe('auth API contracts', () => {
  test('login calls POST /api/auth/login with credentials', async () => {
    const loginResponse = {
      success: true,
      token: 'jwt-token-123',
      user: { id: 'u-1', username: 'agent1', fullName: 'Agent One', role: 'agent' },
    };
    mockFetch.mockResolvedValue(mockOkJson(loginResponse));

    const { login } = await import('./auth');
    const result = await login({ username: 'agent1', password: 'secret' });

    expect(result).toEqual(loginResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body).toEqual(expect.objectContaining({
      username: 'agent1',
      password: 'secret',
    }));
  });

  test('login includes device metadata in request body', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true, token: 'tok' }));

    const { login } = await import('./auth');
    await login({ username: 'agent1', password: 'secret' });

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body).toHaveProperty('deviceId');
    expect(body).toHaveProperty('platform');
    expect(body).toHaveProperty('deviceName');
  });

  test('getMe calls GET /api/auth/me with Authorization header', async () => {
    const meResponse = {
      success: true,
      data: {
        user: { id: 'u-1', username: 'agent1', fullName: 'Agent One', role: 'agent', whitelisted: true, lastLoginAt: null },
      },
    };
    mockFetch.mockResolvedValue(mockOkJson(meResponse));

    const { getMe } = await import('./auth');
    const result = await getMe('my-token');

    expect(result.success).toBe(true);
    expect(result.data?.user).toEqual(expect.objectContaining({
      id: expect.any(String),
      username: expect.any(String),
    }));

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('/api/auth/me');
    const headers = call[1].headers;
    // fetchWithRetry auto-injects JWT from localStorage
    expect(headers.get('Authorization')).toBe(`Bearer ${STORED_JWT}`);
  });

  test('logout calls POST /api/auth/logout with Authorization header', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true }));

    const { logout } = await import('./auth');
    await logout('my-token');

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('/api/auth/logout');
    expect(call[1].method).toBe('POST');
    const headers = call[1].headers;
    // fetchWithRetry auto-injects JWT from localStorage
    expect(headers.get('Authorization')).toBe(`Bearer ${STORED_JWT}`);
  });
});

describe('operations API contracts', () => {
  test('enqueueOperation calls POST /api/operations/enqueue', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true, jobId: 'job-1' }));

    const { enqueueOperation } = await import('./operations');
    const result = await enqueueOperation('sync-customers', { key: 'val' });

    expect(result).toEqual({ success: true, jobId: 'job-1' });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/operations/enqueue',
      expect.objectContaining({ method: 'POST' }),
    );

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({ type: 'sync-customers', data: { key: 'val' } });
  });

  test('enqueueOperation includes idempotencyKey when provided', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true, jobId: 'job-2' }));

    const { enqueueOperation } = await import('./operations');
    await enqueueOperation('submit-order', { orderId: 'o-1' }, 'idem-key');

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({ type: 'submit-order', data: { orderId: 'o-1' }, idempotencyKey: 'idem-key' });
  });

  test('enqueueOperation sends Authorization header from localStorage', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true, jobId: 'job-1' }));

    const { enqueueOperation } = await import('./operations');
    await enqueueOperation('sync-customers', {});

    const call = mockFetch.mock.calls[0];
    const headers = call[1].headers;
    expect(headers.get('Authorization')).toBe(`Bearer ${STORED_JWT}`);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  test('enqueueOperation throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(mockErrorJson(400, { success: false, error: 'Bad request' }));

    const { enqueueOperation } = await import('./operations');
    await expect(enqueueOperation('sync-customers', {})).rejects.toThrow('HTTP 400');
  });

  test('getJobStatus calls GET /api/operations/:jobId/status', async () => {
    const jobData = {
      success: true,
      // Phase 06-01: response shape uses job (not data)
      job: { jobId: 'j-1', type: 'submit-order', userId: 'u-1', state: 'completed', progress: 100, result: null, failedReason: undefined },
    };
    mockFetch.mockResolvedValue(mockOkJson(jobData));

    const { getJobStatus } = await import('./operations');
    const result = await getJobStatus('j-1');

    expect(result).toEqual(jobData);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/operations/j-1/status',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('getOperationsDashboard calls GET /api/operations/dashboard', async () => {
    const dashboardData = {
      success: true,
      queue: { waiting: 0, active: 1, completed: 5, failed: 0, delayed: 0, prioritized: 0 },
      activeJobs: [{ userId: 'u-1', jobId: 'j-1', type: 'sync-customers' }],
      browserPool: { browsers: 2, activeContexts: 1, maxContexts: 5 },
    };
    mockFetch.mockResolvedValue(mockOkJson(dashboardData));

    const { getOperationsDashboard } = await import('./operations');
    const result = await getOperationsDashboard();

    expect(result).toEqual(dashboardData);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/operations/dashboard',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('getQueueStats calls GET /api/operations/stats', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true, stats: {} }));

    const { getQueueStats } = await import('./operations');
    await getQueueStats();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/operations/stats',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('customers API contracts', () => {
  test('getCustomers calls GET /api/customers with Authorization', async () => {
    const customersData = { success: true, data: { customers: [], total: 0 } };
    mockFetch.mockResolvedValue(mockOkJson(customersData));

    const { getCustomers } = await import('./customers');
    const result = await getCustomers('my-token');

    expect(result).toEqual(customersData);
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('/api/customers');
    const headers = call[1].headers;
    // fetchWithRetry auto-injects JWT from localStorage
    expect(headers.get('Authorization')).toBe(`Bearer ${STORED_JWT}`);
  });

  test('syncCustomers calls POST /api/customers/sync', async () => {
    const syncResponse = { success: true, jobId: 'job-sync-1' };
    mockFetch.mockResolvedValue(mockOkJson(syncResponse));

    const { syncCustomers } = await import('./customers');
    const result = await syncCustomers('my-token');

    expect(result).toEqual(syncResponse);
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('/api/customers/sync');
    expect(call[1].method).toBe('POST');
    const headers = call[1].headers;
    // fetchWithRetry auto-injects JWT from localStorage
    expect(headers.get('Authorization')).toBe(`Bearer ${STORED_JWT}`);
  });

  test('getSyncStatus calls GET /api/customers/sync-status', async () => {
    const statusData = { success: true, count: 42, lastSync: Date.now() };
    mockFetch.mockResolvedValue(mockOkJson(statusData));

    const { getSyncStatus } = await import('./customers');
    const result = await getSyncStatus('my-token');

    expect(result).toEqual(statusData);
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('/api/customers/sync-status');
    const headers = call[1].headers;
    // fetchWithRetry auto-injects JWT from localStorage
    expect(headers.get('Authorization')).toBe(`Bearer ${STORED_JWT}`);
  });
});

describe('products API contracts', () => {
  test('getProducts calls GET /api/products with search query params', async () => {
    const productsData = { success: true, data: [] };
    mockFetch.mockResolvedValue(mockOkJson(productsData));

    const { getProducts } = await import('./products');
    await getProducts('my-token', 'searchterm', 50);

    const call = mockFetch.mock.calls[0];
    const url = call[0] as string;
    expect(url).toContain('/api/products');
    expect(url).toContain('search=searchterm');
    expect(url).toContain('limit=50');
    const headers = call[1].headers;
    // fetchWithRetry auto-injects JWT from localStorage
    expect(headers.get('Authorization')).toBe(`Bearer ${STORED_JWT}`);
  });

  test('getProducts sends GET method (no explicit method set defaults to GET)', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true, data: [] }));

    const { getProducts } = await import('./products');
    await getProducts('my-token');

    const call = mockFetch.mock.calls[0];
    expect(call[1].method).toBeUndefined();
  });

  test('getProductVariants calls GET /api/products/:name/variants', async () => {
    const variantsData = { success: true, data: [] };
    mockFetch.mockResolvedValue(mockOkJson(variantsData));

    const { getProductVariants } = await import('./products');
    await getProductVariants('my-token', 'ARTICLE-123');

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('/api/products/ARTICLE-123/variants');
    expect(call[1].method).toBe('GET');
    const headers = call[1].headers;
    // fetchWithRetry auto-injects JWT from localStorage
    expect(headers.get('Authorization')).toBe(`Bearer ${STORED_JWT}`);
  });

  test('updateProductPrice calls PATCH /api/products/:id/price', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true }));

    const { updateProductPrice } = await import('./products');
    await updateProductPrice('my-token', 'prod-1', 9.99);

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('/api/products/prod-1/price');
    expect(call[1].method).toBe('PATCH');
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({ price: 9.99 });
  });

  test('updateProductVat calls PATCH /api/products/:id/vat', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true }));

    const { updateProductVat } = await import('./products');
    await updateProductVat('my-token', 'prod-1', 22);

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('/api/products/prod-1/vat');
    expect(call[1].method).toBe('PATCH');
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({ vat: 22 });
  });
});

describe('no legacy path references', () => {
  test('operations API uses /api/operations/* paths (not /api/queue/*)', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true, jobId: 'j-1' }));

    const { enqueueOperation } = await import('./operations');
    await enqueueOperation('sync-customers', {});

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/api\/operations\//);
    expect(url).not.toContain('/api/queue/');
  });

  test('job status uses /api/operations/:id/status (not /api/orders/status)', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true, job: {} }));

    const { getJobStatus } = await import('./operations');
    await getJobStatus('test-job');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/operations/test-job/status');
    expect(url).not.toContain('/api/orders/status');
  });

  test('queue stats uses /api/operations/stats (not /api/queue/stats)', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true, stats: {} }));

    const { getQueueStats } = await import('./operations');
    await getQueueStats();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/operations/stats');
    expect(url).not.toContain('/api/queue/stats');
  });

  test('customer sync uses /api/customers/sync (not /api/sync/customers)', async () => {
    mockFetch.mockResolvedValue(mockOkJson({ success: true, jobId: 'j-1' }));

    const { syncCustomers } = await import('./customers');
    await syncCustomers('tok');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/customers/sync');
  });
});
