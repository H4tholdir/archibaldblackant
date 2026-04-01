# Video Formicanera v2 — Piano Miglioramenti

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Applicare 10 miglioramenti grafici/contenutistici al video Remotion v2 già completato.

**Architecture:** Nuovi componenti condivisi (SceneCaption, Ant, Confetti) + modifiche chirurgiche alle scene esistenti. Nessuna modifica a Video.tsx o timing.

**Tech Stack:** Remotion 4, React 19, TypeScript strict, Inter font

**Working dir:** `docs/commerciale/video/`

---

## Componenti esistenti (reference)

```
src/lib/palette.ts      — colori (palette.bg, bgDark, blue, green, orange, red, purple, textPrimary, textMuted, textWhite, textWhiteDim, bgCard, divider, yellow)
src/lib/springs.ts      — springBounce, springCard, springSnap, springText, springGentle, easingApple, easingAppleOut
src/lib/timing.ts       — SCENE_FRAMES, TOTAL_FRAMES, FPS
```

---

## Task A: Tre nuovi componenti — SceneCaption, Ant, Confetti

**Files:**
- Create: `src/components/SceneCaption.tsx`
- Create: `src/components/Ant.tsx`
- Create: `src/components/Confetti.tsx`

- [ ] **Step 1: Crea SceneCaption.tsx**

```typescript
// src/components/SceneCaption.tsx
// Barra narratore in basso: spiega cosa sta succedendo + confronto con ERP.
// Appare con fade-in a "delay" frame, sticky al bottom della scena.
import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../lib/palette';

type Props = {
  main: string;    // cosa sta succedendo
  vs?: string;     // "vs ERP: ..." (opzionale)
  delay?: number;
  color?: string;  // colore accent (default blue)
};

export function SceneCaption({ main, vs, delay = 30, color }: Props) {
  const frame = useCurrentFrame();
  const accent = color ?? palette.blue;

  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [delay, delay + 20], [12, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      position: 'absolute',
      bottom: 36,
      left: 80,
      right: 80,
      opacity,
      transform: `translateY(${y}px)`,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: 'rgba(28,28,30,0.82)',
      backdropFilter: 'blur(12px)',
      borderRadius: 16,
      padding: '14px 24px',
      borderLeft: `3px solid ${accent}`,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: accent, flexShrink: 0,
      }} />
      <div style={{ fontFamily: 'Inter, sans-serif' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
          {main}
        </span>
        {vs && (
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginLeft: 16 }}>
            {vs}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crea Ant.tsx**

```typescript
// src/components/Ant.tsx
// Formica che cammina da sinistra a destra (o destra a sinistra con flip=true).
// Usa interpolate frame-based per posizione X + wiggle Y per simulare il passo.
import { useCurrentFrame, interpolate } from 'remotion';

type Props = {
  startX: number;    // X start (pixel assoluto)
  endX: number;      // X end
  y: number;         // Y fisso
  startFrame?: number;
  endFrame?: number;
  size?: number;     // dimensione emoji (default 32)
  flip?: boolean;    // true = cammina da destra a sinistra
};

export function Ant({ startX, endX, y, startFrame = 0, endFrame = 300, size = 32, flip = false }: Props) {
  const frame = useCurrentFrame();

  const x = interpolate(frame, [startFrame, endFrame], [startX, endX], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Visibile solo nella finestra startFrame→endFrame
  const visible = frame >= startFrame && frame <= endFrame;
  if (!visible) return null;

  // Wiggle verticale per simulare il passo
  const wiggleY = Math.sin((frame / 4) * Math.PI) * 3;

  // Rotazione leggera del corpo
  const wiggleR = Math.sin((frame / 4) * Math.PI) * 4;

  return (
    <div style={{
      position: 'absolute',
      left: x,
      top: y + wiggleY,
      fontSize: size,
      transform: `scaleX(${flip ? -1 : 1}) rotate(${wiggleR}deg)`,
      userSelect: 'none',
      pointerEvents: 'none',
      lineHeight: 1,
    }}>
      🐜
    </div>
  );
}
```

- [ ] **Step 3: Crea Confetti.tsx**

```typescript
// src/components/Confetti.tsx
// Esplosione di coriandoli che cadono dall'alto. Attivati a triggerFrame.
// N particelle con colori, angoli e velocità casuali ma deterministici (seed per frame).
import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../lib/palette';

type Props = {
  triggerFrame: number;  // frame in cui esplodono i coriandoli
  count?: number;        // numero particelle (default 60)
  duration?: number;     // durata animazione in frame (default 90)
  originX?: number;      // X origine (0-1, relativo al width, default 0.5)
  originY?: number;      // Y origine (0-1, relativo al height, default 0.4)
};

const COLORS = [
  palette.blue, palette.green, palette.orange, palette.red, palette.purple, palette.yellow, palette.teal,
  '#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96CEB4',
];

// Genera N particelle con proprietà fisse basate sull'indice (deterministico)
function makeParticles(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 2654435761) >>> 0; // Knuth multiplicative hash
    const rnd = (offset: number) => ((seed ^ (seed >> offset)) % 1000) / 1000;
    return {
      color: COLORS[i % COLORS.length],
      angle: rnd(5) * 360,           // angolo di esplosione (gradi)
      speed: 8 + rnd(7) * 14,        // velocità pixels/frame
      drift: (rnd(11) - 0.5) * 8,    // drift orizzontale
      gravity: 0.6 + rnd(3) * 0.6,   // gravità
      size: 6 + rnd(9) * 10,         // dimensione
      shape: i % 3,                  // 0=cerchio, 1=rettangolo, 2=diamond
      delay: rnd(13) * 12,           // delay iniziale frame
      spin: (rnd(17) - 0.5) * 12,    // velocità rotazione
    };
  });
}

export function Confetti({ triggerFrame, count = 60, duration = 90, originX = 0.5, originY = 0.4 }: Props) {
  const frame = useCurrentFrame();
  const elapsed = frame - triggerFrame;

  if (elapsed < 0 || elapsed > duration + 30) return null;

  const particles = makeParticles(count);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none', overflow: 'hidden',
    }}>
      {particles.map((p, i) => {
        const t = Math.max(0, elapsed - p.delay) / duration;
        if (t <= 0 || t > 1.3) return null;

        const rad = (p.angle * Math.PI) / 180;
        const px = originX * 1920 + Math.cos(rad) * p.speed * elapsed * 2;
        const py = originY * 1080 + Math.sin(rad) * p.speed * elapsed - 0.5 * p.gravity * elapsed * elapsed;

        const opacity = interpolate(t, [0, 0.1, 0.7, 1.0], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });

        const rotation = p.spin * elapsed;

        return (
          <div key={i} style={{
            position: 'absolute',
            left: px,
            top: py,
            width: p.shape === 1 ? p.size * 1.6 : p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.shape === 0 ? '50%' : p.shape === 2 ? 2 : 3,
            opacity,
            transform: `rotate(${rotation}deg) ${p.shape === 2 ? 'rotate(45deg)' : ''}`,
          }} />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Verifica TypeScript**
```bash
cd docs/commerciale/video && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**
```bash
git add docs/commerciale/video/src/components/SceneCaption.tsx docs/commerciale/video/src/components/Ant.tsx docs/commerciale/video/src/components/Confetti.tsx
git commit -m "feat(video): SceneCaption, Ant, Confetti components"
```

---

## Task B: LogoIntro bigger logo + Problem scene redesign

**Files:**
- Modify: `src/scenes/LogoIntro.tsx`
- Modify: `src/scenes/Problem.tsx`

- [ ] **Step 1: LogoIntro — logo più grande e impatto maggiore**

Cambia il componente `Img` nel `LogoIntro`:
```tsx
// PRIMA: style={{ width: 100, height: 100, objectFit: 'contain' }}
// DOPO:
<Img
  src={staticFile('formicaneralogo.png')}
  style={{ width: 220, height: 205, objectFit: 'contain' }}
/>
```

E aumenta il font del titolo:
```tsx
// PRIMA: fontSize: 56
// DOPO:
fontSize: 72,
```

- [ ] **Step 2: Problem scene — redesign completo**

Sostituisci l'intero contenuto di `src/scenes/Problem.tsx` con:

```typescript
// src/scenes/Problem.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springBounce, springCard, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';

type Severity = 'high' | 'mid' | 'low';

const PROBLEMS: Array<{ icon: string; title: string; detail: string; severity: Severity }> = [
  { icon: '📵', title: 'Zero accesso mobile',       detail: 'Nessuna app, nessun responsive — solo da PC fisso',      severity: 'high' },
  { icon: '⏱',  title: '20 min per ordine',         detail: 'Ogni ordine: sequenza manuale di form ERP identiche',     severity: 'high' },
  { icon: '🔕', title: 'Zero notifiche proattive',  detail: "L'agente cerca lui — nessuna notifica automatica",       severity: 'high' },
  { icon: '🔁', title: 'Lavoro manuale ripetitivo', detail: 'Stesse operazioni ogni giorno, nessuna automazione',      severity: 'mid'  },
  { icon: '🗂',  title: 'Dati dispersi',             detail: 'Schermate diverse, nessun cruscotto aggregato',          severity: 'mid'  },
  { icon: '📁', title: 'DDT e fatture manuali',     detail: 'Processo separato per ogni documento — email e download', severity: 'mid'  },
  { icon: '📦', title: 'Tracking: telefonate',      detail: 'Nessun tracking integrato — solo app esterne',           severity: 'low'  },
  { icon: '📡', title: 'Offline: agente cieco',     detail: 'Senza connessione stabile: impossibile lavorare',        severity: 'low'  },
];

const SEVERITY_STYLE: Record<Severity, { border: string; bg: string; dot: string }> = {
  high: { border: palette.red,     bg: `rgba(255,59,48,0.10)`,   dot: palette.red     },
  mid:  { border: palette.orange,  bg: `rgba(255,149,0,0.08)`,   dot: palette.orange  },
  low:  { border: `rgba(255,255,255,0.15)`, bg: `rgba(255,255,255,0.04)`, dot: palette.textMuted },
};

export function Problem() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.problem;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const titleProgress = spring({ frame: Math.max(0, frame - 5), fps, config: springCard, from: 0, to: 1 });
  const lineWidth = interpolate(frame, [10, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const subtitleOpacity = interpolate(frame, [380, 410], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bgDark,
      display: 'flex', flexDirection: 'column',
      padding: '60px 120px',
      opacity: fadeOut, position: 'relative', overflow: 'hidden',
    }}>
      {/* Background radial reddish glow */}
      <div style={{
        position: 'absolute', top: -200, right: -200,
        width: 800, height: 800, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(255,59,48,0.08) 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <div style={{
          fontSize: 16, fontWeight: 700, color: palette.red,
          letterSpacing: 4, textTransform: 'uppercase',
          fontFamily: 'Inter, sans-serif', marginBottom: 12,
          opacity: titleProgress,
        }}>
          Il problema
        </div>
        <div style={{
          fontSize: 44, fontWeight: 900, color: palette.textWhite,
          fontFamily: 'Inter, sans-serif', letterSpacing: -1,
          lineHeight: 1.1,
          opacity: titleProgress,
          transform: `translateY(${(1 - titleProgress) * 15}px)`,
        }}>
          Lavorare con Archibald ERP nel 2026
        </div>
        {/* Red underline animata */}
        <div style={{
          height: 3, background: palette.red, borderRadius: 2,
          marginTop: 12, width: `${lineWidth * 540}px`,
          boxShadow: `0 0 12px ${palette.red}60`,
        }} />
      </div>

      {/* Grid 2 colonne × 4 righe */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '16px 32px', flex: 1,
      }}>
        {PROBLEMS.map((p, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const delay = 30 + col * 15 + row * 45;
          const cardProgress = spring({ frame: Math.max(0, frame - delay), fps, config: springBounce, from: 0, to: 1 });
          const sty = SEVERITY_STYLE[p.severity];

          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 16,
              background: sty.bg,
              borderRadius: 14,
              padding: '16px 20px',
              borderLeft: `3px solid ${sty.border}`,
              opacity: cardProgress,
              transform: `translateY(${(1 - cardProgress) * 20}px) scale(${0.96 + cardProgress * 0.04})`,
            }}>
              <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{p.icon}</span>
              <div>
                <div style={{
                  fontSize: 20, fontWeight: 800,
                  color: p.severity === 'high' ? palette.textWhite : p.severity === 'mid' ? palette.textWhiteDim : 'rgba(255,255,255,0.50)',
                  fontFamily: 'Inter, sans-serif', marginBottom: 4,
                }}>
                  {p.title}
                </div>
                <div style={{
                  fontSize: 14, color: 'rgba(255,255,255,0.35)',
                  fontFamily: 'Inter, sans-serif', lineHeight: 1.4,
                }}>
                  {p.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sottotitolo finale */}
      <div style={{
        marginTop: 28, opacity: subtitleOpacity,
        fontSize: 16, color: 'rgba(255,255,255,0.28)',
        fontFamily: 'Inter, sans-serif', fontStyle: 'italic', textAlign: 'right',
      }}>
        — Ogni giorno, per ogni agente Komet
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verifica TypeScript**
```bash
cd docs/commerciale/video && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**
```bash
git add docs/commerciale/video/src/scenes/LogoIntro.tsx docs/commerciale/video/src/scenes/Problem.tsx
git commit -m "feat(video): logo più grande, Problem scene redesign a 2 colonne"
```

---

## Task C: Solution scene (formiche) + Closing scene (fix gradiente, rimuovi CTA, formiche)

**Files:**
- Modify: `src/scenes/Solution.tsx`
- Modify: `src/scenes/Closing.tsx`

- [ ] **Step 1: Solution.tsx — aggiungi formiche animate**

Aggiungi l'import di `Ant`:
```typescript
import { Ant } from '../components/Ant';
```

Nella `return`, prima della chiusura del div root, aggiungi 4 formiche che attraversano la scena in direzioni diverse. Le formiche cominciano a comparire dal frame 40, ognuna con timing e traiettoria diversa:

```tsx
{/* Formiche che attraversano la scena */}
<Ant startX={-60}  endX={1980} y={820} startFrame={40}  endFrame={130} size={36} />
<Ant startX={1980} endX={-60}  y={900} startFrame={60}  endFrame={148} size={28} flip />
<Ant startX={-60}  endX={1980} y={960} startFrame={80}  endFrame={145} size={40} />
<Ant startX={1980} endX={-60}  y={850} startFrame={20}  endFrame={140} size={24} flip />
```

- [ ] **Step 2: Closing.tsx — fix gradiente, rimuovi CTA, logo più grande, formiche**

Sostituisci l'intero file `src/scenes/Closing.tsx` con:

```typescript
// src/scenes/Closing.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, staticFile, Img } from 'remotion';
import { springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { Ant } from '../components/Ant';

export function Closing() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.closing;

  const breathe = 0.12 + Math.sin((frame / 60) * Math.PI) * 0.06;
  const logoProgress = spring({ frame, fps, config: springBounce, from: 0, to: 1 });

  const titleOpacity = interpolate(frame, [25, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [25, 50], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });

  const subtitleOpacity = interpolate(frame, [45, 65], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const taglineOpacity = interpolate(frame, [65, 85], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%',
      // Sfondo scuro con glow blu centrato — leggibile e d'impatto
      background: `radial-gradient(ellipse at 50% 45%, rgba(0,122,255,${breathe}) 0%, rgba(10,10,20,0.95) 55%, ${palette.bgDark} 100%)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, position: 'relative', overflow: 'hidden',
    }}>
      {/* Subtle grid pattern overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '80px 80px',
        pointerEvents: 'none',
      }} />

      {/* Logo — molto più grande */}
      <div style={{
        transform: `scale(${logoProgress}) translateY(${(1 - logoProgress) * -60}px)`,
        opacity: logoProgress,
        filter: `drop-shadow(0 ${12 * logoProgress}px ${40 * logoProgress}px rgba(0,122,255,${0.45 * logoProgress}))`,
      }}>
        <Img
          src={staticFile('formicaneralogo.png')}
          style={{ width: 180, height: 168, objectFit: 'contain' }}
        />
      </div>

      {/* Formicanera */}
      <div style={{
        fontSize: 88, fontWeight: 900,
        color: palette.textWhite,
        fontFamily: 'Inter, sans-serif', letterSpacing: -3,
        opacity: titleOpacity,
        transform: `translateY(${titleY}px)`,
        textShadow: '0 4px 40px rgba(0,0,0,0.40)',
      }}>
        Formicanera
      </div>

      {/* Sottotitolo */}
      <div style={{
        fontSize: 22, fontWeight: 600, color: palette.blue,
        fontFamily: 'Inter, sans-serif', letterSpacing: 3, textTransform: 'uppercase',
        opacity: subtitleOpacity,
      }}>
        Il vantaggio competitivo · Komet Italia
      </div>

      {/* Tagline aggiuntiva */}
      <div style={{
        fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.38)',
        fontFamily: 'Inter, sans-serif',
        opacity: taglineOpacity,
        marginTop: 8,
      }}>
        Dal campo all&apos;ERP — senza toccare l&apos;ERP.
      </div>

      {/* Formiche che camminano nella scena finale */}
      <Ant startX={-60}  endX={1980} y={980} startFrame={60}  endFrame={dur} size={32} />
      <Ant startX={1980} endX={-60}  y={940} startFrame={80}  endFrame={dur} size={24} flip />
      <Ant startX={-60}  endX={1980} y={1010} startFrame={100} endFrame={dur} size={40} />
      <Ant startX={1980} endX={-60}  y={960} startFrame={120} endFrame={dur} size={28} flip />
      <Ant startX={-60}  endX={600}  y={1030} startFrame={40}  endFrame={dur} size={20} />
    </div>
  );
}
```

- [ ] **Step 3: Verifica TypeScript**
```bash
cd docs/commerciale/video && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**
```bash
git add docs/commerciale/video/src/scenes/Solution.tsx docs/commerciale/video/src/scenes/Closing.tsx
git commit -m "feat(video): formiche in Solution e Closing, Closing redesign (sfondo scuro, logo 180px, no CTA)"
```

---

## Task D: SceneCaption nelle scene Orders, IvaAndTotals, PendingOrders

**Files:**
- Modify: `src/scenes/Orders.tsx`
- Modify: `src/scenes/IvaAndTotals.tsx`
- Modify: `src/scenes/PendingOrders.tsx`

Le scene devono avere `position: 'relative'` sul div root (aggiungilo se manca) e importare `SceneCaption`.

- [ ] **Step 1: Orders.tsx — aggiungi import e SceneCaption**

Aggiungi import:
```typescript
import { SceneCaption } from '../components/SceneCaption';
```

Assicurati che il div root abbia `position: 'relative'`. Poi aggiungi prima della chiusura del div root (prima del `</div>` finale):
```tsx
<SceneCaption
  main="Il bot invia l'ordine su Archibald automaticamente"
  vs="vs ERP: 15–20 minuti di lavoro manuale per ogni ordine"
  delay={30}
/>
```

- [ ] **Step 2: IvaAndTotals.tsx — aggiungi import e SceneCaption**

Aggiungi import:
```typescript
import { SceneCaption } from '../components/SceneCaption';
```

Assicurati che il div root abbia `position: 'relative'`. Poi aggiungi prima della chiusura del div root:
```tsx
<SceneCaption
  main="IVA e totali calcolati in tempo reale — zero errori manuali"
  vs="vs ERP: calcolo manuale riga per riga, rischio errori ogni volta"
  delay={30}
  color="#34C759"
/>
```

- [ ] **Step 3: PendingOrders.tsx — aggiungi import e SceneCaption**

Aggiungi import:
```typescript
import { SceneCaption } from '../components/SceneCaption';
```

Assicurati che il div root abbia `position: 'relative'`. Poi aggiungi prima della chiusura del div root:
```tsx
<SceneCaption
  main="Accumula ordini tutto il giorno e invia tutto in un tap"
  vs="vs ERP: ogni ordine va aperto e inviato manualmente, uno per volta"
  delay={30}
  color="#FF9500"
/>
```

- [ ] **Step 4: Verifica TypeScript**
```bash
cd docs/commerciale/video && npx tsc --noEmit
```

- [ ] **Step 5: Commit**
```bash
git add docs/commerciale/video/src/scenes/Orders.tsx docs/commerciale/video/src/scenes/IvaAndTotals.tsx docs/commerciale/video/src/scenes/PendingOrders.tsx
git commit -m "feat(video): SceneCaption in Orders, IvaAndTotals, PendingOrders"
```

---

## Task E: Storico (fix animazione) + Clients (funzionalità interattive) + SceneCaption

**Files:**
- Modify: `src/scenes/Storico.tsx`
- Modify: `src/scenes/Clients.tsx`

### Storico — fix animazione non fluida

Il problema: il pannello sinistro usa `transition: 'flex 0.3s'` che NON funziona in Remotion (frame-by-frame). La larghezza deve essere animata tramite `interpolate`.

- [ ] **Step 1: Fix Storico.tsx — pannello sinistro width con interpolate**

Nel pannello sinistro, sostituisci la prop `flex`:
```tsx
// PRIMA (non funziona in Remotion):
// flex: isSplit ? '0 0 45%' : '1',
// transition: 'flex 0.3s',

// DOPO (frame-based, fluido):
// Aggiungi questa variabile prima del return:
const leftWidth = interpolate(frame, [SPLIT_FRAME, SPLIT_FRAME + 20], [100, 45], {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
});

// Nel JSX, cambia il pannello sinistro:
// flex: `0 0 ${leftWidth}%`,   ← invece di 'flex: isSplit ? ...'
```

L'`easingApple` è già importato.

Poi aggiungi import e SceneCaption:
```typescript
import { SceneCaption } from '../components/SceneCaption';
```

Aggiungi `position: 'relative'` al div root (è già presente in padding, aggiungilo). Poi prima della chiusura:
```tsx
<SceneCaption
  main="Cerca nello storico e copia articoli in un tap — ordine pre-compilato"
  vs="vs ERP: riaprire l'ordine precedente, copiare manualmente, rischio errori"
  delay={30}
  color="#5856D6"
/>
```

- [ ] **Step 2: Clients.tsx — feature highlights interattive**

Nel pannello della scheda cliente (la parte `!isWizard`), nella lista dei campi (`.map({ label, value }...)`), aggiungi un badge interattivo per ogni campo che mostra cosa fa il tap:

Sostituisci l'array dei fields con una versione arricchita:
```tsx
[
  { label: 'P.IVA', value: '04821760652', tap: null },
  { label: 'Indirizzo', value: 'Via Roma 12, Napoli', tap: '📍 Tap → Apple Maps' },
  { label: 'Email', value: 'bianchi@studiodent.it', tap: '✉️ Tap → Gmail' },
  { label: 'Telefono', value: '+39 081 1234567', tap: '📞 Tap → Chiama' },
].map(({ label, value, tap }, i) => {
  const fieldOpacity = interpolate(frame, [20 + i * 15, 40 + i * 15], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const tapOpacity = interpolate(frame, [50 + i * 20, 70 + i * 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <div key={i} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: `1px solid ${palette.divider}`,
      opacity: fieldOpacity,
    }}>
      <span style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
        {label}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', textAlign: 'right' }}>
          {value}
        </span>
        {tap && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: palette.blue,
            fontFamily: 'Inter, sans-serif',
            background: `${palette.blue}15`, borderRadius: 6, padding: '2px 8px',
            opacity: tapOpacity,
          }}>
            {tap}
          </span>
        )}
      </div>
    </div>
  );
})
```

Aggiungi anche un badge per la foto avatar. Nel blocco avatar (`width: 56, height: 56, borderRadius: '50%'...`), dopo la chiusura del div avatar aggiungi:
```tsx
{frame >= 60 && (
  <div style={{
    position: 'absolute', bottom: -8, right: -8,
    background: palette.blue, borderRadius: 20, padding: '3px 8px',
    fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: 'Inter, sans-serif',
    opacity: interpolate(frame, [60, 75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  }}>
    📷
  </div>
)}
```
Nota: il div genitore dell'avatar deve avere `position: 'relative'`.

Aggiungi anche SceneCaption (import + componente):
```typescript
import { SceneCaption } from '../components/SceneCaption';
```
Aggiungi `position: 'relative'` al div root. Poi prima della chiusura:
```tsx
<SceneCaption
  main="Scheda cliente interattiva: tap → Maps, Chiama, Gmail, Foto"
  vs="vs ERP: nessuna interattività, dati in sola lettura, nessuna integrazione"
  delay={30}
/>
```

- [ ] **Step 3: Verifica TypeScript**
```bash
cd docs/commerciale/video && npx tsc --noEmit
```

- [ ] **Step 4: Commit**
```bash
git add docs/commerciale/video/src/scenes/Storico.tsx docs/commerciale/video/src/scenes/Clients.tsx
git commit -m "feat(video): Storico fix animazione split fluido, Clients feature badges interattivi, SceneCaption"
```

---

## Task F: Dashboard redesign — gauge, hero widget, confetti

**Files:**
- Modify: `src/scenes/Dashboard.tsx`

La dashboard attuale (4 metric cards + chart) va redesignata per rispecchiare la vera PWA:
- HeroStatus widget: gauge semicircolare con stato performance
- Metriche chiave sotto il gauge
- Chart fatturato mensile
- Confetti quando l'obiettivo è raggiunto

- [ ] **Step 1: Sostituisci `src/scenes/Dashboard.tsx` con il redesign completo**

```typescript
// src/scenes/Dashboard.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, springSnap, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { ProgressBar } from '../components/ProgressBar';
import { Confetti } from '../components/Confetti';
import { SceneCaption } from '../components/SceneCaption';

// Frame timeline:
const HERO_FRAME     = 0;    // Hero widget entra
const METRICS_FRAME  = 60;   // Metriche entrano
const CHART_FRAME    = 150;  // Chart si disegna
const GOAL_FRAME     = 330;  // Obiettivo raggiunto → confetti
const YOY_FRAME      = 380;  // Comparazione anno precedente

// Gauge SVG — semicircolo animato
function GaugeChart({ progress, frame }: { progress: number; frame: number }) {
  const R = 100;                // raggio
  const CX = 140, CY = 130;    // centro
  const startAngle = -180;
  const endAngle   = 0;

  function polarToXY(angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
  }

  const bgStart = polarToXY(startAngle);
  const bgEnd   = polarToXY(endAngle);
  const bgPath  = `M ${bgStart.x} ${bgStart.y} A ${R} ${R} 0 1 1 ${bgEnd.x} ${bgEnd.y}`;

  const fillAngle = startAngle + (endAngle - startAngle) * progress;
  const fillEnd   = polarToXY(fillAngle);
  const largeArc  = fillAngle - startAngle > 180 ? 1 : 0;
  const fillPath  = `M ${bgStart.x} ${bgStart.y} A ${R} ${R} 0 ${largeArc} 1 ${fillEnd.x} ${fillEnd.y}`;

  const statusColor = progress >= 1 ? palette.green : progress > 0.7 ? palette.blue : progress > 0.4 ? palette.orange : palette.red;

  return (
    <svg width="280" height="150" viewBox="0 0 280 150">
      {/* Traccia sfondo */}
      <path d={bgPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="18" strokeLinecap="round" />
      {/* Traccia progress */}
      {progress > 0 && (
        <path d={fillPath} fill="none" stroke={statusColor} strokeWidth="18" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${statusColor}80)` }} />
      )}
      {/* Valore centrale */}
      <text x={CX} y={CY + 10} textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="32" fill="white">
        {Math.round(progress * 100)}%
      </text>
      <text x={CX} y={CY + 30} textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="13" fill="rgba(255,255,255,0.45)">
        Budget
      </text>
    </svg>
  );
}

const CHART_POINTS = [
  [0, 90], [55, 65], [110, 78], [165, 48], [220, 62],
  [275, 38], [330, 54], [385, 28], [440, 45], [495, 32], [550, 18], [605, 12],
];

function pointsToPath(pts: number[][]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
}

export function Dashboard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.dashboard;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Hero widget
  const heroProgress = spring({ frame: Math.max(0, frame - HERO_FRAME), fps, config: springCard, from: 0, to: 1 });

  // Budget progress (raggiunge 100% al GOAL_FRAME)
  const budgetValue = interpolate(frame, [METRICS_FRAME, GOAL_FRAME], [0, 100], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });
  const gaugeProgress = budgetValue / 100;

  // Confetti quando obiettivo raggiunto
  const goalReached = frame >= GOAL_FRAME;
  const goalBadgeOpacity = interpolate(frame, [GOAL_FRAME, GOAL_FRAME + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Chart
  const chartProgress = interpolate(frame, [CHART_FRAME, CHART_FRAME + 120], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });
  const visiblePointCount = Math.max(2, Math.round(chartProgress * CHART_POINTS.length));
  const visiblePoints = CHART_POINTS.slice(0, visiblePointCount);

  // YOY badge
  const yoyProgress = spring({ frame: Math.max(0, frame - YOY_FRAME), fps, config: springBounce, from: 0, to: 1 });

  const METRICS = [
    { icon: '💰', label: 'Fatturato YTD', value: 124800, prefix: '€ ', color: palette.blue },
    { icon: '🏆', label: 'Commissioni', value: 8736, prefix: '€ ', color: palette.green },
    { icon: '📋', label: 'Ordini mese', value: 47, prefix: '', suffix: ' ordini', color: palette.purple },
    { icon: '⭐', label: 'Clienti attivi', value: 38, prefix: '', suffix: ' clienti', color: palette.orange },
  ];

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bgDark,
      display: 'flex', flexDirection: 'column',
      opacity: fadeOut, padding: '40px 72px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Confetti per obiettivo raggiunto */}
      {goalReached && <Confetti triggerFrame={GOAL_FRAME} count={70} duration={100} originX={0.25} originY={0.35} />}

      {/* Header */}
      <div style={{ marginBottom: 32, opacity: heroProgress, transform: `translateY(${(1 - heroProgress) * -20}px)` }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: palette.blue, letterSpacing: 3, textTransform: 'uppercase', fontFamily: 'Inter, sans-serif', marginBottom: 8 }}>
          Business Intelligence
        </div>
        <div style={{ fontSize: 40, fontWeight: 900, color: palette.textWhite, fontFamily: 'Inter, sans-serif', letterSpacing: -1 }}>
          📊 La tua Dashboard
        </div>
      </div>

      {/* Layout principale: Hero a sinistra, chart a destra */}
      <div style={{ display: 'flex', gap: 32, flex: 1 }}>

        {/* Colonna sinistra: gauge + metriche */}
        <div style={{ flex: '0 0 340px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Hero gauge widget */}
          <div style={{
            background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
            borderRadius: 20, padding: '20px 24px',
            boxShadow: '0 8px 40px rgba(0,122,255,0.25)',
            opacity: heroProgress,
            transform: `scale(${0.95 + heroProgress * 0.05})`,
            position: 'relative',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'Inter, sans-serif', marginBottom: 8 }}>
              Obiettivo mensile
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GaugeChart progress={gaugeProgress} frame={frame} />
            </div>
            {/* Badge obiettivo raggiunto */}
            {goalReached && (
              <div style={{
                marginTop: 8,
                background: 'rgba(52,199,89,0.20)', border: `1.5px solid ${palette.green}`,
                borderRadius: 12, padding: '8px 16px', textAlign: 'center',
                fontSize: 15, fontWeight: 800, color: palette.green, fontFamily: 'Inter, sans-serif',
                opacity: goalBadgeOpacity,
                boxShadow: `0 0 20px ${palette.green}40`,
              }}>
                🎉 Obiettivo raggiunto!
              </div>
            )}
          </div>

          {/* Metriche 2×2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {METRICS.map((m, i) => {
              const mProgress = spring({ frame: Math.max(0, frame - METRICS_FRAME - i * 15), fps, config: springSnap, from: 0, to: 1 });
              return (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 16px',
                  border: `1px solid rgba(255,255,255,0.08)`,
                  opacity: mProgress, transform: `scale(${0.92 + mProgress * 0.08})`,
                }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{m.icon}</div>
                  <div style={{ fontFamily: 'Inter, sans-serif' }}>
                    <AnimatedNumber from={0} to={m.value} delay={METRICS_FRAME + i * 15} durationInFrames={60}
                      prefix={m.prefix} suffix={m.suffix ?? ''} euroFormat={m.prefix === '€ '}
                      fontSize={22} fontWeight={900} color={m.color} />
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>{m.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Colonna destra: chart */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: '20px 24px',
            border: '1px solid rgba(255,255,255,0.08)', flex: 1,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: palette.textWhite, fontFamily: 'Inter, sans-serif' }}>
                Fatturato mensile 2026
              </div>
              {frame >= YOY_FRAME && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: yoyProgress, transform: `scale(${yoyProgress})` }}>
                  <span style={{ fontSize: 18, color: palette.green }}>↑</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: palette.green, fontFamily: 'Inter, sans-serif' }}>+18% vs 2025</span>
                </div>
              )}
            </div>

            <svg width="100%" height="160" viewBox="0 0 660 120" preserveAspectRatio="none">
              {visiblePoints.length > 1 && (
                <path d={`${pointsToPath(visiblePoints)} L ${visiblePoints[visiblePoints.length - 1][0]} 110 L 0 110 Z`}
                  fill={`${palette.blue}25`} />
              )}
              {visiblePoints.length > 1 && (
                <path d={pointsToPath(visiblePoints)} fill="none" stroke={palette.blue} strokeWidth={3}
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ filter: `drop-shadow(0 0 6px ${palette.blue}80)` }} />
              )}
              {chartProgress > 0.5 && (
                <path d="M 0 100 L 55 82 L 110 90 L 165 68 L 220 80 L 275 58 L 330 72 L 385 50 L 440 62 L 495 54 L 550 40 L 605 36"
                  fill="none" stroke={palette.textMuted} strokeWidth={1.5} strokeDasharray="5 4"
                  opacity={interpolate(chartProgress, [0.5, 0.8], [0, 0.35], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
              )}
            </svg>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              {['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'].map((m, i) => {
                const mOpacity = interpolate(frame, [CHART_FRAME + i * 8, CHART_FRAME + i * 8 + 15], [0, 1], {
                  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                });
                return (
                  <span key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', fontFamily: 'Inter, sans-serif', opacity: mOpacity }}>
                    {m}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Confronto bonus */}
          <div style={{
            background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '16px 20px',
            border: '1px solid rgba(255,255,255,0.08)',
            opacity: interpolate(frame, [METRICS_FRAME + 60, METRICS_FRAME + 80], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.40)', fontFamily: 'Inter, sans-serif', marginBottom: 8 }}>
              Avanzamento commissioni
            </div>
            <ProgressBar progress={0.72} delay={METRICS_FRAME + 40} durationInFrames={80} color={palette.green} height={8} label="€ 8.736" percent />
          </div>
        </div>
      </div>

      <SceneCaption
        main="Fatturato, commissioni e budget a colpo d'occhio — dati ERP in tempo reale"
        vs="vs ERP: nessun cruscotto, dati dispersi in schermate separate"
        delay={30}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verifica TypeScript**
```bash
cd docs/commerciale/video && npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add docs/commerciale/video/src/scenes/Dashboard.tsx
git commit -m "feat(video): Dashboard redesign — Hero gauge, confetti obiettivo, dark theme, SceneCaption"
```

---

## Task G: Documents redesign + SceneCaption in Warehouse, Quotes, Integrations, Notifications

**Files:**
- Modify: `src/scenes/Documents.tsx`
- Modify: `src/scenes/Warehouse.tsx`
- Modify: `src/scenes/Quotes.tsx`
- Modify: `src/scenes/Integrations.tsx`
- Modify: `src/scenes/Notifications.tsx`

- [ ] **Step 1: Documents.tsx — redesign per chiarezza + SceneCaption**

Sostituisci l'intero file `src/scenes/Documents.tsx` con:

```typescript
// src/scenes/Documents.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { SceneCaption } from '../components/SceneCaption';

const DDT_TAP_FRAME  = 40;
const DDT_DONE_FRAME = 100;
const FAT_TAP_FRAME  = 120;
const FAT_DONE_FRAME = 180;
const TRACKING_FRAME = 185;

const TRACKING_EVENTS = [
  { icon: '✅', text: 'Preso in carico FedEx',   place: 'Napoli',           time: '28/03 14:32', done: true  },
  { icon: '✅', text: 'In transito',              place: 'Roma Smistamento', time: '28/03 22:15', done: true  },
  { icon: '✅', text: 'Partito per destinazione', place: 'Milano',           time: '29/03 03:44', done: true  },
  { icon: '🔵', text: 'In consegna oggi',         place: 'Milano',           time: '29/03 09:20', done: false },
  { icon: '⭕', text: 'Consegnato',               place: '—',                time: '—',           done: false },
];

function DownloadIndicator({ progress, color }: { progress: number; color: string }) {
  const R = 12;
  const C = 2 * Math.PI * R;
  if (progress <= 0) {
    return (
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color }}>
        ↓
      </div>
    );
  }
  if (progress >= 1) {
    return (
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${palette.green}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: palette.green }}>
        ✓
      </div>
    );
  }
  return (
    <svg width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r={R} fill="none" stroke={palette.divider} strokeWidth="3" />
      <circle cx="18" cy="18" r={R} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${progress * C} ${C}`} strokeLinecap="round"
        transform="rotate(-90 18 18)" />
    </svg>
  );
}

export function Documents() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.documents;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const leftProgress = spring({ frame, fps, config: springCard, from: 0, to: 1 });
  const trackingProgress = spring({ frame: Math.max(0, frame - TRACKING_FRAME), fps, config: springCard, from: 0, to: 1 });

  const ddtProgress = interpolate(frame, [DDT_TAP_FRAME, DDT_DONE_FRAME], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const fatProgress = interpolate(frame, [FAT_TAP_FRAME, FAT_DONE_FRAME], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });

  const lineProgress = interpolate(frame, [TRACKING_FRAME + 20, TRACKING_FRAME + 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', gap: 40, opacity: fadeOut, padding: '48px 80px',
      position: 'relative',
    }}>

      {/* Pannello sinistro — documenti */}
      <div style={{
        flex: '0 0 420px', display: 'flex', flexDirection: 'column', gap: 20,
        opacity: leftProgress, transform: `translateX(${(1 - leftProgress) * -40}px)`,
      }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
            📁 DDT e Fatture
          </div>
          <div style={{ fontSize: 16, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
            Un tap → download immediato · in-app
          </div>
          {/* Badge novità */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
            background: `${palette.green}15`, borderRadius: 20, padding: '5px 14px',
            fontSize: 13, fontWeight: 700, color: palette.green, fontFamily: 'Inter, sans-serif',
            opacity: interpolate(frame, [20, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            ✨ Nessun accesso all'ERP richiesto
          </div>
        </div>

        <div style={{ background: palette.bgCard, borderRadius: 20, padding: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: palette.blue, fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>
            Ordine #4821 — Studio Dr. Bianchi
          </div>
          <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 16 }}>
            28/03/2026 · € 1.240,00
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, fontFamily: 'Inter, sans-serif' }}>
            Documenti di Trasporto (DDT)
          </div>

          {[
            { label: 'DDT-2026-00312', date: '28/03/2026', amount: '€ 1.240,00', progress: ddtProgress, color: palette.blue },
            { label: 'DDT-2026-00298', date: '21/03/2026', amount: '€ 890,00',   progress: 0,           color: palette.blue },
          ].map((doc, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0', borderBottom: `1px solid ${palette.divider}`,
            }}>
              <span style={{ fontSize: 24 }}>📄</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>{doc.label}</div>
                <div style={{ fontSize: 12, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>{doc.date} · {doc.amount}</div>
              </div>
              <DownloadIndicator progress={doc.progress} color={doc.color} />
            </div>
          ))}

          <div style={{ fontSize: 12, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginTop: 16, marginBottom: 10, fontFamily: 'Inter, sans-serif' }}>
            Fatture
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
            <span style={{ fontSize: 24 }}>🧾</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>FAT-2026-00187</div>
              <div style={{ fontSize: 12, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>31/03/2026 · € 1.512,80</div>
            </div>
            <DownloadIndicator progress={fatProgress} color={palette.green} />
          </div>
        </div>
      </div>

      {/* Pannello destro — tracking FedEx */}
      <div style={{
        flex: 1,
        opacity: trackingProgress,
        transform: `translateX(${(1 - trackingProgress) * 50}px)`,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
            🚚 Tracking FedEx
          </div>
          <div style={{ fontSize: 16, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
            Integrato nella scheda ordine · aggiornato in tempo reale
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
            background: `${palette.orange}15`, borderRadius: 20, padding: '5px 14px',
            fontSize: 13, fontWeight: 700, color: palette.orange, fontFamily: 'Inter, sans-serif',
            opacity: trackingProgress,
            boxShadow: `0 0 ${6 + Math.sin((frame / 10) * Math.PI) * 4}px ${palette.orange}40`,
          }}>
            📍 In consegna oggi — Milano
          </div>
        </div>

        <div style={{ background: palette.bgCard, borderRadius: 20, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', flex: 1 }}>
          <div style={{ fontSize: 12, fontFamily: 'monospace', color: palette.textMuted, marginBottom: 20, letterSpacing: 1 }}>
            FedEx · 774899172937
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {TRACKING_EVENTS.map((ev, i) => {
              const evDelay = TRACKING_FRAME + 25 + i * 28;
              const evOpacity = interpolate(frame, [evDelay, evDelay + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              const evX = interpolate(frame, [evDelay, evDelay + 20], [14, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
              const isActive = i === 3;

              return (
                <div key={i} style={{ display: 'flex', gap: 16, opacity: evOpacity, transform: `translateX(${evX}px)` }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28 }}>
                    <div style={{
                      fontSize: 18, flexShrink: 0,
                      transform: `scale(${isActive ? 1 + Math.sin((frame / 8) * Math.PI) * 0.1 : 1})`,
                    }}>
                      {ev.icon}
                    </div>
                    {i < TRACKING_EVENTS.length - 1 && (
                      <div style={{ width: 2, flex: 1, minHeight: 24, background: ev.done ? palette.green : palette.divider, marginTop: 3, marginBottom: 3, borderRadius: 2 }}>
                        {ev.done && (
                          <div style={{ height: `${lineProgress * 100}%`, background: palette.green, borderRadius: 2 }} />
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ paddingBottom: i < TRACKING_EVENTS.length - 1 ? 20 : 0 }}>
                    <div style={{ fontSize: 16, fontWeight: ev.done ? 700 : 500, color: ev.done ? palette.textPrimary : palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                      {ev.text}
                    </div>
                    <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
                      {ev.place} · {ev.time}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <SceneCaption
        main="DDT e fatture in un tap · Tracking FedEx integrato nella scheda ordine"
        vs="vs ERP: cerca il documento, scarica, invia manualmente — e per il tracking: telefonate"
        delay={30}
        color="#5856D6"
      />
    </div>
  );
}
```

- [ ] **Step 2: Warehouse.tsx — aggiungi SceneCaption**

Aggiungi:
```typescript
import { SceneCaption } from '../components/SceneCaption';
```
Aggiungi `position: 'relative'` al div root. Poi prima della chiusura del div root:
```tsx
<SceneCaption
  main="Stock in 2 secondi · Il tuo prezzo cliente, non il listino generico"
  vs="vs ERP: nessun check disponibilità in app — telefonate al magazzino ogni volta"
  delay={30}
  color="#FF9500"
/>
```

- [ ] **Step 3: Quotes.tsx — aggiungi SceneCaption**

Aggiungi:
```typescript
import { SceneCaption } from '../components/SceneCaption';
```
Aggiungi `position: 'relative'` al div root. Poi prima della chiusura:
```tsx
<SceneCaption
  main="Preventivo professionale in 3 secondi · Da condividere durante la visita"
  vs="vs ERP: nessuna funzione preventivi — Word, calcolo manuale, email"
  delay={30}
  color="#34C759"
/>
```

- [ ] **Step 4: Integrations.tsx — aggiungi SceneCaption**

Aggiungi:
```typescript
import { SceneCaption } from '../components/SceneCaption';
```
Aggiungi `position: 'relative'` al div root. Poi prima della chiusura:
```tsx
<SceneCaption
  main="WhatsApp, Gmail, Dropbox, Google Drive — connesso agli strumenti che usi"
  vs="vs ERP: nessuna integrazione — copia-incolla manuale tra app diverse"
  delay={30}
  color="#1C1C1E"
/>
```

- [ ] **Step 5: Notifications.tsx — aggiungi SceneCaption**

Aggiungi:
```typescript
import { SceneCaption } from '../components/SceneCaption';
```
Aggiungi `position: 'relative'` al div root. Poi prima della chiusura:
```tsx
<SceneCaption
  main="11 tipi di notifiche proattive · Formicanera ti avvisa prima che tu cerchi"
  vs="vs ERP: zero notifiche — l'agente deve controllare manualmente ogni informazione"
  delay={30}
  color="#FF9500"
/>
```

- [ ] **Step 6: Verifica TypeScript**
```bash
cd docs/commerciale/video && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**
```bash
git add docs/commerciale/video/src/scenes/Documents.tsx docs/commerciale/video/src/scenes/Warehouse.tsx docs/commerciale/video/src/scenes/Quotes.tsx docs/commerciale/video/src/scenes/Integrations.tsx docs/commerciale/video/src/scenes/Notifications.tsx
git commit -m "feat(video): Documents redesign, SceneCaption in tutte le scene rimanenti"
```

---

## Task H: Render video finale v2.1

**Files:**
- Output: `docs/commerciale/formicanera-demo-komet.mp4`

- [ ] **Step 1: TypeScript check finale**
```bash
cd docs/commerciale/video && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Render**
```bash
cd docs/commerciale/video
npx remotion render src/Root.tsx FormicaneraDemoVideo \
  out/formicanera-demo-komet-v2.1.mp4 \
  --codec=h264 \
  --crf=18 \
  --jpeg-quality=80
```

- [ ] **Step 3: Copia nelle destinazioni finali**
```bash
cp docs/commerciale/video/out/formicanera-demo-komet-v2.1.mp4 docs/commerciale/formicanera-demo-komet.mp4
cp docs/commerciale/video/out/formicanera-demo-komet-v2.1.mp4 docs/formicanera-demo-komet.mp4
```

- [ ] **Step 4: Commit finale**
```bash
git add docs/commerciale/formicanera-demo-komet.mp4 docs/formicanera-demo-komet.mp4
git commit -m "feat(video): render v2.1 — logo HD, Problem redesign, formiche, narrator captions, Dashboard gauge+confetti"
```

---

**Fine piano — 8 task, tutti i 10 miglioramenti richiesti coperti.**
