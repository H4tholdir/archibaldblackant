// src/components/ProgressBar.tsx
import { useCurrentFrame, interpolate } from 'remotion';
import { easingApple } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  progress: number;        // 0–1, valore target
  delay?: number;
  durationInFrames?: number;
  color?: string;
  height?: number;
  borderRadius?: number;
  bgColor?: string;
  label?: string;
  showPercent?: boolean;
  animate?: boolean;       // se false, usa progress direttamente
};

export function ProgressBar({
  progress,
  delay = 0,
  durationInFrames = 60,
  color = palette.blue,
  height = 8,
  borderRadius = 100,
  bgColor = palette.divider,
  label,
  showPercent = false,
  animate = true,
}: Props) {
  const frame = useCurrentFrame();

  const animated = animate
    ? interpolate(frame - delay, [0, durationInFrames], [0, progress], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: easingApple,
      })
    : progress;

  const percent = Math.round(animated * 100);

  return (
    <div style={{ width: '100%' }}>
      {(label || showPercent) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 6,
            fontFamily: 'Inter, sans-serif',
            fontSize: 14,
            fontWeight: 600,
            color: palette.textMuted,
          }}
        >
          {label && <span>{label}</span>}
          {showPercent && <span style={{ color }}>{percent}%</span>}
        </div>
      )}
      <div
        style={{
          width: '100%',
          height,
          background: bgColor,
          borderRadius,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${animated * 100}%`,
            height: '100%',
            background: color,
            borderRadius,
            boxShadow: `0 0 8px ${color}60`,
            transition: 'none',
          }}
        />
      </div>
    </div>
  );
}
