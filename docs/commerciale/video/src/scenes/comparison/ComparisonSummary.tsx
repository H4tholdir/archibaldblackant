// src/scenes/comparison/ComparisonSummary.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, staticFile, Img } from 'remotion';
import { springCard, springBounce, springText, easingApple } from '../../lib/springs';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { StatPill } from '../../components/StatPill';
import { AntAnimation } from '../../components/AntAnimation';

type Row = {
  label: string;
  erpValue: string;
  pwaValue: string;
};

type Props = {
  /** Max ~8 righe prima che closing line superi SUMMARY_DUR. */
  rows: Row[];
  erpTime: string;
  pwaTime: string;
  fasterLabel: string;
  closingLine: string;
};

export function ComparisonSummary({ rows, erpTime, pwaTime, fasterLabel, closingLine }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({ frame: Math.max(0, frame - 5), fps, config: springText, from: 0, to: 1 });
  const lineWidth = interpolate(frame, [10, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });

  const lastLineEnd = (rows.length - 1) * 30 + 20;
  const subtitleStart = Math.max(lastLineEnd + 10, 120);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: palette.bg,
      display: 'flex',
      flexDirection: 'column',
      padding: '48px 80px',
      gap: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ants background decorative */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.12, pointerEvents: 'none', zIndex: 0 }}>
        <AntAnimation width={1920} height={1080} count={3} />
      </div>

      {/* Title */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          fontSize: 56,
          fontWeight: 900,
          color: palette.textPrimary,
          fontFamily,
          letterSpacing: -2,
          lineHeight: 1,
          opacity: titleProgress,
          transform: `translateY(${(1 - titleProgress) * 16}px)`,
        }}>
          Results <span style={{ color: palette.blue }}>·</span> Same order. Two systems.
        </div>
        <div style={{
          height: 4,
          background: palette.blue,
          borderRadius: 2,
          marginTop: 10,
          width: `${lineWidth * 440}px`,
          boxShadow: `0 0 12px ${palette.blue}50`,
        }} />
      </div>

      {/* Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr',
          padding: '6px 20px', borderBottom: `2px solid ${palette.divider}`, marginBottom: 6,
        }}>
          {['', 'Archibald ERP', 'Formicanera'].map((h, i) => (
            <div key={h || 'label'} style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
              color: i === 2 ? palette.blue : palette.textMuted, fontFamily,
            }}>
              {h}
            </div>
          ))}
        </div>

        {rows.map((row, i) => {
          const delay = 25 + i * 35;
          const rowProgress = spring({ frame: Math.max(0, frame - delay), fps, config: springBounce, from: 0, to: 1 });
          return (
            <div key={row.label} style={{
              display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr',
              gap: 16, padding: '16px 20px',
              background: i % 2 === 0 ? palette.bgCard : 'transparent',
              borderRadius: 12,
              opacity: rowProgress,
              transform: `translateX(${(1 - rowProgress) * -24}px)`,
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: palette.textPrimary, fontFamily }}>{row.label}</div>
              <div style={{ fontSize: 16, color: palette.textMuted, fontFamily }}>{row.erpValue}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: palette.green, fontFamily }}>{row.pwaValue}</div>
            </div>
          );
        })}
      </div>

      {/* Badges */}
      <div style={{
        display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center',
        position: 'relative', zIndex: 1,
      }}>
        <StatPill label={`ERP: ${erpTime}`} color={palette.textMuted} size="md" delay={rows.length * 35 + 20} />
        <StatPill label={`Formicanera: ${pwaTime}`} color={palette.green} size="md" delay={rows.length * 35 + 45} />
        <StatPill label={fasterLabel} color={palette.blue} size="md" delay={rows.length * 35 + 70} />
      </div>

      {/* Closing */}
      <div style={{
        textAlign: 'center',
        opacity: interpolate(frame, [subtitleStart, subtitleStart + 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        position: 'relative', zIndex: 1,
      }}>
        <div style={{
          fontSize: 24, fontWeight: 700, color: palette.textSecondary, fontFamily, fontStyle: 'italic',
          letterSpacing: -0.3,
        }}>
          {closingLine}
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: palette.textMuted, fontFamily, letterSpacing: 1 }}>
          From any device · During the meeting · In front of the client
        </div>
        <Img src={staticFile('formicaneralogo.png')} style={{ width: 100, height: 93, objectFit: 'contain', opacity: 0.7, filter: 'drop-shadow(0 4px 16px rgba(0,122,255,0.20))' }} />
      </div>
    </div>
  );
}
