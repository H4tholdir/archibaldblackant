import type { ReactNode } from 'react';
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springText } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  children: ReactNode;
  delay?: number;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
};

export function SpringText({
  children,
  delay = 0,
  color = palette.textPrimary,
  fontSize = 48,
  fontWeight = 800,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springText,
    from: 0,
    to: 1,
  });

  return (
    <div
      style={{
        color,
        fontSize,
        fontWeight,
        fontFamily: 'Inter, sans-serif',
        opacity: progress,
        transform: `translateX(${(1 - progress) * 40}px)`,
        lineHeight: 1.2,
      }}
    >
      {children}
    </div>
  );
}
