# Formicanera Commercial v2 — Piano 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire lib/ e creare tutti i componenti riutilizzabili del video Remotion v2.

**Architecture:** Foundation-first: lib tokens → display components → animation components → complex components. Ogni componente è autonomo, typed, con props esplicite. Nessun componente accede a `useCurrentFrame()` direttamente tranne quelli animati.

**Spec completa:** `docs/superpowers/specs/2026-03-31-formicanera-commercial-v2-design.md`

**Tech Stack:** Remotion 4, React 19, TypeScript strict, Inter font via @remotion/google-fonts

**Working dir:** `docs/commerciale/video/`

---

### Task 1: Aggiorna lib/palette.ts

**Files:**
- Modify: `src/lib/palette.ts`

- [ ] **Step 1: Sostituisci il contenuto completo**

```typescript
// src/lib/palette.ts
export const palette = {
  // Backgrounds
  bg:              '#F2F2F7',
  bgDark:          '#1C1C1E',
  bgCard:          '#FFFFFF',
  bgCardDark:      '#2C2C2E',

  // Apple System Colors
  blue:            '#007AFF',
  green:           '#34C759',
  orange:          '#FF9500',
  red:             '#FF3B30',
  purple:          '#5856D6',
  yellow:          '#FFCC00',
  teal:            '#5AC8FA',

  // Text
  textPrimary:     '#1C1C1E',
  textSecondary:   '#3A3A3C',
  textMuted:       '#8E8E93',
  textWhite:       '#FFFFFF',
  textWhiteDim:    'rgba(255,255,255,0.60)',
  textWhiteFaint:  'rgba(255,255,255,0.35)',

  // Separators
  divider:         '#E5E5EA',
  dividerDark:     'rgba(255,255,255,0.12)',

  // Legacy aliases (backward compat con scene esistenti)
  card:            '#FFFFFF',
  darkBg:          '#1C1C1E',
} as const;

export type PaletteKey = keyof typeof palette;
```

- [ ] **Step 2: Commit**
```bash
cd docs/commerciale/video
git add src/lib/palette.ts
git commit -m "feat(video): aggiorna palette con design tokens Apple Light HIG completi"
```

---

### Task 2: Aggiorna lib/springs.ts

**Files:**
- Modify: `src/lib/springs.ts`

- [ ] **Step 1: Sostituisci il contenuto completo**

```typescript
// src/lib/springs.ts
import type { SpringConfig } from 'remotion';
import { Easing } from 'remotion';

/** Bounce morbido — loghi, badge, pill, hero elements */
export const springBounce: SpringConfig = {
  mass: 0.8,
  damping: 18,
  stiffness: 120,
  overshootClamping: false,
};

/** Entry decisa — cards che entrano in scena */
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

/** Elementi grandi — entrata gentile e pesante */
export const springGentle: SpringConfig = {
  mass: 1.2,
  damping: 20,
  stiffness: 80,
  overshootClamping: false,
};

/** Micro-interazioni — checkmark, dot, snap veloci */
export const springSnap: SpringConfig = {
  mass: 0.6,
  damping: 14,
  stiffness: 200,
  overshootClamping: false,
};

/** Easing Apple standard ease-out */
export const easingApple = Easing.bezier(0.25, 0.1, 0.25, 1);

/** Easing Apple fast-out (per uscite) */
export const easingAppleOut = Easing.bezier(0.0, 0.0, 0.2, 1);
```

- [ ] **Step 2: Commit**
```bash
git add src/lib/springs.ts
git commit -m "feat(video): aggiorna spring configs (5 preset + easing Apple)"
```

---

### Task 3: Sostituisci lib/timing.ts

**Files:**
- Modify: `src/lib/timing.ts`

- [ ] **Step 1: Sostituisci il contenuto completo**

```typescript
// src/lib/timing.ts
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Durata in frame per ogni scena (usata da Series.Sequence) */
export const SCENE_FRAMES = {
  logo:          120,   // 4s
  problem:       420,   // 14s
  solution:      150,   // 5s
  orders:        540,   // 18s
  iva:           480,   // 16s
  pending:       480,   // 16s
  storico:       600,   // 20s
  clients:       540,   // 18s
  warehouse:     420,   // 14s
  quotes:        420,   // 14s
  dashboard:     480,   // 16s
  documents:     480,   // 16s
  integrations:  540,   // 18s
  notifications: 420,   // 14s
  closing:       300,   // 10s
} as const;

export const TOTAL_FRAMES = Object.values(SCENE_FRAMES).reduce((a, b) => a + b, 0);
// = 6390 frame = ~213s = ~3:33

/** Frame di crossfade tra scene */
export const TRANSITION = 15;

// Legacy: mantieni SCENE_DURATION per compatibilità con scene vecchie durante migrazione
export const SCENE_DURATION = SCENE_FRAMES;
```

- [ ] **Step 2: Commit**
```bash
git add src/lib/timing.ts
git commit -m "feat(video): timing v2 — 15 scene, ~213s totali, TOTAL_FRAMES calcolato"
```

---

### Task 4: Aggiorna FrostedCard + crea DarkCard

**Files:**
- Modify: `src/components/FrostedCard.tsx`
- Create: `src/components/DarkCard.tsx`

- [ ] **Step 1: Aggiorna FrostedCard con shadow più ricca e 3D tilt migliorato**

```typescript
// src/components/FrostedCard.tsx
import type { ReactNode } from 'react';
import { useCurrentFrame, spring, useVideoConfig, interpolate } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  children: ReactNode;
  delay?: number;
  rotateY?: number;
  rotateX?: number;
  width?: number | string;
  padding?: number;
  fromX?: number;   // translateX di partenza (default 0)
  fromY?: number;   // translateY di partenza (default 40)
  style?: React.CSSProperties;
};

export function FrostedCard({
  children,
  delay = 0,
  rotateY = 0,
  rotateX = 0,
  width = 340,
  padding = 28,
  fromX = 0,
  fromY = 40,
  style = {},
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springCard,
    from: 0,
    to: 1,
  });

  return (
    <div
      style={{
        background: palette.bgCard,
        borderRadius: 24,
        padding,
        width,
        boxShadow: `0 4px 24px rgba(0,0,0,0.08), 0 16px 56px rgba(0,0,0,0.10)`,
        transform: `
          perspective(1200px)
          rotateY(${rotateY}deg)
          rotateX(${rotateX}deg)
          scale(${0.85 + progress * 0.15})
          translateX(${fromX * (1 - progress)}px)
          translateY(${fromY * (1 - progress)}px)
        `,
        opacity: progress,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Crea DarkCard**

```typescript
// src/components/DarkCard.tsx
import type { ReactNode } from 'react';
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  children: ReactNode;
  delay?: number;
  width?: number | string;
  padding?: number;
  fromX?: number;
  fromY?: number;
  accentColor?: string;
};

export function DarkCard({
  children,
  delay = 0,
  width = 300,
  padding = 28,
  fromX = 0,
  fromY = 0,
  accentColor,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springCard,
    from: 0,
    to: 1,
  });

  return (
    <div
      style={{
        background: palette.bgDark,
        borderRadius: 24,
        padding,
        width,
        boxShadow: `0 8px 40px rgba(0,0,0,0.40)`,
        borderTop: accentColor ? `2px solid ${accentColor}` : undefined,
        transform: `
          scale(${0.85 + progress * 0.15})
          translateX(${fromX * (1 - progress)}px)
          translateY(${fromY * (1 - progress)}px)
        `,
        opacity: progress,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Commit**
```bash
git add src/components/FrostedCard.tsx src/components/DarkCard.tsx
git commit -m "feat(video): FrostedCard aggiornata (fromX/Y props), DarkCard nuova"
```

---

### Task 5: Crea StatPill + BadgeGreen

**Files:**
- Create: `src/components/StatPill.tsx`
- Create: `src/components/BadgeGreen.tsx`

- [ ] **Step 1: Crea StatPill**

```typescript
// src/components/StatPill.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  label: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  delay?: number;
};

const SIZE = {
  sm: { fontSize: 22, padding: '8px 22px', borderRadius: 30 },
  md: { fontSize: 36, padding: '10px 30px', borderRadius: 40 },
  lg: { fontSize: 52, padding: '14px 40px', borderRadius: 50 },
};

export function StatPill({ label, color = palette.blue, size = 'lg', delay = 0 }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springBounce,
    from: 0,
    to: 1,
  });

  const { fontSize, padding, borderRadius } = SIZE[size];

  return (
    <div
      style={{
        background: color,
        color: '#fff',
        borderRadius,
        padding,
        fontSize,
        fontWeight: 900,
        fontFamily: 'Inter, sans-serif',
        letterSpacing: -0.5,
        transform: `scale(${progress})`,
        opacity: progress,
        display: 'inline-block',
        boxShadow: `0 8px 32px ${color}50`,
      }}
    >
      {label}
    </div>
  );
}
```

- [ ] **Step 2: Crea BadgeGreen**

```typescript
// src/components/BadgeGreen.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  label: string;
  delay?: number;
  color?: string;
  size?: 'sm' | 'md';
};

export function BadgeGreen({ label, delay = 0, color = palette.green, size = 'md' }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springBounce,
    from: 0,
    to: 1,
  });

  const fontSize = size === 'sm' ? 16 : 20;
  const padding = size === 'sm' ? '5px 14px' : '8px 20px';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: `${color}20`,
        border: `1.5px solid ${color}60`,
        borderRadius: 40,
        padding,
        fontSize,
        fontWeight: 700,
        color,
        fontFamily: 'Inter, sans-serif',
        transform: `scale(${progress})`,
        opacity: progress,
        boxShadow: progress > 0.5 ? `0 4px 16px ${color}30` : 'none',
      }}
    >
      ✓ {label}
    </div>
  );
}
```

- [ ] **Step 3: Commit**
```bash
git add src/components/StatPill.tsx src/components/BadgeGreen.tsx
git commit -m "feat(video): StatPill e BadgeGreen con spring bounce Apple style"
```

---

### Task 6: Aggiorna AnimatedNumber + crea ProgressBar

**Files:**
- Modify: `src/components/AnimatedNumber.tsx`
- Create: `src/components/ProgressBar.tsx`

- [ ] **Step 1: Aggiorna AnimatedNumber — aggiunge pulse on update + formato europeo**

```typescript
// src/components/AnimatedNumber.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { easingApple, springSnap } from '../lib/springs';

type Props = {
  from?: number;
  to: number;
  delay?: number;
  durationInFrames?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  euroFormat?: boolean;  // separa migliaia con punto, decimali con virgola
  pulse?: boolean;       // scala leggermente al completamento
  fontSize?: number;
  fontWeight?: number;
  color?: string;
};

export function AnimatedNumber({
  from = 0,
  to,
  delay = 0,
  durationInFrames = 60,
  prefix = '',
  suffix = '',
  decimals = 0,
  euroFormat = false,
  pulse = false,
  fontSize = 40,
  fontWeight = 900,
  color = 'inherit',
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const value = interpolate(
    frame - delay,
    [0, durationInFrames],
    [from, to],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: easingApple,
    }
  );

  const pulseProgress = pulse
    ? spring({
        frame: Math.max(0, frame - delay - durationInFrames),
        fps,
        config: springSnap,
        from: 0,
        to: 1,
      })
    : 1;

  const pulseScale = pulse
    ? 1 + Math.sin(pulseProgress * Math.PI) * 0.04
    : 1;

  const formatted = euroFormat
    ? value
        .toFixed(decimals)
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
        .replace('.', '§') // placeholder
        .replace(/\./g, '.')
        .replace('§', ',')
    : value.toFixed(decimals);

  return (
    <span
      style={{
        fontSize,
        fontWeight,
        fontFamily: 'Inter, sans-serif',
        color,
        display: 'inline-block',
        transform: `scale(${pulseScale})`,
      }}
    >
      {prefix}{formatted}{suffix}
    </span>
  );
}
```

- [ ] **Step 2: Crea ProgressBar**

```typescript
// src/components/ProgressBar.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { easingApple, springCard } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  progress: number;        // 0–1, valore target
  delay?: number;
  durationInFrames?: number;
  color?: string;
  height?: number;
  borderRadius?: number;
  bgColor?: string;
  label?: string;
  showPercent?: boolean;
  animate?: boolean;       // se false, usa progress direttamente
};

export function ProgressBar({
  progress,
  delay = 0,
  durationInFrames = 60,
  color = palette.blue,
  height = 8,
  borderRadius = 100,
  bgColor = palette.divider,
  label,
  showPercent = false,
  animate = true,
}: Props) {
  const frame = useCurrentFrame();

  const animated = animate
    ? interpolate(frame - delay, [0, durationInFrames], [0, progress], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: easingApple,
      })
    : progress;

  const percent = Math.round(animated * 100);

  return (
    <div style={{ width: '100%' }}>
      {(label || showPercent) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 6,
            fontFamily: 'Inter, sans-serif',
            fontSize: 14,
            fontWeight: 600,
            color: palette.textMuted,
          }}
        >
          {label && <span>{label}</span>}
          {showPercent && <span style={{ color }}>{percent}%</span>}
        </div>
      )}
      <div
        style={{
          width: '100%',
          height,
          background: bgColor,
          borderRadius,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${animated * 100}%`,
            height: '100%',
            background: color,
            borderRadius,
            boxShadow: `0 0 8px ${color}60`,
            transition: 'none',
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**
```bash
git add src/components/AnimatedNumber.tsx src/components/ProgressBar.tsx
git commit -m "feat(video): AnimatedNumber v2 (euroFormat, pulse), ProgressBar nuova"
```

---

### Task 7: Aggiorna BotTimeline + crea SearchBar

**Files:**
- Modify: `src/components/BotTimeline.tsx`
- Create: `src/components/SearchBar.tsx`

- [ ] **Step 1: Riscrivi BotTimeline con linea di connessione animata e dot colorati**

```typescript
// src/components/BotTimeline.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springSnap, springBounce } from '../lib/springs';
import { palette } from '../lib/palette';

type Step = {
  label: string;
  doneAtFrame: number;   // frame assoluto in cui il dot diventa verde
  activeAtFrame: number; // frame assoluto in cui inizia a pulsare
};

type Props = {
  steps: Step[];
  delay?: number;
};

export function BotTimeline({ steps, delay = 0 }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lineProgress = interpolate(
    frame - delay,
    [0, steps[steps.length - 1].doneAtFrame + 30],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {steps.map((step, i) => {
        const isDone = frame >= step.doneAtFrame + delay;
        const isActive = frame >= step.activeAtFrame + delay && !isDone;

        const dotColor = isDone
          ? palette.green
          : isActive
          ? palette.blue
          : palette.textMuted;

        const dotProgress = spring({
          frame: Math.max(0, frame - delay - step.activeAtFrame),
          fps,
          config: springSnap,
          from: 0,
          to: 1,
        });

        // Pulse per il dot attivo
        const pulseFactor = isActive
          ? 1 + Math.sin((frame / 8) * Math.PI) * 0.15
          : 1;

        const labelProgress = interpolate(
          frame - delay - step.activeAtFrame,
          [0, 20],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        return (
          <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 16 }}>
            {/* Dot + line column */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: dotColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  color: '#fff',
                  fontWeight: 700,
                  transform: `scale(${dotProgress > 0.1 ? pulseFactor : dotProgress})`,
                  boxShadow: isDone ? `0 0 12px ${palette.green}60` : isActive ? `0 0 12px ${palette.blue}80` : 'none',
                  flexShrink: 0,
                  transition: 'background 0.3s',
                }}
              >
                {isDone ? '✓' : ''}
              </div>
              {i < steps.length - 1 && (
                <div
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: 24,
                    background: palette.dividerDark,
                    marginTop: 4,
                    marginBottom: 4,
                    borderRadius: 2,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      background: isDone ? palette.green : palette.blue,
                      height: isDone ? '100%' : `${lineProgress * 100}%`,
                      transition: 'none',
                      borderRadius: 2,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Label */}
            <div
              style={{
                paddingTop: 3,
                paddingBottom: i < steps.length - 1 ? 24 : 0,
                opacity: labelProgress,
                transform: `translateX(${(1 - labelProgress) * 10}px)`,
              }}
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: isDone ? palette.textWhite : isActive ? palette.textWhiteDim : palette.textWhiteFaint,
                  fontFamily: 'Inter, sans-serif',
                  lineHeight: 1.3,
                }}
              >
                {step.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Crea SearchBar con typing effect e risultati live**

```typescript
// src/components/SearchBar.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springText } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  query: string;         // testo finale della query
  typingStartFrame: number;
  framesPerChar?: number; // frame per carattere (default 6)
  delay?: number;        // delay entrata del componente
  resultCount?: number;
  resultLabel?: string;
};

export function SearchBar({
  query,
  typingStartFrame,
  framesPerChar = 6,
  delay = 0,
  resultCount,
  resultLabel,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springCard,
    from: 0,
    to: 1,
  });

  const charsVisible = Math.floor(
    Math.max(0, (frame - typingStartFrame) / framesPerChar)
  );
  const displayText = query.slice(0, charsVisible);
  const showCursor = charsVisible < query.length;

  const showResults = resultCount !== undefined && charsVisible >= query.length;
  const resultsOpacity = interpolate(
    frame - typingStartFrame - query.length * framesPerChar,
    [0, 20],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        width: '100%',
        opacity: entryProgress,
        transform: `translateY(${(1 - entryProgress) * 20}px) scale(${0.95 + entryProgress * 0.05})`,
      }}
    >
      {/* Search input */}
      <div
        style={{
          background: palette.bgCard,
          borderRadius: 16,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
          border: `1.5px solid ${palette.blue}40`,
        }}
      >
        <span style={{ fontSize: 22, opacity: 0.5 }}>🔍</span>
        <span
          style={{
            fontSize: 20,
            fontFamily: 'Inter, sans-serif',
            color: palette.textPrimary,
            fontWeight: 500,
            flex: 1,
          }}
        >
          {displayText}
          {showCursor && (
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: '1em',
                background: palette.blue,
                marginLeft: 2,
                verticalAlign: 'middle',
                opacity: Math.sin((frame / 15) * Math.PI) > 0 ? 1 : 0,
              }}
            />
          )}
        </span>
        {showResults && (
          <span
            style={{
              fontSize: 14,
              color: palette.textMuted,
              opacity: resultsOpacity,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {resultCount} risultati
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**
```bash
git add src/components/BotTimeline.tsx src/components/SearchBar.tsx
git commit -m "feat(video): BotTimeline v2 (linea animata, dot pulse), SearchBar con typing"
```

---

### Task 8: Aggiorna NotifCard + MetricCard + crea IntegrationHub

**Files:**
- Modify: `src/components/NotifCard.tsx`
- Modify: `src/components/MetricCard.tsx`
- Create: `src/components/IntegrationHub.tsx`

- [ ] **Step 1: Riscrivi NotifCard**

```typescript
// src/components/NotifCard.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  icon: string;
  title: string;
  body: string;
  time: string;
  accentColor: string;
  delay?: number;
  stackOffset?: number;  // offset Y aggiuntivo per effetto stack
  highlight?: boolean;   // lampeggio speciale
};

export function NotifCard({
  icon,
  title,
  body,
  time,
  accentColor,
  delay = 0,
  stackOffset = 0,
  highlight = false,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springCard,
    from: 0,
    to: 1,
  });

  // Highlight pulse: lampeggia 3x dopo l'entrata
  const highlightDelay = delay + 40;
  const highlightCycle = Math.max(0, frame - highlightDelay);
  const pulseOpacity = highlight && highlightCycle < 90
    ? 0.08 + Math.sin((highlightCycle / 10) * Math.PI) * 0.08
    : 0;

  return (
    <div
      style={{
        background: palette.bgCard,
        borderRadius: 16,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        boxShadow: `0 4px 20px rgba(0,0,0,0.07)`,
        borderLeft: `4px solid ${accentColor}`,
        opacity: progress,
        transform: `
          translateY(${(1 - progress) * -40 + stackOffset}px)
          scale(${0.95 + progress * 0.05})
        `,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Highlight overlay */}
      {highlight && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: accentColor,
            opacity: pulseOpacity,
            pointerEvents: 'none',
          }}
        />
      )}

      <span style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: palette.textPrimary,
            fontFamily: 'Inter, sans-serif',
            marginBottom: 3,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 14,
            color: palette.textSecondary,
            fontFamily: 'Inter, sans-serif',
            lineHeight: 1.4,
          }}
        >
          {body}
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: palette.textMuted,
          fontFamily: 'Inter, sans-serif',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {time}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Riscrivi MetricCard (light, non dark)**

```typescript
// src/components/MetricCard.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';
import type { ReactNode } from 'react';

type Props = {
  icon: string;
  label: string;
  children: ReactNode;  // valore (di solito AnimatedNumber)
  color?: string;
  delay?: number;
};

export function MetricCard({ icon, label, children, color = palette.blue, delay = 0 }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springCard,
    from: 0,
    to: 1,
  });

  return (
    <div
      style={{
        background: palette.bgCard,
        borderRadius: 20,
        padding: '24px 20px',
        boxShadow: `0 4px 24px rgba(0,0,0,0.08)`,
        borderTop: `3px solid ${color}`,
        opacity: progress,
        transform: `
          translateY(${(1 - progress) * 30}px)
          scale(${0.90 + progress * 0.10})
        `,
      }}
    >
      <div
        style={{
          fontSize: 28,
          marginBottom: 8,
        }}
      >
        {icon}
      </div>
      <div style={{ marginBottom: 4 }}>{children}</div>
      <div
        style={{
          fontSize: 14,
          color: palette.textMuted,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 500,
          lineHeight: 1.3,
        }}
      >
        {label}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Crea IntegrationHub**

```typescript
// src/components/IntegrationHub.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springBounce, springCard } from '../lib/springs';
import { palette } from '../lib/palette';

type Integration = {
  name: string;
  icon: string;
  color: string;
  x: number;   // posizione relativa al centro (px)
  y: number;
};

type Props = {
  integrations: Integration[];
  centerIcon: string;
  delay?: number;
  spotlightIndex?: number | null;  // quale integrazione fare spotlight
};

export function IntegrationHub({ integrations, centerIcon, delay = 0, spotlightIndex = null }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const centerProgress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springBounce,
    from: 0,
    to: 1,
  });

  return (
    <div style={{ position: 'relative', width: 480, height: 480 }}>
      {/* Centro */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${centerProgress})`,
          opacity: centerProgress,
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: palette.bgCard,
            boxShadow: `0 8px 32px rgba(0,122,255,0.30), 0 0 0 2px ${palette.blue}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 36,
          }}
        >
          {centerIcon}
        </div>
      </div>

      {/* Linee + Loghi */}
      {integrations.map((integ, i) => {
        const logoDelay = delay + 20 + i * 20;
        const logoProgress = spring({
          frame: Math.max(0, frame - logoDelay),
          fps,
          config: springBounce,
          from: 0,
          to: 1,
        });

        const lineProgress = interpolate(
          frame - logoDelay - 10,
          [0, 30],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        const isSpotlight = spotlightIndex === i;
        const othersDimmed = spotlightIndex !== null && !isSpotlight;

        // Particella che scorre sulla linea
        const particleOffset = ((frame - logoDelay) % 30) / 30;

        const cx = 240; // centro del div
        const cy = 240;
        const lx = cx + integ.x;
        const ly = cy + integ.y;

        return (
          <div key={i}>
            {/* SVG line */}
            <svg
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              width="480"
              height="480"
            >
              <line
                x1={cx}
                y1={cy}
                x2={cx + integ.x * lineProgress}
                y2={cy + integ.y * lineProgress}
                stroke={integ.color}
                strokeWidth={2}
                strokeOpacity={othersDimmed ? 0.15 : 0.4}
                strokeDasharray="6 4"
              />
              {/* Particella */}
              {lineProgress > 0.8 && (
                <circle
                  cx={cx + integ.x * particleOffset}
                  cy={cy + integ.y * particleOffset}
                  r={4}
                  fill={integ.color}
                  opacity={othersDimmed ? 0.2 : 0.8}
                />
              )}
            </svg>

            {/* Logo */}
            <div
              style={{
                position: 'absolute',
                left: cx + integ.x - 32,
                top: cy + integ.y - 32,
                transform: `scale(${logoProgress * (isSpotlight ? 1.15 : 1)})`,
                opacity: logoProgress * (othersDimmed ? 0.3 : 1),
                transition: 'opacity 0.3s',
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  background: palette.bgCard,
                  boxShadow: isSpotlight
                    ? `0 8px 32px ${integ.color}50, 0 0 0 2px ${integ.color}`
                    : `0 4px 16px rgba(0,0,0,0.12)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                }}
              >
                {integ.icon}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Commit**
```bash
git add src/components/NotifCard.tsx src/components/MetricCard.tsx src/components/IntegrationHub.tsx
git commit -m "feat(video): NotifCard v2 (highlight pulse), MetricCard light, IntegrationHub"
```

---

### Task 9: Verifica compilazione foundation

**Files:** tutti i file src/lib/ e src/components/

- [ ] **Step 1: Avvia Remotion studio per verifica TypeScript**
```bash
cd docs/commerciale/video
npm run start
```
Atteso: studio si avvia senza errori TypeScript nella console. Se ci sono errori di tipo, risolvili prima di procedere.

- [ ] **Step 2: Commit finale foundation**
```bash
git add -A
git commit -m "feat(video): foundation v2 completa — lib + 10 componenti Apple style"
```

---

**Fine Piano 1.** Proseguire con `2026-03-31-commercial-v2-p2-scenes-0-7.md`.
