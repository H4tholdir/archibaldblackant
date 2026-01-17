import { logger } from "./logger";

/**
 * Tracks active operations for graceful shutdown
 */
class OperationTracker {
  private activeOperations = 0;
  private isShuttingDown = false;
  private readonly maxDrainTimeMs = 60000; // 60 seconds

  /**
   * Increment active operation count
   */
  increment(): void {
    if (this.isShuttingDown) {
      logger.warn("Operation started during shutdown drain period", {
        activeOps: this.activeOperations,
      });
    }
    this.activeOperations++;
    logger.debug("Operation started", { activeOps: this.activeOperations });
  }

  /**
   * Decrement active operation count
   */
  decrement(): void {
    if (this.activeOperations > 0) {
      this.activeOperations--;
      logger.debug("Operation completed", { activeOps: this.activeOperations });
    }
  }

  /**
   * Get current active operation count
   */
  getCount(): number {
    return this.activeOperations;
  }

  /**
   * Check if server is shutting down
   */
  isShutdown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Mark server as shutting down
   */
  markShuttingDown(): void {
    this.isShuttingDown = true;
    logger.info("Server marked as shutting down", {
      activeOps: this.activeOperations,
    });
  }

  /**
   * Wait for all active operations to complete
   * Returns true if all operations completed, false if timeout
   */
  async drain(): Promise<boolean> {
    const startTime = Date.now();
    this.markShuttingDown();

    logger.info("Starting graceful drain", {
      activeOps: this.activeOperations,
      maxWaitMs: this.maxDrainTimeMs,
    });

    // Wait for operations to complete
    while (this.activeOperations > 0) {
      const elapsed = Date.now() - startTime;

      if (elapsed >= this.maxDrainTimeMs) {
        logger.warn("Drain timeout reached, forcing shutdown", {
          activeOps: this.activeOperations,
          elapsedMs: elapsed,
        });
        return false;
      }

      // Log progress every 5 seconds
      if (elapsed % 5000 < 100) {
        logger.info("Waiting for operations to complete", {
          activeOps: this.activeOperations,
          elapsedMs: elapsed,
        });
      }

      // Check every 100ms
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const totalTime = Date.now() - startTime;
    logger.info("All operations completed gracefully", {
      drainTimeMs: totalTime,
    });
    return true;
  }

  /**
   * Execute a function while tracking it as an active operation
   */
  async track<T>(fn: () => Promise<T>): Promise<T> {
    this.increment();
    try {
      return await fn();
    } finally {
      this.decrement();
    }
  }
}

// Singleton instance
export const operationTracker = new OperationTracker();
