# Archibald Backend - Guida Rapida

Backend automatizzato per inserimento ordini nel gestionale Archibald.

## 🚀 Quick Start (Prima Volta)

### 1. Installa Redis
```bash
# Su macOS con Homebrew
brew install redis
brew services start redis

# Verifica che Redis sia attivo
redis-cli ping
# Dovrebbe rispondere: PONG
```

### 2. Installa le dipendenze
```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend
npm install
```

Questo comando scarica tutte le librerie necessarie (Puppeteer, Express, BullMQ, ecc.).
Può richiedere 2-3 minuti la prima volta.

### 2. Testa il login
```bash
npm run test:login
```

Questo comando:
- Apre un browser Chrome controllato da codice
- Va su Archibald e fa login automatico
- Ti mostra se funziona

**IMPORTANTE**: La prima volta vedrai il browser aprirsi! È normale, serve per vedere cosa fa.

---

## 📋 Comandi Disponibili

### Avviare il server API
```bash
npm run dev
```

Il server parte su `http://localhost:3000`

Lascia questo terminale aperto! Il server deve rimanere in esecuzione.

### Testare creazione ordine
```bash
npm run test:order
```

Crea un ordine di test su Archibald.

---

## 🧪 Test con Postman/Insomnia

### 1. Test Login
```http
POST http://localhost:3000/api/test/login
Content-Type: application/json
```

### 2. Crea Ordine
```http
POST http://localhost:3000/api/orders/create
Content-Type: application/json

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
  "notes": "Test da API mobile"
}
```

---

## 🔧 Configurazione

### Environment Variables

Il backend richiede variabili di ambiente configurate in un file `.env`.

**Setup:**

1. Copia il file template:
   ```bash
   cp .env.example .env
   ```

2. Modifica `.env` con le tue credenziali reali:
   ```bash
   nano .env  # oppure usa il tuo editor preferito
   ```

3. Variabili richieste:
   - `ARCHIBALD_URL` - URL del tuo server Archibald ERP
   - `ARCHIBALD_USERNAME` - Il tuo username Archibald ERP
   - `ARCHIBALD_PASSWORD` - La tua password Archibald ERP
   - `REDIS_HOST` / `REDIS_PORT` - Server Redis per job queue
   - `PORT` - Porta del server (default: 3000)
   - `LOG_LEVEL` - Livello di logging (info, debug, warn, error)

**⚠️ SECURITY:**
- Il file `.env` è gitignored e **NON DEVE MAI** essere committato
- Usa password forti (12+ caratteri, maiuscole, numeri, simboli)
- Ruota le credenziali immediatamente se accidentalmente esposte
- In produzione usa secrets manager (Docker secrets, cloud provider config)

---

## 📁 Struttura File

```
backend/
├── src/
│   ├── index.ts              # Server Express API
│   ├── archibald-bot.ts      # Automazione Puppeteer
│   ├── config.ts             # Configurazione
│   ├── logger.ts             # Logging
│   ├── schemas.ts            # Validazioni
│   ├── types.ts              # Tipi TypeScript
│   └── scripts/
│       └── test-login.ts     # Test login
├── .env                      # Credenziali (NON committare!)
├── package.json              # Dipendenze
└── README.md                 # Questa guida
```

---

## ❓ FAQ

### Il login non funziona
1. Verifica che le credenziali in `.env` siano corrette
2. Controlla che Archibald sia raggiungibile: `ping 4.231.124.90`
3. Guarda i log nel terminale per errori

### Il browser non si apre
- Controlla che Puppeteer sia installato: `npm install`
- Su Mac, potrebbe servire permesso Sicurezza per Chrome

### Come faccio a vedere cosa fa il browser?
Nel file `.env` cambia:
```
NODE_ENV=development
```

Così il browser si apre visibile (non headless).

---

## 🐛 Problemi? Debug

### Log dettagliati
I log sono salvati in:
- `logs/combined.log` - Tutti i log
- `logs/error.log` - Solo errori

Aprili con:
```bash
tail -f logs/combined.log
```

---

## 📞 Contatti

Per problemi scrivi nel gruppo Telegram/WhatsApp del team.
