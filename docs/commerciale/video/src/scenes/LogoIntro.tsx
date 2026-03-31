// src/scenes/LogoIntro.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, staticFile, Img } from 'remotion';
import { springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';

export function LogoIntro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.logo;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const logoProgress = spring({ frame, fps, config: springBounce, from: 0, to: 1 });
  const titleOpacity = interpolate(frame, [15, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [15, 35], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const taglineOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const taglineY = interpolate(frame, [30, 50], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });

  const glowOpacity = interpolate(frame, [0, 30, 90, 105], [0, 0.08, 0.08, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        opacity: fadeOut,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow radiale */}
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${palette.blue} 0%, transparent 65%)`,
          opacity: glowOpacity,
          pointerEvents: 'none',
        }}
      />

      {/* Logo */}
      <div
        style={{
          transform: `scale(${logoProgress}) translateY(${(1 - logoProgress) * -60}px)`,
          opacity: logoProgress,
          filter: `drop-shadow(0 8px 24px rgba(0,122,255,0.25))`,
        }}
      >
        <Img
          src={staticFile('formicaneralogo.png')}
          style={{ width: 220, height: 205, objectFit: 'contain' }}
        />
      </div>

      {/* Formicanera */}
      <div
        style={{
          fontSize: 72,
          fontWeight: 900,
          color: palette.textPrimary,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: -1.5,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        Formicanera
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 400,
          color: palette.textMuted,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: 0.5,
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
        }}
      >
        Il vantaggio competitivo
      </div>
    </div>
  );
}
