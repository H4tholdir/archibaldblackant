import type { ArchibaldBot } from "./bot/archibald-bot";
import type { OrderData } from "./types";
import { logger } from "./logger";

/**
 * Optimization state for a single step
 */
interface StepOptimization {
  stepName: string;
  minValue: number; // Known safe minimum
  maxValue: number; // Known crash value (or max tested)
  testedValues: number[];
  crashes: number[]; // Values that caused crashes
  converged: boolean;
  optimalValue: number | null;
}

/**
 * Binary search optimizer to find minimum stable slowdown for each bot step
 */
export class SlowdownOptimizer {
  private steps: Map<string, StepOptimization> = new Map();
  private bot: ArchibaldBot;
  private testCustomer: string;
  private testArticle: string;

  // Safety limits
  private readonly MAX_CRASHES_PER_STEP = 10;
  private readonly TEST_TIMEOUT_MS = 120000; // 2 minutes

  constructor(bot: ArchibaldBot, customer: string, article: string) {
    this.bot = bot;
    this.testCustomer = customer;
    this.testArticle = article;
  }

  /**
   * Find optimal slowdown for a single step using binary search
   * @param stepName - Name of the step to optimize
   * @returns Optimal slowdown value in milliseconds
   */
  async optimizeStep(stepName: string): Promise<number> {
    // Initialize step optimization state
    const step: StepOptimization = {
      stepName,
      minValue: 0,
      maxValue: 200,
      testedValues: [],
      crashes: [],
      converged: false,
      optimalValue: null,
    };
    this.steps.set(stepName, step);

    logger.info(`[Optimizer] Starting optimization for step: ${stepName}`, {
      initialRange: [step.minValue, step.maxValue],
    });

    // Run binary search
    await this.binarySearch(step);

    logger.info(`[Optimizer] Optimization complete for step: ${stepName}`, {
      optimalValue: step.optimalValue,
      testedValues: step.testedValues,
      crashes: step.crashes,
    });

    return step.optimalValue!;
  }

  /**
   * Binary search logic for one step
   */
  private async binarySearch(step: StepOptimization): Promise<void> {
    let iterations = 0;
    const MAX_ITERATIONS = 50;

    while (!this.hasConverged(step) && iterations < MAX_ITERATIONS) {
      iterations++;

      // Check crash limit
      if (step.crashes.length >= this.MAX_CRASHES_PER_STEP) {
        logger.error(
          `[Optimizer] Max crashes (${this.MAX_CRASHES_PER_STEP}) reached for ${step.stepName}. Aborting.`,
        );
        break;
      }

      const testValue = this.getNextTestValue(step);

      logger.info(
        `[Optimizer] Iteration ${iterations}: Testing ${step.stepName} = ${testValue}ms`,
        {
          range: [step.minValue, step.maxValue],
          crashesSoFar: step.crashes.length,
        },
      );

      const result = await this.testSlowdownValue(step.stepName, testValue);

      step.testedValues.push(testValue);

      if (result.success) {
        // Success: narrow range to lower values [minValue, testValue]
        step.maxValue = testValue;
        logger.info(
          `[Optimizer] Success at ${testValue}ms. Narrowing range to [${step.minValue}, ${testValue}]`,
        );
      } else {
        // Crash: narrow range to higher values [testValue, maxValue]
        step.crashes.push(testValue);
        step.minValue = testValue;
        logger.warn(
          `[Optimizer] Crash at ${testValue}ms. Narrowing range to [${testValue}, ${step.maxValue}]`,
          { error: result.error },
        );

        // Restart bot after crash
        await this.restartAfterCrash();
      }
    }

    // Convergence reached or max iterations hit
    step.converged = this.hasConverged(step);
    step.optimalValue = step.maxValue; // Highest safe value

    if (!step.converged) {
      logger.warn(
        `[Optimizer] Max iterations (${MAX_ITERATIONS}) reached for ${step.stepName}`,
      );
    }
  }

  /**
   * Test a specific slowdown value by creating a test order
   * @param stepName - Name of the step being optimized
   * @param value - Slowdown value to test in milliseconds
   * @returns Test result with success flag and optional error message
   */
  private async testSlowdownValue(
    stepName: string,
    value: number,
  ): Promise<{ success: boolean; error?: string }> {
    // Build slowdown config with test value for this step
    const slowdownConfig: Record<string, number> = {};
    slowdownConfig[stepName] = value;

    // Build test order data
    const orderData: OrderData = {
      customerId: "",
      customerName: this.testCustomer,
      items: [
        {
          articleCode: this.testArticle,
          quantity: 1,
          description: "",
          price: 0,
        },
      ],
    };

    try {
      // Wrap order creation in timeout
      const orderId = await this.withTimeout(
        this.bot.createOrder(orderData, slowdownConfig),
        this.TEST_TIMEOUT_MS,
      );

      // Check if bot has error flag set
      if ((this.bot as any).hasError) {
        throw new Error("Bot error flag detected");
      }

      logger.info(
        `[Optimizer] Test passed: ${stepName} = ${value}ms (order: ${orderId})`,
      );

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error(`[Optimizer] Test failed: ${stepName} = ${value}ms`, {
        error: errorMessage,
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get next value to test (midpoint of current range)
   */
  private getNextTestValue(step: StepOptimization): number {
    return Math.floor((step.minValue + step.maxValue) / 2);
  }

  /**
   * Check if step has converged (range < 5ms)
   */
  private hasConverged(step: StepOptimization): boolean {
    return step.maxValue - step.minValue < 5;
  }

  /**
   * Get current optimization state
   */
  getState(): Map<string, StepOptimization> {
    return this.steps;
  }

  /**
   * Restart bot after a crash to restore clean state
   */
  private async restartAfterCrash(): Promise<void> {
    logger.info("[Optimizer] Restarting bot after crash...");

    try {
      // Close current bot session
      await this.bot.close();

      // Reinitialize bot
      await this.bot.initialize();
      await this.bot.login();

      logger.info("[Optimizer] Bot restarted successfully");
    } catch (error) {
      logger.error("[Optimizer] Error during bot restart:", error);
      throw error;
    }
  }

  /**
   * Wrap a promise with a timeout
   * @param promise - Promise to wrap
   * @param timeoutMs - Timeout in milliseconds
   * @returns Promise that rejects if timeout is reached
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }
}
