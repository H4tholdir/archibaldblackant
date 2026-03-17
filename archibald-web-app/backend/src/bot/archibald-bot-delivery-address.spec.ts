import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomerAddress } from '../db/repositories/customer-addresses';
import { ArchibaldBot } from './archibald-bot';

const makePageMock = () => ({
  evaluate: vi.fn().mockResolvedValue(null),
  $: vi.fn().mockResolvedValue(null),
  click: vi.fn().mockResolvedValue(undefined),
  waitForSelector: vi.fn().mockResolvedValue(null),
  keyboard: {
    type: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
  },
  waitForFunction: vi.fn().mockResolvedValue(undefined),
});

function makeBot(pageMock: ReturnType<typeof makePageMock>): ArchibaldBot {
  const bot = new ArchibaldBot();
  (bot as any).page = pageMock;
  (bot as any).waitForDevExpressIdle = vi.fn().mockResolvedValue(undefined);
  return bot;
}

const addressLioni: CustomerAddress = {
  id: 1,
  userId: 'u1',
  customerProfile: '55.227',
  tipo: 'Indir. cons. alt.',
  nome: null,
  via: 'Via Francesco Petrarca, 26',
  cap: '83055',
  citta: 'Lioni',
  contea: null,
  stato: null,
  idRegione: null,
  contra: null,
};

// Helpers for the three sequential page.$ calls in the happy path:
// 1. fieldInput, 2. searchBox (popup search field), 3. firstRow
const makeInputEl = () => ({ evaluate: vi.fn().mockResolvedValue(undefined), click: vi.fn().mockResolvedValue(undefined) });
const makeClickEl = () => ({ click: vi.fn().mockResolvedValue(undefined) });

describe('selectDeliveryAddress', () => {
  let page: ReturnType<typeof makePageMock>;
  let bot: ArchibaldBot;

  beforeEach(() => {
    page = makePageMock();
    bot = makeBot(page);
  });

  it('returns early when via is null — no idle wait, no field lookup', async () => {
    await (bot as any).selectDeliveryAddress({ ...addressLioni, via: null });

    expect(page.$).not.toHaveBeenCalled();
    expect((bot as any).waitForDevExpressIdle).not.toHaveBeenCalled();
  });

  it('returns early when via is empty string — no idle wait, no field lookup', async () => {
    await (bot as any).selectDeliveryAddress({ ...addressLioni, via: '' });

    expect(page.$).not.toHaveBeenCalled();
    expect((bot as any).waitForDevExpressIdle).not.toHaveBeenCalled();
  });

  it('returns gracefully when field input not found — pre-idle called once', async () => {
    page.$.mockResolvedValueOnce(null); // fieldInput = null

    await expect((bot as any).selectDeliveryAddress(addressLioni)).resolves.toBeUndefined();
    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(1);
    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'delivery-address-pre' }),
    );
  });

  it('looks up input by DELIVERYPOSTALADDRESS_Edit_I, focuses popup search box, and types search term', async () => {
    const inputEl = makeInputEl();
    const searchBoxEl = makeClickEl(); // popup "Enter text to search" field
    const rowEl = makeClickEl();
    page.$.mockResolvedValueOnce(inputEl);    // fieldInput
    page.$.mockResolvedValueOnce(searchBoxEl); // searchBox
    page.$.mockResolvedValueOnce(rowEl);       // firstRow
    page.evaluate.mockResolvedValueOnce(undefined); // ShowDropDown
    page.evaluate.mockResolvedValueOnce(1);         // rowCount = 1

    await (bot as any).selectDeliveryAddress(addressLioni);

    expect(page.$).toHaveBeenCalledWith('[id$="DELIVERYPOSTALADDRESS_Edit_I"]');
    expect(page.$).toHaveBeenCalledWith(expect.stringContaining('DELIVERYPOSTALADDRESS_Edit_DDD_gv_DXSE_I'));
    expect(inputEl.evaluate).toHaveBeenCalled(); // scrollIntoView
    expect(searchBoxEl.click).toHaveBeenCalled();
    expect(page.keyboard.type).toHaveBeenCalledWith('Via Francesco Petrarca');
    expect(rowEl.click).toHaveBeenCalled();
  });

  it('returns early with warn when no rows and input is still N/A', async () => {
    const inputEl = makeInputEl();
    page.$.mockResolvedValueOnce(inputEl); // fieldInput
    // searchBox returns null (default mock) — ok, type still proceeds
    page.evaluate.mockResolvedValueOnce(undefined); // ShowDropDown
    page.evaluate.mockResolvedValueOnce(0);         // rowCount = 0
    page.evaluate.mockResolvedValueOnce('N/A');     // inputValue = N/A

    await (bot as any).selectDeliveryAddress(addressLioni);

    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(3);
  });

  it('returns early without warn when DevExpress auto-selected (0 rows, input changed)', async () => {
    const inputEl = makeInputEl();
    page.$.mockResolvedValueOnce(inputEl);
    page.evaluate.mockResolvedValueOnce(undefined);                        // ShowDropDown
    page.evaluate.mockResolvedValueOnce(0);                                // rowCount = 0
    page.evaluate.mockResolvedValueOnce('Via Francesco Petrarca');         // inputValue = auto-selected

    await expect((bot as any).selectDeliveryAddress(addressLioni)).resolves.toBeUndefined();
    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(3);
  });

  it('calls waitForDevExpressIdle four times and uses delivery-address-select label on success', async () => {
    const inputEl = makeInputEl();
    const searchBoxEl = makeClickEl();
    const rowEl = makeClickEl();
    page.$.mockResolvedValueOnce(inputEl);
    page.$.mockResolvedValueOnce(searchBoxEl);
    page.$.mockResolvedValueOnce(rowEl);
    page.evaluate.mockResolvedValueOnce(undefined); // ShowDropDown
    page.evaluate.mockResolvedValueOnce(1);         // rowCount = 1

    await (bot as any).selectDeliveryAddress(addressLioni);

    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(4);
    expect((bot as any).waitForDevExpressIdle).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: 'delivery-address-select' }),
    );
  });
});
