// src/components/SubtitleBar.tsx
import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';
import { easingApple } from '../lib/springs';

type SubtitleEntry = {
  /** Frame relativo in cui appare */
  showAtFrame: number;
  /** Frame relativo in cui scompare (undefined = resta fino alla fine) */
  hideAtFrame?: number;
  /** Testo colonna sinistra (ERP) */
  erpText: string;
  /** Testo colonna destra (Formicanera) */
  pwaText: string;
  /** Mostra il banner "feature highlight" sopra le colonne */
  isFeatureNote?: boolean;
};

type Props = {
  entries: SubtitleEntry[];
  /** Altezza della barra (default: 70) */
  height?: number;
};

export function SubtitleBar({ entries, height = 70 }: Props) {
  const frame = useCurrentFrame();

  // Trova l'entry attiva al frame corrente
  const active = entries.find(e =>
    frame >= e.showAtFrame && (e.hideAtFrame === undefined || frame < e.hideAtFrame)
  );

  if (!active) return null;

  const relFrame = frame - active.showAtFrame;
  const showDuration = active.hideAtFrame !== undefined ? active.hideAtFrame - active.showAtFrame : 999999;
  const fadeIn = Math.min(15, Math.floor(showDuration * 0.3));
  const fadeOut = active.hideAtFrame !== undefined ? Math.min(12, Math.floor(showDuration * 0.2)) : 0;

  const opacity = interpolate(
    frame,
    [
      active.showAtFrame,
      active.showAtFrame + fadeIn,
      ...(active.hideAtFrame !== undefined ? [active.hideAtFrame - fadeOut, active.hideAtFrame] : []),
    ],
    [0, 1, ...(active.hideAtFrame !== undefined ? [1, 0] : [])],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple },
  );

  const slideY = interpolate(relFrame, [0, fadeIn], [8, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height,
      background: 'rgba(255,255,255,0.97)',
      backdropFilter: 'blur(16px)',
      borderTop: `1px solid rgba(0,0,0,0.08)`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 48px',
      gap: 0,
      opacity,
      transform: `translateY(${slideY}px)`,
      zIndex: 25,
      overflow: 'visible',
    }}>
      {active.isFeatureNote && (
        <div style={{
          position: 'absolute',
          top: -32,
          left: 0, right: 0,
          background: 'rgba(255,255,255,0.96)',
          borderBottom: `1px solid ${palette.divider}`,
          borderTop: `2px solid ${palette.blue}`,
          padding: '6px 48px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: palette.blue, flexShrink: 0,
          }} />
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: palette.textSecondary,
            fontFamily,
            letterSpacing: 0.2,
            lineHeight: 1.3,
          }}>
            The voiceover highlights some intrinsic capabilities of Formicanera observable in this recording
          </span>
        </div>
      )}

      {/* ERP column */}
      <div style={{ flex: 1, paddingRight: 32 }}>
        <div style={{
          fontSize: 9, fontWeight: 800, color: palette.textMuted, letterSpacing: 2,
          textTransform: 'uppercase', fontFamily, marginBottom: 4,
        }}>
          ERP
        </div>
        <div style={{
          fontSize: 16, fontWeight: 700, color: palette.textPrimary, fontFamily, lineHeight: 1.3,
        }}>
          {active.erpText}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: palette.divider, alignSelf: 'stretch', margin: '12px 0' }} />

      {/* Formicanera column */}
      <div style={{ flex: 1, paddingLeft: 32 }}>
        <div style={{
          fontSize: 9, fontWeight: 800, color: palette.blue, letterSpacing: 2,
          textTransform: 'uppercase', fontFamily, marginBottom: 4,
        }}>
          Formicanera
        </div>
        <div style={{
          fontSize: 16, fontWeight: 700, color: palette.textPrimary, fontFamily, lineHeight: 1.3,
        }}>
          {active.pwaText}
        </div>
      </div>
    </div>
  );
}
