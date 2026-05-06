# Komet Germany Comparison Video — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produrre due video comparativi Remotion (Video 1: Order Creation, Video 2: New Customer + Order) per la valutazione Komet Germany, con split-screen ERP vs PWA, timer condiviso, callout annotati, voiceover ElevenLabs e scena "Two Workflows" di reframe narrativo.

**Architecture:** Nuova directory `src/scenes/comparison/` con 7 scene + 7 nuovi componenti in `src/components/`. Due composizioni `KometOrderComparison` e `KometCustomerComparison` registrate in `Root.tsx`. I video raw vengono preprocessati con ffmpeg in `public/komet-comparison/` prima del render Remotion.

**Tech Stack:** Remotion 4.0.235, React 19, TypeScript strict, `OffthreadVideo` per i video raw, ffmpeg 8.x per preprocessing, ElevenLabs API per voiceover, Inter via `@remotion/google-fonts`.

**Working directory:** `docs/commerciale/video/` (tutte le path relative si intendono da qui)

---

## Task 1: FFmpeg Preprocessing + Gitignore

**Files:**
- Create: `public/komet-comparison/` (directory)
- Modify: `public/.gitignore`

- [ ] **Step 1: Aggiorna il gitignore per permettere MP4**

Il `.gitignore` in `public/` attualmente ignora tutti i file non-immagine. Aggiungi un'eccezione per la directory di confronto.

```
# Allow images in this public directory
!*.png
!*.jpg
!*.jpeg
!*.gif
!*.svg
!*.ico
# Komet comparison videos (gitignored — troppo grandi, generati da ffmpeg)
komet-comparison/
```

- [ ] **Step 2: Converti tutti e 6 i video raw in h264 MP4**

```bash
VIDEO_DIR="/Users/hatholdir/Desktop/VIDEO GERM /CREAZIONE ORD"
PUBLIC_DIR="public/komet-comparison"
mkdir -p "$PUBLIC_DIR"

ffmpeg -i "$VIDEO_DIR/1 CREAZIONE ARCH.mov"        -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "$PUBLIC_DIR/1-erp-order.mp4"
ffmpeg -i "$VIDEO_DIR/2 CREAZIONE FORMICA.mov"     -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "$PUBLIC_DIR/2-pwa-order.mp4"
ffmpeg -i "$VIDEO_DIR/3 CLIENTE ARCH.mp4"          -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "$PUBLIC_DIR/3-erp-customer.mp4"
ffmpeg -i "$VIDEO_DIR/4 CLIENTE ARCH + ORD.mov"    -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "$PUBLIC_DIR/4-erp-customer-order.mp4"
ffmpeg -i "$VIDEO_DIR/5 CLIENTE FORMICA.mov"       -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "$PUBLIC_DIR/5-pwa-customer.mp4"
ffmpeg -i "$VIDEO_DIR/6 CLIENTE FORMICA + ORD.mov" -vcodec libx264 -crf 18 -acodec aac -vf scale=1280:720 "$PUBLIC_DIR/6-pwa-customer-order.mp4"
```

Output atteso: 6 file MP4 in `public/komet-comparison/`, ciascuno ~30-80 MB.

- [ ] **Step 3: Verifica durate convertite**

```bash
for f in public/komet-comparison/*.mp4; do
  echo "$(basename $f): $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$f" | awk '{printf "%.0fs", $1}')"
done
```

Atteso:
```
1-erp-order.mp4: 262s
2-pwa-order.mp4: 195s
3-erp-customer.mp4: 178s
4-erp-customer-order.mp4: 92s
5-pwa-customer.mp4: 122s
6-pwa-customer-order.mp4: 65s
```

- [ ] **Step 4: Commit**

```bash
git add public/.gitignore
git commit -m "feat(video): aggiorna gitignore, prepara directory komet-comparison"
```

---

## Task 2: Timing Constants

**Files:**
- Create: `src/lib/comparison-timing.ts`

- [ ] **Step 1: Crea il file dei timing constants**

```typescript
// src/lib/comparison-timing.ts
export const C = {
  FPS: 30,

  // ── VIDEO 1: Order Creation ──────────────────────────────────
  V1: {
    // Scena 0: Two Workflows
    WORKFLOWS_START:   0,
    WORKFLOWS_END:     360,   // 12s

    // Scena 1: Intro
    INTRO_START:       360,
    INTRO_END:         480,   // 4s

    // Scena 2: Context
    CONTEXT_START:     480,
    CONTEXT_END:       660,   // 6s

    // Scena 3: Split-Screen (ERP: 262s, PWA: 195s)
    SPLIT_START:       660,
    PWA_DONE:          6510,  // 660 + 195*30
    ERP_DONE:          8520,  // 660 + 262*30
    SPLIT_END:         8520,

    // Scena 4: Summary
    SUMMARY_START:     8520,
    SUMMARY_END:       8970,  // 15s

    TOTAL:             8970,

    // Callout frames (assoluti, dentro split-screen)
    CH1_FRAME:         1500,  // ~28s dopo SPLIT_START
    CH2_FRAME:         3000,  // ~78s
    CH3_FRAME:         4440,  // ~126s
    CH4_FRAME:         5850,  // ~173s
  },

  // ── VIDEO 2: New Customer + Order ───────────────────────────
  V2: {
    WORKFLOWS_START:   0,
    WORKFLOWS_END:     360,

    INTRO_START:       360,
    INTRO_END:         480,

    CONTEXT_START:     480,
    CONTEXT_END:       660,

    // Part A: Customer (ERP: 178s, PWA: 122s)
    CUST_SPLIT_START:  660,
    CUST_PWA_DONE:     4320,  // 660 + 122*30
    CUST_ERP_DONE:     5700,  // 660 + 178*30

    // Part B: Order (ERP: 92s, PWA: 65s)
    ORD_SPLIT_START:   5700,
    PWA_TOTAL_DONE:    8370,  // 5700 + 187*30  (187 = 122+65)
    ERP_TOTAL_DONE:    9510,  // 5700 + 270*30  (270 = 178+92) — clamped

    SUMMARY_START:     9510,
    SUMMARY_END:       10110, // 20s

    TOTAL:             10110,

    // Callout frames Part A
    DEVICE_FRAME:      1200,
    FORM_FRAME:        2700,
  },
} as const;
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Atteso: zero errori.

- [ ] **Step 3: Commit**

```bash
git add src/lib/comparison-timing.ts
git commit -m "feat(video): aggiungi comparison-timing constants per Komet videos"
```

---

## Task 3: Componente SplitDivider

**Files:**
- Create: `src/components/SplitDivider.tsx`

- [ ] **Step 1: Crea il componente**

```typescript
// src/components/SplitDivider.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Props = {
  leftLabel?: string;
  rightLabel?: string;
  delay?: number;
};

export function SplitDivider({
  leftLabel = 'Archibald ERP',
  rightLabel = 'Formicanera',
  delay = 0,
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
    <div style={{
      position: 'absolute',
      left: '50%',
      top: 0,
      bottom: 0,
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: 2,
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      {/* Linea verticale */}
      <div style={{
        width: 2,
        flex: 1,
        background: `linear-gradient(to bottom, transparent, ${palette.divider} 15%, ${palette.divider} 85%, transparent)`,
        opacity: progress,
      }} />

      {/* Label sinistra */}
      <div style={{
        position: 'absolute',
        top: 40,
        right: 16,
        fontSize: 13,
        fontWeight: 600,
        color: palette.textMuted,
        fontFamily,
        letterSpacing: 1,
        textTransform: 'uppercase',
        opacity: progress,
        whiteSpace: 'nowrap',
      }}>
        {leftLabel}
      </div>

      {/* Label destra */}
      <div style={{
        position: 'absolute',
        top: 40,
        left: 16,
        fontSize: 13,
        fontWeight: 700,
        color: palette.blue,
        fontFamily,
        letterSpacing: 1,
        textTransform: 'uppercase',
        opacity: progress,
        whiteSpace: 'nowrap',
      }}>
        {rightLabel}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SplitDivider.tsx
git commit -m "feat(video): aggiungi SplitDivider component"
```

---

## Task 4: Componente SharedTimer

**Files:**
- Create: `src/components/SharedTimer.tsx`

- [ ] **Step 1: Crea il componente**

```typescript
// src/components/SharedTimer.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springBounce, springSnap } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Props = {
  /** Frame assoluto in cui il timer inizia a contare */
  startFrame: number;
  /** Frame assoluto in cui il timer si ferma (undefined = non si ferma mai) */
  doneFrame?: number;
  /** Colore del bordo e del testo (default: palette.blue) */
  color?: string;
  /** Diametro in px del cerchio (default: 150) */
  size?: number;
  /** Label sotto il timer (es. "ERP", "Formicanera") */
  label?: string;
  delay?: number;
};

export function SharedTimer({
  startFrame,
  doneFrame,
  color = palette.blue,
  size = 150,
  label,
  delay = 0,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springBounce,
    from: 0,
    to: 1,
  });

  const isDone = doneFrame !== undefined && frame >= doneFrame;
  const elapsedFrames = isDone
    ? (doneFrame - startFrame)
    : Math.max(0, frame - startFrame);

  const totalSeconds = elapsedFrames / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Pulse animato quando "Done"
  const pulseScale = isDone
    ? interpolate(
        (frame - (doneFrame ?? 0)) % 60,
        [0, 10, 20],
        [1.05, 1, 1.05],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 1;

  const borderColor = isDone ? palette.green : color;
  const textColor = isDone ? palette.green : palette.textWhite;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      opacity: entryProgress,
      transform: `scale(${entryProgress * pulseScale})`,
    }}>
      <div style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: palette.bgDark,
        border: `3px solid ${borderColor}`,
        boxShadow: isDone ? `0 0 24px ${palette.green}50` : `0 0 16px ${color}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'border-color 0.3s',
      }}>
        <div style={{
          fontSize: size * 0.22,
          fontWeight: 900,
          color: textColor,
          fontFamily,
          letterSpacing: -1,
          lineHeight: 1,
        }}>
          {isDone ? '✓' : formatted}
        </div>
      </div>

      {isDone && (
        <div style={{
          fontSize: 18,
          fontWeight: 700,
          color: palette.green,
          fontFamily,
          letterSpacing: 0.5,
        }}>
          {formatted}
        </div>
      )}

      {label && (
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: palette.textMuted,
          fontFamily,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}>
          {label}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SharedTimer.tsx
git commit -m "feat(video): aggiungi SharedTimer component"
```

---

## Task 5: Componente TabletMockup

**Files:**
- Create: `src/components/TabletMockup.tsx`

- [ ] **Step 1: Crea il componente**

```typescript
// src/components/TabletMockup.tsx
import type { ReactNode } from 'react';
import { fontFamily } from '../font';
import { palette } from '../lib/palette';

type Props = {
  children: ReactNode;
  /** Larghezza totale del mockup incluso il frame (default: 900) */
  width?: number;
  /** Altezza totale del mockup incluso il frame (default: 680) */
  height?: number;
};

export function TabletMockup({ children, width = 900, height = 680 }: Props) {
  const FRAME = 20;       // spessore bordo
  const STATUS_H = 28;    // altezza barra status
  const RADIUS = 20;

  return (
    <div style={{
      width,
      height,
      borderRadius: RADIUS,
      background: '#2C2C2E',
      border: '3px solid #C7C7CC',
      boxShadow: '0 16px 48px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.20)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Status bar iOS */}
      <div style={{
        height: STATUS_H,
        background: '#1C1C1E',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#FFFFFF', fontFamily }}>9:41</span>
        <span style={{ fontSize: 11, color: '#FFFFFF', fontFamily, letterSpacing: 0.5 }}>
          ▲ WiFi ●●●● 🔋
        </span>
      </div>

      {/* Contenuto video */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        margin: `0 ${FRAME}px ${FRAME}px ${FRAME}px`,
        borderRadius: `0 0 ${RADIUS - 4}px ${RADIUS - 4}px`,
        background: '#000',
      }}>
        {children}
      </div>

      {/* Label sotto */}
    </div>
  );
}

/** Wrapper con label "Formicanera — Tablet · Mobile · Desktop" sotto il mockup */
export function TabletMockupWithLabel({ children, width = 900, height = 680 }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <TabletMockup width={width} height={height}>{children}</TabletMockup>
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: palette.blue,
        fontFamily,
        letterSpacing: 0.5,
      }}>
        Formicanera — Tablet · Mobile · Desktop
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TabletMockup.tsx
git commit -m "feat(video): aggiungi TabletMockup component"
```

---

## Task 6: Componente CalloutBubble

**Files:**
- Create: `src/components/CalloutBubble.tsx`

- [ ] **Step 1: Crea il componente**

```typescript
// src/components/CalloutBubble.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Props = {
  /** Testo del callout */
  label: string;
  /** Su quale pannello appare */
  side: 'left' | 'right';
  /** Colore accent (default: palette.orange per ERP, palette.green per PWA) */
  accentColor?: string;
  /** Frame assoluto in cui appare */
  showAtFrame: number;
  /** Frame assoluto in cui scompare (undefined = resta) */
  hideAtFrame?: number;
  /** Posizione verticale 0-1 (default: 0.5) */
  verticalPosition?: number;
};

export function CalloutBubble({
  label,
  side,
  accentColor,
  showAtFrame,
  hideAtFrame,
  verticalPosition = 0.5,
}: Props) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  const color = accentColor ?? (side === 'left' ? palette.orange : palette.green);

  const isVisible = frame >= showAtFrame && (hideAtFrame === undefined || frame < hideAtFrame);
  const relFrame = Math.max(0, frame - showAtFrame);

  const progress = spring({
    frame: relFrame,
    fps,
    config: springBounce,
    from: 0,
    to: 1,
  });

  if (!isVisible && relFrame === 0) return null;

  const opacity = isVisible ? progress : Math.max(0, 1 - (frame - (hideAtFrame ?? frame)) / 10);

  return (
    <div style={{
      position: 'absolute',
      top: height * verticalPosition,
      ...(side === 'left' ? { left: 20 } : { right: 20 }),
      transform: `translateY(-50%) scale(${0.85 + progress * 0.15})`,
      opacity,
      zIndex: 20,
      maxWidth: 340,
    }}>
      <div style={{
        background: palette.bgDark,
        borderLeft: side === 'left' ? `4px solid ${color}` : undefined,
        borderRight: side === 'right' ? `4px solid ${color}` : undefined,
        borderRadius: 12,
        padding: '12px 16px',
        boxShadow: `0 4px 20px rgba(0,0,0,0.30), 0 0 12px ${color}30`,
      }}>
        <div style={{
          fontSize: 16,
          fontWeight: 600,
          color: palette.textWhite,
          fontFamily,
          lineHeight: 1.4,
        }}>
          {label}
        </div>
        <div style={{
          width: 32,
          height: 3,
          borderRadius: 2,
          background: color,
          marginTop: 8,
        }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/CalloutBubble.tsx
git commit -m "feat(video): aggiungi CalloutBubble component"
```

---

## Task 7: Componenti ChapterBadge e InsightCard

**Files:**
- Create: `src/components/ChapterBadge.tsx`
- Create: `src/components/InsightCard.tsx`

- [ ] **Step 1: Crea ChapterBadge**

```typescript
// src/components/ChapterBadge.tsx
import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Props = {
  label: string;
  showAtFrame: number;
  hideAtFrame: number;
};

export function ChapterBadge({ label, showAtFrame, hideAtFrame }: Props) {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [showAtFrame, showAtFrame + 15, hideAtFrame - 10, hideAtFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  if (frame < showAtFrame || frame > hideAtFrame) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 30,
      opacity,
    }}>
      <div style={{
        background: 'rgba(28,28,30,0.85)',
        backdropFilter: 'blur(12px)',
        borderRadius: 50,
        padding: '14px 32px',
        border: `1px solid ${palette.dividerDark}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.30)',
      }}>
        <div style={{
          fontSize: 20,
          fontWeight: 700,
          color: palette.textWhite,
          fontFamily,
          letterSpacing: 0.5,
          whiteSpace: 'nowrap',
        }}>
          {label}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crea InsightCard**

```typescript
// src/components/InsightCard.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Props = {
  /** Frame assoluto in cui la card appare */
  showAtFrame: number;
};

const PENDING_ORDERS = [
  { customer: 'Rossi Mario',    total: '€ 1.247,00', delay: 0   },
  { customer: 'Bianchi Elena',  total: '€ 589,50',   delay: 40  },
  { customer: 'Verdi Giuseppe', total: '€ 2.104,00', delay: 80  },
];

export function InsightCard({ showAtFrame }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relFrame = Math.max(0, frame - showAtFrame);
  if (frame < showAtFrame) return null;

  const cardProgress = spring({ frame: relFrame, fps, config: springCard, from: 0, to: 1 });

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: palette.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      opacity: cardProgress,
      transform: `scale(${0.95 + cardProgress * 0.05})`,
    }}>
      {/* Headline */}
      <div style={{
        fontSize: 22,
        fontWeight: 800,
        color: palette.textPrimary,
        fontFamily,
        textAlign: 'center',
        lineHeight: 1.3,
        marginBottom: 8,
      }}>
        While ERP submits the order in the background
      </div>
      <div style={{
        fontSize: 18,
        fontWeight: 500,
        color: palette.blue,
        fontFamily,
        textAlign: 'center',
        marginBottom: 32,
      }}>
        — agents keep working.
      </div>

      {/* Pending orders animati */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 480 }}>
        {PENDING_ORDERS.map((order, i) => {
          const itemProgress = spring({
            frame: Math.max(0, relFrame - order.delay),
            fps,
            config: springBounce,
            from: 0,
            to: 1,
          });
          return (
            <div key={i} style={{
              background: palette.bgCard,
              borderRadius: 12,
              padding: '14px 20px',
              borderLeft: `3px solid ${palette.blue}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
              opacity: itemProgress,
              transform: `translateX(${(1 - itemProgress) * 30}px)`,
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: palette.textPrimary, fontFamily }}>
                  {order.customer}
                </div>
                <div style={{ fontSize: 12, color: palette.textMuted, fontFamily, marginTop: 2 }}>
                  Pending order — queued
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: palette.textSecondary, fontFamily }}>
                {order.total}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tagline */}
      <div style={{
        marginTop: 28,
        fontSize: 14,
        fontWeight: 500,
        color: palette.textMuted,
        fontFamily,
        fontStyle: 'italic',
        textAlign: 'center',
        opacity: interpolate(relFrame, [120, 150], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}>
        Not downtime — parallel productivity.
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ChapterBadge.tsx src/components/InsightCard.tsx
git commit -m "feat(video): aggiungi ChapterBadge e InsightCard components"
```

---

## Task 8: Componente WorkflowTimeline

**Files:**
- Create: `src/components/WorkflowTimeline.tsx`

- [ ] **Step 1: Crea il componente**

```typescript
// src/components/WorkflowTimeline.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springSnap, springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Step = {
  icon: string;
  label: string;
  highlight?: boolean; // evidenzia in blu/verde
};

type Props = {
  title: string;
  steps: Step[];
  /** Colore accent della timeline (default: palette.textMuted) */
  color?: string;
  /** Frame in cui inizia l'animazione */
  delay?: number;
};

export function WorkflowTimeline({ title, steps, color = palette.textMuted, delay = 0 }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springSnap,
    from: 0,
    to: 1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Titolo row */}
      <div style={{
        fontSize: 14,
        fontWeight: 700,
        color,
        fontFamily,
        letterSpacing: 2,
        textTransform: 'uppercase',
        opacity: titleProgress,
      }}>
        {title}
      </div>

      {/* Steps row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {steps.map((step, i) => {
          const stepDelay = delay + 10 + i * 25;
          const stepProgress = spring({
            frame: Math.max(0, frame - stepDelay),
            fps,
            config: springBounce,
            from: 0,
            to: 1,
          });

          const isLast = i === steps.length - 1;
          const dotColor = step.highlight ? palette.blue : color;

          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              {/* Step bubble */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                opacity: stepProgress,
                transform: `scale(${0.7 + stepProgress * 0.3})`,
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: step.highlight ? `${palette.blue}20` : 'rgba(255,255,255,0.06)',
                  border: `2px solid ${dotColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {step.icon}
                </div>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: step.highlight ? palette.blue : palette.textWhiteDim,
                  fontFamily,
                  textAlign: 'center',
                  maxWidth: 72,
                  lineHeight: 1.3,
                }}>
                  {step.label}
                </div>
              </div>

              {/* Connettore freccia */}
              {!isLast && (
                <div style={{
                  width: 32,
                  height: 2,
                  background: color,
                  opacity: stepProgress * 0.4,
                  margin: '0 4px',
                  marginBottom: 24, // allinea con cerchio, non label
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/WorkflowTimeline.tsx
git commit -m "feat(video): aggiungi WorkflowTimeline component"
```

---

## Task 9: Scena TwoWorkflows

**Files:**
- Create: `src/scenes/comparison/TwoWorkflows.tsx`

- [ ] **Step 1: Crea la directory e la scena**

```bash
mkdir -p src/scenes/comparison
```

```typescript
// src/scenes/comparison/TwoWorkflows.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, easingApple } from '../../lib/springs';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { WorkflowTimeline } from '../../components/WorkflowTimeline';

type Props = {
  /** Variante narrativa per il secondo video */
  variant?: 'order' | 'customer-order';
};

const ERP_STEPS_ORDER = [
  { icon: '☎️', label: 'Client meeting' },
  { icon: '🚗', label: 'Drive back' },
  { icon: '💻', label: 'Open desk' },
  { icon: '⌨️', label: 'Enter order 4:22' },
  { icon: '✓',  label: 'ERP', highlight: true },
];

const PWA_STEPS_ORDER = [
  { icon: '☎️', label: 'Meeting + order 3:15', highlight: true },
  { icon: '🚗', label: 'Drive / batch' },
  { icon: '✓',  label: 'ERP in background', highlight: true },
];

const ERP_STEPS_CUSTOMER = [
  { icon: '☎️', label: 'Client meeting' },
  { icon: '🚗', label: 'Drive back' },
  { icon: '💻', label: 'Open desk' },
  { icon: '👤', label: 'Create customer' },
  { icon: '⌨️', label: 'Enter order' },
  { icon: '✓',  label: 'ERP', highlight: true },
];

const PWA_STEPS_CUSTOMER = [
  { icon: '☎️', label: 'Meeting + customer + order', highlight: true },
  { icon: '🚗', label: 'Drive' },
  { icon: '✓',  label: 'ERP in background', highlight: true },
];

export function TwoWorkflows({ variant = 'order' }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const erpSteps = variant === 'order' ? ERP_STEPS_ORDER : ERP_STEPS_CUSTOMER;
  const pwaSteps = variant === 'order' ? PWA_STEPS_ORDER : PWA_STEPS_CUSTOMER;

  const headlineProgress = spring({ frame: Math.max(0, frame - 10), fps, config: springCard, from: 0, to: 1 });

  const subtitleOpacity = interpolate(frame, [220, 260], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const fadeOut = interpolate(frame, [345, 360], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: palette.bgDark,
      display: 'flex',
      flexDirection: 'column',
      padding: '60px 120px',
      gap: 48,
      opacity: fadeOut,
      overflow: 'hidden',
    }}>
      {/* Headline */}
      <div style={{
        fontSize: 32,
        fontWeight: 800,
        color: palette.textWhite,
        fontFamily,
        letterSpacing: -0.5,
        opacity: headlineProgress,
        transform: `translateY(${(1 - headlineProgress) * 12}px)`,
      }}>
        Before we start the clock —{' '}
        <span style={{ color: palette.blue }}>two different workflows.</span>
      </div>

      {/* ERP Timeline */}
      <WorkflowTimeline
        title="Archibald ERP"
        steps={erpSteps}
        color={palette.textMuted}
        delay={20}
      />

      {/* Divider */}
      <div style={{
        height: 1,
        background: palette.dividerDark,
        opacity: interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }} />

      {/* PWA Timeline */}
      <WorkflowTimeline
        title="Formicanera"
        steps={pwaSteps}
        color={palette.blue}
        delay={80}
      />

      {/* Sottotitolo */}
      <div style={{
        fontSize: 18,
        fontWeight: 400,
        color: palette.textWhiteDim,
        fontFamily,
        fontStyle: 'italic',
        opacity: subtitleOpacity,
      }}>
        "The clock matters. But so does when it starts."
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/scenes/comparison/TwoWorkflows.tsx
git commit -m "feat(video): aggiungi TwoWorkflows scene"
```

---

## Task 10: Scene Intro, Context e Summary

**Files:**
- Create: `src/scenes/comparison/ComparisonIntro.tsx`
- Create: `src/scenes/comparison/ComparisonContext.tsx`
- Create: `src/scenes/comparison/ComparisonSummary.tsx`

- [ ] **Step 1: Crea ComparisonIntro**

```typescript
// src/scenes/comparison/ComparisonIntro.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, staticFile, Img } from 'remotion';
import { springBounce, easingApple } from '../../lib/springs';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';

type Props = {
  title: string;
  subtitle: string;
};

export function ComparisonIntro({ title, subtitle }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoProgress = spring({ frame, fps, config: springBounce, from: 0, to: 1 });
  const titleOpacity = interpolate(frame, [15, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const subtitleOpacity = interpolate(frame, [30, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [105, 120], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, opacity: fadeOut, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', width: 600, height: 600, borderRadius: '50%',
        background: `radial-gradient(circle, ${palette.blue} 0%, transparent 65%)`,
        opacity: 0.07, pointerEvents: 'none',
      }} />

      <div style={{
        transform: `scale(${logoProgress}) translateY(${(1 - logoProgress) * -40}px)`,
        opacity: logoProgress,
      }}>
        <Img src={staticFile('formicaneralogo.png')} style={{ width: 100, height: 93, objectFit: 'contain' }} />
      </div>

      <div style={{ fontSize: 64, fontWeight: 900, color: palette.textPrimary, fontFamily, letterSpacing: -1.5, opacity: titleOpacity }}>
        {title}
      </div>

      <div style={{ fontSize: 20, fontWeight: 400, color: palette.textMuted, fontFamily, letterSpacing: 0.3, opacity: subtitleOpacity, textAlign: 'center' }}>
        {subtitle}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crea ComparisonContext**

```typescript
// src/scenes/comparison/ComparisonContext.tsx
import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { easingApple } from '../../lib/springs';

type Line = { text: string; color?: string };

type Props = {
  lines: Line[];
  subtitle?: string;
};

export function ComparisonContext({ lines, subtitle }: Props) {
  const frame = useCurrentFrame();

  const fadeOut = interpolate(frame, [165, 180], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bgDark,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, opacity: fadeOut, padding: '0 120px',
    }}>
      {lines.map((line, i) => {
        const delay = i * 30;
        const opacity = interpolate(frame, [delay, delay + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
        const y = interpolate(frame, [delay, delay + 20], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
        return (
          <div key={i} style={{
            fontSize: 64, fontWeight: 900, fontFamily,
            color: line.color ?? palette.textWhite,
            opacity, transform: `translateY(${y}px)`,
          }}>
            {line.text}
          </div>
        );
      })}

      {subtitle && (
        <div style={{
          fontSize: 20, fontWeight: 400, color: palette.textWhiteDim, fontFamily, fontStyle: 'italic', marginTop: 16,
          opacity: interpolate(frame, [120, 150], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Crea ComparisonSummary**

```typescript
// src/scenes/comparison/ComparisonSummary.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, staticFile, Img } from 'remotion';
import { springCard, springBounce } from '../../lib/springs';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { StatPill } from '../../components/StatPill';

type Row = {
  label: string;
  erpValue: string;
  pwaValue: string;
};

type Props = {
  rows: Row[];
  erpTime: string;
  pwaTime: string;
  fasterLabel: string;
  closingLine: string;
};

export function ComparisonSummary({ rows, erpTime, pwaTime, fasterLabel, closingLine }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({ frame: Math.max(0, frame - 5), fps, config: springCard, from: 0, to: 1 });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      padding: '50px 120px', gap: 24,
    }}>
      {/* Titolo */}
      <div style={{ fontSize: 36, fontWeight: 900, color: palette.textPrimary, fontFamily, opacity: titleProgress }}>
        Results
      </div>

      {/* Tabella */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, padding: '0 16px', marginBottom: 4 }}>
          {['', 'Archibald ERP', 'Formicanera'].map((h, i) => (
            <div key={i} style={{ fontSize: 13, fontWeight: 700, color: i === 2 ? palette.blue : palette.textMuted, fontFamily, letterSpacing: 1, textTransform: 'uppercase' }}>
              {h}
            </div>
          ))}
        </div>

        {rows.map((row, i) => {
          const delay = 20 + i * 30;
          const rowProgress = spring({ frame: Math.max(0, frame - delay), fps, config: springBounce, from: 0, to: 1 });
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              gap: 16, padding: '14px 16px',
              background: i % 2 === 0 ? palette.bgCard : 'transparent',
              borderRadius: 10,
              opacity: rowProgress,
              transform: `translateX(${(1 - rowProgress) * -20}px)`,
            }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: palette.textPrimary, fontFamily }}>{row.label}</div>
              <div style={{ fontSize: 18, color: palette.textMuted, fontFamily }}>{row.erpValue}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: palette.green, fontFamily }}>{row.pwaValue}</div>
            </div>
          );
        })}
      </div>

      {/* Badge timer + faster */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'center' }}>
        <StatPill label={`ERP: ${erpTime}`} color={palette.textMuted} size="md" delay={rows.length * 30 + 20} />
        <StatPill label={`Formicanera: ${pwaTime}`} color={palette.green} size="md" delay={rows.length * 30 + 40} />
        <StatPill label={fasterLabel} color={palette.blue} size="md" delay={rows.length * 30 + 60} />
      </div>

      {/* Closing + logo */}
      <div style={{
        textAlign: 'center',
        opacity: interpolate(frame, [rows.length * 30 + 80, rows.length * 30 + 110], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: palette.textSecondary, fontFamily, fontStyle: 'italic' }}>
          {closingLine}
        </div>
        <Img src={staticFile('formicaneralogo.png')} style={{ width: 48, height: 45, objectFit: 'contain', opacity: 0.6 }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/scenes/comparison/ComparisonIntro.tsx src/scenes/comparison/ComparisonContext.tsx src/scenes/comparison/ComparisonSummary.tsx
git commit -m "feat(video): aggiungi scene ComparisonIntro, ComparisonContext, ComparisonSummary"
```

---

## Task 11: Scena OrderSplitScreen (Video 1 main)

**Files:**
- Create: `src/scenes/comparison/OrderSplitScreen.tsx`

- [ ] **Step 1: Crea la scena**

```typescript
// src/scenes/comparison/OrderSplitScreen.tsx
import { useCurrentFrame, OffthreadVideo, staticFile } from 'remotion';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { C } from '../../lib/comparison-timing';
import { SplitDivider } from '../../components/SplitDivider';
import { SharedTimer } from '../../components/SharedTimer';
import { CalloutBubble } from '../../components/CalloutBubble';
import { ChapterBadge } from '../../components/ChapterBadge';
import { InsightCard } from '../../components/InsightCard';
import { TabletMockupWithLabel } from '../../components/TabletMockup';

// Frame relativi all'inizio della COMPOSIZIONE (assoluti)
const { SPLIT_START, PWA_DONE, ERP_DONE, CH1_FRAME, CH2_FRAME, CH3_FRAME, CH4_FRAME } = C.V1;

// Offset video: i file partono da 0, la scena inizia a SPLIT_START nella composizione.
// OffthreadVideo.startFrom in secondi dall'inizio del file — qui sempre 0.

export function OrderSplitScreen() {
  const frame = useCurrentFrame();

  // Quanti frame siamo dentro la split-screen (per calcolare offset video)
  const splitFrame = frame - SPLIT_START;
  if (splitFrame < 0) return null;

  const isPwaDone = frame >= PWA_DONE;

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', position: 'relative' }}>

      {/* ── PANNELLO SINISTRO: ERP ───────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <OffthreadVideo
          src={staticFile('komet-comparison/1-erp-order.mp4')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {/* Label ERP */}
        <div style={{
          position: 'absolute', top: 16, left: 20,
          fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.50)',
          fontFamily, letterSpacing: 1, textTransform: 'uppercase',
          background: 'rgba(0,0,0,0.40)', borderRadius: 6, padding: '4px 10px',
        }}>
          Archibald ERP — Desktop
        </div>
      </div>

      {/* ── PANNELLO DESTRO: PWA ─────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: palette.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!isPwaDone ? (
          <TabletMockupWithLabel width={860} height={640}>
            <OffthreadVideo
              src={staticFile('komet-comparison/2-pwa-order.mp4')}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </TabletMockupWithLabel>
        ) : (
          <InsightCard showAtFrame={PWA_DONE} />
        )}
      </div>

      {/* ── DIVIDER + TIMER ──────────────────────────── */}
      <SplitDivider />

      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 24, alignItems: 'flex-start', zIndex: 15,
      }}>
        <SharedTimer
          startFrame={SPLIT_START}
          doneFrame={ERP_DONE}
          color={palette.textMuted}
          size={110}
          label="ERP"
          delay={SPLIT_START}
        />
        <SharedTimer
          startFrame={SPLIT_START}
          doneFrame={PWA_DONE}
          color={palette.blue}
          size={110}
          label="Formicanera"
          delay={SPLIT_START}
        />
      </div>

      {/* ── CALLOUT CAPITOLI ─────────────────────────── */}
      <CalloutBubble
        label="Two identical records — which is active?"
        side="left"
        accentColor={palette.orange}
        showAtFrame={CH1_FRAME}
        hideAtFrame={CH1_FRAME + 180}
        verticalPosition={0.5}
      />
      <CalloutBubble
        label="Inactive customers automatically hidden ✓"
        side="right"
        accentColor={palette.green}
        showAtFrame={CH1_FRAME + 30}
        hideAtFrame={CH1_FRAME + 180}
        verticalPosition={0.5}
      />

      <ChapterBadge
        label="Chapter 1 — Customer Selection"
        showAtFrame={CH1_FRAME - 30}
        hideAtFrame={CH1_FRAME}
      />

      <CalloutBubble
        label="Dual search mechanism — inconsistent results"
        side="left"
        accentColor={palette.orange}
        showAtFrame={CH2_FRAME}
        hideAtFrame={CH2_FRAME + 180}
        verticalPosition={0.45}
      />
      <CalloutBubble
        label="Unified intelligent search ✓"
        side="right"
        accentColor={palette.green}
        showAtFrame={CH2_FRAME + 30}
        hideAtFrame={CH2_FRAME + 180}
        verticalPosition={0.45}
      />

      <ChapterBadge
        label="Chapter 2 — Article Search"
        showAtFrame={CH2_FRAME - 30}
        hideAtFrame={CH2_FRAME}
      />

      <CalloutBubble
        label="7 units — manual calculation required"
        side="left"
        accentColor={palette.orange}
        showAtFrame={CH3_FRAME}
        hideAtFrame={CH3_FRAME + 180}
        verticalPosition={0.55}
      />
      <CalloutBubble
        label="Auto-split: 1×5 + 2×1 ✓"
        side="right"
        accentColor={palette.green}
        showAtFrame={CH3_FRAME + 30}
        hideAtFrame={CH3_FRAME + 180}
        verticalPosition={0.55}
      />

      <ChapterBadge
        label="Chapter 3 — Packaging"
        showAtFrame={CH3_FRAME - 30}
        hideAtFrame={CH3_FRAME}
      />

      <CalloutBubble
        label="Manual discount % entry required"
        side="left"
        accentColor={palette.orange}
        showAtFrame={CH4_FRAME}
        hideAtFrame={CH4_FRAME + 180}
        verticalPosition={0.5}
      />
      <CalloutBubble
        label="Promotion applied automatically ✓"
        side="right"
        accentColor={palette.green}
        showAtFrame={CH4_FRAME + 30}
        hideAtFrame={CH4_FRAME + 180}
        verticalPosition={0.5}
      />

      <ChapterBadge
        label="Chapter 4 — Discount & VAT"
        showAtFrame={CH4_FRAME - 30}
        hideAtFrame={CH4_FRAME}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/scenes/comparison/OrderSplitScreen.tsx
git commit -m "feat(video): aggiungi OrderSplitScreen scene (Video 1)"
```

---

## Task 12: Composizione KometOrderComparison + Preview Video 1

**Files:**
- Create: `src/scenes/comparison/KometOrderComparison.tsx`
- Modify: `src/Root.tsx`

- [ ] **Step 1: Crea la composizione Video 1**

```typescript
// src/scenes/comparison/KometOrderComparison.tsx
import { Series, Audio, staticFile, interpolate } from 'remotion';
import { C } from '../../lib/comparison-timing';
import { TwoWorkflows } from './TwoWorkflows';
import { ComparisonIntro } from './ComparisonIntro';
import { ComparisonContext } from './ComparisonContext';
import { OrderSplitScreen } from './OrderSplitScreen';
import { ComparisonSummary } from './ComparisonSummary';
import { palette } from '../../lib/palette';

const { V1 } = C;

export function KometOrderComparison() {
  return (
    <>
      {/* Musica di sottofondo */}
      <Audio
        src={staticFile('background.mp3')}
        volume={(f) =>
          interpolate(f, [0, 30, V1.TOTAL - 90, V1.TOTAL], [0, 0.35, 0.35, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />

      {/* TODO Task 18: voiceover-1.mp3 */}

      <Series>
        <Series.Sequence durationInFrames={V1.WORKFLOWS_END - V1.WORKFLOWS_START}>
          <TwoWorkflows variant="order" />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V1.INTRO_END - V1.INTRO_START}>
          <ComparisonIntro
            title="Order Creation"
            subtitle="Archibald ERP  ·  Formicanera  ·  Speed & Intelligence"
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V1.CONTEXT_END - V1.CONTEXT_START}>
          <ComparisonContext
            lines={[
              { text: 'Same order.' },
              { text: 'Same customer.' },
              { text: 'Two systems.', color: palette.blue },
            ]}
            subtitle="Let's measure the difference."
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V1.SPLIT_END - V1.SPLIT_START}>
          <OrderSplitScreen />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V1.SUMMARY_END - V1.SUMMARY_START}>
          <ComparisonSummary
            rows={[
              { label: 'Customer Selection', erpValue: '⚠️ Manual', pwaValue: '✅ Auto-filtered' },
              { label: 'Article Search',     erpValue: '⚠️ Inconsistent', pwaValue: '✅ Unified' },
              { label: 'Packaging',          erpValue: '⚠️ Manual calc', pwaValue: '✅ Auto-split' },
              { label: 'Discount & VAT',     erpValue: '⚠️ Pre-calculated', pwaValue: '✅ Real-time' },
            ]}
            erpTime="4:22"
            pwaTime="3:15"
            fasterLabel="67 seconds faster"
            closingLine="Same result. More intelligence. From any device."
          />
        </Series.Sequence>
      </Series>
    </>
  );
}
```

- [ ] **Step 2: Registra la composizione in Root.tsx**

```typescript
// src/Root.tsx — aggiungi dopo la composizione esistente
import './font';
import type { FC } from 'react';
import { Composition, registerRoot } from 'remotion';
import { FormicaneraDemoVideo } from './Video';
import { TOTAL_FRAMES, FPS, WIDTH, HEIGHT } from './lib/timing';
import { KometOrderComparison } from './scenes/comparison/KometOrderComparison';
import { KometCustomerComparison } from './scenes/comparison/KometCustomerComparison';
import { C } from './lib/comparison-timing';

export const RemotionRoot: FC = () => {
  return (
    <>
      <Composition
        id="FormicaneraDemoVideo"
        component={FormicaneraDemoVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="KometOrderComparison"
        component={KometOrderComparison}
        durationInFrames={C.V1.TOTAL}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="KometCustomerComparison"
        component={KometCustomerComparison}
        durationInFrames={C.V2.TOTAL}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

registerRoot(RemotionRoot);
```

**Nota:** `KometCustomerComparison` verrà creato in Task 14. Per ora Root.tsx importerà un placeholder — se il type-check fallisce, commenta temporaneamente l'import e la Composition di KometCustomerComparison.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Avvia Remotion Studio e verifica Video 1 visivamente**

```bash
npx remotion studio
```

Apri `http://localhost:3000` → seleziona `KometOrderComparison`. Verifica:
- Scena 0 (TwoWorkflows): le due timeline animano correttamente
- Scena 1 (Intro): logo + titolo entrano con spring
- Scena 2 (Context): tre righe in stagger
- Scena 3 (Split): i due video raw appaiono nei pannelli, i timer partono, i callout compaiono ai frame giusti
- A frame 6510: InsightCard appare sul pannello destro
- Scena 4 (Summary): tabella + badge

- [ ] **Step 5: Commit**

```bash
git add src/scenes/comparison/KometOrderComparison.tsx src/Root.tsx
git commit -m "feat(video): aggiungi KometOrderComparison composition + Root.tsx aggiornato"
```

---

## Task 13: Scene Video 2 (CustomerSplitScreen + OrderContinuationSplitScreen)

**Files:**
- Create: `src/scenes/comparison/CustomerSplitScreen.tsx`
- Create: `src/scenes/comparison/OrderContinuationSplitScreen.tsx`

- [ ] **Step 1: Crea CustomerSplitScreen**

```typescript
// src/scenes/comparison/CustomerSplitScreen.tsx
import { OffthreadVideo, staticFile } from 'remotion';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { C } from '../../lib/comparison-timing';
import { SplitDivider } from '../../components/SplitDivider';
import { SharedTimer } from '../../components/SharedTimer';
import { CalloutBubble } from '../../components/CalloutBubble';
import { TabletMockupWithLabel } from '../../components/TabletMockup';

const { CUST_SPLIT_START, CUST_PWA_DONE, CUST_ERP_DONE, DEVICE_FRAME, FORM_FRAME } = C.V2;

export function CustomerSplitScreen() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', position: 'relative' }}>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <OffthreadVideo
          src={staticFile('komet-comparison/3-erp-customer.mp4')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{
          position: 'absolute', top: 16, left: 20,
          fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.50)',
          fontFamily, letterSpacing: 1, textTransform: 'uppercase',
          background: 'rgba(0,0,0,0.40)', borderRadius: 6, padding: '4px 10px',
        }}>
          Archibald ERP — Desktop
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: palette.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TabletMockupWithLabel width={860} height={640}>
          <OffthreadVideo
            src={staticFile('komet-comparison/5-pwa-customer.mp4')}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </TabletMockupWithLabel>
      </div>

      <SplitDivider />

      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 24, alignItems: 'flex-start', zIndex: 15,
      }}>
        <SharedTimer startFrame={CUST_SPLIT_START} doneFrame={CUST_ERP_DONE} color={palette.textMuted} size={110} label="ERP" delay={CUST_SPLIT_START} />
        <SharedTimer startFrame={CUST_SPLIT_START} doneFrame={CUST_PWA_DONE} color={palette.blue} size={110} label="Formicanera" delay={CUST_SPLIT_START} />
      </div>

      <CalloutBubble
        label="On tablet — in front of the client 📱"
        side="right"
        accentColor={palette.blue}
        showAtFrame={DEVICE_FRAME}
        hideAtFrame={DEVICE_FRAME + 180}
        verticalPosition={0.45}
      />
      <CalloutBubble
        label="Multiple screens, manual navigation"
        side="left"
        accentColor={palette.orange}
        showAtFrame={FORM_FRAME}
        hideAtFrame={FORM_FRAME + 180}
        verticalPosition={0.55}
      />
      <CalloutBubble
        label="Single guided form ✓"
        side="right"
        accentColor={palette.green}
        showAtFrame={FORM_FRAME + 30}
        hideAtFrame={FORM_FRAME + 180}
        verticalPosition={0.55}
      />
    </div>
  );
}
```

- [ ] **Step 2: Crea OrderContinuationSplitScreen**

```typescript
// src/scenes/comparison/OrderContinuationSplitScreen.tsx
import { OffthreadVideo, staticFile } from 'remotion';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { C } from '../../lib/comparison-timing';
import { SplitDivider } from '../../components/SplitDivider';
import { SharedTimer } from '../../components/SharedTimer';
import { TabletMockupWithLabel } from '../../components/TabletMockup';
import { InsightCard } from '../../components/InsightCard';

const { ORD_SPLIT_START, PWA_TOTAL_DONE, ERP_TOTAL_DONE } = C.V2;

export function OrderContinuationSplitScreen() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', position: 'relative' }}>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <OffthreadVideo
          src={staticFile('komet-comparison/4-erp-customer-order.mp4')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{
          position: 'absolute', top: 16, left: 20,
          fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.50)',
          fontFamily, letterSpacing: 1, textTransform: 'uppercase',
          background: 'rgba(0,0,0,0.40)', borderRadius: 6, padding: '4px 10px',
        }}>
          Archibald ERP — Desktop
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: palette.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Mostra InsightCard dopo che PWA ha finito */}
        <TabletMockupWithLabel width={860} height={640}>
          <OffthreadVideo
            src={staticFile('komet-comparison/6-pwa-customer-order.mp4')}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </TabletMockupWithLabel>
      </div>

      <SplitDivider />

      {/* Timer cumulativo: conta dall'inizio di Video 2 (C.V2.CUST_SPLIT_START) */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 24, alignItems: 'flex-start', zIndex: 15,
      }}>
        <SharedTimer startFrame={C.V2.CUST_SPLIT_START} doneFrame={ERP_TOTAL_DONE} color={palette.textMuted} size={110} label="ERP total" delay={ORD_SPLIT_START} />
        <SharedTimer startFrame={C.V2.CUST_SPLIT_START} doneFrame={PWA_TOTAL_DONE} color={palette.blue} size={110} label="Formicanera total" delay={ORD_SPLIT_START} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/scenes/comparison/CustomerSplitScreen.tsx src/scenes/comparison/OrderContinuationSplitScreen.tsx
git commit -m "feat(video): aggiungi CustomerSplitScreen e OrderContinuationSplitScreen (Video 2)"
```

---

## Task 14: Composizione KometCustomerComparison + Preview Video 2

**Files:**
- Create: `src/scenes/comparison/KometCustomerComparison.tsx`

- [ ] **Step 1: Crea la composizione Video 2**

```typescript
// src/scenes/comparison/KometCustomerComparison.tsx
import { Series, Audio, staticFile, interpolate } from 'remotion';
import { C } from '../../lib/comparison-timing';
import { TwoWorkflows } from './TwoWorkflows';
import { ComparisonIntro } from './ComparisonIntro';
import { ComparisonContext } from './ComparisonContext';
import { CustomerSplitScreen } from './CustomerSplitScreen';
import { OrderContinuationSplitScreen } from './OrderContinuationSplitScreen';
import { ComparisonSummary } from './ComparisonSummary';
import { palette } from '../../lib/palette';

const { V2 } = C;

export function KometCustomerComparison() {
  return (
    <>
      <Audio
        src={staticFile('background.mp3')}
        volume={(f) =>
          interpolate(f, [0, 30, V2.TOTAL - 90, V2.TOTAL], [0, 0.35, 0.35, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />

      {/* TODO Task 18: voiceover-2.mp3 */}

      <Series>
        <Series.Sequence durationInFrames={V2.WORKFLOWS_END - V2.WORKFLOWS_START}>
          <TwoWorkflows variant="customer-order" />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V2.INTRO_END - V2.INTRO_START}>
          <ComparisonIntro
            title="New Customer + Order"
            subtitle="End-to-End Workflow — On-Site, From Any Device"
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V2.CONTEXT_END - V2.CONTEXT_START}>
          <ComparisonContext
            lines={[
              { text: 'New client. On-site meeting.' },
              { text: 'Create the customer.' },
              { text: 'Place the order. Right now.', color: palette.blue },
            ]}
            subtitle="From any device. During the meeting."
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V2.CUST_ERP_DONE - V2.CUST_SPLIT_START}>
          <CustomerSplitScreen />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V2.ERP_TOTAL_DONE - V2.ORD_SPLIT_START}>
          <OrderContinuationSplitScreen />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V2.SUMMARY_END - V2.SUMMARY_START}>
          <ComparisonSummary
            rows={[
              { label: 'Customer Creation', erpValue: '2:58', pwaValue: '✅ 2:02' },
              { label: 'Order Placement',   erpValue: '1:32', pwaValue: '✅ 1:05' },
              { label: 'Total',             erpValue: '4:30', pwaValue: '✅ 3:07' },
            ]}
            erpTime="4:30"
            pwaTime="3:07"
            fasterLabel="83 seconds faster"
            closingLine="From any device. During the meeting."
          />
        </Series.Sequence>
      </Series>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Avvia Remotion Studio e verifica Video 2**

```bash
npx remotion studio
```

Seleziona `KometCustomerComparison`. Verifica:
- TwoWorkflows con variante `customer-order`
- Part A (CustomerSplitScreen): entrambi i video, timer, callout device e form
- Part B (OrderContinuationSplitScreen): video continuazione, timer cumulativo
- Summary: 3 righe con totali

- [ ] **Step 4: Commit**

```bash
git add src/scenes/comparison/KometCustomerComparison.tsx
git commit -m "feat(video): aggiungi KometCustomerComparison composition (Video 2)"
```

---

## Task 15: Confetti su PWA Done (Video 1)

La scena `OrderSplitScreen` al frame `PWA_DONE` deve mostrare un'esplosione confetti. Il componente `Confetti` esiste già.

**Files:**
- Modify: `src/scenes/comparison/OrderSplitScreen.tsx`

- [ ] **Step 1: Aggiungi Confetti al pannello destro**

Nel file `OrderSplitScreen.tsx`, aggiungi l'import e il componente:

```typescript
import { Confetti } from '../../components/Confetti';
```

Aggiungi dentro il div root (subito prima della chiusura `</div>`):

```tsx
{/* Confetti al momento PWA Done */}
<Confetti
  triggerFrame={PWA_DONE}
  count={80}
  duration={90}
  originX={0.75}
  originY={0.4}
/>
```

- [ ] **Step 2: Type-check + verifica studio**

```bash
npx tsc --noEmit
npx remotion studio
```

Naviga al frame 6510 (`PWA_DONE`) e verifica l'esplosione confetti sul lato destro.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/comparison/OrderSplitScreen.tsx
git commit -m "feat(video): aggiungi Confetti su PWA Done in OrderSplitScreen"
```

---

## Task 16: ElevenLabs Voiceover

**Files:**
- Create: `scripts/generate-voiceover.mjs`
- Create: `public/komet-comparison/voiceover-1.mp3` (generato)
- Create: `public/komet-comparison/voiceover-2.mp3` (generato)

- [ ] **Step 1: Crea lo script di generazione**

Crea `scripts/generate-voiceover.mjs` (eseguibile con `node`):

```javascript
// scripts/generate-voiceover.mjs
// Genera voiceover con ElevenLabs API per entrambi i video.
// Richiede: ELEVENLABS_API_KEY in env.
// Uso: node scripts/generate-voiceover.mjs

import { writeFileSync } from 'fs';

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) throw new Error('ELEVENLABS_API_KEY non impostata');

// Voice ID da validare su elevenlabs.io — Rachel: 21m00Tcm4TlvDq8ikWAM
// Aria: 9BWtsMINqrJLrRacOk9x — Bella: EXAVITQu4vr4xnSDxMaL
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

const SCRIPTS = {
  'voiceover-1': `Two systems. Two workflows.
With ERP, the order is entered after the meeting — back at the desk.
With Formicanera, the order is created during the meeting, on tablet, closing the deal in real time.
Now — the clock starts.
Same order, same customer. The clock starts now.
Formicanera automatically filters inactive customer records — eliminating selection errors before they happen.
A single, consistent search engine. Articles are always findable — regardless of punctuation or product coding.
Seven units. The packaging engine calculates the optimal split automatically. No arithmetic, no errors.
Enter the target price — Formicanera calculates the exact discount and VAT in real time.
Order submitted. Formicanera is done.
While ERP processes the submission in the background — the agent is already queuing the next orders. Not downtime. Parallel productivity.
Four minutes and twenty-two seconds. Same result.
Same result. More intelligence. Sixty-seven seconds faster — from any device.`,

  'voiceover-2': `A new client. An on-site meeting.
With ERP, the agent returns to the desk to create the customer and place the order.
With Formicanera — it all happens during the meeting, on tablet.
Now, the clock.
Creating a new customer. Same data, two workflows.
Formicanera works on tablet and mobile. The customer is created during the meeting — no desk required.
A single guided form with smart defaults. No navigating between screens.
Customer created. Already ready for the order.
Customer created and order placed — in three minutes and seven seconds.
Complete. The full end-to-end workflow.
Eighty-three seconds faster — end to end. From any device. During the meeting.`,
};

async function generate(name, text) {
  console.log(`Generating ${name}...`);
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs error for ${name}: ${err}`);
  }

  const buffer = await response.arrayBuffer();
  const path = `public/komet-comparison/${name}.mp3`;
  writeFileSync(path, Buffer.from(buffer));
  console.log(`✓ Saved ${path}`);
}

for (const [name, text] of Object.entries(SCRIPTS)) {
  await generate(name, text);
}
console.log('Done!');
```

- [ ] **Step 2: Imposta la chiave API e genera i file**

```bash
# Recupera la chiave da .env o impostala manualmente
export ELEVENLABS_API_KEY="your_key_here"
node scripts/generate-voiceover.mjs
```

Output atteso:
```
Generating voiceover-1...
✓ Saved public/komet-comparison/voiceover-1.mp3
Generating voiceover-2...
✓ Saved public/komet-comparison/voiceover-2.mp3
Done!
```

- [ ] **Step 3: Testa l'audio in Remotion Studio**

```bash
npx remotion studio
```

Vai al frame 0 di `KometOrderComparison` e verifica che il file mp3 sia accessibile (se già wired) oppure ascoltalo con un player.

- [ ] **Step 4: Commit script (non i file mp3 — già gitignored)**

```bash
git add scripts/generate-voiceover.mjs
git commit -m "feat(video): aggiungi script generazione voiceover ElevenLabs"
```

---

## Task 17: Wire Voiceover nelle Composizioni

**Files:**
- Modify: `src/scenes/comparison/KometOrderComparison.tsx`
- Modify: `src/scenes/comparison/KometCustomerComparison.tsx`

- [ ] **Step 1: Aggiungi voiceover a KometOrderComparison**

Sostituisci il commento `{/* TODO Task 18: voiceover-1.mp3 */}` con:

```tsx
<Audio
  src={staticFile('komet-comparison/voiceover-1.mp3')}
  volume={(f) =>
    interpolate(f, [0, 15, V1.TOTAL - 30, V1.TOTAL], [0, 1, 1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  }
/>
```

- [ ] **Step 2: Aggiungi voiceover a KometCustomerComparison**

Stessa operazione con `voiceover-2.mp3` e `V2.TOTAL`.

- [ ] **Step 3: Calibra timing voiceover in Studio**

```bash
npx remotion studio
```

Seleziona `KometOrderComparison`. Usa il player per ascoltare il voiceover e verificare che:
- L'apertura narrativa ("Two systems...") cada nella Scena 0 (0–12s)
- "Same order, same customer" cada al frame 660 (split-screen start)
- I callout vocali siano in sync con i callout visivi

Aggiusta il `startFrom` di `<Audio>` se necessario per correggere offset:
```tsx
// Esempio: ritarda il voiceover di 0.5s
<Audio src={...} startFrom={0} />
// oppure anticipa di 0.5s (15 frame a 30fps)
<Audio src={...} startFrom={-15} />
```

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add src/scenes/comparison/KometOrderComparison.tsx src/scenes/comparison/KometCustomerComparison.tsx
git commit -m "feat(video): integra voiceover ElevenLabs in entrambe le composizioni"
```

---

## Task 18: Render Finale

- [ ] **Step 1: Render Video 1**

```bash
cd docs/commerciale/video
npx remotion render KometOrderComparison out/komet-order-comparison.mp4 --log=verbose
```

Atteso: `out/komet-order-comparison.mp4` (~300s, 1920×1080, h264).

- [ ] **Step 2: Verifica Video 1**

```bash
ffprobe -v quiet -show_entries format=duration:stream=width,height,codec_name -of default out/komet-order-comparison.mp4
```

Atteso: `duration≈304`, `width=1920`, `height=1080`, `codec_name=h264`.

- [ ] **Step 3: Render Video 2**

```bash
npx remotion render KometCustomerComparison out/komet-customer-comparison.mp4 --log=verbose
```

- [ ] **Step 4: Verifica Video 2**

```bash
ffprobe -v quiet -show_entries format=duration:stream=width,height,codec_name -of default out/komet-customer-comparison.mp4
```

Atteso: `duration≈337`, `width=1920`, `height=1080`, `codec_name=h264`.

- [ ] **Step 5: Commit finale**

```bash
git add out/.gitkeep 2>/dev/null || true
git commit -m "feat(video): video comparativi Komet Germany pronti per consegna"
```

---

## Self-Review — Copertura Spec

| Requisito Spec | Task |
|----------------|------|
| 2 video separati in inglese | Task 12, 14 |
| Scena 0 TwoWorkflows — reframe narrativo | Task 9 |
| Split-screen parallelo ERP vs PWA | Task 11, 13 |
| Timer condiviso con Done animation | Task 4 |
| TabletMockup per PWA | Task 5 |
| CalloutBubble per 4 capitoli | Task 11 |
| InsightCard "parallel productivity" | Task 7 |
| Confetti su PWA Done | Task 15 |
| ComparisonSummary con tabella e badge | Task 10 |
| ElevenLabs voiceover | Task 16, 17 |
| FFmpeg preprocessing video raw | Task 1 |
| timing constants centralizzati | Task 2 |
| Musica di sottofondo dal progetto esistente | Task 12, 14 |
| Componenti esistenti riutilizzati (Confetti, StatPill, SpringText…) | Task 10, 11 |
| Root.tsx aggiornato con nuove composizioni | Task 12 |
| Render finale MP4 1920×1080 | Task 18 |
