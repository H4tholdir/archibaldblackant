# Update Customer — Redesign Completo

**Data:** 2026-03-27
**Stato:** Approvato, pronto per implementazione
**Sostituisce:** wizard modale `CustomerCreateModal` in edit mode

---

## 1. Obiettivi

1. Rimpiazzare il wizard step-by-step con un'interfaccia di modifica inline, rapida e contestuale.
2. Coprire tutti i 31 campi ERP (aggiungendo i 4 mancanti nel bot: settore, codice fiscale, all'attenzione di, note).
3. Generare uno snapshot garantito post-salvataggio (dati immediatamente in DB, senza aspettare sync background).
4. Bloccare il piazzamento degli ordini se mancano i campi obbligatori, con un flusso di completamento chirurgico.
5. Risolvere la mancanza di `vat_validated_at` per clienti mai modificati via bot.
6. Supportare nativamente mobile, tablet e desktop con layout dedicati.

---

## 2. Architettura — Nuove Route

| Route | Componente | Note |
|---|---|---|
| `/customers` | `CustomerListPage` (ridisegnata) | Sostituisce l'attuale lista con ricerca |
| `/customers/:customerProfile` | `CustomerDetailPage` (nuova) | Sostituisce la modal di edit |

La navigazione dalla lista alla scheda avviene con `router.push('/customers/:customerProfile')`. Il bottone back nella scheda torna a `/customers`.

---

## 3. Pagina Lista Clienti — `/customers`

### 3.1 Struttura comune a tutti i viewport
- **Topbar**: `← ` + titolo "Clienti" + nome agente a destra
- **Search bar**: ricerca full-text su nome, P.IVA, città (debounce 300ms, split per spazi = AND su ogni parola — comportamento esistente mantenuto)
- **Filtri**: Tutti (N) · ⚠ Incompleti (N) · Inattivi · Settore ▾
- **Stats bar**: totale clienti · n. schede incomplete · n. ordini in sospeso
- **Lista clienti**: ogni riga/card mostra avatar (foto o iniziali), nome, codice, città, badge stato, quick actions

### 3.2 Badge sulle card
- `b-ok` verde: "Completa ✓"
- `b-err` rosso: nome del campo mancante (es. "PEC mancante", "P.IVA non validata")
- `b-warn` giallo: "Inattivo N mesi" se ultimo ordine > 8 mesi fa (soglia `customer_inactive`)
- `b-info` blu: sconto %, listino se non standard

### 3.3 Quick actions inline sulla card
- 📞 Chiama — `tel:` link con numero principale
- 💬 WhatsApp — `https://wa.me/` link con numero mobile
Tap diretto senza aprire la scheda. Se il numero non è presente, icona disabilitata e grigia.

### 3.4 Breakpoint

**Mobile (< 640px)**
- Colonna singola
- Card compatta: avatar 32px, nome, sottotitolo, badge, 📞 💬 a destra con giorni-fa sotto
- Filtri scrollabili orizzontalmente in riga unica
- Tap su card → `/customers/:customerProfile` a schermo intero

**Tablet (641–1024px)**
- Griglia 2 colonne
- Card più ricca: numero di telefono visibile come bottone tappabile, 💬 WhatsApp esplicito
- Filtri visibili in riga, più estesi

**Desktop (> 1024px)**
- Split view: lista compatta a sinistra (38%), anteprima scheda V2 a destra (62%)
- Clic su riga seleziona e mostra anteprima; "Apri scheda completa →" porta alla route dedicata
- Riga selezionata: highlight blu a sinistra + sfondo `#eff6ff`

---

## 4. Scheda Cliente V2 — `/customers/:customerProfile`

### 4.1 Layout — Dashboard Split

**Sidebar sinistra (fissa, non scorre):**
- Foto cliente (upload manuale o iniziali come fallback, sfondo `#2d4a6b`, testo `#93c5fd`)
- Nome + codice cliente + settore
- Badge stato scheda (verde "Scheda completa" / arancione "⚠ Scheda incompleta")
- Azioni rapide verticali con valore visibile:
  - 📞 numero — sfondo `#253346`, testo `#93c5fd`, `tel:` link
  - 💬 WhatsApp — sfondo `#1a3a27`, testo `#86efac`, `https://wa.me/` link
  - ✉ email — sfondo `#1e3058`, testo `#93c5fd`, `mailto:` link
  - 📍 indirizzo — sfondo `#3a1a1a`, testo `#fca5a5`, Google Maps link (`https://maps.google.com/?q=`)
- Separatore + mini stats: ordini totali, giorni dall'ultima attività
- Bottone "+ Nuovo Ordine" viola (`#7c3aed`) in fondo alla sidebar

**Area destra (tab-based):**
- Tabs: **Dati** · **Ordini** · **Note** · **Indirizzi alt.**
- Badge rosso sulla tab "Dati" se ci sono campi obbligatori mancanti

**Tab Dati — sezioni inline editabili:**

| Sezione | Campi | Colonne griglia |
|---|---|---|
| Anagrafica | ragione sociale, alias, all'attenzione di, settore, codice fiscale | 2 col (desktop 3 col) |
| Dati Fiscali | P.IVA, IVA validata (readonly), data validazione (readonly), PEC, SDI | 2 col (desktop 3 col) |
| Contatti | telefono, mobile, email, URL | 2 col |
| Indirizzo principale | via, CAP, città, provincia, nazione | 2+2 col |
| Commerciale | listino, sconto linea, pagamento, gruppo prezzo | 2 col |
| Note | testo libero (CUSTINFO, max 4000 char) | full width |

**Tab Ordini:**
Mini-storico embedded — ultimi 20 ordini da `agents.order_records` per questo `customer_profile`. Colonne: data, numero ordine, importo (`total_amount`), stato. Click su riga → `/orders/:orderId`.

**Tab Note interne:**
Note private dell'agente sul cliente (es. "chiama solo al mattino", "preferisce ordini piccoli"). Distinte da `CUSTINFO` (note ERP nella sezione Dati). Non sincronizzate con Archibald. Persistite in colonna `agent_notes TEXT` in `agents.customers` (nuova, se non presente).

**Tab Indirizzi alt.:**
CRUD indirizzi alternativi (comportamento attuale mantenuto, già funzionante).

### 4.2 Editing inline per sezione

Ogni sezione ha un bottone **"✏ Modifica"** che la rende editabile in-place:
- Background cambia a `#eff6ff` (editing normale) o `#fff5f5` (sezione con errori)
- Bottone diventa **"✓ Salva sezione"** (verde)
- Salva solo i campi della sezione corrente → chiama bot → genera snapshot
- Errori di validazione mostrati inline sotto il campo
- "Modifica tutto" in header apre tutte le sezioni contemporaneamente

**Regole di salvataggio:**
- **Save sezione singola** → una chiamata bot con solo i campi della sezione modificata (i campi non toccati vengono passati come `undefined` e il bot li salta). Post-bot: snapshot completo.
- **"Modifica tutto" + Salva tutto** → una singola chiamata bot con tutti i campi modificati in batch — non N chiamate separate.
- Ogni save (singolo o globale) genera uno snapshot completo (28 campi) tramite `buildCustomerSnapshot()` post-bot.
- `bot_status = 'snapshot'` dopo save; `'placed'` dopo sync background.
- Lo snapshot include `vatValidated` e `vatValidatedAt` letti dall'ERP al momento del save.

### 4.3 Breakpoint

**Mobile (< 640px)**
- Sidebar assente: sostituita da header compatto (avatar 40px, nome, stato) + strip stats (ordini/attività/ultimo importo) + barra azioni rapide stile WhatsApp (icone in fila orizzontale con etichetta sotto)
- Tabs → menu a tendina (select nativo)
- Sezioni in colonna singola (full width)
- Banner errore in cima alla lista sezioni: "⚠ PEC o SDI mancante — Completa →"
- Griglia sezioni: 1 colonna

**Tablet (641–1024px)**
- Sidebar presente, più stretta (36%): foto, stato, azioni rapide con valore visibile, stats, bottone ordine
- Tabs orizzontali visibili
- Griglia sezioni: 2 colonne
- Bottom sheet Q1 a 2 colonne per il Quick Fix

**Desktop (> 1024px)**
- Sidebar piena (32%): foto grande, tutte le azioni con valore leggibile, stats
- Tabs orizzontali
- Griglia sezioni: fino a 3 colonne per Dati Fiscali e Anagrafica
- Spotlight Modal Q2 per il Quick Fix

---

## 5. Quick Fix — Completamento Chirurgico Campi Obbligatori

### 5.1 Trigger
Compare in questi contesti:
1. Selezione cliente durante creazione ordine → il cliente ha campi obbligatori mancanti
2. Click "Piazza ordine" in pending orders → il cliente non è stato completato
3. Click "Completa →" dal banner errore nella scheda cliente

### 5.2 Campi obbligatori che bloccano l'ordine
- `name` — ragione sociale
- `vatNumber` — P.IVA
- `vatValidatedAt IS NOT NULL` — P.IVA validata
- almeno uno tra `pec` e `sdi`
- `street` — indirizzo
- `postalCode` — CAP
- `postalCodeCity` — città

### 5.3 Comportamento

Il Quick Fix mostra **solo i campi mancanti** tra i 7 obbligatori. Mai l'intero form.

**Mobile e Tablet (< 1024px) → Q1 Bottom Sheet:**
- Sale dal basso con handle pill
- Sfondo pagina visibile e sfumato (overlay `rgba(15,23,42,0.5)`)
- Titolo: "Completa prima di procedere" + sottotitolo con nome cliente
- Campi mancanti in colonna (mobile) o 2 colonne (tablet)
- CTA: "Salva e continua con l'ordine" (blu, full width)
- Link secondario: "Annulla"

**Desktop (> 1024px) → Q2 Spotlight Modal:**
- Overlay scuro (`rgba(15,23,42,0.75)`)
- Modal centrata, max-width 340px, `border-radius: 10px`
- Header rosso chiaro (`#fff5f5`): icona ⛔ + "Ordine bloccato" + nome cliente
- Campi in griglia 2 colonne
- Footer: "Annulla" (ghost) · "Salva e continua →" (blu)

**Dopo il salvataggio:** il blocco viene rimosso, il flusso riprende automaticamente dal punto di interruzione.

---

## 6. Bot — Campi Aggiuntivi in `updateCustomer`

I seguenti 4 campi vengono aggiunti al bot `updateCustomer` (da `undefined` a scritti):

| Campo UI | Selector ERP | Tipo | Note |
|---|---|---|---|
| Settore | `dviBUSINESSSECTORID_Edit_dropdown_DD_I` | dropdown | 5 opzioni: Florovivaismo, Retail, ecc. — usa `setDevExpressComboBox` |
| Codice Fiscale | `dviFISCALCODE_Edit_I` | text | `typeDevExpressField` |
| All'attenzione di | `dviBRASCRMATTENTIONTO_Edit_I` | text | `typeDevExpressField` |
| Note (CUSTINFO) | `dviCUSTINFO_Edit_I` | textarea | `typeDevExpressField`, max 4000 char |

**Ordine di scrittura nel bot** (invariato rispetto a createCustomer v2, per evitare conflitti con lookup iframe):
1. Campi text semplici (nome, alias, attenzione, CF, note)
2. Dropdown (settore, modalità consegna, sconto linea)
3. Lookup iframe (CAP → attende doppio waitIdle; payment terms)
4. P.IVA → attesa validazione async (20–28s)
5. PEC, SDI
6. Contatti (tel, mobile, email, url)

### 6.1 Snapshot post-update

`updateCustomer` nel bot restituisce `CustomerSnapshot` (stesso tipo di `createCustomer`).
L'handler `handleUpdateCustomer` chiama `buildCustomerSnapshot()` e persiste i dati in DB.
`bot_status` viene impostato a `'snapshot'` (non `'placed'`).

---

## 7. Validazione IVA — Lazy Enrichment

### Problema
`vat_validated_at` è `NULL` per tutti i clienti che non hanno mai passato per una sessione bot di modifica. Il sync background non legge questo campo.

### Soluzione in 2 livelli

**Livello 1 — Snapshot post-update (già coperto dal §6.1):**
Ogni volta che si modifica un cliente, il bot legge e persiste `vatValidated` + `vatValidatedAt`.

**Livello 2 — Lazy enrichment al primo accesso scheda:**
Quando `/customers/:customerProfile` viene caricato e `vat_validated_at IS NULL`:
1. Il frontend chiama `GET /api/customers/:customerProfile/vat-status` (nuova route)
2. Il backend enqueue un job leggero `read-vat-status` (bassa priorità, BullMQ)
3. Il job apre la scheda cliente in ERP, legge `VATVALIEDE` + `VATLASTCHECKEDDATE`, chiude
4. Persiste in DB via `updateVatValidatedAt()`
5. Il frontend riceve aggiornamento via WebSocket e aggiorna il badge IVA

**Throttling:** max 1 job `read-vat-status` per agente in parallelo, deduplicato per `customerProfile` con jobId statico `vat-status-{userId}-{customerProfile}`.

**Non blocking:** l'utente non aspetta. La scheda si apre normalmente, il badge IVA mostra "In lettura…" e si aggiorna quando il job termina.

---

## 8. Foto Cliente

- Upload manuale dal bottone sulla foto (📷) nella sidebar/header
- Persistita in DB come URL o base64 nella tabella `agents.customers` (colonna esistente o nuova `photo_url`)
- Fallback: quadrato con iniziali (prime 2 lettere ragione sociale), sfondo `#2d4a6b`, testo `#93c5fd`
- Stessa gestione foto già presente altrove nella PWA — riusare il pattern esistente

---

## 9. Blocco Ordine — Logica Backend

Nuova funzione `isCustomerComplete(customer): boolean` nel repository customers:

```typescript
function isCustomerComplete(c: Customer): boolean {
  return !!(
    c.name &&
    c.vatNumber &&
    c.vatValidatedAt &&
    (c.pec || c.sdi) &&
    c.street &&
    c.postalCode &&
    c.postalCodeCity
  )
}
```

Il blocco viene applicato nei seguenti punti:
1. `POST /api/orders` — se `!isCustomerComplete(customer)` → `400` con lista campi mancanti
2. Route `submit-order` (bot) — stessa verifica pre-submit
3. Frontend — prima di mostrare il bottone "Piazza ordine", verifica via `customer.completeness` (campo calcolato o recomputed)

---

## 10. Componenti Frontend da Creare / Modificare

| Componente | Azione | Note |
|---|---|---|
| `CustomerListPage.tsx` | Modifica | Ridisegnata: breakpoint, griglia, quick actions, filtro incompleti |
| `CustomerDetailPage.tsx` | Nuovo | Dashboard Split V2 — route `/customers/:customerProfile` |
| `CustomerSidebar.tsx` | Nuovo | Sidebar fissa con foto, azioni, stats |
| `CustomerDataTabs.tsx` | Nuovo | Tabs: Dati, Ordini, Note, Indirizzi |
| `CustomerInlineSection.tsx` | Nuovo | Sezione con Modifica/Salva, supporta edit/view mode |
| `CustomerOrdersTab.tsx` | Nuovo | Mini-storico ultimi 20 ordini da `order_records` |
| `CustomerQuickFix.tsx` | Nuovo | Bottom Sheet (mobile/tablet) + Spotlight Modal (desktop), responsive |
| `CustomerCard.tsx` | Modifica | Aggiunta quick actions 📞 💬, badge potenziati |
| `CustomerCreateModal.tsx` | Modifica | Rimuovere branch `isEditMode` e tutto il codice edit — ora gestito da `CustomerDetailPage` |

---

## 11. Modifiche Backend

| File | Azione | Note |
|---|---|---|
| `archibald-bot.ts` | Modifica | `updateCustomer`: aggiungere settore, fiscalCode, attentionTo, notes. Restituire `CustomerSnapshot` |
| `update-customer.ts` | Modifica | Chiamare `buildCustomerSnapshot()` post-bot, settare `bot_status='snapshot'` |
| `customers.ts` (routes) | Modifica | Aggiungere `GET /:customerProfile/vat-status`, blocco ordine in create |
| `customers.ts` (repository) | Modifica | Aggiungere `isCustomerComplete()`, `updateCustomerSnapshot()` |
| `read-vat-status.ts` | Nuovo | Handler BullMQ per lazy enrichment IVA (bassa priorità) |
| `orders.ts` (routes) | Modifica | Verifica `isCustomerComplete` prima di submit |

---

## 12. Migrazioni DB

Nessuna migrazione necessaria: tutti i campi rilevanti (`sector`, `price_group`, `line_discount`, `payment_terms`, `notes`, `name_alias`, `county`, `state`, `country`, `vat_validated_at`) sono presenti dalla migrazione `037-customer-extended-fields.sql`.

Eventuale aggiunta: `photo_url TEXT` in `agents.customers` se non già presente.

---

## 13. Invarianti del Design (vincolanti)

1. **Fedeltà viewport**: ogni componente ha comportamento esplicito per `< 640px`, `641–1024px`, `> 1024px`.
2. **Snapshot garantito**: nessun save bot senza snapshot post-update. Mai `bot_status='placed'` senza snapshot.
3. **Quick Fix non sostituisce la scheda completa**: mostra solo i 7 campi obbligatori. Link "Vai alla scheda completa →" sempre presente.
4. **Sidebar non scorre**: su tablet e desktop la sidebar è sticky — le azioni rapide sono sempre raggiungibili anche durante l'editing.
5. **Dati reali nei mockup companion**: i file HTML in `.superpowers/brainstorm/` sono la spec visiva vincolante. L'implementazione deve riprodurli identicamente.
6. **Colori e stile**: topbar `#1e293b`, blu primario `#2563eb`, errore `#ef4444`, successo `#16a34a`, viola ordine `#7c3aed`, sidebar scura `#1e293b`, sfondo sezione editing `#eff6ff`, errore sezione `#fff5f5`.

---

## 14. File Mockup Companion (riferimento visivo vincolante)

Tutti i file sono in `.superpowers/brainstorm/81392-1774630574/content/`:

| File | Contenuto |
|---|---|
| `list-responsive.html` | Lista Clienti — Mobile / Tablet / Desktop |
| `detail-responsive.html` | Scheda V2 — Mobile / Tablet / Desktop + Quick Fix per viewport |
| `customers-flow.html` | Flow Lista → Scheda con freccia di navigazione |
| `customer-detail-versions.html` | Le 3 versioni iniziali (V2 approvata) |
| `quickfix-alternatives.html` | Le 3 alternative Quick Fix (Q1+Q2 approvati) |
