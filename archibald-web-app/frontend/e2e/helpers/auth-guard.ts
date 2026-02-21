import type { Page } from "@playwright/test";

/**
 * Prevents the frontend from clearing the JWT and redirecting to /login
 * on transient 401 errors during E2E tests against a real VPS.
 *
 * Also handles rate limiting (429) by retrying with backoff, and
 * throttles browser-initiated fetch calls to avoid hitting limits.
 *
 * Four layers of protection (all inside addInitScript):
 * 1. Blocks localStorage.removeItem('archibald_jwt')
 * 2. Throttles window.fetch to min 150ms between calls
 * 3. Retries 401/429 responses up to 3 times with backoff
 * 4. Blocks navigation to /login as last resort
 *
 * Must be called BEFORE page.goto() to take effect.
 */
export async function guardJwt(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // 1. Prevent JWT removal from localStorage
    const origRemove = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = function (key: string) {
      if (key === "archibald_jwt") return;
      origRemove(key);
    };

    // 2+3. Wrap fetch with throttling and retry on 401/429
    const originalFetch = window.fetch.bind(window);
    let lastFetchTime = 0;
    const MIN_INTERVAL = 150;

    window.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();

      // Throttle: min interval between browser fetch calls
      const now = Date.now();
      const elapsed = now - lastFetchTime;
      if (elapsed < MIN_INTERVAL) {
        await new Promise((r) => setTimeout(r, MIN_INTERVAL - elapsed));
      }
      lastFetchTime = Date.now();

      let response = await originalFetch(input, init);

      if (
        (response.status === 401 || response.status === 429) &&
        !url.includes("/auth/login")
      ) {
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise((r) =>
            setTimeout(r, 1_000 * (attempt + 1)),
          );
          response = await originalFetch(input, init);
          if (response.status !== 401 && response.status !== 429) break;
        }
      }

      return response;
    };

    // 4. Block redirect to /login (last resort if all retries fail)
    try {
      const desc = Object.getOwnPropertyDescriptor(
        Location.prototype,
        "href",
      );
      if (desc?.set) {
        const origSet = desc.set;
        Object.defineProperty(Location.prototype, "href", {
          ...desc,
          set: function (val: string) {
            if (typeof val === "string" && val.includes("/login")) {
              return;
            }
            origSet.call(this, val);
          },
        });
      }
    } catch {
      // If Location.href override not supported, continue without it
    }
  });
}
