# Sync Address & Articles Improvements — Design (2026-03-30)

## Scope

Fix two bugs and one fragility in the `sync-customer-addresses` and
`sync-order-articles` pipelines, plus a minor monitoring improvement.

Excluded: PDF→HTML migration for saleslines (article code not visible in HTML
grid; previous HTML migrations had issues; current approach is working).

---

## 1. Scheduler fixes (`sync-scheduler.ts`)

### 1a. `stop()` clears `addressSyncTimeouts`

**Bug:** `addressSyncTimeouts` is a separate `Map<string, NodeJS.Timeout>` that
is never cleared in `stop()`. When the scheduler is paused (e.g. during
`smartCustomerSync`), pending address-sync timeouts keep firing and enqueue jobs
even though the scheduler is stopped.

**Fix:** Add to `stop()`:
```ts
for (const [, tid] of addressSyncTimeouts) clearTimeout(tid);
addressSyncTimeouts.clear();
```

### 1b. Stable idempotency key + delayed Map delete

**Bug:** `addressSyncTimeouts.delete(userId)` fires before the async chain
(getCustomers → enqueue). The Map entry is removed before enqueue resolves, so
the next scheduler tick (10 min later) creates a new timeout while the previous
job may still be running. Over time, multiple jobs for the same user accumulate.

**Fix:** Move `addressSyncTimeouts.delete(agentUserId)` into `.finally()` after
the enqueue call, keeping the Map occupied until the enqueue resolves. Also pass
a stable idempotency key `sync-customer-addresses-${agentUserId}` so BullMQ
deduplicates any attempt to queue a second job while one is already
waiting/active.

```ts
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
```

**Tests:**
- Verify `stop()` cancels pending address-sync timeouts (callback never fires).
- Verify enqueue is called with idempotency key `sync-customer-addresses-{userId}`.

---

## 2. Direct ERP ID navigation for address sync

### 2a. New bot method `navigateToCustomerByErpId` (`archibald-bot.ts`)

**Fragility:** `navigateToEditCustomerForm(name)` navigates via the ListView
search — slow, fragile (wrong customer if names are similar), requires extra
round-trip through the list. The ERP ID is already available for each customer
in the batch, and the bot already has a pattern for direct DetailView navigation
(`CUSTTABLE_DetailView/${erpId}/`).

Since address sync only reads data, View mode is sufficient (no save risk).

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

The `replace(/,/g, '')` strips the EN thousands-separator comma that the ERP
includes in customer IDs (e.g. `"55,261"` → `"55261"`).

### 2b. Updated `SyncCustomerAddressesBot` interface

Replace `navigateToEditCustomerForm(name: string)` with
`navigateToCustomerByErpId(erpId: string)`.

```ts
type SyncCustomerAddressesBot = {
  initialize: () => Promise<void>;
  navigateToCustomerByErpId: (erpId: string) => Promise<void>;
  readAltAddresses: () => Promise<AltAddress[]>;
  close: () => Promise<void>;
};
```

### 2c. Updated handler (`sync-customer-addresses.ts`)

Both the batch mode and the single-customer legacy mode call:
```ts
await bot.navigateToCustomerByErpId(erpId);
```

### 2d. Updated wiring (`main.ts`)

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

**Tests:** Update existing mocks to use `navigateToCustomerByErpId`; verify it
is called with `erpId` (not customer name).

---

## 3. Monitoring noise fix (`sync-status.ts`)

**Problem:** `/monitoring/sync-history` calls
`queue.queue.getJobs(['completed', 'failed'], 0, 149)` — 150 jobs per queue.
The `enrichment` queue is dominated by `sync-order-articles` (10 jobs/tick ×
6 ticks/hour = ~60 jobs/hour), which can crowd out `sync-customer-addresses`
and `sync-order-states` in the history window.

**Fix:** Increase limit to 499 (500 per queue):
```ts
const jobs = await queue.queue.getJobs(['completed', 'failed'], 0, 499);
```

2000 jobs total across 4 queues. Redis already holds these in sorted sets, so
the overhead is negligible.

---

## Files changed

| File | Change |
|------|--------|
| `src/sync/sync-scheduler.ts` | Fix `stop()` + stable idempotency key + delayed delete |
| `src/sync/sync-scheduler.spec.ts` | Add tests for stop() cleanup and idempotency key |
| `src/bot/archibald-bot.ts` | Add `navigateToCustomerByErpId` |
| `src/operations/handlers/sync-customer-addresses.ts` | Update interface + handler calls |
| `src/operations/handlers/sync-customer-addresses.spec.ts` | Update mocks and assertions |
| `src/main.ts` | Update bot wiring for address sync |
| `src/routes/sync-status.ts` | Increase job fetch limit to 499 |
