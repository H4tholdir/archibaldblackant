# Customers Redesign — P1: List + Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riscrivere CustomerList (no split-view, ricerca, badge, "Recenti") e creare CustomerListSidebar (sidebar compatta per tablet/desktop usata da CustomerProfilePage in P2).

**Architecture:** Tre task indipendenti: (1) utility condivisa `customer-avatar.ts`, (2) `CustomerListSidebar` nuovo componente, (3) `CustomerList` rewrite che rimuove la split-view e aggiunge sezione Recenti da localStorage. Il backend non richiede modifiche: `update-customer` già supporta tutti i campi in un'unica chiamata.

**Tech Stack:** React 19, TypeScript strict, inline styles, Vitest + Testing Library, React Router v6

---

## Nota Sub-A (Backend)

Il handler `update-customer` già supporta tutti i campi necessari per l'edit mode batch. `UpdateCustomerData` include: name, vatNumber, pec, sdi, street, postalCode, postalCodeCity, phone, mobile, email, url, deliveryMode, paymentTerms, lineDiscount, fiscalCode, sector, attentionTo, notes, addresses. Nessuna modifica backend necessaria.

---

## File Structure

```
frontend/src/utils/customer-avatar.ts        — NUOVO: avatarGradient + customerInitials
frontend/src/components/CustomerListSidebar.tsx — NUOVO: sidebar lista compatta (tablet/desktop)
frontend/src/pages/CustomerList.tsx           — REWRITE: rimuove split-view, aggiunge Recenti
frontend/src/pages/CustomerList.spec.tsx      — UPDATE: test aggiornati
frontend/src/components/CustomerListSidebar.spec.tsx — NUOVO
frontend/src/utils/customer-avatar.spec.ts    — NUOVO
```

---

## Task 1: Utility `customer-avatar.ts`

**Files:**
- Create: `archibald-web-app/frontend/src/utils/customer-avatar.ts`
- Create: `archibald-web-app/frontend/src/utils/customer-avatar.spec.ts`

- [ ] **Step 1: Scrivi il test**

```ts
// archibald-web-app/frontend/src/utils/customer-avatar.spec.ts
import { describe, expect, test } from 'vitest';
import { avatarGradient, customerInitials } from './customer-avatar';

describe('avatarGradient', () => {
  test('restituisce una stringa CSS gradient', () => {
    expect(avatarGradient('ABC123')).toMatch(/^linear-gradient/)
  });

  test('è deterministica — stesso erpId sempre stesso gradient', () => {
    expect(avatarGradient('ABC123')).toBe(avatarGradient('ABC123'))
  });

  test('erpId diversi possono avere gradient diversi', () => {
    const results = new Set(['AAA','BBB','CCC','DDD','EEE','FFF'].map(avatarGradient))
    expect(results.size).toBeGreaterThan(1)
  });
});

describe('customerInitials', () => {
  test('due parole → due iniziali uppercase', () => {
    expect(customerInitials('Rossi Mario')).toBe('RM')
  });

  test('una parola → prima lettera', () => {
    expect(customerInitials('Acme')).toBe('A')
  });

  test('tre parole → solo le prime due iniziali', () => {
    expect(customerInitials('Ferrari e Figli')).toBe('FF')
  });

  test('stringa vuota → stringa vuota', () => {
    expect(customerInitials('')).toBe('')
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose customer-avatar
```

Expected: FAIL — cannot find module `./customer-avatar`

- [ ] **Step 3: Implementa la utility**

```ts
// archibald-web-app/frontend/src/utils/customer-avatar.ts
const GRADIENTS = [
  'linear-gradient(135deg,#3b82f6,#8b5cf6)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#f59e0b,#d97706)',
  'linear-gradient(135deg,#f43f5e,#e11d48)',
  'linear-gradient(135deg,#8b5cf6,#7c3aed)',
  'linear-gradient(135deg,#0ea5e9,#0284c7)',
] as const;

export function avatarGradient(erpId: string): string {
  const hash = erpId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}

export function customerInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
```

- [ ] **Step 4: Esegui il test per verificare che passa**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose customer-avatar
```

Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/utils/customer-avatar.ts \
        archibald-web-app/frontend/src/utils/customer-avatar.spec.ts
git commit -m "feat(customers): utility avatarGradient + customerInitials"
```

---

## Task 2: `CustomerListSidebar` component

Componente sidebar lista clienti compatta usato da `CustomerProfilePage` (P2) su tablet/desktop. Ricerca debounced + lista + highlight del cliente attivo.

**Files:**
- Create: `archibald-web-app/frontend/src/components/CustomerListSidebar.tsx`
- Create: `archibald-web-app/frontend/src/components/CustomerListSidebar.spec.tsx`

- [ ] **Step 1: Scrivi il test**

```tsx
// archibald-web-app/frontend/src/components/CustomerListSidebar.spec.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CustomerListSidebar } from './CustomerListSidebar';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockCustomers = [
  { erpId: 'A001', name: 'Rossi Mario', city: 'Napoli' },
  { erpId: 'B002', name: 'Bianchi Srl', city: 'Milano' },
];

beforeEach(() => {
  mockNavigate.mockClear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { customers: mockCustomers } }),
  }));
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue('fake-jwt'),
    setItem: vi.fn(),
  });
});

describe('CustomerListSidebar', () => {
  test('renderizza la lista clienti', async () => {
    render(<MemoryRouter><CustomerListSidebar /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Rossi Mario')).toBeInTheDocument());
    expect(screen.getByText('Bianchi Srl')).toBeInTheDocument();
  });

  test('click su un cliente naviga a /customers/:erpId', async () => {
    render(<MemoryRouter><CustomerListSidebar /></MemoryRouter>);
    await waitFor(() => screen.getByText('Rossi Mario'));
    fireEvent.click(screen.getByText('Rossi Mario'));
    expect(mockNavigate).toHaveBeenCalledWith('/customers/A001');
  });

  test('il cliente attivo ha sfondo eff6ff', async () => {
    render(<MemoryRouter><CustomerListSidebar activeErpId="A001" /></MemoryRouter>);
    await waitFor(() => screen.getByText('Rossi Mario'));
    const row = screen.getByText('Rossi Mario').closest('div[data-customer-row]') as HTMLElement;
    expect(row.style.background).toBe('rgb(239, 246, 255)');
  });

  test('ricerca filtra la lista via fetch', async () => {
    render(<MemoryRouter><CustomerListSidebar /></MemoryRouter>);
    await waitFor(() => screen.getByPlaceholderText('Cerca…'));
    fireEvent.change(screen.getByPlaceholderText('Cerca…'), { target: { value: 'rossi' } });
    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const lastUrl = calls[calls.length - 1][0] as string;
      expect(lastUrl).toContain('search=rossi');
    }, { timeout: 600 });
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerListSidebar
```

Expected: FAIL — cannot find module `./CustomerListSidebar`

- [ ] **Step 3: Implementa il componente**

```tsx
// archibald-web-app/frontend/src/components/CustomerListSidebar.tsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Customer } from '../types/customer';
import { avatarGradient, customerInitials } from '../utils/customer-avatar';

interface Props {
  activeErpId?: string;
  width?: number;
}

export function CustomerListSidebar({ activeErpId, width = 240 }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);

  const loadCustomers = useCallback(async () => {
    const token = localStorage.getItem('archibald_jwt');
    if (!token) return;
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    params.append('limit', '50');
    const res = await fetch(`/api/customers?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    if (body.success) setCustomers(body.data.customers);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(loadCustomers, 300);
    return () => clearTimeout(t);
  }, [loadCustomers]);

  return (
    <div style={{ width, borderRight: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
        <div style={{ marginBottom: 8, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
          Clienti
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 8, padding: '6px 10px' }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca…"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 11, color: '#374151', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {customers.map(c => {
          const isActive = c.erpId === activeErpId;
          return (
            <div
              key={c.erpId}
              data-customer-row
              onClick={() => navigate(`/customers/${c.erpId}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', background: isActive ? '#eff6ff' : 'transparent', borderBottom: '1px solid #f8fafc' }}
            >
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: avatarGradient(c.erpId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {customerInitials(c.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                {c.city && <div style={{ fontSize: 10, color: '#64748b' }}>{c.city}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Esegui il test per verificare che passa**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerListSidebar
```

Expected: PASS (4 test)

- [ ] **Step 5: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerListSidebar.tsx \
        archibald-web-app/frontend/src/components/CustomerListSidebar.spec.tsx
git commit -m "feat(customers): CustomerListSidebar — sidebar compatta tablet/desktop"
```

---

## Task 3: `CustomerList` rewrite

Rimuove split-view e CustomerCard. Aggiunge sezione "Recenti" da localStorage, badge stato, card inline compatta. Mantiene photo lazy-load e CustomerCreateModal.

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerList.tsx` (648 → ~300 righe)
- Create: `archibald-web-app/frontend/src/pages/CustomerList.spec.tsx`

**Funzioni badge stato** (basate su `customer.lastOrderDate: string | null`):

```ts
// Formato lastOrderDate: 'YYYY-MM-DD' o 'DD/MM/YYYY'
function parseOrderDate(d: string): number {
  if (d.includes('/')) {
    const [day, month, year] = d.split('/');
    return new Date(`${year}-${month}-${day}`).getTime();
  }
  return new Date(d).getTime();
}

type BadgeType = 'attivo' | 'inattivo' | null;
function customerBadge(c: Customer): BadgeType {
  if (!c.lastOrderDate) return null;
  const last = parseOrderDate(c.lastOrderDate);
  if (isNaN(last)) return null;
  const now = Date.now();
  const DAY = 86_400_000;
  if (now - last < 90 * DAY) return 'attivo';
  if (now - last > 180 * DAY) return 'inattivo';
  return null;
}
```

**Funzioni Recenti** (ultime 5 visite in localStorage):

```ts
const RECENTS_KEY = 'customers_recents_v1';
function getRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as string[]; }
  catch { return []; }
}
function addRecent(erpId: string): void {
  const updated = [erpId, ...getRecents().filter(id => id !== erpId)].slice(0, 5);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
}
```

- [ ] **Step 1: Scrivi il test**

```tsx
// archibald-web-app/frontend/src/pages/CustomerList.spec.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CustomerList } from './CustomerList';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate, useSearchParams: () => [new URLSearchParams(), vi.fn()] };
});

vi.mock('../services/customers.service', () => ({
  customerService: { getPhotoUrl: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../components/CustomerCreateModal', () => ({
  CustomerCreateModal: () => <div data-testid="create-modal" />,
}));

const mockCustomers = [
  { erpId: 'A001', name: 'Rossi Mario', city: 'Napoli', phone: '081 123', lastOrderDate: null, createdAt: Date.now() },
  { erpId: 'B002', name: 'Bianchi Srl', city: 'Milano', phone: null, lastOrderDate: '2024-01-01', createdAt: Date.now() - 400 * 86_400_000 },
];

beforeEach(() => {
  mockNavigate.mockClear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { customers: mockCustomers } }),
  }));
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockImplementation((key: string) => key === 'archibald_jwt' ? 'fake-jwt' : null),
    setItem: vi.fn(),
  });
});

describe('CustomerList', () => {
  test('renderizza i clienti', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Rossi Mario')).toBeInTheDocument());
    expect(screen.getByText('Bianchi Srl')).toBeInTheDocument();
  });

  test('click su un cliente naviga a /customers/:erpId', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => screen.getByText('Rossi Mario'));
    fireEvent.click(screen.getByText('Rossi Mario'));
    expect(mockNavigate).toHaveBeenCalledWith('/customers/A001');
  });

  test('badge "inattivo" per cliente con lastOrderDate > 180gg', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => screen.getByText('Rossi Mario'));
    expect(screen.getByText('inattivo')).toBeInTheDocument();
  });

  test('pulsante + apre CustomerCreateModal', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => screen.getByText('Rossi Mario'));
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    expect(screen.getByTestId('create-modal')).toBeInTheDocument();
  });

  test('ricerca invia search param al fetch', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => screen.getByPlaceholderText(/Cerca/));
    fireEvent.change(screen.getByPlaceholderText(/Cerca/), { target: { value: 'rossi' } });
    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const lastUrl = calls[calls.length - 1][0] as string;
      expect(lastUrl).toContain('search=rossi');
    }, { timeout: 600 });
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/pages/CustomerList.spec.tsx
```

Expected: FAIL (vari errori, incluso split-view e struttura attuale)

- [ ] **Step 3: Riscrivi `CustomerList.tsx`**

Sostituisci l'intero file con:

```tsx
// archibald-web-app/frontend/src/pages/CustomerList.tsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CustomerCreateModal } from '../components/CustomerCreateModal';
import { customerService } from '../services/customers.service';
import { avatarGradient, customerInitials } from '../utils/customer-avatar';
import type { Customer } from '../types/customer';

// ── Recenti ─────────────────────────────────────────────────────────────────
const RECENTS_KEY = 'customers_recents_v1';
function getRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as string[]; }
  catch { return []; }
}
function addRecent(erpId: string): void {
  const updated = [erpId, ...getRecents().filter(id => id !== erpId)].slice(0, 5);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
}

// ── Badge ────────────────────────────────────────────────────────────────────
function parseOrderDate(d: string): number {
  if (d.includes('/')) {
    const [day, month, year] = d.split('/');
    return new Date(`${year}-${month}-${day}`).getTime();
  }
  return new Date(d).getTime();
}
type BadgeType = 'attivo' | 'inattivo' | null;
function customerBadge(c: Customer): BadgeType {
  if (!c.lastOrderDate) return null;
  const last = parseOrderDate(c.lastOrderDate);
  if (isNaN(last)) return null;
  const now = Date.now();
  const DAY = 86_400_000;
  if (now - last < 90 * DAY) return 'attivo';
  if (now - last > 180 * DAY) return 'inattivo';
  return null;
}

const BADGE_STYLE: Record<'attivo' | 'inattivo', React.CSSProperties> = {
  attivo:   { background: '#dcfce7', color: '#166534', fontSize: 9, padding: '2px 6px', borderRadius: 10, fontWeight: 700 },
  inattivo: { background: '#fef9c3', color: '#854d0e', fontSize: 9, padding: '2px 6px', borderRadius: 10, fontWeight: 700 },
};

// ── Component ────────────────────────────────────────────────────────────────
export function CustomerList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [customerPhotos, setCustomerPhotos] = useState<Record<string, string | null>>({});
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>(getRecents());

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchCustomers = useCallback(async () => {
    const token = localStorage.getItem('archibald_jwt');
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.append('search', debouncedSearch);
    params.append('limit', debouncedSearch ? '100' : '50');
    const res = await fetch(`/api/customers?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    if (body.success) setCustomers(body.data.customers);
    setLoading(false);
  }, [debouncedSearch]);

  useEffect(() => { void fetchCustomers(); }, [fetchCustomers]);

  // Lazy-load foto
  useEffect(() => {
    if (customers.length === 0) return;
    let cancelled = false;
    const load = async () => {
      for (const c of customers) {
        if (cancelled || customerPhotos[c.erpId] !== undefined) continue;
        const url = await customerService.getPhotoUrl(c.erpId).catch(() => null);
        if (!cancelled) setCustomerPhotos(prev => ({ ...prev, [c.erpId]: url }));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [customers]);

  const handleClick = (erpId: string) => {
    addRecent(erpId);
    setRecents(getRecents());
    navigate(`/customers/${erpId}`);
  };

  const recentCustomers = recents
    .map(id => customers.find(c => c.erpId === id))
    .filter((c): c is Customer => c !== undefined);
  const recentIds = new Set(recents);
  const allCustomers = customers.filter(c => !recentIds.has(c.erpId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Clienti</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{customers.length} clienti</div>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          aria-label="+"
          style={{ width: 32, height: 32, background: '#2563eb', border: 'none', borderRadius: '50%', color: 'white', fontSize: 20, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >+</button>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f1f5f9', borderRadius: 10, padding: '8px 12px' }}>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca nome, telefono, P.IVA…"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: '#374151', outline: 'none' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Caricamento…</div>
        )}

        {recentCustomers.length > 0 && !debouncedSearch && (
          <>
            <SectionLabel>Recenti</SectionLabel>
            {recentCustomers.map(c => (
              <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
            ))}
          </>
        )}

        <SectionLabel>{debouncedSearch ? `Risultati (${allCustomers.length})` : 'Tutti (A–Z)'}</SectionLabel>
        {allCustomers.map(c => (
          <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
        ))}
      </div>

      {createModalOpen && (
        <CustomerCreateModal
          onClose={() => setCreateModalOpen(false)}
          onSuccess={() => { setCreateModalOpen(false); void fetchCustomers(); }}
          contextMode="standalone"
        />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

function CustomerRow({ customer: c, photo, onClick }: { customer: Customer; photo: string | null; onClick: () => void }) {
  const badge = customerBadge(c);
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
    >
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: photo ? undefined : avatarGradient(c.erpId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0, overflow: 'hidden' }}>
        {photo ? <img src={photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : customerInitials(c.name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
        <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[c.phone ?? c.mobile, c.city].filter(Boolean).join(' · ')}
        </div>
      </div>
      {badge && <span style={BADGE_STYLE[badge]}>{badge}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Esegui il test per verificare che passa**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/pages/CustomerList.spec.tsx
```

Expected: PASS (5 test)

- [ ] **Step 5: Type-check e test completi**

```bash
npm run type-check --prefix archibald-web-app/frontend && npm test --prefix archibald-web-app/frontend
```

Expected: 0 type errors, test suite green (i test CustomerList spec già scritti passano)

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerList.tsx \
        archibald-web-app/frontend/src/pages/CustomerList.spec.tsx
git commit -m "feat(customers): CustomerList rewrite — no split-view, recenti, badge stato"
```
