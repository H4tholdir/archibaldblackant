import { beforeEach, describe, expect, test, vi } from 'vitest';
import { scrapeListView } from './list-view-scraper';
import type { ScraperConfig } from './types';
import * as devexpressUtils from './devexpress-utils';
import * as headerMapper from './header-mapper';

vi.mock('./devexpress-utils');
vi.mock('./header-mapper');

const mockedUtils = vi.mocked(devexpressUtils);
const mockedMapper = vi.mocked(headerMapper);

function createMockPage() {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue([]),
    $$eval: vi.fn().mockResolvedValue([]),
  };
}

const baseConfig: ScraperConfig = {
  url: 'https://erp.example.com/SALESTABLE_ListView/',
  columns: [
    { fieldName: 'SALESID', targetField: 'orderNumber' },
    { fieldName: 'CUSTACCOUNT', targetField: 'customerCode' },
  ],
};

describe('scrapeListView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns empty array when grid has no rows', async () => {
    const page = createMockPage();

    mockedUtils.waitForDevExpressIdle.mockResolvedValue(undefined);
    mockedUtils.gotoFirstPage.mockResolvedValue(undefined);
    mockedUtils.getGridFieldMap.mockResolvedValue({ fieldMap: { SALESID: 0, CUSTACCOUNT: 1 }, systemColumnCount: 0 });
    mockedUtils.setGridPageSize.mockResolvedValue(undefined);
    mockedUtils.getVisibleRowCount.mockResolvedValue(0);
    mockedUtils.hasNextPage.mockResolvedValue(false);
    mockedUtils.ensureFilterValue.mockResolvedValue({ originalXafValue: null, controlId: undefined });

    // detectSystemColumnOffset is called via page.evaluate in the module
    page.evaluate.mockResolvedValue(0);

    mockedMapper.buildRowExtractor.mockReturnValue(
      (cells: string[]) => ({ orderNumber: cells[0], customerCode: cells[1] }),
    );

    const rows = await scrapeListView(page as any, baseConfig);

    expect(rows).toEqual([]);
  });

  test('navigates to config URL', async () => {
    const page = createMockPage();

    mockedUtils.waitForDevExpressIdle.mockResolvedValue(undefined);
    mockedUtils.gotoFirstPage.mockResolvedValue(undefined);
    mockedUtils.getGridFieldMap.mockResolvedValue({ fieldMap: { SALESID: 0 }, systemColumnCount: 0 });
    mockedUtils.setGridPageSize.mockResolvedValue(undefined);
    mockedUtils.getVisibleRowCount.mockResolvedValue(0);
    mockedUtils.hasNextPage.mockResolvedValue(false);
    mockedUtils.ensureFilterValue.mockResolvedValue({ originalXafValue: null, controlId: undefined });
    mockedMapper.buildRowExtractor.mockReturnValue(() => ({}));

    page.evaluate.mockResolvedValue(0);

    await scrapeListView(page as any, baseConfig);

    expect(page.goto).toHaveBeenCalledWith(
      'https://erp.example.com/SALESTABLE_ListView/',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
  });

  test('extracts rows from single page', async () => {
    const page = createMockPage();

    mockedUtils.waitForDevExpressIdle.mockResolvedValue(undefined);
    mockedUtils.gotoFirstPage.mockResolvedValue(undefined);
    mockedUtils.getGridFieldMap.mockResolvedValue({ fieldMap: { SALESID: 0, CUSTACCOUNT: 1 }, systemColumnCount: 0 });
    mockedUtils.setGridPageSize.mockResolvedValue(undefined);
    mockedUtils.getVisibleRowCount.mockResolvedValue(2);
    mockedUtils.hasNextPage.mockResolvedValue(false);
    mockedUtils.ensureFilterValue.mockResolvedValue({ originalXafValue: null, controlId: undefined });

    page.evaluate
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce([
        ['ORD-001', 'C100'],
        ['ORD-002', 'C200'],
      ]);

    mockedMapper.buildRowExtractor.mockReturnValue(
      (cells: string[]) => ({ orderNumber: cells[0], customerCode: cells[1] }),
    );

    const rows = await scrapeListView(page as any, baseConfig);

    expect(rows).toEqual([
      { orderNumber: 'ORD-001', customerCode: 'C100' },
      { orderNumber: 'ORD-002', customerCode: 'C200' },
    ]);
  });

  test('paginates through multiple pages', async () => {
    const page = createMockPage();

    mockedUtils.waitForDevExpressIdle.mockResolvedValue(undefined);
    mockedUtils.gotoFirstPage.mockResolvedValue(undefined);
    mockedUtils.getGridFieldMap.mockResolvedValue({ fieldMap: { SALESID: 0 }, systemColumnCount: 0 });
    mockedUtils.setGridPageSize.mockResolvedValue(undefined);
    mockedUtils.getVisibleRowCount.mockResolvedValue(1);
    mockedUtils.ensureFilterValue.mockResolvedValue({ originalXafValue: null, controlId: undefined });

    mockedUtils.hasNextPage
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    mockedUtils.goToNextPage.mockResolvedValue(undefined);

    page.evaluate
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce([['ORD-001']])
      .mockResolvedValueOnce([['ORD-002']]);

    mockedMapper.buildRowExtractor.mockReturnValue(
      (cells: string[]) => ({ orderNumber: cells[0] }),
    );

    const rows = await scrapeListView(page as any, baseConfig);

    expect(rows).toEqual([
      { orderNumber: 'ORD-001' },
      { orderNumber: 'ORD-002' },
    ]);
    expect(mockedUtils.goToNextPage).toHaveBeenCalledTimes(1);
  });

  test('applies filter when config has filter', async () => {
    const page = createMockPage();
    const configWithFilter: ScraperConfig = {
      ...baseConfig,
      filter: { xafValuePattern: 'OrdersAll', xafAllValue: 'xaf_xaf_a2ListViewSalesTableOrdersAll' },
    };

    mockedUtils.waitForDevExpressIdle.mockResolvedValue(undefined);
    mockedUtils.gotoFirstPage.mockResolvedValue(undefined);
    mockedUtils.getGridFieldMap.mockResolvedValue({ fieldMap: { SALESID: 0 }, systemColumnCount: 0 });
    mockedUtils.setGridPageSize.mockResolvedValue(undefined);
    mockedUtils.getVisibleRowCount.mockResolvedValue(0);
    mockedUtils.hasNextPage.mockResolvedValue(false);
    mockedUtils.ensureFilterValue.mockResolvedValue({ originalXafValue: 'xaf_xaf_a2OpenOrders', controlId: 'ctrl1' });
    mockedUtils.restoreFilterValue.mockResolvedValue(undefined);
    mockedMapper.buildRowExtractor.mockReturnValue(() => ({}));

    page.evaluate.mockResolvedValue(0);

    await scrapeListView(page as any, configWithFilter);

    expect(mockedUtils.ensureFilterValue).toHaveBeenCalledWith(
      page,
      'OrdersAll',
      'xaf_xaf_a2ListViewSalesTableOrdersAll',
    );
    expect(mockedUtils.restoreFilterValue).toHaveBeenCalledWith(
      page,
      'xaf_xaf_a2OpenOrders',
      'ctrl1',
    );
  });

  test('does not restore filter when ensureFilterValue returns null', async () => {
    const page = createMockPage();
    const configWithFilter: ScraperConfig = {
      ...baseConfig,
      filter: { xafValuePattern: 'OrdersAll', xafAllValue: 'xaf_xaf_a2ListViewSalesTableOrdersAll' },
    };

    mockedUtils.waitForDevExpressIdle.mockResolvedValue(undefined);
    mockedUtils.gotoFirstPage.mockResolvedValue(undefined);
    mockedUtils.getGridFieldMap.mockResolvedValue({ fieldMap: { SALESID: 0 }, systemColumnCount: 0 });
    mockedUtils.setGridPageSize.mockResolvedValue(undefined);
    mockedUtils.getVisibleRowCount.mockResolvedValue(0);
    mockedUtils.hasNextPage.mockResolvedValue(false);
    mockedUtils.ensureFilterValue.mockResolvedValue({ originalXafValue: null, controlId: undefined });
    mockedMapper.buildRowExtractor.mockReturnValue(() => ({}));

    page.evaluate.mockResolvedValue(0);

    await scrapeListView(page as any, configWithFilter);

    expect(mockedUtils.restoreFilterValue).not.toHaveBeenCalled();
  });

  test('stops early when shouldStop returns true', async () => {
    const page = createMockPage();
    const shouldStop = vi.fn().mockReturnValue(true);

    mockedUtils.waitForDevExpressIdle.mockResolvedValue(undefined);
    mockedUtils.gotoFirstPage.mockResolvedValue(undefined);
    mockedUtils.getGridFieldMap.mockResolvedValue({ fieldMap: { SALESID: 0 }, systemColumnCount: 0 });
    mockedUtils.setGridPageSize.mockResolvedValue(undefined);
    mockedUtils.getVisibleRowCount.mockResolvedValue(1);
    mockedUtils.hasNextPage.mockResolvedValue(true);
    mockedUtils.ensureFilterValue.mockResolvedValue({ originalXafValue: null, controlId: undefined });

    page.evaluate
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce([['ORD-001']]);

    mockedMapper.buildRowExtractor.mockReturnValue(
      (cells: string[]) => ({ orderNumber: cells[0] }),
    );

    const rows = await scrapeListView(page as any, baseConfig, undefined, shouldStop);

    expect(rows).toEqual([{ orderNumber: 'ORD-001' }]);
    expect(mockedUtils.goToNextPage).not.toHaveBeenCalled();
  });

  test('calls onProgress callback with page info', async () => {
    const page = createMockPage();
    const onProgress = vi.fn();

    mockedUtils.waitForDevExpressIdle.mockResolvedValue(undefined);
    mockedUtils.gotoFirstPage.mockResolvedValue(undefined);
    mockedUtils.getGridFieldMap.mockResolvedValue({ fieldMap: { SALESID: 0 }, systemColumnCount: 0 });
    mockedUtils.setGridPageSize.mockResolvedValue(undefined);
    mockedUtils.getVisibleRowCount.mockResolvedValue(1);
    mockedUtils.hasNextPage.mockResolvedValue(false);
    mockedUtils.ensureFilterValue.mockResolvedValue({ originalXafValue: null, controlId: undefined });

    page.evaluate
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce([['ORD-001']]);

    mockedMapper.buildRowExtractor.mockReturnValue(
      (cells: string[]) => ({ orderNumber: cells[0] }),
    );

    await scrapeListView(page as any, baseConfig, onProgress);

    expect(onProgress).toHaveBeenCalledWith({
      currentPage: 1,
      rowsOnPage: 1,
      totalRowsSoFar: 1,
    });
  });

  test('uses custom pageSize from config', async () => {
    const page = createMockPage();
    const configWithPageSize: ScraperConfig = {
      ...baseConfig,
      pageSize: 100,
    };

    mockedUtils.waitForDevExpressIdle.mockResolvedValue(undefined);
    mockedUtils.gotoFirstPage.mockResolvedValue(undefined);
    mockedUtils.getGridFieldMap.mockResolvedValue({ fieldMap: { SALESID: 0 }, systemColumnCount: 0 });
    mockedUtils.setGridPageSize.mockResolvedValue(undefined);
    mockedUtils.getVisibleRowCount.mockResolvedValue(0);
    mockedUtils.hasNextPage.mockResolvedValue(false);
    mockedUtils.ensureFilterValue.mockResolvedValue({ originalXafValue: null, controlId: undefined });
    mockedMapper.buildRowExtractor.mockReturnValue(() => ({}));

    page.evaluate.mockResolvedValue(0);

    await scrapeListView(page as any, configWithPageSize);

    expect(mockedUtils.setGridPageSize).toHaveBeenCalledWith(page, 100);
  });

  test('restores filter even when scraping throws', async () => {
    const page = createMockPage();
    const configWithFilter: ScraperConfig = {
      ...baseConfig,
      filter: { xafValuePattern: 'OrdersAll', xafAllValue: 'xaf_xaf_a2ListViewSalesTableOrdersAll' },
    };

    mockedUtils.waitForDevExpressIdle.mockResolvedValue(undefined);
    mockedUtils.gotoFirstPage.mockResolvedValue(undefined);
    mockedUtils.getGridFieldMap.mockRejectedValue(new Error('Grid not found'));
    mockedUtils.ensureFilterValue.mockResolvedValue({ originalXafValue: 'xaf_xaf_a2OpenOrders', controlId: 'ctrl1' });
    mockedUtils.restoreFilterValue.mockResolvedValue(undefined);

    await expect(scrapeListView(page as any, configWithFilter)).rejects.toThrow('Grid not found');

    expect(mockedUtils.restoreFilterValue).toHaveBeenCalledWith(page, 'xaf_xaf_a2OpenOrders', 'ctrl1');
  });

  test('calls gotoFirstPage after navigation and before filter', async () => {
    const page = createMockPage();
    const callOrder: string[] = [];

    mockedUtils.waitForDevExpressIdle.mockResolvedValue(undefined);
    mockedUtils.gotoFirstPage.mockImplementation(async () => { callOrder.push('gotoFirstPage'); });
    mockedUtils.ensureFilterValue.mockImplementation(async () => {
      callOrder.push('ensureFilterValue');
      return { originalXafValue: null, controlId: undefined };
    });
    mockedUtils.getGridFieldMap.mockResolvedValue({ fieldMap: { SALESID: 0 }, systemColumnCount: 0 });
    mockedUtils.setGridPageSize.mockResolvedValue(undefined);
    mockedUtils.getVisibleRowCount.mockResolvedValue(0);
    mockedUtils.hasNextPage.mockResolvedValue(false);
    mockedMapper.buildRowExtractor.mockReturnValue(() => ({}));

    page.evaluate.mockResolvedValue(0);

    const configWithFilter: ScraperConfig = {
      ...baseConfig,
      filter: { xafValuePattern: 'OrdersAll', xafAllValue: 'xaf_xaf_a2ListViewSalesTableOrdersAll' },
    };

    await scrapeListView(page as any, configWithFilter);

    expect(callOrder).toEqual(['gotoFirstPage', 'ensureFilterValue']);
  });
});
