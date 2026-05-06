// src/components/InsightCard.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Props = {
  /** Frame RELATIVO in cui la card appare */
  showAtFrame: number;
};

const PENDING_ORDERS = [
  { customer: 'Rossi Mario',    total: '€ 1.247,00', delay: 0  },
  { customer: 'Bianchi Elena',  total: '€ 589,50',   delay: 40 },
  { customer: 'Verdi Giuseppe', total: '€ 2.104,00', delay: 80 },
];

export function InsightCard({ showAtFrame }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < showAtFrame) return null;

  const relFrame = frame - showAtFrame;
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
      <div style={{ fontSize: 22, fontWeight: 800, color: palette.textPrimary, fontFamily, textAlign: 'center', lineHeight: 1.3, marginBottom: 8 }}>
        While ERP submits the order in the background
      </div>
      <div style={{ fontSize: 18, fontWeight: 500, color: palette.blue, fontFamily, textAlign: 'center', marginBottom: 32 }}>
        — agents keep working.
      </div>
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
                <div style={{ fontSize: 15, fontWeight: 700, color: palette.textPrimary, fontFamily }}>{order.customer}</div>
                <div style={{ fontSize: 12, color: palette.textMuted, fontFamily, marginTop: 2 }}>Pending order — queued</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: palette.textSecondary, fontFamily }}>{order.total}</div>
            </div>
          );
        })}
      </div>
      <div style={{
        marginTop: 28, fontSize: 14, fontWeight: 500, color: palette.textMuted, fontFamily, fontStyle: 'italic', textAlign: 'center',
        opacity: interpolate(relFrame, [120, 150], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}>
        Not downtime — parallel productivity.
      </div>
    </div>
  );
}
