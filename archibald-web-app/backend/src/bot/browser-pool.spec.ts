import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import { createBrowserPool } from './browser-pool';
import type { BrowserPoolConfig } from './browser-pool';

// Mocked so memory-guard tests can control totalmem() return value
vi.mock('os', async (importOriginal) => {
  const original = await importOriginal<typeof import('os')>();
  return { ...original, totalmem: vi.fn(() => original.totalmem()) };
});

function createMockPage(cookies: Array<{ name: string; expires: number }> = []) {
  return {
    setViewport: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForNavigation: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(true),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    url: vi.fn().mockReturnValue('https://archibald.example.com/Archibald/Default.aspx'),
    cookies: vi.fn().mockResolvedValue(cookies),
    close: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
  };
}

function createMockContext(page?: ReturnType<typeof createMockPage>, openPages: ReturnType<typeof createMockPage>[] = []) {
  const mockPage = page ?? createMockPage([
    { name: '.ASPXAUTH', expires: Date.now() / 1000 + 3600 },
    { name: 'ASP.NET_SessionId', expires: 0 },
  ]);
  return {
    newPage: vi.fn().mockResolvedValue(mockPage),
    pages: vi.fn().mockResolvedValue(openPages),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockBrowser(contextFactory?: () => ReturnType<typeof createMockContext>) {
  const disconnectHandlers: Array<() => void> = [];
  return {
    createBrowserContext: vi.fn().mockImplementation(() =>
      Promise.resolve(contextFactory ? contextFactory() : createMockContext()),
    ),
    process: vi.fn().mockReturnValue({ pid: 12345 }),
    isConnected: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockImplementation((event: string, handler: () => void) => {
      if (event === 'disconnected') disconnectHandlers.push(handler);
    }),
    _triggerDisconnect: () => disconnectHandlers.forEach((h) => h()),
  };
}

const defaultConfig: BrowserPoolConfig = {
  maxBrowsers: 2,
  maxContextsPerBrowser: 3,
  contextExpiryMs: 60 * 60 * 1000,
  launchOptions: {},
  sessionValidationUrl: 'https://archibald.example.com/Archibald',
};

describe('createBrowserPool', () => {
  let launchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    launchFn = vi.fn().mockImplementation(() => Promise.resolve(createMockBrowser()));
  });

  test('creates N browser processes on initialize', async () => {
    const pool = createBrowserPool(defaultConfig, launchFn);
    await pool.initialize();

    expect(launchFn).toHaveBeenCalledTimes(2);
  });

  test('acquireContext returns a context for a user', async () => {
    const pool = createBrowserPool(defaultConfig, launchFn);
    await pool.initialize();

    const context = await pool.acquireContext('user-a', { fromQueue: true });
    expect(context).toBeDefined();
    expect(context.newPage).toBeDefined();
  });

  test('acquireContext reuses cached context for same user', async () => {
    const mockCtx = createMockContext();
    const browser = createMockBrowser(() => mockCtx);
    launchFn.mockResolvedValue(browser);

    const pool = createBrowserPool(defaultConfig, launchFn);
    await pool.initialize();

    const ctx1 = await pool.acquireContext('user-a', { fromQueue: true });
    const ctx2 = await pool.acquireContext('user-a', { fromQueue: true });

    expect(ctx1).toBe(ctx2);
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(1);
  });

  test('assigns new context to browser with fewest active contexts', async () => {
    const browser1 = createMockBrowser();
    const browser2 = createMockBrowser();
    let callCount = 0;
    launchFn.mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? browser1 : browser2);
    });

    const pool = createBrowserPool(defaultConfig, launchFn);
    await pool.initialize();

    await pool.acquireContext('user-a', { fromQueue: true });
    await pool.acquireContext('user-b', { fromQueue: true });

    // Each browser should have one context (round-robin on fewest)
    expect(browser1.createBrowserContext).toHaveBeenCalledTimes(1);
    expect(browser2.createBrowserContext).toHaveBeenCalledTimes(1);
  });

  test('releaseContext keeps context in pool on success', async () => {
    const pool = createBrowserPool(defaultConfig, launchFn);
    await pool.initialize();

    const ctx = await pool.acquireContext('user-a', { fromQueue: true });
    await pool.releaseContext('user-a', ctx, true);

    // Can still reuse the cached context
    const ctx2 = await pool.acquireContext('user-a', { fromQueue: true });
    expect(ctx2).toBe(ctx);
  });

  test('releaseContext removes context from pool on failure', async () => {
    const mockCtx = createMockContext();
    const browser = createMockBrowser(() => mockCtx);
    launchFn.mockResolvedValue(browser);

    const pool = createBrowserPool(defaultConfig, launchFn);
    await pool.initialize();

    const ctx = await pool.acquireContext('user-a', { fromQueue: true });
    await pool.releaseContext('user-a', ctx, false);

    // Next acquire should create a new context
    const ctx2 = await pool.acquireContext('user-a', { fromQueue: true });
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(2);
  });

  test('releaseContext does not close context when interactive pages are still open', async () => {
    const openPage = createMockPage();
    openPage.isClosed.mockReturnValue(false);
    const mockCtx = createMockContext(undefined, [openPage]);
    const browser = createMockBrowser(() => mockCtx);
    launchFn.mockResolvedValue(browser);

    const pool = createBrowserPool(defaultConfig, launchFn);
    await pool.initialize();

    const ctx = await pool.acquireContext('user-a', { fromQueue: true });
    // Simulate a sync bot failing while an interactive session has an open page
    await pool.releaseContext('user-a', ctx, false);

    // Context should be evicted from pool (a new one is created on re-acquire)
    const ctx2 = await pool.acquireContext('user-a', { fromQueue: true });
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(2);

    // But the original context must NOT be closed (the open page would be killed)
    expect(mockCtx.close).not.toHaveBeenCalled();
  });

  test('evicts LRU context when pool is full', async () => {
    const config: BrowserPoolConfig = {
      ...defaultConfig,
      maxBrowsers: 1,
      maxContextsPerBrowser: 2,
    };

    const pool = createBrowserPool(config, launchFn);
    await pool.initialize();

    await pool.acquireContext('user-a', { fromQueue: true });
    await pool.acquireContext('user-b', { fromQueue: true });

    // Pool is full (2/2), acquiring for user-c should evict LRU
    await pool.acquireContext('user-c', { fromQueue: true });

    const stats = pool.getStats();
    expect(stats.activeContexts).toBe(2);
  });

  test('forceLogin: true discards cached context and creates a new one', async () => {
    const mockCtx = createMockContext();
    const browser = createMockBrowser(() => mockCtx);
    launchFn.mockResolvedValue(browser);

    const pool = createBrowserPool(defaultConfig, launchFn);
    await pool.initialize();

    const ctx1 = await pool.acquireContext('user-a', { fromQueue: true });
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(1);

    // Same password reuse would return cached ctx; forceLogin must bypass it
    const ctx2 = await pool.acquireContext('user-a', { fromQueue: true, forceLogin: true });
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(2);
    expect(ctx1.close).toHaveBeenCalled();
  });

  test('logs WARNING when fromQueue is false', async () => {
    const pool = createBrowserPool(defaultConfig, launchFn);
    await pool.initialize();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await pool.acquireContext('user-a');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('acquireContext called without fromQueue'),
    );
    warnSpy.mockRestore();
  });

  test('crash recovery: replaces disconnected browser', async () => {
    const browsers: ReturnType<typeof createMockBrowser>[] = [];
    launchFn.mockImplementation(() => {
      const b = createMockBrowser();
      browsers.push(b);
      return Promise.resolve(b);
    });

    const pool = createBrowserPool(defaultConfig, launchFn);
    await pool.initialize();

    expect(launchFn).toHaveBeenCalledTimes(2);

    // Simulate browser 0 crash
    browsers[0]._triggerDisconnect();

    // Wait for async replacement
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(launchFn).toHaveBeenCalledTimes(3);
  });

  test('getStats returns browser count and context info', async () => {
    const configWithExplicitSlots: BrowserPoolConfig = {
      ...defaultConfig,
      writeSlots: 8,
      syncSlots: 25,
    };
    const pool = createBrowserPool(configWithExplicitSlots, launchFn);
    await pool.initialize();

    await pool.acquireContext('user-a', { fromQueue: true });

    const stats = pool.getStats();
    expect(stats).toEqual({
      browsers: 2,
      activeContexts: 1,
      maxContexts: 6,
      cachedContexts: expect.arrayContaining([
        expect.objectContaining({ userId: 'user-a' }),
      ]),
      activeWriteSlots: 0,
      activeSyncSlots: 1,
      writeSlots: 8,
      syncSlots: 25,
    });
  });

  test('shutdown closes all contexts and browsers', async () => {
    const browsers: ReturnType<typeof createMockBrowser>[] = [];
    launchFn.mockImplementation(() => {
      const b = createMockBrowser();
      browsers.push(b);
      return Promise.resolve(b);
    });

    const pool = createBrowserPool(defaultConfig, launchFn);
    await pool.initialize();

    await pool.acquireContext('user-a', { fromQueue: true });
    await pool.shutdown();

    expect(browsers[0].close).toHaveBeenCalled();
    expect(browsers[1].close).toHaveBeenCalled();
  });

  describe('service-account context expiry', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    test('service-account context is evicted after serviceAccountContextExpiryMs', async () => {
      const serviceAccountExpiryMs = 15 * 60 * 1000;
      const config: BrowserPoolConfig = {
        ...defaultConfig,
        contextExpiryMs: 30 * 60 * 1000,
        serviceAccountContextExpiryMs: serviceAccountExpiryMs,
      };
      const browser = createMockBrowser();
      launchFn.mockResolvedValue(browser);

      vi.useFakeTimers();
      const pool = createBrowserPool(config, launchFn);
      await pool.initialize();

      await pool.acquireContext('service-account', { fromQueue: true });
      expect(browser.createBrowserContext).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(serviceAccountExpiryMs + 1000);

      await pool.acquireContext('service-account', { fromQueue: true });
      expect(browser.createBrowserContext).toHaveBeenCalledTimes(2);
    });

    test('non-service-account context is NOT evicted after serviceAccountContextExpiryMs', async () => {
      const serviceAccountExpiryMs = 15 * 60 * 1000;
      const config: BrowserPoolConfig = {
        ...defaultConfig,
        contextExpiryMs: 30 * 60 * 1000,
        serviceAccountContextExpiryMs: serviceAccountExpiryMs,
      };
      const mockCtx = createMockContext();
      const browser = createMockBrowser(() => mockCtx);
      launchFn.mockResolvedValue(browser);

      vi.useFakeTimers();
      const pool = createBrowserPool(config, launchFn);
      await pool.initialize();

      const ctx1 = await pool.acquireContext('agent-1', { fromQueue: true });
      expect(browser.createBrowserContext).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(serviceAccountExpiryMs + 1000);

      const ctx2 = await pool.acquireContext('agent-1', { fromQueue: true });
      expect(browser.createBrowserContext).toHaveBeenCalledTimes(1);
      expect(ctx2).toBe(ctx1);
    });
  });

  describe('slot reservation', () => {
    const writeSlots = 2;
    const syncSlots = 3;
    const slotConfig: BrowserPoolConfig = {
      ...defaultConfig,
      writeSlots,
      syncSlots,
    };

    test('acquireContext with priority < 500 consumes a WRITE slot', async () => {
      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      await pool.acquireContext('user-a', { fromQueue: true, priority: 10 });

      const stats = pool.getStats();
      expect(stats.activeWriteSlots).toEqual(1);
      expect(stats.activeSyncSlots).toEqual(0);
    });

    test('acquireContext with priority >= 500 consumes a SYNC slot', async () => {
      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      await pool.acquireContext('user-a', { fromQueue: true, priority: 500 });

      const stats = pool.getStats();
      expect(stats.activeWriteSlots).toEqual(0);
      expect(stats.activeSyncSlots).toEqual(1);
    });

    test('acquireContext without priority defaults to SYNC slot', async () => {
      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      await pool.acquireContext('user-a', { fromQueue: true });

      const stats = pool.getStats();
      expect(stats.activeWriteSlots).toEqual(0);
      expect(stats.activeSyncSlots).toEqual(1);
    });

    test('releaseContext decrements WRITE slot counter', async () => {
      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      const ctx = await pool.acquireContext('user-a', { fromQueue: true, priority: 10 });
      await pool.releaseContext('user-a', ctx, true, 10);

      expect(pool.getStats().activeWriteSlots).toEqual(0);
    });

    test('releaseContext decrements SYNC slot counter', async () => {
      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      const ctx = await pool.acquireContext('user-a', { fromQueue: true, priority: 500 });
      await pool.releaseContext('user-a', ctx, true, 500);

      expect(pool.getStats().activeSyncSlots).toEqual(0);
    });

    test('releaseContext never decrements below 0', async () => {
      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      const ctx = await pool.acquireContext('user-a', { fromQueue: true });
      // Release twice — counter must not go negative
      await pool.releaseContext('user-a', ctx, true, 500);
      await pool.releaseContext('user-a', ctx, true, 500);

      expect(pool.getStats().activeSyncSlots).toEqual(0);
    });

    test('acquireContext throws WRITE_SLOTS exhausted when limit reached', async () => {
      const pool = createBrowserPool({ ...slotConfig, writeSlots: 1 }, launchFn);
      await pool.initialize();

      await pool.acquireContext('user-a', { fromQueue: true, priority: 10 });

      await expect(
        pool.acquireContext('user-b', { fromQueue: true, priority: 10 }),
      ).rejects.toThrow('WRITE_SLOTS exhausted');
    });

    test('acquireContext throws SYNC_SLOTS exhausted when limit reached', async () => {
      const pool = createBrowserPool({ ...slotConfig, syncSlots: 1 }, launchFn);
      await pool.initialize();

      await pool.acquireContext('user-a', { fromQueue: true, priority: 500 });

      await expect(
        pool.acquireContext('user-b', { fromQueue: true, priority: 500 }),
      ).rejects.toThrow('SYNC_SLOTS exhausted');
    });

    test('getStats exposes writeSlots and syncSlots capacity from config', async () => {
      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      const stats = pool.getStats();
      expect(stats.writeSlots).toEqual(writeSlots);
      expect(stats.syncSlots).toEqual(syncSlots);
    });
  });

  describe('forceReleaseByUserId', () => {
    const slotConfig: BrowserPoolConfig = {
      ...defaultConfig,
      writeSlots: 2,
      syncSlots: 3,
    };

    test('evicts context from pool and decrements SYNC slot on preemption (no prior releaseContext)', async () => {
      const mockCtx = createMockContext();
      const browser = createMockBrowser(() => mockCtx);
      launchFn.mockResolvedValue(browser);

      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      await pool.acquireContext('user-a', { fromQueue: true, priority: 500 });
      expect(pool.getStats().activeSyncSlots).toEqual(1);

      await pool.forceReleaseByUserId('user-a', 500);

      expect(pool.getStats().activeSyncSlots).toEqual(0);
      // Next acquire must create a new context (evicted from pool)
      await pool.acquireContext('user-a', { fromQueue: true, priority: 500 });
      expect(browser.createBrowserContext).toHaveBeenCalledTimes(2);
    });

    test('evicts context from pool and decrements WRITE slot on preemption', async () => {
      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      await pool.acquireContext('user-a', { fromQueue: true, priority: 10 });
      expect(pool.getStats().activeWriteSlots).toEqual(1);

      await pool.forceReleaseByUserId('user-a', 10);

      expect(pool.getStats().activeWriteSlots).toEqual(0);
    });

    test('slot counter never goes below 0 when called after releaseContext already decremented it', async () => {
      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      const ctx = await pool.acquireContext('user-a', { fromQueue: true, priority: 500 });
      await pool.releaseContext('user-a', ctx, true, 500);
      // Slot is already 0 — forceRelease must not underflow
      await pool.forceReleaseByUserId('user-a', 500);

      expect(pool.getStats().activeSyncSlots).toEqual(0);
    });

    test('cancels warm window so the context is evicted instead of kept alive for 90s', async () => {
      const mockCtx = createMockContext();
      const browser = createMockBrowser(() => mockCtx);
      launchFn.mockResolvedValue(browser);

      vi.useFakeTimers();
      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      const ctx = await pool.acquireContext('user-a', { fromQueue: true, priority: 500 });
      await pool.releaseContext('user-a', ctx, true, 500);
      // Warm window is now active — forceRelease must cancel it and evict the context
      await pool.forceReleaseByUserId('user-a', 500);

      // Verify: context evicted from pool — next acquire must call createBrowserContext again
      vi.useRealTimers();
      await pool.acquireContext('user-a', { fromQueue: true, priority: 500 });
      expect(browser.createBrowserContext).toHaveBeenCalledTimes(2);
    });

    test('is a no-op for an unknown userId (no context in pool)', async () => {
      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      await expect(pool.forceReleaseByUserId('unknown-user', 500)).resolves.toBeUndefined();
      expect(pool.getStats().activeSyncSlots).toEqual(0);
    });

    test('does not steal a concurrent slot when forceRelease follows a normal releaseContext', async () => {
      // Scenario: user-a and user-b both hold SYNC slots.
      // user-a releases normally via releaseContext → activeSyncSlots goes from 2 to 1.
      // Then Worker's finally calls forceReleaseByUserId for user-a.
      // Without the slotHolders guard this would decrement again → 0, stealing user-b's slot.
      const pool = createBrowserPool(slotConfig, launchFn);
      await pool.initialize();

      const ctxA = await pool.acquireContext('user-a', { fromQueue: true, priority: 500 });
      await pool.acquireContext('user-b', { fromQueue: true, priority: 500 });
      expect(pool.getStats().activeSyncSlots).toEqual(2);

      // Normal release for user-a
      await pool.releaseContext('user-a', ctxA, true, 500);
      expect(pool.getStats().activeSyncSlots).toEqual(1);

      // Safety-net forceRelease for user-a (Worker's finally block) — must be a no-op for slots
      await pool.forceReleaseByUserId('user-a', 500);
      // user-b's slot must still be counted
      expect(pool.getStats().activeSyncSlots).toEqual(1);
    });
  });

  describe('memory guard', () => {
    const totalMemBytes = 8 * 1024 * 1024 * 1024;  // 8 GB total
    const highRssBytes = Math.ceil(totalMemBytes * 0.8); // 80% RSS — above 75% threshold

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('throws for SYNC context when RSS exceeds 75% of total memory', async () => {
      vi.mocked(os.totalmem).mockReturnValue(totalMemBytes);
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: highRssBytes,
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        arrayBuffers: 0,
      });

      const pool = createBrowserPool(defaultConfig, launchFn);
      await pool.initialize();

      await expect(
        pool.acquireContext('user-a', { fromQueue: true, priority: 500 }),
      ).rejects.toThrow('Memory pressure');
    });

    test('does not throw for WRITE context when RSS exceeds 75% of total memory', async () => {
      vi.mocked(os.totalmem).mockReturnValue(totalMemBytes);
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: highRssBytes,
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        arrayBuffers: 0,
      });

      const pool = createBrowserPool(defaultConfig, launchFn);
      await pool.initialize();

      // WRITE tasks (priority < 500) must not be blocked by memory pressure
      const ctx = await pool.acquireContext('user-a', { fromQueue: true, priority: 10 });
      expect(ctx).toBeDefined();
    });
  });
});
