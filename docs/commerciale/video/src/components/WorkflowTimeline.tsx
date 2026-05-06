// src/components/WorkflowTimeline.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springSnap, springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Step = {
  icon: string;
  label: string;
  highlight?: boolean;
};

type Props = {
  title: string;
  steps: Step[];
  color?: string;
  delay?: number;
};

export function WorkflowTimeline({ title, steps, color = palette.textMuted, delay = 0 }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springSnap,
    from: 0,
    to: 1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily, letterSpacing: 2, textTransform: 'uppercase', opacity: titleProgress }}>
        {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {steps.map((step, i) => {
          const stepDelay = delay + 10 + i * 25;
          const stepProgress = spring({ frame: Math.max(0, frame - stepDelay), fps, config: springBounce, from: 0, to: 1 });
          const isLast = i === steps.length - 1;
          const dotColor = step.highlight ? palette.blue : color;

          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                opacity: stepProgress, transform: `scale(${0.7 + stepProgress * 0.3})`,
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: step.highlight ? `${palette.blue}20` : 'rgba(255,255,255,0.06)',
                  border: `2px solid ${dotColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                }}>
                  {step.icon}
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600,
                  color: step.highlight ? palette.blue : palette.textWhiteDim,
                  fontFamily, textAlign: 'center', maxWidth: 72, lineHeight: 1.3,
                }}>
                  {step.label}
                </div>
              </div>
              {!isLast && (
                <div style={{
                  width: 32, height: 2, background: color,
                  opacity: stepProgress * 0.4, margin: '0 4px', marginBottom: 24,
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
