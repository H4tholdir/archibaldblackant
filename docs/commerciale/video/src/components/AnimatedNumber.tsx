// src/components/AnimatedNumber.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { easingApple, springSnap } from '../lib/springs';

type Props = {
  from?: number;
  to: number;
  delay?: number;
  durationInFrames?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  euroFormat?: boolean;  // separa migliaia con punto, decimali con virgola
  pulse?: boolean;       // scala leggermente al completamento
  fontSize?: number;
  fontWeight?: number;
  color?: string;
};

export function AnimatedNumber({
  from = 0,
  to,
  delay = 0,
  durationInFrames = 60,
  prefix = '',
  suffix = '',
  decimals = 0,
  euroFormat = false,
  pulse = false,
  fontSize = 40,
  fontWeight = 900,
  color = 'inherit',
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const value = interpolate(
    frame - delay,
    [0, durationInFrames],
    [from, to],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: easingApple,
    }
  );

  const pulseProgress = pulse
    ? spring({
        frame: Math.max(0, frame - delay - durationInFrames),
        fps,
        config: springSnap,
        from: 0,
        to: 1,
      })
    : 1;

  const pulseScale = pulse
    ? 1 + Math.sin(pulseProgress * Math.PI) * 0.04
    : 1;

  const formatted = euroFormat
    ? value
        .toFixed(decimals)
        .replace('.', '§')                      // segna separatore decimale
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.') // migliaia con punto
        .replace('§', ',')                      // decimale → virgola
    : value.toFixed(decimals);

  return (
    <span
      style={{
        fontSize,
        fontWeight,
        fontFamily: 'Inter, sans-serif',
        color,
        display: 'inline-block',
        transform: `scale(${pulseScale})`,
      }}
    >
      {prefix}{formatted}{suffix}
    </span>
  );
}
