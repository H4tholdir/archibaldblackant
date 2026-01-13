# Multi-User Browser Session Research

**Date**: 2026-01-13
**Purpose**: Evaluate Puppeteer multi-session patterns for Phase 6 Multi-User Authentication
**Puppeteer Version**: 22.0.0

## Research Summary

Researched three architectural approaches for managing browser sessions across multiple users with complete cookie isolation and session persistence.

## Key Findings

### BrowserContext API Capabilities

- **Complete Cookie Isolation**: Each BrowserContext has isolated storage (cookies, localStorage, sessionStorage, cache) independent of other contexts ([Puppeteer BrowserContext](https://pptr.dev/api/puppeteer.browsercontext))
- **Creation Method**: `browser.createBrowserContext()` or `browser.createIncognitoBrowserContext()` creates new isolated contexts
- **Lifecycle**: Contexts persist until explicitly closed with `context.close()`
- **Cookie Management**: Can save/restore cookies per-context using `page.cookies()` and `page.setCookie()`

### Performance Characteristics

- **Context Creation Speed**: ~100ms vs ~3-5s for full Browser launch
- **Memory Efficiency**: BrowserContext shares browser resources - more efficient than separate Browser instances ([Latenode Community](https://community.latenode.com/t/comparing-single-browser-multi-page-execution-with-multiple-browser-instances-in-puppeteer/4794))
- **Memory Management**: Proper cleanup essential - must close unused contexts to prevent leaks ([Puppeteer Memory Leak Journey](https://medium.com/@matveev.dina/the-hidden-cost-of-headless-browsers-a-puppeteer-memory-leak-journey-027e41291367))
- **Scalability**: BrowserContext preferred for production multi-tenant scenarios ([Apify Academy](https://docs.apify.com/academy/puppeteer-playwright/browser-contexts))

### Multi-Tenant Session Management Best Practices

- **Preferred Pattern**: Use multiple BrowserContexts within single Browser instance instead of multiple Browser instances ([WebScraping.AI](https://webscraping.ai/faq/puppeteer-sharp/how-do-i-manage-browser-contexts-in-puppeteer-sharp-for-multi-session-scenarios))
- **Session Persistence**: Save cookies to disk per-user, reload on context creation ([Browserless Blog](https://www.browserless.io/blog/manage-sessions))
- **Security**: Encrypt stored cookies, track expiration dates ([Latenode Blog](https://latenode.com/blog/cookie-management-in-puppeteer-session-preservation-auth-emulation-and-limitations))

## Option A: BrowserContext Pooling (RECOMMENDED)

### Architecture

```
Browser (single instance)
  ├─ BrowserContext (user-1) → Page → Archibald session 1
  ├─ BrowserContext (user-2) → Page → Archibald session 2
  └─ BrowserContext (user-N) → Page → Archibald session N
```

**Pool Management**:
- `Map<userId, BrowserContext>` tracks active contexts
- Reuse existing context on subsequent operations (same userId)
- Create new context on first user access
- Close context on explicit logout
- File-based cookie cache (`.cache/session-{userId}.json`)

### Implementation Pattern

```typescript
class BrowserPool {
  private browser: Browser;
  private userContexts: Map<string, BrowserContext>;
  private sessionCache: SessionCacheManager;

  async acquireContext(userId: string): Promise<BrowserContext> {
    if (this.userContexts.has(userId)) {
      return this.userContexts.get(userId);
    }

    const context = await this.browser.createBrowserContext();

    // Load cached cookies
    const cookies = await this.sessionCache.loadSession(userId);
    if (cookies) {
      const page = await context.newPage();
      await page.setCookie(...cookies);
    }

    this.userContexts.set(userId, context);
    return context;
  }

  async releaseContext(userId: string, success: boolean) {
    if (!success) {
      await this.closeUserContext(userId);
      return;
    }

    // Save cookies for reuse
    const context = this.userContexts.get(userId);
    const pages = await context.pages();
    const cookies = await pages[0].cookies();
    await this.sessionCache.saveSession(userId, cookies);
  }

  async closeUserContext(userId: string) {
    const context = this.userContexts.get(userId);
    await context.close();
    this.userContexts.delete(userId);
    this.sessionCache.clearSession(userId);
  }
}
```

### Pros

✅ **Best Memory Efficiency**: One Browser, multiple contexts (~10-20MB per context vs ~100-150MB per Browser)
✅ **Fast Context Creation**: ~100ms context creation vs ~3-5s Browser launch
✅ **Complete Cookie Isolation**: BrowserContext API guarantees complete isolation
✅ **Session Persistence**: Cookie cache enables fast re-login (skip Puppeteer login)
✅ **Scalable**: Production-grade pattern, handles 10-50 concurrent users easily
✅ **Fits Existing Pattern**: Minimal changes to current BrowserPool singleton structure

### Cons

❌ **More Complex Pool Management**: Track userId → context mapping, handle lifecycle
❌ **Refactoring Required**: Need to update BrowserPool, SessionManager, ArchibaldBot
❌ **Memory Leak Risk**: Must properly close contexts on logout or error
❌ **Cookie Cache Management**: File I/O overhead, need cleanup of expired sessions

### Memory Impact

- **Base Browser**: ~80-100MB
- **Per Context**: ~10-20MB
- **10 Users**: ~280-300MB total
- **Comparison**: 10 separate Browsers = ~1.5GB

### Performance Impact

- **First Login**: Same as current (~82s order creation)
- **Subsequent Logins**: ~8-10s faster (reuse context, skip login if cookies valid)
- **Context Switch**: Negligible (<50ms)

### Code Complexity

- **High**: Requires refactoring BrowserPool, SessionManager, ArchibaldBot
- **Estimated LOC**: ~400 lines (SessionCacheManager + BrowserPool refactor + ArchibaldBot updates)
- **Risk**: Medium (touching core bot infrastructure)

---

## Option B: On-Demand BrowserContext Creation

### Architecture

```
Browser (single instance)
  └─ BrowserContexts created/destroyed on-demand
     - Login: create context → authenticate → use
     - Logout: close context immediately
     - No persistence between logins
```

**Lifecycle**:
- User logs in → create new BrowserContext → Puppeteer login → create order
- User logs out → close BrowserContext immediately
- No cookie cache, no context reuse

### Implementation Pattern

```typescript
class BrowserPool {
  private browser: Browser;

  async createUserSession(userId: string): Promise<BrowserContext> {
    const context = await this.browser.createBrowserContext();
    const page = await context.newPage();

    // Always login fresh
    await this.loginToPuppeteer(page);

    return context;
  }

  async destroyUserSession(context: BrowserContext) {
    await context.close();
  }
}
```

### Pros

✅ **Simplest Implementation**: No pool management, no userId mapping
✅ **Guaranteed Clean State**: Every login starts fresh (no stale cookie issues)
✅ **No Cache Management**: No file I/O, no expiration tracking
✅ **Minimal Refactoring**: Small changes to BrowserPool

### Cons

❌ **Slower Login**: Full Puppeteer login every time (~25s overhead)
❌ **No Session Persistence**: Can't reuse authenticated sessions
❌ **Higher Resource Usage**: Create/destroy contexts frequently (GC pressure)
❌ **Poor User Experience**: 25s delay on every login

### Memory Impact

- **Same as Option A**: ~10-20MB per active context
- **Lower Peak**: Contexts destroyed immediately after use

### Performance Impact

- **First Login**: Same as current (~82s + 25s login = 107s)
- **Every Subsequent Login**: Same ~107s (no optimization)
- **Comparison**: Option A subsequent logins ~72s (35s faster)

### Code Complexity

- **Low**: ~100 lines of code
- **Risk**: Low (minimal changes to existing code)

---

## Option C: Separate Browser Per User

### Architecture

```
Browser (user-1) → Page → Archibald session 1
Browser (user-2) → Page → Archibald session 2
Browser (user-N) → Page → Archibald session N
```

**Pool Management**:
- `Map<userId, Browser>` tracks browsers
- Each user gets dedicated Browser instance
- Maximum isolation (separate processes)

### Implementation Pattern

```typescript
class BrowserPool {
  private userBrowsers: Map<string, Browser>;

  async acquireBrowser(userId: string): Promise<Browser> {
    if (this.userBrowsers.has(userId)) {
      return this.userBrowsers.get(userId);
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox']
    });

    this.userBrowsers.set(userId, browser);
    return browser;
  }

  async closeBrowser(userId: string) {
    const browser = this.userBrowsers.get(userId);
    await browser.close();
    this.userBrowsers.delete(userId);
  }
}
```

### Pros

✅ **Maximum Isolation**: Separate OS processes per user
✅ **Easiest Debugging**: Each user has dedicated browser instance
✅ **No Context Lifecycle Issues**: Browsers fully independent

### Cons

❌ **Very Heavy Memory**: ~100-150MB per Browser instance
❌ **Slow Initialization**: ~3-5s to launch each Browser
❌ **Poor Scalability**: 10 users = ~1.5GB RAM, 50 users = ~7.5GB RAM
❌ **Overkill for Use Case**: BrowserContext provides sufficient isolation
❌ **Resource Waste**: Most resource-intensive option

### Memory Impact

- **Per Browser**: ~100-150MB
- **10 Users**: ~1.5GB
- **Comparison**: Option A = ~300MB (5x more efficient)

### Performance Impact

- **First Login**: +3-5s Browser launch overhead = ~87-89s
- **Context Switch**: N/A (dedicated browsers)

### Code Complexity

- **Medium**: Similar to Option A but simpler lifecycle
- **Risk**: Low (separate instances = no interference)

---

## Comparison Matrix

| Criterion | Option A: Pooling | Option B: On-Demand | Option C: Separate Browser |
|-----------|-------------------|---------------------|----------------------------|
| **Memory (10 users)** | ~300MB | ~200-300MB | ~1.5GB |
| **First Login** | ~82s | ~107s | ~87-89s |
| **Subsequent Login** | ~72s | ~107s | ~82s |
| **Context Creation** | ~100ms | ~100ms | ~3-5s |
| **Cookie Isolation** | ✅ Complete | ✅ Complete | ✅ Complete |
| **Session Persistence** | ✅ Yes | ❌ No | ✅ Yes |
| **Scalability** | ✅ Excellent | ⚠️ Moderate | ❌ Poor |
| **Code Complexity** | High | Low | Medium |
| **Refactoring Risk** | Medium | Low | Low |
| **Production Ready** | ✅ Yes | ⚠️ UX Issues | ❌ Resource Heavy |

---

## Recommendation

**Option A: BrowserContext Pooling** is the recommended approach.

### Rationale

1. **Best Memory Efficiency**: 5x more efficient than separate Browsers (300MB vs 1.5GB for 10 users)
2. **Fast Performance**: 35s faster on subsequent logins vs on-demand (72s vs 107s)
3. **Production-Grade Pattern**: Industry standard for multi-tenant Puppeteer applications
4. **Session Persistence**: Cookie cache enables quick re-login without full Puppeteer authentication
5. **Scalability**: Handles 10-50 concurrent users easily, can scale to 100+ with proper resource management

### Trade-offs Accepted

- Higher implementation complexity (worth it for performance gains)
- Requires careful context lifecycle management (standard practice)
- Cookie cache management overhead (minimal file I/O)

### Implementation Priorities

**Phase 6 Plans**:
1. **Plan 06-02**: User Database & Whitelist Backend
2. **Plan 06-03**: Authentication Backend & JWT
3. **Plan 06-04**: Login UI & Frontend Auth State
4. **Plan 06-05**: Refactor BrowserPool for Multi-User Sessions (implement Option A)
5. **Plan 06-06**: Integrate User Sessions in Order Flow
6. **Plan 06-07**: Session Cleanup & Testing

---

## Sources

- [Puppeteer BrowserContext API](https://pptr.dev/api/puppeteer.browsercontext)
- [Puppeteer Cookies Guide](https://pptr.dev/guides/cookies)
- [Apify Academy: Browser Contexts](https://docs.apify.com/academy/puppeteer-playwright/browser-contexts)
- [Latenode: Comparing Single Browser Multi-Page vs Multiple Instances](https://community.latenode.com/t/comparing-single-browser-multi-page-execution-with-multiple-browser-instances-in-puppeteer/4794)
- [The Hidden Cost of Headless Browsers: Memory Leak Journey](https://medium.com/@matveev.dina/the-hidden-cost-of-headless-browsers-a-puppeteer-memory-leak-journey-027e41291367)
- [WebScraping.AI: Multi-Session Browser Contexts](https://webscraping.ai/faq/puppeteer-sharp/how-do-i-manage-browser-contexts-in-puppeteer-sharp-for-multi-session-scenarios)
- [Browserless: Managing Cookies and Sessions](https://www.browserless.io/blog/manage-sessions)
- [Latenode: Cookie Management Best Practices](https://latenode.com/blog/cookie-management-in-puppeteer-session-preservation-auth-emulation-and-limitations)
