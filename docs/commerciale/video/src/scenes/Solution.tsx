// src/scenes/Solution.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';

export function Solution() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.solution;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const preOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const titleProgress = spring({ frame: Math.max(0, frame - 20), fps, config: springBounce, from: 0, to: 1 });

  const glowCycle = Math.sin((frame / 20) * Math.PI);
  const glowOpacity = interpolate(frame, [20, 50], [0, 0.35], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  }) * (0.7 + glowCycle * 0.3);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `linear-gradient(135deg, ${palette.blue} 0%, #0055D4 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        opacity: fadeOut,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow */}
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.10)',
          opacity: glowOpacity,
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      {/* "Poi arriva" */}
      <div
        style={{
          fontSize: 26,
          fontWeight: 300,
          color: 'rgba(255,255,255,0.70)',
          fontFamily: 'Inter, sans-serif',
          letterSpacing: 1,
          opacity: preOpacity,
          transform: `translateY(${(1 - preOpacity) * 10}px)`,
        }}
      >
        Poi arriva
      </div>

      {/* "Formicanera." */}
      <div
        style={{
          fontSize: 96,
          fontWeight: 900,
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          letterSpacing: -3,
          lineHeight: 1,
          transform: `scale(${0.6 + titleProgress * 0.4})`,
          opacity: titleProgress,
          textShadow: '0 4px 40px rgba(0,0,0,0.20)',
        }}
      >
        Formicanera.
      </div>
    </div>
  );
}
