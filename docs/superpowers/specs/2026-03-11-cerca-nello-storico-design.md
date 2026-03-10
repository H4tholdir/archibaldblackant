# Design: Cerca nello Storico — Storico Completo Cliente

**Data:** 2026-03-11
**Stato:** Approvato

---

## Contesto

Nella pagina di creazione nuovo ordine (`OrderFormSimple.tsx`), il bottone "Cerca nello Storico" attualmente apre un semplice modal di ricerca per articolo sullo storico ordini standard. Si vuole sostituirlo con una funzionalità completa che mostri l'intero storico del cliente da entrambe le sorgenti (storico ordini + storico Fresis), con possibilità di copiare singoli articoli o interi ordini nell'ordine in costruzione.

---

## Obiettivo

Mostrare all'agente, durante la creazione di un ordine, tutto lo storico acquisti del cliente selezionato — indipendentemente dalla sorgente — permettendo di riutilizzare ordini o articoli precedenti con un click.

---

## Decisioni di Design

| # | Decisione | Scelta |
|---|-----------|--------|
| 1 | Presentazione | Modal a tutta larghezza (90vh), tutti gli ordini espansi, nessun scroll orizzontale |
| 2 | Colonne tabella articoli | Codice · Descrizione · Qtà · Prezzo unit. · Sconto · IVA · Tot.+IVA · Azione |
| 3 | Articoli non trovati nel catalogo (copia ordine) | Copia solo articoli validi + dialog con lista articoli saltati |
| 4 | Articoli già presenti nell'ordine | Avviso con scelta: aggiungi in coda / sovrascrivi |
| 5 | Matching cliente | Bidirezionale, obbligatorio, persistito per usi futuri |
| 6 | Storico da caricare | Tutto lo storico disponibile |
| 7 | Prezzo impossibile per cliente diretto | Sconto 0% + avviso "impossibile gestire lo sconto per il prezzo, verifica" — solo se il discount calcolato è fuori range [0%, 100%] |

---

## Architettura

### Nuovi elementi

1. **`CustomerHistoryModal.tsx`** — modal principale con la lista unificata ordini/articoli
2. **`GET /api/history/customer-full-history`** — endpoint backend unificato
3. **`customer-full-history.repository.ts`** — query che fonde le due sorgenti

### Elementi riutilizzati

- **`CustomerPickerModal`** (già in `SubclientsTab.tsx`) — riusato per il matching bidirezionale
- **API `POST /api/subclients/{codice}/match`** — già esistente, usata per persistere il matching

### Elemento modificato

- **`OrderFormSimple.tsx`** — il bottone "Cerca nello Storico" viene riscritto per orchestrare il nuovo flow

---

## Flow Completo

### 1. Click su "Cerca nello Storico"

```
Click "Cerca nello Storico"
    ↓
Cliente Fresis selezionato?
  → subClientCodice ha matchedCustomerProfileId?
      NO → apre CustomerPickerModal (lista clienti Archibald)
           matching OBBLIGATORIO
           salva via POST /api/subclients/{codice}/match
           solo dopo il salvataggio → procede
      SI → procede direttamente
    ↓
Cliente diretto Archibald?
  → esiste un sottocliente Fresis con matchedCustomerProfileId = customerProfileId?
      NO → apre CustomerPickerModal (lista sottoclienti Fresis non matchati)
           matching OBBLIGATORIO
           salva via POST /api/subclients/{codice}/match
           solo dopo il salvataggio → procede
      (edge case: nessun sottocliente Fresis disponibile → procede direttamente)
      SI → procede direttamente
    ↓
Apre CustomerHistoryModal
```

### 2. Inserimento articolo singolo

```
Utente clicca "+ Aggiungi" su un articolo
    ↓
articleCode esiste già in currentOrderItems?
    → SI → avviso "Hai già questo articolo — aggiungi in coda o sovrascrivi?"
    → NO → continua
    ↓
isFresisClient?
    → SI  → inserisce unitPrice e discountPercent 1:1 dallo storico
    → NO  → disc = 1 - (lineTotalNoVat / (qty × prezzoListinoAttuale))
             disc in [0, 1] → applica disc calcolato
             disc fuori range → inserisce con disc=0 + flag warningPrice=true (avviso visivo)
    ↓
chiama onAddArticle(item)
```

### 3. Copia intero ordine

```
Utente clicca "⊕ Copia tutto l'ordine"
    ↓
currentOrderItems non vuoto?
    → mostra avviso "Hai già N articoli — aggiungi in coda o sovrascrivi tutto?"
    ↓
Per ogni articolo dell'ordine storico:
    verifica presenza nel catalogo tramite prices service
    → NON trovato → segna come "saltato"
    → Trovato     → applica logica prezzo/sconto (identica a inserimento singolo)
    ↓
articoli saltati > 0? → mostra dialog con lista articoli saltati
    ↓
chiama onAddOrder(itemsValidi)
```

---

## Backend

### Endpoint

```
GET /api/history/customer-full-history
  ?customerProfileId=C10181     (opzionale, per storico orders)
  &subClientCodice=C00042       (opzionale, per storico Fresis)
```

Almeno uno dei due parametri è obbligatorio.

### Response

```typescript
type FullHistoryOrder = {
  source: 'orders' | 'fresis'
  orderId: string
  orderNumber: string       // es. "FT 247" | "KT-2024-081"
  orderDate: string         // ISO date
  totalAmount: number       // imponibile + IVA
  articles: FullHistoryArticle[]
}

type FullHistoryArticle = {
  articleCode: string
  articleDescription: string
  quantity: number
  unitPrice: number
  discountPercent: number   // 0–100
  vatPercent: number
  lineTotalWithVat: number  // qty × price × (1 - disc/100) × (1 + vat/100)
}
```

### Repository

Due query eseguite in parallelo:

1. **Query orders:** join `order_records` + `order_articles` per `customer_profile_id`. Solo ordini con `articles_synced_at IS NOT NULL`. Esclude NC con pattern `NOT EXISTS` (stesso cliente, stessa cifra negata).

2. **Query Fresis:** legge da `fresis_history` per `sub_client_codice`. I `PendingOrderItem` già contengono prezzo/quantità/sconto.

Merge e ordinamento per `orderDate DESC` nel layer applicativo. Risultato: array unico `FullHistoryOrder[]`.

---

## Frontend — `CustomerHistoryModal.tsx`

### Props

```typescript
type CustomerHistoryModalProps = {
  isOpen: boolean
  onClose: () => void
  customerName: string
  customerProfileId: string | null
  subClientCodice: string | null
  isFresisClient: boolean
  currentOrderItems: PendingOrderItem[]
  onAddArticle: (item: PendingOrderItem) => void
  onAddOrder: (items: PendingOrderItem[]) => void
}
```

### Struttura UI

- **Header:** nome cliente + sottotitolo "Storico ordini + Storico Fresis · Ordinati per data ↓" + bottone ✕
- **Filter bar:** campo ricerca libera (filtra per codice, descrizione, numero ordine) + badge contatori per sorgente
- **Body scrollabile:** lista card ordini, tutti espansi
- **Card ordine:** header (numero, data, badge sorgente, totale, bottone copia) + tabella articoli + footer totali
- **Footer modal fisso:** istruzioni + bottone Chiudi

### Badge sorgente

- Blu (`#dbeafe / #1d4ed8`) → storico ordini
- Viola (`#ede9fe / #7c3aed`) → storico Fresis

### Articolo con warning prezzo

Riga con sfondo giallo pallido `#fefce8` + icona ⚠️ + tooltip "impossibile gestire lo sconto per il prezzo, verifica".

---

## Modifiche a `OrderFormSimple.tsx`

- Rimuovere: `showHistorySearchModal`, `historySearchQuery`, `historySearchResults` e il vecchio modal
- Aggiungere: `showCustomerHistoryModal` (boolean) + logica di pre-check matching
- Aggiungere: `CustomerHistoryModal` nel JSX
- La funzione `handleHistorySearchClick` orchestra il flow: check matching → eventuale `CustomerPickerModal` → apertura `CustomerHistoryModal`
