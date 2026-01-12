# Archibald Mobile - PWA

Progressive Web App per inserimento ordini nel gestionale Archibald.

## 🚀 Quick Start

### 1. Installa dipendenze
```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend
npm install
```

### 2. Avvia dev server
```bash
npm run dev
```

La PWA sarà disponibile su: http://localhost:5173

### 3. Build per produzione
```bash
npm run build
```

I file buildati saranno in `dist/`

## 📱 Features

### ✅ Implementate
- 📱 UI mobile-first responsive
- 🔄 Form multi-articolo dinamico
- 📊 Tracking stato ordine in real-time
- 🎨 Design moderno con gradients
- ⚡ Performance ottimizzate per mobile
- 🌐 PWA-ready (installabile su home screen)
- 🔌 API integration con backend
- 🎤 **Voice Input - Dettatura completa ordine** (NEW!)
  - Web Speech API nativa (Chrome, Safari iOS 14.5+, Edge)
  - Parsing intelligente: "cliente Mario Rossi, indirizzo Via Roma 10, articolo SF1000 quantità 5"
  - Real-time feedback e suggerimenti
  - Fallback manuale per browser non supportati

### 🎯 Screens

#### 1. Order Form
- Input dati cliente (ID, nome, indirizzo, data consegna)
- Aggiunta dinamica articoli
- Validazione form
- Submit asincrono

#### 2. Order Status
- Visualizzazione stato job (waiting/active/completed/failed)
- Progress bar
- Auto-refresh ogni 2 secondi
- Display ID ordine creato
- Tempo elaborazione

## 🛠 Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **Vite-Plugin-PWA** - PWA support
- **CSS3** - Styling (no frameworks, mobile-first)

## 📦 PWA Features

### Manifest
- Installabile su iOS/Android/Desktop
- Icone adaptive (192x192, 512x512)
- Display standalone (full screen)
- Orientation portrait

### Service Worker
- Auto-update on new version
- API caching strategy (NetworkFirst)
- Offline-ready

## 🎨 Design

### Mobile-First
- Touch targets min 44px (iOS standard)
- Font-size 16px+ (no zoom on iOS)
- Safe area insets per notch
- Overscroll behavior disabled
- Dynamic viewport height (dvh)

### Responsive
- ✅ iPhone SE (375px)
- ✅ iPhone 14 Pro (390px)
- ✅ iPad Mini (768px)
- ✅ iPad Pro (1024px)
- ✅ Android phones (360px+)

## 🔌 API Integration

Backend API: `http://localhost:3000`

### Endpoints Utilizzati
```typescript
// Create order
POST /api/orders/create
Body: {
  customerId: string,
  customerName: string,
  deliveryAddress: string,
  deliveryDate: string,
  items: Array<{
    articleCode: string,
    description: string,
    quantity: number,
    size: string,
    price: number
  }>,
  notes?: string
}
Response: { success: true, data: { jobId: string } }

// Check status
GET /api/orders/status/:jobId
Response: {
  success: true,
  data: {
    status: 'waiting'|'active'|'completed'|'failed',
    progress?: number,
    result?: { orderId: string, duration: number },
    error?: string
  }
}
```

## 📝 Scripts

```bash
# Development
npm run dev              # Start dev server (port 5173)

# Build
npm run build            # TypeScript check + Vite build
npm run preview          # Preview production build

# Type checking
npm run type-check       # TypeScript validation
```

## 🔧 Configuration

### Vite Config
- Port: 5173
- Proxy: `/api` → `http://localhost:3000`
- PWA auto-update enabled
- Service worker configured

### TypeScript
- Strict mode enabled
- React JSX transform
- ES2020 target

## 📱 Testing su Device

### iOS (Safari)
1. Apri http://[YOUR_IP]:5173 su Safari
2. Tap "Share" → "Add to Home Screen"
3. L'app si aprirà fullscreen

### Android (Chrome)
1. Apri http://[YOUR_IP]:5173 su Chrome
2. Tap "..." → "Install app"
3. L'app si aprirà fullscreen

### Desktop
1. Apri http://localhost:5173 su Chrome/Edge
2. Click icona "Install" nella URL bar
3. L'app si aprirà come finestra standalone

## 🎤 Voice Input - Come Funziona

### Attivazione
1. Clicca sul pulsante verde **"🎤 Dettatura Completa Ordine"** all'inizio del form
2. Consenti l'accesso al microfono quando richiesto dal browser
3. Inizia a parlare

### Formato Dettatura
Dettare l'ordine in modo naturale, includendo le informazioni in qualsiasi ordine:

```
"Cliente Mario Rossi, indirizzo Via Roma 10 Milano, data consegna domani,
articolo SF1000 quantità 5, articolo TD1272 punto 314 quantità 2,
note consegna urgente"
```

### Keywords Riconosciute
- **Cliente**: `cliente [nome]` o `nome cliente [nome]`
- **Indirizzo**: `indirizzo [via]` o `via [indirizzo]`
- **Data**: `data consegna [data]` o `consegna [data]`
  - Date relative: `oggi`, `domani`, `dopodomani`
  - Date esplicite: `15 gennaio`, `10/01`
- **Articoli**: `articolo [codice] quantità [num]`
  - Codici speciali: `punto` → `.`, `trattino` → `-`
  - Esempio: `TD1272 punto 314` → `TD1272.314`
- **Note**: `note [testo]` o `nota [testo]`

### Suggerimenti Real-Time
Durante la dettatura, l'app mostra suggerimenti su cosa dire successivamente:
- "Aggiungi 'cliente [nome]'"
- "Aggiungi 'articolo [codice] quantità [numero]'"
- "Aggiungi 'indirizzo [via]'"

### Browser Supportati
| Browser | Supporto | Note |
|---------|----------|------|
| Chrome Desktop | ✅ Completo | Miglior esperienza |
| Chrome Android | ✅ Completo | Ottima esperienza mobile |
| Safari iOS 14.5+ | ✅ Completo | Richiede iOS 14.5 o superiore |
| Safari iOS <14.5 | ⚠️ Limitato | Usa input manuale |
| Edge Desktop | ✅ Completo | Chromium-based |
| Firefox | ❌ Non supportato | Usa input manuale |

### Permessi Microfono
#### iOS Safari
1. Vai in Impostazioni → Safari → Microfono
2. Seleziona "Chiedi" o "Consenti"
3. Ricarica la pagina

#### Android Chrome
1. Tap sull'icona lucchetto nella URL bar
2. Seleziona "Permessi sito"
3. Abilita "Microfono"

#### Desktop
1. Click sull'icona lucchetto nella URL bar
2. Clicca su "Permessi sito"
3. Abilita "Microfono"

## 🎯 Roadmap Future

- [ ] Barcode scanner per codici articolo
- [ ] Offline mode con sync
- [ ] Storico ordini locali
- [ ] Push notifications per stato ordine
- [ ] Geolocalizzazione per indirizzo consegna
- [ ] Foto allegati (bolla, ecc.)
- [ ] Dark mode
- [ ] Multi-lingua (IT/EN)
- [ ] Voice input per singoli campi (oltre alla dettatura completa)

## 📞 Support

Per problemi o feature requests, contatta il team Fresis.
