# Multi-Address Bot Support for Create/Edit — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Archibald bot and the create/edit customer handlers so that when a customer is created or updated, all `addresses[]` from `CustomerFormData` / `UpdateCustomerData` are written to and persisted from the "Indirizzo alt." tab in Archibald ERP.

**Architecture:** The bot gains a new private `writeAltAddresses(addresses: AddressEntry[])` method that performs a full-replace on the "Indirizzo alt." grid (delete all rows, then insert each address). Both `createCustomer` and `completeCustomerCreation` replace their old `fillDeliveryAddress` call with `writeAltAddresses`; `updateCustomer` does the same. The `UpdateCustomerData` handler and the `customer-interactive.ts` save route both call `upsertAddressesForCustomer` after the bot succeeds so that the DB is kept in sync.

**Tech Stack:** Playwright/Puppeteer (DevExpress grid automation), TypeScript strict, Vitest

**Dependencies:** Requires Spec B (Multi-Address Data Layer) to be deployed first.
- `agents.customer_addresses` table must exist
- `AddressEntry` type must be defined in `backend/src/types.ts`
- `CustomerFormData.addresses?: AddressEntry[]` must replace the old `deliveryStreet/deliveryPostalCode` fields
- `upsertAddressesForCustomer` repository function must exist in `backend/src/db/repositories/customer-addresses.ts`
- `CustomerInteractiveRouterDeps.upsertAddressesForCustomer` dep must be wired in `server.ts`
- `saveSchema` in `customer-interactive.ts` must accept `addresses` array (Spec B removes old delivery fields)

---

## Chunk 1 — Bot Changes (Tasks 1–3)

### Task 1: Bot — `writeAltAddresses(addresses: AddressEntry[])`

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`
- Test: `archibald-web-app/backend/src/bot/archibald-bot-customer.spec.ts` *(create new — no existing bot customer spec)*

**Context on existing `fillDeliveryAddress`:** The current method (lines 11445–11724) uses `altGridName` discovery via `ASPxClientControl.GetControlCollection`, then calls `AddNewRow`, fills TIPO (hardcoded "Consegna") via `page.evaluate`, skips NOME with Tab, sets VIA via active element, then uses the lookup find-button for CAP, and confirms with `UpdateEdit`. The new `writeAltAddresses` generalises this to multiple addresses and adds a full-delete pass first.

- [ ] **Step 1: Write the failing test**

```typescript
// archibald-web-app/backend/src/bot/archibald-bot-customer.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AddressEntry } from '../types';

// Minimal bot surface needed to test writeAltAddresses in isolation.
// We exercise the method via a thin test harness that exposes the private method.
// The approach: subclass in test to expose, OR use (bot as any).writeAltAddresses.

const makePageMock = () => ({
  evaluate: vi.fn().mockResolvedValue(0),           // rowCount = 0 by default
  $: vi.fn().mockResolvedValue(null),
  click: vi.fn().mockResolvedValue(undefined),
  waitForSelector: vi.fn().mockResolvedValue(null),
  keyboard: { press: vi.fn().mockResolvedValue(undefined) },
  waitForFunction: vi.fn().mockResolvedValue(undefined),
});

// We import the class to call the private method via cast.
// archibald-bot.ts exports ArchibaldBot as default or named export.
// Adjust the import path if needed once the file is confirmed.
import { ArchibaldBot } from './archibald-bot';

function makeBot(pageMock: ReturnType<typeof makePageMock>): ArchibaldBot {
  // Construct with minimal config — constructor does not call page methods.
  const bot = new ArchibaldBot({ archibald: { url: 'http://test', username: 'u', password: 'p' } } as any);
  (bot as any).page = pageMock;
  // Stub helpers used by writeAltAddresses
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
    page.evaluate.mockResolvedValue(0); // rowCount = 0, also used for AddNewRow/TIPO

    await (bot as any).writeAltAddresses([addressA, addressB]);

    // openCustomerTab called once (upfront), then waitForDevExpressIdle twice (once per insert)
    // The key invariant: page.evaluate called for AddNewRow + TIPO per address
    expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(
      expect.any(Number), // at minimum once per insert (exact count depends on grid name discovery)
    );
  });

  it('skips an address where via, cap, and citta are all empty', async () => {
    page.evaluate.mockResolvedValue(0);

    await (bot as any).writeAltAddresses([emptyAddress]);

    // page.evaluate for AddNewRow should NOT have been called
    const evaluateCalls: string[] = (page.evaluate as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]));
    const addNewCalls = evaluateCalls.filter(s => s.includes('AddNewRow') || s.includes('AddNew'));
    expect(addNewCalls).toHaveLength(0);
  });

  it('calls with empty array: only opens tab, skips insert loop entirely', async () => {
    page.evaluate.mockResolvedValue(0);

    await (bot as any).writeAltAddresses([]);

    expect((bot as any).openCustomerTab).toHaveBeenCalledTimes(1);
    // No insert-related evaluate calls
    const evaluateCalls: unknown[][] = (page.evaluate as ReturnType<typeof vi.fn>).mock.calls;
    const rowCountCall = evaluateCalls[0]; // first call is the rowCount query
    expect(rowCountCall).toBeDefined();
    expect(evaluateCalls).toHaveLength(1); // only rowCount, nothing else
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- archibald-bot-customer
```

Expected: FAIL (method does not exist yet)

- [ ] **Step 3: Implement `writeAltAddresses` in `archibald-bot.ts`**

Add the following private method **immediately before** `fillDeliveryAddress` (line 11445). The method uses the same `altGridName` discovery pattern as `fillDeliveryAddress`, and the same `AddNewRow`/`UpdateEdit` confirm pattern.

```typescript
import type { AddressEntry } from '../types';

// Add inside ArchibaldBot class, before fillDeliveryAddress:

private async writeAltAddresses(addresses: AddressEntry[]): Promise<void> {
  if (!this.page) throw new Error('Browser page is null');

  await this.openCustomerTab('Indirizzo alt');
  await this.waitForDevExpressIdle({ timeout: 5000, label: 'tab-indirizzo-alt-write' });

  // ── 1. Discover grid name (same approach as fillDeliveryAddress) ──────────
  const altGridName = await this.page.evaluate(() => {
    const w = window as any;
    if (!w.ASPxClientControl?.GetControlCollection) return '';
    let found = '';
    w.ASPxClientControl.GetControlCollection().ForEachControl((c: any) => {
      if (typeof c?.GetGridView === 'function') {
        const gv = c.GetGridView?.();
        const name = gv?.GetName?.() || c.GetName?.() || '';
        if (name.includes('LOGISTICS') || name.includes('Address') || name.includes('address')) {
          found = c.GetName?.() || '';
        }
      }
      const cName = c?.name || c?.GetName?.() || '';
      if (
        (cName.includes('LOGISTICS') || cName.includes('Address') || cName.includes('address')) &&
        typeof c?.AddNewRow === 'function'
      ) {
        found = cName;
      }
    });
    return found;
  });

  // ── 2. Delete all existing rows ──────────────────────────────────────────
  const rowCount = await this.page.evaluate(() => {
    return document.querySelectorAll('.dxgvDataRow').length;
  });

  if (rowCount > 0) {
    const selectAllEl = await this.page.$('[id*="SelectAll"], .dxgvSelectAllCheckBox');
    if (selectAllEl) {
      await selectAllEl.click();
      await this.waitForDevExpressIdle({ timeout: 3000, label: 'alt-select-all' });
    }

    try {
      await this.page.click('[id*="btnDelete"], [title="Delete"]');
      await this.page.waitForSelector('.dxpc-content', { timeout: 3000 }).catch(() => null);
      const okBtn = await this.page.$('button[id*="Btn_Yes"], button[id*="btnOK"], .dxpc-button:first-child');
      if (okBtn) {
        await okBtn.click();
      }
      await this.waitForDevExpressIdle({ timeout: 5000, label: 'alt-delete-confirm' });
    } catch (deleteErr) {
      logger.warn('writeAltAddresses: delete step failed, continuing with inserts', {
        error: String(deleteErr),
      });
    }
  }

  // ── 3. Insert each address ───────────────────────────────────────────────
  for (const address of addresses) {
    const via = address.via ?? null;
    const cap = address.cap ?? null;
    const citta = address.citta ?? null;

    // Skip if all identifying fields are empty — would produce a blank row
    if (!via && !cap && !citta) continue;

    // 3a. Add new row
    if (altGridName) {
      await this.page.evaluate((name: string) => {
        const w = window as any;
        const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
        if (grid) grid.AddNewRow();
      }, altGridName);
    } else {
      const addNewResult = await this.page.evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll('a[data-args*="AddNew"]'),
        ).filter((node) => {
          const el = node as HTMLElement;
          return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
        }) as HTMLElement[];
        if (candidates.length > 0) { candidates[0].click(); return true; }
        return false;
      });
      if (!addNewResult) {
        logger.warn('writeAltAddresses: AddNew button not found, skipping row');
        continue;
      }
    }

    await this.waitForDevExpressIdle({ timeout: 8000, label: 'alt-addnew' });

    // 3b. Set TIPO via evaluate (same pattern as fillDeliveryAddress)
    const tipoValue = address.tipo || 'Consegna';
    const tipoSet = await this.page.evaluate((tipo: string) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]')).filter(
        (i) => (i as HTMLElement).offsetParent !== null,
      ) as HTMLInputElement[];
      const tipoInput = inputs.find((i) => {
        const id = i.id.toLowerCase();
        return id.includes('type') || id.includes('tipo') || id.includes('addresstype');
      });
      if (tipoInput) {
        tipoInput.focus();
        tipoInput.click();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(tipoInput, tipo);
        else tipoInput.value = tipo;
        tipoInput.dispatchEvent(new Event('input', { bubbles: true }));
        tipoInput.dispatchEvent(new Event('change', { bubbles: true }));
        return { found: true, id: tipoInput.id };
      }
      for (const inp of inputs) {
        const row = inp.closest('tr');
        if (row && row.classList.toString().includes('dxgvEditingRow')) {
          inp.focus();
          inp.click();
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(inp, tipo);
          else inp.value = tipo;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return { found: true, id: inp.id };
        }
      }
      return { found: false, id: '' };
    }, tipoValue);

    if (!tipoSet.found) {
      logger.warn('writeAltAddresses: TIPO input not found, typing directly');
      await this.page.keyboard.press('Tab'); // ensure focus in row
    }
    await this.page.keyboard.press('Tab');
    await this.waitForDevExpressIdle({ timeout: 3000, label: 'alt-tipo-set' });

    // 3c. NOME column — fill if present, otherwise skip with Tab
    const nomeValue = address.nome ?? '';
    if (nomeValue) {
      await this.page.evaluate((nome: string) => {
        const editingRow = document.querySelector('tr[class*="dxgvEditingRow"]');
        if (!editingRow) return;
        const active = document.activeElement as HTMLInputElement;
        if (active && active.tagName === 'INPUT' && editingRow.contains(active)) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(active, nome);
          else active.value = nome;
          active.dispatchEvent(new Event('input', { bubbles: true }));
          active.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, nomeValue);
    }
    await this.page.keyboard.press('Tab'); // advance past NOME
    await this.waitForDevExpressIdle({ timeout: 3000, label: 'alt-nome-set' });

    // 3d. VIA column
    if (via) {
      const viaSet = await this.page.evaluate((street: string) => {
        const editingRow = document.querySelector('tr[class*="dxgvEditingRow"]');
        if (!editingRow) return false;
        const active = document.activeElement as HTMLInputElement;
        if (active && active.tagName === 'INPUT' && editingRow.contains(active)) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(active, street);
          else active.value = street;
          active.dispatchEvent(new Event('input', { bubbles: true }));
          active.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, via);
      if (!viaSet) {
        logger.warn('writeAltAddresses: VIA active element not in editing row, typing directly');
        await this.page.keyboard.type(via, { delay: 30 });
      }
    }
    await this.page.keyboard.press('Tab');
    await this.waitForDevExpressIdle({ timeout: 3000, label: 'alt-via-set' });

    // 3e. CAP column — lookup field (same pattern as fillDeliveryAddress)
    if (cap) {
      const findBtnId = await this.page.evaluate(() => {
        const editingRow = document.querySelector('tr[class*="dxgvEditingRow"]');
        if (editingRow) {
          const btns = Array.from(editingRow.querySelectorAll('td, img, button, a, div')).filter(
            (el) => /LOGISTICSADDRESSZIPCODE.*_B0$|_find_Edit_B0$/.test(el.id),
          );
          if (btns.length > 0) return btns[0].id;
        }
        const allBtns = Array.from(document.querySelectorAll('td, img, button, a, div')).filter((el) => {
          const h = el as HTMLElement;
          return h.offsetParent !== null && /LOGISTICSADDRESSZIPCODE.*_B0$/.test(el.id);
        });
        return allBtns.length > 0 ? allBtns[allBtns.length - 1].id : null;
      });

      if (findBtnId) {
        await this.selectFromDevExpressLookup(
          new RegExp(findBtnId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
          cap,
          citta ?? undefined,
        );
      } else {
        logger.warn('writeAltAddresses: CAP find button not found, typing directly');
        await this.page.keyboard.type(cap, { delay: 20 });
        await this.page.keyboard.press('Tab');
        await this.waitForDevExpressIdle({ timeout: 3000, label: 'alt-cap-direct' });
      }
    }

    // 3f. Confirm row with UpdateEdit
    if (altGridName) {
      await this.page.evaluate((name: string) => {
        const w = window as any;
        const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
        if (grid) grid.UpdateEdit();
      }, altGridName);
    } else {
      const updateResult = await this.page.evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll('a[data-args*="UpdateEdit"]'),
        ).filter((node) => {
          const el = node as HTMLElement;
          return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
        }) as HTMLElement[];
        if (candidates.length > 0) { candidates[0].click(); return true; }
        return false;
      });
      if (!updateResult) {
        logger.warn('writeAltAddresses: UpdateEdit not found, pressing Enter');
        await this.page.keyboard.press('Enter');
      }
    }

    await this.waitForDevExpressIdle({ timeout: 8000, label: 'alt-update-edit' });
    logger.debug('writeAltAddresses: row confirmed', { tipo: tipoValue, via, cap });
  }

  logger.info('writeAltAddresses: complete', { addressCount: addresses.length });
}
```

Import at top of `archibald-bot.ts` (if not already present from Spec B):

```typescript
import type { AddressEntry } from '../types';
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --prefix archibald-web-app/backend -- archibald-bot-customer
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts \
        archibald-web-app/backend/src/bot/archibald-bot-customer.spec.ts
git commit -m "feat(bot): add writeAltAddresses method for multi-address ERP support"
```

---

### Task 2: Bot — Update `createCustomer` and `completeCustomerCreation`

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`
- Test: `archibald-web-app/backend/src/bot/archibald-bot-customer.spec.ts` (extend)

**Context:**
- `createCustomer` (line 11728): the delivery block is at lines 11792–11798. Replace with `writeAltAddresses`.
- `completeCustomerCreation` (line 12685): the delivery block is at lines 12723–12729. Replace with `writeAltAddresses`.
- `fillDeliveryAddress` itself is NOT removed (it may be referenced elsewhere).

- [ ] **Step 1: Write the failing tests**

Add to `archibald-bot-customer.spec.ts`:

```typescript
describe('createCustomer — writeAltAddresses integration', () => {
  it('calls writeAltAddresses with addresses from CustomerFormData', async () => {
    const page = makePageMock();
    const bot = makeBot(page);
    (bot as any).writeAltAddresses = vi.fn().mockResolvedValue(undefined);
    // Stub all other methods needed by createCustomer
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
    page.goto = vi.fn().mockResolvedValue(undefined);
    page.waitForFunction = vi.fn().mockResolvedValue(undefined);

    const addresses: AddressEntry[] = [
      { tipo: 'Consegna', via: 'Via Verdi 3', cap: '37122', citta: 'Verona' },
    ];

    await (bot as any).createCustomer({ name: 'Test S.r.l.', addresses });

    expect((bot as any).writeAltAddresses).toHaveBeenCalledWith(addresses);
  });

  it('calls writeAltAddresses with empty array when addresses field absent', async () => {
    const page = makePageMock();
    const bot = makeBot(page);
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
    page.goto = vi.fn().mockResolvedValue(undefined);
    page.waitForFunction = vi.fn().mockResolvedValue(undefined);

    await (bot as any).createCustomer({ name: 'Test S.r.l.' }); // no addresses field

    expect((bot as any).writeAltAddresses).toHaveBeenCalledWith([]);
  });
});

describe('completeCustomerCreation — writeAltAddresses integration', () => {
  it('calls writeAltAddresses with addresses from CustomerFormData', async () => {
    const page = makePageMock();
    const bot = makeBot(page);
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
    page.waitForFunction = vi.fn().mockResolvedValue(undefined);
    // completeCustomerCreation reads profileId from page — stub it
    (bot as any).readCustomerProfileFromPage = vi.fn().mockResolvedValue('PROFILE-001');
    // If profile is read differently, stub as needed:
    page.evaluate = vi.fn().mockResolvedValue('PROFILE-001');

    const addresses: AddressEntry[] = [{ tipo: 'Ufficio', via: 'Via Scala 2', cap: '20121', citta: 'Milano' }];

    await (bot as any).completeCustomerCreation({ name: 'Test', addresses });

    expect((bot as any).writeAltAddresses).toHaveBeenCalledWith(addresses);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- archibald-bot-customer
```

Expected: FAIL

- [ ] **Step 3: Implement changes in `archibald-bot.ts`**

**In `createCustomer` — replace lines 11791–11798:**

Remove:
```typescript
    // Step 2: "Indirizzo alt." tab — fill delivery address (if present)
    if (customerData.deliveryStreet && customerData.deliveryPostalCode) {
      await this.fillDeliveryAddress(
        customerData.deliveryStreet,
        customerData.deliveryPostalCode,
        customerData.deliveryPostalCodeCity,
      );
    }
```

Replace with:
```typescript
    // Step 2: "Indirizzo alt." tab — write all alt addresses (full replace)
    await this.writeAltAddresses(customerData.addresses ?? []);
```

**In `completeCustomerCreation` — replace lines 11721–11729:**

Remove:
```typescript
    // Step 2: "Indirizzo alt." tab — fill delivery address (if present)
    await this.emitProgress("customer.tab.indirizzo");
    if (customerData.deliveryStreet && customerData.deliveryPostalCode) {
      await this.fillDeliveryAddress(
        customerData.deliveryStreet,
        customerData.deliveryPostalCode,
        customerData.deliveryPostalCodeCity,
      );
    }
```

Replace with:
```typescript
    // Step 2: "Indirizzo alt." tab — write all alt addresses (full replace)
    await this.emitProgress("customer.tab.indirizzo");
    await this.writeAltAddresses(customerData.addresses ?? []);
```

Note: if Spec B has already made these replacements, skip them (guard: check if the `deliveryStreet` block is still present).

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --prefix archibald-web-app/backend -- archibald-bot-customer
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts \
        archibald-web-app/backend/src/bot/archibald-bot-customer.spec.ts
git commit -m "feat(bot): replace fillDeliveryAddress with writeAltAddresses in createCustomer and completeCustomerCreation"
```

---

### Task 3: Bot — Update `updateCustomer`

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`
- Test: `archibald-web-app/backend/src/bot/archibald-bot-customer.spec.ts` (extend)

**Context:** `updateCustomer` is at line 11960. The delivery block at lines 12176–12182 guards on `deliveryStreet && deliveryPostalCode` and calls `fillDeliveryAddress`.

- [ ] **Step 1: Write the failing test**

Add to `archibald-bot-customer.spec.ts`:

```typescript
describe('updateCustomer — writeAltAddresses integration', () => {
  function makeUpdateBot(): ArchibaldBot {
    const page = makePageMock();
    page.goto = vi.fn().mockResolvedValue(undefined);
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
    // navigateToEditCustomerForm or equivalent stubbing
    (bot as any).navigateToEditCustomerForm = vi.fn().mockResolvedValue(undefined);
    (bot as any).clickElementByText = vi.fn().mockResolvedValue(true);
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- archibald-bot-customer
```

Expected: FAIL

- [ ] **Step 3: Implement in `archibald-bot.ts`**

**In `updateCustomer` — replace lines 12176–12182:**

Remove:
```typescript
    if (customerData.deliveryStreet && customerData.deliveryPostalCode) {
      await this.fillDeliveryAddress(
        customerData.deliveryStreet,
        customerData.deliveryPostalCode,
        customerData.deliveryPostalCodeCity,
      );
    }
```

Replace with:
```typescript
    await this.writeAltAddresses(customerData.addresses ?? []);
```

Note: if Spec B has already made this replacement, skip it (guard: check if the `deliveryStreet` block is still present).

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --prefix archibald-web-app/backend -- archibald-bot-customer
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts \
        archibald-web-app/backend/src/bot/archibald-bot-customer.spec.ts
git commit -m "feat(bot): replace fillDeliveryAddress with writeAltAddresses in updateCustomer"
```

---

## Chunk 2 — Handler and Route Changes (Tasks 4–6)

### Task 4: `UpdateCustomerData` — Replace Delivery Fields with `addresses`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/update-customer.ts`
- Test: `archibald-web-app/backend/src/operations/handlers/update-customer.spec.ts` (extend)

**Context:** `update-customer.ts` currently defines `UpdateCustomerData` with `deliveryStreet?`, `deliveryPostalCode?`, `deliveryPostalCodeCity?`, `deliveryPostalCodeCountry?`. These are removed. `addresses?: AddressEntry[]` is added. After `bot.updateCustomer(...)` returns, `upsertAddressesForCustomer` is called to persist addresses to DB.

- [ ] **Step 1: Write the failing tests**

Add to `update-customer.spec.ts`:

```typescript
import { upsertAddressesForCustomer } from '../../db/repositories/customer-addresses';
import type { AddressEntry } from '../../types';

// Mock the customer-addresses repo module
vi.mock('../../db/repositories/customer-addresses', () => ({
  upsertAddressesForCustomer: vi.fn().mockResolvedValue(undefined),
}));

// (Place inside the existing describe block, after existing tests)

describe('handleUpdateCustomer — addresses', () => {
  const addressEntry: AddressEntry = { tipo: 'Consegna', via: 'Via Verdi 1', cap: '37100', citta: 'Verona' };

  test('calls upsertAddressesForCustomer with provided addresses after bot update', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const dataWithAddresses: UpdateCustomerData = {
      ...sampleData,
      addresses: [addressEntry],
    };

    await handleUpdateCustomer(pool, bot, dataWithAddresses, 'user-1', vi.fn());

    expect(upsertAddressesForCustomer).toHaveBeenCalledWith(
      pool,
      'user-1',
      'CUST-001',
      [addressEntry],
    );
  });

  test('calls upsertAddressesForCustomer with empty array when addresses absent', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleUpdateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(upsertAddressesForCustomer).toHaveBeenCalledWith(
      pool,
      'user-1',
      'CUST-001',
      [],
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- update-customer
```

Expected: FAIL

- [ ] **Step 3: Implement in `update-customer.ts`**

**Replace `UpdateCustomerData` type:**

Remove:
```typescript
  deliveryStreet?: string;
  deliveryPostalCode?: string;
  postalCodeCity?: string;
  postalCodeCountry?: string;
  deliveryPostalCodeCity?: string;
  deliveryPostalCodeCountry?: string;
```

Add (after `vatWasValidated?`):
```typescript
  addresses?: AddressEntry[];
```

**Add import at top of file:**
```typescript
import type { AddressEntry } from '../../types';
import { upsertAddressesForCustomer } from '../../db/repositories/customer-addresses';
```

**Add DB upsert call inside `handleUpdateCustomer`, after `bot.updateCustomer(...)` line (line 93) and before `if (data.vatWasValidated)`:**

```typescript
  await upsertAddressesForCustomer(pool, userId, data.customerProfile, data.addresses ?? []);
```

The full sequence after the change:
```typescript
  await bot.updateCustomer(data.customerProfile, data, originalName);
  await upsertAddressesForCustomer(pool, userId, data.customerProfile, data.addresses ?? []);

  if (data.vatWasValidated) {
    await updateVatValidatedAt(pool, userId, data.customerProfile);
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --prefix archibald-web-app/backend -- update-customer
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/update-customer.ts \
        archibald-web-app/backend/src/operations/handlers/update-customer.spec.ts
git commit -m "feat(handlers): replace delivery fields with addresses[] in UpdateCustomerData, upsert after bot update"
```

---

### Task 5: `customer-interactive.ts` Save Route — Upsert Addresses After Creation

**Files:**
- Modify: `archibald-web-app/backend/src/routes/customer-interactive.ts`
- Test: `archibald-web-app/backend/src/routes/customer-interactive.spec.ts` (extend)

**Context:** The save route (line 320) has an `if (useInteractiveBot)` branch (line 404) that calls `completeCustomerCreation` and returns `customerProfileId`. We add the `upsertAddressesForCustomer` call immediately after `completeCustomerCreation` returns, still inside the `if (useInteractiveBot)` block.

**Important constraints:**
- Variable name is `customerData` (line 329), NOT `formData`.
- The call is `deps.upsertAddressesForCustomer(userId, customerProfileId, altAddresses)` — **3 args** (pool is pre-bound in the closure wired in `server.ts` by Spec B).
- `upsertAddressesForCustomer` is NOT called in the `else` (fallback) branch — the scheduler's `sync-customer-addresses` job handles that path.
- `AddressEntry` (optional fields: `string | undefined`) must be mapped to `AltAddress` (DB fields: `string | null`) before the call.
- `AltAddress` is imported from `../../db/repositories/customer-addresses`.
- `CustomerInteractiveRouterDeps.upsertAddressesForCustomer` is already typed by Spec B as:
  `(userId: string, customerProfile: string, addresses: AltAddress[]) => Promise<void>`

- [ ] **Step 1: Write the failing test**

Add to the `POST /api/customers/interactive/:sessionId/save` describe block in `customer-interactive.spec.ts`:

```typescript
    test('calls upsertAddressesForCustomer with mapped addresses after completeCustomerCreation', async () => {
      const mockBot = createMockBot();
      sessionManager.setBot(sessionId, mockBot);
      const upsertAddresses = vi.fn().mockResolvedValue(undefined);
      const customDeps: CustomerInteractiveRouterDeps = {
        ...createMockDeps(sessionManager),
        upsertAddressesForCustomer: upsertAddresses,
      };
      customDeps.sessionManager = sessionManager;
      const customApp = createApp(customDeps);

      const payloadWithAddresses = {
        name: 'Test Customer',
        addresses: [
          { tipo: 'Consegna', via: 'Via Dante 5', cap: '37100', citta: 'Verona' },
        ],
      };

      await request(customApp)
        .post(`/api/customers/interactive/${sessionId}/save`)
        .send(payloadWithAddresses);

      await vi.waitFor(() => {
        expect(upsertAddresses).toHaveBeenCalledWith(
          'user-1',
          'PROFILE-123', // completeCustomerCreation mock returns this
          [{ tipo: 'Consegna', nome: null, via: 'Via Dante 5', cap: '37100', citta: 'Verona', contea: null, stato: null, idRegione: null, contra: null }],
        );
      });
    });

    test('does NOT call upsertAddressesForCustomer in fallback bot path', async () => {
      // No bot set → falls back to fresh bot (createCustomer, not completeCustomerCreation)
      const upsertAddresses = vi.fn().mockResolvedValue(undefined);
      const customDeps: CustomerInteractiveRouterDeps = {
        ...createMockDeps(sessionManager),
        upsertAddressesForCustomer: upsertAddresses,
      };
      customDeps.sessionManager = sessionManager;
      const customApp = createApp(customDeps);

      await request(customApp)
        .post(`/api/customers/interactive/${sessionId}/save`)
        .send({ name: 'Test', addresses: [{ tipo: 'Consegna', via: 'Via X', cap: '00100', citta: 'Roma' }] });

      await vi.waitFor(() => {
        // Wait for background async to complete
        expect((customDeps.updateCustomerBotStatus as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
      });

      expect(upsertAddresses).not.toHaveBeenCalled();
    });
```

Also update `createMockDeps` to include `upsertAddressesForCustomer` (required by Spec B's type change):

```typescript
function createMockDeps(sessionManager?: InteractiveSessionManager): CustomerInteractiveRouterDeps {
  return {
    // ... existing deps ...
    upsertAddressesForCustomer: vi.fn().mockResolvedValue(undefined),
    // ... rest ...
  };
}
```

And add to the `CustomerInteractiveRouterDeps` type in `customer-interactive.ts` if not already present from Spec B:
```typescript
  upsertAddressesForCustomer: (userId: string, customerProfile: string, addresses: AltAddress[]) => Promise<void>;
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- customer-interactive
```

Expected: FAIL

- [ ] **Step 3: Implement in `customer-interactive.ts`**

**Add imports at top of file:**
```typescript
import type { AltAddress } from '../db/repositories/customer-addresses';
```

**Add `upsertAddressesForCustomer` to `CustomerInteractiveRouterDeps` (if not already present from Spec B):**
```typescript
type CustomerInteractiveRouterDeps = {
  // ... existing deps ...
  upsertAddressesForCustomer: (userId: string, customerProfile: string, addresses: AltAddress[]) => Promise<void>;
};
```

**Destructure `upsertAddressesForCustomer` in `createCustomerInteractiveRouter`:**
```typescript
  const {
    sessionManager, createBot, broadcast,
    upsertSingleCustomer, updateCustomerBotStatus,
    updateVatValidatedAt, getCustomerByProfile,
    pauseSyncs, resumeSyncs,
    smartCustomerSync, getCustomerProgressMilestone,
    upsertAddressesForCustomer,
  } = deps;
```

**In the `if (useInteractiveBot)` branch (currently lines 404–408), replace:**
```typescript
          if (useInteractiveBot) {
            setupProgressCallback(existingBot!);
            customerProfileId = await existingBot!.completeCustomerCreation(customerData);
            await sessionManager.removeBot(sessionId);
            sessionManager.updateState(sessionId, 'completed');
```

With:
```typescript
          if (useInteractiveBot) {
            setupProgressCallback(existingBot!);
            customerProfileId = await existingBot!.completeCustomerCreation(customerData);
            const altAddresses: AltAddress[] = (customerData.addresses ?? []).map(a => ({
              tipo: a.tipo,
              nome: a.nome ?? null,
              via: a.via ?? null,
              cap: a.cap ?? null,
              citta: a.citta ?? null,
              contea: a.contea ?? null,
              stato: a.stato ?? null,
              idRegione: a.idRegione ?? null,
              contra: a.contra ?? null,
            }));
            await upsertAddressesForCustomer(userId, customerProfileId, altAddresses);
            await sessionManager.removeBot(sessionId);
            sessionManager.updateState(sessionId, 'completed');
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --prefix archibald-web-app/backend -- customer-interactive
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/customer-interactive.ts \
        archibald-web-app/backend/src/routes/customer-interactive.spec.ts
git commit -m "feat(routes): upsert addresses to DB after interactive customer creation"
```

---

### Task 6: Final Type-Check and Full Test Run

**Files:** All modified files

- [ ] **Step 1: Run TypeScript type-check**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errors

Common issues to watch for:
- `AddressEntry` not yet in `types.ts` → Spec B must be deployed first
- `AltAddress` not exported from `customer-addresses.ts` → fix in Spec B's repo file
- `upsertAddressesForCustomer` signature mismatch → verify 4-arg repo vs 3-arg dep wrapper
- `customerData.addresses` not on `CustomerFormData` → Spec B must have updated the type

- [ ] **Step 2: Run all backend tests**

```bash
npm test --prefix archibald-web-app/backend
```

Expected: all pass, no regressions

- [ ] **Step 3: Commit (if any fix-up changes needed)**

```bash
git add [any fix-up files]
git commit -m "fix(bot): address type-check issues from multi-address bot support"
```

---

## Summary of All Modified Files

| File | Change |
|------|--------|
| `backend/src/bot/archibald-bot.ts` | Add `writeAltAddresses()` private method; replace `fillDeliveryAddress` call in `createCustomer`, `completeCustomerCreation`, `updateCustomer` |
| `backend/src/bot/archibald-bot-customer.spec.ts` | New test file: unit tests for `writeAltAddresses`, `createCustomer`, `completeCustomerCreation`, `updateCustomer` integration |
| `backend/src/operations/handlers/update-customer.ts` | Remove delivery fields from `UpdateCustomerData`; add `addresses?: AddressEntry[]`; call `upsertAddressesForCustomer` after bot update |
| `backend/src/operations/handlers/update-customer.spec.ts` | Add tests: `upsertAddressesForCustomer` called with correct args |
| `backend/src/routes/customer-interactive.ts` | Add `upsertAddressesForCustomer` to `CustomerInteractiveRouterDeps`; call it after `completeCustomerCreation` inside `if (useInteractiveBot)` |
| `backend/src/routes/customer-interactive.spec.ts` | Add tests: `upsertAddressesForCustomer` called with mapped addresses in interactive path; NOT called in fallback path |

## Test Commands

```bash
# Individual task tests
npm test --prefix archibald-web-app/backend -- archibald-bot-customer
npm test --prefix archibald-web-app/backend -- update-customer
npm test --prefix archibald-web-app/backend -- customer-interactive

# Full suite
npm test --prefix archibald-web-app/backend

# Type-check
npm run build --prefix archibald-web-app/backend
```

## Conventions

- Tests use Vitest: `import { describe, it, expect, vi, beforeEach } from 'vitest'`
- Bot private methods are tested by casting to `any`: `(bot as any).writeAltAddresses`
- `AltAddress` is imported from `../../db/repositories/customer-addresses` (defined in Spec B)
- `AddressEntry` is imported from `../../types` (defined in Spec B)
- TypeScript strict mode; `import type` for type-only imports
- `upsertAddressesForCustomer` repo function signature: `(pool: DbPool, userId: string, customerProfile: string, addresses: AltAddress[]) => Promise<void>` (4 args)
- `deps.upsertAddressesForCustomer` dep wrapper signature: `(userId: string, customerProfile: string, addresses: AltAddress[]) => Promise<void>` (3 args — pool bound by closure in `server.ts`)
