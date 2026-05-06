// src/scenes/comparison/ComparisonIntro.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, staticFile, Img } from 'remotion';
import { springBounce, easingApple } from '../../lib/springs';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';

type Props = {
  title: string;
  subtitle: string;
};

export function ComparisonIntro({ title, subtitle }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoProgress = spring({ frame, fps, config: springBounce, from: 0, to: 1 });
  const titleOpacity = interpolate(frame, [15, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const titleY = interpolate(frame, [15, 35], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const subtitleOpacity = interpolate(frame, [30, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [105, 120], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, opacity: fadeOut, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', width: 600, height: 600, borderRadius: '50%',
        background: `radial-gradient(circle, ${palette.blue} 0%, transparent 65%)`,
        opacity: 0.07, pointerEvents: 'none',
      }} />
      <div style={{
        transform: `scale(${logoProgress}) translateY(${(1 - logoProgress) * -40}px)`,
        opacity: logoProgress,
      }}>
        <Img src={staticFile('formicaneralogo.png')} style={{ width: 100, height: 93, objectFit: 'contain' }} />
      </div>
      <div style={{
        fontSize: 64, fontWeight: 900, color: palette.textPrimary,
        fontFamily, letterSpacing: -1.5,
        opacity: titleOpacity, transform: `translateY(${titleY}px)`,
      }}>
        {title}
      </div>
      <div style={{
        fontSize: 20, fontWeight: 400, color: palette.textMuted,
        fontFamily, letterSpacing: 0.3,
        opacity: subtitleOpacity, textAlign: 'center',
      }}>
        {subtitle}
      </div>
    </div>
  );
}
