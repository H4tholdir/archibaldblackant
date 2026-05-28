import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker';
import type * as repo from '../db/repositories/agent-circuit-state';
import type { DbPool } from '../db/pool';

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
    it('returns empty array and calls setHalfOpen when probe returns true', async () => {
      fakeRepo.findCircuitsToProbe.mockResolvedValue(['user_a']);
      probe.mockResolvedValue(true);
      const recovered = await cb.probeAll();
      expect(recovered).toEqual(['user_a']);
      expect(fakeRepo.setHalfOpen).toHaveBeenCalledWith(expect.anything(), 'user_a');
      expect(fakeRepo.rescheduleProbe).not.toHaveBeenCalled();
    });

    it('calls rescheduleProbe when probe returns false', async () => {
      fakeRepo.findCircuitsToProbe.mockResolvedValue(['user_b']);
      probe.mockResolvedValue(false);
      const recovered = await cb.probeAll();
      expect(recovered).toEqual([]);
      expect(fakeRepo.rescheduleProbe).toHaveBeenCalledWith(expect.anything(), 'user_b');
      expect(fakeRepo.setHalfOpen).not.toHaveBeenCalled();
    });

    it('calls rescheduleProbe when probe throws', async () => {
      fakeRepo.findCircuitsToProbe.mockResolvedValue(['user_c']);
      probe.mockRejectedValue(new Error('network error'));
      const recovered = await cb.probeAll();
      expect(recovered).toEqual([]);
      expect(fakeRepo.rescheduleProbe).toHaveBeenCalledWith(expect.anything(), 'user_c');
    });

    it('returns only recovered users and probes multiple circuits independently', async () => {
      fakeRepo.findCircuitsToProbe.mockResolvedValue(['user_a', 'user_b']);
      probe.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const recovered = await cb.probeAll();
      expect(recovered).toEqual(['user_a']);
      expect(fakeRepo.setHalfOpen).toHaveBeenCalledWith(expect.anything(), 'user_a');
      expect(fakeRepo.rescheduleProbe).toHaveBeenCalledWith(expect.anything(), 'user_b');
    });
  });

  describe('onBotWriteFailure / isBotWritePaused', () => {
    const makeSyncCb = () => ({
      recordFailure: vi.fn().mockResolvedValue(undefined),
      isPaused: vi.fn().mockResolvedValue(false),
    });

    it('deleghe recordFailure a syncCb con syncType=erp_bot_write', async () => {
      const syncCb = makeSyncCb();
      const cbSync = new CircuitBreaker(fakeRepo as unknown as typeof repo, probe, {} as DbPool, syncCb);
      await cbSync.onBotWriteFailure('user_a', 'INVENTTABLE field not focused');
      expect(syncCb.recordFailure).toHaveBeenCalledWith('user_a', 'erp_bot_write', 'INVENTTABLE field not focused');
    });

    it('isBotWritePaused=true quando syncCb.isPaused restituisce true', async () => {
      const syncCb = { ...makeSyncCb(), isPaused: vi.fn().mockResolvedValue(true) };
      const cbSync = new CircuitBreaker(fakeRepo as unknown as typeof repo, probe, {} as DbPool, syncCb);
      const paused = await cbSync.isBotWritePaused('user_a');
      expect(paused).toBe(true);
      expect(syncCb.isPaused).toHaveBeenCalledWith('user_a', 'erp_bot_write');
    });

    it('isBotWritePaused=false quando syncCb non è configurato (no pool)', async () => {
      const cbNoPool = new CircuitBreaker(fakeRepo as unknown as typeof repo, probe);
      expect(await cbNoPool.isBotWritePaused('user_a')).toBe(false);
    });

    it('onBotWriteFailure è no-op silenzioso quando syncCb non è configurato', async () => {
      const cbNoPool = new CircuitBreaker(fakeRepo as unknown as typeof repo, probe);
      await expect(cbNoPool.onBotWriteFailure('user_a', 'err')).resolves.toBeUndefined();
    });
  });
});
