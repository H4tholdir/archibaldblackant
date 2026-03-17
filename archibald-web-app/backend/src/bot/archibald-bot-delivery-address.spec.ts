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

  it('returns early when via is null — no click, no idle wait', async () => {
    await (bot as any).selectDeliveryAddress({ ...addressLioni, via: null });

    expect(page.$).not.toHaveBeenCalled();
    expect((bot as any).waitForDevExpressIdle).not.toHaveBeenCalled();
  });

  it('returns early when via is empty string — no click, no idle wait', async () => {
    await (bot as any).selectDeliveryAddress({ ...addressLioni, via: '' });

    expect(page.$).not.toHaveBeenCalled();
    expect((bot as any).waitForDevExpressIdle).not.toHaveBeenCalled();
  });

  it('returns gracefully when field input not found', async () => {
    page.$.mockResolvedValueOnce(null); // fieldInput = null

    await expect((bot as any).selectDeliveryAddress(addressLioni)).resolves.toBeUndefined();
    expect((bot as any).waitForDevExpressIdle).not.toHaveBeenCalled();
  });

  it('looks up input by DELIVERYPOSTALADDRESS_Edit_I and types search term', async () => {
    const inputEl = { evaluate: vi.fn().mockResolvedValue(undefined), click: vi.fn().mockResolvedValue(undefined) };
    page.$.mockResolvedValueOnce(inputEl);
    page.evaluate.mockResolvedValueOnce(1);         // rowCount = 1
    page.evaluate.mockResolvedValueOnce(undefined); // click row

    await (bot as any).selectDeliveryAddress(addressLioni);

    expect(page.$).toHaveBeenCalledWith('[id$="DELIVERYPOSTALADDRESS_Edit_I"]');
    expect(inputEl.evaluate).toHaveBeenCalled(); // scrollIntoView
    expect(inputEl.click).toHaveBeenCalled();
    expect(page.keyboard.type).toHaveBeenCalledWith('Via Francesco Petrarca');
  });

  it('returns early with warn when no rows and input is still N/A', async () => {
    const inputEl = { evaluate: vi.fn().mockResolvedValue(undefined), click: vi.fn().mockResolvedValue(undefined) };
    page.$.mockResolvedValueOnce(inputEl);
    page.evaluate.mockResolvedValueOnce(0);         // rowCount = 0
    page.evaluate.mockResolvedValueOnce('N/A');     // inputValue = N/A

    await (bot as any).selectDeliveryAddress(addressLioni);

    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(2);
  });

  it('returns early without warn when DevExpress auto-selected (0 rows, input changed)', async () => {
    const inputEl = { evaluate: vi.fn().mockResolvedValue(undefined), click: vi.fn().mockResolvedValue(undefined) };
    page.$.mockResolvedValueOnce(inputEl);
    page.evaluate.mockResolvedValueOnce(0);                           // rowCount = 0
    page.evaluate.mockResolvedValueOnce('Via Francesco Petrarca');    // inputValue = auto-selected

    await expect((bot as any).selectDeliveryAddress(addressLioni)).resolves.toBeUndefined();
    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(2);
  });

  it('calls waitForDevExpressIdle three times and uses delivery-address-select label on success', async () => {
    const inputEl = { evaluate: vi.fn().mockResolvedValue(undefined), click: vi.fn().mockResolvedValue(undefined) };
    page.$.mockResolvedValueOnce(inputEl);
    page.evaluate.mockResolvedValueOnce(1);         // rowCount = 1
    page.evaluate.mockResolvedValueOnce(undefined); // click row

    await (bot as any).selectDeliveryAddress(addressLioni);

    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(3);
    expect((bot as any).waitForDevExpressIdle).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: 'delivery-address-select' }),
    );
  });
});
