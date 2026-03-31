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
