# CustomerDetailPage — Completamento Spec (Piano C3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completare la `CustomerDetailPage` con implementazioni reali per le 4 funzionalità rimaste come placeholder: Tab Ordini (lista ultimi 20 ordini), Tab Indirizzi alt. (CRUD completo), Tab Note interne (salvataggio in DB), Foto upload nella sidebar.

**Architecture:** Il backend aggiunge la colonna `agent_notes TEXT` in `agents.customers` (migration 038) e un endpoint `PATCH /api/customers/:profile/agent-notes`. Il frontend usa `getCustomerFullHistory` per gli ordini, il servizio `customer-addresses` (già esistente) per il CRUD indirizzi, e `customerService.uploadPhoto/deletePhoto/getPhotoUrl` per la foto. La foto viene caricata separatamente dal `Customer` object tramite uno stato dedicato in `CustomerDetailPage`.

**Tech Stack:** Backend: TypeScript strict, PostgreSQL, Express. Frontend: React 19, TypeScript strict, Vitest + Testing Library, inline styles esclusivamente. Test backend: `npm test --prefix archibald-web-app/backend`. Test frontend: `npm test --prefix archibald-web-app/frontend`.

---

## Mappa file

| File | Azione | Responsabilità |
|---|---|---|
| `backend/src/db/migrations/038-agent-notes.sql` | Crea | Aggiunge colonna `agent_notes TEXT` a `agents.customers` |
| `backend/src/db/repositories/customers.ts` | Modifica | Aggiunge `agentNotes` a `Customer` type, `CustomerRow`, `mapRowToCustomer`, `updateAgentNotes()` |
| `backend/src/routes/customers.ts` | Modifica | Aggiunge `updateAgentNotes` a deps + route `PATCH /:profile/agent-notes` |
| `backend/src/main.ts` o `server.ts` | Modifica | Wire `updateAgentNotes` nelle deps |
| `frontend/src/types/customer.ts` | Modifica | Aggiunge `agentNotes?: string \| null` |
| `frontend/src/pages/CustomerDetailPage.tsx` | Modifica | Sostituisce 3 placeholder con implementazioni complete + foto state |
| `frontend/src/components/CustomerSidebar.tsx` | Modifica | Aggiunge prop `photoUrl` + `onPhotoChange` + bottone 📷 upload/delete |

---

## Task 1: Backend — migration 038 + updateAgentNotes + route

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/038-agent-notes.sql`
- Modify: `archibald-web-app/backend/src/db/repositories/customers.ts`
- Modify: `archibald-web-app/backend/src/routes/customers.ts`
- Modify: `archibald-web-app/backend/src/main.ts` (o `server.ts` se i router vengono wirati lì)

- [ ] **Step 1.1: Creare migration 038**

Creare `archibald-web-app/backend/src/db/migrations/038-agent-notes.sql`:

```sql
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS agent_notes TEXT DEFAULT NULL;
```

- [ ] **Step 1.2: Aggiungere `agent_notes` a `CustomerRow` in `customers.ts`**

In `archibald-web-app/backend/src/db/repositories/customers.ts`, trovare il tipo `CustomerRow` (riga ~4) e aggiungere dopo `country: string | null;`:

```typescript
agent_notes: string | null;
```

- [ ] **Step 1.3: Aggiungere `agentNotes` al tipo `Customer`**

Nel tipo `Customer` (riga ~54), aggiungere dopo `country: string | null;`:

```typescript
agentNotes: string | null;
```

- [ ] **Step 1.4: Aggiornare `mapRowToCustomer`**

Nella funzione `mapRowToCustomer` (riga ~178), aggiungere dopo il mapping di `country`:

```typescript
agentNotes: row.agent_notes,
```

- [ ] **Step 1.5: Aggiungere `updateAgentNotes`**

Prima del blocco `export { ... }` in `customers.ts`, aggiungere:

```typescript
async function updateAgentNotes(
  pool: DbPool,
  userId: string,
  customerProfile: string,
  notes: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET agent_notes = $1, updated_at = NOW()
     WHERE customer_profile = $2 AND user_id = $3`,
    [notes, customerProfile, userId],
  );
}
```

Aggiungere `updateAgentNotes` al blocco `export { ... }`.

- [ ] **Step 1.6: Aggiungere test unitario per `updateAgentNotes`**

Verificare se esiste `archibald-web-app/backend/src/db/repositories/customers.spec.ts` — dovrebbe esistere dal Piano B. Aggiungere il test:

```typescript
describe('updateAgentNotes', () => {
  test('calls UPDATE with correct params', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    await updateAgentNotes(pool as never, 'user1', '55.261', 'Note test');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string, unknown[]]>;
    const updateCall = calls.find(([sql]) => sql.includes('agent_notes'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toEqual(['Note test', '55.261', 'user1']);
  });

  test('sets agent_notes to null when notes is null', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    await updateAgentNotes(pool as never, 'user1', '55.261', null);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string, unknown[]]>;
    const updateCall = calls.find(([sql]) => sql.includes('agent_notes'));
    expect(updateCall![1][0]).toBeNull();
  });
});
```

Aggiungere `updateAgentNotes` agli import del file spec.

- [ ] **Step 1.7: Eseguire i test backend**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/db/repositories/customers.spec.ts 2>&1 | tail -15
```

Atteso: test nuovi PASS + nessuna regressione.

- [ ] **Step 1.8: Aggiungere route in `customers.ts`**

In `archibald-web-app/backend/src/routes/customers.ts`, aggiungere a `CustomersRouterDeps`:

```typescript
updateAgentNotes?: (userId: string, customerProfile: string, notes: string | null) => Promise<void>;
```

Aggiungere la route PRIMA di altre route con `:customerProfile` per evitare conflitti:

```typescript
router.patch('/:customerProfile/agent-notes', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { customerProfile } = req.params;
    if (!deps.updateAgentNotes) {
      return res.status(503).json({ error: 'Agent notes not available' });
    }
    const body = req.body as { notes?: string | null };
    await deps.updateAgentNotes(userId, customerProfile, body.notes ?? null);
    res.json({ success: true });
  } catch (err) {
    logger.error('PATCH /customers/:customerProfile/agent-notes error', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 1.9: Wirare `updateAgentNotes` in main.ts (o server.ts)**

```bash
grep -n "createCustomersRouter\|updateAgentNotes\|getCustomerByProfile" archibald-web-app/backend/src/main.ts | head -10
```

Aggiungere alle deps passate a `createCustomersRouter`:

```typescript
updateAgentNotes: (userId, customerProfile, notes) =>
  updateAgentNotes(pool, userId, customerProfile, notes),
```

Importare `updateAgentNotes` dal repository.

- [ ] **Step 1.10: Build TypeScript backend**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -10
```

Atteso: nessun errore.

- [ ] **Step 1.11: Suite test backend completa**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -8
```

- [ ] **Step 1.12: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/038-agent-notes.sql \
        archibald-web-app/backend/src/db/repositories/customers.ts \
        archibald-web-app/backend/src/db/repositories/customers.spec.ts \
        archibald-web-app/backend/src/routes/customers.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(backend): agent_notes column, updateAgentNotes endpoint"
```

---

## Task 2: Frontend — aggiungere `agentNotes` al tipo Customer

**Files:**
- Modify: `archibald-web-app/frontend/src/types/customer.ts`

- [ ] **Step 2.1: Aggiungere il campo al tipo**

In `archibald-web-app/frontend/src/types/customer.ts`, aggiungere dopo `country: string | null;`:

```typescript
agentNotes?: string | null;
```

- [ ] **Step 2.2: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 2.3: Commit**

```bash
git add archibald-web-app/frontend/src/types/customer.ts
git commit -m "feat(types): add agentNotes to Customer type"
```

---

## Task 3: CustomerDetailPage — Tab Ordini (lista ultimi 20 ordini reali)

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx`

- [ ] **Step 3.1: Leggere le righe attuali del Tab Ordini nel CustomerDetailPage**

```bash
grep -n "activeTab.*ordini\|ordini.*activeTab\|Storico ordini\|actualOrderCount\|actualSales" archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx | head -10
```

Poi leggere il blocco completo del tab ordini:
```bash
sed -n '220,260p' archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx
```

- [ ] **Step 3.2: Aggiungere import**

In cima a `CustomerDetailPage.tsx`, aggiungere:

```typescript
import { getCustomerFullHistory } from '../api/customer-full-history';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
```

- [ ] **Step 3.3: Aggiungere stato per ordini**

Nel corpo del componente, dopo lo stato `activeTab`, aggiungere:

```typescript
const [orders, setOrders] = useState<CustomerFullHistoryOrder[]>([]);
const [ordersLoading, setOrdersLoading] = useState(false);
const [ordersError, setOrdersError] = useState<string | null>(null);
```

- [ ] **Step 3.4: Aggiungere caricamento ordini quando il tab ordini è attivo**

Aggiungere un `useEffect` che carica gli ordini la prima volta che il tab ordini è selezionato:

```typescript
useEffect(() => {
  if (activeTab !== 'ordini' || !customer) return;
  if (orders.length > 0 || ordersLoading) return; // già caricati
  setOrdersLoading(true);
  setOrdersError(null);
  getCustomerFullHistory({ customerProfileIds: [customer.customerProfile] })
    .then((data) => {
      setOrders(data.slice(0, 20)); // ultimi 20
    })
    .catch((e) => {
      setOrdersError(e instanceof Error ? e.message : 'Errore caricamento ordini');
    })
    .finally(() => setOrdersLoading(false));
}, [activeTab, customer, orders.length, ordersLoading]);
```

- [ ] **Step 3.5: Sostituire il placeholder del Tab Ordini con la lista reale**

Trovare il blocco `{activeTab === 'ordini' && (...)}` e sostituirlo con:

```tsx
{activeTab === 'ordini' && (
  <div>
    {/* Stats strip */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
      {([
        { label: 'Ordini totali',      value: String(customer.actualOrderCount ?? 0) },
        { label: 'Fatturato corrente', value: customer.actualSales ? `€ ${customer.actualSales.toLocaleString('it-IT')}` : '—' },
        { label: 'Ultima attività',    value: customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString('it-IT') : '—' },
      ] as const).map(({ label, value }) => (
        <div key={label} style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '7px', padding: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>{value}</div>
          <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: '2px' }}>{label}</div>
        </div>
      ))}
    </div>

    {/* Lista ordini */}
    {ordersLoading && (
      <div style={{ textAlign: 'center', padding: '24px', fontSize: '13px', color: '#64748b' }}>
        Caricamento ordini...
      </div>
    )}
    {ordersError && (
      <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px', fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>
        {ordersError}
      </div>
    )}
    {!ordersLoading && !ordersError && orders.length === 0 && (
      <div style={{ textAlign: 'center', padding: '24px', fontSize: '13px', color: '#94a3b8' }}>
        Nessun ordine trovato
      </div>
    )}
    {orders.length > 0 && (
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        {/* Header tabella */}
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 80px', gap: '0', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', padding: '8px 12px' }}>
          {(['Data', 'N° Ordine', 'Importo', 'Tipo'] as const).map((h) => (
            <div key={h} style={{ fontSize: '9px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</div>
          ))}
        </div>
        {/* Righe */}
        {orders.map((order) => (
          <div
            key={order.orderId}
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr 100px 80px',
              gap: '0',
              padding: '9px 12px',
              borderBottom: '1px solid #f1f5f9',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              {new Date(order.orderDate).toLocaleDateString('it-IT')}
            </div>
            <div style={{ fontSize: '11px', color: '#1e293b', fontWeight: 500 }}>
              {order.orderNumber || order.orderId.slice(0, 8)}
            </div>
            <div style={{ fontSize: '11px', color: '#1e293b', fontWeight: 600 }}>
              {order.totalAmount != null
                ? `€ ${order.totalAmount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—'}
            </div>
            <div>
              <span style={{
                fontSize: '9px', fontWeight: 700,
                padding: '2px 6px', borderRadius: '8px',
                background: order.source === 'fresis' ? '#eff6ff' : '#f0fdf4',
                color: order.source === 'fresis' ? '#2563eb' : '#16a34a',
              }}>
                {order.source === 'fresis' ? 'FT' : 'KT'}
              </span>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3.6: Type-check e suite test**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 3.7: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx
git commit -m "feat(detail-page): Tab Ordini — lista reale ultimi 20 ordini via getCustomerFullHistory"
```

---

## Task 4: CustomerDetailPage — Tab Indirizzi alt. (CRUD completo)

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx`

- [ ] **Step 4.1: Aggiungere imports per indirizzi**

In cima a `CustomerDetailPage.tsx`, aggiungere:

```typescript
import {
  getCustomerAddresses,
  addCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
} from '../services/customer-addresses';
import type { CustomerAddress } from '../types/customer-address';
import type { AddressEntry } from '../types/customer-form-data';
```

- [ ] **Step 4.2: Aggiungere stato per indirizzi**

Nel corpo del componente, dopo gli stati ordini:

```typescript
const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
const [addressesLoaded, setAddressesLoaded] = useState(false);
const [addrForm, setAddrForm] = useState<(AddressEntry & { id?: number }) | null>(null); // null = chiuso, obj = form aperto
const [addrSaving, setAddrSaving] = useState(false);
const [addrError, setAddrError] = useState<string | null>(null);
```

- [ ] **Step 4.3: Aggiungere caricamento indirizzi**

```typescript
useEffect(() => {
  if (activeTab !== 'indirizzi' || !customer || addressesLoaded) return;
  getCustomerAddresses(customer.customerProfile)
    .then((data) => { setAddresses(data); setAddressesLoaded(true); })
    .catch(() => setAddressesLoaded(true));
}, [activeTab, customer, addressesLoaded]);
```

- [ ] **Step 4.4: Aggiungere funzioni CRUD**

Nel corpo del componente (prima del return):

```typescript
const TIPO_OPTIONS = ['Consegna', 'Indir. cons. alt.', 'Fatturazione', 'Amministrativa'];

const handleAddrSave = async () => {
  if (!addrForm || !customer) return;
  setAddrSaving(true);
  setAddrError(null);
  try {
    const entry: AddressEntry = {
      tipo: addrForm.tipo,
      nome: addrForm.nome || undefined,
      via: addrForm.via || undefined,
      cap: addrForm.cap || undefined,
      citta: addrForm.citta || undefined,
      contea: addrForm.contea || undefined,
      stato: addrForm.stato || undefined,
      idRegione: addrForm.idRegione || undefined,
      contra: addrForm.contra || undefined,
    };
    if (addrForm.id !== undefined) {
      const updated = await updateCustomerAddress(customer.customerProfile, addrForm.id, entry);
      setAddresses((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } else {
      const created = await addCustomerAddress(customer.customerProfile, entry);
      setAddresses((prev) => [...prev, created]);
    }
    setAddrForm(null);
  } catch (e) {
    setAddrError(e instanceof Error ? e.message : 'Errore salvataggio');
  } finally {
    setAddrSaving(false);
  }
};

const handleAddrDelete = async (id: number) => {
  if (!customer) return;
  if (!window.confirm('Eliminare questo indirizzo?')) return;
  try {
    await deleteCustomerAddress(customer.customerProfile, id);
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  } catch (e) {
    setAddrError(e instanceof Error ? e.message : 'Errore eliminazione');
  }
};
```

- [ ] **Step 4.5: Sostituire il placeholder del Tab Indirizzi con il CRUD reale**

Trovare `{activeTab === 'indirizzi' && (...)}` e sostituire con:

```tsx
{activeTab === 'indirizzi' && (
  <div>
    {addrError && (
      <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: '6px', padding: '9px', fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>
        {addrError}
      </div>
    )}

    {/* Lista indirizzi */}
    {addresses.length === 0 && !addrForm && (
      <div style={{ textAlign: 'center', padding: '24px', fontSize: '13px', color: '#94a3b8' }}>
        Nessun indirizzo alternativo
      </div>
    )}
    {addresses.map((addr) => (
      <div key={addr.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: '10px', fontWeight: 700, background: '#eff6ff', color: '#2563eb', padding: '1px 7px', borderRadius: '8px', marginRight: '8px' }}>{addr.tipo}</span>
          <span style={{ fontSize: '11px', color: '#1e293b', fontWeight: 500 }}>
            {[addr.via, addr.cap, addr.citta].filter(Boolean).join(', ') || '—'}
          </span>
          {addr.nome && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>c/o {addr.nome}</div>}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={() => setAddrForm({ ...addr })}
            style={{ fontSize: '10px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✏
          </button>
          <button
            onClick={() => void handleAddrDelete(addr.id)}
            style={{ fontSize: '10px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            🗑
          </button>
        </div>
      </div>
    ))}

    {/* Form aggiungi/modifica */}
    {addrForm ? (
      <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '8px', padding: '14px', marginBottom: '8px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', marginBottom: '10px' }}>
          {addrForm.id !== undefined ? '✎ Modifica indirizzo' : '+ Nuovo indirizzo'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {/* Tipo */}
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', fontSize: '9px', color: '#374151', fontWeight: 600, marginBottom: '3px' }}>Tipo *</label>
            <select
              value={addrForm.tipo}
              onChange={(e) => setAddrForm((f) => f ? { ...f, tipo: e.target.value } : f)}
              style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #d1d5db', borderRadius: '5px', fontSize: '12px' }}
            >
              {TIPO_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {/* Nome */}
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', fontSize: '9px', color: '#374151', fontWeight: 600, marginBottom: '3px' }}>c/o (nome)</label>
            <input type="text" value={addrForm.nome ?? ''} onChange={(e) => setAddrForm((f) => f ? { ...f, nome: e.target.value } : f)}
              style={{ width: '100%', padding: '5px 8px', border: '1.5px solid #d1d5db', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' }} />
          </div>
          {/* Via */}
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', fontSize: '9px', color: '#374151', fontWeight: 600, marginBottom: '3px' }}>Via</label>
            <input type="text" value={addrForm.via ?? ''} onChange={(e) => setAddrForm((f) => f ? { ...f, via: e.target.value } : f)}
              style={{ width: '100%', padding: '5px 8px', border: '1.5px solid #d1d5db', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' }} />
          </div>
          {/* CAP */}
          <div>
            <label style={{ display: 'block', fontSize: '9px', color: '#374151', fontWeight: 600, marginBottom: '3px' }}>CAP</label>
            <input type="text" value={addrForm.cap ?? ''} onChange={(e) => setAddrForm((f) => f ? { ...f, cap: e.target.value } : f)}
              style={{ width: '100%', padding: '5px 8px', border: '1.5px solid #d1d5db', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' }} />
          </div>
          {/* Città */}
          <div>
            <label style={{ display: 'block', fontSize: '9px', color: '#374151', fontWeight: 600, marginBottom: '3px' }}>Città</label>
            <input type="text" value={addrForm.citta ?? ''} onChange={(e) => setAddrForm((f) => f ? { ...f, citta: e.target.value } : f)}
              style={{ width: '100%', padding: '5px 8px', border: '1.5px solid #d1d5db', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' }} />
          </div>
        </div>
        {addrError && (
          <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '6px' }}>{addrError}</div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button onClick={() => { setAddrForm(null); setAddrError(null); }}
            style={{ fontSize: '11px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
            Annulla
          </button>
          <button onClick={() => void handleAddrSave()} disabled={addrSaving}
            style={{ fontSize: '11px', fontWeight: 700, color: 'white', background: addrSaving ? '#93c5fd' : '#2563eb', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: addrSaving ? 'not-allowed' : 'pointer' }}>
            {addrSaving ? 'Salvataggio...' : 'Salva indirizzo'}
          </button>
        </div>
      </div>
    ) : (
      <button
        onClick={() => setAddrForm({ tipo: 'Consegna' })}
        style={{ fontSize: '12px', color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '7px 14px', cursor: 'pointer', marginTop: '4px' }}
      >
        + Aggiungi indirizzo
      </button>
    )}
  </div>
)}
```

- [ ] **Step 4.6: Type-check e suite**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 4.7: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx
git commit -m "feat(detail-page): Tab Indirizzi — CRUD completo indirizzi alternativi"
```

---

## Task 5: CustomerDetailPage — Tab Note interne (salvataggio reale in DB)

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx`

- [ ] **Step 5.1: Aggiungere stato per note interne**

Nel corpo del componente, aggiungere:

```typescript
const [agentNotes, setAgentNotes] = useState<string>('');
const [notesSaving, setNotesSaving] = useState(false);
const [notesSaved, setNotesSaved] = useState(false);
const [notesError, setNotesError] = useState<string | null>(null);
```

- [ ] **Step 5.2: Sincronizzare le note con il customer caricato**

Aggiungere un `useEffect` che inizializza le note quando il customer viene caricato:

```typescript
useEffect(() => {
  if (customer) {
    setAgentNotes(customer.agentNotes ?? '');
    setNotesSaved(false);
  }
}, [customer]);
```

- [ ] **Step 5.3: Aggiungere funzione di salvataggio**

```typescript
const handleSaveNotes = async () => {
  if (!customer) return;
  setNotesSaving(true);
  setNotesError(null);
  setNotesSaved(false);
  try {
    const jwt = localStorage.getItem('archibald_jwt') ?? '';
    const res = await fetch(
      `/api/customers/${encodeURIComponent(customer.customerProfile)}/agent-notes`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ notes: agentNotes || null }),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 3000);
  } catch (e) {
    setNotesError(e instanceof Error ? e.message : 'Errore salvataggio note');
  } finally {
    setNotesSaving(false);
  }
};
```

- [ ] **Step 5.4: Sostituire il placeholder del Tab Note con l'implementazione reale**

Trovare `{activeTab === 'note' && (...)}` e sostituire con:

```tsx
{activeTab === 'note' && (
  <div>
    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
      Note private sull'agente — visibili solo a te, non sincronizzate con Archibald ERP.
    </div>
    <textarea
      value={agentNotes}
      onChange={(e) => { setAgentNotes(e.target.value); setNotesSaved(false); }}
      disabled={notesSaving}
      placeholder="Es: preferisce ordini mattutini, contatto: Mario Bianchi..."
      rows={10}
      style={{
        width: '100%', padding: '10px 12px',
        border: '1.5px solid #d1d5db', borderRadius: '7px',
        fontSize: '13px', resize: 'vertical', boxSizing: 'border-box',
        background: notesSaving ? '#f9fafb' : 'white',
      }}
    />
    {notesError && (
      <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '6px' }}>{notesError}</div>
    )}
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
      <button
        onClick={() => void handleSaveNotes()}
        disabled={notesSaving}
        style={{
          padding: '8px 18px', background: notesSaving ? '#93c5fd' : '#2563eb',
          color: 'white', border: 'none', borderRadius: '7px',
          fontSize: '13px', fontWeight: 700, cursor: notesSaving ? 'not-allowed' : 'pointer',
        }}
      >
        {notesSaving ? 'Salvataggio...' : 'Salva note'}
      </button>
      {notesSaved && (
        <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>✓ Note salvate</span>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 5.5: Type-check e suite**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 5.6: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx
git commit -m "feat(detail-page): Tab Note interne — salvataggio reale via PATCH /agent-notes"
```

---

## Task 6: CustomerSidebar — Foto upload/delete + CustomerDetailPage foto state

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerSidebar.tsx`
- Modify: `archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx`

- [ ] **Step 6.1: Aggiungere import customerService in CustomerSidebar**

In cima a `CustomerSidebar.tsx`, aggiungere:

```typescript
import { customerService } from '../services/customers.service';
import { useRef, useState } from 'react';
```

Se `useRef` e `useState` non sono già importati da 'react', aggiungerli.

- [ ] **Step 6.2: Aggiungere nuove props a CustomerSidebarProps**

Nell'interfaccia `CustomerSidebarProps`, aggiungere:

```typescript
photoUrl?: string | null;      // data URI della foto (caricato separatamente)
onPhotoChange?: () => void;    // callback dopo upload/delete (ri-carica la foto)
```

E nel destructuring della funzione:
```typescript
photoUrl,
onPhotoChange,
```

- [ ] **Step 6.3: Aggiungere stato locale e ref per l'upload**

Nel corpo della funzione `CustomerSidebar` (dopo `if (window.innerWidth < 641) return null;`):

```typescript
const fileInputRef = useRef<HTMLInputElement>(null);
const [photoUploading, setPhotoUploading] = useState(false);

const handlePhotoClick = () => {
  if (!photoUploading) fileInputRef.current?.click();
};

const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = ''; // reset input per permettere re-upload stesso file
  setPhotoUploading(true);
  try {
    await customerService.uploadPhoto(customer.customerProfile, file);
    onPhotoChange?.();
  } catch {
    // silenzioso — l'utente riprova
  } finally {
    setPhotoUploading(false);
  }
};

const handlePhotoDelete = async () => {
  if (!window.confirm('Rimuovere la foto?')) return;
  setPhotoUploading(true);
  try {
    await customerService.deletePhoto(customer.customerProfile);
    onPhotoChange?.();
  } catch {
    // silenzioso
  } finally {
    setPhotoUploading(false);
  }
};
```

- [ ] **Step 6.4: Aggiornare il rendering avatar per usare `photoUrl` e mostrare il bottone 📷**

Trovare il blocco che renderizza la foto/iniziali (il `div` con le iniziali o l'`img`) e sostituirlo con:

```tsx
{/* Input file nascosto */}
<input
  ref={fileInputRef}
  type="file"
  accept="image/*"
  onChange={(e) => void handleFileSelected(e)}
  style={{ display: 'none' }}
/>

{/* Avatar cliccabile */}
<div
  style={{ position: 'relative', width: '52px', height: '52px', margin: '0 auto 8px', cursor: 'pointer' }}
  onClick={handlePhotoClick}
  title={photoUrl ? 'Cambia foto' : 'Aggiungi foto'}
>
  {photoUrl ? (
    <img
      src={photoUrl}
      alt={customer.name}
      style={{ width: '52px', height: '52px', borderRadius: '10px', objectFit: 'cover', border: '2px solid #4a90d9', display: 'block' }}
    />
  ) : (
    <div style={{
      width: '52px', height: '52px', borderRadius: '10px',
      background: '#2d4a6b', border: '2px solid #4a90d9',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, color: '#93c5fd', fontSize: '18px',
    }}>
      {getInitials(customer.name)}
    </div>
  )}
  {/* Overlay 📷 */}
  <div style={{
    position: 'absolute', bottom: '2px', right: '2px',
    background: 'rgba(15,23,42,0.75)', borderRadius: '50%',
    width: '18px', height: '18px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '9px',
  }}>
    {photoUploading ? '⏳' : '📷'}
  </div>
</div>

{/* Bottone elimina foto (solo se c'è una foto) */}
{photoUrl && !photoUploading && (
  <button
    onClick={(e) => { e.stopPropagation(); void handlePhotoDelete(); }}
    style={{ fontSize: '9px', color: '#fca5a5', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '4px' }}
  >
    × Rimuovi foto
  </button>
)}
```

- [ ] **Step 6.5: Aggiungere stato foto in CustomerDetailPage**

In `CustomerDetailPage.tsx`, aggiungere stati per la foto:

```typescript
const [photoUrl, setPhotoUrl] = useState<string | null>(null);
const [photoLoading, setPhotoLoading] = useState(false);
```

Aggiungere import:

```typescript
import { customerService } from '../services/customers.service';
```

Aggiungere useEffect per caricare la foto:

```typescript
// `customerProfile` è già estratto da useParams in cima al componente:
// const { customerProfile } = useParams<{ customerProfile: string }>();
useEffect(() => {
  if (!customerProfile) return;
  setPhotoLoading(true);
  customerService.getPhotoUrl(customerProfile)
    .then((url) => setPhotoUrl(url ?? null))
    .catch(() => setPhotoUrl(null))
    .finally(() => setPhotoLoading(false));
}, [customerProfile]);

// `customerProfile` viene da useParams (già estratto in cima al componente)
const refreshPhoto = useCallback(() => {
  if (!customerProfile) return;
  customerService.getPhotoUrl(customerProfile)
    .then((url) => setPhotoUrl(url ?? null))
    .catch(() => setPhotoUrl(null));
}, [customerProfile]);
```

- [ ] **Step 6.6: Passare `photoUrl` e `onPhotoChange` a CustomerSidebar**

Trovare il `<CustomerSidebar ...>` in CustomerDetailPage e aggiungere le props:

```tsx
<CustomerSidebar
  customer={customer}
  onNewOrder={() => navigate('/')}
  photoUrl={photoUrl}
  onPhotoChange={refreshPhoto}
/>
```

- [ ] **Step 6.7: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

- [ ] **Step 6.8: Suite completa**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -6
```

- [ ] **Step 6.9: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerSidebar.tsx \
        archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx
git commit -m "feat(sidebar): foto upload/delete con anteprima; CustomerDetailPage carica foto separatamente"
```

---

## Verifica finale Piano C3

- [ ] **Build backend pulito**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

- [ ] **Test backend completi**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -6
```

- [ ] **Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Test frontend completi**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -6
```
