# Proposta Tecnica - Interfaccia Mobile Archibald

## Executive Summary

Svilupperemo una **Progressive Web App (PWA)** mobile-friendly che permette di:
- ✅ Inserire ordini velocemente da smartphone/tablet
- ✅ Modificare ordini esistenti
- ✅ Cercare prodotti per codice o nome
- ✅ Utilizzabile da 5-20 colleghi senza formazione tecnica

**Tempo stimato di sviluppo**: 3-4 settimane
**Stack tecnologico**: React (frontend) + Node.js + Puppeteer (backend)

---

## Architettura Tecnica

### Stack Completo

```
┌─────────────────────────────────────────────┐
│         MOBILE/TABLET (Browser)              │
│                                              │
│  Progressive Web App (React + TypeScript)   │
│  - Form inserimento ordine ottimizzato touch│
│  - Autocomplete clienti/prodotti            │
│  - Validazioni client-side                  │
│  - Installabile come app nativa             │
└──────────────────┬──────────────────────────┘
                   │
                   │ HTTPS REST API (JSON)
                   │
┌──────────────────▼──────────────────────────┐
│        BACKEND SERVER (Node.js)              │
│                                              │
│  Express.js API Server                       │
│  - POST /api/orders/create                   │
│  - PUT /api/orders/:id                       │
│  - GET /api/customers/search                 │
│  - GET /api/products/search                  │
│  - Redis cache (clienti/prodotti)           │
│  - Pool di sessioni Puppeteer               │
└──────────────────┬──────────────────────────┘
                   │
                   │ Puppeteer Browser Automation
                   │
┌──────────────────▼──────────────────────────┐
│    HEADLESS BROWSER (Chromium)               │
│                                              │
│  - Mantiene sessione ASP.NET con ViewState  │
│  - Esegue azioni su Archibald come utente   │
│  - Gestisce popup DevExpress                 │
│  - Cattura errori del gestionale            │
└──────────────────┬──────────────────────────┘
                   │
                   │ HTTPS (IP privato 4.231.124.90)
                   │
┌──────────────────▼──────────────────────────┐
│      GESTIONALE ARCHIBALD                    │
│                                              │
│  https://4.231.124.90/Archibald              │
│  - ASP.NET WebForms                          │
│  - Account tecnico: ikiC0930                 │
└──────────────────────────────────────────────┘
```

---

## Frontend: Progressive Web App (PWA)

### Tecnologie
- **React 18** con TypeScript
- **Vite** (build tool veloce)
- **TailwindCSS** + **shadcn/ui** (componenti UI mobile-ready)
- **React Query** (gestione API calls)
- **React Hook Form** + **Zod** (validazioni)

### Funzionalità UI

#### 1. Schermata Inserimento Ordine

```
┌─────────────────────────────────┐
│  📱 Nuovo Ordine                │
├─────────────────────────────────┤
│                                  │
│  👤 Cliente                      │
│  [Cerca cliente...         🔍]  │
│  ┌─────────────────────────┐    │
│  │ Fresis Soc Cooperativa  │    │
│  │ 049421                   │    │
│  └─────────────────────────┘    │
│                                  │
│  📍 Indirizzo consegna           │
│  Via San Vitale, 0               │
│  80006 Ercolano Na              │
│                                  │
│  📅 Data consegna                │
│  [29/12/2025]                    │
│                                  │
│  📦 Articoli                     │
│  ┌─────────────────────────┐    │
│  │ H1294 - 104              │    │
│  │ Taglia: K2  Qty: 1       │    │
│  │ € 5,00             ❌    │    │
│  └─────────────────────────┘    │
│  [+ Aggiungi articolo]           │
│                                  │
│  💬 Note                         │
│  [                          ]    │
│                                  │
│  ┌────────────┐  ┌────────────┐ │
│  │   Annulla  │  │   Salva ✓ │ │
│  └────────────┘  └────────────┘ │
└─────────────────────────────────┘
```

**Features**:
- Autocomplete clienti con debounce (300ms)
- Autocomplete prodotti per codice/nome
- Selezione taglia/variante rapida
- Validazione real-time campi obbligatori
- Loading states durante salvataggio

#### 2. Ricerca Cliente

```
┌─────────────────────────────────┐
│  🔍 Cerca Cliente                │
├─────────────────────────────────┤
│  [fres_                     ]    │
│                                  │
│  Risultati:                      │
│  ┌─────────────────────────┐    │
│  │ Fresis Soc Cooperativa  │✓  │
│  │ 049421                   │    │
│  │ Ercolano (NA)            │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ Fresindo SRL            │    │
│  │ 051203                   │    │
│  │ Milano (MI)              │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

#### 3. Ricerca Prodotto

```
┌─────────────────────────────────┐
│  🔍 Cerca Prodotto               │
├─────────────────────────────────┤
│  [H129_                     ]    │
│                                  │
│  Risultati:                      │
│  ┌─────────────────────────┐    │
│  │ 🖼️ H1294 - 104          │✓  │
│  │                          │    │
│  │ Taglie: 1, 2, 3, K2     │    │
│  │ € 5,00                   │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ 🖼️ H1295 - 105          │    │
│  │                          │    │
│  │ Taglie: 1, 2, K2        │    │
│  │ € 6,50                   │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

#### 4. Lista Ordini (per modifiche)

```
┌─────────────────────────────────┐
│  📋 I Miei Ordini                │
├─────────────────────────────────┤
│  [Cerca ordine...          🔍]  │
│                                  │
│  Oggi                            │
│  ┌─────────────────────────┐    │
│  │ #69809                   │    │
│  │ Fresis Soc Cooperativa  │    │
│  │ 2 articoli • € 10,00    │✏️ │
│  │ 26/12/2025 17:43        │    │
│  └─────────────────────────┘    │
│                                  │
│  Ieri                            │
│  ┌─────────────────────────┐    │
│  │ #69808                   │    │
│  │ Fresindo SRL            │    │
│  │ 5 articoli • € 125,00   │✏️ │
│  │ 25/12/2025 14:22        │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

### PWA Features
- **Installabile**: bottone "Aggiungi a schermata home"
- **Icona personalizzata**: logo Fresis/Archibald
- **Splash screen**: branding durante caricamento
- **Offline-ready**: cache delle liste clienti/prodotti
- **Push notifications** (opzionale): "Ordine #69809 salvato"

---

## Backend: Node.js + Express + Puppeteer

### Tecnologie
- **Node.js 20 LTS** + **TypeScript**
- **Express.js** (API server)
- **Puppeteer** 22+ (browser automation)
- **Redis** (cache + session storage)
- **Winston** (logging)
- **Docker** (containerization)

### API Endpoints

#### 1. Creazione Ordine
```http
POST /api/orders/create
Authorization: Bearer <jwt_token>
Content-Type: application/json

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
    },
    {
      "articleCode": "H1295",
      "description": "105",
      "quantity": 2,
      "size": "2",
      "price": 6.50
    }
  ],
  "notes": "Consegna urgente"
}

Response 200 OK:
{
  "success": true,
  "orderId": "69809",
  "message": "Ordine inserito correttamente",
  "timestamp": "2025-12-26T17:43:47Z"
}

Response 400 Bad Request:
{
  "success": false,
  "error": "Cliente 049421 non trovato",
  "code": "CUSTOMER_NOT_FOUND"
}

Response 500 Internal Server Error:
{
  "success": false,
  "error": "Errore durante inserimento ordine",
  "code": "ORDER_CREATE_FAILED",
  "details": "Timeout durante salvataggio"
}
```

#### 2. Modifica Ordine
```http
PUT /api/orders/:orderId
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "deliveryDate": "2025-12-30",
  "items": [
    {
      "articleCode": "H1294",
      "quantity": 3,
      "size": "K2",
      "price": 5.00
    }
  ],
  "notes": "Data modificata"
}

Response 200 OK:
{
  "success": true,
  "orderId": "69809",
  "message": "Ordine aggiornato correttamente"
}
```

#### 3. Ricerca Clienti
```http
GET /api/customers/search?q=fresis
Authorization: Bearer <jwt_token>

Response 200 OK:
{
  "results": [
    {
      "id": "049421",
      "name": "Fresis Soc Cooperativa",
      "addresses": [
        {
          "street": "Via San Vitale, 0",
          "city": "Ercolano",
          "province": "NA",
          "postalCode": "80006",
          "country": "Italia"
        }
      ],
      "lastOrderDate": "2025-12-26"
    },
    {
      "id": "051203",
      "name": "Fresindo SRL",
      "addresses": [
        {
          "street": "Via Roma, 123",
          "city": "Milano",
          "province": "MI",
          "postalCode": "20100",
          "country": "Italia"
        }
      ]
    }
  ],
  "cached": true,
  "cacheAge": "5m"
}
```

#### 4. Ricerca Prodotti
```http
GET /api/products/search?q=H129
Authorization: Bearer <jwt_token>

Response 200 OK:
{
  "results": [
    {
      "code": "H1294",
      "name": "104",
      "description": "Prodotto 104 linea H",
      "sizes": ["1", "2", "3", "4", "K2"],
      "price": 5.00,
      "currency": "EUR",
      "imageUrl": "https://cdn.example.com/products/H1294.jpg",
      "category": "Linea H",
      "inStock": true
    },
    {
      "code": "H1295",
      "name": "105",
      "sizes": ["1", "2", "K2"],
      "price": 6.50
    }
  ]
}
```

#### 5. Health Check
```http
GET /api/health

Response 200 OK:
{
  "status": "healthy",
  "services": {
    "archibald": "connected",
    "redis": "connected",
    "puppeteer": "ready"
  },
  "uptime": "5d 3h 42m",
  "version": "1.0.0"
}
```

### Puppeteer Automation Strategy

#### Pool di Browser Instances
```typescript
class ArchibaldBrowserPool {
  private browsers: Browser[] = [];
  private maxInstances = 3;

  async getBrowser(): Promise<Browser> {
    // Riusa browser esistente o crea nuovo
    if (this.browsers.length < this.maxInstances) {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--ignore-certificate-errors']
      });
      this.browsers.push(browser);
    }
    return this.browsers[0]; // Round-robin
  }
}
```

#### Automazione Inserimento Ordine
```typescript
async function createOrder(orderData: OrderData): Promise<string> {
  const browser = await browserPool.getBrowser();
  const page = await browser.newPage();

  try {
    // 1. Login (se sessione scaduta)
    await page.goto('https://4.231.124.90/Archibald/Login.aspx');
    await page.type('#username', 'ikiC0930');
    await page.type('#password', 'FresisArch2025@');
    await page.click('#loginButton');
    await page.waitForNavigation();

    // 2. Naviga a "Nuovo Ordine"
    await page.goto('https://4.231.124.90/Archibald/SALESTABLE_DetailViewConcCust/?NewObject=true');
    await page.waitForSelector('#customerField');

    // 3. Seleziona cliente
    await page.type('#customerSearchInput', orderData.customerId);
    await page.waitForSelector('.autocomplete-result');
    await page.click('.autocomplete-result:first-child');

    // 4. Compila dati ordine
    await page.type('#deliveryAddressField', orderData.deliveryAddress);
    await page.type('#deliveryDateField', orderData.deliveryDate);

    // 5. Aggiungi articoli
    for (const item of orderData.items) {
      await page.click('#addItemButton');
      await page.waitForSelector('.product-search-popup');
      await page.type('.product-search-input', item.articleCode);
      await page.click(`.product-result[data-code="${item.articleCode}"]`);
      await page.select('.size-selector', item.size);
      await page.type('.quantity-input', item.quantity.toString());
      await page.click('.confirm-item-button');
    }

    // 6. Salva ordine
    await page.click('#saveOrderButton');
    await page.waitForSelector('.success-message');

    // 7. Estrai ID ordine dalla pagina
    const orderId = await page.$eval('#orderIdField', el => el.textContent);

    return orderId;

  } catch (error) {
    logger.error('Errore durante creazione ordine', { error, orderData });
    throw new Error('ORDER_CREATE_FAILED');
  } finally {
    await page.close();
  }
}
```

### Caching Strategy (Redis)

```typescript
// Cache clienti (TTL: 24h)
const customersCacheKey = 'customers:all';
await redis.setex(customersCacheKey, 86400, JSON.stringify(customers));

// Cache prodotti (TTL: 12h)
const productsCacheKey = 'products:all';
await redis.setex(productsCacheKey, 43200, JSON.stringify(products));

// Invalidazione cache dopo modifiche
await redis.del('customers:all');
```

### Error Handling & Retry Logic

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

// Uso
const orderId = await withRetry(() => createOrder(orderData));
```

---

## Deploy & Infrastruttura

### Opzione A: Server Cloud (DigitalOcean - Consigliata)

**Specifiche**:
- **Droplet**: CPU-Optimized, 2 vCPU, 4GB RAM
- **Costo**: ~$24/mese
- **OS**: Ubuntu 22.04 LTS
- **Software**: Docker + Docker Compose

**Setup**:
```bash
# 1. Provisioning server
doctl compute droplet create archibald-proxy \
  --image ubuntu-22-04-x64 \
  --size c-2 \
  --region fra1 \
  --ssh-keys <your-ssh-key>

# 2. Installa Docker
apt update && apt install -y docker.io docker-compose

# 3. Deploy con Docker Compose
docker-compose up -d
```

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - ARCHIBALD_URL=https://4.231.124.90/Archibald
      - ARCHIBALD_USER=ikiC0930
      - ARCHIBALD_PASSWORD=FresisArch2025@
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped
    volumes:
      - redis-data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  redis-data:
```

**Sicurezza**:
- HTTPS con Let's Encrypt (Certbot)
- Firewall (ufw): solo porte 80, 443, 22
- JWT authentication per API
- Rate limiting (max 100 req/min per IP)

### Opzione B: Server Aziendale

**Requisiti**:
- Ubuntu/Debian server con accesso SSH
- Accesso alla rete interna (per raggiungere 4.231.124.90)
- Docker installato
- Porta 3000 esposta (o reverse proxy Nginx)

**Pro**: nessun costo aggiuntivo, dati rimangono in azienda
**Contro**: serve configurazione IT aziendale

---

## Timeline di Sviluppo

### Settimana 1: Setup & Automazione Base
- [x] Setup repository Git
- [ ] Setup progetto Node.js + TypeScript
- [ ] Configurazione Puppeteer + test login
- [ ] Script automazione inserimento ordine semplice
- [ ] Test manuale creazione ordine

### Settimana 2: Backend API
- [ ] Endpoint POST /api/orders/create
- [ ] Endpoint GET /api/customers/search con cache
- [ ] Endpoint GET /api/products/search con cache
- [ ] Error handling e logging
- [ ] Endpoint modifica ordine
- [ ] Testing backend (Postman/Insomnia)

### Settimana 3: Frontend PWA
- [ ] Setup React + Vite + TypeScript
- [ ] UI form inserimento ordine
- [ ] Autocomplete clienti/prodotti
- [ ] Validazioni client-side
- [ ] Integrazione API backend
- [ ] PWA manifest + service worker

### Settimana 4: Deploy & Testing
- [ ] Setup server cloud (DigitalOcean)
- [ ] Docker containerization
- [ ] Deploy backend + frontend
- [ ] HTTPS con Let's Encrypt
- [ ] Testing end-to-end con utenti reali
- [ ] Documentazione utente + video tutorial
- [ ] Distribuzione link PWA ai colleghi

---

## Costi Stimati

### Sviluppo
- **Tempo sviluppo**: 3-4 settimane (80-100 ore)
- **Costo orario**: variabile (fai-da-te o freelancer)

### Infrastruttura Cloud (mensili)
- **Server DigitalOcean**: $24/mese
- **Dominio** (opzionale): $12/anno
- **Backup automatici**: $4/mese
- **Monitoring (UptimeRobot)**: gratuito
- **TOTALE**: ~$30/mese

### Alternativa On-Premise
- **Hardware**: server esistente (costo $0)
- **Manutenzione**: IT interno
- **TOTALE**: $0/mese

---

## Rischi & Mitigazioni

### Rischio 1: Cambio UI Archibald
**Probabilità**: Media
**Impatto**: Alto
**Mitigazione**:
- Selettori CSS robusti (ID > classi > xpath)
- Logging dettagliato per debug rapido
- Test automatici settimanali

### Rischio 2: Performance Browser Headless
**Probabilità**: Bassa
**Impatto**: Medio
**Mitigazione**:
- Pool di browser instances (max 3 simultanei)
- Timeout gestiti (max 30s per operazione)
- Fallback manuale se troppi errori

### Rischio 3: Sicurezza Credenziali
**Probabilità**: Bassa
**Impatto**: Alto
**Mitigazione**:
- Credenziali in environment variables (mai in codice)
- HTTPS obbligatorio
- Rotazione password account tecnico ogni 3 mesi
- Audit log di tutti gli ordini creati

### Rischio 4: Adozione Utenti
**Probabilità**: Media
**Impatto**: Alto
**Mitigazione**:
- Coinvolgere 2-3 utenti durante sviluppo per feedback
- Video tutorial step-by-step
- Supporto Telegram/WhatsApp primo mese

---

## Success Metrics

### KPI Tecnici
- **Uptime**: > 99% (max 7h downtime/mese)
- **Latency API**: < 3s per creazione ordine
- **Error rate**: < 5%
- **Cache hit rate**: > 80%

### KPI Business
- **Adoption rate**: > 70% colleghi usa l'app entro 1 mese
- **Tempo inserimento ordine**: da 5-10 min → 1-2 min
- **Ordini/giorno tramite app**: > 10
- **Soddisfazione utenti**: > 4/5 stelle

---

## Prossimi Step Immediati

### Per Procedere con lo Sviluppo

1. **Conferma Proposta**: questo approccio ti convince?
2. **Infrastruttura**: server cloud ($30/mese) o on-premise aziendale?
3. **Kick-off Meeting**: 1h call per allinearci su priorità
4. **Accessi**: conferma credenziali account tecnico
5. **Budget**: se serve freelancer, definire budget

### Domande Aperte

- Hai un logo/branding Fresis da usare nella PWA?
- Serve integrazione con altri sistemi (es: magazzino, CRM)?
- Ci sono vincoli normativi (GDPR, privacy) da considerare?
- Chi sarà il referente tecnico aziendale per supporto IT?

---

**Pronto a partire? Fammi sapere cosa ne pensi e possiamo iniziare subito con il setup del progetto! 🚀**
