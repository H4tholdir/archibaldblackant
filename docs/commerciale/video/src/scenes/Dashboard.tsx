// src/scenes/Dashboard.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, springSnap, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { ProgressBar } from '../components/ProgressBar';
import { Confetti } from '../components/Confetti';
import { SceneCaption } from '../components/SceneCaption';

const HERO_FRAME     = 0;
const METRICS_FRAME  = 60;
const CHART_FRAME    = 150;
const GOAL_FRAME     = 330;
const YOY_FRAME      = 380;

function GaugeChart({ progress }: { progress: number }) {
  const R = 100;
  const CX = 140, CY = 130;
  const startAngle = -180;
  const endAngle   = 0;

  function polarToXY(angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
  }

  const bgStart = polarToXY(startAngle);
  const bgEnd   = polarToXY(endAngle);
  const bgPath  = `M ${bgStart.x} ${bgStart.y} A ${R} ${R} 0 1 1 ${bgEnd.x} ${bgEnd.y}`;

  const fillAngle = startAngle + (endAngle - startAngle) * progress;
  const fillEnd   = polarToXY(fillAngle);
  const largeArc  = fillAngle - startAngle > 180 ? 1 : 0;
  const fillPath  = `M ${bgStart.x} ${bgStart.y} A ${R} ${R} 0 ${largeArc} 1 ${fillEnd.x} ${fillEnd.y}`;

  const statusColor = progress >= 1 ? palette.green : progress > 0.7 ? palette.blue : progress > 0.4 ? palette.orange : palette.red;

  return (
    <svg width="280" height="150" viewBox="0 0 280 150">
      <path d={bgPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="18" strokeLinecap="round" />
      {progress > 0 && (
        <path d={fillPath} fill="none" stroke={statusColor} strokeWidth="18" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${statusColor}80)` }} />
      )}
      <text x={CX} y={CY + 10} textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="32" fill="white">
        {Math.round(progress * 100)}%
      </text>
      <text x={CX} y={CY + 30} textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="13" fill="rgba(255,255,255,0.45)">
        Budget
      </text>
    </svg>
  );
}

const CHART_POINTS = [
  [0, 90], [55, 65], [110, 78], [165, 48], [220, 62],
  [275, 38], [330, 54], [385, 28], [440, 45], [495, 32], [550, 18], [605, 12],
];

function pointsToPath(pts: number[][]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
}

export function Dashboard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.dashboard;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const heroProgress = spring({ frame: Math.max(0, frame - HERO_FRAME), fps, config: springCard, from: 0, to: 1 });

  const budgetValue = interpolate(frame, [METRICS_FRAME, GOAL_FRAME], [0, 100], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });
  const gaugeProgress = budgetValue / 100;

  const goalReached = frame >= GOAL_FRAME;
  const goalBadgeOpacity = interpolate(frame, [GOAL_FRAME, GOAL_FRAME + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const chartProgress = interpolate(frame, [CHART_FRAME, CHART_FRAME + 120], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });
  const visiblePointCount = Math.max(2, Math.round(chartProgress * CHART_POINTS.length));
  const visiblePoints = CHART_POINTS.slice(0, visiblePointCount);

  const yoyProgress = spring({ frame: Math.max(0, frame - YOY_FRAME), fps, config: springBounce, from: 0, to: 1 });

  const METRICS = [
    { icon: '💰', label: 'Fatturato YTD', value: 124800, prefix: '€ ', color: palette.blue },
    { icon: '🏆', label: 'Commissioni', value: 8736, prefix: '€ ', color: palette.green },
    { icon: '📋', label: 'Ordini mese', value: 47, prefix: '', suffix: ' ordini', color: palette.purple },
    { icon: '⭐', label: 'Clienti attivi', value: 38, prefix: '', suffix: ' clienti', color: palette.orange },
  ];

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bgDark,
      display: 'flex', flexDirection: 'column',
      opacity: fadeOut, padding: '40px 72px',
      position: 'relative', overflow: 'hidden',
    }}>
      {goalReached && <Confetti triggerFrame={GOAL_FRAME} count={70} duration={100} originX={0.25} originY={0.35} />}

      <div style={{ marginBottom: 32, opacity: heroProgress, transform: `translateY(${(1 - heroProgress) * -20}px)` }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: palette.blue, letterSpacing: 3, textTransform: 'uppercase', fontFamily: 'Inter, sans-serif', marginBottom: 8 }}>
          Business Intelligence
        </div>
        <div style={{ fontSize: 40, fontWeight: 900, color: palette.textWhite, fontFamily: 'Inter, sans-serif', letterSpacing: -1 }}>
          📊 La tua Dashboard
        </div>
      </div>

      <div style={{ display: 'flex', gap: 32, flex: 1 }}>
        <div style={{ flex: '0 0 340px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
            borderRadius: 20, padding: '20px 24px',
            boxShadow: '0 8px 40px rgba(0,122,255,0.25)',
            opacity: heroProgress,
            transform: `scale(${0.95 + heroProgress * 0.05})`,
            position: 'relative',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'Inter, sans-serif', marginBottom: 8 }}>
              Obiettivo mensile
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GaugeChart progress={gaugeProgress} />
            </div>
            {goalReached && (
              <div style={{
                marginTop: 8,
                background: 'rgba(52,199,89,0.20)', border: `1.5px solid ${palette.green}`,
                borderRadius: 12, padding: '8px 16px', textAlign: 'center',
                fontSize: 15, fontWeight: 800, color: palette.green, fontFamily: 'Inter, sans-serif',
                opacity: goalBadgeOpacity,
                boxShadow: `0 0 20px ${palette.green}40`,
              }}>
                🎉 Obiettivo raggiunto!
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {METRICS.map((m, i) => {
              const mProgress = spring({ frame: Math.max(0, frame - METRICS_FRAME - i * 15), fps, config: springSnap, from: 0, to: 1 });
              return (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 16px',
                  border: `1px solid rgba(255,255,255,0.08)`,
                  opacity: mProgress, transform: `scale(${0.92 + mProgress * 0.08})`,
                }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{m.icon}</div>
                  <div style={{ fontFamily: 'Inter, sans-serif' }}>
                    <AnimatedNumber from={0} to={m.value} delay={METRICS_FRAME + i * 15} durationInFrames={60}
                      prefix={m.prefix} suffix={m.suffix ?? ''} euroFormat={m.prefix === '€ '}
                      fontSize={22} fontWeight={900} color={m.color} />
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>{m.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: '20px 24px',
            border: '1px solid rgba(255,255,255,0.08)', flex: 1,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: palette.textWhite, fontFamily: 'Inter, sans-serif' }}>
                Fatturato mensile 2026
              </div>
              {frame >= YOY_FRAME && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: yoyProgress, transform: `scale(${yoyProgress})` }}>
                  <span style={{ fontSize: 18, color: palette.green }}>↑</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: palette.green, fontFamily: 'Inter, sans-serif' }}>+18% vs 2025</span>
                </div>
              )}
            </div>

            <svg width="100%" height="160" viewBox="0 0 660 120" preserveAspectRatio="none">
              {visiblePoints.length > 1 && (
                <path d={`${pointsToPath(visiblePoints)} L ${visiblePoints[visiblePoints.length - 1][0]} 110 L 0 110 Z`}
                  fill={`${palette.blue}25`} />
              )}
              {visiblePoints.length > 1 && (
                <path d={pointsToPath(visiblePoints)} fill="none" stroke={palette.blue} strokeWidth={3}
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ filter: `drop-shadow(0 0 6px ${palette.blue}80)` }} />
              )}
              {chartProgress > 0.5 && (
                <path d="M 0 100 L 55 82 L 110 90 L 165 68 L 220 80 L 275 58 L 330 72 L 385 50 L 440 62 L 495 54 L 550 40 L 605 36"
                  fill="none" stroke={palette.textMuted} strokeWidth={1.5} strokeDasharray="5 4"
                  opacity={interpolate(chartProgress, [0.5, 0.8], [0, 0.35], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
              )}
            </svg>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              {['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'].map((m, i) => {
                const mOpacity = interpolate(frame, [CHART_FRAME + i * 8, CHART_FRAME + i * 8 + 15], [0, 1], {
                  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                });
                return (
                  <span key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', fontFamily: 'Inter, sans-serif', opacity: mOpacity }}>
                    {m}
                  </span>
                );
              })}
            </div>
          </div>

          <div style={{
            background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '16px 20px',
            border: '1px solid rgba(255,255,255,0.08)',
            opacity: interpolate(frame, [METRICS_FRAME + 60, METRICS_FRAME + 80], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.40)', fontFamily: 'Inter, sans-serif', marginBottom: 8 }}>
              Avanzamento commissioni
            </div>
            <ProgressBar progress={0.72} delay={METRICS_FRAME + 40} durationInFrames={80} color={palette.green} height={8} label="€ 8.736" showPercent />
          </div>
        </div>
      </div>

      <SceneCaption
        main="Fatturato, commissioni e budget a colpo d'occhio — dati ERP in tempo reale"
        vs="vs ERP: nessun cruscotto, dati dispersi in schermate separate"
        delay={30}
      />
    </div>
  );
}
