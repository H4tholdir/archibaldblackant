// src/components/MetricCard.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';
import type { ReactNode } from 'react';

type Props = {
  icon: string;
  label: string;
  children: ReactNode;
  color?: string;
  delay?: number;
};

export function MetricCard({ icon, label, children, color = palette.blue, delay = 0 }: Props) {
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
    <div
      style={{
        background: palette.bgCard,
        borderRadius: 20,
        padding: '24px 20px',
        boxShadow: `0 4px 24px rgba(0,0,0,0.08)`,
        borderTop: `3px solid ${color}`,
        opacity: progress,
        transform: `translateY(${(1 - progress) * 30}px) scale(${0.90 + progress * 0.10})`,
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ marginBottom: 4 }}>{children}</div>
      <div style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif', fontWeight: 500, lineHeight: 1.3 }}>
        {label}
      </div>
    </div>
  );
}
