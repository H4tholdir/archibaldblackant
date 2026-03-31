import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';

type Step = { label: string; sub: string };

type Props = {
  steps: Step[];
  staggerFrames?: number;
  startFrame?: number;
};

export function BotTimeline({ steps, staggerFrames = 30, startFrame = 0 }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: 480 }}>
      {steps.map((step, i) => {
        const dotFrame = startFrame + i * staggerFrames;
        const isLast = i === steps.length - 1;
        const dotProgress = spring({ frame: Math.max(0, frame - dotFrame), fps, config: springBounce, from: 0, to: 1 });
        const lineProgress = isLast ? 0 : interpolate(
          frame - dotFrame - 10,
          [0, staggerFrames - 10],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const isDone = frame > dotFrame + staggerFrames;
        const dotColor = isDone ? palette.green : palette.blue;

        return (
          <div key={step.label}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: dotColor,
                    boxShadow: `0 0 ${20 * dotProgress}px ${dotColor}`,
                    transform: `scale(${dotProgress})`,
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                />
                {!isLast && (
                  <div
                    style={{
                      width: 2,
                      height: 48,
                      background: 'rgba(255,255,255,0.15)',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: `${lineProgress * 100}%`,
                        background: palette.green,
                      }}
                    />
                  </div>
                )}
              </div>
              <div style={{ paddingBottom: isLast ? 0 : 28, opacity: dotProgress }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#FFFFFF', fontFamily: 'Inter, sans-serif' }}>
                  {step.label}
                </div>
                <div style={{ fontSize: 20, color: palette.textMuted, marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
                  {step.sub}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
