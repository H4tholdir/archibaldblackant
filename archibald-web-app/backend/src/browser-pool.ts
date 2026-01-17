import puppeteer, {
  type Browser,
  type BrowserContext,
  type Page,
} from "puppeteer";
import { logger } from "./logger";
import { config } from "./config";
import { PasswordCache } from "./password-cache";
import { UserDatabase } from "./user-db";

/**
 * Browser Pool Manager - Simplified Session-per-Operation Architecture
 *
 * NEW Architecture (Phase 10 - Clean Slate):
 * - One shared Browser instance (lazy initialized)
 * - NO context caching - fresh context per operation
 * - NO session persistence - fresh login per operation
 * - Clean lifecycle: acquire → login → operate → close
 *
 * Benefits:
 * - No stale session bugs
 * - No complex state management
 * - No race conditions
 * - Predictable behavior
 * - Easy to debug
 *
 * Trade-offs:
 * - Slightly slower (login per operation)
 * - Acceptable for current usage patterns
 */
export class BrowserPool {
  private static instance: BrowserPool;
  private browser: Browser | null = null;
  private initializationPromise: Promise<void> | null = null;

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
   * Acquire fresh BrowserContext for an operation
   * Returns a new context with fresh login - caller MUST close it via releaseContext()
   *
   * IMPORTANT: Uses per-user lock to prevent concurrent login attempts
   * If another operation is already logging in for this user, waits for it to complete
   */
  async acquireContext(userId: string): Promise<BrowserContext> {
    // Check if there's already a login in progress for this user
    const existingLock = this.userLocks.get(userId);
    if (existingLock) {
      logger.info(
        `[BrowserPool] Login already in progress for user ${userId}, waiting...`,
      );
      try {
        // Wait for existing login to complete, then create our own context
        await existingLock;
        logger.info(
          `[BrowserPool] Previous login completed for user ${userId}, proceeding...`,
        );
      } catch (error) {
        logger.warn(
          `[BrowserPool] Previous login failed for user ${userId}, retrying...`,
        );
        // Continue anyway - we'll try our own login
      }
    }

    await this.initialize();

    logger.info(`[BrowserPool] Creating fresh context for user ${userId}`);

    // Create a promise for this login operation and store it as a lock
    const loginPromise = (async () => {
      try {
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
   * Always closes the context - no reuse
   */
  async releaseContext(
    userId: string,
    context: BrowserContext,
    success: boolean,
  ): Promise<void> {
    try {
      logger.info(
        `[BrowserPool] Closing context for user ${userId} (success: ${success})`,
      );
      await context.close();
    } catch (error) {
      logger.error("[BrowserPool] Error closing context", {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
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

    // Get credentials from cache
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

    const username = user.username;

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
        cachedPassword,
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
   * Shutdown: close browser
   */
  async shutdown(): Promise<void> {
    logger.info("[BrowserPool] Shutting down...");

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
    return {
      browserRunning: this.browser !== null && this.browser.isConnected(),
    };
  }
}
