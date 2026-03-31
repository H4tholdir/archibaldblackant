// src/components/DarkCard.tsx
import type { ReactNode } from 'react';
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  children: ReactNode;
  delay?: number;
  width?: number | string;
  padding?: number;
  fromX?: number;
  fromY?: number;
  accentColor?: string;
};

export function DarkCard({
  children,
  delay = 0,
  width = 300,
  padding = 28,
  fromX = 0,
  fromY = 0,
  accentColor,
}: Props) {
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
        background: palette.bgDark,
        borderRadius: 24,
        padding,
        width,
        boxShadow: `0 8px 40px rgba(0,0,0,0.40)`,
        borderTop: accentColor ? `2px solid ${accentColor}` : undefined,
        transform: `
          scale(${0.85 + progress * 0.15})
          translateX(${fromX * (1 - progress)}px)
          translateY(${fromY * (1 - progress)}px)
        `,
        opacity: progress,
      }}
    >
      {children}
    </div>
  );
}
