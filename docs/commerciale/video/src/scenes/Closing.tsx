// src/scenes/Closing.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, staticFile, Img } from 'remotion';
import { springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';

export function Closing() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.closing;

  const glowBreathe = 0.04 + Math.sin((frame / 60) * Math.PI) * 0.03;
  const logoProgress = spring({ frame, fps, config: springBounce, from: 0, to: 1 });

  const titleOpacity = interpolate(frame, [20, 45], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const titleY = interpolate(frame, [20, 45], [12, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const subtitleOpacity = interpolate(frame, [35, 55], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const ctaProgress = spring({ frame: Math.max(0, frame - 70), fps, config: springBounce, from: 0, to: 1 });
  const ctaGlow = 0.3 + Math.sin((frame / 20) * Math.PI) * 0.2;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: `radial-gradient(ellipse at center bottom, rgba(0,122,255,${glowBreathe}) 0%, ${palette.bg} 65%)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        transform: `scale(${logoProgress}) translateY(${(1 - logoProgress) * -60}px)`,
        opacity: logoProgress,
        filter: `drop-shadow(0 ${8 * logoProgress}px ${24 * logoProgress}px rgba(0,122,255,${0.25 * logoProgress}))`,
      }}>
        <Img
          src={staticFile('formicaneralogo.png')}
          style={{ width: 88, height: 88, objectFit: 'contain' }}
        />
      </div>

      <div style={{
        fontSize: 72, fontWeight: 900, color: palette.textPrimary,
        fontFamily: 'Inter, sans-serif', letterSpacing: -2,
        opacity: titleOpacity,
        transform: `translateY(${titleY}px)`,
      }}>
        Formicanera
      </div>

      <div style={{
        fontSize: 20, fontWeight: 600, color: palette.blue,
        fontFamily: 'Inter, sans-serif', letterSpacing: 3, textTransform: 'uppercase',
        opacity: subtitleOpacity,
      }}>
        Il vantaggio competitivo · Komet Italia
      </div>

      <div style={{
        marginTop: 16,
        background: palette.blue, color: '#fff',
        borderRadius: 16, padding: '18px 48px',
        fontSize: 20, fontWeight: 700, fontFamily: 'Inter, sans-serif',
        transform: `scale(${ctaProgress})`,
        opacity: ctaProgress,
        boxShadow: `0 8px 40px rgba(0,122,255,${ctaGlow})`,
      }}>
        Richiedi una demo
      </div>
    </div>
  );
}
