import { describe, expect, test, vi, beforeEach } from 'vitest';
import { enqueueOperation, getJobStatus, getOperationsDashboard } from './operations';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue('test-jwt-token'),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
});

describe('enqueueOperation', () => {
  test('sends POST to /api/operations/enqueue with type and data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, jobId: 'job-123' }),
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const result = await enqueueOperation('submit-order', {
      pendingOrderId: 'po-1',
      customerId: 'c-1',
    });

    expect(result).toEqual({ success: true, jobId: 'job-123' });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/operations/enqueue',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          type: 'submit-order',
          data: { pendingOrderId: 'po-1', customerId: 'c-1' },
        }),
      }),
    );
  });

  test('includes Authorization header with JWT', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, jobId: 'job-1' }),
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    await enqueueOperation('sync-customers', {});

    const call = mockFetch.mock.calls[0];
    const headers = call[1].headers;
    expect(headers.get('Authorization')).toBe('Bearer test-jwt-token');
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ success: false, error: 'Invalid type' }),
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    await expect(enqueueOperation('submit-order', {})).rejects.toThrow('HTTP 400');
  });
});

describe('getJobStatus', () => {
  test('sends GET to /api/operations/:jobId/status', async () => {
    const jobData = { success: true, job: { jobId: 'j-1', type: 'submit-order', state: 'completed', progress: 100 } };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(jobData),
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const result = await getJobStatus('j-1');
    expect(result).toEqual(jobData);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/operations/j-1/status',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('getOperationsDashboard', () => {
  test('sends GET to /api/operations/dashboard', async () => {
    const dashboard = {
      success: true,
      queue: { waiting: 0, active: 1 },
      activeJobs: [],
      browserPool: { browsers: 3 },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dashboard),
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const result = await getOperationsDashboard();
    expect(result).toEqual(dashboard);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/operations/dashboard',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
