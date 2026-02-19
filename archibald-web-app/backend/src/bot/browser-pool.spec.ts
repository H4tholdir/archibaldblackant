import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createBrowserPool } from './browser-pool';
import type { BrowserPoolConfig } from './browser-pool';

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

function createMockContext(page?: ReturnType<typeof createMockPage>) {
  const mockPage = page ?? createMockPage([
    { name: '.ASPXAUTH', expires: Date.now() / 1000 + 3600 },
    { name: 'ASP.NET_SessionId', expires: 0 },
  ]);
  return {
    newPage: vi.fn().mockResolvedValue(mockPage),
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
    const pool = createBrowserPool(defaultConfig, launchFn);
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
});
