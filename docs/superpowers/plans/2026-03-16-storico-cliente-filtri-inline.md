# Filtri Inline Storico Cliente — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere due select dropdown (cliente/sottocliente e città) nella barra di ricerca del modal `CustomerHistoryModal`, per filtrare client-side gli ordini già caricati.

**Architecture:** Modifica front-end pura a un solo componente. Aggiunta di due nuovi `useState`, due `useMemo` per le opzioni dei dropdown, estensione del `useMemo` `filteredOrders` esistente, aggiornamento dei contatori per usare `filteredOrders`, aggiunta dei `<select>` nella filter bar.

**Tech Stack:** React 19, TypeScript strict, inline styles, Vitest + Testing Library

---

## Chunk 1: Tests + Implementation

### Task 1: Aggiungi i test failing

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.spec.tsx`

- [ ] **Step 1.1 — Aggiungi i test nella describe esistente**

Apri `archibald-web-app/frontend/src/components/CustomerHistoryModal.spec.tsx` e aggiungi questi casi alla fine del `describe('CustomerHistoryModal', ...)`, dopo il test esistente `'shows — in listino columns...'`:

```typescript
  it('filters orders by customerProfileId when client dropdown is changed', async () => {
    const orderA = mockOrder({ orderId: 'A', orderNumber: 'OF-A', customerProfileId: 'PROF-A', customerRagioneSociale: 'Rossi SRL' });
    const orderB = mockOrder({ orderId: 'B', orderNumber: 'OF-B', customerProfileId: 'PROF-B', customerRagioneSociale: 'Bianchi SPA' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([orderA, orderB]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-A');
    await screen.findByText('OF-B');

    const clientSelect = screen.getByRole('combobox', { name: /filtra per cliente/i });
    fireEvent.change(clientSelect, { target: { value: 'customer:PROF-A' } });

    expect(screen.getByText('OF-A')).toBeDefined();
    expect(screen.queryByText('OF-B')).toBeNull();
  });

  it('filters orders by subClientCodice when client dropdown is changed', async () => {
    const orderA = mockOrder({ orderId: 'A', orderNumber: 'OF-A', subClientCodice: 'SC-1', subClientRagioneSociale: 'Sub Uno' });
    const orderB = mockOrder({ orderId: 'B', orderNumber: 'OF-B', subClientCodice: 'SC-2', subClientRagioneSociale: 'Sub Due' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([orderA, orderB]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-A');

    const clientSelect = screen.getByRole('combobox', { name: /filtra per cliente/i });
    fireEvent.change(clientSelect, { target: { value: 'subclient:SC-1' } });

    expect(screen.getByText('OF-A')).toBeDefined();
    expect(screen.queryByText('OF-B')).toBeNull();
  });

  it('filters orders by customerCity when city dropdown is changed', async () => {
    const orderMi = mockOrder({ orderId: 'MI', orderNumber: 'OF-MI', customerCity: 'Milano' });
    const orderRo = mockOrder({ orderId: 'RO', orderNumber: 'OF-RO', customerCity: 'Roma' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([orderMi, orderRo]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-MI');

    const citySelect = screen.getByRole('combobox', { name: /filtra per città/i });
    fireEvent.change(citySelect, { target: { value: 'Milano' } });

    expect(screen.getByText('OF-MI')).toBeDefined();
    expect(screen.queryByText('OF-RO')).toBeNull();
  });

  it('includes order when subClientCity matches city filter even if customerCity does not', async () => {
    const order = mockOrder({ orderId: 'X', orderNumber: 'OF-X', customerCity: 'Roma', subClientCity: 'Milano' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([order]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-X');

    const citySelect = screen.getByRole('combobox', { name: /filtra per città/i });
    fireEvent.change(citySelect, { target: { value: 'Milano' } });

    expect(screen.getByText('OF-X')).toBeDefined();
  });

  it('applies client and city filters with AND logic', async () => {
    const orderAMi = mockOrder({ orderId: '1', orderNumber: 'OF-A-MI', customerProfileId: 'PROF-A', customerCity: 'Milano' });
    const orderARo = mockOrder({ orderId: '2', orderNumber: 'OF-A-RO', customerProfileId: 'PROF-A', customerCity: 'Roma' });
    const orderBMi = mockOrder({ orderId: '3', orderNumber: 'OF-B-MI', customerProfileId: 'PROF-B', customerCity: 'Milano' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([orderAMi, orderARo, orderBMi]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-A-MI');

    fireEvent.change(screen.getByRole('combobox', { name: /filtra per cliente/i }), { target: { value: 'customer:PROF-A' } });
    fireEvent.change(screen.getByRole('combobox', { name: /filtra per città/i }), { target: { value: 'Milano' } });

    expect(screen.getByText('OF-A-MI')).toBeDefined();
    expect(screen.queryByText('OF-A-RO')).toBeNull();
    expect(screen.queryByText('OF-B-MI')).toBeNull();
  });

  it('resets client and city filters when modal is closed and reopened', async () => {
    const orderA = mockOrder({ orderId: 'A', orderNumber: 'OF-A', customerProfileId: 'PROF-A', customerRagioneSociale: 'Rossi SRL' });
    const orderB = mockOrder({ orderId: 'B', orderNumber: 'OF-B', customerProfileId: 'PROF-B', customerRagioneSociale: 'Bianchi SPA' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([orderA, orderB]);

    const { rerender } = render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-A');

    fireEvent.change(screen.getByRole('combobox', { name: /filtra per cliente/i }), { target: { value: 'customer:PROF-A' } });
    expect(screen.queryByText('OF-B')).toBeNull();

    rerender(<CustomerHistoryModal {...defaultProps} isOpen={false} />);
    rerender(<CustomerHistoryModal {...defaultProps} isOpen={true} />);

    await screen.findByText('OF-B');
    expect((screen.getByRole('combobox', { name: /filtra per cliente/i }) as HTMLSelectElement).value).toBe('');
    expect(screen.getByText('OF-A')).toBeDefined();
    expect(screen.getByText('OF-B')).toBeDefined();
  });

  it('shows order with no customerProfileId and no subClientCodice only when client filter is empty', async () => {
    const orderWithClient = mockOrder({ orderId: 'A', orderNumber: 'OF-A', customerProfileId: 'PROF-A' });
    const orderNoClient = mockOrder({ orderId: 'B', orderNumber: 'OF-B' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([orderWithClient, orderNoClient]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-A');
    await screen.findByText('OF-B');

    fireEvent.change(screen.getByRole('combobox', { name: /filtra per cliente/i }), { target: { value: 'customer:PROF-A' } });

    expect(screen.getByText('OF-A')).toBeDefined();
    expect(screen.queryByText('OF-B')).toBeNull();
  });

  it('shows each city only once in the city dropdown when multiple orders share the same city', async () => {
    const city = 'Milano';
    const order1 = mockOrder({ orderId: '1', orderNumber: 'OF-1', customerCity: city });
    const order2 = mockOrder({ orderId: '2', orderNumber: 'OF-2', customerCity: city });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([order1, order2]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-1');

    const citySelect = screen.getByRole('combobox', { name: /filtra per città/i });
    const milanOptions = Array.from((citySelect as HTMLSelectElement).querySelectorAll('option')).filter((o) => o.value === city);
    expect(milanOptions).toHaveLength(1);
  });
```

- [ ] **Step 1.2 — Verifica che il file compili correttamente**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: errore `Cannot find 'combobox'` o simili (i select non esistono ancora) oppure passa. Va bene in entrambi i casi — l'importante è che non ci siano errori di sintassi TypeScript.

---

### Task 2: Esegui i test per confermare che falliscono

**Files:**
- Read only: `archibald-web-app/frontend/src/components/CustomerHistoryModal.spec.tsx`

- [ ] **Step 2.1 — Esegui solo i test di questo componente**

```bash
npm test --prefix archibald-web-app/frontend -- --run CustomerHistoryModal
```

Atteso: i nuovi 8 test falliscono con errori tipo `Unable to find role="combobox"` o `Unable to find an element with the text: OF-B`. I test precedenti devono continuare a passare.

---

### Task 3: Aggiungi state e reset useEffect

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx` (linee 28-50)

- [ ] **Step 3.1 — Aggiungi i due nuovi useState dopo lo state `searchQuery` esistente (linea 31)**

Trova:
```typescript
  const [searchQuery, setSearchQuery] = useState('');
```

Sostituisci con:
```typescript
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientFilter, setSelectedClientFilter] = useState('');
  const [selectedCityFilter, setSelectedCityFilter] = useState('');
```

- [ ] **Step 3.2 — Aggiungi il useEffect per il reset dopo la riga dei serializzatori (dopo la linea 50 circa)**

Trova:
```typescript
  // Serializzato per evitare re-render infiniti con array come dipendenze
  const profileIdsKey = customerProfileIds.join(',');
  const subClientCodicesKey = subClientCodices.join(',');

  useEffect(() => {
    if (!isOpen) return;
```

Sostituisci con:
```typescript
  // Serializzato per evitare re-render infiniti con array come dipendenze
  const profileIdsKey = customerProfileIds.join(',');
  const subClientCodicesKey = subClientCodices.join(',');

  useEffect(() => {
    if (!isOpen) {
      setSelectedClientFilter('');
      setSelectedCityFilter('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
```

---

### Task 4: Aggiungi useMemo per le opzioni dei dropdown

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx` (dopo linea 94, prima di `filteredOrders`)

- [ ] **Step 4.1 — Aggiungi `clientOptions` e `cityOptions` subito prima del `filteredOrders` useMemo**

Trova:
```typescript
  const filteredOrders = useMemo(() => {
```

Inserisci prima:
```typescript
  const clientOptions = useMemo(() => {
    const customers = new Map<string, string>();
    const subClients = new Map<string, string>();
    orders.forEach((o) => {
      if (o.customerProfileId)
        customers.set(o.customerProfileId, o.customerRagioneSociale ?? o.customerProfileId);
      if (o.subClientCodice)
        subClients.set(o.subClientCodice, o.subClientRagioneSociale ?? o.subClientCodice);
    });
    const sortedCustomers = [...customers.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const sortedSubClients = [...subClients.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    return { sortedCustomers, sortedSubClients };
  }, [orders]);

  const cityOptions = useMemo(() => {
    const cities = new Set<string>();
    orders.forEach((o) => {
      if (o.customerCity) cities.add(o.customerCity);
      if (o.subClientCity) cities.add(o.subClientCity);
    });
    return [...cities].sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const filteredOrders = useMemo(() => {
```

---

### Task 5: Estendi il filteredOrders useMemo

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx` (linee 96-110)

- [ ] **Step 5.1 — Sostituisci il corpo del `filteredOrders` useMemo**

Trova l'intero blocco:
```typescript
  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return orders;
    return orders
      .map((order) => {
        if (order.orderNumber.toLowerCase().includes(q)) return order;
        const matched = order.articles.filter(
          (a) =>
            a.articleCode.toLowerCase().includes(q) ||
            a.articleDescription.toLowerCase().includes(q),
        );
        return matched.length > 0 ? { ...order, articles: matched } : null;
      })
      .filter((o): o is CustomerFullHistoryOrder => o !== null);
  }, [orders, searchQuery]);
```

Sostituisci con:
```typescript
  const filteredOrders = useMemo(() => {
    return orders
      .map((order) => {
        const matchesClient =
          selectedClientFilter === '' ||
          (selectedClientFilter.startsWith('customer:') &&
            order.customerProfileId === selectedClientFilter.slice('customer:'.length)) ||
          (selectedClientFilter.startsWith('subclient:') &&
            order.subClientCodice === selectedClientFilter.slice('subclient:'.length));
        if (!matchesClient) return null;

        const matchesCity =
          selectedCityFilter === '' ||
          order.customerCity === selectedCityFilter ||
          order.subClientCity === selectedCityFilter;
        if (!matchesCity) return null;

        const q = searchQuery.toLowerCase();
        if (!q) return order;
        if (order.orderNumber.toLowerCase().includes(q)) return order;
        const matched = order.articles.filter(
          (a) =>
            a.articleCode.toLowerCase().includes(q) ||
            a.articleDescription.toLowerCase().includes(q),
        );
        return matched.length > 0 ? { ...order, articles: matched } : null;
      })
      .filter((o): o is CustomerFullHistoryOrder => o !== null);
  }, [orders, searchQuery, selectedClientFilter, selectedCityFilter]);
```

---

### Task 6: Aggiorna i contatori per usare filteredOrders

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx` (linee 226-227 e 307)

- [ ] **Step 6.1 — Cambia ordersCount e fresisCount**

Trova:
```typescript
  const ordersCount = orders.filter((o) => o.source === 'orders').length;
  const fresisCount = orders.filter((o) => o.source === 'fresis').length;
```

Sostituisci con:
```typescript
  const ordersCount = filteredOrders.filter((o) => o.source === 'orders').length;
  const fresisCount = filteredOrders.filter((o) => o.source === 'fresis').length;
```

- [ ] **Step 6.2 — Cambia il contatore inline nella filter bar**

Trova:
```typescript
            <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
              {orders.length} ordini · {orders.reduce((s, o) => s + o.articles.length, 0)} articoli
            </span>
```

Sostituisci con:
```typescript
            <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
              {filteredOrders.length} ordini · {filteredOrders.reduce((s, o) => s + o.articles.length, 0)} articoli
            </span>
```

---

### Task 7: Aggiungi i dropdown nella filter bar

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx` (filter bar, dopo l'input di ricerca)

- [ ] **Step 7.1 — Aggiungi i due select dopo l'input di ricerca**

Trova nella filter bar:
```typescript
            <input
              type="text"
              placeholder="Cerca articolo, codice, numero ordine..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1, minWidth: 0, padding: '8px 12px',
                border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
              }}
            />
            <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#e0e7ff', color: '#4338ca', whiteSpace: 'nowrap' }}>
```

Sostituisci con:
```typescript
            <input
              type="text"
              placeholder="Cerca articolo, codice, numero ordine..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1, minWidth: 0, padding: '8px 12px',
                border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
              }}
            />
            <select
              aria-label="Filtra per cliente o sottocliente"
              value={selectedClientFilter}
              onChange={(e) => setSelectedClientFilter(e.target.value)}
              style={{
                padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6,
                fontSize: 13, background: 'white', cursor: 'pointer',
                color: selectedClientFilter ? '#1e293b' : '#94a3b8',
                maxWidth: 200, minWidth: 0,
              }}
            >
              <option value="">Tutti i clienti/sottoclienti</option>
              {clientOptions.sortedCustomers.length > 0 && (
                <optgroup label="Clienti">
                  {clientOptions.sortedCustomers.map(([id, name]) => (
                    <option key={id} value={`customer:${id}`}>{id} — {name}</option>
                  ))}
                </optgroup>
              )}
              {clientOptions.sortedSubClients.length > 0 && (
                <optgroup label="Sottoclienti">
                  {clientOptions.sortedSubClients.map(([cod, name]) => (
                    <option key={cod} value={`subclient:${cod}`}>{cod} — {name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <select
              aria-label="Filtra per città"
              value={selectedCityFilter}
              onChange={(e) => setSelectedCityFilter(e.target.value)}
              style={{
                padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6,
                fontSize: 13, background: 'white', cursor: 'pointer',
                color: selectedCityFilter ? '#1e293b' : '#94a3b8',
                maxWidth: 160, minWidth: 0,
              }}
            >
              <option value="">Tutte le città</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
            <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#e0e7ff', color: '#4338ca', whiteSpace: 'nowrap' }}>
```

---

### Task 8: Verifica type-check, test e commit

**Files:**
- Read: output dei comandi

- [ ] **Step 8.1 — Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: nessun errore TypeScript.

- [ ] **Step 8.2 — Esegui tutti i test del componente**

```bash
npm test --prefix archibald-web-app/frontend -- --run CustomerHistoryModal
```

Atteso: tutti i test passano (inclusi i nuovi 8 e i precedenti 10).

- [ ] **Step 8.3 — Esegui la suite completa per escludere regressioni**

```bash
npm test --prefix archibald-web-app/frontend -- --run
```

Atteso: nessun test rotto.

- [ ] **Step 8.4 — Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx \
        archibald-web-app/frontend/src/components/CustomerHistoryModal.spec.tsx
git commit -m "feat(storico): add inline client/subclient and city filters to CustomerHistoryModal"
```
