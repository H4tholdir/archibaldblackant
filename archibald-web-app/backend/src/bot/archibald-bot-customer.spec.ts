import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AddressEntry } from '../types';

const makePageMock = () => ({
  evaluate: vi.fn().mockResolvedValue(0),           // rowCount = 0 by default
  $: vi.fn().mockResolvedValue(null),
  click: vi.fn().mockResolvedValue(undefined),
  waitForSelector: vi.fn().mockResolvedValue(null),
  keyboard: { press: vi.fn().mockResolvedValue(undefined), type: vi.fn().mockResolvedValue(undefined) },
  waitForFunction: vi.fn().mockResolvedValue(undefined),
});

import { ArchibaldBot } from './archibald-bot';

function makeBot(pageMock: ReturnType<typeof makePageMock>): ArchibaldBot {
  const bot = new ArchibaldBot({ archibald: { url: 'http://test', username: 'u', password: 'p' } } as any);
  (bot as any).page = pageMock;
  (bot as any).openCustomerTab = vi.fn().mockResolvedValue(undefined);
  (bot as any).waitForDevExpressIdle = vi.fn().mockResolvedValue(undefined);
  return bot;
}

const addressA: AddressEntry = { tipo: 'Consegna', via: 'Via Roma 1', cap: '37100', citta: 'Verona' };
const addressB: AddressEntry = { tipo: 'Ufficio', nome: 'HQ', via: 'Corso Italia 5', cap: '20122', citta: 'Milano' };
const emptyAddress: AddressEntry = { tipo: 'Consegna', via: undefined, cap: undefined, citta: undefined };

describe('writeAltAddresses', () => {
  let page: ReturnType<typeof makePageMock>;
  let bot: ArchibaldBot;

  beforeEach(() => {
    page = makePageMock();
    bot = makeBot(page);
  });

  it('opens the Indirizzo alt tab', async () => {
    await (bot as any).writeAltAddresses([]);

    expect((bot as any).openCustomerTab).toHaveBeenCalledWith('Indirizzo alt');
  });

  it('skips delete step when grid has no existing rows', async () => {
    page.evaluate.mockResolvedValueOnce(0); // rowCount = 0

    await (bot as any).writeAltAddresses([]);

    expect(page.click).not.toHaveBeenCalledWith(expect.stringContaining('btnDelete'));
  });

  it('attempts select-all and delete when grid has existing rows', async () => {
    page.evaluate
      .mockResolvedValueOnce('')      // altGridName = '' (first evaluate)
      .mockResolvedValueOnce(2)       // rowCount = 2
      .mockResolvedValue(undefined);  // subsequent evaluate calls
    const selectAllEl = { click: vi.fn().mockResolvedValue(undefined) };
    page.$.mockResolvedValueOnce(selectAllEl); // selectAll checkbox found

    await (bot as any).writeAltAddresses([]);

    expect(selectAllEl.click).toHaveBeenCalled();
    expect(page.click).toHaveBeenCalledWith(expect.stringContaining('btnDelete'));
    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalled();
  });

  it('inserts each non-empty address', async () => {
    // altGridName returns '' → fallback AddNew path
    // AddNew evaluate returns true (row added)
    // tipoSet evaluate returns { found: false, id: '' }
    // viaSet evaluate returns false (direct typing fallback)
    // findBtnId evaluate returns null (no CAP button found → skip lookup)
    // UpdateEdit evaluate returns false (Enter fallback)
    const perAddressMocks = [
      true,                          // AddNew candidates found
      { found: false, id: '' },      // TIPO set result
      undefined,                     // NOME evaluate (no nome for addressA)
      false,                         // VIA set result
      null,                          // findBtnId (no CAP button)
      false,                         // UpdateEdit candidates
    ];

    page.evaluate
      .mockResolvedValueOnce('')     // altGridName
      .mockResolvedValueOnce(0)      // rowCount
      .mockResolvedValueOnce(perAddressMocks[0])
      .mockResolvedValueOnce(perAddressMocks[1])
      .mockResolvedValueOnce(perAddressMocks[2])
      .mockResolvedValueOnce(perAddressMocks[3])
      .mockResolvedValueOnce(perAddressMocks[4])
      .mockResolvedValueOnce(perAddressMocks[5])
      // second address (addressB has nome)
      .mockResolvedValueOnce(true)                  // AddNew
      .mockResolvedValueOnce({ found: false, id: '' }) // TIPO
      .mockResolvedValueOnce(undefined)             // NOME
      .mockResolvedValueOnce(false)                 // VIA
      .mockResolvedValueOnce(null)                  // findBtnId
      .mockResolvedValueOnce(false);                // UpdateEdit

    await (bot as any).writeAltAddresses([addressA, addressB]);

    // At minimum: tab-open idle + addnew idle for each of the 2 addresses
    const idleCallCount = (bot as any).waitForDevExpressIdle.mock.calls.length;
    expect(idleCallCount).toBeGreaterThanOrEqual(3);
  });

  it('skips an address where via, cap, and citta are all empty', async () => {
    page.evaluate.mockResolvedValue(0);

    await (bot as any).writeAltAddresses([emptyAddress]);

    // The grid-discovery evaluate call contains AddNewRow as a string within the function body,
    // but no *invocation* of AddNewRow should happen for an empty address.
    // We verify this by checking that evaluate was never called with a *second argument*
    // (grid name), which only happens when actually adding a row.
    const evaluateCalls: unknown[][] = (page.evaluate as ReturnType<typeof vi.fn>).mock.calls;
    const callsWithArgs = evaluateCalls.filter(c => c.length > 1);
    expect(callsWithArgs).toHaveLength(0);
  });

  it('calls with empty array: only opens tab, skips insert loop entirely', async () => {
    page.evaluate.mockResolvedValue(0);

    await (bot as any).writeAltAddresses([]);

    expect((bot as any).openCustomerTab).toHaveBeenCalledTimes(1);
    const evaluateCalls: unknown[][] = (page.evaluate as ReturnType<typeof vi.fn>).mock.calls;
    // Two evaluate calls: grid-name discovery + rowCount check; no insert calls
    expect(evaluateCalls).toHaveLength(2);
  });
});

describe('createCustomer — writeAltAddresses integration', () => {
  it('calls writeAltAddresses with addresses from CustomerFormData', async () => {
    const page = makePageMock();
    (page as any).goto = vi.fn().mockResolvedValue(undefined);
    page.waitForFunction = vi.fn().mockResolvedValue(undefined);
    const bot = new ArchibaldBot({ archibald: { url: 'http://test', username: 'u', password: 'p' } } as any);
    (bot as any).page = page;
    (bot as any).writeAltAddresses = vi.fn().mockResolvedValue(undefined);
    (bot as any).openCustomerTab = vi.fn().mockResolvedValue(undefined);
    (bot as any).waitForDevExpressReady = vi.fn().mockResolvedValue(undefined);
    (bot as any).waitForDevExpressIdle = vi.fn().mockResolvedValue(undefined);
    (bot as any).dismissDevExpressPopups = vi.fn().mockResolvedValue(undefined);
    (bot as any).setDevExpressComboBox = vi.fn().mockResolvedValue(undefined);
    (bot as any).selectFromDevExpressLookup = vi.fn().mockResolvedValue(undefined);
    (bot as any).typeDevExpressField = vi.fn().mockResolvedValue(undefined);
    (bot as any).saveAndCloseCustomer = vi.fn().mockResolvedValue(undefined);
    (bot as any).clickElementByText = vi.fn().mockResolvedValue(true);
    (bot as any).emitProgress = vi.fn().mockResolvedValue(undefined);
    (bot as any).wait = vi.fn().mockResolvedValue(undefined);
    (bot as any).ensureNameFieldBeforeSave = vi.fn().mockResolvedValue(undefined);
    (bot as any).getCustomerProfileId = vi.fn().mockResolvedValue('PROFILE-001');

    const addresses: AddressEntry[] = [
      { tipo: 'Consegna', via: 'Via Verdi 3', cap: '37122', citta: 'Verona' },
    ];

    await (bot as any).createCustomer({ name: 'Test S.r.l.', addresses });

    expect((bot as any).writeAltAddresses).toHaveBeenCalledWith(addresses);
  });

  it('calls writeAltAddresses with empty array when addresses field absent', async () => {
    const page = makePageMock();
    (page as any).goto = vi.fn().mockResolvedValue(undefined);
    page.waitForFunction = vi.fn().mockResolvedValue(undefined);
    const bot = new ArchibaldBot({ archibald: { url: 'http://test', username: 'u', password: 'p' } } as any);
    (bot as any).page = page;
    (bot as any).writeAltAddresses = vi.fn().mockResolvedValue(undefined);
    (bot as any).openCustomerTab = vi.fn().mockResolvedValue(undefined);
    (bot as any).waitForDevExpressReady = vi.fn().mockResolvedValue(undefined);
    (bot as any).waitForDevExpressIdle = vi.fn().mockResolvedValue(undefined);
    (bot as any).dismissDevExpressPopups = vi.fn().mockResolvedValue(undefined);
    (bot as any).setDevExpressComboBox = vi.fn().mockResolvedValue(undefined);
    (bot as any).selectFromDevExpressLookup = vi.fn().mockResolvedValue(undefined);
    (bot as any).typeDevExpressField = vi.fn().mockResolvedValue(undefined);
    (bot as any).saveAndCloseCustomer = vi.fn().mockResolvedValue(undefined);
    (bot as any).clickElementByText = vi.fn().mockResolvedValue(true);
    (bot as any).emitProgress = vi.fn().mockResolvedValue(undefined);
    (bot as any).wait = vi.fn().mockResolvedValue(undefined);
    (bot as any).ensureNameFieldBeforeSave = vi.fn().mockResolvedValue(undefined);
    (bot as any).getCustomerProfileId = vi.fn().mockResolvedValue('PROFILE-001');

    await (bot as any).createCustomer({ name: 'Test S.r.l.' });

    expect((bot as any).writeAltAddresses).toHaveBeenCalledWith([]);
  });
});

describe('completeCustomerCreation — writeAltAddresses integration', () => {
  it('calls writeAltAddresses with addresses from CustomerFormData', async () => {
    const page = makePageMock();
    (page as any).goto = vi.fn().mockResolvedValue(undefined);
    page.waitForFunction = vi.fn().mockResolvedValue(undefined);
    const bot = new ArchibaldBot({ archibald: { url: 'http://test', username: 'u', password: 'p' } } as any);
    (bot as any).page = page;
    (bot as any).writeAltAddresses = vi.fn().mockResolvedValue(undefined);
    (bot as any).openCustomerTab = vi.fn().mockResolvedValue(undefined);
    (bot as any).waitForDevExpressReady = vi.fn().mockResolvedValue(undefined);
    (bot as any).waitForDevExpressIdle = vi.fn().mockResolvedValue(undefined);
    (bot as any).dismissDevExpressPopups = vi.fn().mockResolvedValue(undefined);
    (bot as any).setDevExpressComboBox = vi.fn().mockResolvedValue(undefined);
    (bot as any).selectFromDevExpressLookup = vi.fn().mockResolvedValue(undefined);
    (bot as any).typeDevExpressField = vi.fn().mockResolvedValue(undefined);
    (bot as any).saveAndCloseCustomer = vi.fn().mockResolvedValue(undefined);
    (bot as any).emitProgress = vi.fn().mockResolvedValue(undefined);
    (bot as any).wait = vi.fn().mockResolvedValue(undefined);
    (bot as any).ensureNameFieldBeforeSave = vi.fn().mockResolvedValue(undefined);
    (bot as any).getCustomerProfileId = vi.fn().mockResolvedValue('PROFILE-001');

    const addresses: AddressEntry[] = [{ tipo: 'Ufficio', via: 'Via Scala 2', cap: '20121', citta: 'Milano' }];

    await (bot as any).completeCustomerCreation({ name: 'Test', addresses });

    expect((bot as any).writeAltAddresses).toHaveBeenCalledWith(addresses);
  });

  it('calls writeAltAddresses with empty array when addresses field absent', async () => {
    const page = makePageMock();
    (page as any).goto = vi.fn().mockResolvedValue(undefined);
    page.waitForFunction = vi.fn().mockResolvedValue(undefined);
    const bot = new ArchibaldBot({ archibald: { url: 'http://test', username: 'u', password: 'p' } } as any);
    (bot as any).page = page;
    (bot as any).writeAltAddresses = vi.fn().mockResolvedValue(undefined);
    (bot as any).openCustomerTab = vi.fn().mockResolvedValue(undefined);
    (bot as any).waitForDevExpressReady = vi.fn().mockResolvedValue(undefined);
    (bot as any).waitForDevExpressIdle = vi.fn().mockResolvedValue(undefined);
    (bot as any).dismissDevExpressPopups = vi.fn().mockResolvedValue(undefined);
    (bot as any).setDevExpressComboBox = vi.fn().mockResolvedValue(undefined);
    (bot as any).selectFromDevExpressLookup = vi.fn().mockResolvedValue(undefined);
    (bot as any).typeDevExpressField = vi.fn().mockResolvedValue(undefined);
    (bot as any).saveAndCloseCustomer = vi.fn().mockResolvedValue(undefined);
    (bot as any).emitProgress = vi.fn().mockResolvedValue(undefined);
    (bot as any).wait = vi.fn().mockResolvedValue(undefined);
    (bot as any).ensureNameFieldBeforeSave = vi.fn().mockResolvedValue(undefined);
    (bot as any).getCustomerProfileId = vi.fn().mockResolvedValue('PROFILE-001');

    await (bot as any).completeCustomerCreation({ name: 'Test' });

    expect((bot as any).writeAltAddresses).toHaveBeenCalledWith([]);
  });
});

describe('updateCustomer — writeAltAddresses integration', () => {
  function makeUpdateBot(): ArchibaldBot {
    const page = makePageMock();
    (page as any).goto = vi.fn().mockResolvedValue(undefined);
    (page as any).url = vi.fn().mockReturnValue('http://test/CUSTTABLE_ListView_Agent/');
    page.waitForFunction = vi.fn().mockResolvedValue(undefined);
    const bot = new ArchibaldBot({ archibald: { url: 'http://test', username: 'u', password: 'p' } } as any);
    (bot as any).page = page;
    (bot as any).writeAltAddresses = vi.fn().mockResolvedValue(undefined);
    (bot as any).openCustomerTab = vi.fn().mockResolvedValue(undefined);
    (bot as any).waitForDevExpressReady = vi.fn().mockResolvedValue(undefined);
    (bot as any).waitForDevExpressIdle = vi.fn().mockResolvedValue(undefined);
    (bot as any).dismissDevExpressPopups = vi.fn().mockResolvedValue(undefined);
    (bot as any).setDevExpressComboBox = vi.fn().mockResolvedValue(undefined);
    (bot as any).selectFromDevExpressLookup = vi.fn().mockResolvedValue(undefined);
    (bot as any).typeDevExpressField = vi.fn().mockResolvedValue(undefined);
    (bot as any).saveAndCloseCustomer = vi.fn().mockResolvedValue(undefined);
    (bot as any).updateCustomerName = vi.fn().mockResolvedValue(undefined);
    (bot as any).emitProgress = vi.fn().mockResolvedValue(undefined);
    (bot as any).wait = vi.fn().mockResolvedValue(undefined);
    (bot as any).navigateToEditCustomerForm = vi.fn().mockResolvedValue(undefined);
    (bot as any).clickElementByText = vi.fn().mockResolvedValue(true);
    (bot as any).ensureNameFieldBeforeSave = vi.fn().mockResolvedValue(undefined);
    (bot as any).searchAndOpenCustomer = vi.fn().mockResolvedValue(undefined);
    return bot;
  }

  const profile = 'CUST-001';
  const formData = { name: 'Acme S.r.l.', addresses: [{ tipo: 'Consegna', via: 'Via Dante 7', cap: '20100', citta: 'Milano' }] };

  it('calls writeAltAddresses with addresses when provided', async () => {
    const bot = makeUpdateBot();

    await bot.updateCustomer(profile, formData as any, 'Acme');

    expect((bot as any).writeAltAddresses).toHaveBeenCalledWith(formData.addresses);
  });

  it('calls writeAltAddresses with empty array when addresses absent', async () => {
    const bot = makeUpdateBot();
    const dataWithoutAddresses = { name: 'Acme S.r.l.' };

    await bot.updateCustomer(profile, dataWithoutAddresses as any, 'Acme');

    expect((bot as any).writeAltAddresses).toHaveBeenCalledWith([]);
  });
});
