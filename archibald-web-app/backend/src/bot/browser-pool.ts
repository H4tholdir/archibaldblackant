type BrowserLike = {
  createBrowserContext: () => Promise<BrowserContextLike>;
  process: () => { pid: number } | null;
  isConnected: () => boolean;
  close: () => Promise<void>;
  on: (event: string, handler: () => void) => void;
};

type BrowserContextLike = {
  newPage: () => Promise<PageLike>;
  close: () => Promise<void>;
};

type PageLike = {
  setViewport: (viewport: { width: number; height: number }) => Promise<void>;
  goto: (url: string, options?: Record<string, unknown>) => Promise<void>;
  waitForSelector: (selector: string, options?: Record<string, unknown>) => Promise<void>;
  waitForNavigation: (options?: Record<string, unknown>) => Promise<void>;
  evaluate: (...args: unknown[]) => Promise<unknown>;
  keyboard: { press: (key: string) => Promise<void> };
  url: () => string;
  cookies: (url: string) => Promise<Array<{ name: string; expires: number }>>;
  close: () => Promise<void>;
  isClosed: () => boolean;
};

type LaunchFn = (options?: Record<string, unknown>) => Promise<BrowserLike>;

type BrowserPoolConfig = {
  maxBrowsers: number;
  maxContextsPerBrowser: number;
  contextExpiryMs: number;
  launchOptions: Record<string, unknown>;
  sessionValidationUrl: string;
};

type CachedContext = {
  context: BrowserContextLike;
  userId: string;
  browserIndex: number;
  createdAt: number;
  lastUsedAt: number;
};

type BrowserPoolStats = {
  browsers: number;
  activeContexts: number;
  maxContexts: number;
  cachedContexts: Array<{ userId: string; age: number; lastUsed: number }>;
};

function createBrowserPool(poolConfig: BrowserPoolConfig, launchFn: LaunchFn) {
  const browsers: Array<BrowserLike | null> = [];
  const contextPool = new Map<string, CachedContext>();
  const browserContextCounts: number[] = [];
  const userLocks = new Map<string, Promise<BrowserContextLike>>();

  async function launchBrowser(index: number): Promise<void> {
    const browser = await launchFn(poolConfig.launchOptions);
    browsers[index] = browser;
    browserContextCounts[index] = 0;

    browser.on('disconnected', () => {
      browsers[index] = null;
      browserContextCounts[index] = 0;

      for (const [userId, cached] of contextPool.entries()) {
        if (cached.browserIndex === index) {
          contextPool.delete(userId);
        }
      }

      launchBrowser(index).catch(() => {});
    });
  }

  async function initialize(): Promise<void> {
    const launches: Promise<void>[] = [];
    for (let i = 0; i < poolConfig.maxBrowsers; i++) {
      launches.push(launchBrowser(i));
    }
    await Promise.all(launches);
  }

  function getBrowserWithFewestContexts(): number {
    let minIndex = 0;
    let minCount = Infinity;
    for (let i = 0; i < browsers.length; i++) {
      if (browsers[i] && browserContextCounts[i] < minCount) {
        minCount = browserContextCounts[i];
        minIndex = i;
      }
    }
    return minIndex;
  }

  function getTotalMaxContexts(): number {
    return poolConfig.maxBrowsers * poolConfig.maxContextsPerBrowser;
  }

  async function evictLeastRecentlyUsed(): Promise<void> {
    let lruUserId: string | null = null;
    let lruTimestamp = Infinity;

    for (const [userId, cached] of contextPool.entries()) {
      if (cached.lastUsedAt < lruTimestamp) {
        lruTimestamp = cached.lastUsedAt;
        lruUserId = userId;
      }
    }

    if (lruUserId) {
      await removeContextFromPool(lruUserId);
    }
  }

  async function removeContextFromPool(userId: string): Promise<void> {
    const cached = contextPool.get(userId);
    if (cached) {
      try {
        await cached.context.close();
      } catch {}
      browserContextCounts[cached.browserIndex] = Math.max(
        0,
        browserContextCounts[cached.browserIndex] - 1,
      );
      contextPool.delete(userId);
    }
  }

  async function validateSession(context: BrowserContextLike): Promise<boolean> {
    let page: PageLike | null = null;
    try {
      page = await context.newPage();
      const cookies = await page.cookies(poolConfig.sessionValidationUrl);
      await page.close();
      page = null;

      const sessionCookies = cookies.filter(
        (c) =>
          c.name === '.ASPXAUTH' ||
          c.name === 'ASP.NET_SessionId' ||
          c.name.startsWith('.AspNet'),
      );

      if (sessionCookies.length === 0) return false;

      const now = Date.now() / 1000;
      return !sessionCookies.some((c) => c.expires > 0 && c.expires < now);
    } catch {
      if (page) {
        try { await page.close(); } catch {}
      }
      return false;
    }
  }

  async function acquireContext(
    userId: string,
    options?: { fromQueue?: boolean },
  ): Promise<BrowserContextLike> {
    if (!options?.fromQueue) {
      console.warn(
        `[BrowserPool] acquireContext called without fromQueue for user ${userId}. This operation may not be using the unified queue.`,
      );
    }

    const existingLock = userLocks.get(userId);
    if (existingLock) {
      try { await existingLock; } catch {}
    }

    const cached = contextPool.get(userId);
    if (cached) {
      const age = Date.now() - cached.createdAt;
      if (age < poolConfig.contextExpiryMs) {
        const isValid = await validateSession(cached.context);
        if (isValid) {
          cached.lastUsedAt = Date.now();
          return cached.context;
        }
        await removeContextFromPool(userId);
      } else {
        await removeContextFromPool(userId);
      }
    }

    const loginPromise = (async () => {
      try {
        if (contextPool.size >= getTotalMaxContexts()) {
          await evictLeastRecentlyUsed();
        }

        const browserIndex = getBrowserWithFewestContexts();
        const browser = browsers[browserIndex];
        if (!browser) {
          throw new Error(`Browser at index ${browserIndex} is not available`);
        }

        const context = await browser.createBrowserContext();
        browserContextCounts[browserIndex]++;

        contextPool.set(userId, {
          context,
          userId,
          browserIndex,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
        });

        return context;
      } finally {
        userLocks.delete(userId);
      }
    })();

    userLocks.set(userId, loginPromise);
    return loginPromise;
  }

  async function releaseContext(
    userId: string,
    _context: BrowserContextLike,
    success: boolean,
  ): Promise<void> {
    if (!success) {
      await removeContextFromPool(userId);
    } else {
      const cached = contextPool.get(userId);
      if (cached) {
        cached.lastUsedAt = Date.now();
      }
    }
  }

  function getStats(): BrowserPoolStats {
    const cachedContexts = Array.from(contextPool.entries()).map(
      ([userId, cached]) => ({
        userId,
        age: Math.round((Date.now() - cached.createdAt) / 1000),
        lastUsed: Math.round((Date.now() - cached.lastUsedAt) / 1000),
      }),
    );

    return {
      browsers: browsers.filter((b) => b !== null).length,
      activeContexts: contextPool.size,
      maxContexts: getTotalMaxContexts(),
      cachedContexts,
    };
  }

  async function shutdown(): Promise<void> {
    for (const [userId] of contextPool.entries()) {
      await removeContextFromPool(userId);
    }

    for (const browser of browsers) {
      if (browser) {
        try { await browser.close(); } catch {}
      }
    }
    browsers.length = 0;
    browserContextCounts.length = 0;
  }

  return { initialize, acquireContext, releaseContext, getStats, shutdown };
}

type BrowserPool = ReturnType<typeof createBrowserPool>;

export {
  createBrowserPool,
  type BrowserPool,
  type BrowserPoolConfig,
  type BrowserPoolStats,
  type BrowserLike,
  type BrowserContextLike,
  type PageLike,
  type LaunchFn,
};
