/**
 * Fetch with automatic retry for backend restart errors
 *
 * When backend restarts, cache is lost and sync may fail with:
 * - "Password not found in cache"
 * - 500/503 errors
 *
 * This wrapper automatically retries with exponential backoff.
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffFactor: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(response: Response, responseText: string): boolean {
  // Retry on 500/503 errors (backend issues)
  if (response.status === 500 || response.status === 503) {
    return true;
  }

  // Retry on specific "cache miss" error from backend restart
  if (
    response.status === 401 &&
    responseText.includes("Password not found in cache")
  ) {
    console.log(
      "[FetchWithRetry] Detected backend cache miss (likely restart), will retry",
    );
    return true;
  }

  return false;
}

/**
 * Fetch with automatic retry for transient backend errors
 *
 * Usage: Replace `fetch(url, options)` with `fetchWithRetry(url, options)`
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retryOptions?: RetryOptions,
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Clone response to read body for retry decision
      const clonedResponse = response.clone();
      const responseText = await clonedResponse.text();

      // If success or non-retryable error, return immediately
      if (!shouldRetry(response, responseText)) {
        return response;
      }

      // Store last response for logging
      lastResponse = response;

      // If this was the last attempt, return the response
      if (attempt === opts.maxRetries) {
        console.log(
          `[FetchWithRetry] Max retries (${opts.maxRetries}) reached for ${url}`,
        );
        return response;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, attempt),
        opts.maxDelay,
      );

      console.log(
        `[FetchWithRetry] Attempt ${attempt + 1}/${opts.maxRetries} failed for ${url}, retrying in ${delay}ms...`,
      );

      await sleep(delay);
    } catch (error) {
      lastError = error as Error;

      // If this was the last attempt, throw the error
      if (attempt === opts.maxRetries) {
        console.error(
          `[FetchWithRetry] Max retries (${opts.maxRetries}) reached for ${url}, throwing error`,
        );
        throw error;
      }

      // Calculate delay
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, attempt),
        opts.maxDelay,
      );

      console.log(
        `[FetchWithRetry] Attempt ${attempt + 1}/${opts.maxRetries} threw error for ${url}, retrying in ${delay}ms...`,
        error,
      );

      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs this
  if (lastResponse) {
    return lastResponse;
  }
  throw lastError || new Error("Fetch failed after retries");
}
