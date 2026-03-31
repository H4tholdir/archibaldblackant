// src/scenes/Problem.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springBounce, springCard, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';

type Severity = 'high' | 'mid' | 'low';

const PROBLEMS: Array<{ icon: string; title: string; detail: string; severity: Severity }> = [
  { icon: '📵', title: 'Zero accesso mobile',       detail: 'Nessuna app, nessun responsive — solo da PC fisso',      severity: 'high' },
  { icon: '⏱',  title: '20 min per ordine',         detail: 'Ogni ordine: sequenza manuale di form ERP identiche',     severity: 'high' },
  { icon: '🔕', title: 'Zero notifiche proattive',  detail: "L'agente cerca lui — nessuna notifica automatica",       severity: 'high' },
  { icon: '🔁', title: 'Lavoro manuale ripetitivo', detail: 'Stesse operazioni ogni giorno, nessuna automazione',      severity: 'mid'  },
  { icon: '🗂',  title: 'Dati dispersi',             detail: 'Schermate diverse, nessun cruscotto aggregato',          severity: 'mid'  },
  { icon: '📁', title: 'DDT e fatture manuali',     detail: 'Processo separato per ogni documento — email e download', severity: 'mid'  },
  { icon: '📦', title: 'Tracking: telefonate',      detail: 'Nessun tracking integrato — solo app esterne',           severity: 'low'  },
  { icon: '📡', title: 'Offline: agente cieco',     detail: 'Senza connessione stabile: impossibile lavorare',        severity: 'low'  },
];

const SEVERITY_STYLE: Record<Severity, { border: string; bg: string; dot: string }> = {
  high: { border: palette.red,     bg: `rgba(255,59,48,0.10)`,   dot: palette.red     },
  mid:  { border: palette.orange,  bg: `rgba(255,149,0,0.08)`,   dot: palette.orange  },
  low:  { border: `rgba(255,255,255,0.15)`, bg: `rgba(255,255,255,0.04)`, dot: palette.textMuted },
};

export function Problem() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.problem;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const titleProgress = spring({ frame: Math.max(0, frame - 5), fps, config: springCard, from: 0, to: 1 });
  const lineWidth = interpolate(frame, [10, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const subtitleOpacity = interpolate(frame, [380, 410], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bgDark,
      display: 'flex', flexDirection: 'column',
      padding: '60px 120px',
      opacity: fadeOut, position: 'relative', overflow: 'hidden',
    }}>
      {/* Background radial reddish glow */}
      <div style={{
        position: 'absolute', top: -200, right: -200,
        width: 800, height: 800, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(255,59,48,0.08) 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <div style={{
          fontSize: 16, fontWeight: 700, color: palette.red,
          letterSpacing: 4, textTransform: 'uppercase',
          fontFamily: 'Inter, sans-serif', marginBottom: 12,
          opacity: titleProgress,
        }}>
          Il problema
        </div>
        <div style={{
          fontSize: 44, fontWeight: 900, color: palette.textWhite,
          fontFamily: 'Inter, sans-serif', letterSpacing: -1,
          lineHeight: 1.1,
          opacity: titleProgress,
          transform: `translateY(${(1 - titleProgress) * 15}px)`,
        }}>
          Lavorare con Archibald ERP nel 2026
        </div>
        {/* Red underline animata */}
        <div style={{
          height: 3, background: palette.red, borderRadius: 2,
          marginTop: 12, width: `${lineWidth * 540}px`,
          boxShadow: `0 0 12px ${palette.red}60`,
        }} />
      </div>

      {/* Grid 2 colonne × 4 righe */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '16px 32px', flex: 1,
      }}>
        {PROBLEMS.map((p, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const delay = 30 + col * 15 + row * 45;
          const cardProgress = spring({ frame: Math.max(0, frame - delay), fps, config: springBounce, from: 0, to: 1 });
          const sty = SEVERITY_STYLE[p.severity];

          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 16,
              background: sty.bg,
              borderRadius: 14,
              padding: '16px 20px',
              borderLeft: `3px solid ${sty.border}`,
              opacity: cardProgress,
              transform: `translateY(${(1 - cardProgress) * 20}px) scale(${0.96 + cardProgress * 0.04})`,
            }}>
              <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{p.icon}</span>
              <div>
                <div style={{
                  fontSize: 20, fontWeight: 800,
                  color: p.severity === 'high' ? palette.textWhite : p.severity === 'mid' ? palette.textWhiteDim : 'rgba(255,255,255,0.50)',
                  fontFamily: 'Inter, sans-serif', marginBottom: 4,
                }}>
                  {p.title}
                </div>
                <div style={{
                  fontSize: 14, color: 'rgba(255,255,255,0.35)',
                  fontFamily: 'Inter, sans-serif', lineHeight: 1.4,
                }}>
                  {p.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sottotitolo finale */}
      <div style={{
        marginTop: 28, opacity: subtitleOpacity,
        fontSize: 16, color: 'rgba(255,255,255,0.28)',
        fontFamily: 'Inter, sans-serif', fontStyle: 'italic', textAlign: 'right',
      }}>
        — Ogni giorno, per ogni agente Komet
      </div>
    </div>
  );
}
