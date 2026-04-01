# Customers Redesign — P2: CustomerProfilePage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare `CustomerProfilePage` che sostituisce `CustomerDetailPage` + `CustomerSidebar` + `CustomerInlineSection`, con avatar prominente, quick actions, edit mode batch-deferred, storico ordini inline con filtri temporali, indirizzi alternativi CRUD.

**Architecture:** `CustomerProfilePage` è la nuova pagina dedicata al profilo cliente. Su tablet/desktop (≥768px) include `CustomerListSidebar` (da P1) nella colonna sinistra. L'edit mode accumula tutte le modifiche in `pendingEdits`, poi chiama `update-customer` una sola volta al tap del FAB. Storico ordini caricato una volta, filtrato client-side. Alla fine i vecchi file (`CustomerDetailPage`, `CustomerSidebar`, `CustomerInlineSection`) vengono eliminati e l'AppRouter aggiornato.

**Tech Stack:** React 19, TypeScript strict, inline styles, Vitest + Testing Library, React Router v6, `enqueueOperation` + `pollJobUntilDone` da `../api/operations`, `PhotoCropModal` riusato intatto.

**Prerequisito:** P1 completato (utility `customer-avatar.ts` e `CustomerListSidebar` disponibili).

---

## File Structure

```
frontend/src/pages/CustomerProfilePage.tsx      — NUOVO (~550 righe)
frontend/src/pages/CustomerProfilePage.spec.tsx — NUOVO
frontend/src/AppRouter.tsx                       — MODIFICA route /customers/:erpId
frontend/src/pages/CustomerDetailPage.tsx        — ELIMINATO
frontend/src/components/CustomerSidebar.tsx      — ELIMINATO
frontend/src/components/CustomerInlineSection.tsx — ELIMINATO
```

---

## Riferimenti chiave

**Tipi:**
```ts
// Customer (frontend/src/types/customer.ts) — campi usati nel profilo:
// erpId, name, vatNumber, fiscalCode, pec, sdi, email, phone, mobile, url,
// attentionTo, street, postalCode, city, county, state, country,
// deliveryTerms, sector, lineDiscount, paymentTerms, notes, lastOrderDate, createdAt

// AddressEntry (frontend/src/types/customer-form-data.ts):
// tipo, nome?, via?, cap?, citta?, contea?, stato?, idRegione?, contra?

// CustomerAddress (frontend/src/types/customer-address.ts):
// id, erpId, tipo, nome|null, via|null, cap|null, citta|null, contea|null, stato|null, idRegione|null, contra|null

// CustomerFullHistoryOrder (frontend/src/api/customer-full-history.ts):
// orderId, orderNumber, orderDate, totalAmount, source, (articles: [...])
```

**API calls:**
```ts
// Carica cliente:
const jwt = localStorage.getItem('archibald_jwt') ?? ''
const res = await fetch(`/api/customers/${encodeURIComponent(erpId)}`, { headers: { Authorization: `Bearer ${jwt}` } })
const { data } = await res.json()  // → Customer

// Carica foto:
import { customerService } from '../services/customers.service'
const photoUrl = await customerService.getPhotoUrl(erpId)  // → string | null

// Carica storico ordini:
import { getCustomerFullHistory } from '../api/customer-full-history'
const orders = await getCustomerFullHistory({ customerErpIds: [erpId] })  // → CustomerFullHistoryOrder[]

// Carica indirizzi:
import { getCustomerAddresses, addCustomerAddress, deleteCustomerAddress } from '../services/customer-addresses'
const addresses = await getCustomerAddresses(erpId)  // → CustomerAddress[]

// Salva modifiche bot:
import { enqueueOperation, pollJobUntilDone } from '../api/operations'
import { useOperationTracking } from '../contexts/OperationTrackingContext'
const { trackOperation } = useOperationTracking()
const { jobId } = await enqueueOperation('update-customer', { erpId, ...pendingEdits })
await pollJobUntilDone(jobId, { onProgress: (p, label) => ... })
```

**Photo upload (riusato intatto):**
```ts
import { PhotoCropModal } from '../components/PhotoCropModal'
// Dopo crop: customerService.uploadPhoto(erpId, file) → poi customerService.getPhotoUrl(erpId)
// Delete: customerService.deletePhoto(erpId)
```

**Viewport:**
```ts
// In CustomerProfilePage:
const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
useEffect(() => {
  const h = () => setIsMobile(window.innerWidth < 768)
  window.addEventListener('resize', h)
  return () => window.removeEventListener('resize', h)
}, [])
// isMobile === true  → profilo full-screen senza sidebar
// isMobile === false → CustomerListSidebar 200px + profilo (desktop 240px)
```

---

## Task 1: Shell + data loading

Crea il file con struttura base, caricamento parallelo dei dati e stati di loading/errore.

**Files:**
- Create: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`
- Create: `archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx`

- [ ] **Step 1: Scrivi il test**

```tsx
// archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerProfilePage } from './CustomerProfilePage';

vi.mock('../services/customers.service', () => ({
  customerService: {
    getPhotoUrl: vi.fn().mockResolvedValue(null),
    uploadPhoto: vi.fn().mockResolvedValue(undefined),
    deletePhoto: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../api/customer-full-history', () => ({
  getCustomerFullHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/customer-addresses', () => ({
  getCustomerAddresses: vi.fn().mockResolvedValue([]),
  addCustomerAddress: vi.fn(),
  deleteCustomerAddress: vi.fn(),
}));
vi.mock('../api/operations', () => ({
  enqueueOperation: vi.fn().mockResolvedValue({ jobId: 'j1' }),
  pollJobUntilDone: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../contexts/OperationTrackingContext', () => ({
  useOperationTracking: () => ({ trackOperation: vi.fn() }),
}));
vi.mock('../components/CustomerListSidebar', () => ({
  CustomerListSidebar: () => <div data-testid="sidebar" />,
}));
vi.mock('../components/PhotoCropModal', () => ({
  PhotoCropModal: () => <div data-testid="photo-crop-modal" />,
}));

const mockCustomer = {
  erpId: 'A001', name: 'Rossi Mario', vatNumber: '06104510653',
  fiscalCode: null, pec: 'rossi@pec.it', sdi: null, email: 'rossi@test.it',
  phone: '081 552 1234', mobile: null, url: null, attentionTo: null,
  street: 'Via Roma 12', postalCode: '80100', city: 'Napoli',
  county: 'NA', state: null, country: 'Italy',
  deliveryTerms: 'Standard', sector: 'Florovivaismo',
  lineDiscount: 'N/A', paymentTerms: '30gg DFFM', notes: null,
  lastOrderDate: '2025-10-15', createdAt: Date.now(),
};

function renderProfile(erpId = 'A001') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: mockCustomer }),
  }));
  vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('fake-jwt') });
  return render(
    <MemoryRouter initialEntries={[`/customers/${erpId}`]}>
      <Routes>
        <Route path="/customers/:erpId" element={<CustomerProfilePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CustomerProfilePage — shell', () => {
  test('renderizza il nome del cliente dopo il caricamento', async () => {
    renderProfile();
    await waitFor(() => expect(screen.getByText('Rossi Mario')).toBeInTheDocument());
  });

  test('mostra lo stato di caricamento prima del fetch', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('fake-jwt') });
    render(
      <MemoryRouter initialEntries={['/customers/A001']}>
        <Routes><Route path="/customers/:erpId" element={<CustomerProfilePage />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/Caricamento/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage
```

Expected: FAIL — cannot find module `./CustomerProfilePage`

- [ ] **Step 3: Implementa la shell**

```tsx
// archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Customer } from '../types/customer';
import type { CustomerAddress } from '../types/customer-address';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
import type { AddressEntry } from '../types/customer-form-data';
import { customerService } from '../services/customers.service';
import { getCustomerFullHistory } from '../api/customer-full-history';
import { getCustomerAddresses, addCustomerAddress, deleteCustomerAddress } from '../services/customer-addresses';
import { enqueueOperation, pollJobUntilDone } from '../api/operations';
import { useOperationTracking } from '../contexts/OperationTrackingContext';
import { toastService } from '../services/toast.service';
import { CustomerListSidebar } from '../components/CustomerListSidebar';
import { PhotoCropModal } from '../components/PhotoCropModal';
import { avatarGradient, customerInitials } from '../utils/customer-avatar';

type PendingEdits = {
  name?: string; vatNumber?: string; fiscalCode?: string; pec?: string; sdi?: string;
  phone?: string; mobile?: string; email?: string; url?: string; attentionTo?: string;
  street?: string; postalCode?: string; postalCodeCity?: string;
  deliveryMode?: string; paymentTerms?: string; lineDiscount?: string;
  sector?: string; notes?: string;
  addresses?: AddressEntry[];
};

export function CustomerProfilePage() {
  const { erpId } = useParams<{ erpId: string }>();
  const navigate = useNavigate();
  const { trackOperation } = useOperationTracking();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [orders, setOrders] = useState<CustomerFullHistoryOrder[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<PendingEdits>({});
  const [saving, setSaving] = useState(false);

  const [photoCropSrc, setPhotoCropSrc] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    if (!erpId) return;
    setLoading(true);
    const jwt = localStorage.getItem('archibald_jwt') ?? '';
    Promise.all([
      fetch(`/api/customers/${encodeURIComponent(erpId)}`, { headers: { Authorization: `Bearer ${jwt}` } })
        .then(r => r.json()).then(b => b.data as Customer),
      customerService.getPhotoUrl(erpId).catch(() => null),
      getCustomerFullHistory({ customerErpIds: [erpId] }).catch(() => []),
      getCustomerAddresses(erpId).catch(() => []),
    ]).then(([c, photo, ord, addr]) => {
      setCustomer(c);
      setPhotoUrl(photo);
      setOrders(ord);
      setAddresses(addr);
      setLoading(false);
    }).catch(err => {
      setError(String(err));
      setLoading(false);
    });
  }, [erpId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 14 }}>
        Caricamento…
      </div>
    );
  }
  if (error || !customer || !erpId) {
    return (
      <div style={{ padding: 24, color: '#ef4444', fontSize: 13 }}>
        {error ?? 'Cliente non trovato'}
      </div>
    );
  }

  // ── Handlers (da completare nei task successivi) ────────────────────────
  const enterEditMode = () => { setEditMode(true); setPendingEdits({}); };
  const exitEditMode = () => { setEditMode(false); setPendingEdits({}); };
  const setField = (key: keyof PendingEdits, value: string) =>
    setPendingEdits(prev => ({ ...prev, [key]: value }));
  const pendingCount = Object.keys(pendingEdits).length;

  const handleSave = async () => {
    if (pendingCount === 0 || saving) return;
    setSaving(true);
    try {
      const { jobId } = await enqueueOperation('update-customer', { erpId, name: customer.name, ...pendingEdits });
      trackOperation(jobId, `Aggiornamento ${customer.name}`);
      await pollJobUntilDone(jobId, {
        onProgress: (p, label) => { /* progress handled by GlobalOperationBanner */ void p; void label; },
      });
      toastService.success('Cliente aggiornato');
      setEditMode(false);
      setPendingEdits({});
      // Reload customer data
      const jwt = localStorage.getItem('archibald_jwt') ?? '';
      const res = await fetch(`/api/customers/${encodeURIComponent(erpId)}`, { headers: { Authorization: `Bearer ${jwt}` } });
      const body = await res.json();
      setCustomer(body.data);
    } catch {
      toastService.error('Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  };

  // ── Layout ──────────────────────────────────────────────────────────────
  const sidebarWidth = window.innerWidth >= 1280 ? 240 : 200;

  return (
    <div style={{ display: 'flex', height: '100%', background: '#f8fafc' }}>
      {!isMobile && (
        <CustomerListSidebar activeErpId={erpId} width={sidebarWidth} />
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Contenuto — completato nei task successivi */}
        <div style={{ padding: 16, color: '#374151', fontSize: 14 }}>
          {customer.name} — profilo in costruzione
        </div>

        {/* FAB salva — da completare nel Task 5 */}
        {editMode && pendingCount > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ position: 'absolute', bottom: 20, right: 16, background: '#16a34a', color: 'white', border: 'none', borderRadius: 24, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(22,163,74,0.4)', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            💾 Salva ({pendingCount})
          </button>
        )}
      </div>

        {photoCropSrc && (
        <PhotoCropModal
          imageSrc={photoCropSrc}
          onClose={() => setPhotoCropSrc(null)}
          onConfirm={async (blob) => {
            setPhotoCropSrc(null);
            const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
            await customerService.uploadPhoto(erpId, file);
            const url = await customerService.getPhotoUrl(erpId);
            setPhotoUrl(url);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Esegui il test per verificare che passa**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage
```

Expected: PASS (2 test)

- [ ] **Step 5: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx \
        archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx
git commit -m "feat(customers): CustomerProfilePage shell + data loading parallelo"
```

---

## Task 2: ProfileHero (avatar + quick actions)

Aggiunge l'area hero del profilo: top bar con pulsante Modifica, avatar grande con badge 📷, nome/meta, quick actions primarie e secondarie.

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx`

- [ ] **Step 1: Aggiungi test per ProfileHero**

Nel file `CustomerProfilePage.spec.tsx`, aggiungi questo describe dopo quelli esistenti:

```tsx
describe('CustomerProfilePage — ProfileHero', () => {
  test('mostra le iniziali dell avatar quando non c è foto', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('RM')); // iniziali Rossi Mario
  });

  test('pulsante 📷 apre l input file', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Rossi Mario'));
    const photoBtn = screen.getByRole('button', { name: /📷/i });
    expect(photoBtn).toBeInTheDocument();
  });

  test('quick action Ordine è presente', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Ordine'));
  });

  test('quick action Chiama è presente', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Chiama'));
  });

  test('quick action WhatsApp è assente quando mobile è null', async () => {
    renderProfile(); // mockCustomer.mobile === null
    await waitFor(() => screen.getByText('Rossi Mario'));
    expect(screen.queryByText('WhatsApp')).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage
```

Expected: FAIL (quick actions non ancora renderizzate)

- [ ] **Step 3: Sostituisci il layout in CustomerProfilePage**

Nella funzione `CustomerProfilePage`, sostituisci il div "profilo in costruzione" con:

```tsx
{/* ── Edit mode banner ─────────────────────────────────────────────── */}
{editMode && (
  <div style={{ background: '#fef3c7', borderBottom: '1px solid #fde68a', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
    <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>✎ Modalità modifica attiva — clicca qualsiasi campo per modificarlo</span>
    <span style={{ flex: 1 }} />
    <button onClick={exitEditMode} style={{ border: 'none', background: 'none', fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>Annulla modifiche</button>
  </div>
)}

{/* ── Top bar ───────────────────────────────────────────────────────── */}
<div style={{ background: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
  {isMobile && (
    <button onClick={() => navigate('/customers')} style={{ border: 'none', background: 'none', fontSize: 22, color: '#2563eb', cursor: 'pointer', lineHeight: 1 }}>‹</button>
  )}
  <div style={{ flex: 1, fontSize: 16, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.name}</div>
  <button
    onClick={editMode ? exitEditMode : enterEditMode}
    style={{ padding: '5px 12px', background: editMode ? '#fff' : '#2563eb', color: editMode ? '#2563eb' : 'white', border: editMode ? '1.5px solid #2563eb' : 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
  >
    {editMode ? '✎ Modifica' : 'Modifica'}
  </button>
</div>

{/* ── Hero ──────────────────────────────────────────────────────────── */}
<div style={{ background: '#fff', padding: '20px 16px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
  {/* Avatar */}
  <div style={{ position: 'relative', marginBottom: 10 }}>
    <div style={{
      width: isMobile ? 80 : 72,
      height: isMobile ? 80 : 72,
      borderRadius: isMobile ? '50%' : 16,
      background: photoUrl ? undefined : avatarGradient(erpId),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: isMobile ? 28 : 26, fontWeight: 700, color: 'white',
      border: `2px solid ${editMode ? '#f59e0b' : '#fff'}`,
      boxShadow: `0 0 0 2px ${editMode ? '#f59e0b' : '#3b82f6'}`,
      overflow: 'hidden',
    }}>
      {photoUrl
        ? <img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        : customerInitials(customer.name)
      }
    </div>
    <button
      onClick={() => photoInputRef.current?.click()}
      aria-label="📷"
      style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, background: '#2563eb', border: '2px solid #fff', borderRadius: '50%', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
    >📷</button>
    <input
      ref={photoInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      style={{ display: 'none' }}
      onChange={e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => { if (ev.target?.result) setPhotoCropSrc(ev.target.result as string); };
        reader.readAsDataURL(file);
        e.target.value = '';
      }}
    />
  </div>

  {/* Nome + meta */}
  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 3, textAlign: 'center' }}>{customer.name}</div>
  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, textAlign: 'center' }}>
    {[customer.vatNumber && `P.IVA ${customer.vatNumber}`, customer.city].filter(Boolean).join(' · ')}
  </div>

  {/* Quick actions primarie */}
  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
    <QuickAction icon="📋" label="Ordine" color="#eff6ff" onClick={() => navigate('/')} />
    <QuickAction icon="📞" label="Chiama" color="#dcfce7" onClick={() => { const p = customer.mobile ?? customer.phone; if (p) window.location.href = `tel:${p}`; }} />
    {customer.mobile && (
      <QuickAction icon="💬" label="WhatsApp" color="#fef9c3" onClick={() => window.open(`https://wa.me/${customer.mobile!.replace(/\D/g,'')}`, '_blank')} />
    )}
    <QuickAction icon="🕐" label="Storico" color="#f1f5f9" onClick={() => document.getElementById('storico-section')?.scrollIntoView({ behavior: 'smooth' })} />
  </div>

  {/* Quick actions secondarie (condizionali) */}
  {(customer.email || (customer.street && customer.city)) && (
    <div style={{ display: 'flex', gap: 8 }}>
      {customer.email && (
        <QuickAction icon="✉" label="Email" color="#f1f5f9" onClick={() => { window.location.href = `mailto:${customer.email}`; }} />
      )}
      {customer.street && customer.city && (
        <QuickAction icon="📍" label="Maps" color="#f1f5f9" onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(`${customer.street}, ${customer.city}`)}`, '_blank')} />
      )}
    </div>
  )}
</div>

{/* ── Sezioni (completate nei task successivi) ─────────────────────── */}
<div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
  <div style={{ color: '#94a3b8', fontSize: 12 }}>Sezioni dati in costruzione…</div>
</div>
```

Aggiungi il sub-componente `QuickAction` alla fine del file (dopo `CustomerProfilePage`):

```tsx
function QuickAction({ icon, label, color, onClick }: { icon: string; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 40, height: 40, background: color, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{icon}</div>
      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{label}</div>
    </button>
  );
}
```

- [ ] **Step 4: Esegui i test per verificare che passano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage
```

Expected: PASS (7 test — 2 precedenti + 5 nuovi)

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx \
        archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx
git commit -m "feat(customers): CustomerProfilePage hero — avatar, edit mode toggle, quick actions"
```

---

## Task 3: Sezioni dati (view + edit mode)

Aggiunge le 4 sezioni dati (Contatti, Indirizzo, Commerciale, Anagrafica) con campi in modalità visualizzazione e modifica.

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx`

Le sezioni usano un pattern `SectionCard` con griglia di `FieldCell`. In edit mode, ogni `FieldCell` mostra un `<input>`. I campi readonly (county, state, country — impostati solo dallo snapshot ERP) sono sempre in visualizzazione.

- [ ] **Step 1: Aggiungi test per le sezioni**

```tsx
// Aggiunge a CustomerProfilePage.spec.tsx
describe('CustomerProfilePage — sezioni dati', () => {
  test('mostra il telefono nella sezione Contatti', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('081 552 1234'));
  });

  test('mostra Via Roma 12 nella sezione Indirizzo', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Via Roma 12'));
  });

  test('mostra Florovivaismo nella sezione Anagrafica', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Florovivaismo'));
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage
```

Expected: FAIL (i valori non sono ancora renderizzati)

- [ ] **Step 3: Sostituisci il placeholder "Sezioni dati in costruzione" con le sezioni reali**

Nella funzione `CustomerProfilePage`, sostituisci il div `<div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>`:

```tsx
{/* ── Sezioni dati ─────────────────────────────────────────────────── */}
<div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
  {/* Contatti */}
  <SectionCard
    title="Contatti"
    editMode={editMode}
    pendingKeys={['phone','mobile','email','pec','sdi','url']}
    pendingEdits={pendingEdits}
  >
    <FieldCell label="Telefono" value={pendingEdits.phone ?? customer.phone} editKey="phone" editMode={editMode} setField={setField} />
    <FieldCell label="Mobile" value={pendingEdits.mobile ?? customer.mobile} editKey="mobile" editMode={editMode} setField={setField} />
    <FieldCell label="Email" value={pendingEdits.email ?? customer.email} editKey="email" editMode={editMode} setField={setField} />
    <FieldCell label="PEC" value={pendingEdits.pec ?? customer.pec} editKey="pec" editMode={editMode} setField={setField} />
    <FieldCell label="SDI" value={pendingEdits.sdi ?? customer.sdi} editKey="sdi" editMode={editMode} setField={setField} />
    <FieldCell label="URL" value={pendingEdits.url ?? customer.url} editKey="url" editMode={editMode} setField={setField} />
  </SectionCard>

  {/* Indirizzo */}
  <SectionCard
    title="Indirizzo"
    editMode={editMode}
    pendingKeys={['street','postalCode','postalCodeCity']}
    pendingEdits={pendingEdits}
  >
    <FieldCell label="Via" value={pendingEdits.street ?? customer.street} editKey="street" editMode={editMode} setField={setField} />
    <FieldCell label="CAP" value={pendingEdits.postalCode ?? customer.postalCode} editKey="postalCode" editMode={editMode} setField={setField} />
    <FieldCell label="Città" value={pendingEdits.postalCodeCity ?? customer.city} editKey="postalCodeCity" editMode={editMode} setField={setField} />
    <FieldCell label="Provincia" value={customer.county} readOnly />
    <FieldCell label="Regione" value={customer.state} readOnly />
    <FieldCell label="Paese" value={customer.country} readOnly />
  </SectionCard>

  {/* Commerciale */}
  <SectionCard
    title="Commerciale"
    editMode={editMode}
    pendingKeys={['deliveryMode','paymentTerms','lineDiscount']}
    pendingEdits={pendingEdits}
  >
    <FieldCell label="Sconto linea" value={pendingEdits.lineDiscount ?? customer.lineDiscount} editKey="lineDiscount" editMode={editMode} setField={setField} />
    <FieldCell label="Pagamento" value={pendingEdits.paymentTerms ?? customer.paymentTerms} editKey="paymentTerms" editMode={editMode} setField={setField} />
    <FieldCell label="Consegna" value={pendingEdits.deliveryMode ?? customer.deliveryTerms} editKey="deliveryMode" editMode={editMode} setField={setField} />
  </SectionCard>

  {/* Anagrafica */}
  <SectionCard
    title="Anagrafica"
    editMode={editMode}
    pendingKeys={['name','vatNumber','fiscalCode','sector','attentionTo','notes']}
    pendingEdits={pendingEdits}
  >
    <FieldCell label="Ragione sociale" value={pendingEdits.name ?? customer.name} editKey="name" editMode={editMode} setField={setField} />
    <FieldCell label="P.IVA" value={customer.vatNumber} readOnly />
    <FieldCell label="Cod. Fiscale" value={pendingEdits.fiscalCode ?? customer.fiscalCode} editKey="fiscalCode" editMode={editMode} setField={setField} />
    <FieldCell label="Settore" value={pendingEdits.sector ?? customer.sector} editKey="sector" editMode={editMode} setField={setField} />
    <FieldCell label="Att.ne" value={pendingEdits.attentionTo ?? customer.attentionTo} editKey="attentionTo" editMode={editMode} setField={setField} />
    <FieldCell label="Note" value={pendingEdits.notes ?? customer.notes} editKey="notes" editMode={editMode} setField={setField} isTextarea />
  </SectionCard>

  {/* Indirizzi alt, Storico — da completare nei task successivi */}
</div>
```

Aggiungi i sub-componenti `SectionCard` e `FieldCell` alla fine del file:

```tsx
function SectionCard({ title, editMode, pendingKeys, pendingEdits, children }: {
  title: string;
  editMode: boolean;
  pendingKeys: string[];
  pendingEdits: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const modifiedCount = pendingKeys.filter(k => pendingEdits[k] !== undefined).length;
  const hasChanges = modifiedCount > 0;
  return (
    <div style={{ background: '#fff', borderRadius: 12, marginBottom: 10, border: `1px solid ${hasChanges ? '#fde68a' : '#f1f5f9'}`, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px 8px', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', background: hasChanges ? '#fffbeb' : undefined, display: 'flex', alignItems: 'center', gap: 8 }}>
        {title}
        {editMode && hasChanges && (
          <span style={{ background: '#f59e0b', color: 'white', fontSize: 9, padding: '1px 6px', borderRadius: 8, fontWeight: 700, textTransform: 'none', letterSpacing: 0 }}>{modifiedCount} modif{modifiedCount === 1 ? 'a' : 'iche'}</span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {children}
      </div>
    </div>
  );
}

function FieldCell({ label, value, editKey, editMode, setField, readOnly, isTextarea }: {
  label: string;
  value: string | null | undefined;
  editKey?: keyof PendingEdits;
  editMode?: boolean;
  setField?: (key: keyof PendingEdits, value: string) => void;
  readOnly?: boolean;
  isTextarea?: boolean;
}) {
  const isModified = editMode && editKey && value !== undefined && value !== null;
  const canEdit = editMode && !readOnly && editKey && setField;
  const displayVal = value ?? '—';

  return (
    <div style={{ padding: '8px 14px', borderTop: '1px solid #f8fafc', background: isModified ? '#fffbeb' : undefined }}>
      <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {isModified && <span style={{ width: 5, height: 5, background: '#f59e0b', borderRadius: '50%', display: 'inline-block' }} />}
      </div>
      {canEdit ? (
        isTextarea ? (
          <textarea
            value={value ?? ''}
            onChange={e => setField!(editKey!, e.target.value)}
            style={{ fontSize: 12, border: `1.5px solid ${value !== undefined ? '#f59e0b' : '#e2e8f0'}`, borderRadius: 5, padding: '3px 7px', width: '100%', background: value !== undefined ? '#fef9c3' : '#f8fafc', outline: 'none', resize: 'vertical', minHeight: 48, fontFamily: 'inherit', color: '#1e293b' }}
          />
        ) : (
          <input
            value={value ?? ''}
            onChange={e => setField!(editKey!, e.target.value)}
            style={{ fontSize: 12, border: `1.5px solid ${value !== undefined ? '#f59e0b' : '#e2e8f0'}`, borderRadius: 5, padding: '3px 7px', width: '100%', boxSizing: 'border-box', background: value !== undefined ? '#fef9c3' : '#f8fafc', outline: 'none', color: '#1e293b' }}
          />
        )
      ) : (
        <div style={{ fontSize: 12, color: readOnly ? '#94a3b8' : '#1e293b', fontWeight: readOnly ? 400 : 500 }}>{displayVal}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Esegui i test per verificare che passano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage
```

Expected: PASS (10 test)

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx \
        archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx
git commit -m "feat(customers): sezioni dati view/edit mode — Contatti, Indirizzo, Commerciale, Anagrafica"
```

---

## Task 4: Edit mode completo + FAB save + test accumulo

Verifica che il FAB appaia con le modifiche, che `enqueueOperation` venga chiamato una sola volta con tutti i campi, e che i dati vengano ricaricati dopo il salvataggio.

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx`

- [ ] **Step 1: Aggiungi test per edit mode e FAB**

```tsx
// Aggiunge a CustomerProfilePage.spec.tsx
import { fireEvent } from '@testing-library/react'; // già importato

describe('CustomerProfilePage — edit mode + FAB', () => {
  test('FAB non visibile in view mode', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Rossi Mario'));
    expect(screen.queryByText(/Salva/)).toBeNull();
  });

  test('entra in edit mode al click su Modifica', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Modifica'));
    fireEvent.click(screen.getByText('Modifica'));
    expect(screen.getByText(/Modalità modifica attiva/)).toBeInTheDocument();
  });

  test('FAB appare dopo aver modificato un campo', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Modifica'));
    fireEvent.click(screen.getByText('Modifica'));
    const phoneInput = screen.getByDisplayValue('081 552 1234');
    fireEvent.change(phoneInput, { target: { value: '099 999 9999' } });
    expect(screen.getByText(/Salva \(1\)/)).toBeInTheDocument();
  });

  test('modifica due campi → FAB mostra (2)', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Modifica'));
    fireEvent.click(screen.getByText('Modifica'));
    fireEvent.change(screen.getByDisplayValue('081 552 1234'), { target: { value: '099 999 9999' } });
    fireEvent.change(screen.getByDisplayValue('rossi@test.it'), { target: { value: 'nuovo@email.it' } });
    expect(screen.getByText(/Salva \(2\)/)).toBeInTheDocument();
  });

  test('Annulla ripristina view mode e FAB sparisce', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Modifica'));
    fireEvent.click(screen.getByText('Modifica'));
    fireEvent.change(screen.getByDisplayValue('081 552 1234'), { target: { value: '099 999 9999' } });
    fireEvent.click(screen.getByText('Annulla modifiche'));
    expect(screen.queryByText(/Salva/)).toBeNull();
    expect(screen.queryByText(/Modalità modifica/)).toBeNull();
  });

  test('tap FAB chiama enqueueOperation una sola volta con tutti i campi', async () => {
    const { enqueueOperation } = await import('../api/operations');
    (enqueueOperation as ReturnType<typeof vi.fn>).mockClear();
    renderProfile();
    await waitFor(() => screen.getByText('Modifica'));
    fireEvent.click(screen.getByText('Modifica'));
    fireEvent.change(screen.getByDisplayValue('081 552 1234'), { target: { value: '099 111' } });
    fireEvent.change(screen.getByDisplayValue('rossi@test.it'), { target: { value: 'x@y.it' } });
    fireEvent.click(screen.getByText(/Salva \(2\)/));
    await waitFor(() => {
      expect(enqueueOperation).toHaveBeenCalledTimes(1);
      expect(enqueueOperation).toHaveBeenCalledWith('update-customer', expect.objectContaining({
        erpId: 'A001',
        phone: '099 111',
        email: 'x@y.it',
      }));
    });
  });
});
```

- [ ] **Step 2: Esegui i test per verificare che passano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage
```

Expected: PASS (16 test — 10 precedenti + 6 nuovi)

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx
git commit -m "test(customers): edit mode + FAB + singola chiamata update-customer"
```

---

## Task 5: Storico ordini section

Aggiunge la sezione storico ordini con filtri chip temporali, display righe ordine e navigazione a `/orders?highlight=`.

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx`

**Filtri disponibili e logica:**

```ts
type StoricoFilter = 'mese' | 'trimestre' | 'anno' | 'anno_prec' | 'tutto';

function filterOrders(orders: CustomerFullHistoryOrder[], filter: StoricoFilter): CustomerFullHistoryOrder[] {
  if (filter === 'tutto') return orders;
  const now = new Date();
  const year = now.getFullYear();
  return orders.filter(o => {
    const d = new Date(o.orderDate);
    if (filter === 'anno') return d.getFullYear() === year;
    if (filter === 'anno_prec') return d.getFullYear() === year - 1;
    const diffMs = now.getTime() - d.getTime();
    const DAY = 86_400_000;
    if (filter === 'mese') return diffMs < 30 * DAY;
    if (filter === 'trimestre') return diffMs < 90 * DAY;
    return true;
  });
}
```

- [ ] **Step 1: Aggiungi test per Storico**

```tsx
// Aggiunge a CustomerProfilePage.spec.tsx
import { getCustomerFullHistory } from '../api/customer-full-history';

describe('CustomerProfilePage — Storico ordini', () => {
  const currentYear = new Date().getFullYear();
  const mockOrders = [
    { orderId: 'ORD-1', orderNumber: '12345', orderDate: `${currentYear}-03-01`, totalAmount: 250.00, source: 'orders' as const, articles: [] },
    { orderId: 'ORD-2', orderNumber: '12300', orderDate: `${currentYear - 1}-06-15`, totalAmount: 180.50, source: 'orders' as const, articles: [] },
  ];

  beforeEach(() => {
    (getCustomerFullHistory as ReturnType<typeof vi.fn>).mockResolvedValue(mockOrders);
  });

  test('mostra ordini dell anno corrente per default', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('12345'));
    expect(screen.queryByText('12300')).toBeNull(); // anno scorso
  });

  test('chip "Anno scorso" mostra ordini anno precedente', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Anno scorso'));
    fireEvent.click(screen.getByText('Anno scorso'));
    await waitFor(() => expect(screen.getByText('12300')).toBeInTheDocument());
    expect(screen.queryByText('12345')).toBeNull();
  });

  test('chip "Tutto" mostra tutti gli ordini', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Tutto'));
    fireEvent.click(screen.getByText('Tutto'));
    await waitFor(() => {
      expect(screen.getByText('12345')).toBeInTheDocument();
      expect(screen.getByText('12300')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage
```

Expected: FAIL (la sezione storico non è ancora renderizzata)

- [ ] **Step 3: Aggiungi la sezione Storico nel profilo**

In `CustomerProfilePage`, aggiungi all'inizio delle variabili di stato:

```tsx
const [storicoFilter, setStoricoFilter] = useState<'mese' | 'trimestre' | 'anno' | 'anno_prec' | 'tutto'>('anno');
```

Poi aggiungi la funzione `filterOrders` (come mostrata sopra) prima del `return`.

Nel div delle sezioni, dopo `SectionCard "Anagrafica"`, aggiungi:

```tsx
{/* Storico ordini */}
<div id="storico-section" style={{ background: '#fff', borderRadius: 12, marginBottom: 10, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
  <div style={{ padding: '10px 14px 8px', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    Storico ordini
    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{filterOrders(orders, storicoFilter).length} ordini</span>
  </div>

  {/* Filtri chip */}
  <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px', flexWrap: 'wrap' }}>
    {([
      { key: 'mese', label: 'Questo mese' },
      { key: 'trimestre', label: 'Ultimi 3m' },
      { key: 'anno', label: 'Quest\'anno' },
      { key: 'anno_prec', label: 'Anno scorso' },
      { key: 'tutto', label: 'Tutto' },
    ] as const).map(({ key, label }) => (
      <button
        key={key}
        onClick={() => setStoricoFilter(key)}
        style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: storicoFilter === key ? 700 : 400, border: `1px solid ${storicoFilter === key ? '#2563eb' : '#e2e8f0'}`, background: storicoFilter === key ? '#eff6ff' : '#fff', color: storicoFilter === key ? '#1d4ed8' : '#64748b', cursor: 'pointer' }}
      >
        {label}
      </button>
    ))}
  </div>

  {/* Lista ordini */}
  {filterOrders(orders, storicoFilter).length === 0 ? (
    <div style={{ padding: '8px 14px 14px', fontSize: 12, color: '#94a3b8' }}>Nessun ordine nel periodo selezionato</div>
  ) : (
    filterOrders(orders, storicoFilter).map(o => (
      <div
        key={o.orderId}
        onClick={() => navigate(`/orders?highlight=${encodeURIComponent(o.orderId)}`)}
        style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderTop: '1px solid #f8fafc', cursor: 'pointer' }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>N° {o.orderNumber}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>{new Date(o.orderDate).toLocaleDateString('it-IT')}</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
          €{o.totalAmount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <span style={{ fontSize: 14, color: '#94a3b8', marginLeft: 8 }}>›</span>
      </div>
    ))
  )}
</div>
```

- [ ] **Step 4: Esegui i test per verificare che passano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage
```

Expected: PASS (19 test)

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx \
        archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx
git commit -m "feat(customers): storico ordini — filtri chip, anno corrente default, tap → /orders"
```

---

## Task 6: Indirizzi alternativi + AppRouter cleanup

Aggiunge la sezione indirizzi alternativi con lista + add + delete inline. Poi aggiorna AppRouter per usare `CustomerProfilePage` ed elimina i file vecchi.

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx`
- Modify: `archibald-web-app/frontend/src/AppRouter.tsx`
- Delete: `archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx`
- Delete: `archibald-web-app/frontend/src/components/CustomerSidebar.tsx`
- Delete: `archibald-web-app/frontend/src/components/CustomerInlineSection.tsx`

- [ ] **Step 1: Aggiungi test indirizzi**

```tsx
// Aggiunge a CustomerProfilePage.spec.tsx
import { addCustomerAddress, deleteCustomerAddress, getCustomerAddresses } from '../services/customer-addresses';

describe('CustomerProfilePage — indirizzi alternativi', () => {
  const mockAddresses = [
    { id: 1, erpId: 'A001', tipo: 'Consegna', nome: 'Magazzino Nord', via: 'Via Po 5', cap: '20100', citta: 'Milano', contea: null, stato: null, idRegione: null, contra: null },
  ];

  beforeEach(() => {
    (getCustomerAddresses as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddresses);
  });

  test('mostra l indirizzo alternativo', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Magazzino Nord'));
  });

  test('pulsante elimina chiama deleteCustomerAddress', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Magazzino Nord'));
    fireEvent.click(screen.getByRole('button', { name: /Elimina.*Magazzino Nord/ }));
    // Confirm inline
    fireEvent.click(screen.getByRole('button', { name: /Conferma/i }));
    await waitFor(() => expect(deleteCustomerAddress).toHaveBeenCalledWith('A001', 1));
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage
```

Expected: FAIL

- [ ] **Step 3: Aggiungi sezione indirizzi al profilo**

Aggiungi alla variabile di stato nella funzione `CustomerProfilePage`:

```tsx
const [deleteAddrConfirmId, setDeleteAddrConfirmId] = useState<number | null>(null);
const [addAddrForm, setAddAddrForm] = useState<AddressEntry | null>(null);
```

Nel div delle sezioni, dopo la sezione Storico, aggiungi:

```tsx
{/* Indirizzi alternativi */}
<div style={{ background: '#fff', borderRadius: 12, marginBottom: 10, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
  <div style={{ padding: '10px 14px 8px', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    Indirizzi alternativi
    <button
      onClick={() => setAddAddrForm({ tipo: 'Consegna' })}
      style={{ border: 'none', background: '#eff6ff', color: '#2563eb', borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
    >+ Aggiungi</button>
  </div>

  {addresses.length === 0 && !addAddrForm && (
    <div style={{ padding: '8px 14px 14px', fontSize: 12, color: '#94a3b8' }}>Nessun indirizzo alternativo</div>
  )}

  {addresses.map(addr => (
    <div key={addr.id} style={{ padding: '8px 14px', borderTop: '1px solid #f8fafc', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{addr.nome ?? addr.tipo}</div>
        <div style={{ fontSize: 10, color: '#64748b' }}>{[addr.via, addr.citta].filter(Boolean).join(', ')}</div>
      </div>
      {deleteAddrConfirmId === addr.id ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            aria-label={`Conferma eliminazione`}
            onClick={async () => {
              await deleteCustomerAddress(erpId, addr.id);
              setAddresses(prev => prev.filter(a => a.id !== addr.id));
              setDeleteAddrConfirmId(null);
            }}
            style={{ padding: '3px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
          >Conferma</button>
          <button onClick={() => setDeleteAddrConfirmId(null)} style={{ padding: '3px 8px', background: '#f1f5f9', border: 'none', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}>Annulla</button>
        </div>
      ) : (
        <button
          aria-label={`Elimina ${addr.nome ?? addr.tipo}`}
          onClick={() => setDeleteAddrConfirmId(addr.id)}
          style={{ padding: '3px 8px', background: '#fff', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}
        >Elimina</button>
      )}
    </div>
  ))}

  {addAddrForm && (
    <div style={{ padding: '10px 14px', borderTop: '1px solid #f8fafc', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(['via', 'citta', 'cap', 'nome'] as const).map(field => (
        <input
          key={field}
          placeholder={field === 'nome' ? 'Descrizione (es. Magazzino)' : field === 'via' ? 'Via' : field === 'citta' ? 'Città' : 'CAP'}
          value={(addAddrForm as Record<string, string>)[field] ?? ''}
          onChange={e => setAddAddrForm(prev => prev ? { ...prev, [field]: e.target.value } : prev)}
          style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', outline: 'none' }}
        />
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={async () => {
            const created = await addCustomerAddress(erpId, addAddrForm);
            setAddresses(prev => [...prev, created]);
            setAddAddrForm(null);
          }}
          style={{ padding: '5px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
        >Salva indirizzo</button>
        <button onClick={() => setAddAddrForm(null)} style={{ padding: '5px 12px', background: '#f1f5f9', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Annulla</button>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 4: Esegui i test per verificare che passano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage
```

Expected: PASS (21 test)

- [ ] **Step 5: Aggiorna AppRouter**

In `archibald-web-app/frontend/src/AppRouter.tsx`:

Aggiungi l'import:
```tsx
import { CustomerProfilePage } from './pages/CustomerProfilePage';
```

Rimuovi l'import:
```tsx
import { CustomerDetailPage } from './pages/CustomerDetailPage';
```

Nella Route `/customers/:erpId`, sostituisci `<CustomerDetailPage />` con `<CustomerProfilePage />`:

```tsx
<Route
  path="/customers/:erpId"
  element={
    <div className="app">
      <main className="app-main" style={{ padding: "0" }}>
        <CustomerProfilePage />
      </main>
      <footer className="app-footer">
        <p>v1.0.0 • Formicanera by Francesco Formicola</p>
      </footer>
    </div>
  }
/>
```

- [ ] **Step 6: Elimina i file vecchi**

```bash
rm archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx
rm archibald-web-app/frontend/src/components/CustomerSidebar.tsx
rm archibald-web-app/frontend/src/components/CustomerInlineSection.tsx
```

- [ ] **Step 7: Type-check e test completi**

```bash
npm run type-check --prefix archibald-web-app/frontend && npm test --prefix archibald-web-app/frontend
```

Se il type-check lancia errori per import non trovati (es. altri file che importavano `CustomerDetailPage`), trova e rimuovi/aggiorna quegli import:

```bash
grep -rn "CustomerDetailPage\|CustomerSidebar\|CustomerInlineSection" archibald-web-app/frontend/src/
```

Aggiorna o rimuovi ogni import trovato.

- [ ] **Step 8: Build backend (gate CI)**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: build green

- [ ] **Step 9: Commit finale**

```bash
git add -A
git commit -m "feat(customers): CustomerProfilePage completo — indirizzi alt, AppRouter, cleanup vecchi file"
```
