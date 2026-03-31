// src/components/BotTimeline.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springSnap } from '../lib/springs';
import { palette } from '../lib/palette';

type Step = {
  label: string;
  /** @deprecated use sub for old API */
  sub?: string;
  doneAtFrame?: number;   // frame assoluto in cui il dot diventa verde
  activeAtFrame?: number; // frame assoluto in cui inizia a pulsare
};

type Props = {
  steps: Step[];
  delay?: number;
  /** @deprecated legacy: stagger tra step (usato in v1) */
  staggerFrames?: number;
  /** @deprecated legacy: frame di inizio (usato in v1) */
  startFrame?: number;
};

export function BotTimeline({ steps, delay = 0, staggerFrames = 30, startFrame = 0 }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Normalize steps: support both v1 (stagger-based) and v2 (explicit frames)
  const normalizedSteps = steps.map((s, i) => ({
    label: s.label,
    activeAtFrame: s.activeAtFrame ?? (startFrame + i * staggerFrames),
    doneAtFrame: s.doneAtFrame ?? (startFrame + i * staggerFrames + staggerFrames),
  }));

  const lastDone = normalizedSteps[normalizedSteps.length - 1].doneAtFrame;

  const lineProgress = interpolate(
    frame - delay,
    [0, lastDone + 30],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {normalizedSteps.map((step, i) => {
        const isDone = frame >= step.doneAtFrame + delay;
        const isActive = frame >= step.activeAtFrame + delay && !isDone;

        const dotColor = isDone
          ? palette.green
          : isActive
          ? palette.blue
          : palette.textMuted;

        const dotProgress = spring({
          frame: Math.max(0, frame - delay - step.activeAtFrame),
          fps,
          config: springSnap,
          from: 0,
          to: 1,
        });

        const pulseFactor = isActive
          ? 1 + Math.sin((frame / 8) * Math.PI) * 0.15
          : 1;

        const labelProgress = interpolate(
          frame - delay - step.activeAtFrame,
          [0, 20],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        return (
          <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: dotColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  color: '#fff',
                  fontWeight: 700,
                  transform: `scale(${dotProgress > 0.1 ? pulseFactor : dotProgress})`,
                  boxShadow: isDone ? `0 0 12px ${palette.green}60` : isActive ? `0 0 12px ${palette.blue}80` : 'none',
                  flexShrink: 0,
                  transition: 'background 0.3s',
                }}
              >
                {isDone ? '✓' : ''}
              </div>
              {i < normalizedSteps.length - 1 && (
                <div
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: 24,
                    background: palette.dividerDark,
                    marginTop: 4,
                    marginBottom: 4,
                    borderRadius: 2,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      background: isDone ? palette.green : palette.blue,
                      height: isDone ? '100%' : `${lineProgress * 100}%`,
                      transition: 'none',
                      borderRadius: 2,
                    }}
                  />
                </div>
              )}
            </div>
            <div
              style={{
                paddingTop: 3,
                paddingBottom: i < normalizedSteps.length - 1 ? 24 : 0,
                opacity: labelProgress,
                transform: `translateX(${(1 - labelProgress) * 10}px)`,
              }}
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: isDone ? palette.textWhite : isActive ? palette.textWhiteDim : palette.textWhiteFaint,
                  fontFamily: 'Inter, sans-serif',
                  lineHeight: 1.3,
                }}
              >
                {step.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
