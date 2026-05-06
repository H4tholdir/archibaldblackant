// src/scenes/comparison/ComparisonContext.tsx
import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { easingApple } from '../../lib/springs';

type Line = { text: string; color?: string };

type Props = {
  lines: Line[];
  subtitle?: string;
};

export function ComparisonContext({ lines, subtitle }: Props) {
  const frame = useCurrentFrame();

  const fadeOut = interpolate(frame, [165, 180], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const lastLineEnd = (lines.length - 1) * 30 + 20;
  const subtitleStart = Math.max(lastLineEnd + 10, 120);

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bgDark,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, opacity: fadeOut, padding: '0 120px',
    }}>
      {lines.map((line, i) => {
        const delay = i * 30;
        const opacity = interpolate(frame, [delay, delay + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
        const y = interpolate(frame, [delay, delay + 20], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
        return (
          <div key={line.text} style={{
            fontSize: 64, fontWeight: 900, fontFamily,
            color: line.color ?? palette.textWhite,
            opacity, transform: `translateY(${y}px)`,
          }}>
            {line.text}
          </div>
        );
      })}
      {subtitle && (
        <div style={{
          fontSize: 20, fontWeight: 400, color: palette.textWhiteDim,
          fontFamily, fontStyle: 'italic', marginTop: 16,
          opacity: interpolate(frame, [subtitleStart, subtitleStart + 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
