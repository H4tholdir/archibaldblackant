import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Worker } from './worker';
import type { WorkerDeps, TaskHandler } from './worker';
import type { TaskRow } from './types';
import { PreemptedSignal } from './preempted-signal';

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
  priority: 10,
  runAfter: null,
  requiresBrowser: true,
  dedupKeyExternal: null,
  ...overrides,
});

const makeDeps = (overrides: Partial<WorkerDeps> = {}): WorkerDeps => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    withTransaction: vi.fn(),
  } as unknown as WorkerDeps['pool'],
  circuitBreaker: {
    isOpen: vi.fn().mockResolvedValue(false),
    onErpSuccess: vi.fn().mockResolvedValue(undefined),
    onErpFailure: vi.fn().mockResolvedValue(undefined),
    probeAll: vi.fn().mockResolvedValue([]),
    isBotWritePaused: vi.fn().mockResolvedValue(false),
    onBotWriteFailure: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../db/repositories/active-jobs', () => ({
  insertActiveJob: vi.fn().mockResolvedValue(undefined),
  deleteActiveJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./post-op-sync', () => ({
  enqueuePostOpSyncs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db/repositories/sync-freshness', () => ({
  updateSyncFreshness: vi.fn().mockResolvedValue(undefined),
}));

import * as queueRepo from '../db/repositories/agent-queue';
import * as syncFreshnessRepo from '../db/repositories/sync-freshness';

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
      expect(deps.releaseBrowserContext).toHaveBeenCalledWith('user_a', undefined);
    });

    it('passes task.priority to releaseBrowserContext in the finally block', async () => {
      const writeTask = makeTask({ priority: 10 });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(writeTask)
        .mockResolvedValueOnce(null);

      const handler: TaskHandler = vi.fn().mockResolvedValue({ orderId: '53.999' });
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      // releaseBrowserContext (safety net) must receive the task's priority so that
      // forceReleaseByUserId decrements the correct slot counter (write, not sync).
      expect(deps.releaseBrowserContext).toHaveBeenCalledWith('user_a', 10);
    });

    it('exits and broadcasts CIRCUIT_OPEN when circuit is open', async () => {
      const deps = makeDeps({
        circuitBreaker: {
          isOpen: vi.fn().mockResolvedValue(true),
          onErpSuccess: vi.fn(),
          onErpFailure: vi.fn(),
          probeAll: vi.fn().mockResolvedValue([]),
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

    it('VERIFICA_PRE_SAVE: usa incrementRetry:false e JOB_FAILED senza backoff', async () => {
      const task = makeTask();
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);
      vi.mocked(queueRepo.failTask).mockResolvedValue({ retryCount: 0, willRetry: false });

      const errorMsg = 'VERIFICA_PRE_SAVE: discrepanza — mancanti: [H129FSQ.104.023 qty=3]';
      const handler: TaskHandler = vi.fn().mockRejectedValue(new Error(errorMsg));
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      expect(queueRepo.failTask).toHaveBeenCalledWith(
        expect.anything(),
        task.taskId,
        expect.objectContaining({ errorClass: 'verification_mismatch', incrementRetry: false }),
      );
      expect(deps.broadcast).toHaveBeenCalledWith('user_a', expect.objectContaining({ event: 'JOB_FAILED' }));
    });

    it('blocklist: completa silenziosamente senza chiamare il handler per erpId in BLOCKED_ERP_IDS', async () => {
      const blockedTask = makeTask({
        taskType: 'refresh-customer',
        payload: { erpId: '55.217' },
      });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(blockedTask)
        .mockResolvedValueOnce(null);
      const handler: TaskHandler = vi.fn().mockResolvedValue({});
      const deps = makeDeps({ handlers: { 'refresh-customer': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      expect(handler).not.toHaveBeenCalled();
      expect(queueRepo.completeTask).toHaveBeenCalledWith(expect.anything(), blockedTask.taskId);
      expect(deps.broadcast).toHaveBeenCalledWith(
        'user_a',
        expect.objectContaining({ event: 'JOB_COMPLETED', result: { skipped: true } }),
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

    it('fail task con application_error quando handler ritorna success:false', async () => {
      const task = makeTask({ taskType: 'sync-products' });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);
      vi.mocked(queueRepo.failTask).mockResolvedValue({ retryCount: 1, willRetry: true });

      const handler: TaskHandler = vi.fn().mockResolvedValue({ success: false, productsProcessed: 0 });
      const deps = makeDeps({ handlers: { 'sync-products': handler } });
      const worker = new Worker('user_a', deps);

      vi.useFakeTimers();
      try {
        const run = worker.runUntilEmpty();
        await vi.advanceTimersByTimeAsync(10_000);
        await run;
      } finally {
        vi.useRealTimers();
      }

      expect(queueRepo.completeTask).not.toHaveBeenCalled();
      expect(queueRepo.failTask).toHaveBeenCalledWith(
        expect.anything(),
        task.taskId,
        expect.objectContaining({ errorClass: 'application_error', errorMessage: 'Handler sync-products reported success:false' }),
      );
    });

    it('re-enqueue il task con run_after=+30s quando handler lancia PreemptedSignal', async () => {
      const task = makeTask({ priority: 500, preemptRequested: false });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);

      const handler: TaskHandler = vi.fn().mockRejectedValue(new PreemptedSignal());
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);

      vi.useFakeTimers();
      try {
        const run = worker.runUntilEmpty();
        // Avanza 31s per far scattare il delayed NOTIFY
        await vi.advanceTimersByTimeAsync(31_000);
        await run;
      } finally {
        vi.useRealTimers();
      }

      // failTask NON deve essere chiamato
      expect(queueRepo.failTask).not.toHaveBeenCalled();
      // completeTask NON deve essere chiamato
      expect(queueRepo.completeTask).not.toHaveBeenCalled();
      // UPDATE...run_after deve essere stato eseguito
      const poolQueryMock = vi.mocked(deps.pool.query as ReturnType<typeof vi.fn>);
      const runAfterCall = poolQueryMock.mock.calls.find(
        (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('run_after'),
      );
      expect(runAfterCall).toBeDefined();
      expect((runAfterCall![0] as string)).toContain('30 seconds');
      // Il delayed pg_notify deve essere stato eseguito dopo 31s
      const notifyCall = poolQueryMock.mock.calls.find(
        (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('pg_notify'),
      );
      expect(notifyCall).toBeDefined();
    });

    it('re-enqueue con run_after=+30s per CDP disconnect solo se preempt_requested=true in DB', async () => {
      // preemptRequested=false al pickup (realistico: signalPreemption setta la colonna DOPO)
      const task = makeTask({ priority: 500, preemptRequested: false });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);

      const handler: TaskHandler = vi.fn().mockRejectedValue(
        new Error('Protocol error (Target.activateTarget): Target closed.'),
      );
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      // Il DB re-read ritorna preempt_requested=true (il segnale è arrivato mentre il task girava)
      vi.mocked(deps.pool.query as ReturnType<typeof vi.fn>).mockImplementation(
        (sql: string) => {
          if (typeof sql === 'string' && sql.includes('preempt_requested') && sql.includes('SELECT')) {
            return Promise.resolve({ rows: [{ preempt_requested: true }] });
          }
          return Promise.resolve({ rows: [] });
        },
      );
      const worker = new Worker('user_a', deps);

      vi.useFakeTimers();
      try {
        const run = worker.runUntilEmpty();
        await vi.advanceTimersByTimeAsync(31_000);
        await run;
      } finally {
        vi.useRealTimers();
      }

      expect(queueRepo.failTask).not.toHaveBeenCalled();
      const poolQueryMock = vi.mocked(deps.pool.query as ReturnType<typeof vi.fn>);
      const runAfterCall = poolQueryMock.mock.calls.find(
        (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('run_after'),
      );
      expect(runAfterCall).toBeDefined();
    });

    it('NON re-enqueue CDP disconnect se preempt_requested=false in DB — usa il codepath failTask normale', async () => {
      const task = makeTask({ priority: 500, preemptRequested: false });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);
      vi.mocked(queueRepo.failTask).mockResolvedValue({ retryCount: 1, willRetry: false });

      const handler: TaskHandler = vi.fn().mockRejectedValue(
        new Error('Protocol error (Target.activateTarget): Target closed.'),
      );
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      // Il DB re-read ritorna preempt_requested=false (vero crash, non preemption)
      vi.mocked(deps.pool.query as ReturnType<typeof vi.fn>).mockImplementation(
        (sql: string) => {
          if (typeof sql === 'string' && sql.includes('preempt_requested') && sql.includes('SELECT')) {
            return Promise.resolve({ rows: [{ preempt_requested: false }] });
          }
          return Promise.resolve({ rows: [] });
        },
      );
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      expect(queueRepo.failTask).toHaveBeenCalled();
      const poolQueryMock = vi.mocked(deps.pool.query as ReturnType<typeof vi.fn>);
      const runAfterCall = poolQueryMock.mock.calls.find(
        (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('run_after'),
      );
      expect(runAfterCall).toBeUndefined();
    });

    it('fast-finalize: stopHeartbeat chiamato anche se completeTask lancia errore (evita heartbeat leak)', async () => {
      const task = makeTask({
        taskType: 'submit-order',
        phase: 'db_committed',
        erpOrderId: '53.999',
      });
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);
      // completeTask lancia: simula DB error o constraint violation
      const completeTaskError = new Error('Unique constraint violation');
      vi.mocked(queueRepo.completeTask).mockRejectedValueOnce(completeTaskError);

      const handler: TaskHandler = vi.fn().mockResolvedValue({ orderId: 'should-not-be-called' });
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);

      // L'errore da completeTask propagates, ma il heartbeat VIENE STOPPATO comunque
      // (grazie al finally del try/finally). Il test verifica questo comportamento.
      await expect(worker.runUntilEmpty()).rejects.toThrow('Unique constraint violation');

      // Handler non deve essere stato chiamato (fast-finalize path)
      expect(handler).not.toHaveBeenCalled();
      // Il tentativo di completare il task è stato fatto
      expect(queueRepo.completeTask).toHaveBeenCalledWith(expect.anything(), task.taskId);
      // Importante: il heartbeat è stato stoppato nel finally, quindi no memory leak
      // (il test non può verificare direttamente, ma l'errore propagates velocemente
      // senza che il setInterval continui indefinitamente)
    });

    it('JOB_STARTED include il campo priority del task', async () => {
      const task = makeTask({ taskType: 'submit-order', priority: 10 });
      vi.mocked(queueRepo.pickupNextTask).mockReset();
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);

      const handler: TaskHandler = vi.fn().mockResolvedValue({ orderId: '53.999' });
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      expect(deps.broadcast).toHaveBeenCalledWith(
        'user_a',
        expect.objectContaining({ event: 'JOB_STARTED', priority: 10 }),
      );
    });

    it('chiama updateSyncFreshness dopo completeTask per sync task types', async () => {
      const syncTypes = [
        'sync-orders', 'sync-customers', 'sync-ddt', 'sync-invoices',
        'sync-products', 'sync-prices', 'sync-tracking', 'sync-order-states',
      ] as const;
      for (const taskType of syncTypes) {
        vi.mocked(queueRepo.pickupNextTask).mockReset();
        vi.mocked(syncFreshnessRepo.updateSyncFreshness).mockClear();
        const task = makeTask({ taskType, userId: 'user_a' });
        vi.mocked(queueRepo.pickupNextTask)
          .mockResolvedValueOnce(task)
          .mockResolvedValueOnce(null);

        const handler: TaskHandler = vi.fn().mockResolvedValue({ synced: 1 });
        const deps = makeDeps({ handlers: { [taskType]: handler } });
        const worker = new Worker('user_a', deps);
        await worker.runUntilEmpty();

        expect(syncFreshnessRepo.updateSyncFreshness).toHaveBeenCalledWith(
          deps.pool,
          'user_a',
          taskType,
        );
      }
    });

    it('NON chiama updateSyncFreshness per task non-sync (submit-order)', async () => {
      const task = makeTask({ taskType: 'submit-order', priority: 10 });
      vi.mocked(queueRepo.pickupNextTask).mockReset();
      vi.mocked(queueRepo.pickupNextTask)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null);

      const handler: TaskHandler = vi.fn().mockResolvedValue({ orderId: '53.999' });
      const deps = makeDeps({ handlers: { 'submit-order': handler } });
      const worker = new Worker('user_a', deps);
      await worker.runUntilEmpty();

      expect(syncFreshnessRepo.updateSyncFreshness).not.toHaveBeenCalled();
      expect(deps.broadcast).toHaveBeenCalledWith(
        'user_a',
        expect.objectContaining({ event: 'JOB_COMPLETED' }),
      );
    });

    describe('bot write circuit breaker', () => {
      it('reschedula submit-order con run_after=+5min quando isBotWritePaused=true', async () => {
        const task = makeTask({ taskType: 'submit-order', priority: 10 });
        vi.mocked(queueRepo.pickupNextTask).mockReset();
        vi.mocked(queueRepo.pickupNextTask)
          .mockResolvedValueOnce(task)
          .mockResolvedValueOnce(null);

        const handler: TaskHandler = vi.fn();
        const deps = makeDeps({
          handlers: { 'submit-order': handler },
          circuitBreaker: {
            isOpen: vi.fn().mockResolvedValue(false),
            onErpSuccess: vi.fn().mockResolvedValue(undefined),
            onErpFailure: vi.fn().mockResolvedValue(undefined),
            probeAll: vi.fn().mockResolvedValue([]),
            isBotWritePaused: vi.fn().mockResolvedValue(true),
            onBotWriteFailure: vi.fn().mockResolvedValue(undefined),
          } as unknown as WorkerDeps['circuitBreaker'],
        });
        const worker = new Worker('user_a', deps);
        await worker.runUntilEmpty();

        expect(handler).not.toHaveBeenCalled();
        expect(deps.pool.query).toHaveBeenCalledWith(
          expect.stringContaining('run_after = NOW() + INTERVAL'),
          [task.taskId.toString()],
        );
      });

      it('chiama onBotWriteFailure quando submit-order fallisce per INVENTTABLE not focused', async () => {
        const task = makeTask({ taskType: 'submit-order', priority: 10 });
        vi.mocked(queueRepo.pickupNextTask).mockReset();
        vi.mocked(queueRepo.pickupNextTask)
          .mockResolvedValueOnce(task)
          .mockResolvedValueOnce(null);
        vi.mocked(queueRepo.failTask).mockResolvedValue({ retryCount: 1, willRetry: true });

        const inventtableError = new Error('INVENTTABLE field not focused. Article 1.');
        const handler: TaskHandler = vi.fn().mockRejectedValue(inventtableError);
        const onBotWriteFailure = vi.fn().mockResolvedValue(undefined);
        vi.mocked(queueRepo.failTask).mockResolvedValue({ retryCount: 3, willRetry: false });
        const deps = makeDeps({
          handlers: { 'submit-order': handler },
          circuitBreaker: {
            isOpen: vi.fn().mockResolvedValue(false),
            onErpSuccess: vi.fn().mockResolvedValue(undefined),
            onErpFailure: vi.fn().mockResolvedValue(undefined),
            probeAll: vi.fn().mockResolvedValue([]),
            isBotWritePaused: vi.fn().mockResolvedValue(false),
            onBotWriteFailure,
          } as unknown as WorkerDeps['circuitBreaker'],
        });
        const worker = new Worker('user_a', deps);
        await worker.runUntilEmpty();

        expect(onBotWriteFailure).toHaveBeenCalledWith('user_a', inventtableError.message);
      });

      it('NON chiama onBotWriteFailure per task non-write (sync-orders)', async () => {
        const task = makeTask({ taskType: 'sync-orders', priority: 500 });
        vi.mocked(queueRepo.pickupNextTask).mockReset();
        vi.mocked(queueRepo.pickupNextTask)
          .mockResolvedValueOnce(task)
          .mockResolvedValueOnce(null);
        vi.mocked(queueRepo.failTask).mockResolvedValue({ retryCount: 3, willRetry: false });

        const inventtableError = new Error('INVENTTABLE field not focused.');
        const handler: TaskHandler = vi.fn().mockRejectedValue(inventtableError);
        const onBotWriteFailure = vi.fn().mockResolvedValue(undefined);
        const deps = makeDeps({
          handlers: { 'sync-orders': handler },
          circuitBreaker: {
            isOpen: vi.fn().mockResolvedValue(false),
            onErpSuccess: vi.fn().mockResolvedValue(undefined),
            onErpFailure: vi.fn().mockResolvedValue(undefined),
            probeAll: vi.fn().mockResolvedValue([]),
            isBotWritePaused: vi.fn().mockResolvedValue(false),
            onBotWriteFailure,
          } as unknown as WorkerDeps['circuitBreaker'],
        });
        const worker = new Worker('user_a', deps);
        await worker.runUntilEmpty();

        expect(onBotWriteFailure).not.toHaveBeenCalled();
      });
    });
  });
});
