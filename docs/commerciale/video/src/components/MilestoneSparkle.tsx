// src/components/MilestoneSparkle.tsx
import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../lib/palette';

type Props = {
  /** Frame RELATIVO in cui esplodono le sparkle */
  triggerFrame: number;
  /** Durata animazione in frame (default: 60) */
  duration?: number;
  /** Colore (default: palette.green) */
  color?: string;
  /** Numero di particelle (default: 8) */
  count?: number;
};

// Particelle deterministiche
function makeSparkles(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360;
    const distance = 55 + (i % 3) * 15;
    const size = 4 + (i % 3) * 2;
    return { angle, distance, size };
  });
}

export function MilestoneSparkle({
  triggerFrame,
  duration = 60,
  color = palette.green,
  count = 8,
}: Props) {
  const frame = useCurrentFrame();

  if (frame < triggerFrame || frame > triggerFrame + duration) return null;

  const relFrame = frame - triggerFrame;
  const progress = relFrame / duration;

  const sparkles = makeSparkles(count);

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 20,
    }}>
      {sparkles.map((sp, i) => {
        const rad = (sp.angle * Math.PI) / 180;
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const x = Math.cos(rad) * sp.distance * easeOut;
        const y = Math.sin(rad) * sp.distance * easeOut;
        const opacity = interpolate(progress, [0, 0.3, 0.7, 1], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });
        const scale = interpolate(progress, [0, 0.2, 0.8, 1], [0.3, 1, 1, 0.3], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`,
              opacity,
              fontSize: sp.size * 2,
              lineHeight: 1,
              color,
              textShadow: `0 0 8px ${color}`,
            }}
          >
            {i % 3 === 0 ? '✦' : i % 3 === 1 ? '★' : '·'}
          </div>
        );
      })}
    </div>
  );
}
