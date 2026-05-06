# Komet Germany — Comparison Video Design

**Data:** 2026-05-06
**Target:** Team di valutazione Komet Germany
**Output:** 2 video separati in inglese, ~6 min ciascuno
**Tech:** Remotion 4.x (`docs/commerciale/video/`), ffmpeg, ElevenLabs AI voice
**Tono:** Elegante e propositivo — Formicanera come estensione intelligente dell'ERP, non sostituto

---

## 1. Obiettivo Strategico

La richiesta di valutazione misura il tempo di inserimento ordine partendo da "Start creating order", includendo il trasferimento verso Archibald. Il video risponde su **tre livelli**:

1. **Reframe del contesto:** il vero vantaggio non è la velocità di inserimento dati — è *dove* e *quando* l'ordine viene creato. Con ERP l'agente rientra in ufficio e ricostruisce l'ordine a memoria. Con Formicanera l'ordine nasce durante il meeting, davanti al cliente, chiudendo la trattativa in tempo reale.

2. **Dato oggettivo:** split-screen con timer condiviso — il confronto temporale richiesto, mostrato onestamente.

3. **Contesto parallelo:** durante il trasferimento ERP, l'agente Formicanera crea già nuovi pending order — il presunto "tempo di attesa" non è mai veramente attesa, è lavoro parallelo.

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
Stopwatch condiviso centrato in alto. Formato `MM:SS`. Due istanze: una per ERP (si ferma al suo completamento), una per PWA (si ferma prima con animazione Confetti + badge verde "✓ Done"). Design: cerchio dark con numero Inter 900, bordo `palette.blue` (PWA) e `palette.divider` (ERP).

### `CalloutBubble`
Bolla annotazione che appunta un punto dello schermo. Usata per evidenziare comportamenti ERP / soluzioni PWA. Props: `side` (left/right), `label`, `accentColor`. Appare con spring bounce, ha una freccia-puntatore e una linea tratteggiata animata verso il punto evidenziato.

### `ChapterBadge`
Badge temporaneo centrato che appare tra i callout per annunciare il prossimo tema: es. `"Chapter 2 — Article Search"`. Appare per 2s con fade in/out, sfondo semitrasparente dark.

### `InsightCard`
Card full-width (light bg) che appare quando la PWA ha finito e l'ERP è ancora in corso. Mostra: "While ERP submits the order in the background — agents keep working." con animazione di pending orders che si accodano.

### `WorkflowTimeline`
Componente grafico per la scena "Two Workflows" (Scena 0). Mostra due linee temporali orizzontali — una per ERP, una per Formicanera — con icone animate che appaiono in sequenza. Design dark, icone emoji + testo, dot connectors.

### `SplitDivider`
Linea verticale centrale animata con labels `"Archibald ERP"` (sinistra, `palette.textMuted`) e `"Formicanera"` (destra, `palette.blue`).

---

## 4. Preprocessing FFmpeg

Prima del render Remotion, i video raw vanno convertiti in h264 MP4 compatibili:

```bash
VIDEO_DIR="/Users/hatholdir/Desktop/VIDEO GERM /CREAZIONE ORD"
PUBLIC_DIR="docs/commerciale/video/public/komet-comparison"
mkdir -p "$PUBLIC_DIR"

# Converti tutti i 6 video in h264 1280×720 (preview) o 1920×1080 (finale)
ffmpeg -i "$VIDEO_DIR/1 CREAZIONE ARCH.mov"      -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "$PUBLIC_DIR/1-erp-order.mp4"
ffmpeg -i "$VIDEO_DIR/2 CREAZIONE FORMICA.mov"   -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "$PUBLIC_DIR/2-pwa-order.mp4"
ffmpeg -i "$VIDEO_DIR/3 CLIENTE ARCH.mp4"        -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "$PUBLIC_DIR/3-erp-customer.mp4"
ffmpeg -i "$VIDEO_DIR/4 CLIENTE ARCH + ORD.mov"  -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "$PUBLIC_DIR/4-erp-customer-order.mp4"
ffmpeg -i "$VIDEO_DIR/5 CLIENTE FORMICA.mov"     -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "$PUBLIC_DIR/5-pwa-customer.mp4"
ffmpeg -i "$VIDEO_DIR/6 CLIENTE FORMICA + ORD.mov" -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "$PUBLIC_DIR/6-pwa-customer-order.mp4"
```

Risoluzioni per il render finale (1920×1080):
- Pannello ERP: 930×720 (margini 15px)
- Pannello PWA: 930×720 inscatolato nel TabletMockup (effettivo ~850×640)

---

## 5. VIDEO 1 — "Order Creation"

**Durata totale stimata:** ~5:50 (~10,500 frames @ 30fps)
**Fonte video:** `1-erp-order.mp4` (262s) + `2-pwa-order.mp4` (195s)

### Scene Breakdown

#### Scena 0 — Two Workflows (0–12s, 0–360f) ← NUOVA APERTURA
- Sfondo: `palette.bgDark`
- Titolo: `"Before we start the clock — two different workflows"` — bianco 900 40px, entra con spring
- Due `WorkflowTimeline` che appaiono in stagger (ERP in cima, Formicanera sotto):

**ERP Timeline:**
```
[☎️ Client meeting] ──▶ [🚗 Drive back] ──▶ [💻 Open desk] ──▶ [⌨️ Enter order 4:22] ──▶ [✓ ERP]
```

**Formicanera Timeline:**
```
[☎️ Client meeting + 📱 Order 3:15 during] ──▶ [🚗 Drive / batch] ──▶ [✓ ERP — in background]
```

- Sottotitolo finale (fade-in a 270f): `"The clock matters. But so does when it starts."` — muted italic 20px
- Voiceover: *"Two systems. Two workflows. With ERP, the order is entered after the meeting — back at the desk. With Formicanera, the order is created during the meeting, on tablet, closing the deal in real time. Now — the clock starts."*
- Fade out su ultimi 15f

#### Scena 1 — Intro (12–16s, 360–480f)
- Sfondo: `palette.bg` con radial glow `palette.blue`
- Logo Formicanera entra con spring bounce
- Titolo: `"Order Creation"` — Inter 900 72px
- Sottotitolo: `"Archibald ERP  ·  Formicanera  ·  Speed & Intelligence"` — muted 22px
- Fade out su ultimi 15f

#### Scena 2 — Context Slide (16–22s, 480–660f)
- Sfondo: `palette.bgDark`
- Tre righe in stagger (ogni 30f):
  - `"Same order."` — bianco 64px 900
  - `"Same customer."` — bianco 64px 900
  - `"Two systems."` — `palette.blue` 64px 900
- Sottotitolo fade-in: `"Let's measure the difference."` — muted italic 20px

#### Scena 3 — Split-Screen Race (22s–4:49s, 660–8,820f = 262s raw)
Layout 1920×1080:
- **Left panel** (0–960px): ERP video, label `"Archibald ERP"` top-left (grigio muted)
- **Center**: `SplitDivider` con labels + `SharedTimer` in alto al centro
- **Right panel** (960–1920px): PWA video in `TabletMockup`, label `"Formicanera"` top-right (blu)
- **Bottom**: `SceneCaption` per callout narrativi

**Capitoli e Callout:**

| Frame | Tempo split | Evento | Voiceover |
|-------|-------------|--------|-----------|
| 660 | 0:00 | Start — timer parte | "Same order, same customer. The clock starts now." |
| 1500 | ~28s | **Chapter 1: Customer Selection** — CalloutBubble ERP: "Two identical records — which is active?" → PWA: "Inactive customers automatically hidden" | "Formicanera automatically filters inactive customer records — eliminating selection errors before they happen." |
| 3000 | ~78s | **Chapter 2: Article Search** — CalloutBubble ERP: "Dual search mechanism — inconsistent results" → PWA: "Unified intelligent search" | "A single, consistent search engine. Articles are always findable — regardless of punctuation or product coding." |
| 4440 | ~126s | **Chapter 3: Packaging** — CalloutBubble ERP: "7 units — manual calculation required" → PWA: "Auto-split: 1×5 + 2×1 ✓" | "Seven units. The packaging engine calculates the optimal split automatically. No arithmetic, no errors." |
| 5850 | ~173s | **Chapter 4: Discount & VAT** — CalloutBubble ERP: "Manual discount % entry required" → PWA: "Promotion applied automatically" | "Enter the target price — Formicanera calculates the exact discount and VAT in real time." |
| 6510 | ~195s | **PWA Done!** — Confetti, timer PWA si ferma su 3:15, badge verde "✓ 3:15" | "Order submitted. Formicanera is done." |

**Dopo il Done PWA (195s–262s):**

| Frame | Tempo split | Evento |
|-------|-------------|--------|
| 6510 | 195s | PWA Done — InsightCard appare sul pannello destro |
| 6510–8520 | 195–262s | InsightCard: 3 pending orders si accodano in sequenza con animazione |
| 8520 | 262s | ERP Done — timer ERP si ferma su 4:22 |

Voiceover durante InsightCard: *"While ERP processes the submission in the background — the agent is already queuing the next orders. Not downtime. Parallel productivity."*

#### Scena 4 — Summary (4:49–5:04s, 8520–8970f)
- Sfondo: `palette.bg`
- Tabella comparativa animata (4 righe):
  - `Customer Selection` | ⚠️ Manual | ✅ Auto-filtered
  - `Article Search` | ⚠️ Inconsistent | ✅ Unified
  - `Packaging` | ⚠️ Manual calc | ✅ Auto-split
  - `Discount & VAT` | ⚠️ Pre-calculated | ✅ Real-time
- Badge finali: `StatPill` — `"ERP: 4:22"` (grigio) vs `"Formicanera: 3:15"` (verde) + `"67 seconds faster"`
- Closing line: `"Same result. More intelligence. From any device."` con logo Formicanera
- Voiceover: *"Same result. More intelligence. Sixty-seven seconds faster — from any device."*

**Totale Video 1: ~5:04 → ~9,120 frames**

---

## 6. VIDEO 2 — "New Customer + Order"

**Durata totale stimata:** ~5:50 (~10,500 frames @ 30fps)
**Fonte video:**
- ERP: `3-erp-customer.mp4` (178s) + `4-erp-customer-order.mp4` (92s) = 270s totali
- PWA: `5-pwa-customer.mp4` (122s) + `6-pwa-customer-order.mp4` (65s) = 187s totali

### Scene Breakdown

#### Scena 0 — Two Workflows (0–12s, 0–360f)
- Stessa struttura della Scena 0 di Video 1, con testo adattato:

**ERP Timeline:**
```
[☎️ Client meeting] ──▶ [🚗 Drive back] ──▶ [💻 Open desk] ──▶ [⌨️ Create customer] ──▶ [⌨️ Enter order] ──▶ [✓ ERP]
```

**Formicanera Timeline:**
```
[☎️ Client meeting + 📱 Customer + Order on tablet] ──▶ [🚗 Drive] ──▶ [✓ ERP — in background]
```

- Voiceover: *"A new client. An on-site meeting. With ERP, the agent returns to the desk to create the customer and place the order. With Formicanera — it all happens during the meeting, on tablet. Now, the clock."*

#### Scena 1 — Intro (12–16s, 360–480f)
- Titolo: `"New Customer + Order"`
- Sottotitolo: `"End-to-End Workflow — On-Site, From Any Device"`

#### Scena 2 — Context Slide (16–22s, 480–660f)
- Tre righe stagger:
  - `"New client. On-site meeting."` — bianco 900
  - `"Create the customer."` — bianco 900
  - `"Place the order. Right now."` — `palette.blue` 900
- Sottotitolo: `"From any device. During the meeting."` — muted italic

#### Scena 3 — Part A: Customer Creation Split-Screen (22s–3:34s, 660–6,720f = 178s raw)
- **Left**: `3-erp-customer.mp4`
- **Right**: `5-pwa-customer.mp4` in TabletMockup
- Timer condiviso parte

**Capitoli e Callout:**

| Frame | Tempo split | Evento | Voiceover |
|-------|-------------|--------|-----------|
| 660 | 0:00 | Start | "Creating a new customer. Same data, two workflows." |
| 1200 | ~18s | **Device Context** — CalloutBubble PWA: "📱 On tablet — in front of the client" | "Formicanera works on tablet and mobile. The customer is created during the meeting — no desk required." |
| 2700 | ~68s | **Form Complexity** — CalloutBubble ERP: "Multiple screens, manual navigation" → PWA: "Single guided form" | "A single guided form with smart defaults — no navigating between screens." |
| 4320 | ~122s | **PWA Customer Done!** — badge verde "✓ 2:02" | "Customer created. Already ready for the order." |

**Dopo il Done PWA customer (122s–178s):**
- Right panel: breve animazione "Now placing the order..." → transizione verso `6-pwa-customer-order.mp4`
- Left panel: `3-erp-customer.mp4` finisce, transizione verso `4-erp-customer-order.mp4`

#### Scena 4 — Part B: Order Split-Screen (3:34–5:14s, 6,420–9,780f = 92s + 65s raw)
- **Left**: `4-erp-customer-order.mp4`
- **Right**: `6-pwa-customer-order.mp4` in TabletMockup
- Timer continua (accumula dal customer creation)

**Capitoli:**

| Frame | Tempo tot | Evento | Voiceover |
|-------|-----------|--------|-----------|
| ~8,370 | ~187s | **PWA Total Done!** — Confetti, badge "✓ 3:07 total" | "Customer created and order placed — in three minutes and seven seconds." |
| ~9,510 | ~270s | **ERP Total Done** — badge "4:30 total" | "Complete. The full end-to-end workflow." |

#### Scena 5 — Summary (5:14–5:34s, 9,510–10,110f)
- Tabella a 3 righe: `Customer Creation` | `Order Placement` | `Total`
- Badge: `"ERP: 4:30"` (grigio) vs `"Formicanera: 3:07"` (verde) + `"83 seconds faster"`
- Closing: `"From any device. Anywhere. Anytime."` con logo Formicanera e formica animata
- Voiceover: *"Eighty-three seconds faster — end to end. From any device. During the meeting."*

**Totale Video 2: ~5:34 → ~10,020 frames**

---

## 7. Voiceover Script Completo

### Video 1 — Order Creation

```
[SCENA 0 — TWO WORKFLOWS - 0:00]
"Two systems. Two workflows.
With ERP, the order is entered after the meeting — back at the desk.
With Formicanera, the order is created during the meeting, on tablet, closing the deal in real time.
Now — the clock starts."

[SPLIT-SCREEN START - 0:22]
"Same order, same customer. The clock starts now."

[CHAPTER 1 - ~0:50]
"Formicanera automatically filters inactive customer records —
eliminating selection errors before they happen."

[CHAPTER 2 - ~1:40]
"A single, consistent search engine.
Articles are always findable — regardless of punctuation or product coding."

[CHAPTER 3 - ~2:28]
"Seven units. The packaging engine calculates the optimal split automatically.
No arithmetic, no errors."

[CHAPTER 4 - ~3:15]
"Enter the target price —
Formicanera calculates the exact discount and VAT in real time."

[PWA DONE - ~3:37]
"Order submitted. Formicanera is done."

[INSIGHT - 3:37 to 4:49]
"While ERP processes the submission in the background —
the agent is already queuing the next orders.
Not downtime. Parallel productivity."

[ERP DONE - 4:49]
"Four minutes and twenty-two seconds. Same result."

[SUMMARY - 5:00]
"Same result. More intelligence.
Sixty-seven seconds faster — from any device."
```

### Video 2 — New Customer + Order

```
[SCENA 0 — TWO WORKFLOWS - 0:00]
"A new client. An on-site meeting.
With ERP, the agent returns to the desk to create the customer and place the order.
With Formicanera — it all happens during the meeting, on tablet.
Now, the clock."

[SPLIT-SCREEN START - 0:22]
"Creating a new customer. Same data, two workflows."

[DEVICE CONTEXT - ~0:40]
"Formicanera works on tablet and mobile.
The customer is created during the meeting — no desk required."

[FORM COMPLEXITY - ~1:30]
"A single guided form with smart defaults.
No navigating between screens."

[PWA CUSTOMER DONE - ~2:24]
"Customer created. Already ready for the order."

[PWA TOTAL DONE - ~3:29]
"Customer created and order placed — in three minutes and seven seconds."

[ERP TOTAL DONE - ~4:52]
"Complete. The full end-to-end workflow."

[SUMMARY - 5:14]
"Eighty-three seconds faster — end to end.
From any device. During the meeting."
```

---

## 8. Pipeline di Produzione

### Step 1 — FFmpeg Preprocessing
(vedi Sezione 4)

### Step 2 — Nuovi Componenti Remotion
Creare in `docs/commerciale/video/src/components/`:
1. `TabletMockup.tsx`
2. `SharedTimer.tsx`
3. `CalloutBubble.tsx`
4. `ChapterBadge.tsx`
5. `InsightCard.tsx`
6. `WorkflowTimeline.tsx`
7. `SplitDivider.tsx`

### Step 3 — Nuove Scene Remotion
Creare in `docs/commerciale/video/src/scenes/comparison/`:
1. `TwoWorkflows.tsx` (Scena 0 — reframe narrativo)
2. `ComparisonIntro.tsx`
3. `ComparisonContext.tsx`
4. `OrderSplitScreen.tsx` (Video 1 main)
5. `CustomerSplitScreen.tsx` (Video 2 Part A)
6. `OrderContinuationSplitScreen.tsx` (Video 2 Part B)
7. `ComparisonSummary.tsx`

### Step 4 — Nuove Composizioni Root
In `docs/commerciale/video/src/Root.tsx` aggiungere:
- `KometOrderComparison` (Video 1, ~9,120f)
- `KometCustomerComparison` (Video 2, ~10,020f)

### Step 5 — ElevenLabs Voiceover
- Voice: voce professionale ElevenLabs neutro-britannica o neutro-americana (da validare con anteprima — es. Rachel, Aria, Bella)
- Generare i due file audio via API con lo script in Sezione 7
- Sincronizzare frame-precise con `<Audio src={staticFile(...)} startFrom={frame} />`

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
| **Scena 0 — Two Workflows** | Reframe fondamentale: il vantaggio non è la velocità di inserimento dati, è *quando* e *dove* l'ordine nasce — durante il meeting, davanti al cliente |
| **Split-screen parallelo** | Risponde alla richiesta di misurazione temporale in modo onesto e diretto |
| **Tono propositivo** | ERP è il prodotto Komet — Formicanera lo estende, non lo critica mai |
| **TabletMockup** | PWA registrata su desktop ma viewport simile a tablet — onesto e visivamente più forte del solo desktop |
| **InsightCard durante attesa ERP** | Dimostra visivamente che il "tempo di attesa" del trasferimento è in realtà lavoro parallelo |
| **Due video separati** | Ogni video è autonomo e condivisibile all'interno dell'organizzazione valutante |
| **AI Voice ElevenLabs** | Nessun accento, produzione rapida, iterabile senza re-registrare |
| **Componenti esistenti** | Investimento Remotion già fatto — palette, springs, timing riutilizzati al 100% |
| **Closing line unificata** | "From any device. During the meeting." — sintetizza il vantaggio qualitativo in modo memorabile |
