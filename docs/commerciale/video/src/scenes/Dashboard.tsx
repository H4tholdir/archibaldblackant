import { useCurrentFrame, spring, interpolate, useVideoConfig, Easing } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { SCENE_DURATION } from '../lib/timing';

const METRICS: Array<{ to: number; prefix: string; suffix: string; decimals: number; label: string; color: string }> = [
  { to: 3200, prefix: '€ ', suffix: '', decimals: 0, label: 'Provvigioni\nmese corrente', color: palette.blue },
  { to: 67,   prefix: '', suffix: '%', decimals: 0, label: 'Avanzamento\ntarget annuo', color: palette.green },
  { to: 24,   prefix: '', suffix: '', decimals: 0, label: 'Ordini\noggi', color: palette.orange },
  { to: 186,  prefix: '', suffix: '', decimals: 0, label: 'Clienti\nattivi', color: '#FFFFFF' },
];

export function Dashboard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.dashboard;

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const progressBarWidth = interpolate(frame, [80, 160], [0, METRICS[1].to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bg,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 120px',
        gap: 48,
        opacity: fadeOut,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700, color: palette.textPrimary, opacity: titleOpacity }}>
        📊 Provvigioni & Budget
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {METRICS.map((m, i) => {
          const cardProgress = spring({ frame: Math.max(0, frame - i * 10), fps, config: springCard, from: 0, to: 1 });
          return (
            <div
              key={i}
              style={{
                flex: 1,
                background: palette.darkBg,
                borderRadius: 20,
                padding: '24px 20px',
                textAlign: 'center',
                transform: `scale(${cardProgress}) translateY(${(1 - cardProgress) * 30}px)`,
                opacity: cardProgress,
              }}
            >
              <div style={{ fontSize: 52, fontWeight: 900, color: m.color, lineHeight: 1, marginBottom: 10 }}>
                <AnimatedNumber
                  to={m.to}
                  prefix={m.prefix}
                  suffix={m.suffix}
                  decimals={m.decimals}
                  delay={i * 10}
                  durationInFrames={60}
                />
              </div>
              <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', letterSpacing: 1, lineHeight: 1.4 }}>
                {m.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div>
        <div style={{ background: palette.divider, borderRadius: 20, height: 12, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              borderRadius: 20,
              background: `linear-gradient(90deg, ${palette.blue}, ${palette.green})`,
              width: `${progressBarWidth}%`,
            }}
          />
        </div>
        <div style={{ fontSize: 22, color: palette.textMuted, marginTop: 12, textAlign: 'right' }}>
          € 67.400 / € 100.000 target annuo
        </div>
      </div>
    </div>
  );
}
