import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createOperationProcessor } from './operation-processor';
import type { CircuitBreakerLike } from './operation-processor';
import type { OperationJobData, OperationJobResult } from './operation-types';

function createMockAgentLock(acquireResult = { acquired: true } as any) {
  return {
    acquire: vi.fn().mockReturnValue(acquireResult),
    release: vi.fn(),
    setStopCallback: vi.fn(),
    getActive: vi.fn().mockReturnValue({ jobId: 'job-123', type: 'submit-order' }),
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

function createMockCircuitBreaker(overrides: Partial<CircuitBreakerLike> = {}): CircuitBreakerLike {
  return {
    isPaused: vi.fn().mockResolvedValue(false),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
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
    onJobStarted?: (...args: any[]) => Promise<void>;
    circuitBreaker?: CircuitBreakerLike;
  } = {}) {
    const agentLock = opts.agentLock ?? createMockAgentLock();
    const browserPool = opts.browserPool ?? createMockBrowserPool();
    const broadcast = opts.broadcast ?? createMockBroadcast();
    const enqueue = opts.enqueue ?? createMockEnqueue();
    const handlers = opts.handlers ?? { 'submit-order': dummyHandler };
    const onJobStarted = opts.onJobStarted;
    const circuitBreaker = opts.circuitBreaker;

    return {
      processor: createOperationProcessor({
        agentLock,
        browserPool,
        broadcast,
        enqueue,
        handlers,
        onJobStarted,
        circuitBreaker,
      }),
      agentLock,
      browserPool,
      broadcast,
      enqueue,
      onJobStarted,
      circuitBreaker,
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

  test('releases agent lock in finally even on handler error when job still holds lock', async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error('handler failed'));
    const agentLock = createMockAgentLock();
    agentLock.getActive.mockReturnValue({ jobId: 'job-123', type: 'submit-order' });
    const { processor } = createProcessor({
      agentLock,
      handlers: { 'submit-order': failingHandler },
    });
    const job = createMockJob();

    await expect(processor.processJob(job as any)).rejects.toThrow('handler failed');
    expect(agentLock.release).toHaveBeenCalledWith('user-a');
  });

  test('does not acquire browser context from processor (handlers manage their own)', async () => {
    const { processor, browserPool } = createProcessor();
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(browserPool.acquireContext).not.toHaveBeenCalled();
  });

  test('invalidates browser context on handler error', async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error('oops'));
    const { processor, browserPool } = createProcessor({
      handlers: { 'submit-order': failingHandler },
    });
    const job = createMockJob();

    await expect(processor.processJob(job as any)).rejects.toThrow('oops');
    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-a', null, false);
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
      expect.stringMatching(/^key-1-r\d+$/),
      5000,
    );
  });

  test('skips gracefully when a scheduled sync finds another scheduled sync running', async () => {
    const busyLock = createMockAgentLock({
      acquired: false,
      activeJob: { jobId: 'chain-job', type: 'sync-orders' },
      preemptable: false,
    });
    const { processor, enqueue } = createProcessor({
      agentLock: busyLock,
      handlers: { 'sync-customers': vi.fn().mockResolvedValue({}) } as any,
    });
    const job = createMockJob({ type: 'sync-customers' });

    const result = await processor.processJob(job as any);

    expect(result).toEqual({ success: true, data: { skipped: true }, duration: expect.any(Number) });
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('throws when MAX_REQUEUE_COUNT reached (so BullMQ marks job as failed)', async () => {
    const busyLock = createMockAgentLock({
      acquired: false,
      activeJob: { jobId: 'existing-job', type: 'sync-customers' },
      preemptable: false,
    });
    const { processor, enqueue } = createProcessor({ agentLock: busyLock });
    const idempotencyKey = 'key-1-r1000-r1001-r1002'; // 3 requeues = MAX_REQUEUE_COUNT

    await expect(processor.processJob(createMockJob({ idempotencyKey }) as any))
      .rejects.toThrow(/busy.*lock not acquired/i);
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('calls requestStop on active sync when write job arrives for same agent (preemption)', async () => {
    const stopFn = vi.fn();
    const preemptableLock = createMockAgentLock({
      acquired: false,
      activeJob: { jobId: 'sync-job', type: 'sync-customers', requestStop: stopFn },
      preemptable: true,
    });
    // After preemption, the lock is released and re-acquired
    preemptableLock.acquire
      .mockReturnValueOnce({
        acquired: false,
        activeJob: { jobId: 'sync-job', type: 'sync-customers', requestStop: stopFn },
        preemptable: true,
      })
      .mockReturnValue({ acquired: true });

    const { processor } = createProcessor({ agentLock: preemptableLock });
    const job = createMockJob({ type: 'submit-order' });

    await processor.processJob(job as any);

    expect(stopFn).toHaveBeenCalled();
    expect(preemptableLock.acquire).toHaveBeenCalledTimes(2);
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

  test('passes context, job data and updateProgress to handler', async () => {
    const handler = vi.fn().mockResolvedValue({ done: true });
    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(handler).toHaveBeenCalledWith(
      null,
      { orderId: '1' },
      'user-a',
      expect.any(Function),
    );
  });

  test('broadcasts JOB_STARTED before executing handler', async () => {
    const callOrder: string[] = [];
    const handler = vi.fn().mockImplementation(async () => {
      callOrder.push('handler');
      return { done: true };
    });
    const broadcast = vi.fn().mockImplementation((_userId: string, event: Record<string, unknown>) => {
      callOrder.push(event.event as string);
    });
    const { processor } = createProcessor({
      broadcast,
      handlers: { 'submit-order': handler },
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(broadcast).toHaveBeenCalledWith('user-a', {
      event: 'JOB_STARTED',
      jobId: 'job-123',
      type: 'submit-order',
    });
    expect(callOrder.indexOf('JOB_STARTED')).toBeLessThan(callOrder.indexOf('handler'));
  });

  test('broadcasts JOB_PROGRESS when handler reports progress', async () => {
    const handler = vi.fn().mockImplementation(async (_ctx: unknown, _data: unknown, _userId: string, onProgress: (p: number, l?: string) => void) => {
      onProgress(50, 'Halfway');
      return { done: true };
    });
    const { processor, broadcast } = createProcessor({
      handlers: { 'submit-order': handler },
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(broadcast).toHaveBeenCalledWith('user-a', {
      event: 'JOB_PROGRESS',
      jobId: 'job-123',
      type: 'submit-order',
      progress: 50,
      label: 'Halfway',
    });
  });

  test('broadcasts JOB_PROGRESS without label when label is omitted', async () => {
    const handler = vi.fn().mockImplementation(async (_ctx: unknown, _data: unknown, _userId: string, onProgress: (p: number, l?: string) => void) => {
      onProgress(75);
      return { done: true };
    });
    const { processor, broadcast } = createProcessor({
      handlers: { 'submit-order': handler },
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(broadcast).toHaveBeenCalledWith('user-a', {
      event: 'JOB_PROGRESS',
      jobId: 'job-123',
      type: 'submit-order',
      progress: 75,
    });
  });

  test('throws for unknown operation type', async () => {
    const { processor } = createProcessor();
    const job = createMockJob({ type: 'sync-customers' as any });

    await expect(processor.processJob(job as any)).rejects.toThrow(
      'No handler registered for operation type: sync-customers',
    );
  });

  test('calls onJobStarted with type, data, userId, and jobId after JOB_STARTED broadcast', async () => {
    const onJobStarted = vi.fn().mockResolvedValue(undefined);
    const handler = vi.fn().mockResolvedValue({ done: true });
    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
      onJobStarted,
    });
    const job = createMockJob();

    await processor.processJob(job as any);

    expect(onJobStarted).toHaveBeenCalledWith(
      'submit-order',
      { orderId: '1' },
      'user-a',
      'job-123',
    );
  });

  test('does not release lock in finally when a different job holds the lock (jobId guard)', async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error('handler failed'));
    const agentLock = createMockAgentLock();
    agentLock.getActive.mockReturnValue({ jobId: 'preemptor-job-456', type: 'submit-order' });
    const { processor } = createProcessor({
      agentLock,
      handlers: { 'submit-order': failingHandler },
    });
    const job = createMockJob();

    await expect(processor.processJob(job as any)).rejects.toThrow('handler failed');

    expect(agentLock.release).not.toHaveBeenCalled();
  });

  test('does not fail if onJobStarted throws', async () => {
    const onJobStarted = vi.fn().mockRejectedValue(new Error('tracking failed'));
    const handler = vi.fn().mockResolvedValue({ done: true });
    const { processor } = createProcessor({
      handlers: { 'submit-order': handler },
      onJobStarted,
    });
    const job = createMockJob();

    const result = await processor.processJob(job as any);

    expect(result.success).toBe(true);
    expect(onJobStarted).toHaveBeenCalled();
  });

  describe('circuit breaker integration', () => {
    test('skips sync job when circuit breaker reports paused', async () => {
      const circuitBreaker = createMockCircuitBreaker({
        isPaused: vi.fn().mockResolvedValue(true),
      });
      const syncHandler = vi.fn().mockResolvedValue({});
      const { processor, agentLock } = createProcessor({
        handlers: { 'sync-customers': syncHandler } as any,
        circuitBreaker,
      });
      const job = createMockJob({ type: 'sync-customers' });

      const result = await processor.processJob(job as any);

      expect(result).toEqual({
        success: true,
        data: { circuitBreakerSkipped: true },
        duration: expect.any(Number),
      });
      expect(syncHandler).not.toHaveBeenCalled();
      expect(agentLock.acquire).not.toHaveBeenCalled();
    });

    test('records success after sync handler completes', async () => {
      const circuitBreaker = createMockCircuitBreaker();
      const syncHandler = vi.fn().mockResolvedValue({ synced: 5 });
      const { processor } = createProcessor({
        handlers: { 'sync-orders': syncHandler } as any,
        circuitBreaker,
      });
      const job = createMockJob({ type: 'sync-orders' });

      await processor.processJob(job as any);

      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith('user-a', 'sync-orders');
    });

    test('records failure when sync handler throws', async () => {
      const circuitBreaker = createMockCircuitBreaker();
      const syncHandler = vi.fn().mockRejectedValue(new Error('ERP unreachable'));
      const { processor } = createProcessor({
        handlers: { 'sync-customers': syncHandler } as any,
        circuitBreaker,
      });
      const job = createMockJob({ type: 'sync-customers' });

      await expect(processor.processJob(job as any)).rejects.toThrow('ERP unreachable');

      expect(circuitBreaker.recordFailure).toHaveBeenCalledWith(
        'user-a',
        'sync-customers',
        'ERP unreachable',
      );
    });

    test('does not invoke circuit breaker for write operations', async () => {
      const circuitBreaker = createMockCircuitBreaker();
      const writeHandler = vi.fn().mockResolvedValue({ orderId: 'ORD-1' });
      const { processor } = createProcessor({
        handlers: { 'submit-order': writeHandler },
        circuitBreaker,
      });
      const job = createMockJob({ type: 'submit-order' });

      await processor.processJob(job as any);

      expect(circuitBreaker.isPaused).not.toHaveBeenCalled();
      expect(circuitBreaker.recordSuccess).not.toHaveBeenCalled();
    });

    test('does not invoke circuit breaker for failed write operations', async () => {
      const circuitBreaker = createMockCircuitBreaker();
      const writeHandler = vi.fn().mockRejectedValue(new Error('write failed'));
      const { processor } = createProcessor({
        handlers: { 'submit-order': writeHandler },
        circuitBreaker,
      });
      const job = createMockJob({ type: 'submit-order' });

      await expect(processor.processJob(job as any)).rejects.toThrow('write failed');

      expect(circuitBreaker.recordFailure).not.toHaveBeenCalled();
    });

    test('proceeds normally when circuit breaker is not paused', async () => {
      const circuitBreaker = createMockCircuitBreaker({
        isPaused: vi.fn().mockResolvedValue(false),
      });
      const syncHandler = vi.fn().mockResolvedValue({ synced: 3 });
      const { processor } = createProcessor({
        handlers: { 'sync-ddt': syncHandler } as any,
        circuitBreaker,
      });
      const job = createMockJob({ type: 'sync-ddt' });

      const result = await processor.processJob(job as any);

      expect(result.success).toBe(true);
      expect(syncHandler).toHaveBeenCalled();
      expect(circuitBreaker.isPaused).toHaveBeenCalledWith('user-a', 'sync-ddt');
    });

    test('swallows recordSuccess errors without failing the job', async () => {
      const circuitBreaker = createMockCircuitBreaker({
        recordSuccess: vi.fn().mockRejectedValue(new Error('DB down')),
      });
      const syncHandler = vi.fn().mockResolvedValue({ synced: 1 });
      const { processor } = createProcessor({
        handlers: { 'sync-invoices': syncHandler } as any,
        circuitBreaker,
      });
      const job = createMockJob({ type: 'sync-invoices' });

      const result = await processor.processJob(job as any);

      expect(result.success).toBe(true);
    });

    test('swallows recordFailure errors without masking handler error', async () => {
      const circuitBreaker = createMockCircuitBreaker({
        recordFailure: vi.fn().mockRejectedValue(new Error('DB down')),
      });
      const syncHandler = vi.fn().mockRejectedValue(new Error('sync failed'));
      const { processor } = createProcessor({
        handlers: { 'sync-tracking': syncHandler } as any,
        circuitBreaker,
      });
      const job = createMockJob({ type: 'sync-tracking' });

      await expect(processor.processJob(job as any)).rejects.toThrow('sync failed');
    });
  });
});
