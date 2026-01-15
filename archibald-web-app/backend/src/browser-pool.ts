import puppeteer, { type Browser, type BrowserContext, type Page } from 'puppeteer';
import { logger } from './logger';
import { config } from './config';
import { PasswordCache } from './password-cache';
import { UserDatabase } from './user-db';

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
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

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
    if (this.isInitialized && this.browser && this.browser.isConnected()) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      logger.info('[BrowserPool] Initializing shared Browser');

      this.browser = await puppeteer.launch({
        headless: config.puppeteer.headless,
        ignoreHTTPSErrors: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--ignore-certificate-errors',
        ],
        defaultViewport: {
          width: 1280,
          height: 800,
        },
      });

      this.isInitialized = true;
      logger.info('[BrowserPool] Browser launched successfully');
    })();

    return this.initializationPromise;
  }

  /**
   * Acquire fresh BrowserContext for an operation
   * Returns a new context with fresh login - caller MUST close it via releaseContext()
   */
  async acquireContext(userId: string): Promise<BrowserContext> {
    await this.initialize();

    logger.info(`[BrowserPool] Creating fresh context for user ${userId}`);

    // Create brand new context
    const context = await this.browser!.createBrowserContext();

    // Perform fresh login
    await this.performLogin(context, userId);

    return context;
  }

  /**
   * Release context after operation completes
   * Always closes the context - no reuse
   */
  async releaseContext(
    userId: string,
    context: BrowserContext,
    success: boolean
  ): Promise<void> {
    try {
      logger.info(`[BrowserPool] Closing context for user ${userId} (success: ${success})`);
      await context.close();
    } catch (error) {
      logger.error('[BrowserPool] Error closing context', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
    }
  }

  /**
   * Perform fresh login to Archibald
   * Private method - only called during acquireContext
   */
  private async performLogin(context: BrowserContext, userId: string): Promise<void> {
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

      logger.info('[BrowserPool] Navigating to login page');
      await page.goto(loginUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait for form to be ready
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Find form fields
      const usernameField = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        const userInput = inputs.find(
          (input) =>
            input.id.includes("UserName") ||
            input.name.includes("UserName") ||
            input.placeholder?.toLowerCase().includes("account") ||
            input.placeholder?.toLowerCase().includes("username"),
        );
        if (userInput) {
          return (userInput as HTMLInputElement).id || (userInput as HTMLInputElement).name;
        }
        if (inputs.length > 0) {
          return (inputs[0] as HTMLInputElement).id || (inputs[0] as HTMLInputElement).name;
        }
        return null;
      });

      const passwordField = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
        if (inputs.length > 0) {
          return (inputs[0] as HTMLInputElement).id || (inputs[0] as HTMLInputElement).name;
        }
        return null;
      });

      if (!usernameField || !passwordField) {
        throw new Error("Login form fields not found");
      }

      // Fill credentials
      logger.info('[BrowserPool] Filling login credentials');
      await page.evaluate((fieldId) => {
        const input = document.getElementById(fieldId) as HTMLInputElement;
        if (input) input.value = '';
      }, usernameField);
      await page.type(`#${usernameField}`, username, { delay: 100 });

      await page.evaluate((fieldId) => {
        const input = document.getElementById(fieldId) as HTMLInputElement;
        if (input) input.value = '';
      }, passwordField);
      await page.type(`#${passwordField}`, cachedPassword, { delay: 100 });

      // Submit form
      logger.info('[BrowserPool] Submitting login form');
      await page.keyboard.press('Enter');

      // Wait for navigation
      await page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 30000
      });

      // Verify login success
      const finalUrl = page.url();
      logger.info(`[BrowserPool] Final URL after login: ${finalUrl}`);

      if (finalUrl.includes("Login.aspx")) {
        const errorMessage = await page.evaluate(() => {
          const errorElements = document.querySelectorAll('.error, .alert, [class*="error"], [class*="alert"]');
          if (errorElements.length > 0) {
            return Array.from(errorElements)
              .map(el => el.textContent?.trim())
              .filter(t => t && t.length > 0)
              .join('; ');
          }
          return null;
        });

        throw new Error(
          `Login failed - still on login page. ${errorMessage ? `Error: ${errorMessage}` : 'Possible invalid credentials or Archibald issue.'}`
        );
      }

      logger.info("[BrowserPool] Login successful");

      // Close the login page - context remains open for operation
      await page.close();

    } catch (loginError) {
      logger.error('[BrowserPool] Login failed', {
        error: loginError instanceof Error ? loginError.message : String(loginError),
        userId,
        username
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
    logger.info('[BrowserPool] Shutting down...');

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.isInitialized = false;
    this.initializationPromise = null;

    logger.info('[BrowserPool] Shutdown complete');
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
