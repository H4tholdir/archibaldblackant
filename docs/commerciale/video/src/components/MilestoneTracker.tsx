// src/components/MilestoneTracker.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Milestone = {
  frame: number;
  time: string;
  label: string;
  color?: string;
};

type Props = {
  milestones: Milestone[];
  /** Dimensione di ogni cerchio in px (default 72) */
  size?: number;
};

export function MilestoneTracker({ milestones, size = 72 }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      pointerEvents: 'none',
    }}>
      {milestones.map((m) => {
        if (frame < m.frame) return null;

        const relFrame = frame - m.frame;
        const progress = spring({
          frame: relFrame,
          fps,
          config: springBounce,
          from: 0,
          to: 1,
        });

        const color = m.color ?? palette.green;

        return (
          <div
            key={m.time}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              opacity: progress,
              transform: `scale(${0.5 + progress * 0.5})`,
            }}
          >
            {/* Cerchio mini-timer */}
            <div style={{
              width: size,
              height: size,
              borderRadius: '50%',
              background: palette.bgDark,
              border: `2.5px solid ${color}`,
              boxShadow: `0 0 14px ${color}50`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}>
              {/* Checkmark piccolo */}
              <div style={{
                fontSize: size * 0.16,
                color: `${color}`,
                fontWeight: 900,
                fontFamily,
                lineHeight: 1,
              }}>
                ✓
              </div>
              {/* Timestamp */}
              <div style={{
                fontSize: size * 0.21,
                fontWeight: 900,
                color,
                fontFamily,
                letterSpacing: -0.5,
                lineHeight: 1,
              }}>
                {m.time}
              </div>
            </div>

            {/* Label sotto il cerchio */}
            <div style={{
              fontSize: 9,
              fontWeight: 700,
              color: palette.textMuted,
              fontFamily,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              textAlign: 'center',
              maxWidth: size + 8,
              lineHeight: 1.3,
            }}>
              {m.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
