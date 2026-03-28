import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { OperationType, OperationJobData } from './operation-types';

const mockAdd = vi.fn();
const mockGetJob = vi.fn();
const mockGetJobs = vi.fn();
const mockGetJobCounts = vi.fn();
const mockObliterate = vi.fn();
let lastQueueName: string | undefined;

vi.mock('bullmq', () => {
  return {
    Queue: vi.fn((name: string) => {
      lastQueueName = name;
      return {
        add: mockAdd,
        getJob: mockGetJob,
        getJobs: mockGetJobs,
        getJobCounts: mockGetJobCounts,
        obliterate: mockObliterate,
        close: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

vi.mock('ioredis', () => {
  return {
    Redis: vi.fn(() => ({
      disconnect: vi.fn(),
    })),
  };
});

import { createOperationQueue, createMultiQueueEnqueue, createMultiQueueFacade } from './operation-queue';
import type { QueueName } from './queue-router';

describe('createOperationQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastQueueName = undefined;
  });

  test('defaults to queue name "operations" when no name provided', () => {
    createOperationQueue();
    expect(lastQueueName).toBe('operations');
  });

  test('uses provided queue name', () => {
    createOperationQueue('writes');
    expect(lastQueueName).toBe('writes');
  });

  test('enqueue adds job with correct priority and returns jobId', async () => {
    mockAdd.mockResolvedValue({ id: 'job-123' });

    const queue = createOperationQueue();
    const jobId = await queue.enqueue('submit-order', 'user-a', { orderId: '1' }, 'key-1');

    expect(mockAdd).toHaveBeenCalledWith(
      'submit-order',
      expect.objectContaining({
        type: 'submit-order',
        userId: 'user-a',
        data: { orderId: '1' },
        idempotencyKey: 'key-1',
        timestamp: expect.any(Number),
      }),
      expect.objectContaining({
        priority: 1,
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 100 },
      }),
    );
    expect(jobId).toBe('job-123');
  });

  test('enqueue uses correct priority for sync operations', async () => {
    mockAdd.mockResolvedValue({ id: 'job-456' });

    const queue = createOperationQueue();
    await queue.enqueue('sync-prices', 'service-account', {});

    expect(mockAdd).toHaveBeenCalledWith(
      'sync-prices',
      expect.objectContaining({ type: 'sync-prices' }),
      expect.objectContaining({ priority: 17 }),
    );
  });

  test('enqueue sets attempts:1 for sync operations (scheduler handles retry at next cycle)', async () => {
    mockAdd.mockResolvedValue({ id: 'job-789' });

    const queue = createOperationQueue();
    await queue.enqueue('sync-customers', 'user-a', {});

    expect(mockAdd).toHaveBeenCalledWith(
      'sync-customers',
      expect.anything(),
      expect.objectContaining({ attempts: 1 }),
    );
  });

  test('enqueue sets no retry for write operations', async () => {
    mockAdd.mockResolvedValue({ id: 'job-001' });

    const queue = createOperationQueue();
    await queue.enqueue('submit-order', 'user-a', { orderId: '1' });

    expect(mockAdd).toHaveBeenCalledWith(
      'submit-order',
      expect.anything(),
      expect.objectContaining({
        attempts: 1,
      }),
    );
  });

  test('uses removeOnComplete: true when configured', async () => {
    mockAdd.mockResolvedValue({ id: 'job-sync' });

    const queue = createOperationQueue('agent-sync', undefined, true);
    await queue.enqueue('sync-customers', 'user-a', {});

    expect(mockAdd).toHaveBeenCalledWith(
      'sync-customers',
      expect.anything(),
      expect.objectContaining({ removeOnComplete: true }),
    );
  });

  test('uses removeOnComplete: { count: 500 } by default', async () => {
    mockAdd.mockResolvedValue({ id: 'job-default' });

    const queue = createOperationQueue();
    await queue.enqueue('submit-order', 'user-a', { orderId: '1' });

    expect(mockAdd).toHaveBeenCalledWith(
      'submit-order',
      expect.anything(),
      expect.objectContaining({ removeOnComplete: { count: 500 } }),
    );
  });

  test('getJobStatus returns job state and progress', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      name: 'submit-order',
      data: { type: 'submit-order', userId: 'user-a' } as OperationJobData,
      getState: vi.fn().mockResolvedValue('active'),
      progress: 50,
      returnvalue: null,
      failedReason: undefined,
    });

    const queue = createOperationQueue();
    const status = await queue.getJobStatus('job-123');

    expect(status).toEqual({
      jobId: 'job-123',
      type: 'submit-order',
      userId: 'user-a',
      state: 'active',
      progress: 50,
      result: null,
      failedReason: undefined,
    });
  });

  test('getJobStatus returns null for unknown job', async () => {
    mockGetJob.mockResolvedValue(null);

    const queue = createOperationQueue();
    const status = await queue.getJobStatus('unknown');

    expect(status).toBeNull();
  });

  test('getAgentJobs returns filtered jobs for a userId', async () => {
    const mockJobs = [
      {
        id: 'job-1',
        name: 'submit-order',
        data: { type: 'submit-order', userId: 'user-a' } as OperationJobData,
        getState: vi.fn().mockResolvedValue('waiting'),
        progress: 0,
      },
      {
        id: 'job-2',
        name: 'sync-customers',
        data: { type: 'sync-customers', userId: 'user-b' } as OperationJobData,
        getState: vi.fn().mockResolvedValue('active'),
        progress: 30,
      },
    ];
    mockGetJobs.mockResolvedValue(mockJobs);

    const queue = createOperationQueue();
    const jobs = await queue.getAgentJobs('user-a');

    expect(jobs).toEqual([
      { jobId: 'job-1', type: 'submit-order', state: 'waiting', progress: 0 },
    ]);
  });

  test('getStats returns queue counts', async () => {
    mockGetJobCounts.mockResolvedValue({
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 3,
      delayed: 1,
      prioritized: 4,
    });

    const queue = createOperationQueue();
    const stats = await queue.getStats();

    expect(stats).toEqual({
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 3,
      delayed: 1,
      prioritized: 4,
    });
  });
});

describe('createMultiQueueEnqueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMockQueue(name: string) {
    return {
      enqueue: vi.fn().mockResolvedValue(`${name}-job-id`),
      getJobStatus: vi.fn(),
      getAgentJobs: vi.fn(),
      getStats: vi.fn(),
      close: vi.fn(),
      queue: {} as never,
    };
  }

  test('routes write operation to writes queue', async () => {
    const queues = {
      writes: makeMockQueue('writes'),
      'agent-sync': makeMockQueue('agent-sync'),
      enrichment: makeMockQueue('enrichment'),
      'shared-sync': makeMockQueue('shared-sync'),
    } satisfies Record<QueueName, ReturnType<typeof makeMockQueue>>;

    const enqueue = createMultiQueueEnqueue(queues);
    const jobId = await enqueue('submit-order', 'user-a', { orderId: '1' }, 'key-1');

    expect(jobId).toBe('writes-job-id');
    expect(queues.writes.enqueue).toHaveBeenCalledWith(
      'submit-order', 'user-a', { orderId: '1' }, 'key-1', undefined,
    );
    expect(queues['agent-sync'].enqueue).not.toHaveBeenCalled();
  });

  test('routes agent-sync operation to agent-sync queue', async () => {
    const queues = {
      writes: makeMockQueue('writes'),
      'agent-sync': makeMockQueue('agent-sync'),
      enrichment: makeMockQueue('enrichment'),
      'shared-sync': makeMockQueue('shared-sync'),
    } satisfies Record<QueueName, ReturnType<typeof makeMockQueue>>;

    const enqueue = createMultiQueueEnqueue(queues);
    const jobId = await enqueue('sync-customers', 'user-a', {});

    expect(jobId).toBe('agent-sync-job-id');
    expect(queues['agent-sync'].enqueue).toHaveBeenCalledWith(
      'sync-customers', 'user-a', {}, undefined, undefined,
    );
  });

  test('routes enrichment operation to enrichment queue', async () => {
    const queues = {
      writes: makeMockQueue('writes'),
      'agent-sync': makeMockQueue('agent-sync'),
      enrichment: makeMockQueue('enrichment'),
      'shared-sync': makeMockQueue('shared-sync'),
    } satisfies Record<QueueName, ReturnType<typeof makeMockQueue>>;

    const enqueue = createMultiQueueEnqueue(queues);
    const jobId = await enqueue('sync-order-articles', 'user-a', {});

    expect(jobId).toBe('enrichment-job-id');
    expect(queues.enrichment.enqueue).toHaveBeenCalledWith(
      'sync-order-articles', 'user-a', {}, undefined, undefined,
    );
  });

  test('routes shared-sync operation to shared-sync queue', async () => {
    const queues = {
      writes: makeMockQueue('writes'),
      'agent-sync': makeMockQueue('agent-sync'),
      enrichment: makeMockQueue('enrichment'),
      'shared-sync': makeMockQueue('shared-sync'),
    } satisfies Record<QueueName, ReturnType<typeof makeMockQueue>>;

    const enqueue = createMultiQueueEnqueue(queues);
    const jobId = await enqueue('sync-products', 'service-account', {});

    expect(jobId).toBe('shared-sync-job-id');
    expect(queues['shared-sync'].enqueue).toHaveBeenCalledWith(
      'sync-products', 'service-account', {}, undefined, undefined,
    );
  });

  test('forwards delayMs parameter', async () => {
    const queues = {
      writes: makeMockQueue('writes'),
      'agent-sync': makeMockQueue('agent-sync'),
      enrichment: makeMockQueue('enrichment'),
      'shared-sync': makeMockQueue('shared-sync'),
    } satisfies Record<QueueName, ReturnType<typeof makeMockQueue>>;

    const enqueue = createMultiQueueEnqueue(queues);
    await enqueue('sync-tracking', 'user-a', {}, 'key-track', 5000);

    expect(queues.enrichment.enqueue).toHaveBeenCalledWith(
      'sync-tracking', 'user-a', {}, 'key-track', 5000,
    );
  });
});

describe('createMultiQueueFacade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeFacadeMockQueue(name: string) {
    return {
      enqueue: vi.fn().mockResolvedValue(`${name}-job-id`),
      getJobStatus: vi.fn().mockResolvedValue(null),
      getAgentJobs: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({
        waiting: 1, active: 0, completed: 2, failed: 0, delayed: 0, prioritized: 0,
      }),
      close: vi.fn().mockResolvedValue(undefined),
      queue: {
        getJob: vi.fn().mockResolvedValue(undefined),
        getJobs: vi.fn().mockResolvedValue([]),
        getJobCounts: vi.fn().mockResolvedValue({ waiting: 1, active: 0 }),
        clean: vi.fn().mockResolvedValue([]),
        close: vi.fn().mockResolvedValue(undefined),
      },
    };
  }

  function makeQueues() {
    return {
      writes: makeFacadeMockQueue('writes'),
      'agent-sync': makeFacadeMockQueue('agent-sync'),
      enrichment: makeFacadeMockQueue('enrichment'),
      'shared-sync': makeFacadeMockQueue('shared-sync'),
    } as Record<QueueName, ReturnType<typeof makeFacadeMockQueue>>;
  }

  test('getStats aggregates counts across all 4 queues', async () => {
    const queues = makeQueues();
    const facade = createMultiQueueFacade(queues as never);

    const stats = await facade.getStats();

    expect(stats).toEqual({
      waiting: 4,
      active: 0,
      completed: 8,
      failed: 0,
      delayed: 0,
      prioritized: 0,
    });
  });

  test('getJobStatus returns first match across queues', async () => {
    const queues = makeQueues();
    const expectedStatus = {
      jobId: 'found-job',
      type: 'sync-customers' as const,
      userId: 'user-a',
      state: 'active',
      progress: 50,
      result: null,
      failedReason: undefined,
    };
    queues['agent-sync'].getJobStatus.mockResolvedValue(expectedStatus);

    const facade = createMultiQueueFacade(queues as never);
    const result = await facade.getJobStatus('found-job');

    expect(result).toEqual(expectedStatus);
  });

  test('getJobStatus returns null when no queue has the job', async () => {
    const queues = makeQueues();
    const facade = createMultiQueueFacade(queues as never);

    const result = await facade.getJobStatus('nonexistent');

    expect(result).toBeNull();
  });

  test('getAgentJobs merges results from all queues', async () => {
    const queues = makeQueues();
    queues.writes.getAgentJobs.mockResolvedValue([
      { jobId: 'w1', type: 'submit-order', state: 'waiting', progress: 0 },
    ]);
    queues.enrichment.getAgentJobs.mockResolvedValue([
      { jobId: 'e1', type: 'sync-order-articles', state: 'active', progress: 30 },
    ]);

    const facade = createMultiQueueFacade(queues as never);
    const jobs = await facade.getAgentJobs('user-a');

    expect(jobs).toEqual([
      { jobId: 'w1', type: 'submit-order', state: 'waiting', progress: 0 },
      { jobId: 'e1', type: 'sync-order-articles', state: 'active', progress: 30 },
    ]);
  });

  test('close closes all underlying queues', async () => {
    const queues = makeQueues();
    const facade = createMultiQueueFacade(queues as never);

    await facade.close();

    for (const q of Object.values(queues)) {
      expect(q.close).toHaveBeenCalledTimes(1);
    }
  });

  test('facade.queue.getJobs merges results from all underlying BullMQ queues', async () => {
    const queues = makeQueues();
    const jobA = { id: 'a', data: { type: 'submit-order' } };
    const jobB = { id: 'b', data: { type: 'sync-products' } };
    queues.writes.queue.getJobs.mockResolvedValue([jobA]);
    queues['shared-sync'].queue.getJobs.mockResolvedValue([jobB]);

    const facade = createMultiQueueFacade(queues as never);
    const jobs = await facade.queue.getJobs(['completed', 'failed'], 0, 99);

    expect(jobs).toEqual(expect.arrayContaining([jobA, jobB]));
  });

  test('facade.queue.getJob finds job across queues', async () => {
    const queues = makeQueues();
    const mockJob = { id: 'target-job', data: { type: 'sync-customers' } };
    queues['agent-sync'].queue.getJob.mockResolvedValue(mockJob);

    const facade = createMultiQueueFacade(queues as never);
    const job = await facade.queue.getJob('target-job');

    expect(job).toEqual(mockJob);
  });

  test('facade.queue.clean calls clean on all queues and merges results', async () => {
    const queues = makeQueues();
    queues.writes.queue.clean.mockResolvedValue(['id-1']);
    queues.enrichment.queue.clean.mockResolvedValue(['id-2', 'id-3']);

    const facade = createMultiQueueFacade(queues as never);
    const cleaned = await facade.queue.clean(0, 1000, 'completed');

    expect(cleaned).toEqual(['id-1', 'id-2', 'id-3']);
  });

  test('enqueue routes submit-order to writes queue', async () => {
    const queues = makeQueues();
    const facade = createMultiQueueFacade(queues as never);

    const jobId = await facade.enqueue('submit-order', 'user-a', { orderId: '1' });

    expect(jobId).toBe('writes-job-id');
    expect(queues.writes.enqueue).toHaveBeenCalled();
  });
});
