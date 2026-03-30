async function retryOnSessionExpired<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.message.includes('SessionExpiredError')) {
      return fn();
    }
    throw err;
  }
}

export { retryOnSessionExpired };
