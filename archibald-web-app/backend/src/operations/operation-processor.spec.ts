import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createOperationProcessor } from './operation-processor';
import { createAgentLock } from './agent-lock';
import type { OperationJobData, OperationJobResult } from './operation-types';

function createMockAgentLock(acquireResult = { acquired: true } as any) {
  return {
    acquire: vi.fn().mockReturnValue(acquireResult),
    release: vi.fn(),
    setStopCallback: vi.fn(),
    getActive: vi.fn(),
    getAllActive: vi.fn().mockReturnValue(new Map()),
  };
}

function createMockBrowserPool() {
  return {
    acquireContext: vi.fn().mockResolvedValue({ id: 'ctx-1' }),
    releaseContext: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockBroadcast() {
  return vi.fn();
}

function createMockEnqueue() {
  return vi.fn().mockResolvedValue('re-enqueued-id');
}

function createMockJob(overrides: Partial<OperationJobData> = {}) {
  return {
    id: 'job-123',
    data: {
      type: 'submit-order' as const,
      userId: 'user-a',
      data: { orderId: '1' },
      idempotencyKey: 'key-1',
      timestamp: Date.now(),
      ...overrides,
    },
    updateProgress: vi.fn(),
  };
}

describe('createOperationProcessor', () => {
  const dummyHandler = vi.fn().mockResolvedValue({ orderId: 'ORD-1' });

  function createProcessor(opts: {
    agentLock?: ReturnType<typeof createMockAgentLock>;
    browserPool?: ReturnType<typeof createMockBrowserPool>;
    broadcast?: ReturnType<typeof createMockBroadcast>;
    enqueue?: ReturnType<typeof createMockEnqueue>;
    handlers?: Record<string, any>;
    cancelJob?: ReturnType<typeof vi.fn>;
    preemptionConfig?: { timeoutMs: number; pollIntervalMs: number };
    getTimeout?: (type: string) => number;
  } = {}) {
    const agentLock = opts.agentLock ?? createMockAgentLock();
    const browserPool = opts.browserPool ?? createMockBrowserPool();
    const broadcast = opts.broadcast ?? createMockBroadcast();
    const enqueue = opts.enqueue ?? createMockEnqueue();
    const handlers = opts.handlers ?? { 'submit-order': dummyHandler };
    const cancelJob = opts.cancelJob ?? vi.fn().mockReturnValue(true);

    return {
      processor: createOperationProcessor({
        agentLock,
        browserPool,
        broadcast,
        enqueue,
        handlers,
        cancelJob,
        preemptionConfig: opts.preemptionConfig,
        getTimeout: opts.getTimeout as any,
      }),
      agentLock,
      browserPool,
      broadcast,
      enqueue,
      cancelJob,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('acquires agent lock before executing handler', async () => {
    const { processor, agentLock } = createProcessor();
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(agentLock.acquire).toHaveBeenCalledWith('user-a', 'job-123', 'submit-order');
  });

  test('releases agent lock in finally even on handler error', async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error('handler failed'));
    const { processor, agentLock } = createProcessor({
      handlers: { 'submit-order': failingHandler },
    });
    const job = createMockJob();

    await expect(processor.processJob(job as any)).rejects.toThrow('handler failed');
    expect(agentLock.release).toHaveBeenCalledWith('user-a', 'job-123');
  });

  test('acquires browser context and releases on success', async () => {
    const { processor, browserPool } = createProcessor();
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(browserPool.acquireContext).toHaveBeenCalledWith('user-a', { fromQueue: true });
    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-a', { id: 'ctx-1' }, true);
  });

  test('releases browser context with false on handler error', async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error('oops'));
    const { processor, browserPool } = createProcessor({
      handlers: { 'submit-order': failingHandler },
    });
    const job = createMockJob();

    await expect(processor.processJob(job as any)).rejects.toThrow('oops');
    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-a', { id: 'ctx-1' }, false);
  });

  test('re-enqueues job with delay and _requeueCount when agent is busy and not preemptable', async () => {
    const busyLock = createMockAgentLock({
      acquired: false,
      activeJob: { jobId: 'existing-job', type: 'edit-order' },
      preemptable: false,
    });
    const syncHandler = vi.fn().mockResolvedValue({});
    const { processor, enqueue } = createProcessor({
      agentLock: busyLock,
      handlers: { 'sync-customers': syncHandler } as any,
    });
    const job = createMockJob({ type: 'sync-customers' });

    const result = await processor.processJob(job as any);

    expect(result).toEqual({ success: false, requeued: true, duration: expect.any(Number) });
    expect(enqueue).toHaveBeenCalledWith(
      'sync-customers',
      'user-a',
      { orderId: '1', _requeueCount: 1 },
      'key-1',
      { delay: 2000 },
    );
  });

  test('calls cancelJob and requestStop on active sync when write job arrives (preemption)', async () => {
    const stopFn = vi.fn();
    const preemptableLock = createMockAgentLock({
      acquired: false,
      activeJob: { jobId: 'sync-job', type: 'sync-customers', requestStop: stopFn },
      preemptable: true,
    });
    preemptableLock.acquire
      .mockReturnValueOnce({
        acquired: false,
        activeJob: { jobId: 'sync-job', type: 'sync-customers', requestStop: stopFn },
        preemptable: true,
      })
      .mockReturnValue({ acquired: true });

    const { processor, cancelJob } = createProcessor({
      agentLock: preemptableLock,
      preemptionConfig: { timeoutMs: 200, pollIntervalMs: 10 },
    });
    const job = createMockJob({ type: 'submit-order' });

    await processor.processJob(job as any);

    expect(cancelJob).toHaveBeenCalledWith('sync-job');
    expect(stopFn).toHaveBeenCalled();
    expect(preemptableLock.acquire).toHaveBeenCalledTimes(2);
  });

  test('times out preemption after max wait and requeues', async () => {
    const preemptableLock = createMockAgentLock({
      acquired: false,
      activeJob: { jobId: 'sync-job', type: 'sync-customers', requestStop: vi.fn() },
      preemptable: true,
    });
    preemptableLock.acquire.mockReturnValue({
      acquired: false,
      activeJob: { jobId: 'sync-job', type: 'sync-customers', requestStop: vi.fn() },
      preemptable: true,
    });

    const { processor, enqueue, cancelJob } = createProcessor({
      agentLock: preemptableLock,
      preemptionConfig: { timeoutMs: 50, pollIntervalMs: 10 },
    });
    const job = createMockJob({ type: 'submit-order' });

    const result = await processor.processJob(job as any);

    expect(cancelJob).toHaveBeenCalledWith('sync-job');
    expect(result).toEqual({ success: false, requeued: true, duration: expect.any(Number) });
    expect(enqueue).toHaveBeenCalledWith('submit-order', 'user-a', { orderId: '1', _requeueCount: 1 }, 'key-1', { delay: 2000 });
  });

  test('acquires lock during polling after cancel', async () => {
    const preemptableLock = createMockAgentLock({
      acquired: false,
      activeJob: { jobId: 'sync-job', type: 'sync-customers', requestStop: vi.fn() },
      preemptable: true,
    });
    let callCount = 0;
    preemptableLock.acquire.mockImplementation(() => {
      callCount++;
      if (callCount <= 4) {
        return {
          acquired: false,
          activeJob: { jobId: 'sync-job', type: 'sync-customers', requestStop: vi.fn() },
          preemptable: true,
        };
      }
      return { acquired: true };
    });

    const { processor } = createProcessor({
      agentLock: preemptableLock,
      preemptionConfig: { timeoutMs: 500, pollIntervalMs: 10 },
    });
    const job = createMockJob({ type: 'submit-order' });

    const result = await processor.processJob(job as any);

    expect(result.success).toBe(true);
    expect(preemptableLock.acquire.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  test('broadcasts JOB_COMPLETED via WebSocket on success', async () => {
    dummyHandler.mockResolvedValue({ orderId: 'ORD-1' });
    const { processor, broadcast } = createProcessor();
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(broadcast).toHaveBeenCalledWith('user-a', {
      type: 'JOB_COMPLETED',
      payload: { jobId: 'job-123', operationType: 'submit-order', result: { orderId: 'ORD-1' } },
      timestamp: expect.any(String),
    });
  });

  test('throws and broadcasts JOB_FAILED when handler returns {success: false}', async () => {
    const failHandler = vi.fn().mockResolvedValue({ success: false, error: 'PDF download failed' });
    const { processor, broadcast, browserPool } = createProcessor({
      handlers: { 'sync-orders': failHandler } as any,
    });
    const job = createMockJob({ type: 'sync-orders' as any });

    await expect(processor.processJob(job as any)).rejects.toThrow('PDF download failed');

    expect(broadcast).toHaveBeenCalledWith('user-a', {
      type: 'JOB_FAILED',
      payload: { jobId: 'job-123', operationType: 'sync-orders', error: 'PDF download failed' },
      timestamp: expect.any(String),
    });
    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-a', { id: 'ctx-1' }, false);
  });

  test('uses default error message when handler returns {success: false} without error', async () => {
    const failHandler = vi.fn().mockResolvedValue({ success: false });
    const { processor } = createProcessor({
      handlers: { 'sync-orders': failHandler } as any,
    });
    const job = createMockJob({ type: 'sync-orders' as any });

    await expect(processor.processJob(job as any)).rejects.toThrow('Sync completed with failure');
  });

  test('calls logSyncEvent on sync handler success', async () => {
    const syncHandler = vi.fn().mockResolvedValue({ synced: 10 });
    const logSyncEvent = vi.fn().mockResolvedValue(undefined);
    const agentLock = createMockAgentLock();
    const browserPool = createMockBrowserPool();
    const broadcast = createMockBroadcast();
    const enqueue = createMockEnqueue();

    const processor = createOperationProcessor({
      agentLock,
      browserPool,
      broadcast,
      enqueue,
      handlers: { 'sync-orders': syncHandler } as any,
      cancelJob: vi.fn().mockReturnValue(true),
      logSyncEvent,
    });
    const job = createMockJob({ type: 'sync-orders' as any });

    await processor.processJob(job as any);

    expect(logSyncEvent).toHaveBeenCalledWith(
      'user-a',
      'sync-orders',
      'sync_completed',
      expect.objectContaining({ duration: expect.any(Number), result: { synced: 10 } }),
    );
  });

  test('calls logSyncEvent on sync handler failure', async () => {
    const failHandler = vi.fn().mockResolvedValue({ success: false, error: 'timeout' });
    const logSyncEvent = vi.fn().mockResolvedValue(undefined);
    const agentLock = createMockAgentLock();
    const browserPool = createMockBrowserPool();
    const broadcast = createMockBroadcast();
    const enqueue = createMockEnqueue();

    const processor = createOperationProcessor({
      agentLock,
      browserPool,
      broadcast,
      enqueue,
      handlers: { 'sync-orders': failHandler } as any,
      cancelJob: vi.fn().mockReturnValue(true),
      logSyncEvent,
    });
    const job = createMockJob({ type: 'sync-orders' as any });

    await expect(processor.processJob(job as any)).rejects.toThrow('timeout');

    expect(logSyncEvent).toHaveBeenCalledWith(
      'user-a',
      'sync-orders',
      'sync_error',
      expect.objectContaining({ error: 'timeout', duration: expect.any(Number) }),
    );
  });

  test('does not call logSyncEvent for non-sync operations', async () => {
    const handler = vi.fn().mockResolvedValue({ done: true });
    const logSyncEvent = vi.fn().mockResolvedValue(undefined);
    const agentLock = createMockAgentLock();
    const browserPool = createMockBrowserPool();
    const broadcast = createMockBroadcast();
    const enqueue = createMockEnqueue();

    const processor = createOperationProcessor({
      agentLock,
      browserPool,
      broadcast,
      enqueue,
      handlers: { 'submit-order': handler },
      cancelJob: vi.fn().mockReturnValue(true),
      logSyncEvent,
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(logSyncEvent).not.toHaveBeenCalled();
  });

  test('broadcasts JOB_FAILED via WebSocket on error', async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error('boom'));
    const { processor, broadcast } = createProcessor({
      handlers: { 'submit-order': failingHandler },
    });
    const job = createMockJob();

    await expect(processor.processJob(job as any)).rejects.toThrow('boom');

    expect(broadcast).toHaveBeenCalledWith('user-a', {
      type: 'JOB_FAILED',
      payload: { jobId: 'job-123', operationType: 'submit-order', error: 'boom' },
      timestamp: expect.any(String),
    });
  });

  test('passes context, job data, updateProgress, and AbortSignal to handler', async () => {
    const handler = vi.fn().mockResolvedValue({ done: true });
    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(handler).toHaveBeenCalledWith(
      { id: 'ctx-1' },
      { orderId: '1' },
      'user-a',
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Function),
    );
  });

  test('handler receives non-aborted signal when no timeout or cancel', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    const signal = handler.mock.calls[0][4] as AbortSignal;
    expect(signal.aborted).toBe(false);
  });

  test('throws for unknown operation type', async () => {
    const { processor } = createProcessor();
    const job = createMockJob({ type: 'sync-customers' as any });

    await expect(processor.processJob(job as any)).rejects.toThrow(
      'No handler registered for operation type: sync-customers',
    );
  });

  test('throws UnrecoverableError when handler exceeds timeout', async () => {
    const hangingHandler = vi.fn().mockImplementation(
      () => new Promise(() => {}),
    );
    const { processor, broadcast } = createProcessor({
      handlers: { 'submit-order': hangingHandler },
      getTimeout: () => 50,
    });
    const job = createMockJob();

    await expect(processor.processJob(job as any)).rejects.toThrow(
      'Handler timeout after 50ms for submit-order',
    );
    expect(broadcast).toHaveBeenCalledWith('user-a', {
      type: 'JOB_FAILED',
      payload: { jobId: 'job-123', operationType: 'submit-order', error: 'Handler timeout after 50ms for submit-order' },
      timestamp: expect.any(String),
    });
  });

  test('clears timeout on successful handler completion', async () => {
    const handler = vi.fn().mockResolvedValue({ done: true });
    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
      getTimeout: () => 5000,
    });
    const job = createMockJob();

    const result = await processor.processJob(job as any);

    expect(result.success).toBe(true);
    const signal = handler.mock.calls[0][4] as AbortSignal;
    expect(signal.aborted).toBe(false);
  });

  test.each([
    { requeueCount: 0, expectedDelay: 2_000, expectedCount: 1 },
    { requeueCount: 2, expectedDelay: 8_000, expectedCount: 3 },
    { requeueCount: 10, expectedDelay: 30_000, expectedCount: 11 },
  ])('re-enqueue uses exponential backoff delay (requeueCount=$requeueCount)', async ({ requeueCount, expectedDelay, expectedCount }) => {
    const busyLock = createMockAgentLock({
      acquired: false,
      activeJob: { jobId: 'existing-job', type: 'edit-order' },
      preemptable: false,
    });
    const syncHandler = vi.fn().mockResolvedValue({});
    const { processor, enqueue } = createProcessor({
      agentLock: busyLock,
      handlers: { 'sync-customers': syncHandler } as any,
    });
    const job = createMockJob({
      type: 'sync-customers',
      data: { orderId: '1', _requeueCount: requeueCount },
    });

    await processor.processJob(job as any);

    expect(enqueue).toHaveBeenCalledWith(
      'sync-customers',
      'user-a',
      { orderId: '1', _requeueCount: expectedCount },
      'key-1',
      { delay: expectedDelay },
    );
  });

  test('_requeueCount is stripped from handler data', async () => {
    const handler = vi.fn().mockResolvedValue({ done: true });
    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
    });
    const job = createMockJob({
      data: { orderId: '1', _requeueCount: 5 },
    });

    await processor.processJob(job as any);

    expect(handler).toHaveBeenCalledWith(
      { id: 'ctx-1' },
      { orderId: '1' },
      'user-a',
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Function),
    );
  });

  test('emits JOB_STARTED before handler execution', async () => {
    const callOrder: string[] = [];
    const trackingHandler = vi.fn().mockImplementation(async () => {
      callOrder.push('handler');
      return { done: true };
    });
    const trackingBroadcast = vi.fn().mockImplementation((_userId: string, event: Record<string, unknown>) => {
      callOrder.push(event.type as string);
    });
    const { processor } = createProcessor({
      handlers: { 'submit-order': trackingHandler },
      broadcast: trackingBroadcast,
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(callOrder.indexOf('JOB_STARTED')).toBeLessThan(callOrder.indexOf('handler'));
  });

  test('emits JOB_PROGRESS when handler calls onProgress', async () => {
    const progressValue = 50;
    const progressLabel = 'Uploading order';
    const progressHandler = vi.fn().mockImplementation(
      async (_ctx: unknown, _data: unknown, _userId: string, onProgress: (p: number, l?: string) => void) => {
        onProgress(progressValue, progressLabel);
        return { done: true };
      },
    );
    const { processor, broadcast } = createProcessor({
      handlers: { 'submit-order': progressHandler },
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(broadcast).toHaveBeenCalledWith('user-a', {
      type: 'JOB_PROGRESS',
      payload: { jobId: 'job-123', operationType: 'submit-order', progress: progressValue, label: progressLabel },
      timestamp: expect.any(String),
    });
  });

  test('JOB_STARTED includes correct operationType', async () => {
    const editHandler = vi.fn().mockResolvedValue({ updated: true });
    const { processor, broadcast } = createProcessor({
      handlers: { 'edit-order': editHandler } as any,
    });
    const operationType = 'edit-order' as const;
    const job = createMockJob({ type: operationType });

    await processor.processJob(job as any);

    expect(broadcast).toHaveBeenCalledWith('user-a', {
      type: 'JOB_STARTED',
      payload: { jobId: 'job-123', operationType },
      timestamp: expect.any(String),
    });
  });

  test('combined signal aborts when BullMQ job signal aborts', async () => {
    let capturedSignal: AbortSignal | undefined;
    const handler = vi.fn().mockImplementation(
      (_ctx: unknown, _data: unknown, _userId: string, _onProgress: unknown, signal: AbortSignal) => {
        capturedSignal = signal;
        return new Promise(() => {});
      },
    );
    const ac = new AbortController();
    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
      getTimeout: () => 5000,
    });
    const job = createMockJob();
    (job as any).signal = ac.signal;

    const promise = processor.processJob(job as any);
    ac.abort();

    await expect(promise).rejects.toThrow('Handler timeout after 5000ms for submit-order');
    expect(capturedSignal!.aborted).toBe(true);
  });

  test('preemptable lock acquisition succeeds on retry, runs handler, returns success with data', async () => {
    const stopFn = vi.fn();
    const handlerResult = { orderId: 'ORD-99', status: 'submitted' };
    const handler = vi.fn().mockResolvedValue(handlerResult);
    const preemptableLock = createMockAgentLock({
      acquired: false,
      activeJob: { jobId: 'sync-job', type: 'sync-customers', requestStop: stopFn },
      preemptable: true,
    });
    preemptableLock.acquire
      .mockReturnValueOnce({
        acquired: false,
        activeJob: { jobId: 'sync-job', type: 'sync-customers', requestStop: stopFn },
        preemptable: true,
      })
      .mockReturnValue({ acquired: true });

    const { processor } = createProcessor({
      agentLock: preemptableLock,
      handlers: { 'submit-order': handler },
      preemptionConfig: { timeoutMs: 200, pollIntervalMs: 10 },
    });
    const job = createMockJob();

    const result = await processor.processJob(job as any);

    expect(result).toEqual({
      success: true,
      data: handlerResult,
      duration: expect.any(Number),
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('releases lock with correct userId and jobId on successful handler completion', async () => {
    const { processor, agentLock } = createProcessor();
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(agentLock.release).toHaveBeenCalledWith('user-a', 'job-123');
  });

  test('non-preemptable re-enqueue does not call cancelJob or requestStop', async () => {
    const stopFn = vi.fn();
    const busyLock = createMockAgentLock({
      acquired: false,
      activeJob: { jobId: 'existing-job', type: 'edit-order', requestStop: stopFn },
      preemptable: false,
    });
    const syncHandler = vi.fn().mockResolvedValue({});
    const { processor, cancelJob } = createProcessor({
      agentLock: busyLock,
      handlers: { 'sync-customers': syncHandler } as any,
    });
    const job = createMockJob({ type: 'sync-customers' });

    await processor.processJob(job as any);

    expect(cancelJob).not.toHaveBeenCalled();
    expect(stopFn).not.toHaveBeenCalled();
  });

  test('does not release lock when job is re-enqueued (lock never acquired)', async () => {
    const busyLock = createMockAgentLock({
      acquired: false,
      activeJob: { jobId: 'existing-job', type: 'edit-order' },
      preemptable: false,
    });
    const syncHandler = vi.fn().mockResolvedValue({});
    const { processor, agentLock } = createProcessor({
      agentLock: busyLock,
      handlers: { 'sync-customers': syncHandler } as any,
    });
    const job = createMockJob({ type: 'sync-customers' });

    await processor.processJob(job as any);

    expect(agentLock.release).not.toHaveBeenCalled();
  });

  test('releases lock after handler timeout', async () => {
    const hangingHandler = vi.fn().mockImplementation(
      () => new Promise(() => {}),
    );
    const { processor, agentLock } = createProcessor({
      handlers: { 'submit-order': hangingHandler },
      getTimeout: () => 50,
    });
    const job = createMockJob();

    await expect(processor.processJob(job as any)).rejects.toThrow(
      'Handler timeout after 50ms for submit-order',
    );

    expect(agentLock.release).toHaveBeenCalledWith('user-a', 'job-123');
  });

  test('shouldStop returns false when signal is not aborted', async () => {
    let capturedSignal: AbortSignal | undefined;
    const handler = vi.fn().mockImplementation(
      async (_ctx: unknown, _data: unknown, _userId: string, _onProgress: unknown, signal: AbortSignal) => {
        capturedSignal = signal;
        return { done: true };
      },
    );
    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(capturedSignal!.aborted).toBe(false);
  });

  test('shouldStop returns true when signal is aborted during handler execution', async () => {
    let capturedSignal: AbortSignal | undefined;
    const handler = vi.fn().mockImplementation(
      (_ctx: unknown, _data: unknown, _userId: string, _onProgress: unknown, signal: AbortSignal) => {
        capturedSignal = signal;
        return new Promise(() => {});
      },
    );
    const ac = new AbortController();
    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
      getTimeout: () => 10_000,
    });
    const job = createMockJob();
    (job as any).signal = ac.signal;

    const promise = processor.processJob(job as any);
    ac.abort();

    await expect(promise).rejects.toThrow();
    expect(capturedSignal!.aborted).toBe(true);
  });

  test('job.signal addEventListener called with { once: true } to prevent memory leaks', async () => {
    const handler = vi.fn().mockResolvedValue({ done: true });
    const ac = new AbortController();
    const addEventListenerSpy = vi.spyOn(ac.signal, 'addEventListener');

    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
    });
    const job = createMockJob();
    (job as any).signal = ac.signal;

    await processor.processJob(job as any);

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'abort',
      expect.any(Function),
      { once: true },
    );
  });

  test('emits JOB_STARTED before acquireContext', async () => {
    const callOrder: string[] = [];
    const trackingBrowserPool = {
      acquireContext: vi.fn().mockImplementation(async () => {
        callOrder.push('acquireContext');
        return { id: 'ctx-1' };
      }),
      releaseContext: vi.fn().mockResolvedValue(undefined),
    };
    const trackingBroadcast = vi.fn().mockImplementation((_userId: string, event: Record<string, unknown>) => {
      callOrder.push(event.type as string);
    });
    const handler = vi.fn().mockResolvedValue({ done: true });

    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
      broadcast: trackingBroadcast,
      browserPool: trackingBrowserPool,
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(callOrder.indexOf('JOB_STARTED')).toBeLessThan(callOrder.indexOf('acquireContext'));
  });

  test('full lifecycle broadcasts all 4 event types with correct shapes', async () => {
    const progressValue = 75;
    const progressLabel = 'Processing items';
    const handlerResult = { items: 10 };
    const handler = vi.fn().mockImplementation(
      async (_ctx: unknown, _data: unknown, _userId: string, onProgress: (p: number, l?: string) => void) => {
        onProgress(progressValue, progressLabel);
        return handlerResult;
      },
    );
    const { processor, broadcast } = createProcessor({
      handlers: { 'submit-order': handler },
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    const broadcastCalls = broadcast.mock.calls.map(([userId, event]: [string, Record<string, unknown>]) => ({
      userId,
      event,
    }));
    expect(broadcastCalls).toEqual([
      {
        userId: 'user-a',
        event: {
          type: 'JOB_STARTED',
          payload: { jobId: 'job-123', operationType: 'submit-order' },
          timestamp: expect.any(String),
        },
      },
      {
        userId: 'user-a',
        event: {
          type: 'JOB_PROGRESS',
          payload: { jobId: 'job-123', operationType: 'submit-order', progress: progressValue, label: progressLabel },
          timestamp: expect.any(String),
        },
      },
      {
        userId: 'user-a',
        event: {
          type: 'JOB_COMPLETED',
          payload: { jobId: 'job-123', operationType: 'submit-order', result: handlerResult },
          timestamp: expect.any(String),
        },
      },
    ]);
  });

  test('broadcasts JOB_FAILED on timeout with correct payload shape', async () => {
    const timeoutMs = 30;
    const hangingHandler = vi.fn().mockImplementation(
      () => new Promise(() => {}),
    );
    const { processor, broadcast } = createProcessor({
      handlers: { 'submit-order': hangingHandler },
      getTimeout: () => timeoutMs,
    });
    const job = createMockJob();

    await expect(processor.processJob(job as any)).rejects.toThrow();

    expect(broadcast).toHaveBeenCalledWith('user-a', {
      type: 'JOB_FAILED',
      payload: {
        jobId: 'job-123',
        operationType: 'submit-order',
        error: `Handler timeout after ${timeoutMs}ms for submit-order`,
      },
      timestamp: expect.any(String),
    });
  });

  test('handler receives onEmit that wraps broadcast', async () => {
    const customEvent = { type: 'CUSTOM_EVENT', payload: { detail: 'test' }, timestamp: '2026-01-01T00:00:00.000Z' };
    const handler = vi.fn().mockImplementation(
      async (_ctx: unknown, _data: unknown, _userId: string, _onProgress: unknown, _signal: unknown, onEmit: (event: Record<string, unknown>) => void) => {
        onEmit(customEvent);
        return { done: true };
      },
    );
    const { processor, broadcast } = createProcessor({
      handlers: { 'submit-order': handler },
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(broadcast).toHaveBeenCalledWith('user-a', customEvent);
  });

  test('handler without onEmit does not cause error (backward compat)', async () => {
    const handler = vi.fn().mockImplementation(
      async (_ctx: unknown, _data: unknown, _userId: string, _onProgress: unknown, _signal: unknown) => {
        return { done: true };
      },
    );
    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
    });
    const job = createMockJob();

    const result = await processor.processJob(job as any);

    expect(result.success).toBe(true);
  });
});

describe('multi-user concurrency', () => {
  function createMockBrowserPool() {
    return {
      acquireContext: vi.fn().mockResolvedValue({ id: 'ctx-1' }),
      releaseContext: vi.fn().mockResolvedValue(undefined),
      markInUse: vi.fn(),
      markIdle: vi.fn(),
    };
  }

  test('different users process in parallel without blocking', async () => {
    const agentLock = createAgentLock();
    const browserPool = createMockBrowserPool();
    const enqueue = vi.fn().mockResolvedValue('re-enqueued-id');
    const handler = vi.fn().mockResolvedValue({ done: true });

    const processor = createOperationProcessor({
      agentLock,
      browserPool,
      broadcast: vi.fn(),
      enqueue,
      handlers: { 'submit-order': handler, 'edit-order': handler } as any,
      cancelJob: vi.fn().mockReturnValue(true),
    });

    const aliceJob = {
      id: 'job-alice',
      data: { type: 'submit-order' as const, userId: 'alice', data: { orderId: 'A1' }, timestamp: Date.now() },
      updateProgress: vi.fn(),
    };
    const bobJob = {
      id: 'job-bob',
      data: { type: 'edit-order' as const, userId: 'bob', data: { orderId: 'B1' }, timestamp: Date.now() },
      updateProgress: vi.fn(),
    };

    const [aliceResult, bobResult] = await Promise.all([
      processor.processJob(aliceJob as any),
      processor.processJob(bobJob as any),
    ]);

    expect(aliceResult.success).toBe(true);
    expect(bobResult.success).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('same user jobs serialize via agentLock', async () => {
    const agentLock = createAgentLock();
    const browserPool = createMockBrowserPool();
    const enqueue = vi.fn().mockResolvedValue('re-enqueued-id');

    let resolveFirst: () => void;
    const firstHandlerPromise = new Promise<Record<string, unknown>>((resolve) => {
      resolveFirst = () => resolve({ done: true });
    });
    const firstHandler = vi.fn().mockReturnValue(firstHandlerPromise);
    const secondHandler = vi.fn().mockResolvedValue({ done: true });

    const processor = createOperationProcessor({
      agentLock,
      browserPool,
      broadcast: vi.fn(),
      enqueue,
      handlers: { 'submit-order': firstHandler, 'edit-order': secondHandler } as any,
      cancelJob: vi.fn().mockReturnValue(true),
    });

    const firstJob = {
      id: 'job-1',
      data: { type: 'submit-order' as const, userId: 'alice', data: { orderId: 'A1' }, timestamp: Date.now() },
      updateProgress: vi.fn(),
    };
    const secondJob = {
      id: 'job-2',
      data: { type: 'edit-order' as const, userId: 'alice', data: { orderId: 'A2' }, timestamp: Date.now() },
      updateProgress: vi.fn(),
    };

    const firstPromise = processor.processJob(firstJob as any);
    await new Promise((r) => setTimeout(r, 0));

    const secondResult = await processor.processJob(secondJob as any);

    expect(secondResult).toEqual({ success: false, requeued: true, duration: expect.any(Number) });
    expect(enqueue).toHaveBeenCalledWith(
      'edit-order',
      'alice',
      { orderId: 'A2', _requeueCount: 1 },
      undefined,
      { delay: 2000 },
    );

    resolveFirst!();
    const firstResult = await firstPromise;
    expect(firstResult.success).toBe(true);
  });

  test.each([
    { requeueCount: 0, expectedDelay: 2_000 },
    { requeueCount: 3, expectedDelay: 16_000 },
    { requeueCount: 100, expectedDelay: 30_000 },
  ])('exponential backoff delay increases with _requeueCount ($requeueCount -> $expectedDelay)', async ({ requeueCount, expectedDelay }) => {
    const agentLock = createAgentLock();
    const browserPool = createMockBrowserPool();
    const enqueue = vi.fn().mockResolvedValue('re-enqueued-id');
    const handler = vi.fn().mockResolvedValue({ done: true });

    agentLock.acquire('alice', 'blocking-job', 'submit-order');

    const processor = createOperationProcessor({
      agentLock,
      browserPool,
      broadcast: vi.fn(),
      enqueue,
      handlers: { 'sync-customers': handler } as any,
      cancelJob: vi.fn().mockReturnValue(true),
    });

    const job = {
      id: 'job-requeue',
      data: {
        type: 'sync-customers' as const,
        userId: 'alice',
        data: { source: 'test', _requeueCount: requeueCount },
        timestamp: Date.now(),
      },
      updateProgress: vi.fn(),
    };

    await processor.processJob(job as any);

    expect(enqueue).toHaveBeenCalledWith(
      'sync-customers',
      'alice',
      expect.objectContaining({ _requeueCount: requeueCount + 1 }),
      undefined,
      { delay: expectedDelay },
    );
  });

  test('handler receives data without _requeueCount', async () => {
    const agentLock = createAgentLock();
    const browserPool = createMockBrowserPool();
    const handler = vi.fn().mockResolvedValue({ done: true });

    const processor = createOperationProcessor({
      agentLock,
      browserPool,
      broadcast: vi.fn(),
      enqueue: vi.fn().mockResolvedValue('id'),
      handlers: { 'submit-order': handler } as any,
      cancelJob: vi.fn().mockReturnValue(true),
    });

    const job = {
      id: 'job-strip',
      data: {
        type: 'submit-order' as const,
        userId: 'alice',
        data: { orderId: 'A1', _requeueCount: 5 },
        timestamp: Date.now(),
      },
      updateProgress: vi.fn(),
    };

    await processor.processJob(job as any);

    expect(handler).toHaveBeenCalledWith(
      { id: 'ctx-1' },
      { orderId: 'A1' },
      'alice',
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Function),
    );
  });
});
