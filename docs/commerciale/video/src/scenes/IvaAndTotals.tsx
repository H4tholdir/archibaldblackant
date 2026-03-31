// src/scenes/IvaAndTotals.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { BadgeGreen } from '../components/BadgeGreen';
import { SceneCaption } from '../components/SceneCaption';

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
        position: 'relative',
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
                        euroFormat pulse
                        fontSize={20} fontWeight={800} color={palette.blue}
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
      <SceneCaption
        main="IVA e totali calcolati in tempo reale — zero errori manuali"
        vs="vs ERP: calcolo manuale riga per riga, rischio errori ogni volta"
        delay={30}
        color="#34C759"
      />
    </div>
  );
}
