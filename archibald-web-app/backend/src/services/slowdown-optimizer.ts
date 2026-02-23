type OptimizeResult = {
  optimalDelay: number;
  iterations: number;
  converged: boolean;
  crashCount: number;
};

type BotAction = (delayMs: number) => Promise<boolean>;

type SlowdownOptimizerOptions = {
  minDelay?: number;
  maxDelay?: number;
  convergenceThreshold?: number;
  maxIterations?: number;
  maxCrashes?: number;
};

function createSlowdownOptimizer(options?: SlowdownOptimizerOptions) {
  const minDelay = options?.minDelay ?? 0;
  const maxDelay = options?.maxDelay ?? 200;
  const convergenceThreshold = options?.convergenceThreshold ?? 5;
  const maxIterations = options?.maxIterations ?? 50;
  const maxCrashes = options?.maxCrashes ?? 10;

  async function optimizeStep(_stepName: string, action: BotAction): Promise<OptimizeResult> {
    let low = minDelay;
    let high = maxDelay;
    let crashCount = 0;
    let iterations = 0;
    let lastGoodDelay = maxDelay;

    while (high - low > convergenceThreshold && iterations < maxIterations && crashCount < maxCrashes) {
      const mid = Math.round((low + high) / 2);
      const success = await action(mid);
      iterations++;

      if (success) {
        lastGoodDelay = mid;
        high = mid;
      } else {
        crashCount++;
        low = mid;
      }
    }

    return {
      optimalDelay: lastGoodDelay,
      iterations,
      converged: high - low <= convergenceThreshold,
      crashCount,
    };
  }

  return { optimizeStep };
}

export { createSlowdownOptimizer, type OptimizeResult, type BotAction, type SlowdownOptimizerOptions };
