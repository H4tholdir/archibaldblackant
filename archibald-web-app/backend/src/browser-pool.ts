import puppeteer, {
  type Browser,
  type BrowserContext,
  type Page,
} from "puppeteer";
import { logger } from "./logger";
import { config } from "./config";
import { PasswordCache } from "./password-cache";
import { UserDatabase } from "./user-db";

interface CachedContext {
  context: BrowserContext;
  userId: string;
  createdAt: number;
  lastUsedAt: number;
}

/**
 * Browser Pool Manager - Persistent Authenticated Context Architecture
 *
 * NEW Architecture (Phase 26 - Universal Fast Login):
 * - One shared Browser instance (lazy initialized)
 * - Pool of N persistent authenticated contexts (default: 2)
 * - Context reuse with session validation
 * - Fast path: reuse cached context (~0.5s validation)
 * - Slow path: full login on first use or expiry (~8s)
 * - Automatic session refresh on expiry detection
 * - Context rotation: close stale contexts after 1 hour inactivity
 *
 * Benefits:
 * - 4-5x faster: <2s typical login vs 8-10s fresh login
 * - Transparent session refresh
 * - Maintains session stability
 * - Graceful degradation on session expiry
 *
 * Trade-offs:
 * - Slightly more memory (persistent contexts)
 * - Context lifecycle management complexity
 */
export class BrowserPool {
  private static instance: BrowserPool;
  private browser: Browser | null = null;
  private initializationPromise: Promise<void> | null = null;

  // Persistent context pool
  private contextPool: Map<string, CachedContext> = new Map();
  private readonly MAX_CONTEXTS = 2;
  private readonly CONTEXT_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

  // Per-user locks to prevent concurrent login attempts
  private userLocks: Map<string, Promise<BrowserContext>> = new Map();

  private constructor() {}

  static getInstance(): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool();
    }
    return BrowserPool.instance;
  }

  /**
   * Initialize shared Browser instance (lazy)
   */
  private async initialize(): Promise<void> {
    // Check if browser exists and is actually connected
    if (this.browser) {
      try {
        // Test if browser is really connected by checking process and connection
        const browserProcess = this.browser.process();
        if (browserProcess?.pid && browserProcess.pid > 0) {
          logger.debug(
            "[BrowserPool] Browser already initialized and connected",
          );
          return;
        }
      } catch (error) {
        logger.warn(
          "[BrowserPool] Browser connection check failed, reinitializing...",
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        this.browser = null;
        this.initializationPromise = null;
      }
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      logger.info("[BrowserPool] Initializing shared Browser");

      this.browser = await puppeteer.launch({
        headless: config.puppeteer.headless,
        slowMo: config.puppeteer.slowMo, // CRITICAL: Prevents browser crashes with shared instance
        ignoreHTTPSErrors: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-web-security",
          "--ignore-certificate-errors",
          "--lang=it-IT", // Force Italian locale for consistent PDF column order
          "--accept-lang=it-IT,it", // Force Accept-Language header
        ],
        defaultViewport: {
          width: 1280,
          height: 800,
        },
      });

      this.initializationPromise = null; // Reset promise after successful init
      logger.info("[BrowserPool] Browser launched successfully", {
        pid: this.browser.process()?.pid,
      });
    })();

    return this.initializationPromise;
  }

  /**
   * Acquire authenticated BrowserContext for an operation
   * Returns cached context if valid, or creates new one with login
   * Caller MUST release it via releaseContext() when done
   *
   * IMPORTANT: Uses per-user lock to prevent concurrent login attempts
   * Fast path: reuse cached context (~0.5s validation)
   * Slow path: full login (~8s) on first use or expiry
   */
  async acquireContext(userId: string): Promise<BrowserContext> {
    // Check if there's already a login in progress for this user
    const existingLock = this.userLocks.get(userId);
    if (existingLock) {
      logger.info(
        `[BrowserPool] Login already in progress for user ${userId}, waiting...`,
      );
      try {
        await existingLock;
        logger.info(
          `[BrowserPool] Previous login completed for user ${userId}, checking cache...`,
        );
      } catch (error) {
        logger.warn(
          `[BrowserPool] Previous login failed for user ${userId}, will retry...`,
        );
      }
    }

    // Check for cached context first
    const cached = this.contextPool.get(userId);
    if (cached) {
      const age = Date.now() - cached.createdAt;
      if (age < this.CONTEXT_EXPIRY_MS) {
        // Validate session is still active
        const isValid = await this.validateSession(cached.context, userId);
        if (isValid) {
          cached.lastUsedAt = Date.now();
          logger.info(
            `[BrowserPool] Reusing cached context for user ${userId} (age: ${Math.round(age / 1000)}s)`,
          );
          return cached.context;
        } else {
          logger.info(
            `[BrowserPool] Cached context invalid for user ${userId}, re-authenticating...`,
          );
          // Remove invalid context from pool
          await this.removeContextFromPool(userId);
        }
      } else {
        logger.info(
          `[BrowserPool] Cached context expired for user ${userId} (age: ${Math.round(age / 1000)}s), re-authenticating...`,
        );
        // Remove expired context from pool
        await this.removeContextFromPool(userId);
      }
    }

    // No valid cached context - create new one
    await this.initialize();

    logger.info(`[BrowserPool] Creating new authenticated context for user ${userId}`);

    // Create a promise for this login operation and store it as a lock
    const loginPromise = (async () => {
      try {
        // Enforce pool size limit - evict least recently used context
        if (this.contextPool.size >= this.MAX_CONTEXTS) {
          await this.evictLeastRecentlyUsed();
        }

        // Create brand new context - wrap in try/catch to handle browser crashes
        let context: BrowserContext;
        try {
          context = await this.browser!.createBrowserContext();
        } catch (error) {
          // Browser crashed - force reinitialization and retry once
          logger.warn(
            `[BrowserPool] Failed to create context, reinitializing browser...`,
            {
              error: error instanceof Error ? error.message : String(error),
              userId,
            },
          );

          // Force reinit by clearing browser
          this.browser = null;
          this.initializationPromise = null;

          // Reinitialize browser
          await this.initialize();

          // Retry context creation
          context = await this.browser!.createBrowserContext();
          logger.info(
            `[BrowserPool] Context created successfully after browser reinit`,
          );
        }

        // Perform fresh login
        await this.performLogin(context, userId);

        // Add to pool
        this.contextPool.set(userId, {
          context,
          userId,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
        });

        logger.info(
          `[BrowserPool] Context cached for user ${userId} (pool size: ${this.contextPool.size}/${this.MAX_CONTEXTS})`,
        );

        return context;
      } finally {
        // Remove lock when done (success or failure)
        this.userLocks.delete(userId);
      }
    })();

    // Store the lock
    this.userLocks.set(userId, loginPromise);

    // Wait for and return the context
    return await loginPromise;
  }

  /**
   * Release context after operation completes
   * Context remains in pool for reuse - NOT closed
   * Only removes from pool on failure (invalid session)
   */
  async releaseContext(
    userId: string,
    context: BrowserContext,
    success: boolean,
  ): Promise<void> {
    logger.info(
      `[BrowserPool] Releasing context for user ${userId} (success: ${success})`,
    );

    if (!success) {
      // Operation failed - remove context from pool (might be invalid)
      logger.warn(
        `[BrowserPool] Operation failed for user ${userId}, removing context from pool`,
      );
      await this.removeContextFromPool(userId);
    } else {
      // Success - update last used timestamp
      const cached = this.contextPool.get(userId);
      if (cached) {
        cached.lastUsedAt = Date.now();
        logger.debug(
          `[BrowserPool] Context remains in pool for user ${userId} (last used: ${new Date(cached.lastUsedAt).toISOString()})`,
        );
      }
    }
  }

  /**
   * Perform fresh login to Archibald
   * Private method - only called during acquireContext
   */
  private async performLogin(
    context: BrowserContext,
    userId: string,
  ): Promise<void> {
    logger.info(`[BrowserPool] Performing fresh login for user ${userId}`);

    // Check if this is a service user (background sync)
    const isServiceUser =
      userId === "product-sync-service" ||
      userId === "customer-sync-service" ||
      userId === "price-sync-service" ||
      userId === "order-sync-service" ||
      userId === "sync-orchestrator";

    let username: string;
    let password: string;

    if (isServiceUser) {
      // Service users use credentials from environment variables
      username = config.archibald.username;
      password = config.archibald.password;

      if (!username || !password) {
        throw new Error(
          `ARCHIBALD_USERNAME and ARCHIBALD_PASSWORD must be set in environment for service user ${userId}`,
        );
      }

      logger.info(
        `[BrowserPool] Using environment credentials for service user ${userId}`,
      );
    } else {
      // Regular users use credentials from cache and database
      const cachedPassword = PasswordCache.getInstance().get(userId);
      if (!cachedPassword) {
        throw new Error(
          `Password not found in cache for user ${userId}. User must login again.`,
        );
      }

      const user = UserDatabase.getInstance().getUserById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found in database`);
      }

      username = user.username;
      password = cachedPassword;
    }

    // Create page for login
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
      // Navigate to login page
      const loginUrl = `${config.archibald.url}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;

      logger.info("[BrowserPool] Navigating to login page");
      await page.goto(loginUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait for form fields to be available (fast selector wait instead of fixed 2s timeout)
      await page.waitForSelector('input[type="text"]', { timeout: 5000 });
      await page.waitForSelector('input[type="password"]', { timeout: 5000 });

      // Fill credentials INSTANTLY via evaluate (no typing delay, like paste)
      logger.info("[BrowserPool] Filling login credentials");
      const filled = await page.evaluate(
        (user, pass) => {
          // Find username field
          const inputs = Array.from(
            document.querySelectorAll<HTMLInputElement>('input[type="text"]'),
          );
          const userInput = inputs.find(
            (input) =>
              input.name?.includes("UserName") ||
              input.placeholder?.toLowerCase().includes("account") ||
              input.placeholder?.toLowerCase().includes("username"),
          );
          const usernameField = userInput || inputs[0];

          // Find password field
          const passwordField = document.querySelector<HTMLInputElement>(
            'input[type="password"]',
          );

          if (!usernameField || !passwordField) {
            return false;
          }

          // Fill fields instantly (like paste, no typing delay)
          usernameField.value = user;
          passwordField.value = pass;

          // Trigger input events for form validation
          usernameField.dispatchEvent(
            new Event("input", { bubbles: true, cancelable: true }),
          );
          passwordField.dispatchEvent(
            new Event("input", { bubbles: true, cancelable: true }),
          );

          return true;
        },
        username,
        password,
      );

      if (!filled) {
        throw new Error("Login form fields not found");
      }

      // Submit form
      logger.info("[BrowserPool] Submitting login form");
      await page.keyboard.press("Enter");

      // Wait for navigation
      await page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Verify login success
      const finalUrl = page.url();
      logger.info(`[BrowserPool] Final URL after login: ${finalUrl}`);

      if (finalUrl.includes("Login.aspx")) {
        const errorMessage = await page.evaluate(() => {
          const errorElements = document.querySelectorAll(
            '.error, .alert, [class*="error"], [class*="alert"]',
          );
          if (errorElements.length > 0) {
            return Array.from(errorElements)
              .map((el) => el.textContent?.trim())
              .filter((t) => t && t.length > 0)
              .join("; ");
          }
          return null;
        });

        throw new Error(
          `Login failed - still on login page. ${errorMessage ? `Error: ${errorMessage}` : "Possible invalid credentials or Archibald issue."}`,
        );
      }

      logger.info("[BrowserPool] Login successful");

      // Close the login page - context remains open for operation
      await page.close();
    } catch (loginError) {
      logger.error("[BrowserPool] Login failed", {
        error:
          loginError instanceof Error ? loginError.message : String(loginError),
        userId,
        username,
      });

      // Close page if still open
      if (!page.isClosed()) {
        await page.close().catch(() => {});
      }

      throw loginError;
    }
  }

  /**
   * Validate if a cached context session is still active
   * Tests by navigating to a protected page and checking for login redirect
   */
  private async validateSession(
    context: BrowserContext,
    userId: string,
  ): Promise<boolean> {
    let page: Page | null = null;
    try {
      page = await context.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      // Navigate to a protected page (main dashboard)
      const testUrl = `${config.archibald.url}/Archibald/Default.aspx`;
      await page.goto(testUrl, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });

      // Check if we got redirected to login page
      const finalUrl = page.url();
      const isValid = !finalUrl.includes("Login.aspx");

      logger.debug(
        `[BrowserPool] Session validation for user ${userId}: ${isValid ? "VALID" : "INVALID"} (url: ${finalUrl})`,
      );

      await page.close();
      return isValid;
    } catch (error) {
      logger.warn(
        `[BrowserPool] Session validation failed for user ${userId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );

      // Close page if still open
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }

      return false;
    }
  }

  /**
   * Remove a context from the pool and close it
   */
  private async removeContextFromPool(userId: string): Promise<void> {
    const cached = this.contextPool.get(userId);
    if (cached) {
      try {
        await cached.context.close();
        logger.info(`[BrowserPool] Closed context for user ${userId}`);
      } catch (error) {
        logger.error(`[BrowserPool] Error closing context for user ${userId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.contextPool.delete(userId);
    }
  }

  /**
   * Evict least recently used context from pool
   */
  private async evictLeastRecentlyUsed(): Promise<void> {
    if (this.contextPool.size === 0) {
      return;
    }

    // Find LRU context
    let lruUserId: string | null = null;
    let lruTimestamp = Date.now();

    for (const [userId, cached] of this.contextPool.entries()) {
      if (cached.lastUsedAt < lruTimestamp) {
        lruTimestamp = cached.lastUsedAt;
        lruUserId = userId;
      }
    }

    if (lruUserId) {
      logger.info(
        `[BrowserPool] Evicting LRU context for user ${lruUserId} (last used: ${Math.round((Date.now() - lruTimestamp) / 1000)}s ago)`,
      );
      await this.removeContextFromPool(lruUserId);
    }
  }

  /**
   * Shutdown: close all contexts and browser
   */
  async shutdown(): Promise<void> {
    logger.info("[BrowserPool] Shutting down...");

    // Close all cached contexts
    for (const [userId, cached] of this.contextPool.entries()) {
      try {
        await cached.context.close();
        logger.info(`[BrowserPool] Closed cached context for user ${userId}`);
      } catch (error) {
        logger.error(
          `[BrowserPool] Error closing context for user ${userId}`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
    this.contextPool.clear();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.initializationPromise = null;

    logger.info("[BrowserPool] Shutdown complete");
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const poolStats = Array.from(this.contextPool.entries()).map(
      ([userId, cached]) => ({
        userId,
        age: Math.round((Date.now() - cached.createdAt) / 1000),
        lastUsed: Math.round((Date.now() - cached.lastUsedAt) / 1000),
      }),
    );

    return {
      browserRunning: this.browser !== null && this.browser.isConnected(),
      poolSize: this.contextPool.size,
      maxPoolSize: this.MAX_CONTEXTS,
      cachedContexts: poolStats,
    };
  }
}
