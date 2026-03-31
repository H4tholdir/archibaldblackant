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
