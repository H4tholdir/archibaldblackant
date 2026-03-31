// src/scenes/Problem.tsx
import { useCurrentFrame, interpolate, useVideoConfig } from 'remotion';
import { easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';

const PROBLEMS = [
  { text: 'Nessun accesso da mobile — zero app, zero responsive', severity: 'high' },
  { text: '20 minuti per piazzare un singolo ordine', severity: 'high' },
  { text: "Zero notifiche proattive — l'agente cerca sempre lui", severity: 'high' },
  { text: 'Operazioni identiche ripetute a mano ogni giorno', severity: 'mid' },
  { text: 'Dati dispersi in schermate diverse, nessun cruscotto', severity: 'mid' },
  { text: 'DDT e fatture: processo manuale separato per ogni file', severity: 'mid' },
  { text: 'Tracking spedizioni? Solo telefonate o app esterne', severity: 'low' },
  { text: "Senza connessione: l'agente è completamente cieco", severity: 'low' },
] as const;

const DOT_COLOR = { high: palette.red, mid: palette.orange, low: palette.textMuted };
const STAGGER = 40;

export function Problem() {
  const frame = useCurrentFrame();
  const dur = SCENE_FRAMES.problem;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const headerOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const subtitleOpacity = interpolate(frame, [360, 390], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bgDark,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 120px',
        opacity: fadeOut,
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: palette.textWhiteFaint,
          letterSpacing: 3,
          textTransform: 'uppercase',
          fontFamily: 'Inter, sans-serif',
          marginBottom: 48,
          opacity: headerOpacity,
          alignSelf: 'flex-start',
        }}
      >
        Lavorare con Archibald ERP nel 2026
      </div>

      {/* Lista problemi */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {PROBLEMS.map((p, i) => {
          const start = 30 + i * STAGGER;
          const rowOpacity = interpolate(frame, [start, start + 20], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          const rowX = interpolate(frame, [start, start + 25], [50, 0], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
          });

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                opacity: rowOpacity,
                transform: `translateX(${rowX}px)`,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: DOT_COLOR[p.severity],
                  flexShrink: 0,
                  boxShadow: `0 0 8px ${DOT_COLOR[p.severity]}80`,
                }}
              />
              <div
                style={{
                  fontSize: 24,
                  fontWeight: p.severity === 'high' ? 700 : 500,
                  color: p.severity === 'high'
                    ? palette.textWhite
                    : p.severity === 'mid'
                    ? palette.textWhiteDim
                    : palette.textWhiteFaint,
                  fontFamily: 'Inter, sans-serif',
                  lineHeight: 1.3,
                }}
              >
                {p.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sottotitolo finale */}
      <div
        style={{
          marginTop: 40,
          fontSize: 18,
          color: palette.textWhiteFaint,
          fontFamily: 'Inter, sans-serif',
          fontStyle: 'italic',
          alignSelf: 'flex-end',
          opacity: subtitleOpacity,
        }}
      >
        — Il lavoro quotidiano di un agente Komet
      </div>
    </div>
  );
}
