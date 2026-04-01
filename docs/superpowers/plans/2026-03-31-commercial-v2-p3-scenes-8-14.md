# Formicanera Commercial v2 — Piano 3: Scene 8–14 + Integrazione + Testi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare scene 8–14, aggiornare Video.tsx + Root.tsx, aggiornare testi commerciali, render finale.

**Prerequisiti:** Piano 1 (Foundation) + Piano 2 (Scene 0–7) completati.

**Spec completa:** `docs/superpowers/specs/2026-03-31-formicanera-commercial-v2-design.md`

**Working dir:** `docs/commerciale/video/` (video), radice repo (testi)

---

### Task 18: Scena 8 — Warehouse

**Files:**
- Create: `src/scenes/Warehouse.tsx`

- [ ] **Step 1: Scrivi la scena completa**

```typescript
// src/scenes/Warehouse.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, springSnap, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { SearchBar } from '../components/SearchBar';
import { BadgeGreen } from '../components/BadgeGreen';
import { ProgressBar } from '../components/ProgressBar';

type Product = {
  name: string;
  code: string;
  stock: number;
  status: 'ok' | 'low' | 'out';
  price: number;
  delay: number;
};

const PRODUCTS: Product[] = [
  { name: 'Fresa conica Ø1.2',       code: 'FRE-012', stock: 48, status: 'ok',  price: 45.00, delay: 20  },
  { name: 'Fresa sferica Ø0.8',      code: 'FRE-008', stock: 12, status: 'ok',  price: 52.00, delay: 35  },
  { name: 'Fresa cilindrica Ø2',     code: 'FRE-020', stock: 3,  status: 'low', price: 48.00, delay: 50  },
  { name: 'Fresa bullet Ø1.5',       code: 'FRE-015', stock: 0,  status: 'out', price: 39.00, delay: 65  },
  { name: 'Fresa torque control Ø1', code: 'FRE-010', stock: 27, status: 'ok',  price: 61.00, delay: 80  },
  { name: 'Fresa finisher Ø1.8',     code: 'FRE-018', stock: 8,  status: 'low', price: 44.00, delay: 95  },
];

const EXPAND_FRAME  = 120;  // espande il primo prodotto
const CHECK_FRAME   = 300;  // check istantaneo
const CHECK_DONE    = 340;

const STOCK_COLOR = {
  ok:  palette.green,
  low: palette.orange,
  out: palette.red,
};
const STOCK_LABEL = {
  ok:  (n: number) => `In magazzino: ${n} pz`,
  low: (n: number) => `Ultimi ${n} pz`,
  out: (_: number) => 'Esaurito',
};

export function Warehouse() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.warehouse;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const isExpanded = frame >= EXPAND_FRAME;
  const isChecking = frame >= CHECK_FRAME && frame < CHECK_DONE;
  const isDone     = frame >= CHECK_DONE;

  // Stock bar pulsante per verifica
  const checkPulse = isChecking
    ? 0.6 + Math.sin((frame / 5) * Math.PI) * 0.4
    : 1;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, opacity: fadeOut, padding: '0 120px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 42, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          📦 Catalogo & Check Magazzino
        </div>
        <div style={{ fontSize: 20, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 8 }}>
          Stock in tempo reale per ogni articolo, con il tuo prezzo cliente
        </div>
      </div>

      {/* SearchBar */}
      <div style={{ width: '100%', maxWidth: 620 }}>
        <SearchBar
          query="fresa conica"
          typingStartFrame={10}
          framesPerChar={6}
          delay={0}
          resultCount={6}
        />
      </div>

      {/* Lista prodotti + dettaglio espanso */}
      <div style={{ width: '100%', maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PRODUCTS.map((p, i) => {
          const rowProgress = spring({
            frame: Math.max(0, frame - p.delay),
            fps, config: springCard, from: 0, to: 1,
          });
          const stockColor = STOCK_COLOR[p.status];

          return (
            <div key={i}>
              <div style={{
                background: palette.bgCard, borderRadius: 14, padding: '14px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                opacity: rowProgress,
                transform: `translateY(${(1 - rowProgress) * 15}px)`,
                border: i === 0 && isExpanded ? `1.5px solid ${palette.blue}40` : '1.5px solid transparent',
              }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
                    {p.code}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{
                    background: `${stockColor}18`,
                    color: stockColor,
                    fontSize: 13, fontWeight: 700, borderRadius: 20,
                    padding: '4px 12px', fontFamily: 'Inter, sans-serif',
                  }}>
                    {STOCK_LABEL[p.status](p.stock)}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: palette.blue, fontFamily: 'Inter, sans-serif' }}>
                    € {p.price.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Dettaglio espanso del primo prodotto */}
              {i === 0 && isExpanded && (
                <div style={{
                  background: `${palette.blue}06`,
                  borderRadius: '0 0 14px 14px', padding: '16px 18px',
                  marginTop: -4,
                  opacity: interpolate(frame, [EXPAND_FRAME, EXPAND_FRAME + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                }}>
                  {/* Stock bar */}
                  <div style={{ marginBottom: 12 }}>
                    <ProgressBar
                      progress={p.stock / 60}
                      animate={false}
                      color={palette.green}
                      height={8}
                      label="Disponibilità magazzino"
                      showPercent
                      bgColor={palette.divider}
                    />
                  </div>
                  {/* Info */}
                  <div style={{ display: 'flex', gap: 20, fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 14 }}>
                    <span>Cod. ERP: <strong style={{ color: palette.textPrimary }}>{p.code}-STD</strong></span>
                    <span>Ultimo ord.: <strong style={{ color: palette.textPrimary }}>15/03 · 10 pz</strong></span>
                    <span>Prezzo cliente: <strong style={{ color: palette.blue }}>€ {p.price.toFixed(2)}</strong></span>
                  </div>

                  {/* Check button / risultato */}
                  {!isDone ? (
                    <div style={{
                      background: palette.blue,
                      color: '#fff', borderRadius: 12, padding: '10px 20px',
                      fontSize: 15, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      boxShadow: `0 4px 16px ${palette.blue}40`,
                      opacity: isChecking ? checkPulse : spring({
                        frame: Math.max(0, frame - EXPAND_FRAME - 20),
                        fps, config: springBounce, from: 0, to: 1,
                      }),
                    }}>
                      {isChecking ? (
                        <>
                          <span style={{
                            width: 16, height: 16, borderRadius: '50%',
                            border: '2px solid rgba(255,255,255,0.4)',
                            borderTopColor: '#fff',
                            display: 'inline-block',
                            transform: `rotate(${frame * 12}deg)`,
                          }} />
                          Verifica disponibilità...
                        </>
                      ) : (
                        'Verifica disponibilità →'
                      )}
                    </div>
                  ) : (
                    <BadgeGreen label="Disponibile: 48 pz · Pronta consegna" delay={CHECK_DONE} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica — lista prodotti con stock badge colorati, dettaglio espanso, check animato**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/Warehouse.tsx
git commit -m "feat(video/s8): Warehouse — ricerca catalogo, stock badge, check istantaneo animato"
```

---

### Task 19: Scena 9 — Quotes

**Files:**
- Create: `src/scenes/Quotes.tsx`

- [ ] **Step 1: Scrivi la scena completa**

```typescript
// src/scenes/Quotes.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, springSnap, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { BadgeGreen } from '../components/BadgeGreen';

const TAP_FRAME       = 80;
const BUILD_START     = 100;
const BUILD_END       = 200;
const PREVIEW_FRAME   = 210;
const SHARE_FRAME     = 250;
const TOAST_FRAME     = 340;

// Linee del PDF che si "costruiscono"
const PDF_LINES = [
  { label: 'Fresa conica Ø1.2',      qty: 4,  price: '€ 45,00',   subtotal: '€ 180,00' },
  { label: 'Kit impianto standard',   qty: 1,  price: '€ 320,00',  subtotal: '€ 320,00' },
  { label: 'Fresa cilindrica Ø2',    qty: 2,  price: '€ 48,00',   subtotal: '€ 96,00'  },
];

const SHARE_OPTIONS = [
  { icon: '📱', label: 'WhatsApp',  color: '#25D366' },
  { icon: '📧', label: 'Gmail',     color: '#EA4335' },
  { icon: '☁️', label: 'Dropbox',  color: '#0061FF' },
  { icon: '🔗', label: 'Copia link', color: palette.purple },
];

export function Quotes() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.quotes;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Tap animation
  const tapScale = frame >= TAP_FRAME && frame < TAP_FRAME + 12
    ? interpolate(frame, [TAP_FRAME, TAP_FRAME + 6, TAP_FRAME + 12], [1, 0.93, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;

  // PDF lines progress (BUILD_START → BUILD_END)
  const linesVisible = Math.floor(
    interpolate(frame, [BUILD_START, BUILD_END], [0, PDF_LINES.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const totalProgress = interpolate(frame, [BUILD_END - 20, BUILD_END], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  // PDF preview
  const previewProgress = spring({ frame: Math.max(0, frame - PREVIEW_FRAME), fps, config: springCard, from: 0, to: 1 });

  // Share sheet
  const sheetProgress = spring({ frame: Math.max(0, frame - SHARE_FRAME), fps, config: springCard, from: 0, to: 1 });

  // Toast
  const toastProgress = frame >= TOAST_FRAME
    ? spring({ frame: frame - TOAST_FRAME, fps, config: springBounce, from: 0, to: 1 })
    : 0;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 28, opacity: fadeOut, padding: '0 140px',
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 42, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          📄 Preventivi con un Click
        </div>
        <div style={{ fontSize: 20, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 8 }}>
          Da qualsiasi ordine storico, un PDF professionale in meno di 3 secondi
        </div>
      </div>

      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start', width: '100%', maxWidth: 900 }}>
        {/* Ordine sorgente */}
        <div style={{ flex: '0 0 300px' }}>
          <div style={{
            background: palette.bgCard, borderRadius: 20, padding: 24,
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, fontFamily: 'Inter, sans-serif' }}>
              Ordine #4821
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: palette.textPrimary, marginBottom: 4, fontFamily: 'Inter, sans-serif' }}>
              Studio Dr. Bianchi
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: palette.blue, fontFamily: 'Inter, sans-serif', marginBottom: 20 }}>
              € 1.240,00
            </div>

            {/* Bottoni azione */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['Modifica', 'Copia ordine'].map((label, i) => (
                <div key={i} style={{
                  background: palette.bg, borderRadius: 10, padding: '10px 16px',
                  fontSize: 14, fontWeight: 600, color: palette.textMuted,
                  fontFamily: 'Inter, sans-serif', textAlign: 'center',
                }}>
                  {label}
                </div>
              ))}
              <div style={{
                background: palette.blue, borderRadius: 10, padding: '12px 16px',
                fontSize: 15, fontWeight: 700, color: '#fff',
                fontFamily: 'Inter, sans-serif', textAlign: 'center',
                transform: `scale(${tapScale})`,
                boxShadow: `0 0 20px ${palette.blue}50`,
                cursor: 'pointer',
              }}>
                📄 Preventivo →
              </div>
            </div>
          </div>
        </div>

        {/* PDF in costruzione / preview */}
        <div style={{ flex: 1 }}>
          {/* PDF Build animation */}
          {frame >= BUILD_START && frame < PREVIEW_FRAME && (
            <div style={{
              background: palette.bgCard, borderRadius: 16, padding: 24,
              boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
              minHeight: 280,
            }}>
              {/* Header PDF */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${palette.divider}` }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: palette.blue, fontFamily: 'Inter, sans-serif' }}>Formicanera</div>
                  <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>Preventivo commerciale</div>
                </div>
                <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', textAlign: 'right' }}>
                  <div>N° PRV-2026-0142</div>
                  <div>31/03/2026</div>
                </div>
              </div>

              {/* Cliente */}
              <div style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 16 }}>
                Destinatario: <strong style={{ color: palette.textPrimary }}>Studio Dr. Bianchi</strong>
              </div>

              {/* Linee prodotto */}
              {PDF_LINES.slice(0, linesVisible).map((line, i) => {
                const lineP = interpolate(frame, [BUILD_START + i * 30, BUILD_START + i * 30 + 20], [0, 1], {
                  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                });
                return (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '8px 0', borderBottom: `1px solid ${palette.divider}`,
                    opacity: lineP, transform: `translateY(${(1 - lineP) * 8}px)`,
                  }}>
                    <span style={{ fontSize: 13, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', flex: 2 }}>{line.label}</span>
                    <span style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', flex: 1, textAlign: 'center' }}>{line.qty} pz</span>
                    <span style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', flex: 1, textAlign: 'center' }}>{line.price}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', flex: 1, textAlign: 'right' }}>{line.subtotal}</span>
                  </div>
                );
              })}

              {/* Totale */}
              {totalProgress > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'flex-end',
                  marginTop: 12, opacity: totalProgress,
                }}>
                  <div style={{
                    background: palette.blue, color: '#fff',
                    borderRadius: 8, padding: '8px 16px',
                    fontSize: 16, fontWeight: 900, fontFamily: 'Inter, sans-serif',
                  }}>
                    Totale: € 596,00
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PDF Preview + Badge */}
          {frame >= PREVIEW_FRAME && (
            <div style={{
              opacity: previewProgress,
              transform: `translateY(${(1 - previewProgress) * 20}px) scale(${0.95 + previewProgress * 0.05})`,
            }}>
              <div style={{
                background: palette.bgCard, borderRadius: 16, padding: 20,
                boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>
                  📄 PRV-2026-0142.pdf
                </div>
                <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                  Studio Dr. Bianchi · € 596,00 · 31/03/2026
                </div>
              </div>
              <BadgeGreen label="PDF generato in 2.1 secondi" delay={PREVIEW_FRAME} />
            </div>
          )}

          {/* Share sheet */}
          {frame >= SHARE_FRAME && (
            <div style={{
              background: palette.bgCard, borderRadius: 16, padding: 16,
              boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
              marginTop: 16,
              opacity: sheetProgress,
              transform: `translateY(${(1 - sheetProgress) * 20}px)`,
            }}>
              <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 12, fontWeight: 600 }}>
                Condividi tramite
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                {SHARE_OPTIONS.map((opt, i) => {
                  const optP = spring({
                    frame: Math.max(0, frame - SHARE_FRAME - i * 12),
                    fps, config: springBounce, from: 0, to: 1,
                  });
                  return (
                    <div key={i} style={{
                      flex: 1, background: `${opt.color}15`,
                      borderRadius: 12, padding: '12px 8px', textAlign: 'center',
                      opacity: optP, transform: `scale(${optP})`,
                    }}>
                      <div style={{ fontSize: 22 }}>{opt.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: opt.color, fontFamily: 'Inter, sans-serif', marginTop: 4 }}>
                        {opt.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {frame >= TOAST_FRAME && (
        <div style={{
          position: 'absolute', bottom: 40, right: 60,
          background: palette.bgDark, color: '#fff',
          borderRadius: 14, padding: '12px 20px',
          fontSize: 15, fontWeight: 600, fontFamily: 'Inter, sans-serif',
          display: 'flex', alignItems: 'center', gap: 10,
          transform: `scale(${toastProgress}) translateY(${(1 - toastProgress) * 20}px)`,
          opacity: toastProgress,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        }}>
          <span style={{ color: palette.green }}>✓</span> Condiviso via WhatsApp
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verifica — PDF si costruisce linea per linea, preview, share sheet a ventaglio**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/Quotes.tsx
git commit -m "feat(video/s9): Quotes — PDF build line-by-line, preview, share sheet, toast"
```

---

### Task 20: Scena 10 — Dashboard

**Files:**
- Modify: `src/scenes/Dashboard.tsx`

- [ ] **Step 1: Riscrivi la scena completa**

```typescript
// src/scenes/Dashboard.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { MetricCard } from '../components/MetricCard';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { ProgressBar } from '../components/ProgressBar';

// Dati SVG grafico a linea (path semplificato 12 mesi)
const CHART_POINTS = [
  [0, 80], [60, 55], [120, 70], [180, 45], [240, 60],
  [300, 35], [360, 50], [420, 25], [480, 40], [540, 30], [600, 15], [660, 10],
]; // coordinate [x, y] dove y=0 è il top e y=100 è il bottom

function pointsToPath(pts: number[][]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
}

const CHART_FRAME    = 180;
const CHART_DURATION = 120;
const YOY_FRAME      = 360;

export function Dashboard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.dashboard;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Grafico draw progress
  const chartProgress = interpolate(frame, [CHART_FRAME, CHART_FRAME + CHART_DURATION], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  // Punti visibili del grafico (subset proporzionale a chartProgress)
  const visiblePointCount = Math.max(2, Math.round(chartProgress * CHART_POINTS.length));
  const visiblePoints = CHART_POINTS.slice(0, visiblePointCount);

  const yoyProgress = spring({ frame: Math.max(0, frame - YOY_FRAME), fps, config: springBounce, from: 0, to: 1 });

  const METRICS = [
    { icon: '💰', label: 'Fatturato YTD',   value: 124800, prefix: '€ ',  decimals: 0, color: palette.blue   },
    { icon: '🏆', label: 'Commissioni',     value: 8736,   prefix: '€ ',  decimals: 0, color: palette.green  },
    { icon: '📋', label: 'Ordini mese',     value: 47,     prefix: '',    decimals: 0, color: palette.purple  },
    { icon: '🎯', label: 'Budget progresso', value: 67,    prefix: '',    decimals: 0, color: palette.orange  },
  ];

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      gap: 28, opacity: fadeOut, padding: '48px 80px',
    }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 38, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          📊 Dashboard — Business Intelligence
        </div>
        <div style={{ fontSize: 18, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
          Tutto quello che ti serve sapere, in un colpo d'occhio
        </div>
      </div>

      {/* Metric cards 2×2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {METRICS.map((m, i) => (
          <MetricCard key={i} icon={m.icon} label={m.label} color={m.color} delay={i * 20}>
            {m.label === 'Budget progresso' ? (
              <div>
                <AnimatedNumber
                  from={0} to={m.value}
                  delay={i * 20} durationInFrames={60}
                  prefix={m.prefix} suffix="%" decimals={m.decimals}
                  fontSize={36} fontWeight={900} color={m.color} pulse
                />
                <div style={{ marginTop: 8 }}>
                  <ProgressBar
                    progress={m.value / 100}
                    delay={i * 20 + 10} durationInFrames={60}
                    color={m.color} height={6}
                  />
                </div>
              </div>
            ) : (
              <AnimatedNumber
                from={0} to={m.value}
                delay={i * 20} durationInFrames={60}
                prefix={m.prefix} decimals={m.decimals}
                euroFormat={m.prefix === '€ '}
                fontSize={36} fontWeight={900} color={m.color} pulse
              />
            )}
          </MetricCard>
        ))}
      </div>

      {/* Grafico fatturato */}
      <div style={{
        background: palette.bgCard, borderRadius: 20, padding: 24,
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
        flex: 1,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
            Fatturato mensile 2026
          </div>
          {frame >= YOY_FRAME && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: yoyProgress, transform: `scale(${yoyProgress})`,
            }}>
              <span style={{ fontSize: 20, color: palette.green }}>↑</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: palette.green, fontFamily: 'Inter, sans-serif' }}>
                +18% vs 2025
              </span>
            </div>
          )}
        </div>

        <svg width="100%" height="120" viewBox="0 660 120" preserveAspectRatio="none">
          {/* Area fill */}
          {visiblePoints.length > 1 && (
            <path
              d={`${pointsToPath(visiblePoints)} L ${visiblePoints[visiblePoints.length - 1][0]} 110 L 0 110 Z`}
              fill={`${palette.blue}18`}
            />
          )}
          {/* Linea principale */}
          {visiblePoints.length > 1 && (
            <path
              d={pointsToPath(visiblePoints)}
              fill="none"
              stroke={palette.blue}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {/* Anno precedente (tratteggiato) */}
          {chartProgress > 0.5 && (
            <path
              d="M 0 90 L 60 75 L 120 85 L 180 65 L 240 78 L 300 55 L 360 68 L 420 45 L 480 58 L 540 50 L 600 35 L 660 30"
              fill="none"
              stroke={palette.textMuted}
              strokeWidth={2}
              strokeDasharray="6 4"
              opacity={interpolate(chartProgress, [0.5, 0.8], [0, 0.5], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
            />
          )}
        </svg>

        {/* Mesi asse X */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          {['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'].map((m, i) => {
            const mOpacity = interpolate(frame, [CHART_FRAME + i * 8, CHART_FRAME + i * 8 + 15], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });
            return (
              <span key={i} style={{
                fontSize: 12, color: palette.textMuted,
                fontFamily: 'Inter, sans-serif', opacity: mOpacity,
              }}>
                {m}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica — 4 metric cards animate, grafico si disegna, confronto YoY**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/Dashboard.tsx
git commit -m "feat(video/s10): Dashboard — 4 metric cards, chart draw, YoY comparison"
```

---

### Task 21: Scena 11 — Documents

**Files:**
- Create: `src/scenes/Documents.tsx`

- [ ] **Step 1: Scrivi la scena completa**

```typescript
// src/scenes/Documents.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, springSnap, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';

const DDT_TAP_FRAME    = 60;
const DDT_DONE_FRAME   = 120;
const FAT_TAP_FRAME    = 150;
const FAT_DONE_FRAME   = 210;
const TRACKING_FRAME   = 215;

const TRACKING_EVENTS = [
  { icon: '✅', text: 'Preso in carico',          place: 'Napoli',            time: '28/03 14:32', done: true  },
  { icon: '✅', text: 'In transito',               place: 'Roma Smistamento',  time: '28/03 22:15', done: true  },
  { icon: '✅', text: 'Partito per destinazione',  place: 'Milano',            time: '29/03 03:44', done: true  },
  { icon: '🔵', text: 'In consegna',               place: 'Milano',            time: '29/03 09:20', done: false },
  { icon: '⭕', text: 'Consegnato',                place: '—',                 time: '—',           done: false },
];

export function Documents() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.documents;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const trackingProgress = spring({ frame: Math.max(0, frame - TRACKING_FRAME), fps, config: springCard, from: 0, to: 1 });

  // Progress circle per download DDT
  const ddtProgress = interpolate(frame, [DDT_TAP_FRAME, DDT_DONE_FRAME], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });
  const fatProgress = interpolate(frame, [FAT_TAP_FRAME, FAT_DONE_FRAME], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const circleR = 12;
  const circleC = 2 * Math.PI * circleR;

  // Linea timeline tracking
  const lineProgress = interpolate(frame, [TRACKING_FRAME + 20, TRACKING_FRAME + 100], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', gap: 40, opacity: fadeOut, padding: '48px 80px',
    }}>
      {/* Pannello sinistro — documenti */}
      <div style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
            📁 Documenti
          </div>
          <div style={{ fontSize: 16, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
            DDT e fatture in un tap — download immediato
          </div>
        </div>

        {/* Card ordine */}
        <div style={{ background: palette.bgCard, borderRadius: 20, padding: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: palette.blue, fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>
            Ordine #4821 — Studio Dr. Bianchi
          </div>
          <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 16 }}>
            28/03/2026 · € 1.240,00
          </div>

          {/* DDT */}
          {[
            { label: 'DDT-2026-00312', date: '28/03/2026', amount: '€ 1.240,00', progress: ddtProgress, tapFrame: DDT_TAP_FRAME, doneFrame: DDT_DONE_FRAME },
            { label: 'DDT-2026-00298', date: '21/03/2026', amount: '€ 890,00',   progress: 0,           tapFrame: 999,          doneFrame: 999           },
          ].map((doc, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0', borderBottom: `1px solid ${palette.divider}`,
            }}>
              <span style={{ fontSize: 22 }}>📄</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                  {doc.label}
                </div>
                <div style={{ fontSize: 12, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                  {doc.date} · {doc.amount}
                </div>
              </div>
              {/* Download indicator */}
              <div style={{ position: 'relative', width: 32, height: 32 }}>
                {doc.progress > 0 && doc.progress < 1 ? (
                  <svg width="32" height="32" viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r={circleR} fill="none" stroke={palette.divider} strokeWidth="2.5" />
                    <circle
                      cx="16" cy="16" r={circleR}
                      fill="none" stroke={palette.blue} strokeWidth="2.5"
                      strokeDasharray={`${doc.progress * circleC} ${circleC}`}
                      strokeLinecap="round"
                      transform="rotate(-90 16 16)"
                    />
                  </svg>
                ) : doc.progress >= 1 ? (
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: `${palette.green}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, color: palette.green,
                  }}>✓</div>
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: `${palette.blue}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, color: palette.blue,
                  }}>↓</div>
                )}
              </div>
            </div>
          ))}

          {/* Fattura */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
            <span style={{ fontSize: 22 }}>🧾</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                FAT-2026-00187
              </div>
              <div style={{ fontSize: 12, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                31/03/2026 · € 1.512,80
              </div>
            </div>
            <div style={{ position: 'relative', width: 32, height: 32 }}>
              {fatProgress > 0 && fatProgress < 1 ? (
                <svg width="32" height="32" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r={circleR} fill="none" stroke={palette.divider} strokeWidth="2.5" />
                  <circle
                    cx="16" cy="16" r={circleR}
                    fill="none" stroke={palette.green} strokeWidth="2.5"
                    strokeDasharray={`${fatProgress * circleC} ${circleC}`}
                    strokeLinecap="round"
                    transform="rotate(-90 16 16)"
                  />
                </svg>
              ) : fatProgress >= 1 ? (
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${palette.green}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: palette.green }}>✓</div>
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${palette.green}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: palette.green }}>↓</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pannello destro — tracking */}
      <div style={{
        flex: 1,
        opacity: trackingProgress,
        transform: `translateX(${(1 - trackingProgress) * 40}px)`,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
            🚚 Tracking FedEx
          </div>
          <div style={{ fontSize: 16, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
            Aggiornato automaticamente · in-app
          </div>
        </div>

        <div style={{ background: palette.bgCard, borderRadius: 20, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', flex: 1 }}>
          <div style={{ fontSize: 13, fontFamily: 'monospace', color: palette.textMuted, marginBottom: 20 }}>
            774899172937
          </div>

          {/* Badge in consegna */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: `${palette.orange}15`, borderRadius: 20, padding: '6px 14px',
            fontSize: 14, fontWeight: 700, color: palette.orange,
            fontFamily: 'Inter, sans-serif', marginBottom: 20,
            boxShadow: `0 0 ${6 + Math.sin((frame / 10) * Math.PI) * 4}px ${palette.orange}40`,
          }}>
            📍 In consegna oggi
          </div>

          {/* Timeline verticale */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {TRACKING_EVENTS.map((ev, i) => {
              const evDelay = TRACKING_FRAME + 30 + i * 25;
              const evOpacity = interpolate(frame, [evDelay, evDelay + 20], [0, 1], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              });
              const evX = interpolate(frame, [evDelay, evDelay + 20], [10, 0], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
              });
              const isActive = i === 3;

              return (
                <div key={i} style={{ display: 'flex', gap: 14, opacity: evOpacity, transform: `translateX(${evX}px)` }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                    <div style={{
                      fontSize: 16, flexShrink: 0,
                      transform: `scale(${isActive ? 1 + Math.sin((frame / 8) * Math.PI) * 0.1 : 1})`,
                    }}>
                      {ev.icon}
                    </div>
                    {i < TRACKING_EVENTS.length - 1 && (
                      <div style={{ width: 2, flex: 1, minHeight: 20, background: ev.done ? palette.green : palette.divider, marginTop: 2, marginBottom: 2, borderRadius: 2 }}>
                        {ev.done && (
                          <div style={{
                            height: `${lineProgress * 100}%`,
                            background: palette.green,
                            borderRadius: 2,
                          }} />
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ paddingBottom: i < TRACKING_EVENTS.length - 1 ? 16 : 0 }}>
                    <div style={{ fontSize: 15, fontWeight: ev.done ? 700 : 500, color: ev.done ? palette.textPrimary : palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
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
    </div>
  );
}
```

- [ ] **Step 2: Verifica — download progress circle, timeline tracking, badge pulsante**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/Documents.tsx
git commit -m "feat(video/s11): Documents — download circle progress, FedEx timeline animata"
```

---

### Task 22: Scena 12 — Integrations

**Files:**
- Create: `src/scenes/Integrations.tsx`

- [ ] **Step 1: Scrivi la scena completa**

```typescript
// src/scenes/Integrations.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { IntegrationHub } from '../components/IntegrationHub';

const INTEGRATIONS = [
  { name: 'WhatsApp', icon: '📱', color: '#25D366', x: -160, y: -120 },
  { name: 'Gmail',    icon: '📧', color: '#EA4335', x:  160, y: -120 },
  { name: 'Dropbox',  icon: '☁️', color: '#0061FF', x: -160, y:  120 },
  { name: 'Google',   icon: '🔵', color: '#4285F4', x:  160, y:  120 },
];

// Frames per spotlight demo
const WA_DEMO   = 120;
const GMAIL_DEMO = 240;
const CLOUD_DEMO = 340;
const HUB_FINAL  = 440;

export function Integrations() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.integrations;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Spotlight index
  const spotlightIndex =
    frame >= HUB_FINAL  ? null  :
    frame >= CLOUD_DEMO ? 2     :  // Dropbox
    frame >= GMAIL_DEMO ? 1     :  // Gmail
    frame >= WA_DEMO    ? 0     :  // WhatsApp
    null;

  // Demo box opacities
  const waDemoOpacity   = interpolate(frame, [WA_DEMO, WA_DEMO + 20],     [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const gmailDemoOpacity = interpolate(frame, [GMAIL_DEMO, GMAIL_DEMO + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cloudDemoOpacity = interpolate(frame, [CLOUD_DEMO, CLOUD_DEMO + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const hubFinalOpacity = interpolate(frame, [HUB_FINAL, HUB_FINAL + 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, opacity: fadeOut, padding: '0 80px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 42, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          🔗 Integrazioni
        </div>
        <div style={{ fontSize: 20, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 8 }}>
          Formicanera al centro di tutti i tuoi strumenti
        </div>
      </div>

      <div style={{ display: 'flex', gap: 60, alignItems: 'center' }}>
        {/* Hub */}
        <IntegrationHub
          integrations={INTEGRATIONS}
          centerIcon="🐜"
          delay={0}
          spotlightIndex={spotlightIndex}
        />

        {/* Demo panel a destra */}
        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* WhatsApp demo */}
          {frame >= WA_DEMO && (
            <div style={{
              background: palette.bgCard, borderRadius: 16, padding: 16,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              borderLeft: `3px solid #25D366`,
              opacity: spotlightIndex !== 0 && frame < HUB_FINAL ? 0.3 : waDemoOpacity,
              transform: `translateX(${(1 - waDemoOpacity) * 20}px)`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#25D366', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Inter, sans-serif' }}>
                📱 WhatsApp
              </div>
              <div style={{
                background: '#25D36615', borderRadius: 10, padding: '10px 12px',
                fontSize: 13, color: palette.textPrimary, fontFamily: 'Inter, sans-serif',
              }}>
                <span style={{ fontWeight: 700 }}>Formicanera:</span> Ordine #4821 confermato ✓
                <br />
                <span style={{ color: palette.textMuted }}>📎 DDT-2026-00312.pdf allegato</span>
              </div>
              <div style={{ fontSize: 12, color: '#25D366', fontFamily: 'Inter, sans-serif', marginTop: 6, fontWeight: 600 }}>
                Condividi ordini e documenti →
              </div>
            </div>
          )}

          {/* Gmail demo */}
          {frame >= GMAIL_DEMO && (
            <div style={{
              background: palette.bgCard, borderRadius: 16, padding: 16,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              borderLeft: `3px solid #EA4335`,
              opacity: spotlightIndex !== 1 && frame < HUB_FINAL ? 0.3 : gmailDemoOpacity,
              transform: `translateX(${(1 - gmailDemoOpacity) * 20}px)`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#EA4335', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Inter, sans-serif' }}>
                📧 Gmail
              </div>
              <div style={{ fontSize: 13, color: palette.textSecondary, fontFamily: 'Inter, sans-serif' }}>
                <div style={{ fontWeight: 600, color: palette.textPrimary }}>Preventivo PRV-2026-0142</div>
                <div>A: bianchi@studiodent.it</div>
                <div style={{ color: palette.green, marginTop: 4 }}>✓ Inviato</div>
              </div>
            </div>
          )}

          {/* Dropbox + Google demo */}
          {frame >= CLOUD_DEMO && (
            <div style={{
              background: palette.bgCard, borderRadius: 16, padding: 16,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              borderLeft: `3px solid #0061FF`,
              opacity: cloudDemoOpacity,
              transform: `translateX(${(1 - cloudDemoOpacity) * 20}px)`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0061FF', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Inter, sans-serif' }}>
                ☁️ Dropbox + Google Drive
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 20 }}>📄</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>DDT-2026-00312.pdf</div>
                  <div style={{ height: 4, background: palette.divider, borderRadius: 100, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${interpolate(frame, [CLOUD_DEMO, CLOUD_DEMO + 60], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}%`,
                      background: '#0061FF', borderRadius: 100,
                    }} />
                  </div>
                </div>
                {frame >= CLOUD_DEMO + 60 && (
                  <span style={{ color: palette.green, fontSize: 18 }}>✓</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#0061FF', fontFamily: 'Inter, sans-serif', marginTop: 6, fontWeight: 600 }}>
                Archiviazione automatica documenti →
              </div>
            </div>
          )}

          {/* Label finale hub */}
          {frame >= HUB_FINAL && (
            <div style={{
              textAlign: 'center', fontSize: 20, fontWeight: 700,
              color: palette.blue, fontFamily: 'Inter, sans-serif',
              opacity: hubFinalOpacity,
            }}>
              Un ecosistema connesso
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica — hub con linee animate, spotlight per ogni integrazione, demo panels**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/Integrations.tsx
git commit -m "feat(video/s12): Integrations — hub animato, spotlight per integrazione, demo panels"
```

---

### Task 23: Scena 13 — Notifications

**Files:**
- Modify: `src/scenes/Notifications.tsx`

- [ ] **Step 1: Riscrivi la scena completa**

```typescript
// src/scenes/Notifications.tsx
import { useCurrentFrame, interpolate } from 'remotion';
import { easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { NotifCard } from '../components/NotifCard';

const NOTIFS = [
  { icon: '✅', title: 'Ordine confermato',      body: 'Ordine #4821 registrato su Archibald',            time: '14:32', color: palette.green,  highlight: false },
  { icon: '📄', title: 'Documento disponibile',  body: 'DDT-2026-00312 pronto per il download',           time: '14:35', color: palette.blue,   highlight: false },
  { icon: '🚚', title: 'Spedizione aggiornata',  body: 'FedEx: pacco in consegna oggi a Milano',         time: '09:21', color: palette.purple,  highlight: false },
  { icon: '📋', title: 'Preventivo aperto',      body: 'Studio Dr. Bianchi ha aperto il preventivo',     time: '10:47', color: palette.green,  highlight: false },
  { icon: '⚠️', title: 'Cliente inattivo',       body: 'Lab. Dott. Ferrari — 8 mesi senza ordini · rischio esclusività', time: '08:00', color: palette.orange, highlight: true  },
  { icon: '🔴', title: 'Documento mancante',     body: 'Ordine #4756 — nessun DDT dopo 14 giorni',       time: '08:00', color: palette.red,    highlight: true  },
  { icon: '📈', title: 'Variazione prezzo',      body: 'Kit impianto standard +3.2% da domani',          time: '07:00', color: palette.orange, highlight: false },
  { icon: '⚠️', title: 'Cliente incompleto',    body: 'Clinica Azzurra — P.IVA mancante · ordini bloccati', time: '06:00', color: palette.red, highlight: false },
] as const;

const STAGGER = 25;
const FINAL_LABEL_FRAME = 370;

export function Notifications() {
  const frame = useCurrentFrame();
  const dur = SCENE_FRAMES.notifications;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const headerOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const labelOpacity = interpolate(frame, [FINAL_LABEL_FRAME, FINAL_LABEL_FRAME + 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '48px 160px',
      gap: 20, opacity: fadeOut,
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', opacity: headerOpacity }}>
        <div style={{ fontSize: 38, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          🔔 Notifiche Intelligenti
        </div>
        <div style={{ fontSize: 18, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
          11 tipi di eventi · zero ricerche manuali
        </div>
      </div>

      {/* Cards in 2 colonne */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
        {NOTIFS.map((n, i) => (
          <NotifCard
            key={i}
            icon={n.icon}
            title={n.title}
            body={n.body}
            time={n.time}
            accentColor={n.color}
            delay={20 + i * STAGGER}
            stackOffset={i * 2}
            highlight={n.highlight}
          />
        ))}
      </div>

      {/* Label finale */}
      <div style={{
        fontSize: 20, fontStyle: 'italic', color: palette.textMuted,
        fontFamily: 'Inter, sans-serif', textAlign: 'center',
        opacity: labelOpacity,
      }}>
        "Formicanera ti avvisa. Tu pensi solo a vendere."
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica — 8 notifiche in griglia 2×2, stagger entrata, highlight pulse su critica**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/Notifications.tsx
git commit -m "feat(video/s13): Notifications — griglia 2×2, stagger, highlight critico, label finale"
```

---

### Task 24: Scena 14 — Closing

**Files:**
- Modify: `src/scenes/Closing.tsx`

- [ ] **Step 1: Riscrivi la scena completa**

```typescript
// src/scenes/Closing.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, staticFile, Img } from 'remotion';
import { springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';

export function Closing() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.closing;

  // Glow respira lentamente (non fade-out)
  const glowBreathe = 0.04 + Math.sin((frame / 60) * Math.PI) * 0.03;

  const logoProgress = spring({ frame, fps, config: springBounce, from: 0, to: 1 });

  const titleOpacity = interpolate(frame, [20, 45], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const titleY = interpolate(frame, [20, 45], [12, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const subtitleOpacity = interpolate(frame, [35, 55], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const ctaProgress = spring({ frame: Math.max(0, frame - 70), fps, config: springBounce, from: 0, to: 1 });

  // Glow pulsante sul CTA
  const ctaGlow = 0.3 + Math.sin((frame / 20) * Math.PI) * 0.2;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: `radial-gradient(ellipse at center bottom, rgba(0,122,255,${glowBreathe}) 0%, ${palette.bg} 65%)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20, position: 'relative', overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        transform: `scale(${logoProgress}) translateY(${(1 - logoProgress) * -60}px)`,
        opacity: logoProgress,
        filter: `drop-shadow(0 ${8 * logoProgress}px ${24 * logoProgress}px rgba(0,122,255,${0.25 * logoProgress}))`,
      }}>
        <Img
          src={staticFile('formicaneralogo.png')}
          style={{ width: 88, height: 88, objectFit: 'contain' }}
        />
      </div>

      {/* Formicanera */}
      <div style={{
        fontSize: 72, fontWeight: 900, color: palette.textPrimary,
        fontFamily: 'Inter, sans-serif', letterSpacing: -2,
        opacity: titleOpacity,
        transform: `translateY(${titleY}px)`,
      }}>
        Formicanera
      </div>

      {/* Tagline */}
      <div style={{
        fontSize: 20, fontWeight: 600, color: palette.blue,
        fontFamily: 'Inter, sans-serif', letterSpacing: 3, textTransform: 'uppercase',
        opacity: subtitleOpacity,
      }}>
        Il vantaggio competitivo · Komet Italia
      </div>

      {/* CTA */}
      <div style={{
        marginTop: 16,
        background: palette.blue, color: '#fff',
        borderRadius: 16, padding: '18px 48px',
        fontSize: 20, fontWeight: 700, fontFamily: 'Inter, sans-serif',
        transform: `scale(${ctaProgress})`,
        opacity: ctaProgress,
        boxShadow: `0 8px 40px rgba(0,122,255,${ctaGlow})`,
        cursor: 'pointer',
      }}>
        Richiedi una demo
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica — logo spring dall'alto, testi sequenziali, CTA con glow pulsante, background che respira**

- [ ] **Step 3: Commit**
```bash
git add src/scenes/Closing.tsx
git commit -m "feat(video/s14): Closing — logo spring, CTA glow pulse, background radiale respirante"
```

---

### Task 25: Aggiorna Video.tsx + Root.tsx

**Files:**
- Modify: `src/Video.tsx`
- Modify: `src/Root.tsx`

- [ ] **Step 1: Riscrivi Video.tsx con le 15 scene in ordine**

```typescript
// src/Video.tsx
import { Series, Audio, interpolate } from 'remotion';
import { staticFile } from 'remotion';
import { SCENE_FRAMES, TOTAL_FRAMES } from './lib/timing';

import { LogoIntro }      from './scenes/LogoIntro';
import { Problem }        from './scenes/Problem';
import { Solution }       from './scenes/Solution';
import { Orders }         from './scenes/Orders';
import { IvaAndTotals }   from './scenes/IvaAndTotals';
import { PendingOrders }  from './scenes/PendingOrders';
import { Storico }        from './scenes/Storico';
import { Clients }        from './scenes/Clients';
import { Warehouse }      from './scenes/Warehouse';
import { Quotes }         from './scenes/Quotes';
import { Dashboard }      from './scenes/Dashboard';
import { Documents }      from './scenes/Documents';
import { Integrations }   from './scenes/Integrations';
import { Notifications }  from './scenes/Notifications';
import { Closing }        from './scenes/Closing';

export function FormicaneraDemoVideo() {
  return (
    <>
      <Audio
        src={staticFile('background.mp3')}
        volume={(f) =>
          interpolate(
            f,
            [0, 30, TOTAL_FRAMES - 150, TOTAL_FRAMES],
            [0, 0.60, 0.60, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          )
        }
        loop
        loopVolumeCurveBehavior="extend"
      />
      <Series>
        <Series.Sequence durationInFrames={SCENE_FRAMES.logo}>          <LogoIntro />     </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.problem}>       <Problem />       </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.solution}>      <Solution />      </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.orders}>        <Orders />        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.iva}>           <IvaAndTotals />  </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.pending}>       <PendingOrders /> </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.storico}>       <Storico />       </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.clients}>       <Clients />       </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.warehouse}>     <Warehouse />     </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.quotes}>        <Quotes />        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.dashboard}>     <Dashboard />     </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.documents}>     <Documents />     </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.integrations}>  <Integrations />  </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.notifications}> <Notifications /> </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.closing}>       <Closing />       </Series.Sequence>
      </Series>
    </>
  );
}
```

- [ ] **Step 2: Aggiorna Root.tsx con TOTAL_FRAMES dinamico**

```typescript
// src/Root.tsx
import './font';
import type { FC } from 'react';
import { Composition, registerRoot } from 'remotion';
import { FormicaneraDemoVideo } from './Video';
import { TOTAL_FRAMES, FPS, WIDTH, HEIGHT } from './lib/timing';

export const RemotionRoot: FC = () => {
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

registerRoot(RemotionRoot);
```

- [ ] **Step 3: Verifica TypeScript — deve compilare senza errori**
```bash
cd docs/commerciale/video
npm run start
# Verifica che il studio si avvii e tutte le 15 scene siano navigate abili
```

- [ ] **Step 4: Rimuovi file scene obsoleti**
```bash
# Rimuovi le scene del vecchio video non più usate
rm -f src/scenes/Bot.tsx src/scenes/Customers.tsx
```

- [ ] **Step 5: Commit**
```bash
git add src/Video.tsx src/Root.tsx
git rm src/scenes/Bot.tsx src/scenes/Customers.tsx
git commit -m "feat(video): Video.tsx v2 — 15 scene in Series, Root.tsx con TOTAL_FRAMES dinamico"
```

---

### Task 26: Aggiorna presentazione commerciale

**Files:**
- Modify: `docs/commerciale/formicanera-presentazione-komet.md`

- [ ] **Step 1: Aggiorna sezione 4.2 — aggiungi le nuove funzionalità ordini**

Nella sezione `### 4.1 Gestione Ordini`, alla fine del blocco **Storico ordini**, aggiungi:

```markdown
**Ricerca storico con copia istantanea**
- Ricerca full-text su tutto lo storico ordini di un cliente
- Selezione di singoli articoli o ordini interi in un tap
- Copia istantanea in nuovo ordine pre-compilato: zero riscrittura, zero errori

**Totali e IVA automatizzati**
- IVA calcolata automaticamente per aliquota durante la compilazione
- Sconti riga e sconto testata applicati in tempo reale
- Soglia spese trasporto verificata e applicata automaticamente
```

- [ ] **Step 2: Aggiungi sezione 4.1-bis — Pending Orders**

Dopo la sezione 4.1, inserisci:

```markdown
### 4.1-bis Pending Orders — Immagazzina e Invia Quando Vuoi

- Salva ordini durante tutta la giornata senza doverli inviare subito
- Accumulo illimitato di ordini in stato "in attesa"
- Invio differito: invia tutto insieme quando e dove vuoi
- Barra di avanzamento globale non bloccante durante il batch
```

- [ ] **Step 3: Aggiungi sezione 4.3-bis — Catalogo e Magazzino**

Dopo la sezione 4.3, inserisci:

```markdown
### 4.3-bis Catalogo e Check Magazzino in Tempo Reale

- Ricerca full-text sul catalogo completo Komet
- Disponibilità stock in tempo reale per ogni articolo (badge verde/arancio/rosso)
- Prezzo cliente specifico visibile immediatamente — non il listino generico
- Check istantaneo: disponibilità confermata in meno di 2 secondi

**Preventivi con un click**
- Da qualsiasi ordine storico, genera un preventivo PDF professionale in un tap
- PDF pronto in meno di 3 secondi, condivisibile via WhatsApp, Gmail, Dropbox, link diretto
- Numerazione automatica, intestazione Formicanera, totali IVA inclusi
```

- [ ] **Step 4: Aggiungi sezione 4.9 — Integrazioni**

Dopo la sezione 4.8, inserisci:

```markdown
### 4.9 Integrazioni

Formicanera si connette nativamente agli strumenti che l'agente usa ogni giorno:

| Integrazione | Funzionalità |
|---|---|
| **WhatsApp** | Condivisione ordini, preventivi e documenti direttamente in chat |
| **Gmail** | Invio automatico preventivi e notifiche documenti ai clienti |
| **Dropbox** | Archiviazione automatica DDT, fatture e preventivi |
| **Google Drive** | Sync e backup automatico di tutti i documenti commerciali |
```

- [ ] **Step 5: Aggiorna tabella 5.1 — vantaggi agente**

Nella tabella della sezione 5.1, aggiungi le righe:

```markdown
| Creazione preventivo | 10–15 min (manuale) | < 3 secondi (un tap) | ~98% |
| Ricerca articolo + stock | 5–10 min (ERP + telefonate) | < 2 secondi | ~95% |
| Condivisione documento | 5 min (email manuale) | Istantanea (WhatsApp/Gmail) | ~95% |
```

- [ ] **Step 6: Rimuovi i riferimenti a "operazioni batch" come feature standalone**

Cerca e rimuovi qualsiasi bullet che recita "Selezione multipla ordini" o "Operazioni batch" come funzionalità primaria.

- [ ] **Step 7: Commit**
```bash
git add docs/commerciale/formicanera-presentazione-komet.md
git commit -m "docs(commerciale): presentazione v2 — nuove feature, preventivi, magazzino, integrazioni"
```

---

### Task 27: Aggiorna generate-proposta.mjs

**Files:**
- Modify: `docs/commerciale/generate-proposta.mjs`

- [ ] **Step 1: Cerca la sezione della tabella comparativa "Cosa cambia concretamente" nell'HTML**

```bash
grep -n "Cosa cambia" docs/commerciale/generate-proposta.mjs
```

- [ ] **Step 2: Aggiungi 3 righe nella tabella comparativa**

Trova la riga con `Creare un nuovo cliente` e dopo di essa inserisci:

```html
<tr><td>Creare un preventivo</td><td>10–15 min (compilazione manuale ERP)</td><td>Meno di 3 secondi (un tap)</td></tr>
<tr><td>Verificare stock articolo</td><td>5–10 min (ERP + magazzino)</td><td>Meno di 2 secondi (check istantaneo)</td></tr>
<tr><td>Condividere un documento</td><td>5 min (email manuale)</td><td>Istantanea (WhatsApp / Gmail)</td></tr>
```

- [ ] **Step 3: Trova la sezione funzionalità complete e aggiungi le nuove sezioni**

Dopo la sezione DDT/Fatture, aggiungi HTML per:
- Pending Orders
- Catalogo + Magazzino + Preventivi
- Integrazioni

Usa lo stesso stile degli altri blocchi nell'HTML esistente (con `<h2>`, `<ul>`, `<li>`, classi CSS esistenti).

- [ ] **Step 4: Rigenerazione PDF**
```bash
node docs/commerciale/generate-proposta.mjs
# Output atteso: formicanera-proposta-commerciale.pdf aggiornato
```

- [ ] **Step 5: Commit**
```bash
git add docs/commerciale/generate-proposta.mjs docs/commerciale/formicanera-proposta-commerciale.pdf
git commit -m "docs(commerciale): proposta v2 — nuove feature, tabella vantaggi aggiornata, PDF rigenerato"
```

---

### Task 28: Render video finale

**Files:**
- Output: `docs/commerciale/formicanera-demo-komet.mp4`

- [ ] **Step 1: Verifica finale in Remotion studio — naviga tutte le 15 scene**
```bash
cd docs/commerciale/video
npm run start
# Naviga ogni scena manualmente, verifica:
# - nessun errore TypeScript nella console
# - tutte le animazioni partono correttamente
# - le transizioni tra scene sono fluide (fade 15f)
# - il font Inter è caricato (non system fallback)
```

- [ ] **Step 2: Render**
```bash
cd docs/commerciale/video
npx remotion render src/Root.tsx FormicaneraDemoVideo \
  out/formicanera-demo-komet.mp4 \
  --codec=h264 \
  --crf=18 \
  --jpeg-quality=80
```
Atteso: render completato in ~5-10 minuti, file `out/formicanera-demo-komet.mp4` ~200-400MB.

- [ ] **Step 3: Copia nella root commerciale**
```bash
cp docs/commerciale/video/out/formicanera-demo-komet.mp4 docs/commerciale/formicanera-demo-komet.mp4
cp docs/commerciale/video/out/formicanera-demo-komet.mp4 docs/formicanera-demo-komet.mp4
```

- [ ] **Step 4: Commit finale**
```bash
git add docs/commerciale/formicanera-demo-komet.mp4 docs/formicanera-demo-komet.mp4
git commit -m "feat(video): render finale v2 — 15 scene Apple style ~3:33"
```

---

**Fine Piano 3 — tutti i deliverable completati.**

## Riepilogo deliverable

| Deliverable | Piano | Task |
|-------------|-------|------|
| lib/ + 10 componenti | P1 | Task 1–9 |
| Scene 0–7 (8 scene) | P2 | Task 10–17 |
| Scene 8–14 (7 scene) | P3 | Task 18–24 |
| Video.tsx + Root.tsx | P3 | Task 25 |
| Presentazione .md | P3 | Task 26 |
| Proposta commerciale | P3 | Task 27 |
| Render finale MP4 | P3 | Task 28 |
