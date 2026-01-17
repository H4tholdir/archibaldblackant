# Customer Section - Testing Guide

## Problema Identificato e Risolto

### Bug Originale
**Sintomo**: Dopo aver completato la sincronizzazione clienti, la lista rimaneva bloccata su "Caricamento clienti..." infinitamente.

**Causa Root**:
1. L'endpoint `/api/customers/sync` nel backend risponde **immediatamente** con "Sincronizzazione avviata" senza aspettare il completamento
2. La sync avviene in **background** (asincrona)
3. Il frontend chiamava `fetchCustomers()` subito dopo la risposta dell'endpoint, **prima che la sync fosse completata**
4. Risultato: DB ancora vuoto quando fetchCustomers() veniva chiamato

### Soluzione Implementata
**Sistema di Polling con Progress Modal**:
1. Nuovo hook `useCustomerSync` che gestisce lo stato della sync con polling
2. Nuovo componente `CustomerSyncModal` che mostra progress in tempo reale
3. Polling dell'endpoint `/api/customers/sync-status` ogni 2 secondi
4. `fetchCustomers()` viene chiamato **solo dopo** che la sync è completata
5. Modal mostra: pagina corrente, totale pagine, clienti elaborati, barra di progresso

---

## File Modificati e Creati

### File Nuovi
1. **`frontend/src/hooks/useCustomerSync.ts`** - Hook per gestire sync con polling
2. **`frontend/src/components/CustomerSyncModal.tsx`** - Modal di progresso sync
3. **`.planning/CUSTOMER-SECTION-TESTING.md`** - Questa guida

### File Modificati
1. **`frontend/src/pages/CustomerList.tsx`** - Integrato nuovo sistema di sync
   - Aggiunto import di `CustomerSyncModal` e `useCustomerSync`
   - Sostituito stato `syncing` con `syncProgress` e `syncModalOpen`
   - Aggiornato `handleForceSync()` per usare polling
   - Aggiunto CustomerSyncModal nel rendering

---

## Test Plan

### Test 1: Sync Clienti (Scenario Normale)
**Pre-condizioni:**
- Backend running
- Frontend running
- Utente loggato
- Database ha clienti da sincronizzare

**Steps:**
1. Aprire la pagina `/customers` nel browser
2. Verificare che i clienti esistenti vengano caricati correttamente
3. Click sul bottone "🔄 Sincronizza"
4. **Verifica Modal appare con:**
   - Titolo: "Sincronizzazione Clienti"
   - Icona animata ⏳
   - Messaggio: "Avvio sincronizzazione..."
   - Progress bar al 10%
5. **Durante la sync, verifica che il modal mostri:**
   - Pagina corrente / totale pagine
   - Numero clienti elaborati
   - Progress bar che avanza (es. 45%, 67%, 89%)
   - Messaggio "La sincronizzazione può richiedere alcuni minuti..."
6. **Quando la sync completa:**
   - Progress bar raggiunge 100%
   - Icona cambia a ✅
   - Titolo: "Sincronizzazione Completata"
   - Messaggio verde: "Sincronizzazione completata con successo! X clienti sincronizzati."
   - Bottone: "✓ Completato"
7. Click su "✓ Completato" o sul backdrop
8. **Verifica che:**
   - Modal si chiude
   - Lista clienti si ricarica automaticamente
   - Nuovi clienti (se aggiunti su Archibald) appaiono nella lista

**Risultato Atteso:**
- Sync completa con successo
- Feedback visuale chiaro e progressivo
- Lista aggiornata automaticamente senza bisogno di refresh manuale

---

### Test 2: Sync con Database Vuoto (First Sync)
**Pre-condizioni:**
- Database clienti vuoto o molto vecchio
- Molti clienti da scaricare da Archibald (>100)

**Steps:**
1. (Opzionale) Cancellare il database: `rm archibald-web-app/backend/data/customers.db`
2. Riavviare backend
3. Aprire `/customers`
4. Dovrebbe mostrare "Nessun cliente nel database"
5. Click su "🔄 Sincronizza"
6. **Verifica che il modal mostri:**
   - Progress con pagine elaborate (es. "pagina 3 di 15")
   - Numero crescente di clienti elaborati
   - Progress bar che avanza proporzionalmente

**Risultato Atteso:**
- Sync completa scaricando tutti i clienti
- Progress mostra accuratamente l'avanzamento su più pagine
- Al termine, lista popolata con tutti i clienti

---

### Test 3: Sync Durante un'Altra Operazione (Edge Case)
**Pre-condizioni:**
- Un'altra sync è in corso

**Steps:**
1. Avviare una sync
2. Mentre il modal è visibile e sync in corso
3. Provare a cliccare di nuovo "🔄 Sincronizza"

**Risultato Atteso:**
- Bottone "🔄 Sincronizza" è **disabilitato** durante la sync
- Mostra "⏳ Sincronizzazione..." ma non è cliccabile
- Non è possibile avviare doppie sync

---

### Test 4: Errore Durante Sync
**Pre-condizioni:**
- Backend running ma Archibald irraggiungibile (o credenziali sbagliate)

**Steps:**
1. (Per simulare) Spegnere il browser pool o modificare temporaneamente le credenziali
2. Click su "🔄 Sincronizza"
3. **Verifica che il modal mostri:**
   - Icona cambia a ⚠️ quando si verifica l'errore
   - Titolo: "Errore Sincronizzazione"
   - Box rosso con messaggio di errore specifico
   - Bottone rosso "Chiudi"
4. Click su "Chiudi"
5. Verifica che il modal si chiuda
6. Verifica che nella pagina appaia un messaggio di errore

**Risultato Atteso:**
- Errore gestito gracefully
- Messaggio chiaro all'utente
- Possibilità di riprovare

---

### Test 5: Chiusura Modal Durante Sync (Non Permesso)
**Steps:**
1. Avviare sync
2. Mentre sync in corso, provare a:
   - Cliccare sul backdrop (fuori dal modal)
   - Premere ESC (se implementato)

**Risultato Atteso:**
- Modal **NON si chiude** durante la sync
- Si chiude solo quando completa o va in errore
- Bottone "X" o "Chiudi" non presente durante sync

---

### Test 6: Filtri e Ricerca Clienti
**Steps:**
1. Aprire `/customers` con lista popolata
2. **Test ricerca:**
   - Digitare nel campo "Cerca cliente..."
   - Verificare che la lista si filtri in tempo reale (debounce 300ms)
   - Provare ricerche parziali (es. "Mario" trova "Mario Rossi")
3. **Test filtro città:**
   - Selezionare una città dal dropdown
   - Verificare filtro applicato correttamente
4. **Test filtro tipo cliente:**
   - Selezionare un tipo cliente
   - Verificare filtro applicato
5. **Test combinazione filtri:**
   - Applicare ricerca + città + tipo
   - Verificare che tutti i filtri lavorino insieme
6. **Test reset filtri:**
   - Click su "✕ Cancella filtri"
   - Verificare che tutti i filtri vengano rimossi

**Risultato Atteso:**
- Filtri funzionano singolarmente e in combinazione
- Ricerca è case-insensitive e supporta match parziali
- Reset ripristina tutti i filtri

---

### Test 7: Espansione Customer Card
**Steps:**
1. Click su una customer card
2. Verificare che si espanda mostrando:
   - 📄 Dati Fiscali (P.IVA, CF, SDI, PEC)
   - 📞 Contatti (Tel, Mobile, URL, Attenzione)
   - 📍 Indirizzo (Via, CAP, Città, Logistica)
   - 💼 Info Commerciali (Tipo, Termini consegna)
   - 📊 Storico Ordini (Data ultimo, Ordini totali, Vendite)
   - Bottone "✏️ Modifica"
3. Click di nuovo sulla card per chiuderla
4. Verificare che solo una card alla volta può essere espansa

**Risultato Atteso:**
- Espansione smooth con animazione
- Tutti i dati del cliente visibili
- Icon "▼" ruota quando espansa

---

### Test 8: Autenticazione e Autorizzazione
**Steps:**
1. **Test non autenticato:**
   - Aprire `/customers` senza essere loggati
   - Verificare redirect a login o messaggio di errore
2. **Test token scaduto:**
   - Login
   - Far scadere il token (o rimuoverlo dal localStorage)
   - Refresh `/customers`
   - Verificare messaggio "Sessione scaduta. Effettua il login."

**Risultato Atteso:**
- Endpoint protetti richiedono autenticazione
- Token scaduto gestito gracefully
- Redirect appropriati

---

### Test 9: Responsive Design
**Steps:**
1. Testare la pagina clienti su diversi device:
   - Desktop (>1200px)
   - Tablet (768px - 1200px)
   - Mobile (320px - 767px)
2. Verificare che:
   - Filtri si adattino al layout
   - Customer cards siano leggibili
   - Modal sync sia centrato e leggibile
   - Bottoni siano facilmente cliccabili su mobile

**Risultato Atteso:**
- Layout responsive su tutti i dispositivi
- No overflow orizzontale
- Elementi touch-friendly su mobile

---

### Test 10: Performance con Molti Clienti
**Pre-condizioni:**
- Database con 1000+ clienti

**Steps:**
1. Aprire `/customers`
2. Verificare tempo di caricamento iniziale
3. Testare scroll della lista
4. Applicare filtri di ricerca
5. Espandere/chiudere cards

**Risultato Atteso:**
- Caricamento iniziale < 2 secondi
- Scroll fluido senza lag
- Filtri responsivi (debounced)
- No memory leaks su espansione ripetuta cards

---

## API Endpoints Coinvolti

### 1. `GET /api/customers`
**Descrizione:** Recupera lista clienti (con filtri opzionali)

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `search` (optional): Stringa di ricerca per nome cliente
- `city` (optional): Filtra per città
- `type` (optional): Filtra per tipo cliente
- `limit` (optional): Numero max di risultati (default: 100)

**Response:**
```json
{
  "success": true,
  "data": {
    "customers": [...],
    "total": 1452
  },
  "message": "1452 clienti disponibili",
  "metadata": {
    "totalCount": 1452,
    "lastSync": "2026-01-17T12:27:32.976Z",
    "returnedCount": 1452
  }
}
```

---

### 2. `POST /api/customers/sync`
**Descrizione:** Avvia sync clienti da Archibald (background)

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response Immediata:**
```json
{
  "success": true,
  "message": "Sincronizzazione avviata"
}
```

**Note:**
- Risposta IMMEDIATA, sync avviene in background
- Non aspettare il completamento dalla risposta

---

### 3. `GET /api/customers/sync-status`
**Descrizione:** Ottiene stato corrente della sync

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response Durante Sync:**
```json
{
  "success": true,
  "data": {
    "status": "syncing",
    "currentPage": 3,
    "totalPages": 15,
    "customersProcessed": 45,
    "message": "Sincronizzazione in corso pagina 3/15",
    "totalCustomersInDb": 120,
    "lastSyncTime": "2026-01-17T12:27:32.976Z"
  }
}
```

**Response Completata:**
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "currentPage": 15,
    "totalPages": 15,
    "customersProcessed": 225,
    "message": "Sincronizzazione completata",
    "totalCustomersInDb": 225,
    "lastSyncTime": "2026-01-17T12:35:18.123Z"
  }
}
```

**Response Errore:**
```json
{
  "success": true,
  "data": {
    "status": "error",
    "error": "Impossibile connettersi ad Archibald",
    "message": "Errore durante la sincronizzazione",
    ...
  }
}
```

**Status Values:**
- `"idle"`: Nessuna sync in corso
- `"syncing"`: Sync attiva
- `"completed"`: Completata con successo
- `"error"`: Errore durante la sync

---

## Checklist Pre-Deploy

Verificare che tutti questi punti siano OK prima del deploy in produzione:

- [ ] ✅ Build frontend passa senza errori
- [ ] ✅ Prettier formatta tutti i file modificati
- [ ] ✅ TypeScript compila senza errori
- [ ] ✅ Test 1-10 passano tutti
- [ ] ✅ Modal sync mostra progress correttamente
- [ ] ✅ Polling funziona (verificare network tab in DevTools)
- [ ] ✅ Lista clienti si ricarica dopo sync completata
- [ ] ✅ Filtri funzionano correttamente
- [ ] ✅ Customer cards espandono/collassano correttamente
- [ ] ✅ Errori gestiti gracefully
- [ ] ✅ Responsive design su mobile/tablet
- [ ] ✅ Performance accettabile con 1000+ clienti
- [ ] ✅ Commit message segue Conventional Commits
- [ ] ✅ GitHub Actions CD workflow passa

---

## Comandi Utili per Testing

### Start Backend Locale
```bash
cd archibald-web-app/backend
npm run dev
```

### Start Frontend Locale
```bash
cd archibald-web-app/frontend
npm run dev
```

### Build Frontend
```bash
cd archibald-web-app/frontend
npm run build
```

### Check API Health
```bash
curl http://localhost:3000/api/health | jq '.'
```

### Get Customer Count
```bash
curl http://localhost:3000/api/customers | jq '.metadata'
```

### Get Sync Status
```bash
curl -H "Authorization: Bearer <YOUR_JWT>" http://localhost:3000/api/customers/sync-status | jq '.'
```

### Trigger Manual Sync
```bash
curl -X POST -H "Authorization: Bearer <YOUR_JWT>" http://localhost:3000/api/customers/sync
```

### Reset Customer Database (Testing)
```bash
rm archibald-web-app/backend/data/customers.db
# Restart backend - will recreate empty DB
```

---

## Note Tecniche

### Hook `useCustomerSync`
**Responsabilità:**
- Gestisce stato della sync (idle/syncing/completed/error)
- Esegue polling di `/api/customers/sync-status` ogni 2 secondi
- Stoppa polling quando sync completa o va in errore
- Cleanup automatico dell'interval su unmount

**Stati:**
```typescript
interface CustomerSyncProgress {
  isRunning: boolean;
  status: "idle" | "syncing" | "completed" | "error";
  message: string;
  customersProcessed: number;
  currentPage: number;
  totalPages: number;
  error?: string | null;
}
```

### Componente `CustomerSyncModal`
**Features:**
- Modal overlay fullscreen con backdrop blur
- Progress bar animata (0-100%)
- Icone animate (⏳ pulse, ⚠️ shake, ✅ static)
- Chiusura permessa solo su completed/error
- Click sul backdrop chiude solo se completato

### Componente `CustomerList`
**Stati Principali:**
- `customers`: Array dei clienti caricati
- `loading`: Loading iniziale della lista
- `syncProgress`: Stato della sync (da useCustomerSync)
- `syncModalOpen`: Visibilità del modal
- `filters`: Filtri applicati (search, city, customerType)
- `expandedCustomerId`: ID della card espansa

---

## Troubleshooting

### Modal Sync Rimane Bloccato
**Sintomo:** Modal mostra "Sincronizzazione in corso..." ma non completa
**Cause Possibili:**
1. Backend crashato durante sync
2. Endpoint `/api/customers/sync-status` non risponde
3. Polling interval non pulito correttamente

**Debug:**
1. Aprire DevTools → Network tab
2. Verificare che le richieste a `/api/customers/sync-status` vengano fatte ogni 2s
3. Controllare backend logs: `docker compose logs -f backend`
4. Verificare stato sync manualmente con curl

**Fix:**
- Chiudere e riaprire il modal
- Refresh della pagina
- Riavviare backend se necessario

---

### Lista Clienti Non Si Carica
**Sintomo:** Spinner infinito su "Caricamento clienti..."
**Cause Possibili:**
1. Token JWT scaduto o mancante
2. Endpoint `/api/customers` non risponde
3. Database vuoto e nessuna sync eseguita
4. Errore di rete

**Debug:**
1. Aprire DevTools → Console per vedere errori
2. Verificare Network tab per vedere response di `/api/customers`
3. Verificare token in localStorage: `localStorage.getItem("archibald_jwt")`
4. Testare endpoint con curl

**Fix:**
- Fare logout/login per ottenere nuovo token
- Eseguire una sync per popolare il database
- Controllare connessione di rete

---

### Filtri Non Funzionano
**Sintomo:** Digitando nel campo search, la lista non si filtra
**Cause Possibili:**
1. Debounce delay (normale - aspettare 300ms)
2. Backend non supporta parametro search
3. JavaScript error nel componente

**Debug:**
1. Controllare console per errori
2. Verificare che il parametro `?search=` venga passato nella query string
3. Testare endpoint con curl: `curl "http://localhost:3000/api/customers?search=mario"`

---

## Metriche di Successo

### Performance
- **Tempo caricamento iniziale:** < 2 secondi per 1000 clienti
- **Tempo risposta filtri:** < 500ms dopo debounce
- **Tempo sync completa:** ~1-3 minuti per 200-300 clienti (dipende da Archibald)

### UX
- **Feedback visivo:** Modal appare entro 100ms dal click
- **Progress update:** Ogni 2 secondi durante sync
- **Clarity:** Utente sa sempre cosa sta succedendo (% completamento, pagine elaborate)

### Reliability
- **Success rate sync:** > 95%
- **Error handling:** 100% degli errori mostrati con messaggio chiaro
- **No data loss:** Database sempre consistente anche in caso di errore

---

## Documentazione di Riferimento

### File da Leggere
- `frontend/src/hooks/useCustomerSync.ts` - Logica polling e stati
- `frontend/src/components/CustomerSyncModal.tsx` - UI modal sync
- `frontend/src/pages/CustomerList.tsx` - Pagina principale clienti
- `backend/src/customer-sync-service.ts` - Backend sync service
- `backend/src/index.ts` - API endpoints (linee 660-811)

### Related Issues
- **Issue Originale:** "Lista clienti non si carica dopo sync"
- **Root Cause:** Sync asincrona + fetchCustomers() chiamato troppo presto
- **Soluzione:** Sistema di polling con progress modal

---

**Ultima modifica:** 2026-01-17
**Autore:** Claude Sonnet 4.5
**Versione:** 1.0
