// src/components/IntegrationHub.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';

type Integration = {
  name: string;
  icon: string;
  color: string;
  x: number;
  y: number;
};

type Props = {
  integrations: Integration[];
  centerIcon: string;
  delay?: number;
  spotlightIndex?: number | null;
};

export function IntegrationHub({ integrations, centerIcon, delay = 0, spotlightIndex = null }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const centerProgress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springBounce,
    from: 0,
    to: 1,
  });

  return (
    <div style={{ position: 'relative', width: 480, height: 480 }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${centerProgress})`,
          opacity: centerProgress,
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: palette.bgCard,
            boxShadow: `0 8px 32px rgba(0,122,255,0.30), 0 0 0 2px ${palette.blue}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 36,
          }}
        >
          {centerIcon}
        </div>
      </div>

      {integrations.map((integ, i) => {
        const logoDelay = delay + 20 + i * 20;
        const logoProgress = spring({
          frame: Math.max(0, frame - logoDelay),
          fps,
          config: springBounce,
          from: 0,
          to: 1,
        });

        const lineProgress = interpolate(
          frame - logoDelay - 10,
          [0, 30],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        const isSpotlight = spotlightIndex === i;
        const othersDimmed = spotlightIndex !== null && !isSpotlight;
        const particleOffset = ((frame - logoDelay) % 30) / 30;

        const cx = 240;
        const cy = 240;

        return (
          <div key={i}>
            <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width="480" height="480">
              <line
                x1={cx} y1={cy}
                x2={cx + integ.x * lineProgress}
                y2={cy + integ.y * lineProgress}
                stroke={integ.color}
                strokeWidth={2}
                strokeOpacity={othersDimmed ? 0.15 : 0.4}
                strokeDasharray="6 4"
              />
              {lineProgress > 0.8 && (
                <circle
                  cx={cx + integ.x * particleOffset}
                  cy={cy + integ.y * particleOffset}
                  r={4}
                  fill={integ.color}
                  opacity={othersDimmed ? 0.2 : 0.8}
                />
              )}
            </svg>
            <div
              style={{
                position: 'absolute',
                left: cx + integ.x - 32,
                top: cy + integ.y - 32,
                transform: `scale(${logoProgress * (isSpotlight ? 1.15 : 1)})`,
                opacity: logoProgress * (othersDimmed ? 0.3 : 1),
                transition: 'opacity 0.3s',
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  background: palette.bgCard,
                  boxShadow: isSpotlight
                    ? `0 8px 32px ${integ.color}50, 0 0 0 2px ${integ.color}`
                    : `0 4px 16px rgba(0,0,0,0.12)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                }}
              >
                {integ.icon}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
