# Formicanera — Materiali Commerciali v2

**Data:** 2026-03-31  
**Scope:** Video Remotion redesign completo + aggiornamento presentazione + aggiornamento proposta commerciale  
**Trigger:** Aggiunta 8 nuove funzionalità implementate, rimozione batch ops, redesign video con massima qualità animazioni Apple

---

## 1. Obiettivo

Aggiornare tutti i materiali commerciali Formicanera per riflettere il set completo di funzionalità implementate. Il video è il deliverable principale: deve essere di qualità da keynote Apple, lasciare a bocca aperta il CEO di Komet Italia, trasmettere in modo visivo e immediato l'enorme vantaggio competitivo di Formicanera sull'ERP.

---

## 2. Modifiche Feature List

### Feature AGGIUNTE (già implementate, non elencate in precedenza)

1. **Ricerca storico cliente con copia istantanea** — ricerca nello storico ordini di un cliente, selezione di singoli articoli o ordini interi, copia in nuovo ordine con un tap
2. **Ricerca articoli magazzino con check istantaneo** — ricerca nel catalogo con verifica disponibilità stock in tempo reale, badge verde/rosso
3. **Preventivi con un click** — da qualsiasi ordine/storico, genera preventivo PDF in un tap, condivisibile via share sheet
4. **Integrazione WhatsApp** — condivisione ordini, documenti e notifiche via WhatsApp
5. **Integrazione Dropbox** — sync e archiviazione documenti DDT/fatture su Dropbox
6. **Integrazione Google** — sync con Google Drive / Google Workspace
7. **Integrazione Gmail** — invio automatico documenti e notifiche via Gmail
8. **Gestione IVA e totali automatizzati** — calcolo IVA, sconti riga, sconto testata e spese trasporto in tempo reale durante la creazione ordine
9. **Immagazzinamento ordini e invio differito** — salva ordini durante la giornata, invia tutti insieme quando si vuole
10. **Consultazione libreria ordini con filtri e ricerche globali** — storico completo con filtri avanzati (cliente, data, importo, stato) e ricerca full-text
11. **Schede clienti migliorate** — anagrafica completa, badge completezza con dettaglio mancanze, storico inline, indirizzi multipli, note

### Feature RIMOSSE dalla comunicazione

- ~~Operazioni batch: selezione multipla, invio/eliminazione in sequenza automatica~~ (rimossa dalla lista punti di forza espliciti)

---

## 3. Video Redesign — Specifiche Complete

### 3.1 Tech Stack

| Parametro | Valore |
|-----------|--------|
| Framework | Remotion 4 + React 19 + TypeScript |
| Risoluzione | 1920×1080 |
| FPS | 30 |
| Durata totale | ~6390 frame (~213s, ~3:33) |
| Audio | Musica royalty-free Apple Keynote style, fade-out ultimi 3s |
| Font | Inter (300, 400, 600, 700, 800, 900) via Google Fonts |
| Output | MP4 H.264, CRF 18 |

### 3.2 Design Tokens — Apple Light HIG

```ts
// lib/palette.ts
export const palette = {
  // Backgrounds
  bg:           '#F2F2F7',   // sfondo principale scene chiare
  bgDark:       '#1C1C1E',   // sfondo scene problema/bot
  bgCard:       '#FFFFFF',   // cards
  bgCardDark:   '#2C2C2E',   // cards su sfondo scuro

  // System Colors (Apple HIG)
  blue:         '#007AFF',
  green:        '#34C759',
  orange:       '#FF9500',
  red:          '#FF3B30',
  purple:       '#5856D6',
  yellow:       '#FFCC00',
  teal:         '#5AC8FA',

  // Text
  textPrimary:  '#1C1C1E',
  textSecondary:'#3A3A3C',
  textMuted:    '#8E8E93',
  textWhite:    '#FFFFFF',
  textWhiteDim: 'rgba(255,255,255,0.60)',
  textWhiteFaint:'rgba(255,255,255,0.35)',

  // Separators
  divider:      '#E5E5EA',
  dividerDark:  'rgba(255,255,255,0.12)',

  // Shadows
  shadowCard:   '0 4px 24px rgba(0,0,0,0.08)',
  shadowCardMd: '0 8px 40px rgba(0,0,0,0.12)',
  shadowCardLg: '0 16px 64px rgba(0,0,0,0.16)',
} as const;
```

### 3.3 Spring Configurations

```ts
// lib/springs.ts
import { SpringConfig } from 'remotion';

// Entry decisa di cards grandi
export const springCard: SpringConfig = { mass: 1, damping: 15, stiffness: 100 };

// Bounce morbido per badge, loghi, pill
export const springBounce: SpringConfig = { mass: 0.8, damping: 18, stiffness: 120 };

// Testo preciso, nessun bounce
export const springText: SpringConfig = { mass: 1, damping: 200, stiffness: 300 };

// Elementi grandi, entrata gentile
export const springGentle: SpringConfig = { mass: 1.2, damping: 20, stiffness: 80 };

// Micro-interazioni (checkmark, dot)
export const springSnap: SpringConfig = { mass: 0.6, damping: 14, stiffness: 200 };

// Easing Apple standard
export const easingApple = Easing.bezier(0.25, 0.1, 0.25, 1);
export const easingAppleOut = Easing.bezier(0.0, 0.0, 0.2, 1);
```

### 3.4 Timing Constants

```ts
// lib/timing.ts
export const FPS = 30;
export const TRANSITION = 15; // crossfade tra scene (0.5s)

export const SCENE_FRAMES = {
  logo:          120,  // 4s
  problem:       420,  // 14s
  solution:      150,  // 5s
  orders:        540,  // 18s
  iva:           480,  // 16s
  pending:       480,  // 16s
  storico:       600,  // 20s
  clients:       540,  // 18s
  warehouse:     420,  // 14s
  quotes:        420,  // 14s
  dashboard:     480,  // 16s
  documents:     480,  // 16s
  integrations:  540,  // 18s
  notifications: 420,  // 14s
  closing:       300,  // 10s
} as const;
```

### 3.5 Struttura File

```
docs/commerciale/video/src/
├── Root.tsx                    # Composition principale
├── Video.tsx                   # Sequencer con <Series>
├── scenes/
│   ├── LogoIntro.tsx           # Scena 0
│   ├── Problem.tsx             # Scena 1
│   ├── Solution.tsx            # Scena 2
│   ├── Orders.tsx              # Scena 3 (REDESIGN)
│   ├── IvaAndTotals.tsx        # Scena 4 (NUOVA)
│   ├── PendingOrders.tsx       # Scena 5 (NUOVA)
│   ├── Storico.tsx             # Scena 6 (NUOVA)
│   ├── Clients.tsx             # Scena 7 (REDESIGN)
│   ├── Warehouse.tsx           # Scena 8 (NUOVA)
│   ├── Quotes.tsx              # Scena 9 (NUOVA)
│   ├── Dashboard.tsx           # Scena 10 (REDESIGN)
│   ├── Documents.tsx           # Scena 11 (NUOVA)
│   ├── Integrations.tsx        # Scena 12 (NUOVA)
│   ├── Notifications.tsx       # Scena 13 (REDESIGN)
│   └── Closing.tsx             # Scena 14 (REDESIGN)
├── components/
│   ├── FrostedCard.tsx         # Card con shadow + 3D tilt
│   ├── DarkCard.tsx            # Card scura (#1C1C1E)
│   ├── AnimatedNumber.tsx      # Contatore numerico spring
│   ├── ProgressBar.tsx         # Barra avanzamento animata
│   ├── BotTimeline.tsx         # Timeline bot con dot animati
│   ├── SearchBar.tsx           # Barra ricerca con risultati live
│   ├── NotifCard.tsx           # Notification card con border-left
│   ├── MetricCard.tsx          # Dashboard metric card
│   ├── StatPill.tsx            # Pill colorata (es. "3 min")
│   ├── BadgeGreen.tsx          # Badge ✓ verde con spring pop
│   └── IntegrationHub.tsx      # Hub integrazioni con linee animate
└── lib/
    ├── palette.ts
    ├── springs.ts
    └── timing.ts
```

### 3.6 Specifiche Scene — Animazioni Dettagliate

---

#### SCENA 0 — Logo Intro (120f · 4s)

**Sfondo:** `#F2F2F7` con radial gradient `#007AFF` 8% opacity al centro  
**Entrata logo:** `spring(springBounce)` da frame 0, scala 0.3→1, translateY -60→0  
**"Formicanera":** `interpolate(frame, [15,35], [0,1])` opacity + translateY 10→0  
**Tagline "Il vantaggio competitivo":** delay 30f, stessa animazione  
**Uscita:** `interpolate(frame, [105,120], [1,0])` opacity + scale 1→0.95  

---

#### SCENA 1 — Il Problema (420f · 14s)

**Sfondo:** `#1C1C1E` — crossfade 15f da scena precedente  
**Header:** "Lavorare con Archibald ERP nel 2026" — fade-in frame 10  
**8 punti critici** entrano in stagger ogni 40f, slide-in da destra (translateX 50→0) + fade:

| Frame | Punto | Colore dot |
|-------|-------|-----------|
| 30 | "Nessun accesso da mobile — zero app, zero responsive" | `#FF3B30` |
| 70 | "20 minuti per piazzare un ordine" | `#FF3B30` |
| 110 | "Zero notifiche proattive — l'agente cerca sempre lui" | `#FF9500` |
| 150 | "Operazioni identiche ripetute a mano ogni giorno" | `#FF9500` |
| 190 | "Dati dispersi in schermate diverse, nessun cruscotto" | `#FF9500` |
| 230 | "DDT e fatture: processo separato per ogni documento" | `#8E8E93` |
| 270 | "Tracking spedizioni? Telefonare o uscire dall'app" | `#8E8E93` |
| 310 | "Senza connessione: l'agente è completamente cieco" | `#8E8E93` |

**Sottotitolo:** "— Il lavoro quotidiano di un agente Komet" fade-in a frame 360, `textMuted`  
**Uscita:** fade-out completo 405→420  

---

#### SCENA 2 — La Soluzione (150f · 5s)

**Sfondo:** gradient `#007AFF → #0055D4` — crossfade 15f da scuro a blu  
**Testo 1:** "Poi arriva" — `interpolate(frame,[10,30],[0,1])` opacity, `#FFFFFF` 70%  
**Testo 2:** "Formicanera." — `spring(springBounce, frame-20)` scala 0.5→1 + opacity, bianco, 80px bold 900  
**Glow pulse:** `interpolate(frame,[40,80,120,140],[0,1,0.6,0])` opacity su radial glow attorno al testo  
**Uscita:** fade-out 135→150  

---

#### SCENA 3 — Inserimento Ordini + Bot Automatico (540f · 18s)

**Sfondo:** `#F2F2F7`  
**Layout:** 3 colonne centrate con gap 52px

**Colonna sinistra — Order Card 3D (delay 0f):**
- `FrostedCard` con `rotateY(-8deg) rotateX(3deg)`, `springCard` da translateX(-80)→0
- Contenuto: "Ordine #4821", "Studio Dr. Bianchi" 28px 800, "€ 1.240,00" 44px 900 blue
- Badge "✓ Inviato a Verona" verde — `springBounce` delay 30f

**Colonna centrale — Stat (delay 40f):**
- `StatPill` "3 min" blu — `spring(springBounce)` scala 0→1
- Sotto: "vs 20 min con Archibald" — `interpolate(frame-70,[0,20],[0,1])` opacity, `textMuted`

**Colonna destra — Bot Timeline (delay 60f):**
- `DarkCard` con `translateX(80→0)` `springCard`
- Header "Bot Archibald" uppercase `textMuted`
- 3 step animati con stagger 30f ciascuno:
  - **Step 1** "Login Archibald" — dot verde immediato (già fatto)
  - **Step 2** "Inserimento dati" — dot azzurro pulsante → verde a frame 120
  - **Step 3** "Conferma a Verona" — dot grigio → blu a frame 150 → verde a frame 240
- Ogni dot: `springSnap` scala 0→1, transizione colore `interpolate`
- Linea verticale di connessione: `interpolate(frame,[60,300],[0,100])%` height

**Dettaglio finale (frame 280→380):**
- Nuova riga appare in FrostedCard: "ERP ref: STO-2026-4821" con typing effect
- Progress bar sottile blu che si riempie in 3s
- Badge finale: "Registrato su Archibald ✓" spring pop-in

---

#### SCENA 4 — IVA e Totali Automatizzati (480f · 16s)

**Sfondo:** `#F2F2F7`  
**Concetto:** mostrare che durante la compilazione dell'ordine tutto si calcola da solo

**Layout:** form card centrata (width 560px) + panel laterale destro "Riepilogo live"

**Form card — articoli che appaiono in sequenza (stagger 60f):**
- Frame 20: articolo 1 "Fresa conica Ø1.2" — slide da sinistra, qty=2, prezzo €45.00
  - Subtotale riga appare con `AnimatedNumber` 0→€90.00
- Frame 80: articolo 2 "Kit impianto standard" — qty=1, prezzo €320.00
  - Subtotale 0→€320.00
- Frame 140: articolo 3 "Cemento provvisorio" — qty=5, prezzo €12.00
  - Subtotale 0→€60.00
- Frame 200: sconto testata 15% — slider si muove da 0→15%, badge arancio
- Frame 240: spese trasporto: calcolatore mostra imponibile > €200 → "Trasporto: €0,00 ✓"

**Panel destro "Riepilogo live" (aggiornamento a ogni articolo):**
- Imponibile: `AnimatedNumber` aggiornato live ad ogni step
- IVA 22%: `AnimatedNumber` calcolata in automatico, highlight verde lampeggiante ad ogni update
- Sconto: `AnimatedNumber` dal campo sconto testata
- **TOTALE**: 80px 900, `AnimatedNumber` blu, scala leggermente (1.0→1.05→1.0) ad ogni update
- Checkmark "Calcolo automatico ✓" verde — pop-in springBounce a frame 300

---

#### SCENA 5 — Pending Orders: Immagazzina e Invia Quando Vuoi (480f · 16s)

**Sfondo:** `#F2F2F7`  
**Concetto:** raccogliere ordini durante la giornata, inviare tutto in una volta

**Fase 1 — Accumulo (frame 0→240):**
- Header: "Ordini in attesa — mattina" con clock icon
- 4 order cards entrano in stagger ogni 50f dall'alto, si "impilano" con offset Y progressivo
  - Card 1: "Studio Dr. Bianchi — €1.240,00"
  - Card 2: "Lab. Dott. Rossi — €890,00"
  - Card 3: "Clinica Azzurra — €2.100,00"
  - Card 4: "Studio Marino — €445,00"
- Ogni card: `FrostedCard` con `springCard`, badge giallo "In attesa"
- Totale accumulato in basso: `AnimatedNumber` cresce ad ogni card aggiunta

**Fase 2 — Invio Batch (frame 240→420):**
- Testo "Sei pronto a inviare?" fade-in
- Button "Invia tutti a Verona →" — `springBounce` scale-in, colore `#007AFF`
- Tap simulato (frame 270): button scala 0.95→1.0 spring
- Le 4 cards si trasformano in progress bar (crossfade 15f):
  - `ProgressBar` si riempie per ognuna in sequenza con stagger 40f
  - Al completamento: sfondo verde, "✓ Inviato", `springSnap`
- Ultima card completata: badge grande "4/4 Inviati ✓" spring pop-in verde

---

#### SCENA 6 — Storico Ordini: Ricerca Globale + Copia Istantanea (600f · 20s)

**Sfondo:** `#F2F2F7`  
**Concetto:** trovare qualsiasi ordine/articolo in secondi, copiarlo istantaneamente

**Fase 1 — Lista Storico (frame 0→100):**
- Header "Storico Ordini — Dr. Bianchi" con contatore "47 ordini"
- Lista scroll con 5 order rows che appaiono in stagger 15f
- Ogni row: data | cliente | importo | stato badge
- Filtri pills in alto: "Tutti" | "2026" | "Confermati" — active state su "Tutti"

**Fase 2 — Ricerca Live (frame 100→220):**
- `SearchBar` scala-in con `springCard`
- Typing effect: "fresa" si scrive carattere per carattere (ogni 8f)
- Risultati: lista si aggiorna live, 3 ordini con "fresa" evidenziata in giallo
- Header si aggiorna: "3 risultati per 'fresa'"
- Ogni match: testo highlight `background: #FFCC0040`, border-left `#FFCC00`

**Fase 3 — Selezione Articoli + Copia (frame 220→480):**
- Tap su ordine #3821 — espande con spring, mostra 4 articoli
- Checkbox appaiono a sinistra di ogni articolo con `springSnap`
- Utente "seleziona" fresa conica + kit impianto (dot blu fill animati)
- Counter bottom: "2 articoli selezionati" spring pop-in
- Button "Copia in nuovo ordine →" slide-up da bottom, blu
- **Animazione "fly-to-form"** (frame 380→450):
  - La scena diventa split-screen: lista storico si comprime a sinistra (width 45%), form "Nuovo Ordine" appare a destra (width 55%) con `springCard` translateX(100%→0)
  - I 2 articoli selezionati si "staccano" dal pannello sinistro e volano in diagonale verso il form destro
  - Path curvilinea con bezier, scala 1.0→0.4 durante il volo, poi 0.4→1.0 all'atterraggio
  - Atterrano nelle righe articolo del form pre-compilato, con bounce `springSnap`
  - Form destra mostra già i 2 articoli con i campi popolati
- Badge "Ordine pre-compilato ✓" verde springBounce centrato sopra il form

**Fase 4 — Filtri Avanzati (frame 480→570):**
- Panel filtri espande da destra con `springCard`
- Filtri: Data range, Importo min/max, Stato, Cliente
- Ogni filtro appare in stagger 10f
- Counter aggiornato in tempo reale

---

#### SCENA 7 — Schede Clienti Migliorate + Wizard Creazione (540f · 18s)

**Sfondo:** `#F2F2F7`  
**Concetto:** schede complete + wizard guidato per nuovi clienti

**Fase 1 — Scheda Cliente (frame 0→220):**
- **Layout split**: card cliente a sinistra (width 340px) + storico inline a destra
- Card cliente appare con `springCard` translateX(-60→0):
  - Avatar initials con background blu
  - "Studio Dr. Bianchi" 28px 800
  - P.IVA, CF, indirizzo — ogni campo appare in stagger 15f
  - **Badge completezza** verde "✓ Profilo completo" springBounce delay 80f
  - 3 indirizzi alternativi in pill grigie, entrano con stagger
  - "Note cliente" con testo truncato
- Storico inline a destra: 5 mini-rows ordini in stagger, importo blu, stato badge

**Fase 2 — Wizard Creazione Cliente (frame 220→480):**
- Crossfade a wizard card centrata (width 560px) con `springCard`
- Header: "Nuovo Cliente — Step 1 di 6"
- Progress bar step: 6 dot, il primo si illumina di blu

**Step animati in sequenza (stagger 40f):**

| Frame | Step | Animazione chiave |
|-------|------|-------------------|
| 220 | Dati base: Ragione sociale + tipo | campi slide-in da destra |
| 260 | P.IVA — typing "04821760652" | carattere per carattere, 6f ciascuno |
| 320 | Validazione P.IVA | spinner 1s → badge "✓ P.IVA verificata" verde springBounce + auto-fill CF + indirizzo legale |
| 380 | Indirizzo + CAP (popup iframe) | mini popup slide-up |
| 420 | Termini pagamento | dropdown apre con spring |
| 460 | Review: 28 campi riepilogati | grid 4 col fade-in stagger |

- **Bot action** (frame 490→520): "🤖 Bot crea su Archibald" spinner blue → "✓ Cliente creato su ERP" verde

---

#### SCENA 8 — Ricerca Articoli Magazzino + Check Istantaneo (420f · 14s)

**Sfondo:** `#F2F2F7`  
**Concetto:** trovare qualsiasi articolo e sapere subito se è disponibile

**Layout:** colonna centrale (width 560px)

**Fase 1 — SearchBar Catalogo (frame 0→80):**
- `SearchBar` appare con `springCard`
- Typing "fresa conica" — ogni carattere 6f
- Risultati live: 6 product rows in stagger 12f

**Ogni product row:**
- Codice articolo + nome
- Badge stock: verde "In magazzino: 48 pz" / rosso "Esaurito" / arancio "Ultimi 3"
- Prezzo cliente specifico (non listino generico)
- Freccia tap

**Fase 2 — Dettaglio Articolo (frame 120→300):**
- Tap su "Fresa conica Ø1.2" — espande in card dettaglio con `springCard`
- Contenuto:
  - Immagine placeholder con gradient
  - Codice ERP: "FRE-012-STD"
  - Stock in tempo reale — `AnimatedNumber` lampeggia → si stabilizza su "48 pz"
  - "Disponibilità magazzino" con progress bar verde al 78%
  - Prezzo cliente: "€ 45,00 / pz" + sconto cliente applicato
  - "Ultimo ordinato: 2026-03-15 · 10 pz"

**Fase 3 — Check Istantaneo (frame 300→390):**
- Button "Verifica disponibilità →" scala-in `springBounce`
- Tap simulato: spinner 0.8s
- Risultato: badge grande "✓ Disponibile: 48 pz · Pronta consegna" verde springBounce
- Timing: "Verifica completata in 1.2 secondi"

---

#### SCENA 9 — Preventivi con un Click (420f · 14s)

**Sfondo:** `#F2F2F7`  
**Concetto:** da qualsiasi ordine, genera un preventivo professionale in un tap

**Fase 1 — Storico ordine (frame 0→80):**
- Order card "Ordine #4821 — Studio Dr. Bianchi" con springCard
- Tre bottoni azione appaiono in stagger: "Modifica" | "Copia" | **"Preventivo →"** (blu evidenziato)
- Bottone preventivo ha glow sottile pulsante

**Fase 2 — Generazione (frame 80→240):**
- Tap su "Preventivo": card scala 0.95→1 springSnap
- **Animazione build PDF** (frame 100→200):
  - Rettangolo bianco A4 si costruisce pezzo per pezzo
  - Header Formicanera appare in cima con fade
  - Righe articoli appaiono una per una dall'alto verso il basso (stagger 8f)
  - Totale IVA appare alla fine con `AnimatedNumber`
  - Logo in basso a sinistra con springBounce
- Badge "PDF generato ✓" verde springBounce a frame 200

**Fase 3 — Condivisione (frame 240→390):**
- PDF preview con `springCard` translateY(40→0)
- Bottom sheet iOS slide-up con `springCard`:
  - "📱 WhatsApp" | "📧 Gmail" | "☁️ Dropbox" | "🔗 Copia link"
  - Ogni opzione in stagger 12f
- Tap "WhatsApp": icona vola verso angolo, toast "Condiviso ✓"

---

#### SCENA 10 — Dashboard: Fatturato, Commissioni, Budget (480f · 16s)

**Sfondo:** `#F2F2F7`  
**Concetto:** tutto ciò che l'agente vuole sapere sulle sue performance, in un colpo d'occhio

**Layout:** grid 2×2 metric cards + grafico fatturato sotto

**Fase 1 — Metric Cards (frame 0→180, stagger 20f per card):**

| Card | Valore | Colore | Animazione |
|------|--------|--------|-----------|
| Fatturato YTD | €124.800 | `#007AFF` | AnimatedNumber 0→124800 in 60f |
| Commissioni | €8.736 | `#34C759` | AnimatedNumber 0→8736 |
| Ordini mese | 47 | `#5856D6` | AnimatedNumber 0→47 |
| Budget progress | 67% | `#FF9500` | ProgressBar 0→67% + label |

- Ogni card: `FrostedCard` con `springCard`, scala 0.8→1
- Icona in alto a destra di ogni card in `springSnap`

**Fase 2 — Grafico Fatturato (frame 180→360):**
- Area chart (SVG path) si "disegna" da sinistra a destra
- `interpolate(frame-180, [0,120], [0,1])` su stroke-dashoffset
- Linea blu `#007AFF`, area fill con gradient blu 20% opacity
- 12 punti mesi sull'asse X appaiono in stagger
- Anno precedente: linea tratteggiata grigia, stessa animazione

**Fase 3 — Comparativo YoY (frame 360→450):**
- Freccia verde ↑ springBounce: "+18% vs 2025"
- Badge mese migliore: "Marzo — €15.200" highlight giallo
- Counter commissioni totali YTD con AnimatedNumber

---

#### SCENA 11 — Documenti DDT/Fatture + Tracking FedEx (480f · 16s)

**Sfondo:** `#F2F2F7`  
**Concetto:** documenti in un tap, tracking in tempo reale senza uscire dall'app

**Fase 1 — Documenti (frame 0→210):**
- Order card con sezione "Documenti" espansa
- **DDT list**: 2 DDT rows in stagger 20f
  - Ogni row: icona PDF | "DDT-2026-00312" | "28/03/2026" | "€ 1.240,00"
  - Tap su DDT-1: progress circle rotante 1s → fill verde → "Download ✓"
  - File appare come thumbnail con springBounce
- **Fatture list**: 1 fattura row
  - Stessa animazione download

**Fase 2 — Tracking FedEx (frame 210→450):**
- Sezione "Tracking Spedizione" slide-in da sotto con `springCard`
- Numero tracking "774899172937" con monospace font
- **Timeline eventi verticale** (stagger 25f per evento):
  - ✅ "Preso in carico · Napoli · 28/03 14:32"
  - ✅ "In transito · Roma Smistamento · 28/03 22:15"
  - ✅ "Partito per destinazione · Milano · 29/03 03:44"
  - 🔵 "In consegna · Milano · 29/03 09:20" — dot blu pulsante
  - ⭕ "Consegnato" — grigio, non ancora
- Linea verticale di connessione si "disegna" verso il basso
- Badge "In consegna oggi" arancio springBounce
- "Aggiornato automaticamente · FedEx API" in `textMuted`

---

#### SCENA 12 — Integrazioni: WhatsApp, Dropbox, Google, Gmail (540f · 18s)

**Sfondo:** `#F2F2F7`  
**Concetto:** Formicanera al centro di tutto l'ecosistema digitale dell'agente

**Layout:** hub con logo Formicanera al centro, 4 loghi alle estremità (griglia 3×3)

**Fase 1 — Hub Animation (frame 0→120):**
- Logo Formicanera scala 0→1 al centro con `springBounce` delay 0
- 4 loghi entrano in sequenza con stagger 20f (springBounce):
  - WhatsApp (verde, top-left)
  - Gmail (rosso, top-right)
  - Dropbox (blu, bottom-left)
  - Google Drive (multicolore, bottom-right)
- Linee di connessione da ogni logo verso il centro si "disegnano" con interpolate height/width
- Le linee hanno particelle che scorrono (dash-animated)

**Fase 2 — Demo WhatsApp (frame 120→240):**
- Spotlight su WhatsApp: scala 1.0→1.1, altri si dimmsono opacity 0.3
- Mini demo a destra:
  - Chat bubble appare con spring: "Ecco il DDT dell'ordine #4821"
  - Allegato PDF con thumbnail springBounce
  - Checkmark di consegna
- Label: "Condividi ordini e documenti su WhatsApp"

**Fase 3 — Demo Gmail (frame 240→340):**
- Spotlight su Gmail
- Mini demo: email aperta con intestazione Formicanera, preventivo allegato, "Inviato ✓"
- Label: "Invia preventivi e fatture via Gmail"

**Fase 4 — Demo Dropbox+Google (frame 340→450):**
- Spotlight su entrambi
- Icone DDT e fatture volano verso Dropbox+Drive (animazione fly)
- Progress sync bar → "Sincronizzato ✓"
- Label: "Archiviazione automatica documenti"

**Fase 5 — Hub Finale (frame 450→510):**
- Tutti tornano a full opacity
- Linee pulsano simultaneamente
- Label al centro: "Un ecosistema connesso"

---

#### SCENA 13 — Notifiche Intelligenti (420f · 14s)

**Sfondo:** `#F2F2F7`  
**Concetto:** l'agente sa sempre tutto, senza dover cercare nulla

**Header (frame 0→20):** "11 notifiche intelligenti" fade-in, `textPrimary` 32px 800

**Notification cards cadono dall'alto in stagger 25f** (opacity + translateY -40→0 + spring):

| Frame | Tipo | Border | Contenuto |
|-------|------|--------|----------|
| 20 | Ordine confermato | `#34C759` | "Ordine #4821 registrato su Archibald · ora 14:32" |
| 45 | Documento disponibile | `#007AFF` | "DDT-2026-00312 pronto per il download" |
| 70 | Spedizione aggiornata | `#5856D6` | "FedEx: pacco in consegna oggi a Milano" |
| 95 | Preventivo condiviso | `#34C759` | "Studio Dr. Bianchi ha aperto il preventivo" |
| 120 | ⚠️ Cliente inattivo | `#FF9500` | "Lab. Dott. Ferrari — 8 mesi senza ordini · rischio esclusività" |
| 145 | ⚠️ Documento mancante | `#FF3B30` | "Ordine #4756 — nessun DDT dopo 14 giorni" |
| 170 | Variazione prezzo | `#FF9500` | "Kit impianto standard +3.2% da domani" |
| 195 | Cliente incompleto | `#FF3B30` | "Clinica Azzurra — P.IVA mancante · ordini bloccati" |

**Cards si impilano** con offset Y +4px per ogni successiva (z-ordering visivo)

**Highlight speciale** su "Cliente inattivo" e "Documento mancante" (frame 300→380):
- Border-left lampeggia 3×
- Scale 1.0→1.02→1.0 spring

**Label finale (frame 360→400):** "Zero ricerche manuali. Formicanera ti avvisa." fade-in, italic `textMuted`

---

#### SCENA 14 — Chiusura CTA (300f · 10s)

**Sfondo:** gradient radiale `#F2F2F7` → `#FFFFFF` con glow `#007AFF` 7% opacity al centro-basso

**Fase 1 — Logo (frame 0→60):**
- Logo Formicanera spring dall'alto, `springBounce` scala 0.2→1 + translateY -80→0
- Shadow progressiva: `0 0 0px #007AFF00` → `0 0 40px #007AFF30`

**Fase 2 — Testi (frame 30→100):**
- "Formicanera" — 64px 900 `textPrimary`, fade-in + translateY 10→0
- "Il vantaggio competitivo · Komet Italia" — 18px 600 `#007AFF` uppercase, delay 20f

**Fase 3 — CTA Button (frame 80→130):**
- "Richiedi una demo" — `springBounce` scala 0→1
- Background `#007AFF`, border-radius 14px, padding 16px 40px
- Font 18px 700 bianco
- Subtle glow pulsante permanente: `interpolate(frame-80, [0,30,60],[0,1,0])` ciclico su box-shadow

**Hold 5s (frame 130→280):**
- Background ha un rispiro lentissimo: `interpolate(frame,[130,200,280],[0,0.04,0])` opacity su radial glow
- Tutto rimane statico, solo il glow respira

**Fade-out (frame 280→300):** opacity 1→0 su tutto

---

### 3.7 Transizioni tra Scene

Ogni transizione è un **crossfade di 15 frame (0.5s)**:
```ts
// In Video.tsx — ogni scena ha fadeOut sull'ultimo 15f
const fadeOut = interpolate(frame, [duration - 15, duration], [1, 0], {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp'
});
```

Eccezioni:
- Scena 1→2 (Problema→Soluzione): crossfade + cambio colore sfondo da `#1C1C1E` a blu
- Scena 2→3 (Soluzione→Ordini): dissolvenza blu → `#F2F2F7`

### 3.8 Audio

- Traccia unica royalty-free stile Apple Keynote (corporate minimal inspiring)
- Durata ≥ 240s, BPM ~80-100
- Volume: -6dB
- Fade-in: 0→3s
- Fade-out: ultimi 5s (scena 14)
- Fonte suggerita: Pixabay "corporate minimal inspiring" oppure Freemusicarchive

---

## 4. Aggiornamento Presentazione Commerciale

**File:** `docs/commerciale/formicanera-presentazione-komet.md`

### Sezione 4.2 — Gestione Ordini (modifiche)

Rimuovere il bullet "Operazioni batch" dai punti di forza espliciti.

Aggiungere nella sezione "Storico ordini" e sotto-sezione dedicata:

```markdown
**Ricerca storico con copia istantanea**
- Ricerca full-text su tutto lo storico di un cliente
- Selezione di singoli articoli o ordini interi
- Copia istantanea in nuovo ordine: zero riscrittura

**Gestione totali automatizzata**
- IVA calcolata automaticamente per aliquota
- Sconti riga e sconto testata applicati in tempo reale
- Soglia spese trasporto verificata automaticamente
```

Aggiungere nuova sezione **4.2-bis — Pending Orders**:

```markdown
**Immagazzinamento e invio differito**
- Salva ordini durante tutta la giornata senza inviarli
- Invia tutti insieme quando e dove vuoi
- Barra avanzamento globale non bloccante durante il batch
```

### Sezione 4.3 — Documenti

Aggiungere:

```markdown
**Preventivi con un click**
- Da qualsiasi ordine storico, genera un preventivo professionale in un tap
- PDF pronto in secondi, condivisibile via WhatsApp, Gmail, Dropbox, link diretto
```

### Sezione 4.4 — Tracking (nessuna modifica)

### Nuova Sezione 4.4-bis — Catalogo e Magazzino

```markdown
### 4.4-bis Ricerca Catalogo e Check Magazzino

- Ricerca full-text sul catalogo completo Komet
- Disponibilità stock in tempo reale per ogni articolo
- Prezzo cliente specifico (non listino generico) visibile immediatamente
- Check istantaneo: disponibilità confermata in < 2 secondi
```

### Sezione 4.6 — Notifiche (nessuna modifica al conteggio)

### Nuova Sezione 4.9 — Integrazioni

```markdown
### 4.9 Integrazioni

Formicanera si connette nativamente agli strumenti che l'agente usa ogni giorno:

| Integrazione | Funzionalità |
|---|---|
| **WhatsApp** | Condivisione ordini, documenti, preventivi |
| **Gmail** | Invio automatico preventivi e fatture ai clienti |
| **Dropbox** | Archiviazione automatica DDT e fatture |
| **Google Drive** | Sync documenti e backup automatico |
```

### Sezione 5.1 — Tabella Vantaggi Agente (aggiornare)

Aggiungere righe:

| Creazione preventivo | 10–15 min (manuale ERP) | < 10 secondi (un tap) | ~98% |
| Ricerca articolo + stock | 5 min (ERP + magazzino) | < 2 secondi | ~95% |
| Condivisione documento | 5 min (email manuale) | Istantanea (WhatsApp/Gmail) | ~95% |

---

## 5. Aggiornamento Proposta Commerciale

**File:** `docs/commerciale/generate-proposta.mjs`

### Sezioni da aggiornare nell'HTML

1. **Tabella comparativa "Cosa cambia concretamente"**: aggiungere le 3 nuove righe della presentazione (preventivo, ricerca articolo, condivisione documento)

2. **Sezione funzionalità complete**: aggiungere le 3 nuove sezioni (Pending Orders, Catalogo/Magazzino, Integrazioni)

3. **Rimuovere** ogni riferimento a "operazioni batch" come feature standalone

4. **Sezione vantaggi misurabili**: aggiornare tabella con le 3 nuove righe

5. **Rigenerare PDF**: `node docs/commerciale/generate-proposta.mjs` → output `formicanera-proposta-commerciale.pdf`

---

## 6. File da Creare / Modificare

### Video (nuovo/redesign)
| File | Azione |
|------|--------|
| `Video.tsx` | Redesign sequencer con 15 scene |
| `scenes/LogoIntro.tsx` | Aggiornamento |
| `scenes/Problem.tsx` | Aggiornamento (8 punti) |
| `scenes/Solution.tsx` | Aggiornamento |
| `scenes/Orders.tsx` | Redesign completo |
| `scenes/IvaAndTotals.tsx` | **NUOVA** |
| `scenes/PendingOrders.tsx` | **NUOVA** |
| `scenes/Storico.tsx` | **NUOVA** |
| `scenes/Clients.tsx` | Redesign (era Customers.tsx) |
| `scenes/Warehouse.tsx` | **NUOVA** |
| `scenes/Quotes.tsx` | **NUOVA** |
| `scenes/Dashboard.tsx` | Redesign |
| `scenes/Documents.tsx` | **NUOVA** (era parte di Notifications) |
| `scenes/Integrations.tsx` | **NUOVA** |
| `scenes/Notifications.tsx` | Redesign |
| `scenes/Closing.tsx` | Redesign |
| `components/FrostedCard.tsx` | Aggiornamento |
| `components/DarkCard.tsx` | **NUOVA** |
| `components/AnimatedNumber.tsx` | Conferma/aggiornamento |
| `components/ProgressBar.tsx` | **NUOVA** |
| `components/BotTimeline.tsx` | Aggiornamento |
| `components/SearchBar.tsx` | **NUOVA** |
| `components/NotifCard.tsx` | Aggiornamento |
| `components/MetricCard.tsx` | Aggiornamento |
| `components/StatPill.tsx` | **NUOVA** |
| `components/BadgeGreen.tsx` | **NUOVA** |
| `components/IntegrationHub.tsx` | **NUOVA** |
| `lib/palette.ts` | Aggiornamento tokens |
| `lib/springs.ts` | Aggiornamento configs |
| `lib/timing.ts` | Aggiornamento durate |

### Testi
| File | Azione |
|------|--------|
| `docs/commerciale/formicanera-presentazione-komet.md` | Aggiornamento sezioni 4.2, 4.3, +4.4-bis, 4.9, 5.1 |
| `docs/commerciale/generate-proposta.mjs` | Aggiornamento HTML + rigenerazione PDF |

---

## 7. Render e Output Finale

```bash
# Installazione dipendenze (se necessario)
cd docs/commerciale/video && npm install

# Preview live
npx remotion studio src/Root.tsx

# Render video finale
npx remotion render src/Root.tsx FormicaneraDemoVideo \
  out/formicanera-demo-komet.mp4 \
  --codec=h264 \
  --crf=18 \
  --jpeg-quality=80

# Copia nella root docs/commerciale
cp out/formicanera-demo-komet.mp4 ../formicanera-demo-komet.mp4

# Rigenera proposta commerciale PDF
node docs/commerciale/generate-proposta.mjs
```

---

## 8. Criteri di Successo

- [ ] Video dura ~3:30, nessuna scena sotto 12s
- [ ] Ogni animazione usa `spring()` Remotion — zero `interpolate` secchi per movement
- [ ] Tutte le spring config da `lib/springs.ts` (nessuna magic number inline)
- [ ] Ogni scena ha fade-out 15f prima del boundary
- [ ] Font Inter caricato correttamente (nessun fallback system font)
- [ ] Tutti e 15 i file `.tsx` scene compilano senza errori TypeScript
- [ ] Audio con fade-out nei 5s finali
- [ ] PDF proposta commerciale rigenerato con nuove sezioni
- [ ] Presentazione .md aggiornata con tutte le nuove funzionalità
