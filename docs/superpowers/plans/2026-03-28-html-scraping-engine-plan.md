# HTML Scraping Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic HTML scraping engine that reads data directly from DevExpress grids, replacing the PDF export→parse pipeline with 5-10x faster DOM extraction.

**Architecture:** A generic `scrapeListView(page, config)` function navigates to an ERP ListView, ensures correct filter, sets page size to 200, builds a dynamic header→index map from grid column metadata, iterates pages extracting rows from `tr.dxgvDataRow_XafTheme`, and returns typed arrays matching the existing `ParsedXxx` types used by sync services. Per-entity configs map DevExpress `fieldName`s to sync type properties. The sync services remain unchanged — only the data source switches from PDF to HTML.

**Tech Stack:** TypeScript, Puppeteer (Page API), DevExpress client-side JS API, vitest

**Spec:** `docs/superpowers/specs/2026-03-28-sync-system-redesign-design.md` (sections 4, 5)

**Depends on:** Plan 1 (completed). This plan creates the scraper module. Plan 3 will wire it into handlers.

---

## File Structure

### New files (all under `archibald-web-app/backend/src/sync/scraper/`)
- `types.ts` — Shared types: `ScraperConfig`, `ColumnMapping`, `FilterConfig`
- `devexpress-utils.ts` — DevExpress grid utilities: idle wait, page size, filter management
- `devexpress-utils.spec.ts` — Tests with mocked page
- `header-mapper.ts` — Dynamic header→index mapper using DevExpress JS API
- `header-mapper.spec.ts` — Tests
- `list-view-scraper.ts` — Generic list view scraper function
- `list-view-scraper.spec.ts` — Tests
- `configs/customers.ts` — Customer field mapping config
- `configs/orders.ts` — Order field mapping config
- `configs/ddt.ts` — DDT field mapping config
- `configs/invoices.ts` — Invoice field mapping config
- `configs/products.ts` — Product field mapping config
- `configs/prices.ts` — Price field mapping config
- `configs/index.ts` — Re-exports all configs

### Referenced files (NOT modified in this plan — will be modified in Plan 3)
- `src/sync/services/customer-sync.ts` — Has `ParsedCustomer` type (lines 5-34)
- `src/sync/services/order-sync.ts` — Has `ParsedOrder` type (lines 7-31)
- `src/sync/services/ddt-sync.ts` — Has `ParsedDdt` type (lines 5-24)
- `src/sync/services/invoice-sync.ts` — Has `ParsedInvoice` type (lines 6-27)
- `src/sync/services/product-sync.ts` — Has `ParsedProduct` type (lines 6-40)
- `src/sync/services/price-sync.ts` — Has `ParsedPrice` type (lines 6-21)

---

### Task 1: Scraper types and DevExpress utilities

**Files:**
- Create: `src/sync/scraper/types.ts`
- Create: `src/sync/scraper/devexpress-utils.ts`
- Create: `src/sync/scraper/devexpress-utils.spec.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// src/sync/scraper/types.ts
import type { Page } from 'puppeteer';

type FieldParser = (rawValue: string) => unknown;

type ColumnMapping = {
  fieldName: string;        // DevExpress grid fieldName (e.g. 'SALESID', 'NAME')
  targetField: string;      // Property name on the ParsedXxx type (e.g. 'orderNumber', 'name')
  parser?: FieldParser;     // Optional value transform (e.g. parse date, parse number)
};

type FilterConfig = {
  safeValue: string;        // The "show all" filter value (e.g. 'Tutti gli ordini')
  safeValueAlt?: string;    // Alternative in other language (e.g. 'All orders')
};

type ScraperConfig = {
  url: string;              // ERP ListView URL (e.g. 'https://4.231.124.90/Archibald/CUSTTABLE_ListView_Agent/')
  columns: ColumnMapping[];
  filter?: FilterConfig;    // If the page has a persistent filter
  pageSize?: number;        // Default 200
};

type ScrapedRow = Record<string, unknown>;

export type { ColumnMapping, FieldParser, FilterConfig, ScraperConfig, ScrapedRow };
```

- [ ] **Step 2: Write failing tests for devexpress-utils**

```typescript
// src/sync/scraper/devexpress-utils.spec.ts
import { describe, expect, test, vi } from 'vitest';
import { waitForDevExpressIdle, setGridPageSize, getGridFieldMap } from './devexpress-utils';

function mockPage(evaluateResult: unknown = undefined) {
  return {
    evaluate: vi.fn().mockResolvedValue(evaluateResult),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
  };
}

describe('waitForDevExpressIdle', () => {
  test('calls page.waitForFunction with DevExpress idle check', async () => {
    const page = mockPage();
    await waitForDevExpressIdle(page as any);
    expect(page.waitForFunction).toHaveBeenCalled();
  });
});

describe('getGridFieldMap', () => {
  test('returns fieldName→columnIndex map from DevExpress grid API', async () => {
    const page = mockPage([
      { fieldName: 'ID', visible: true, visibleIndex: 2 },
      { fieldName: 'NAME', visible: true, visibleIndex: 3 },
      { fieldName: 'HIDDEN', visible: false, visibleIndex: -1 },
    ]);
    const result = await getGridFieldMap(page as any);
    expect(result).toEqual({ ID: 0, NAME: 1 });
  });
});

describe('setGridPageSize', () => {
  test('calls evaluate with page size callback', async () => {
    const page = mockPage(true);
    const result = await setGridPageSize(page as any, 200);
    expect(result).toBe(true);
    expect(page.evaluate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
npm test --prefix archibald-web-app/backend -- --run src/sync/scraper/devexpress-utils.spec.ts
```

- [ ] **Step 4: Implement devexpress-utils.ts**

```typescript
// src/sync/scraper/devexpress-utils.ts
import type { Page } from 'puppeteer';
import { logger } from '../../logger';

const IDLE_TIMEOUT_MS = 30_000;
const IDLE_POLL_INTERVAL_MS = 200;
const STABLE_POLLS_REQUIRED = 3;

async function waitForDevExpressIdle(page: Page, timeoutMs = IDLE_TIMEOUT_MS): Promise<void> {
  await page.waitForFunction(
    (stableNeeded: number, pollMs: number) => {
      const w = window as any;
      // Check no loading panels visible
      const loadingPanels = document.querySelectorAll('[id*="LPV"]:not([style*="display: none"]), .dxlp:not([style*="display: none"])');
      if (loadingPanels.length > 0) { w.__dxIdleCount = 0; return false; }
      // Check no ASPxClientControl in callback
      if (typeof w.ASPxClientControl !== 'undefined') {
        const controls = w.ASPxClientControl.GetControlCollection?.()?.GetAllControls?.() || [];
        for (const ctrl of controls) {
          if (ctrl.InCallback?.()) { w.__dxIdleCount = 0; return false; }
        }
      }
      w.__dxIdleCount = (w.__dxIdleCount || 0) + 1;
      return w.__dxIdleCount >= stableNeeded;
    },
    { timeout: timeoutMs, polling: pollMs },
    STABLE_POLLS_REQUIRED,
    IDLE_POLL_INTERVAL_MS,
  );
}

async function getGridFieldMap(page: Page): Promise<Record<string, number>> {
  const columns = await page.evaluate(() => {
    const gridKeys = Object.keys(window).filter(k => {
      try { return (window as any)[k]?.GetColumn && typeof (window as any)[k].GetColumn === 'function'; }
      catch { return false; }
    });
    if (gridKeys.length === 0) return [];
    const grid = (window as any)[gridKeys[0]];
    const count = grid.GetColumnCount();
    const result: Array<{ fieldName: string; visible: boolean; visibleIndex: number }> = [];
    for (let i = 0; i < count; i++) {
      const col = grid.GetColumn(i);
      result.push({ fieldName: col.fieldName, visible: col.visible, visibleIndex: col.visibleIndex });
    }
    return result;
  });

  // Build fieldName→position map for visible columns only, sorted by visibleIndex
  const visible = columns
    .filter(c => c.visible && c.visibleIndex >= 0)
    .sort((a, b) => a.visibleIndex - b.visibleIndex);

  const fieldMap: Record<string, number> = {};
  visible.forEach((col, idx) => { fieldMap[col.fieldName] = idx; });
  return fieldMap;
}

async function setGridPageSize(page: Page, size: number): Promise<boolean> {
  const changed = await page.evaluate((targetSize: number) => {
    const gridKeys = Object.keys(window).filter(k => {
      try { return (window as any)[k]?.PerformCallback && typeof (window as any)[k].PerformCallback === 'function'; }
      catch { return false; }
    });
    if (gridKeys.length === 0) return false;
    const grid = (window as any)[gridKeys[0]];
    grid.PerformCallback(`PAGESIZE|${targetSize}`);
    return true;
  }, size);

  if (changed) {
    await waitForDevExpressIdle(page);
  }
  return changed;
}

async function getVisibleRowCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    return document.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[class*="dxgvDataRow"]').length;
  });
}

async function hasNextPage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const gridKeys = Object.keys(window).filter(k => {
      try { return (window as any)[k]?.GetPageIndex && typeof (window as any)[k].GetPageIndex === 'function'; }
      catch { return false; }
    });
    if (gridKeys.length === 0) return false;
    const grid = (window as any)[gridKeys[0]];
    return grid.GetPageIndex() < grid.GetPageCount() - 1;
  });
}

async function goToNextPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const gridKeys = Object.keys(window).filter(k => {
      try { return (window as any)[k]?.NextPage && typeof (window as any)[k].NextPage === 'function'; }
      catch { return false; }
    });
    if (gridKeys.length === 0) return;
    (window as any)[gridKeys[0]].NextPage();
  });
  await waitForDevExpressIdle(page);
}

async function ensureFilterValue(page: Page, safeValue: string, safeValueAlt?: string): Promise<string | null> {
  const originalValue = await page.evaluate((safe: string, safeAlt: string | undefined) => {
    // Find the filter dropdown (ComboBox near the grid)
    const combos = Object.keys(window).filter(k => {
      try {
        const ctrl = (window as any)[k];
        return ctrl?.GetValue && ctrl?.SetValue && ctrl?.GetItemCount && typeof ctrl.GetValue === 'function';
      } catch { return false; }
    });
    if (combos.length === 0) return null;

    // Find the one that has our safe value in its items
    for (const key of combos) {
      const combo = (window as any)[key];
      const currentValue = combo.GetText?.() || '';
      const itemCount = combo.GetItemCount();
      let hasSafeItem = false;
      for (let i = 0; i < itemCount; i++) {
        const item = combo.GetItem(i);
        const text = item?.text || item?.Text || '';
        if (text === safe || (safeAlt && text === safeAlt)) {
          hasSafeItem = true;
          break;
        }
      }
      if (!hasSafeItem) continue;

      // This is the filter combo
      if (currentValue === safe || (safeAlt && currentValue === safeAlt)) {
        return null; // Already correct
      }

      // Change to safe value
      for (let i = 0; i < itemCount; i++) {
        const item = combo.GetItem(i);
        const text = item?.text || item?.Text || '';
        if (text === safe || (safeAlt && text === safeAlt)) {
          combo.SetSelectedIndex(i);
          return currentValue; // Return original for restoration
        }
      }
    }
    return null;
  }, safeValue, safeValueAlt);

  if (originalValue !== null) {
    await waitForDevExpressIdle(page);
    logger.info('[scraper] Filter changed to safe value', { from: originalValue, to: safeValue });
  }

  return originalValue;
}

async function restoreFilterValue(page: Page, originalText: string): Promise<void> {
  await page.evaluate((text: string) => {
    const combos = Object.keys(window).filter(k => {
      try {
        const ctrl = (window as any)[k];
        return ctrl?.GetValue && ctrl?.SetValue && ctrl?.GetItemCount && typeof ctrl.GetValue === 'function';
      } catch { return false; }
    });
    for (const key of combos) {
      const combo = (window as any)[key];
      const count = combo.GetItemCount();
      for (let i = 0; i < count; i++) {
        const item = combo.GetItem(i);
        if ((item?.text || item?.Text || '') === text) {
          combo.SetSelectedIndex(i);
          return;
        }
      }
    }
  }, originalText);
  await waitForDevExpressIdle(page);
}

export {
  waitForDevExpressIdle,
  getGridFieldMap,
  setGridPageSize,
  getVisibleRowCount,
  hasNextPage,
  goToNextPage,
  ensureFilterValue,
  restoreFilterValue,
  IDLE_TIMEOUT_MS,
};
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test --prefix archibald-web-app/backend -- --run src/sync/scraper/devexpress-utils.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/sync/scraper/types.ts \
        archibald-web-app/backend/src/sync/scraper/devexpress-utils.ts \
        archibald-web-app/backend/src/sync/scraper/devexpress-utils.spec.ts
git commit -m "feat(scraper): DevExpress grid utilities — idle wait, pagination, filter management"
```

---

### Task 2: Header mapper

**Files:**
- Create: `src/sync/scraper/header-mapper.ts`
- Create: `src/sync/scraper/header-mapper.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/sync/scraper/header-mapper.spec.ts
import { describe, expect, test } from 'vitest';
import { buildRowExtractor } from './header-mapper';
import type { ColumnMapping } from './types';

describe('buildRowExtractor', () => {
  const columns: ColumnMapping[] = [
    { fieldName: 'ID', targetField: 'id' },
    { fieldName: 'NAME', targetField: 'name' },
    { fieldName: 'AMOUNT', targetField: 'amount', parser: (v) => parseFloat(v.replace(',', '.')) },
  ];

  test('maps fieldName indices to targetField properties', () => {
    const fieldMap = { ID: 0, NAME: 1, AMOUNT: 2 };
    const extractor = buildRowExtractor(columns, fieldMap);
    const cells = ['42', 'Test Customer', '1.234,56'];
    const result = extractor(cells);
    expect(result).toEqual({ id: '42', name: 'Test Customer', amount: 1234.56 });
  });

  test('returns null for fieldName not in fieldMap', () => {
    const fieldMap = { ID: 0 }; // NAME and AMOUNT missing
    const extractor = buildRowExtractor(columns, fieldMap);
    const cells = ['42'];
    const result = extractor(cells);
    expect(result).toEqual({ id: '42', name: undefined, amount: undefined });
  });

  test('skips columns with index out of cells range', () => {
    const fieldMap = { ID: 0, NAME: 5 }; // index 5 doesn't exist in cells
    const extractor = buildRowExtractor(columns, fieldMap);
    const cells = ['42'];
    const result = extractor(cells);
    expect(result).toEqual({ id: '42', name: undefined, amount: undefined });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- --run src/sync/scraper/header-mapper.spec.ts
```

- [ ] **Step 3: Implement header-mapper.ts**

```typescript
// src/sync/scraper/header-mapper.ts
import type { ColumnMapping, ScrapedRow } from './types';

type RowExtractor = (cells: string[]) => ScrapedRow;

function buildRowExtractor(columns: ColumnMapping[], fieldMap: Record<string, number>): RowExtractor {
  // Pre-compute the extraction plan: [cellIndex, targetField, parser?][]
  const plan = columns.map(col => ({
    cellIndex: fieldMap[col.fieldName] ?? -1,
    targetField: col.targetField,
    parser: col.parser,
  }));

  return (cells: string[]): ScrapedRow => {
    const row: ScrapedRow = {};
    for (const { cellIndex, targetField, parser } of plan) {
      if (cellIndex < 0 || cellIndex >= cells.length) {
        row[targetField] = undefined;
        continue;
      }
      const raw = cells[cellIndex];
      row[targetField] = parser ? parser(raw) : raw;
    }
    return row;
  };
}

export { buildRowExtractor };
export type { RowExtractor };
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test --prefix archibald-web-app/backend -- --run src/sync/scraper/header-mapper.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/sync/scraper/header-mapper.ts \
        archibald-web-app/backend/src/sync/scraper/header-mapper.spec.ts
git commit -m "feat(scraper): dynamic header→index mapper for DevExpress grids"
```

---

### Task 3: Generic list view scraper

**Files:**
- Create: `src/sync/scraper/list-view-scraper.ts`
- Create: `src/sync/scraper/list-view-scraper.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/sync/scraper/list-view-scraper.spec.ts
import { describe, expect, test, vi } from 'vitest';
import { scrapeListView } from './list-view-scraper';
import type { ScraperConfig } from './types';

// This tests the orchestration logic with fully mocked dependencies
describe('scrapeListView', () => {
  test('returns empty array when grid has no rows', async () => {
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn()
        .mockResolvedValueOnce([]) // getGridFieldMap returns empty
        .mockResolvedValueOnce(0),  // getVisibleRowCount returns 0
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
    };

    const config: ScraperConfig = {
      url: 'https://example.com/ListView/',
      columns: [{ fieldName: 'ID', targetField: 'id' }],
    };

    const result = await scrapeListView(mockPage as any, config);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- --run src/sync/scraper/list-view-scraper.spec.ts
```

- [ ] **Step 3: Implement list-view-scraper.ts**

```typescript
// src/sync/scraper/list-view-scraper.ts
import type { Page } from 'puppeteer';
import type { ScraperConfig, ScrapedRow } from './types';
import { waitForDevExpressIdle, getGridFieldMap, setGridPageSize, getVisibleRowCount, hasNextPage, goToNextPage, ensureFilterValue, restoreFilterValue } from './devexpress-utils';
import { buildRowExtractor } from './header-mapper';
import { logger } from '../../logger';

type ScrapeProgress = (progress: number, label?: string) => void;
type ShouldStop = () => boolean;

async function scrapeListView(
  page: Page,
  config: ScraperConfig,
  onProgress?: ScrapeProgress,
  shouldStop?: ShouldStop,
): Promise<ScrapedRow[]> {
  const { url, columns, filter, pageSize = 200 } = config;

  // Navigate to page
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });
  await waitForDevExpressIdle(page);

  // Pre-scrape filter check
  let originalFilter: string | null = null;
  if (filter) {
    originalFilter = await ensureFilterValue(page, filter.safeValue, filter.safeValueAlt);
  }

  // Set page size
  await setGridPageSize(page, pageSize);

  // Build field map from grid column metadata
  const fieldMap = await getGridFieldMap(page);
  if (Object.keys(fieldMap).length === 0) {
    logger.warn('[scraper] No visible columns found in grid', { url });
    return [];
  }

  // Verify critical columns exist
  const missingColumns = columns
    .filter(col => fieldMap[col.fieldName] === undefined)
    .map(col => col.fieldName);
  if (missingColumns.length > 0) {
    logger.warn('[scraper] Missing columns in grid', { url, missing: missingColumns });
  }

  const extractor = buildRowExtractor(columns, fieldMap);
  const allRows: ScrapedRow[] = [];
  let pageIndex = 0;

  // Iterate pages
  while (true) {
    if (shouldStop?.()) {
      logger.info('[scraper] Stopped by shouldStop', { url, pagesScraped: pageIndex, rowsCollected: allRows.length });
      break;
    }

    // Extract rows from current page
    const rowData = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[class*="dxgvDataRow"]');
      return Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        return Array.from(cells).map(cell => (cell.textContent || '').trim());
      });
    });

    for (const cells of rowData) {
      allRows.push(extractor(cells));
    }

    pageIndex++;
    onProgress?.(Math.min(95, pageIndex * 10), `Page ${pageIndex}: ${allRows.length} rows`);

    // Check if there are more pages
    const more = await hasNextPage(page);
    if (!more || rowData.length < pageSize) break;

    await goToNextPage(page);
  }

  // Restore filter if we changed it
  if (originalFilter !== null) {
    await restoreFilterValue(page, originalFilter).catch(err => {
      logger.warn('[scraper] Failed to restore filter', { url, error: String(err) });
    });
  }

  onProgress?.(100, `Done: ${allRows.length} rows`);
  logger.info('[scraper] Scrape complete', { url, pages: pageIndex, rows: allRows.length });

  return allRows;
}

export { scrapeListView };
export type { ScrapeProgress, ShouldStop };
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test --prefix archibald-web-app/backend -- --run src/sync/scraper/list-view-scraper.spec.ts
```

- [ ] **Step 5: Run full test suite**

```bash
npm test --prefix archibald-web-app/backend -- --run
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/sync/scraper/list-view-scraper.ts \
        archibald-web-app/backend/src/sync/scraper/list-view-scraper.spec.ts
git commit -m "feat(scraper): generic ListView scraper with pagination + filter management"
```

---

### Task 4: Entity configs — Customers, Orders, DDT

**Files:**
- Create: `src/sync/scraper/configs/customers.ts`
- Create: `src/sync/scraper/configs/orders.ts`
- Create: `src/sync/scraper/configs/ddt.ts`
- Create: `src/sync/scraper/configs/index.ts`

- [ ] **Step 1: Create customers.ts config**

The `ParsedCustomer` type in `customer-sync.ts` (lines 5-34) has 28 fields. Map them to ERP fieldNames from the Column Chooser map.

```typescript
// src/sync/scraper/configs/customers.ts
import type { ScraperConfig } from '../types';

function parseDate(raw: string): string | null {
  if (!raw || raw === '—') return null;
  return raw; // Dates arrive as DD/MM/YYYY from the ERP grid
}

function parseNumber(raw: string): number | null {
  if (!raw || raw === '') return null;
  const cleaned = raw.replace(/\./g, '').replace(',', '.').trim();
  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

const customersConfig: ScraperConfig = {
  url: 'https://4.231.124.90/Archibald/CUSTTABLE_ListView_Agent/',
  filter: {
    safeValue: 'Tutti i clienti',
    safeValueAlt: 'All customers',
  },
  columns: [
    { fieldName: 'ID', targetField: 'internalId' },
    { fieldName: 'ACCOUNTNUM', targetField: 'customerProfile' },
    { fieldName: 'NAME', targetField: 'name' },
    { fieldName: 'VATNUM', targetField: 'vatNumber' },
    { fieldName: 'LEGALEMAIL', targetField: 'pec' },
    { fieldName: 'LEGALAUTHORITY', targetField: 'sdi' },
    { fieldName: 'FISCALCODE', targetField: 'fiscalCode' },
    { fieldName: 'DLVMODE.TXT', targetField: 'deliveryTerms' },
    { fieldName: 'STREET', targetField: 'street' },
    { fieldName: 'LOGISTICSADDRESSZIPCODE.ZIPCODE', targetField: 'postalCode' },
    { fieldName: 'CITY', targetField: 'city' },
    { fieldName: 'PHONE', targetField: 'phone' },
    { fieldName: 'CELLULARPHONE', targetField: 'mobile' },
    { fieldName: 'URL', targetField: 'url' },
    { fieldName: 'BRASCRMATTENTIONTO', targetField: 'attentionTo' },
    { fieldName: 'LASTORDERDATE', targetField: 'lastOrderDate', parser: parseDate },
    { fieldName: 'ORDERCOUNTACT', targetField: 'actualOrderCount', parser: parseNumber },
    { fieldName: 'SALESACT', targetField: 'customerType', parser: parseNumber },
    { fieldName: 'ORDERCOUNTPREV', targetField: 'previousOrderCount1', parser: parseNumber },
    { fieldName: 'SALESPREV', targetField: 'previousSales1', parser: parseNumber },
    { fieldName: 'ORDERCOUNTPREV2', targetField: 'previousOrderCount2', parser: parseNumber },
    { fieldName: 'SALESPREV2', targetField: 'previousSales2', parser: parseNumber },
    { fieldName: 'BUSRELTYPEID.TYPEDESCRIPTION', targetField: 'description' },
    { fieldName: 'BUSRELTYPEID.TYPEID', targetField: 'type' },
    { fieldName: 'EXTERNALACCOUNTNUM', targetField: 'externalAccountNumber' },
    { fieldName: 'OURACCOUNTNUM', targetField: 'ourAccountNumber' },
  ],
};

export { customersConfig, parseDate, parseNumber };
```

- [ ] **Step 2: Create orders.ts config**

```typescript
// src/sync/scraper/configs/orders.ts
import type { ScraperConfig } from '../types';
import { parseDate, parseNumber } from './customers';

function parseBoolean(raw: string): boolean {
  const lower = raw.toLowerCase().trim();
  return lower === 'si' || lower === 'sì' || lower === 'yes' || lower === '✓';
}

const ordersConfig: ScraperConfig = {
  url: 'https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/',
  filter: {
    safeValue: 'Tutti gli ordini',
    safeValueAlt: 'All orders',
  },
  columns: [
    { fieldName: 'ID', targetField: 'id' },
    { fieldName: 'SALESID', targetField: 'orderNumber' },
    { fieldName: 'CUSTACCOUNT', targetField: 'customerProfileId' },
    { fieldName: 'SALESNAME', targetField: 'customerName' },
    { fieldName: 'DELIVERYNAME', targetField: 'deliveryName' },
    { fieldName: 'DLVADDRESS', targetField: 'deliveryAddress' },
    { fieldName: 'CREATEDDATETIME', targetField: 'date', parser: parseDate },
    { fieldName: 'DELIVERYDATE', targetField: 'deliveryDate', parser: parseDate },
    { fieldName: 'PURCHORDERFORMNUM', targetField: 'remainingSalesFinancial' },
    { fieldName: 'CUSTOMERREF', targetField: 'customerReference' },
    { fieldName: 'SALESSTATUS', targetField: 'status' },
    { fieldName: 'SALESTYPE', targetField: 'orderType' },
    { fieldName: 'DOCUMENTSTATUS', targetField: 'documentState' },
    { fieldName: 'SALESORIGINID.DESCRIPTION', targetField: 'salesOrigin' },
    { fieldName: 'TRANSFERSTATUS', targetField: 'transferStatus' },
    { fieldName: 'TRANSFERREDDATE', targetField: 'transferDate', parser: parseDate },
    { fieldName: 'COMPLETEDDATE', targetField: 'completionDate', parser: parseDate },
    { fieldName: 'QUOTE', targetField: 'isQuote', parser: parseBoolean },
    { fieldName: 'MANUALDISCOUNT', targetField: 'discountPercent', parser: parseNumber },
    { fieldName: 'GROSSAMOUNT', targetField: 'grossAmount', parser: parseNumber },
    { fieldName: 'AmountTotal', targetField: 'total', parser: parseNumber },
    { fieldName: 'SAMPLEORDER', targetField: 'isGiftOrder', parser: parseBoolean },
    { fieldName: 'EMAIL', targetField: 'email' },
  ],
};

export { ordersConfig, parseBoolean };
```

- [ ] **Step 3: Create ddt.ts config**

```typescript
// src/sync/scraper/configs/ddt.ts
import type { ScraperConfig } from '../types';
import { parseDate, parseNumber } from './customers';

function parseTracking(raw: string): { number: string; courier: string; url: string | null } | null {
  if (!raw || raw.trim() === '') return null;
  const text = raw.trim();
  const lower = text.toLowerCase();
  let courier = 'unknown';
  if (lower.startsWith('fedex') || lower.includes('fedex')) courier = 'FedEx';
  else if (lower.startsWith('ups') || lower.includes('ups')) courier = 'UPS';
  else if (lower.startsWith('brt') || lower.includes('brt') || lower.includes('bartolini')) courier = 'BRT';
  // Extract tracking number (everything after the courier name)
  const number = text.replace(/^(fedex|ups|brt|bartolini)\s*/i, '').trim();
  return { number, courier, url: null };
}

const ddtConfig: ScraperConfig = {
  url: 'https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/',
  filter: {
    safeValue: 'Tutti',
    safeValueAlt: 'All',
  },
  columns: [
    { fieldName: 'ID', targetField: 'ddtId' },
    { fieldName: 'PACKINGSLIPID', targetField: 'ddtNumber' },
    { fieldName: 'DELIVERYDATE', targetField: 'ddtDeliveryDate', parser: parseDate },
    { fieldName: 'SALESID', targetField: 'orderNumber' },
    { fieldName: 'ORDERACCOUNT', targetField: 'ddtCustomerAccount' },
    { fieldName: 'SALESTABLE.SALESNAME', targetField: 'ddtSalesName' },
    { fieldName: 'DELIVERYNAME', targetField: 'ddtDeliveryName' },
    { fieldName: 'DLVADDRESS', targetField: 'ddtDeliveryAddress' },
    { fieldName: 'QTY', targetField: 'ddtTotal', parser: parseNumber },
    { fieldName: 'CUSTOMERREF', targetField: 'ddtCustomerReference' },
    { fieldName: 'PURCHASEORDER', targetField: 'ddtDescription' },
    { fieldName: 'BRASTRACKINGNUMBER', targetField: 'trackingRaw' },
    { fieldName: 'DLVTERM.TXT', targetField: 'deliveryTerms' },
    { fieldName: 'DLVMODE.TXT', targetField: 'deliveryMethod' },
    { fieldName: 'BRASCRMATTENTIONTO', targetField: 'attentionTo' },
  ],
};

export { ddtConfig, parseTracking };
```

- [ ] **Step 4: Create configs/index.ts**

```typescript
// src/sync/scraper/configs/index.ts
export { customersConfig } from './customers';
export { ordersConfig } from './orders';
export { ddtConfig } from './ddt';
export { invoicesConfig } from './invoices';
export { productsConfig } from './products';
export { pricesConfig } from './prices';
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/sync/scraper/configs/
git commit -m "feat(scraper): entity configs — customers, orders, DDT field mappings"
```

---

### Task 5: Entity configs — Invoices, Products, Prices

**Files:**
- Create: `src/sync/scraper/configs/invoices.ts`
- Create: `src/sync/scraper/configs/products.ts`
- Create: `src/sync/scraper/configs/prices.ts`

- [ ] **Step 1: Create invoices.ts config**

```typescript
// src/sync/scraper/configs/invoices.ts
import type { ScraperConfig } from '../types';
import { parseDate, parseNumber } from './customers';
import { parseBoolean } from './orders';

const invoicesConfig: ScraperConfig = {
  url: 'https://4.231.124.90/Archibald/CUSTINVOICEJOUR_ListView/',
  filter: {
    safeValue: 'Tutti',
    safeValueAlt: 'All',
  },
  columns: [
    { fieldName: 'INVOICEID', targetField: 'invoiceNumber' },
    { fieldName: 'INVOICEDATE', targetField: 'invoiceDate', parser: parseDate },
    { fieldName: 'INVOICEACCOUNT', targetField: 'invoiceCustomerAccount' },
    { fieldName: 'INVOICINGNAME', targetField: 'invoiceBillingName' },
    { fieldName: 'QTY', targetField: 'invoiceQuantity', parser: parseNumber },
    { fieldName: 'SALESBALANCEMST', targetField: 'salesBalance', parser: parseNumber },
    { fieldName: 'SUMLINEDISCMST', targetField: 'invoiceLineDiscount', parser: parseNumber },
    { fieldName: 'ENDDISCMST', targetField: 'invoiceTotalDiscount', parser: parseNumber },
    { fieldName: 'SUMTAXMST', targetField: 'invoiceTaxAmount', parser: parseNumber },
    { fieldName: 'INVOICEAMOUNTMST', targetField: 'invoiceAmount', parser: parseNumber },
    { fieldName: 'PURCHASEORDER', targetField: 'invoicePurchaseOrder' },
    { fieldName: 'CUSTOMERREF', targetField: 'customerReference' },
    { fieldName: 'DUEDATE', targetField: 'invoiceDueDate', parser: parseDate },
    { fieldName: 'PAYMTERMID.DESCRIPTION', targetField: 'invoicePaymentTermsId' },
    { fieldName: 'OVERDUEDAYS', targetField: 'invoiceDaysPastDue', parser: parseNumber },
    { fieldName: 'SETTLEAMOUNTMST', targetField: 'invoiceSettledAmount', parser: parseNumber },
    { fieldName: 'LASTSETTLEVOUCHER', targetField: 'invoiceLastPaymentId' },
    { fieldName: 'LASTSETTLEDATE', targetField: 'invoiceLastSettlementDate', parser: parseDate },
    { fieldName: 'CLOSED', targetField: 'invoiceClosed', parser: parseDate },
    { fieldName: 'REMAINAMOUNTMST', targetField: 'invoiceRemainingAmount', parser: parseNumber },
    { fieldName: 'SALESID', targetField: 'orderNumber' },
  ],
};

export { invoicesConfig };
```

- [ ] **Step 2: Create products.ts config**

```typescript
// src/sync/scraper/configs/products.ts
import type { ScraperConfig } from '../types';
import { parseNumber, parseDate } from './customers';
import { parseBoolean } from './orders';

const productsConfig: ScraperConfig = {
  url: 'https://4.231.124.90/Archibald/INVENTTABLE_ListView/',
  // No filter — products page has no persistent filter
  columns: [
    { fieldName: 'ITEMID', targetField: 'id' },
    { fieldName: 'NAME', targetField: 'name' },
    { fieldName: 'DESCRIPTION', targetField: 'description' },
    { fieldName: 'PRODUCTGROUPID.ID', targetField: 'groupCode' },
    { fieldName: 'BRASPACKINGCONTENTS', targetField: 'packageContent', parser: parseNumber },
    { fieldName: 'SEARCHNAME', targetField: 'searchName' },
    { fieldName: 'PRICEUNIT', targetField: 'priceUnit', parser: parseNumber },
    { fieldName: 'PRODUCTGROUPID.PRODUCTGROUPID', targetField: 'productGroupId' },
    { fieldName: 'PRODUCTGROUPID.PRODUCTGROUP1', targetField: 'productGroupDescription' },
    { fieldName: 'LOWESTQTY', targetField: 'minQty', parser: parseNumber },
    { fieldName: 'MULTIPLEQTY', targetField: 'multipleQty', parser: parseNumber },
    { fieldName: 'HIGHESTQTY', targetField: 'maxQty', parser: parseNumber },
    { fieldName: 'BRASFIGURE', targetField: 'figure' },
    { fieldName: 'BRASITEMIDBULK', targetField: 'bulkArticleId' },
    { fieldName: 'BRASPACKAGEEXPERTS', targetField: 'legPackage' },
    { fieldName: 'BRASSIZE', targetField: 'size' },
    { fieldName: 'CONFIGID', targetField: 'configurationId' },
    { fieldName: 'CREATEDBY', targetField: 'createdBy' },
    { fieldName: 'CREATEDDATETIME', targetField: 'createdDateField', parser: parseDate },
    { fieldName: 'DATAAREAID', targetField: 'dataAreaId' },
    { fieldName: 'DEFAULTSALESQTY', targetField: 'defaultQty', parser: parseNumber },
    { fieldName: 'DISPLAYPRODUCTNUMBER', targetField: 'displayProductNumber' },
    { fieldName: 'ENDDISC', targetField: 'totalAbsoluteDiscount' },
    { fieldName: 'ID', targetField: 'productIdExt' },
    { fieldName: 'LINEDISC.ID', targetField: 'lineDiscount' },
    { fieldName: 'MODIFIEDBY', targetField: 'modifiedBy' },
    { fieldName: 'MODIFIEDDATETIME', targetField: 'modifiedDatetime', parser: parseDate },
    { fieldName: 'ORDERITEM', targetField: 'orderableArticle' },
    { fieldName: 'PURCHPRICEPCS', targetField: 'purchPrice', parser: parseNumber },
    { fieldName: 'STANDARDCONFIGID', targetField: 'pcsStandardConfigurationId' },
    { fieldName: 'STANDARDQTY', targetField: 'standardQty', parser: parseNumber },
    { fieldName: 'STOPPED', targetField: 'stopped', parser: parseBoolean },
    { fieldName: 'UNITID', targetField: 'unitId' },
  ],
};

export { productsConfig };
```

- [ ] **Step 3: Create prices.ts config**

```typescript
// src/sync/scraper/configs/prices.ts
import type { ScraperConfig } from '../types';
import { parseNumber, parseDate } from './customers';

const pricesConfig: ScraperConfig = {
  url: 'https://4.231.124.90/Archibald/PRICEDISCTABLE_ListView/',
  filter: {
    safeValue: 'Prezzi attivi',
    safeValueAlt: 'Active prices',
  },
  columns: [
    { fieldName: 'ID', targetField: 'priceId' },
    { fieldName: 'ACCOUNTCODE', targetField: 'accountCode' },
    { fieldName: 'ACCOUNTRELATIONID', targetField: 'accountRelationId' },
    { fieldName: 'ACCOUNTRELATIONTXT', targetField: 'accountDescription' },
    { fieldName: 'ITEMRELATIONID', targetField: 'productId' },
    { fieldName: 'ITEMRELATIONTXT', targetField: 'productName' },
    { fieldName: 'FROMDATE', targetField: 'priceValidFrom', parser: parseDate },
    { fieldName: 'TODATE', targetField: 'priceValidTo', parser: parseDate },
    { fieldName: 'QUANTITYAMOUNTFROM', targetField: 'priceQtyFrom', parser: parseNumber },
    { fieldName: 'QUANTITYAMOUNTTO', targetField: 'priceQtyTo', parser: parseNumber },
    { fieldName: 'PRICEUNIT', targetField: 'priceUnit', parser: parseNumber },
    { fieldName: 'AMOUNT', targetField: 'unitPrice', parser: parseNumber },
    { fieldName: 'CURRENCY', targetField: 'currency' },
    { fieldName: 'BRASNETPRICE', targetField: 'netPriceBrasseler' },
  ],
};

export { pricesConfig };
```

- [ ] **Step 4: Update configs/index.ts with the three new configs**

Ensure `configs/index.ts` exports all 6 configs.

- [ ] **Step 5: Run build**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/sync/scraper/configs/
git commit -m "feat(scraper): entity configs — invoices, products, prices field mappings"
```

---

### Task 6: Config validation tests

**Files:**
- Create: `src/sync/scraper/configs/configs.spec.ts`

- [ ] **Step 1: Write tests that validate all 6 configs**

```typescript
// src/sync/scraper/configs/configs.spec.ts
import { describe, expect, test } from 'vitest';
import { customersConfig } from './customers';
import { ordersConfig } from './orders';
import { ddtConfig } from './ddt';
import { invoicesConfig } from './invoices';
import { productsConfig } from './products';
import { pricesConfig } from './prices';
import type { ScraperConfig } from '../types';

const allConfigs: [string, ScraperConfig][] = [
  ['customers', customersConfig],
  ['orders', ordersConfig],
  ['ddt', ddtConfig],
  ['invoices', invoicesConfig],
  ['products', productsConfig],
  ['prices', pricesConfig],
];

describe('scraper configs', () => {
  test.each(allConfigs)('%s config has valid URL', (name, config) => {
    expect(config.url).toMatch(/^https:\/\/4\.231\.124\.90\/Archibald\//);
  });

  test.each(allConfigs)('%s config has at least 5 column mappings', (name, config) => {
    expect(config.columns.length).toBeGreaterThanOrEqual(5);
  });

  test.each(allConfigs)('%s config has unique targetField names', (name, config) => {
    const targets = config.columns.map(c => c.targetField);
    expect(new Set(targets).size).toBe(targets.length);
  });

  test.each(allConfigs)('%s config has unique fieldName values', (name, config) => {
    const fields = config.columns.map(c => c.fieldName);
    expect(new Set(fields).size).toBe(fields.length);
  });

  test('customers config maps all 26 visible columns', () => {
    expect(customersConfig.columns.length).toBe(26);
  });

  test('orders config maps all 23 visible columns', () => {
    expect(ordersConfig.columns.length).toBe(23);
  });

  test('products config maps 33 columns (35 visible minus image and shank)', () => {
    expect(productsConfig.columns.length).toBe(33);
  });

  test('customers and ddt configs have filter defined', () => {
    expect(customersConfig.filter).toBeDefined();
    expect(ddtConfig.filter).toBeDefined();
  });

  test('products config has NO filter', () => {
    expect(productsConfig.filter).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test --prefix archibald-web-app/backend -- --run src/sync/scraper/configs/configs.spec.ts
```

- [ ] **Step 3: Fix any failing assertions** (adjust counts if needed based on actual column mappings)

- [ ] **Step 4: Run full test suite and build**

```bash
npm test --prefix archibald-web-app/backend -- --run
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/sync/scraper/configs/configs.spec.ts
git commit -m "test(scraper): validation tests for all 6 entity scraper configs"
```

---

## Summary

| Task | What | Files |
|:----:|------|:-----:|
| 1 | Scraper types + DevExpress utilities | types.ts, devexpress-utils.ts |
| 2 | Dynamic header→index mapper | header-mapper.ts |
| 3 | Generic ListView scraper | list-view-scraper.ts |
| 4 | Entity configs: customers, orders, DDT | configs/customers.ts, orders.ts, ddt.ts |
| 5 | Entity configs: invoices, products, prices | configs/invoices.ts, products.ts, prices.ts |
| 6 | Config validation tests | configs/configs.spec.ts |

After this plan, the HTML scraping engine exists as a standalone module in `src/sync/scraper/`. It is NOT yet wired into the handlers — that happens in **Plan 3** where:
- The sync handlers switch from `bot.downloadPDF → parser → adapter` to `bot.acquireContext → scrapeListView(page, config)`
- The chain is removed
- The 4-queue architecture is implemented
