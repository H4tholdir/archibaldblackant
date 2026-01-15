import puppeteer, { type Browser, type BrowserContext, type Page } from 'puppeteer';
import { logger } from './logger';
import { SessionCacheManager } from './session-cache-manager';
import { config } from './config';
import { PasswordCache } from './password-cache';
import { UserDatabase } from './user-db';

/**
 * Browser Pool Manager - Multi-User Architecture
 * Manages per-user BrowserContexts with complete session isolation
 *
 * Architecture:
 * - One shared Browser instance
 * - Map<userId, BrowserContext> for per-user contexts
 * - SessionCacheManager for per-user cookie persistence
 * - 5x more memory efficient than separate Browsers (300MB vs 1.5GB for 10 users)
 */
export class BrowserPool {
  private static instance: BrowserPool;
  private browser: Browser | null = null;
  private userContexts: Map<string, BrowserContext> = new Map();
  private sessionCache: SessionCacheManager;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    this.sessionCache = SessionCacheManager.getInstance();
  }

  static getInstance(): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool();
    }
    return BrowserPool.instance;
  }

  /**
   * Initialize shared Browser instance
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      logger.info('Initializing BrowserPool with multi-user support');

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
      logger.info('Browser launched for multi-user contexts');
    })();

    return this.initializationPromise;
  }

  /**
   * Acquire BrowserContext for userId
   * Reuses existing context if available, creates new if not
   */
  async acquireContext(userId: string): Promise<BrowserContext> {
    await this.initialize();

    // Return existing context if available and still valid
    if (this.userContexts.has(userId)) {
      const context = this.userContexts.get(userId)!;

      // Verify context is still valid by checking if browser is connected
      try {
        // Try to get pages - if context is closed, this will throw
        const pages = await context.pages();
        // Also check if at least one page is not closed
        const hasValidPage = pages.some(p => !p.isClosed());
        if (hasValidPage) {
          logger.debug(`Reusing context for user ${userId} (${pages.length} pages active)`);
          return context;
        } else {
          logger.warn(`Context for user ${userId} has no valid pages, recreating`);
          this.userContexts.delete(userId);
        }
      } catch (error) {
        // Context is no longer valid, remove it and create a new one
        logger.warn(`Context for user ${userId} is no longer valid, creating new one`, {
          error: error instanceof Error ? error.message : String(error)
        });
        this.userContexts.delete(userId);
      }
    }

    // Verify browser is still connected before creating context
    if (!this.browser || !this.browser.isConnected()) {
      logger.warn('Browser disconnected, reinitializing...');
      this.isInitialized = false;
      this.initializationPromise = null;
      await this.initialize();
    }

    // Create new context for user
    logger.info(`Creating new BrowserContext for user ${userId}`);
    const context = await this.browser!.createBrowserContext();

    // Try to load cached cookies
    const cookies = await this.sessionCache.loadSession(userId);
    if (cookies && cookies.length > 0) {
      const page = await context.newPage();
      // Set viewport to match Archibald UI requirements
      await page.setViewport({ width: 1280, height: 800 });
      // Type cast needed due to puppeteer/devtools-protocol version mismatch
      await page.setCookie(...(cookies as any));
      await page.close();
      logger.info(`Restored cached session for user ${userId}`);
    }

    // Ensure user is logged in to Archibald
    await this.ensureLoggedIn(context, userId);

    this.userContexts.set(userId, context);
    return context;
  }

  /**
   * Release user's context after operation
   * If success, keep context for reuse; if failure, close it
   */
  async releaseContext(
    userId: string,
    context: BrowserContext,
    success: boolean
  ): Promise<void> {
    if (!success) {
      logger.warn(`Closing context for user ${userId} after error`);
      await this.closeUserContext(userId);
      return;
    }

    // Save cookies for future reuse
    try {
      const pages = await context.pages();
      if (pages.length > 0) {
        const cookies = await pages[0].cookies();
        // Type cast needed due to puppeteer/devtools-protocol version mismatch
        await this.sessionCache.saveSession(userId, cookies as any);
      }
    } catch (error) {
      logger.error(`Error saving cookies for user ${userId}`, { error });
    }

    // Keep context in pool for reuse
    logger.debug(`Context released for user ${userId}, keeping for reuse`);
  }

  /**
   * Ensure context is logged in to Archibald
   * Reuses session if available, performs login if needed
   * Called once when context is created
   */
  private async ensureLoggedIn(context: BrowserContext, userId: string): Promise<void> {
    logger.info(`[BrowserPool] Ensuring login for user ${userId}`);

    // Get user credentials from PasswordCache
    const cachedPassword = PasswordCache.getInstance().get(userId);
    if (!cachedPassword) {
      throw new Error(
        `Password not found in cache for user ${userId}. User must login again.`,
      );
    }

    // Get username from UserDatabase
    const user = UserDatabase.getInstance().getUserById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found in database`);
    }

    const username = user.username;
    logger.info(`[BrowserPool] Using credentials for user ${username}`);

    // Create temporary page to check/perform login
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
      // Navigate to a page to check if we're already logged in
      try {
        await page.goto(`${config.archibald.url}/Default.aspx`, {
          waitUntil: "domcontentloaded", // Less strict than networkidle2
          timeout: 20000, // Increased from 15s
        });

        const currentUrl = page.url();
        logger.info(`[BrowserPool] Current URL after navigation: ${currentUrl}`);

        if (!currentUrl.includes("Login.aspx")) {
          logger.info("[BrowserPool] Already logged in, session valid");
          await page.close();
          return;
        }
      } catch (error) {
        logger.warn("[BrowserPool] Error checking login status, will attempt login", {
          error: error instanceof Error ? error.message : String(error)
        });
      }

      // Need to login
      logger.info("[BrowserPool] Performing login");

      const loginUrl = `${config.archibald.url}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;

      await page.goto(loginUrl, {
        waitUntil: "domcontentloaded", // Less strict, more reliable
        timeout: 60000, // Increased to 60s for slow connections
      });

      logger.info('[BrowserPool] Login page loaded, waiting for form...');
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Find and fill username field
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

      // Find password field
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

      // Clear and type credentials (fields might be pre-filled by browser)
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

      // Submit form by pressing Enter (more reliable than clicking button)
      logger.info('[BrowserPool] Submitting login form with Enter key');
      await page.keyboard.press('Enter');

      logger.info('[BrowserPool] Form submitted, waiting for navigation...');

      try {
        await page.waitForNavigation({
          waitUntil: "domcontentloaded", // Less strict for reliability
          timeout: 60000 // Increased to 60s for slow Archibald responses
        });
        logger.info('[BrowserPool] Navigation completed after login');
      } catch (navError) {
        logger.error('[BrowserPool] Navigation timeout or error after login', {
          error: navError instanceof Error ? navError.message : String(navError),
          currentUrl: page.url()
        });
        throw new Error(`Login navigation failed: ${navError instanceof Error ? navError.message : String(navError)}`);
      }

      // Verify login success
      const finalUrl = page.url();
      logger.info(`[BrowserPool] Final URL after login: ${finalUrl}`);

      if (finalUrl.includes("Login.aspx")) {
        // Check for error message on page to give better feedback
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
    } catch (loginError) {
      logger.error('[BrowserPool] Error during login process', {
        error: loginError instanceof Error ? loginError.message : String(loginError),
        stack: loginError instanceof Error ? loginError.stack : undefined
      });
      throw loginError;
    } finally {
      // Close the temporary page if still open
      try {
        if (!page.isClosed()) {
          logger.info('[BrowserPool] Closing temporary login page');
          await page.close();
          logger.info('[BrowserPool] Temporary login page closed');
        } else {
          logger.info('[BrowserPool] Temporary login page already closed');
        }
      } catch (closeError) {
        logger.warn('[BrowserPool] Error closing temporary page (may already be closed)', {
          error: closeError instanceof Error ? closeError.message : String(closeError)
        });
      }
    }
  }

  /**
   * Close user's context (on logout)
   */
  async closeUserContext(userId: string): Promise<void> {
    const context = this.userContexts.get(userId);
    if (context) {
      // Remove from map FIRST to prevent race condition with acquireContext
      this.userContexts.delete(userId);
      this.sessionCache.clearSession(userId);
      // Then close the context
      await context.close();
      logger.info(`Context closed and session cleared for user ${userId}`);

      // CRITICAL: If this was the last context, reinitialize browser to prevent zombie state
      if (this.userContexts.size === 0 && this.browser) {
        logger.warn('Last BrowserContext closed, reinitializing Browser to prevent corruption');
        await this.browser.close().catch(err => {
          logger.error('Error closing browser during reinitialization', { error: err });
        });
        this.browser = null;
        this.isInitialized = false;
        this.initializationPromise = null;
      }
    }
  }

  /**
   * Shutdown: close all contexts and browser
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down BrowserPool...');

    for (const [userId, context] of this.userContexts) {
      await context.close();
      logger.debug(`Closed context for user ${userId}`);
    }

    this.userContexts.clear();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.isInitialized = false;
    this.initializationPromise = null;

    logger.info('BrowserPool shutdown complete');
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      activeContexts: this.userContexts.size,
      browserRunning: this.browser !== null,
    };
  }
}
