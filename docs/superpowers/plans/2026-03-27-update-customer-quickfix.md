# Update Customer — Piano B: Quick Fix Component

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire il componente `CustomerQuickFix` — un form chirurgico responsive (Bottom Sheet su mobile/tablet, Spotlight Modal su desktop) che mostra solo i campi obbligatori mancanti di una scheda cliente e permette di completarli senza uscire dal flusso ordine.

**Architecture:** `CustomerQuickFix` è un componente puro React che accetta `missingFields[]` (chiavi machine-readable), costruisce il form dinamicamente, chiama `enqueueOperation('update-customer')` e aspetta il job via `pollJobUntilDone`. Viene integrato in `PendingOrdersPage` dove sostituisce il silenzioso filtraggio degli ordini incompleti con un banner visibile e un percorso di fix esplicito. La funzione `checkCustomerCompleteness` viene estesa con le chiavi machine-readable necessarie.

**Tech Stack:** React 19, TypeScript strict, Vitest + Testing Library, inline styles (NO classi CSS), `useKeyboardScroll` per mobile keyboard, `enqueueOperation` + `pollJobUntilDone` per async bot. Test: `npm test --prefix archibald-web-app/frontend`.

---

## Mappa file

| File | Azione | Responsabilità |
|---|---|---|
| `frontend/src/utils/customer-completeness.ts` | Modifica | Aggiungere `missingFields: MissingFieldKey[]` a `CompletenessResult`, aggiungere check su `name` e `city` |
| `frontend/src/utils/customer-completeness.spec.ts` | Crea | Unit test per `checkCustomerCompleteness` aggiornata |
| `frontend/src/api/operations.ts` | Modifica | Aggiungere `'read-vat-status'` a `OperationType` |
| `frontend/src/components/CustomerQuickFix.tsx` | Crea | Componente Bottom Sheet (< 1024px) + Spotlight Modal (≥ 1024px) |
| `frontend/src/components/CustomerQuickFix.spec.tsx` | Crea | Unit test del componente |
| `frontend/src/pages/PendingOrdersPage.tsx` | Modifica | Banner "N ordini bloccati" + integrazione CustomerQuickFix |

---

## Task 1: Estendere `customer-completeness.ts` con chiavi machine-readable

**Files:**
- Modify: `archibald-web-app/frontend/src/utils/customer-completeness.ts`
- Create: `archibald-web-app/frontend/src/utils/customer-completeness.spec.ts`

- [ ] **Step 1.1: Leggere il file attuale**

```bash
cat /Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend/src/utils/customer-completeness.ts
```

- [ ] **Step 1.2: Scrivere i test (TDD)**

Creare `archibald-web-app/frontend/src/utils/customer-completeness.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { checkCustomerCompleteness } from './customer-completeness';
import type { Customer } from '../types/customer';

const base: Customer = {
  customerProfile: '55.261',
  internalId: null,
  name: 'Mario Rossi S.r.l.',
  vatNumber: 'IT08246131216',
  vatValidatedAt: '2026-01-01T00:00:00Z',
  pec: 'mario@pec.it',
  sdi: null,
  street: 'Via Roma 12',
  postalCode: '80100',
  city: 'Napoli',
  fiscalCode: null, mobile: null, phone: null, email: null, url: null,
  attentionTo: null, logisticsAddress: null, customerType: null, type: null,
  deliveryTerms: null, description: null, lastOrderDate: null,
  actualOrderCount: 0, actualSales: 0, previousOrderCount1: 0, previousSales1: 0,
  previousOrderCount2: 0, previousSales2: 0,
  externalAccountNumber: null, ourAccountNumber: null,
  hash: '', lastSync: 0, createdAt: 0, updatedAt: 0,
  botStatus: 'placed', photoUrl: null,
  sector: null, priceGroup: null, lineDiscount: null,
  paymentTerms: null, notes: null, nameAlias: null,
  county: null, state: null, country: null,
};

describe('checkCustomerCompleteness', () => {
  test('returns ok=true when all mandatory fields are present', () => {
    const result = checkCustomerCompleteness(base);
    expect(result.ok).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  test('returns ok=true when sdi provided instead of pec', () => {
    const result = checkCustomerCompleteness({ ...base, pec: null, sdi: 'AAABBB1' });
    expect(result.ok).toBe(true);
  });

  test('returns missingFields with vatNumber when vatNumber is null', () => {
    const result = checkCustomerCompleteness({ ...base, vatNumber: null });
    expect(result.ok).toBe(false);
    expect(result.missingFields).toContain('vatNumber');
  });

  test('returns missingFields with vatValidatedAt when vatNumber present but not validated', () => {
    const result = checkCustomerCompleteness({ ...base, vatValidatedAt: null });
    expect(result.ok).toBe(false);
    expect(result.missingFields).toContain('vatValidatedAt');
    expect(result.missingFields).not.toContain('vatNumber');
  });

  test('returns missingFields with pec_or_sdi when both pec and sdi are null', () => {
    const result = checkCustomerCompleteness({ ...base, pec: null, sdi: null });
    expect(result.ok).toBe(false);
    expect(result.missingFields).toContain('pec_or_sdi');
  });

  test('returns missingFields with street when street is null', () => {
    const result = checkCustomerCompleteness({ ...base, street: null });
    expect(result.missingFields).toContain('street');
  });

  test('returns missingFields with postalCode when postalCode is null', () => {
    const result = checkCustomerCompleteness({ ...base, postalCode: null });
    expect(result.missingFields).toContain('postalCode');
  });

  test('returns missingFields with city when city is null', () => {
    const result = checkCustomerCompleteness({ ...base, city: null });
    expect(result.missingFields).toContain('city');
  });

  test('returns human-readable missing strings for backward compatibility', () => {
    const result = checkCustomerCompleteness({ ...base, pec: null, sdi: null });
    expect(result.missing.some((s) => s.toLowerCase().includes('pec'))).toBe(true);
  });

  test('accumulates multiple missing fields', () => {
    const result = checkCustomerCompleteness({ ...base, pec: null, sdi: null, street: null });
    expect(result.missingFields).toContain('pec_or_sdi');
    expect(result.missingFields).toContain('street');
    expect(result.missingFields).toHaveLength(2);
  });
});
```

- [ ] **Step 1.3: Eseguire i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/utils/customer-completeness.spec.ts 2>&1 | tail -20
```

Atteso: FAIL — `missingFields` non esiste su `CompletenessResult`.

- [ ] **Step 1.4: Riscrivere `customer-completeness.ts`**

Sostituire il contenuto con:

```typescript
import type { Customer } from '../types/customer';

type MissingFieldKey =
  | 'name'
  | 'vatNumber'
  | 'vatValidatedAt'
  | 'pec_or_sdi'
  | 'street'
  | 'postalCode'
  | 'city';

type CompletenessResult = {
  ok: boolean;
  missing: string[];              // human-readable (backward compat)
  missingFields: MissingFieldKey[]; // machine-readable for QuickFix
};

function checkCustomerCompleteness(customer: Customer): CompletenessResult {
  const missing: string[] = [];
  const missingFields: MissingFieldKey[] = [];

  if (!customer.name) {
    missing.push('Ragione sociale mancante');
    missingFields.push('name');
  }

  if (!customer.vatNumber) {
    missing.push('P.IVA mancante');
    missingFields.push('vatNumber');
  } else if (!customer.vatValidatedAt) {
    missing.push('P.IVA non validata');
    missingFields.push('vatValidatedAt');
  }

  if (!customer.pec && !customer.sdi) {
    missing.push('PEC o SDI mancante');
    missingFields.push('pec_or_sdi');
  }

  if (!customer.street) {
    missing.push('Indirizzo mancante');
    missingFields.push('street');
  }

  if (!customer.postalCode) {
    missing.push('CAP mancante');
    missingFields.push('postalCode');
  }

  if (!customer.city) {
    missing.push('Città mancante');
    missingFields.push('city');
  }

  return { ok: missingFields.length === 0, missing, missingFields };
}

export { checkCustomerCompleteness, type CompletenessResult, type MissingFieldKey };
```

- [ ] **Step 1.5: Eseguire i test per verificare che passino**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/utils/customer-completeness.spec.ts 2>&1 | tail -20
```

Atteso: 10 test PASS.

- [ ] **Step 1.6: Verificare che la suite completa passi (nessuna regressione)**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -10
```

- [ ] **Step 1.7: Commit**

```bash
git add archibald-web-app/frontend/src/utils/customer-completeness.ts \
        archibald-web-app/frontend/src/utils/customer-completeness.spec.ts
git commit -m "feat(completeness): add missingFields keys, add name/city checks"
```

---

## Task 2: Aggiungere `'read-vat-status'` a `OperationType`

**Files:**
- Modify: `archibald-web-app/frontend/src/api/operations.ts`

- [ ] **Step 2.1: Aggiungere il tipo all'union**

In `archibald-web-app/frontend/src/api/operations.ts`, aggiungere `'read-vat-status'` all'union type `OperationType` (riga 17 circa, dopo `'sync-customer-addresses'`):

```typescript
type OperationType =
  | 'submit-order'
  | 'create-customer'
  | 'update-customer'
  | 'send-to-verona'
  | 'edit-order'
  | 'delete-order'
  | 'download-ddt-pdf'
  | 'download-invoice-pdf'
  | 'sync-order-articles'
  | 'sync-customers'
  | 'sync-orders'
  | 'sync-ddt'
  | 'sync-invoices'
  | 'sync-products'
  | 'sync-prices'
  | 'sync-customer-addresses'
  | 'read-vat-status';
```

- [ ] **Step 2.2: Build TypeScript**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

Atteso: nessun errore.

- [ ] **Step 2.3: Commit**

```bash
git add archibald-web-app/frontend/src/api/operations.ts
git commit -m "feat(operations): add read-vat-status to OperationType"
```

---

## Task 3: `CustomerQuickFix.tsx` — componente core

**Files:**
- Create: `archibald-web-app/frontend/src/components/CustomerQuickFix.tsx`
- Create: `archibald-web-app/frontend/src/components/CustomerQuickFix.spec.tsx`

- [ ] **Step 3.1: Creare i test (TDD)**

Creare `archibald-web-app/frontend/src/components/CustomerQuickFix.spec.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { CustomerQuickFix } from './CustomerQuickFix';

vi.mock('../api/operations', () => ({
  enqueueOperation: vi.fn(),
  pollJobUntilDone: vi.fn(),
}));

vi.mock('../services/toast.service', () => ({
  toastService: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../hooks/useKeyboardScroll', () => ({
  useKeyboardScroll: () => ({
    keyboardHeight: 0,
    keyboardOpen: false,
    scrollFieldIntoView: vi.fn(),
    keyboardPaddingStyle: {},
    modalOverlayKeyboardStyle: {},
  }),
}));

import { enqueueOperation, pollJobUntilDone } from '../api/operations';

const defaultProps = {
  customerProfile: '55.261',
  customerName: 'Mario Rossi S.r.l.',
  missingFields: ['pec_or_sdi'] as const,
  onSaved: vi.fn(),
  onDismiss: vi.fn(),
};

describe('CustomerQuickFix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders bottom sheet when viewport width is below 1024', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    render(<CustomerQuickFix {...defaultProps} />);
    expect(screen.getByTestId('quickfix-sheet')).toBeDefined();
    expect(screen.queryByTestId('quickfix-modal')).toBeNull();
  });

  test('renders spotlight modal when viewport width is 1024 or above', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    render(<CustomerQuickFix {...defaultProps} />);
    expect(screen.getByTestId('quickfix-modal')).toBeDefined();
    expect(screen.queryByTestId('quickfix-sheet')).toBeNull();
  });

  test('shows PEC and SDI fields when pec_or_sdi is missing', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    render(<CustomerQuickFix {...defaultProps} missingFields={['pec_or_sdi']} />);
    expect(screen.getByPlaceholderText('PEC')).toBeDefined();
    expect(screen.getByPlaceholderText('SDI')).toBeDefined();
  });

  test('shows vatNumber field when vatValidatedAt is missing', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    render(<CustomerQuickFix {...defaultProps} missingFields={['vatValidatedAt']} />);
    expect(screen.getByPlaceholderText('P.IVA')).toBeDefined();
  });

  test('shows validation error when submitting with both pec and sdi empty', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    render(<CustomerQuickFix {...defaultProps} missingFields={['pec_or_sdi']} />);
    fireEvent.click(screen.getByText(/Salva e continua/i));
    await waitFor(() => {
      expect(screen.getByText(/Inserisci PEC o SDI/i)).toBeDefined();
    });
    expect(enqueueOperation).not.toHaveBeenCalled();
  });

  test('calls enqueueOperation with correct data when pec is filled', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'job-123', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<CustomerQuickFix {...defaultProps} missingFields={['pec_or_sdi']} />);
    fireEvent.change(screen.getByPlaceholderText('PEC'), { target: { value: 'mario@pec.it' } });
    fireEvent.click(screen.getByText(/Salva e continua/i));

    await waitFor(() => {
      expect(enqueueOperation).toHaveBeenCalledWith(
        'update-customer',
        expect.objectContaining({ customerProfile: '55.261', pec: 'mario@pec.it' }),
      );
    });
  });

  test('calls onSaved after successful job completion', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    const onSaved = vi.fn();
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'job-123', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<CustomerQuickFix {...defaultProps} missingFields={['pec_or_sdi']} onSaved={onSaved} />);
    fireEvent.change(screen.getByPlaceholderText('PEC'), { target: { value: 'mario@pec.it' } });
    fireEvent.click(screen.getByText(/Salva e continua/i));

    await waitFor(() => { expect(onSaved).toHaveBeenCalled(); });
  });

  test('shows error message and re-enables form when job fails', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'job-123', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Bot unreachable'));

    render(<CustomerQuickFix {...defaultProps} missingFields={['pec_or_sdi']} />);
    fireEvent.change(screen.getByPlaceholderText('PEC'), { target: { value: 'mario@pec.it' } });
    fireEvent.click(screen.getByText(/Salva e continua/i));

    await waitFor(() => {
      expect(screen.getByText('Bot unreachable')).toBeDefined();
    });
    expect(screen.getByText(/Salva e continua/i)).not.toBeDisabled();
  });

  test('calls onDismiss when Annulla is clicked', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    const onDismiss = vi.fn();
    render(<CustomerQuickFix {...defaultProps} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('Annulla'));
    expect(onDismiss).toHaveBeenCalled();
  });

  test('sends postalCodeCity (not city) when city field is filled', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'job-123', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<CustomerQuickFix {...defaultProps} missingFields={['city']} />);
    fireEvent.change(screen.getByPlaceholderText('Città'), { target: { value: 'Napoli' } });
    fireEvent.click(screen.getByText(/Salva e continua/i));

    await waitFor(() => {
      expect(enqueueOperation).toHaveBeenCalledWith(
        'update-customer',
        expect.objectContaining({ postalCodeCity: 'Napoli' }),
      );
    });
  });
});
```

- [ ] **Step 3.2: Eseguire i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/components/CustomerQuickFix.spec.tsx 2>&1 | tail -20
```

Atteso: FAIL — `CustomerQuickFix` non esiste ancora.

- [ ] **Step 3.3: Creare `CustomerQuickFix.tsx`**

Creare `archibald-web-app/frontend/src/components/CustomerQuickFix.tsx`:

```typescript
import { useState, useRef } from 'react';
import { useKeyboardScroll } from '../hooks/useKeyboardScroll';
import { enqueueOperation, pollJobUntilDone } from '../api/operations';
import { toastService } from '../services/toast.service';
import type { MissingFieldKey } from '../utils/customer-completeness';

interface CustomerQuickFixProps {
  customerProfile: string;
  customerName: string;
  missingFields: readonly MissingFieldKey[];
  onSaved: () => void;
  onDismiss: () => void;
}

type FieldKey = 'name' | 'vatNumber' | 'pec' | 'sdi' | 'street' | 'postalCode' | 'city';

type FieldValues = Record<FieldKey, string>;

const FIELD_LABELS: Record<string, string> = {
  name:        'Ragione Sociale',
  vatNumber:   'P.IVA',
  pec:         'PEC',
  sdi:         'SDI',
  street:      'Indirizzo',
  postalCode:  'CAP',
  city:        'Città',
};

function buildInputKeys(missingFields: readonly MissingFieldKey[]): FieldKey[] {
  const keys: FieldKey[] = [];
  for (const f of missingFields) {
    if (f === 'pec_or_sdi') {
      if (!keys.includes('pec')) keys.push('pec');
      if (!keys.includes('sdi')) keys.push('sdi');
    } else if (f === 'vatValidatedAt') {
      if (!keys.includes('vatNumber')) keys.push('vatNumber');
    } else {
      const k = f as FieldKey;
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

export function CustomerQuickFix({
  customerProfile,
  customerName,
  missingFields,
  onSaved,
  onDismiss,
}: CustomerQuickFixProps) {
  const isDesktop = window.innerWidth >= 1024;
  const { modalOverlayKeyboardStyle, keyboardPaddingStyle, scrollFieldIntoView } =
    useKeyboardScroll();

  const inputKeys = buildInputKeys(missingFields);

  const [values, setValues] = useState<FieldValues>({
    name: customerName,
    vatNumber: '',
    pec: '',
    sdi: '',
    street: '',
    postalCode: '',
    city: '',
  });
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  const validate = (): string | null => {
    for (const key of inputKeys) {
      if (key === 'sdi') continue;
      if (key === 'pec' && inputKeys.includes('sdi')) continue;
      if (!values[key].trim()) return `${FIELD_LABELS[key]} è obbligatorio`;
    }
    if (
      missingFields.includes('pec_or_sdi') &&
      !values.pec.trim() &&
      !values.sdi.trim()
    ) {
      return 'Inserisci PEC o SDI (almeno uno dei due)';
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }

    setError(null);
    setSaving(true);
    setProgress(0);

    try {
      const data: Record<string, unknown> = {
        customerProfile,
        name: values.name || customerName,
      };
      if (inputKeys.includes('vatNumber') && values.vatNumber)
        data.vatNumber = values.vatNumber;
      if (inputKeys.includes('pec') && values.pec)
        data.pec = values.pec;
      if (inputKeys.includes('sdi') && values.sdi)
        data.sdi = values.sdi;
      if (inputKeys.includes('street') && values.street)
        data.street = values.street;
      if (inputKeys.includes('postalCode') && values.postalCode)
        data.postalCode = values.postalCode;
      if (inputKeys.includes('city') && values.city)
        data.postalCodeCity = values.city;

      const { jobId } = await enqueueOperation('update-customer', data);
      await pollJobUntilDone(jobId, {
        maxWaitMs: 120_000,
        onProgress: (p) => setProgress(p),
      });

      toastService.success('Dati cliente aggiornati');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante il salvataggio');
      setSaving(false);
    }
  };

  const renderFields = () =>
    inputKeys.map((key) => (
      <div key={key} style={{ marginBottom: '12px' }}>
        <label
          style={{
            display: 'block', fontSize: '12px', fontWeight: 600,
            color: '#374151', marginBottom: '4px',
          }}
        >
          {FIELD_LABELS[key]}
          {key === 'sdi' && missingFields.includes('pec_or_sdi') ? (
            <span style={{ color: '#6b7280', fontWeight: 400 }}> (alternativa)</span>
          ) : (
            <span style={{ color: '#ef4444' }}> *</span>
          )}
        </label>
        <input
          ref={key === inputKeys[0] ? firstRef : undefined}
          type={key === 'pec' ? 'email' : 'text'}
          value={values[key]}
          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
          disabled={saving}
          placeholder={FIELD_LABELS[key]}
          style={{
            width: '100%', padding: '9px 12px',
            border: '1.5px solid #d1d5db', borderRadius: '6px',
            fontSize: '14px', outline: 'none',
            background: saving ? '#f9fafb' : 'white',
            boxSizing: 'border-box',
          }}
        />
      </div>
    ));

  const formContent = (
    <>
      {error && (
        <div
          style={{
            background: '#fff5f5', border: '1px solid #fca5a5',
            borderRadius: '6px', padding: '9px 12px',
            marginBottom: '12px', fontSize: '13px', color: '#dc2626',
          }}
        >
          {error}
        </div>
      )}

      {renderFields()}

      {saving && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
            {progress < 100 ? `Aggiornamento Archibald... ${progress}%` : 'Completato'}
          </div>
          <div
            style={{
              height: '4px', background: '#e5e7eb',
              borderRadius: '2px', overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`, height: '100%',
                background: '#2563eb', transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={saving}
        style={{
          width: '100%', padding: '12px',
          background: saving ? '#93c5fd' : '#2563eb',
          color: 'white', border: 'none', borderRadius: '8px',
          fontSize: '14px', fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? 'Salvataggio in corso...' : "Salva e continua con l'ordine"}
      </button>

      {!saving && (
        <button
          onClick={onDismiss}
          style={{
            width: '100%', marginTop: '8px', padding: '9px',
            background: 'none', border: 'none',
            fontSize: '13px', color: '#9ca3af', cursor: 'pointer',
          }}
        >
          Annulla
        </button>
      )}
    </>
  );

  if (isDesktop) {
    return (
      <div
        data-testid="quickfix-overlay"
        onClick={(e) => { if (e.target === e.currentTarget && !saving) onDismiss(); }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9000,
          ...modalOverlayKeyboardStyle,
        }}
      >
        <div
          data-testid="quickfix-modal"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'white', borderRadius: '10px',
            overflow: 'hidden', width: '100%', maxWidth: '400px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              background: '#fff5f5', borderBottom: '1px solid #fecaca',
              padding: '14px 18px', display: 'flex',
              alignItems: 'flex-start', gap: '10px',
            }}
          >
            <span style={{ fontSize: '20px', flexShrink: 0 }}>⛔</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>
                Ordine bloccato
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                {customerName} — completa i dati per continuare
              </div>
            </div>
            {!saving && (
              <button
                onClick={onDismiss}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  fontSize: '18px', color: '#9ca3af', cursor: 'pointer', padding: '0 2px',
                }}
              >
                ✕
              </button>
            )}
          </div>
          <div style={{ padding: '16px 18px', ...keyboardPaddingStyle }}>
            {formContent}
          </div>
        </div>
      </div>
    );
  }

  // Bottom Sheet — mobile / tablet
  return (
    <div
      data-testid="quickfix-overlay"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.5)',
        zIndex: 9000,
      }}
    >
      <div
        data-testid="quickfix-sheet"
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'white',
          borderTop: '2px solid #2563eb',
          borderRadius: '16px 16px 0 0',
          padding: '16px 20px 24px',
          maxHeight: '85vh', overflowY: 'auto',
          ...keyboardPaddingStyle,
        }}
      >
        <div
          style={{
            width: '32px', height: '3px', background: '#d1d5db',
            borderRadius: '2px', margin: '0 auto 16px',
          }}
        />
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
            Completa prima di procedere
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            {customerName} —{' '}
            {missingFields.length === 1
              ? '1 campo obbligatorio mancante'
              : `${missingFields.length} campi obbligatori mancanti`}
          </div>
        </div>
        {formContent}
      </div>
    </div>
  );
}
```

- [ ] **Step 3.4: Eseguire i test**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/components/CustomerQuickFix.spec.tsx 2>&1 | tail -25
```

Atteso: tutti i test PASS.

- [ ] **Step 3.5: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

Atteso: nessun errore.

- [ ] **Step 3.6: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerQuickFix.tsx \
        archibald-web-app/frontend/src/components/CustomerQuickFix.spec.tsx
git commit -m "feat(ui): CustomerQuickFix — bottom sheet + spotlight modal responsive"
```

---

## Task 4: Integrazione in `PendingOrdersPage.tsx`

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

Il comportamento attuale filtra silenziosamente gli ordini con clienti incompleti prima del submit (`console.warn`). Il nuovo comportamento aggiunge un banner visibile in cima alla pagina che elenca i clienti incompleti con un bottone "Completa" per ciascuno. Dopo il completamento, l'utente può riprovare il submit.

- [ ] **Step 4.1: Leggere le righe rilevanti di PendingOrdersPage per trovare lo stato e il JSX**

```bash
grep -n "customersMap\|setCustomersMap\|RichCustomer\|useState\|CustomerCreateModal\|editCustomerForCompleteness\|quickFix\|incompleteOrder" archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx | head -40
```

Poi leggere il blocco JSX dove viene mostrato il banner (se esiste) o dove mettere il nuovo:
```bash
grep -n "return (" archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx | head -5
```

- [ ] **Step 4.2: Aggiungere gli import necessari**

Aggiungere in cima a `PendingOrdersPage.tsx` (dopo gli import esistenti):

```typescript
import { CustomerQuickFix } from '../components/CustomerQuickFix';
import type { MissingFieldKey } from '../utils/customer-completeness';
```

- [ ] **Step 4.3: Aggiungere gli stati per il Quick Fix**

Nel corpo del componente `PendingOrdersPage`, aggiungere questi stati:

```typescript
const [quickFixCustomer, setQuickFixCustomer] = useState<{
  customerProfile: string;
  customerName: string;
  missingFields: MissingFieldKey[];
} | null>(null);

// Mappa di override locale per clienti aggiornati dopo QuickFix (profile → RichCustomer)
const [customerOverrides, setCustomerOverrides] = useState<Map<string, RichCustomer>>(new Map());
```

- [ ] **Step 4.4: Aggiungere la funzione `refreshCustomer`**

Aggiungere prima di `handleSubmitOrders`:

```typescript
const refreshCustomer = async (customerProfile: string): Promise<void> => {
  const jwt = localStorage.getItem('archibald_jwt') ?? '';
  try {
    const res = await fetch(`/api/customers/${encodeURIComponent(customerProfile)}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) return;
    const body = await res.json();
    const updated: RichCustomer = body.data;
    setCustomerOverrides((prev) => new Map([...prev, [customerProfile, updated]]));
  } catch {
    // silenzioso — il banner resterà visibile
  }
};
```

- [ ] **Step 4.5: Calcolare `incompleteSelectedOrders` (computed)**

Aggiungere subito dopo gli stati (logica inline, nessuna funzione helper):

```typescript
const incompleteSelectedOrders = useMemo(() => {
  return orders
    .filter((o) => selectedOrderIds.has(o.id!))
    .filter((o) => {
      const c = customerOverrides.get(o.customerId) ?? customersMap.get(o.customerId);
      if (!c) return false;
      const isGhostOnly = o.items.every((i) => i.isGhostArticle);
      return !checkCustomerCompleteness(c).ok && !isGhostOnly;
    })
    .map((o) => {
      const c = (customerOverrides.get(o.customerId) ?? customersMap.get(o.customerId))!;
      return {
        orderId: o.id!,
        customerProfile: o.customerId,
        customerName: o.customerName,
        missingFields: checkCustomerCompleteness(c).missingFields,
      };
    });
}, [orders, selectedOrderIds, customersMap, customerOverrides]);
```

**Nota:** se `useMemo` non è già importato in `PendingOrdersPage.tsx`, aggiungere `useMemo` agli import da `'react'`.

- [ ] **Step 4.7: Aggiungere il banner degli ordini incompleti nel JSX**

Trovare nel JSX il punto PRIMA del bottone "Piazza Ordini" (o all'inizio del `return`) e inserire:

```tsx
{incompleteSelectedOrders.length > 0 && (
  <div
    style={{
      background: '#fff5f5', border: '1.5px solid #fca5a5',
      borderRadius: '8px', padding: '12px 16px', marginBottom: '12px',
    }}
  >
    <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', marginBottom: '8px' }}>
      ⚠ {incompleteSelectedOrders.length}{' '}
      {incompleteSelectedOrders.length === 1
        ? 'ordine bloccato — scheda cliente incompleta'
        : 'ordini bloccati — schede clienti incomplete'}
    </div>
    {incompleteSelectedOrders.map((item) => (
      <div
        key={item.orderId}
        style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: '6px',
        }}
      >
        <span style={{ fontSize: '13px', color: '#374151' }}>{item.customerName}</span>
        <button
          onClick={() => setQuickFixCustomer(item)}
          style={{
            padding: '4px 10px', background: '#2563eb', color: 'white',
            border: 'none', borderRadius: '5px', fontSize: '12px',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Completa →
        </button>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4.8: Aggiungere il componente `CustomerQuickFix` nel JSX**

Alla fine del `return`, prima della `</div>` di chiusura principale, aggiungere:

```tsx
{quickFixCustomer && (
  <CustomerQuickFix
    customerProfile={quickFixCustomer.customerProfile}
    customerName={quickFixCustomer.customerName}
    missingFields={quickFixCustomer.missingFields}
    onSaved={async () => {
      await refreshCustomer(quickFixCustomer.customerProfile);
      setQuickFixCustomer(null);
    }}
    onDismiss={() => setQuickFixCustomer(null)}
  />
)}
```

- [ ] **Step 4.9: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

Se ci sono errori di tipo su `getEffectiveCustomer` (perché `customersMap` non è accessibile fuori dallo scope), aggiustare la posizione delle funzioni. Se `RichCustomer` ha campi incompatibili col check, aggiornare la funzione.

- [ ] **Step 4.10: Suite test completa**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -10
```

Atteso: tutti i test PASS (nessuna regressione).

- [ ] **Step 4.11: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "feat(pending-orders): show incomplete customer banner with QuickFix integration"
```

---

## Verifica finale Piano B

- [ ] **Type-check completo**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Suite test frontend completa**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -10
```

---

## Note per Piano C

**Piano C (Frontend Pages)** integrerà `CustomerQuickFix` anche in `OrderFormSimple.tsx` — sostituendo l'attuale `CustomerCreateModal` in edit mode per i casi di cliente incompleto selezionato durante la creazione ordine. In `OrderFormSimple`, il pattern è già pronto (`fetchAndSetCustomerCompleteness` chiama `checkCustomerCompleteness` che ora ha `missingFields`).
