// src/scenes/PendingOrders.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springBounce, easingApple } from '../lib/springs';
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

const SEND_FRAME = 240;

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
          }}>
            Invia tutti a Verona →
          </div>
        )}

        {frame >= SEND_FRAME + CARDS.length * 40 + 60 && (
          <BadgeGreen label={`${CARDS.length}/${CARDS.length} Inviati`} delay={SEND_FRAME + CARDS.length * 40 + 60} />
        )}
      </div>
    </div>
  );
}
