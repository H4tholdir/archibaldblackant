# Komet Germany — Comparison Video Design

**Data:** 2026-05-06
**Target:** Phil / Komet Germany evaluation team
**Output:** 2 video separati in inglese, ~5-6 min ciascuno
**Tech:** Remotion 4.x (`docs/commerciale/video/`), ffmpeg, ElevenLabs AI voice
**Tono:** Elegante e propositivo — Formicanera come estensione intelligente dell'ERP, non sostituto

---

## 1. Obiettivo Strategico

La richiesta di Phil misura il tempo di inserimento ordine partendo da "Start creating order", includendo il trasferimento verso Archibald. Il video risponde su due livelli:

1. **Dato oggettivo:** mostra i due sistemi in split-screen con timer condiviso — il dato temporale parla da solo
2. **Contesto qualitativo:** durante il trasferimento ERP, l'agente Formicanera crea già nuovi pending order — il "tempo di attesa" di Phil non è mai veramente attesa

Il tono non è mai "ERP è sbagliato" ma sempre "Formicanera aggiunge intelligenza al flusso esistente".

---

## 2. Asset Disponibili

### Video Raw
| File | Durata | Contenuto |
|------|--------|-----------|
| `1 CREAZIONE ARCH.mov` | 4:22 (262s) | Creazione ordine su ERP Archibald |
| `2 CREAZIONE FORMICA.mov` | 3:15 (195s) | Creazione ordine su Formicanera PWA |
| `3 CLIENTE ARCH.mp4` | 2:58 (178s) | Creazione cliente su ERP |
| `4 CLIENTE ARCH + ORD.mov` | 1:32 (92s) | Ordine contestuale su ERP (continuazione) |
| `5 CLIENTE FORMICA.mov` | 2:02 (122s) | Creazione cliente su Formicanera |
| `6 CLIENTE FORMICA + ORD.mov` | 1:05 (65s) | Ordine contestuale su Formicanera (continuazione) |

### Componenti Remotion Esistenti (tutti riutilizzabili)
- `AnimatedNumber` — contatore animato con pulse finale
- `Ant` — formica animata (branding Formicanera)
- `BadgeGreen` — badge bounce con colore custom
- `BotTimeline` — timeline passi bot con dot attivi/completati
- `Confetti` — esplosione coriandoli (per il momento "Done!")
- `DarkCard` — card scura con entry animation
- `FrostedCard` — card bianca glassmorphism
- `MetricCard` — card icona+label+valore
- `NotifCard` — notification iOS-style
- `ProgressBar` — barra progresso animata
- `SceneCaption` — barra narratore in basso con campo `vs`
- `SearchBar` — barra ricerca con typing animation
- `SpringText` — testo con spring entry
- `StatPill` — pill con label colorata

### Asset Statici
- `formicaneralogo.png` — logo blob blu con formica reale
- `background.mp3` — musica royalty-free Apple-style
- Palette colori completa (`src/lib/palette.ts`)
- Spring configs: bounce, card, text, gentle, snap
- Font: Inter (Google Fonts, già configurato)

---

## 3. Nuovi Componenti da Creare

### `TabletMockup`
Frame iPad Pro 12.9" landscape attorno al video PWA. Bordi alluminio `#C7C7CC`, angoli `radius:24px`, sottile barra status iOS in cima (`9:41`, WiFi, batteria). Il video PWA viene scalato e inscatolato dentro. Label sotto: `"Formicanera — Tablet · Mobile · Desktop"` in `palette.blue`.

### `SharedTimer`
Stopwatch condiviso centrato in alto. Formato `MM:SS.s`. Due istanze: una per ERP (si ferma a 4:22), una per PWA (si ferma a 3:15 con animazione Confetti + badge verde "✓ Done"). Design: cerchio dark con numero Inter 900, bordo `palette.blue` (PWA) e `palette.divider` (ERP).

### `CalloutBubble`
Bolla annotazione che appunta un punto dello schermo. Usata per evidenziare problemi ERP / soluzioni PWA. Props: `side` (left/right), `label`, `accentColor`. Appare con spring bounce, ha una freccia-puntatore e una linea tratteggiata animata verso il punto evidenziato.

### `ChapterBadge`
Badge temporaneo centrato che appare tra i callout per annunciare il prossimo tema: es. `"Chapter 2 — Article Search"`. Appare per 2s con fade in/out, sfondo semitrasparente dark.

### `InsightCard`
Card full-width (light bg) che appare quando la PWA ha finito e l'ERP è ancora in corso. Mostra: "While ERP submits the order in the background — agents keep working." con animazione di pending orders che si accodano.

### `SplitDivider`
Linea verticale centrale animata con labels `"Archibald ERP"` (sinistra, `palette.textMuted`) e `"Formicanera"` (destra, `palette.blue`).

---

## 4. Preprocessing FFmpeg

Prima del render Remotion, i video raw vanno convertiti in h264 MP4 compatibili:

```bash
# Converti tutti i raw in h264, riduci a 1280x720 per velocità di preview
for f in "1 CREAZIONE ARCH.mov" "2 CREAZIONE FORMICA.mov"; do
  ffmpeg -i "$f" -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "${f%.*}.mp4"
done
```

Risoluzioni per il render finale (1920×1080):
- Pannello ERP: 930×720 (margini 15px)
- Pannello PWA: 930×720 inscatolato nel TabletMockup (effettivo ~850×640)

---

## 5. VIDEO 1 — "Order Creation"

**Durata totale stimata:** ~5:50 (10,500 frames @ 30fps)
**Fonte video:** `1 CREAZIONE ARCH.mp4` (262s) + `2 CREAZIONE FORMICA.mp4` (195s)

### Scene Breakdown

#### Scena 1 — Intro (0–4s, 0–120f)
- Sfondo: `palette.bg` con radial glow `palette.blue`
- Logo Formicanera entra con spring bounce (riutilizza `LogoIntro` pattern)
- Titolo: `"Order Creation"` — Inter 900 72px
- Sottotitolo: `"Archibald ERP  ·  Formicanera  ·  Speed & Intelligence"` — muted 22px
- Fade out su ultimi 15f

#### Scena 2 — Context Slide (4–12s, 120–360f)
- Sfondo: `palette.bgDark`
- Tre righe che entrano in stagger (ogni 30f):
  - `"Same order."` — bianco 64px 900
  - `"Same customer."` — bianco 64px 900
  - `"Two systems."` — `palette.blue` 64px 900
- Sottotitolo fade-in a 240f: `"Let's measure the difference."` — muted italic 20px
- Fade out su ultimi 15f

#### Scena 3 — Split-Screen Race (12s–4:37s, 360–8,310f = 262s raw)
Layout 1920×1080:
- **Left panel** (0–960px): ERP video raw, label `"Archibald ERP"` top-left (grigio)
- **Center** (960px): `SplitDivider` con labels + `SharedTimer` in alto al centro
- **Right panel** (960–1920px): PWA video in `TabletMockup`, label `"Formicanera"` top-right (blu)
- **Bottom**: `SceneCaption` per callout narrativi

**Capitoli e Callout:**

| Frame | Tempo | Evento | Voiceover |
|-------|-------|--------|-----------|
| 360 | 0:00 | Start — timer parte | "Same order, same customer. The clock starts now." |
| 1200 | ~28s | **Chapter 1: Customer Selection** — CalloutBubble ERP: "Two identical records — which is active?" → PWA: "Inactive customers automatically hidden" | "Formicanera automatically filters inactive customer records, eliminating selection errors." |
| 2700 | ~78s | **Chapter 2: Article Search** — CalloutBubble ERP: "Dual search mechanism — inconsistent results" → PWA: "Unified intelligent search" | "A single, consistent search engine — articles are always findable, regardless of punctuation or coding." |
| 4200 | ~126s | **Chapter 3: Packaging** — CalloutBubble ERP: "7 units — manual calculation required" → PWA: "Auto-split: 1×5 + 2×1 ✓" | "The packaging engine calculates the optimal split automatically. No arithmetic, no errors." |
| 5550 | ~173s | **Chapter 4: Discount & VAT** — CalloutBubble ERP: "Manual discount % entry required" → PWA: "Promotion applied automatically" | "Enter the target price — Formicanera calculates the exact discount and VAT in real time." |
| 6210 | ~195s | **PWA Done!** — Confetti, timer PWA si ferma su 3:15, badge verde "✓ 3:15" | "Order submitted. Formicanera is done." |

**Dopo il Done PWA (195s–262s):**
- Right panel: mostra `InsightCard` animata — pending orders che si accodano nella PWA
- Left panel: ERP ancora in corso, timer ERP continua
- Voiceover: "While ERP processes the submission, the agent is already queuing the next orders. Not downtime — parallel productivity."

| Frame | Tempo | Evento |
|-------|-------|--------|
| 6210 | 195s | PWA Done — InsightCard appare sul pannello destro |
| 6210–8220 | 195–262s | InsightCard mostra 3 pending orders che si accodano con animazione |
| 8220 | 262s | ERP Done — timer ERP si ferma su 4:22 |

#### Scena 4 — Summary (4:34–4:49s, 8220–8670f)
- Sfondo: `palette.bg`
- Tabella comparativa animata (4 righe):
  - `Customer Selection` | ⚠️ Manual | ✅ Auto-filtered
  - `Article Search` | ⚠️ Inconsistent | ✅ Unified
  - `Packaging` | ⚠️ Manual | ✅ Auto-split
  - `Discount & VAT` | ⚠️ Pre-calculated | ✅ Real-time
- Badge finale: `StatPill` — `"ERP: 4:22"` (grigio) vs `"Formicanera: 3:15"` (verde) + `"67 seconds faster"`
- Voiceover: "Same result. More intelligence. From any device."

**Totale Video 1: ~4:49 → ~8,670 frames**

---

## 6. VIDEO 2 — "New Customer + Order"

**Durata totale stimata:** ~5:40 (10,200 frames @ 30fps)
**Fonte video:**
- ERP: `3 CLIENTE ARCH.mp4` (178s) + `4 CLIENTE ARCH + ORD.mp4` (92s) = 270s totali
- PWA: `5 CLIENTE FORMICA.mp4` (122s) + `6 CLIENTE FORMICA + ORD.mp4` (65s) = 187s totali

### Scene Breakdown

#### Scena 1 — Intro (0–4s, 0–120f)
- Uguale a Video 1 ma titolo: `"New Customer + Order"`
- Sottotitolo: `"End-to-End Workflow — On-Site, From Any Device"`

#### Scena 2 — Context Slide (4–12s, 120–360f)
- Tre righe stagger:
  - `"New client. On-site meeting."` — bianco 900
  - `"Create the customer."` — bianco 900
  - `"Place the order. Right now."` — `palette.blue` 900
- Sottotitolo: `"This is where ERP shows its limits — and Formicanera shines."` — muted italic

#### Scena 3 — Part A: Customer Creation Split-Screen (12s–3:22s, 360–6,420f = 178s raw)
- **Left**: ERP video `3 CLIENTE ARCH.mp4`
- **Right**: PWA video `5 CLIENTE FORMICA.mp4` in TabletMockup
- Timer condiviso parte

**Capitoli e Callout:**

| Frame | Tempo | Evento | Voiceover |
|-------|-------|--------|-----------|
| 360 | 0:00 | Start | "Creating a new customer. Same data, two workflows." |
| 900 | ~18s | **Device Context** — CalloutBubble PWA: "📱 Created on tablet — in front of the client" | "Formicanera works on tablet and mobile. The agent creates the customer during the meeting — no desk required." |
| 2400 | ~68s | **Form Complexity** — CalloutBubble ERP: "Multiple screens, manual navigation" → PWA: "Single guided form" | "A single, guided form with smart defaults — no navigating between screens." |
| 4200 | ~122s | **PWA Customer Done!** — badge verde "✓ 2:02" | "Customer created. Formicanera is ready for the order." |

**Dopo il Done PWA customer (122s–178s):**
- Right panel: breve animazione "Now creating the order..." → transizione fluida verso video `6`
- Left panel: ERP `3 CLIENTE ARCH.mp4` finisce, poi transizione verso `4 CLIENTE ARCH + ORD.mp4`

#### Scena 4 — Part B: Order Split-Screen (3:22–5:12s, 6,060–9,420f = 92s + 65s raw)
- Continuazione split-screen
- **Left**: `4 CLIENTE ARCH + ORD.mp4` — ERP ordine per il nuovo cliente
- **Right**: `6 CLIENTE FORMICA + ORD.mp4` in TabletMockup
- Timer continua (accumula dal customer creation)

**Capitoli:**

| Frame | Tempo | Evento | Voiceover |
|-------|-------|--------|-----------|
| ~8,100 | ~187s tot | **PWA Total Done!** — Confetti, badge "✓ 3:07 total" | "Customer created and order placed in 3 minutes and 7 seconds." |
| ~9,060 | ~270s tot | **ERP Total Done** — badge "4:30 total" | "The complete workflow — 83 seconds faster with Formicanera." |

#### Scena 5 — Summary (5:12–5:30s, 9,420–9,960f)
- Tabella: Customer Creation + Order Placement + Total
- Badge: `"ERP: 4:30"` vs `"Formicanera: 3:07"` + `"83 seconds faster"`
- Chiusura: `"From any device. Anywhere. Anytime."` con logo Formicanera

**Totale Video 2: ~5:30 → ~9,900 frames**

---

## 7. Voiceover Script Completo

### Video 1 — Order Creation

```
[INTRO - 0:00]
"Order creation. Same order, same customer. Let's measure the difference."

[CHAPTER 1 - ~0:28]
"Formicanera automatically filters inactive customer records — eliminating selection errors before they happen."

[CHAPTER 2 - ~1:18]
"A single, consistent search engine. Articles are always findable — regardless of punctuation or product coding."

[CHAPTER 3 - ~2:06]
"Seven units. The packaging engine calculates the optimal split automatically. No arithmetic, no errors."

[CHAPTER 4 - ~2:53]
"Enter the target price — Formicanera calculates the exact discount and VAT in real time."

[PWA DONE - 3:15]
"Order submitted. Formicanera is done."

[INSIGHT - 3:15 to 4:22]
"While ERP processes the submission in the background, the agent is already preparing the next orders.
This is not downtime — this is parallel productivity."

[ERP DONE - 4:22]
"Four minutes and twenty-two seconds. Same result."

[SUMMARY - 4:37]
"Same result. More intelligence. Sixty-seven seconds faster — from any device."
```

### Video 2 — New Customer + Order

```
[INTRO - 0:00]
"New customer, on-site meeting. Create the customer, place the order — right now."

[DEVICE CONTEXT - ~0:18]
"Formicanera works on tablet and mobile. The agent creates the customer during the meeting — no desk required."

[FORM COMPLEXITY - ~1:08]
"A single guided form with smart defaults. No navigating between screens."

[PWA CUSTOMER DONE - ~2:02]
"Customer created. Formicanera is already ready for the order."

[PWA TOTAL DONE - ~3:07]
"Customer created and order placed in three minutes and seven seconds."

[ERP TOTAL DONE - ~4:30]
"The complete end-to-end workflow — eighty-three seconds faster with Formicanera."

[SUMMARY - 5:12]
"From any device. Anywhere. Anytime."
```

---

## 8. Pipeline di Produzione

### Step 1 — FFmpeg Preprocessing
```bash
VIDEO_DIR="/Users/hatholdir/Desktop/VIDEO GERM /CREAZIONE ORD"
PUBLIC_DIR="docs/commerciale/video/public/komet-comparison"

mkdir -p "$PUBLIC_DIR"

# Converti tutti i 6 video in h264 1280×720
for num in 1 2 3 4 5 6; do
  # trova il file corrispondente
  ...
done
```

### Step 2 — Nuovi Componenti Remotion
Creare in `docs/commerciale/video/src/components/`:
1. `TabletMockup.tsx`
2. `SharedTimer.tsx`
3. `CalloutBubble.tsx`
4. `ChapterBadge.tsx`
5. `InsightCard.tsx`
6. `SplitDivider.tsx`

### Step 3 — Nuove Scene Remotion
Creare in `docs/commerciale/video/src/scenes/comparison/`:
1. `ComparisonIntro.tsx`
2. `ComparisonContext.tsx`
3. `OrderSplitScreen.tsx` (Video 1 main)
4. `CustomerSplitScreen.tsx` (Video 2 Part A)
5. `OrderContinuationSplitScreen.tsx` (Video 2 Part B)
6. `ComparisonSummary.tsx`

### Step 4 — Nuove Composizioni Root
In `docs/commerciale/video/src/Root.tsx` aggiungere:
- `KometOrderComparison` (Video 1, ~8,760f)
- `KometCustomerComparison` (Video 2, ~9,900f)

### Step 5 — ElevenLabs Voiceover
- Voice: voce professionale ElevenLabs, neutro-britannica o neutro-americana (Rachel / Aria / Bella — da validare con anteprima)
- Generare i due audio via API
- Sincronizzare con `<Audio src={staticFile(...)} startFrom={frame} />`

### Step 6 — Render Finale
```bash
cd docs/commerciale/video
npx remotion render KometOrderComparison out/komet-order-comparison.mp4
npx remotion render KometCustomerComparison out/komet-customer-comparison.mp4
```

---

## 9. Decisioni Chiave

| Scelta | Razionale |
|--------|-----------|
| **Split-screen parallelo** | Risponde direttamente alla richiesta di Phil sulla misurazione temporale |
| **Tono propositivo** | ERP è il prodotto Komet — Formicanera lo estende, non lo critica |
| **TabletMockup** | PWA registrata su desktop ma viewport simile a tablet — onesto e visivamente più forte |
| **InsightCard durante attesa ERP** | Smonta l'assunzione di Phil sul "tempo di attesa" con una dimostrazione visiva diretta |
| **Due video separati** | Risponde alla richiesta di Carmen, ogni video è autonomo e condivisibile |
| **AI Voice ElevenLabs** | Nessun accento, produzione rapida, iterabile senza re-registrare |
| **Componenti esistenti** | Investimento Remotion già fatto — palette, springs, timing riutilizzati al 100% |
