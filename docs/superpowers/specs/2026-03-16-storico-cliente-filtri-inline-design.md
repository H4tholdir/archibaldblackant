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

Tutti e tre gli elementi sono sulla stessa riga, con la barra di ricerca flessibile che occupa lo spazio rimanente. I `<select>` non hanno label visibile separata; il loro nome accessibile è fornito dall'`aria-label` attribute (`"Filtra per cliente o sottocliente"` e `"Filtra per città"`).

---

## Dropdown 1 — Cliente / Sottocliente

- Elemento: `<select aria-label="Filtra per cliente o sottocliente">`
- Prima opzione (valore `""`): `Tutti i clienti/sottoclienti` — azzera il filtro
- Opzioni raggruppate con `<optgroup>`:
  - Gruppo **Clienti** — voci con `customerProfileId` distinti presenti negli ordini caricati
    - Formato: `{customerProfileId} — {customerRagioneSociale}`
    - Valore: `customer:{customerProfileId}`
  - Gruppo **Sottoclienti** — voci con `subClientCodice` distinti presenti negli ordini caricati
    - Formato: `{subClientCodice} — {subClientRagioneSociale}`
    - Valore: `subclient:{subClientCodice}`
  - Entrambi i gruppi sono ordinati alfabeticamente per ragione sociale
  - Un gruppo viene omesso se non ci sono voci di quel tipo negli ordini caricati

**Logica di match per un ordine:**
```
selectedClientFilter === "" → passa sempre
selectedClientFilter === "customer:{id}" → ordine.customerProfileId === id
selectedClientFilter === "subclient:{cod}" → ordine.subClientCodice === cod
```

**Edge case:** Un ordine con `customerProfileId === undefined` E `subClientCodice === undefined` non appare in nessun gruppo del dropdown. Quando il filtro è `""` (tutti) l'ordine è visibile; quando qualsiasi filtro specifico è attivo, l'ordine non passerà mai la verifica — comportamento corretto e atteso.

---

## Dropdown 2 — Città

- Elemento: `<select aria-label="Filtra per città">`
- Prima opzione (valore `""`): `Tutte le città` — azzera il filtro
- Opzioni: città uniche estratte dall'unione di `customerCity` e `subClientCity` di tutti gli ordini caricati, ordinate alfabeticamente, con valori `undefined`/vuoti esclusi. Se `customerCity === subClientCity` per un ordine, la città appare una sola volta nel dropdown (deduplicazione via `Set`).

**Logica di match per un ordine (OR):**
```
selectedCityFilter === "" → passa sempre
ordine.customerCity === selectedCityFilter OR ordine.subClientCity === selectedCityFilter
```

**Nota sull'asimmetria intenzionale:** Il filtro città usa OR su entrambi i campi, mentre il filtro cliente/sottocliente è un match esatto su un solo campo per volta. Questo è intenzionale: la città è un attributo "descrittivo" per cui ha senso includere l'ordine se almeno uno dei soggetti è in quella città; il codice cliente/sottocliente è invece un identificatore univoco che l'utente usa per isolare uno specifico soggetto.

---

## Logica di filtro complessiva

I tre filtri si combinano con **AND** all'interno del `useMemo` già esistente per le performance:

```typescript
const filteredOrders = useMemo(() => {
  return orders.filter(order => {
    const matchesText = /* logica esistente */;

    const matchesClient =
      selectedClientFilter === '' ||
      (selectedClientFilter.startsWith('customer:') &&
        order.customerProfileId === selectedClientFilter.slice('customer:'.length)) ||
      (selectedClientFilter.startsWith('subclient:') &&
        order.subClientCodice === selectedClientFilter.slice('subclient:'.length));

    const matchesCity =
      selectedCityFilter === '' ||
      order.customerCity === selectedCityFilter ||
      order.subClientCity === selectedCityFilter;

    return matchesText && matchesClient && matchesCity;
  });
}, [orders, searchQuery, selectedClientFilter, selectedCityFilter]);
```

---

## Contatori (ordini · fresis · articoli)

I contatori nella barra del modal ("Ordini: N", "Fresis: N", "N ordini · M articoli") **riflettono gli ordini filtrati** (post-applicazione di tutti e tre i filtri), non il totale grezzo. Questo è coerente con il comportamento attuale della barra di ricerca testuale.

**Istruzione all'implementatore:** nel file `CustomerHistoryModal.tsx` i contatori `ordersCount` e `fresisCount` sono attualmente derivati da `orders` (array grezzo). Devono essere aggiornati per leggere da `filteredOrders`. Allo stesso modo, il contatore inline nel render (`orders.length` e il calcolo degli articoli) deve usare `filteredOrders` al posto di `orders`.

---

## Stato React da aggiungere

```typescript
const [selectedClientFilter, setSelectedClientFilter] = useState('');
const [selectedCityFilter, setSelectedCityFilter] = useState('');
```

**Reset:** I due state vengono resettati a `""` quando il modal viene chiuso. Il `useEffect` deve distinguere apertura da chiusura per non azzerare i filtri immediatamente all'apertura:

```typescript
useEffect(() => {
  if (!isOpen) {
    setSelectedClientFilter('');
    setSelectedCityFilter('');
  }
}, [isOpen]);
```

---

## Dati per le opzioni (derivati dagli ordini caricati)

```typescript
const clientOptions = useMemo(() => {
  const customers = new Map<string, string>(); // id → ragioneSociale
  const subClients = new Map<string, string>(); // codice → ragioneSociale
  orders.forEach(o => {
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
  orders.forEach(o => {
    if (o.customerCity) cities.add(o.customerCity);
    if (o.subClientCity) cities.add(o.subClientCity);
  });
  return [...cities].sort((a, b) => a.localeCompare(b));
}, [orders]);
```

---

## Stile

Inline style come da convenzione del progetto. I dropdown avranno lo stesso look della barra di ricerca esistente (sfondo scuro, bordo sottile, testo chiaro). Non si aggiungono classi CSS esterne.

---

## Modifiche ai file

| File | Tipo |
|------|------|
| `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx` | Modifica |
| `archibald-web-app/frontend/src/components/CustomerHistoryModal.spec.tsx` (nuovo o esistente) | Aggiunta test |

Nessuna modifica a backend, API, tipi condivisi o altri componenti.

---

## Test

I test vanno aggiunti al file spec del componente (`CustomerHistoryModal.spec.tsx`) seguendo il pattern dei test esistenti. Non si estrae una funzione pura separata (rispetto a CLAUDE.md C-9: la logica è semplice e non riutilizzata altrove; è testabile via component test).

Casi da coprire:

| # | Scenario | Verifica |
|---|----------|----------|
| 1 | Filtro cliente attivo | Solo gli ordini con `customerProfileId` corrispondente sono visibili |
| 2 | Filtro sottocliente attivo | Solo gli ordini con `subClientCodice` corrispondente sono visibili |
| 3 | Filtro città su `customerCity` | L'ordine con quella `customerCity` è visibile |
| 4 | Filtro città su `subClientCity` | L'ordine con quella `subClientCity` (ma `customerCity` diversa) è visibile |
| 5 | Combinazione AND: cliente + città | Solo gli ordini che passano entrambi i filtri sono visibili |
| 6 | Reset filtri | Dopo aver impostato entrambi i filtri e chiuso/riaperto il modal, i dropdown tornano a "Tutti" e tutti gli ordini sono visibili |
| 7 | Edge case ordine senza cliente/sottocliente | Con filtro `""` l'ordine è visibile; con qualsiasi filtro specifico non è visibile |
| 8 | Deduplica opzioni dropdown | Se due ordini hanno la stessa città, nel dropdown appare una sola volta |

---

## Non in scope

- Modifica all'API o al backend
- Persistenza dei filtri tra sessioni
- Filtro per provincia o CAP
- Autocompletamento testuale nei dropdown
- Gestione del caso in cui il modal resti aperto e gli ordini vengano ricaricati a runtime (es. refresh forzato): un filtro attivo su un cliente non più presente nella nuova lista mostrerebbe 0 risultati senza avviso. Questo scenario non si verifica nell'uso normale (gli ordini vengono caricati una sola volta all'apertura del modal).
