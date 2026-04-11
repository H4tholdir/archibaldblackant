import { describe, expect, test, vi, beforeEach } from 'vitest';
import { enqueueOperation, getJobStatus, getOperationsDashboard, pollJobUntilDone, waitForJobViaWebSocket } from './operations';

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

describe('pollJobUntilDone', () => {
  const jobId = 'poll-test-job';

  function mockJobStatusResponse(state: string, progress: number, result: Record<string, unknown> | null = null, failedReason?: string) {
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        job: { jobId, type: 'submit-order', userId: 'u1', state, progress, result, failedReason },
      }),
      headers: new Headers({ 'content-type': 'application/json' }),
    };
  }

  test('resolves with result when job completes after polling', async () => {
    const expectedResult = { pdf: 'base64data', pages: 3 };
    mockFetch
      .mockResolvedValueOnce(mockJobStatusResponse('active', 50))
      .mockResolvedValueOnce(mockJobStatusResponse('completed', 100, expectedResult));

    const result = await pollJobUntilDone(jobId, { intervalMs: 10 });

    expect(result).toEqual(expectedResult);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test('resolves immediately when job is already completed', async () => {
    const expectedResult = { count: 5 };
    mockFetch.mockResolvedValueOnce(mockJobStatusResponse('completed', 100, expectedResult));

    const result = await pollJobUntilDone(jobId, { intervalMs: 10 });

    expect(result).toEqual(expectedResult);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('returns empty object when completed job has null result', async () => {
    mockFetch.mockResolvedValueOnce(mockJobStatusResponse('completed', 100, null));

    const result = await pollJobUntilDone(jobId, { intervalMs: 10 });

    expect(result).toEqual({});
  });

  test('rejects with failedReason when job fails', async () => {
    mockFetch.mockResolvedValueOnce(mockJobStatusResponse('failed', 0, null, 'Bot login failed'));

    await expect(pollJobUntilDone(jobId, { intervalMs: 10 })).rejects.toThrow('Bot login failed');
  });

  test('rejects with default message when job fails without reason', async () => {
    mockFetch.mockResolvedValueOnce(mockJobStatusResponse('failed', 0, null, undefined));

    await expect(pollJobUntilDone(jobId, { intervalMs: 10 })).rejects.toThrow('Operazione fallita');
  });

  test('calls onProgress with progress updates', async () => {
    const onProgress = vi.fn();
    mockFetch
      .mockResolvedValueOnce(mockJobStatusResponse('active', 25))
      .mockResolvedValueOnce(mockJobStatusResponse('active', 75))
      .mockResolvedValueOnce(mockJobStatusResponse('completed', 100, { done: true }));

    await pollJobUntilDone(jobId, { intervalMs: 10, onProgress });

    expect(onProgress).toHaveBeenCalledWith(25, undefined);
    expect(onProgress).toHaveBeenCalledWith(75, undefined);
    expect(onProgress).toHaveBeenCalledWith(100, 'Completato');
  });

  test('times out after maxWaitMs and rejects', async () => {
    mockFetch.mockResolvedValue(mockJobStatusResponse('active', 10));

    await expect(
      pollJobUntilDone(jobId, { intervalMs: 10, maxWaitMs: 50 }),
    ).rejects.toThrow('Timeout: operazione non completata entro il tempo massimo');
  });
});

describe('waitForJobViaWebSocket', () => {
  test('segue il nuovo jobId quando JOB_REQUEUED arriva per il jobId originale', async () => {
    const originalJobId = 'job-original';
    const newJobId = 'job-new';
    const downloadKey = 'abc-key';

    const callbacks: Record<string, Array<(payload: unknown) => void>> = {};

    const subscribe = vi.fn((eventType: string, cb: (payload: unknown) => void) => {
      callbacks[eventType] = callbacks[eventType] ?? [];
      callbacks[eventType].push(cb);
      return () => {};
    });

    const fire = (eventType: string, payload: unknown) => {
      for (const cb of callbacks[eventType] ?? []) cb(payload);
    };

    setTimeout(() => {
      fire('JOB_REQUEUED', { originalJobId, newJobId, type: 'download-ddt-pdf' });
      setTimeout(() => {
        fire('JOB_COMPLETED', { jobId: newJobId, result: { downloadKey } });
      }, 10);
    }, 10);

    const result = await waitForJobViaWebSocket(originalJobId, {
      subscribe,
      wsFallbackMs: 5000,
      maxWaitMs: 5000,
      skipSafetyPoll: true,
    });

    expect(result).toEqual({ downloadKey });
  });

  test('does not call getJobStatus when skipSafetyPoll is true', async () => {
    vi.useFakeTimers();

    const jobId = 'fake-uuid';
    const callbacks: Record<string, (payload: unknown) => void> = {};
    const subscribe = vi.fn().mockImplementation((eventType: string, cb: (payload: unknown) => void) => {
      callbacks[eventType] = cb;
      return () => {};
    });

    const promise = waitForJobViaWebSocket(jobId, {
      subscribe,
      skipSafetyPoll: true,
      maxWaitMs: 60_000,
    });

    // Fire JOB_STARTED to mark WebSocket active and cancel the 5s fallback timer
    callbacks['JOB_STARTED']?.({ jobId });

    // Advance past where safety poll would fire (15s interval)
    await vi.advanceTimersByTimeAsync(20_000);

    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/status'),
      expect.anything(),
    );

    // Resolve the promise to clean up
    callbacks['JOB_COMPLETED']?.({ jobId, result: {} });
    await promise;

    vi.useRealTimers();
  });
});
