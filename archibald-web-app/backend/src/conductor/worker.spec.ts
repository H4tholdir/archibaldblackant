import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Worker } from './worker';
import type { WorkerDeps, TaskHandler } from './worker';
import type { TaskRow } from './types';

const makeTask = (overrides: Partial<TaskRow> = {}): TaskRow => ({
  taskId: 1n,
  userId: 'user_a',
  taskType: 'submit-order',
  payload: { customerId: 'c1', pendingOrderId: 'p1' },
  batchId: null,
  position: 1,
  enqueuedAt: new Date(),
  status: 'running',
  phase: null,
  erpOrderId: null,
  startedAt: new Date(),
  heartbeatAt: new Date(),
  completedAt: null,
  retryCount: 0,
  maxRetries: 3,
  errorClass: null,
  errorMessage: null,
  cancelledAt: null,
  cancelledReason: null,
  ...overrides,
});

const makeDeps = (overrides: Partial<WorkerDeps> = {}): WorkerDeps => ({
  pool: {} as WorkerDeps['pool'],
  circuitBreaker: {
    isOpen: vi.fn().mockResolvedValue(false),
    onErpSuccess: vi.fn().mockResolvedValue(undefined),
    onErpFailure: vi.fn().mockResolvedValue(undefined),
    probeAll: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkerDeps['circuitBreaker'],
  handlers: {},
  broadcast: vi.fn(),
  metrics: {
    startTask: vi.fn().mockResolvedValue(undefined),
    startPhase: vi.fn(),
    endPhase: vi.fn().mockResolvedValue(undefined),
    finishTask: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkerDeps['metrics'],
  releaseBrowserContext: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

vi.mock('../db/repositories/agent-queue', () => ({
  pickupNextTask: vi.fn(),
  completeTask: vi.fn().mockResolvedValue(undefined),
  failTask: vi.fn().mockResolvedValue({ retryCount: 1, willRetry: true }),
  updateTaskHeartbeat: vi.fn().mockResolvedValue(undefined),
}));

import * as queueRepo from '../db/repositories/agent-queue';

describe('Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runUntilEmpty', () => {
    it('exits immediately when no tasks are enqueued', async () => {
      vi.mocked(queueRepo.pickupNextTask).mockResolvedValue(null);
      const deps = makeDeps();
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();
      expect(deps.releaseBrowserContext).toHaveBeenCalledWith('user_a');
    });

    it('exits and broadcasts CIRCUIT_OPEN when circuit is open', async () => {
      const deps = makeDeps({
        circuitBreaker: {
          isOpen: vi.fn().mockResolvedValue(true),
          onErpSuccess: vi.fn(),
          onErpFailure: vi.fn(),
          probeAll: vi.fn(),
        } as unknown as WorkerDeps['circuitBreaker'],
      });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();
      expect(deps.broadcast).toHaveBeenCalledWith('user_a', expect.objectContaining({ event: 'CIRCUIT_OPEN' }));
    });

    it('does not run concurrently if already running', async () => {
      let resolveFirst!: () => void;
      const firstPickup = new Promise<null>((res) => {
        resolveFirst = () => res(null);
      });
      vi.mocked(queueRepo.pickupNextTask).mockReturnValueOnce(firstPickup as Promise<null>);

      const deps = makeDeps();
      const worker = new Worker('user_a', deps);
      const first = worker.runUntilEmpty();
      const second = worker.runUntilEmpty(); // should return immediately
      resolveFirst();
      await Promise.all([first, second]);
      // pickupNextTask called only once (the second run bailed out early)
      expect(vi.mocked(queueRepo.pickupNextTask)).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeTask', () => {
    it('completes task and broadcasts JOB_COMPLETED on success', async () => {
      const task = makeTask();
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);

      const handler: TaskHandler = vi.fn().mockResolvedValue({ orderId: '53.999' });
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      expect(queueRepo.completeTask).toHaveBeenCalledWith(expect.anything(), task.taskId);
      expect(deps.circuitBreaker.onErpSuccess).toHaveBeenCalledWith('user_a');
      expect(deps.broadcast).toHaveBeenCalledWith('user_a', expect.objectContaining({ event: 'JOB_COMPLETED' }));
    });

    it('fails task and broadcasts JOB_RETRYING on application_error with retries left', async () => {
      const task = makeTask();
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);
      vi.mocked(queueRepo.failTask).mockResolvedValue({ retryCount: 1, willRetry: true });

      const handler: TaskHandler = vi.fn().mockRejectedValue(new Error('Article not found'));
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);

      // Replace setTimeout to avoid waiting
      const origTimeout = globalThis.setTimeout;
      vi.stubGlobal('setTimeout', (fn: () => void, _ms: number) => { fn(); return 0 as unknown as NodeJS.Timeout; });

      await worker.runUntilEmpty();

      vi.stubGlobal('setTimeout', origTimeout);

      expect(queueRepo.failTask).toHaveBeenCalledWith(
        expect.anything(),
        task.taskId,
        expect.objectContaining({ errorClass: 'application_error', incrementRetry: true }),
      );
      expect(deps.broadcast).toHaveBeenCalledWith('user_a', expect.objectContaining({ event: 'JOB_RETRYING' }));
    });

    it('calls onErpFailure when error is erp_unreachable', async () => {
      const task = makeTask();
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);
      vi.mocked(queueRepo.failTask).mockResolvedValue({ retryCount: 3, willRetry: false });

      const handler: TaskHandler = vi.fn().mockRejectedValue(new Error('ECONNREFUSED 4.231.124.90:443'));
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      expect(deps.circuitBreaker.onErpFailure).toHaveBeenCalledWith('user_a', expect.stringContaining('ECONNREFUSED'));
    });

    it('fails task with application_error when no handler is registered', async () => {
      const task = makeTask({ taskType: 'send-to-verona' });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);

      const deps = makeDeps({ handlers: {} });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      expect(queueRepo.failTask).toHaveBeenCalledWith(
        expect.anything(),
        task.taskId,
        expect.objectContaining({ errorClass: 'application_error', incrementRetry: false }),
      );
    });
  });
});
