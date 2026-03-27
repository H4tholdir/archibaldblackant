# Customer Detail Page V2 — Piano C1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire la pagina `/customers/:customerProfile` — Dashboard Split con sidebar scura fissa, tabs (Dati/Ordini/Note/Indirizzi), editing inline per sezione, e layout responsive (no sidebar su mobile, sidebar ridotta su tablet, sidebar piena su desktop).

**Architecture:** La pagina è composta da `CustomerSidebar` (sidebar fissa con photo/azioni/stats) e un'area tab-based dove `CustomerInlineSection` gestisce ogni sezione editabile (view ↔ edit mode, chiama `enqueueOperation('update-customer')` + `pollJobUntilDone`). Il router viene aggiornato per aggiungere la nuova route. La navigazione avviene da `CustomerList` (click su cliente) — aggiornamento trattato in Piano C2.

**Tech Stack:** React 19, TypeScript strict, React Router v6 (`useParams`, `useNavigate`), Vitest + Testing Library, inline styles esclusivamente (NO className, NO CSS), `enqueueOperation` + `pollJobUntilDone` per async bot.

---

## Mappa file

| File | Azione | Responsabilità |
|---|---|---|
| `frontend/src/components/CustomerSidebar.tsx` | Crea | Sidebar scura: photo/iniziali, azioni rapide (call/WA/email/maps), stats, bottone ordine |
| `frontend/src/components/CustomerSidebar.spec.tsx` | Crea | Unit test sidebar |
| `frontend/src/components/CustomerInlineSection.tsx` | Crea | Sezione editabile: view/edit mode, save via bot, progress bar |
| `frontend/src/components/CustomerInlineSection.spec.tsx` | Crea | Unit test sezione |
| `frontend/src/pages/CustomerDetailPage.tsx` | Crea | Pagina completa: carica customer, assembla sidebar + tabs + sezioni |
| `frontend/src/pages/CustomerDetailPage.spec.tsx` | Crea | Unit test pagina |
| `frontend/src/AppRouter.tsx` | Modifica | Aggiunge route `/customers/:customerProfile` |

---

## Task 1: `CustomerSidebar.tsx`

**Files:**
- Create: `archibald-web-app/frontend/src/components/CustomerSidebar.tsx`
- Create: `archibald-web-app/frontend/src/components/CustomerSidebar.spec.tsx`

- [ ] **Step 1.1: Leggere il tipo Customer per i nomi di campo esatti**

```bash
cat /Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend/src/types/customer.ts
```

- [ ] **Step 1.2: Scrivere i test (TDD)**

Creare `archibald-web-app/frontend/src/components/CustomerSidebar.spec.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { CustomerSidebar } from './CustomerSidebar';
import type { Customer } from '../types/customer';

const baseCustomer: Customer = {
  customerProfile: '55.261',
  internalId: null,
  name: 'Mario Rossi S.r.l.',
  vatNumber: 'IT08246131216',
  vatValidatedAt: '2026-01-01T00:00:00Z',
  pec: 'mario@pec.it',
  sdi: null,
  phone: '081 1234567',
  mobile: '333 1234567',
  email: 'info@rossi.it',
  url: null,
  street: 'Via Roma 12',
  postalCode: '80100',
  city: 'Napoli',
  county: 'NA',
  state: null,
  country: 'Italy',
  attentionTo: null,
  logisticsAddress: null,
  customerType: null,
  type: null,
  deliveryTerms: null,
  description: null,
  fiscalCode: null,
  lastOrderDate: '2026-01-15T10:00:00Z',
  actualOrderCount: 47,
  actualSales: 12340,
  previousOrderCount1: 40,
  previousSales1: 10000,
  previousOrderCount2: 35,
  previousSales2: 9000,
  externalAccountNumber: null,
  ourAccountNumber: null,
  hash: '',
  lastSync: 0,
  createdAt: 0,
  updatedAt: 0,
  botStatus: 'placed',
  photoUrl: null,
  sector: 'Florovivaismo',
  priceGroup: null,
  lineDiscount: null,
  paymentTerms: '30gg DFFM',
  notes: null,
  nameAlias: null,
};

describe('CustomerSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  });

  test('renders customer initials when no photoUrl', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByText('MR')).toBeDefined();
  });

  test('renders customer name', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByText('Mario Rossi S.r.l.')).toBeDefined();
  });

  test('renders order count stat', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByText('47')).toBeDefined();
  });

  test('renders call button with phone number', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByTestId('sidebar-call')).toBeDefined();
    expect(screen.getByText('333 1234567')).toBeDefined();
  });

  test('renders WhatsApp button', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByTestId('sidebar-whatsapp')).toBeDefined();
  });

  test('renders email button with email value', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByTestId('sidebar-email')).toBeDefined();
  });

  test('renders maps button with address', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByTestId('sidebar-maps')).toBeDefined();
  });

  test('does not render call button when phone and mobile are null', () => {
    render(<CustomerSidebar customer={{ ...baseCustomer, phone: null, mobile: null }} onNewOrder={vi.fn()} />);
    expect(screen.queryByTestId('sidebar-call')).toBeNull();
  });

  test('calls onNewOrder when new order button is clicked', () => {
    const onNewOrder = vi.fn();
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={onNewOrder} />);
    fireEvent.click(screen.getByTestId('sidebar-new-order'));
    expect(onNewOrder).toHaveBeenCalled();
  });

  test('returns null on mobile viewport (< 641px)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    const { container } = render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 1.3: Eseguire i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/components/CustomerSidebar.spec.tsx 2>&1 | tail -15
```

- [ ] **Step 1.4: Creare `CustomerSidebar.tsx`**

Creare `archibald-web-app/frontend/src/components/CustomerSidebar.tsx`:

```typescript
import type { Customer } from '../types/customer';

interface CustomerSidebarProps {
  customer: Customer;
  onNewOrder: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

function daysSince(dateStr: string | null): string {
  if (!dateStr) return '—';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  return `${days}gg`;
}

export function CustomerSidebar({ customer, onNewOrder }: CustomerSidebarProps) {
  if (window.innerWidth < 641) return null;

  const sidebarWidth = window.innerWidth >= 1024 ? '32%' : '36%';
  const phone = customer.mobile || customer.phone;

  const handleCall = () => {
    if (phone) window.location.href = `tel:${phone}`;
  };
  const handleWhatsApp = () => {
    if (phone) window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank');
  };
  const handleEmail = () => {
    if (customer.email) window.location.href = `mailto:${customer.email}`;
  };
  const handleMaps = () => {
    if (customer.street && customer.city) {
      window.open(`https://maps.google.com/?q=${encodeURIComponent(`${customer.street}, ${customer.city}`)}`, '_blank');
    }
  };

  const actionBtn = (testid: string, bg: string, color: string, icon: string, label: string, onClick: () => void) => (
    <button
      key={testid}
      data-testid={testid}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 8px', background: bg, border: 'none',
        borderRadius: '6px', cursor: 'pointer', fontSize: '10px',
        color, width: '100%', textAlign: 'left',
        overflow: 'hidden',
      }}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );

  return (
    <div
      data-testid="customer-sidebar"
      style={{
        width: sidebarWidth, background: '#1e293b',
        padding: '16px', display: 'flex', flexDirection: 'column',
        gap: '10px', flexShrink: 0,
      }}
    >
      {/* Photo / initials */}
      <div style={{ textAlign: 'center', paddingBottom: '12px', borderBottom: '1px solid #334155' }}>
        {customer.photoUrl ? (
          <img
            src={customer.photoUrl}
            alt={customer.name}
            style={{
              width: '52px', height: '52px', borderRadius: '10px',
              objectFit: 'cover', margin: '0 auto 8px', display: 'block',
              border: '2px solid #4a90d9',
            }}
          />
        ) : (
          <div style={{
            width: '52px', height: '52px', borderRadius: '10px',
            background: '#2d4a6b', border: '2px solid #4a90d9',
            margin: '0 auto 8px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontWeight: 800, color: '#93c5fd', fontSize: '18px',
          }}>
            {getInitials(customer.name)}
          </div>
        )}
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>{customer.name}</div>
        <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>{customer.customerProfile}</div>
        {customer.sector && (
          <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>{customer.sector}</div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {phone && actionBtn('sidebar-call',     '#253346', '#93c5fd', '📞', phone,          handleCall)}
        {phone && actionBtn('sidebar-whatsapp', '#1a3a27', '#86efac', '💬', 'WhatsApp',     handleWhatsApp)}
        {customer.email && actionBtn('sidebar-email', '#1e3058', '#93c5fd', '✉', customer.email, handleEmail)}
        {customer.street && customer.city && actionBtn('sidebar-maps', '#3a1a1a', '#fca5a5', '📍', `${customer.street}, ${customer.city}`, handleMaps)}
      </div>

      {/* Stats */}
      <div style={{ height: '1px', background: '#334155' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        <div style={{ background: '#253346', borderRadius: '6px', padding: '7px', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>
            {customer.actualOrderCount ?? 0}
          </div>
          <div style={{ fontSize: '7px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Ordini
          </div>
        </div>
        <div style={{ background: '#253346', borderRadius: '6px', padding: '7px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: customer.lastOrderDate ? '#fbbf24' : '#64748b' }}>
            {daysSince(customer.lastOrderDate)}
          </div>
          <div style={{ fontSize: '7px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Attività
          </div>
        </div>
      </div>

      {/* New order */}
      <div style={{ marginTop: 'auto' }}>
        <button
          data-testid="sidebar-new-order"
          onClick={onNewOrder}
          style={{
            width: '100%', padding: '8px', background: '#7c3aed',
            color: 'white', border: 'none', borderRadius: '6px',
            fontSize: '11px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          + Nuovo Ordine
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 1.5: Eseguire i test**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/components/CustomerSidebar.spec.tsx 2>&1 | tail -15
```

Atteso: 10 test PASS.

- [ ] **Step 1.6: Type-check e suite**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 1.7: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerSidebar.tsx \
        archibald-web-app/frontend/src/components/CustomerSidebar.spec.tsx
git commit -m "feat(ui): CustomerSidebar — photo, azioni rapide, stats, responsive"
```

---

## Task 2: `CustomerInlineSection.tsx`

**Files:**
- Create: `archibald-web-app/frontend/src/components/CustomerInlineSection.tsx`
- Create: `archibald-web-app/frontend/src/components/CustomerInlineSection.spec.tsx`

- [ ] **Step 2.1: Scrivere i test (TDD)**

Creare `archibald-web-app/frontend/src/components/CustomerInlineSection.spec.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { CustomerInlineSection } from './CustomerInlineSection';
import type { SectionField } from './CustomerInlineSection';

vi.mock('../api/operations', () => ({
  enqueueOperation: vi.fn(),
  pollJobUntilDone: vi.fn(),
}));
vi.mock('../services/toast.service', () => ({
  toastService: { success: vi.fn(), error: vi.fn() },
}));

import { enqueueOperation, pollJobUntilDone } from '../api/operations';

const pecField: SectionField = { key: 'pec', label: 'PEC', value: 'mario@pec.it', type: 'email' };
const sdiField: SectionField = { key: 'sdi', label: 'SDI', value: null };

const baseProps = {
  title: 'Dati Fiscali',
  fields: [pecField, sdiField],
  customerProfile: '55.261',
  customerName: 'Mario Rossi S.r.l.',
  onSaved: vi.fn(),
};

describe('CustomerInlineSection', () => {
  beforeEach(() => vi.clearAllMocks());

  test('renders in view mode by default', () => {
    render(<CustomerInlineSection {...baseProps} />);
    expect(screen.getByText('Dati Fiscali')).toBeDefined();
    expect(screen.getByText('mario@pec.it')).toBeDefined();
    expect(screen.getByText('✏ Modifica')).toBeDefined();
  });

  test('shows dash for null field values in view mode', () => {
    render(<CustomerInlineSection {...baseProps} />);
    expect(screen.getByText('—')).toBeDefined();
  });

  test('switches to edit mode on click Modifica', () => {
    render(<CustomerInlineSection {...baseProps} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    expect(screen.getByDisplayValue('mario@pec.it')).toBeDefined();
    expect(screen.getByText('✓ Salva sezione')).toBeDefined();
  });

  test('returns to view mode on click Annulla', () => {
    render(<CustomerInlineSection {...baseProps} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    fireEvent.click(screen.getByText('Annulla'));
    expect(screen.getByText('✏ Modifica')).toBeDefined();
    expect(screen.queryByDisplayValue('mario@pec.it')).toBeNull();
  });

  test('calls enqueueOperation with customerProfile and changed values on save', async () => {
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'j1', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<CustomerInlineSection {...baseProps} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    const pecInput = screen.getByDisplayValue('mario@pec.it');
    fireEvent.change(pecInput, { target: { value: 'nuovo@pec.it' } });
    fireEvent.click(screen.getByText('✓ Salva sezione'));

    await waitFor(() => {
      expect(enqueueOperation).toHaveBeenCalledWith(
        'update-customer',
        expect.objectContaining({ customerProfile: '55.261', pec: 'nuovo@pec.it' }),
      );
    });
  });

  test('calls onSaved after successful bot job', async () => {
    const onSaved = vi.fn();
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'j1', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<CustomerInlineSection {...baseProps} onSaved={onSaved} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    fireEvent.click(screen.getByText('✓ Salva sezione'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  test('shows error and stays in edit mode when job fails', async () => {
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'j1', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Bot timeout'));

    render(<CustomerInlineSection {...baseProps} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    fireEvent.click(screen.getByText('✓ Salva sezione'));

    await waitFor(() => expect(screen.getByText('Bot timeout')).toBeDefined());
    expect(screen.queryByText('✏ Modifica')).toBeNull();
  });

  test('sends postalCodeCity when city field is saved', async () => {
    const cityField: SectionField = { key: 'city', label: 'Città', value: 'Napoli' };
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'j1', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<CustomerInlineSection {...baseProps} fields={[cityField]} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    fireEvent.click(screen.getByText('✓ Salva sezione'));

    await waitFor(() => {
      expect(enqueueOperation).toHaveBeenCalledWith(
        'update-customer',
        expect.objectContaining({ postalCodeCity: 'Napoli' }),
      );
      expect(enqueueOperation).not.toHaveBeenCalledWith(
        'update-customer',
        expect.objectContaining({ city: expect.anything() }),
      );
    });
  });

  test('shows hasError styling when hasError prop is true', () => {
    render(<CustomerInlineSection {...baseProps} hasError />);
    expect(screen.getByText('⚠ Dati Fiscali')).toBeDefined();
  });

  test('readonly fields are not rendered as inputs in edit mode', () => {
    const readonlyField: SectionField = { key: 'vatValidatedAt', label: 'IVA Validata', value: 'Sì', readOnly: true };
    render(<CustomerInlineSection {...baseProps} fields={[readonlyField]} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Sì')).toBeDefined();
  });
});
```

- [ ] **Step 2.2: Eseguire i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/components/CustomerInlineSection.spec.tsx 2>&1 | tail -15
```

- [ ] **Step 2.3: Creare `CustomerInlineSection.tsx`**

Creare `archibald-web-app/frontend/src/components/CustomerInlineSection.tsx`:

```typescript
import { useState } from 'react';
import { enqueueOperation, pollJobUntilDone } from '../api/operations';
import { toastService } from '../services/toast.service';

export type SectionField = {
  key: string;
  label: string;
  value: string | null;
  type?: 'text' | 'email' | 'url' | 'textarea';
  readOnly?: boolean;
};

interface CustomerInlineSectionProps {
  title: string;
  fields: SectionField[];
  customerProfile: string;
  customerName: string;
  hasError?: boolean;
  onSaved?: () => void;
  columns?: 1 | 2 | 3;
}

export function CustomerInlineSection({
  title,
  fields,
  customerProfile,
  customerName,
  hasError = false,
  onSaved,
  columns = 2,
}: CustomerInlineSectionProps) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((f) => [f.key, f.value ?? ''])),
  );
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const displayValues = editing
    ? values
    : Object.fromEntries(fields.map((f) => [f.key, f.value ?? '']));

  const handleEdit = () => {
    setValues(Object.fromEntries(fields.map((f) => [f.key, f.value ?? ''])));
    setError(null);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setProgress(0);
    setError(null);

    try {
      const data: Record<string, unknown> = {
        customerProfile,
        name: customerName,
      };

      for (const field of fields) {
        if (field.readOnly) continue;
        const val = values[field.key];
        if (field.key === 'city') {
          data.postalCodeCity = val || null;
        } else {
          data[field.key] = val || null;
        }
      }

      const { jobId } = await enqueueOperation('update-customer', data);
      await pollJobUntilDone(jobId, {
        maxWaitMs: 120_000,
        onProgress: (p) => setProgress(p),
      });

      toastService.success(`${title} aggiornato`);
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const borderColor = hasError ? '#fca5a5' : editing ? '#93c5fd' : '#e2e8f0';
  const bgColor = hasError ? '#fff5f5' : editing ? '#eff6ff' : '#f8fafc';

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '7px',
        padding: '10px',
        marginBottom: '8px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{
          fontSize: '9px', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.5px',
          color: hasError ? '#dc2626' : editing ? '#2563eb' : '#475569',
        }}>
          {hasError ? '⚠ ' : editing ? '✎ ' : ''}{title}
        </span>

        {!saving && (
          editing ? (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={handleCancel}
                style={{ fontSize: '10px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ✓ Salva sezione
              </button>
            </div>
          ) : (
            <button
              onClick={handleEdit}
              style={{ fontSize: '10px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ✏ Modifica
            </button>
          )
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          fontSize: '11px', color: '#dc2626',
          background: '#fff5f5', border: '1px solid #fca5a5',
          borderRadius: '4px', padding: '6px 8px', marginBottom: '8px',
        }}>
          {error}
        </div>
      )}

      {/* Progress */}
      {saving && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '3px' }}>
            {progress < 100 ? `Salvataggio... ${progress}%` : 'Completato'}
          </div>
          <div style={{ height: '3px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              width: `${progress}%`, height: '100%',
              background: '#2563eb', transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Fields grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: '6px',
      }}>
        {fields.map((field) => (
          <div key={field.key}>
            {editing && !field.readOnly ? (
              <>
                <label style={{ display: 'block', fontSize: '9px', color: '#6b7280', marginBottom: '2px' }}>
                  {field.label}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={displayValues[field.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    disabled={saving}
                    rows={3}
                    style={{
                      width: '100%', padding: '6px 8px',
                      border: '1.5px solid #d1d5db', borderRadius: '4px',
                      fontSize: '11px', resize: 'vertical', boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <input
                    type={field.type ?? 'text'}
                    value={displayValues[field.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    disabled={saving}
                    style={{
                      width: '100%', padding: '5px 8px',
                      border: '1.5px solid #d1d5db', borderRadius: '4px',
                      fontSize: '11px', boxSizing: 'border-box',
                    }}
                  />
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: '8px', color: '#94a3b8' }}>{field.label}</div>
                <div style={{
                  fontSize: '10px',
                  color: field.value ? '#1e293b' : '#d1d5db',
                  fontWeight: field.value ? 500 : 400,
                  fontStyle: field.value ? 'normal' : 'italic',
                }}>
                  {field.value ?? '—'}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2.4: Eseguire i test**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/components/CustomerInlineSection.spec.tsx 2>&1 | tail -20
```

Atteso: 9 test PASS.

- [ ] **Step 2.5: Type-check e suite**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 2.6: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerInlineSection.tsx \
        archibald-web-app/frontend/src/components/CustomerInlineSection.spec.tsx
git commit -m "feat(ui): CustomerInlineSection — editing inline per sezione con save bot"
```

---

## Task 3: `CustomerDetailPage.tsx`

**Files:**
- Create: `archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx`
- Create: `archibald-web-app/frontend/src/pages/CustomerDetailPage.spec.tsx`

- [ ] **Step 3.1: Leggere AppRouter.tsx per capire il pattern di route**

```bash
cat archibald-web-app/frontend/src/AppRouter.tsx
```

- [ ] **Step 3.2: Scrivere i test (TDD)**

Creare `archibald-web-app/frontend/src/pages/CustomerDetailPage.spec.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerDetailPage } from './CustomerDetailPage';

vi.mock('../hooks/useKeyboardScroll', () => ({
  useKeyboardScroll: () => ({
    keyboardHeight: 0, keyboardOpen: false,
    scrollFieldIntoView: vi.fn(),
    keyboardPaddingStyle: {}, modalOverlayKeyboardStyle: {},
  }),
}));

const mockCustomer = {
  customerProfile: '55.261',
  internalId: null,
  name: 'Mario Rossi S.r.l.',
  vatNumber: 'IT08246131216',
  vatValidatedAt: '2026-01-01T00:00:00Z',
  pec: 'mario@pec.it',
  sdi: null,
  phone: '081 1234567',
  mobile: '333 1234567',
  email: 'info@rossi.it',
  url: null,
  street: 'Via Roma 12',
  postalCode: '80100',
  city: 'Napoli',
  county: 'NA',
  state: null,
  country: 'Italy',
  attentionTo: null,
  logisticsAddress: null,
  customerType: null,
  type: null,
  deliveryTerms: null,
  description: null,
  fiscalCode: null,
  lastOrderDate: '2026-01-15T10:00:00Z',
  actualOrderCount: 47,
  actualSales: 12340,
  previousOrderCount1: 40, previousSales1: 10000,
  previousOrderCount2: 35, previousSales2: 9000,
  externalAccountNumber: null, ourAccountNumber: null,
  hash: '', lastSync: 0, createdAt: 0, updatedAt: 0,
  botStatus: 'placed' as const, photoUrl: null,
  sector: 'Florovivaismo', priceGroup: null, lineDiscount: null,
  paymentTerms: '30gg DFFM', notes: null, nameAlias: null,
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/customers/55.261']}>
      <Routes>
        <Route path="/customers/:customerProfile" element={<CustomerDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('CustomerDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockCustomer }),
    });
    global.localStorage = { getItem: vi.fn().mockReturnValue('mock-jwt') } as never;
  });

  test('shows loading state initially', () => {
    renderPage();
    expect(screen.getByText(/caricamento/i)).toBeDefined();
  });

  test('renders customer name after data loads', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Mario Rossi S.r.l.')).toBeDefined();
    });
  });

  test('renders back button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/← clienti/i)).toBeDefined();
    });
  });

  test('renders Dati tab active by default', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /dati/i })).toBeDefined();
    });
  });

  test('renders Anagrafica section in Dati tab', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Anagrafica')).toBeDefined();
    });
  });

  test('renders Dati Fiscali section with PEC value', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('mario@pec.it')).toBeDefined();
    });
  });

  test('shows error banner when customer fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/errore nel caricamento/i)).toBeDefined();
    });
  });
});
```

- [ ] **Step 3.3: Eseguire i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/pages/CustomerDetailPage.spec.tsx 2>&1 | tail -15
```

- [ ] **Step 3.4: Creare `CustomerDetailPage.tsx`**

Creare `archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Customer } from '../types/customer';
import { CustomerSidebar } from '../components/CustomerSidebar';
import { CustomerInlineSection } from '../components/CustomerInlineSection';
import type { SectionField } from '../components/CustomerInlineSection';
import { checkCustomerCompleteness } from '../utils/customer-completeness';

type Tab = 'dati' | 'ordini' | 'note' | 'indirizzi';

async function fetchCustomer(customerProfile: string): Promise<Customer> {
  const jwt = localStorage.getItem('archibald_jwt') ?? '';
  const res = await fetch(`/api/customers/${encodeURIComponent(customerProfile)}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error('Errore nel caricamento del cliente');
  const body = (await res.json()) as { success: boolean; data: Customer };
  return body.data;
}

export function CustomerDetailPage() {
  const { customerProfile } = useParams<{ customerProfile: string }>();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('dati');

  const loadCustomer = useCallback(async () => {
    if (!customerProfile) return;
    try {
      const data = await fetchCustomer(customerProfile);
      setCustomer(data);
      setFetchError(null);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Errore nel caricamento del cliente');
    } finally {
      setLoading(false);
    }
  }, [customerProfile]);

  useEffect(() => { void loadCustomer(); }, [loadCustomer]);

  const handleNewOrder = () => {
    // Naviga alla dashboard — il flusso nuovo ordine parte da lì.
    // Piano C2 aggiornerà questo per pre-selezionare il cliente nel form ordine.
    navigate('/');
  };

  const isMobile = window.innerWidth < 641;

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
        Caricamento...
      </div>
    );
  }

  if (fetchError || !customer) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: '8px', padding: '16px', color: '#dc2626' }}>
          {fetchError ?? 'Cliente non trovato'}
        </div>
        <button onClick={() => navigate('/customers')} style={{ marginTop: '12px', fontSize: '13px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Torna ai clienti
        </button>
      </div>
    );
  }

  const completeness = checkCustomerCompleteness(customer);

  // Section field builders
  const anagraficaFields: SectionField[] = [
    { key: 'name',        label: 'Ragione Sociale',    value: customer.name },
    { key: 'nameAlias',   label: 'Alias (da ERP)',     value: customer.nameAlias ?? null, readOnly: true },
    { key: 'attentionTo', label: 'All\'attenzione di', value: customer.attentionTo },
    { key: 'sector',      label: 'Settore',            value: customer.sector ?? null },
    { key: 'fiscalCode',  label: 'Codice Fiscale',     value: customer.fiscalCode },
  ];

  const fiscaleFields: SectionField[] = [
    { key: 'vatNumber',     label: 'P.IVA',           value: customer.vatNumber },
    { key: 'vatValidatedAt', label: 'IVA Validata',  value: customer.vatValidatedAt ? 'Sì ✓' : 'No', readOnly: true },
    { key: 'pec',           label: 'PEC',             value: customer.pec,  type: 'email' },
    { key: 'sdi',           label: 'SDI',             value: customer.sdi },
  ];

  const contattiFields: SectionField[] = [
    { key: 'phone',  label: 'Telefono', value: customer.phone },
    { key: 'mobile', label: 'Mobile',   value: customer.mobile },
    { key: 'email',  label: 'Email',    value: customer.email,  type: 'email' },
    { key: 'url',    label: 'Sito web', value: customer.url,    type: 'url' },
  ];

  const indirizzoFields: SectionField[] = [
    { key: 'street',     label: 'Indirizzo',             value: customer.street },
    { key: 'postalCode', label: 'CAP',                   value: customer.postalCode },
    { key: 'city',       label: 'Città',                 value: customer.city },
    { key: 'county',     label: 'Provincia (da CAP)',    value: customer.county ?? null,  readOnly: true },
    { key: 'state',      label: 'Regione (da CAP)',      value: customer.state ?? null,   readOnly: true },
    { key: 'country',    label: 'Nazione (da CAP)',      value: customer.country ?? null, readOnly: true },
  ];

  const commercialeFields: SectionField[] = [
    { key: 'deliveryTerms', label: 'Modalità consegna', value: customer.deliveryTerms },
    { key: 'paymentTerms',  label: 'Termini pagamento', value: customer.paymentTerms ?? null },
    { key: 'lineDiscount',  label: 'Sconto linea',      value: customer.lineDiscount ?? null },
    { key: 'priceGroup',    label: 'Gruppo prezzo',     value: customer.priceGroup ?? null, readOnly: true },
  ];

  const noteFields: SectionField[] = [
    { key: 'notes', label: 'Note (sincronizzate con ERP)', value: customer.notes ?? null, type: 'textarea' },
  ];

  const isFiscaleError = completeness.missingFields.some((f) =>
    ['vatNumber', 'vatValidatedAt', 'pec_or_sdi'].includes(f),
  );
  const isIndirizzoError = completeness.missingFields.some((f) =>
    ['street', 'postalCode', 'city'].includes(f),
  );
  const datiBadge = !completeness.ok ? 1 : 0;

  const tabBtn = (id: Tab, label: string, badge?: number) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      style={{
        padding: '8px 12px',
        fontSize: '11px',
        fontWeight: activeTab === id ? 700 : 500,
        color: activeTab === id ? '#2563eb' : '#64748b',
        background: 'none',
        border: 'none',
        borderBottom: activeTab === id ? '2px solid #2563eb' : '2px solid transparent',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      {label}
      {badge ? (
        <span style={{ background: '#ef4444', color: 'white', borderRadius: '8px', padding: '0 5px', fontSize: '8px', lineHeight: '14px' }}>
          {badge}
        </span>
      ) : null}
    </button>
  );

  // Mobile compact header
  const mobileHeader = isMobile ? (
    <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '8px',
          background: '#2d4a6b', border: '2px solid #4a90d9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, color: '#93c5fd', fontSize: '14px', flexShrink: 0,
        }}>
          {customer.name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{customer.name}</div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>{customer.customerProfile}</div>
        </div>
        <button
          onClick={handleNewOrder}
          style={{ padding: '5px 10px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
        >
          + Ordine
        </button>
      </div>
      {/* Mobile quick actions bar */}
      <div style={{ display: 'flex', gap: '0', borderTop: '1px solid #e5e7eb', marginTop: '8px' }}>
        {[
          { icon: '📞', label: 'Chiama', action: () => { if (customer.mobile || customer.phone) window.location.href = `tel:${customer.mobile || customer.phone}`; } },
          { icon: '💬', label: 'WhatsApp', action: () => { const p = customer.mobile || customer.phone; if (p) window.open(`https://wa.me/${p.replace(/\D/g, '')}`, '_blank'); } },
          { icon: '✉', label: 'Email', action: () => { if (customer.email) window.location.href = `mailto:${customer.email}`; } },
          { icon: '📍', label: 'Maps', action: () => { if (customer.street && customer.city) window.open(`https://maps.google.com/?q=${encodeURIComponent(`${customer.street}, ${customer.city}`)}`, '_blank'); } },
        ].map(({ icon, label, action }) => (
          <button
            key={label}
            onClick={action}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '7px 4px', border: 'none', background: 'none', cursor: 'pointer' }}
          >
            <span style={{ fontSize: '16px' }}>{icon}</span>
            <span style={{ fontSize: '8px', color: '#475569', marginTop: '2px' }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
      {/* Topbar */}
      <div style={{
        background: '#1e293b', color: '#f8fafc',
        padding: '9px 14px', display: 'flex', alignItems: 'center', gap: '8px',
        fontSize: '11px', fontWeight: 600,
      }}>
        <button
          onClick={() => navigate('/customers')}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '10px' }}
        >
          ← Clienti
        </button>
        <span style={{ marginLeft: '4px', fontWeight: 700 }}>{customer.name}</span>
        <span style={{ flex: 1 }} />
        {!completeness.ok && (
          <span style={{ background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '8px', fontSize: '9px' }}>
            ⚠ {completeness.missingFields.length} mancanti
          </span>
        )}
      </div>

      {/* Mobile header */}
      {mobileHeader}

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar (tablet + desktop) */}
        <CustomerSidebar customer={customer} onNewOrder={handleNewOrder} />

        {/* Content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{
            display: 'flex', borderBottom: '1.5px solid #e5e7eb',
            background: '#f8fafc', overflowX: 'auto',
          }}>
            {tabBtn('dati',      'Dati',           datiBadge || undefined)}
            {tabBtn('ordini',    'Ordini')}
            {tabBtn('note',      'Note interne')}
            {tabBtn('indirizzi', 'Indirizzi alt.')}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

            {activeTab === 'dati' && (
              <>
                <CustomerInlineSection
                  title="Anagrafica"
                  fields={anagraficaFields}
                  customerProfile={customer.customerProfile}
                  customerName={customer.name}
                  columns={2}
                  onSaved={loadCustomer}
                />
                <CustomerInlineSection
                  title="Dati Fiscali"
                  fields={fiscaleFields}
                  customerProfile={customer.customerProfile}
                  customerName={customer.name}
                  hasError={isFiscaleError}
                  columns={2}
                  onSaved={loadCustomer}
                />
                <CustomerInlineSection
                  title="Contatti"
                  fields={contattiFields}
                  customerProfile={customer.customerProfile}
                  customerName={customer.name}
                  columns={2}
                  onSaved={loadCustomer}
                />
                <CustomerInlineSection
                  title="Indirizzo principale"
                  fields={indirizzoFields}
                  customerProfile={customer.customerProfile}
                  customerName={customer.name}
                  hasError={isIndirizzoError}
                  columns={3}
                  onSaved={loadCustomer}
                />
                <CustomerInlineSection
                  title="Commerciale"
                  fields={commercialeFields}
                  customerProfile={customer.customerProfile}
                  customerName={customer.name}
                  columns={2}
                  onSaved={loadCustomer}
                />
                <CustomerInlineSection
                  title="Note ERP"
                  fields={noteFields}
                  customerProfile={customer.customerProfile}
                  customerName={customer.name}
                  columns={1}
                  onSaved={loadCustomer}
                />
              </>
            )}

            {activeTab === 'ordini' && (
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { label: 'Ordini totali',      value: String(customer.actualOrderCount ?? 0) },
                    { label: 'Fatturato corrente',  value: customer.actualSales ? `€ ${customer.actualSales.toLocaleString('it-IT')}` : '—' },
                    { label: 'Ultima attività',     value: customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString('it-IT') : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '7px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>{value}</div>
                      <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: '3px' }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '24px' }}>
                  Storico ordini completo disponibile nella pagina Ordini
                </div>
              </div>
            )}

            {activeTab === 'note' && (
              <div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                  Note private — visibili solo a te, non sincronizzate con Archibald ERP.
                </div>
                <textarea
                  placeholder="Aggiungi note private su questo cliente..."
                  rows={8}
                  style={{
                    width: '100%', padding: '10px 12px',
                    border: '1.5px solid #d1d5db', borderRadius: '7px',
                    fontSize: '13px', resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {activeTab === 'indirizzi' && (
              <div style={{ fontSize: '13px', color: '#64748b', padding: '16px 0' }}>
                Gestione indirizzi alternativi disponibile tramite il form di modifica cliente.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.5: Eseguire i test**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/pages/CustomerDetailPage.spec.tsx 2>&1 | tail -20
```

Atteso: 7 test PASS.

- [ ] **Step 3.6: Type-check e suite**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 3.7: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx \
        archibald-web-app/frontend/src/pages/CustomerDetailPage.spec.tsx
git commit -m "feat(pages): CustomerDetailPage V2 — sidebar, tabs, inline editing"
```

---

## Task 4: Aggiungere route `/customers/:customerProfile` in AppRouter

**Files:**
- Modify: `archibald-web-app/frontend/src/AppRouter.tsx`

- [ ] **Step 4.1: Leggere la struttura di AppRouter**

```bash
cat archibald-web-app/frontend/src/AppRouter.tsx
```

- [ ] **Step 4.2: Aggiungere import e route**

In `AppRouter.tsx`:

1. Aggiungere l'import della nuova pagina (insieme agli altri import di pagine):
```typescript
import { CustomerDetailPage } from './pages/CustomerDetailPage';
```

2. Aggiungere la route `/customers/:customerProfile` **PRIMA** della route `/customers` (le route più specifiche vengono prima in React Router v6):
```tsx
<Route path="/customers/:customerProfile" element={<CustomerDetailPage />} />
<Route path="/customers" element={<CustomerList />} />
```

Se le route sono in un array o usano un pattern diverso, adattare coerentemente al pattern esistente.

- [ ] **Step 4.3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

- [ ] **Step 4.4: Suite completa**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -8
```

Atteso: tutte le suite PASS senza regressioni.

- [ ] **Step 4.5: Commit**

```bash
git add archibald-web-app/frontend/src/AppRouter.tsx
git commit -m "feat(router): add /customers/:customerProfile route for CustomerDetailPage"
```

---

## Verifica finale Piano C1

- [ ] **Type-check completo**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Suite test completa**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -8
```

---

## Note per Piano C2

**Piano C2** aggiornerà `CustomerListPage` per navigare a `/customers/:customerProfile` (click su un cliente apre la scheda V2 invece del modal di edit), aggiungerà quick actions 📞💬 alle card, il filtro "Incompleti", e rimuoverà il branch `isEditMode` da `CustomerCreateModal`.
