# Customer Form Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix FK violation when saving customer addresses, eliminate 404 console errors during interactive saves, and add CAP→città autocomplete to the alternative address form.

**Architecture:** Three independent fixes across backend route and frontend modal. Fix 1 changes which profile ID is used for the DB address upsert. Fix 2 adds a `skipSafetyPoll` option to prevent redundant BullMQ polls for interactive jobs. Fix 3 reuses the existing `CAP_BY_CODE` lookup inline in the address sub-form.

**Tech Stack:** Express/TypeScript (backend), React 19/TypeScript (frontend), Vitest for both test suites.

---

## File Map

| File | Action | Why |
|------|--------|-----|
| `backend/src/routes/customer-interactive.ts` | Modify lines 449–450 | Use `tempProfile` instead of `customerProfileId` for DB address upsert |
| `backend/src/routes/customer-interactive.spec.ts` | Modify existing test + add 1 test | Update expectation for `upsertAddressesForCustomer` call |
| `frontend/src/api/operations.ts` | Modify `WaitForJobOptions` + `waitForJobViaWebSocket` | Add `skipSafetyPoll` option |
| `frontend/src/api/operations.spec.ts` | Add 1 test | Verify safety poll skipped when `skipSafetyPoll: true` |
| `frontend/src/components/CustomerCreateModal.tsx` | Modify address form rendering + handleSave | Pass `skipSafetyPoll: true`; add CAP lookup in address sub-form |

---

## Task 1 — Fix FK violation: use `tempProfile` for address upsert

**Context:** `completeCustomerCreation` calls `saveAndCloseCustomer()` which closes the ERP form. After that, `getCustomerProfileId()` cannot find the ACCOUNTNUM input → returns `"UNKNOWN"`. `upsertAddressesForCustomer(userId, "UNKNOWN", addresses)` then violates the FK constraint `customer_addresses_customer_profile_user_id_fkey`. `tempProfile` equals `session.customerProfile` for edits (guaranteed in DB after `upsertSingleCustomer`) and `"TEMP-xxx"` for creates (also in DB).

**Files:**
- Modify: `archibald-web-app/backend/src/routes/customer-interactive.ts:449–450`
- Modify: `archibald-web-app/backend/src/routes/customer-interactive.spec.ts`

- [ ] **Step 1: Update the existing address-upsert test to reflect the new expected call**

In `customer-interactive.spec.ts`, find the test `'calls upsertAddressesForCustomer with mapped addresses after completeCustomerCreation'` (around line 486). Change the expected second argument from `'PROFILE-123'` (value returned by `completeCustomerCreation` mock) to the value of `tempProfile`.

For a session with NO `customerProfile` set, `tempProfile = TEMP-${Date.now()}`. Since we can't know the exact value, match with `expect.stringMatching(/^TEMP-/)`:

```typescript
test('calls upsertAddressesForCustomer with mapped addresses after completeCustomerCreation', async () => {
  const mockBot = createMockBot();
  sessionManager.setBot(sessionId, mockBot);
  const upsertAddresses = vi.fn().mockResolvedValue(undefined);
  const customDeps: CustomerInteractiveRouterDeps = {
    ...createMockDeps(sessionManager),
    upsertAddressesForCustomer: upsertAddresses,
  };
  const customApp = createApp(customDeps);

  const payloadWithAddresses = {
    name: 'Test Customer',
    addresses: [{ tipo: 'Consegna', via: 'Via Dante 5', cap: '37100', citta: 'Verona' }],
  };

  await request(customApp)
    .post(`/api/customers/interactive/${sessionId}/save`)
    .send(payloadWithAddresses);

  await vi.waitFor(() => {
    expect(upsertAddresses).toHaveBeenCalledWith(
      'user-1',
      expect.stringMatching(/^TEMP-/),
      [{ tipo: 'Consegna', nome: null, via: 'Via Dante 5', cap: '37100', citta: 'Verona', contea: null, stato: null, idRegione: null, contra: null }],
    );
  });
});
```

- [ ] **Step 2: Add a test verifying edit sessions use the session's customerProfile for the upsert**

Add this new test inside `describe('POST /api/customers/interactive/:sessionId/save', ...)`, after the existing test:

```typescript
test('uses session customerProfile (not completeCustomerCreation result) for upsertAddressesForCustomer', async () => {
  const editProfile = '55.192';
  sessionManager.setCustomerProfile(sessionId, editProfile);
  const mockBot = createMockBot();
  // mock returns a DIFFERENT profile than the session profile
  mockBot.completeCustomerCreation.mockResolvedValue('PROFILE-DIFFERENT');
  sessionManager.setBot(sessionId, mockBot);
  const upsertAddresses = vi.fn().mockResolvedValue(undefined);
  const customDeps: CustomerInteractiveRouterDeps = {
    ...createMockDeps(sessionManager),
    upsertAddressesForCustomer: upsertAddresses,
  };
  const customApp = createApp(customDeps);

  await request(customApp)
    .post(`/api/customers/interactive/${sessionId}/save`)
    .send({
      name: 'Test',
      addresses: [{ tipo: 'Consegna', via: 'Via Roma 1', cap: '00100', citta: 'Roma' }],
    });

  await vi.waitFor(() => {
    expect(upsertAddresses).toHaveBeenCalledWith(
      'user-1',
      editProfile,          // must be '55.192', NOT 'PROFILE-DIFFERENT'
      expect.any(Array),
    );
  });
});
```

- [ ] **Step 3: Run the new/updated tests to confirm they FAIL**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose --run \
  src/routes/customer-interactive.spec.ts
```

Expected: the two address-upsert tests fail (wrong profile argument).

- [ ] **Step 4: Apply the fix in `customer-interactive.ts`**

Find these two lines (around 449–450):
```typescript
await upsertAddressesForCustomer(userId, customerProfileId, altAddresses);
await setAddressesSyncedAt(userId, customerProfileId);
```

Replace with:
```typescript
await upsertAddressesForCustomer(userId, tempProfile, altAddresses);
await setAddressesSyncedAt(userId, tempProfile);
```

- [ ] **Step 5: Run tests to confirm they PASS**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose --run \
  src/routes/customer-interactive.spec.ts
```

Expected: all tests in the file pass.

- [ ] **Step 6: Run full backend test suite to confirm no regressions**

```bash
npm test --prefix archibald-web-app/backend -- --run
```

Expected: all tests pass.

- [ ] **Step 7: Build to confirm TypeScript compiles**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/routes/customer-interactive.ts \
        archibald-web-app/backend/src/routes/customer-interactive.spec.ts
git commit -m "fix(customers): use tempProfile for address upsert in interactive save

getCustomerProfileId() returns 'UNKNOWN' after saveAndCloseCustomer()
closes the ERP form. Using tempProfile (= session.customerProfile for
edits, TEMP-xxx for creates) ensures the FK constraint is satisfied."
```

---

## Task 2 — Eliminate 404 console errors: `skipSafetyPoll` option

**Context:** The interactive save endpoint generates a random UUID `taskId` and broadcasts it via WebSocket — it is NOT a BullMQ job. `waitForJobViaWebSocket` starts a `safetyPollTimer` (every 15 s) calling `getJobStatus(taskId)` → 404 (not in BullMQ). Chrome logs these 404s in the console. `CustomerCreateModal` already has its own fallback poll (`getCustomerBotStatus` every 5 s) so the safety poll is redundant for this path.

**Files:**
- Modify: `archibald-web-app/frontend/src/api/operations.ts`
- Modify: `archibald-web-app/frontend/src/api/operations.spec.ts`
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx:387`

- [ ] **Step 1: Write a failing test verifying safety poll is skipped when `skipSafetyPoll: true`**

Add to `operations.spec.ts` in the `describe('pollJobUntilDone', ...)` section (or a new describe block):

```typescript
describe('waitForJobViaWebSocket', () => {
  test('does not call getJobStatus when skipSafetyPoll is true', async () => {
    vi.useFakeTimers();

    const subscribe = vi.fn().mockReturnValue(() => {});
    const promise = waitForJobViaWebSocket('fake-uuid', {
      subscribe,
      skipSafetyPoll: true,
      maxWaitMs: 60_000,
    });

    // Advance 60+ seconds — if safety poll were active it would fire
    await vi.advanceTimersByTimeAsync(60_000);

    // mockFetch should never have been called for status
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/status'),
      expect.anything(),
    );

    vi.useRealTimers();
    // Clean up the hanging promise
    promise.catch(() => {});
  });
});
```

Also add `waitForJobViaWebSocket` to the import line:
```typescript
import { enqueueOperation, getJobStatus, getOperationsDashboard, pollJobUntilDone, waitForJobViaWebSocket } from './operations';
```

- [ ] **Step 2: Run the test to confirm it FAILS**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose --run \
  src/api/operations.spec.ts
```

Expected: the new test fails (safety poll fires even with the flag).

- [ ] **Step 3: Add `skipSafetyPoll` to `WaitForJobOptions` in `operations.ts`**

Find `type WaitForJobOptions`:
```typescript
type WaitForJobOptions = PollOptions & {
  subscribe?: SubscribeFn;
  wsFallbackMs?: number;
};
```

Change to:
```typescript
type WaitForJobOptions = PollOptions & {
  subscribe?: SubscribeFn;
  wsFallbackMs?: number;
  skipSafetyPoll?: boolean;
};
```

- [ ] **Step 4: Guard the safety poll timer with the flag**

Inside `waitForJobViaWebSocket`, find the line:
```typescript
safetyPollTimer = setInterval(async () => {
```

It is inside a `return new Promise(...)` block. The options are destructured at the top of that function — add `skipSafetyPoll` there:
```typescript
const { subscribe, wsFallbackMs = 5000, intervalMs, maxWaitMs, onProgress, skipSafetyPoll } = options;
```

Then wrap the entire `safetyPollTimer = setInterval(...)` block:
```typescript
if (!skipSafetyPoll) {
  safetyPollTimer = setInterval(async () => {
    // ... existing code unchanged
  }, 15_000);
}
```

- [ ] **Step 5: Run the test to confirm it PASSES**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose --run \
  src/api/operations.spec.ts
```

Expected: all tests pass.

- [ ] **Step 6: Pass `skipSafetyPoll: true` in `CustomerCreateModal.tsx`**

Find the `waitForJobViaWebSocket` call inside the `useEffect` (around line 387):
```typescript
waitForJobViaWebSocket(taskId, {
  subscribe,
  maxWaitMs: 180_000,
  onProgress: (progress, label) => { ... },
})
```

Add the option:
```typescript
waitForJobViaWebSocket(taskId, {
  subscribe,
  maxWaitMs: 180_000,
  skipSafetyPoll: true,
  onProgress: (progress, label) => { ... },
})
```

- [ ] **Step 7: Run full frontend type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: no errors.

- [ ] **Step 8: Run full frontend test suite**

```bash
npm test --prefix archibald-web-app/frontend -- --run
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/frontend/src/api/operations.ts \
        archibald-web-app/frontend/src/api/operations.spec.ts \
        archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "fix(frontend): skip BullMQ safety poll for interactive customer saves

Interactive saves use a WebSocket-only taskId (not in BullMQ queue).
The 15s safety poll fired getJobStatus → 404 every 15s during the
~60s edit operation, producing 4 console errors. CustomerCreateModal
already has its own getCustomerBotStatus fallback poll."
```

---

## Task 3 — CAP→città autocomplete in alternative address form

**Context:** The main customer form uses `resolveCapAndAdvance` + `CAP_BY_CODE` to auto-fill city after CAP entry, with a disambiguation step for multiple matches. The alternative address sub-form (inline panel inside the "addresses" step) has plain text inputs for both `cap` and `citta` with no connection. This task adds the same lookup logic inline: on CAP blur/confirm, auto-fill `citta`/`contea`/`stato` if single match, or show a small inline picker if multiple matches.

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`
  - Add `addressCapDisambig` state
  - Add `handleAddressCapResolve` function
  - Modify the `cap` input to trigger on blur
  - Replace the manual `citta` input with auto-filled display + fallback input
  - Add inline disambiguation list below CAP

### Implementation detail

**State to add** (near `addressForm` state, around line 159):
```typescript
const [addressCapDisambig, setAddressCapDisambig] = useState<CapEntry[] | null>(null);
```

**Helper function to add** (near `resolveCapAndAdvance`, around line 531):
```typescript
const resolveAddressCap = (capValue: string) => {
  if (!capValue) return;
  const entries = CAP_BY_CODE.get(capValue);
  if (!entries || entries.length === 0) return;
  if (entries.length === 1) {
    setAddressForm((f) => ({ ...f, citta: entries[0].citta, contea: entries[0].contea, stato: entries[0].stato }));
    setAddressCapDisambig(null);
  } else {
    setAddressCapDisambig(entries);
  }
};
```

**Reset disambiguation when CAP changes** — in the `cap` input's `onChange`:
```typescript
onChange={(e) => {
  setAddressForm((f) => ({ ...f, cap: e.target.value, citta: '', contea: '', stato: '' }));
  setAddressCapDisambig(null);
}}
```

**Trigger resolve on blur of CAP field:**
```typescript
onBlur={(e) => resolveAddressCap(e.target.value)}
```

**Città field logic:**
- When `addressForm.citta` is auto-filled (non-empty AND `addressCapDisambig` is null after a successful single-match lookup): show it as read-only with a small "×" to clear and re-enter manually
- When `addressCapDisambig` has entries: hide the `citta` input, show the picker instead
- When `citta` is empty AND no disambiguation: show normal editable input

**Inline disambiguation list** (replaces the città input row when `addressCapDisambig` is not null):
```tsx
{addressCapDisambig && (
  <div style={{ marginBottom: '8px' }}>
    <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
      Città *
    </label>
    <div style={{ border: '1px solid #ccc', borderRadius: '6px', overflow: 'hidden' }}>
      {addressCapDisambig.map((entry, i) => (
        <div
          key={i}
          onClick={() => {
            setAddressForm((f) => ({ ...f, citta: entry.citta, contea: entry.contea, stato: entry.stato }));
            setAddressCapDisambig(null);
          }}
          style={{
            padding: '8px 12px',
            fontSize: '14px',
            cursor: 'pointer',
            borderBottom: i < addressCapDisambig.length - 1 ? '1px solid #eee' : 'none',
            backgroundColor: '#fff',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
        >
          {entry.citta} ({entry.contea})
        </div>
      ))}
    </div>
  </div>
)}
```

**Reset `addressCapDisambig` when address form resets** — in the two places where `setAddressForm` is reset (on "Conferma" click and "Annulla" click, around lines 2022 and 2040):
```typescript
setAddressCapDisambig(null);
```

Also reset on modal open (around line 271):
```typescript
setAddressCapDisambig(null);
```

- [ ] **Step 1: Add `addressCapDisambig` state and `resolveAddressCap` function**

After `addressForm` state declaration (line ~159):
```typescript
const [addressCapDisambig, setAddressCapDisambig] = useState<CapEntry[] | null>(null);
```

After `resolveCapAndAdvance` function (line ~554), add `resolveAddressCap`:
```typescript
const resolveAddressCap = (capValue: string) => {
  if (!capValue) return;
  const entries = CAP_BY_CODE.get(capValue);
  if (!entries || entries.length === 0) return;
  if (entries.length === 1) {
    setAddressForm((f) => ({ ...f, citta: entries[0].citta, contea: entries[0].contea, stato: entries[0].stato }));
    setAddressCapDisambig(null);
  } else {
    setAddressCapDisambig(entries);
  }
};
```

- [ ] **Step 2: Reset `addressCapDisambig` in the three reset locations**

1. In the `useEffect` that runs on `isOpen` (line ~265), add after `setAddressForm(...)`:
   ```typescript
   setAddressCapDisambig(null);
   ```

2. "Conferma" onClick (line ~2018), add after `setAddressForm({ tipo: 'Consegna', ... })`:
   ```typescript
   setAddressCapDisambig(null);
   ```

3. "Annulla" onClick (line ~2039), add after `setAddressForm({ tipo: 'Consegna', ... })`:
   ```typescript
   setAddressCapDisambig(null);
   ```

- [ ] **Step 3: Update the `cap` input inside `{(["via", "cap", "citta", "nome"] as const).map(...)}` (line ~1994)**

The current rendering loop:
```typescript
{(["via", "cap", "citta", "nome"] as const).map((field) => (
  <div key={field} style={{ marginBottom: "8px" }}>
    <label>...</label>
    <input type="text" value={...} onChange={...} ... />
  </div>
))}
```

Replace this entire `map` with explicit field rendering to allow custom behavior per field. The loop currently handles `via`, `cap`, `citta`, `nome`. Extract it so `cap` gets `onBlur` + reset logic, `citta` is conditionally hidden when disambiguation is active, and the disambiguation list appears between `cap` and `citta`:

```tsx
{/* Via */}
<div style={{ marginBottom: '8px' }}>
  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
    Via e civico
  </label>
  <input
    type="text"
    value={addressForm.via ?? ''}
    onChange={(e) => setAddressForm((f) => ({ ...f, via: e.target.value }))}
    style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
  />
</div>

{/* CAP */}
<div style={{ marginBottom: '8px' }}>
  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
    CAP
  </label>
  <input
    type="text"
    value={addressForm.cap ?? ''}
    onChange={(e) => {
      setAddressForm((f) => ({ ...f, cap: e.target.value, citta: '', contea: '', stato: '' }));
      setAddressCapDisambig(null);
    }}
    onBlur={(e) => resolveAddressCap(e.target.value)}
    style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
  />
</div>

{/* Disambiguation list */}
{addressCapDisambig && (
  <div style={{ marginBottom: '8px' }}>
    <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
      Città *
    </label>
    <div style={{ border: '1px solid #ccc', borderRadius: '6px', overflow: 'hidden' }}>
      {addressCapDisambig.map((entry, i) => (
        <div
          key={i}
          onClick={() => {
            setAddressForm((f) => ({ ...f, citta: entry.citta, contea: entry.contea, stato: entry.stato }));
            setAddressCapDisambig(null);
          }}
          style={{
            padding: '8px 12px',
            fontSize: '14px',
            cursor: 'pointer',
            borderBottom: i < addressCapDisambig.length - 1 ? '1px solid #eee' : 'none',
            backgroundColor: '#fff',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
        >
          {entry.citta} ({entry.contea})
        </div>
      ))}
    </div>
  </div>
)}

{/* Città — hidden while disambiguation is shown, shown otherwise */}
{!addressCapDisambig && (
  <div style={{ marginBottom: '8px' }}>
    <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
      Città
    </label>
    <input
      type="text"
      value={addressForm.citta ?? ''}
      onChange={(e) => setAddressForm((f) => ({ ...f, citta: e.target.value }))}
      style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
    />
  </div>
)}

{/* Nome */}
<div style={{ marginBottom: '8px' }}>
  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
    Nome (opzionale)
  </label>
  <input
    type="text"
    value={addressForm.nome ?? ''}
    onChange={(e) => setAddressForm((f) => ({ ...f, nome: e.target.value }))}
    style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
  />
</div>
```

- [ ] **Step 4: Run type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: no errors.

- [ ] **Step 5: Run frontend tests**

```bash
npm test --prefix archibald-web-app/frontend -- --run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "feat(frontend): CAP→città autocomplete for alternative address form

When user enters a CAP in the alt-address sub-form and tabs away,
the same CAP_BY_CODE lookup used in the main customer form fires:
single match auto-fills città/contea/stato; multiple matches show
an inline picker. Manual città entry remains available when CAP
has no match or user changes the CAP."
```
