import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker';
import type * as repo from '../db/repositories/agent-circuit-state';

const makeFakeRepo = () => ({
  recordErpFailure: vi.fn(),
  openCircuit: vi.fn(),
  setHalfOpen: vi.fn(),
  closeCircuit: vi.fn(),
  rescheduleProbe: vi.fn(),
  findCircuitsToProbe: vi.fn(),
  recordErpSuccess: vi.fn(),
  getState: vi.fn(),
});

describe('CircuitBreaker', () => {
  let fakeRepo: ReturnType<typeof makeFakeRepo>;
  let probe: ReturnType<typeof vi.fn>;
  let cb: CircuitBreaker;

  beforeEach(() => {
    fakeRepo = makeFakeRepo();
    probe = vi.fn();
    cb = new CircuitBreaker(fakeRepo as unknown as typeof repo, probe, {} as import('../db/pool').DbPool);
  });

  describe('onErpFailure', () => {
    it('calls openCircuit when shouldOpen=true', async () => {
      fakeRepo.recordErpFailure.mockResolvedValue({ shouldOpen: true, failures: 3 });
      await cb.onErpFailure('user_a', 'login failed');
      expect(fakeRepo.openCircuit).toHaveBeenCalledWith(expect.anything(), 'user_a');
    });

    it('does not openCircuit if shouldOpen=false', async () => {
      fakeRepo.recordErpFailure.mockResolvedValue({ shouldOpen: false, failures: 1 });
      await cb.onErpFailure('user_a', 'login failed');
      expect(fakeRepo.openCircuit).not.toHaveBeenCalled();
    });
  });

  describe('onErpSuccess', () => {
    it('calls recordErpSuccess', async () => {
      fakeRepo.recordErpSuccess.mockResolvedValue(undefined);
      await cb.onErpSuccess('user_a');
      expect(fakeRepo.recordErpSuccess).toHaveBeenCalledWith(expect.anything(), 'user_a');
    });
  });

  describe('isOpen', () => {
    it('returns true if state is open', async () => {
      fakeRepo.getState.mockResolvedValue({ state: 'open' });
      expect(await cb.isOpen('user_a')).toBe(true);
    });

    it('returns false if state is closed', async () => {
      fakeRepo.getState.mockResolvedValue({ state: 'closed' });
      expect(await cb.isOpen('user_a')).toBe(false);
    });

    it('returns false if state is half_open', async () => {
      fakeRepo.getState.mockResolvedValue({ state: 'half_open' });
      expect(await cb.isOpen('user_a')).toBe(false);
    });

    it('returns false if no state row exists', async () => {
      fakeRepo.getState.mockResolvedValue(null);
      expect(await cb.isOpen('user_a')).toBe(false);
    });
  });

  describe('probeAll', () => {
    it('calls setHalfOpen when probe returns true', async () => {
      fakeRepo.findCircuitsToProbe.mockResolvedValue(['user_a']);
      probe.mockResolvedValue(true);
      await cb.probeAll();
      expect(fakeRepo.setHalfOpen).toHaveBeenCalledWith(expect.anything(), 'user_a');
      expect(fakeRepo.rescheduleProbe).not.toHaveBeenCalled();
    });

    it('calls rescheduleProbe when probe returns false', async () => {
      fakeRepo.findCircuitsToProbe.mockResolvedValue(['user_b']);
      probe.mockResolvedValue(false);
      await cb.probeAll();
      expect(fakeRepo.rescheduleProbe).toHaveBeenCalledWith(expect.anything(), 'user_b');
      expect(fakeRepo.setHalfOpen).not.toHaveBeenCalled();
    });

    it('calls rescheduleProbe when probe throws', async () => {
      fakeRepo.findCircuitsToProbe.mockResolvedValue(['user_c']);
      probe.mockRejectedValue(new Error('network error'));
      await cb.probeAll();
      expect(fakeRepo.rescheduleProbe).toHaveBeenCalledWith(expect.anything(), 'user_c');
    });

    it('probes multiple circuits independently', async () => {
      fakeRepo.findCircuitsToProbe.mockResolvedValue(['user_a', 'user_b']);
      probe.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      await cb.probeAll();
      expect(fakeRepo.setHalfOpen).toHaveBeenCalledWith(expect.anything(), 'user_a');
      expect(fakeRepo.rescheduleProbe).toHaveBeenCalledWith(expect.anything(), 'user_b');
    });
  });
});
