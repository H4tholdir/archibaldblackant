import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { OperationType, OperationJobData } from './operation-types';

const mockAdd = vi.fn();
const mockGetJob = vi.fn();
const mockGetJobs = vi.fn();
const mockGetJobCounts = vi.fn();
const mockObliterate = vi.fn();

vi.mock('bullmq', () => {
  return {
    Queue: vi.fn(() => ({
      add: mockAdd,
      getJob: mockGetJob,
      getJobs: mockGetJobs,
      getJobCounts: mockGetJobCounts,
      obliterate: mockObliterate,
      close: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('ioredis', () => {
  return {
    Redis: vi.fn(() => ({
      disconnect: vi.fn(),
    })),
  };
});

import { createOperationQueue } from './operation-queue';

describe('createOperationQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
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
      expect.objectContaining({ priority: 15 }),
    );
  });

  test('enqueue sets retry config for sync operations', async () => {
    mockAdd.mockResolvedValue({ id: 'job-789' });

    const queue = createOperationQueue();
    await queue.enqueue('sync-customers', 'user-a', {});

    expect(mockAdd).toHaveBeenCalledWith(
      'sync-customers',
      expect.anything(),
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 30000 },
      }),
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
