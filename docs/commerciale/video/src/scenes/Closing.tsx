import { useCurrentFrame, spring, interpolate, Img, staticFile, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
export function Closing() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoProgress = spring({ frame, fps, config: springBounce, from: 0, to: 1 });
  const titleOpacity = interpolate(frame, [20, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOpacity = interpolate(frame, [35, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const btnProgress = spring({ frame: Math.max(0, frame - 55), fps, config: springBounce, from: 0, to: 1 });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `linear-gradient(160deg, ${palette.bg} 0%, #FFFFFF 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* glow radiale basso */}
      <div
        style={{
          position: 'absolute',
          bottom: -200,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,122,255,0.07) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      <Img
        src={staticFile('formicaneralogo.png')}
        style={{
          width: 180,
          height: 180,
          objectFit: 'contain',
          transform: `scale(${logoProgress}) translateY(${(1 - logoProgress) * -50}px)`,
          filter: 'drop-shadow(0 12px 40px rgba(0,122,255,0.3))',
        }}
      />
      <div
        style={{
          fontSize: 80,
          fontWeight: 900,
          color: palette.textPrimary,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: -2,
          opacity: titleOpacity,
        }}
      >
        Formicanera
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 600,
          color: palette.blue,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: 4,
          textTransform: 'uppercase',
          opacity: subOpacity,
        }}
      >
        Il vantaggio competitivo · Komet Italia
      </div>
      <div
        style={{
          background: palette.blue,
          color: '#FFFFFF',
          borderRadius: 50,
          padding: '20px 60px',
          fontSize: 28,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
          transform: `scale(${btnProgress})`,
          opacity: btnProgress,
          marginTop: 8,
        }}
      >
        Richiedi una demo
      </div>
    </div>
  );
}
