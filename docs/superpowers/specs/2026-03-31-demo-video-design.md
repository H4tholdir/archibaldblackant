# Formicanera — Video Demo Marketing

**Data:** 2026-03-31  
**Target:** CEO Komet Italia  
**Durata:** ~75 secondi  
**Stile:** Apple Style Animation (NaughtyyJuan guide)

---

## Obiettivo

Un video marketing da mostrare velocemente al CEO di Komet Italia. Deve trasmettere in 75 secondi che Formicanera è un prodotto maturo, già in produzione, che risolve problemi reali degli agenti Komet.

---

## Tech Stack

| Componente | Scelta |
|-----------|--------|
| Framework | Remotion 4 + React 19 + TypeScript |
| Risoluzione | 1920×1080 |
| FPS | 30 |
| Durata | ~2250 frame (~75s) |
| Audio | Musica royalty-free Apple-style (no voiceover) |
| Output | MP4 H.264 |
| Logo | `formicaneralogo.png` (blob blu con formica reale) |
| Font | Inter (Google Fonts) |

---

## Palette Colori (NaughtyyJuan Apple Style ufficiale)

| Nome | HEX | Uso |
|------|-----|-----|
| Background | `#F2F2F7` | Sfondo scene chiare |
| Card | `#FFFFFF` | Cards frosted glass |
| Text Primary | `#1C1C1E` | Testo principale |
| Text Secondary | `#3A3A3C` | Testo secondario |
| Text Muted | `#8E8E93` | Label, sottotitoli |
| Divider | `#E5E5EA` | Bordi, separatori |
| Apple Blue | `#007AFF` | Primary — accent principale (matcha logo) |
| Apple Green | `#34C759` | Successo, conferme bot |
| Apple Orange | `#FF9500` | Warning, notifiche attenzione |
| Apple Red | `#FF3B30` | Errori, problema nella scena 1 |
| Dark BG | `#1C1C1E` | Scene problema e bot |

---

## Struttura Scene

### Scena 0 — Logo Intro (0–3s, 0–90f)
- **Sfondo:** `#F2F2F7` con radial gradient `#007AFF` 8% opacity al centro
- **Animazione:** logo entra dall'alto con spring (`mass:0.8, damping:18, stiffness:120`), scala da 0.3 a 1
- **Testo:** "Formicanera" fade-in con delay 15f, tagline "Il vantaggio competitivo" delay 30f
- **Uscita:** fade-out + scale-down su ultimi 10f

### Scena 1 — Il Problema (3–11s, 90–330f)
- **Sfondo:** `#1C1C1E` — transizione da chiaro a scuro con crossfade 15f
- **Animazione:** 3 righe di testo entrano in sequenza con stagger 40f:
  - `"20 minuti per un ordine."` — dot rosso `#FF3B30`
  - `"ERP solo da PC fisso."` — dot rosso
  - `"Nessuna visibilità in trasferta."` — dot rosso
- **Ogni riga:** slide-in da destra (translateX 40px → 0) + fade, spring damping 200
- **Sottotitolo:** `"— Il lavoro quotidiano dell'agente Komet"` appare dopo tutte e 3, color `#3A3A3C`

### Scena 2 — Soluzione (11–14s, 330–420f)
- **Sfondo:** gradient `#007AFF → #0055D4` — transizione da scuro a blu vivace
- **Animazione:** "Poi arriva" fade-in, poi "Formicanera." scala da 0.7 a 1 con spring bounce
- **Effetto:** subtle glow pulsante attorno al testo

### Scena 3 — Gestione Ordini (14–24s, 420–720f)
- **Sfondo:** `#F2F2F7`
- **Elementi:**
  - Order card bianca (3D tilt `rotateY(-8deg) rotateX(3deg)`) entra da sinistra con spring
  - Stat pill `"3 min"` in `#007AFF` con bounce
  - Bot status card `#1C1C1E` entra da destra
- **Testo overlay:** `"vs 20 min con ERP"` in `#8E8E93`
- **Spring config:** `mass:1, damping:15, stiffness:100`

### Scena 4 — Dashboard Provvigioni (24–34s, 720–1020f)
- **Sfondo:** `#F2F2F7`
- **Elementi:**
  - Grid 4 metric-cards entra con stagger 8f per card, scale da 0.8 a 1
  - Numeri contano da 0 al valore finale (`interpolate` su 60f): `€ 3.2K`, `67%`, `24`, `186`
  - Progress bar si riempie fino al 67% con easing `Easing.bezier(0.25, 0.1, 0.25, 1)`
- **Titolo:** `"📊 Provvigioni & Budget"` appare prima delle card

### Scena 5 — Gestione Clienti (34–42s, 1020–1260f)
- **Sfondo:** `#F2F2F7`
- **Elementi:**
  - Wizard card (3D tilt `rotateY(6deg)`) con 3 campi che appaiono in sequenza
  - Badge `"✓ P.IVA verificata"` verde pop-in con scale bounce
  - Label `"28 campi ERP gestiti"` e `"🤖 Bot crea su Archibald"` slide-in da destra
- **Effetto campo:** ogni campo del wizard appare con type-effect (larghezza da 0 al 100%)

### Scena 6 — Bot Automatico (42–50s, 1260–1500f)
- **Sfondo:** `#1C1C1E`
- **Elementi:**
  - Timeline verticale con 3 step che si attivano in sequenza (stagger 30f)
  - Ogni dot: scala da 0 a 1 + glow pulse in `#007AFF` poi → `#34C759` quando completato
  - Linea di connessione si "disegna" verso il basso (height da 0 a 100%)
- **Header:** `"Invio automatico in corso"` in `#8E8E93` uppercase

### Scena 7 — Notifiche (50–57s, 1500–1710f)
- **Sfondo:** `#F2F2F7`
- **Elementi:**
  - 4 notification cards entrano dall'alto in stagger 15f, con spring bounce
  - Border-left colorato: verde (conferma), blu (DDT), arancio (warning), blu (tracking)
  - Ogni card ha icona + testo + timestamp
- **Effetto:** le card si "impilano" scendendo leggermente (translateY +4px per ogni successiva)

### Scena 8 — Chiusura CTA (57–75s, 1710–2250f) — 18s
- **Sfondo:** gradient `#F2F2F7 → #FFFFFF` con radial glow `#007AFF` 7% sotto
- **Elementi:**
  - Logo entra dall'alto con spring, atterraggio morbido
  - `"Formicanera"` font-size 48px, font-weight 900, `#1C1C1E`
  - `"Il vantaggio competitivo · Komet Italia"` in `#007AFF` uppercase
  - CTA button `"Richiedi una demo"` con fill `#007AFF`, spring scale-in
- **Hold:** ultimi 5 secondi statici con subtle background animation

---

## Animazione Tecnica — Principi Apple Style

```
Spring config standard (bounce morbido):
  mass: 0.8, damping: 18, stiffness: 120

Spring config deciso (entry cards):
  mass: 1, damping: 15, stiffness: 100

Spring config testo (preciso, no bounce):
  mass: 1, damping: 200

Easing standard:
  Easing.bezier(0.25, 0.1, 0.25, 1) — ease-out Apple

Stagger pattern:
  items.map((_, i) => delay = i * 8) // 8f tra ogni elemento
```

---

## Struttura Progetto Remotion

```
docs/commerciale/video/
├── src/
│   ├── Root.tsx                  # Composition principale
│   ├── Video.tsx                 # Sequencer scene
│   ├── scenes/
│   │   ├── LogoIntro.tsx         # Scena 0
│   │   ├── Problem.tsx           # Scena 1
│   │   ├── Solution.tsx          # Scena 2
│   │   ├── Orders.tsx            # Scena 3
│   │   ├── Dashboard.tsx         # Scena 4
│   │   ├── Customers.tsx         # Scena 5
│   │   ├── Bot.tsx               # Scena 6
│   │   ├── Notifications.tsx     # Scena 7
│   │   └── Closing.tsx           # Scena 8
│   ├── components/
│   │   ├── OrderCard.tsx         # UI card ordine realistica
│   │   ├── MetricCard.tsx        # Dashboard metric card
│   │   ├── NotifCard.tsx         # Notification card
│   │   ├── BotTimeline.tsx       # Timeline bot con dots animati
│   │   ├── WizardCard.tsx        # Wizard cliente frosted glass
│   │   └── AnimatedNumber.tsx    # Contatore numerico animato
│   └── lib/
│       ├── spring.ts             # Spring configs riutilizzabili
│       ├── palette.ts            # Colori Apple Style palette
│       └── timing.ts             # Costanti frame/timing per scena
├── public/
│   └── formicaneralogo.png       # Logo ufficiale (copiato da frontend/dist)
├── package.json
└── remotion.config.ts
```

---

## Audio

- Traccia royalty-free stile Apple Keynote — usare `https://pixabay.com/music/search/corporate%20minimal%20inspiring/` oppure `https://freemusicarchive.org`, cercare "corporate minimal inspiring", durata ≥ 90s
- Volume: -6dB per non coprire eventuali narrazione futura
- Fade-out su ultimi 3 secondi (scena 8)

---

## Render Command

```bash
cd docs/commerciale/video
npx remotion render src/Root.tsx FormicaneraDemoVideo out/formicanera-demo.mp4 \
  --codec=h264 \
  --crf=18 \
  --jpeg-quality=80
```
