import { totalmem } from 'os';
import { logger } from '../logger';

type BrowserLike = {
  createBrowserContext: () => Promise<BrowserContextLike>;
  browserContexts?: () => BrowserContextLike[];
  process: () => { pid: number } | null;
  isConnected: () => boolean;
  close: () => Promise<void>;
  on: (event: string, handler: () => void) => void;
};

type BrowserContextLike = {
  newPage: () => Promise<PageLike>;
  pages: () => Promise<PageLike[]>;
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

type LoginFn = (context: BrowserContextLike, userId: string) => Promise<void>;

type BrowserPoolConfig = {
  maxBrowsers: number;
  maxContextsPerBrowser: number;
  contextExpiryMs: number;
  serviceAccountContextExpiryMs?: number;
  launchOptions: Record<string, unknown>;
  sessionValidationUrl: string;
  loginFn?: LoginFn;
  writeSlots?: number;   // default: env BROWSER_POOL_WRITE_SLOTS ?? 8
  syncSlots?: number;    // default: env BROWSER_POOL_SYNC_SLOTS ?? 25
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
  activeWriteSlots: number;
  activeSyncSlots: number;
  writeSlots: number;
  syncSlots: number;
};

function isServiceUser(userId: string): boolean {
  return userId === 'service-account' || userId.endsWith('-service') || userId === 'sync-orchestrator';
}

function createBrowserPool(poolConfig: BrowserPoolConfig, launchFn: LaunchFn) {
  const WRITE_SLOTS = poolConfig.writeSlots ?? parseInt(process.env.BROWSER_POOL_WRITE_SLOTS ?? '8', 10);
  const SYNC_SLOTS = poolConfig.syncSlots ?? parseInt(process.env.BROWSER_POOL_SYNC_SLOTS ?? '25', 10);
  const warmWindowMs = parseInt(process.env.BROWSER_POOL_WARM_WINDOW_MS ?? '90000', 10);

  let activeWriteSlots = 0;
  let activeSyncSlots = 0;

  // Tracks how many times each userId has acquired a slot (acquired but not yet released).
  // A Map<string, number> is used instead of Set<string> to correctly handle multiple
  // concurrent acquisitions by the same userId (warm window reuse + cached reuse), where
  // each acquisition increments the counter and each release decrements it. Only when the
  // count reaches 0 is the entry removed. Used by forceReleaseByUserId to avoid
  // decrementing slots that were already released via the normal releaseContext path.
  const slotHolders = new Map<string, number>();

  const browsers: Array<BrowserLike | null> = [];
  const contextPool = new Map<string, CachedContext>();
  const browserContextCounts: number[] = [];
  const userLocks = new Map<string, Promise<BrowserContextLike>>();
  const warmWindowMutex = new Map<string, { resolve: () => void; timer: NodeJS.Timeout }>();

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

    // Best-effort reaping of orphan contexts from previous process runs
    try {
      for (const browser of browsers) {
        if (!browser) continue;
        const contexts = browser.browserContexts?.() ?? [];
        for (const ctx of contexts) {
          await ctx.close().catch(() => {});
        }
      }
      logger.info('[BrowserPool] Startup reaping: closed orphan contexts');
    } catch {
      logger.warn('[BrowserPool] Startup reaping failed — orphan contexts may persist');
    }
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

  async function forceReleaseByUserId(userId: string, priority = 500): Promise<void> {
    // Guard: if releaseContext already ran (normal completion path), slotHolders no longer
    // has an entry for this userId — the warm window and slot are already correctly managed.
    // Return early to avoid destroying the warm window for the next task and to suppress
    // spurious "Force-released context for preemption" log noise on every normal drain.
    if (!slotHolders.has(userId)) {
      return;
    }

    // Genuine preemption case: the handler was interrupted before releaseContext ran.
    // Cancel warm window if one is pending for this user.
    const warmEntry = warmWindowMutex.get(userId);
    if (warmEntry) {
      clearTimeout(warmEntry.timer);
      warmEntry.resolve();
      warmWindowMutex.delete(userId);
    }

    // Close and evict the context from the pool.
    await removeContextFromPool(userId);

    // Decrement the correct slot.
    slotHolders.delete(userId);
    const isSync = priority >= 500;
    if (isSync) {
      activeSyncSlots = Math.max(0, activeSyncSlots - 1);
    } else {
      activeWriteSlots = Math.max(0, activeWriteSlots - 1);
    }

    logger.info('[BrowserPool] Force-released context for preemption', { userId, priority });
  }

  async function removeContextFromPool(userId: string): Promise<void> {
    const cached = contextPool.get(userId);
    if (!cached) return;

    // Evict from pool immediately so no new operations use this context
    browserContextCounts[cached.browserIndex] = Math.max(
      0,
      browserContextCounts[cached.browserIndex] - 1,
    );
    contextPool.delete(userId);

    // Only close the context if no other pages are open (e.g. an interactive session
    // may still have its page alive — closing the context would kill it too).
    let hasOpenPages = false;
    try {
      const pages = await cached.context.pages();
      hasOpenPages = pages.some((p) => !p.isClosed());
    } catch {}

    if (!hasOpenPages) {
      try { await cached.context.close(); } catch {}
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
    options?: { fromQueue?: boolean; forceLogin?: boolean; priority?: number },
  ): Promise<BrowserContextLike> {
    if (!options?.fromQueue) {
      console.warn(
        `[BrowserPool] acquireContext called without fromQueue for user ${userId}. This operation may not be using the unified queue.`,
      );
    }

    const priority = options?.priority ?? 500;
    const isSync = priority >= 500;

    // Memory guard: refuse new SYNC contexts under memory pressure to avoid OOM
    const rss = process.memoryUsage().rss;
    const total = totalmem();
    if (rss / total > 0.75 && isSync) {
      logger.warn('[BrowserPool] Memory pressure: RSS > 75%, skipping new SYNC context', {
        rssMb: Math.round(rss / 1024 / 1024),
        totalMb: Math.round(total / 1024 / 1024),
      });
      throw new Error(`[BrowserPool] Memory pressure: refusing new SYNC context`);
    }

    // Slot reservation check
    if (isSync && activeSyncSlots >= SYNC_SLOTS) {
      throw new Error(`[BrowserPool] SYNC_SLOTS exhausted (${activeSyncSlots}/${SYNC_SLOTS}) for user ${userId}`);
    }
    if (!isSync && activeWriteSlots >= WRITE_SLOTS) {
      throw new Error(`[BrowserPool] WRITE_SLOTS exhausted (${activeWriteSlots}/${WRITE_SLOTS}) for user ${userId}`);
    }

    if (options?.forceLogin) {
      await removeContextFromPool(userId);
    }

    // Warm window short-circuit: reuse the context kept warm after the previous release
    const warmEntry = warmWindowMutex.get(userId);
    if (warmEntry && !options?.forceLogin) {
      clearTimeout(warmEntry.timer);
      warmEntry.resolve();
      warmWindowMutex.delete(userId);
      const warmCtx = contextPool.get(userId);
      if (warmCtx) {
        warmCtx.lastUsedAt = Date.now();
        const stalePages = await warmCtx.context.pages();
        await Promise.all(stalePages.map(p => p.close().catch(() => {})));
        if (isSync) { activeSyncSlots++; } else { activeWriteSlots++; }
        slotHolders.set(userId, (slotHolders.get(userId) ?? 0) + 1);
        return warmCtx.context;
      }
      // Context was evicted while warm window was active — fall through to normal login
    }

    const existingLock = userLocks.get(userId);
    if (existingLock) {
      try { await existingLock; } catch {}
    }

    const cached = contextPool.get(userId);
    if (cached) {
      const age = Date.now() - cached.createdAt;
      const expiryMs = poolConfig.serviceAccountContextExpiryMs !== undefined && isServiceUser(userId)
        ? poolConfig.serviceAccountContextExpiryMs
        : poolConfig.contextExpiryMs;
      if (age < expiryMs) {
        const isValid = await validateSession(cached.context);
        if (isValid) {
          cached.lastUsedAt = Date.now();
          if (isSync) { activeSyncSlots++; } else { activeWriteSlots++; }
          slotHolders.set(userId, (slotHolders.get(userId) ?? 0) + 1);
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

        if (poolConfig.loginFn) {
          await poolConfig.loginFn(context, userId);
        }

        contextPool.set(userId, {
          context,
          userId,
          browserIndex,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
        });

        if (isSync) { activeSyncSlots++; } else { activeWriteSlots++; }
        slotHolders.set(userId, (slotHolders.get(userId) ?? 0) + 1);
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
    priority?: number,
  ): Promise<void> {
    const currentCount = slotHolders.get(userId) ?? 0;
    if (currentCount > 1) {
      slotHolders.set(userId, currentCount - 1);
    } else {
      slotHolders.delete(userId);
    }
    const isSync = (priority ?? 500) >= 500;
    if (currentCount > 0) {
      if (isSync) { activeSyncSlots = Math.max(0, activeSyncSlots - 1); }
      else { activeWriteSlots = Math.max(0, activeWriteSlots - 1); }
    }

    if (!success) {
      // Close open pages before evicting — the login page (and any other pages) left
      // open by a failed task keep the Chromium renderer process alive and consuming
      // CPU. removeContextFromPool skips close when hasOpenPages=true (to protect
      // interactive sessions), so we close them explicitly first.
      const failedCached = contextPool.get(userId);
      if (failedCached) {
        const openPages = await failedCached.context.pages();
        await Promise.all(openPages.map(p => p.close().catch(() => {})));
      }
      await removeContextFromPool(userId);
    } else {
      const cached = contextPool.get(userId);
      if (cached) {
        cached.lastUsedAt = Date.now();
        const openPages = await cached.context.pages();
        await Promise.all(openPages.map(p => p.close().catch(() => {})));
      }

      // Best-effort warm window: keep context alive for 90s so the next task for this
      // user can skip re-login. Errors here must never surface to the caller.
      try {
        // Cancel any prior warm window for this user before starting a new one
        const existing = warmWindowMutex.get(userId);
        if (existing) {
          clearTimeout(existing.timer);
          existing.resolve();
          warmWindowMutex.delete(userId);
        }

        if (contextPool.has(userId)) {
          let resolveWarm!: () => void;
          const warmPromise = new Promise<void>((res) => { resolveWarm = res; });
          void warmPromise; // prevent unhandled-promise lint

          const timer = setTimeout(() => {
            warmWindowMutex.delete(userId);
            resolveWarm();
            removeContextFromPool(userId).catch(() => {});
          }, warmWindowMs);

          warmWindowMutex.set(userId, { resolve: resolveWarm, timer });
        }
      } catch (err) {
        logger.warn('[BrowserPool] Warm window setup failed — context will expire via TTL', { userId, err });
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
      activeWriteSlots,
      activeSyncSlots,
      writeSlots: WRITE_SLOTS,
      syncSlots: SYNC_SLOTS,
    };
  }

  async function shutdown(): Promise<void> {
    // Cancel all warm windows before closing contexts to avoid post-shutdown timer callbacks
    for (const [, entry] of warmWindowMutex.entries()) {
      clearTimeout(entry.timer);
      entry.resolve();
    }
    warmWindowMutex.clear();

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

  // Periodic browser restart to prevent Chromium V8/renderer degradation.
  // After ~30 min of ERP scraping, ctx.newPage() slows from <200ms to 30s+.
  // We restart each browser individually when it has no active contexts.
  const RESTART_INTERVAL_MS = 25 * 60_000; // 25 min
  let restartTimers: NodeJS.Timeout[] = [];

  function schedulePeriodicRestart(): void {
    for (let i = 0; i < poolConfig.maxBrowsers; i++) {
      // Stagger restarts so not all browsers restart simultaneously
      const delay = RESTART_INTERVAL_MS + i * 5 * 60_000;
      const timer = setTimeout(function restartBrowser() {
        const hasActiveContexts = Array.from(contextPool.values()).some(c => c.browserIndex === i);
        if (hasActiveContexts) {
          logger.debug('[BrowserPool] Scheduled restart deferred — browser %d has active contexts', i);
          restartTimers[i] = setTimeout(restartBrowser, 60_000); // retry in 1 min
          return;
        }
        const oldBrowser = browsers[i];
        if (oldBrowser) {
          oldBrowser.close().catch(() => {});
        }
        logger.info('[BrowserPool] Scheduled restart of browser %d (anti-degradation)', i);
        launchBrowser(i).catch(err => logger.error('[BrowserPool] Restart failed browser %d', i, { err }));
        restartTimers[i] = setTimeout(restartBrowser, RESTART_INTERVAL_MS);
      }, delay);
      restartTimers.push(timer);
    }
  }

  const originalShutdown = shutdown;
  async function shutdownWithCleanup(): Promise<void> {
    restartTimers.forEach(t => clearTimeout(t));
    restartTimers = [];
    await originalShutdown();
  }

  return { initialize: async () => { await initialize(); schedulePeriodicRestart(); }, acquireContext, releaseContext, forceReleaseByUserId, getStats, shutdown: shutdownWithCleanup };
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
