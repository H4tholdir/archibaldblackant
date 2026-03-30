# Sync Address & Articles Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two scheduler bugs (stop() + race condition) and replace fragile name-based customer navigation with direct ERP ID navigation for address sync, plus a minor monitoring improvement.

**Architecture:** All changes are in the backend. Scheduler gets two targeted fixes; bot gets a new public method; handler interface and tests are updated to match; monitoring endpoint gets a larger job fetch window.

**Tech Stack:** TypeScript strict, Vitest, BullMQ, Puppeteer (archibald-bot)

**Spec:** `docs/superpowers/specs/2026-03-30-sync-address-articles-improvements-design.md`

---

## Files

| File | Change |
|------|--------|
| `src/sync/sync-scheduler.ts` | Fix `stop()` + stable idempotency key + delayed Map delete |
| `src/sync/sync-scheduler.spec.ts` | Replace 2 wrong tests, update 1, add 1 |
| `src/bot/archibald-bot.ts` | Add `navigateToCustomerByErpId` method |
| `src/operations/handlers/sync-customer-addresses.ts` | Swap interface method, update calls |
| `src/operations/handlers/sync-customer-addresses.spec.ts` | Update mock + all assertions |
| `src/main.ts` | Update bot wiring for address sync |
| `src/routes/sync-status.ts` | Increase job fetch limit 150→500 |

All paths relative to `archibald-web-app/backend/`.

---

## Task 1: Fix scheduler stop() and address sync idempotency

### Files
- Modify: `src/sync/sync-scheduler.ts`
- Modify: `src/sync/sync-scheduler.spec.ts`

- [ ] **Step 1: Update existing test that asserts NO idempotency key**

In `sync-scheduler.spec.ts`, the test `'enqueues sync-customer-addresses after ADDRESS_SYNC_DELAY_MS for active agents'` (inside `describe('address sync auto-enqueue')`) currently asserts enqueue is called with 3 args (no key). Update it to expect the 4th stable key arg:

```ts
test('enqueues sync-customer-addresses after ADDRESS_SYNC_DELAY_MS for active agents', async () => {
  const enqueue = createMockEnqueue();
  const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
    { erp_id: 'CUST-001', name: 'Rossi Mario' },
    { erp_id: 'CUST-002', name: 'Verdi Luca' },
  ]);
  const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), undefined, getCustomersNeedingAddressSync);

  scheduler.start(intervals);
  await vi.advanceTimersByTimeAsync(100);

  expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object));

  await vi.advanceTimersByTimeAsync(ADDRESS_SYNC_DELAY_MS);

  expect(getCustomersNeedingAddressSync).toHaveBeenCalledWith('user-1', ADDRESS_SYNC_BATCH_LIMIT);
  expect(enqueue).toHaveBeenCalledWith(
    'sync-customer-addresses',
    'user-1',
    {
      customers: [
        { erpId: 'CUST-001', customerName: 'Rossi Mario' },
        { erpId: 'CUST-002', customerName: 'Verdi Luca' },
      ],
    },
    'sync-customer-addresses-user-1',
  );

  scheduler.stop();
});
```

- [ ] **Step 2: Replace wrong test — idempotency key**

Remove the test `'enqueues sync-customer-addresses without idempotency key to allow re-enqueue each cycle'` entirely and replace it with:

```ts
test('address sync uses stable idempotency key sync-customer-addresses-{userId}', async () => {
  const enqueue = createMockEnqueue();
  const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
    { erp_id: 'CUST-001', name: 'Rossi Mario' },
  ]);
  const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), undefined, getCustomersNeedingAddressSync);

  scheduler.start(intervals);
  await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);

  const addressCall = enqueue.mock.calls.find((c) => c[0] === 'sync-customer-addresses');
  expect(addressCall).toBeDefined();
  expect(addressCall![3]).toBe('sync-customer-addresses-user-1');

  scheduler.stop();
});
```

- [ ] **Step 3: Replace wrong test — stop() must cancel address timeouts**

Remove the test `'stop() does not cancel pending address sync timeouts (survives session stops)'` entirely and replace it with:

```ts
test('stop() cancels pending address sync timeouts so no enqueue fires after stop', async () => {
  const enqueue = createMockEnqueue();
  const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
    { erp_id: 'CUST-001', name: 'Rossi' },
  ]);
  const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), undefined, getCustomersNeedingAddressSync);

  scheduler.start(intervals);
  await vi.advanceTimersByTimeAsync(100); // first tick → schedules 5-min address timeout
  scheduler.stop();

  enqueue.mockClear();
  await vi.advanceTimersByTimeAsync(ADDRESS_SYNC_DELAY_MS); // would have fired without fix

  expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object));
});
```

- [ ] **Step 4: Run tests to verify they FAIL**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/sync/sync-scheduler.spec.ts
```

Expected: 3 failures — the tests now expect the fixed behavior but the code is unchanged.

- [ ] **Step 5: Fix `stop()` in sync-scheduler.ts**

Replace the `stop()` function (currently lines 152–162):

```ts
function stop(): void {
  for (const timer of timers) {
    clearInterval(timer);
  }
  timers.length = 0;
  for (const timeout of pendingTimeouts) {
    clearTimeout(timeout);
  }
  pendingTimeouts.length = 0;
  for (const [, tid] of addressSyncTimeouts) {
    clearTimeout(tid);
  }
  addressSyncTimeouts.clear();
  running = false;
}
```

- [ ] **Step 6: Fix `scheduleAddressSync` — stable key + delayed Map delete**

Replace the entire `scheduleAddressSync` function (currently lines 74–96):

```ts
function scheduleAddressSync(agentIds: string[]): void {
  if (!getCustomersNeedingAddressSync) return;
  for (const userId of agentIds) {
    if (addressSyncTimeouts.has(userId)) continue;
    const agentUserId = userId;
    const tid = setTimeout(() => {
      getCustomersNeedingAddressSync(agentUserId, ADDRESS_SYNC_BATCH_LIMIT)
        .then((customers) => {
          if (customers.length === 0) {
            addressSyncTimeouts.delete(agentUserId);
            return;
          }
          return enqueue(
            'sync-customer-addresses',
            agentUserId,
            { customers: customers.map((c) => ({ erpId: c.erp_id, customerName: c.name })) },
            `sync-customer-addresses-${agentUserId}`,
          ).finally(() => {
            addressSyncTimeouts.delete(agentUserId);
          });
        })
        .catch((error) => {
          logger.error('Failed to fetch customers needing address sync', { userId: agentUserId, error });
          addressSyncTimeouts.delete(agentUserId);
        });
    }, ADDRESS_SYNC_DELAY_MS);
    addressSyncTimeouts.set(agentUserId, tid);
  }
}
```

- [ ] **Step 7: Run tests — must pass**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/sync/sync-scheduler.spec.ts
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/sync/sync-scheduler.ts archibald-web-app/backend/src/sync/sync-scheduler.spec.ts
git commit -m "fix(sync): stop() clears address timeouts, stable idempotency key for address sync"
```

---

## Task 2: Add `navigateToCustomerByErpId` to archibald-bot

### Files
- Modify: `src/bot/archibald-bot.ts`

This method has no unit test (bot is E2E only); its contract is verified through the handler tests in Task 3.

- [ ] **Step 1: Add method after `navigateToEditCustomerForm`**

Find `navigateToEditCustomerForm` in `archibald-bot.ts` (around line 13283). Immediately after the closing brace of that method, insert:

```ts
async navigateToCustomerByErpId(erpId: string): Promise<void> {
  if (!this.page) throw new Error("Browser page is null");
  const cleanId = erpId.replace(/,/g, '');
  logger.info("navigateToCustomerByErpId: navigating directly", { erpId: cleanId });

  await this.page.goto(
    `${config.archibald.url}/CUSTTABLE_DetailView/${cleanId}/?mode=View`,
    { waitUntil: "networkidle2", timeout: 60000 },
  );

  if (this.page.url().includes("Login.aspx")) {
    throw new Error("Sessione scaduta: reindirizzato al login");
  }

  await this.waitForDevExpressReady({ timeout: 10000 });
  logger.info("navigateToCustomerByErpId: form loaded", { erpId: cleanId });
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "feat(bot): add navigateToCustomerByErpId for direct ERP ID navigation"
```

---

## Task 3: Update handler interface, implementation, tests and main.ts wiring

### Files
- Modify: `src/operations/handlers/sync-customer-addresses.ts`
- Modify: `src/operations/handlers/sync-customer-addresses.spec.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Update `createMockBot` in the spec file**

Replace the `createMockBot` function (lines 41–48):

```ts
function createMockBot(addresses: AltAddress[] = mockAltAddresses): SyncCustomerAddressesBot {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    navigateToCustomerByErpId: vi.fn().mockResolvedValue(undefined),
    readAltAddresses: vi.fn().mockResolvedValue(addresses),
    close: vi.fn().mockResolvedValue(undefined),
  };
}
```

- [ ] **Step 2: Update single-customer mode test assertions**

In the test `'navigates to customer, reads addresses, upserts them, and sets synced_at'`, replace:

```ts
expect(bot.navigateToEditCustomerForm).toHaveBeenCalledWith(data.customerName);
```

With:

```ts
expect(bot.navigateToCustomerByErpId).toHaveBeenCalledWith(data.erpId);
```

- [ ] **Step 3: Update batch mode test assertions**

In `describe('batch mode')`, test `'initializes bot once, processes each customer sequentially, closes bot once'`, replace:

```ts
expect(bot.navigateToEditCustomerForm).toHaveBeenCalledTimes(2);
expect(bot.navigateToEditCustomerForm).toHaveBeenNthCalledWith(1, 'Rossi Mario');
expect(bot.navigateToEditCustomerForm).toHaveBeenNthCalledWith(2, 'Verdi Luca');
```

With:

```ts
expect(bot.navigateToCustomerByErpId).toHaveBeenCalledTimes(2);
expect(bot.navigateToCustomerByErpId).toHaveBeenNthCalledWith(1, 'CUST-001');
expect(bot.navigateToCustomerByErpId).toHaveBeenNthCalledWith(2, 'CUST-002');
```

- [ ] **Step 4: Update failure/error test assertions in batch mode**

In test `'skips a failing customer and continues with the next'`, replace:

```ts
(bot.navigateToEditCustomerForm as ReturnType<typeof vi.fn>)
  .mockRejectedValueOnce(new Error('nav error'))
  .mockResolvedValueOnce(undefined);
```
and
```ts
expect(bot.navigateToEditCustomerForm).toHaveBeenCalledTimes(2);
```

With:

```ts
(bot.navigateToCustomerByErpId as ReturnType<typeof vi.fn>)
  .mockRejectedValueOnce(new Error('nav error'))
  .mockResolvedValueOnce(undefined);
```
and
```ts
expect(bot.navigateToCustomerByErpId).toHaveBeenCalledTimes(2);
```

In test `'closes bot even if all customers fail'`, replace:

```ts
(bot.navigateToEditCustomerForm as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nav error'));
```

With:

```ts
(bot.navigateToCustomerByErpId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nav error'));
```

- [ ] **Step 5: Update Protocol-error reinit tests**

In test `'reinitializes bot when a Protocol error occurs...'`, replace:

```ts
(bot.navigateToEditCustomerForm as ReturnType<typeof vi.fn>)
  .mockRejectedValueOnce(protocolError)
  .mockResolvedValueOnce(undefined);
```
and
```ts
expect(bot.navigateToEditCustomerForm).toHaveBeenCalledTimes(2);
```

With:

```ts
(bot.navigateToCustomerByErpId as ReturnType<typeof vi.fn>)
  .mockRejectedValueOnce(protocolError)
  .mockResolvedValueOnce(undefined);
```
and
```ts
expect(bot.navigateToCustomerByErpId).toHaveBeenCalledTimes(2);
```

In test `'skips remaining customers gracefully when bot reinitialization also fails...'`, replace:

```ts
(bot.navigateToEditCustomerForm as ReturnType<typeof vi.fn>)
  .mockRejectedValueOnce(protocolError)
  .mockRejectedValueOnce(pageNullError);
```

With:

```ts
(bot.navigateToCustomerByErpId as ReturnType<typeof vi.fn>)
  .mockRejectedValueOnce(protocolError)
  .mockRejectedValueOnce(pageNullError);
```

- [ ] **Step 6: Run handler tests — must FAIL**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/operations/handlers/sync-customer-addresses.spec.ts
```

Expected: TypeScript errors or test failures because the interface still has `navigateToEditCustomerForm`.

- [ ] **Step 7: Update handler interface and implementation**

In `sync-customer-addresses.ts`, replace the `SyncCustomerAddressesBot` type:

```ts
type SyncCustomerAddressesBot = {
  initialize: () => Promise<void>;
  navigateToCustomerByErpId: (erpId: string) => Promise<void>;
  readAltAddresses: () => Promise<AltAddress[]>;
  close: () => Promise<void>;
};
```

In the **batch mode** loop (inside `if (data.customers && data.customers.length > 0)`), replace:

```ts
await bot.navigateToEditCustomerForm(customerName);
```

With:

```ts
await bot.navigateToCustomerByErpId(erpId);
```

In the **single customer mode** block (after the batch block), replace:

```ts
await bot.navigateToEditCustomerForm(data.customerName!);
```

With:

```ts
await bot.navigateToCustomerByErpId(data.erpId!);
```

- [ ] **Step 8: Update main.ts wiring**

In `main.ts`, find the `'sync-customer-addresses'` handler registration (around line 710). Replace:

```ts
'sync-customer-addresses': createSyncCustomerAddressesHandler(pool, (userId) => {
  const bot = createBotForUser(userId);
  return {
    initialize: async () => bot.initialize(),
    navigateToEditCustomerForm: async (name) => bot.navigateToEditCustomerForm(name),
    readAltAddresses: async () => bot.readAltAddresses(),
    close: async () => bot.close(),
  };
}),
```

With:

```ts
'sync-customer-addresses': createSyncCustomerAddressesHandler(pool, (userId) => {
  const bot = createBotForUser(userId);
  return {
    initialize: async () => bot.initialize(),
    navigateToCustomerByErpId: async (erpId) => bot.navigateToCustomerByErpId(erpId),
    readAltAddresses: async () => bot.readAltAddresses(),
    close: async () => bot.close(),
  };
}),
```

- [ ] **Step 9: Run handler tests and type-check — must pass**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/operations/handlers/sync-customer-addresses.spec.ts
npm run build --prefix archibald-web-app/backend 2>&1 | head -30
```

Expected: all tests pass, no type errors.

- [ ] **Step 10: Commit**

```bash
git add \
  archibald-web-app/backend/src/operations/handlers/sync-customer-addresses.ts \
  archibald-web-app/backend/src/operations/handlers/sync-customer-addresses.spec.ts \
  archibald-web-app/backend/src/main.ts
git commit -m "feat(sync): navigate address sync by ERP ID instead of customer name"
```

---

## Task 4: Monitoring job fetch limit

### Files
- Modify: `src/routes/sync-status.ts`

- [ ] **Step 1: Increase limit in sync-history endpoint**

In `sync-status.ts`, find the line:

```ts
const jobs = await queue.queue.getJobs(['completed', 'failed'], 0, 149);
```

Replace with:

```ts
const jobs = await queue.queue.getJobs(['completed', 'failed'], 0, 499);
```

- [ ] **Step 2: Run full backend test suite and type-check**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -20
npm run build --prefix archibald-web-app/backend 2>&1 | head -20
```

Expected: all tests pass, no type errors.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/routes/sync-status.ts
git commit -m "fix(monitoring): increase sync-history job fetch window to 500 per queue"
```
