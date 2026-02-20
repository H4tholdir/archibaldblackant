import { describe, expect, test, vi } from 'vitest';
import { createAgentLock } from './agent-lock';

describe('createAgentLock', () => {
  test('acquire succeeds for a new user', () => {
    const lock = createAgentLock();
    const result = lock.acquire('user-a', 'job-1', 'submit-order');
    expect(result).toEqual({ acquired: true });
  });

  test('second acquire for same user while locked returns not acquired with active job', () => {
    const lock = createAgentLock();
    lock.acquire('user-a', 'job-1', 'submit-order');

    const result = lock.acquire('user-a', 'job-2', 'edit-order');
    expect(result).toEqual({
      acquired: false,
      activeJob: { jobId: 'job-1', type: 'submit-order' },
      preemptable: false,
    });
  });

  test('release with matching jobId returns true and frees lock', () => {
    const lock = createAgentLock();
    lock.acquire('user-a', 'job-1', 'submit-order');

    const released = lock.release('user-a', 'job-1');

    expect(released).toBe(true);
    expect(lock.getActive('user-a')).toBeUndefined();
  });

  test('release with mismatched jobId returns false and keeps lock', () => {
    const lock = createAgentLock();
    lock.acquire('user-a', 'job-1', 'submit-order');

    const released = lock.release('user-a', 'wrong-job');

    expect(released).toBe(false);
    expect(lock.getActive('user-a')).toEqual({ jobId: 'job-1', type: 'submit-order' });
  });

  test('release then re-acquire for same user succeeds', () => {
    const lock = createAgentLock();
    lock.acquire('user-a', 'job-1', 'submit-order');
    lock.release('user-a', 'job-1');

    const result = lock.acquire('user-a', 'job-2', 'edit-order');
    expect(result).toEqual({ acquired: true });
  });

  test('different users can acquire independently', () => {
    const lock = createAgentLock();
    const resultA = lock.acquire('user-a', 'job-1', 'submit-order');
    const resultB = lock.acquire('user-b', 'job-2', 'edit-order');

    expect(resultA).toEqual({ acquired: true });
    expect(resultB).toEqual({ acquired: true });
  });

  test('preemption: sync active + write incoming returns preemptable true', () => {
    const lock = createAgentLock();
    lock.acquire('user-a', 'job-1', 'sync-customers');

    const result = lock.acquire('user-a', 'job-2', 'submit-order');
    expect(result).toEqual({
      acquired: false,
      activeJob: { jobId: 'job-1', type: 'sync-customers' },
      preemptable: true,
    });
  });

  test('preemption: write active + sync incoming returns preemptable false', () => {
    const lock = createAgentLock();
    lock.acquire('user-a', 'job-1', 'submit-order');

    const result = lock.acquire('user-a', 'job-2', 'sync-customers');
    expect(result).toEqual({
      acquired: false,
      activeJob: { jobId: 'job-1', type: 'submit-order' },
      preemptable: false,
    });
  });

  test('preemption: sync active + another sync incoming returns preemptable false', () => {
    const lock = createAgentLock();
    lock.acquire('user-a', 'job-1', 'sync-customers');

    const result = lock.acquire('user-a', 'job-2', 'sync-orders');
    expect(result).toEqual({
      acquired: false,
      activeJob: { jobId: 'job-1', type: 'sync-customers' },
      preemptable: false,
    });
  });

  test('setStopCallback attaches callback to active job', () => {
    const lock = createAgentLock();
    lock.acquire('user-a', 'job-1', 'sync-customers');

    const stopFn = vi.fn();
    lock.setStopCallback('user-a', stopFn);

    const active = lock.getActive('user-a');
    expect(active?.requestStop).toBe(stopFn);
  });

  test('getActive returns undefined for unknown user', () => {
    const lock = createAgentLock();
    expect(lock.getActive('unknown')).toBeUndefined();
  });

  test('getAllActive returns snapshot of all active jobs', () => {
    const lock = createAgentLock();
    lock.acquire('user-a', 'job-1', 'submit-order');
    lock.acquire('user-b', 'job-2', 'sync-customers');

    const all = lock.getAllActive();
    expect(all.size).toBe(2);
    expect(all.get('user-a')).toEqual({ jobId: 'job-1', type: 'submit-order' });
    expect(all.get('user-b')).toEqual({ jobId: 'job-2', type: 'sync-customers' });
  });

  test('getAllActive returns a copy, not a reference', () => {
    const lock = createAgentLock();
    lock.acquire('user-a', 'job-1', 'submit-order');

    const snapshot = lock.getAllActive();
    lock.release('user-a', 'job-1');

    expect(snapshot.size).toBe(1);
    expect(lock.getAllActive().size).toBe(0);
  });
});
