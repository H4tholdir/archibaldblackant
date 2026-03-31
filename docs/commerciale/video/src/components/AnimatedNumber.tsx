import { useCurrentFrame, interpolate, Easing } from 'remotion';

type Props = {
  from?: number;
  to: number;
  delay?: number;
  durationInFrames?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
};

export function AnimatedNumber({
  from = 0,
  to,
  delay = 0,
  durationInFrames = 60,
  prefix = '',
  suffix = '',
  decimals = 0,
}: Props) {
  const frame = useCurrentFrame();

  const value = interpolate(
    frame - delay,
    [0, durationInFrames],
    [from, to],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    }
  );

  return (
    <span>
      {prefix}{value.toFixed(decimals)}{suffix}
    </span>
  );
}
