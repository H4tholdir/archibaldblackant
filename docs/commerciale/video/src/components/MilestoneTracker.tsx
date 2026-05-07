// src/components/MilestoneTracker.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Milestone = {
  frame: number;      // frame in cui appare
  time: string;       // es. "0:53"
  label: string;      // es. "Client confirmed"
  color?: string;     // default palette.green
};

type Props = {
  milestones: Milestone[];
};

export function MilestoneTracker({ milestones }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 5,
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
              alignItems: 'center',
              gap: 6,
              background: `rgba(${color === palette.green ? '52,199,89' : '0,122,255'},0.12)`,
              border: `1px solid ${color === palette.green ? 'rgba(52,199,89,0.40)' : 'rgba(0,122,255,0.40)'}`,
              borderRadius: 20,
              padding: '4px 12px',
              opacity: progress,
              transform: `scale(${0.7 + progress * 0.3}) translateY(${(1 - progress) * 8}px)`,
              boxShadow: `0 0 10px ${color}30`,
            }}
          >
            <span style={{
              fontSize: 10,
              fontWeight: 900,
              color,
              fontFamily,
              letterSpacing: 0.5,
            }}>
              ✓
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color,
              fontFamily,
              letterSpacing: 0.3,
              whiteSpace: 'nowrap',
            }}>
              {m.time}
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: 500,
              color: `${color === palette.green ? 'rgba(52,199,89,0.80)' : 'rgba(0,122,255,0.80)'}`,
              fontFamily,
              whiteSpace: 'nowrap',
            }}>
              {m.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
