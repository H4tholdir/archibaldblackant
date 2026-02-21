import type { Page, APIResponse } from "@playwright/test";

/**
 * Tracks API requests and enforces pacing to stay under the backend
 * global rate limit (500 req/60s default). Works only with workers: 1.
 */
const REQUEST_LOG: number[] = [];
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 450; // conservative: 90% of 500 limit
const MIN_INTERVAL_MS = 200;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();

  while (REQUEST_LOG.length > 0 && REQUEST_LOG[0]! < now - WINDOW_MS) {
    REQUEST_LOG.shift();
  }

  if (REQUEST_LOG.length >= MAX_REQUESTS) {
    const oldestInWindow = REQUEST_LOG[0]!;
    const waitUntil = oldestInWindow + WINDOW_MS;
    const waitMs = waitUntil - now + 200;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  if (REQUEST_LOG.length > 0) {
    const lastRequest = REQUEST_LOG[REQUEST_LOG.length - 1]!;
    const elapsed = Date.now() - lastRequest;
    if (elapsed < MIN_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_INTERVAL_MS - elapsed),
      );
    }
  }

  REQUEST_LOG.push(Date.now());
}

export async function apiPost(
  page: Page,
  url: string,
  data: unknown,
  jwt: string,
): Promise<APIResponse> {
  await waitForRateLimit();

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await page.request.post(url, {
      data,
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (response.status() !== 429) return response;
    await new Promise((resolve) =>
      setTimeout(resolve, 2_000 * (attempt + 1)),
    );
  }

  return page.request.post(url, {
    data,
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function apiDelete(
  page: Page,
  url: string,
  jwt: string,
): Promise<APIResponse> {
  await waitForRateLimit();

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await page.request.delete(url, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (response.status() !== 429) return response;
    await new Promise((resolve) =>
      setTimeout(resolve, 2_000 * (attempt + 1)),
    );
  }

  return page.request.delete(url, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}
