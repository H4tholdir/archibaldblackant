# Design: Filtri inline nello storico cliente

**Data:** 2026-03-16
**Scope:** Frontend-only — solo `CustomerHistoryModal.tsx`

---

## Contesto

Il modal `CustomerHistoryModal` mostra lo storico ordini di uno o più clienti/sottoclienti durante la creazione di un ordine. Attualmente dispone di una sola barra di ricerca testuale (per numero ordine, codice articolo, descrizione). Quando il modal aggrega ordini di più clienti o sottoclienti, l'utente non ha modo di isolare rapidamente gli ordini di un cliente specifico o di una determinata città.

---

## Obiettivo

Aggiungere due select dropdown inline accanto alla barra di ricerca, per filtrare gli ordini per:
1. Codice cliente o sottocliente
2. Città (del cliente o del sottocliente)

---

## UI

```
[ 🔍 Cerca articolo, codice, ordine... ] [ 👤 Tutti i clienti/sottoclienti ▾ ] [ 🏙️ Tutte le città ▾ ]
```

Tutti e tre gli elementi sono sulla stessa riga, con la barra di ricerca flessibile che occupa lo spazio rimanente.

---

## Dropdown 1 — Cliente / Sottocliente

- Elemento: `<select>`
- Prima opzione (valore `""`): `Tutti i clienti/sottoclienti` — azzera il filtro
- Opzioni raggruppate con `<optgroup>`:
  - Gruppo **Clienti** — voci con `customerProfileId` presenti negli ordini caricati
    - Formato: `{customerProfileId} — {customerRagioneSociale}`
    - Valore: `customer:{customerProfileId}`
  - Gruppo **Sottoclienti** — voci con `subClientCodice` presenti negli ordini caricati
    - Formato: `{subClientCodice} — {subClientRagioneSociale}`
    - Valore: `subclient:{subClientCodice}`
- Il gruppo viene omesso se non ci sono voci di quel tipo negli ordini caricati
- Le opzioni sono ordinate alfabeticamente per ragione sociale all'interno di ogni gruppo

**Logica di match per un ordine:**
```
selectedClientFilter === "" → passa
selectedClientFilter === "customer:{id}" → ordine.customerProfileId === id
selectedClientFilter === "subclient:{cod}" → ordine.subClientCodice === cod
```

---

## Dropdown 2 — Città

- Elemento: `<select>`
- Prima opzione (valore `""`): `Tutte le città` — azzera il filtro
- Opzioni: città uniche estratte dall'unione di `customerCity` e `subClientCity` di tutti gli ordini caricati, ordinate alfabeticamente, con valori vuoti esclusi

**Logica di match per un ordine (OR):**
```
selectedCityFilter === "" → passa
ordine.customerCity === selectedCityFilter OR ordine.subClientCity === selectedCityFilter
```

---

## Logica di filtro complessiva

I tre filtri si combinano con **AND**:

```typescript
const filtered = orders.filter(order => {
  const matchesText = /* logica esistente */;
  const matchesClient = /* dropdown cliente/sottocliente */;
  const matchesCity = /* dropdown città */;
  return matchesText && matchesClient && matchesCity;
});
```

Il calcolo avviene nel `useMemo` già esistente per le performance.

---

## Stato React da aggiungere

```typescript
const [selectedClientFilter, setSelectedClientFilter] = useState('');
const [selectedCityFilter, setSelectedCityFilter] = useState('');
```

Reset a `""` quando il modal viene chiuso (via `useEffect` su `isOpen`).

---

## Dati per le opzioni (derivati dagli ordini caricati)

```typescript
const clientOptions = useMemo(() => {
  const customers = new Map<string, string>();
  const subClients = new Map<string, string>();
  orders.forEach(o => {
    if (o.customerProfileId) customers.set(o.customerProfileId, o.customerRagioneSociale ?? o.customerProfileId);
    if (o.subClientCodice) subClients.set(o.subClientCodice, o.subClientRagioneSociale ?? o.subClientCodice);
  });
  return { customers, subClients };
}, [orders]);

const cityOptions = useMemo(() => {
  const cities = new Set<string>();
  orders.forEach(o => {
    if (o.customerCity) cities.add(o.customerCity);
    if (o.subClientCity) cities.add(o.subClientCity);
  });
  return [...cities].sort();
}, [orders]);
```

---

## Stile

Inline style come da convenzione del progetto (`OrderCardNew.tsx`, `CustomerHistoryModal.tsx`). I dropdown avranno lo stesso look della barra di ricerca esistente (sfondo scuro, bordo sottile, testo chiaro).

---

## Modifiche ai file

| File | Tipo |
|------|------|
| `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx` | Modifica |

Nessuna modifica a backend, API, tipi condivisi o altri componenti.

---

## Test

- Unit test (`.spec.ts`) per la logica di filtro pura (funzione separata testabile indipendentemente dal componente)
- Casi: filtro cliente, filtro sottocliente, filtro città con OR, combinazione AND di tutti i filtri, reset filtri

---

## Non in scope

- Modifica all'API o al backend
- Persistenza dei filtri tra sessioni
- Filtro per provincia o CAP
- Autocompletamento (i dropdown mostrano solo valori già presenti negli ordini caricati)
