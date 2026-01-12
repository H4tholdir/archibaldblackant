# 🧪 Guida Test - Archibald Mobile Backend

## Situazione Attuale ✅

Ho creato tutto il codice necessario per il backend! Ecco cosa abbiamo:

```
archibald-web-app/
├── backend/                    ✅ Completato
│   ├── src/
│   │   ├── index.ts           → Server API Express
│   │   ├── archibald-bot.ts   → Automazione Puppeteer (cuore del sistema)
│   │   ├── config.ts          → Configurazione
│   │   ├── logger.ts          → Logging
│   │   ├── schemas.ts         → Validazioni input
│   │   ├── types.ts           → Tipi TypeScript
│   │   └── scripts/
│   │       └── test-login.ts  → Script test login
│   ├── .env                    → Credenziali Archibald
│   ├── package.json            → Dipendenze (installate ✅)
│   └── README.md               → Documentazione backend
├── ANALISI_GESTIONALE.md       ✅ Analisi tecnica completa
├── PROPOSTA_TECNICA.md         ✅ Proposta implementativa
└── GUIDA_TEST.md              ✅ Questo file
```

---

## 🚀 Prossimi Step - Cosa Facciamo Ora

### Step 1: Test Login (5 minuti)

Apri il terminale e copia-incolla questi comandi:

```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend
npm run test:login
```

**Cosa succede**:
1. Si apre un browser Chrome controllato dal codice
2. Va su `https://4.231.124.90/Archibald/Login.aspx`
3. Inserisce username e password automaticamente
4. Fa login
5. Ti mostra il risultato nel terminale

**Cosa devi vedere**:
```
[INFO]: Inizializzazione browser Puppeteer...
[INFO]: Browser inizializzato con successo
[INFO]: Tentativo login su Archibald...
[INFO]: Login riuscito!
[INFO]: ✅ LOGIN RIUSCITO!
```

**Se NON funziona**, mi dici l'errore e lo sistemiamo subito.

---

### Step 2: Avvia Server API (5 minuti)

Dopo che il login funziona, avviamo il server:

```bash
npm run dev
```

**Cosa succede**:
- Il server parte su `http://localhost:3000`
- Rimane in esecuzione (NON chiudere il terminale!)
- È pronto a ricevere richieste API

**Cosa devi vedere**:
```
🚀 Server avviato su http://localhost:3000
📝 Environment: development
🎯 Archibald URL: https://4.231.124.90/Archibald
```

---

### Step 3: Test API con Browser (2 minuti)

Apri Chrome e vai su: `http://localhost:3000/api/health`

**Devi vedere**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-12-26T...",
    "version": "1.0.0"
  }
}
```

Questo conferma che il server funziona! ✅

---

### Step 4: Test Creazione Ordine (10 minuti)

Ora testiamo la creazione di un ordine reale.

**Opzione A: Con Postman/Insomnia (se ce l'hai)**

1. Scarica Postman: https://www.postman.com/downloads/
2. Crea una nuova richiesta POST
3. URL: `http://localhost:3000/api/orders/create`
4. Header: `Content-Type: application/json`
5. Body (JSON):

```json
{
  "customerId": "049421",
  "customerName": "Fresis Soc Cooperativa",
  "deliveryAddress": "Via San Vitale, 0 80006 Ercolano Na",
  "deliveryDate": "2025-12-30",
  "items": [
    {
      "articleCode": "H1294",
      "description": "104",
      "quantity": 1,
      "size": "K2",
      "price": 5.00
    }
  ],
  "notes": "Test ordine da API mobile"
}
```

6. Clicca "Send"

**Risposta attesa**:
```json
{
  "success": true,
  "data": {
    "orderId": "69810"
  },
  "message": "Ordine creato con successo"
}
```

**Opzione B: Con comando curl (da terminale)**

```bash
curl -X POST http://localhost:3000/api/orders/create \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "049421",
    "customerName": "Fresis Soc Cooperativa",
    "deliveryAddress": "Via San Vitale, 0 80006 Ercolano Na",
    "deliveryDate": "2025-12-30",
    "items": [
      {
        "articleCode": "H1294",
        "description": "104",
        "quantity": 1,
        "size": "K2",
        "price": 5.00
      }
    ],
    "notes": "Test da curl"
  }'
```

---

## 🐛 Troubleshooting

### Problema: "Port 3000 already in use"

Un altro programma usa la porta 3000. Cambia porta nel file `.env`:
```
PORT=3001
```

### Problema: "Cannot find module 'puppeteer'"

Reinstalla dipendenze:
```bash
npm install
```

### Problema: "Login failed"

1. Verifica credenziali nel file `.env`
2. Controlla che Archibald sia raggiungibile:
   ```bash
   ping 4.231.124.90
   ```
3. Prova login manuale su browser normale

### Problema: Browser si chiude subito

Nel file `src/config.ts`, cambia:
```typescript
headless: false,  // Invece di true
```

Riavvia il server con `npm run dev`

---

## 📊 Cosa Manca (Prossimi Step)

### Backend (80% completato)
- ✅ Login automatico
- ✅ Navigazione pagina ordini
- ✅ Compilazione campi base (cliente, indirizzo, data)
- ⚠️ Inserimento articoli (da completare - richiede gestione popup DevExpress)
- ⚠️ Salvataggio ordine (da testare)
- ❌ Modifica ordini esistenti
- ❌ Ricerca clienti (cache)
- ❌ Ricerca prodotti (cache)

### Frontend (0% completato)
- ❌ Setup React PWA
- ❌ UI mobile form ordine
- ❌ Autocomplete clienti/prodotti
- ❌ Integrazione API backend

### Deploy (0% completato)
- ❌ Containerization Docker
- ❌ Deploy Render.com (gratis)
- ❌ HTTPS setup
- ❌ Testing con utenti reali

---

## 🎯 Obiettivo Oggi

**Testiamo il login e l'avvio del server!**

Se funziona, domani completiamo:
1. Inserimento articoli nel popup
2. Salvataggio ordine completo
3. Primo test end-to-end

**Poi passiamo al frontend mobile** (React PWA).

---

## 📞 Domande?

Fammi sapere:
1. Il test login funziona?
2. Il server si avvia senza errori?
3. Riesci a vedere la risposta su `/api/health`?

Appena confermi che funziona, procedo con il resto! 🚀
