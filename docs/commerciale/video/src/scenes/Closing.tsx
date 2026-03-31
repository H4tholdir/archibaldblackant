// src/scenes/Closing.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, staticFile, Img } from 'remotion';
import { springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { Ant } from '../components/Ant';

export function Closing() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.closing;

  const breathe = 0.12 + Math.sin((frame / 60) * Math.PI) * 0.06;
  const logoProgress = spring({ frame, fps, config: springBounce, from: 0, to: 1 });

  const titleOpacity = interpolate(frame, [25, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [25, 50], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });

  const subtitleOpacity = interpolate(frame, [45, 65], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const taglineOpacity = interpolate(frame, [65, 85], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: `radial-gradient(ellipse at 50% 45%, rgba(0,122,255,${breathe}) 0%, rgba(10,10,20,0.95) 55%, ${palette.bgDark} 100%)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, position: 'relative', overflow: 'hidden',
    }}>
      {/* Subtle grid pattern overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '80px 80px',
        pointerEvents: 'none',
      }} />

      {/* Logo — molto più grande */}
      <div style={{
        transform: `scale(${logoProgress}) translateY(${(1 - logoProgress) * -60}px)`,
        opacity: logoProgress,
        filter: `drop-shadow(0 ${12 * logoProgress}px ${40 * logoProgress}px rgba(0,122,255,${0.45 * logoProgress}))`,
      }}>
        <Img
          src={staticFile('formicaneralogo.png')}
          style={{ width: 180, height: 168, objectFit: 'contain' }}
        />
      </div>

      {/* Formicanera */}
      <div style={{
        fontSize: 88, fontWeight: 900,
        color: palette.textWhite,
        fontFamily: 'Inter, sans-serif', letterSpacing: -3,
        opacity: titleOpacity,
        transform: `translateY(${titleY}px)`,
        textShadow: '0 4px 40px rgba(0,0,0,0.40)',
      }}>
        Formicanera
      </div>

      {/* Sottotitolo */}
      <div style={{
        fontSize: 22, fontWeight: 600, color: palette.blue,
        fontFamily: 'Inter, sans-serif', letterSpacing: 3, textTransform: 'uppercase',
        opacity: subtitleOpacity,
      }}>
        Il vantaggio competitivo · Komet Italia
      </div>

      {/* Tagline aggiuntiva */}
      <div style={{
        fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.38)',
        fontFamily: 'Inter, sans-serif',
        opacity: taglineOpacity,
        marginTop: 8,
      }}>
        Dal campo all&apos;ERP — senza toccare l&apos;ERP.
      </div>

      {/* Formiche che camminano nella scena finale */}
      <Ant startX={-60}  endX={1980} y={980} startFrame={60}  endFrame={dur} size={32} />
      <Ant startX={1980} endX={-60}  y={940} startFrame={80}  endFrame={dur} size={24} flip />
      <Ant startX={-60}  endX={1980} y={1010} startFrame={100} endFrame={dur} size={40} />
      <Ant startX={1980} endX={-60}  y={960} startFrame={120} endFrame={dur} size={28} flip />
      <Ant startX={-60}  endX={600}  y={1030} startFrame={40}  endFrame={dur} size={20} />
    </div>
  );
}
