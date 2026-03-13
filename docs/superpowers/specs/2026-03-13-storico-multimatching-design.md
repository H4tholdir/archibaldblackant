# Spec: Storico Ordini — Multimatching, Animazioni, Prezzi Listino

**Data:** 2026-03-13
**Stato:** Approvato

---

## Contesto

La modale storico ordini (`CustomerHistoryModal`) viene aperta durante la creazione di un nuovo ordine per riutilizzare articoli/ordini passati. Attualmente gestisce solo un matching 1:1 tra sottocliente Fresis e cliente Archibald, non ha feedback visivo sulle azioni dell'utente, e non mostra i prezzi del listino attuale per confronto.

---

## Obiettivi

1. **Prezzi corretti per clienti diretti Archibald** — articoli inseriti dallo storico usano sempre il listino attuale + sconto calcolato; il prezzo unitario non è modificabile.
2. **Multimatching N:M** — un cliente Archibald ↔ N sottoclienti Fresis; un sottocliente Fresis ↔ N clienti Archibald e N altri sottoclienti Fresis.
3. **Modale matching unificata** — gestione completa add/remove con opzione "Salta" e flag "Non mostrare più".
4. **Animazioni di feedback** — chiaro riscontro visivo quando si aggiunge un articolo o si copia un ordine.
5. **Confronto prezzi listino** — due colonne aggiuntive per confronto immediato storico vs listino attuale.

---

## Sezione 1 — Schema DB

### Nuove tabelle (migration `023-multimatching.sql`)

Le nuove tabelle sono **condivise tra tutti gli utenti** (stessa semantica di `shared.sub_clients.matched_customer_profile_id`). Non includono `user_id` per mantenere la coerenza con la tabella di origine. Le FK su `sub_client_codice` sono intenzionalmente omesse — coerente con il pattern esistente nel DB dove `shared.sub_clients.matched_customer_profile_id` non ha FK su `agents.customers`.

```sql
-- N:M sottocliente ↔ cliente Archibald (condiviso tra utenti)
CREATE TABLE shared.sub_client_customer_matches (
  sub_client_codice   TEXT        NOT NULL,
  customer_profile_id TEXT        NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sub_client_codice, customer_profile_id)
);

-- N:M sottocliente ↔ sottocliente (coppia canonica: codice_a < codice_b, lexicografico)
CREATE TABLE shared.sub_client_sub_client_matches (
  sub_client_codice_a TEXT        NOT NULL,
  sub_client_codice_b TEXT        NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sub_client_codice_a, sub_client_codice_b),
  CHECK (sub_client_codice_a < sub_client_codice_b)
);

-- Preferenza per-utente: salta la modale matching
CREATE TABLE shared.sub_client_history_prefs (
  user_id             INTEGER NOT NULL,
  entity_type         TEXT    NOT NULL CHECK (entity_type IN ('subclient', 'customer')),
  entity_id           TEXT    NOT NULL,
  skip_matching_modal BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, entity_type, entity_id)
);
```

### Migrazione dati

```sql
-- Copia matching 1:1 esistenti nella nuova tabella N:M
INSERT INTO shared.sub_client_customer_matches (sub_client_codice, customer_profile_id)
SELECT codice, matched_customer_profile_id
FROM shared.sub_clients
WHERE matched_customer_profile_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

La colonna `shared.sub_clients.matched_customer_profile_id` viene mantenuta temporaneamente. **Nella stessa migration**, il repository `customer-full-history.repository.ts` viene aggiornato per usare le nuove tabelle. La colonna legacy viene rimossa in `024-drop-legacy-match.sql` dopo deploy verificato.

---

## Sezione 2 — Backend API

### Tipi condivisi

```typescript
type MatchResult = {
  customerProfileIds: string[];
  subClientCodices:   string[];
  skipModal:          boolean;   // da sub_client_history_prefs, scoped per userId
};
```

### Nuovo repository: `sub-client-matches.repository.ts`

```typescript
// userId per skipModal (da sessione); matches sono shared (no userId nei join)
getMatchesForSubClient(pool, userId, codice): Promise<MatchResult>
getMatchesForCustomer(pool, userId, customerProfileId): Promise<MatchResult>

addCustomerMatch(pool, codice, customerProfileId): Promise<void>
removeCustomerMatch(pool, codice, customerProfileId): Promise<void>

// Il repository ordina i due codici in ordine lexicografico prima di INSERT/DELETE/SELECT
addSubClientMatch(pool, codiceA, codiceB): Promise<void>
removeSubClientMatch(pool, codiceA, codiceB): Promise<void>

upsertSkipModal(pool, userId, entityType: 'subclient'|'customer', entityId, skip: boolean): Promise<void>
```

**Nota canonicità:** `addSubClientMatch` e `removeSubClientMatch` ordinano internamente i due codici (`[a, b] = [codiceA, codiceB].sort()`) prima di ogni operazione. Il chiamante non deve preoccuparsi dell'ordine.

**Fallback Fresis vuoto:** se `subClientCodices` è array vuoto, la query Fresis restituisce `[]` senza errore — coerente con il comportamento attuale quando non c'è matching.

### Nuovo router: `sub-client-matches.ts`

Tutte le route richiedono autenticazione. `userId` viene sempre letto da `req.user!.userId` (sessione), non dai query param.

```
GET    /api/sub-client-matches?codice=X              → getMatchesForSubClient
GET    /api/sub-client-matches/by-customer?profileId=X → getMatchesForCustomer
POST   /api/sub-client-matches/customer              body: { codice, customerProfileId }
DELETE /api/sub-client-matches/customer?codice=X&customerProfileId=Y  (query params, coerente con pattern esistente)
POST   /api/sub-client-matches/subclient             body: { codiceA, codiceB }
DELETE /api/sub-client-matches/subclient?codiceA=X&codiceB=Y
PATCH  /api/sub-client-matches/skip-modal            body: { entityType, entityId, skip }
```

### Modifiche a `customer-full-history.repository.ts`

**Parametri aggiornati:**
```typescript
type HistoryParams = {
  customerProfileIds?: string[];  // era: customerProfileId?: string
  customerName?:       string;
  subClientCodices?:   string[];  // era: subClientCodice?: string
};
```

**Encoding URL dal frontend:** array passati come repeated params: `?customerProfileIds[]=X&customerProfileIds[]=Y`. Il router li riceve via `req.query.customerProfileIds` (Express array parsing).

**Query orders:** `o.customer_profile_id = ANY($2::text[])` (o `LOWER(o.customer_name) = ANY(...)`)

**Query fresis:** `sub_client_codice = ANY($2::text[])` — se array vuoto, la `ANY` non matcha nulla (comportamento corretto).

**Aggiunta `customerProfileId` e `customerCity` nel risultato:**
```sql
SELECT o.customer_profile_id,
       c.city AS customer_city,
       c.name AS customer_name,
       ...
FROM agents.order_records o
LEFT JOIN agents.customers c ON c.customer_profile = o.customer_profile_id AND c.user_id = o.user_id
```

Ogni `FullHistoryOrder` espone: `customerProfileId?: string`, `customerCity?: string`, `customerRagioneSociale?: string`.

**Call site da aggiornare:** `OrderFormSimple.tsx` è l'unico posto dove `CustomerHistoryModal` è chiamato con i vecchi prop scalari (righe 4999–5060). `CustomerHistoryModal` non è usato altrove nel codebase.

---

## Sezione 3 — Frontend

### 3a. Nuovo `MatchingManagerModal.tsx`

Sostituisce `CustomerPickerModal` (in `SubclientsTab.tsx`) e `SubClientPickerModal` (in `SubClientPickerModal.tsx`).

**Props — discriminated union:**
```typescript
type Props =
  | {
      mode: 'subclient';
      subClientCodice: string;
      entityName: string;
      onConfirm: (ids: { customerProfileIds: string[]; subClientCodices: string[] }) => void;
      onSkip: () => void;
      onClose: () => void;
    }
  | {
      mode: 'customer';
      customerProfileId: string;
      entityName: string;
      onConfirm: (ids: { customerProfileIds: string[]; subClientCodices: string[] }) => void;
      onSkip: () => void;
      onClose: () => void;
    };
```

**Layout:**
- Header: nome entità
- Sezione "Clienti Archibald collegati": chip `[C0012 · Roma ✕]` + search inline per aggiungere
- Sezione "Sottoclienti Fresis collegati": chip `[C00234 · Fiori Blu ✕]` + search inline per aggiungere
- Footer: checkbox "Non mostrare più per questo cliente" | pulsante "Salta — apri storico senza matching" | pulsante "✓ Conferma e apri storico" (`background: #059669`)

**Comportamento:**
- Apertura: carica matching via `GET /api/sub-client-matches`
- "✓ Conferma": salva add/remove via API, se checkbox spuntata `PATCH skip-modal`, chiama `onConfirm`
- "Salta": chiama `onSkip` — nessuna modifica al DB
- ✕ chip: rimuove matching (accumulato in stato locale, persistito solo su conferma)

**Riutilizzo:** usato in `OrderFormSimple` e in `SubclientsTab`.

---

### 3b. Modifiche a `CustomerHistoryModal.tsx`

#### Props

```typescript
// Prima:
customerProfileId: string | null
subClientCodice:   string | null
isFresisClient:    boolean

// Dopo:
customerProfileIds: string[]
subClientCodices:   string[]
isFresisClient:     boolean
```

#### Header ordine (riga secondaria)

Ogni `OrderCard` mostra sotto il numero ordine:
```
Cliente: [C0012] · [Mario Rossi Fiori srl] · [Roma]
```
Appare sempre (non solo in multimatching), perché con N:M gli ordini possono provenire da clienti diversi.

#### Colonne prezzi listino

Due nuove colonne nella tabella articoli:

| Posizione | Colonna | Sfondo celle | Sfondo header |
|---|---|---|---|
| Immediatamente dopo "P.unit. storico" | **Listino unit.** | `#fafaff` | `#f5f3ff` |
| Immediatamente dopo "Tot.+IVA storico" | **Tot. listino+IVA** | `#fafaff` | `#f5f3ff` |

Sotto il valore "Listino unit." appare un delta in piccolo:
- `▲ +N%` `color: #dc2626` se listino > storico
- `▼ −N%` `color: #059669` se listino < storico
- `= invariato` `color: #94a3b8` se uguale (tolleranza ±0.001)
- `—` se `priceService.getPriceAndVat` non restituisce risultato

I prezzi listino vengono caricati **all'apertura della modale** per tutti gli articoli visibili (eager loading) tramite `priceService.getPriceAndVat`. I risultati sono mantenuti in una `Map<articleCode, PriceInfo>` in stato locale della modale.

#### Tipo `PendingOrderItemWithWarning`

```typescript
type PendingOrderItemWithWarning = PendingOrderItem & {
  _priceWarning?: boolean;  // campo ufficiale, non su PendingOrderItem base
};
```

`buildPendingItem` restituisce `PendingOrderItemWithWarning`. Il campo non viene mai serializzato o inviato al backend.

Se `_priceWarning=true`: la cella "Listino unit." mostra `⚠` arancione con tooltip "Prezzo storico superiore al listino attuale — l'articolo verrà aggiunto a prezzo listino con sconto 0%".

#### Pulsante "+ Aggiungi" — sempre attivo

- Non si disabilita mai
- Al primo click: compare badge `✓ ×1` (animazione `badgePop`, `scale: 0.6→1`)
- Click successivi: contatore incrementa con `badgeBump`

#### Counter nel modal header

Aggiungere nell'header di `CustomerHistoryModal`:
```tsx
<div id="cart-counter" style={...}>
  <div className="counter-dot" />
  <span>{addedCount} articol{addedCount === 1 ? 'o' : 'i'} nell'ordine</span>
</div>
```
Bump e colore verde (`rgba(5,150,105,0.25)`) quando `addedCount > 0`.

#### Animazioni

**Articolo singolo:**
1. Flash verde riga storico (`artFlash` 1.2s)
2. Badge `✓ ×N` pop/bump
3. Counter header bump + verde

**Copia ordine intero:**
1. Pulsante → "⏳ Copiando..." (disabilitato temporaneamente)
2. Overlay checkmark SVG sulla card (pop-in + `checkDraw`)
3. Flash righe + badge aggiornati + counter bump × N articoli
4. Dopo 1.3s: overlay svanisce, pulsante riabilitato a "⊕ Copia tutto"

---

### 3c. Modifiche a `OrderFormSimple.tsx`

**`handleHistorySearchClick` — nuovo flusso:**

```
1. Determina entityType e entityId (subclient o customer)
2. GET /api/sub-client-matches → { customerProfileIds, subClientCodices, skipModal }
3. Se skipModal=true:
     → apri CustomerHistoryModal con customerProfileIds + subClientCodices
4. Se skipModal=false:
     → apri MatchingManagerModal
       onConfirm(ids) → apri CustomerHistoryModal con ids
       onSkip()       → apri CustomerHistoryModal con { customerProfileIds, subClientCodices } già ricevuti dal GET precedente (step 2)
```

**Gestione `newItemIds` per slide-in:**

```typescript
const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set());

// In onAddArticle callback:
const newId = crypto.randomUUID();
const newItem = { id: newId, ... };
setItems(prev => [...prev, newItem]);
setRecentlyAddedIds(prev => new Set([...prev, newId]));

// Pulizia dopo animazione (2.5s):
setTimeout(() => {
  setRecentlyAddedIds(prev => { const s = new Set(prev); s.delete(newId); return s; });
}, 2500);
```

Lo stesso meccanismo si applica a `onAddOrder` (N UUID generati, tutti aggiunti a `recentlyAddedIds`).

**Prezzo unitario non modificabile:** `canEditPrice = isFresis(selectedCustomer) && !!selectedSubClient` già implementato — nessuna modifica necessaria.

**Call sites `CustomerHistoryModal` da aggiornare:** solo `OrderFormSimple.tsx` righe 4999–5060.

---

### 3d. Modifiche a `OrderItemsList.tsx`

```typescript
interface OrderItemsListProps {
  items:          OrderItem[];
  onEditItem:     (itemId: string, updates: Partial<OrderItem>) => void;
  onDeleteItem:   (itemId: string) => void;
  newItemIds?:    Set<string>;   // NUOVO: IDs delle righe appena aggiunte
}
```

Righe con `newItemIds.has(item.id)`:
- Classe CSS `new-item`: `slideInItem` (0.4s bounce) + `background: #f0fdf4` + `borderLeft: 3px solid #059669`
- Badge inline `✓ nuovo` che sfuma dopo 2.2s (`fadeBadge`)
- Dopo 2.2s: `fadeNormal` porta riga a `background: white`, `borderLeft: none`

---

### 3e. Modifiche a `SubclientsTab.tsx`

- Pulsante "Collega" per ogni sottocliente → apre `MatchingManagerModal` (mode: 'subclient')
- Badge stato matching: mostra `2 clienti · 1 sottocliente` oppure `Non matchato`
- `handleLink` e il `CustomerPickerModal` esistente → rimossi, sostituiti da `MatchingManagerModal`

---

## Sezione 4 — Nuovo servizio frontend

`sub-client-matches.service.ts`:

```typescript
type MatchResult = {
  customerProfileIds: string[];
  subClientCodices:   string[];
  skipModal:          boolean;
};

getMatchesForSubClient(codice: string): Promise<MatchResult>
getMatchesForCustomer(profileId: string): Promise<MatchResult>
addCustomerMatch(codice: string, customerProfileId: string): Promise<void>
removeCustomerMatch(codice: string, customerProfileId: string): Promise<void>
addSubClientMatch(codiceA: string, codiceB: string): Promise<void>
removeSubClientMatch(codiceA: string, codiceB: string): Promise<void>
upsertSkipModal(entityType: 'subclient'|'customer', entityId: string, skip: boolean): Promise<void>
// userId inviato automaticamente tramite sessione cookie, non come parametro esplicito.
// MatchResult è una dichiarazione indipendente lato frontend (non shared con backend):
// type MatchResult = { customerProfileIds: string[]; subClientCodices: string[]; skipModal: boolean }
```

---

## Sezione 5 — Testing

### Unit test

- `sub-client-matches.repository.spec.ts`:
  - add/remove per `sub_client_customer_matches`
  - add/remove per `sub_client_sub_client_matches` con verifica ordine canonico (input invertito → stesso risultato)
  - `upsertSkipModal` UPSERT idempotente
- `customer-full-history.repository.spec.ts`:
  - query multi-ID restituisce ordini aggregati
  - array vuoto `subClientCodices=[]` restituisce `[]` senza errore
  - `customerCity` presente nel risultato

### Integration test

- `POST /api/sub-client-matches/customer` → `GET` verifica persistenza
- `DELETE /api/sub-client-matches/subclient?codiceA=X&codiceB=Y` → verifica rimozione con ordine invertito (`codiceA=Y&codiceB=X`)
- `GET /api/history/customer-full-history?customerProfileIds[]=A&customerProfileIds[]=B` → verifica aggregazione

### Frontend

- `CustomerHistoryModal.spec.tsx`:
  - badge `×N` incrementa correttamente ad ogni click
  - `buildPendingItem` usa listino per clienti diretti
  - `_priceWarning=true` quando il prezzo storico è superiore al listino attuale (il che causa uno sconto calcolato < 0 — l'implementazione usa la condizione `calculatedDiscount < 0 || calculatedDiscount > 100`)
  - colonne listino mostrano `—` se `priceService.getPriceAndVat` restituisce null
- `MatchingManagerModal.spec.tsx`:
  - `onSkip` non chiama nessuna API
  - `onConfirm` chiama add/remove solo per le modifiche effettive (non per i matching già esistenti non toccati)
  - checkbox skip_modal → `PATCH skip-modal` viene chiamato
- `OrderItemsList.spec.tsx`:
  - righe in `newItemIds` ricevono classe `new-item`
  - righe non in `newItemIds` non la ricevono

---

## Fuori scope

- Modifica al parser PDF ordini
- Cambiamenti a `FresisHistoryPage` (usa già `subClientCodice` diretto)
- UI mobile-specific per `MatchingManagerModal`
- Rimozione colonna legacy `matched_customer_profile_id` (migration separata `024`)
