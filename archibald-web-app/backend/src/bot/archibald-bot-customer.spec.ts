import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AddressEntry } from '../types';

const makePageMock = () => ({
  evaluate: vi.fn().mockResolvedValue(undefined),
  $: vi.fn().mockResolvedValue(null),
  click: vi.fn().mockResolvedValue(undefined),
  once: vi.fn(),
  url: vi.fn().mockReturnValue('http://test'),
  waitForSelector: vi.fn().mockResolvedValue(null),
  keyboard: { press: vi.fn().mockResolvedValue(undefined), type: vi.fn().mockResolvedValue(undefined), down: vi.fn().mockResolvedValue(undefined), up: vi.fn().mockResolvedValue(undefined) },
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

describe('close', () => {
  it('does not throw when page.close() fails with a CDP Protocol error (dead session)', async () => {
    const cdpError = new Error('Protocol error: Connection closed. Most likely the page has been closed.');
    const pageMock = {
      ...makePageMock(),
      isClosed: vi.fn().mockReturnValue(false),
      close: vi.fn().mockRejectedValue(cdpError),
    };
    const bot = new ArchibaldBot({ archibald: { url: 'http://test', username: 'u', password: 'p' } } as any);
    (bot as any).page = pageMock;
    (bot as any).writeOperationReport = vi.fn().mockResolvedValue('/tmp/report.json');

    await expect(bot.close()).resolves.toBeUndefined();
    expect(pageMock.close).toHaveBeenCalledOnce();
  });
});

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
    page.evaluate
      .mockResolvedValueOnce('ADDRESSes_test')  // altGridName (truthy)
      .mockResolvedValueOnce(0);                // rowCount = 0

    await (bot as any).writeAltAddresses([]);

    expect((bot as any).waitForDevExpressIdle).not.toHaveBeenCalledWith(
      expect.objectContaining({ label: 'alt-delete-confirm' }),
    );
  });

  it('attempts select-all and delete when grid has existing rows', async () => {
    const selBtnEl = { click: vi.fn().mockResolvedValue(undefined) };
    page.waitForSelector.mockResolvedValueOnce(selBtnEl);
    page.evaluate
      .mockResolvedValueOnce('ADDRESSes_test')  // altGridName
      .mockResolvedValueOnce(1)                 // rowCount = 1
      .mockResolvedValueOnce(false)             // alreadyEnabled = false
      .mockResolvedValueOnce(true)              // toolbarEnabled = true
      .mockResolvedValueOnce(undefined)         // toolbar delete click
      .mockResolvedValueOnce(0);               // polled rowCount = 0 (done)

    await (bot as any).writeAltAddresses([]);

    expect(selBtnEl.click).toHaveBeenCalled();
    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'alt-delete-confirm' }),
    );
  });

  it('inserts each non-empty address', async () => {
    // Per address: AddNewRow, STREET, findBtnId (null→keyboard.type), CITY,
    // dismiss-CITY-popup, SetValue TYPE, UpdateEdit.
    // addressA has no nome; addressB has nome (extra evaluate call).
    page.evaluate
      .mockResolvedValueOnce('ADDRESSes_test')  // altGridName (truthy)
      .mockResolvedValueOnce(0)                 // rowCount = 0 (no delete)
      // addressA
      .mockResolvedValueOnce(undefined)         // AddNewRow
      .mockResolvedValueOnce(undefined)         // STREET
      .mockResolvedValueOnce(null)              // findBtnId (no CAP button)
      .mockResolvedValueOnce(undefined)         // CITY
      .mockResolvedValueOnce(undefined)         // dismiss CITY popup
      .mockResolvedValueOnce(true)              // SetValue TYPE
      .mockResolvedValueOnce(undefined)         // UpdateEdit
      // addressB (has nome)
      .mockResolvedValueOnce(undefined)         // AddNewRow
      .mockResolvedValueOnce(undefined)         // NOME
      .mockResolvedValueOnce(undefined)         // STREET
      .mockResolvedValueOnce(null)              // findBtnId
      .mockResolvedValueOnce(undefined)         // CITY
      .mockResolvedValueOnce(undefined)         // dismiss CITY popup
      .mockResolvedValueOnce(true)              // SetValue TYPE
      .mockResolvedValueOnce(undefined);        // UpdateEdit

    await (bot as any).writeAltAddresses([addressA, addressB]);

    // At minimum: tab idle + (addnew + cap-done + city-done + update-edit) × 2 addresses
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
    page.evaluate
      .mockResolvedValueOnce('ADDRESSes_test')  // altGridName (truthy)
      .mockResolvedValueOnce(0);                // rowCount = 0

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

describe('typeDevExpressField', () => {
  function makePageWithType() {
    return {
      ...makePageMock(),
      type: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('tronca il valore al maxLength del campo prima di digitare', async () => {
    const page = makePageWithType();
    // Prima evaluate: find+clear → { id, maxLength: 5 }
    // Seconda evaluate: focus+setSelectionRange in typeOrClear → undefined
    // Terza evaluate: verifica valore → valore troncato corretto (nessun retry)
    page.evaluate
      .mockResolvedValueOnce({ id: 'field-id', maxLength: 5 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('hello');

    const bot = makeBot(page as any);
    await (bot as any).typeDevExpressField(/field/, 'hello world');

    expect(page.keyboard.type).toHaveBeenCalledWith('hello', { delay: 5 });
  });

  it('usa il valore intero quando maxLength è 0', async () => {
    const page = makePageWithType();
    page.evaluate
      .mockResolvedValueOnce({ id: 'field-id', maxLength: 0 })
      .mockResolvedValueOnce(undefined)                           // focus+setSelectionRange
      .mockResolvedValueOnce('hello world');

    const bot = makeBot(page as any);
    await (bot as any).typeDevExpressField(/field/, 'hello world');

    expect(page.keyboard.type).toHaveBeenCalledWith('hello world', { delay: 5 });
  });

  it('il retry usa effectiveValue (troncato), non il valore grezzo', async () => {
    const page = makePageWithType();
    page.evaluate
      .mockResolvedValueOnce({ id: 'field-id', maxLength: 5 })  // find+clear
      .mockResolvedValueOnce(undefined)                          // focus+setSelectionRange (primo tentativo)
      .mockResolvedValueOnce('wrong')                             // prima verifica → mismatch
      .mockResolvedValueOnce(undefined)                          // retry clear
      .mockResolvedValueOnce(undefined)                          // focus+setSelectionRange (retry)
      .mockResolvedValueOnce('hello');                           // retry verifica → ok

    const bot = makeBot(page as any);
    await (bot as any).typeDevExpressField(/field/, 'hello world');

    expect(page.keyboard.type).toHaveBeenCalledTimes(2);
    expect(page.keyboard.type).toHaveBeenNthCalledWith(1, 'hello', { delay: 5 });
    expect(page.keyboard.type).toHaveBeenNthCalledWith(2, 'hello', { delay: 5 });
  });

  it('usa focus+setSelectionRange + Delete invece di keyboard.type quando il valore è stringa vuota', async () => {
    const page = makePageWithType();
    page.evaluate
      .mockResolvedValueOnce({ id: 'field-id', maxLength: 0 })
      .mockResolvedValueOnce(undefined)                           // focus+setSelectionRange
      .mockResolvedValueOnce('');                                 // campo vuoto dopo clear → nessun retry

    const bot = makeBot(page as any);
    await (bot as any).typeDevExpressField(/field/, '');

    expect(page.keyboard.type).not.toHaveBeenCalled();
    expect(page.keyboard.press).toHaveBeenCalledWith('Delete');
  });
});

describe('ensureNameFieldBeforeSave', () => {
  it('usa keyboard.type con il valore troncato al maxLength, senza page.type', async () => {
    const page = makePageMock();
    // Prima evaluate: legge currentValue + maxLength + inputId in un unico step
    // Seconda evaluate: find+focus+clear (void)
    // Terza evaluate: verifica il valore dopo la ri-digitazione
    page.evaluate
      .mockResolvedValueOnce({ currentValue: 'Dr. Elio Verace Cent', maxLength: 20, inputId: 'name-input-id' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('Dr. Elio Verace Cent');

    const bot = makeBot(page as any);
    await (bot as any).ensureNameFieldBeforeSave('Dr. Elio Verace Centro Medico');

    // Deve usare keyboard.type (no page.type) per evitare click DevExpress
    expect(page.keyboard.type).toHaveBeenCalledWith('Dr. Elio Verace Cent', { delay: 5 });
    expect(page.keyboard.press).toHaveBeenCalledWith('Tab');
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

  it('chiama typeDevExpressField per url e mobile anche quando sono stringhe vuote', async () => {
    const bot = makeUpdateBot();

    await bot.updateCustomer(profile, { name: 'Acme S.r.l.', url: '', mobile: '' } as any, 'Acme');

    const typeFieldCalls: [RegExp, string][] = (bot as any).typeDevExpressField.mock.calls;
    const urlCall = typeFieldCalls.find(([, v]) => v === '' && typeFieldCalls.indexOf([, v]) >= 0);
    const calledRegexSources = typeFieldCalls.map(([r]) => r.source);
    expect(calledRegexSources).toContain('xaf_dviURL_Edit_I$');
    expect(calledRegexSources).toContain('xaf_dviCELLULARPHONE_Edit_I$');
    const emptyStringCalls = typeFieldCalls.filter(([, v]) => v === '');
    expect(emptyStringCalls).toHaveLength(2);
  });
});
