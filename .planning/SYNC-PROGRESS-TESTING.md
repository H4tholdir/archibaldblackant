# Testing Guide: Sync Progress Feature

## 📋 Overview

Questo documento descrive come testare la nuova funzionalità di progresso della sincronizzazione ordini con feedback visivo in tempo reale.

## 🎯 Feature Implementate

### 1. **Sync Normale** (`/api/orders/force-sync`)
- Cancella la cache degli ordini dell'utente corrente
- Scarica nuovamente tutti gli ordini da Archibald
- Mantiene gli ordini esistenti nel database per altri utenti

### 2. **Reset DB + Sync** (`/api/orders/reset-and-sync`)
- **Solo Admin**: Cancella TUTTI gli ordini dal database
- Esegue una sincronizzazione completa dall'inizio dell'anno
- Richiede conferma utente

## 🧪 Test Plan

### Pre-requisiti
1. Backend e Frontend buildati e in esecuzione
2. Accesso all'applicazione su https://formicanera.com o localhost
3. Credenziali di test (user normale e admin)

---

## Test 1: Sync Normale (User Normale)

### Setup
1. Login come utente normale
2. Naviga a **📦 Storico Ordini**

### Steps
1. Click sul pulsante **🔄 Sincronizza**
2. Osserva l'apertura del modale di progresso

### Expected Behavior

#### Modale di Progresso
✅ **Apertura Immediata**: Il modale appare subito dopo il click
✅ **Header Animato**: Icona ⏳ con animazione pulsante
✅ **Titolo**: "Sincronizzazione Ordini"

#### Fasi di Progresso (in ordine)
1. **Connessione (10%)**
   - Messaggio: "Connessione ad Archibald..."
   - Durata: ~0.5s

2. **Scraping (20%)**
   - Messaggio: "Lettura ordini da Archibald..."
   - Durata: variabile (dipende dal numero di ordini)

3. **Processing (60%)**
   - Messaggio: "Elaborazione completata: X ordini"
   - Mostra numero ordini sincronizzati
   - Durata: ~1s

4. **Sync States (75%)**
   - Messaggio: "Sincronizzazione stati ordini..."
   - Durata: ~1-2s

5. **Finalizing (90%)**
   - Messaggio: "Completamento sincronizzazione..."
   - Durata: ~0.5s

6. **Completed (100%)**
   - Messaggio: "Sincronizzazione completata con successo! X ordini sincronizzati."
   - Bottone verde: "✓ Completato"

#### Durante il Processo
✅ **Barra di progresso**: Si aggiorna fluidamente
✅ **Percentuale**: Visualizzata sotto la barra
✅ **Contatore ordini**: Mostrato quando disponibile
✅ **Info box**: Suggerimento "Non chiudere la finestra"
✅ **Backdrop blur**: Sfondo leggermente sfocato
✅ **Non chiudibile**: Click sul backdrop non chiude il modale durante il processo

#### Al Completamento
✅ **Bottone verde**: "✓ Completato" appare
✅ **Click bottone**: Chiude il modale
✅ **Lista ordini**: Si aggiorna automaticamente con i nuovi dati
✅ **Backdrop click**: Ora chiude il modale

---

## Test 2: Sync con Errore

### Setup
1. **Opzione A**: Disconnetti Archibald o simula errore di rete
2. **Opzione B**: Usa un token JWT scaduto

### Steps
1. Click sul pulsante **🔄 Sincronizza**
2. Attendi che l'errore si verifichi

### Expected Behavior

#### Errore During Sync
✅ **Icona cambia**: ⏳ → ⚠️ con animazione shake
✅ **Titolo cambia**: "Errore Sincronizzazione" (colore rosso)
✅ **Box errore**: Sfondo rosso chiaro con bordo rosso
✅ **Messaggio errore**: Messaggio specifico (es. "Sessione scaduta", "Errore di rete")
✅ **Bottone rosso**: "Chiudi"
✅ **Barra progresso**: Nascosta

#### Al Click su "Chiudi"
✅ **Modale si chiude**
✅ **Messaggio errore**: Appare anche nella pagina principale (in alto)
✅ **Lista ordini**: Non cambia (mantiene dati precedenti)

---

## Test 3: Reset DB + Sync (Solo Admin)

### Setup
1. Login come **admin**
2. Naviga a **📦 Storico Ordini**
3. Verifica che il bottone **🗑️ Reset DB e Forza Sync** sia visibile

### Steps
1. Click sul pulsante **🗑️ Reset DB e Forza Sync**
2. Conferma il dialog di avviso
3. Osserva il processo

### Expected Behavior

#### Dialog di Conferma
✅ **Messaggio warning**: "⚠️ ATTENZIONE: Questa operazione cancellerà TUTTI gli ordini..."
✅ **Bottoni**: OK / Annulla
✅ **Click Annulla**: Nessuna azione

#### Modale di Progresso (dopo OK)
✅ **Titolo**: "Reset e Sincronizzazione" (diverso dal sync normale)
✅ **Fase Scraping (20%)**: Messaggio "Reset database in corso..."
✅ **Resto**: Identico al sync normale

#### Al Completamento
✅ **Messaggio successo**: Include numero di ordini sincronizzati
✅ **Lista ordini**: Completamente aggiornata con tutti gli ordini dall'inizio anno
✅ **Cache pulita**: Tutti gli ordini vecchi rimossi

---

## Test 4: Multiple Sync (Protezione Concorrenza)

### Setup
1. Login come utente
2. Naviga a **📦 Storico Ordini**

### Steps
1. Click **🔄 Sincronizza**
2. Mentre il modale è aperto, prova a:
   - Premere di nuovo il bottone Sincronizza
   - Navigare ad altre pagine
   - Click sul backdrop

### Expected Behavior

#### Durante Sync Attivo
✅ **Bottone disabilitato**: Pulsante "Sincronizza" è disabilitato (grigio)
✅ **Testo cambia**: "⏳ Sincronizzazione..." invece di "🔄 Sincronizza"
✅ **Cursor**: `not-allowed` quando hover sul bottone
✅ **Backdrop non chiude**: Click fuori dal modale non lo chiude
✅ **Navigazione bloccata**: (comportamento browser standard)

#### Dopo Completamento
✅ **Bottone riabilitato**: Torna cliccabile
✅ **Può fare nuovo sync**: Se necessario

---

## Test 5: UI/UX Details

### Animazioni
✅ **Icona ⏳**: Animazione `pulse` 2s infinite
✅ **Barra progresso**: Transizione smooth `ease-in-out 0.5s`
✅ **Hover bottoni**: Cambio colore fluido
✅ **Errore shake**: Animazione shake dell'icona

### Responsive
✅ **Desktop**: Modale centrato, larghezza max 500px
✅ **Tablet**: Si adatta, padding 20px
✅ **Mobile**: Larghezza 90%, tutti gli elementi visibili

### Accessibility
✅ **Colori contrastanti**: Testo leggibile su tutti i background
✅ **Dimensioni testo**: Sufficientemente grandi
✅ **Focus states**: Visibili sui bottoni

---

## Test 6: API Response Testing

### Test con curl o Postman

#### Sync Normale
```bash
curl -X POST https://formicanera.com/api/orders/force-sync \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Orders re-synced successfully",
  "data": {
    "syncedCount": 150
  }
}
```

#### Reset DB + Sync (Admin)
```bash
curl -X POST https://formicanera.com/api/orders/reset-and-sync \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Database reset and complete sync successful",
  "data": {
    "syncedCount": 245
  }
}
```

#### Error Cases

**Sessione scaduta (401)**:
```json
{
  "success": false,
  "error": "Token expired"
}
```

**Non admin per reset (403)**:
```json
{
  "success": false,
  "error": "Forbidden"
}
```

**Errore sync (500)**:
```json
{
  "success": false,
  "error": "Failed to force sync orders"
}
```

---

## 📊 Performance Benchmarks

### Sync Normale
- **1-50 ordini**: 5-10 secondi
- **50-100 ordini**: 10-20 secondi
- **100-200 ordini**: 20-40 secondi
- **200+ ordini**: 40-60+ secondi

### Reset + Sync
- **Completo anno**: 60-120 secondi (dipende da quanti ordini)

**Note**: I tempi dipendono da:
- Numero di ordini da scaricare
- Velocità di risposta di Archibald
- Latenza di rete
- Carico del server

---

## 🐛 Known Issues & Edge Cases

### 1. **Token Expiration During Sync**
- **Scenario**: Token scade mentre sync è in corso
- **Expected**: Errore "Sessione scaduta"
- **Workaround**: Fare login e riprovare

### 2. **Archibald Timeout**
- **Scenario**: Archibald impiega troppo tempo a rispondere
- **Expected**: Timeout dopo 2 minuti
- **Workaround**: Riprovare più tardi

### 3. **Network Disconnection**
- **Scenario**: Connessione si interrompe durante sync
- **Expected**: Errore "Errore di rete"
- **Workaround**: Controllare connessione e riprovare

### 4. **Concurrent Order Creation**
- **Scenario**: Altro utente crea ordine durante sync
- **Expected**: Sync non interferisce, ordine viene creato
- **Note**: Priority manager gestisce il conflitto

---

## ✅ Success Criteria

### Must Have
- [x] Modale si apre immediatamente
- [x] Progresso visibile in tempo reale
- [x] Messaggi descrittivi per ogni fase
- [x] Contatore ordini sincronizzati
- [x] Gestione errori chiara
- [x] Lista ordini si aggiorna al completamento

### Should Have
- [x] Animazioni fluide
- [x] Responsive design
- [x] Info box con suggerimenti
- [x] Protezione da click multipli
- [x] Backdrop blur effect

### Nice to Have
- [ ] Stima tempo rimanente (future feature)
- [ ] Websocket real-time updates (future feature)
- [ ] Cancel button (future feature)
- [ ] Notification system (future feature)

---

## 🚀 Deployment Checklist

Prima di deployare in produzione:

- [ ] Tutti i test passano
- [ ] Type checking passed (`npm run type-check`)
- [ ] Build frontend successful (`npm run build`)
- [ ] Build backend successful (`npm run build`)
- [ ] API endpoints testati manualmente
- [ ] UX verificata su desktop e mobile
- [ ] Errori gestiti correttamente
- [ ] Log verificati sul server
- [ ] Performance accettabili (< 60s per sync normale)

---

## 📝 Testing Report Template

### Test Execution Date: _______________
### Tester: _______________
### Environment: [ ] Production [ ] Staging [ ] Local

| Test Case | Status | Notes |
|-----------|--------|-------|
| Sync Normale - Happy Path | ⬜ Pass / ⬜ Fail | |
| Sync con Errore | ⬜ Pass / ⬜ Fail | |
| Reset DB + Sync (Admin) | ⬜ Pass / ⬜ Fail | |
| Multiple Sync Protection | ⬜ Pass / ⬜ Fail | |
| UI/UX Animations | ⬜ Pass / ⬜ Fail | |
| API Response Testing | ⬜ Pass / ⬜ Fail | |
| Mobile Responsive | ⬜ Pass / ⬜ Fail | |

### Bugs Found:
1.
2.
3.

### Recommendations:
1.
2.
3.

---

**Document Version**: 1.0
**Last Updated**: 2026-01-17
**Author**: Claude Sonnet 4.5
