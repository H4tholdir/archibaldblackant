# Formicanera Marketing Video — "The Winning Agent"

**Data:** 2026-04-12  
**Scadenza:** 2026-04-14 (call Komet Germania)  
**Durata target:** ~2:25 min  
**Formato:** 1920×1080, 30fps  
**Lingua:** Tutto in inglese  

---

## Obiettivo

Cortometraggio di marketing per la presentazione di Formicanera PWA al capo di Komet Germania. Il video segue la struttura narrativa "Before/After": la vita di un agente di materiale odontoiatrico senza Formicanera (faticosa, inefficiente) vs. con Formicanera (efficiente, equilibrio vita-lavoro). L'opzione scelta è **C — "The Winning Agent"**: storia emotiva + metriche animate in overlay nell'Atto II.

---

## Stack Tecnico

- **Remotion** — composizione video programmatica (React + TypeScript)
- **ElevenLabs** (piano free) — generazione voiceover EN (~420 caratteri)
- **Pexels** — stock footage gratuito per le scene live action
- **FFmpeg** — preprocessing clip stock (trim, resize a 1080p)

---

## Materiale Esistente

| File | Utilizzo |
|------|----------|
| `archibald-web-app/frontend/public/formicaneralogo.png` | Logo su slide transizione e finale |
| `Desktop/Registrazione schermo 2026-04-12 alle 01.52.27.mov` | Screen recording ERP — Atto I Scena 3 (monitor mockup) |
| `Downloads/WhatsApp Video 2026-04-12 at 02.05.20.mp4` | Demo creazione ordine — Atto II Scena 6 (phone mockup) |
| `Downloads/WhatsApp Video 2026-04-12 at 02.05.22.mp4` | Demo preventivo — Atto II Scena 7 (phone mockup) |
| `Downloads/WhatsApp Video 2026-04-12 at 09.24.10.mp4` | Dashboard provvigioni — Atto II Scena 8 (phone mockup) |

---

## Brand Identity

- **Colore primario:** `#0070fa`
- **Colore scuro:** `#003d8f`
- **Sfondo Atto I:** toni freddi/scuri `#1a1a2e`
- **Testo slide:** `#ffffff`
- **Metric badge:** verde `#4ade80` su sfondo semi-trasparente scuro

---

## Storyboard Completo

### ATTO I — The Old Way (0:00–0:55)

**Scena 1 — Flash montage driving (0:00–0:18)**
- Visivo: 4–5 tagli rapidi — uomo in completo nel traffico, mani sul volante, specchietto retrovisore, città
- Stock Pexels: `"businessman driving city traffic"`
- Audio: piano malinconico in fade-in, ambience traffico città
- Overlay: nessuno — puro visivo
- Color grade: desaturato, toni freddi

**Scena 2 — Visite clienti (0:18–0:30)**
- Visivo: 2–3 tagli — agente entra in studio dentistico, saluta medico, prende appunti a mano su carta
- Stock Pexels: `"sales representative dental office meeting"`, `"businessman entering office building"`
- Audio: piano continua, ambience ufficio silenzioso
- Overlay: nessuno

**Scena 3 — Sera alla scrivania (0:30–0:48)**
- Visivo: agente scioglie la cravatta, siede al PC desktop — monitor mostra screen recording ERP
- Stock Pexels: `"tired man desk computer evening"`, `"man loosening tie office"`
- Audio: piano si abbassa di intensità, SFX tastiera, silenzio pesante
- Overlay: **MonitorMockup** con `screen-recording.mov` all'interno

**Scena 4 — Orologio e letto (0:48–0:55)**
- Visivo: close-up orologio a muro (ora tarda), agente guarda in basso stanco, si alza, fade to black
- Stock Pexels: `"wall clock late night"`, `"tired man standing up"`
- Audio: SFX ticchettio orologio, piano si spegne, silenzio totale → black
- Overlay: fade to black animato

---

### TRANSIZIONE — poi arriva Formicanera (0:55–1:10)

- Visivo:
  1. Schermo nero per 1 secondo
  2. Testo `"Then came..."` (bianco su nero) in fade-in
  3. Sfondo `#0070fa` invade lo schermo con wipe animato
  4. Logo Formicanera entra con spring bounce al centro
  5. 4–6 formiche SVG camminano dai bordi verso il centro
- Audio: SFX whoosh al cambio colore → musica upbeat-professionale parte con impatto
- Durata: 15 secondi

---

### ATTO II — The New Way (1:10–2:12)

**Scena 5 — Notifica in auto (1:10–1:22)**
- Visivo: agente fermo in auto, prende smartphone, schermo mostra notifica Formicanera "cliente inattivo da 8 mesi"
- Stock Pexels: `"man in car smartphone notification"`
- Audio: musica upbeat continua, SFX notifica app (ding)
- Overlay: **PhoneMockup** con schermata notifica PWA + **MetricBadge** `"Inactive clients: auto-notified"`

**Scena 6 — Studio dentistico (1:22–1:42)**  
- Visivo: agente seduto alla scrivania di fronte al dentista (incontro professionale), **discretamente** prende lo smartphone e crea l'ordine su Formicanera mentre conversa — il phone mockup mostra `demo-order.mp4`
- Stock Pexels: `"businessman dentist meeting desk"`, `"salesman meeting doctor office"`
- Audio: musica upbeat in sottofondo, voiceover EN (scena 6)
- Overlay: **PhoneMockup** con `demo-order.mp4` + **MetricBadge** `"Order creation: 10× faster"`
- Voiceover: *"With Formicanera, agents create orders directly in front of the client — maximizing every close."*

**Scena 7 — Preventivo e stretta di mano (1:42–1:55)**
- Visivo: phone mockup mostra `demo-feature.mp4` (preventivo), poi stretta di mano agente-medico
- Stock Pexels: `"professional handshake business agreement"`, `"businessman shaking hands doctor"`
- Audio: voiceover EN (scena 7), musica
- Overlay: **PhoneMockup** con `demo-feature.mp4` + **MetricBadge** `"Quote delivered: instantly"`
- Voiceover: *"Instant quotes, generated on the spot. The deal is closed before leaving the room."*

**Scena 8 — Casa e famiglia (1:55–2:12)**
- Visivo sequenza:
  1. Agente torna a casa, passa davanti al PC desktop **spento** → sorride
  2. Si siede sul divano con la famiglia
  3. Prende lo smartphone, mostra `commissions.mp4` nel phone mockup
  4. Close-up viso soddisfatto → spegne il telefono → parla con la famiglia
- Stock Pexels: `"man home couch family evening"`, `"man smiling home desk off"`, `"family couch evening living room"`
- Audio: voiceover EN (scena 8), musica sale leggermente
- Overlay: **PhoneMockup** con `commissions.mp4` + **MetricBadge** `"Commissions: tracked in real-time"`
- Voiceover: *"And at the end of the day, he tracks his commissions in real time — and finally has time for what matters most."*

---

### SLIDE FINALE (2:12–2:25)

- Visivo: sfondo `#0070fa` → `#003d8f` gradiente, logo Formicanera al centro con spring-in, 4 formiche camminano ai bordi
- Testo:
  - Grande: **Formicanera**
  - Sottotitolo: *"The Competitive Advantage"*
- Audio: musica upbeat risolve ed evapora in fade-out
- Durata: 13 secondi

---

## Voiceover Script Completo

**Testo totale da incollare in ElevenLabs (in un unico blocco con pause):**

```
With Formicanera, agents create orders directly in front of the client — maximizing every close.

[pause]

Instant quotes, generated on the spot. The deal is closed before leaving the room.

[pause]

And at the end of the day, he tracks his commissions in real time — and finally has time for what matters most.
```

**Voce consigliata ElevenLabs:** "Adam" o "Antoni" — tono professionale, caldo, maschile EN  
**Caratteri totali:** ~420 (ben sotto il limite 10.000 del piano free)

---

## Architettura Remotion

### Struttura Directory

```
remotion-formicanera/
├── public/
│   ├── formicaneralogo.png          ← copiato da frontend/public/
│   ├── videos/
│   │   ├── screen-recording.mov     ← Desktop
│   │   ├── demo-order.mp4           ← WhatsApp 02.05.20
│   │   ├── demo-feature.mp4         ← WhatsApp 02.05.22
│   │   ├── commissions.mp4          ← WhatsApp 09.24.10
│   │   └── stock/                   ← scaricati da Pexels
│   └── audio/
│       ├── act1-music.mp3           ← royalty-free piano malinconico
│       ├── act2-music.mp3           ← royalty-free upbeat corporate
│       ├── notification.mp3         ← SFX ding notifica
│       ├── clock-tick.mp3           ← SFX ticchettio
│       ├── whoosh.mp3               ← SFX transizione
│       └── voiceover.mp3            ← generato ElevenLabs
├── src/
│   ├── Root.tsx
│   ├── compositions/
│   │   └── FormicaneraDemoVideo.tsx  ← composizione principale, sequencing
│   ├── scenes/
│   │   ├── Act1Montage.tsx           ← scene 1–4 (stock footage + ERP recording)
│   │   ├── TransitionSlide.tsx       ← slide #0070fa + logo + formiche
│   │   ├── Act2Notification.tsx      ← scena 5
│   │   ├── Act2DentalOffice.tsx      ← scena 6 (agente discreto al desk)
│   │   ├── Act2Handshake.tsx         ← scena 7
│   │   ├── Act2HomeCouch.tsx         ← scena 8
│   │   └── FinalSlide.tsx            ← slide finale
│   └── components/
│       ├── PhoneMockup.tsx           ← frame iPhone + OffthreadVideo dentro
│       ├── MonitorMockup.tsx         ← frame desktop + OffthreadVideo ERP
│       ├── MetricBadge.tsx           ← pill verde animata con spring
│       └── AntAnimation.tsx          ← formiche SVG con CSS keyframes
└── package.json
```

### Componenti Chiave

**`PhoneMockup`** — frame iPhone-style con `OffthreadVideo` al suo interno. Spring animation per l'entrata. Usato in scene 5, 6, 7, 8.

**`MonitorMockup`** — frame desktop con `OffthreadVideo` della screen recording ERP dentro. Scena 3 Atto I.

**`MetricBadge`** — pill con testo in verde `#4ade80`, appare con `spring()` da sotto. Scompare con fade-out. Usata nelle 4 scene dell'Atto II.

**`AntAnimation`** — 4–6 formiche SVG che camminano sui bordi dello schermo con `interpolate` Remotion per posizione. Usata in TransitionSlide e FinalSlide.

### Sequencing (`FormicaneraDemoVideo.tsx`)

```
<Composition fps={30} width={1920} height={1080} durationInFrames={4350}>
  <Audio src="act1-music.mp3" />
  <Sequence from={0}     durationInFrames={1650}><Act1Montage /></Sequence>
  <Sequence from={1650}  durationInFrames={450}> <TransitionSlide /></Sequence>
  <Sequence from={2100}  durationInFrames={360}> <Act2Notification /></Sequence>
  <Sequence from={2460}  durationInFrames={600}> <Act2DentalOffice /></Sequence>
  <Sequence from={3060}  durationInFrames={390}> <Act2Handshake /></Sequence>
  <Sequence from={3450}  durationInFrames={510}> <Act2HomeCouch /></Sequence>
  <Sequence from={3960}  durationInFrames={390}> <FinalSlide /></Sequence>
  <Audio src="act2-music.mp3" startFrom={2100} />
  <Audio src="voiceover.mp3" startFrom={2460} />
</Composition>
```

---

## Stock Footage — Ricerche Pexels

| Scena | Query Pexels | Durata Necessaria |
|-------|-------------|-------------------|
| 1 | `businessman driving city traffic` | 4–5 clip da 3–4s |
| 2 | `salesman dental office meeting` | 2–3 clip da 4s |
| 3 | `tired man desk computer evening` | 1 clip da 18s |
| 4 | `wall clock late night`, `tired man standing` | 2 clip da 4s |
| 5 | `man in car smartphone notification` | 1 clip da 12s |
| 6 | `businessman dentist meeting desk` | 1–2 clip da 20s |
| 7 | `professional handshake business` | 1 clip da 13s |
| 8 | `man family couch evening home` | 2–3 clip da 17s |

---

## Audio — Fonti Royalty-Free

- **Musica Atto I** (piano malinconico lento): Pixabay, cerca `"sad piano corporate"`
- **Musica Atto II** (upbeat corporate professionale): Pixabay, cerca `"upbeat corporate motivational"`
- **SFX notifica**: Pixabay, cerca `"notification ding"`
- **SFX orologio**: Pixabay, cerca `"clock ticking"`
- **SFX whoosh**: Pixabay, cerca `"whoosh transition"`

---

## Criteri di Successo

1. Il video si renderizza senza errori in Remotion (`npm run render`)
2. Durata finale: 2:15–2:30 min
3. Voiceover EN sincronizzato con le scene corrispondenti
4. Metriche badge compaiono e scompaiono nei momenti giusti
5. Transizione Formicanera è visivamente d'impatto (cambio di energia percepibile)
6. Il "money shot" (PC spento + sorriso) ha almeno 3 secondi di respiro
