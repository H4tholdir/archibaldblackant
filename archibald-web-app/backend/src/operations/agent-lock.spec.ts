import { describe, expect, test, vi } from 'vitest';
import { createAgentLock } from './agent-lock';
import type { OperationType } from './operation-types';

describe('createAgentLock', () => {
  describe('acquire', () => {
    test('empty slot returns acquired true', () => {
      const lock = createAgentLock();
      const result = lock.acquire('user-a', 'job-1', 'submit-order');
      expect(result).toEqual({ acquired: true });
    });

    test('occupied slot returns acquired false with activeJob details', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'submit-order');

      const result = lock.acquire('user-a', 'job-2', 'edit-order');
      expect(result).toEqual({
        acquired: false,
        activeJob: { jobId: 'job-1', type: 'submit-order' },
        preemptable: false,
      });
    });

    test('different userIds acquire independent slots', () => {
      const lock = createAgentLock();
      const resultA = lock.acquire('user-a', 'job-1', 'submit-order');
      const resultB = lock.acquire('user-b', 'job-2', 'edit-order');

      expect(resultA).toEqual({ acquired: true });
      expect(resultB).toEqual({ acquired: true });
    });

    test('same userId and same jobId returns acquired false (no re-entrancy)', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'submit-order');

      const result = lock.acquire('user-a', 'job-1', 'submit-order');
      expect(result).toEqual({
        acquired: false,
        activeJob: { jobId: 'job-1', type: 'submit-order' },
        preemptable: false,
      });
    });

    test('successful acquire result has no extra fields beyond acquired', () => {
      const lock = createAgentLock();
      const result = lock.acquire('user-a', 'job-1', 'submit-order');
      expect(Object.keys(result)).toEqual(['acquired']);
    });

    test('contention result has acquired, activeJob, and preemptable fields', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'sync-customers');

      const result = lock.acquire('user-a', 'job-2', 'submit-order');
      expect(result).toEqual({
        acquired: false,
        activeJob: { jobId: 'job-1', type: 'sync-customers', requestStop: undefined },
        preemptable: true,
      });
    });
  });

  describe('preemptable detection', () => {
    test.each<[OperationType, OperationType, boolean]>([
      ['sync-customers', 'submit-order', true],
      ['sync-orders', 'edit-order', true],
      ['sync-products', 'delete-order', true],
      ['sync-prices', 'send-to-verona', true],
      ['sync-customers', 'sync-orders', false],
      ['submit-order', 'sync-customers', false],
      ['submit-order', 'edit-order', false],
      ['sync-ddt', 'create-customer', true],
    ])(
      'active %s + incoming %s returns preemptable %s',
      (activeType, incomingType, expectedPreemptable) => {
        const lock = createAgentLock();
        lock.acquire('user-a', 'job-1', activeType);

        const result = lock.acquire('user-a', 'job-2', incomingType);
        expect(result).toEqual({
          acquired: false,
          activeJob: expect.objectContaining({ jobId: 'job-1', type: activeType }),
          preemptable: expectedPreemptable,
        });
      },
    );
  });

  describe('release', () => {
    test('correct userId and jobId returns true and frees slot', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'submit-order');

      const released = lock.release('user-a', 'job-1');

      expect(released).toBe(true);
      expect(lock.getActive('user-a')).toBeUndefined();
    });

    test('wrong jobId returns false and slot remains occupied', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'submit-order');

      const released = lock.release('user-a', 'wrong-job');

      expect(released).toBe(false);
      expect(lock.getActive('user-a')).toEqual({ jobId: 'job-1', type: 'submit-order' });
    });

    test('non-existent userId returns false', () => {
      const lock = createAgentLock();

      const released = lock.release('non-existent', 'job-1');

      expect(released).toBe(false);
    });

    test('after release, acquire succeeds for same userId', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'submit-order');
      lock.release('user-a', 'job-1');

      const result = lock.acquire('user-a', 'job-2', 'edit-order');
      expect(result).toEqual({ acquired: true });
    });
  });

  describe('setStopCallback', () => {
    test('attaches requestStop to active job', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'sync-customers');

      const stopFn = vi.fn();
      lock.setStopCallback('user-a', stopFn);

      const active = lock.getActive('user-a');
      expect(active?.requestStop).toBe(stopFn);
    });

    test('preemptable acquire returns activeJob with requestStop function', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'sync-customers');

      const stopFn = vi.fn();
      lock.setStopCallback('user-a', stopFn);

      const result = lock.acquire('user-a', 'job-2', 'submit-order');
      expect(result).toEqual({
        acquired: false,
        activeJob: { jobId: 'job-1', type: 'sync-customers', requestStop: stopFn },
        preemptable: true,
      });
    });

    test('non-existent userId does not throw', () => {
      const lock = createAgentLock();
      expect(() => lock.setStopCallback('non-existent', vi.fn())).not.toThrow();
    });

    test('overwrites previous callback', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'sync-customers');

      const firstFn = vi.fn();
      const secondFn = vi.fn();
      lock.setStopCallback('user-a', firstFn);
      lock.setStopCallback('user-a', secondFn);

      const active = lock.getActive('user-a');
      expect(active?.requestStop).toBe(secondFn);
    });
  });

  describe('getActive', () => {
    test('returns ActiveJob for occupied slot', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'submit-order');

      const active = lock.getActive('user-a');
      expect(active).toEqual({ jobId: 'job-1', type: 'submit-order' });
    });

    test('returns undefined for empty slot', () => {
      const lock = createAgentLock();
      expect(lock.getActive('unknown')).toBeUndefined();
    });

    test('returns same reference as internal state', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'submit-order');

      const first = lock.getActive('user-a');
      const second = lock.getActive('user-a');
      expect(first).toBe(second);
    });
  });

  describe('getAllActive', () => {
    test('returns empty Map when no locks held', () => {
      const lock = createAgentLock();
      const all = lock.getAllActive();
      expect(all).toEqual(new Map());
    });

    test('reflects current state after acquire and release cycles', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'submit-order');
      lock.acquire('user-b', 'job-2', 'sync-customers');

      const beforeRelease = lock.getAllActive();
      expect(beforeRelease.size).toBe(2);

      lock.release('user-a', 'job-1');

      const afterRelease = lock.getAllActive();
      expect(afterRelease.size).toBe(1);
      expect(afterRelease.get('user-b')).toEqual({ jobId: 'job-2', type: 'sync-customers' });
    });

    test('modifying returned map does not affect internal state', () => {
      const lock = createAgentLock();
      lock.acquire('user-a', 'job-1', 'submit-order');

      const copy = lock.getAllActive();
      copy.delete('user-a');
      copy.set('user-x', { jobId: 'job-x', type: 'edit-order' });

      const fresh = lock.getAllActive();
      expect(fresh.size).toBe(1);
      expect(fresh.get('user-a')).toEqual({ jobId: 'job-1', type: 'submit-order' });
      expect(fresh.has('user-x')).toBe(false);
    });
  });
});
