# Formicanera Marketing Video — "The Winning Agent" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire un video marketing di 2:25 min in Remotion che combina stock footage Pexels, screen recording ERP, clip WhatsApp della PWA e slide animate con formiche per presentare Formicanera al CEO di Komet Germania.

**Architecture:** Progetto Remotion standalone in `remotion-formicanera/` con 7 scene componibili (`Act1Montage`, `TransitionSlide`, 4 scene Act2, `FinalSlide`) orchestrate da una singola composizione `FormicaneraDemoVideo`. Componenti riutilizzabili: `PhoneMockup`, `MonitorMockup`, `MetricBadge`, `AntAnimation`. Stock footage Pexels (scaricato con Playwright), voiceover ElevenLabs REST API, audio royalty-free Pixabay.

**Tech Stack:** Remotion 4.x, React 18, TypeScript strict, FFmpeg (conversione .mov→.mp4), ElevenLabs REST API, Pexels (stock footage gratuito), Pixabay (audio royalty-free)

**Spec di riferimento:** `docs/superpowers/specs/2026-04-12-formicanera-marketing-video-design.md`

---

## File Map

| File | Responsabilità |
|------|---------------|
| `remotion-formicanera/src/Root.tsx` | Registra la composizione `FormicaneraDemoVideo` |
| `remotion-formicanera/src/compositions/FormicaneraDemoVideo.tsx` | Composizione principale: sequencing di tutte le scene + audio |
| `remotion-formicanera/src/scenes/Act1Montage.tsx` | Scene 1–4: stock footage Atto I con color grade freddo |
| `remotion-formicanera/src/scenes/TransitionSlide.tsx` | Slide azzurra con logo bounce e formiche animate |
| `remotion-formicanera/src/scenes/Act2Notification.tsx` | Scena 5: agente in auto + phone mockup notifica |
| `remotion-formicanera/src/scenes/Act2DentalOffice.tsx` | Scena 6: agente seduto al desk del dentista + phone mockup ordine |
| `remotion-formicanera/src/scenes/Act2Handshake.tsx` | Scena 7: phone mockup preventivo + stretta di mano |
| `remotion-formicanera/src/scenes/Act2HomeCouch.tsx` | Scena 8: PC spento + divano + phone mockup dashboard |
| `remotion-formicanera/src/scenes/FinalSlide.tsx` | Slide finale con logo e tagline "The Competitive Advantage" |
| `remotion-formicanera/src/components/PhoneMockup.tsx` | Frame iPhone-style con `OffthreadVideo` dentro, spring entry |
| `remotion-formicanera/src/components/MonitorMockup.tsx` | Frame desktop con `OffthreadVideo` screen recording ERP |
| `remotion-formicanera/src/components/MetricBadge.tsx` | Pill verde animata con testo metrica, spring from-below |
| `remotion-formicanera/src/components/AntAnimation.tsx` | 5 formiche emoji SVG che camminano sui bordi con `interpolate` |
| `remotion-formicanera/public/videos/` | Tutti i video (stock + clip esistenti rinominate) |
| `remotion-formicanera/public/audio/` | Musica, SFX, voiceover.mp3 |
| `remotion-formicanera/public/formicaneralogo.png` | Logo copiato da frontend |

---

## Task 1: Inizializzare il progetto Remotion

**Files:**
- Create: `remotion-formicanera/` (intero progetto)

- [ ] **Step 1: Creare il progetto**

```bash
cd /Users/hatholdir/Downloads/Archibald
npx create-video@latest remotion-formicanera --template=empty --yes
```

- [ ] **Step 2: Installare dipendenze aggiuntive**

```bash
cd remotion-formicanera
npm install
```

- [ ] **Step 3: Verificare che Remotion Studio si avvii**

```bash
npm start
```

Apri `http://localhost:3000` — deve apparire lo Remotion Studio vuoto senza errori.

- [ ] **Step 4: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add remotion-formicanera/
git commit -m "feat(video): initialize Remotion project for Formicanera marketing video"
```

---

## Task 2: Configurare struttura directory e `Root.tsx`

**Files:**
- Modify: `remotion-formicanera/src/Root.tsx`
- Create: `remotion-formicanera/src/compositions/`, `remotion-formicanera/src/scenes/`, `remotion-formicanera/src/components/`

- [ ] **Step 1: Creare le directory**

```bash
mkdir -p remotion-formicanera/src/compositions
mkdir -p remotion-formicanera/src/scenes
mkdir -p remotion-formicanera/src/components
mkdir -p remotion-formicanera/public/videos/stock
mkdir -p remotion-formicanera/public/audio
```

- [ ] **Step 2: Aggiornare `Root.tsx`**

```tsx
// remotion-formicanera/src/Root.tsx
import { Composition } from 'remotion';
import { FormicaneraDemoVideo } from './compositions/FormicaneraDemoVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FormicaneraDemoVideo"
        component={FormicaneraDemoVideo}
        durationInFrames={4350}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
```

- [ ] **Step 3: Creare placeholder `FormicaneraDemoVideo.tsx`**

```tsx
// remotion-formicanera/src/compositions/FormicaneraDemoVideo.tsx
import { AbsoluteFill } from 'remotion';

export const FormicaneraDemoVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <div style={{ color: '#fff', fontSize: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        Formicanera — Building...
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 4: Verificare che Remotion Studio mostri la composizione**

```bash
npm start
```

Nella sidebar sinistra deve apparire `FormicaneraDemoVideo`. Cliccarla e il preview deve mostrare lo schermo nero con il testo.

- [ ] **Step 5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add remotion-formicanera/src/
git commit -m "feat(video): configure Remotion project structure and placeholder composition"
```

---

## Task 3: Preparare gli asset video esistenti

**Files:**
- Create: `remotion-formicanera/public/videos/screen-recording.mp4`
- Create: `remotion-formicanera/public/videos/demo-order.mp4`
- Create: `remotion-formicanera/public/videos/demo-feature.mp4`
- Create: `remotion-formicanera/public/videos/commissions.mp4`
- Create: `remotion-formicanera/public/formicaneralogo.png`

- [ ] **Step 1: Convertire la screen recording da .mov a .mp4**

```bash
ffmpeg -i "/Users/hatholdir/Desktop/Registrazione schermo 2026-04-12 alle 01.52.27.mov" \
  -c:v libx264 -crf 23 -preset fast \
  -c:a aac -b:a 128k \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
  "/Users/hatholdir/Downloads/Archibald/remotion-formicanera/public/videos/screen-recording.mp4"
```

Attendi il completamento (file da 106MB → ~40-60MB).

- [ ] **Step 2: Copiare le clip WhatsApp con nomi puliti**

```bash
cp "/Users/hatholdir/Downloads/WhatsApp Video 2026-04-12 at 02.05.20.mp4" \
   /Users/hatholdir/Downloads/Archibald/remotion-formicanera/public/videos/demo-order.mp4

cp "/Users/hatholdir/Downloads/WhatsApp Video 2026-04-12 at 02.05.22.mp4" \
   /Users/hatholdir/Downloads/Archibald/remotion-formicanera/public/videos/demo-feature.mp4

cp "/Users/hatholdir/Downloads/WhatsApp Video 2026-04-12 at 09.24.10.mp4" \
   /Users/hatholdir/Downloads/Archibald/remotion-formicanera/public/videos/commissions.mp4
```

- [ ] **Step 3: Copiare il logo**

```bash
cp /Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend/public/formicaneralogo.png \
   /Users/hatholdir/Downloads/Archibald/remotion-formicanera/public/formicaneralogo.png
```

- [ ] **Step 4: Verificare i file**

```bash
ls -lh /Users/hatholdir/Downloads/Archibald/remotion-formicanera/public/videos/
ls -lh /Users/hatholdir/Downloads/Archibald/remotion-formicanera/public/formicaneralogo.png
```

Output atteso: 5 file presenti (screen-recording.mp4, demo-order.mp4, demo-feature.mp4, commissions.mp4 nella cartella videos + logo.png).

- [ ] **Step 5: Aggiungere `public/videos/*.mp4` al `.gitignore` del progetto Remotion**

```bash
cat >> /Users/hatholdir/Downloads/Archibald/remotion-formicanera/.gitignore << 'EOF'
public/videos/
public/audio/
EOF
```

I video non vanno in git (troppo pesanti). Solo il codice.

- [ ] **Step 6: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add remotion-formicanera/.gitignore
git commit -m "feat(video): add gitignore for video and audio assets"
```

---

## Task 4: Scaricare stock footage da Pexels (Scene 1–4, Atto I)

**Files:**
- Create: `remotion-formicanera/public/videos/stock/s1-driving-*.mp4` (4 clip)
- Create: `remotion-formicanera/public/videos/stock/s2-dental-*.mp4` (2 clip)
- Create: `remotion-formicanera/public/videos/stock/s3-tired-desk.mp4`
- Create: `remotion-formicanera/public/videos/stock/s4-clock.mp4`

- [ ] **Step 1: Aprire Pexels e scaricare le clip per Scena 1 (driving flash)**

Navigare su `https://www.pexels.com/search/videos/businessman%20driving%20city%20traffic/`

Scaricare **4 clip** di ~3–5 secondi ciascuna (uomo in completo, mani sul volante, traffico cittadino, specchietto). Salvare come:
- `public/videos/stock/s1-driving-1.mp4`
- `public/videos/stock/s1-driving-2.mp4`
- `public/videos/stock/s1-driving-3.mp4`
- `public/videos/stock/s1-driving-4.mp4`

Qualità: almeno 1920×1080. Usare il pulsante "Free Download" → selezionare HD o Full HD.

- [ ] **Step 2: Scaricare clip per Scena 2 (dental office)**

Navigare su `https://www.pexels.com/search/videos/salesman%20dental%20office/`

Scaricare **2 clip** da ~5 secondi (uomo con cartella che entra in studio, colloquio professionale). Salvare come:
- `public/videos/stock/s2-dental-1.mp4`
- `public/videos/stock/s2-dental-2.mp4`

- [ ] **Step 3: Scaricare clip per Scena 3 (tired man at desk)**

Navigare su `https://www.pexels.com/search/videos/tired%20man%20desk%20computer%20evening/`

Scaricare **1 clip** da ~15–20 secondi (uomo stanco alla scrivania di sera, luce da monitor). Salvare come:
- `public/videos/stock/s3-tired-desk.mp4`

- [ ] **Step 4: Scaricare clip per Scena 4 (clock + standing up)**

Cerca su Pexels: `wall clock` → 1 clip close-up orologio da ~4 secondi.
Cerca su Pexels: `tired man standing office` → 1 clip da ~3 secondi.

Salvare come:
- `public/videos/stock/s4-clock.mp4`
- `public/videos/stock/s4-standing.mp4`

---

## Task 5: Scaricare stock footage da Pexels (Scene 5–8, Atto II)

**Files:**
- Create: `remotion-formicanera/public/videos/stock/s5-car-phone.mp4`
- Create: `remotion-formicanera/public/videos/stock/s6-dentist-meeting.mp4`
- Create: `remotion-formicanera/public/videos/stock/s7-handshake.mp4`
- Create: `remotion-formicanera/public/videos/stock/s8-couch-*.mp4` (2 clip)

- [ ] **Step 1: Clip Scena 5 — uomo in auto con smartphone**

Cerca: `https://www.pexels.com/search/videos/man%20car%20smartphone/`

Scaricare **1 clip** da ~12 secondi (uomo fermo in macchina che prende il telefono). Salvare come:
- `public/videos/stock/s5-car-phone.mp4`

- [ ] **Step 2: Clip Scena 6 — incontro professionale scrivania**

Cerca: `https://www.pexels.com/search/videos/businessman%20meeting%20desk%20professional/`

Scaricare **1 clip** da ~20 secondi (due persone sedute a una scrivania in colloquio professionale). Salvare come:
- `public/videos/stock/s6-dentist-meeting.mp4`

- [ ] **Step 3: Clip Scena 7 — stretta di mano**

Cerca: `https://www.pexels.com/search/videos/professional%20handshake%20business/`

Scaricare **1 clip** da ~5 secondi (stretta di mano vista da basso/laterale). Salvare come:
- `public/videos/stock/s7-handshake.mp4`

- [ ] **Step 4: Clip Scena 8 — divano con famiglia + PC spento**

Cerca: `https://www.pexels.com/search/videos/family%20couch%20evening%20home/`

Scaricare **1 clip** da ~15 secondi (famiglia sul divano la sera). Salvare come:
- `public/videos/stock/s8-couch-family.mp4`

Cerca: `https://www.pexels.com/search/videos/man%20smiling%20home%20evening/` → 1 clip uomo che sorride a casa. Salvare come:
- `public/videos/stock/s8-smile.mp4`

---

## Task 6: Scaricare audio royalty-free da Pixabay

**Files:**
- Create: `remotion-formicanera/public/audio/act1-music.mp3`
- Create: `remotion-formicanera/public/audio/act2-music.mp3`
- Create: `remotion-formicanera/public/audio/notification.mp3`
- Create: `remotion-formicanera/public/audio/clock-tick.mp3`
- Create: `remotion-formicanera/public/audio/whoosh.mp3`

- [ ] **Step 1: Musica Atto I (piano malinconico)**

Navigare su `https://pixabay.com/music/search/sad%20piano/`

Scaricare una traccia da ~90 secondi, tono malinconico, piano solo o piano+archi. Salvare come:
- `public/audio/act1-music.mp3`

- [ ] **Step 2: Musica Atto II (upbeat corporate)**

Navigare su `https://pixabay.com/music/search/upbeat%20corporate%20motivational/`

Scaricare una traccia da ~90 secondi, energica ma professionale. Salvare come:
- `public/audio/act2-music.mp3`

- [ ] **Step 3: SFX notifica**

Navigare su `https://pixabay.com/sound-effects/search/notification%20ding/`

Scaricare SFX notifica (~1 secondo). Salvare come:
- `public/audio/notification.mp3`

- [ ] **Step 4: SFX orologio e whoosh**

Clock tick: `https://pixabay.com/sound-effects/search/clock%20ticking/` → `public/audio/clock-tick.mp3`

Whoosh: `https://pixabay.com/sound-effects/search/whoosh%20transition/` → `public/audio/whoosh.mp3`

---

## Task 7: Generare voiceover con ElevenLabs

**Files:**
- Create: `remotion-formicanera/public/audio/voiceover.mp3`

- [ ] **Step 1: Aprire ElevenLabs e configurare la voce**

Navigare su `https://elevenlabs.io` → Speech Synthesis.

Selezionare voce: cercare **"Adam"** o **"Antoni"** (maschile, EN, professionale e caldo).

- [ ] **Step 2: Incollare il testo del voiceover**

Incollare questo testo esatto nella casella:

```
With Formicanera, agents create orders directly in front of the client — maximizing every close.

Instant quotes, generated on the spot. The deal is closed before leaving the room.

And at the end of the day, he tracks his commissions in real time — and finally has time for what matters most.
```

Settings consigliati: Stability 0.5, Similarity Boost 0.75, Style 0.3.

- [ ] **Step 3: Generare e scaricare**

Cliccare "Generate" → ascoltare l'anteprima → se soddisfacente, cliccare il pulsante download (icona ↓).

Salvare il file come: `public/audio/voiceover.mp3`

- [ ] **Step 4: Verificare la durata**

```bash
ffprobe -i /Users/hatholdir/Downloads/Archibald/remotion-formicanera/public/audio/voiceover.mp3 \
  -show_entries format=duration -v quiet -of csv="p=0"
```

Output atteso: un valore tra `12` e `18` secondi (i 3 blocchi di testo). Annotare il valore esatto — servirà per sincronizzare il timing in `FormicaneraDemoVideo.tsx`.

---

## Task 8: Costruire il componente `PhoneMockup`

**Files:**
- Create: `remotion-formicanera/src/components/PhoneMockup.tsx`

- [ ] **Step 1: Scrivere il componente**

```tsx
// remotion-formicanera/src/components/PhoneMockup.tsx
import React from 'react';
import { AbsoluteFill, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

type Props = {
  videoSrc: string;
  startFrom?: number;
  right?: number;
  bottom?: number;
};

export const PhoneMockup: React.FC<Props> = ({
  videoSrc,
  startFrom = 0,
  right = 120,
  bottom = 80,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 14, stiffness: 100 }, from: 0, to: 1 });
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        right,
        bottom,
        width: 300,
        height: 600,
        transform: `scale(${scale})`,
        transformOrigin: 'bottom right',
        opacity,
        borderRadius: 44,
        overflow: 'hidden',
        border: '10px solid #1c1c1e',
        boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)',
        backgroundColor: '#000',
        zIndex: 10,
      }}
    >
      {/* Notch */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 130,
          height: 32,
          backgroundColor: '#1c1c1e',
          borderRadius: '0 0 22px 22px',
          zIndex: 20,
        }}
      />
      <OffthreadVideo
        src={staticFile(videoSrc)}
        startFrom={startFrom}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
};
```

- [ ] **Step 2: Verificare in Remotion Studio**

Importare temporaneamente in `FormicaneraDemoVideo.tsx` e visualizzare il placeholder:

```tsx
// Aggiungere temporaneamente in FormicaneraDemoVideo.tsx per test visivo
import { PhoneMockup } from '../components/PhoneMockup';
// Nel JSX:
<PhoneMockup videoSrc="videos/commissions.mp4" />
```

Aprire `npm start` e verificare che appaia il frame del telefono con il video inside e l'animazione spring.

Rimuovere il test dopo la verifica.

- [ ] **Step 3: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add remotion-formicanera/src/components/PhoneMockup.tsx
git commit -m "feat(video): add PhoneMockup component"
```

---

## Task 9: Costruire i componenti `MonitorMockup` e `MetricBadge`

**Files:**
- Create: `remotion-formicanera/src/components/MonitorMockup.tsx`
- Create: `remotion-formicanera/src/components/MetricBadge.tsx`

- [ ] **Step 1: Scrivere `MonitorMockup`**

```tsx
// remotion-formicanera/src/components/MonitorMockup.tsx
import React from 'react';
import { OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

type Props = {
  videoSrc: string;
  startFrom?: number;
};

export const MonitorMockup: React.FC<Props> = ({ videoSrc, startFrom = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 18, stiffness: 80 }, from: 0.85, to: 1 });
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -55%) scale(${scale})`,
        opacity,
        width: 860,
        zIndex: 10,
      }}
    >
      {/* Screen */}
      <div
        style={{
          width: '100%',
          aspectRatio: '16/10',
          backgroundColor: '#0a0a0a',
          borderRadius: 12,
          overflow: 'hidden',
          border: '3px solid #2a2a2a',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        }}
      >
        <OffthreadVideo
          src={staticFile(videoSrc)}
          startFrom={startFrom}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      {/* Stand */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 40, height: 30, backgroundColor: '#2a2a2a' }} />
        <div style={{ width: 160, height: 8, backgroundColor: '#222', borderRadius: 4 }} />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Scrivere `MetricBadge`**

```tsx
// remotion-formicanera/src/components/MetricBadge.tsx
import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

type Props = {
  text: string;
  delayFrames?: number;
};

export const MetricBadge: React.FC<Props> = ({ text, delayFrames = 15 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const adjustedFrame = Math.max(0, frame - delayFrames);

  const translateY = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 12, stiffness: 120 },
    from: 40,
    to: 0,
  });

  const opacity = interpolate(adjustedFrame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 64,
        left: '50%',
        transform: `translateX(-50%) translateY(${translateY}px)`,
        opacity,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(12px)',
        border: '1.5px solid rgba(74, 222, 128, 0.5)',
        borderRadius: 100,
        padding: '14px 36px',
        color: '#4ade80',
        fontSize: 30,
        fontWeight: 700,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        whiteSpace: 'nowrap',
        zIndex: 20,
        letterSpacing: '-0.3px',
      }}
    >
      {text}
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add remotion-formicanera/src/components/MonitorMockup.tsx remotion-formicanera/src/components/MetricBadge.tsx
git commit -m "feat(video): add MonitorMockup and MetricBadge components"
```

---

## Task 10: Costruire il componente `AntAnimation`

**Files:**
- Create: `remotion-formicanera/src/components/AntAnimation.tsx`

- [ ] **Step 1: Scrivere il componente**

```tsx
// remotion-formicanera/src/components/AntAnimation.tsx
import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

type AntProps = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delay: number;
  size: number;
  flipX?: boolean;
};

const Ant: React.FC<AntProps> = ({ startX, startY, endX, endY, delay, size, flipX = false }) => {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - delay);

  const progress = interpolate(adjustedFrame, [0, 120], [0, 1], { extrapolateRight: 'clamp' });
  const x = interpolate(progress, [0, 1], [startX, endX]);
  const y = interpolate(progress, [0, 1], [startY, endY]);
  const opacity = interpolate(adjustedFrame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        fontSize: size,
        transform: `rotate(${angle}deg) scaleX(${flipX ? -1 : 1})`,
        opacity,
        userSelect: 'none',
        lineHeight: 1,
      }}
    >
      🐜
    </div>
  );
};

export const AntAnimation: React.FC = () => {
  return (
    <>
      {/* Formica 1: da sinistra → centro basso */}
      <Ant startX={-40} startY={900} endX={600} endY={950} delay={0} size={38} />
      {/* Formica 2: da destra → centro */}
      <Ant startX={1960} startY={800} endX={1100} endY={880} delay={15} size={32} flipX />
      {/* Formica 3: dall'alto → lato sinistro */}
      <Ant startX={200} startY={-40} endX={150} endY={400} delay={30} size={28} />
      {/* Formica 4: da basso-destra → centro */}
      <Ant startX={1700} startY={1120} endX={1000} endY={950} delay={10} size={36} flipX />
      {/* Formica 5: da angolo → logo */}
      <Ant startX={-40} startY={200} endX={700} endY={500} delay={45} size={24} />
    </>
  );
};
```

- [ ] **Step 2: Testare visivamente in Remotion Studio**

Importare temporaneamente `AntAnimation` in `TransitionSlide.tsx` (che crei al Task seguente) e verificare che le formiche animino correttamente nell'anteprima.

- [ ] **Step 3: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add remotion-formicanera/src/components/AntAnimation.tsx
git commit -m "feat(video): add AntAnimation component"
```

---

## Task 11: Costruire la scena `Act1Montage`

**Files:**
- Create: `remotion-formicanera/src/scenes/Act1Montage.tsx`

La scena dura 1650 frame (55 secondi a 30fps). Al suo interno, le clip stock vengono sequenziate con `<Sequence>`. Il color grade freddo/desaturato è applicato via CSS filter sull'intero contenitore.

- [ ] **Step 1: Scrivere il componente**

```tsx
// remotion-formicanera/src/scenes/Act1Montage.tsx
import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { MonitorMockup } from '../components/MonitorMockup';

// Timing interni alla scena (frame relativi, partono da 0)
const SCENE1_END = 540;   // 0:00–0:18 — 18s driving
const SCENE2_END = 900;   // 0:18–0:30 — 12s dental
const SCENE3_END = 1440;  // 0:30–0:48 — 18s tired desk
const SCENE4_END = 1650;  // 0:48–0:55 — 7s clock + fade

export const Act1Montage: React.FC = () => {
  const frame = useCurrentFrame();

  // Fade out verso black negli ultimi 30 frame
  const fadeOpacity = interpolate(frame, [SCENE4_END - 30, SCENE4_END], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0a0c14',
        filter: 'saturate(0.55) brightness(0.88) hue-rotate(-8deg)',
      }}
    >
      {/* Musica Atto I */}
      <Audio src={staticFile('audio/act1-music.mp3')} volume={0.7} />

      {/* Scena 1 — driving flash (4 clip rapide) */}
      <Sequence from={0} durationInFrames={SCENE1_END}>
        <AbsoluteFill>
          {/* Clip 1: 0–120 frame */}
          <Sequence from={0} durationInFrames={120}>
            <OffthreadVideo src={staticFile('videos/stock/s1-driving-1.mp4')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Sequence>
          {/* Clip 2: 120–270 frame */}
          <Sequence from={120} durationInFrames={150}>
            <OffthreadVideo src={staticFile('videos/stock/s1-driving-2.mp4')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Sequence>
          {/* Clip 3: 270–390 frame */}
          <Sequence from={270} durationInFrames={120}>
            <OffthreadVideo src={staticFile('videos/stock/s1-driving-3.mp4')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Sequence>
          {/* Clip 4: 390–540 frame */}
          <Sequence from={390} durationInFrames={150}>
            <OffthreadVideo src={staticFile('videos/stock/s1-driving-4.mp4')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Sequence>
        </AbsoluteFill>
      </Sequence>

      {/* Scena 2 — dental office (2 clip) */}
      <Sequence from={SCENE1_END} durationInFrames={SCENE2_END - SCENE1_END}>
        <AbsoluteFill>
          <Sequence from={0} durationInFrames={180}>
            <OffthreadVideo src={staticFile('videos/stock/s2-dental-1.mp4')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Sequence>
          <Sequence from={180} durationInFrames={180}>
            <OffthreadVideo src={staticFile('videos/stock/s2-dental-2.mp4')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Sequence>
        </AbsoluteFill>
      </Sequence>

      {/* Scena 3 — tired desk + monitor mockup */}
      <Sequence from={SCENE2_END} durationInFrames={SCENE3_END - SCENE2_END}>
        <AbsoluteFill>
          <OffthreadVideo src={staticFile('videos/stock/s3-tired-desk.mp4')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <MonitorMockup videoSrc="videos/screen-recording.mp4" startFrom={0} />
          {/* SFX tastiera */}
          <Audio src={staticFile('audio/clock-tick.mp3')} volume={0.15} startFrom={0} />
        </AbsoluteFill>
      </Sequence>

      {/* Scena 4 — orologio + si alza */}
      <Sequence from={SCENE3_END} durationInFrames={SCENE4_END - SCENE3_END}>
        <AbsoluteFill>
          <Sequence from={0} durationInFrames={120}>
            <OffthreadVideo src={staticFile('videos/stock/s4-clock.mp4')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <Audio src={staticFile('audio/clock-tick.mp3')} volume={0.5} />
          </Sequence>
          <Sequence from={120} durationInFrames={90}>
            <OffthreadVideo src={staticFile('videos/stock/s4-standing.mp4')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Sequence>
        </AbsoluteFill>
      </Sequence>

      {/* Fade to black overlay */}
      <AbsoluteFill style={{ backgroundColor: '#000', opacity: 1 - fadeOpacity, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Testare in Remotion Studio**

Importare `Act1Montage` in `FormicaneraDemoVideo.tsx` come prima sequenza. Navigare nel player ai vari punti (frame 0, 540, 900, 1440) e verificare che le clip si succedano correttamente e il filtro freddo sia applicato.

- [ ] **Step 3: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add remotion-formicanera/src/scenes/Act1Montage.tsx
git commit -m "feat(video): add Act1Montage scene with cold color grade"
```

---

## Task 12: Costruire la scena `TransitionSlide`

**Files:**
- Create: `remotion-formicanera/src/scenes/TransitionSlide.tsx`

La scena dura 450 frame (15 secondi). Sequenza: nero → "Then came…" → flood azzurro → logo bounce → formiche.

- [ ] **Step 1: Scrivere il componente**

```tsx
// remotion-formicanera/src/scenes/TransitionSlide.tsx
import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { AntAnimation } from '../components/AntAnimation';

export const TransitionSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // "Then came..." appare dal frame 15 al 60
  const textOpacity = interpolate(frame, [15, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Flood azzurro: parte al frame 75, completo al 120
  const blueOpacity = interpolate(frame, [75, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Logo: spring dal frame 120
  const logoScale = spring({ frame: Math.max(0, frame - 120), fps, config: { damping: 10, stiffness: 90 }, from: 0, to: 1 });
  const logoOpacity = interpolate(frame, [120, 145], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Tagline sotto il logo: appare dal frame 180
  const taglineOpacity = interpolate(frame, [180, 210], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* SFX whoosh + musica Atto II */}
      <Audio src={staticFile('audio/whoosh.mp3')} startFrom={0} volume={0.8} />
      <Audio src={staticFile('audio/act2-music.mp3')} startFrom={0} volume={0} />

      {/* "Then came..." testo */}
      <AbsoluteFill
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: textOpacity * (1 - blueOpacity),
        }}
      >
        <span
          style={{
            color: '#fff',
            fontSize: 72,
            fontWeight: 300,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            letterSpacing: '-1px',
          }}
        >
          Then came...
        </span>
      </AbsoluteFill>

      {/* Sfondo azzurro flood */}
      <AbsoluteFill style={{ backgroundColor: '#0070fa', opacity: blueOpacity }} />

      {/* Logo + formiche (sopra il flood azzurro) */}
      {blueOpacity > 0.1 && (
        <AbsoluteFill
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: logoOpacity,
          }}
        >
          <Img
            src={staticFile('formicaneralogo.png')}
            style={{
              width: 340,
              height: 340,
              transform: `scale(${logoScale})`,
              objectFit: 'contain',
              filter: 'drop-shadow(0 20px 60px rgba(0,0,20,0.4))',
            }}
          />
          <div
            style={{
              color: '#fff',
              fontSize: 86,
              fontWeight: 800,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              marginTop: 24,
              letterSpacing: '-2px',
              opacity: taglineOpacity,
            }}
          >
            Formicanera
          </div>
        </AbsoluteFill>
      )}

      {/* Formiche animate */}
      {frame > 150 && <AntAnimation />}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Testare in Remotion Studio**

Navigare alla `TransitionSlide` nel player. Verificare: nero → "Then came…" → flood azzurro → logo con bounce → formiche che camminano. La musica SFX deve partire.

- [ ] **Step 3: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add remotion-formicanera/src/scenes/TransitionSlide.tsx
git commit -m "feat(video): add TransitionSlide with logo bounce and ant animation"
```

---

## Task 13: Costruire le scene dell'Atto II

**Files:**
- Create: `remotion-formicanera/src/scenes/Act2Notification.tsx`
- Create: `remotion-formicanera/src/scenes/Act2DentalOffice.tsx`
- Create: `remotion-formicanera/src/scenes/Act2Handshake.tsx`
- Create: `remotion-formicanera/src/scenes/Act2HomeCouch.tsx`

- [ ] **Step 1: Scrivere `Act2Notification.tsx` (Scena 5, 360 frame = 12s)**

```tsx
// remotion-formicanera/src/scenes/Act2Notification.tsx
import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, staticFile } from 'remotion';
import { MetricBadge } from '../components/MetricBadge';
import { PhoneMockup } from '../components/PhoneMockup';

export const Act2Notification: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <OffthreadVideo
        src={staticFile('videos/stock/s5-car-phone.mp4')}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <Audio src={staticFile('audio/notification.mp3')} startFrom={0} volume={1} />
      {/* Phone mostra schermata notifica PWA — usiamo la clip commissions come placeholder visivo 
          Idealmente qui va uno screenshot della notifica PWA. Per ora usiamo il video notifiche. */}
      <PhoneMockup videoSrc="videos/commissions.mp4" startFrom={0} />
      <MetricBadge text="Inactive clients: auto-notified" delayFrames={30} />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Scrivere `Act2DentalOffice.tsx` (Scena 6, 600 frame = 20s)**

```tsx
// remotion-formicanera/src/scenes/Act2DentalOffice.tsx
import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, staticFile } from 'remotion';
import { MetricBadge } from '../components/MetricBadge';
import { PhoneMockup } from '../components/PhoneMockup';

export const Act2DentalOffice: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Stock: agente e interlocutore seduti alla scrivania */}
      <OffthreadVideo
        src={staticFile('videos/stock/s6-dentist-meeting.mp4')}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* Voiceover — parte dall'inizio di questa scena (frame 0 qui = frame assoluto 2460) */}
      <Audio src={staticFile('audio/voiceover.mp3')} startFrom={0} volume={1} />
      {/* Phone mockup: agente crea ordine discretamente */}
      <PhoneMockup videoSrc="videos/demo-order.mp4" startFrom={0} right={120} bottom={80} />
      <MetricBadge text="Order creation: 10× faster" delayFrames={45} />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 3: Scrivere `Act2Handshake.tsx` (Scena 7, 390 frame = 13s)**

```tsx
// remotion-formicanera/src/scenes/Act2Handshake.tsx
import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, staticFile } from 'remotion';
import { MetricBadge } from '../components/MetricBadge';
import { PhoneMockup } from '../components/PhoneMockup';

// Voiceover offset: questa scena inizia al frame assoluto 3060.
// La scena 6 dura 600 frame. Il voiceover ha già parlato per 20s = 600 frame.
// Quindi il secondo blocco del voiceover inizia ~5-6s dopo il primo.
// Calcoliamo: se la scena 6 dura 20s e la prima frase dura ~7s,
// il voiceover riprende dopo ~1s di pausa = 300ms → startFrom ~210 frame qui.
const VOICEOVER_OFFSET_FRAMES = 210; // aggiustare dopo aver misurato la durata reale del voiceover

export const Act2Handshake: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <OffthreadVideo
        src={staticFile('videos/stock/s7-handshake.mp4')}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <Audio
        src={staticFile('audio/voiceover.mp3')}
        startFrom={VOICEOVER_OFFSET_FRAMES}
        volume={1}
      />
      <PhoneMockup videoSrc="videos/demo-feature.mp4" startFrom={0} right={120} bottom={80} />
      <MetricBadge text="Quote delivered: instantly" delayFrames={30} />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 4: Scrivere `Act2HomeCouch.tsx` (Scena 8, 510 frame = 17s)**

```tsx
// remotion-formicanera/src/scenes/Act2HomeCouch.tsx
import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { MetricBadge } from '../components/MetricBadge';
import { PhoneMockup } from '../components/PhoneMockup';

const VOICEOVER_OFFSET_FRAMES = 420; // terzo blocco voiceover — aggiustare dopo misurazione reale

export const Act2HomeCouch: React.FC = () => {
  const frame = useCurrentFrame();

  // PC spento: sorride (primi 3 secondi = 90 frame)
  // Poi divano con famiglia
  // Phone mockup appare al frame 120

  // Sorriso piano alla musica che sale
  const musicVolume = interpolate(frame, [300, 480], [0.7, 1.0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#1a1a1a' }}>
      {/* Prima parte: uomo sorride a casa (PC spento implicito) */}
      <Sequence from={0} durationInFrames={120}>
        <OffthreadVideo
          src={staticFile('videos/stock/s8-smile.mp4')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </Sequence>

      {/* Seconda parte: divano con famiglia */}
      <Sequence from={120} durationInFrames={390}>
        <OffthreadVideo
          src={staticFile('videos/stock/s8-couch-family.mp4')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </Sequence>

      {/* Voiceover terzo blocco */}
      <Audio
        src={staticFile('audio/voiceover.mp3')}
        startFrom={VOICEOVER_OFFSET_FRAMES}
        volume={1}
      />

      {/* Phone mockup: dashboard provvigioni appare al frame 90 */}
      {frame >= 90 && (
        <PhoneMockup videoSrc="videos/commissions.mp4" startFrom={0} right={120} bottom={80} />
      )}

      {frame >= 90 && (
        <MetricBadge text="Commissions: tracked in real-time" delayFrames={20} />
      )}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add remotion-formicanera/src/scenes/Act2Notification.tsx \
        remotion-formicanera/src/scenes/Act2DentalOffice.tsx \
        remotion-formicanera/src/scenes/Act2Handshake.tsx \
        remotion-formicanera/src/scenes/Act2HomeCouch.tsx
git commit -m "feat(video): add all Act II scenes"
```

---

## Task 14: Costruire la scena `FinalSlide`

**Files:**
- Create: `remotion-formicanera/src/scenes/FinalSlide.tsx`

- [ ] **Step 1: Scrivere il componente**

```tsx
// remotion-formicanera/src/scenes/FinalSlide.tsx
import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { AntAnimation } from '../components/AntAnimation';

export const FinalSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 }, from: 0, to: 1 });
  const textOpacity = interpolate(frame, [20, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const taglineOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Fade out finale ultimi 30 frame
  const totalFrames = 390;
  const fadeOut = interpolate(frame, [totalFrames - 30, totalFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(145deg, #0070fa 0%, #003d8f 100%)',
        opacity: fadeOut,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
      }}
    >
      <Img
        src={staticFile('formicaneralogo.png')}
        style={{
          width: 280,
          height: 280,
          objectFit: 'contain',
          transform: `scale(${logoScale})`,
          filter: 'drop-shadow(0 20px 60px rgba(0,0,20,0.5))',
        }}
      />

      <div
        style={{
          color: '#fff',
          fontSize: 96,
          fontWeight: 800,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          letterSpacing: '-2px',
          opacity: textOpacity,
        }}
      >
        Formicanera
      </div>

      <div
        style={{
          color: 'rgba(255,255,255,0.85)',
          fontSize: 36,
          fontWeight: 400,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          letterSpacing: '4px',
          textTransform: 'uppercase',
          opacity: taglineOpacity,
        }}
      >
        The Competitive Advantage
      </div>

      <AntAnimation />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add remotion-formicanera/src/scenes/FinalSlide.tsx
git commit -m "feat(video): add FinalSlide with logo and tagline"
```

---

## Task 15: Collegare la composizione principale `FormicaneraDemoVideo`

**Files:**
- Modify: `remotion-formicanera/src/compositions/FormicaneraDemoVideo.tsx`

- [ ] **Step 1: Scrivere la composizione completa**

```tsx
// remotion-formicanera/src/compositions/FormicaneraDemoVideo.tsx
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Act1Montage } from '../scenes/Act1Montage';
import { Act2DentalOffice } from '../scenes/Act2DentalOffice';
import { Act2Handshake } from '../scenes/Act2Handshake';
import { Act2HomeCouch } from '../scenes/Act2HomeCouch';
import { Act2Notification } from '../scenes/Act2Notification';
import { FinalSlide } from '../scenes/FinalSlide';
import { TransitionSlide } from '../scenes/TransitionSlide';

// Timing assoluto (frame a 30fps)
const ACT1_START        = 0;
const TRANSITION_START  = 1650;  // 0:55
const S5_START          = 2100;  // 1:10
const S6_START          = 2460;  // 1:22
const S7_START          = 3060;  // 1:42
const S8_START          = 3450;  // 1:55
const FINAL_START       = 3960;  // 2:12
const TOTAL_FRAMES      = 4350;  // 2:25

export const FormicaneraDemoVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Atto I */}
      <Sequence from={ACT1_START} durationInFrames={TRANSITION_START - ACT1_START}>
        <Act1Montage />
      </Sequence>

      {/* Transizione */}
      <Sequence from={TRANSITION_START} durationInFrames={S5_START - TRANSITION_START}>
        <TransitionSlide />
      </Sequence>

      {/* Musica Atto II: parte con la transizione, continua fino alla fine */}
      <Audio
        src={staticFile('audio/act2-music.mp3')}
        startFrom={0}
        volume={(f) => {
          // Fade in durante transizione (frame 0–450 della composizione = globale 1650–2100)
          if (f < TRANSITION_START) return 0;
          if (f < TRANSITION_START + 60) return (f - TRANSITION_START) / 60 * 0.8;
          if (f > TOTAL_FRAMES - 60) return ((TOTAL_FRAMES - f) / 60) * 0.8;
          return 0.8;
        }}
      />

      {/* Scena 5 — Notifica */}
      <Sequence from={S5_START} durationInFrames={S6_START - S5_START}>
        <Act2Notification />
      </Sequence>

      {/* Scena 6 — Studio dentistico */}
      <Sequence from={S6_START} durationInFrames={S7_START - S6_START}>
        <Act2DentalOffice />
      </Sequence>

      {/* Scena 7 — Stretta di mano */}
      <Sequence from={S7_START} durationInFrames={S8_START - S7_START}>
        <Act2Handshake />
      </Sequence>

      {/* Scena 8 — Casa e famiglia */}
      <Sequence from={S8_START} durationInFrames={FINAL_START - S8_START}>
        <Act2HomeCouch />
      </Sequence>

      {/* Slide finale */}
      <Sequence from={FINAL_START} durationInFrames={TOTAL_FRAMES - FINAL_START}>
        <FinalSlide />
      </Sequence>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Aggiornare `Root.tsx` con import corretto**

Verificare che `Root.tsx` importi `FormicaneraDemoVideo` da `./compositions/FormicaneraDemoVideo`.

- [ ] **Step 3: Verificare TypeScript**

```bash
cd remotion-formicanera
npx tsc --noEmit
```

Output atteso: nessun errore.

- [ ] **Step 4: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add remotion-formicanera/src/compositions/FormicaneraDemoVideo.tsx remotion-formicanera/src/Root.tsx
git commit -m "feat(video): wire FormicaneraDemoVideo main composition"
```

---

## Task 16: Preview, aggiustamento timing e sync voiceover

**Files:**
- Modify: `remotion-formicanera/src/scenes/Act2Handshake.tsx` (aggiustare `VOICEOVER_OFFSET_FRAMES`)
- Modify: `remotion-formicanera/src/scenes/Act2HomeCouch.tsx` (aggiustare `VOICEOVER_OFFSET_FRAMES`)

- [ ] **Step 1: Avviare Remotion Studio e navigare l'intera composizione**

```bash
cd remotion-formicanera
npm start
```

Selezionare `FormicaneraDemoVideo` e riprodurre dall'inizio. Verificare:
- [ ] Atto I: cold filter applicato, clip si succedono correttamente
- [ ] Transizione: "Then came…" appare, poi flood azzurro, poi logo con bounce, poi formiche
- [ ] Scena 5: stock footage + phone mockup notifica + badge metrica
- [ ] Scena 6: meeting desk + phone mockup ordine + voiceover EN
- [ ] Scena 7: stock handshake + phone mockup preventivo + voiceover EN
- [ ] Scena 8: smile + couch + phone mockup dashboard + voiceover EN
- [ ] Slide finale: logo + tagline + formiche

- [ ] **Step 2: Misurare la durata reale del voiceover e aggiustare gli offset**

```bash
ffprobe -i remotion-formicanera/public/audio/voiceover.mp3 \
  -show_entries format=duration -v quiet -of csv="p=0"
```

Supponiamo il risultato sia `X` secondi. Il voiceover ha 3 frasi separate da pause:
- Frase 1 (scena 6): ~7s
- Pausa: ~1s  
- Frase 2 (scena 7): ~5s
- Pausa: ~1s
- Frase 3 (scena 8): ~6s

In `Act2Handshake.tsx`: `VOICEOVER_OFFSET_FRAMES = (7 + 1) * 30 = 240`
In `Act2HomeCouch.tsx`: `VOICEOVER_OFFSET_FRAMES = (7 + 1 + 5 + 1) * 30 = 420`

Aggiustare i valori in base alla durata reale ascoltando il file e annotando i punti di inizio di ogni frase.

- [ ] **Step 3: Verificare che il voiceover sia sincronizzato alle scene nel player**

Posizionarsi al frame 2460 (scena 6) e verificare che il voiceover parta. Poi frame 3060 (scena 7) e frame 3450 (scena 8).

- [ ] **Step 4: Commit aggiustamenti timing**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add remotion-formicanera/src/scenes/
git commit -m "feat(video): adjust voiceover sync timing after preview"
```

---

## Task 17: Render finale del video

**Files:**
- Create: `out/FormicaneraDemoVideo.mp4`

- [ ] **Step 1: Eseguire il render**

```bash
cd /Users/hatholdir/Downloads/Archibald/remotion-formicanera
npx remotion render FormicaneraDemoVideo out/FormicaneraDemoVideo.mp4 \
  --codec=h264 \
  --crf=18 \
  --log=verbose
```

Il render impiega ~5–15 minuti a seconda della CPU. Seguire i log per eventuali errori.

Output atteso: `out/FormicaneraDemoVideo.mp4` da ~200–500MB.

- [ ] **Step 2: Verificare il video renderizzato**

```bash
ffprobe -i out/FormicaneraDemoVideo.mp4 \
  -show_entries format=duration,size -v quiet -of default
open out/FormicaneraDemoVideo.mp4
```

Controllare:
- Durata: ~145 secondi (2:25)
- Video fluido senza artefatti
- Audio sincronizzato
- Transizioni correte

- [ ] **Step 3: (Opzionale) Export versione compressa per sharing**

```bash
ffmpeg -i out/FormicaneraDemoVideo.mp4 \
  -c:v libx264 -crf 23 -preset slow \
  -c:a aac -b:a 192k \
  out/FormicaneraDemoVideo-compressed.mp4
```

Produce un file ~80–120MB più facile da condividere mantenendo alta qualità.

- [ ] **Step 4: Commit finale**

```bash
cd /Users/hatholdir/Downloads/Archibald
# Non committare il video, solo il codice sorgente finale
git add remotion-formicanera/src/
git commit -m "feat(video): final Formicanera marketing video - The Winning Agent"
```

---

## Note per l'Esecutore

### Voiceover Offset — Calibrazione Manuale
I valori `VOICEOVER_OFFSET_FRAMES` in `Act2Handshake` e `Act2HomeCouch` sono stima iniziale. **Dopo aver generato il voiceover reale**, ascoltare il file e annotare i secondi esatti dove inizia la seconda e terza frase. Moltiplicare per 30 per ottenere i frame.

### Stock Footage — Criteri di Selezione
Per ogni clip Pexels preferire:
- Soggetto maschile, 35–50 anni, aspetto professionale
- Abbigliamento: completo scuro (navy o grigio), cravatta
- Sfondo coerente con l'ambiente (ufficio, auto, studio)
- Qualità minima: 1920×1080

### Scena 5 — Phone Mockup Notifica
Il `PhoneMockup` della scena 5 usa `commissions.mp4` come placeholder. Idealmente mostrerebbe uno screenshot animato della notifica PWA. Se disponibile, creare uno screen recording di 10s della schermata notifiche della PWA e salvarlo come `public/videos/notification-screen.mp4`.
