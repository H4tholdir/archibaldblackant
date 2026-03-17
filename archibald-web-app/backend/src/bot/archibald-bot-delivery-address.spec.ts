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

  it('pastes full via into popup search box and clicks first matching row td', async () => {
    page.$.mockResolvedValueOnce({}); // fieldInput exists
    page.evaluate.mockResolvedValueOnce(undefined); // scrollIntoView
    page.evaluate.mockResolvedValueOnce(undefined); // ShowDropDown
    // waitForSelector for DXSE_I is called between ShowDropDown and paste
    page.evaluate.mockResolvedValueOnce(undefined); // execCommand paste into search box
    page.evaluate.mockResolvedValueOnce(1);         // rowCount = 1

    await (bot as any).selectDeliveryAddress(addressLioni);

    expect(page.$).toHaveBeenCalledWith('[id$="DELIVERYPOSTALADDRESS_Edit_I"]');
    expect(page.waitForSelector).toHaveBeenCalledWith(
      expect.stringContaining('DELIVERYPOSTALADDRESS_Edit_DDD_gv_DXSE_I'),
      expect.any(Object),
    );
    expect(page.keyboard.type).not.toHaveBeenCalled();
    expect(page.keyboard.press).not.toHaveBeenCalled();
    expect(page.click).toHaveBeenCalledWith(
      expect.stringContaining('DELIVERYPOSTALADDRESS_Edit_DDD_gv_DXDataRow0'),
    );
  });

  it('returns early with warn when no rows and input is still N/A', async () => {
    page.$.mockResolvedValueOnce({});
    page.evaluate.mockResolvedValueOnce(undefined); // scrollIntoView
    page.evaluate.mockResolvedValueOnce(undefined); // ShowDropDown
    page.evaluate.mockResolvedValueOnce(undefined); // paste into search box
    page.evaluate.mockResolvedValueOnce(0);         // rowCount = 0
    page.evaluate.mockResolvedValueOnce('N/A');     // inputValue

    await (bot as any).selectDeliveryAddress(addressLioni);

    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(3);
    expect(page.click).not.toHaveBeenCalled();
  });

  it('returns early without warn when DevExpress auto-selected (0 rows, input changed)', async () => {
    page.$.mockResolvedValueOnce({});
    page.evaluate.mockResolvedValueOnce(undefined);
    page.evaluate.mockResolvedValueOnce(undefined);
    page.evaluate.mockResolvedValueOnce(undefined);
    page.evaluate.mockResolvedValueOnce(0);
    page.evaluate.mockResolvedValueOnce('Via Francesco Petrarca');

    await expect((bot as any).selectDeliveryAddress(addressLioni)).resolves.toBeUndefined();
    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(3);
    expect(page.click).not.toHaveBeenCalled();
  });

  it('calls waitForDevExpressIdle four times and uses delivery-address-select label on success', async () => {
    page.$.mockResolvedValueOnce({});
    page.evaluate.mockResolvedValueOnce(undefined); // scrollIntoView
    page.evaluate.mockResolvedValueOnce(undefined); // ShowDropDown
    page.evaluate.mockResolvedValueOnce(undefined); // paste into search box
    page.evaluate.mockResolvedValueOnce(1);         // rowCount = 1

    await (bot as any).selectDeliveryAddress(addressLioni);

    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(4);
    expect((bot as any).waitForDevExpressIdle).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: 'delivery-address-select' }),
    );
  });
});
