// src/components/Confetti.tsx
// Esplosione di coriandoli che cadono dall'alto. Attivati a triggerFrame.
// N particelle con colori, angoli e velocità casuali ma deterministici (seed per frame).
import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../lib/palette';

type Props = {
  triggerFrame: number;  // frame in cui esplodono i coriandoli
  count?: number;        // numero particelle (default 60)
  duration?: number;     // durata animazione in frame (default 90)
  originX?: number;      // X origine (0-1, relativo al width, default 0.5)
  originY?: number;      // Y origine (0-1, relativo al height, default 0.4)
};

const COLORS = [
  palette.blue, palette.green, palette.orange, palette.red, palette.purple, palette.yellow, palette.teal,
  '#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96CEB4',
];

// Genera N particelle con proprietà fisse basate sull'indice (deterministico)
function makeParticles(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 2654435761) >>> 0; // Knuth multiplicative hash
    const rnd = (offset: number) => ((seed ^ (seed >> offset)) % 1000) / 1000;
    return {
      color: COLORS[i % COLORS.length],
      angle: rnd(5) * 360,           // angolo di esplosione (gradi)
      speed: 8 + rnd(7) * 14,        // velocità pixels/frame
      drift: (rnd(11) - 0.5) * 8,    // drift orizzontale
      gravity: 0.6 + rnd(3) * 0.6,   // gravità
      size: 6 + rnd(9) * 10,         // dimensione
      shape: i % 3,                  // 0=cerchio, 1=rettangolo, 2=diamond
      delay: rnd(13) * 12,           // delay iniziale frame
      spin: (rnd(17) - 0.5) * 12,    // velocità rotazione
    };
  });
}

export function Confetti({ triggerFrame, count = 60, duration = 90, originX = 0.5, originY = 0.4 }: Props) {
  const frame = useCurrentFrame();
  const elapsed = frame - triggerFrame;

  if (elapsed < 0 || elapsed > duration + 30) return null;

  const particles = makeParticles(count);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none', overflow: 'hidden',
    }}>
      {particles.map((p, i) => {
        const t = Math.max(0, elapsed - p.delay) / duration;
        if (t <= 0 || t > 1.3) return null;

        const rad = (p.angle * Math.PI) / 180;
        const px = originX * 1920 + Math.cos(rad) * p.speed * elapsed * 2;
        const py = originY * 1080 + Math.sin(rad) * p.speed * elapsed - 0.5 * p.gravity * elapsed * elapsed;

        const opacity = interpolate(t, [0, 0.1, 0.7, 1.0], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });

        const rotation = p.spin * elapsed;

        return (
          <div key={i} style={{
            position: 'absolute',
            left: px,
            top: py,
            width: p.shape === 1 ? p.size * 1.6 : p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.shape === 0 ? '50%' : p.shape === 2 ? 2 : 3,
            opacity,
            transform: `rotate(${rotation}deg) ${p.shape === 2 ? 'rotate(45deg)' : ''}`,
          }} />
        );
      })}
    </div>
  );
}
