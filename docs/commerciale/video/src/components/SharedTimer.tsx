// src/components/SharedTimer.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springBounce, springSnap } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Props = {
  /** Frame relativo in cui il timer inizia a contare (default: 0 = subito) */
  startFrame?: number;
  /** Frame relativo in cui l'agente ha finito — timer si ferma, entra in stato PENDING */
  pendingAtFrame?: number;
  /** Frame relativo in cui il timer si ferma (ordine su ERP = DONE) */
  doneAtFrame?: number;
  /** Secondi da aggiungere al display (per timer cumulativi Video 2 Part B) */
  offsetSeconds?: number;
  /** Colore bordo/testo quando in corso */
  color?: string;
  /** Diametro px del cerchio */
  size?: number;
  /** Label sotto il timer */
  label?: string;
  /** Delay per l'animazione di entrata */
  delay?: number;
};

export function SharedTimer({
  startFrame = 0,
  pendingAtFrame,
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

  const isWaiting = frame < startFrame;
  const isDone = doneAtFrame !== undefined && frame >= doneAtFrame;
  const isPending = pendingAtFrame !== undefined && frame >= pendingAtFrame && !isDone;

  // Tempo agente: frozen al pendingAtFrame quando in stato PENDING
  const agentFrame = isPending ? (pendingAtFrame! - startFrame) : Math.max(0, (isDone ? doneAtFrame! : frame) - startFrame);
  const agentSeconds = agentFrame / fps + offsetSeconds;
  const agentMin = Math.floor(agentSeconds / 60);
  const agentSec = Math.floor(agentSeconds % 60);
  const agentFormatted = `${String(agentMin).padStart(2, '0')}:${String(agentSec).padStart(2, '0')}`;

  // Tempo totale per stato DONE (da startFrame a doneAtFrame)
  const totalDoneSeconds = doneAtFrame !== undefined ? (doneAtFrame - startFrame) / fps + offsetSeconds : 0;
  const totalMin = Math.floor(totalDoneSeconds / 60);
  const totalSec = Math.floor(totalDoneSeconds % 60);
  const totalFormatted = `${String(totalMin).padStart(2, '0')}:${String(totalSec).padStart(2, '0')}`;

  // Calcola tempo elapsed per il display generico (non-pending, non-done)
  const activeFrame = isDone ? doneAtFrame! : Math.max(startFrame, frame);
  const elapsedFrames = Math.max(0, activeFrame - startFrame);
  const totalSeconds = elapsedFrames / fps + offsetSeconds;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Pulse quando Done
  const pulseScale = isDone
    ? interpolate(
        (frame - (doneAtFrame ?? 0)) % 60,
        [0, 10, 20],
        [1.04, 1, 1.04],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 1;

  // Pulsazione dot waiting
  const waitingPulse = isWaiting
    ? interpolate(
        frame % 40,
        [0, 20, 40],
        [0.4, 1, 0.4],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 0;

  // Pulsazione durante PENDING
  const pendingPulse = isPending
    ? interpolate(frame % 45, [0, 22, 45], [0.6, 1, 0.6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;

  const borderColor = isDone ? palette.green : isPending ? palette.orange : isWaiting ? palette.divider : color;
  const textColor = isDone ? palette.green : isWaiting ? palette.textMuted : palette.textWhite;

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
        boxShadow: isDone
          ? `0 0 24px ${palette.green}50`
          : isPending
          ? `0 0 20px ${palette.orange}40`
          : isWaiting
          ? 'none'
          : `0 0 16px ${color}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        {isWaiting ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: size * 0.12,
              height: size * 0.12,
              borderRadius: '50%',
              background: palette.textMuted,
              opacity: waitingPulse,
            }} />
            <div style={{
              fontSize: size * 0.13,
              fontWeight: 700,
              color: palette.textMuted,
              fontFamily,
              letterSpacing: 1,
            }}>
              – –:– –
            </div>
          </div>
        ) : isPending ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, opacity: pendingPulse }}>
            <div style={{ fontSize: size * 0.13, fontWeight: 700, color: palette.orange, fontFamily, letterSpacing: 0.5 }}>
              {agentFormatted}
            </div>
            <div style={{ fontSize: size * 0.14, fontWeight: 900, color: palette.orange, fontFamily }}>
              → ERP
            </div>
            <div style={{ fontSize: size * 0.10, fontWeight: 600, color: palette.textMuted, fontFamily, letterSpacing: 0.5 }}>
              SYNC
            </div>
          </div>
        ) : (
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
        )}
      </div>

      {isDone && (
        <div style={{ fontSize: 17, fontWeight: 700, color: palette.green, fontFamily, letterSpacing: 0.5 }}>
          {totalFormatted}
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
