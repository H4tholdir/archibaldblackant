import { describe, expect, test, vi } from 'vitest';
import {
  waitForDevExpressIdle,
  getGridFieldMap,
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
  test('returns fieldName-to-position map from grid columns', async () => {
    const expectedMap = { SALESID: 0, CUSTACCOUNT: 1, AMOUNT: 2 };
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(expectedMap),
    });

    const result = await getGridFieldMap(page as any);

    expect(result).toEqual({ SALESID: 0, CUSTACCOUNT: 1, AMOUNT: 2 });
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function));
  });

  test('returns empty map when grid has no columns', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue({}),
    });

    const result = await getGridFieldMap(page as any);

    expect(result).toEqual({});
  });
});

describe('setGridPageSize', () => {
  test('calls evaluate with page size then waits for idle', async () => {
    const page = createMockPage();

    await setGridPageSize(page as any, 200);

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 200);
    expect(page.waitForFunction).toHaveBeenCalled();
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
  test('returns null when filter already has safe value', async () => {
    const page = createMockPage({
      evaluate: vi.fn()
        .mockResolvedValueOnce({ found: true, comboName: 'combo1', currentText: 'Tutti gli ordini' }),
    });

    const result = await ensureFilterValue(page as any, 'Tutti gli ordini');

    expect(result).toEqual({ originalValue: null, comboName: 'combo1' });
  });

  test('returns original value and changes filter when different', async () => {
    const page = createMockPage({
      evaluate: vi.fn()
        .mockResolvedValueOnce({ found: true, comboName: 'combo1', currentText: 'Ordini aperti' })
        .mockResolvedValueOnce(undefined),
    });

    const result = await ensureFilterValue(page as any, 'Tutti gli ordini');

    expect(result).toEqual({ originalValue: 'Ordini aperti', comboName: 'combo1' });
    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(page.waitForFunction).toHaveBeenCalled();
  });

  test('checks alt value when primary does not match', async () => {
    const page = createMockPage({
      evaluate: vi.fn()
        .mockResolvedValueOnce({ found: true, comboName: 'combo1', currentText: 'All orders' }),
    });

    const result = await ensureFilterValue(page as any, 'Tutti gli ordini', 'All orders');

    expect(result).toEqual({ originalValue: null, comboName: 'combo1' });
  });
});

describe('restoreFilterValue', () => {
  test('sets the original filter value and waits for idle', async () => {
    const page = createMockPage();

    await restoreFilterValue(page as any, 'Ordini aperti');

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 'Ordini aperti', undefined);
    expect(page.waitForFunction).toHaveBeenCalled();
  });
});
