// src/scenes/Dashboard.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { MetricCard } from '../components/MetricCard';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { ProgressBar } from '../components/ProgressBar';

const CHART_POINTS = [
  [0, 80], [60, 55], [120, 70], [180, 45], [240, 60],
  [300, 35], [360, 50], [420, 25], [480, 40], [540, 30], [600, 15], [660, 10],
];

function pointsToPath(pts: number[][]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
}

const CHART_FRAME    = 180;
const CHART_DURATION = 120;
const YOY_FRAME      = 360;

export function Dashboard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.dashboard;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const chartProgress = interpolate(frame, [CHART_FRAME, CHART_FRAME + CHART_DURATION], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const visiblePointCount = Math.max(2, Math.round(chartProgress * CHART_POINTS.length));
  const visiblePoints = CHART_POINTS.slice(0, visiblePointCount);

  const yoyProgress = spring({ frame: Math.max(0, frame - YOY_FRAME), fps, config: springBounce, from: 0, to: 1 });

  const METRICS = [
    { icon: '💰', label: 'Fatturato YTD',    value: 124800, prefix: '€ ', decimals: 0, color: palette.blue   },
    { icon: '🏆', label: 'Commissioni',      value: 8736,   prefix: '€ ', decimals: 0, color: palette.green  },
    { icon: '📋', label: 'Ordini mese',      value: 47,     prefix: '',   decimals: 0, color: palette.purple  },
    { icon: '🎯', label: 'Budget progresso', value: 67,     prefix: '',   decimals: 0, color: palette.orange  },
  ];

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      gap: 28, opacity: fadeOut, padding: '48px 80px',
    }}>
      <div>
        <div style={{ fontSize: 38, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          📊 Dashboard — Business Intelligence
        </div>
        <div style={{ fontSize: 18, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
          Tutto quello che ti serve sapere, in un colpo d&apos;occhio
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {METRICS.map((m, i) => (
          <MetricCard key={i} icon={m.icon} label={m.label} color={m.color} delay={i * 20}>
            {m.label === 'Budget progresso' ? (
              <div>
                <AnimatedNumber
                  from={0} to={m.value}
                  delay={i * 20} durationInFrames={60}
                  prefix={m.prefix} suffix="%" decimals={m.decimals}
                  fontSize={36} fontWeight={900} color={m.color} pulse
                />
                <div style={{ marginTop: 8 }}>
                  <ProgressBar
                    progress={m.value / 100}
                    delay={i * 20 + 10} durationInFrames={60}
                    color={m.color} height={6}
                  />
                </div>
              </div>
            ) : (
              <AnimatedNumber
                from={0} to={m.value}
                delay={i * 20} durationInFrames={60}
                prefix={m.prefix} decimals={m.decimals}
                euroFormat={m.prefix === '€ '}
                fontSize={36} fontWeight={900} color={m.color} pulse
              />
            )}
          </MetricCard>
        ))}
      </div>

      <div style={{
        background: palette.bgCard, borderRadius: 20, padding: 24,
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)', flex: 1,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
            Fatturato mensile 2026
          </div>
          {frame >= YOY_FRAME && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: yoyProgress, transform: `scale(${yoyProgress})`,
            }}>
              <span style={{ fontSize: 20, color: palette.green }}>↑</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: palette.green, fontFamily: 'Inter, sans-serif' }}>
                +18% vs 2025
              </span>
            </div>
          )}
        </div>

        <svg width="100%" height="120" viewBox="0 0 660 120" preserveAspectRatio="none">
          {visiblePoints.length > 1 && (
            <path
              d={`${pointsToPath(visiblePoints)} L ${visiblePoints[visiblePoints.length - 1][0]} 110 L 0 110 Z`}
              fill={`${palette.blue}18`}
            />
          )}
          {visiblePoints.length > 1 && (
            <path
              d={pointsToPath(visiblePoints)}
              fill="none"
              stroke={palette.blue}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {chartProgress > 0.5 && (
            <path
              d="M 0 90 L 60 75 L 120 85 L 180 65 L 240 78 L 300 55 L 360 68 L 420 45 L 480 58 L 540 50 L 600 35 L 660 30"
              fill="none"
              stroke={palette.textMuted}
              strokeWidth={2}
              strokeDasharray="6 4"
              opacity={interpolate(chartProgress, [0.5, 0.8], [0, 0.5], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
            />
          )}
        </svg>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          {['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'].map((m, i) => {
            const mOpacity = interpolate(frame, [CHART_FRAME + i * 8, CHART_FRAME + i * 8 + 15], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });
            return (
              <span key={i} style={{ fontSize: 12, color: palette.textMuted, fontFamily: 'Inter, sans-serif', opacity: mOpacity }}>
                {m}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
