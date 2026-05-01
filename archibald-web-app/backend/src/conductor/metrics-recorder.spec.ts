import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetricsRecorder } from './metrics-recorder';
import * as metricsRepo from '../db/repositories/bot-metrics';
import * as uiIntentsRepo from '../db/repositories/ui-operation-intents';
import type { TaskRow } from './types';

vi.mock('../db/repositories/bot-metrics');
vi.mock('../db/repositories/ui-operation-intents');

const makeTask = (overrides: Partial<TaskRow> = {}): TaskRow => ({
  taskId: 1n,
  userId: 'user_a',
  taskType: 'submit-order',
  payload: { pendingOrderId: 'pending_1', customerId: 'c1', customerName: 'Cust', items: [1, 2, 3] },
  batchId: null,
  position: 1,
  enqueuedAt: new Date('2026-01-01T10:00:00Z'),
  status: 'running',
  phase: null,
  erpOrderId: null,
  startedAt: new Date('2026-01-01T10:00:01Z'),
  heartbeatAt: null,
  completedAt: null,
  retryCount: 0,
  maxRetries: 3,
  errorClass: null,
  errorMessage: null,
  cancelledAt: null,
  cancelledReason: null,
  ...overrides,
});

describe('MetricsRecorder', () => {
  let recorder: MetricsRecorder;
  const fakePool = {} as import('../db/pool').DbPool;

  beforeEach(() => {
    vi.clearAllMocks();
    recorder = new MetricsRecorder(fakePool);
    vi.mocked(uiIntentsRepo.aggregateUiDurationForPending).mockResolvedValue({
      firstOpen: new Date('2026-01-01T09:59:00Z'),
      lastSave: new Date('2026-01-01T09:59:50Z'),
      activeMs: 50000,
    });
    vi.mocked(metricsRepo.recordTaskStart).mockResolvedValue(undefined);
    vi.mocked(metricsRepo.recordTaskFinish).mockResolvedValue(undefined);
    vi.mocked(metricsRepo.recordPhase).mockResolvedValue(undefined);
  });

  describe('startTask', () => {
    it('calls recordTaskStart with ui aggregation for submit-order', async () => {
      const task = makeTask();
      await recorder.startTask(task, 'simple');
      expect(uiIntentsRepo.aggregateUiDurationForPending).toHaveBeenCalledWith(fakePool, 'pending_1');
      expect(metricsRepo.recordTaskStart).toHaveBeenCalledWith(
        fakePool,
        expect.objectContaining({
          taskId: 1n,
          agentMode: 'simple',
          numArticles: 3,
          uiDurationMs: 50000,
        }),
      );
    });

    it('skips ui aggregation for non-submit-order task types', async () => {
      const task = makeTask({ taskType: 'send-to-verona' });
      await recorder.startTask(task, undefined);
      expect(uiIntentsRepo.aggregateUiDurationForPending).not.toHaveBeenCalled();
      expect(metricsRepo.recordTaskStart).toHaveBeenCalledWith(
        fakePool,
        expect.objectContaining({ uiDurationMs: null }),
      );
    });

    it('handles missing pendingOrderId gracefully', async () => {
      const task = makeTask({ payload: { customerId: 'c1' } });
      await recorder.startTask(task, 'fresis');
      expect(uiIntentsRepo.aggregateUiDurationForPending).not.toHaveBeenCalled();
      expect(metricsRepo.recordTaskStart).toHaveBeenCalledWith(
        fakePool,
        expect.objectContaining({ uiDurationMs: null }),
      );
    });

    it('extracts customerId and customerName from payload', async () => {
      const task = makeTask({
        payload: { pendingOrderId: 'p1', customerId: 'cust_xyz', customerName: 'ABC Inc', items: [1] },
      });
      await recorder.startTask(task, 'simple');
      expect(metricsRepo.recordTaskStart).toHaveBeenCalledWith(
        fakePool,
        expect.objectContaining({
          customerId: 'cust_xyz',
          customerName: 'ABC Inc',
          numArticles: 1,
        }),
      );
    });

    it('passes through agentMode undefined', async () => {
      const task = makeTask();
      await recorder.startTask(task, undefined);
      expect(metricsRepo.recordTaskStart).toHaveBeenCalledWith(
        fakePool,
        expect.objectContaining({ agentMode: undefined }),
      );
    });
  });

  describe('startPhase + endPhase', () => {
    it('records phase duration between startPhase and endPhase', async () => {
      recorder.startPhase(1n, 'login');
      await new Promise((r) => setTimeout(r, 10));
      await recorder.endPhase(1n, 'login');
      expect(metricsRepo.recordPhase).toHaveBeenCalledWith(
        fakePool,
        expect.objectContaining({ taskId: 1n, phase: 'login' }),
      );
    });

    it('does nothing if endPhase called without startPhase', async () => {
      await recorder.endPhase(1n, 'navigation');
      expect(metricsRepo.recordPhase).not.toHaveBeenCalled();
    });

    it('supports multiple concurrent phases', async () => {
      recorder.startPhase(1n, 'login');
      recorder.startPhase(2n, 'customer_fill');
      await recorder.endPhase(1n, 'login');
      expect(metricsRepo.recordPhase).toHaveBeenCalledTimes(1);
      await recorder.endPhase(2n, 'customer_fill');
      expect(metricsRepo.recordPhase).toHaveBeenCalledTimes(2);
    });

    it('passes through notes parameter', async () => {
      recorder.startPhase(1n, 'save');
      await recorder.endPhase(1n, 'save', { retryCount: 2, savedRows: 5 });
      expect(metricsRepo.recordPhase).toHaveBeenCalledWith(
        fakePool,
        expect.objectContaining({
          notes: { retryCount: 2, savedRows: 5 },
        }),
      );
    });

    it('cleans up phase start map after endPhase', async () => {
      recorder.startPhase(1n, 'login');
      await recorder.endPhase(1n, 'login');
      expect(metricsRepo.recordPhase).toHaveBeenCalledTimes(1);
      // Calling endPhase again should not call recordPhase
      await recorder.endPhase(1n, 'login');
      expect(metricsRepo.recordPhase).toHaveBeenCalledTimes(1);
    });
  });

  describe('finishTask', () => {
    it('calls recordTaskFinish with correct status', async () => {
      const task = makeTask();
      const startedAt = new Date('2026-01-01T10:00:01Z');
      await recorder.finishTask(task, startedAt, 'completed', null, null, '53.999');
      expect(metricsRepo.recordTaskFinish).toHaveBeenCalledWith(
        fakePool,
        expect.objectContaining({
          status: 'completed',
          orderId: '53.999',
          uiDurationMs: 50000,
        }),
      );
    });

    it('records failed status with error class and message', async () => {
      const task = makeTask();
      const startedAt = new Date();
      await recorder.finishTask(task, startedAt, 'failed', 'erp_unreachable', 'ERP timeout');
      expect(metricsRepo.recordTaskFinish).toHaveBeenCalledWith(
        fakePool,
        expect.objectContaining({
          status: 'failed',
          errorClass: 'erp_unreachable',
          errorMessage: 'ERP timeout',
        }),
      );
    });

    it('records cancelled status', async () => {
      const task = makeTask();
      const startedAt = new Date();
      await recorder.finishTask(task, startedAt, 'cancelled');
      expect(metricsRepo.recordTaskFinish).toHaveBeenCalledWith(
        fakePool,
        expect.objectContaining({ status: 'cancelled' }),
      );
    });

    it('aggregates ui duration for submit-order even on finish', async () => {
      const task = makeTask();
      await recorder.finishTask(task, new Date(), 'completed');
      expect(uiIntentsRepo.aggregateUiDurationForPending).toHaveBeenCalledWith(fakePool, 'pending_1');
    });

    it('skips ui aggregation for non-submit-order on finish', async () => {
      const task = makeTask({ taskType: 'send-to-verona' });
      await recorder.finishTask(task, new Date(), 'completed');
      expect(uiIntentsRepo.aggregateUiDurationForPending).not.toHaveBeenCalled();
      expect(metricsRepo.recordTaskFinish).toHaveBeenCalledWith(
        fakePool,
        expect.objectContaining({ uiDurationMs: null }),
      );
    });

    it('passes retryCount from task', async () => {
      const task = makeTask({ retryCount: 2 });
      await recorder.finishTask(task, new Date(), 'completed');
      expect(metricsRepo.recordTaskFinish).toHaveBeenCalledWith(
        fakePool,
        expect.objectContaining({ retryCount: 2 }),
      );
    });
  });
});
