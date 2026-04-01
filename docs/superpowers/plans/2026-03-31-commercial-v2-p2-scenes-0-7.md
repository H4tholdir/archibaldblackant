# Formicanera Commercial v2 — Piano 2: Scene 0–7

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare le scene 0–7 del video Remotion v2 con animazioni Apple-style magistrali.

**Prerequisito:** Piano 1 (Foundation) completato.

**Spec completa:** `docs/superpowers/specs/2026-03-31-formicanera-commercial-v2-design.md`

**Working dir:** `docs/commerciale/video/`

**Principi animazione per ogni scena:**
- Ogni scena inizia con `opacity: fadeOut` sull'elemento root (`interpolate(frame, [dur-15, dur], [1, 0])`)
- Ogni animazione usa `spring()` o `interpolate()` con `easingApple`
- Nessun `transition` CSS — tutto guidato da `frame`
- Font sempre `fontFamily: 'Inter, sans-serif'`

---

### Task 10: Scena 0 — LogoIntro

**Files:**
- Modify: `src/scenes/LogoIntro.tsx`

- [ ] **Step 1: Scrivi la scena completa**

```typescript
// src/scenes/LogoIntro.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, staticFile, Img } from 'remotion';
import { springBounce, springText, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';

export function LogoIntro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.logo;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const logoProgress = spring({ frame, fps, config: springBounce, from: 0, to: 1 });
  const titleOpacity = interpolate(frame, [15, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [15, 35], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const taglineOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const taglineY = interpolate(frame, [30, 50], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });

  // Glow radiale animato
  const glowOpacity = interpolate(frame, [0, 30, 90, 105], [0, 0.08, 0.08, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

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
        gap: 20,
        opacity: fadeOut,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow radiale */}
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${palette.blue} 0%, transparent 65%)`,
          opacity: glowOpacity,
          pointerEvents: 'none',
        }}
      />

      {/* Logo */}
      <div
        style={{
          transform: `
            scale(${logoProgress})
            translateY(${(1 - logoProgress) * -60}px)
          `,
          opacity: logoProgress,
          filter: `drop-shadow(0 8px 24px rgba(0,122,255,0.25))`,
        }}
      >
        <Img
          src={staticFile('formicaneralogo.png')}
          style={{ width: 100, height: 100, objectFit: 'contain' }}
        />
      </div>

      {/* Formicanera */}
      <div
        style={{
          fontSize: 56,
          fontWeight: 900,
          color: palette.textPrimary,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: -1.5,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        Formicanera
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 400,
          color: palette.textMuted,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: 0.5,
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
        }}
      >
        Il vantaggio competitivo
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica in Remotion studio — la scena deve avere logo che entra dall'alto con bounce, testo che appare in sequenza**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/LogoIntro.tsx
git commit -m "feat(video/s0): LogoIntro — logo spring bounce, glow radiale, fade sequenziale"
```

---

### Task 11: Scena 1 — Problem

**Files:**
- Modify: `src/scenes/Problem.tsx`

- [ ] **Step 1: Scrivi la scena completa**

```typescript
// src/scenes/Problem.tsx
import { useCurrentFrame, interpolate, useVideoConfig } from 'remotion';
import { springText, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';

const PROBLEMS = [
  { text: 'Nessun accesso da mobile — zero app, zero responsive', severity: 'high' },
  { text: '20 minuti per piazzare un singolo ordine', severity: 'high' },
  { text: 'Zero notifiche proattive — l\'agente cerca sempre lui', severity: 'high' },
  { text: 'Operazioni identiche ripetute a mano ogni giorno', severity: 'mid' },
  { text: 'Dati dispersi in schermate diverse, nessun cruscotto', severity: 'mid' },
  { text: 'DDT e fatture: processo manuale separato per ogni file', severity: 'mid' },
  { text: 'Tracking spedizioni? Solo telefonate o app esterne', severity: 'low' },
  { text: 'Senza connessione: l\'agente è completamente cieco', severity: 'low' },
] as const;

const DOT_COLOR = { high: palette.red, mid: palette.orange, low: palette.textMuted };
const STAGGER = 40;

export function Problem() {
  const frame = useCurrentFrame();
  const dur = SCENE_FRAMES.problem;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Background transition: parte da bg (da LogoIntro), poi diventa dark
  const bgProgress = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const headerOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const subtitleOpacity = interpolate(frame, [360, 390], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bgDark,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 120px',
        opacity: fadeOut,
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: palette.textWhiteFaint,
          letterSpacing: 3,
          textTransform: 'uppercase',
          fontFamily: 'Inter, sans-serif',
          marginBottom: 48,
          opacity: headerOpacity,
          alignSelf: 'flex-start',
        }}
      >
        Lavorare con Archibald ERP nel 2026
      </div>

      {/* Lista problemi */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {PROBLEMS.map((p, i) => {
          const start = 30 + i * STAGGER;
          const rowOpacity = interpolate(frame, [start, start + 20], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          const rowX = interpolate(frame, [start, start + 25], [50, 0], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
          });

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                opacity: rowOpacity,
                transform: `translateX(${rowX}px)`,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: DOT_COLOR[p.severity],
                  flexShrink: 0,
                  boxShadow: `0 0 8px ${DOT_COLOR[p.severity]}80`,
                }}
              />
              <div
                style={{
                  fontSize: 24,
                  fontWeight: p.severity === 'high' ? 700 : 500,
                  color: p.severity === 'high'
                    ? palette.textWhite
                    : p.severity === 'mid'
                    ? palette.textWhiteDim
                    : palette.textWhiteFaint,
                  fontFamily: 'Inter, sans-serif',
                  lineHeight: 1.3,
                }}
              >
                {p.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sottotitolo finale */}
      <div
        style={{
          marginTop: 40,
          fontSize: 18,
          color: palette.textWhiteFaint,
          fontFamily: 'Inter, sans-serif',
          fontStyle: 'italic',
          alignSelf: 'flex-end',
          opacity: subtitleOpacity,
        }}
      >
        — Il lavoro quotidiano di un agente Komet
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica in studio — 8 punti in stagger con slide da destra, sfondo scuro**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/Problem.tsx
git commit -m "feat(video/s1): Problem — 8 punti stagger slide-in, severity colors, sfondo dark"
```

---

### Task 12: Scena 2 — Solution

**Files:**
- Modify: `src/scenes/Solution.tsx`

- [ ] **Step 1: Scrivi la scena completa**

```typescript
// src/scenes/Solution.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';

export function Solution() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.solution;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const preOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const titleProgress = spring({ frame: Math.max(0, frame - 20), fps, config: springBounce, from: 0, to: 1 });

  // Glow pulse ciclico
  const glowCycle = Math.sin((frame / 20) * Math.PI);
  const glowOpacity = interpolate(frame, [20, 50], [0, 0.35], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  }) * (0.7 + glowCycle * 0.3);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `linear-gradient(135deg, ${palette.blue} 0%, #0055D4 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        opacity: fadeOut,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow attorno al testo */}
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.10)',
          opacity: glowOpacity,
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      {/* "Poi arriva" */}
      <div
        style={{
          fontSize: 26,
          fontWeight: 300,
          color: 'rgba(255,255,255,0.70)',
          fontFamily: 'Inter, sans-serif',
          letterSpacing: 1,
          opacity: preOpacity,
          transform: `translateY(${(1 - preOpacity) * 10}px)`,
        }}
      >
        Poi arriva
      </div>

      {/* "Formicanera." */}
      <div
        style={{
          fontSize: 96,
          fontWeight: 900,
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          letterSpacing: -3,
          lineHeight: 1,
          transform: `scale(${0.6 + titleProgress * 0.4})`,
          opacity: titleProgress,
          textShadow: '0 4px 40px rgba(0,0,0,0.20)',
        }}
      >
        Formicanera.
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica — sfondo blu vivace, testo grande con spring bounce, glow pulsante**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/Solution.tsx
git commit -m "feat(video/s2): Solution — gradient blu, testo 96px spring bounce, glow pulse"
```

---

### Task 13: Scena 3 — Orders (Bot automatico)

**Files:**
- Modify: `src/scenes/Orders.tsx`

- [ ] **Step 1: Scrivi la scena completa**

```typescript
// src/scenes/Orders.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springBounce, springSnap, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { FrostedCard } from '../components/FrostedCard';
import { DarkCard } from '../components/DarkCard';
import { StatPill } from '../components/StatPill';
import { BadgeGreen } from '../components/BadgeGreen';
import { BotTimeline } from '../components/BotTimeline';

export function Orders() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.orders;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const headerOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const descOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // ERP ref line appare tardi nella scena
  const erpRefOpacity = interpolate(frame, [280, 310], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const erpRefX = interpolate(frame, [280, 310], [-20, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  // Progress bar ERP ref
  const erpBarWidth = interpolate(frame, [295, 380], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const botSteps = [
    { label: 'Login su Archibald ERP',    activeAtFrame: 0,   doneAtFrame: 30  },
    { label: 'Inserimento dati ordine',   activeAtFrame: 60,  doneAtFrame: 120 },
    { label: 'Conferma a Verona',         activeAtFrame: 150, doneAtFrame: 240 },
  ];

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
        gap: 32,
        opacity: fadeOut,
        padding: '0 80px',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 42, fontWeight: 800, color: palette.textPrimary,
          opacity: headerOpacity, fontFamily: 'Inter, sans-serif',
        }}>
          📋 Inserimento Ordini
        </div>
        <div style={{
          fontSize: 22, color: palette.textMuted,
          opacity: descOpacity, fontFamily: 'Inter, sans-serif', marginTop: 8,
        }}>
          L'agente compila dal telefono. Il bot registra su Archibald in automatico.
        </div>
      </div>

      {/* 3 colonne */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 52 }}>

        {/* Colonna sx — Order Card */}
        <FrostedCard delay={0} rotateY={-8} rotateX={3} fromX={-80} width={300} padding={28}>
          <div style={{ fontSize: 13, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, fontFamily: 'Inter, sans-serif' }}>
            Ordine #4821
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: palette.textPrimary, marginBottom: 4, fontFamily: 'Inter, sans-serif' }}>
            Studio Dr. Bianchi
          </div>
          <div style={{ fontSize: 42, fontWeight: 900, color: palette.blue, fontFamily: 'Inter, sans-serif', letterSpacing: -1 }}>
            € 1.240,00
          </div>
          <div style={{ marginTop: 14 }}>
            <BadgeGreen label="Inviato a Verona" delay={30} size="sm" />
          </div>
          {/* ERP ref */}
          <div style={{
            marginTop: 16,
            opacity: erpRefOpacity,
            transform: `translateX(${erpRefX}px)`,
          }}>
            <div style={{ fontSize: 12, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>
              Rif. ERP: STO-2026-4821
            </div>
            <div style={{ height: 4, background: palette.divider, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${erpBarWidth * 100}%`,
                background: palette.blue,
                borderRadius: 2,
              }} />
            </div>
          </div>
        </FrostedCard>

        {/* Colonna centrale — Stat */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <StatPill label="3 min" color={palette.blue} size="lg" delay={40} />
          <div style={{
            fontSize: 18, color: palette.textMuted,
            fontFamily: 'Inter, sans-serif',
            opacity: interpolate(frame, [80, 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            vs 20 min con Archibald
          </div>
        </div>

        {/* Colonna dx — Bot Card */}
        <DarkCard delay={60} fromX={80} width={290} padding={28}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: palette.textMuted,
            letterSpacing: 2, textTransform: 'uppercase', marginBottom: 20, fontFamily: 'Inter, sans-serif',
          }}>
            Bot Archibald
          </div>
          <BotTimeline steps={botSteps} delay={60} />
        </DarkCard>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica — 3 colonne bilanciate, bot timeline con 3 step progressivi**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/Orders.tsx
git commit -m "feat(video/s3): Orders — 3D card, bot timeline 3 step, stat pill, ERP ref"
```

---

### Task 14: Scena 4 — IvaAndTotals (NUOVA)

**Files:**
- Create: `src/scenes/IvaAndTotals.tsx`

- [ ] **Step 1: Scrivi la scena completa**

```typescript
// src/scenes/IvaAndTotals.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springSnap, springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { BadgeGreen } from '../components/BadgeGreen';

type Article = {
  name: string;
  code: string;
  qty: number;
  price: number;
  addAtFrame: number;
};

const ARTICLES: Article[] = [
  { name: 'Fresa conica Ø1.2',      code: 'FRE-012', qty: 2, price: 45.00,  addAtFrame: 20  },
  { name: 'Kit impianto standard',  code: 'KIT-STD', qty: 1, price: 320.00, addAtFrame: 80  },
  { name: 'Cemento provvisorio',     code: 'CEM-PRV', qty: 5, price: 12.00,  addAtFrame: 140 },
];

const DISCOUNT_FRAME  = 200;
const SHIPPING_FRAME  = 240;
const DONE_FRAME      = 300;

function subtotal(a: Article) { return a.qty * a.price; }
function totalAt(frame: number, discount: number) {
  const arts = ARTICLES.filter(a => a.addAtFrame <= frame);
  const raw  = arts.reduce((s, a) => s + subtotal(a), 0);
  return raw * (1 - discount / 100);
}

export function IvaAndTotals() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.iva;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const discount = frame >= DISCOUNT_FRAME
    ? interpolate(frame, [DISCOUNT_FRAME, DISCOUNT_FRAME + 30], [0, 15], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
      })
    : 0;

  const currentTotal = totalAt(frame, discount);
  const iva22 = currentTotal * 0.22;
  const grandTotal = currentTotal + iva22;

  const panelProgress = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: springCard,
    from: 0,
    to: 1,
  });

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
        gap: 24,
        opacity: fadeOut,
        padding: '0 80px',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 42, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          🧮 Totali e IVA Automatizzati
        </div>
        <div style={{ fontSize: 20, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 8 }}>
          Ogni modifica aggiorna il totale in tempo reale — zero calcoli manuali
        </div>
      </div>

      <div style={{ display: 'flex', gap: 40, width: '100%', maxWidth: 1100, alignItems: 'flex-start' }}>

        {/* Form articoli */}
        <div style={{ flex: 1 }}>
          <div style={{
            background: palette.bgCard,
            borderRadius: 20,
            padding: 28,
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 20, fontFamily: 'Inter, sans-serif' }}>
              Articoli ordine
            </div>
            {ARTICLES.map((art, i) => {
              const rowOpacity = interpolate(frame, [art.addAtFrame, art.addAtFrame + 20], [0, 1], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              });
              const rowX = interpolate(frame, [art.addAtFrame, art.addAtFrame + 25], [-30, 0], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
              });
              return (
                <div key={i} style={{
                  opacity: rowOpacity,
                  transform: `translateX(${rowX}px)`,
                  borderBottom: `1px solid ${palette.divider}`,
                  paddingBottom: 16,
                  marginBottom: 16,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                        {art.name}
                      </div>
                      <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
                        {art.code} · {art.qty} pz × €{art.price.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: palette.blue, fontFamily: 'Inter, sans-serif' }}>
                      <AnimatedNumber
                        from={0} to={subtotal(art)}
                        delay={art.addAtFrame} durationInFrames={25}
                        prefix="€ " decimals={2}
                        euroFormat fontSize={20} fontWeight={800} color={palette.blue}
                        pulse
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Sconto slider */}
            {frame >= DISCOUNT_FRAME - 10 && (
              <div style={{
                opacity: interpolate(frame, [DISCOUNT_FRAME - 10, DISCOUNT_FRAME + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                marginTop: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>Sconto testata</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: palette.orange, fontFamily: 'Inter, sans-serif' }}>
                    {discount.toFixed(0)}%
                  </span>
                </div>
                <div style={{ height: 6, background: palette.divider, borderRadius: 100, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${discount / 30 * 100}%`,
                    background: palette.orange,
                    borderRadius: 100,
                    boxShadow: `0 0 6px ${palette.orange}60`,
                  }} />
                </div>
              </div>
            )}

            {/* Spese trasporto */}
            {frame >= SHIPPING_FRAME && (
              <div style={{
                opacity: interpolate(frame, [SHIPPING_FRAME, SHIPPING_FRAME + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span style={{ fontSize: 14, color: palette.green, fontFamily: 'Inter, sans-serif' }}>✓</span>
                <span style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                  Imponibile &gt; €200 · <strong style={{ color: palette.green }}>Trasporto gratuito</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Pannello riepilogo live */}
        <div style={{
          width: 280,
          background: palette.bgCard,
          borderRadius: 20,
          padding: 24,
          boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
          borderTop: `3px solid ${palette.blue}`,
          opacity: panelProgress,
          transform: `translateY(${(1 - panelProgress) * 20}px)`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 20, fontFamily: 'Inter, sans-serif' }}>
            Riepilogo live
          </div>

          {[
            { label: 'Imponibile', value: currentTotal, color: palette.textPrimary },
            { label: 'IVA 22%',    value: iva22,        color: palette.green       },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 16, color: palette.textSecondary, fontFamily: 'Inter, sans-serif' }}>{label}</span>
              <AnimatedNumber
                from={0} to={value} delay={20} durationInFrames={20}
                prefix="€ " decimals={2} euroFormat
                fontSize={16} fontWeight={700} color={color} pulse
              />
            </div>
          ))}

          <div style={{ height: 1, background: palette.divider, margin: '12px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>Totale</span>
            <AnimatedNumber
              from={0} to={grandTotal} delay={20} durationInFrames={20}
              prefix="€ " decimals={2} euroFormat
              fontSize={26} fontWeight={900} color={palette.blue} pulse
            />
          </div>

          {frame >= DONE_FRAME && (
            <div style={{ marginTop: 16 }}>
              <BadgeGreen label="Calcolo automatico" delay={DONE_FRAME} size="sm" />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica — articoli appaiono in sequenza, totale si aggiorna live, IVA verde**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/IvaAndTotals.tsx
git commit -m "feat(video/s4): IvaAndTotals — form live, riepilogo animato, sconto slider"
```

---

### Task 15: Scena 5 — PendingOrders (NUOVA)

**Files:**
- Create: `src/scenes/PendingOrders.tsx`

- [ ] **Step 1: Scrivi la scena completa**

```typescript
// src/scenes/PendingOrders.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springBounce, springSnap, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { ProgressBar } from '../components/ProgressBar';
import { BadgeGreen } from '../components/BadgeGreen';

const CARDS = [
  { client: 'Studio Dr. Bianchi',  amount: 1240, addAtFrame: 20  },
  { client: 'Lab. Dott. Rossi',    amount: 890,  addAtFrame: 70  },
  { client: 'Clinica Azzurra',     amount: 2100, addAtFrame: 120 },
  { client: 'Studio Marino',       amount: 445,  addAtFrame: 170 },
];

const SEND_FRAME = 240; // frame in cui scatta l'invio

export function PendingOrders() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.pending;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const total = CARDS.filter(c => c.addAtFrame <= frame).reduce((s, c) => s + c.amount, 0);
  const isSending = frame >= SEND_FRAME;

  const buttonScale = isSending
    ? interpolate(frame, [SEND_FRAME, SEND_FRAME + 6, SEND_FRAME + 12], [1, 0.94, 1], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      })
    : spring({ frame: Math.max(0, frame - 210), fps, config: springBounce, from: 0, to: 1 });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 28, opacity: fadeOut, padding: '0 200px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 42, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          📥 Pending Orders
        </div>
        <div style={{ fontSize: 20, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 8 }}>
          Accumula gli ordini durante la giornata, invia tutto quando vuoi
        </div>
      </div>

      {/* Lista card */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CARDS.map((card, i) => {
          const visible = frame >= card.addAtFrame;
          const progress = spring({
            frame: Math.max(0, frame - card.addAtFrame),
            fps, config: springCard, from: 0, to: 1,
          });

          // Dopo SEND_FRAME → mostra progress bar
          const sendDelay = SEND_FRAME + i * 40;
          const sendProgress = interpolate(frame, [sendDelay, sendDelay + 60], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
          });
          const isDone = frame >= sendDelay + 60;

          if (!visible) return null;

          return (
            <div key={i} style={{
              opacity: progress,
              transform: `translateY(${(1 - progress) * -30 + i * 2}px)`,
            }}>
              {!isSending ? (
                // Card normale
                <div style={{
                  background: palette.bgCard,
                  borderRadius: 16, padding: '16px 20px',
                  boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                      {card.client}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: palette.blue, fontFamily: 'Inter, sans-serif' }}>
                      € {card.amount.toLocaleString('it-IT')},00
                    </span>
                    <span style={{
                      background: `${palette.orange}20`,
                      color: palette.orange,
                      fontSize: 13, fontWeight: 700, borderRadius: 20,
                      padding: '4px 12px', fontFamily: 'Inter, sans-serif',
                    }}>
                      In attesa
                    </span>
                  </div>
                </div>
              ) : (
                // Card → progress bar
                <div style={{
                  background: isDone ? `${palette.green}15` : palette.bgCard,
                  borderRadius: 16, padding: '16px 20px',
                  boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
                  border: isDone ? `1.5px solid ${palette.green}40` : '1.5px solid transparent',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: isDone ? 0 : 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: isDone ? palette.green : palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                      {isDone ? '✓ ' : ''}{card.client}
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: isDone ? palette.green : palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                      € {card.amount.toLocaleString('it-IT')},00
                    </span>
                  </div>
                  {!isDone && (
                    <ProgressBar
                      progress={sendProgress}
                      animate={false}
                      color={palette.blue}
                      height={6}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Totale + Button */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 18, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
          Totale accumulato:{' '}
          <span style={{ fontWeight: 800, color: palette.textPrimary }}>
            € <AnimatedNumber from={0} to={total} delay={20} durationInFrames={30} decimals={0} euroFormat fontSize={18} fontWeight={800} color={palette.textPrimary} />
          </span>
        </div>

        {!isSending && (
          <div style={{
            background: palette.blue,
            color: '#fff',
            borderRadius: 14, padding: '14px 32px',
            fontSize: 18, fontWeight: 700,
            fontFamily: 'Inter, sans-serif',
            transform: `scale(${typeof buttonScale === 'number' ? buttonScale : 1})`,
            boxShadow: `0 8px 32px ${palette.blue}50`,
            cursor: 'pointer',
          }}>
            Invia tutti a Verona →
          </div>
        )}

        {/* Badge finale */}
        {frame >= SEND_FRAME + CARDS.length * 40 + 60 && (
          <BadgeGreen label={`${CARDS.length}/${CARDS.length} Inviati`} delay={SEND_FRAME + CARDS.length * 40 + 60} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica — card si accumulano, trasformano in progress bar, badge finale**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/PendingOrders.tsx
git commit -m "feat(video/s5): PendingOrders — card accumulo, send animation, progress bars"
```

---

### Task 16: Scena 6 — Storico (NUOVA)

**Files:**
- Create: `src/scenes/Storico.tsx`

- [ ] **Step 1: Scrivi la scena completa**

```typescript
// src/scenes/Storico.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springSnap, springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { SearchBar } from '../components/SearchBar';
import { BadgeGreen } from '../components/BadgeGreen';

const ORDERS = [
  { id: '#4821', date: '28/03/26', client: 'Dr. Bianchi',    amount: '€ 1.240', status: 'Confermato' },
  { id: '#4756', date: '21/03/26', client: 'Dr. Bianchi',    amount: '€ 890',   status: 'Confermato' },
  { id: '#4700', date: '14/03/26', client: 'Dr. Bianchi',    amount: '€ 2.100', status: 'Confermato' },
  { id: '#4651', date: '07/03/26', client: 'Dr. Bianchi',    amount: '€ 445',   status: 'Confermato' },
  { id: '#4580', date: '28/02/26', client: 'Dr. Bianchi',    amount: '€ 1.650', status: 'Confermato' },
];

// Articoli dell'ordine #4700 (matching "fresa")
const ARTICLES = [
  { name: 'Fresa conica Ø1.2',    code: 'FRE-012', qty: 4,  match: true  },
  { name: 'Kit impianto standard', code: 'KIT-STD', qty: 1,  match: false },
  { name: 'Fresa cilindrica Ø2',  code: 'FRE-020', qty: 2,  match: true  },
  { name: 'Cemento provvisorio',   code: 'CEM-PRV', qty: 10, match: false },
];

const SEARCH_START   = 100;  // frame in cui appare la search bar
const TYPING_START   = 120;  // frame in cui inizia il typing
const EXPAND_FRAME   = 220;  // frame in cui espande l'ordine #4700
const SELECT_FRAME   = 280;  // frame in cui si selezionano gli articoli
const FLY_FRAME      = 380;  // frame in cui parte l'animazione fly
const SPLIT_FRAME    = 360;  // frame in cui diventa split screen

export function Storico() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.storico;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const isSplit = frame >= SPLIT_FRAME;

  // Fase ricerca: quante righe matchano "fresa"
  const queryComplete = frame >= TYPING_START + 5 * 6; // "fresa" = 5 chars × 6f
  const showMatches = queryComplete;

  // Articoli selezionati (i due con match:true, selezione animata)
  const sel0 = interpolate(frame, [SELECT_FRAME, SELECT_FRAME + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sel1 = interpolate(frame, [SELECT_FRAME + 15, SELECT_FRAME + 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const selectionVisible = frame >= SELECT_FRAME;

  // Fly animation progress (frame 380-450)
  const flyProgress = interpolate(frame, [FLY_FRAME, FLY_FRAME + 50], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  // Form panel a destra
  const formProgress = spring({
    frame: Math.max(0, frame - SPLIT_FRAME),
    fps, config: springCard, from: 0, to: 1,
  });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      opacity: fadeOut, padding: '48px 80px',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 38, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          🗂 Storico Ordini
        </div>
        <div style={{ fontSize: 18, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
          Dr. Bianchi · <span style={{ fontWeight: 700, color: palette.blue }}>47 ordini</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, flex: 1 }}>
        {/* Pannello sinistro — lista */}
        <div style={{
          flex: isSplit ? '0 0 45%' : '1',
          transition: 'flex 0.3s',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Search bar */}
          {frame >= SEARCH_START && (
            <SearchBar
              query="fresa"
              typingStartFrame={TYPING_START}
              framesPerChar={6}
              delay={SEARCH_START}
              resultCount={showMatches ? 3 : undefined}
            />
          )}

          {/* Ordini */}
          {ORDERS.map((order, i) => {
            const rowProgress = spring({
              frame: Math.max(0, frame - i * 12),
              fps, config: springCard, from: 0, to: 1,
            });
            const isExpanded = frame >= EXPAND_FRAME && i === 2; // #4700
            const isHighlighted = showMatches && (i === 1 || i === 2 || i === 4);

            return (
              <div key={i}>
                <div style={{
                  background: palette.bgCard,
                  borderRadius: 12,
                  padding: '14px 18px',
                  opacity: rowProgress,
                  transform: `translateY(${(1 - rowProgress) * 10}px)`,
                  boxShadow: isHighlighted ? `0 0 0 2px ${palette.yellow}60, 0 4px 16px rgba(0,0,0,0.06)` : '0 2px 12px rgba(0,0,0,0.05)',
                  borderLeft: isHighlighted ? `3px solid ${palette.yellow}` : '3px solid transparent',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: palette.blue, fontFamily: 'Inter, sans-serif' }}>
                        {order.id}
                      </span>
                      <span style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                        {order.date}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                        {order.amount}
                      </span>
                      <span style={{
                        background: `${palette.green}20`, color: palette.green,
                        fontSize: 12, fontWeight: 700, borderRadius: 20, padding: '3px 10px',
                        fontFamily: 'Inter, sans-serif',
                      }}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Articoli espansi di #4700 */}
                {isExpanded && (
                  <div style={{
                    background: `${palette.blue}06`,
                    borderRadius: '0 0 12px 12px',
                    padding: '12px 18px',
                    marginTop: -4,
                    opacity: interpolate(frame, [EXPAND_FRAME, EXPAND_FRAME + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                  }}>
                    {ARTICLES.map((art, j) => {
                      const selProg = art.match ? (j === 0 ? sel0 : sel1) : 0;
                      return (
                        <div key={j} style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '6px 0',
                          borderBottom: j < ARTICLES.length - 1 ? `1px solid ${palette.divider}` : 'none',
                        }}>
                          {/* Checkbox */}
                          <div style={{
                            width: 20, height: 20, borderRadius: 6,
                            border: `2px solid ${selProg > 0.5 ? palette.blue : palette.divider}`,
                            background: selProg > 0.5 ? palette.blue : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, color: '#fff', fontWeight: 700,
                            transform: `scale(${0.8 + selProg * 0.2})`,
                            transition: 'none',
                          }}>
                            {selProg > 0.5 ? '✓' : ''}
                          </div>
                          <div>
                            <span style={{
                              fontSize: 14, fontWeight: art.match ? 700 : 400,
                              color: art.match ? palette.blue : palette.textSecondary,
                              fontFamily: 'Inter, sans-serif',
                              background: art.match && showMatches ? `${palette.yellow}40` : 'transparent',
                              padding: art.match ? '1px 4px' : '0',
                              borderRadius: 4,
                            }}>
                              {art.name}
                            </span>
                            <span style={{ fontSize: 12, color: palette.textMuted, marginLeft: 8, fontFamily: 'Inter, sans-serif' }}>
                              {art.qty} pz
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {selectionVisible && (
                      <div style={{
                        marginTop: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        opacity: interpolate(frame, [SELECT_FRAME + 25, SELECT_FRAME + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                      }}>
                        <span style={{ fontSize: 14, color: palette.blue, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                          2 articoli selezionati
                        </span>
                        <div style={{
                          background: palette.blue, color: '#fff',
                          borderRadius: 10, padding: '8px 16px',
                          fontSize: 13, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                          boxShadow: `0 4px 16px ${palette.blue}40`,
                          opacity: flyProgress < 0.1 ? 1 : interpolate(flyProgress, [0, 0.3], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                        }}>
                          Copia in nuovo ordine →
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pannello destro — nuovo ordine (split screen) */}
        {isSplit && (
          <div style={{
            flex: '1',
            opacity: formProgress,
            transform: `translateX(${(1 - formProgress) * 60}px)`,
          }}>
            <div style={{
              background: palette.bgCard,
              borderRadius: 20, padding: 24,
              boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
              borderTop: `3px solid ${palette.blue}`,
              height: '100%',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', marginBottom: 16 }}>
                ✨ Nuovo Ordine
              </div>
              <div style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 16 }}>
                Dr. Bianchi · Pre-compilato
              </div>
              {ARTICLES.filter(a => a.match).map((art, j) => {
                const artProgress = spring({
                  frame: Math.max(0, frame - FLY_FRAME - j * 20),
                  fps, config: springSnap, from: 0, to: 1,
                });
                return (
                  <div key={j} style={{
                    opacity: artProgress,
                    transform: `scale(${0.9 + artProgress * 0.1}) translateY(${(1 - artProgress) * 10}px)`,
                    background: `${palette.blue}08`,
                    borderRadius: 10, padding: '12px 14px',
                    marginBottom: 8,
                    border: `1px solid ${palette.blue}20`,
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                      {art.name}
                    </div>
                    <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
                      {art.code} · {art.qty} pz
                    </div>
                  </div>
                );
              })}
              {frame >= FLY_FRAME + 50 && (
                <div style={{ marginTop: 16 }}>
                  <BadgeGreen label="Ordine pre-compilato" delay={FLY_FRAME + 50} size="sm" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica — ricerca live, highlight giallo, selezione articoli, split screen con fly**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/Storico.tsx
git commit -m "feat(video/s6): Storico — live search, highlight, checkbox selection, split-screen copy"
```

---

### Task 17: Scena 7 — Clients (REDESIGN)

**Files:**
- Create: `src/scenes/Clients.tsx`
- Note: il vecchio `Customers.tsx` viene sostituito — verrà rimosso in Task 20 (Video.tsx)

- [ ] **Step 1: Scrivi la scena completa**

```typescript
// src/scenes/Clients.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, springSnap, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { BadgeGreen } from '../components/BadgeGreen';
import { ProgressBar } from '../components/ProgressBar';

const WIZARD_STEPS = [
  'Dati aziendali',
  'Partita IVA',
  'Indirizzo',
  'Contatti',
  'Pagamento',
  'Revisione',
];

const PIVA_TYPING_START = 180;
const PIVA = '04821760652';
const PIVA_CHARS_PER_FRAME = 6;
const VALIDATION_FRAME = PIVA_TYPING_START + PIVA.length * PIVA_CHARS_PER_FRAME + 10;
const AUTOFILL_FRAME = VALIDATION_FRAME + 40;
const BOT_FRAME = 460;

export function Clients() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.clients;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Fase 1: scheda cliente (0 - 150)
  // Fase 2: wizard (150 - fine)
  const isWizard = frame >= 150;

  const cardProgress = spring({ frame, fps, config: springCard, from: 0, to: 1 });
  const wizardProgress = spring({ frame: Math.max(0, frame - 150), fps, config: springCard, from: 0, to: 1 });

  const activeStep = Math.min(
    Math.floor(Math.max(0, (frame - 150) / 55)),
    WIZARD_STEPS.length - 1
  );

  const pivaChars = Math.floor(Math.max(0, (frame - PIVA_TYPING_START) / PIVA_CHARS_PER_FRAME));
  const pivaDisplay = PIVA.slice(0, pivaChars);

  const isValidating = frame >= VALIDATION_FRAME - 10 && frame < AUTOFILL_FRAME;
  const isValidated = frame >= AUTOFILL_FRAME;

  const spinnerAngle = interpolate(frame, [VALIDATION_FRAME, VALIDATION_FRAME + 30], [0, 360], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const botSpinnerOpacity = frame >= BOT_FRAME && frame < BOT_FRAME + 40 ? 1 : 0;
  const botDoneOpacity = interpolate(frame, [BOT_FRAME + 40, BOT_FRAME + 55], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, opacity: fadeOut, padding: '0 120px',
    }}>

      {!isWizard ? (
        /* Fase 1 — Scheda cliente */
        <>
          <div style={{ fontSize: 42, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', marginBottom: 8 }}>
            👤 Schede Clienti Migliorate
          </div>

          <div style={{ display: 'flex', gap: 32, width: '100%' }}>
            {/* Card cliente */}
            <div style={{
              background: palette.bgCard, borderRadius: 20, padding: 28,
              boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
              width: 360, flexShrink: 0,
              opacity: cardProgress,
              transform: `translateX(${(1 - cardProgress) * -50}px)`,
            }}>
              {/* Avatar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${palette.blue}, ${palette.purple})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'Inter, sans-serif',
                }}>
                  DB
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                    Studio Dr. Bianchi
                  </div>
                  <div style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                    Cliente dal 2019
                  </div>
                </div>
              </div>

              {/* Campi */}
              {[
                { label: 'P.IVA', value: '04821760652' },
                { label: 'Indirizzo', value: 'Via Roma 12, Napoli' },
                { label: 'Email', value: 'bianchi@studiodent.it' },
                { label: 'Telefono', value: '+39 081 1234567' },
              ].map(({ label, value }, i) => {
                const fieldOpacity = interpolate(frame, [20 + i * 15, 40 + i * 15], [0, 1], {
                  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                });
                return (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '10px 0', borderBottom: `1px solid ${palette.divider}`,
                    opacity: fieldOpacity,
                  }}>
                    <span style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', textAlign: 'right' }}>
                      {value}
                    </span>
                  </div>
                );
              })}

              <div style={{ marginTop: 16 }}>
                <BadgeGreen label="Profilo completo" delay={80} size="sm" />
              </div>
            </div>

            {/* Storico inline */}
            <div style={{
              flex: 1,
              background: palette.bgCard, borderRadius: 20, padding: 24,
              boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
              opacity: interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16, fontFamily: 'Inter, sans-serif' }}>
                Storico ordini
              </div>
              {[
                { id: '#4821', amount: '€ 1.240', date: '28 Mar' },
                { id: '#4756', amount: '€ 890',   date: '21 Mar' },
                { id: '#4700', amount: '€ 2.100', date: '14 Mar' },
                { id: '#4651', amount: '€ 445',   date: '07 Mar' },
                { id: '#4580', amount: '€ 1.650', date: '28 Feb' },
              ].map((o, j) => {
                const rowP = spring({ frame: Math.max(0, frame - 40 - j * 12), fps, config: springCard, from: 0, to: 1 });
                return (
                  <div key={j} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: `1px solid ${palette.divider}`,
                    opacity: rowP, transform: `translateX(${(1 - rowP) * 10}px)`,
                  }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: palette.blue, fontFamily: 'Inter, sans-serif' }}>{o.id}</span>
                    <span style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>{o.date}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>{o.amount}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        /* Fase 2 — Wizard */
        <div style={{
          opacity: wizardProgress,
          transform: `translateY(${(1 - wizardProgress) * 30}px)`,
          width: '100%', maxWidth: 620,
        }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 38, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
              ✨ Nuovo Cliente — Wizard
            </div>
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
            {WIZARD_STEPS.map((s, i) => (
              <div key={i} style={{
                flex: 1, height: 4, borderRadius: 100,
                background: i <= activeStep ? palette.blue : palette.divider,
                transition: 'none',
              }} />
            ))}
          </div>

          <div style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif', textAlign: 'center', marginBottom: 24 }}>
            Step {activeStep + 1} di {WIZARD_STEPS.length} — {WIZARD_STEPS[activeStep]}
          </div>

          {/* Content step 1 (P.IVA) */}
          <div style={{
            background: palette.bgCard, borderRadius: 20, padding: 28,
            boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
          }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: palette.textMuted, marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>
                Partita IVA
              </div>
              <div style={{
                background: palette.bg, borderRadius: 12, padding: '14px 16px',
                border: `1.5px solid ${isValidated ? palette.green : isValidating ? palette.blue : palette.divider}`,
                fontSize: 20, fontWeight: 600, fontFamily: 'monospace',
                color: palette.textPrimary, letterSpacing: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>{pivaDisplay || '—'}</span>
                {isValidating && (
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: `2px solid ${palette.blue}`,
                    borderTopColor: 'transparent',
                    display: 'inline-block',
                    transform: `rotate(${spinnerAngle}deg)`,
                  }} />
                )}
                {isValidated && (
                  <span style={{ color: palette.green, fontSize: 18 }}>✓</span>
                )}
              </div>
            </div>

            {isValidated && (
              <div style={{
                opacity: interpolate(frame, [AUTOFILL_FRAME, AUTOFILL_FRAME + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}>
                <BadgeGreen label="P.IVA verificata — dati auto-compilati" delay={AUTOFILL_FRAME} size="sm" />
                {[
                  { label: 'Ragione sociale', value: 'Studio Dentistico Dr. Bianchi' },
                  { label: 'C.F.', value: 'BNCMRC80A01F839G' },
                  { label: 'PEC', value: 'bianchi@pec.it' },
                  { label: 'Sede legale', value: 'Via Roma 12, Napoli' },
                ].map(({ label, value }, i) => {
                  const fOpacity = interpolate(frame, [AUTOFILL_FRAME + 10 + i * 12, AUTOFILL_FRAME + 25 + i * 12], [0, 1], {
                    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                  });
                  return (
                    <div key={i} style={{
                      marginTop: 10, opacity: fOpacity,
                      display: 'flex', gap: 12,
                    }}>
                      <span style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', minWidth: 100 }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                        {value}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bot action */}
            {frame >= BOT_FRAME && (
              <div style={{
                marginTop: 20,
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: interpolate(frame, [BOT_FRAME, BOT_FRAME + 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}>
                <span style={{ fontSize: 20 }}>🤖</span>
                {botSpinnerOpacity > 0 && (
                  <span style={{ fontSize: 16, color: palette.blue, fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                    Bot crea il cliente su Archibald...
                  </span>
                )}
                {frame >= BOT_FRAME + 40 && (
                  <span style={{ fontSize: 16, color: palette.green, fontFamily: 'Inter, sans-serif', fontWeight: 700, opacity: botDoneOpacity }}>
                    ✓ Cliente creato su ERP
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verifica — scheda cliente split con storico, wizard con P.IVA typing e validazione**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/Clients.tsx
git commit -m "feat(video/s7): Clients — scheda split+storico, wizard P.IVA typing+validazione+bot"
```

---

**Fine Piano 2.** Proseguire con `2026-03-31-commercial-v2-p3-scenes-8-14.md`.
