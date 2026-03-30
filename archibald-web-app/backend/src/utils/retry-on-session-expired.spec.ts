import { describe, expect, test, vi } from 'vitest';
import { retryOnSessionExpired } from './retry-on-session-expired';

describe('retryOnSessionExpired', () => {
  test('returns result of fn when it succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('/tmp/prodotti-123.pdf');

    const result = await retryOnSessionExpired(fn);

    expect(result).toBe('/tmp/prodotti-123.pdf');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries once and returns result when fn throws SessionExpiredError on first attempt', async () => {
    const sessionError = new Error('SessionExpiredError: redirect to login page (expected: /INVENTTABLE, got: /Login.aspx)');
    const fn = vi.fn()
      .mockRejectedValueOnce(sessionError)
      .mockResolvedValueOnce('/tmp/prodotti-456.pdf');

    const result = await retryOnSessionExpired(fn);

    expect(result).toBe('/tmp/prodotti-456.pdf');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('re-throws non-SessionExpiredError without retrying', async () => {
    const otherError = new Error('timeout waiting for selector #Vertical_mainMenu_Menu_DXI3_');
    const fn = vi.fn().mockRejectedValue(otherError);

    await expect(retryOnSessionExpired(fn)).rejects.toThrow(otherError.message);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('propagates retry failure when second attempt also throws', async () => {
    const sessionError = new Error('SessionExpiredError: redirect to login page');
    const retryError = new Error('SessionExpiredError: redirect to login page (retry)');
    const fn = vi.fn()
      .mockRejectedValueOnce(sessionError)
      .mockRejectedValueOnce(retryError);

    await expect(retryOnSessionExpired(fn)).rejects.toThrow(retryError.message);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
