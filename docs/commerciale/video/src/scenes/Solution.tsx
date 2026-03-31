import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { SCENE_DURATION } from '../lib/timing';

export function Solution() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.solution;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const thenOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const heroProgress = spring({ frame: Math.max(0, frame - 20), fps, config: springBounce, from: 0, to: 1 });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #007AFF 0%, #0055D4 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          fontSize: 40,
          fontWeight: 300,
          color: 'rgba(255,255,255,0.75)',
          fontFamily: 'Inter, sans-serif',
          opacity: thenOpacity,
          letterSpacing: 2,
        }}
      >
        Poi arriva
      </div>
      <div
        style={{
          fontSize: 96,
          fontWeight: 900,
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          transform: `scale(${heroProgress})`,
          opacity: heroProgress,
          letterSpacing: -3,
        }}
      >
        Formicanera.
      </div>
    </div>
  );
}
