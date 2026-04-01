# Customers — Redesign Completo

## Sintesi

Eliminazione completa della split-view. Tre viewport con pattern di navigazione distinti, profilo cliente come pagina dedicata con avatar prominente, edit mode unificato batch-deferred, storico ordini inline.

Due sotto-progetti implementati in sequenza:
- **Sub-A — Edit Mechanics**: backend + bot (indipendente dal frontend, prerequisito)
- **Sub-B — UX Redesign**: frontend completo (CustomerListPage + CustomerProfilePage)

---

## Sub-A — Edit Mechanics

### Problema

`CustomerInlineSection` chiama `update-customer` una volta per ogni sezione salvata. Se l'utente modifica 3 sezioni → 3 chiamate bot → 3 navigazioni ERP separate.

### Soluzione

Accumulare tutte le modifiche nel frontend, inviare **una sola** chiamata `update-customer` con tutti i campi cambiati.

### Cambiamenti backend

**`update-customer` handler** (`backend/src/operations/handlers/update-customer.ts`):

Estendere `UpdateCustomerData` con i campi mancanti (attualmente ~19, target 28+):

```ts
type UpdateCustomerData = {
  erpId: string
  name?: string
  vatNumber?: string
  fiscalCode?: string
  pec?: string
  sdi?: string
  sector?: string
  attentionTo?: string
  notes?: string
  phone?: string
  mobile?: string
  email?: string
  url?: string
  street?: string
  postalCode?: string
  city?: string          // già presente, mappato a postalCodeCity
  county?: string        // NUOVO — provincia (es. "NA")
  state?: string         // NUOVO — regione (es. "Campania")
  country?: string       // NUOVO — paese (es. "IT")
  deliveryMode?: string
  paymentTerms?: string
  lineDiscount?: string
  vatWasValidated?: boolean
  addresses?: AltAddress[]
}
```

Il bot `updateCustomer()` già naviga al form e aggiorna tutti i campi presenti in un'unica sessione — nessuna modifica necessaria al bot.

### Senza cambiamenti necessari

- Nessun nuovo endpoint
- Nessuna modifica alle route
- Nessuna migrazione DB (i campi esistono già nella colonna `customers`)

---

## Sub-B — UX Redesign

### Architettura

```
/customers            → CustomerListPage   (rewrite)
/customers/:erpId     → CustomerProfilePage (nuovo, sostituisce CustomerDetailPage)
```

Route invariate. `CustomerDetailPage` e `CustomerSidebar` vengono rimossi. `CustomerInlineSection` viene rimosso (logica sostituita dall'edit mode in `CustomerProfilePage`).

### Viewport

| Viewport      | Comportamento                                         |
|---------------|-------------------------------------------------------|
| Mobile (<768) | `/customers` = lista full-width. Tap → navigate a `/customers/:id` full-screen |
| Tablet (768–1279) | `/customers/:id` = 2 pannelli: lista 200px + profilo. `/customers` = solo lista |
| Desktop (≥1280)   | `/customers/:id` = 2 pannelli: sidebar 240px + profilo. `/customers` = solo lista |

**Implementazione 2-pannelli su tablet/desktop**: `CustomerProfilePage` contiene al suo interno un componente `CustomerListSidebar` (~100 righe) che appare solo su viewport ≥768px. `CustomerListSidebar` fa: ricerca + lista compatta + navigate al click. Non gestisce lazy-load foto (mostra solo iniziali/gradient). Quando `CustomerListSidebar` fa navigate, aggiorna l'URL a `/customers/:newErpId` e il pannello destro mostra il nuovo profilo.

Su mobile, `/customers/:erpId` mostra solo il profilo (nessuna sidebar). La `CustomerListSidebar` non viene renderizzata.

### CustomerListPage (rewrite)

**Responsabilità**: lista, ricerca, navigazione al profilo, bottone nuovo cliente.

**Layout**:
- Header: titolo "Clienti" + contatore + pulsante "+ Nuovo"
- Searchbar: sempre visibile, placeholder "Cerca nome, telefono, P.IVA…", debounce 300ms, shortcut ⌘K (desktop)
- Lista divisa in sezioni: "Recenti" (ultimi 5 aperti, da localStorage) + "Tutti (A–Z)"
- Card compatta per ogni cliente: avatar 36px (iniziali colorate se no foto) + nome + telefono/città + badge stato + timestamp ultima attività
- **Badge stato**: Attivo = ordine negli ultimi 90gg · Inattivo = nessun ordine negli ultimi 6 mesi · Nuovo = `createdAt` negli ultimi 30gg · altrimenti nessun badge

**Comportamento click**:
- Mobile: `navigate('/customers/:erpId')`
- Tablet/Desktop: `navigate('/customers/:erpId')` — il layout responsive gestisce il pannello

**Ricerca**: filtra su nome, telefono, P.IVA. Risultati in tempo reale. Nessun filtro avanzato nella barra (filtri avanzati rimossi dalla lista, spostati se necessario in futuri sprint).

**Foto**: lazy-load come attualmente, `customerPhotos` record in state. Logica identica alla versione attuale.

**Componenti riutilizzati**: `CustomerCreateModal` (invariato), `PhotoCropModal` (invariato).

**File risultante**: `CustomerList.tsx` ~ 300 righe (da 648).

### CustomerProfilePage (nuovo)

Sostituisce interamente `CustomerDetailPage.tsx` e `CustomerSidebar.tsx`.

#### Struttura

```
<CustomerProfilePage>
  ├── [edit-mode-banner]        visibile solo in edit mode
  ├── <ProfileTopBar>           back button (mobile) + nome + pulsante Modifica
  ├── <ProfileHero>             avatar grande + nome + P.IVA + quick actions
  ├── <ProfileSections>         scroll area con le sezioni dati
  │   ├── <SectionCard "Contatti">
  │   ├── <SectionCard "Indirizzo">
  │   ├── <SectionCard "Commerciale">
  │   ├── <SectionCard "Anagrafica">
  │   ├── <SectionCard "Indirizzi alternativi">
  │   └── <SectionCard "Storico ordini">
  └── [save-fab]               visibile solo in edit mode con modifiche pendenti
```

#### Avatar

- **Mobile/tablet**: avatar circolare
- **Desktop**: avatar con `border-radius: 16px` (stile "app icon")
- Dimensioni: 80px mobile, 64px tablet, 72px desktop
- Icona 📷 sempre visibile sull'avatar (non solo hover), in basso a destra come badge
- Tap 📷 → apre `PhotoCropModal` (riutilizzato integralmente, crop circolare + zoom 1–3x)
- Se no foto → iniziali su gradient colorato (hash deterministico per colore, stabile per cliente)

#### Quick Actions

**Azioni primarie** (sempre visibili):

| Pulsante | Azione |
|----------|--------|
| 📋 Ordine | `navigate('/')` — stesso comportamento attuale (dashboard/ordini) |
| 📞 Chiama | `tel:${customer.mobile ?? customer.phone}` |
| 💬 WhatsApp | `https://wa.me/${mobile.replace(/\D/g,'')}` — nascosto se no mobile |
| 🕐 Storico | Scroll alla sezione Storico ordini nella stessa pagina |

**Azioni secondarie** (riga aggiuntiva, visibili solo se il dato è presente):

| Pulsante | Condizione | Azione |
|----------|------------|--------|
| ✉ Email | `customer.email` presente | `mailto:${email}` |
| 📍 Maps | `customer.street && customer.city` presenti | Google Maps link |

#### Edit Mode

**Ingresso**: pulsante "Modifica" nel top bar o hero → `editMode = true`

**Stato `editMode`**:
- Banner giallo fisso in cima: "✎ Modalità modifica attiva — clicca qualsiasi campo" + link "Annulla"
- Tutti i campi di tutte le sezioni diventano `<input>` editabili
- I campi non modificati: bordo grigio chiaro, background `#f8fafc`
- I campi modificati: bordo arancione `#f59e0b`, background `#fffbeb`, dot arancione nel label
- Header sezione mostra badge "N modifiche" se ha campi modificati
- Pulsante "Modifica" nel top bar cambia stile (outline blu) per indicare modalità attiva

**Accumulo modifiche**:

```ts
type PendingEdits = Partial<UpdateCustomerData>
const [pendingEdits, setPendingEdits] = useState<PendingEdits>({})

// Ogni campo onChange:
setPendingEdits(prev => ({ ...prev, [fieldKey]: newValue }))
```

**Uscita senza salvare**: click "Annulla" o "Modifica" di nuovo → `editMode = false`, `pendingEdits = {}`

**Salvataggio**:
- FAB "💾 Salva (N)" appare in basso-destra quando `Object.keys(pendingEdits).length > 0`
- Tap FAB → chiama `enqueueOperation('update-customer', { erpId, ...pendingEdits })`
- Polling job fino a completamento (toast success)
- `editMode = false`, `pendingEdits = {}`, reload dati cliente

#### Sezioni Dati

Ogni sezione è una `<SectionCard>` con:
- Header: nome sezione (uppercase, grigio) + eventuale badge modifiche in edit mode
- Grid di campi: 1 colonna mobile, 2 colonne tablet, 3 colonne desktop

**Sezioni e campi**:

| Sezione | Campi |
|---------|-------|
| Contatti | Telefono, Mobile, Email, PEC, SDI, URL |
| Indirizzo | Via, CAP, Città, Provincia, Regione, Paese |
| Commerciale | Sconto linea, Termini pagamento, Modalità consegna |
| Anagrafica | Ragione sociale, P.IVA, Codice fiscale, Settore, Att.ne, Note |
| Indirizzi alternativi | Lista indirizzi + CRUD (vedere sotto) |
| Storico ordini | Lista ordini anno corrente + filtri temporali (vedere sotto) |

#### Indirizzi Alternativi

- Lista degli indirizzi alt con azione elimina (confirm inline, no `window.confirm`)
- Pulsante "+ Aggiungi indirizzo" → form inline espandibile
- In edit mode: ogni indirizzo ha i campi editabili
- Nota: gli indirizzi alt passano come array `addresses` nell'unica chiamata `update-customer`

#### Storico Ordini

**Dati**: usa `getCustomerFullHistory(erpId)` già esistente. Filtra client-side per periodo.

**Default**: anno corrente (`year === new Date().getFullYear()`)

**Filtri temporali** (chip selector):
- Questo mese
- Ultimi 3 mesi
- Quest'anno ← default
- Anno scorso
- Tutto

**Display per ordine**:
- Numero ordine + data
- Importo totale (formattato)
- Stato badge (es. Inviato, In attesa, ecc.)
- Tappabile → `navigate('/orders?highlight=:orderId')` — `OrderHistory` già legge `searchParams.get("highlight")` (riga 236) e fa auto-scroll + flash sull'ordine

**Performance**: tutti gli ordini caricati una volta, filtro client-side (nessuna chiamata API per cambio filtro).

#### Caricamento dati

```
useEffect → fetchCustomer(erpId) → setCustomer
useEffect → customerService.getPhotoUrl(erpId) → setPhotoUrl
useEffect → getCustomerFullHistory(erpId) → setOrders
```

**Fetch parallelo** per le tre sorgenti.

---

## Componenti rimossi

| Componente | Stato | Note |
|------------|-------|-------|
| `CustomerSidebar.tsx` | Rimosso | Logica foto migrata a CustomerProfilePage |
| `CustomerInlineSection.tsx` | Rimosso | Sostituito da edit mode in CustomerProfilePage |
| `CustomerDetailPage.tsx` | Rimosso | Sostituito da CustomerProfilePage |
| Split-view in CustomerList | Rimosso | `selectedProfile` state eliminato |

## Componenti riutilizzati intatti

| Componente | Riutilizzo |
|------------|------------|
| `PhotoCropModal.tsx` | Invariato |
| `CustomerCreateModal.tsx` | Invariato |
| `customerService.uploadPhoto/deletePhoto/getPhotoUrl` | Invariato |
| `enqueueOperation` + polling | Invariato |

---

## File da creare / modificare

| File | Azione | Note |
|------|--------|-------|
| `frontend/src/pages/CustomerList.tsx` | Riscrittura | 648 → ~300 righe |
| `frontend/src/pages/CustomerProfilePage.tsx` | Nuovo | ~550 righe |
| `frontend/src/components/CustomerListSidebar.tsx` | Nuovo | ~100 righe — lista compatta per tablet/desktop |
| `frontend/src/pages/CustomerDetailPage.tsx` | Eliminato | |
| `frontend/src/components/CustomerSidebar.tsx` | Eliminato | |
| `frontend/src/components/CustomerInlineSection.tsx` | Eliminato | |
| `frontend/src/AppRouter.tsx` | Modifica | Route `:erpId` → CustomerProfilePage |
| `backend/src/operations/handlers/update-customer.ts` | Modifica | Estende UpdateCustomerData con county/state/country |
| `backend/src/operations/handlers/update-customer.spec.ts` | Modifica | Test per nuovi campi |

---

## Test

**Sub-A**:
- Unit test `update-customer` handler: verifica che `county`, `state`, `country` vengano passati al bot e scritti nel DB snapshot
- Test esistenti non rotti

**Sub-B**:
- `CustomerList.spec.tsx`: cerca, seleziona, lazy-load foto, naviga a profilo
- `CustomerProfilePage.spec.tsx`:
  - Render con/senza foto
  - Edit mode on/off
  - Accumulo modifiche (campo A + campo B → singolo update-customer con entrambi)
  - Storico ordini: filtro "Quest'anno" default, cambio filtro, tap ordine
  - Photo upload/delete

---

## Decisioni di design confermate

1. Nessuna split-view su nessun viewport
2. Mobile: navigate full-screen, tablet/desktop: list + profilo affiancati
3. Avatar circolare su mobile/tablet, quadrato (br-16px) su desktop
4. Icona 📷 sempre visibile sull'avatar (non solo hover)
5. Edit mode esplicito ("Modifica") — no tap accidentali
6. Batch deferred: un solo bot per tutte le modifiche accumulate
7. Storico ordini inline, anno corrente default, filtri chip, tap → /orders?orderId=
8. `window.confirm` mai usato — confirm inline o styled modal
