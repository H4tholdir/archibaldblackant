import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createOperationProcessor } from './operation-processor';
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
    expect(agentLock.release).toHaveBeenCalledWith('user-a');
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

  test('re-enqueues job with delay when agent is busy and not preemptable', async () => {
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
      { orderId: '1' },
      'key-1',
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
    expect(enqueue).toHaveBeenCalledWith('submit-order', 'user-a', { orderId: '1' }, 'key-1');
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
      event: 'JOB_COMPLETED',
      jobId: 'job-123',
      type: 'submit-order',
      result: { orderId: 'ORD-1' },
    });
  });

  test('broadcasts JOB_FAILED via WebSocket on error', async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error('boom'));
    const { processor, broadcast } = createProcessor({
      handlers: { 'submit-order': failingHandler },
    });
    const job = createMockJob();

    await expect(processor.processJob(job as any)).rejects.toThrow('boom');

    expect(broadcast).toHaveBeenCalledWith('user-a', {
      event: 'JOB_FAILED',
      jobId: 'job-123',
      type: 'submit-order',
      error: 'boom',
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
      event: 'JOB_FAILED',
      jobId: 'job-123',
      type: 'submit-order',
      error: 'Handler timeout after 50ms for submit-order',
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
});
