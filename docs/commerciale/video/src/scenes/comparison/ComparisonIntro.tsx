// src/scenes/comparison/ComparisonIntro.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, staticFile, Img } from 'remotion';
import { springGentle, springText, easingApple } from '../../lib/springs';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { AntAnimation } from '../../components/AntAnimation';

type Props = {
  title: string;
  subtitle: string;
};

export function ComparisonIntro({ title, subtitle }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoProgress = spring({ frame: Math.max(0, frame - 3), fps, config: springGentle, from: 0, to: 1 });
  const titleOpacity = interpolate(frame, [18, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const titleY = interpolate(frame, [18, 40], [14, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const subtitleOpacity = interpolate(frame, [45, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const badgeOpacity = interpolate(frame, [70, 95], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [195, 210], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20, opacity: fadeOut, position: 'relative', overflow: 'hidden',
    }}>
      {/* Ants */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.18, zIndex: 0, pointerEvents: 'none' }}>
        <AntAnimation width={1920} height={1080} count={5} />
      </div>

      {/* Blue glow */}
      <div style={{
        position: 'absolute', width: 700, height: 700, borderRadius: '50%',
        background: `radial-gradient(circle, ${palette.blue} 0%, transparent 65%)`,
        opacity: 0.07, zIndex: 0, pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{
        transform: `scale(${logoProgress}) translateY(${(1 - logoProgress) * -50}px)`,
        opacity: logoProgress,
        position: 'relative', zIndex: 1,
      }}>
        <Img
          src={staticFile('formicaneralogo.png')}
          style={{ width: 220, height: 205, objectFit: 'contain' }}
        />
      </div>

      {/* Title */}
      <div style={{
        fontSize: 88, fontWeight: 900, color: palette.textPrimary, fontFamily,
        letterSpacing: -2.5, lineHeight: 1, textAlign: 'center',
        opacity: titleOpacity, transform: `translateY(${titleY}px)`,
        position: 'relative', zIndex: 1,
      }}>
        {title}
      </div>

      {/* Subtitle */}
      <div style={{
        fontSize: 20, fontWeight: 400, color: palette.textMuted, fontFamily,
        letterSpacing: 0.3, opacity: subtitleOpacity, textAlign: 'center',
        position: 'relative', zIndex: 1,
      }}>
        {subtitle}
      </div>

      {/* Pill badges */}
      <div style={{
        display: 'flex', gap: 12, marginTop: 8,
        opacity: subtitleOpacity, position: 'relative', zIndex: 1,
      }}>
        <div style={{
          background: 'rgba(0,0,0,0.06)', borderRadius: 20, padding: '7px 20px',
          fontSize: 13, fontWeight: 600, color: palette.textMuted, fontFamily,
        }}>
          Archibald ERP
        </div>
        <div style={{
          background: `rgba(0,122,255,0.10)`, borderRadius: 20, padding: '7px 20px',
          fontSize: 13, fontWeight: 700, color: palette.blue, fontFamily,
          border: `1px solid rgba(0,122,255,0.25)`,
        }}>
          Formicanera PWA
        </div>
      </div>

      {/* REC badge */}
      <div style={{
        position: 'absolute', bottom: 36, right: 48,
        background: 'rgba(255,59,48,0.90)', borderRadius: 20, padding: '7px 18px',
        display: 'flex', alignItems: 'center', gap: 8,
        opacity: badgeOpacity, zIndex: 1,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: '#fff',
          opacity: interpolate(frame % 30, [0, 15, 30], [1, 0.3, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', fontFamily, letterSpacing: 1.5 }}>
          UNEDITED · REAL TIME · NO CUTS
        </span>
      </div>
    </div>
  );
}
