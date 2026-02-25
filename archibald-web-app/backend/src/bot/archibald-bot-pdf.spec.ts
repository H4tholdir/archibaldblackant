import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { BrowserContext, Page, CDPSession, Target } from 'puppeteer';
import * as fsp from 'fs/promises';

vi.mock('../config', () => ({
  config: {
    archibald: { url: 'https://test.example.com/Archibald' },
  },
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(Buffer.from('pdf-content')),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import { ArchibaldBot } from './archibald-bot';

function createMockPage(): Page {
  const cdpSession = {
    send: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
  } as unknown as CDPSession;

  const target = {
    createCDPSession: vi.fn().mockResolvedValue(cdpSession),
  } as unknown as Target;

  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue({ click: vi.fn() }),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    click: vi.fn().mockResolvedValue(undefined),
    target: vi.fn().mockReturnValue(target),
    close: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
    $: vi.fn().mockResolvedValue(null),
  } as unknown as Page;

  return page;
}

function createMockContext(page: Page): BrowserContext {
  return {
    newPage: vi.fn().mockResolvedValue(page),
  } as unknown as BrowserContext;
}

describe('downloadSingleDDTPDF', () => {
  let bot: ArchibaldBot;

  beforeEach(() => {
    vi.clearAllMocks();
    bot = new ArchibaldBot('test-user', {});
  });

  test('navigates to DDT list and searches for orderNumber', async () => {
    const page = createMockPage();
    const context = createMockContext(page);

    vi.mocked(fsp.readdir).mockResolvedValueOnce([]).mockResolvedValueOnce(['ddt-doc.pdf'] as unknown as never[]);
    vi.mocked(fsp.readFile).mockResolvedValue(Buffer.from('ddt-pdf-content'));

    const result = await bot.downloadSingleDDTPDF(context, 'ORD-001');

    expect(context.newPage).toHaveBeenCalled();
    expect(page.goto).toHaveBeenCalledWith(
      expect.stringContaining('/CUSTPACKINGSLIPJOUR_ListView/'),
      expect.any(Object),
    );
    expect(result).toBeInstanceOf(Buffer);
    expect(page.close).toHaveBeenCalled();
  });

  test('cleans up page on error', async () => {
    const page = createMockPage();
    const context = createMockContext(page);
    vi.mocked(page.goto).mockRejectedValue(new Error('Navigation failed'));

    await expect(bot.downloadSingleDDTPDF(context, 'ORD-001')).rejects.toThrow('Navigation failed');
    expect(page.close).toHaveBeenCalled();
  });
});

describe('downloadSingleInvoicePDF', () => {
  let bot: ArchibaldBot;

  beforeEach(() => {
    vi.clearAllMocks();
    bot = new ArchibaldBot('test-user', {});
  });

  test('navigates to Invoice list and searches for orderNumber', async () => {
    const page = createMockPage();
    const context = createMockContext(page);

    vi.mocked(fsp.readdir).mockResolvedValueOnce([]).mockResolvedValueOnce(['invoice-doc.pdf'] as unknown as never[]);
    vi.mocked(fsp.readFile).mockResolvedValue(Buffer.from('invoice-pdf-content'));

    const result = await bot.downloadSingleInvoicePDF(context, 'ORD-002');

    expect(context.newPage).toHaveBeenCalled();
    expect(page.goto).toHaveBeenCalledWith(
      expect.stringContaining('/CUSTINVOICEJOUR_ListView/'),
      expect.any(Object),
    );
    expect(result).toBeInstanceOf(Buffer);
    expect(page.close).toHaveBeenCalled();
  });

  test('cleans up page on error', async () => {
    const page = createMockPage();
    const context = createMockContext(page);
    vi.mocked(page.goto).mockRejectedValue(new Error('Navigation failed'));

    await expect(bot.downloadSingleInvoicePDF(context, 'ORD-002')).rejects.toThrow('Navigation failed');
    expect(page.close).toHaveBeenCalled();
  });
});
