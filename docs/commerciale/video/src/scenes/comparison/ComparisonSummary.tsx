// src/scenes/comparison/ComparisonSummary.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig, staticFile, Img } from 'remotion';
import { springCard, springBounce } from '../../lib/springs';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { StatPill } from '../../components/StatPill';

type Row = {
  label: string;
  erpValue: string;
  pwaValue: string;
};

type Props = {
  /** Righe comparativa. Max ~8 righe prima che closing line superi SUMMARY_DUR. */
  rows: Row[];
  erpTime: string;
  pwaTime: string;
  fasterLabel: string;
  closingLine: string;
};

export function ComparisonSummary({ rows, erpTime, pwaTime, fasterLabel, closingLine }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({ frame: Math.max(0, frame - 5), fps, config: springCard, from: 0, to: 1 });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      padding: '50px 120px', gap: 24,
    }}>
      <div style={{
        fontSize: 36, fontWeight: 900, color: palette.textPrimary,
        fontFamily, opacity: titleProgress,
      }}>
        Results
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, padding: '0 16px', marginBottom: 4 }}>
          {['', 'Archibald ERP', 'Formicanera'].map((h, i) => (
            <div key={h || 'label'} style={{
              fontSize: 13, fontWeight: 700,
              color: i === 2 ? palette.blue : palette.textMuted,
              fontFamily, letterSpacing: 1, textTransform: 'uppercase',
            }}>
              {h}
            </div>
          ))}
        </div>

        {rows.map((row, i) => {
          const delay = 20 + i * 30;
          const rowProgress = spring({ frame: Math.max(0, frame - delay), fps, config: springBounce, from: 0, to: 1 });
          return (
            <div key={row.label} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              gap: 16, padding: '14px 16px',
              background: i % 2 === 0 ? palette.bgCard : 'transparent',
              borderRadius: 10,
              opacity: rowProgress,
              transform: `translateX(${(1 - rowProgress) * -20}px)`,
            }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: palette.textPrimary, fontFamily }}>{row.label}</div>
              <div style={{ fontSize: 18, color: palette.textMuted, fontFamily }}>{row.erpValue}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: palette.green, fontFamily }}>{row.pwaValue}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'center' }}>
        <StatPill label={`ERP: ${erpTime}`} color={palette.textMuted} size="md" delay={rows.length * 30 + 20} />
        <StatPill label={`Formicanera: ${pwaTime}`} color={palette.green} size="md" delay={rows.length * 30 + 40} />
        <StatPill label={fasterLabel} color={palette.blue} size="md" delay={rows.length * 30 + 60} />
      </div>

      <div style={{
        textAlign: 'center',
        opacity: interpolate(frame, [rows.length * 30 + 80, rows.length * 30 + 110], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: palette.textSecondary, fontFamily, fontStyle: 'italic' }}>
          {closingLine}
        </div>
        <Img src={staticFile('formicaneralogo.png')} style={{ width: 48, height: 45, objectFit: 'contain', opacity: 0.6 }} />
      </div>
    </div>
  );
}
