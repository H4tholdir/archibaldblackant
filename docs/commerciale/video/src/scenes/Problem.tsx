import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springText } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_DURATION } from '../lib/timing';

const LINES = [
  '20 minuti per un ordine.',
  'Archibald solo da PC fisso.',
  'Nessuna visibilità in trasferta.',
];

export function Problem() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.problem;

  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOpacity = interpolate(frame, [130, 155], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.darkBg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '0 160px',
        gap: 32,
        opacity: Math.min(fadeIn, fadeOut),
      }}
    >
      {LINES.map((line, i) => {
        const delay = i * 40;
        const progress = spring({ frame: Math.max(0, frame - delay), fps, config: springText, from: 0, to: 1 });
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: palette.red,
                flexShrink: 0,
                opacity: progress,
              }}
            />
            <div
              style={{
                fontSize: 56,
                fontWeight: 800,
                color: '#FFFFFF',
                fontFamily: 'Inter, sans-serif',
                opacity: progress,
                transform: `translateX(${(1 - progress) * 50}px)`,
                lineHeight: 1.2,
              }}
            >
              {line}
            </div>
          </div>
        );
      })}
      <div
        style={{
          fontSize: 26,
          color: palette.textSecondary,
          fontFamily: 'Inter, sans-serif',
          marginTop: 16,
          opacity: subOpacity,
        }}
      >
        — Il lavoro quotidiano dell'agente Komet
      </div>
    </div>
  );
}
