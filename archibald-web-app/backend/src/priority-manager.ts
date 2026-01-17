import { EventEmitter } from "events";
import { logger } from "./logger";

/**
 * PriorityManager - Singleton that coordinates pausing/resuming background services
 * to give priority operations (like order creation) full resource access.
 *
 * Usage:
 *   const manager = PriorityManager.getInstance();
 *   await manager.registerService('customer-sync', customerSyncService);
 *
 *   // Wrap priority operation
 *   const result = await manager.withPriority(async () => {
 *     return await bot.createOrder(orderData);
 *   });
 */
export class PriorityManager extends EventEmitter {
  private static instance: PriorityManager;
  private services: Map<string, PausableService> = new Map();
  private pausedServices: Set<string> = new Set();

  private constructor() {
    super();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PriorityManager {
    if (!PriorityManager.instance) {
      PriorityManager.instance = new PriorityManager();
    }
    return PriorityManager.instance;
  }

  /**
   * Register a service that can be paused/resumed
   */
  public registerService(name: string, service: PausableService): void {
    this.services.set(name, service);
    logger.info(`[PriorityManager] Registered service: ${name}`);
  }

  /**
   * Pause all registered services
   */
  public async pause(): Promise<void> {
    logger.info("[PriorityManager] Pausing all services...");
    const pausePromises: Promise<void>[] = [];

    this.services.forEach((service, name) => {
      logger.debug(`[PriorityManager] Pausing service: ${name}`);
      pausePromises.push(
        service.pause().then(() => {
          this.pausedServices.add(name);
          logger.debug(`[PriorityManager] Service paused: ${name}`);
        }),
      );
    });

    await Promise.all(pausePromises);
    this.emit("pause");
    logger.info(
      `[PriorityManager] All services paused (${this.pausedServices.size} services)`,
    );
  }

  /**
   * Resume all paused services
   */
  public resume(): void {
    logger.info("[PriorityManager] Resuming all services...");

    this.services.forEach((service, name) => {
      if (this.pausedServices.has(name)) {
        logger.debug(`[PriorityManager] Resuming service: ${name}`);
        service.resume();
        this.pausedServices.delete(name);
        logger.debug(`[PriorityManager] Service resumed: ${name}`);
      }
    });

    this.emit("resume");
    logger.info("[PriorityManager] All services resumed");
  }

  /**
   * Execute an async function with priority lock (pause services, execute, resume)
   */
  public async withPriority<T>(fn: () => Promise<T>): Promise<T> {
    logger.info("[PriorityManager] Acquiring priority lock...");

    try {
      // Pause all services
      await this.pause();

      logger.info(
        "[PriorityManager] Priority lock acquired, executing operation...",
      );

      // Execute the priority operation
      const result = await fn();

      logger.info("[PriorityManager] Priority operation complete");

      return result;
    } finally {
      // Always resume services, even if operation fails
      this.resume();
      logger.info("[PriorityManager] Priority lock released");
    }
  }
}

/**
 * Interface that all pausable services must implement
 */
export interface PausableService {
  pause(): Promise<void>;
  resume(): void;
}
