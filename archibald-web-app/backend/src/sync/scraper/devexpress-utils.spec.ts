import { describe, expect, test, vi } from 'vitest';
import {
  waitForDevExpressIdle,
  getGridFieldMap,
  gotoFirstPage,
  setGridPageSize,
  getVisibleRowCount,
  hasNextPage,
  goToNextPage,
  ensureFilterValue,
  restoreFilterValue,
} from './devexpress-utils';

function createMockPage(overrides: Record<string, unknown> = {}) {
  return {
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    $$eval: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('waitForDevExpressIdle', () => {
  test('calls waitForFunction with default timeout', async () => {
    const page = createMockPage();

    await waitForDevExpressIdle(page as any);

    expect(page.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 15000, polling: 200 },
      3,
    );
  });

  test('accepts custom timeout', async () => {
    const page = createMockPage();

    await waitForDevExpressIdle(page as any, 5000);

    expect(page.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 5000, polling: 200 },
      3,
    );
  });
});

describe('getGridFieldMap', () => {
  test('returns fieldMap and systemColumnCount from grid columns', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue({
        fieldMap: { SALESID: 0, CUSTACCOUNT: 1, AMOUNT: 2 },
        systemColumnCount: 2,
      }),
    });

    const result = await getGridFieldMap(page as any);

    expect(result).toEqual({
      fieldMap: { SALESID: 0, CUSTACCOUNT: 1, AMOUNT: 2 },
      systemColumnCount: 2,
    });
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function));
  });

  test('returns empty map and zero system columns when grid has no columns', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue({ fieldMap: {}, systemColumnCount: 0 }),
    });

    const result = await getGridFieldMap(page as any);

    expect(result).toEqual({ fieldMap: {}, systemColumnCount: 0 });
  });
});

describe('setGridPageSize', () => {
  test('calls evaluate with page size and waits for idle when changed', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(true),
    });

    await setGridPageSize(page as any, 200);

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 200);
    expect(page.waitForFunction).toHaveBeenCalled();
  });

  test('skips idle wait when page size already correct', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(false),
    });

    await setGridPageSize(page as any, 200);

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 200);
    expect(page.waitForFunction).not.toHaveBeenCalled();
  });
});

describe('getVisibleRowCount', () => {
  test('returns count of data row elements', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(25),
    });

    const result = await getVisibleRowCount(page as any);

    expect(result).toBe(25);
  });

  test('returns 0 when no rows', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(0),
    });

    const result = await getVisibleRowCount(page as any);

    expect(result).toBe(0);
  });
});

describe('hasNextPage', () => {
  test('returns true when current page is before last', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(true),
    });

    const result = await hasNextPage(page as any);

    expect(result).toBe(true);
  });

  test('returns false when on last page', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(false),
    });

    const result = await hasNextPage(page as any);

    expect(result).toBe(false);
  });
});

describe('goToNextPage', () => {
  test('calls evaluate for NextPage then waits for idle', async () => {
    const page = createMockPage();

    await goToNextPage(page as any);

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function));
    expect(page.waitForFunction).toHaveBeenCalled();
  });
});

describe('ensureFilterValue', () => {
  test('returns null originalXafValue when filter already has the desired xaf value', async () => {
    const page = createMockPage({
      evaluate: vi.fn()
        .mockResolvedValueOnce({ found: true, controlId: 'ctrl1', originalXafValue: null }),
    });

    const result = await ensureFilterValue(page as any, 'OrdersAll', 'xaf_xaf_a2ListViewSalesTableOrdersAll');

    expect(result).toEqual({ originalXafValue: null, controlId: 'ctrl1' });
  });

  test('returns original xaf value and changes filter when different', async () => {
    const page = createMockPage({
      evaluate: vi.fn()
        .mockResolvedValueOnce({ found: true, controlId: 'ctrl1', originalXafValue: 'xaf_xaf_a2OpenOrders' })
        .mockResolvedValueOnce(undefined) // SetValue
        .mockResolvedValueOnce(undefined), // waitForDevExpressIdle resets __dxIdleCount
    });

    const result = await ensureFilterValue(page as any, 'OrdersAll', 'xaf_xaf_a2ListViewSalesTableOrdersAll');

    expect(result).toEqual({ originalXafValue: 'xaf_xaf_a2OpenOrders', controlId: 'ctrl1' });
    expect(page.evaluate).toHaveBeenCalledTimes(3);
    expect(page.waitForFunction).toHaveBeenCalled();
  });

  test('returns null when no combo matches the xaf pattern', async () => {
    const page = createMockPage({
      evaluate: vi.fn()
        .mockResolvedValueOnce({ found: false }),
    });

    const result = await ensureFilterValue(page as any, 'OrdersAll', 'xaf_xaf_a2ListViewSalesTableOrdersAll');

    expect(result).toEqual({ originalXafValue: null, controlId: undefined });
  });
});

describe('gotoFirstPage', () => {
  test('calls GotoPage(0) and waits for idle when not on first page', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(true),
    });

    await gotoFirstPage(page as any);

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function));
    expect(page.waitForFunction).toHaveBeenCalled();
  });

  test('skips idle wait when already on first page', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(false),
    });

    await gotoFirstPage(page as any);

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function));
    expect(page.waitForFunction).not.toHaveBeenCalled();
  });
});

describe('restoreFilterValue', () => {
  test('calls SetValue with original xaf value on the identified control', async () => {
    const page = createMockPage();

    await restoreFilterValue(page as any, 'xaf_xaf_a2OpenOrders', 'ctrl1');

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 'xaf_xaf_a2OpenOrders', 'ctrl1');
    expect(page.waitForFunction).toHaveBeenCalled();
  });
});
