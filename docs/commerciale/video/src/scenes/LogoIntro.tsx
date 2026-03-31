import { useCurrentFrame, spring, useVideoConfig, Img, staticFile, interpolate } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_DURATION } from '../lib/timing';

export function LogoIntro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.logoIntro;

  const logoProgress = spring({ frame, fps, config: springBounce, from: 0, to: 1 });
  const textOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tagOpacity = interpolate(frame, [35, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

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
        gap: 28,
        opacity: fadeOut,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* glow radiale centrato */}
      <div
        style={{
          position: 'absolute',
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,122,255,0.08) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      <Img
        src={staticFile('formicaneralogo.png')}
        style={{
          width: 220,
          height: 220,
          objectFit: 'contain',
          transform: `scale(${logoProgress}) translateY(${(1 - logoProgress) * -60}px)`,
          filter: 'drop-shadow(0 16px 48px rgba(0,122,255,0.35))',
        }}
      />
      <div
        style={{
          fontSize: 72,
          fontWeight: 900,
          color: palette.textPrimary,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: -2,
          opacity: textOpacity,
        }}
      >
        Formicanera
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          color: palette.blue,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: 4,
          textTransform: 'uppercase',
          opacity: tagOpacity,
        }}
      >
        Il vantaggio competitivo
      </div>
    </div>
  );
}
