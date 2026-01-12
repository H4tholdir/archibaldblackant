# Analisi Gestionale Archibald

## Informazioni Generali

**URL Base**: `https://4.231.124.90/Archibald`
**Tecnologia Backend**: ASP.NET WebForms (IIS 10.0, ASP.NET 4.0.30319)
**Framework UI**: DevExpress (DXR.axd, componenti grid/editor)
**Autenticazione**: Session-based con cookie ASP.NET

---

## 1. Autenticazione

### Pagina di Login
- **URL**: `/Archibald/Login.aspx`
- **Campi**:
  - `NOME ACCOUNT` (username)
  - `PASSWORD` (password)
- **Meccanismo**: ASP.NET WebForms con `__VIEWSTATE` e `__VIEWSTATEGENERATOR`
- **Metodo**: POST con form-data

### Flusso di Login
1. GET della pagina di login → ricevi `__VIEWSTATE` e `__VIEWSTATEGENERATOR`
2. POST con credenziali + ViewState
3. Redirect a `/Archibald/Default.aspx` se successo
4. Cookie di sessione ASP.NET viene impostato

---

## 2. Struttura Interfaccia

### Dashboard Principale
- **Sezioni nel menu laterale**:
  - Annunci
  - Eventi
  - Commenti dei clienti
  - **Ordini** ← area di interesse
  - Inserimento ordini online
  - Documenti di spedizione
  - Fatture

### Pagina Ordini
- **URL Pattern**: `/Archibald/SALESTABLE_ListViewConcCust/`
- **Griglia ordini** con colonne:
  - ID (numero ordine)
  - DATA VENDITA
  - NUMERO DI CONTO ESTERO
  - NOME VENDITA (cliente)
  - NOME DI CONSEGNA (destinazione)
  - INDIRIZZO DI CONSEGNA
  - DATA DI CREAZIONE
  - IMMAGINE DI CONSEGNA
  - PAGARE VENDITE FINANZIARI (stato pagamento?)

---

## 3. Flusso di Inserimento Ordine

### Step 1: Creazione Nuovo Ordine
**URL**: `/Archibald/SALESTABLE_DetailViewConcCust/?NewObject=true`

**Form principale** (3 tab: Panoramica, Ordini di consegna, Prezzi e sconti):

#### Tab "Panoramica"

**Dati di vendita (I)**:
- `ORDINE DI VENDITA`: generato automaticamente (es: 049421)
- `PUNTO ESTERO`: selezione sede cliente
- `NOME DI CONSEGNA`: Nome destinatario (dropdown con autocomplete)

**Consegna**:
- `INDIRIZZO DI CONSEGNA`: Indirizzo completo
- `LUOGO`: città
- `NAZIONE`: paese

**Dati di vendita (II)**:
- `RISULTATI CAMPO`: N/A
- `IDENTIFICAZIONE DEL CLIENTE`: (campo ricerca cliente)

**Dati di vendita (III)**:
- `DATA ORDINE`: data inserimento (default oggi, format: `26/12/2025 17:43:47`)
- `DELIVERY DATE`: data consegna prevista (format: `29/12/2025`)
- `INDIRIZZO DI CONSEGNA`: ulteriore conferma indirizzo
- `ORDINE INSIEME`: campo note

**Dettagli di vendita (I)**:
- `RISULTATI CAMPO`: N/A (altro campo, probabilmente duplicato)
- `DESTINAZIONE RICERCA`: destinazione merci
- `ORIENTARE`: note orientamento

**Dettagli di vendita (II)**:
- Vari campi aggiuntivi (da esplorare)

**Stato delle vendite**:
- `TIPO DEL CARICO`: tipo di spedizione (dropdown)
- `STATO`: stato ordine (dropdown: Generare, Ordine aperto, Evitto nel documento, Modifica, etc.)
- `TEMPI DEL DOCUMENTO`: timestamp modifica stato
- `RESACRE DOCUMENTI`: firma/validazione documenti

### Step 2: Inserimento Articoli (Linee d'Ordine)

**Popup di selezione articolo** (aperto dal pulsante "Nuovo" nella sezione "Linee di vendita"):

**Campi ricerca**:
- Barra di ricerca con filtri: `FILTRO`, `GAMMA`, `ORANGES`, `BARBANES`, `COTONE`, `FRUTTO`, `STABLE`, `QUALITY`
- **Griglia risultati** con colonne:
  - Checkbox selezione multipla
  - `NUMERO` (codice articolo, es: H1294)
  - `NOME` (nome prodotto, es: 104, 010, 011, 012)
  - Icona foto prodotto
  - Campi quantità: colonne numerate (1, 2, 3, 4, K2) rappresentano probabilmente taglie/varianti
  - `H1 104 OOO` (codice completo?)
  - Prezzi unitari (es: 5,00)

**Selezione articolo**:
- Utente seleziona checkbox della riga
- Clicca su "Conferma" (pulsante in basso al popup)
- L'articolo viene aggiunto alla sezione "Linee di vendita"

**Linee di vendita (griglia ordine)**:
- `LINEA`: numero riga
  - **Riga 1**: COFRA, VAL V, COF, OTFRA, ALU-U**, P, V
  - **Riga 2**: H1, 104, 010, immagine prodotto, 1, K2, H1 104 OOO, 5,00
- `NOME ARTICOLO`: descrizione
- `QTÀ VENDUTA`: quantità
- `PREZZO DI VENDITA AI CLIENTI`: prezzo unitario
- `QUANTITÀ CONVERTITA`: quantità convertita (se diverse unità misura?)
- `LINEA DISPOSITIVO`: riga associata

### Step 3: Salvataggio Ordine
- Pulsante "Salva" (icona spunta verde) nella toolbar in alto
- **POST** a `/Archibald/SALESTABLE_DetailViewConcCust/69809/?mode=Edit`
  - `69809` è l'ID ordine generato
- Dopo salvataggio redirect a lista ordini con ordine appena creato visibile

---

## 4. Meccanismo API (ASP.NET WebForms)

### Tecnologia: ViewState-Based
Archibald **NON utilizza API REST/JSON** ma il classico meccanismo ASP.NET WebForms:

#### Ogni richiesta POST contiene:
```
__VIEWSTATE: <base64 encoded state>
__VIEWSTATEGENERATOR: <token>
__EVENTTARGET: <control che ha triggerato l'evento>
__EVENTARGUMENT: <parametri evento>
Vertical$v6_32541421$MainLayoutEdit$...: <valori form>
```

#### Campi chiave identificati:
- `Vertical$v6_32541421$MainLayoutEdit$xaf_l127_pg$xaf_l134$xaf_l152$xaf_l168$xaf_dviCUSTTABLE_Edit`: ID cliente (es: `049421`)
- `Vertical$v6_32541421$MainLayoutEdit$xaf_l127_pg$xaf_l134$xaf_l211$xaf_dviSALESNAME_Edit`: Nome cliente (es: `Fresis Soc Cooperativa`)
- `Vertical$v6_32541421$MainLayoutEdit$xaf_l127_pg$xaf_l134$xaf_l228$xaf_l238$xaf_dviORDERDATE_Edit$State`: Data ordine in timestamp

#### Stato della sessione:
- Ogni interazione richiede il `__VIEWSTATE` della risposta precedente
- **Problema**: non si può fare una singola chiamata API, serve mantenere lo stato della "conversazione" HTTP

---

## 5. Complessità Identificate

### 🔴 Criticità Alte
1. **ViewState Stateful**: Impossibile fare chiamate API indipendenti, serve simulare un browser
2. **DevExpress Components**: Grid e dropdown sono componenti proprietari con logica JavaScript complessa
3. **Nessuna API REST**: tutto passa per POST ASP.NET WebForms
4. **Token di sessione**: `__VIEWSTATE` e `__VIEWSTATEGENERATOR` cambiano ad ogni richiesta

### 🟡 Criticità Medie
1. **Popup modali**: Selezione articoli in popup richiede interazioni JavaScript
2. **Ricerca clienti**: Autocomplete probabilmente via AJAX DevExpress
3. **Validazioni**: Client-side validation tramite DevExpress, server-side da replicare

### 🟢 Dati Strutturati Identificati
- **Cliente**: ID (es: 049421), Nome
- **Ordine**: ID (es: 69809), Data, Indirizzo consegna, Stato
- **Articolo**: Codice (es: H1294), Descrizione, Prezzo, Quantità

---

## 6. Strategie di Implementazione

### Opzione A: Puppeteer/Playwright (Browser Automation) ⭐ CONSIGLIATA
**Pro**:
- Gestisce automaticamente ViewState, session, JavaScript DevExpress
- Non serve reverse engineering completo delle chiamate
- Più robusto a cambiamenti del gestionale

**Contro**:
- Richiede un browser headless sul server
- Più lento delle API REST (ma comunque accettabile)
- Dipende dalla struttura HTML (se cambiano ID può rompersi)

**Implementazione**:
1. Puppeteer script che:
   - Fa login con credenziali
   - Naviga a "Nuovo Ordine"
   - Compila form con dati forniti dall'interfaccia mobile
   - Cerca e seleziona articoli
   - Salva ordine
2. Backend Node.js che espone API REST semplici
3. Frontend mobile chiama le API del backend

### Opzione B: Reverse Engineering Completo + Replicare ViewState
**Pro**:
- Potenzialmente più veloce (no browser)
- Meno risorse server

**Contro**:
- **MOLTO complesso**: serve decodificare ViewState, capire tutta la logica DevExpress
- **Fragile**: ogni aggiornamento del gestionale può rompere tutto
- Tempo di sviluppo 5-10x superiore

**Sconsigliata** per questo progetto.

### Opzione C: Chiedere API al fornitore del gestionale
**Pro**:
- Soluzione pulita e stabile
- Supporto ufficiale

**Contro**:
- Tempi burocratici
- Potrebbe costare
- Potrebbe non essere disponibile

---

## 7. Proposta Architettura Finale

```
┌─────────────────────────────────┐
│   Web App Mobile (React/Vue)    │
│   - Form inserimento ordine     │
│   - Ricerca clienti/articoli    │
│   - PWA installabile             │
└──────────────┬──────────────────┘
               │ HTTPS (JSON REST API)
               ▼
┌─────────────────────────────────┐
│   Backend Proxy (Node.js)       │
│   - API REST endpoint            │
│   - Gestione sessioni            │
│   - Cache clienti/articoli       │
└──────────────┬──────────────────┘
               │ Puppeteer automation
               ▼
┌─────────────────────────────────┐
│   Browser Headless (Chromium)   │
│   - Mantiene sessione ASP.NET   │
│   - Esegue azioni su Archibald   │
└──────────────┬──────────────────┘
               │ HTTPS
               ▼
┌─────────────────────────────────┐
│   Gestionale Archibald          │
│   https://4.231.124.90/Archibald│
└─────────────────────────────────┘
```

---

## 8. API Semplificata da Esporre

### POST /api/orders/create
```json
{
  "customerId": "049421",
  "customerName": "Fresis Soc Cooperativa",
  "deliveryAddress": "Via San Vitale, 0 80006 Ercolano Na",
  "deliveryDate": "2025-12-29",
  "items": [
    {
      "articleCode": "H1294",
      "description": "104",
      "quantity": 1,
      "size": "K2",
      "price": 5.00
    }
  ],
  "notes": "Ordine da app mobile"
}
```

**Risposta**:
```json
{
  "success": true,
  "orderId": "69809",
  "message": "Ordine inserito correttamente"
}
```

### GET /api/customers/search?q=fresis
```json
{
  "results": [
    {
      "id": "049421",
      "name": "Fresis Soc Cooperativa",
      "addresses": [
        "Via San Vitale, 0 80006 Ercolano Na"
      ]
    }
  ]
}
```

### GET /api/products/search?q=H129
```json
{
  "results": [
    {
      "code": "H1294",
      "name": "104",
      "sizes": ["1", "2", "3", "4", "K2"],
      "price": 5.00,
      "imageUrl": "..."
    }
  ]
}
```

---

## 9. Prossimi Step

### Fase 1: Setup Progetto
- [ ] Creare progetto Node.js con Express
- [ ] Setup Puppeteer
- [ ] Testare login automatico

### Fase 2: Automazione Inserimento Ordine
- [ ] Script Puppeteer per navigare form ordine
- [ ] Gestione ricerca clienti
- [ ] Gestione selezione articoli
- [ ] Salvataggio ordine

### Fase 3: Backend API
- [ ] Endpoint REST per creazione ordine
- [ ] Endpoint ricerca clienti (con cache)
- [ ] Endpoint ricerca articoli (con cache)
- [ ] Gestione errori e retry logic

### Fase 4: Frontend Mobile
- [ ] UI form inserimento ordine
- [ ] Autocomplete clienti/articoli
- [ ] Validazioni client-side
- [ ] PWA setup (offline, installabile)

### Fase 5: Deploy e Distribuzione
- [ ] Docker container con Puppeteer
- [ ] Deploy su server accessibile
- [ ] Distribuzione link PWA ai colleghi
- [ ] Documentazione utente

---

## 10. Domande Aperte per l'Utente

1. **Autenticazione Backend**:
   - Usare un solo account tecnico per tutti gli utenti?
   - Oppure ogni utente inserisce le proprie credenziali Archibald?

2. **Funzionalità necessarie**:
   - Solo inserimento ordini o anche visualizzazione storico?
   - Serve modificare ordini esistenti?
   - Serve gestire bozze offline?

3. **Ricerca prodotti**:
   - Come cercano i prodotti i tuoi colleghi? (per codice, nome, categoria?)
   - Serve mostrare immagini prodotti?
   - Ci sono prodotti usati frequentemente da mettere in "preferiti"?

4. **Validazioni**:
   - Ci sono vincoli da rispettare? (es: cliente X può ordinare solo prodotti Y)
   - Quantità minime/massime?
   - Controllo disponibilità magazzino?

5. **Deploy**:
   - Avete un server dove posso deployare il backend?
   - Oppure serve una soluzione cloud (es: AWS, Azure, DigitalOcean)?
