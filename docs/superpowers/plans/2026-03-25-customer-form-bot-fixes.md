# Customer Form & Bot Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminare il raddoppio/troncamento dei campi bot, correggere la gestione NAMEALIAS e rendere visibili i campi mobile/url nel form cliente.

**Architecture:** Fix chirurgici su tre funzioni bot (`typeDevExpressField`, `ensureNameFieldBeforeSave`, `updateCustomerName` — quest'ultima non richiede modifiche al flow) e aggiunta di due voci nell'array `FIELDS_BEFORE_ADDRESS_QUESTION` del frontend. Il fix al bot si propaga a tutti i percorsi (creazione + modifica).

**Tech Stack:** TypeScript, Puppeteer (CDP), Vitest, React 19, @testing-library/react

**Spec:** `docs/superpowers/specs/2026-03-25-customer-form-bot-fixes-design.md`

---

## File coinvolti

| File | Modifica |
|------|---------|
| `archibald-web-app/backend/src/bot/archibald-bot.ts` | Rimozione `dispatchEvent` + aggiunta `maxLength` in `typeDevExpressField`; rimozione `dispatchEvent` in `ensureNameFieldBeforeSave` |
| `archibald-web-app/backend/src/bot/archibald-bot-customer.spec.ts` | Nuovi test per `typeDevExpressField` |
| `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx` | Aggiunta `mobile` e `url` in `FIELDS_BEFORE_ADDRESS_QUESTION` |
| `archibald-web-app/frontend/src/components/CustomerCreateModal.spec.tsx` | Nuovo file di test |

---

## Task 1: Test per `typeDevExpressField`

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot-customer.spec.ts`

- [ ] **Step 1.1: Aggiungi il describe block con i test fallenti**

In fondo al file `archibald-bot-customer.spec.ts`, dopo l'ultimo `describe`, aggiungi:

```typescript
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
    // Seconda evaluate: verifica valore → valore troncato corretto (nessun retry)
    page.evaluate
      .mockResolvedValueOnce({ id: 'field-id', maxLength: 5 })
      .mockResolvedValueOnce('hello');

    const bot = makeBot(page as any);
    await (bot as any).typeDevExpressField(/field/, 'hello world');

    expect(page.type).toHaveBeenCalledOnce();
    expect(page.type).toHaveBeenCalledWith('#field-id', 'hello', { delay: 5 });
  });

  it('usa il valore intero quando maxLength è 0', async () => {
    const page = makePageWithType();
    page.evaluate
      .mockResolvedValueOnce({ id: 'field-id', maxLength: 0 })
      .mockResolvedValueOnce('hello world');

    const bot = makeBot(page as any);
    await (bot as any).typeDevExpressField(/field/, 'hello world');

    expect(page.type).toHaveBeenCalledOnce();
    expect(page.type).toHaveBeenCalledWith('#field-id', 'hello world', { delay: 5 });
  });

  it('il retry usa effectiveValue (troncato), non il valore grezzo', async () => {
    const page = makePageWithType();
    page.evaluate
      .mockResolvedValueOnce({ id: 'field-id', maxLength: 5 })  // find+clear
      .mockResolvedValueOnce('wrong')                             // prima verifica → mismatch
      .mockResolvedValueOnce(undefined)                          // retry clear
      .mockResolvedValueOnce('hello');                           // retry verifica → ok

    const bot = makeBot(page as any);
    await (bot as any).typeDevExpressField(/field/, 'hello world');

    expect(page.type).toHaveBeenCalledTimes(2);
    expect(page.type).toHaveBeenNthCalledWith(1, '#field-id', 'hello', { delay: 5 });
    expect(page.type).toHaveBeenNthCalledWith(2, '#field-id', 'hello', { delay: 5 });
  });
});
```

- [ ] **Step 1.2: Esegui i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose typeDevExpressField 2>&1 | tail -30
```

Atteso: 3 test FAIL (la funzione ora ritorna `inputId` stringa, non `{ id, maxLength }`, e usa `value` grezzo, non `effectiveValue`).

---

## Task 2: Fix `typeDevExpressField`

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts:9986-10083`

- [ ] **Step 2.1: Sostituisci l'intera funzione `typeDevExpressField`**

Sostituisci le righe 9986–10083 con:

```typescript
  private async typeDevExpressField(
    fieldRegex: RegExp,
    value: string,
  ): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    // Step 1: Find the field, scroll into view, focus it, and clear it.
    // We do NOT dispatch "input" here — doing so triggers a DevExpress XHR that
    // restores the original value before page.type() runs, causing doubling.
    // page.type() fires authentic keydown/keypress/keyup/input events per character,
    // which is sufficient for DevExpress to commit the value on Tab.
    const { id: inputId, maxLength } = await this.page.evaluate(
      (regex: string) => {
        const inputs = Array.from(document.querySelectorAll("input"));
        const input = inputs.find((i) =>
          new RegExp(regex).test(i.id),
        ) as HTMLInputElement | null;
        if (!input) return { id: null, maxLength: 0 };

        input.scrollIntoView({ block: "center" });
        input.focus();
        input.click();
        input.select();

        // Clear via native setter — no dispatchEvent to avoid triggering DevExpress XHR
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (setter) setter.call(input, "");
        else input.value = "";

        return { id: input.id, maxLength: input.maxLength ?? 0 };
      },
      fieldRegex.source,
    );

    if (!inputId) {
      throw new Error(`Input field not found: ${fieldRegex}`);
    }

    // Truncate to field's maxLength so typing and comparison use the actual storable value.
    // Pattern mirrors ensureNameFieldBeforeSave which is already proven in production.
    const effectiveValue = maxLength > 0 ? value.substring(0, maxLength) : value;

    // Wait for DevExpress to settle any in-flight XHRs (e.g. from the previous
    // field's Tab commit) before typing.
    await this.waitForDevExpressIdle({ timeout: 3000, label: `pre-type-${inputId}` });

    // Step 2: Type the value via real CDP keyboard events.
    // page.type() generates authentic keydown/keypress/keyup/input events that
    // DevExpress XAF tracks to trigger server-side model updates on Tab/blur.
    await this.page.type(`#${inputId}`, effectiveValue, { delay: 5 });

    await this.page.keyboard.press("Tab");
    await this.waitForDevExpressIdle({
      timeout: 8000,
      label: `typed-${inputId}`,
    });

    const actual = await this.page.evaluate((id: string) => {
      const input = document.getElementById(id) as HTMLInputElement | null;
      return input?.value ?? "";
    }, inputId);

    if (actual !== effectiveValue) {
      logger.warn("typeDevExpressField value mismatch, retrying", {
        id: inputId,
        expected: effectiveValue,
        actual,
      });

      await this.page.evaluate((id: string) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (!input) return;
        input.scrollIntoView({ block: "center" });
        input.focus();
        input.click();
        input.select();
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (setter) setter.call(input, "");
        else input.value = "";
        // No dispatchEvent — same reasoning as main path
      }, inputId);

      await this.waitForDevExpressIdle({ timeout: 3000, label: `pre-type-retry-${inputId}` });
      await this.page.type(`#${inputId}`, effectiveValue, { delay: 5 });

      await this.page.keyboard.press("Tab");
      await this.waitForDevExpressIdle({
        timeout: 8000,
        label: `typed-retry-${inputId}`,
      });
    }

    logger.debug("typeDevExpressField done", { id: inputId, value: effectiveValue });
  }
```

- [ ] **Step 2.2: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose typeDevExpressField 2>&1 | tail -30
```

Atteso: 3 test PASS.

- [ ] **Step 2.3: Esegui la suite completa backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -20
```

Atteso: tutti i test PASS, nessuna regressione.

- [ ] **Step 2.4: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

Atteso: compilazione OK senza errori.

- [ ] **Step 2.5: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts \
        archibald-web-app/backend/src/bot/archibald-bot-customer.spec.ts
git commit -m "fix(bot): remove dispatchEvent from typeDevExpressField to prevent field value doubling

Add maxLength-aware typing so field truncation does not trigger spurious retries.
Same fix applied to retry path: effectiveValue used consistently throughout."
```

---

## Task 3: Fix `ensureNameFieldBeforeSave`

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts:11080-11097`

- [ ] **Step 3.1: Scrivi test fallente**

In fondo al file `archibald-bot-customer.spec.ts`, dopo il `describe('typeDevExpressField', ...)`, aggiungi:

```typescript
describe('ensureNameFieldBeforeSave', () => {
  it('chiama page.type con il valore troncato al maxLength', async () => {
    const page = {
      ...makePageMock(),
      type: vi.fn().mockResolvedValue(undefined),
    };
    // Prima evaluate: legge currentValue + maxLength
    // Seconda evaluate: find+clear → restituisce inputId
    // Terza evaluate: legge valore verificato
    page.evaluate
      .mockResolvedValueOnce({ currentValue: 'Dr. Elio Verace Cent', maxLength: 20 })
      .mockResolvedValueOnce('name-input-id')
      .mockResolvedValueOnce('Dr. Elio Verace Cent');

    const bot = makeBot(page as any);
    await (bot as any).ensureNameFieldBeforeSave('Dr. Elio Verace Centro Medico');

    expect(page.type).toHaveBeenCalledOnce();
    expect(page.type).toHaveBeenCalledWith(
      '#name-input-id',
      'Dr. Elio Verace Cent',
      { delay: 20 },
    );
  });
});
```

- [ ] **Step 3.2: Esegui per verificare che il test passi già (maxLength è già gestito)**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose ensureNameFieldBeforeSave 2>&1 | tail -20
```

Nota: questo test verifica il comportamento maxLength già esistente. Serve a proteggere la regressione dopo la rimozione del `dispatchEvent`.

- [ ] **Step 3.3: Rimuovi `dispatchEvent` da `ensureNameFieldBeforeSave`**

In `archibald-bot.ts`, **riga 11095**, rimuovi la riga:

```typescript
      input.dispatchEvent(new Event("input", { bubbles: true }));
```

Il blocco alle righe 11080–11097 deve diventare:

```typescript
    const inputId = await this.page.evaluate(() => {
      const input = document.querySelector(
        'input[id*="dviNAME"][id$="_I"]',
      ) as HTMLInputElement | null;
      if (!input) return null;
      input.scrollIntoView({ block: "center" });
      input.focus();
      input.click();
      input.select();
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (setter) setter.call(input, "");
      else input.value = "";
      // No dispatchEvent — avoids DevExpress XHR that restores the original value
      return input.id;
    });
```

- [ ] **Step 3.4: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -20
```

Atteso: tutti i test PASS.

- [ ] **Step 3.5: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -10
```

- [ ] **Step 3.6: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts \
        archibald-web-app/backend/src/bot/archibald-bot-customer.spec.ts
git commit -m "fix(bot): remove dispatchEvent from ensureNameFieldBeforeSave

Prevents DevExpress XHR from restoring original NAME value during pre-save retype."
```

---

## Task 4: Campi `mobile` e `url` visibili in `CustomerCreateModal`

**Files:**
- Create: `archibald-web-app/frontend/src/components/CustomerCreateModal.spec.tsx`
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx:41-69`

- [ ] **Step 4.1: Scrivi il test fallente**

Crea il file `archibald-web-app/frontend/src/components/CustomerCreateModal.spec.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock di tutti i moduli esterni usati da CustomerCreateModal
vi.mock('../services/customers.service', () => ({
  customerService: {
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    startVatSession: vi.fn(),
    submitVat: vi.fn(),
    saveCustomer: vi.fn(),
  },
}));
vi.mock('../api/operations', () => ({
  waitForJobViaWebSocket: vi.fn(),
}));
vi.mock('../contexts/WebSocketContext', () => ({
  useWebSocketContext: () => ({ socket: null, isConnected: false }),
}));
vi.mock('../services/customer-addresses', () => ({
  getCustomerAddresses: vi.fn().mockResolvedValue([]),
}));

import { CustomerCreateModal } from './CustomerCreateModal';
import type { Customer } from '../types/customer';

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    customerProfile: '55.041',
    name: 'Dr. Elio Verace Centro Medico',
    vatNumber: '02633070657',
    pec: 'elioverace@pec.it',
    sdi: '',
    street: 'Corso Giuseppe Garibaldi, 7',
    postalCode: '84095',
    phone: '+39089865921',
    mobile: '+39 333 111 2222',
    email: 'info@verace.it',
    url: 'https://verace.it',
    deliveryTerms: 'FedEx',
    ...overrides,
  } as Customer;
}

describe('CustomerCreateModal — campi mobile e url', () => {
  it('mostra il campo mobile (pre-popolato) quando si modifica un cliente esistente', async () => {
    const user = userEvent.setup();
    render(
      <CustomerCreateModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        editCustomer={makeCustomer()}
      />,
    );

    // La modale inizia dallo step vat-edit-check o field[0].
    // Avanza fino a trovare il campo mobile usando il bottone Avanti.
    // Il campo mobile è dopo "phone" nell'array FIELDS_BEFORE_ADDRESS_QUESTION.
    let mobileInput: HTMLInputElement | null = null;
    for (let i = 0; i < 15 && !mobileInput; i++) {
      mobileInput = screen.queryByDisplayValue('+39 333 111 2222') as HTMLInputElement | null;
      if (!mobileInput) {
        const next = screen.queryByRole('button', { name: /avanti|next|continua/i });
        if (next) await user.click(next);
      }
    }

    expect(mobileInput).toBeInTheDocument();
  });

  it('mostra il campo url (pre-popolato) quando si modifica un cliente esistente', async () => {
    const user = userEvent.setup();
    render(
      <CustomerCreateModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        editCustomer={makeCustomer()}
      />,
    );

    let urlInput: HTMLInputElement | null = null;
    for (let i = 0; i < 15 && !urlInput; i++) {
      urlInput = screen.queryByDisplayValue('https://verace.it') as HTMLInputElement | null;
      if (!urlInput) {
        const next = screen.queryByRole('button', { name: /avanti|next|continua/i });
        if (next) await user.click(next);
      }
    }

    expect(urlInput).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.2: Esegui per verificare che i test falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerCreateModal 2>&1 | tail -30
```

Atteso: 2 test FAIL — i campi mobile e url non sono presenti nel DOM.

- [ ] **Step 4.3: Aggiungi `mobile` e `url` a `FIELDS_BEFORE_ADDRESS_QUESTION`**

In `CustomerCreateModal.tsx`, riga 67–69, dopo la riga con `phone` e prima della riga con `email`:

Sostituisci:
```typescript
  { key: "phone", label: "Telefono", defaultValue: "+39", type: "tel" },
  { key: "email", label: "Email", defaultValue: "", type: "email" },
```

Con:
```typescript
  { key: "phone", label: "Telefono", defaultValue: "+39", type: "tel" },
  { key: "mobile", label: "Cellulare", defaultValue: "+39", type: "tel" },
  { key: "email", label: "Email", defaultValue: "", type: "email" },
  { key: "url", label: "Sito web / URL", defaultValue: "", type: "url" },
```

- [ ] **Step 4.4: Esegui i test frontend**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerCreateModal 2>&1 | tail -30
```

Atteso: 2 test PASS.

- [ ] **Step 4.5: Esegui la suite completa frontend**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -20
```

Atteso: tutti i test PASS, nessuna regressione.

- [ ] **Step 4.6: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

Atteso: nessun errore TypeScript.

- [ ] **Step 4.7: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx \
        archibald-web-app/frontend/src/components/CustomerCreateModal.spec.tsx
git commit -m "feat(customer-form): add mobile and url as visible form fields

Prevents silent submission of stale DB values that the user cannot see or correct."
```

---

## Verifica finale

- [ ] **Step 5.1: Esegui tutti i test (backend + frontend)**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -5 && \
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

Atteso: entrambe le suite PASS.

- [ ] **Step 5.2: Type-check completo**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5 && \
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

Atteso: nessun errore di compilazione.
