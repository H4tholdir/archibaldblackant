import { describe, expect, test } from 'vitest';
import { createSlowdownOptimizer } from './slowdown-optimizer';

describe('createSlowdownOptimizer', () => {
  describe('optimizeStep', () => {
    test('converges near minimum delay when action always succeeds', async () => {
      const optimizer = createSlowdownOptimizer();
      const alwaysSucceeds = () => Promise.resolve(true);

      const result = await optimizer.optimizeStep('test-step', alwaysSucceeds);

      expect(result.optimalDelay).toBeLessThanOrEqual(5);
      expect(result.converged).toBe(true);
      expect(result.crashCount).toBe(0);
      expect(result.iterations).toBeGreaterThan(0);
    });

    test('converges near threshold when action fails below 100ms', async () => {
      const threshold = 100;
      const optimizer = createSlowdownOptimizer();
      const failsBelowThreshold = (delay: number) => Promise.resolve(delay >= threshold);

      const result = await optimizer.optimizeStep('test-step', failsBelowThreshold);

      expect(result.optimalDelay).toBeGreaterThanOrEqual(threshold);
      expect(result.optimalDelay).toBeLessThanOrEqual(threshold + 5);
      expect(result.converged).toBe(true);
      expect(result.crashCount).toBeGreaterThan(0);
    });

    test('stops at maxIterations and returns last good delay', async () => {
      const maxIterations = 3;
      const optimizer = createSlowdownOptimizer({ maxIterations });
      const alwaysSucceeds = () => Promise.resolve(true);

      const result = await optimizer.optimizeStep('test-step', alwaysSucceeds);

      expect(result.iterations).toBe(maxIterations);
      expect(result.converged).toBe(false);
    });

    test('stops at maxCrashes and returns last good delay', async () => {
      const maxCrashes = 2;
      const optimizer = createSlowdownOptimizer({ maxCrashes, maxDelay: 200 });
      const alwaysFails = () => Promise.resolve(false);

      const result = await optimizer.optimizeStep('test-step', alwaysFails);

      expect(result.crashCount).toBe(maxCrashes);
      expect(result.optimalDelay).toBe(200);
    });

    test('convergenceThreshold determines when converged is true', async () => {
      const convergenceThreshold = 10;
      const threshold = 50;
      const optimizer = createSlowdownOptimizer({ convergenceThreshold, minDelay: 0, maxDelay: 200 });
      const action = (delay: number) => Promise.resolve(delay >= threshold);

      const result = await optimizer.optimizeStep('test-step', action);

      expect(result.converged).toBe(true);
      expect(result.optimalDelay).toBeGreaterThanOrEqual(threshold);
      expect(result.optimalDelay).toBeLessThanOrEqual(threshold + convergenceThreshold);
    });

    test('custom options override defaults', async () => {
      const minDelay = 50;
      const maxDelay = 500;
      const convergenceThreshold = 20;
      const maxIterations = 100;
      const maxCrashes = 20;

      const optimizer = createSlowdownOptimizer({
        minDelay, maxDelay, convergenceThreshold, maxIterations, maxCrashes,
      });

      const threshold = 250;
      const action = (delay: number) => Promise.resolve(delay >= threshold);
      const result = await optimizer.optimizeStep('test-step', action);

      expect(result.optimalDelay).toBeGreaterThanOrEqual(threshold);
      expect(result.optimalDelay).toBeLessThanOrEqual(threshold + convergenceThreshold);
      expect(result.converged).toBe(true);
    });

    test('returns maxDelay when action always fails', async () => {
      const maxDelay = 200;
      const optimizer = createSlowdownOptimizer({ maxDelay });
      const alwaysFails = () => Promise.resolve(false);

      const result = await optimizer.optimizeStep('test-step', alwaysFails);

      expect(result.optimalDelay).toBe(maxDelay);
      expect(result.converged).toBe(true);
      expect(result.crashCount).toBeGreaterThan(0);
    });

    test('uses default options when none provided', async () => {
      const optimizer = createSlowdownOptimizer();
      const threshold = 150;
      const action = (delay: number) => Promise.resolve(delay >= threshold);

      const result = await optimizer.optimizeStep('test-step', action);

      expect(result.optimalDelay).toBeGreaterThanOrEqual(150);
      expect(result.optimalDelay).toBeLessThanOrEqual(155);
      expect(result.converged).toBe(true);
    });

    test('handles minDelay equal to maxDelay', async () => {
      const optimizer = createSlowdownOptimizer({ minDelay: 100, maxDelay: 100 });
      const action = () => Promise.resolve(true);

      const result = await optimizer.optimizeStep('test-step', action);

      expect(result.optimalDelay).toBe(100);
      expect(result.iterations).toBe(0);
      expect(result.converged).toBe(true);
    });
  });
});
