/**
 * Fetch with automatic retry and smart error handling
 *
 * Features:
 * - Automatic retry for transient errors (500/502/503/504)
 * - Automatic JWT token injection
 * - Exponential backoff with total timeout
 * - Smart CREDENTIALS_EXPIRED handling
 *
 * Backend Auto-Recovery:
 * Backend now uses lazy-load from encrypted DB, so CREDENTIALS_EXPIRED
 * should be extremely rare (only if password never saved or DB corrupted).
 * When it happens, user is gracefully redirected to login.
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  totalTimeout?: number;
}

interface RetryContext {
  attempt: number;
  totalElapsed: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffFactor: 2,
  totalTimeout: 20000, // 20 seconds hard cap
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  context: RetryContext = { attempt: 0, totalElapsed: 0 },
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...retryOptions };
  const startTime = Date.now();

  // Check total timeout
  if (context.totalElapsed >= opts.totalTimeout) {
    throw new Error(`Request timeout: exceeded ${opts.totalTimeout / 1000}s total timeout`);
  }

  try {
    // 1. Add JWT token automatically (if available and not login endpoint)
    const token = localStorage.getItem('archibald_jwt');
    const headers = new Headers(options?.headers);

    if (token && !url.includes('/api/auth/login')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // 2. Make request
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // 3. Handle 401 Unauthorized (skip for login endpoint - 401 is expected for invalid credentials)
    if (response.status === 401 && !url.includes('/api/auth/login')) {
      try {
        const clonedResponse = response.clone();
        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
          const data = await clonedResponse.json();

          // 3a. CREDENTIALS_EXPIRED (very rare with lazy-load backend)
          if (data.error === 'CREDENTIALS_EXPIRED') {
            console.log('⚠️  [FetchWithRetry] Credentials expired - redirecting to login');
            console.log('(This is rare - backend should auto-recover via lazy-load)');
            localStorage.removeItem('archibald_jwt');
            window.location.href = '/login?reason=credentials_expired';
            throw new Error('Credentials expired');
          }

          // 3b. Other 401 errors (invalid token, etc.)
          console.log('❌ [FetchWithRetry] Unauthorized - clearing token and redirecting');
          localStorage.removeItem('archibald_jwt');
          window.location.href = '/login?reason=unauthorized';
          throw new Error('Unauthorized');
        }
      } catch (parseError) {
        // If we can't parse response, treat as generic 401
        console.log('❌ [FetchWithRetry] 401 (unparseable) - redirecting to login');
        localStorage.removeItem('archibald_jwt');
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }
    }

    // 4. Handle retryable errors (500, 502, 503, 504)
    const isRetryable = [500, 502, 503, 504].includes(response.status);
    const canRetry = context.attempt < opts.maxRetries;
    const withinTimeout = context.totalElapsed < opts.totalTimeout;

    if (isRetryable && canRetry && withinTimeout) {
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, context.attempt),
        opts.maxDelay,
      );

      console.log(
        `⚠️  [FetchWithRetry] ${response.status} error, retrying in ${delay}ms... ` +
        `(attempt ${context.attempt + 1}/${opts.maxRetries})`
      );

      await sleep(delay);

      return fetchWithRetry(
        url,
        options,
        retryOptions,
        {
          attempt: context.attempt + 1,
          totalElapsed: context.totalElapsed + (Date.now() - startTime) + delay,
        }
      );
    }

    // 5. Return response (success or non-retryable error)
    return response;

  } catch (error) {
    // Network error (fetch failed completely)
    const canRetry = context.attempt < opts.maxRetries;
    const withinTimeout = context.totalElapsed < opts.totalTimeout;

    if (canRetry && withinTimeout) {
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, context.attempt),
        opts.maxDelay,
      );

      console.log(
        `⚠️  [FetchWithRetry] Network error, retrying in ${delay}ms... ` +
        `(attempt ${context.attempt + 1}/${opts.maxRetries})`
      );

      await sleep(delay);

      return fetchWithRetry(
        url,
        options,
        retryOptions,
        {
          attempt: context.attempt + 1,
          totalElapsed: context.totalElapsed + (Date.now() - startTime) + delay,
        }
      );
    }

    // Max retries reached or timeout
    console.error('❌ [FetchWithRetry] All retries failed:', error);
    throw error;
  }
}
