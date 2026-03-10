# Subclient Management UI — Design

## Obiettivo

Aggiungere al tab "Sottoclienti" dello Storico Fresis la possibilità di:
1. **Matching manuale** — collegare un sottocliente a un customer profile Archibald
2. **Modifica** — editare i campi di un sottocliente esistente
3. **Creazione** — creare un nuovo sottocliente con codice gap-filling
4. **Cancellazione** — eliminare un sottocliente con conferma

## Stato attuale

Il backend ha già tutte le API (CRUD + match/unmatch). Il frontend ha solo la visualizzazione read-only con ricerca, dettaglio modale, badge match, e bottone "Scollega".

### API esistenti

| Metodo | Path | Uso |
|--------|------|-----|
| GET | `/api/subclients` | Lista (con `?search=`) |
| POST | `/api/subclients` | Crea |
| PUT | `/api/subclients/:codice` | Modifica |
| DELETE | `/api/subclients/:codice` | Cancella |
| POST | `/api/subclients/:codice/match` | Matching manuale |
| DELETE | `/api/subclients/:codice/match` | Scollega |
| GET | `/api/customers?search=` | Ricerca clienti Archibald (per matching) |

## Design

### 1. Matching Manuale

- Bottone **"Collega"** sul badge rosso "Non matchato" nella card del sottocliente
- Click apre un **modale di ricerca clienti Archibald**:
  - Input di ricerca con debounce 300ms
  - Ricerca globale su TUTTI i campi del customer profile (nome, P.IVA, CF, indirizzo, telefono, email, PEC, SDI, città, ecc.) tramite `GET /api/customers?search=`
  - Lista risultati con: nome, P.IVA, indirizzo, telefono
  - Click su un risultato → `POST /api/subclients/:codice/match` con `customerProfileId` e confidence `manual`
- Badge diventa blu "Manuale"
- Refresh della lista sottoclienti dopo il match

### 2. Modale Dettaglio → Form Editabile

Il modale dettaglio attuale (read-only, griglia 2 colonne) viene esteso:

**Header:**
- Titolo con codice + ragione sociale
- Bottone **"Modifica"** (icona matita) → attiva modalità edit

**Modalità edit:**
- Tutti i campi diventano `<input>` editabili
- Il campo `codice` resta read-only (non modificabile)
- Footer con bottoni **"Salva"** (primario) e **"Annulla"**
- Salva → `PUT /api/subclients/:codice`
- Annulla → ripristina valori originali, torna a read-only

**Bottone "Elimina":**
- In fondo al modale, solo in modalità edit
- Stile rosso/danger
- Click → dialog di conferma ("Sei sicuro di voler eliminare il sottocliente X?")
- Conferma → `DELETE /api/subclients/:codice`
- Refresh lista dopo eliminazione

### 3. Creazione Nuovo Sottocliente

**Bottone "+ Nuovo":**
- Posizionato sopra la lista, accanto alla barra di ricerca
- Click → apre il modale dettaglio in modalità creazione

**Modalità creazione:**
- Campi vuoti, tutti editabili
- Campo `codice`: pre-compilato con il primo gap disponibile, editabile dall'utente
- Validazione unicità codice in tempo reale (check sulla lista caricata in memoria)
- Validazione server al salvataggio (409 se duplicato)
- `ragioneSociale` obbligatorio
- Salva → `POST /api/subclients`

### 4. Logica Gap-Filling per Codice

```
Input: codici esistenti ["C00001", "C00002", "C00004", "C00005"]
1. Estrai solo i codici con pattern C + cifre: [1, 2, 4, 5]
2. Trova il primo intero mancante nella sequenza: 3
3. Formatta: "C00003" (padded a 5 cifre con prefisso C)
Output: "C00003"
```

Se non ci sono gap, propone il prossimo numero dopo il massimo.

## File da modificare

### Frontend
- `frontend/src/components/SubclientsTab.tsx` — Bottone "Nuovo", bottone "Collega", modale edit/create
- `frontend/src/services/subclients.service.ts` — Aggiungere `deleteSubclient(codice)`
- `frontend/src/services/customers.service.ts` — Già ha `searchCustomers(query)`

### Backend
Nessuna modifica necessaria — tutte le API esistono.

## Note implementative

- Stile: inline `style={{}}` come tutto il frontend Archibald
- Il modale customer picker usa `GET /api/customers?search=query` con ricerca globale su 12 campi
- Il codice gap-filling è calcolato lato frontend sulla lista di subclients già caricata
- Nessuna paginazione aggiuntiva (il sistema attuale carica tutti i sottoclienti)
