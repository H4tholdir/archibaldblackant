// src/components/Ant.tsx
// Formica che cammina da sinistra a destra (o destra a sinistra con flip=true).
// Usa interpolate frame-based per posizione X + wiggle Y per simulare il passo.
import { useCurrentFrame, interpolate } from 'remotion';

type Props = {
  startX: number;    // X start (pixel assoluto)
  endX: number;      // X end
  y: number;         // Y fisso
  startFrame?: number;
  endFrame?: number;
  size?: number;     // dimensione emoji (default 32)
  flip?: boolean;    // true = cammina da destra a sinistra
};

export function Ant({ startX, endX, y, startFrame = 0, endFrame = 300, size = 32, flip = false }: Props) {
  const frame = useCurrentFrame();

  const x = interpolate(frame, [startFrame, endFrame], [startX, endX], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Visibile solo nella finestra startFrame→endFrame
  const visible = frame >= startFrame && frame <= endFrame;
  if (!visible) return null;

  // Wiggle verticale per simulare il passo
  const wiggleY = Math.sin((frame / 4) * Math.PI) * 3;

  // Rotazione leggera del corpo
  const wiggleR = Math.sin((frame / 4) * Math.PI) * 4;

  return (
    <div style={{
      position: 'absolute',
      left: x,
      top: y + wiggleY,
      fontSize: size,
      transform: `scaleX(${flip ? -1 : 1}) rotate(${wiggleR}deg)`,
      userSelect: 'none',
      pointerEvents: 'none',
      lineHeight: 1,
    }}>
      🐜
    </div>
  );
}
