import { describe, it, expect, vi } from 'vitest';
import { Conductor } from './dispatcher';
import type { DispatcherDeps } from './dispatcher';

vi.mock('../db/repositories/agent-queue', () => ({
  enqueueTask: vi.fn().mockResolvedValue(42n),
  findOrphanRunningTasks: vi.fn().mockResolvedValue([]),
  completeTask: vi.fn().mockResolvedValue(undefined),
  failTask: vi.fn().mockResolvedValue({ retryCount: 0, willRetry: false }),
}));

vi.mock('../db/repositories/agent-circuit-state', () => ({
  getState: vi.fn().mockResolvedValue(null),
  recordErpFailure: vi.fn().mockResolvedValue({ shouldOpen: false, failures: 0 }),
  openCircuit: vi.fn().mockResolvedValue(undefined),
  setHalfOpen: vi.fn().mockResolvedValue(undefined),
  closeCircuit: vi.fn().mockResolvedValue(undefined),
  rescheduleProbe: vi.fn().mockResolvedValue(undefined),
  findCircuitsToProbe: vi.fn().mockResolvedValue([]),
  recordErpSuccess: vi.fn().mockResolvedValue(undefined),
}));

const makeDeps = (): DispatcherDeps => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    withTransaction: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DispatcherDeps['pool'],
  handlers: {},
  broadcast: vi.fn(),
  releaseBrowserContext: vi.fn().mockResolvedValue(undefined),
});

describe('Conductor', () => {
  describe('enqueueTaskExternal', () => {
    it('returns taskId from enqueueTask', async () => {
      const deps = makeDeps();
      const conductor = new Conductor(deps);
      const taskId = await conductor.enqueueTaskExternal({
        userId: 'user_a',
        taskType: 'submit-order',
        payload: { pendingOrderId: 'p1' },
      });
      expect(taskId).toBe(42n);
    });
  });

  describe('hasActiveWriteFor + isAnyWriteActive', () => {
    it('returns false when no workers are running', () => {
      const deps = makeDeps();
      const conductor = new Conductor(deps);
      expect(conductor.hasActiveWriteFor('user_a')).toBe(false);
      expect(conductor.isAnyWriteActive()).toBe(false);
    });
  });
});
