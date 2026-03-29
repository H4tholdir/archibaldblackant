import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomerAddress } from '../db/repositories/customer-addresses';
import { ArchibaldBot } from './archibald-bot';

const makePageMock = () => ({
  evaluate: vi.fn().mockResolvedValue(null),
  $: vi.fn().mockResolvedValue(null),
  click: vi.fn().mockResolvedValue(undefined),
  waitForSelector: vi.fn().mockResolvedValue(null),
  waitForFunction: vi.fn().mockResolvedValue(undefined),
  mouse: {
    click: vi.fn().mockResolvedValue(undefined),
  },
  keyboard: {
    type: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
  },
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
  erpId: '55.227',
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

describe('selectDeliveryAddress', () => {
  let page: ReturnType<typeof makePageMock>;
  let bot: ArchibaldBot;

  beforeEach(() => {
    page = makePageMock();
    bot = makeBot(page);
  });

  it('returns early when via is null — no idle wait, no field lookup', async () => {
    await (bot as any).selectDeliveryAddress({ ...addressLioni, via: null });

    expect(page.evaluate).not.toHaveBeenCalled();
    expect((bot as any).waitForDevExpressIdle).not.toHaveBeenCalled();
  });

  it('returns early when via is empty string — no idle wait, no field lookup', async () => {
    await (bot as any).selectDeliveryAddress({ ...addressLioni, via: '' });

    expect(page.evaluate).not.toHaveBeenCalled();
    expect((bot as any).waitForDevExpressIdle).not.toHaveBeenCalled();
  });

  it('returns gracefully when field not found — pre-idle called once', async () => {
    page.evaluate.mockResolvedValueOnce(null); // fieldInfo = null

    await expect((bot as any).selectDeliveryAddress(addressLioni)).resolves.toBeUndefined();
    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(1);
    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'delivery-address-pre' }),
    );
  });

  it('returns gracefully when dropdown button not found', async () => {
    page.evaluate.mockResolvedValueOnce({ baseId: 'DELIVERYPOSTALADDRESS_Edit', btnSelector: null });

    await expect((bot as any).selectDeliveryAddress(addressLioni)).resolves.toBeUndefined();
    expect(page.click).not.toHaveBeenCalled();
  });

  it('clicks dropdown button, pastes via evaluate, clicks row via page.mouse.click', async () => {
    // Phase 1: fieldInfo with button
    page.evaluate.mockResolvedValueOnce({ baseId: 'DELIVERYPOSTALADDRESS_Edit', btnSelector: '#DELIVERYPOSTALADDRESS_Edit_B-1' });
    // Phase 4: paste evaluate
    page.evaluate.mockResolvedValueOnce(undefined);
    // Phase 6: rowCoords — row found at center coords
    page.evaluate.mockResolvedValueOnce({ x: 100, y: 200, rowsCount: 1 });

    await (bot as any).selectDeliveryAddress(addressLioni);

    // page.click used only for the dropdown button
    expect(page.click).toHaveBeenCalledTimes(1);
    expect(page.click).toHaveBeenCalledWith('#DELIVERYPOSTALADDRESS_Edit_B-1');

    // page.mouse.click used for the row (CDP click triggers server postback)
    expect(page.mouse.click).toHaveBeenCalledTimes(1);
    expect(page.mouse.click).toHaveBeenCalledWith(100, 200);

    // waitForFunction called for: search input, filtered rows, popup close, DLVADDRESS update
    expect(page.waitForFunction).toHaveBeenCalledTimes(4);

    // Final idle wait with delivery-address-select label
    expect((bot as any).waitForDevExpressIdle).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: 'delivery-address-select' }),
    );
  });

  it('returns early with warn when no rows and input is still N/A', async () => {
    page.evaluate.mockResolvedValueOnce({ baseId: 'DELIVERYPOSTALADDRESS_Edit', btnSelector: '#DELIVERYPOSTALADDRESS_Edit_B-1' });
    page.evaluate.mockResolvedValueOnce(undefined);  // paste
    page.evaluate.mockResolvedValueOnce(null);        // rowCoords = null (no rows)
    page.evaluate.mockResolvedValueOnce('N/A');       // inputValue check

    await (bot as any).selectDeliveryAddress(addressLioni);

    expect(page.click).toHaveBeenCalledTimes(1); // only button click
    expect(page.mouse.click).not.toHaveBeenCalled();
    // no final idle with delivery-address-select
    const idleCalls = ((bot as any).waitForDevExpressIdle as ReturnType<typeof vi.fn>).mock.calls;
    expect(idleCalls.every((c: any[]) => c[0]?.label !== 'delivery-address-select')).toBe(true);
  });

  it('returns early without warn when DevExpress auto-selected (no rows, input changed)', async () => {
    page.evaluate.mockResolvedValueOnce({ baseId: 'DELIVERYPOSTALADDRESS_Edit', btnSelector: '#DELIVERYPOSTALADDRESS_Edit_B-1' });
    page.evaluate.mockResolvedValueOnce(undefined);
    page.evaluate.mockResolvedValueOnce(null);  // rowCoords = null
    page.evaluate.mockResolvedValueOnce('Via Francesco Petrarca');

    await expect((bot as any).selectDeliveryAddress(addressLioni)).resolves.toBeUndefined();
    expect(page.click).toHaveBeenCalledTimes(1);
    expect(page.mouse.click).not.toHaveBeenCalled();
  });
});
