import { describe, expect, test, vi } from 'vitest';
import { withAnomalyNotification } from './anomaly-notification-wrapper';

describe('withAnomalyNotification', () => {
  const mockContext = {} as unknown;
  const mockOnProgress = vi.fn();

  test('throws error and calls notifyFn when handler returns success: false', async () => {
    const syncError = 'PDF download failed [pdf_export:page_loaded/timeout]: waiting for selector timed out';
    const handler = vi.fn().mockResolvedValue({ success: false, error: syncError });
    const notifyFn = vi.fn().mockResolvedValue(undefined);

    const wrapped = withAnomalyNotification(handler, 'Prodotti', notifyFn);

    await expect(
      wrapped(mockContext, {}, 'service-account', mockOnProgress),
    ).rejects.toThrow(syncError);

    expect(notifyFn).toHaveBeenCalledWith(expect.objectContaining({
      target: 'admin',
      type: 'sync_anomaly',
      severity: 'error',
      title: 'Anomalia sincronizzazione: Prodotti',
      body: syncError,
    }));
  });

  test('does not throw and skips notification when error includes "stop"', async () => {
    const handler = vi.fn().mockResolvedValue({ success: false, error: 'sync stopped by user request' });
    const notifyFn = vi.fn().mockResolvedValue(undefined);

    const wrapped = withAnomalyNotification(handler, 'Prodotti', notifyFn);

    const result = await wrapped(mockContext, {}, 'service-account', mockOnProgress);

    expect(result).toEqual({ success: false, error: 'sync stopped by user request' });
    expect(notifyFn).not.toHaveBeenCalled();
  });

  test('returns result and skips notification when handler returns success: true', async () => {
    const handler = vi.fn().mockResolvedValue({ success: true, count: 42 });
    const notifyFn = vi.fn().mockResolvedValue(undefined);

    const wrapped = withAnomalyNotification(handler, 'Prezzi', notifyFn);

    const result = await wrapped(mockContext, {}, 'service-account', mockOnProgress);

    expect(result).toEqual({ success: true, count: 42 });
    expect(notifyFn).not.toHaveBeenCalled();
  });

  test('returns result and skips notification when handler returns success: false with no error field', async () => {
    const handler = vi.fn().mockResolvedValue({ success: false });
    const notifyFn = vi.fn().mockResolvedValue(undefined);

    const wrapped = withAnomalyNotification(handler, 'Prodotti', notifyFn);

    const result = await wrapped(mockContext, {}, 'service-account', mockOnProgress);

    expect(result).toEqual({ success: false });
    expect(notifyFn).not.toHaveBeenCalled();
  });

  test('truncates error body to 300 characters in the notification', async () => {
    const longError = 'e'.repeat(400);
    const handler = vi.fn().mockResolvedValue({ success: false, error: longError });
    const notifyFn = vi.fn().mockResolvedValue(undefined);

    const wrapped = withAnomalyNotification(handler, 'Clienti', notifyFn);

    await expect(
      wrapped(mockContext, {}, 'service-account', mockOnProgress),
    ).rejects.toThrow(longError);

    expect(notifyFn).toHaveBeenCalledWith(expect.objectContaining({
      body: 'e'.repeat(300),
    }));
  });
});
