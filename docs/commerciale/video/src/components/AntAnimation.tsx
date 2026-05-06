// src/components/AntAnimation.tsx
import { interpolate, useCurrentFrame } from 'remotion';

type AntProps = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delay: number;
  size: number;
  duration?: number;
};

function Ant({ startX, startY, endX, endY, delay, size, duration = 210 }: AntProps) {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - delay);

  const progress = interpolate(adjustedFrame, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const x = interpolate(progress, [0, 1], [startX, endX]);
  const y = interpolate(progress, [0, 1], [startY, endY]);
  const opacity = interpolate(adjustedFrame, [0, 10, duration - 10, duration], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);

  // Wiggle verticale per camminata
  const wiggle = Math.sin((adjustedFrame / 4) * Math.PI) * 3;

  return (
    <div style={{
      position: 'absolute',
      left: x,
      top: y + wiggle,
      fontSize: size,
      transform: `rotate(${angle}deg)`,
      opacity,
      userSelect: 'none' as const,
      lineHeight: 1,
      pointerEvents: 'none',
    }}>
      🐜
    </div>
  );
}

type AntAnimationProps = {
  /** Larghezza dell'area (default 1920) */
  width?: number;
  /** Altezza dell'area (default 1080) */
  height?: number;
  /** Quante formiche (default 5) */
  count?: number;
};

export function AntAnimation({ width = 1920, height = 1080, count = 5 }: AntAnimationProps) {
  // Percorsi fissi deterministici (non random per Remotion)
  const ants = [
    { startX: -40,        startY: height * 0.83, endX: width * 0.37, endY: height * 0.88, delay: 0,  size: 36, duration: 210 },
    { startX: width + 40, startY: height * 0.74, endX: width * 0.57, endY: height * 0.81, delay: 15, size: 30, duration: 200 },
    { startX: width * 0.10, startY: -40,          endX: width * 0.08, endY: height * 0.37, delay: 30, size: 26, duration: 195 },
    { startX: width + 40, startY: height * 0.96, endX: width * 0.47, endY: height * 0.88, delay: 10, size: 34, duration: 220 },
    { startX: -40,        startY: height * 0.18, endX: width * 0.37, endY: height * 0.46, delay: 45, size: 22, duration: 205 },
  ].slice(0, count);

  return (
    <>
      {ants.map((ant, i) => (
        <Ant key={i} {...ant} />
      ))}
    </>
  );
}
