// src/components/SharedTimer.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Props = {
  /** Frame RELATIVO (relativo alla sequenza) in cui il timer si ferma. Se undefined, non si ferma. */
  doneAtFrame?: number;
  /** Secondi da aggiungere al display del timer (per timer cumulativi Video 2 Part B) */
  offsetSeconds?: number;
  /** Colore del bordo/testo quando in corso */
  color?: string;
  /** Diametro px del cerchio */
  size?: number;
  /** Label sotto il timer */
  label?: string;
  /** Frame di entrata (delay prima che il componente sia visibile) */
  delay?: number;
};

export function SharedTimer({
  doneAtFrame,
  offsetSeconds = 0,
  color = palette.blue,
  size = 130,
  label,
  delay = 0,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springBounce,
    from: 0,
    to: 1,
  });

  const isDone = doneAtFrame !== undefined && frame >= doneAtFrame;
  const activeFrame = isDone ? (doneAtFrame ?? 0) : frame;
  const totalSeconds = activeFrame / fps + offsetSeconds;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const pulseScale = isDone
    ? interpolate(
        (frame - (doneAtFrame ?? 0)) % 60,
        [0, 10, 20],
        [1.04, 1, 1.04],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 1;

  const borderColor = isDone ? palette.green : color;
  const textColor = isDone ? palette.green : palette.textWhite;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      opacity: entryProgress,
      transform: `scale(${entryProgress * pulseScale})`,
    }}>
      <div style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: palette.bgDark,
        border: `3px solid ${borderColor}`,
        boxShadow: isDone ? `0 0 24px ${palette.green}50` : `0 0 16px ${color}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          fontSize: size * 0.21,
          fontWeight: 900,
          color: textColor,
          fontFamily,
          letterSpacing: -1,
          lineHeight: 1,
        }}>
          {isDone ? '✓' : formatted}
        </div>
      </div>
      {isDone && (
        <div style={{ fontSize: 17, fontWeight: 700, color: palette.green, fontFamily, letterSpacing: 0.5 }}>
          {formatted}
        </div>
      )}
      {label && (
        <div style={{ fontSize: 12, fontWeight: 600, color: palette.textMuted, fontFamily, letterSpacing: 1, textTransform: 'uppercase' }}>
          {label}
        </div>
      )}
    </div>
  );
}
