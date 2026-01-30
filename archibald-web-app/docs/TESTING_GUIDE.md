# Testing Guide - Order History Redesign

## Panoramica

Questa guida fornisce una checklist completa per testare tutte le funzionalità della pagina Storico Ordini riprogettata.

---

## 🎯 Pre-Test Setup

### Requisiti

- ✅ Frontend in esecuzione (`npm run dev`)
- ✅ Backend in esecuzione
- ✅ Database con ordini di test in vari stati
- ✅ Browser: Chrome, Firefox, Safari (per cross-browser testing)
- ✅ Device mobile o DevTools responsive mode

### Dati di Test Necessari

Per testare completamente, assicurati di avere ordini con:

1. **Stati diversi:**
   - [ ] Su Archibald (GIORNALE + MODIFICA + NESSUNO)
   - [ ] In attesa approvazione
   - [ ] Bloccato (TRANSFER ERROR)
   - [ ] In transito (con tracking)
   - [ ] Consegnato (con deliveryCompletedDate)
   - [ ] Fatturato (con invoiceNumber)

2. **Dati documenti:**
   - [ ] Con tracking number
   - [ ] Con DDT number
   - [ ] Con invoice number
   - [ ] Senza documenti

3. **Varietà clienti:**
   - [ ] Clienti con nomi diversi
   - [ ] Clienti con ordini multipli

---

## 📋 Test Checklist

### 1. Sistema Colori Card

**Obiettivo:** Verificare che i colori riflettano correttamente lo stato.

#### Test 1.1: Colore "Su Archibald" (Grigio)
- [ ] Trova ordine con stato GIORNALE + MODIFICA + NESSUNO
- [ ] Verifica bordo sinistro grigio scuro `#757575`
- [ ] Verifica sfondo grigio chiaro `#F5F5F5`
- [ ] Verifica badge "Su Archibald" visibile

#### Test 1.2: Colore "In attesa" (Arancione)
- [ ] Trova ordine IN ATTESA DI APPROVAZIONE
- [ ] Verifica bordo arancione `#FFA726`
- [ ] Verifica sfondo pesca `#FFF3E0`
- [ ] Verifica badge "In attesa approvazione"

#### Test 1.3: Colore "Bloccato" (Rosso)
- [ ] Trova ordine TRANSFER ERROR
- [ ] Verifica bordo rosso `#F44336`
- [ ] Verifica sfondo rosa chiaro `#FFEBEE`
- [ ] Verifica badge "Richiede intervento"

#### Test 1.4: Colore "In transito" (Blu)
- [ ] Trova ordine con tracking senza deliveryCompletedDate
- [ ] Verifica bordo blu `#2196F3`
- [ ] Verifica sfondo azzurro `#E3F2FD`
- [ ] Verifica badge "In transito"

#### Test 1.5: Colore "Consegnato" (Verde)
- [ ] Trova ordine con deliveryCompletedDate
- [ ] Verifica bordo verde `#4CAF50`
- [ ] Verifica sfondo verde chiaro `#E8F5E9`
- [ ] Verifica badge "Consegnato"

#### Test 1.6: Colore "Fatturato" (Viola)
- [ ] Trova ordine con invoiceNumber
- [ ] Verifica bordo viola `#9C27B0`
- [ ] Verifica sfondo lavanda `#F3E5F5`
- [ ] Verifica badge "Fatturato"

**Risultato atteso:** Ogni stato ha colori distinti e immediatamente riconoscibili.

---

### 2. Componente Leggenda

**Obiettivo:** Verificare modal leggenda funziona e contenuto è completo.

#### Test 2.1: Apertura Modal
- [ ] Click su pulsante "ℹ️ Leggi gli stati" nell'header
- [ ] Modal si apre con animazione smooth
- [ ] Backdrop scuro visibile dietro modal
- [ ] Click backdrop chiude modal
- [ ] Click X in alto a destra chiude modal

#### Test 2.2: Contenuto Leggenda
- [ ] Sezione "Colori Schede" mostra tutti 6 stati
- [ ] Ogni stato ha colore visualizzato + descrizione
- [ ] Sezione "Glossario Tag" spiega tutti i tag
- [ ] Sezione "Timeline Tipica" mostra progressione ordine
- [ ] Sezione "Documenti" spiega DDT e Fattura
- [ ] Scroll funziona se contenuto lungo

#### Test 2.3: Responsive Mobile
- [ ] Apri in mobile view (DevTools)
- [ ] Modal occupa tutto lo schermo
- [ ] Contenuto leggibile
- [ ] Pulsante chiudi accessibile
- [ ] Scroll funziona su mobile

**Risultato atteso:** Utente capisce tutti gli stati dopo aver letto la leggenda.

---

### 3. Card Ordine - Vista Compressa

**Obiettivo:** Verificare layout e funzionalità card compressa.

#### Test 3.1: Layout Base
- [ ] Nome cliente in grassetto, ben visibile
- [ ] Badge stato in alto a destra
- [ ] ORD/numero + data sulla seconda riga
- [ ] Importo totale + imponibile sulla terza riga
- [ ] Pulsanti azione sulla quarta riga

#### Test 3.2: Pulsanti Azione - Tracking
- [ ] Pulsante 🚚 Tracking visibile SOLO se tracking URL esiste
- [ ] Click apre tracking FedEx in nuova tab
- [ ] URL corretto (verifica nella nuova tab)
- [ ] Pulsante ha hover effect (blu → blu scuro)

#### Test 3.3: Pulsanti Azione - DDT
- [ ] Pulsante 📄 DDT visibile SOLO se ddt.ddtNumber esiste
- [ ] Click avvia download PDF
- [ ] Nome file corretto: `DDT_ORD_numero.pdf`
- [ ] PDF si apre/scarica correttamente

#### Test 3.4: Pulsanti Azione - Fattura
- [ ] Pulsante 📑 Fattura visibile SOLO se invoiceNumber esiste
- [ ] Click avvia download PDF
- [ ] Nome file corretto: `Fattura_numero.pdf`
- [ ] PDF si apre/scarica correttamente

#### Test 3.5: Espansione Card
- [ ] Click sulla card (non sui pulsanti) espande
- [ ] Freccia ▼ diventa ▲
- [ ] Transizione smooth
- [ ] Vista espansa mostra 5 tab
- [ ] Click di nuovo comprime card

#### Test 3.6: Responsive Mobile
- [ ] Layout si adatta a larghezza ridotta
- [ ] Testo rimane leggibile
- [ ] Pulsanti accessibili (min 44px)
- [ ] Importi non si sovrappongono

**Risultato atteso:** Card chiare, pulsanti funzionanti, layout pulito.

---

### 4. Filtri Veloci

**Obiettivo:** Verificare filtri rapidi funzionano con contatori.

#### Test 4.1: Filtro "Richiede attenzione"
- [ ] Click su chip "⚠️ Richiede attenzione"
- [ ] Chip si evidenzia (bordo rosso)
- [ ] Lista mostra SOLO ordini IN ATTESA o TRANSFER ERROR
- [ ] Contatore (N) corrisponde a ordini visibili
- [ ] Click di nuovo disattiva filtro

#### Test 4.2: Filtro "Modificabili"
- [ ] Click su chip "✏️ Modificabili"
- [ ] Chip si evidenzia (bordo grigio)
- [ ] Lista mostra SOLO ordini GIORNALE + MODIFICA
- [ ] Contatore (N) corrisponde a ordini visibili
- [ ] Click di nuovo disattiva filtro

#### Test 4.3: Filtro "In transito"
- [ ] Click su chip "🚚 In transito"
- [ ] Chip si evidenzia (bordo blu)
- [ ] Lista mostra SOLO ordini con tracking senza deliveryCompletedDate
- [ ] Contatore (N) corrisponde a ordini visibili
- [ ] Click di nuovo disattiva filtro

#### Test 4.4: Filtro "Fatturati"
- [ ] Click su chip "📑 Fatturati"
- [ ] Chip si evidenzia (bordo viola)
- [ ] Lista mostra SOLO ordini con invoiceNumber
- [ ] Contatore (N) corrisponde a ordini visibili
- [ ] Click di nuovo disattiva filtro

#### Test 4.5: Filtri Multipli (AND Logic)
- [ ] Attiva "In transito" + "Fatturati"
- [ ] Lista mostra SOLO ordini che matchano ENTRAMBI
- [ ] Contatori si aggiornano
- [ ] Disattiva un filtro → lista si aggiorna

#### Test 4.6: Filtri + Ricerca Globale
- [ ] Attiva filtro "Fatturati"
- [ ] Digita nella ricerca globale
- [ ] Verifica che ENTRAMBI i filtri si applicano
- [ ] Risultati rispettano sia filtro che ricerca

**Risultato atteso:** Filtri funzionano, contatori accurati, AND logic corretta.

---

### 5. Ricerca Globale

**Obiettivo:** Verificare ricerca profonda funziona su tutti i campi.

#### Test 5.1: Ricerca per ORD/numero
- [ ] Digita numero ordine (es: "26001234")
- [ ] Attendi 300ms (debounce)
- [ ] Verifica che appare solo l'ordine corretto
- [ ] Prova ORD/ completo (es: "ORD/26001234")
- [ ] Verifica risultato identico

#### Test 5.2: Ricerca per Cliente
- [ ] Digita parte del nome cliente (es: "Rossi")
- [ ] Attendi 300ms
- [ ] Verifica che appaiono tutti i clienti con "Rossi" nel nome
- [ ] Case-insensitive: prova "rossi" → stesso risultato

#### Test 5.3: Ricerca per Tracking Number
- [ ] Digita tracking number parziale
- [ ] Verifica che appare ordine con quel tracking
- [ ] Prova tracking completo → stesso risultato

#### Test 5.4: Ricerca per Importo
- [ ] Digita importo (es: "1234")
- [ ] Verifica che appaiono ordini con quel totale
- [ ] Prova con decimali (es: "1234.56")

#### Test 5.5: Ricerca per Invoice Number
- [ ] Digita numero fattura
- [ ] Verifica che appare ordine fatturato
- [ ] Prova formato parziale

#### Test 5.6: Ricerca per DDT Number
- [ ] Digita numero DDT
- [ ] Verifica che appare ordine con DDT

#### Test 5.7: Debounce
- [ ] Digita velocemente "test"
- [ ] Verifica che chiamata API parte SOLO dopo 300ms dall'ultima digitazione
- [ ] Osserva network tab: 1 sola chiamata API

#### Test 5.8: Ricerca Vuota
- [ ] Cancella ricerca
- [ ] Verifica che tornano tutti gli ordini
- [ ] Contatori filtri si aggiornano

#### Test 5.9: Nessun Risultato
- [ ] Digita termine che non esiste (es: "xyz999")
- [ ] Verifica messaggio "Nessun ordine trovato"
- [ ] Suggerimento modificare filtri visibile

**Risultato atteso:** Ricerca accurata, veloce, cerca in tutti i campi.

---

### 6. Date Range Filter

**Obiettivo:** Verificare filtro date funziona.

#### Test 6.1: Solo Data Inizio
- [ ] Seleziona data "Da"
- [ ] Verifica che appaiono solo ordini >= quella data
- [ ] Ordini più vecchi non visibili

#### Test 6.2: Solo Data Fine
- [ ] Seleziona data "A"
- [ ] Verifica che appaiono solo ordini <= quella data
- [ ] Ordini più recenti non visibili

#### Test 6.3: Range Completo
- [ ] Seleziona "Da" e "A"
- [ ] Verifica che appaiono solo ordini nel range
- [ ] Ordini fuori range non visibili

#### Test 6.4: Range Invalido
- [ ] Seleziona "Da" > "A" (es: Da 31 Gen, A 1 Gen)
- [ ] Verifica comportamento (nessun ordine o warning)

**Risultato atteso:** Filtro date preciso e intuitivo.

---

### 7. Raggruppamento Temporale

**Obiettivo:** Verificare ordini raggruppati per periodo.

#### Test 7.1: Sezioni Temporali
- [ ] Verifica presenza sezioni:
  - "Oggi" (ordini oggi)
  - "Questa settimana" (ultimi 7 giorni)
  - "Questo mese" (mese corrente)
  - "Più vecchi" (prima mese corrente)

#### Test 7.2: Ordinamento Interno
- [ ] Dentro ogni sezione, ordini ordinati per data DESC
- [ ] Ordini più recenti in alto

#### Test 7.3: Sezioni Vuote
- [ ] Se nessun ordine in un periodo, sezione non appare
- [ ] Non ci sono header vuoti

**Risultato atteso:** Navigazione temporale intuitiva.

---

### 8. Pulsante "Cancella Filtri"

**Obiettivo:** Verificare reset completo filtri.

#### Test 8.1: Comparsa Pulsante
- [ ] Pulsante NON visibile se nessun filtro attivo
- [ ] Applica qualsiasi filtro → pulsante appare
- [ ] Rosso con X icon

#### Test 8.2: Reset Completo
- [ ] Attiva ricerca, filtri veloci, date
- [ ] Click "✕ Cancella filtri"
- [ ] Verifica che TUTTI i filtri si resettano:
  - [ ] Ricerca globale vuota
  - [ ] Filtri veloci deselezionati
  - [ ] Date Da/A vuote
  - [ ] Customer search vuoto
- [ ] Lista torna a mostrare tutti gli ordini

**Risultato atteso:** Reset totale con un solo click.

---

### 9. Performance

**Obiettivo:** Verificare app responsive con molti ordini.

#### Test 9.1: Caricamento Iniziale
- [ ] Tempo caricamento < 2 secondi (100 ordini)
- [ ] Spinner/loading visibile durante fetch
- [ ] Nessun freeze UI

#### Test 9.2: Ricerca con Debounce
- [ ] Digita velocemente → nessun lag
- [ ] API chiamata solo dopo 300ms
- [ ] UI rimane responsive

#### Test 9.3: Scroll Performance
- [ ] Scroll lista ordini fluido
- [ ] Nessun lag con 100+ ordini
- [ ] Card si renderizzano smooth

#### Test 9.4: Filtri Veloci Performance
- [ ] Click filtro → aggiornamento immediato (< 100ms)
- [ ] Nessun flash/flicker
- [ ] Smooth transition

**Risultato atteso:** App veloce e fluida anche con molti dati.

---

### 10. Vista Espansa Card

**Obiettivo:** Verificare tab e contenuti nella card espansa.

#### Test 10.1: Tab "Panoramica"
- [ ] Mostra tutte info ordine
- [ ] Badge tutti visibili
- [ ] Layout pulito

#### Test 10.2: Tab "Articoli"
- [ ] Tabella articoli leggibile
- [ ] Totali VAT corretti
- [ ] Pulsante sync articoli funziona (se presente)

#### Test 10.3: Tab "Logistica"
- [ ] Dettagli DDT visibili
- [ ] Tracking info completo
- [ ] Metodo consegna mostrato

#### Test 10.4: Tab "Finanziario"
- [ ] Totali ordine corretti
- [ ] Info fattura (se presente)
- [ ] Pulsante download fattura funziona

#### Test 10.5: Tab "Cronologia"
- [ ] Timeline stati ordine visibile
- [ ] Documenti allegati listati
- [ ] Note ordine visibili

#### Test 10.6: Navigazione Tab
- [ ] Click ogni tab cambia contenuto
- [ ] Tab attivo evidenziato
- [ ] Smooth transition

**Risultato atteso:** Tutte le info ordine accessibili e ben organizzate.

---

### 11. Responsive Design

**Obiettivo:** Verificare funzionamento su tutti i device.

#### Test 11.1: Desktop (> 1024px)
- [ ] Layout a 3 colonne per filtri
- [ ] Card full-width
- [ ] Tutti pulsanti visibili
- [ ] Nessun elemento troncato

#### Test 11.2: Tablet (768px - 1024px)
- [ ] Layout a 2 colonne per filtri
- [ ] Card responsive
- [ ] Pulsanti accessibili
- [ ] Leggenda modal responsive

#### Test 11.3: Mobile (< 768px)
- [ ] Layout verticale filtri
- [ ] Card stack verticalmente
- [ ] Pulsanti touch-friendly (44px min)
- [ ] Testo leggibile (font non troppo piccolo)
- [ ] Input ricerca full-width
- [ ] Tab espanse scrollabili orizzontalmente

#### Test 11.4: Mobile Landscape
- [ ] Layout si adatta a orientamento orizzontale
- [ ] Modal leggenda full-screen
- [ ] Scroll funziona

**Risultato atteso:** Esperienza ottimale su tutti i device.

---

### 12. Cross-Browser Testing

**Obiettivo:** Verificare compatibilità browser.

#### Test 12.1: Chrome
- [ ] Tutti i test passano
- [ ] Colori corretti
- [ ] Download funzionano

#### Test 12.2: Firefox
- [ ] Tutti i test passano
- [ ] Layout identico a Chrome
- [ ] Download funzionano

#### Test 12.3: Safari
- [ ] Tutti i test passano
- [ ] Colori corretti (Safari ha rendering colori diverso)
- [ ] Download funzionano

#### Test 12.4: Edge
- [ ] Tutti i test passano
- [ ] Compatibilità completa

**Risultato atteso:** Funzionamento identico su tutti i browser moderni.

---

### 13. Error Handling

**Obiettivo:** Verificare gestione errori.

#### Test 13.1: Network Error
- [ ] Disattiva network in DevTools
- [ ] Refresh pagina
- [ ] Verifica messaggio errore chiaro
- [ ] Pulsante "Riprova" presente
- [ ] Click Riprova → tenta ricaricamento

#### Test 13.2: API Error 401
- [ ] Simula token scaduto
- [ ] Verifica messaggio "Sessione scaduta"
- [ ] Redirect a login (se implementato)

#### Test 13.3: Empty State
- [ ] Filtra per termine che non esiste
- [ ] Verifica messaggio "Nessun ordine trovato"
- [ ] Icona 📭 visibile
- [ ] Suggerimento modificare filtri

#### Test 13.4: Download Error
- [ ] Tenta scaricare DDT/Fattura non disponibile
- [ ] Verifica messaggio errore appropriato
- [ ] Non crash app

**Risultato atteso:** Errori gestiti gracefully, user feedback chiaro.

---

### 14. Accessibility (A11y)

**Obiettivo:** Verificare accessibilità per tutti gli utenti.

#### Test 14.1: Keyboard Navigation
- [ ] Tab attraverso tutti i controlli
- [ ] Ordine tab logico
- [ ] Focus indicator visibile
- [ ] Enter apre modal leggenda
- [ ] Escape chiude modal

#### Test 14.2: Screen Reader
- [ ] Label input hanno testo descrittivo
- [ ] Pulsanti hanno aria-label
- [ ] Card espanse hanno stato aria-expanded
- [ ] Contatori filtri annunciati correttamente

#### Test 14.3: Color Contrast
- [ ] Testo leggibile su tutti gli sfondi
- [ ] Colori stati distinguibili anche per daltonici
- [ ] Pulsanti hanno contrasto sufficiente

#### Test 14.4: Focus Management
- [ ] Apertura modal sposta focus
- [ ] Chiusura modal ripristina focus
- [ ] Tab trap dentro modal

**Risultato atteso:** App usabile con keyboard e screen reader.

---

## 🐛 Bug Reporting Template

Se trovi un bug, documenta così:

```markdown
### Bug: [Titolo breve]

**Priorità:** Bassa / Media / Alta / Critica

**Ambiente:**
- Browser: [Chrome 120]
- OS: [macOS Sonoma]
- Device: [Desktop / Mobile]

**Passi per Riprodurre:**
1. Vai a pagina Storico Ordini
2. Click su ...
3. Osserva ...

**Comportamento Atteso:**
[Cosa dovrebbe succedere]

**Comportamento Attuale:**
[Cosa succede invece]

**Screenshot/Video:**
[Allega se possibile]

**Console Errors:**
[Copia errori console browser]

**Note Aggiuntive:**
[Altre informazioni rilevanti]
```

---

## ✅ Test Completion Checklist

### Functionality
- [ ] Tutti i colori stati corretti
- [ ] Leggenda completa e accessibile
- [ ] Card ordini layout corretto
- [ ] Pulsanti azione funzionanti
- [ ] 4 filtri veloci funzionano
- [ ] Ricerca globale accurata
- [ ] Date range filter funzionante
- [ ] Raggruppamento temporale corretto
- [ ] Cancella filtri resetta tutto

### Performance
- [ ] Caricamento < 2 secondi
- [ ] Ricerca debounced
- [ ] Scroll fluido
- [ ] Nessun memory leak

### UX/UI
- [ ] Responsive desktop
- [ ] Responsive tablet
- [ ] Responsive mobile
- [ ] Colori accessibili
- [ ] Testo leggibile
- [ ] Icone chiare

### Compatibility
- [ ] Chrome funzionante
- [ ] Firefox funzionante
- [ ] Safari funzionante
- [ ] Edge funzionante

### Error Handling
- [ ] Network errors gestiti
- [ ] Empty states chiari
- [ ] Error messages utili
- [ ] Graceful degradation

### Accessibility
- [ ] Keyboard navigation
- [ ] Screen reader friendly
- [ ] Color contrast OK
- [ ] Focus management

---

## 🎉 Sign-Off

Una volta completati tutti i test:

**Tester:** _________________
**Data:** _________________
**Versione:** 2.0.0
**Risultato:** ✅ PASS / ❌ FAIL

**Note:**
___________________________________
___________________________________
___________________________________

---

**Fine Testing Guide**
