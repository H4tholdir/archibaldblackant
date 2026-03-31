// src/components/SceneCaption.tsx
// Barra narratore in basso: spiega cosa sta succedendo + confronto con ERP.
// Appare con fade-in a "delay" frame, sticky al bottom della scena.
import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../lib/palette';

type Props = {
  main: string;    // cosa sta succedendo
  vs?: string;     // "vs ERP: ..." (opzionale)
  delay?: number;
  color?: string;  // colore accent (default blue)
};

export function SceneCaption({ main, vs, delay = 30, color }: Props) {
  const frame = useCurrentFrame();
  const accent = color ?? palette.blue;

  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [delay, delay + 20], [12, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      position: 'absolute',
      bottom: 36,
      left: 80,
      right: 80,
      opacity,
      transform: `translateY(${y}px)`,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: 'rgba(28,28,30,0.82)',
      backdropFilter: 'blur(12px)',
      borderRadius: 16,
      padding: '14px 24px',
      borderLeft: `3px solid ${accent}`,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: accent, flexShrink: 0,
      }} />
      <div style={{ fontFamily: 'Inter, sans-serif' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
          {main}
        </span>
        {vs && (
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginLeft: 16 }}>
            {vs}
          </span>
        )}
      </div>
    </div>
  );
}
