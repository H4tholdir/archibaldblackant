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

      vi.useFakeTimers();
      try {
        const run = worker.runUntilEmpty();
        // Avanza 10s: scade il backoff (10_000ms per retryCount=1), non il heartbeat (30_000ms)
        await vi.advanceTimersByTimeAsync(10_000);
        await run;
      } finally {
        vi.useRealTimers();
      }

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

    it('auto-resume: task con phase=erp_save_done + erpOrderId inietta _resumeFromErpSaveDone nel payload', async () => {
      const task = makeTask({
        phase: 'erp_save_done',
        erpOrderId: '53.999',
        retryCount: 1,
        payload: { customerId: 'c1', pendingOrderId: 'p1' },
      });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);

      const handler: TaskHandler = vi.fn().mockResolvedValue({ orderId: '53.999' });
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      // Il handler deve ricevere il task con payload arricchito di _resumeFromErpSaveDone+_resumeOrderId
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: task.taskId,
          payload: expect.objectContaining({
            _resumeFromErpSaveDone: true,
            _resumeOrderId: '53.999',
            customerId: 'c1',
            pendingOrderId: 'p1',
          }),
        }),
        expect.anything(),
      );
    });

    it('NON inietta resume flag se phase è null (esecuzione normale)', async () => {
      const task = makeTask({ phase: null, erpOrderId: null });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);

      const handler: TaskHandler = vi.fn().mockResolvedValue({ orderId: 'NEW-1' });
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      const handlerCall = vi.mocked(handler).mock.calls[0][0];
      expect((handlerCall.payload as Record<string, unknown>)._resumeFromErpSaveDone).toBeUndefined();
      expect((handlerCall.payload as Record<string, unknown>)._resumeOrderId).toBeUndefined();
    });

    it('NON inietta resume flag se taskType non è submit-order', async () => {
      const task = makeTask({
        taskType: 'edit-order',
        phase: 'erp_save_done',
        erpOrderId: '53.999',
      });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);

      const handler: TaskHandler = vi.fn().mockResolvedValue({ orderId: '53.999' });
      const deps = makeDeps({ handlers: { 'edit-order': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      const handlerCall = vi.mocked(handler).mock.calls[0][0];
      expect((handlerCall.payload as Record<string, unknown>)._resumeFromErpSaveDone).toBeUndefined();
    });

    it('fast-finalize: phase=db_committed con erpOrderId NON re-esegue handler, marca completed direttamente', async () => {
      const task = makeTask({
        taskType: 'submit-order',
        phase: 'db_committed',
        erpOrderId: '53878',
        retryCount: 1,
      });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);

      const handler: TaskHandler = vi.fn().mockResolvedValue({ orderId: 'should-not-be-called' });
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      // Il handler NON deve essere stato chiamato (no nuovo bot.createOrder)
      expect(handler).not.toHaveBeenCalled();
      // Il task deve essere stato marcato completed
      expect(queueRepo.completeTask).toHaveBeenCalledWith(expect.anything(), task.taskId);
      // JOB_COMPLETED broadcast con orderId preservato
      expect(deps.broadcast).toHaveBeenCalledWith(
        'user_a',
        expect.objectContaining({
          event: 'JOB_COMPLETED',
          taskId: '1',
          jobId: '1',
          result: { orderId: '53878' },
        }),
      );
    });

    it('fast-finalize: phase=completed con erpOrderId NON re-esegue handler', async () => {
      const task = makeTask({
        taskType: 'submit-order',
        phase: 'completed',
        erpOrderId: '53878',
      });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);

      const handler: TaskHandler = vi.fn().mockResolvedValue({ orderId: 'should-not-be-called' });
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      expect(handler).not.toHaveBeenCalled();
      expect(queueRepo.completeTask).toHaveBeenCalledWith(expect.anything(), task.taskId);
    });

    it('fast-finalize NON si attiva se erpOrderId è null (caso sospetto, esegue normalmente)', async () => {
      const task = makeTask({
        taskType: 'submit-order',
        phase: 'db_committed',
        erpOrderId: null, // edge case: phase set ma orderId mancante
      });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);

      const handler: TaskHandler = vi.fn().mockResolvedValue({ orderId: 'NEW' });
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      // Senza erpOrderId, fast-finalize non si attiva → handler eseguito normalmente
      expect(handler).toHaveBeenCalled();
    });
  });
});
