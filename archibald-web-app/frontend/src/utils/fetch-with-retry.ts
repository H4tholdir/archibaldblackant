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

async function shouldRetry(response: Response): Promise<boolean> {
  // Never retry success responses (2xx)
  if (response.ok) {
    return false;
  }

  // Always retry 500/503 errors (backend issues)
  if (response.status === 500 || response.status === 503) {
    console.log(
      `[FetchWithRetry] Server error ${response.status}, will retry`,
    );
    return true;
  }

  // For 401, check if it's the specific cache miss error
  if (response.status === 401) {
    try {
      // Clone to avoid consuming the original body
      const clonedResponse = response.clone();
      const contentType = response.headers.get("content-type");

      // Only parse JSON responses
      if (contentType && contentType.includes("application/json")) {
        const data = await clonedResponse.json();
        if (
          data.error &&
          typeof data.error === "string" &&
          data.error.includes("Password not found in cache")
        ) {
          console.log(
            "[FetchWithRetry] Detected backend cache miss (likely restart), will retry",
          );
          return true;
        }
      }
    } catch (parseError) {
      // If we can't parse the response, don't retry
      console.log(
        "[FetchWithRetry] Could not parse 401 response, not retrying",
      );
      return false;
    }
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

  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Check if we should retry this response
      const retry = await shouldRetry(response);

      // If no retry needed, return immediately
      if (!retry) {
        return response;
      }

      // Store last response for potential return
      lastResponse = response;

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, attempt),
        opts.maxDelay,
      );

      const attemptsRemaining = opts.maxRetries - attempt - 1;
      console.log(
        `[FetchWithRetry] Attempt ${attempt + 1}/${opts.maxRetries} failed for ${url}, retrying in ${delay}ms... (${attemptsRemaining} attempts remaining)`,
      );

      await sleep(delay);
    } catch (error) {
      lastError = error as Error;

      // Calculate delay
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, attempt),
        opts.maxDelay,
      );

      const attemptsRemaining = opts.maxRetries - attempt - 1;

      if (attemptsRemaining > 0) {
        console.log(
          `[FetchWithRetry] Attempt ${attempt + 1}/${opts.maxRetries} threw error for ${url}, retrying in ${delay}ms... (${attemptsRemaining} attempts remaining)`,
          error,
        );
        await sleep(delay);
      } else {
        // Last attempt failed, throw the error
        console.error(
          `[FetchWithRetry] All ${opts.maxRetries} attempts failed for ${url}`,
        );
        throw error;
      }
    }
  }

  // All retries exhausted, return last response or throw last error
  if (lastResponse) {
    console.log(
      `[FetchWithRetry] All ${opts.maxRetries} retries exhausted for ${url}, returning last response (${lastResponse.status})`,
    );
    return lastResponse;
  }

  throw lastError || new Error("Fetch failed after retries");
}
