# Formicanera Demo Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare un video marketing MP4 di ~75 secondi per il CEO di Komet Italia usando Remotion 4 + React, stile Apple Animation Guide (NaughtyyJuan), con palette ufficiale Apple Style e logo Formicanera.

**Architecture:** Progetto Remotion standalone in `docs/commerciale/video/`. 9 scene React indipendenti composte in sequenza tramite `<Series>`. Componenti UI riutilizzabili che simulano l'app reale. Spring physics per tutte le animazioni.

**Tech Stack:** Remotion 4, React 19, TypeScript, Inter font (Google Fonts), `@remotion/google-fonts`

---

## File Structure

```
docs/commerciale/video/
├── src/
│   ├── Root.tsx                  # Registra la composition Remotion
│   ├── Video.tsx                 # <Series> con tutte e 9 le scene
│   ├── scenes/
│   │   ├── LogoIntro.tsx         # Scena 0 — Logo spring drop (90f)
│   │   ├── Problem.tsx           # Scena 1 — 3 righe problema su sfondo scuro (240f)
│   │   ├── Solution.tsx          # Scena 2 — "Poi arriva Formicanera." su blu (90f)
│   │   ├── Orders.tsx            # Scena 3 — Order card + bot status (300f)
│   │   ├── Dashboard.tsx         # Scena 4 — Metric cards + progress bar (300f)
│   │   ├── Customers.tsx         # Scena 5 — Wizard cliente frosted glass (240f)
│   │   ├── Bot.tsx               # Scena 6 — Timeline Archibald animated (240f)
│   │   ├── Notifications.tsx     # Scena 7 — Notif cards stagger (210f)
│   │   └── Closing.tsx           # Scena 8 — Logo + CTA hold (540f)
│   ├── components/
│   │   ├── AnimatedNumber.tsx    # Contatore numerico che sale con interpolate
│   │   ├── BotTimeline.tsx       # Timeline verticale con dots che si attivano
│   │   ├── FrostedCard.tsx       # Card bianca con ombra e 3D tilt
│   │   ├── MetricCard.tsx        # Metric card navy con valore e label
│   │   ├── NotifCard.tsx         # Notification card con border-left colorato
│   │   └── SpringText.tsx        # Testo che entra con spring slide-in
│   └── lib/
│       ├── palette.ts            # Costanti colori Apple Style palette
│       ├── springs.ts            # Spring config presets riutilizzabili
│       └── timing.ts             # Frame offset per ogni scena
├── public/
│   └── formicaneralogo.png       # Copiato da frontend/dist/
├── package.json
├── remotion.config.ts
└── tsconfig.json
```

---

## Task 1: Scaffold progetto Remotion

**Files:**
- Create: `docs/commerciale/video/package.json`
- Create: `docs/commerciale/video/remotion.config.ts`
- Create: `docs/commerciale/video/tsconfig.json`

- [ ] **Step 1: Crea la directory e inizializza il progetto**

```bash
mkdir -p /Users/hatholdir/Downloads/Archibald/docs/commerciale/video/src/scenes
mkdir -p /Users/hatholdir/Downloads/Archibald/docs/commerciale/video/src/components
mkdir -p /Users/hatholdir/Downloads/Archibald/docs/commerciale/video/src/lib
mkdir -p /Users/hatholdir/Downloads/Archibald/docs/commerciale/video/public
cd /Users/hatholdir/Downloads/Archibald/docs/commerciale/video
```

- [ ] **Step 2: Crea `package.json`**

```json
{
  "name": "formicanera-demo-video",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "npx remotion studio",
    "render": "npx remotion render src/Root.tsx FormicaneraDemoVideo out/formicanera-demo.mp4 --codec=h264 --crf=18"
  },
  "dependencies": {
    "@remotion/cli": "4.0.235",
    "@remotion/google-fonts": "4.0.235",
    "remotion": "4.0.235",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3: Crea `remotion.config.ts`**

```ts
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
```

- [ ] **Step 4: Crea `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Copia il logo**

```bash
cp /Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend/dist/formicaneralogo.png \
   /Users/hatholdir/Downloads/Archibald/docs/commerciale/video/public/formicaneralogo.png
```

- [ ] **Step 6: Installa dipendenze**

```bash
cd /Users/hatholdir/Downloads/Archibald/docs/commerciale/video
npm install
```

Expected output: `added N packages` senza errori.

- [ ] **Step 7: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add docs/commerciale/video/
git commit -m "feat(video): scaffold progetto Remotion"
```

---

## Task 2: Font Inter + entry point Remotion

**Files:**
- Create: `docs/commerciale/video/src/font.ts`

- [ ] **Step 1: Crea `font.ts`** — carica Inter via `@remotion/google-fonts`

```ts
import { loadFont } from '@remotion/google-fonts/Inter';

export const { fontFamily, waitUntilDone } = loadFont('normal', {
  weights: ['300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
});
```

- [ ] **Step 2: Importa il font in `Root.tsx`** (da aggiungere all'inizio del file, prima di qualsiasi export)

Aggiungere questa riga in cima a `Root.tsx`:
```ts
import './font';
```

Il font viene precaricato automaticamente da Remotion al momento del render.

- [ ] **Step 3: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add docs/commerciale/video/src/font.ts
git commit -m "feat(video): aggiungi caricamento font Inter via @remotion/google-fonts"
```

---

## Task 3: Librerie condivise (palette, spring, timing)

**Files:**
- Create: `docs/commerciale/video/src/lib/palette.ts`
- Create: `docs/commerciale/video/src/lib/springs.ts`
- Create: `docs/commerciale/video/src/lib/timing.ts`

- [ ] **Step 1: Crea `palette.ts`**

```ts
export const palette = {
  bg: '#F2F2F7',
  card: '#FFFFFF',
  textPrimary: '#1C1C1E',
  textSecondary: '#3A3A3C',
  textMuted: '#8E8E93',
  divider: '#E5E5EA',
  blue: '#007AFF',
  green: '#34C759',
  orange: '#FF9500',
  red: '#FF3B30',
  darkBg: '#1C1C1E',
} as const;
```

- [ ] **Step 2: Crea `springs.ts`**

```ts
import type { SpringConfig } from 'remotion';

/** Bounce morbido — per loghi e hero elements */
export const springBounce: SpringConfig = {
  mass: 0.8,
  damping: 18,
  stiffness: 120,
  overshootClamping: false,
};

/** Entry decisa — per cards che entrano in scena */
export const springCard: SpringConfig = {
  mass: 1,
  damping: 15,
  stiffness: 100,
  overshootClamping: false,
};

/** Testo preciso — slide-in senza rimbalzo */
export const springText: SpringConfig = {
  mass: 1,
  damping: 200,
  stiffness: 200,
  overshootClamping: true,
};
```

- [ ] **Step 3: Crea `timing.ts`**

```ts
/** Frame di inizio per ogni scena a 30fps */
export const SCENE_START = {
  logoIntro:     0,    // 0s
  problem:       90,   // 3s
  solution:      330,  // 11s
  orders:        420,  // 14s
  dashboard:     720,  // 24s
  customers:     1020, // 34s
  bot:           1260, // 42s
  notifications: 1500, // 50s
  closing:       1710, // 57s
} as const;

/** Durata in frame per ogni scena */
export const SCENE_DURATION = {
  logoIntro:     90,
  problem:       240,
  solution:      90,
  orders:        300,
  dashboard:     300,
  customers:     240,
  bot:           240,
  notifications: 210,
  closing:       540,
} as const;

export const TOTAL_FRAMES = 2250; // 75s @ 30fps
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
```

- [ ] **Step 4: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add docs/commerciale/video/src/lib/
git commit -m "feat(video): aggiungi palette, spring config e timing condivisi"
```

---

## Task 4: Componenti UI riutilizzabili

**Files:**
- Create: `docs/commerciale/video/src/components/SpringText.tsx`
- Create: `docs/commerciale/video/src/components/FrostedCard.tsx`
- Create: `docs/commerciale/video/src/components/MetricCard.tsx`
- Create: `docs/commerciale/video/src/components/NotifCard.tsx`
- Create: `docs/commerciale/video/src/components/AnimatedNumber.tsx`
- Create: `docs/commerciale/video/src/components/BotTimeline.tsx`

- [ ] **Step 1: Crea `SpringText.tsx`** — testo che entra con slide + fade

```tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springText } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  children: React.ReactNode;
  delay?: number;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
};

export function SpringText({
  children,
  delay = 0,
  color = palette.textPrimary,
  fontSize = 48,
  fontWeight = 800,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: springText,
    from: 0,
    to: 1,
  });

  return (
    <div
      style={{
        color,
        fontSize,
        fontWeight,
        fontFamily: 'Inter, sans-serif',
        opacity: progress,
        transform: `translateX(${(1 - progress) * 40}px)`,
        lineHeight: 1.2,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Crea `FrostedCard.tsx`** — card bianca con tilt 3D e ombra

```tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';

type Props = {
  children: React.ReactNode;
  delay?: number;
  rotateY?: number;
  rotateX?: number;
  width?: number;
  padding?: number;
};

export function FrostedCard({
  children,
  delay = 0,
  rotateY = -8,
  rotateX = 3,
  width = 340,
  padding = 28,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: springCard,
    from: 0,
    to: 1,
  });

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 24,
        padding,
        width,
        boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
        transform: `
          perspective(1200px)
          rotateY(${rotateY}deg)
          rotateX(${rotateX}deg)
          scale(${progress})
          translateY(${(1 - progress) * 40}px)
        `,
        opacity: progress,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Crea `MetricCard.tsx`** — card navy con valore e label

```tsx
import { palette } from '../lib/palette';

type Props = {
  value: string;
  label: string;
  color?: string;
};

export function MetricCard({ value, label, color = palette.blue }: Props) {
  return (
    <div
      style={{
        background: palette.darkBg,
        borderRadius: 20,
        padding: '24px 20px',
        textAlign: 'center',
        flex: 1,
      }}
    >
      <div
        style={{
          fontSize: 52,
          fontWeight: 900,
          color,
          lineHeight: 1,
          marginBottom: 10,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 18,
          color: 'rgba(255,255,255,0.55)',
          letterSpacing: 1,
          lineHeight: 1.4,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {label}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Crea `NotifCard.tsx`** — notification card con border-left colorato

```tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  icon: string;
  text: string;
  time: string;
  accentColor: string;
  delay?: number;
};

export function NotifCard({ icon, text, time, accentColor, delay = 0 }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: springCard,
    from: 0,
    to: 1,
  });

  return (
    <div
      style={{
        background: palette.card,
        borderRadius: 20,
        padding: '18px 24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        borderLeft: `5px solid ${accentColor}`,
        opacity: progress,
        transform: `translateY(${(1 - progress) * -30}px)`,
      }}
    >
      <div style={{ fontSize: 36 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          {text}
        </div>
        <div style={{ fontSize: 18, color: palette.textMuted, marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
          {time}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Crea `AnimatedNumber.tsx`** — numero che conta da 0 al valore

```tsx
import { useCurrentFrame, interpolate, Easing } from 'remotion';

type Props = {
  from?: number;
  to: number;
  delay?: number;
  durationInFrames?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
};

export function AnimatedNumber({
  from = 0,
  to,
  delay = 0,
  durationInFrames = 60,
  prefix = '',
  suffix = '',
  decimals = 0,
}: Props) {
  const frame = useCurrentFrame();

  const value = interpolate(
    frame - delay,
    [0, durationInFrames],
    [from, to],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    }
  );

  return (
    <span>
      {prefix}{value.toFixed(decimals)}{suffix}
    </span>
  );
}
```

- [ ] **Step 6: Crea `BotTimeline.tsx`** — timeline verticale bot con dots animati

```tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';

type Step = { label: string; sub: string };

type Props = {
  steps: Step[];
  staggerFrames?: number;
  startFrame?: number;
};

export function BotTimeline({ steps, staggerFrames = 30, startFrame = 0 }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: 480 }}>
      {steps.map((step, i) => {
        const dotFrame = startFrame + i * staggerFrames;
        const isLast = i === steps.length - 1;
        const dotProgress = spring({ frame: frame - dotFrame, fps, config: springBounce, from: 0, to: 1 });
        const lineProgress = isLast ? 0 : interpolate(
          frame - dotFrame - 10,
          [0, staggerFrames - 10],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const isDone = frame > dotFrame + staggerFrames;
        const dotColor = isDone ? palette.green : palette.blue;

        return (
          <div key={i}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: dotColor,
                    boxShadow: `0 0 ${20 * dotProgress}px ${dotColor}`,
                    transform: `scale(${dotProgress})`,
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                />
                {!isLast && (
                  <div
                    style={{
                      width: 2,
                      height: 48,
                      background: 'rgba(255,255,255,0.15)',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: `${lineProgress * 100}%`,
                        background: palette.green,
                      }}
                    />
                  </div>
                )}
              </div>
              <div style={{ paddingBottom: isLast ? 0 : 28, opacity: dotProgress }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#FFFFFF', fontFamily: 'Inter, sans-serif' }}>
                  {step.label}
                </div>
                <div style={{ fontSize: 20, color: palette.textMuted, marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
                  {step.sub}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add docs/commerciale/video/src/components/
git commit -m "feat(video): aggiungi componenti UI riutilizzabili (SpringText, FrostedCard, MetricCard, NotifCard, AnimatedNumber, BotTimeline)"
```

---

## Task 5: Scene 0–2 (Logo Intro, Problema, Soluzione)

**Files:**
- Create: `docs/commerciale/video/src/scenes/LogoIntro.tsx`
- Create: `docs/commerciale/video/src/scenes/Problem.tsx`
- Create: `docs/commerciale/video/src/scenes/Solution.tsx`

- [ ] **Step 1: Crea `LogoIntro.tsx`**

```tsx
import { useCurrentFrame, spring, useVideoConfig, Img, staticFile, interpolate } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_DURATION } from '../lib/timing';

export function LogoIntro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.logoIntro;

  const logoProgress = spring({ frame, fps, config: springBounce, from: 0, to: 1 });
  const textOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tagOpacity = interpolate(frame, [35, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        opacity: fadeOut,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* glow radiale centrato */}
      <div
        style={{
          position: 'absolute',
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,122,255,0.08) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      <Img
        src={staticFile('formicaneralogo.png')}
        style={{
          width: 220,
          height: 220,
          objectFit: 'contain',
          transform: `scale(${logoProgress}) translateY(${(1 - logoProgress) * -60}px)`,
          filter: 'drop-shadow(0 16px 48px rgba(0,122,255,0.35))',
        }}
      />
      <div
        style={{
          fontSize: 72,
          fontWeight: 900,
          color: palette.textPrimary,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: -2,
          opacity: textOpacity,
        }}
      >
        Formicanera
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          color: palette.blue,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: 4,
          textTransform: 'uppercase',
          opacity: tagOpacity,
        }}
      >
        Il vantaggio competitivo
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crea `Problem.tsx`**

```tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springText } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_DURATION } from '../lib/timing';

const LINES = [
  '20 minuti per un ordine.',
  'Archibald solo da PC fisso.',
  'Nessuna visibilità in trasferta.',
];

export function Problem() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.problem;

  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOpacity = interpolate(frame, [130, 155], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.darkBg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '0 160px',
        gap: 32,
        opacity: Math.min(fadeIn, fadeOut),
      }}
    >
      {LINES.map((line, i) => {
        const delay = i * 40;
        const progress = spring({ frame: frame - delay, fps, config: springText, from: 0, to: 1 });
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: palette.red,
                flexShrink: 0,
                opacity: progress,
              }}
            />
            <div
              style={{
                fontSize: 56,
                fontWeight: 800,
                color: '#FFFFFF',
                fontFamily: 'Inter, sans-serif',
                opacity: progress,
                transform: `translateX(${(1 - progress) * 50}px)`,
                lineHeight: 1.2,
              }}
            >
              {line}
            </div>
          </div>
        );
      })}
      <div
        style={{
          fontSize: 26,
          color: palette.textSecondary,
          fontFamily: 'Inter, sans-serif',
          marginTop: 16,
          opacity: subOpacity,
        }}
      >
        — Il lavoro quotidiano dell'agente Komet
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Crea `Solution.tsx`**

```tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springBounce, springText } from '../lib/springs';
import { SCENE_DURATION } from '../lib/timing';

export function Solution() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.solution;

  const bgProgress = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const thenOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const heroProgress = spring({ frame: frame - 20, fps, config: springBounce, from: 0, to: 1 });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `linear-gradient(135deg, #007AFF ${bgProgress * 0}%, #007AFF 0%, #0055D4 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          fontSize: 40,
          fontWeight: 300,
          color: 'rgba(255,255,255,0.75)',
          fontFamily: 'Inter, sans-serif',
          opacity: thenOpacity,
          letterSpacing: 2,
        }}
      >
        Poi arriva
      </div>
      <div
        style={{
          fontSize: 96,
          fontWeight: 900,
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          transform: `scale(${heroProgress})`,
          opacity: heroProgress,
          letterSpacing: -3,
        }}
      >
        Formicanera.
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verifica che il progetto compili (senza errori TS)**

```bash
cd /Users/hatholdir/Downloads/Archibald/docs/commerciale/video
npx tsc --noEmit
```

Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add docs/commerciale/video/src/scenes/LogoIntro.tsx \
        docs/commerciale/video/src/scenes/Problem.tsx \
        docs/commerciale/video/src/scenes/Solution.tsx
git commit -m "feat(video): aggiungi scene 0-2 (LogoIntro, Problem, Solution)"
```

---

## Task 6: Scene 3–4 (Ordini, Dashboard)

**Files:**
- Create: `docs/commerciale/video/src/scenes/Orders.tsx`
- Create: `docs/commerciale/video/src/scenes/Dashboard.tsx`

- [ ] **Step 1: Crea `Orders.tsx`**

```tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springText } from '../lib/springs';
import { palette } from '../lib/palette';
import { FrostedCard } from '../components/FrostedCard';
import { SCENE_DURATION } from '../lib/timing';

export function Orders() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.orders;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const statProgress = spring({ frame: frame - 40, fps, config: springCard, from: 0, to: 1 });
  const botProgress = spring({ frame: frame - 60, fps, config: springCard, from: 0, to: 1 });
  const subOpacity = interpolate(frame, [70, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const botStep2Done = frame > 120;
  const botStep3Active = frame > 150;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 60,
        opacity: fadeOut,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Order card sinistra */}
      <FrostedCard delay={0} rotateY={-8} rotateX={3} width={340} padding={32}>
        <div style={{ fontSize: 16, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>
          Ordine #4821
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: palette.textPrimary, marginBottom: 8, fontFamily: 'Inter, sans-serif' }}>
          Studio Dr. Bianchi
        </div>
        <div style={{ fontSize: 48, fontWeight: 900, color: palette.blue, fontFamily: 'Inter, sans-serif' }}>
          € 1.240,00
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: `${palette.green}20`,
            borderRadius: 40,
            padding: '8px 20px',
            fontSize: 20,
            fontWeight: 700,
            color: palette.green,
            marginTop: 20,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          ✓ Inviato a Verona
        </div>
      </FrostedCard>

      {/* Stat centrale */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          opacity: statProgress,
          transform: `scale(${statProgress})`,
        }}
      >
        <div
          style={{
            background: palette.blue,
            color: '#fff',
            borderRadius: 40,
            padding: '14px 40px',
            fontSize: 48,
            fontWeight: 900,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          3 min
        </div>
        <div style={{ fontSize: 20, color: palette.textMuted, opacity: subOpacity, fontFamily: 'Inter, sans-serif' }}>
          vs 20 min con Archibald
        </div>
      </div>

      {/* Bot status card destra */}
      <div
        style={{
          background: palette.darkBg,
          borderRadius: 24,
          padding: 32,
          width: 300,
          opacity: botProgress,
          transform: `translateX(${(1 - botProgress) * 40}px)`,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 24, fontFamily: 'Inter, sans-serif' }}>
          Bot Archibald
        </div>
        {[
          { label: 'Login Archibald', done: true },
          { label: 'Inserimento dati', done: botStep2Done },
          { label: 'Conferma a Verona', done: false, active: botStep3Active },
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: step.done ? palette.green : step.active ? palette.blue : palette.textSecondary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              {step.done ? '✓' : ''}
            </div>
            <div style={{ fontSize: 22, color: '#FFFFFF', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
              {step.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crea `Dashboard.tsx`**

```tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, Easing } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { SCENE_DURATION } from '../lib/timing';

const METRICS: Array<{ to: number; prefix: string; suffix: string; decimals: number; label: string; color: string }> = [
  { to: 3200, prefix: '€ ', suffix: '', decimals: 0, label: 'Provvigioni\nmese corrente', color: palette.blue },
  { to: 67,   prefix: '', suffix: '%', decimals: 0, label: 'Avanzamento\ntarget annuo', color: palette.green },
  { to: 24,   prefix: '', suffix: '', decimals: 0, label: 'Ordini\noggi', color: palette.orange },
  { to: 186,  prefix: '', suffix: '', decimals: 0, label: 'Clienti\nattivi', color: '#FFFFFF' },
];

export function Dashboard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.dashboard;

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const progressBarWidth = interpolate(frame, [80, 160], [0, 67], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bg,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 120px',
        gap: 48,
        opacity: fadeOut,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700, color: palette.textPrimary, opacity: titleOpacity }}>
        📊 Provvigioni & Budget
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {METRICS.map((m, i) => {
          const cardProgress = spring({ frame: frame - i * 10, fps, config: springCard, from: 0, to: 1 });
          return (
            <div
              key={i}
              style={{
                flex: 1,
                background: palette.darkBg,
                borderRadius: 20,
                padding: '24px 20px',
                textAlign: 'center',
                transform: `scale(${cardProgress}) translateY(${(1 - cardProgress) * 30}px)`,
                opacity: cardProgress,
              }}
            >
              <div style={{ fontSize: 52, fontWeight: 900, color: m.color, lineHeight: 1, marginBottom: 10 }}>
                <AnimatedNumber
                  to={m.to}
                  prefix={m.prefix}
                  suffix={m.suffix}
                  decimals={m.decimals}
                  delay={i * 10}
                  durationInFrames={60}
                />
              </div>
              <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', letterSpacing: 1, lineHeight: 1.4 }}>
                {m.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div>
        <div style={{ background: palette.divider, borderRadius: 20, height: 12, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              borderRadius: 20,
              background: `linear-gradient(90deg, ${palette.blue}, ${palette.green})`,
              width: `${progressBarWidth}%`,
            }}
          />
        </div>
        <div style={{ fontSize: 22, color: palette.textMuted, marginTop: 12, textAlign: 'right' }}>
          € 67.400 / € 100.000 target annuo
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add docs/commerciale/video/src/scenes/Orders.tsx \
        docs/commerciale/video/src/scenes/Dashboard.tsx
git commit -m "feat(video): aggiungi scene 3-4 (Orders, Dashboard)"
```

---

## Task 7: Scene 5–7 (Clienti, Bot, Notifiche)

**Files:**
- Create: `docs/commerciale/video/src/scenes/Customers.tsx`
- Create: `docs/commerciale/video/src/scenes/Bot.tsx`
- Create: `docs/commerciale/video/src/scenes/Notifications.tsx`

- [ ] **Step 1: Crea `Customers.tsx`**

```tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springText } from '../lib/springs';
import { palette } from '../lib/palette';
import { FrostedCard } from '../components/FrostedCard';
import { SCENE_DURATION } from '../lib/timing';

const FIELDS = [
  { label: 'RAGIONE SOCIALE', value: 'Studio Dr. Bianchi' },
  { label: 'PARTITA IVA', value: '04821930652' },
  { label: 'INDIRIZZO', value: 'Via Roma 12, Napoli' },
];

export function Customers() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.customers;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const badgeProgress = spring({ frame: frame - 90, fps, config: springCard, from: 0, to: 1 });
  const label1Progress = spring({ frame: frame - 100, fps, config: springText, from: 0, to: 1 });
  const label2Progress = spring({ frame: frame - 120, fps, config: springText, from: 0, to: 1 });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 80,
        opacity: fadeOut,
      }}
    >
      <FrostedCard delay={0} rotateY={6} rotateX={-2} width={420} padding={40}>
        <div style={{ fontSize: 18, fontWeight: 700, color: palette.blue, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 24, fontFamily: 'Inter, sans-serif' }}>
          Passo 2 di 6 — Anagrafica
        </div>
        {FIELDS.map((f, i) => {
          const fieldOpacity = interpolate(frame, [i * 20, i * 20 + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div key={i} style={{ background: palette.bg, borderRadius: 12, padding: '12px 16px', marginBottom: 12, opacity: fieldOpacity }}>
              <div style={{ fontSize: 14, color: palette.textMuted, fontWeight: 700, letterSpacing: 1, fontFamily: 'Inter, sans-serif' }}>
                {f.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: palette.textPrimary, marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
                {f.value}
              </div>
            </div>
          );
        })}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: `${palette.green}20`,
            color: palette.green,
            borderRadius: 40,
            padding: '10px 24px',
            fontSize: 20,
            fontWeight: 700,
            marginTop: 16,
            transform: `scale(${badgeProgress})`,
            opacity: badgeProgress,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          ✓ P.IVA verificata
        </div>
      </FrostedCard>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: palette.divider, borderRadius: 12, padding: '14px 24px', fontSize: 22, fontWeight: 700, color: palette.textPrimary, opacity: label1Progress, transform: `translateX(${(1 - label1Progress) * 30}px)`, fontFamily: 'Inter, sans-serif' }}>
          28 campi gestiti
        </div>
        <div style={{ background: `${palette.blue}20`, borderRadius: 12, padding: '14px 24px', fontSize: 22, fontWeight: 700, color: palette.blue, opacity: label2Progress, transform: `translateX(${(1 - label2Progress) * 30}px)`, fontFamily: 'Inter, sans-serif' }}>
          🤖 Bot crea su Archibald
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crea `Bot.tsx`**

```tsx
import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../lib/palette';
import { BotTimeline } from '../components/BotTimeline';
import { SCENE_DURATION } from '../lib/timing';

const BOT_STEPS = [
  { label: 'Apertura Archibald', sub: 'Login completato' },
  { label: 'Inserimento ordine', sub: '24 articoli · € 1.240,00' },
  { label: 'Conferma a Verona', sub: 'In elaborazione...' },
];

export function Bot() {
  const frame = useCurrentFrame();
  const dur = SCENE_DURATION.bot;

  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.darkBg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
        opacity: Math.min(fadeIn, fadeOut),
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: palette.textMuted,
          letterSpacing: 4,
          textTransform: 'uppercase',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        Invio automatico in corso
      </div>
      <BotTimeline steps={BOT_STEPS} staggerFrames={40} startFrame={10} />
    </div>
  );
}
```

- [ ] **Step 3: Crea `Notifications.tsx`**

```tsx
import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../lib/palette';
import { NotifCard } from '../components/NotifCard';
import { SCENE_DURATION } from '../lib/timing';

const NOTIFS = [
  { icon: '✅', text: 'Ordine #4821 confermato su Archibald', time: 'Adesso', color: palette.green },
  { icon: '📄', text: 'DDT disponibile — Studio Dr. Bianchi', time: '2 minuti fa', color: palette.blue },
  { icon: '⚠️', text: 'Cliente inattivo da 7 mesi', time: 'Studio Esposito', color: palette.orange },
  { icon: '🚚', text: 'Spedizione in transito — Milano', time: 'FedEx Tracking', color: palette.blue },
];

export function Notifications() {
  const frame = useCurrentFrame();
  const dur = SCENE_DURATION.notifications;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: 760 }}>
        {NOTIFS.map((n, i) => (
          <NotifCard
            key={i}
            icon={n.icon}
            text={n.text}
            time={n.time}
            accentColor={n.color}
            delay={i * 15}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add docs/commerciale/video/src/scenes/Customers.tsx \
        docs/commerciale/video/src/scenes/Bot.tsx \
        docs/commerciale/video/src/scenes/Notifications.tsx
git commit -m "feat(video): aggiungi scene 5-7 (Customers, Bot, Notifications)"
```

---

## Task 8: Scena 8 — Closing + Root + Video compositor

**Files:**
- Create: `docs/commerciale/video/src/scenes/Closing.tsx`
- Create: `docs/commerciale/video/src/Video.tsx`
- Create: `docs/commerciale/video/src/Root.tsx`

- [ ] **Step 1: Crea `Closing.tsx`**

```tsx
import { useCurrentFrame, spring, interpolate, Img, staticFile, useVideoConfig } from 'remotion';
import { springBounce, springText } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_DURATION } from '../lib/timing';

export function Closing() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.closing;

  const logoProgress = spring({ frame, fps, config: springBounce, from: 0, to: 1 });
  const titleOpacity = interpolate(frame, [20, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOpacity = interpolate(frame, [35, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const btnProgress = spring({ frame: frame - 55, fps, config: springBounce, from: 0, to: 1 });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `linear-gradient(160deg, ${palette.bg} 0%, #FFFFFF 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* glow radiale basso */}
      <div
        style={{
          position: 'absolute',
          bottom: -200,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,122,255,0.07) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      <Img
        src={staticFile('formicaneralogo.png')}
        style={{
          width: 180,
          height: 180,
          objectFit: 'contain',
          transform: `scale(${logoProgress}) translateY(${(1 - logoProgress) * -50}px)`,
          filter: 'drop-shadow(0 12px 40px rgba(0,122,255,0.3))',
        }}
      />
      <div
        style={{
          fontSize: 80,
          fontWeight: 900,
          color: palette.textPrimary,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: -2,
          opacity: titleOpacity,
        }}
      >
        Formicanera
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 600,
          color: palette.blue,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: 4,
          textTransform: 'uppercase',
          opacity: subOpacity,
        }}
      >
        Il vantaggio competitivo · Komet Italia
      </div>
      <div
        style={{
          background: palette.blue,
          color: '#FFFFFF',
          borderRadius: 50,
          padding: '20px 60px',
          fontSize: 28,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
          transform: `scale(${btnProgress})`,
          opacity: btnProgress,
          marginTop: 8,
        }}
      >
        Richiedi una demo
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crea `Video.tsx`** — sequencer principale

```tsx
import { Series } from 'remotion';
import { SCENE_DURATION } from './lib/timing';
import { LogoIntro } from './scenes/LogoIntro';
import { Problem } from './scenes/Problem';
import { Solution } from './scenes/Solution';
import { Orders } from './scenes/Orders';
import { Dashboard } from './scenes/Dashboard';
import { Customers } from './scenes/Customers';
import { Bot } from './scenes/Bot';
import { Notifications } from './scenes/Notifications';
import { Closing } from './scenes/Closing';

export function FormicaneraDemoVideo() {
  return (
    <Series>
      <Series.Sequence durationInFrames={SCENE_DURATION.logoIntro}>
        <LogoIntro />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.problem}>
        <Problem />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.solution}>
        <Solution />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.orders}>
        <Orders />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.dashboard}>
        <Dashboard />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.customers}>
        <Customers />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.bot}>
        <Bot />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.notifications}>
        <Notifications />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.closing}>
        <Closing />
      </Series.Sequence>
    </Series>
  );
}
```

- [ ] **Step 3: Crea `Root.tsx`** — registra la composition

```tsx
import React from 'react';
import { Composition } from 'remotion';
import { FormicaneraDemoVideo } from './Video';
import { TOTAL_FRAMES, FPS, WIDTH, HEIGHT } from './lib/timing';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FormicaneraDemoVideo"
      component={FormicaneraDemoVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
```

- [ ] **Step 4: Verifica compilazione TypeScript**

```bash
cd /Users/hatholdir/Downloads/Archibald/docs/commerciale/video
npx tsc --noEmit
```

Expected: nessun errore.

- [ ] **Step 5: Avvia Remotion Studio per preview visiva**

```bash
cd /Users/hatholdir/Downloads/Archibald/docs/commerciale/video
npm run start
```

Expected: apre browser su `http://localhost:3000` con preview interattiva del video. Verifica che tutte e 9 le scene siano visibili nella timeline.

- [ ] **Step 6: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add docs/commerciale/video/src/
git commit -m "feat(video): aggiungi Closing, Video compositor e Root — video completo"
```

---

## Task 9: Render finale MP4

**Files:**
- Create: `docs/commerciale/video/out/formicanera-demo.mp4` (output)

- [ ] **Step 1: Crea directory output**

```bash
mkdir -p /Users/hatholdir/Downloads/Archibald/docs/commerciale/video/out
```

- [ ] **Step 2: Aggiungi `out/` al .gitignore del progetto video**

Crea `docs/commerciale/video/.gitignore`:
```
out/
node_modules/
```

- [ ] **Step 3: Render del video**

```bash
cd /Users/hatholdir/Downloads/Archibald/docs/commerciale/video
npm run render
```

Expected output finale:
```
✅ FormicaneraDemoVideo rendered in X seconds.
Output: out/formicanera-demo.mp4
```

- [ ] **Step 4: Verifica il file MP4**

```bash
ls -lh /Users/hatholdir/Downloads/Archibald/docs/commerciale/video/out/formicanera-demo.mp4
```

Expected: file esistente, dimensione tra 5MB e 50MB.

Apri il file con QuickTime per verifica visiva finale.

- [ ] **Step 5: Copia il video nella root commerciale**

```bash
cp /Users/hatholdir/Downloads/Archibald/docs/commerciale/video/out/formicanera-demo.mp4 \
   /Users/hatholdir/Downloads/Archibald/docs/commerciale/formicanera-demo-komet.mp4
```

- [ ] **Step 6: Commit finale**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add docs/commerciale/video/.gitignore
git commit -m "feat(video): aggiungi .gitignore video project"
```
