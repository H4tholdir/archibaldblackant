import { Page } from 'puppeteer';
import { DelayManager } from './delay-manager';
import { logger } from './logger';
import fs from 'fs';
import path from 'path';

/**
 * Binary Search Result
 */
export interface BinarySearchResult {
  operationId: string;
  optimalDelay: number;
  testedDelays: number[];
  failedDelays: number[];
  totalAttempts: number;
  duration: number;
}

/**
 * Test Context - Captured state for debugging
 */
export interface TestContext {
  timestamp: string;
  operationId: string;
  delay: number;
  attempt: number;
  url: string;
  htmlSnapshot?: string;
  screenshot?: string;
  error?: string;
  stackTrace?: string;
}

/**
 * BinarySearchTester - Finds optimal delay using binary search
 *
 * Algorithm:
 * 1. Start with delay=0
 * 2. If fails, binary search between 0 and MAX_DELAY (200ms)
 * 3. Find minimum working delay
 * 4. Capture full context on failure (DOM, screenshot, logs)
 */
export class BinarySearchTester {
  private static readonly MAX_DELAY = 200;
  private static readonly MIN_DELAY = 0;
  private readonly delayManager: DelayManager;
  private readonly debugDir: string;

  constructor() {
    this.delayManager = DelayManager.getInstance();
    this.debugDir = path.join(__dirname, '..', '.debug-tests');

    // Ensure debug directory exists
    if (!fs.existsSync(this.debugDir)) {
      fs.mkdirSync(this.debugDir, { recursive: true });
    }
  }

  /**
   * Test operation with specific delay
   */
  async testOperation(
    operationId: string,
    delay: number,
    testFunction: (delay: number) => Promise<void>,
    page: Page,
    attempt: number = 1
  ): Promise<{ success: boolean; context: TestContext }> {
    const context: TestContext = {
      timestamp: new Date().toISOString(),
      operationId,
      delay,
      attempt,
      url: page.url(),
    };

    try {
      // Execute test function with delay
      await testFunction(delay);

      logger.info(`✅ Operation ${operationId} succeeded with delay ${delay}ms`, {
        operationId,
        delay,
        attempt,
      });

      return { success: true, context };
    } catch (error) {
      // Capture failure context
      context.error = error instanceof Error ? error.message : String(error);
      context.stackTrace = error instanceof Error ? error.stack : undefined;

      // Capture HTML snapshot
      try {
        context.htmlSnapshot = await page.content();
      } catch (e) {
        logger.warn('Failed to capture HTML snapshot', { error: e });
      }

      // Capture screenshot
      try {
        const screenshotPath = path.join(
          this.debugDir,
          `${operationId}_${delay}ms_attempt${attempt}_${Date.now()}.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        context.screenshot = screenshotPath;
        logger.info(`📸 Screenshot saved: ${screenshotPath}`);
      } catch (e) {
        logger.warn('Failed to capture screenshot', { error: e });
      }

      // Save context to JSON
      await this.saveContext(context);

      logger.error(`❌ Operation ${operationId} failed with delay ${delay}ms`, {
        operationId,
        delay,
        attempt,
        error: context.error,
      });

      return { success: false, context };
    }
  }

  /**
   * Find optimal delay using binary search
   */
  async findOptimalDelay(
    operationId: string,
    testFunction: (delay: number) => Promise<void>,
    page: Page
  ): Promise<BinarySearchResult> {
    const startTime = Date.now();
    const testedDelays: number[] = [];
    const failedDelays: number[] = [];
    let attempt = 0;

    logger.info(`🔍 Starting binary search for operation: ${operationId}`);

    // Step 1: Test with 0ms delay
    attempt++;
    testedDelays.push(0);
    const zeroResult = await this.testOperation(
      operationId,
      0,
      testFunction,
      page,
      attempt
    );

    if (zeroResult.success) {
      // Success with 0ms - optimal!
      this.delayManager.updateDelay(operationId, 0, 'success', 'Works with no delay');

      return {
        operationId,
        optimalDelay: 0,
        testedDelays,
        failedDelays,
        totalAttempts: attempt,
        duration: Date.now() - startTime,
      };
    }

    failedDelays.push(0);

    // Step 2: Binary search between MIN_DELAY and MAX_DELAY
    let low = BinarySearchTester.MIN_DELAY;
    let high = BinarySearchTester.MAX_DELAY;
    let optimalDelay = BinarySearchTester.MAX_DELAY;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      attempt++;
      testedDelays.push(mid);

      logger.info(`🔍 Testing delay: ${mid}ms (range: ${low}-${high}ms)`, {
        operationId,
        low,
        high,
        mid,
      });

      const result = await this.testOperation(
        operationId,
        mid,
        testFunction,
        page,
        attempt
      );

      if (result.success) {
        // Success - try lower delay
        optimalDelay = mid;
        high = mid - 1;

        logger.info(`✅ Success at ${mid}ms, trying lower...`, {
          operationId,
          newRange: `${low}-${high}ms`,
        });
      } else {
        // Failure - try higher delay
        failedDelays.push(mid);
        low = mid + 1;

        logger.info(`❌ Failed at ${mid}ms, trying higher...`, {
          operationId,
          newRange: `${low}-${high}ms`,
        });
      }

      // Safety check - if we've tested too many times, stop
      if (attempt > 10) {
        logger.warn('⚠️  Too many attempts, stopping binary search', {
          operationId,
          attempts: attempt,
        });
        break;
      }
    }

    // Final validation - test optimal delay one more time
    attempt++;
    testedDelays.push(optimalDelay);
    const finalResult = await this.testOperation(
      operationId,
      optimalDelay,
      testFunction,
      page,
      attempt
    );

    if (finalResult.success) {
      this.delayManager.updateDelay(
        operationId,
        optimalDelay,
        'success',
        `Found optimal delay after ${attempt} attempts`
      );

      logger.info(`🎯 Optimal delay found: ${optimalDelay}ms`, {
        operationId,
        optimalDelay,
        totalAttempts: attempt,
        duration: `${Date.now() - startTime}ms`,
      });
    } else {
      // Should never happen, but handle gracefully
      this.delayManager.updateDelay(
        operationId,
        BinarySearchTester.MAX_DELAY,
        'failed',
        `Could not find stable delay after ${attempt} attempts`
      );

      logger.error(`❌ Could not find stable delay for ${operationId}`, {
        operationId,
        totalAttempts: attempt,
      });

      optimalDelay = BinarySearchTester.MAX_DELAY;
    }

    return {
      operationId,
      optimalDelay,
      testedDelays,
      failedDelays,
      totalAttempts: attempt,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Save test context to JSON file
   */
  private async saveContext(context: TestContext): Promise<void> {
    try {
      const contextPath = path.join(
        this.debugDir,
        `${context.operationId}_${context.delay}ms_${Date.now()}.json`
      );

      const contextToSave = {
        ...context,
        // Don't include full HTML in JSON (too large)
        htmlSnapshot: context.htmlSnapshot ? `${context.htmlSnapshot.length} chars` : undefined,
      };

      fs.writeFileSync(contextPath, JSON.stringify(contextToSave, null, 2));

      // Save HTML snapshot separately if available
      if (context.htmlSnapshot) {
        const htmlPath = contextPath.replace('.json', '.html');
        fs.writeFileSync(htmlPath, context.htmlSnapshot);
      }

      logger.debug(`💾 Context saved: ${contextPath}`);
    } catch (error) {
      logger.error('Failed to save test context', { error });
    }
  }

  /**
   * Get debug directory path
   */
  getDebugDir(): string {
    return this.debugDir;
  }

  /**
   * Clean up old debug files (older than 7 days)
   */
  async cleanupOldDebugFiles(): Promise<void> {
    try {
      const files = fs.readdirSync(this.debugDir);
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      let deletedCount = 0;

      files.forEach(file => {
        const filePath = path.join(this.debugDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtimeMs < sevenDaysAgo) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        logger.info(`🗑️  Cleaned up ${deletedCount} old debug files`);
      }
    } catch (error) {
      logger.error('Failed to cleanup old debug files', { error });
    }
  }
}
