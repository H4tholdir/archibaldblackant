// src/components/PwaCompletionOverlay.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Props = {
  /** Frame RELATIVO alla sequenza in cui l'overlay appare */
  showAtFrame: number;
};

const ACTIONS = [
  { icon: '📋', text: 'Creating the next pending order', delay: 40 },
  { icon: '📊', text: 'Reviewing client history & documents', delay: 70 },
  { icon: '📅', text: 'Checking appointments & reminders', delay: 100 },
  { icon: '📱', text: 'Switching device — same session continues', delay: 130, highlight: true },
  { icon: '🚗', text: 'Submitting in batch — from the car, from home', delay: 160, highlight: true },
];

export function PwaCompletionOverlay({ showAtFrame }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < showAtFrame) return null;

  const relFrame = frame - showAtFrame;

  // Entrata overlay
  const bgOpacity = interpolate(relFrame, [0, 20], [0, 0.93], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  // Badge "✓ Complete"
  const badgeProgress = spring({ frame: Math.max(0, relFrame - 5), fps, config: springBounce, from: 0, to: 1 });

  // Headline "While ERP is still typing..."
  const headlineOpacity = interpolate(relFrame, [30, 55], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  // Tagline finale
  const taglineOpacity = interpolate(relFrame, [200, 230], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: `rgba(12, 15, 22, ${bgOpacity})`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '20px 24px',
      gap: 14,
      zIndex: 5,
    }}>
      {/* Badge completamento */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        opacity: badgeProgress,
        transform: `scale(${0.7 + badgeProgress * 0.3})`,
      }}>
        <div style={{
          background: 'rgba(52,199,89,0.15)',
          border: '2px solid rgba(52,199,89,0.50)',
          borderRadius: 40,
          padding: '8px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: '0 0 24px rgba(52,199,89,0.20)',
        }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <span style={{
            fontSize: 22,
            fontWeight: 900,
            color: palette.green,
            fontFamily,
            letterSpacing: -0.5,
          }}>
            3:06 — Complete
          </span>
        </div>
        <div style={{
          fontSize: 12,
          color: palette.textMuted,
          fontFamily,
          letterSpacing: 0.5,
          opacity: badgeProgress,
        }}>
          Order confirmed on Archibald ERP
        </div>
      </div>

      {/* Divisore */}
      <div style={{
        height: 1,
        background: 'rgba(255,255,255,0.08)',
        opacity: headlineOpacity,
      }} />

      {/* Headline contrasto */}
      <div style={{
        fontSize: 14,
        fontWeight: 700,
        color: palette.textMuted,
        fontFamily,
        textAlign: 'center',
        opacity: headlineOpacity,
        letterSpacing: 0.3,
      }}>
        While ERP is still working at the desk…
      </div>

      {/* Action cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {ACTIONS.map((action) => {
          const itemProgress = spring({
            frame: Math.max(0, relFrame - action.delay),
            fps,
            config: springCard,
            from: 0,
            to: 1,
          });
          return (
            <div
              key={action.text}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                background: action.highlight
                  ? 'rgba(0,122,255,0.15)'
                  : 'rgba(255,255,255,0.06)',
                borderLeft: `2px solid ${action.highlight ? palette.blue : 'rgba(255,255,255,0.12)'}`,
                borderRadius: '0 8px 8px 0',
                opacity: itemProgress,
                transform: `translateX(${(1 - itemProgress) * 20}px)`,
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{action.icon}</span>
              <span style={{
                fontSize: 12,
                fontWeight: action.highlight ? 700 : 500,
                color: action.highlight ? palette.blue : palette.textWhiteDim,
                fontFamily,
                lineHeight: 1.3,
              }}>
                {action.text}
              </span>
            </div>
          );
        })}
      </div>

      {/* Divisore */}
      <div style={{
        height: 1,
        background: 'rgba(255,255,255,0.06)',
        opacity: taglineOpacity,
      }} />

      {/* Tagline */}
      <div style={{
        textAlign: 'center',
        opacity: taglineOpacity,
      }}>
        <div style={{
          fontSize: 15,
          fontWeight: 800,
          color: palette.textWhite,
          fontFamily,
          letterSpacing: -0.3,
        }}>
          "Anytime. From anywhere."
        </div>
        <div style={{
          fontSize: 11,
          color: palette.textMuted,
          fontFamily,
          marginTop: 4,
          letterSpacing: 0.3,
        }}>
          Not faster — differently managed.
        </div>
      </div>
    </div>
  );
}
